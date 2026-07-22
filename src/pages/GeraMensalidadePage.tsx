import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import {
  competenciaToDate,
  currentCompetenciaInput,
  formatCompetencia,
  formatMoney,
  lastDayOfCompetencia,
  RECEITA_ORIGEM,
  TITULO_SITUACAO,
} from '@/lib/receitas'
import { isRamoFinanceiroScoped } from '@/lib/roles'
import {
  mensagemCobrancaMensalidade,
  normalizeWhatsAppPhone,
  openWhatsApp,
} from '@/lib/whatsapp'

type TipoMensalidade = {
  tipomensalidade_id: number
  nome: string
  valor: number | null
}

type PreviewRow = {
  associado_id: number
  nome: string
  registro: number | null
  ramo: number | null
  tipomensalidade_id: number
  tipo_nome: string
  valor: number
  already: boolean
  celular: string | null
  responsavel_fonecelular: string | null
}

export function GeraMensalidadePage() {
  const { empresa, profile, hasPermission } = useAuth()
  const canWrite = hasPermission('financeiro.write')
  const empresaId = empresa?.id
  const toast = useToast()
  const ramoScoped = isRamoFinanceiroScoped(profile)

  const [competencia, setCompetencia] = useState(currentCompetenciaInput())
  const [tipoFiltro, setTipoFiltro] = useState('')
  const [tipos, setTipos] = useState<TipoMensalidade[]>([])
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [whatsQueue, setWhatsQueue] = useState<PreviewRow[]>([])
  const [whatsIndex, setWhatsIndex] = useState(0)

  useEffect(() => {
    if (!empresaId) return
    void supabase
      .from('tipo_mensalidade')
      .select('tipomensalidade_id, nome, valor')
      .eq('empresa_id', empresaId)
      .order('nome')
      .then(({ data }) => setTipos((data as TipoMensalidade[]) ?? []))
  }, [empresaId])

  const aGerar = useMemo(
    () => preview.filter((p) => !p.already),
    [preview],
  )
  const totalValor = useMemo(
    () => aGerar.reduce((sum, p) => sum + p.valor, 0),
    [aGerar],
  )

  async function carregarPreview() {
    if (!empresaId) return
    const compDate = competenciaToDate(competencia)
    if (!compDate) {
      setError('Informe a competência (mês/ano).')
      return
    }

    setLoading(true)
    setError(null)
    setInfo(null)

    let associadosQuery = supabase
      .from('associados')
      .select(
        'associado_id, nome, registro, ramo, tipo_mensalidade, isento, ativo, celular, responsavel_fonecelular',
      )
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .not('tipo_mensalidade', 'is', null)

    if (tipoFiltro) {
      associadosQuery = associadosQuery.eq(
        'tipo_mensalidade',
        Number(tipoFiltro),
      )
    }

    const [assocRes, tiposRes, existentesRes] = await Promise.all([
      associadosQuery.order('nome').limit(5000),
      supabase
        .from('tipo_mensalidade')
        .select('tipomensalidade_id, nome, valor')
        .eq('empresa_id', empresaId),
      supabase
        .from('receitas')
        .select('associado_id')
        .eq('empresa_id', empresaId)
        .eq('receita_origem', RECEITA_ORIGEM.MENSALIDADE)
        .eq('receita_competencia', compDate),
    ])

    if (assocRes.error || tiposRes.error || existentesRes.error) {
      setLoading(false)
      setError(
        assocRes.error?.message ??
          tiposRes.error?.message ??
          existentesRes.error?.message ??
          'Erro ao carregar prévia',
      )
      return
    }

    const tipoMap = new Map(
      ((tiposRes.data as TipoMensalidade[]) ?? []).map((t) => [
        t.tipomensalidade_id,
        t,
      ]),
    )
    const existentes = new Set(
      (existentesRes.data ?? [])
        .map((r) => r.associado_id as number | null)
        .filter((id): id is number => id != null),
    )

    const rows: PreviewRow[] = []
    for (const a of assocRes.data ?? []) {
      if (a.isento === true) continue
      const tipoId = a.tipo_mensalidade as number | null
      if (!tipoId) continue
      const tipo = tipoMap.get(tipoId)
      if (!tipo) continue
      const valor = Number(tipo.valor ?? 0)
      if (valor <= 0) continue

      rows.push({
        associado_id: a.associado_id as number,
        nome: a.nome as string,
        registro: (a.registro as number | null) ?? null,
        ramo: (a.ramo as number | null) ?? null,
        tipomensalidade_id: tipoId,
        tipo_nome: tipo.nome,
        valor,
        already: existentes.has(a.associado_id as number),
        celular: (a.celular as string | null) ?? null,
        responsavel_fonecelular:
          (a.responsavel_fonecelular as string | null) ?? null,
      })
    }

    setPreview(rows)
    setLoading(false)
    setInfo(
      `${rows.filter((r) => !r.already).length} a gerar · ${rows.filter((r) => r.already).length} já existente(s)`,
    )
  }

  async function onGerar(event: FormEvent) {
    event.preventDefault()
    if (!canWrite || !empresaId) return
    const compDate = competenciaToDate(competencia)
    const vencimento = lastDayOfCompetencia(competencia)
    if (!compDate || !vencimento) {
      setError('Competência inválida.')
      return
    }
    if (aGerar.length === 0) {
      setError('Não há mensalidades novas para gerar nesta competência.')
      return
    }

    const ok = await toast.confirm({
      title: 'Gerar mensalidades?',
      message: `Serão criadas ${aGerar.length} receita(s) totalizando ${formatMoney(totalValor)}.`,
      confirmLabel: 'Sim, gerar',
      cancelLabel: 'Não',
    })
    if (!ok) return

    setGenerating(true)
    setError(null)

    const payload = aGerar.map((row) => ({
      empresa_id: empresaId,
      associado_id: row.associado_id,
      tipomensalidade_id: row.tipomensalidade_id,
      receita_origem: RECEITA_ORIGEM.MENSALIDADE,
      receita_descricao: `Mensalidade ${competencia.slice(5, 7)}/${competencia.slice(0, 4)} — ${row.tipo_nome}`,
      receita_ramo: row.ramo,
      receita_emissao: compDate,
      receita_vencimento: vencimento,
      receita_competencia: compDate,
      receita_valor: row.valor,
      receita_saldo: row.valor,
      receita_situacao: TITULO_SITUACAO.ABERTO,
    }))

    const chunkSize = 100
    let inserted = 0
    for (let i = 0; i < payload.length; i += chunkSize) {
      const chunk = payload.slice(i, i + chunkSize)
      const { error: insertError, data } = await supabase
        .from('receitas')
        .insert(chunk)
        .select('receita_id')

      if (insertError) {
        setGenerating(false)
        setError(
          `Geradas ${inserted} até o erro: ${insertError.message}`,
        )
        void carregarPreview()
        return
      }
      inserted += data?.length ?? chunk.length
    }

    setGenerating(false)
    toast.success(
      'Mensalidades geradas',
      `${inserted} receita(s) criada(s) com sucesso.`,
    )

    const comWhats = aGerar.filter((row) =>
      normalizeWhatsAppPhone(row.responsavel_fonecelular || row.celular),
    )
    if (comWhats.length > 0) {
      const enviar = await toast.confirm({
        title: 'Enviar cobrança no WhatsApp?',
        message: `${comWhats.length} associado(s) com telefone. Deseja abrir o WhatsApp um a um com a mensagem de cobrança?`,
        confirmLabel: 'Sim, enviar',
        cancelLabel: 'Agora não',
      })
      if (enviar) {
        setWhatsQueue(comWhats)
        setWhatsIndex(0)
      }
    }

    void carregarPreview()
  }

  function phoneOf(row: PreviewRow): string | null {
    return row.responsavel_fonecelular || row.celular
  }

  function mensagemDaLinha(row: PreviewRow): string {
    const compLabel = formatCompetencia(competenciaToDate(competencia))
    return mensagemCobrancaMensalidade({
      nomeGrupo: empresa?.nome,
      nomeAssociado: row.nome,
      registro: row.registro,
      qtd: 1,
      total: formatMoney(row.valor),
      detalhes: [
        `Competência ${compLabel}`,
        `${row.tipo_nome}: ${formatMoney(row.valor)}`,
      ],
    })
  }

  function enviarWhatsLinha(row: PreviewRow) {
    const phone = phoneOf(row)
    if (!normalizeWhatsAppPhone(phone)) {
      toast.error(
        'Sem telefone',
        'Cadastre o celular do associado ou do responsável.',
      )
      return
    }
    openWhatsApp({ phone, text: mensagemDaLinha(row) })
  }

  function enviarWhatsAtual() {
    const row = whatsQueue[whatsIndex]
    if (!row) return
    openWhatsApp({ phone: phoneOf(row), text: mensagemDaLinha(row) })
  }

  function avancarWhatsQueue() {
    if (whatsIndex + 1 >= whatsQueue.length) {
      setWhatsQueue([])
      setWhatsIndex(0)
      toast.success('WhatsApp', 'Fila de envios concluída.')
      return
    }
    setWhatsIndex((prev) => prev + 1)
  }

  if (ramoScoped) {
    return (
      <section className="panel">
        <AlertMessage tone="error" title="Acesso restrito">
          Usuários vinculados a um ramo não podem gerar mensalidades do grupo.
        </AlertMessage>
        <Link className="btn btn-soft" to="/receitas/inclusao">
          Voltar às receitas
        </Link>
      </section>
    )
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

  return (
    <>
      <header className="page-header">
        <div>
          <h2>Gera Mensalidade</h2>
          <p>
            Gera títulos em aberto para associados ativos com tipo de
            mensalidade — <strong>{empresa?.nome}</strong>
          </p>
        </div>
      </header>

      {whatsQueue.length > 0 ? (
        <section className="panel gera-whats-panel">
          <div className="passagem-header">
            <div>
              <h3>Cobrança no WhatsApp</h3>
              <p className="muted">
                {whatsIndex + 1} de {whatsQueue.length} — abra o WhatsApp, envie
                a mensagem e avance para o próximo.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => {
                setWhatsQueue([])
                setWhatsIndex(0)
              }}
            >
              Encerrar fila
            </button>
          </div>
          <article className="associado-mensalidade-item">
            <div>
              <h4>{whatsQueue[whatsIndex]?.nome}</h4>
              <p className="muted">
                Reg. {whatsQueue[whatsIndex]?.registro ?? '—'} ·{' '}
                {whatsQueue[whatsIndex]?.tipo_nome} ·{' '}
                {formatMoney(whatsQueue[whatsIndex]?.valor)}
              </p>
              <p className="muted">
                Tel. {phoneOf(whatsQueue[whatsIndex]!) || '—'}
              </p>
            </div>
            <div className="associado-mensalidade-resumo-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => enviarWhatsAtual()}
              >
                Abrir WhatsApp
              </button>
              <button
                type="button"
                className="btn btn-soft"
                onClick={() => avancarWhatsQueue()}
              >
                {whatsIndex + 1 >= whatsQueue.length ? 'Concluir' : 'Próximo'}
              </button>
            </div>
          </article>
        </section>
      ) : null}

      <form className="panel" onSubmit={(e) => void onGerar(e)}>
        {error ? (
          <AlertMessage tone="error" title="Atenção">
            {error}
          </AlertMessage>
        ) : null}
        {info && !error ? (
          <AlertMessage tone="success" title="Prévia">
            {info}
          </AlertMessage>
        ) : null}

        <div className="form-grid">
          <div className="field">
            <label htmlFor="competencia">Competência</label>
            <input
              id="competencia"
              className="input"
              type="month"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
              disabled={generating}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="tipoFiltro">Tipo de mensalidade</label>
            <select
              id="tipoFiltro"
              className="select"
              value={tipoFiltro}
              onChange={(e) => setTipoFiltro(e.target.value)}
              disabled={generating}
            >
              <option value="">Todos os tipos</option>
              {tipos.map((t) => (
                <option key={t.tipomensalidade_id} value={t.tipomensalidade_id}>
                  {t.nome} ({formatMoney(t.valor)})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-soft"
            disabled={loading || generating}
            onClick={() => void carregarPreview()}
          >
            {loading ? 'Carregando…' : 'Carregar prévia'}
          </button>
          {canWrite ? (
            <button
              className="btn btn-primary"
              type="submit"
              disabled={generating || loading || aGerar.length === 0}
            >
              {generating
                ? 'Gerando…'
                : `Gerar ${aGerar.length} mensalidade(s)`}
            </button>
          ) : (
            <p className="muted">Sem permissão para gerar.</p>
          )}
        </div>

        {preview.length > 0 ? (
          <>
            <p className="field-hint" style={{ marginTop: '1rem' }}>
              Total a gerar: <strong>{formatMoney(totalValor)}</strong>
            </p>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Associado</th>
                    <th>Tipo</th>
                    <th>Valor</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row) => (
                    <tr key={row.associado_id}>
                      <td>{row.nome}</td>
                      <td>{row.tipo_nome}</td>
                      <td>{formatMoney(row.valor)}</td>
                      <td>
                        {row.already ? (
                          <span className="badge">Já gerada</span>
                        ) : (
                          <span className="badge">Nova</span>
                        )}
                      </td>
                      <td>
                        {normalizeWhatsAppPhone(phoneOf(row)) ? (
                          <button
                            type="button"
                            className="btn btn-soft"
                            disabled={generating}
                            onClick={() => enviarWhatsLinha(row)}
                          >
                            WhatsApp
                          </button>
                        ) : (
                          <span className="muted">—</span>
                        )}
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
