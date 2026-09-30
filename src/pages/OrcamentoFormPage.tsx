import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AlertMessage } from '@/components/AlertMessage'
import { WaitingOverlay } from '@/components/WaitingOverlay'
import { useToast } from '@/contexts/ToastContext'
import {
  formatMoney,
  formatMoneyInput,
  maskMoneyInput,
  parseMoneyInput,
} from '@/lib/despesas'
import { staffRamoScope } from '@/lib/roles'
import type { Ramo } from '@/types/database'

type Secao = { secao_id: number; nome: string; ramo: number | null }
type Patrulha = {
  secaonome_id: number
  nome: string
  ramo: number | null
  secao: number | null
}

type ItemForm = {
  key: string
  descricao: string
  quantidade: string
  unidade: string
  valor: string
}

function novoItem(): ItemForm {
  return {
    key: crypto.randomUUID(),
    descricao: '',
    quantidade: '1',
    unidade: 'un',
    valor: '0,00',
  }
}

function parseQuantidade(value: string) {
  const n = Number(value.trim().replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function numOrNull(value: string) {
  if (!value) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function unidadeLabel(ramoId: number | null) {
  if (ramoId === 1) return 'Matilha'
  if (ramoId === 4) return 'Clã'
  return 'Patrulha'
}

export function OrcamentoFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const routeId = isNew ? null : Number(id)
  const navigate = useNavigate()
  const toast = useToast()
  const { empresa, profile, hasPermission } = useAuth()
  const canWrite = hasPermission('financeiro.write')
  const empresaId = empresa?.id
  const ramoScope = useMemo(() => staffRamoScope(profile), [profile])

  const [savedId, setSavedId] = useState<number | null>(routeId)
  const [nome, setNome] = useState('')
  const [ramo, setRamo] = useState('')
  const [secao, setSecao] = useState('')
  const [patrulha, setPatrulha] = useState('')
  const [observacao, setObservacao] = useState('')
  const [itens, setItens] = useState<ItemForm[]>([novoItem()])
  const [ramos, setRamos] = useState<Ramo[]>([])
  const [secoes, setSecoes] = useState<Secao[]>([])
  const [patrulhas, setPatrulhas] = useState<Patrulha[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ramoId = ramo ? Number(ramo) : null
  const secaoId = secao ? Number(secao) : null

  const secoesDoRamo = useMemo(() => {
    if (ramoId == null) return []
    return secoes.filter((item) => item.ramo === ramoId)
  }, [ramoId, secoes])

  const patrulhasDaSecao = useMemo(() => {
    if (ramoId == null || secaoId == null) return []
    return patrulhas.filter(
      (item) => item.ramo === ramoId && item.secao === secaoId,
    )
  }, [ramoId, secaoId, patrulhas])

  useEffect(() => {
    if (ramoScope == null || !isNew) return
    setRamo(String(ramoScope))
  }, [ramoScope, isNew])

  useEffect(() => {
    if (!empresaId) {
      setLoading(false)
      return
    }

    let mounted = true
    void (async () => {
      const [ramosRes, secoesRes, patrulhasRes, atualRes, itensRes] =
        await Promise.all([
          supabase
            .from('ramos')
            .select('ramo_id, nome, idade_inicio, idade_fim')
            .order('ramo_id'),
          supabase
            .from('secao')
            .select('secao_id, nome, ramo')
            .eq('empresa_id', empresaId)
            .order('nome'),
          supabase
            .from('secao_nome')
            .select('secaonome_id, nome, ramo, secao')
            .eq('empresa_id', empresaId)
            .order('nome'),
          routeId
            ? supabase
                .from('orcamentos')
                .select('nome, ramo, secao, patrulha_matilha, observacao')
                .eq('orcamento_id', routeId)
                .eq('empresa_id', empresaId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          routeId
            ? supabase
                .from('orcamento_itens')
                .select('descricao, quantidade, unidade, valor_unitario, ordem')
                .eq('orcamento_id', routeId)
                .eq('empresa_id', empresaId)
                .order('ordem', { ascending: true })
            : Promise.resolve({ data: [], error: null }),
        ])

      if (!mounted) return
      const falha =
        ramosRes.error ||
        secoesRes.error ||
        patrulhasRes.error ||
        atualRes.error ||
        itensRes.error
      if (falha) {
        setError(falha.message)
        setLoading(false)
        return
      }
      if (routeId && !atualRes.data) {
        setError('Orçamento não encontrado.')
        setLoading(false)
        return
      }

      setRamos((ramosRes.data ?? []) as Ramo[])
      setSecoes((secoesRes.data ?? []) as Secao[])
      setPatrulhas((patrulhasRes.data ?? []) as Patrulha[])

      if (atualRes.data) {
        const atual = atualRes.data
        if (
          ramoScope != null &&
          atual.ramo != null &&
          atual.ramo !== ramoScope
        ) {
          setError('Este orçamento não pertence ao seu ramo.')
          setLoading(false)
          return
        }
        setSavedId(routeId)
        setNome(atual.nome ?? '')
        setRamo(atual.ramo != null ? String(atual.ramo) : '')
        setSecao(atual.secao != null ? String(atual.secao) : '')
        setPatrulha(
          atual.patrulha_matilha != null ? String(atual.patrulha_matilha) : '',
        )
        setObservacao(atual.observacao ?? '')
        const linhas = (itensRes.data ?? []).map((item) => ({
          key: crypto.randomUUID(),
          descricao: item.descricao ?? '',
          quantidade: String(item.quantidade ?? 1).replace('.', ','),
          unidade: item.unidade || 'un',
          valor: formatMoneyInput(item.valor_unitario),
        }))
        setItens(linhas.length > 0 ? linhas : [novoItem()])
      }

      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [empresaId, routeId, ramoScope])

  const total = itens.reduce((sum, item) => {
    const qtd = parseQuantidade(item.quantidade)
    return sum + (qtd > 0 ? qtd : 0) * parseMoneyInput(item.valor)
  }, 0)

  function atualizarItem(key: string, patch: Partial<ItemForm>) {
    setItens((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    )
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite) {
      setError('Sem permissão para alterar orçamentos.')
      return
    }
    if (!empresaId) {
      setError('Grupo escoteiro não carregado.')
      return
    }

    const nomeAtividade = nome.trim()
    if (!nomeAtividade) {
      setError('Informe o nome da atividade que será orçada.')
      return
    }

    const linhas = itens
      .map((item, index) => ({
        descricao: item.descricao.trim(),
        quantidade: parseQuantidade(item.quantidade),
        unidade: item.unidade.trim() || 'un',
        valor_unitario: parseMoneyInput(item.valor),
        ordem: index,
      }))
      .filter((item) => item.descricao)
    if (linhas.length === 0) {
      setError('Informe ao menos um item necessário.')
      return
    }
    if (linhas.some((item) => item.quantidade <= 0)) {
      setError('A quantidade de cada item precisa ser maior que zero.')
      return
    }

    setSaving(true)
    setError(null)
    const payload = {
      empresa_id: empresaId,
      nome: nomeAtividade,
      ramo: numOrNull(ramo),
      secao: numOrNull(ramo) == null ? null : numOrNull(secao),
      patrulha_matilha:
        numOrNull(ramo) == null || numOrNull(secao) == null
          ? null
          : numOrNull(patrulha),
      observacao: observacao.trim() || null,
    }

    let orcamentoId = savedId
    if (orcamentoId == null) {
      const { data, error: insertError } = await supabase
        .from('orcamentos')
        .insert(payload)
        .select('orcamento_id')
        .single()
      if (insertError || !data) {
        setSaving(false)
        setError(insertError?.message ?? 'Não foi possível salvar.')
        return
      }
      orcamentoId = data.orcamento_id
      setSavedId(orcamentoId)
    } else {
      const { error: updateError } = await supabase
        .from('orcamentos')
        .update(payload)
        .eq('orcamento_id', orcamentoId)
        .eq('empresa_id', empresaId)
      if (updateError) {
        setSaving(false)
        setError(updateError.message)
        return
      }
    }

    const { error: deleteError } = await supabase
      .from('orcamento_itens')
      .delete()
      .eq('orcamento_id', orcamentoId)
      .eq('empresa_id', empresaId)
    if (deleteError) {
      setSaving(false)
      setError(deleteError.message)
      return
    }

    const { error: itensError } = await supabase.from('orcamento_itens').insert(
      linhas.map((item) => ({
        ...item,
        orcamento_id: orcamentoId,
        empresa_id: empresaId,
      })),
    )
    setSaving(false)
    if (itensError) {
      setError(itensError.message)
      return
    }

    navigate('/financeiro/orcamentos', {
      state: { flashSuccess: 'Salvo com sucesso!' },
    })
  }

  async function onDelete() {
    if (!savedId || !empresaId || !canWrite) return
    const ok = await toast.confirm({
      title: 'Excluir orçamento?',
      message: 'Os itens deste orçamento também serão excluídos.',
      confirmLabel: 'Sim, excluir',
      cancelLabel: 'Não',
      danger: true,
    })
    if (!ok) return
    setSaving(true)
    setError(null)
    const { error: deleteError } = await supabase
      .from('orcamentos')
      .delete()
      .eq('orcamento_id', savedId)
      .eq('empresa_id', empresaId)
    setSaving(false)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    navigate('/financeiro/orcamentos', {
      state: { flashSuccess: 'Excluído com sucesso!' },
    })
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

  if (loading) {
    return <div className="loading">Carregando…</div>
  }

  const disabled = saving || !canWrite
  const labelUnidade = unidadeLabel(ramoId)

  return (
    <>
      <WaitingOverlay
        open={saving}
        title="Aguarde"
        message="Salvando no banco de dados. Isso pode levar alguns instantes…"
      />
      <header className="page-header">
        <div>
          <h2>{savedId == null ? 'Novo orçamento' : 'Editar orçamento'}</h2>
          <p>
            Grupo <strong>{empresa?.nome}</strong>
          </p>
        </div>
        <Link className="btn btn-soft" to="/financeiro/orcamentos">
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
          <div className="field">
            <label htmlFor="ramo">Ramo</label>
            <select
              id="ramo"
              className="select"
              value={ramo}
              disabled={disabled || ramoScope != null}
              onChange={(e) => {
                setRamo(e.target.value)
                setSecao('')
                setPatrulha('')
              }}
            >
              <option value="">Grupo todo (todos os ramos)</option>
              {ramos
                .filter((item) =>
                  ramoScope != null
                    ? item.ramo_id === ramoScope
                    : item.ramo_id >= 1 && item.ramo_id <= 5,
                )
                .map((item) => (
                  <option key={item.ramo_id} value={item.ramo_id}>
                    {item.nome}
                  </option>
                ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="secao">Seção</label>
            <select
              id="secao"
              className="select"
              value={secao}
              disabled={disabled || !ramo}
              onChange={(e) => {
                setSecao(e.target.value)
                setPatrulha('')
              }}
            >
              <option value="">
                {ramo ? 'Toda a seção / nenhuma' : 'Grupo todo (sem seção)'}
              </option>
              {secoesDoRamo.map((item) => (
                <option key={item.secao_id} value={item.secao_id}>
                  {item.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="patrulha_matilha">{labelUnidade}</label>
            <select
              id="patrulha_matilha"
              className="select"
              value={patrulha}
              disabled={disabled || !secao}
              onChange={(e) => setPatrulha(e.target.value)}
            >
              <option value="">
                {secao ? 'Toda a seção (opcional)' : 'Escolha a seção'}
              </option>
              {patrulhasDaSecao.map((item) => (
                <option key={item.secaonome_id} value={item.secaonome_id}>
                  {item.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="field field-span-2">
            <label htmlFor="nome">Nome da atividade</label>
            <input
              id="nome"
              className="input"
              value={nome}
              disabled={disabled}
              maxLength={200}
              required
              onChange={(e) => setNome(e.target.value)}
            />
            <span className="field-hint">
              Nome da atividade que será orçada.
            </span>
          </div>

          <div className="field field-span-2">
            <label htmlFor="observacao">Observação</label>
            <textarea
              id="observacao"
              className="input"
              rows={2}
              value={observacao}
              disabled={disabled}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>
        </div>

        <h3 className="form-section-title">Itens necessários</h3>
        <div className="table-wrap">
          <table className="data orcamento-itens">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qtd</th>
                <th>Un</th>
                <th>Valor unit.</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => {
                const qtd = parseQuantidade(item.quantidade)
                const unit = parseMoneyInput(item.valor)
                return (
                  <tr key={item.key}>
                    <td>
                      <input
                        className="input"
                        value={item.descricao}
                        placeholder="Ex.: ônibus, alimentação, material"
                        disabled={disabled}
                        onChange={(e) =>
                          atualizarItem(item.key, { descricao: e.target.value })
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="input"
                        inputMode="decimal"
                        value={item.quantidade}
                        disabled={disabled}
                        onChange={(e) =>
                          atualizarItem(item.key, {
                            quantidade: e.target.value,
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="input"
                        value={item.unidade}
                        maxLength={20}
                        disabled={disabled}
                        onChange={(e) =>
                          atualizarItem(item.key, { unidade: e.target.value })
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="input"
                        inputMode="numeric"
                        value={item.valor}
                        disabled={disabled}
                        onChange={(e) =>
                          atualizarItem(item.key, {
                            valor: maskMoneyInput(e.target.value),
                          })
                        }
                      />
                    </td>
                    <td>{formatMoney(qtd > 0 ? qtd * unit : 0)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-soft"
                        disabled={disabled || itens.length === 1}
                        onClick={() =>
                          setItens((prev) =>
                            prev.filter((row) => row.key !== item.key),
                          )
                        }
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="orcamento-itens-rodape">
          {canWrite ? (
            <button
              type="button"
              className="btn btn-soft"
              disabled={disabled}
              onClick={() => setItens((prev) => [...prev, novoItem()])}
            >
              Adicionar item
            </button>
          ) : null}
          <strong>Total estimado {formatMoney(total)}</strong>
        </div>

        <div className="form-actions">
          {canWrite ? (
            <>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              {savedId != null ? (
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
          <Link className="btn btn-soft" to="/financeiro/orcamentos">
            Cancelar
          </Link>
        </div>
      </form>
    </>
  )
}
