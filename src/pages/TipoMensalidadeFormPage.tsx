import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'

const emptyForm = {
  nome: '',
  valor: '0',
}

export function TipoMensalidadeFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const { empresa, hasPermission } = useAuth()
  const canWrite = hasPermission('financeiro.write')
  const empresaId = empresa?.id
  const toast = useToast()

  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)

  useEffect(() => {
    if (isNew || !empresaId) return
    let mounted = true

    void (async () => {
      const { data, error: loadError } = await supabase
        .from('tipo_mensalidade')
        .select('tipomensalidade_id, nome, valor')
        .eq('tipomensalidade_id', Number(id))
        .eq('empresa_id', empresaId)
        .maybeSingle()

      if (!mounted) return
      if (loadError || !data) {
        setError(loadError?.message ?? 'Tipo de mensalidade não encontrado')
        setLoading(false)
        return
      }

      setForm({
        nome: data.nome ?? '',
        valor: String(data.valor ?? 0),
      })
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [id, isNew, empresaId])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite) {
      setError('Sem permissão para alterar tipos de mensalidade.')
      return
    }
    if (!empresaId) {
      setError('Grupo escoteiro não carregado.')
      return
    }
    if (!form.nome.trim()) {
      setError('Informe o nome.')
      return
    }

    const rawValor = form.valor.trim().replace(/\s/g, '')
    const valor = rawValor.includes(',')
      ? Number(rawValor.replace(/\./g, '').replace(',', '.'))
      : Number(rawValor || '0')
    if (!Number.isFinite(valor) || valor < 0) {
      setError('Informe um valor válido.')
      return
    }

    setSaving(true)
    setError(null)

    const payload = {
      empresa_id: empresaId,
      nome: form.nome.trim().toUpperCase(),
      valor,
    }

    const result = isNew
      ? await supabase
          .from('tipo_mensalidade')
          .insert(payload)
          .select('tipomensalidade_id')
          .single()
      : await supabase
          .from('tipo_mensalidade')
          .update(payload)
          .eq('tipomensalidade_id', Number(id))
          .eq('empresa_id', empresaId)
          .select('tipomensalidade_id')
          .single()

    setSaving(false)

    if (result.error) {
      setError(result.error.message)
      return
    }

    navigate('/cadastros/tipo-mensalidade', {
      state: { flashSuccess: 'Salvo com sucesso!' },
    })
  }

  async function onDelete() {
    if (!canWrite || !empresaId || isNew) return
    const ok = await toast.confirm({
      title: 'Excluir tipo de mensalidade?',
      message: `Tem certeza que deseja excluir "${form.nome}"?`,
      confirmLabel: 'Sim, excluir',
      cancelLabel: 'Não',
      danger: true,
    })
    if (!ok) return

    setSaving(true)
    setError(null)

    const { count } = await supabase
      .from('associados')
      .select('associado_id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId)
      .eq('tipo_mensalidade', Number(id))

    if ((count ?? 0) > 0) {
      setSaving(false)
      setError(
        `Não é possível excluir: existem ${count} associado(s) com este tipo.`,
      )
      return
    }

    const { error: delError } = await supabase
      .from('tipo_mensalidade')
      .delete()
      .eq('tipomensalidade_id', Number(id))
      .eq('empresa_id', empresaId)

    setSaving(false)
    if (delError) {
      setError(delError.message)
      return
    }

    navigate('/cadastros/tipo-mensalidade', {
      state: { flashSuccess: 'Tipo de mensalidade excluído com sucesso!' },
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
          <h2>
            {isNew ? 'Novo tipo de mensalidade' : 'Editar tipo de mensalidade'}
          </h2>
          <p>
            Grupo <strong>{empresa?.nome}</strong>
          </p>
        </div>
        <Link className="btn btn-soft" to="/cadastros/tipo-mensalidade">
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
            <label htmlFor="nome">Nome</label>
            <input
              id="nome"
              className="input"
              value={form.nome}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, nome: e.target.value }))
              }
              disabled={disabled}
              required
            />
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
              required
            />
            <span className="field-hint">Use vírgula ou ponto para centavos</span>
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
          <Link className="btn btn-soft" to="/cadastros/tipo-mensalidade">
            Cancelar
          </Link>
        </div>
      </form>
    </>
  )
}
