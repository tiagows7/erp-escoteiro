import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { WaitingOverlay } from '@/components/WaitingOverlay'
import { clearSecaoRefsAndPatrulhas } from '@/lib/estruturaDelete'
import type { Ramo } from '@/types/database'

const emptyForm = {
  nome: '',
  ramo: '',
  secao_foto: '',
}

export function SecaoFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const { empresa, hasPermission } = useAuth()
  const canWrite = hasPermission('estrutura.write')
  const empresaId = empresa?.id
  const toast = useToast()

  const [form, setForm] = useState(emptyForm)
  const [ramos, setRamos] = useState<Ramo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)

  useEffect(() => {
    void supabase
      .from('ramos')
      .select('ramo_id, nome, idade_inicio, idade_fim')
      .order('ramo_id')
      .then(({ data }) => setRamos((data as Ramo[]) ?? []))
  }, [])

  useEffect(() => {
    if (isNew || !empresaId) return
    let mounted = true

    void (async () => {
      const { data, error: loadError } = await supabase
        .from('secao')
        .select('secao_id, nome, ramo, secao_foto')
        .eq('secao_id', Number(id))
        .eq('empresa_id', empresaId)
        .maybeSingle()

      if (!mounted) return
      if (loadError || !data) {
        setError(loadError?.message ?? 'Seção não encontrada neste grupo')
        setLoading(false)
        return
      }

      setForm({
        nome: data.nome ?? '',
        ramo: data.ramo?.toString() ?? '',
        secao_foto: data.secao_foto ?? '',
      })
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [id, isNew, empresaId])

  function update<K extends keyof typeof emptyForm>(
    key: K,
    value: (typeof emptyForm)[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite) {
      setError('Seu usuário não tem permissão para alterar seções.')
      return
    }
    if (!empresaId) {
      setError('Grupo escoteiro não carregado no perfil do usuário.')
      return
    }
    if (!form.ramo) {
      setError('Informe o ramo.')
      return
    }
    if (!form.nome.trim()) {
      setError('Informe o nome da seção.')
      return
    }

    setSaving(true)
    setError(null)

    const payload = {
      empresa_id: empresaId,
      nome: form.nome.trim().toUpperCase(),
      ramo: Number(form.ramo),
      secao_foto: form.secao_foto.trim() || null,
    }

    const result = isNew
      ? await supabase
          .from('secao')
          .insert(payload)
          .select('secao_id')
          .single()
      : await supabase
          .from('secao')
          .update(payload)
          .eq('secao_id', Number(id))
          .eq('empresa_id', empresaId)
          .select('secao_id')
          .single()

    setSaving(false)

    if (result.error) {
      setError(result.error.message)
      return
    }

    navigate('/secoes', {
      state: { flashSuccess: 'Salvo com sucesso!' },
    })
  }

  async function onDelete() {
    if (!canWrite || !empresaId || isNew) return
    const ok = await toast.confirm({
      title: 'Excluir seção?',
      message:
        `Tem certeza que deseja excluir "${form.nome}"?\n\n` +
        'Associados e demais cadastros vinculados serão desvinculados (seção/patrulha ficam em branco). ' +
        'Patrulhas/matilhas desta seção também serão excluídas.',
      confirmLabel: 'Sim, excluir',
      cancelLabel: 'Não',
      danger: true,
    })
    if (!ok) return

    setSaving(true)
    setError(null)

    const cleared = await clearSecaoRefsAndPatrulhas(
      supabase,
      empresaId,
      Number(id),
    )
    if (cleared.error) {
      setSaving(false)
      setError(cleared.error)
      return
    }

    const { error: delError } = await supabase
      .from('secao')
      .delete()
      .eq('secao_id', Number(id))
      .eq('empresa_id', empresaId)

    setSaving(false)

    if (delError) {
      setError(delError.message)
      return
    }

    navigate('/secoes', {
      state: { flashSuccess: 'Seção excluída com sucesso!' },
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
    return <div className="loading">Carregando seção…</div>
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
          <h2>{isNew ? 'Nova seção' : 'Editar seção'}</h2>
          <p>
            Grupo <strong>{empresa?.nome}</strong>
          </p>
        </div>
        <Link className="btn btn-soft" to="/secoes">
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
              value={form.ramo}
              onChange={(e) => update('ramo', e.target.value)}
              disabled={disabled}
              required
            >
              <option value="">Selecione…</option>
              {ramos.map((ramo) => (
                <option key={ramo.ramo_id} value={ramo.ramo_id}>
                  {ramo.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="field field-span-2">
            <label htmlFor="nome">Nome da seção</label>
            <input
              id="nome"
              className="input"
              value={form.nome}
              onChange={(e) => update('nome', e.target.value)}
              disabled={disabled}
              required
            />
          </div>

          <div className="field field-span-2">
            <label htmlFor="secao_foto">Foto (URL opcional)</label>
            <input
              id="secao_foto"
              className="input"
              placeholder="https://..."
              value={form.secao_foto}
              onChange={(e) => update('secao_foto', e.target.value)}
              disabled={disabled}
            />
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
          <Link className="btn btn-soft" to="/secoes">
            Cancelar
          </Link>
        </div>
      </form>
    </>
  )
}
