import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { parseMoneyInput } from '@/lib/despesas'
import { formatQty } from '@/lib/estoque'
import {
  removerProdutoImagem,
  uploadProdutoImagem,
} from '@/lib/uploadProdutoImagem'

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
  const [imagemUrl, setImagemUrl] = useState<string | null>(null)
  const [imagemFile, setImagemFile] = useState<File | null>(null)
  const [imagemPreview, setImagemPreview] = useState<string | null>(null)
  const [removerFoto, setRemoverFoto] = useState(false)
  const imagemInputRef = useRef<HTMLInputElement>(null)
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
          'produto_id, nome, grupo, venda, controla_estoque, valor_venda, estoque_atual, ativo, imagem_url',
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
      setImagemUrl(data.imagem_url ?? null)
      setImagemPreview(data.imagem_url ?? null)
      setImagemFile(null)
      setRemoverFoto(false)
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [id, isNew, empresaId])

  function onImagemFileChange(file: File | null) {
    if (imagemPreview && imagemPreview.startsWith('blob:')) {
      URL.revokeObjectURL(imagemPreview)
    }
    setImagemFile(file)
    setRemoverFoto(false)
    setImagemPreview(file ? URL.createObjectURL(file) : imagemUrl)
  }

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

    if (result.error) {
      setSaving(false)
      setError(result.error.message)
      return
    }

    const produtoIdSalvo = Number(result.data?.produto_id)
    if (
      imagemFile &&
      Number.isFinite(produtoIdSalvo) &&
      produtoIdSalvo > 0
    ) {
      const imgOk = await uploadProdutoImagem(
        empresaId,
        produtoIdSalvo,
        imagemFile,
      )
      if ('error' in imgOk) {
        setSaving(false)
        setError(`Produto salvo, mas a foto falhou: ${imgOk.error}`)
        if (isNew) {
          navigate(`/estoque/produtos/${produtoIdSalvo}`, {
            state: {
              flashSuccess: 'Produto salvo. Ajuste a foto se precisar.',
            },
          })
        }
        return
      }
      setImagemUrl(imgOk.url)
      setImagemPreview(imgOk.url)
      setImagemFile(null)
    } else if (
      removerFoto &&
      !isNew &&
      Number.isFinite(produtoIdSalvo) &&
      produtoIdSalvo > 0
    ) {
      const rem = await removerProdutoImagem(empresaId, produtoIdSalvo)
      if ('error' in rem) {
        setSaving(false)
        setError(
          `Produto salvo, mas não foi possível remover a foto: ${rem.error}`,
        )
        return
      }
      setImagemUrl(null)
      setImagemPreview(null)
      setRemoverFoto(false)
    }

    setSaving(false)
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

          <div className="field field-span-2">
            <label htmlFor="produto-imagem">Foto do produto</label>
            <div className="logo-upload-field">
              {imagemPreview && !removerFoto ? (
                <img
                  className="produto-imagem-preview"
                  src={imagemPreview}
                  alt="Pré-visualização da foto do produto"
                />
              ) : (
                <div className="logo-preview logo-preview-placeholder">
                  Sem foto
                </div>
              )}
              <div>
                <input
                  ref={imagemInputRef}
                  id="produto-imagem"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  disabled={disabled}
                  onChange={(e) =>
                    onImagemFileChange(e.target.files?.[0] ?? null)
                  }
                />
                <span className="field-hint">
                  PNG, JPG, WEBP ou GIF · máx. 2 MB. Aparece na loja local e
                  online.
                </span>
                {imagemFile ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ marginTop: '0.4rem' }}
                    onClick={() => {
                      onImagemFileChange(null)
                      if (imagemInputRef.current) {
                        imagemInputRef.current.value = ''
                      }
                    }}
                    disabled={disabled}
                  >
                    Cancelar arquivo
                  </button>
                ) : null}
                {!imagemFile && imagemUrl && !removerFoto ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ marginTop: '0.4rem' }}
                    onClick={() => {
                      setRemoverFoto(true)
                      setImagemPreview(null)
                      if (imagemInputRef.current) {
                        imagemInputRef.current.value = ''
                      }
                    }}
                    disabled={disabled}
                  >
                    Remover foto
                  </button>
                ) : null}
                {removerFoto ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ marginTop: '0.4rem' }}
                    onClick={() => {
                      setRemoverFoto(false)
                      setImagemPreview(imagemUrl)
                    }}
                    disabled={disabled}
                  >
                    Manter foto atual
                  </button>
                ) : null}
              </div>
            </div>
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
