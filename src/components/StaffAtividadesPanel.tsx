import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { formatMoney } from '@/lib/despesas'
import { registrarPagamentoAtividade } from '@/lib/atividadePagamento'
import {
  atividadeVisivelPara,
  filtroAtividadesRamoOuGrupo,
  type AssociadoAtividadeCtx,
} from '@/lib/atividadeVisibilidade'
import type { Atividade } from '@/types/database'

type AssociadoRow = AssociadoAtividadeCtx & {
  associado_id: number
  nome: string
}

type Pessoa = {
  associado_id: number
  nome: string
}

type AtividadeResumo = Atividade & {
  confirmados: Pessoa[]
  pagantes: Pessoa[]
  totalArrecadado: number
}

type PopupPessoa = AssociadoRow & {
  confirmado: boolean
  pago: boolean
}

type PopupMode = 'confirmados' | 'associados'

type Props = {
  empresaId: number
  /** Quando informado, filtra atividades deste ramo. */
  codigoRamo: number | null
}

export function StaffAtividadesPanel({ empresaId, codigoRamo }: Props) {
  const toast = useToast()
  const [items, setItems] = useState<AtividadeResumo[]>([])
  const [associados, setAssociados] = useState<AssociadoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [popupAtividadeId, setPopupAtividadeId] = useState<number | null>(null)
  const [popupMode, setPopupMode] = useState<PopupMode | null>(null)
  const [showLista, setShowLista] = useState(false)
  const [busca, setBusca] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    let ativQuery = supabase
      .from('atividades')
      .select(
        'atividade_id, empresa_id, ramo, secao, patrulha_matilha, descricao, local, valor, created_at',
      )
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false })

    // Com ramo no perfil: atividades do ramo + do grupo todo (sem ramo).
    // Sem ramo (e-mail admin/tesoureiro etc.): todas as atividades, inclusive as do grupo.
    if (codigoRamo != null && codigoRamo >= 1 && codigoRamo <= 5) {
      ativQuery = ativQuery.or(filtroAtividadesRamoOuGrupo(codigoRamo))
    }

    const [ativRes, confRes, pagRes, assocRes] = await Promise.all([
      ativQuery,
      supabase
        .from('atividade_confirmacao')
        .select('atividade_id, associado_id')
        .eq('empresa_id', empresaId),
      supabase
        .from('atividade_pagamento')
        .select('atividade_id, associado_id, valor')
        .eq('empresa_id', empresaId),
      supabase
        .from('associados')
        .select('associado_id, nome, ramo, secao, patrulha_matilha')
        .eq('empresa_id', empresaId)
        .eq('ativo', true)
        .order('nome', { ascending: true }),
    ])

    if (ativRes.error || confRes.error || pagRes.error || assocRes.error) {
      setError(
        ativRes.error?.message ??
          confRes.error?.message ??
          pagRes.error?.message ??
          assocRes.error?.message ??
          'Erro ao carregar atividades',
      )
      setItems([])
      setAssociados([])
      setLoading(false)
      return
    }

    const assocList = ((assocRes.data ?? []) as AssociadoRow[]).map((a) => ({
      associado_id: a.associado_id,
      nome: a.nome,
      ramo: a.ramo ?? null,
      secao: a.secao ?? null,
      patrulha_matilha: a.patrulha_matilha ?? null,
    }))
    setAssociados(assocList)

    const nomeById = new Map(assocList.map((a) => [a.associado_id, a.nome]))

    type ConfRow = { atividade_id: number; associado_id: number }
    type PagRow = { atividade_id: number; associado_id: number; valor: number }

    const confByAtiv = new Map<number, Pessoa[]>()
    for (const row of (confRes.data ?? []) as ConfRow[]) {
      const list = confByAtiv.get(row.atividade_id) ?? []
      list.push({
        associado_id: row.associado_id,
        nome: nomeById.get(row.associado_id) ?? `Associado #${row.associado_id}`,
      })
      confByAtiv.set(row.atividade_id, list)
    }

    const pagByAtiv = new Map<number, { pessoas: Pessoa[]; total: number }>()
    for (const row of (pagRes.data ?? []) as PagRow[]) {
      const cur = pagByAtiv.get(row.atividade_id) ?? {
        pessoas: [],
        total: 0,
      }
      cur.pessoas.push({
        associado_id: row.associado_id,
        nome: nomeById.get(row.associado_id) ?? `Associado #${row.associado_id}`,
      })
      cur.total += Number(row.valor ?? 0)
      pagByAtiv.set(row.atividade_id, cur)
    }

    const atividades = (ativRes.data as Atividade[]) ?? []
    setItems(
      atividades.map((a) => {
        const pag = pagByAtiv.get(a.atividade_id)
        return {
          ...a,
          confirmados: confByAtiv.get(a.atividade_id) ?? [],
          pagantes: pag?.pessoas ?? [],
          totalArrecadado: pag?.total ?? 0,
        }
      }),
    )
    setLoading(false)
  }, [empresaId, codigoRamo])

  useEffect(() => {
    void load()
  }, [load])

  const popupItem = useMemo(
    () => items.find((item) => item.atividade_id === popupAtividadeId) ?? null,
    [items, popupAtividadeId],
  )

  const popupPessoas = useMemo((): PopupPessoa[] => {
    if (!popupItem || !popupMode) return []
    const pagoIds = new Set(popupItem.pagantes.map((p) => p.associado_id))
    const confIds = new Set(popupItem.confirmados.map((p) => p.associado_id))

    if (popupMode === 'confirmados') {
      return popupItem.confirmados
        .map((p) => ({
          associado_id: p.associado_id,
          nome: p.nome,
          ramo: null,
          secao: null,
          patrulha_matilha: null,
          confirmado: true,
          pago: pagoIds.has(p.associado_id),
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    }

    return associados
      .filter((a) => atividadeVisivelPara(popupItem, a))
      .map((a) => ({
        ...a,
        confirmado: confIds.has(a.associado_id),
        pago: pagoIds.has(a.associado_id),
      }))
  }, [popupItem, popupMode, associados])

  const popupPessoasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return popupPessoas
    return popupPessoas.filter((p) => p.nome.toLowerCase().includes(q))
  }, [popupPessoas, busca])

  const temRamo = codigoRamo != null && codigoRamo >= 1 && codigoRamo <= 5

  const totalArrecadadoGeral = useMemo(
    () => items.reduce((acc, item) => acc + item.totalArrecadado, 0),
    [items],
  )

  function abrirPopup(item: AtividadeResumo, mode: PopupMode) {
    setBusca('')
    setPopupAtividadeId(item.atividade_id)
    setPopupMode(mode)
  }

  function fecharPopup() {
    setPopupAtividadeId(null)
    setPopupMode(null)
    setBusca('')
    setBusyId(null)
  }

  async function confirmarPresenca(pessoa: PopupPessoa) {
    if (!popupItem || pessoa.confirmado) return
    setBusyId(pessoa.associado_id)
    const { error: insertError } = await supabase
      .from('atividade_confirmacao')
      .insert({
        empresa_id: empresaId,
        atividade_id: popupItem.atividade_id,
        associado_id: pessoa.associado_id,
      })
    setBusyId(null)

    if (insertError) {
      toast.error('Não foi possível confirmar', insertError.message)
      return
    }
    toast.success('Presença confirmada', pessoa.nome)
    await load()
  }

  async function baixarPix(pessoa: PopupPessoa) {
    if (!popupItem || !pessoa.confirmado || pessoa.pago) return
    const valor = Number(popupItem.valor ?? 0)
    if (!(valor > 0)) {
      toast.error('Atividade sem valor', 'Não há valor a pagar nesta atividade.')
      return
    }

    const ok = await toast.confirm({
      title: 'Baixar pagamento PIX?',
      message: `${pessoa.nome} · ${formatMoney(valor)} — registro direto no documento PIX.`,
      confirmLabel: 'Baixar PIX',
      cancelLabel: 'Cancelar',
    })
    if (!ok) return

    setBusyId(pessoa.associado_id)
    const result = await registrarPagamentoAtividade({
      empresaId,
      associadoId: pessoa.associado_id,
      atividade: popupItem,
    })
    setBusyId(null)

    if (!result.ok) {
      toast.error('Não foi possível baixar', result.error)
      return
    }
    toast.success('Pagamento baixado', `${pessoa.nome} · PIX`)
    await load()
  }

  if (loading) {
    return (
      <section className="panel staff-atividades-panel">
        <div className="loading">
          {temRamo
            ? 'Carregando atividades do ramo…'
            : 'Carregando atividades…'}
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="panel staff-atividades-panel">
        <p className="muted">{error}</p>
      </section>
    )
  }

  if (items.length === 0) {
    return null
  }

  const isAssociadosMode = popupMode === 'associados'

  return (
    <section className="panel staff-atividades-panel">
      <div className="passagem-header">
        <div>
          <h3>{temRamo ? 'Atividades do ramo' : 'Atividades'}</h3>
          <p className="muted">
            {temRamo
              ? 'Inclui atividades do ramo e as do grupo todo (sem ramo).'
              : 'Atividades do grupo, inclusive as sem ramo específico.'}
          </p>
        </div>
      </div>

      <article className="associado-mensalidade-resumo">
        <div>
          <span>Atividades</span>
          <strong>{items.length}</strong>
          <p className="muted">
            Arrecadado {formatMoney(totalArrecadadoGeral)}
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
        </div>
      </article>

      {showLista ? (
        <div className="staff-atividades-list" style={{ marginTop: '0.9rem' }}>
          {items.map((item) => (
            <article key={item.atividade_id} className="staff-atividade-card">
              <header className="staff-atividade-head">
                <div>
                  <h4>{item.descricao}</h4>
                  <p className="staff-atividade-meta">
                    {item.ramo == null ? 'Grupo todo · ' : ''}
                    {item.local ? `Local: ${item.local}` : 'Local não informado'}
                    {' · '}
                    Valor unitário: {formatMoney(item.valor)}
                  </p>
                </div>
                <div className="staff-atividade-total">
                  <span>Arrecadado</span>
                  <strong>{formatMoney(item.totalArrecadado)}</strong>
                </div>
              </header>

              <div className="staff-atividade-actions">
                <button
                  type="button"
                  className="btn btn-soft"
                  onClick={() => abrirPopup(item, 'confirmados')}
                >
                  Confirmados e pagos ({item.confirmados.length}/
                  {item.pagantes.length})
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => abrirPopup(item, 'associados')}
                >
                  Associados
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {popupItem && popupMode ? (
        <div
          className="confirm-overlay"
          role="presentation"
          onClick={fecharPopup}
        >
          <div
            className="passagem-dialog staff-atividade-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-atividade-popup-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="passagem-dialog-header">
              <div>
                <h3 id="staff-atividade-popup-title">{popupItem.descricao}</h3>
                <p className="muted">
                  {isAssociadosMode
                    ? 'Confirme presença e baixe o pagamento em PIX'
                    : 'Somente quem já confirmou presença'}
                  {' · '}
                  {popupItem.confirmados.length} confirmado(s) ·{' '}
                  {popupItem.pagantes.length} pago(s) · Arrecadado{' '}
                  {formatMoney(popupItem.totalArrecadado)}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-soft"
                onClick={fecharPopup}
              >
                Fechar
              </button>
            </header>

            {isAssociadosMode ? (
              <label className="staff-atividade-busca">
                <input
                  type="search"
                  className="input"
                  placeholder="Buscar associado…"
                  aria-label="Buscar associado"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </label>
            ) : null}

            <div className="staff-atividade-legenda">
              <span className="staff-pessoa-chip is-confirmado">Confirmou</span>
              <span className="staff-pessoa-chip is-pago">Já pagou</span>
            </div>

            {popupPessoas.length === 0 ? (
              <div className="empty">
                {isAssociadosMode
                  ? 'Nenhum associado elegível para esta atividade.'
                  : 'Nenhum associado confirmou presença ainda.'}
              </div>
            ) : popupPessoasFiltradas.length === 0 ? (
              <div className="empty">Nenhum associado encontrado na busca.</div>
            ) : (
              <ul className="staff-atividade-popup-list">
                {popupPessoasFiltradas.map((p) => (
                  <li
                    key={p.associado_id}
                    className={[
                      'staff-pessoa-item',
                      p.confirmado ? 'is-confirmado' : '',
                      p.pago ? 'is-pago' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <div className="staff-pessoa-info">
                      <span className="staff-pessoa-nome">{p.nome}</span>
                      <span className="staff-pessoa-tags">
                        {p.confirmado ? (
                          <span className="staff-pessoa-chip is-confirmado">
                            Confirmou
                          </span>
                        ) : null}
                        {p.pago ? (
                          <span className="staff-pessoa-chip is-pago">
                            Pagou
                          </span>
                        ) : null}
                      </span>
                    </div>
                    {isAssociadosMode ? (
                      <div className="staff-pessoa-actions">
                        {!p.confirmado ? (
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={busyId === p.associado_id}
                            onClick={() => void confirmarPresenca(p)}
                          >
                            {busyId === p.associado_id
                              ? 'Confirmando…'
                              : 'Confirmar presença'}
                          </button>
                        ) : null}
                        {p.confirmado && !p.pago ? (
                          <button
                            type="button"
                            className="btn btn-accent"
                            disabled={busyId === p.associado_id}
                            onClick={() => void baixarPix(p)}
                          >
                            {busyId === p.associado_id
                              ? 'Baixando…'
                              : 'Baixar PIX'}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}
