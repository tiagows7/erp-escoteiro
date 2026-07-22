import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import {
  formatCompetencia,
  formatMoney,
  RECEITA_ORIGEM,
  TITULO_SITUACAO,
} from '@/lib/receitas'
import {
  mensagemCobrancaMensalidade,
  normalizeWhatsAppPhone,
  openWhatsApp,
} from '@/lib/whatsapp'

type ReceitaAbertaRow = {
  receita_id: number
  receita_descricao: string | null
  receita_competencia: string | null
  receita_vencimento: string | null
  receita_saldo: number
  associado_id: number | null
  associados: {
    nome: string | null
    registro: number | null
    celular: string | null
    responsavel_fonecelular: string | null
  } | null
}

type AssociadoAberto = {
  associado_id: number
  nome: string
  registro: number | null
  telefone: string | null
  qtd: number
  total: number
  detalhes: string[]
}

type Props = {
  empresaId: number
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

export function StaffMensalidadesAbertasPanel({ empresaId }: Props) {
  const { empresa } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState<AssociadoAberto[]>([])
  const [tituloCount, setTituloCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showLista, setShowLista] = useState(false)
  const [whatsQueue, setWhatsQueue] = useState<AssociadoAberto[]>([])
  const [whatsIndex, setWhatsIndex] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('receitas')
      .select(
        `
        receita_id,
        receita_descricao,
        receita_competencia,
        receita_vencimento,
        receita_saldo,
        associado_id,
        associados (
          nome,
          registro,
          celular,
          responsavel_fonecelular
        )
      `,
      )
      .eq('empresa_id', empresaId)
      .eq('receita_origem', RECEITA_ORIGEM.MENSALIDADE)
      .in('receita_situacao', [
        TITULO_SITUACAO.ABERTO,
        TITULO_SITUACAO.PARCIAL,
      ])
      .gt('receita_saldo', 0)
      .order('receita_vencimento', { ascending: true })
      .limit(5000)

    if (error) {
      setRows([])
      setTituloCount(0)
      setLoading(false)
      return
    }

    const list = (data as unknown as ReceitaAbertaRow[]) ?? []
    setTituloCount(list.length)

    const map = new Map<number, AssociadoAberto>()
    for (const item of list) {
      if (!item.associado_id) continue
      const assoc = item.associados
      const nome = assoc?.nome?.trim() || `Associado #${item.associado_id}`
      const telefone =
        assoc?.responsavel_fonecelular || assoc?.celular || null
      const saldo = Number(item.receita_saldo ?? 0)
      const detalhe = [
        formatCompetencia(item.receita_competencia),
        formatMoney(saldo),
        item.receita_vencimento
          ? `venc. ${formatDate(item.receita_vencimento)}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ')

      const existing = map.get(item.associado_id)
      if (existing) {
        existing.qtd += 1
        existing.total += saldo
        existing.detalhes.push(detalhe)
        if (!existing.telefone && telefone) existing.telefone = telefone
      } else {
        map.set(item.associado_id, {
          associado_id: item.associado_id,
          nome,
          registro: assoc?.registro ?? null,
          telefone,
          qtd: 1,
          total: saldo,
          detalhes: [detalhe],
        })
      }
    }

    const aggregated = Array.from(map.values()).sort((a, b) =>
      a.nome.localeCompare(b.nome, 'pt-BR'),
    )
    setRows(aggregated)
    setLoading(false)
  }, [empresaId])

  useEffect(() => {
    void load()
  }, [load])

  const totalSaldo = useMemo(
    () => rows.reduce((acc, row) => acc + row.total, 0),
    [rows],
  )

  const comWhats = useMemo(
    () => rows.filter((r) => normalizeWhatsAppPhone(r.telefone)),
    [rows],
  )

  function mensagemDaLinha(row: AssociadoAberto): string {
    return mensagemCobrancaMensalidade({
      nomeGrupo: empresa?.nome,
      nomeAssociado: row.nome,
      registro: row.registro,
      qtd: row.qtd,
      total: formatMoney(row.total),
      detalhes: row.detalhes,
    })
  }

  function enviarWhats(row: AssociadoAberto) {
    if (!normalizeWhatsAppPhone(row.telefone)) {
      toast.error(
        'Sem telefone',
        'Cadastre o celular do associado ou do responsável.',
      )
      return
    }
    openWhatsApp({ phone: row.telefone, text: mensagemDaLinha(row) })
  }

  async function iniciarFilaWhats() {
    if (comWhats.length === 0) {
      toast.error(
        'Sem telefone',
        'Nenhum associado com mensalidade em aberto possui celular cadastrado.',
      )
      return
    }
    const ok = await toast.confirm({
      title: 'Enviar cobranças no WhatsApp?',
      message: `${comWhats.length} associado(s) com telefone. Deseja abrir o WhatsApp um a um?`,
      confirmLabel: 'Sim, enviar',
      cancelLabel: 'Cancelar',
    })
    if (!ok) return
    setWhatsQueue(comWhats)
    setWhatsIndex(0)
    setShowLista(true)
  }

  function enviarWhatsAtual() {
    const row = whatsQueue[whatsIndex]
    if (!row) return
    openWhatsApp({ phone: row.telefone, text: mensagemDaLinha(row) })
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

  if (loading) {
    return (
      <section className="panel staff-mensalidades-panel">
        <div className="loading">Carregando mensalidades em aberto…</div>
      </section>
    )
  }

  if (tituloCount === 0) {
    return null
  }

  return (
    <section className="panel staff-mensalidades-panel">
      <div className="passagem-header">
        <div>
          <h3>Mensalidades em aberto</h3>
          <p className="muted">
            Total do grupo — cobrança via WhatsApp para responsáveis/associados.
          </p>
        </div>
      </div>

      <article className="associado-mensalidade-resumo">
        <div>
          <span>Títulos em aberto</span>
          <strong>{tituloCount}</strong>
          <p className="muted">
            {rows.length} associado(s) · Total {formatMoney(totalSaldo)}
          </p>
        </div>
        <div className="associado-mensalidade-resumo-actions">
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => setShowLista((prev) => !prev)}
          >
            {showLista ? 'Ocultar lista' : 'Ver lista'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void iniciarFilaWhats()}
            disabled={comWhats.length === 0}
          >
            WhatsApp ({comWhats.length})
          </button>
        </div>
      </article>

      {whatsQueue.length > 0 ? (
        <article className="associado-mensalidade-item" style={{ marginTop: '0.9rem' }}>
          <div>
            <h4>
              Fila WhatsApp · {whatsIndex + 1}/{whatsQueue.length}
            </h4>
            <p className="muted">{whatsQueue[whatsIndex]?.nome}</p>
            <p className="muted">
              {whatsQueue[whatsIndex]?.qtd} título(s) ·{' '}
              {formatMoney(whatsQueue[whatsIndex]?.total)} · Tel.{' '}
              {whatsQueue[whatsIndex]?.telefone || '—'}
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
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => {
                setWhatsQueue([])
                setWhatsIndex(0)
              }}
            >
              Encerrar
            </button>
          </div>
        </article>
      ) : null}

      {showLista ? (
        <div className="associado-mensalidades-lista">
          {rows.map((row) => (
            <article key={row.associado_id} className="associado-mensalidade-item">
              <div>
                <h4>{row.nome}</h4>
                <p className="muted">
                  Reg. {row.registro ?? '—'} · {row.qtd} mensalidade(s) ·{' '}
                  {formatMoney(row.total)}
                </p>
                <p className="muted">Tel. {row.telefone || 'não cadastrado'}</p>
              </div>
              {normalizeWhatsAppPhone(row.telefone) ? (
                <button
                  type="button"
                  className="btn btn-accent"
                  onClick={() => enviarWhats(row)}
                >
                  WhatsApp
                </button>
              ) : (
                <span className="muted">Sem telefone</span>
              )}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  )
}
