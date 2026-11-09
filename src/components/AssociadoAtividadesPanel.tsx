import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { formatMoney } from '@/lib/despesas'
import {
  cancelarConfirmacaoAtividade,
  carregarAcompanhantesAtividade,
  confirmarParticipacaoAtividade,
  type AcompanhanteInput,
} from '@/lib/atividadeConfirmacao'
import {
  atividadeVisivelPara,
  labelAtividadeEscopo,
  type AssociadoAtividadeCtx,
} from '@/lib/atividadeVisibilidade'
import { PixSicrediCheckoutModal } from '@/components/PixSicrediCheckoutModal'
import {
  empresaTemChavePixInformada,
  type PixCreateInput,
} from '@/lib/pixSicredi'
import { loadPixPendingForEmpresa } from '@/lib/pixSicrediPending'
import type { Atividade } from '@/types/database'

type AssociadoCtx = AssociadoAtividadeCtx & {
  associado_id: number
}

export type AtividadeCardItem = Atividade & {
  confirmado: boolean
  pago: boolean
  confirmacao_id: number | null
  pagamento_id: number | null
}

type ConfirmModalState = {
  item: AtividadeCardItem
  mode: 'confirmar' | 'editar'
}

type Props = {
  empresaId: number
  registro: string
}

function emptyAcompanhante(): AcompanhanteInput {
  return { nome: '', cpf: '' }
}

