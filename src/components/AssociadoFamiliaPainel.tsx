import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertMessage } from '@/components/AlertMessage'
import { useToast } from '@/contexts/ToastContext'
import { formatMoney } from '@/lib/despesas'
import { supabase } from '@/lib/supabase'

type Membro = {
  associado_id: number
  nome: string
  registro: number | null
  isento: boolean | null
  tipo_mensalidade: number | null
  tipo_nome: string | null
  tipo_valor: number | null
}

type Opt = {
  associado_id: number
  nome: string
  registro: number | null
  familia_id: number | null
}

export function AssociadoFamiliaPainel({
  empresaId,
  associadoId,
  associadoNome,
  canWrite,
  familiaId,
  onFamiliaIdChange,
}: {
  empresaId: number
  associadoId: number | null
  associadoNome: string
  canWrite: boolean
  familiaId: number | null
  onFamiliaIdChange: (id: number | null) => void
}) {
  const toast = useToast()
  const [membros, setMembros] = useState<Membro[]>([])
  const [opcoes, setOpcoes] = useState<Opt[]>([])
  const [addId, setAddId] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!empresaId || associadoId == null) {
      setMembros([])
      setOpcoes([])
      return
    }
    setLoading(true)
    setError(null)

    const [{ data: tiposData }, { data: assocData, error: assocError }] =
      await Promise.all([
        supabase
          .from('tipo_mensalidade')
          .select('tipomensalidade_id, nome, valor')
          .eq('empresa_id', empresaId),
        supabase
          .from('associados')
          .select(
            'associado_id, nome, registro, isento, tipo_mensalidade, familia_id, ativo',
          )
          .eq('empresa_id', empresaId)
          .eq('ativo', true)
          .order('nome'),
      ])

    if (assocError) {
      setError(assocError.message)
      setLoading(false)
      return
    }

    const tipoMap = new Map(
      (tiposData ?? []).map((t) => [
        t.tipomensalidade_id as number,
        { nome: t.nome as string, valor: Number(t.valor ?? 0) },
      ]),
    )

    const todos = (assocData ?? []) as Array<{
      associado_id: number
      nome: string
      registro: number | null
      isento: boolean | null
      tipo_mensalidade: number | null
      familia_id: number | null
    }>

    const fid = familiaId
    const daFamilia = todos.filter(
      (a) =>
        a.associado_id === associadoId ||
        (fid != null && a.familia_id === fid),
    )

    setMembros(
      daFamilia.map((a) => {
        const tipo =
          a.tipo_mensalidade != null ? tipoMap.get(a.tipo_mensalidade) : null
        return {
          associado_id: a.associado_id,
          nome: a.nome,
          registro: a.registro,
          isento: a.isento,
          tipo_mensalidade: a.tipo_mensalidade,
          tipo_nome: tipo?.nome ?? null,
          tipo_valor: tipo?.valor ?? null,
        }
      }),
    )

    setOpcoes(
      todos
        .filter((a) => a.associado_id !== associadoId)
        .filter((a) => a.familia_id == null || a.familia_id === fid)
        .filter((a) => !(fid != null && a.familia_id === fid))
        .map((a) => ({
          associado_id: a.associado_id,
          nome: a.nome,
          registro: a.registro,
          familia_id: a.familia_id,
        })),
    )
    setLoading(false)
  }, [empresaId, associadoId, familiaId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const outros = useMemo(
    () => membros.filter((m) => m.associado_id !== associadoId),
    [membros, associadoId],
  )

  const total = useMemo(
    () =>
      membros.reduce((sum, m) => {
        if (m.isento === true) return sum
        const v = Number(m.tipo_valor ?? 0)
        return v > 0 ? sum + v : sum
      }, 0),
    [membros],
  )

  async function garantirFamilia(): Promise<number | null> {
    if (familiaId != null) return familiaId
    if (associadoId == null || !empresaId) return null

    const nomeBase = (associadoNome || 'FAMÍLIA').trim().toUpperCase()
    const { data, error: insertError } = await supabase
      .from('familia')
      .insert({
        empresa_id: empresaId,
        nome: nomeBase.startsWith('FAMÍLIA') ? nomeBase : `FAMÍLIA ${nomeBase}`,
        responsavel_associado_id: associadoId,
        ativo: true,
      })
      .select('familia_id')
      .single()

    if (insertError || !data) {
      setError(insertError?.message ?? 'Não foi possível criar a família.')
      return null
    }

    const novaId = data.familia_id as number
    const { error: linkError } = await supabase
      .from('associados')
      .update({ familia_id: novaId })
      .eq('empresa_id', empresaId)
      .eq('associado_id', associadoId)

    if (linkError) {
      setError(linkError.message)
      return null
    }

    onFamiliaIdChange(novaId)
    return novaId
  }

  async function adicionar() {
    if (!canWrite || associadoId == null || !empresaId) return
    const outroId = Number(addId)
    if (!Number.isFinite(outroId) || outroId <= 0) return

    setBusy(true)
    setError(null)
    const fid = await garantirFamilia()
    if (fid == null) {
      setBusy(false)
      return
    }

    const { error: updError } = await supabase
      .from('associados')
      .update({ familia_id: fid })
      .eq('empresa_id', empresaId)
      .eq('associado_id', outroId)

    setBusy(false)
    if (updError) {
      setError(updError.message)
      return
    }
    setAddId('')
    toast.success('Pronto!', 'Associado incluído na família.')
    await carregar()
  }

  async function remover(membroId: number) {
    if (!canWrite || !empresaId || associadoId == null) return
    if (membroId === associadoId) return

    const ok = await toast.confirm({
      title: 'Remover da família?',
      message: 'Este associado volta a gerar mensalidade individual.',
      confirmLabel: 'Remover',
    })
    if (!ok) return

    setBusy(true)
    setError(null)
    const { error: updError } = await supabase
      .from('associados')
      .update({ familia_id: null })
      .eq('empresa_id', empresaId)
      .eq('associado_id', membroId)

    if (updError) {
      setBusy(false)
      setError(updError.message)
      return
    }

    const restantes = outros.filter((m) => m.associado_id !== membroId)
    if (restantes.length === 0 && familiaId != null) {
      await supabase
        .from('associados')
        .update({ familia_id: null })
        .eq('empresa_id', empresaId)
        .eq('associado_id', associadoId)
      await supabase
        .from('familia')
        .delete()
        .eq('empresa_id', empresaId)
        .eq('familia_id', familiaId)
      onFamiliaIdChange(null)
    }

    setBusy(false)
    toast.success('Pronto!', 'Associado removido da família.')
    await carregar()
  }

  if (associadoId == null) {
    return (
      <AlertMessage tone="info" title="Salve o associado">
        Depois de salvar, você poderá incluir os outros associados da família
        neste grid.
      </AlertMessage>
    )
  }

  return (
    <div>
      <p className="muted">
        Informe os outros associados da mesma família. A mensalidade será gerada
        em um único título, somando os valores de cada um (exceto isentos). Este
        associado fica como responsável da cobrança.
      </p>

      {error ? (
        <AlertMessage tone="error" title="Atenção">
          {error}
        </AlertMessage>
      ) : null}

      {canWrite ? (
        <div
          className="form-grid form-grid-2"
          style={{ marginBottom: '1rem', alignItems: 'end' }}
        >
          <div className="field field-span-2">
            <label htmlFor="familia_add_membro">Incluir associado</label>
            <select
              id="familia_add_membro"
              className="select"
              value={addId}
              onChange={(e) => setAddId(e.target.value)}
              disabled={busy || loading}
            >
              <option value="">Selecione…</option>
              {opcoes.map((o) => (
                <option key={o.associado_id} value={o.associado_id}>
                  {o.nome}
                  {o.registro != null ? ` · ${o.registro}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !addId}
              onClick={() => void adicionar()}
            >
              Incluir na família
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="muted">Carregando…</p>
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
              {membros.map((m) => {
                const ehAtual = m.associado_id === associadoId
                return (
                  <tr key={m.associado_id}>
                    <td>
                      {m.nome}
                      {ehAtual ? ' · responsável' : ''}
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
                      {canWrite && !ehAtual ? (
                        <button
                          type="button"
                          className="btn btn-soft"
                          disabled={busy}
                          onClick={() => void remover(m.associado_id)}
                        >
                          Remover
                        </button>
                      ) : ehAtual ? (
                        <span className="muted">—</span>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted" style={{ marginTop: '0.75rem' }}>
        {outros.length === 0
          ? 'Nenhum outro associado na família ainda.'
          : `Total estimado da família: ${formatMoney(total)}`}
      </p>
    </div>
  )
}
