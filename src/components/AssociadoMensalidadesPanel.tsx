import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  formatCompetencia,
  formatMoney,
  RECEITA_ORIGEM,
  TITULO_SITUACAO,
} from '@/lib/receitas'
import type { MensalidadeAberta } from '@/lib/mensalidadePagamento'
import { PixSicrediCheckoutModal } from '@/components/PixSicrediCheckoutModal'
import type { PixCreateInput } from '@/lib/pixSicredi'

type Props = {
  empresaId: number
  registro: string
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

export function AssociadoMensalidadesPanel({ empresaId, registro }: Props) {
  const [items, setItems] = useState<MensalidadeAberta[]>([])
  const [associadoId, setAssociadoId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showLista, setShowLista] = useState(false)
  const [pixInput, setPixInput] = useState<PixCreateInput | null>(null)
  const [pixTitle, setPixTitle] = useState('Pagar com PIX Sicredi')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const registroNum = Number(String(registro).replace(/\D/g, ''))
    if (!Number.isFinite(registroNum) || registroNum <= 0) {
      setAssociadoId(null)
      setItems([])
      setLoading(false)
      return
    }

    const { data: assoc, error: assocError } = await supabase
      .from('associados')
      .select('associado_id')
      .eq('empresa_id', empresaId)
      .eq('registro', registroNum)
      .maybeSingle()

    if (assocError) {
      setError(assocError.message)
      setAssociadoId(null)
      setItems([])
      setLoading(false)
      return
    }

    if (!assoc?.associado_id) {
      setAssociadoId(null)
      setItems([])
      setLoading(false)
      return
    }

    setAssociadoId(assoc.associado_id as number)

    const { data, error: recError } = await supabase
      .from('receitas')
      .select(
        'receita_id, receita_descricao, receita_competencia, receita_vencimento, receita_valor, receita_saldo',
      )
      .eq('empresa_id', empresaId)
      .eq('associado_id', assoc.associado_id)
      .eq('receita_origem', RECEITA_ORIGEM.MENSALIDADE)
      .in('receita_situacao', [
        TITULO_SITUACAO.ABERTO,
        TITULO_SITUACAO.PARCIAL,
      ])
      .gt('receita_saldo', 0)
      .order('receita_vencimento', { ascending: true })

    if (recError) {
      setError(recError.message)
      setItems([])
      setLoading(false)
      return
    }

    setItems(
      ((data ?? []) as MensalidadeAberta[]).map((row) => ({
        ...row,
        receita_valor: Number(row.receita_valor ?? 0),
        receita_saldo: Number(row.receita_saldo ?? 0),
      })),
    )
    setLoading(false)
  }, [empresaId, registro])

  useEffect(() => {
    void load()
  }, [load])

  const totalSaldo = useMemo(
    () => items.reduce((acc, row) => acc + row.receita_saldo, 0),
    [items],
  )

  function pagarUma(item: MensalidadeAberta) {
    setPixTitle(`Mensalidade ${formatCompetencia(item.receita_competencia)}`)
    setPixInput({
      empresaId,
      tipo: 'mensalidade',
      valor: item.receita_saldo,
      descricao:
        item.receita_descricao?.trim() ||
        `Mensalidade ${formatCompetencia(item.receita_competencia)}`,
      associadoId,
      receitaIds: [item.receita_id],
    })
  }

  function pagarTodas() {
    if (items.length === 0) return
    setPixTitle(
      items.length === 1
        ? `Mensalidade ${formatCompetencia(items[0].receita_competencia)}`
        : `${items.length} mensalidades em aberto`,
    )
    setPixInput({
      empresaId,
      tipo: items.length === 1 ? 'mensalidade' : 'mensalidade_lote',
      valor: totalSaldo,
      descricao:
        items.length === 1
          ? items[0].receita_descricao?.trim() ||
            `Mensalidade ${formatCompetencia(items[0].receita_competencia)}`
          : `Mensalidades em aberto (${items.length})`,
      associadoId,
      receitaIds: items.map((i) => i.receita_id),
    })
  }

  if (loading || error || items.length === 0) {
    return null
  }

  return (
    <>
      <section className="panel associado-mensalidades-panel">
        <div className="passagem-header">
          <div>
            <h3>Mensalidades em aberto</h3>
            <p className="muted">
              Pague via PIX Sicredi. A baixa só ocorre após confirmação do banco.
            </p>
          </div>
        </div>

        <article className="associado-mensalidade-resumo">
          <div>
            <span>Em aberto</span>
            <strong>{items.length}</strong>
            <p className="muted">Total {formatMoney(totalSaldo)}</p>
          </div>
          <div className="associado-mensalidade-resumo-actions">
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => setShowLista((prev) => !prev)}
            >
              {showLista ? 'Ocultar' : 'Ver detalhes'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => pagarTodas()}
            >
              Pagar
            </button>
          </div>
        </article>

        {showLista ? (
          <div className="associado-mensalidades-lista">
            {items.map((item) => (
              <article
                key={item.receita_id}
                className="associado-mensalidade-item"
              >
                <div>
                  <h4>
                    {item.receita_descricao?.trim() ||
                      `Mensalidade ${formatCompetencia(item.receita_competencia)}`}
                  </h4>
                  <p className="muted">
                    Competência {formatCompetencia(item.receita_competencia)} ·
                    Venc. {formatDate(item.receita_vencimento)}
                  </p>
                  <p className="associado-atividade-valor">
                    {formatMoney(item.receita_saldo)}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-accent"
                  onClick={() => pagarUma(item)}
                >
                  Pagar
                </button>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <PixSicrediCheckoutModal
        open={!!pixInput}
        title={pixTitle}
        input={pixInput}
        onClose={() => setPixInput(null)}
        onPaid={() => {
          void load()
        }}
      />
    </>
  )
}