export function AssociadoAtividadesPanel({ empresaId, registro }: Props) {
  const toast = useToast()
  const [associado, setAssociado] = useState<AssociadoCtx | null>(null)
  const [items, setItems] = useState<AtividadeCardItem[]>([])
  const [ramoMap, setRamoMap] = useState<Map<number, string>>(() => new Map())
  const [secaoMap, setSecaoMap] = useState<Map<number, string>>(() => new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [pixInput, setPixInput] = useState<PixCreateInput | null>(null)
  const [pixTitle, setPixTitle] = useState('Pagar atividade com PIX Sicredi')
  const [showLista, setShowLista] = useState(false)
  const [podePagarPix, setPodePagarPix] = useState(false)
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(
    null,
  )
  const [acompanhantes, setAcompanhantes] = useState<AcompanhanteInput[]>([
    emptyAcompanhante(),
  ])
  const [modalBusy, setModalBusy] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    const quiet = opts?.quiet === true
    if (!quiet) setLoading(true)
    setError(null)

    const registroNum = Number(String(registro).replace(/\D/g, ''))
    if (!Number.isFinite(registroNum) || registroNum <= 0) {
      setAssociado(null)
      setItems([])
      setPodePagarPix(false)
      if (!quiet) setLoading(false)
      return
    }

    const [{ data: assoc, error: assocError }, temPix] = await Promise.all([
      supabase
        .from('associados')
        .select('associado_id, ramo, secao, patrulha_matilha')
        .eq('empresa_id', empresaId)
        .eq('registro', registroNum)
        .maybeSingle(),
      empresaTemChavePixInformada(empresaId),
    ])

    setPodePagarPix(temPix)

    if (assocError) {
      setError(assocError.message)
      setAssociado(null)
      setItems([])
      if (!quiet) setLoading(false)
      return
    }

    if (!assoc?.associado_id) {
      setAssociado(null)
      setItems([])
      if (!quiet) setLoading(false)
      return
    }

    const assocCtx = assoc as AssociadoCtx
    setAssociado(assocCtx)

    const [ativRes, confRes, pagRes, ramosRes, secoesRes] = await Promise.all([
      supabase
        .from('atividades')
        .select(
          'atividade_id, empresa_id, ramo, secao, patrulha_matilha, descricao, local, valor, tem_transporte, created_at',
        )
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false }),
      supabase
        .from('atividade_confirmacao')
        .select('confirmacao_id, atividade_id')
        .eq('empresa_id', empresaId)
        .eq('associado_id', assocCtx.associado_id),
      supabase
        .from('atividade_pagamento')
        .select('pagamento_id, atividade_id')
        .eq('empresa_id', empresaId)
        .eq('associado_id', assocCtx.associado_id),
      supabase.from('ramos').select('ramo_id, nome').order('ramo_id'),
      supabase
        .from('secao')
        .select('secao_id, nome')
        .eq('empresa_id', empresaId)
        .order('nome', { ascending: true }),
    ])

    if (ativRes.error || confRes.error || pagRes.error) {
      setError(
        ativRes.error?.message ??
          confRes.error?.message ??
          pagRes.error?.message ??
          'Erro ao carregar atividades',
      )
      setItems([])
      if (!quiet) setLoading(false)
      return
    }

    setRamoMap(
      new Map(
        (ramosRes.data ?? []).map((r) => [
          r.ramo_id as number,
          r.nome as string,
        ]),
      ),
    )
    setSecaoMap(
      new Map(
        (secoesRes.data ?? []).map((s) => [
          s.secao_id as number,
          s.nome as string,
        ]),
      ),
    )

    const confMap = new Map(
      (
        (confRes.data ?? []) as {
          confirmacao_id: number
          atividade_id: number
        }[]
      ).map((c) => [c.atividade_id, c.confirmacao_id]),
    )
    const pagMap = new Map(
      (
        (pagRes.data ?? []) as {
          pagamento_id: number
          atividade_id: number
        }[]
      ).map((p) => [p.atividade_id, p.pagamento_id]),
    )

    const cards = ((ativRes.data as Atividade[]) ?? [])
      .filter((a) => atividadeVisivelPara(a, assocCtx))
      .map((a) => ({
        ...a,
        confirmado: confMap.has(a.atividade_id),
        pago: pagMap.has(a.atividade_id),
        confirmacao_id: confMap.get(a.atividade_id) ?? null,
        pagamento_id: pagMap.get(a.atividade_id) ?? null,
      }))

    setItems(cards)
    if (!quiet) setLoading(false)
  }, [empresaId, registro])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const pending = loadPixPendingForEmpresa(empresaId, ['atividade'])
    if (!pending) return
    setPixTitle(pending.title)
    setPixInput(pending.input)
  }, [empresaId])

  function fecharConfirmModal() {
    if (modalBusy) return
    setConfirmModal(null)
    setModalError(null)
    setAcompanhantes([emptyAcompanhante()])
  }

  async function abrirConfirmModal(
    item: AtividadeCardItem,
    mode: 'confirmar' | 'editar',
  ) {
    setModalError(null)
    setAcompanhantes([emptyAcompanhante()])
    setConfirmModal({ item, mode })

    if (mode === 'editar' && item.confirmacao_id != null) {
      try {
        const rows = await carregarAcompanhantesAtividade(
          empresaId,
          item.confirmacao_id,
        )
        setAcompanhantes(rows.length > 0 ? rows : [emptyAcompanhante()])
      } catch (err) {
        setModalError(
          err instanceof Error ? err.message : 'Erro ao carregar familiares.',
        )
      }
    }
  }

  async function confirmarParticipacaoSimples(item: AtividadeCardItem) {
    if (!associado || item.confirmado) return
    setBusyId(item.atividade_id)
    const result = await confirmarParticipacaoAtividade(item.atividade_id)
    setBusyId(null)

    if (!result.ok) {
      toast.error('Não foi possível confirmar', result.mensagem)
      return
    }
    toast.success('Participação confirmada')
    await load()
  }

  async function onClickConfirmar(item: AtividadeCardItem) {
    if (!associado || item.confirmado) return
    if (item.tem_transporte) {
      await abrirConfirmModal(item, 'confirmar')
      return
    }
    await confirmarParticipacaoSimples(item)
  }

  async function salvarConfirmacaoComTransporte() {
    if (!associado || !confirmModal) return
    const { item } = confirmModal
    setModalBusy(true)
    setModalError(null)

    const result = await confirmarParticipacaoAtividade(item.atividade_id, {
      acompanhantes,
    })
    setModalBusy(false)

    if (!result.ok) {
      setModalError(result.mensagem)
      return
    }

    toast.success(
      confirmModal.mode === 'editar'
        ? 'Lista de transporte atualizada'
        : 'Participação confirmada',
    )
    setConfirmModal(null)
    await load({ quiet: true })
  }

  function confirmarPagamento(item: AtividadeCardItem) {
    if (!associado || !item.confirmado || item.pago) return
    const valor = Number(item.valor ?? 0)
    if (!(valor > 0)) {
      toast.error('Atividade sem valor', 'Não há valor a pagar nesta atividade.')
      return
    }
    setPixTitle(item.descricao)
    setPixInput({
      empresaId,
      tipo: 'atividade',
      valor,
      descricao: `Atividade: ${item.descricao}`,
      associadoId: associado.associado_id,
      atividadeId: item.atividade_id,
    })
  }

  async function cancelarConfirmacao(item: AtividadeCardItem) {
    if (!associado || !item.confirmado) return

    const ok = await toast.confirm({
      title: 'Cancelar confirmação?',
      message: item.pago
        ? 'Isso também remove o pagamento, a conta a receber e o recebimento PIX.'
        : 'A participação nesta atividade será desfeita.',
      confirmLabel: 'Cancelar confirmação',
      cancelLabel: 'Manter',
      danger: true,
    })
    if (!ok) return

    setBusyId(item.atividade_id)
    const result = await cancelarConfirmacaoAtividade(item.atividade_id)
    setBusyId(null)

    if (!result.ok) {
      toast.error('Não foi possível cancelar', result.mensagem)
      return
    }

    toast.success('Confirmação cancelada')
    await load()
  }

  const showPanel =
    !loading && !error && !!associado && items.length > 0
  const totalValor = items.reduce((acc, item) => acc + Number(item.valor ?? 0), 0)

  return (
    <>
    {showPanel ? (
    <section className="panel associado-atividades-panel">
      <div className="passagem-header">
        <div>
          <h3>Minhas atividades</h3>
          <p className="muted">
            Confirme a participação e pague via PIX Sicredi (baixa após
            confirmação do banco).
          </p>
        </div>
      </div>

      <article className="associado-mensalidade-resumo">
        <div>
          <span>Atividades</span>
          <strong>{items.length}</strong>
          <p className="muted">Total {formatMoney(totalValor)}</p>
        </div>
        <div className="associado-mensalidade-resumo-actions">
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => setShowLista((prev) => !prev)}
          >
            {showLista ? 'Ocultar lista' : 'Ver lista'}
          </button>
        </div>
      </article>

      {showLista ? (
      <div className="associado-atividades-grid" style={{ marginTop: '0.9rem' }}>
        {items.map((item) => (
          <article key={item.atividade_id} className="associado-atividade-card">
            <h4>{item.descricao}</h4>
            <p className="associado-atividade-escopo">
              {labelAtividadeEscopo(item, ramoMap, secaoMap)}
            </p>
            <p className="associado-atividade-meta">
              {item.local ? `Local: ${item.local}` : 'Local não informado'}
              {item.tem_transporte ? ' · Com transporte' : ''}
            </p>
            <p className="associado-atividade-valor">
              {formatMoney(item.valor)}
            </p>

            <div className="associado-atividade-actions">
              <Link
                className="btn btn-soft"
                to={`/atividades/${item.atividade_id}/contas`}
              >
                Contas
              </Link>
              {!item.confirmado ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busyId === item.atividade_id}
                  onClick={() => void onClickConfirmar(item)}
                >
                  {busyId === item.atividade_id
                    ? 'Confirmando…'
                    : 'Confirmar participação'}
                </button>
              ) : (
                <>
                  <span className="associado-atividade-status is-ok">
                    Participação confirmada
                  </span>
                  {item.tem_transporte ? (
                    <button
                      type="button"
                      className="btn btn-soft"
                      onClick={() => void abrirConfirmModal(item, 'editar')}
                    >
                      Familiares no transporte
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-soft"
                    disabled={busyId === item.atividade_id}
                    onClick={() => void cancelarConfirmacao(item)}
                  >
                    {busyId === item.atividade_id
                      ? 'Cancelando…'
                      : 'Cancelar confirmação'}
                  </button>
                </>
              )}

              {podePagarPix && item.confirmado && !item.pago ? (
                <button
                  type="button"
                  className="btn btn-accent"
                  disabled={busyId === item.atividade_id}
                  onClick={() => confirmarPagamento(item)}
                >
                  Pagar
                </button>
              ) : null}

              {item.pago ? (
                <span className="associado-atividade-status is-paid">
                  Pagamento confirmado
                </span>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      ) : null}
    </section>
    ) : null}

    {confirmModal ? (
      <div
        className="confirm-overlay"
        role="presentation"
        onClick={fecharConfirmModal}
      >
        <div
          className="passagem-dialog atividade-transporte-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="atividade-transporte-title"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="passagem-dialog-header">
            <div>
              <h3 id="atividade-transporte-title">
                {confirmModal.mode === 'editar'
                  ? 'Familiares no transporte'
                  : 'Confirmar participação'}
              </h3>
              <p className="muted">{confirmModal.item.descricao}</p>
            </div>
            <button
              type="button"
              className="btn btn-soft"
              onClick={fecharConfirmModal}
              disabled={modalBusy}
            >
              Fechar
            </button>
          </header>

          <p className="muted" style={{ marginTop: 0 }}>
            O CPF do jovem sai do cadastro de associados. Se for o caso,
            informe nome e CPF de outras pessoas da família que vão no
            transporte.
          </p>

          <div className="atividade-acompanhantes-block">
            <div className="atividade-acompanhantes-head">
              <strong>Pessoas da família</strong>
              <button
                type="button"
                className="btn btn-soft"
                disabled={modalBusy}
                onClick={() =>
                  setAcompanhantes((prev) => [...prev, emptyAcompanhante()])
                }
              >
                Adicionar pessoa
              </button>
            </div>

            {acompanhantes.map((row, index) => (
              <div key={index} className="atividade-acompanhante-row">
                <div className="field">
                  <label htmlFor={`acomp-nome-${index}`}>Nome</label>
                  <input
                    id={`acomp-nome-${index}`}
                    className="input"
                    value={row.nome}
                    onChange={(e) => {
                      const value = e.target.value
                      setAcompanhantes((prev) =>
                        prev.map((item, i) =>
                          i === index ? { ...item, nome: value } : item,
                        ),
                      )
                    }}
                    maxLength={120}
                    disabled={modalBusy}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`acomp-cpf-${index}`}>CPF</label>
                  <input
                    id={`acomp-cpf-${index}`}
                    className="input"
                    value={row.cpf}
                    onChange={(e) => {
                      const value = e.target.value
                      setAcompanhantes((prev) =>
                        prev.map((item, i) =>
                          i === index ? { ...item, cpf: value } : item,
                        ),
                      )
                    }}
                    inputMode="numeric"
                    maxLength={15}
                    placeholder="000.000.000-00"
                    disabled={modalBusy}
                  />
                </div>
                {acompanhantes.length > 1 ? (
                  <button
                    type="button"
                    className="btn btn-soft"
                    disabled={modalBusy}
                    onClick={() =>
                      setAcompanhantes((prev) =>
                        prev.filter((_, i) => i !== index),
                      )
                    }
                  >
                    Remover
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          {modalError ? (
            <p className="muted" style={{ color: 'var(--danger, #b42318)' }}>
              {modalError}
            </p>
          ) : null}

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={modalBusy}
              onClick={() => void salvarConfirmacaoComTransporte()}
            >
              {modalBusy
                ? 'Salvando…'
                : confirmModal.mode === 'editar'
                  ? 'Salvar lista'
                  : 'Confirmar participação'}
            </button>
            <button
              type="button"
              className="btn btn-soft"
              disabled={modalBusy}
              onClick={fecharConfirmModal}
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    ) : null}

    <PixSicrediCheckoutModal
      open={!!pixInput}
      title={pixTitle}
      input={pixInput}
      onClose={() => setPixInput(null)}
      onPaid={() => {
        void load({ quiet: true })
      }}
    />
    </>
  )
}
