import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { RegistroProvisorioBadge } from '@/components/RegistroProvisorioBadge'
import { WaitingOverlay } from '@/components/WaitingOverlay'
import {
  competenciaToDate,
  currentCompetenciaInput,
  formatCompetencia,
  formatMoney,
  RECEITA_ORIGEM,
  TITULO_SITUACAO,
  vencimentoCompetencia,
} from '@/lib/receitas'
import { isRamoFinanceiroScoped } from '@/lib/roles'
import {
  mensagemCobrancaMensalidade,
  normalizeWhatsAppPhone,
  openWhatsApp,
} from '@/lib/whatsapp'
import { enviarEmailsMensalidade } from '@/lib/emailMensalidade'

type TipoMensalidade = {
  tipomensalidade_id: number
  nome: string
  valor: number | null
  plano_conta_id: number | null
}

type PreviewRow = {
  key: string
  associado_id: number
  familia_id: number | null
  nome: string
  registro: number | null
  registro_provisorio: boolean
  ramo: number | null
  tipomensalidade_id: number | null
  tipo_nome: string
  plano_conta_id: number | null
  valor: number
  already: boolean
  celular: string | null
  responsavel_fonecelular: string | null
  email: string | null
  responsavel_email: string | null
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
  const [progressDetail, setProgressDetail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [whatsQueue, setWhatsQueue] = useState<PreviewRow[]>([])
  const [whatsIndex, setWhatsIndex] = useState(0)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [diaVencimento, setDiaVencimento] = useState<number | null>(null)

  useEffect(() => {
    if (!empresaId) return
    void supabase
      .from('tipo_mensalidade')
      .select('tipomensalidade_id, nome, valor, plano_conta_id')
      .eq('empresa_id', empresaId)
      .order('nome')
      .then(({ data }) => setTipos((data as TipoMensalidade[]) ?? []))

    void supabase
      .from('empresa')
      .select('dia_vencimento_mensalidade')
      .eq('id', empresaId)
      .maybeSingle()
      .then(({ data }) => {
        const dia = data?.dia_vencimento_mensalidade
        setDiaVencimento(
          dia != null && Number.isFinite(Number(dia)) ? Number(dia) : null,
        )
      })
  }, [empresaId])

  const aGerar = useMemo(
    () => preview.filter((p) => !p.already),
    [preview],
  )
  const totalValor = useMemo(
    () => aGerar.reduce((sum, p) => sum + p.valor, 0),
    [aGerar],
  )

  function excluirDaPrevia(key: string) {
    setPreview((rows) => {
      const next = rows.filter((r) => r.key !== key)
      const novas = next.filter((r) => !r.already).length
      const existentes = next.filter((r) => r.already).length
      setInfo(
        `${novas} a gerar · ${existentes} já existente(s)` +
          (rows.length > next.length ? ' · 1 excluída da prévia' : ''),
      )
      return next
    })
  }

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
        'associado_id, nome, registro, registro_provisorio, ramo, tipo_mensalidade, isento, ativo, celular, responsavel_fonecelular, email, responsavel_email, familia_id',
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

    const [assocRes, tiposRes, existentesRes, familiasRes] = await Promise.all([
      associadosQuery.order('nome').limit(5000),
      supabase
        .from('tipo_mensalidade')
        .select('tipomensalidade_id, nome, valor, plano_conta_id')
        .eq('empresa_id', empresaId),
      supabase
        .from('receitas')
        .select('associado_id, familia_id')
        .eq('empresa_id', empresaId)
        .eq('receita_origem', RECEITA_ORIGEM.MENSALIDADE)
        .eq('receita_competencia', compDate),
      supabase
        .from('familia')
        .select('familia_id, nome, ativo, responsavel_associado_id')
        .eq('empresa_id', empresaId),
    ])

    if (
      assocRes.error ||
      tiposRes.error ||
      existentesRes.error ||
      familiasRes.error
    ) {
      setLoading(false)
      setError(
        assocRes.error?.message ??
          tiposRes.error?.message ??
          existentesRes.error?.message ??
          familiasRes.error?.message ??
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
    const existentesAssoc = new Set(
      (existentesRes.data ?? [])
        .map((r) => r.associado_id as number | null)
        .filter((id): id is number => id != null),
    )
    const existentesFamilia = new Set(
      (existentesRes.data ?? [])
        .map((r) => r.familia_id as number | null)
        .filter((id): id is number => id != null),
    )
    const familiaMap = new Map(
      (
        (familiasRes.data ?? []) as Array<{
          familia_id: number
          nome: string
          ativo: boolean
          responsavel_associado_id: number | null
        }>
      )
        .filter((f) => f.ativo !== false)
        .map((f) => [f.familia_id, f]),
    )

    type AssocRow = {
      associado_id: number
      nome: string
      registro: number | null
      registro_provisorio: boolean
      ramo: number | null
      tipo_mensalidade: number | null
      isento: boolean | null
      celular: string | null
      responsavel_fonecelular: string | null
      email: string | null
      responsavel_email: string | null
      familia_id: number | null
    }

    const rows: PreviewRow[] = []
    const porFamilia = new Map<number, AssocRow[]>()

    for (const raw of assocRes.data ?? []) {
      const a = raw as AssocRow
      if (a.isento === true) continue
      const tipoId = a.tipo_mensalidade
      if (!tipoId) continue
      const tipo = tipoMap.get(tipoId)
      if (!tipo) continue
      const valor = Number(tipo.valor ?? 0)
      if (valor <= 0) continue

      const familiaId = a.familia_id
      if (familiaId != null && familiaMap.has(familiaId)) {
        const lista = porFamilia.get(familiaId) ?? []
        lista.push(a)
        porFamilia.set(familiaId, lista)
        continue
      }

      rows.push({
        key: `a-${a.associado_id}`,
        associado_id: a.associado_id,
        familia_id: null,
        nome: a.nome,
        registro: a.registro,
        registro_provisorio: a.registro_provisorio === true,
        ramo: a.ramo,
        tipomensalidade_id: tipoId,
        tipo_nome: tipo.nome,
        plano_conta_id: tipo.plano_conta_id ?? null,
        valor,
        already: existentesAssoc.has(a.associado_id),
        celular: a.celular,
        responsavel_fonecelular: a.responsavel_fonecelular,
        email: a.email,
        responsavel_email: a.responsavel_email,
      })
    }

    for (const [familiaId, membros] of porFamilia) {
      const familia = familiaMap.get(familiaId)
      if (!familia || membros.length === 0) continue

      let valor = 0
      let tipoId: number | null = null
      let planoConta: number | null = null
      const tiposNomes = new Set<string>()
      for (const m of membros) {
        const tipo = tipoMap.get(m.tipo_mensalidade as number)
        if (!tipo) continue
        const v = Number(tipo.valor ?? 0)
        if (v <= 0) continue
        valor += v
        tiposNomes.add(tipo.nome)
        if (tipoId == null) {
          tipoId = tipo.tipomensalidade_id
          planoConta = tipo.plano_conta_id ?? null
        }
      }
      if (valor <= 0) continue

      const titular =
        membros.find(
          (m) => m.associado_id === familia.responsavel_associado_id,
        ) ?? membros[0]

      const nomesMembros = membros.map((m) => m.nome).join(', ')
      rows.push({
        key: `f-${familiaId}`,
        associado_id: titular.associado_id,
        familia_id: familiaId,
        nome: `${familia.nome} (${nomesMembros})`,
        registro: titular.registro,
        registro_provisorio: titular.registro_provisorio === true,
        ramo: titular.ramo,
        tipomensalidade_id: tipoId,
        tipo_nome:
          tiposNomes.size === 1
            ? [...tiposNomes][0]
            : `Família · ${tiposNomes.size} tipos`,
        plano_conta_id: planoConta,
        valor,
        already: existentesFamilia.has(familiaId),
        celular: titular.celular,
        responsavel_fonecelular: titular.responsavel_fonecelular,
        email: titular.email,
        responsavel_email: titular.responsavel_email,
      })
    }

    rows.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
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
    const vencimento = vencimentoCompetencia(competencia, diaVencimento)
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
    setProgressDetail(`0 de ${aGerar.length}`)
    setError(null)

    const payload = aGerar.map((row) => ({
      empresa_id: empresaId,
      associado_id: row.associado_id,
      familia_id: row.familia_id,
      tipomensalidade_id: row.tipomensalidade_id,
      plano_conta_id: row.plano_conta_id,
      receita_origem: RECEITA_ORIGEM.MENSALIDADE,
      receita_descricao: (
        row.familia_id
          ? `Mensalidade ${competencia.slice(5, 7)}/${competencia.slice(0, 4)} — ${row.nome}`
          : `Mensalidade ${competencia.slice(5, 7)}/${competencia.slice(0, 4)} — ${row.tipo_nome}`
      ).slice(0, 120),
      // Conta do grupo: não atribui movimento ao ramo/seção do associado.
      receita_ramo: null,
      receita_secao: null,
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
        setProgressDetail(null)
        setError(
          `Geradas ${inserted} até o erro: ${insertError.message}`,
        )
        void carregarPreview()
        return
      }
      inserted += data?.length ?? chunk.length
      setProgressDetail(`${inserted} de ${payload.length}`)
    }

    setGenerating(false)
    setProgressDetail(null)
    toast.success(
      'Mensalidades geradas',
      `${inserted} receita(s) criada(s) com sucesso.`,
    )

    await oferecerEmail(aGerar, vencimento)

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

  function emailDestino(row: PreviewRow): string | null {
    for (const raw of [row.responsavel_email, row.email]) {
      const email = (raw ?? '').trim().toLowerCase()
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return email
    }
    return null
  }

  async function oferecerEmail(rows: PreviewRow[], vencimento: string) {
    if (!empresaId) return
    const comEmail = rows.filter((row) => emailDestino(row))
    const semEmail = rows.length - comEmail.length
    if (comEmail.length === 0) {
      if (semEmail > 0) {
        toast.info(
          'Sem e-mail',
          'Nenhum associado desta geração tem e-mail do responsável ou do próprio cadastro.',
        )
      }
      return
    }

    const avisoSem =
      semEmail > 0
        ? ` ${semEmail} ficam de fora porque não têm e-mail.`
        : ''
    const enviar = await toast.confirm({
      title: 'Enviar cobrança por e-mail?',
      message: `${comEmail.length} mensalidade(s) serão enviadas de adm@erpescoteiro.com.br.${avisoSem}`,
      confirmLabel: 'Sim, enviar',
      cancelLabel: 'Agora não',
    })
    if (!enviar) return

    const compLabel = formatCompetencia(competenciaToDate(competencia))
    const vencLabel = vencimento.split('-').reverse().join('/')
    setSendingEmail(true)
    setProgressDetail(`0 de ${comEmail.length}`)
    try {
      const resultado = await enviarEmailsMensalidade({
        empresaId,
        itens: comEmail.map((row) => ({
          associado_id: row.associado_id,
          tipo_nome: row.tipo_nome,
          valor: row.valor,
          competencia: compLabel,
          vencimento: vencLabel,
        })),
        onProgress: (feitos, total) => setProgressDetail(`${feitos} de ${total}`),
      })
      const partes = [`${resultado.enviados} e-mail(s) enviado(s).`]
      if (resultado.sem_email.length > 0) {
        partes.push(`${resultado.sem_email.length} sem e-mail.`)
      }
      if (resultado.falhas.length > 0) {
        const exemplo = resultado.falhas[0]
        partes.push(
          `${resultado.falhas.length} falha(s). ${exemplo.nome}: ${exemplo.erro}`,
        )
        toast.error('E-mail', partes.join(' '))
      } else {
        toast.success('E-mail', partes.join(' '))
      }
    } catch (err) {
      toast.error(
        'E-mail',
        err instanceof Error ? err.message : 'Falha ao enviar os e-mails.',
      )
    } finally {
      setSendingEmail(false)
      setProgressDetail(null)
    }
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
      <WaitingOverlay
        open={generating || loading || sendingEmail}
        title={sendingEmail ? 'Enviando e-mails' : generating ? 'Montando movimentos' : 'Aguarde'}
        message={
          sendingEmail
            ? 'Enviando a cobrança das mensalidades. Não feche esta tela.'
            : generating
              ? 'Gerando as mensalidades no financeiro. Não feche esta tela.'
              : 'Montando a prévia dos movimentos de mensalidade…'
        }
        detail={generating || sendingEmail ? progressDetail : null}
      />

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
              <h4>
                {whatsQueue[whatsIndex]?.nome}{' '}
                <RegistroProvisorioBadge
                  provisorio={whatsQueue[whatsIndex]?.registro_provisorio}
                />
              </h4>
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
        <p className="field-hint" style={{ marginTop: '0.35rem' }}>
          Vencimento das mensalidades:{' '}
          <strong>
            {vencimentoCompetencia(competencia, diaVencimento)
              ?.split('-')
              .reverse()
              .join('/') ?? '—'}
          </strong>
          {diaVencimento != null
            ? ` (dia ${diaVencimento})`
            : ' (último dia do mês — configure em Grupo escoteiro)'}
        </p>

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
              {' · '}
              Use <strong>Excluir</strong> para tirar um título desta geração
              (não apaga cadastro; recarregue a prévia para trazê-lo de volta).
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
                    <tr key={row.key}>
                      <td>
                        {row.nome}{' '}
                        {row.familia_id != null ? (
                          <span className="badge">Família</span>
                        ) : null}{' '}
                        <RegistroProvisorioBadge
                          provisorio={row.registro_provisorio}
                        />
                      </td>
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
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '0.35rem',
                          }}
                        >
                          {!row.already ? (
                            <button
                              type="button"
                              className="btn btn-soft"
                              disabled={generating}
                              onClick={() => excluirDaPrevia(row.key)}
                              title="Não gerar este título nesta competência"
                            >
                              Excluir
                            </button>
                          ) : null}
                          {normalizeWhatsAppPhone(phoneOf(row)) ? (
                            <button
                              type="button"
                              className="btn btn-soft"
                              disabled={generating}
                              onClick={() => enviarWhatsLinha(row)}
                            >
                              WhatsApp
                            </button>
                          ) : !row.already ? null : (
                            <span className="muted">—</span>
                          )}
                        </div>
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
