import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { WaitingOverlay } from '@/components/WaitingOverlay'
import {
  CONQUISTA_ASSOC_FIELDS,
  CONQUISTA_TIPO_LABEL,
  CONQUISTA_TIPOS,
  isConquistaTipo,
  sugestaoTipoPorRamo,
  type ConquistaTipo,
} from '@/lib/conquistas'
import { isAssociadoLogin } from '@/lib/roles'
import type { Conquista, Ramo } from '@/types/database'

type Lookup = { id: number; nome: string }
type AssociadoOpt = {
  associado_id: number
  nome: string
  registro: number | null
  ramo: number | null
  secao: number | null
  patrulha_matilha: number | null
}

const emptyForm = {
  associado_id: '',
  ramo: '',
  secao: '',
  patrulha_matilha: '',
  tipo: '' as '' | ConquistaTipo,
  data_conquista: '',
  observacao: '',
}

export function ConquistaFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const { empresa, profile, hasPermission } = useAuth()
  const associadoLogin = isAssociadoLogin(profile)
  const canWrite = !associadoLogin && hasPermission('associados.write')
  const empresaId = empresa?.id
  const toast = useToast()

  const [form, setForm] = useState(emptyForm)
  const [ramos, setRamos] = useState<Ramo[]>([])
  const [secoes, setSecoes] = useState<Lookup[]>([])
  const [patrulhas, setPatrulhas] = useState<Lookup[]>([])
  const [associados, setAssociados] = useState<AssociadoOpt[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)
  const [originalTipo, setOriginalTipo] = useState<ConquistaTipo | null>(null)

  const associadosOrdenados = useMemo(
    () =>
      [...associados].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [associados],
  )

  useEffect(() => {
    if (!empresaId) return
    void Promise.all([
      supabase
        .from('ramos')
        .select('ramo_id, nome, idade_inicio, idade_fim')
        .order('ramo_id'),
      supabase
        .from('associados')
        .select(
          'associado_id, nome, registro, ramo, secao, patrulha_matilha',
        )
        .eq('empresa_id', empresaId)
        .eq('ativo', true)
        .order('nome')
        .limit(5000),
    ]).then(([r, a]) => {
      setRamos((r.data as Ramo[]) ?? [])
      setAssociados((a.data as AssociadoOpt[]) ?? [])
    })
  }, [empresaId])

  useEffect(() => {
    if (!empresaId || !form.ramo) {
      setSecoes([])
      return
    }
    void supabase
      .from('secao')
      .select('secao_id, nome')
      .eq('empresa_id', empresaId)
      .eq('ramo', Number(form.ramo))
      .order('nome')
      .then(({ data }) =>
        setSecoes(
          (data ?? []).map((row) => ({
            id: row.secao_id as number,
            nome: row.nome as string,
          })),
        ),
      )
  }, [form.ramo, empresaId])

  useEffect(() => {
    if (!empresaId || !form.secao) {
      setPatrulhas([])
      return
    }
    void supabase
      .from('secao_nome')
      .select('secaonome_id, nome')
      .eq('empresa_id', empresaId)
      .eq('secao', Number(form.secao))
      .order('nome')
      .then(({ data }) =>
        setPatrulhas(
          (data ?? []).map((row) => ({
            id: row.secaonome_id as number,
            nome: row.nome as string,
          })),
        ),
      )
  }, [form.secao, empresaId])

  useEffect(() => {
    if (isNew || !empresaId) return
    let mounted = true

    void (async () => {
      const { data, error: loadError } = await supabase
        .from('conquistas')
        .select(
          'conquista_id, empresa_id, associado_id, ramo, secao, patrulha_matilha, tipo, data_conquista, observacao',
        )
        .eq('conquista_id', Number(id))
        .eq('empresa_id', empresaId)
        .maybeSingle()

      if (!mounted) return
      if (loadError || !data) {
        setError(loadError?.message ?? 'Conquista não encontrada neste grupo')
        setLoading(false)
        return
      }

      const row = data as Conquista
      const tipo = isConquistaTipo(row.tipo) ? row.tipo : ''
      setOriginalTipo(tipo || null)
      setForm({
        associado_id: String(row.associado_id),
        ramo: row.ramo != null ? String(row.ramo) : '',
        secao: row.secao != null ? String(row.secao) : '',
        patrulha_matilha:
          row.patrulha_matilha != null ? String(row.patrulha_matilha) : '',
        tipo,
        data_conquista: row.data_conquista?.slice(0, 10) ?? '',
        observacao: row.observacao ?? '',
      })
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [id, isNew, empresaId])

  function update<K extends keyof typeof emptyForm>(
    key: K,
    value: (typeof emptyForm)[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function onAssociadoChange(associadoId: string) {
    const assoc = associados.find(
      (a) => String(a.associado_id) === associadoId,
    )
    const ramo = assoc?.ramo != null ? String(assoc.ramo) : ''
    setForm((prev) => ({
      ...prev,
      associado_id: associadoId,
      ramo,
      secao: assoc?.secao != null ? String(assoc.secao) : '',
      patrulha_matilha:
        assoc?.patrulha_matilha != null ? String(assoc.patrulha_matilha) : '',
      tipo:
        prev.tipo ||
        (assoc?.ramo != null ? sugestaoTipoPorRamo(assoc.ramo) : ''),
    }))
  }

  async function syncAssociadoFlags(
    associadoId: number,
    tipo: ConquistaTipo,
    data: string | null,
    marcado: boolean,
  ) {
    const fields = CONQUISTA_ASSOC_FIELDS[tipo]
    await supabase
      .from('associados')
      .update({
        [fields.flag]: marcado,
        [fields.date]: marcado ? data : null,
      })
      .eq('associado_id', associadoId)
      .eq('empresa_id', empresaId!)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite) {
      setError('Seu usuário não tem permissão para cadastrar conquistas.')
      return
    }
    if (!empresaId) {
      setError('Grupo escoteiro não carregado no perfil do usuário.')
      return
    }
    if (!form.associado_id) {
      setError('Selecione o associado.')
      return
    }
    if (!form.tipo || !isConquistaTipo(form.tipo)) {
      setError('Selecione a conquista.')
      return
    }

    setSaving(true)
    setError(null)

    const associadoId = Number(form.associado_id)
    const payload = {
      empresa_id: empresaId,
      associado_id: associadoId,
      ramo: form.ramo ? Number(form.ramo) : null,
      secao: form.secao ? Number(form.secao) : null,
      patrulha_matilha: form.patrulha_matilha
        ? Number(form.patrulha_matilha)
        : null,
      tipo: form.tipo,
      data_conquista: form.data_conquista.trim() || null,
      observacao: form.observacao.trim() || null,
    }

    try {
      if (isNew) {
        const { error: insertError } = await supabase
          .from('conquistas')
          .insert(payload)
        if (insertError) {
          if (insertError.code === '23505') {
            throw new Error(
              'Este associado já possui esta conquista cadastrada.',
            )
          }
          throw new Error(insertError.message)
        }
      } else {
        const { error: updateError } = await supabase
          .from('conquistas')
          .update(payload)
          .eq('conquista_id', Number(id))
          .eq('empresa_id', empresaId)
        if (updateError) {
          if (updateError.code === '23505') {
            throw new Error(
              'Este associado já possui esta conquista cadastrada.',
            )
          }
          throw new Error(updateError.message)
        }
      }

      await syncAssociadoFlags(
        associadoId,
        form.tipo,
        payload.data_conquista,
        true,
      )
      if (
        originalTipo &&
        originalTipo !== form.tipo
      ) {
        await syncAssociadoFlags(associadoId, originalTipo, null, false)
      }

      toast.success(
        isNew ? 'Conquista cadastrada' : 'Conquista atualizada',
        CONQUISTA_TIPO_LABEL[form.tipo],
      )
      navigate('/conquistas', {
        state: { flashSuccess: 'Conquista salva com sucesso!' },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    if (!canWrite || isNew || !empresaId) return
    if (!window.confirm('Excluir este cadastro de conquista?')) return

    setSaving(true)
    setError(null)
    try {
      const associadoId = Number(form.associado_id)
      const tipo = form.tipo
      const { error: delError } = await supabase
        .from('conquistas')
        .delete()
        .eq('conquista_id', Number(id))
        .eq('empresa_id', empresaId)
      if (delError) throw new Error(delError.message)

      if (associadoId && tipo && isConquistaTipo(tipo)) {
        await syncAssociadoFlags(associadoId, tipo, null, false)
      }

      toast.success('Conquista excluída')
      navigate('/conquistas', {
        state: { flashSuccess: 'Conquista excluída com sucesso!' },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir')
    } finally {
      setSaving(false)
    }
  }

  if (!empresaId) {
    return (
      <section className="panel">
        <p className="muted">
          Seu usuário precisa estar vinculado a um grupo escoteiro.
        </p>
      </section>
    )
  }

  /** Associado (login por registro): só visualiza — sem cadastro/edição. */
  if (associadoLogin || !canWrite) {
    return <Navigate to="/conquistas" replace />
  }

  if (loading) {
    return (
      <section className="panel">
        <div className="loading">Carregando…</div>
      </section>
    )
  }

  const disabled = !canWrite || saving

  return (
    <>
      <WaitingOverlay show={saving} detail="Salvando conquista…" />
      <header className="page-header">
        <div>
          <h2>{isNew ? 'Nova conquista' : 'Editar conquista'}</h2>
          <p>
            Cadastro de conquista máxima — <strong>{empresa?.nome}</strong>
          </p>
        </div>
        <Link className="btn btn-soft" to="/conquistas">
          Voltar
        </Link>
      </header>

      {error ? (
        <AlertMessage tone="error" title="Não foi possível continuar">
          {error}
        </AlertMessage>
      ) : null}

      {!canWrite ? (
        <AlertMessage tone="error" title="Somente leitura">
          Seu usuário não tem permissão para alterar conquistas.
        </AlertMessage>
      ) : null}

      <form className="panel form-grid" onSubmit={onSubmit}>
        <div className="field field-span-2">
          <label htmlFor="associado_id">Associado</label>
          <select
            id="associado_id"
            className="input"
            value={form.associado_id}
            disabled={disabled}
            onChange={(e) => onAssociadoChange(e.target.value)}
            required
          >
            <option value="">Selecione…</option>
            {associadosOrdenados.map((a) => (
              <option key={a.associado_id} value={a.associado_id}>
                {a.nome}
                {a.registro != null ? ` · Reg. ${a.registro}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="tipo">Conquista</label>
          <select
            id="tipo"
            className="input"
            value={form.tipo}
            disabled={disabled}
            onChange={(e) =>
              update(
                'tipo',
                isConquistaTipo(e.target.value)
                  ? e.target.value
                  : ('' as const),
              )
            }
            required
          >
            <option value="">Selecione…</option>
            {CONQUISTA_TIPOS.map((tipo) => (
              <option key={tipo} value={tipo}>
                {CONQUISTA_TIPO_LABEL[tipo]}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="data_conquista">Data</label>
          <input
            id="data_conquista"
            className="input"
            type="date"
            value={form.data_conquista}
            disabled={disabled}
            onChange={(e) => update('data_conquista', e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="ramo">Ramo</label>
          <select
            id="ramo"
            className="input"
            value={form.ramo}
            disabled={disabled}
            onChange={(e) => {
              update('ramo', e.target.value)
              update('secao', '')
              update('patrulha_matilha', '')
            }}
          >
            <option value="">—</option>
            {ramos.map((r) => (
              <option key={r.ramo_id} value={r.ramo_id}>
                {r.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="secao">Seção</label>
          <select
            id="secao"
            className="input"
            value={form.secao}
            disabled={disabled || !form.ramo}
            onChange={(e) => {
              update('secao', e.target.value)
              update('patrulha_matilha', '')
            }}
          >
            <option value="">—</option>
            {secoes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="patrulha_matilha">Patrulha / Matilha / Clã</label>
          <select
            id="patrulha_matilha"
            className="input"
            value={form.patrulha_matilha}
            disabled={disabled || !form.secao}
            onChange={(e) => update('patrulha_matilha', e.target.value)}
          >
            <option value="">—</option>
            {patrulhas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="field field-span-full">
          <label htmlFor="observacao">Observação</label>
          <input
            id="observacao"
            className="input"
            maxLength={300}
            value={form.observacao}
            disabled={disabled}
            onChange={(e) => update('observacao', e.target.value)}
          />
        </div>

        <div className="form-actions field-span-full">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={disabled}
          >
            Salvar
          </button>
          {!isNew && canWrite ? (
            <button
              type="button"
              className="btn btn-danger"
              disabled={saving}
              onClick={() => void onDelete()}
            >
              Excluir
            </button>
          ) : null}
        </div>
      </form>
    </>
  )
}
