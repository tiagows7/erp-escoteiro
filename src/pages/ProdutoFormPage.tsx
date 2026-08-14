import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { parseMoneyInput } from '@/lib/despesas'
import { formatQty } from '@/lib/estoque'

type GrupoOpt = { grupoproduto_id: number; nome: string }

function formatValorInput(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const emptyForm = {
  descricao: '',
  grupo: '',
  controla_estoque: true,
  venda: true,
  valor: '',
  ativo: true,
}

export function ProdutoFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const { empresa, hasPermission } = useAuth()
  const canWrite = hasPermission('estoque.write')
  const empresaId = empresa?.id
  const toast = useToast()

  const [form, setForm] = useState(emptyForm)
  const [estoqueAtual, setEstoqueAtual] = useState(0)
  const [grupos, setGrupos] = useState<GrupoOpt[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)

  useEffect(() => {
    if (!empresaId) return
    void supabase
      .from('grupo_produto')
      .select('grupoproduto_id, nome')
      .eq('empresa_id', empresaId)
      .order('nome')
      .then(({ data }) => {
        setGrupos((data as GrupoOpt[]) ?? [])
      })
  }, [empresaId])

  useEffect(() => {
    if (isNew || !empresaId) return
    let mounted = true

    void (async () => {
      const { data, error: loadError } = await supabase
        .from('produto')
        .select(
          'produto_id, nome, grupo, venda, controla_estoque, valor_venda, estoque_atual, ativo',
        )
        .eq('produto_id', Number(id))
        .eq('empresa_id', empresaId)
        .maybeSingle()

      if (!mounted) return
      if (loadError || !data) {
        setError(loadError?.message ?? 'Produto não encontrado')
        setLoading(false)
        return
      }

      setForm({
        descricao: data.nome ?? '',
        grupo: data.grupo != null ? String(data.grupo) : '',
        controla_estoque: data.controla_estoque !== false,
        venda: data.venda !== false,
        valor:
          data.valor_venda != null && Number(data.valor_venda) !== 0
            ? formatValorInput(Number(data.valor_venda))
            : '',
        ativo: data.ativo !== false,
      })
      setEstoqueAtual(Number(data.estoque_atual ?? 0))
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [id, isNew, empresaId])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite) {
      setError('Sem permissão para alterar produtos.')
      return
    }
    if (!empresaId) {
      setError('Grupo escoteiro não carregado.')
      return
    }
    if (!form.descricao.trim()) {
      setError('Informe a descrição.')
      return
    }
    if (!form.grupo) {
      setError('Selecione o grupo do produto.')
      return
    }

    setSaving(true)
    setError(null)

    const payload = {
      empresa_id: empresaId,
      nome: form.descricao.trim().toUpperCase().slice(0, 100),
      grupo: Number(form.grupo),
      controla_estoque: form.controla_estoque,
      venda: form.venda,
      valor_venda: parseMoneyInput(form.valor),
      ativo: form.ativo,
    }

    const result = isNew
      ? await supabase
          .from('produto')
          .insert(payload)
          .select('produto_id')
          .single()
      : await supabase
          .from('produto')
          .update(payload)
          .eq('produto_id', Number(id))
          .eq('empresa_id', empresaId)
          .select('produto_id')
          .single()

    setSaving(false)

    if (result.error) {
      setError(result.error.message)
      return
    }

    navigate('/estoque/produtos', {
      state: { flashSuccess: 'Salvo com sucesso!' },
    })
  }

  async function onDelete() {
    if (!canWrite || !empresaId || isNew) return
    const ok = await toast.confirm({
      title: 'Excluir produto?',
      message: `Tem certeza que deseja excluir "${form.descricao}"?`,
      confirmLabel: 'Sim, excluir',
      cancelLabel: 'Não',
      danger: true,
    })
    if (!ok) return

    setSaving(true)
    setError(null)

    const { error: delError } = await supabase
      .from('produto')
      .delete()
      .eq('produto_id', Number(id))
      .eq('empresa_id', empresaId)

    setSaving(false)
    if (delError) {
      setError(delError.message)
      return
    }

    navigate('/estoque/produtos', {
      state: { flashSuccess: 'Produto excluído com sucesso!' },
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

  return (
    <>
      <header className="page-header">
        <div>
          <h2>{isNew ? 'Novo produto' : 'Editar produto'}</h2>
          <p>
            Grupo <strong>{empresa?.nome}</strong>
          </p>
        </div>
        <Link className="btn btn-soft" to="/estoque/produtos">
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
          <div className="field field-span-2">
            <label htmlFor="descricao">Descrição</label>
            <input
              id="descricao"
              className="input"
              value={form.descricao}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, descricao: e.target.value }))
              }
              disabled={disabled}
              required
              maxLength={100}
            />
          </div>

          <div className="field">
            <label htmlFor="grupo">Grupo</label>
            <select
              id="grupo"
              className="select"
              value={form.grupo}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, grupo: e.target.value }))
              }
              disabled={disabled}
              required
            >
              <option value="">Selecione…</option>
              {grupos.map((g) => (
                <option key={g.grupoproduto_id} value={g.grupoproduto_id}>
                  {g.nome}
                </option>
              ))}
            </select>
            {grupos.length === 0 ? (
              <span className="field-hint">
                Cadastre um grupo em Estoque → Grupo de produto.
              </span>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="valor">Valor</label>
            <input
              id="valor"
              className="input"
              inputMode="decimal"
              placeholder="0,00"
              value={form.valor}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, valor: e.target.value }))
              }
              disabled={disabled}
            />
          </div>

          <div className="field">
            <label htmlFor="estoque_atual">Estoque atual</label>
            <input
              id="estoque_atual"
              className="input"
              value={isNew ? '0' : formatQty(estoqueAtual)}
              disabled
              readOnly
            />
            <span className="field-hint">
              Atualizado automaticamente pelos movimentos (acerto, loja…).
            </span>
          </div>

          <div className="field field-checks field-span-2">
            <label>
              <input
                type="checkbox"
                checked={form.controla_estoque}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    controla_estoque: e.target.checked,
                  }))
                }
                disabled={disabled}
              />
              Controla estoque
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.venda}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, venda: e.target.checked }))
                }
                disabled={disabled}
              />
              Para venda
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, ativo: e.target.checked }))
                }
                disabled={disabled}
              />
              Ativo
            </label>
          </div>
        </div>

        <div className="form-actions">
          {canWrite ? (
            <>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={saving || grupos.length === 0}
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              {!isNew ? (
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
          <Link className="btn btn-soft" to="/estoque/produtos">
            Cancelar
          </Link>
        </div>
      </form>
    </>
  )
}
