import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { WaitingOverlay } from '@/components/WaitingOverlay'
import {
  competenciaToDate,
  currentCompetenciaInput,
  formatCompetencia,
} from '@/lib/receitas'
import {
  formatMoney,
  TITULO_SITUACAO,
  type PlataformaPlano,
} from '@/lib/plataforma'
import { vencimentoPlataformaCompetencia } from '@/lib/plataformaAcesso'

type PreviewRow = {
  empresa_id: number
  nome: string
  slug: string | null
  plano_id: number
  plano_nome: string
  valor: number
  already: boolean
  isento: boolean
  dia_vencimento: number | null
}

export function GeraCobrancaPlataformaPage() {
  const { isSuperAdmin, hasPermission } = useAuth()
  const canWrite = isSuperAdmin && hasPermission('plataforma.write')
  const toast = useToast()

  const [competencia, setCompetencia] = useState(currentCompetenciaInput())
  const [planos, setPlanos] = useState<PlataformaPlano[]>([])
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    if (!isSuperAdmin) return
    void supabase
      .from('plataforma_plano')
      .select('plano_id, nome, valor, ativo')
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setPlanos((data as PlataformaPlano[]) ?? []))
  }, [isSuperAdmin])

  const aGerar = useMemo(
    () => preview.filter((p) => !p.already && !p.isento && p.valor > 0),
    [preview],
  )
  const totalValor = useMemo(
    () => aGerar.reduce((sum, p) => sum + p.valor, 0),
    [aGerar],
  )

  async function carregarPreview() {
    const compDate = competenciaToDate(competencia)
    if (!compDate) {
      setError('Informe a competência (mês/ano).')
      return
    }

    setLoading(true)
    setError(null)
    setInfo(null)

    const [empresasRes, cobrancasRes] = await Promise.all([
      supabase
        .from('empresa')
        .select(
          'id, nome, slug, ativo, plataforma_plano_id, plataforma_isento, plataforma_dia_vencimento',
        )
        .eq('ativo', true)
        .order('nome'),
      supabase
        .from('plataforma_cobranca')
        .select('empresa_id')
        .eq('competencia', compDate),
    ])

    if (empresasRes.error || cobrancasRes.error) {
      setError(
        empresasRes.error?.message ??
          cobrancasRes.error?.message ??
          'Falha ao carregar.',
      )
      setPreview([])
      setLoading(false)
      return
    }

    const already = new Set(
      ((cobrancasRes.data ?? []) as { empresa_id: number }[]).map(
        (r) => r.empresa_id,
      ),
    )
    const planoById = new Map(planos.map((p) => [p.plano_id, p]))

    const rows: PreviewRow[] = (
      (empresasRes.data ?? []) as {
        id: number
        nome: string
        slug: string | null
        plataforma_plano_id: number | null
        plataforma_isento: boolean | null
        plataforma_dia_vencimento: number | null
      }[]
    )
      .filter((e) => e.plataforma_plano_id != null)
      .map((e) => {
        const plano = planoById.get(e.plataforma_plano_id!)
        return {
          empresa_id: e.id,
          nome: e.nome,
          slug: e.slug,
          plano_id: e.plataforma_plano_id!,
          plano_nome: plano?.nome ?? `Plano #${e.plataforma_plano_id}`,
          valor: Number(plano?.valor ?? 0),
          already: already.has(e.id),
          isento: e.plataforma_isento === true,
          dia_vencimento:
            e.plataforma_dia_vencimento != null
              ? Number(e.plataforma_dia_vencimento)
              : null,
        }
      })

    setPreview(rows)
    setLoading(false)
    if (rows.length === 0) {
      setInfo(
        'Nenhum grupo ativo com plano vinculado. Cadastre planos e vincule em Grupos escoteiros.',
      )
    }
  }

  async function onGenerate(e: FormEvent) {
    e.preventDefault()
    if (!canWrite) return
    const compDate = competenciaToDate(competencia)
    if (!compDate) {
      setError('Informe a competência (mês/ano).')
      return
    }
    if (aGerar.length === 0) {
      setError('Não há cobranças novas para gerar.')
      return
    }

    const ok = await toast.confirm({
      title: 'Gerar cobranças?',
      message: `Serão criadas ${aGerar.length} cobrança(s) de ${formatCompetencia(compDate)} no total de ${formatMoney(totalValor)}.`,
      confirmLabel: 'Gerar',
      cancelLabel: 'Cancelar',
    })
    if (!ok) return

    setGenerating(true)
    setError(null)
    const payload = aGerar.map((row) => ({
      empresa_id: row.empresa_id,
      plano_id: row.plano_id,
      competencia: compDate,
      vencimento: vencimentoPlataformaCompetencia(
        compDate,
        row.dia_vencimento,
      ),
      descricao: `Mensalidade plataforma ${formatCompetencia(compDate)} — ${row.nome}`,
      valor: row.valor,
      saldo: row.valor,
      situacao: TITULO_SITUACAO.ABERTO,
    }))

    const { error: insertError } = await supabase
      .from('plataforma_cobranca')
      .insert(payload)

    setGenerating(false)
    if (insertError) {
      setError(insertError.message)
      return
    }

    toast.success('Cobranças geradas com sucesso.')
    setInfo(`${payload.length} cobrança(s) gerada(s).`)
    void carregarPreview()
  }

  if (!isSuperAdmin) {
    return (
      <section className="panel">
        <p className="muted">Acesso restrito ao administrador da plataforma.</p>
      </section>
    )
  }

  return (
    <>
      <WaitingOverlay
        open={generating}
        title="Gerando cobranças…"
        detail="Aguarde."
      />
      <header className="page-header">
        <div>
          <h2>Gerar mensalidade da plataforma</h2>
          <p>Uma cobrança por grupo escoteiro com plano vinculado.</p>
        </div>
        <Link className="btn btn-soft" to="/plataforma/cobrancas">
          Voltar
        </Link>
      </header>

      <form className="panel" onSubmit={(e) => void onGenerate(e)}>
        {error ? (
          <AlertMessage tone="error" title="Atenção">
            {error}
          </AlertMessage>
        ) : null}
        {info ? (
          <AlertMessage tone="success" title="Pronto">
            {info}
          </AlertMessage>
        ) : null}

        <div className="form-grid form-grid-2">
          <div className="field">
            <label htmlFor="comp">Competência</label>
            <input
              id="comp"
              className="input"
              type="month"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
              disabled={loading || generating}
              required
            />
          </div>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-soft"
            disabled={loading || generating || planos.length === 0}
            onClick={() => void carregarPreview()}
          >
            {loading ? 'Carregando…' : 'Pré-visualizar'}
          </button>
          {canWrite ? (
            <button
              type="submit"
              className="btn btn-primary"
              disabled={generating || aGerar.length === 0}
            >
              Gerar {aGerar.length > 0 ? `(${aGerar.length})` : ''}
            </button>
          ) : null}
        </div>

        {preview.length > 0 ? (
          <>
            <p className="muted">
              A gerar: <strong>{aGerar.length}</strong> · Total{' '}
              <strong>{formatMoney(totalValor)}</strong>
            </p>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Grupo</th>
                    <th>Plano</th>
                    <th>Valor</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row) => (
                    <tr key={row.empresa_id}>
                      <td>{row.nome}</td>
                      <td>{row.plano_nome}</td>
                      <td>{formatMoney(row.valor)}</td>
                      <td>
                        {row.isento
                          ? 'Isento'
                          : row.already
                            ? 'Já gerada'
                            : row.valor <= 0
                              ? 'Sem valor'
                              : 'A gerar'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </form>
    </>
  )
}
