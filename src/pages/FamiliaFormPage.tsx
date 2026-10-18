import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { WaitingOverlay } from '@/components/WaitingOverlay'
import { formatMoney } from '@/lib/despesas'

type AssociadoOpt = {
  associado_id: number
  nome: string
  registro: number | null
  ativo: boolean | null
  isento: boolean | null
  tipo_mensalidade: number | null
  familia_id: number | null
  tipo_nome?: string | null
  tipo_valor?: number | null
}

const emptyForm = {
  nome: '',
  responsavel_associado_id: '',
  ativo: true,
}

export function FamiliaFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const { empresa, hasPermission } = useAuth()
  const canWrite = hasPermission('associados.write')
  const empresaId = empresa?.id
  const toast = useToast()

  const [form, setForm] = useState(emptyForm)
  const [membroIds, setMembroIds] = useState<number[]>([])
  const [addId, setAddId] = useState('')
  const [associados, setAssociados] = useState<AssociadoOpt[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)

  useEffect(() => {
    if (!empresaId) {
      setAssociados([])
      return
    }
    let mounted = true
    void (async () => {
      const [{ data: assocData }, { data: tiposData }] = await Promise.all([
        supabase
          .from('associados')
          .select(
            'associado_id, nome, registro, ativo, isento, tipo_mensalidade, familia_id',
          )
          .eq('empresa_id', empresaId)
          .order('nome'),
        supabase
          .from('tipo_mensalidade')
          .select('tipomensalidade_id, nome, valor')
          .eq('empresa_id', empresaId),
      ])
      if (!mounted) return
      const tipoMap = new Map(
        (tiposData ?? []).map((t) => [
          t.tipomensalidade_id as number,
          {
            nome: t.nome as string,
            valor: Number(t.valor ?? 0),
          },
        ]),
      )
      setAssociados(
        ((assocData ?? []) as AssociadoOpt[]).map((a) => {
          const tipo =
            a.tipo_mensalidade != null
              ? tipoMap.get(a.tipo_mensalidade)
              : undefined
          return {
            ...a,
            tipo_nome: tipo?.nome ?? null,
            tipo_valor: tipo?.valor ?? null,
          }
        }),
      )
    })()
    return () => {
      mounted = false
    }
  }, [empresaId])

  useEffect(() => {
    if (isNew || !empresaId) return
    let mounted = true
    void (async () => {
      const { data, error: loadError } = await supabase
        .from('familia')
        .select('familia_id, nome, ativo, responsavel_associado_id')
        .eq('familia_id', Number(id))
        .eq('empresa_id', empresaId)
        .maybeSingle()

      if (!mounted) return
      if (loadError || !data) {
        setError(loadError?.message ?? 'Família não encontrada')
        setLoading(false)
        return
      }

      setForm({
        nome: data.nome ?? '',
        responsavel_associado_id:
          data.responsavel_associado_id != null
            ? String(data.responsavel_associado_id)
            : '',
        ativo: data.ativo !== false,
      })

      const { data: membros } = await supabase
        .from('associados')
        .select('associado_id')
        .eq('empresa_id', empresaId)
        .eq('familia_id', Number(id))

      if (!mounted) return
      setMembroIds(
        (membros ?? []).map((m) => m.associado_id as number),
      )
      setLoading(false)
    })()
    return () => {
      mounted = false
    }
  }, [id, isNew, empresaId])

  const membros = useMemo(
    () =>
      associados.filter((a) => membroIds.includes(a.associado_id)),
    [associados, membroIds],
  )

  const disponiveis = useMemo(() => {
    const familiaAtual = isNew ? null : Number(id)
    return associados.filter((a) => {
      if (membroIds.includes(a.associado_id)) return false
      if (a.familia_id == null) return true
      return familiaAtual != null && a.familia_id === familiaAtual
    })
  }, [associados, membroIds, isNew, id])

  const totalMensalidade = useMemo(
    () =>
      membros.reduce((sum, m) => {
        if (m.isento === true) return sum
        const v = Number(m.tipo_valor ?? 0)
        return v > 0 ? sum + v : sum
      }, 0),
    [membros],
  )

  function adicionarMembro() {
    const n = Number(addId)
    if (!Number.isFinite(n) || n <= 0) return
    setMembroIds((prev) => (prev.includes(n) ? prev : [...prev, n]))
    setAddId('')
    if (!form.responsavel_associado_id) {
      setForm((prev) => ({ ...prev, responsavel_associado_id: String(n) }))
    }
  }

  function removerMembro(associadoId: number) {
    setMembroIds((prev) => prev.filter((id) => id !== associadoId))
    if (form.responsavel_associado_id === String(associadoId)) {
      setForm((prev) => ({ ...prev, responsavel_associado_id: '' }))
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite) {
      setError('Sem permissão para alterar famílias.')
      return
    }
    if (!empresaId) {
      setError('Grupo escoteiro não carregado.')
      return
    }
    const nome = form.nome.trim().toUpperCase()
    if (!nome) {
      setError('Informe o nome da família.')
      return
    }
    if (membroIds.length === 0) {
      setError('Inclua ao menos um associado na família.')
      return
    }
    const responsavelId = form.responsavel_associado_id
      ? Number(form.responsavel_associado_id)
      : null
    if (
      responsavelId != null &&
      !membroIds.includes(responsavelId)
    ) {
      setError('O responsável precisa ser um dos membros da família.')
      return
    }

    setSaving(true)
    setError(null)

    let familiaId = isNew ? null : Number(id)
    if (isNew) {
      const { data, error: insertError } = await supabase
        .from('familia')
        .insert({
          empresa_id: empresaId,
          nome,
          ativo: form.ativo,
          responsavel_associado_id: responsavelId,
        })
        .select('familia_id')
        .single()
      if (insertError || !data) {
        setSaving(false)
        setError(insertError?.message ?? 'Não foi possível criar a família.')
        return
      }
      familiaId = data.familia_id as number
    } else {
      const { error: updateError } = await supabase
        .from('familia')
        .update({
          nome,
          ativo: form.ativo,
          responsavel_associado_id: responsavelId,
        })
        .eq('familia_id', familiaId!)
        .eq('empresa_id', empresaId)
      if (updateError) {
        setSaving(false)
        setError(updateError.message)
        return
      }
    }

    const { error: clearError } = await supabase
      .from('associados')
      .update({ familia_id: null })
      .eq('empresa_id', empresaId)
      .eq('familia_id', familiaId!)
    if (clearError) {
      setSaving(false)
      setError(clearError.message)
      return
    }

    if (membroIds.length > 0) {
      const { error: linkError } = await supabase
        .from('associados')
        .update({ familia_id: familiaId })
        .eq('empresa_id', empresaId)
        .in('associado_id', membroIds)
      if (linkError) {
        setSaving(false)
        setError(linkError.message)
        return
      }
    }

    setSaving(false)
    toast.success('Pronto!', 'Família salva.')
    navigate('/cadastros/familias', {
      state: { flashSuccess: 'Família salva com sucesso!' },
    })
  }

  async function onDelete() {
    if (!canWrite || isNew || !empresaId) return
    const ok = await toast.confirm({
      title: 'Excluir família?',
      message:
        'Os associados voltam a ficar sem família. Mensalidades já geradas permanecem.',
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return

    setSaving(true)
    setError(null)
    await supabase
      .from('associados')
      .update({ familia_id: null })
      .eq('empresa_id', empresaId)
      .eq('familia_id', Number(id))

    const { error: delError } = await supabase
      .from('familia')
      .delete()
      .eq('familia_id', Number(id))
      .eq('empresa_id', empresaId)

    setSaving(false)
    if (delError) {
      setError(delError.message)
      return
    }
    toast.success('Pronto!', 'Família excluída.')
    navigate('/cadastros/familias', {
      state: { flashSuccess: 'Família excluída.' },
    })
  }

  const disabled = !canWrite || saving

  if (!empresaId) {
    return (
      <section className="panel">
        <p className="muted">
          Seu usuário precisa estar vinculado a um grupo escoteiro.
        </p>
      </section>
    )
  }

  if (loading) {
    return (
      <section className="panel">
        <p className="muted">Carregando…</p>
      </section>
    )
  }

  return (
    <>
      <WaitingOverlay
        open={saving}
        title="Aguarde"
        message="Salvando a família…"
      />
      <header className="page-header">
        <div>
          <h2>{isNew ? 'Nova família' : 'Editar família'}</h2>
          <p>
            Junte associados para gerar a mensalidade de todos em um só
            registro.
          </p>
        </div>
        <Link className="btn btn-soft" to="/cadastros/familias">
          Voltar
        </Link>
      </header>

      <form className="panel" onSubmit={(e) => void onSubmit(e)}>
        {error ? (
          <AlertMessage tone="error" title="Atenção">
            {error}
          </AlertMessage>
        ) : null}

        <div className="form-grid">
          <div className="field field-span-2">
            <label htmlFor="familia_nome">Nome da família</label>
            <input
              id="familia_nome"
              className="input"
              value={form.nome}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, nome: e.target.value }))
              }
              disabled={disabled}
              required
              maxLength={100}
            />
          </div>

          <div className="field">
            <label htmlFor="familia_responsavel">Responsável da cobrança</label>
            <select
              id="familia_responsavel"
              className="select"
              value={form.responsavel_associado_id}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  responsavel_associado_id: e.target.value,
                }))
              }
              disabled={disabled || membros.length === 0}
            >
              <option value="">Selecione…</option>
              {membros.map((m) => (
                <option key={m.associado_id} value={m.associado_id}>
                  {m.nome}
                  {m.registro != null ? ` · ${m.registro}` : ''}
                </option>
              ))}
            </select>
            <span className="field-hint">
              O título da mensalidade fica no nome deste associado.
            </span>
          </div>

          <label
            className="field"
            style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
              alignSelf: 'end',
            }}
          >
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, ativo: e.target.checked }))
              }
              disabled={disabled}
            />
            Família ativa
          </label>
        </div>

        <p className="form-section-title" style={{ marginTop: '1.25rem' }}>
          Membros
        </p>
        <p className="muted">
          Quem estiver na família deixa de gerar mensalidade individual. O valor
          do título único soma os tipos de mensalidade dos membros (exceto
          isentos).
        </p>

        {canWrite ? (
          <div
            className="form-grid form-grid-2"
            style={{ marginBottom: '1rem', alignItems: 'end' }}
          >
            <div className="field field-span-2">
              <label htmlFor="add_membro">Adicionar associado</label>
              <select
                id="add_membro"
                className="select"
                value={addId}
                onChange={(e) => setAddId(e.target.value)}
                disabled={disabled}
              >
                <option value="">Selecione…</option>
                {disponiveis.map((a) => (
                  <option key={a.associado_id} value={a.associado_id}>
                    {a.nome}
                    {a.registro != null ? ` · ${a.registro}` : ''}
                    {a.familia_id != null &&
                    (isNew || a.familia_id !== Number(id))
                      ? ' (já em outra família)'
                      : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-soft"
                disabled={disabled || !addId}
                onClick={adicionarMembro}
              >
                Incluir
              </button>
            </div>
          </div>
        ) : null}

        {membros.length === 0 ? (
          <div className="empty">Nenhum membro nesta família.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Associado</th>
                  <th>Registro</th>
                  <th>Mensalidade</th>
                  <th>Valor</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {membros.map((m) => (
                  <tr key={m.associado_id}>
                    <td>
                      {m.nome}
                      {m.ativo === false ? ' (inativo)' : ''}
                      {m.isento === true ? ' · isento' : ''}
                    </td>
                    <td>{m.registro ?? '—'}</td>
                    <td>{m.tipo_nome || '—'}</td>
                    <td>
                      {m.isento === true
                        ? 'Isento'
                        : formatMoney(Number(m.tipo_valor ?? 0))}
                    </td>
                    <td>
                      {canWrite ? (
                        <button
                          type="button"
                          className="btn btn-soft"
                          disabled={disabled}
                          onClick={() => removerMembro(m.associado_id)}
                        >
                          Remover
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="muted" style={{ marginTop: '0.75rem' }}>
          Total estimado da família:{' '}
          <strong>{formatMoney(totalMensalidade)}</strong>
        </p>

        <div className="form-actions">
          {canWrite ? (
            <>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              {!isNew ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={saving}
                  onClick={() => void onDelete()}
                >
                  Excluir
                </button>
              ) : null}
            </>
          ) : (
            <p className="muted">Modo leitura — sem permissão para salvar.</p>
          )}
          <Link className="btn btn-soft" to="/cadastros/familias">
            Cancelar
          </Link>
        </div>
      </form>
    </>
  )
}
