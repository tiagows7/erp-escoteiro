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

type DestinoTipo = 'atividade' | 'evento'

type Opcao = {
  id: number
  nome: string
  data: string | null
  ramo: number | null
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

function formatData(value: string | null) {
  if (!value) return ''
  const [ano, mes, dia] = value.slice(0, 10).split('-')
  if (!ano || !mes || !dia) return ''
  return `${dia}/${mes}/${ano}`
}

function parseQuantidade(value: string) {
  const n = Number(value.trim().replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function opcaoLabel(opcao: Opcao) {
  const data = formatData(opcao.data)
  return data ? `${opcao.nome} · ${data}` : opcao.nome
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
  const [tipo, setTipo] = useState<DestinoTipo>('atividade')
  const [atividadeId, setAtividadeId] = useState<number | null>(null)
  const [eventoId, setEventoId] = useState<number | null>(null)
  const [observacao, setObservacao] = useState('')
  const [itens, setItens] = useState<ItemForm[]>([novoItem()])
  const [atividades, setAtividades] = useState<Opcao[]>([])
  const [eventos, setEventos] = useState<Opcao[]>([])
  const [ocupadosAtividade, setOcupadosAtividade] = useState<number[]>([])
  const [ocupadosEvento, setOcupadosEvento] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!empresaId) {
      setLoading(false)
      return
    }

    let mounted = true
    void (async () => {
      const [atividadesRes, eventosRes, usadosRes, atualRes, itensRes] =
        await Promise.all([
          supabase
            .from('atividades')
            .select('atividade_id, descricao, data_atividade, ramo')
            .eq('empresa_id', empresaId)
            .order('data_atividade', { ascending: false }),
          supabase
            .from('venda_eventos')
            .select('evento_id, nome, data_evento, ramo')
            .eq('empresa_id', empresaId)
            .order('data_evento', { ascending: false }),
          supabase
            .from('orcamentos')
            .select('orcamento_id, atividade_id, evento_id')
            .eq('empresa_id', empresaId),
          routeId
            ? supabase
                .from('orcamentos')
                .select('atividade_id, evento_id, observacao')
                .eq('orcamento_id', routeId)
                .eq('empresa_id', empresaId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          routeId
            ? supabase
                .from('orcamento_itens')
                .select(
                  'descricao, quantidade, unidade, valor_unitario, ordem',
                )
                .eq('orcamento_id', routeId)
                .eq('empresa_id', empresaId)
                .order('ordem', { ascending: true })
            : Promise.resolve({ data: [], error: null }),
        ])

      if (!mounted) return
      const falha =
        atividadesRes.error ||
        eventosRes.error ||
        usadosRes.error ||
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

      setAtividades(
        (atividadesRes.data ?? []).map((row) => ({
          id: row.atividade_id,
          nome: row.descricao,
          data: row.data_atividade,
          ramo: row.ramo,
        })),
      )
      setEventos(
        (eventosRes.data ?? []).map((row) => ({
          id: row.evento_id,
          nome: row.nome,
          data: row.data_evento,
          ramo: row.ramo,
        })),
      )
      setOcupadosAtividade(
        (usadosRes.data ?? [])
          .filter(
            (row) =>
              row.atividade_id != null && row.orcamento_id !== routeId,
          )
          .map((row) => row.atividade_id as number),
      )
      setOcupadosEvento(
        (usadosRes.data ?? [])
          .filter(
            (row) => row.evento_id != null && row.orcamento_id !== routeId,
          )
          .map((row) => row.evento_id as number),
      )

      if (atualRes.data) {
        const atual = atualRes.data
        setSavedId(routeId)
        setObservacao(atual.observacao ?? '')
        if (atual.evento_id != null) {
          setTipo('evento')
          setEventoId(atual.evento_id)
          setAtividadeId(null)
        } else {
          setTipo('atividade')
          setAtividadeId(atual.atividade_id)
          setEventoId(null)
        }
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
  }, [empresaId, routeId])

  const opcoesAtividade = useMemo(
    () =>
      atividades.filter((opcao) => {
        if (opcao.id === atividadeId) return true
        if (ocupadosAtividade.includes(opcao.id)) return false
        if (ramoScope != null && opcao.ramo != null && opcao.ramo !== ramoScope) {
          return false
        }
        return true
      }),
    [atividades, atividadeId, ocupadosAtividade, ramoScope],
  )

  const opcoesEvento = useMemo(
    () =>
      eventos.filter((opcao) => {
        if (opcao.id === eventoId) return true
        if (ocupadosEvento.includes(opcao.id)) return false
        if (ramoScope != null && opcao.ramo != null && opcao.ramo !== ramoScope) {
          return false
        }
        return true
      }),
    [eventos, eventoId, ocupadosEvento, ramoScope],
  )

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

    const destinoAtividade = tipo === 'atividade' ? atividadeId : null
    const destinoEvento = tipo === 'evento' ? eventoId : null
    if (destinoAtividade == null && destinoEvento == null) {
      setError(
        tipo === 'atividade'
          ? 'Escolha a atividade deste orçamento.'
          : 'Escolha o evento deste orçamento.',
      )
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
      atividade_id: destinoAtividade,
      evento_id: destinoEvento,
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
        setError(
          insertError?.code === '23505'
            ? 'Já existe um orçamento para esta atividade ou evento.'
            : (insertError?.message ?? 'Não foi possível salvar.'),
        )
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
        setError(
          updateError.code === '23505'
            ? 'Já existe um orçamento para esta atividade ou evento.'
            : updateError.message,
        )
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
  const opcoes = tipo === 'atividade' ? opcoesAtividade : opcoesEvento
  const destinoId = tipo === 'atividade' ? atividadeId : eventoId

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
            <label htmlFor="tipo">Para</label>
            <select
              id="tipo"
              className="select"
              value={tipo}
              disabled={disabled}
              onChange={(e) => {
                const next = e.target.value === 'evento' ? 'evento' : 'atividade'
                setTipo(next)
                if (next === 'atividade') setEventoId(null)
                else setAtividadeId(null)
              }}
            >
              <option value="atividade">Atividade</option>
              <option value="evento">Evento</option>
            </select>
          </div>

          <div className="field field-span-2">
            <label htmlFor="destino">
              {tipo === 'atividade' ? 'Atividade' : 'Evento'}
            </label>
            <select
              id="destino"
              className="select"
              value={destinoId ?? ''}
              disabled={disabled}
              onChange={(e) => {
                const next = e.target.value ? Number(e.target.value) : null
                if (tipo === 'atividade') setAtividadeId(next)
                else setEventoId(next)
              }}
              required
            >
              <option value="">Selecione…</option>
              {opcoes.map((opcao) => (
                <option key={opcao.id} value={opcao.id}>
                  {opcaoLabel(opcao)}
                </option>
              ))}
            </select>
            <span className="field-hint">
              Um orçamento por atividade ou evento. Liste tudo o que precisa
              para realizá-lo.
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
