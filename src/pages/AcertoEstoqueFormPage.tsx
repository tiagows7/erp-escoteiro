import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AlertMessage } from '@/components/AlertMessage'
import { WaitingOverlay } from '@/components/WaitingOverlay'
import {
  ESTOQUE_OPERACAO_ACERTO,
  ESTOQUE_ORIGEM,
  formatQty,
  parseQtyInput,
  sinalDaOperacao,
} from '@/lib/estoque'

type GrupoOpt = { grupoproduto_id: number; nome: string }
type SecaoOpt = { secao_id: number; nome: string; ramo: number | null }
type ProdutoOpt = {
  produto_id: number
  nome: string
  grupo: number | null
  valor_venda: number | null
}

type LinhaAcerto = {
  produto_id: number
  nome: string
  grupo: number | null
  valor_venda: number | null
  saldo: number
  quantidade: string
  obs: string
}

function todayKey() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function AcertoEstoqueFormPage() {
  const navigate = useNavigate()
  const { empresa, hasPermission } = useAuth()
  const canWrite = hasPermission('estoque.write')
  const empresaId = empresa?.id

  const [grupos, setGrupos] = useState<GrupoOpt[]>([])
  const [secoes, setSecoes] = useState<SecaoOpt[]>([])
  const [ramos, setRamos] = useState<{ ramo_id: number; nome: string }[]>([])
  const [produtos, setProdutos] = useState<ProdutoOpt[]>([])

  const [dataAcerto, setDataAcerto] = useState(todayKey())
  const [operacao, setOperacao] = useState(String(ESTOQUE_OPERACAO_ACERTO[0].id))
  /** Vazio = estoque do grupo. */
  const [secaoId, setSecaoId] = useState('')
  const [filtroGrupo, setFiltroGrupo] = useState('')
  const [produtoId, setProdutoId] = useState('')
  const [linhas, setLinhas] = useState<LinhaAcerto[]>([])
  const [consultou, setConsultou] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!empresaId) {
      setLoading(false)
      return
    }
    let mounted = true
    void (async () => {
      const [g, p, s, r] = await Promise.all([
        supabase
          .from('grupo_produto')
          .select('grupoproduto_id, nome')
          .eq('empresa_id', empresaId)
          .order('nome'),
        supabase
          .from('produto')
          .select('produto_id, nome, grupo, valor_venda')
          .eq('empresa_id', empresaId)
          .eq('controla_estoque', true)
          .eq('ativo', true)
          .order('nome'),
        supabase
          .from('secao')
          .select('secao_id, nome, ramo')
          .eq('empresa_id', empresaId)
          .order('nome'),
        supabase.from('ramos').select('ramo_id, nome').order('ramo_id'),
      ])
      if (!mounted) return
      setGrupos((g.data as GrupoOpt[]) ?? [])
      setProdutos((p.data as ProdutoOpt[]) ?? [])
      setSecoes((s.data as SecaoOpt[]) ?? [])
      setRamos((r.data as { ramo_id: number; nome: string }[]) ?? [])
      setLoading(false)
    })()
    return () => {
      mounted = false
    }
  }, [empresaId])

  const produtosFiltrados = useMemo(() => {
    if (!filtroGrupo) return produtos
    const gid = Number(filtroGrupo)
    return produtos.filter((p) => p.grupo === gid)
  }, [produtos, filtroGrupo])

  const grupoNome = useMemo(() => {
    const map = new Map(grupos.map((g) => [g.grupoproduto_id, g.nome]))
    return (grupoId: number | null) =>
      grupoId != null ? map.get(grupoId) ?? '—' : '—'
  }, [grupos])

  const secaoLabel = useMemo(() => {
    if (!secaoId) return 'Grupo'
    const secao = secoes.find((s) => String(s.secao_id) === secaoId)
    if (!secao) return 'Grupo'
    const ramoNome =
      secao.ramo != null
        ? (ramos.find((r) => r.ramo_id === secao.ramo)?.nome ?? null)
        : null
    return ramoNome ? `${secao.nome} (${ramoNome})` : secao.nome
  }, [secaoId, secoes, ramos])

  async function onConsultar() {
    if (!empresaId) return
    setError(null)
    let selecionados = produtosFiltrados
    if (produtoId) {
      selecionados = selecionados.filter(
        (p) => String(p.produto_id) === produtoId,
      )
    }
    if (selecionados.length === 0) {
      setLinhas([])
      setConsultou(true)
      setError('Nenhum produto encontrado para a seleção.')
      return
    }

    const secaoNum = secaoId ? Number(secaoId) : null
    const { data: saldosData, error: saldosError } = await supabase.rpc(
      'produto_saldos_por_secao',
      {
        p_empresa_id: empresaId,
        p_secao_id: secaoNum,
      },
    )
    if (saldosError) {
      setError(saldosError.message)
      return
    }
    const saldoMap = new Map(
      ((saldosData ?? []) as { produto_id: number; saldo: number }[]).map(
        (row) => [row.produto_id, Number(row.saldo ?? 0)],
      ),
    )

    setLinhas((prev) => {
      const prevMap = new Map(prev.map((l) => [l.produto_id, l]))
      return selecionados.map((p) => {
        const existing = prevMap.get(p.produto_id)
        return {
          produto_id: p.produto_id,
          nome: p.nome,
          grupo: p.grupo,
          valor_venda: p.valor_venda,
          saldo: saldoMap.get(p.produto_id) ?? 0,
          quantidade: existing?.quantidade ?? '',
          obs: existing?.obs ?? '',
        }
      })
    })
    setConsultou(true)
  }

  function updateLinha(
    produtoIdLinha: number,
    patch: Partial<Pick<LinhaAcerto, 'quantidade' | 'obs'>>,
  ) {
    setLinhas((prev) =>
      prev.map((l) =>
        l.produto_id === produtoIdLinha ? { ...l, ...patch } : l,
      ),
    )
  }

  function removeLinha(produtoIdLinha: number) {
    setLinhas((prev) => prev.filter((l) => l.produto_id !== produtoIdLinha))
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite) {
      setError('Sem permissão para lançar acerto de estoque.')
      return
    }
    if (!empresaId) {
      setError('Grupo escoteiro não carregado.')
      return
    }
    if (!dataAcerto) {
      setError('Informe a data do acerto.')
      return
    }
    if (linhas.length === 0) {
      setError('Consulte os produtos e preencha as quantidades no grid.')
      return
    }

    const op = Number(operacao)
    const sinal = sinalDaOperacao(op)
    const paraLancar: Array<{
      linha: LinhaAcerto
      qtd: number
    }> = []

    for (const linha of linhas) {
      const raw = linha.quantidade.trim()
      if (!raw) continue
      const qtd = parseQtyInput(raw)
      if (qtd <= 0) {
        setError(`Quantidade inválida em “${linha.nome}”.`)
        return
      }
      if (sinal === '-' && qtd > linha.saldo) {
        setError(
          `“${linha.nome}”: quantidade maior que o saldo (${formatQty(linha.saldo)}).`,
        )
        return
      }
      paraLancar.push({ linha, qtd })
    }

    if (paraLancar.length === 0) {
      setError('Informe a quantidade em pelo menos um produto do grid.')
      return
    }

    setSaving(true)
    setError(null)

    const { data: maxRow } = await supabase
      .from('movimento_estoque')
      .select('movimentoest_numero')
      .eq('empresa_id', empresaId)
      .order('movimentoest_numero', { ascending: false })
      .limit(1)
      .maybeSingle()

    let proximoNumero = Number(maxRow?.movimentoest_numero ?? 0) + 1
    const secaoNum = secaoId ? Number(secaoId) : null
    const secaoInfo = secaoNum
      ? secoes.find((s) => s.secao_id === secaoNum)
      : null
    const payload = paraLancar.map(({ linha, qtd }) => {
      const unitario = Number(linha.valor_venda ?? 0)
      const row = {
        empresa_id: empresaId,
        movimentoest_numero: proximoNumero,
        movimentoest_operacao: op,
        movimentoest_emissao: dataAcerto,
        movimentoest_sinal: sinal,
        movimentoest_produto: linha.produto_id,
        movimentoest_quantidade: qtd,
        movimentoest_unitario: unitario,
        movimentoest_total: Number((qtd * unitario).toFixed(2)),
        movimentoest_origem: ESTOQUE_ORIGEM.ACERTO,
        movimentoest_obs: linha.obs.trim() || null,
        movimentoest_secao: secaoNum,
        movimentoest_ramo: secaoInfo?.ramo ?? null,
      }
      proximoNumero += 1
      return row
    })

    const { error: insertError } = await supabase
      .from('movimento_estoque')
      .insert(payload)

    setSaving(false)
    if (insertError) {
      setError(insertError.message)
      return
    }

    navigate('/estoque/acerto', {
      state: {
        flashSuccess:
          paraLancar.length === 1
            ? 'Acerto lançado com sucesso!'
            : `${paraLancar.length} acertos lançados com sucesso!`,
      },
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
  const linhasComQtd = linhas.filter((l) => l.quantidade.trim()).length

  return (
    <>
      <WaitingOverlay
        open={saving}
        title="Aguarde"
        message="Salvando no banco de dados. Isso pode levar alguns instantes…"
      />
      <header className="page-header">
        <div>
          <h2>Novo acerto de estoque</h2>
          <p>
            Grupo <strong>{empresa?.nome}</strong> · estoque:{' '}
            <strong>{secaoLabel}</strong>
          </p>
        </div>
        <Link className="btn btn-soft" to="/estoque/acerto">
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
            <label htmlFor="data_acerto">Data do acerto</label>
            <input
              id="data_acerto"
              className="input"
              type="date"
              value={dataAcerto}
              onChange={(e) => setDataAcerto(e.target.value)}
              disabled={disabled}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="operacao">Operação</label>
            <select
              id="operacao"
              className="select"
              value={operacao}
              onChange={(e) => setOperacao(e.target.value)}
              disabled={disabled}
              required
            >
              {ESTOQUE_OPERACAO_ACERTO.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="secao_estoque">Seção</label>
            <select
              id="secao_estoque"
              className="select"
              value={secaoId}
              onChange={(e) => {
                setSecaoId(e.target.value)
                setLinhas([])
                setConsultou(false)
              }}
              disabled={disabled}
            >
              <option value="">Estoque do grupo</option>
              {secoes.map((s) => {
                const ramoNome =
                  s.ramo != null
                    ? (ramos.find((r) => r.ramo_id === s.ramo)?.nome ?? null)
                    : null
                return (
                  <option key={s.secao_id} value={s.secao_id}>
                    {ramoNome ? `${s.nome} (${ramoNome})` : s.nome}
                  </option>
                )
              })}
            </select>
            <span className="field-hint">
              Em branco, o movimento entra no estoque do grupo.
            </span>
          </div>

          <div className="field">
            <label htmlFor="filtro_grupo">Grupo de produto</label>
            <select
              id="filtro_grupo"
              className="select"
              value={filtroGrupo}
              onChange={(e) => {
                setFiltroGrupo(e.target.value)
                setProdutoId('')
              }}
              disabled={disabled}
            >
              <option value="">Todos os grupos</option>
              {grupos.map((g) => (
                <option key={g.grupoproduto_id} value={g.grupoproduto_id}>
                  {g.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="produto">Produto</label>
            <select
              id="produto"
              className="select"
              value={produtoId}
              onChange={(e) => setProdutoId(e.target.value)}
              disabled={disabled}
            >
              <option value="">Todos os produtos</option>
              {produtosFiltrados.map((p) => (
                <option key={p.produto_id} value={p.produto_id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-actions" style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => void onConsultar()}
            disabled={disabled || produtos.length === 0}
          >
            Consultar
          </button>
        </div>

        {consultou ? (
          <div className="table-wrap" style={{ marginTop: '1rem' }}>
            {linhas.length === 0 ? (
              <div className="empty">Nenhum produto na seleção.</div>
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Grupo</th>
                    <th>Saldo ({secaoLabel})</th>
                    <th style={{ minWidth: 110 }}>Quantidade</th>
                    <th style={{ minWidth: 180 }}>Observação</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((linha) => (
                    <tr key={linha.produto_id}>
                      <td>{linha.nome}</td>
                      <td>{grupoNome(linha.grupo)}</td>
                      <td>{formatQty(linha.saldo)}</td>
                      <td>
                        <input
                          className="input"
                          inputMode="decimal"
                          value={linha.quantidade}
                          onChange={(e) =>
                            updateLinha(linha.produto_id, {
                              quantidade: e.target.value,
                            })
                          }
                          disabled={disabled}
                          placeholder="0"
                          aria-label={`Quantidade ${linha.nome}`}
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          value={linha.obs}
                          onChange={(e) =>
                            updateLinha(linha.produto_id, {
                              obs: e.target.value,
                            })
                          }
                          disabled={disabled}
                          maxLength={200}
                          placeholder="Opcional"
                          aria-label={`Observação ${linha.nome}`}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-soft"
                          onClick={() => removeLinha(linha.produto_id)}
                          disabled={disabled}
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {linhas.length > 0 ? (
              <p className="field-hint" style={{ marginTop: '0.5rem' }}>
                {linhas.length} produto(s) · {linhasComQtd} com quantidade
                preenchida
              </p>
            ) : null}
          </div>
        ) : (
          <p className="muted" style={{ marginTop: '1rem' }}>
            Selecione grupo e/ou produto e clique em Consultar para montar o
            grid.
          </p>
        )}

        <div className="form-actions">
          {canWrite ? (
            <button
              className="btn btn-primary"
              type="submit"
              disabled={saving || linhas.length === 0}
            >
              {saving
                ? 'Salvando…'
                : linhasComQtd > 1
                  ? `Lançar ${linhasComQtd} acertos`
                  : 'Lançar acerto'}
            </button>
          ) : (
            <p className="muted">Modo leitura — sem permissão para salvar.</p>
          )}
          <Link className="btn btn-soft" to="/estoque/acerto">
            Cancelar
          </Link>
        </div>
      </form>
    </>
  )
}
