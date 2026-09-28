import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AlertMessage } from '@/components/AlertMessage'
import { WaitingOverlay } from '@/components/WaitingOverlay'
import { useToast } from '@/contexts/ToastContext'

type FormState = {
  codigo: string
  nome: string
  natureza: string
  ativo: boolean
}

const emptyForm = (): FormState => ({
  codigo: '',
  nome: '',
  natureza: 'despesa',
  ativo: true,
})

export function PlanoContaFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const contaId = isNew ? null : Number(id)
  const navigate = useNavigate()
  const toast = useToast()
  const { empresa, hasPermission } = useAuth()
  const canWrite = hasPermission('financeiro.write')
  const empresaId = empresa?.id

  const [form, setForm] = useState<FormState>(emptyForm)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isNew || !contaId || !empresaId) {
      setLoading(false)
      return
    }

    let mounted = true
    void (async () => {
      const { data, error: queryError } = await supabase
        .from('plano_contas')
        .select('codigo, nome, natureza, ativo')
        .eq('plano_conta_id', contaId)
        .eq('empresa_id', empresaId)
        .maybeSingle()

      if (!mounted) return
      if (queryError || !data) {
        setError(queryError?.message ?? 'Conta não encontrada.')
      } else {
        setForm({
          codigo: data.codigo ?? '',
          nome: data.nome ?? '',
          natureza: data.natureza === 'receita' ? 'receita' : 'despesa',
          ativo: data.ativo !== false,
        })
      }
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [contaId, empresaId, isNew])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite) {
      setError('Sem permissão para alterar o plano de contas.')
      return
    }
    if (!empresaId) {
      setError('Grupo escoteiro não carregado.')
      return
    }
    const codigo = form.codigo.trim()
    const nome = form.nome.trim()
    if (!codigo || !nome) {
      setError('Informe o código e o nome da conta.')
      return
    }

    setSaving(true)
    setError(null)
    const payload = {
      empresa_id: empresaId,
      codigo,
      nome,
      natureza: form.natureza === 'receita' ? 'receita' : 'despesa',
      ativo: form.ativo,
    }

    const query = isNew
      ? supabase.from('plano_contas').insert(payload)
      : supabase
          .from('plano_contas')
          .update(payload)
          .eq('plano_conta_id', contaId!)
          .eq('empresa_id', empresaId)

    const { error: saveError } = await query
    setSaving(false)
    if (saveError) {
      setError(
        saveError.code === '23505'
          ? 'Já existe uma conta com este código neste grupo.'
          : saveError.message,
      )
      return
    }
    navigate('/cadastros/plano-contas', {
      state: { flashSuccess: 'Salvo com sucesso!' },
    })
  }

  async function onDelete() {
    if (!contaId || !empresaId || !canWrite) return
    const ok = await toast.confirm({
      title: 'Excluir conta?',
      message:
        'Os fornecedores e contatos vinculados a esta conta ficam sem classificação.',
      confirmLabel: 'Sim, excluir',
      cancelLabel: 'Não',
      danger: true,
    })
    if (!ok) return
    setSaving(true)
    setError(null)
    const { error: deleteError } = await supabase
      .from('plano_contas')
      .delete()
      .eq('plano_conta_id', contaId)
      .eq('empresa_id', empresaId)
    setSaving(false)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    navigate('/cadastros/plano-contas', {
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

  return (
    <>
      <WaitingOverlay
        open={saving}
        title="Aguarde"
        message="Salvando no banco de dados. Isso pode levar alguns instantes…"
      />
      <header className="page-header">
        <div>
          <h2>{isNew ? 'Nova conta' : 'Editar conta'}</h2>
          <p>
            Grupo <strong>{empresa?.nome}</strong>
          </p>
        </div>
        <Link className="btn btn-soft" to="/cadastros/plano-contas">
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
            <label htmlFor="codigo">Código</label>
            <input
              id="codigo"
              className="input"
              value={form.codigo}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, codigo: e.target.value }))
              }
              disabled={disabled}
              maxLength={30}
              required
            />
            <span className="field-hint">
              Ex.: 3.1.01. Identifica a conta no Portal da Transparência.
            </span>
          </div>

          <div className="field">
            <label htmlFor="natureza">Natureza</label>
            <select
              id="natureza"
              className="select"
              value={form.natureza}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, natureza: e.target.value }))
              }
              disabled={disabled}
            >
              <option value="despesa">Despesa</option>
              <option value="receita">Receita</option>
            </select>
          </div>

          <div className="field field-span-2">
            <label htmlFor="nome">Nome</label>
            <input
              id="nome"
              className="input"
              value={form.nome}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, nome: e.target.value }))
              }
              disabled={disabled}
              maxLength={80}
              required
            />
          </div>

          <div className="field field-checks">
            <label>
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, ativo: e.target.checked }))
                }
                disabled={disabled}
              />
              Conta ativa
            </label>
          </div>
        </div>

        <div className="form-actions">
          {canWrite ? (
            <>
              <button className="btn btn-primary" type="submit" disabled={saving}>
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
          <Link className="btn btn-soft" to="/cadastros/plano-contas">
            Cancelar
          </Link>
        </div>
      </form>
    </>
  )
}
