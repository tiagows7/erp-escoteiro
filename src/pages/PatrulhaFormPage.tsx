import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import type { Ramo } from '@/types/database'

type Secao = {
  secao_id: number
  nome: string
  ramo: number | null
}

const emptyForm = {
  nome: '',
  ramo: '',
  secao: '',
  secaonome_foto: '',
}

export function PatrulhaFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const { empresa, hasPermission } = useAuth()
  const canWrite = hasPermission('estrutura.write')
  const empresaId = empresa?.id
  const toast = useToast()

  const [form, setForm] = useState(emptyForm)
  const [ramos, setRamos] = useState<Ramo[]>([])
  const [secoes, setSecoes] = useState<Secao[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)

  const secoesDoRamo = useMemo(() => {
    if (!form.ramo) return []
    return secoes.filter((s) => s.ramo === Number(form.ramo))
  }, [form.ramo, secoes])

  useEffect(() => {
    if (!empresaId) return
    void Promise.all([
      supabase
        .from('ramos')
        .select('ramo_id, nome, idade_inicio, idade_fim')
        .order('ramo_id'),
      supabase
        .from('secao')
        .select('secao_id, nome, ramo')
        .eq('empresa_id', empresaId)
        .order('nome'),
    ]).then(([r, s]) => {
      setRamos((r.data as Ramo[]) ?? [])
      setSecoes((s.data as Secao[]) ?? [])
    })
  }, [empresaId])

  useEffect(() => {
    if (isNew || !empresaId) return
    let mounted = true

    void (async () => {
      const { data, error: loadError } = await supabase
        .from('secao_nome')
        .select('secaonome_id, nome, ramo, secao, secaonome_foto')
        .eq('secaonome_id', Number(id))
        .eq('empresa_id', empresaId)
        .maybeSingle()

      if (!mounted) return
      if (loadError || !data) {
        setError(
          loadError?.message ?? 'Patrulha/matilha não encontrada neste grupo',
        )
        setLoading(false)
        return
      }

      setForm({
        nome: data.nome ?? '',
        ramo: data.ramo?.toString() ?? '',
        secao: data.secao?.toString() ?? '',
        secaonome_foto: data.secaonome_foto ?? '',
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
      setError('Seu usuário não tem permissão para alterar patrulhas.')
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
    if (!form.secao) {
      setError('Informe a seção.')
      return
    }
    if (!form.nome.trim()) {
      setError('Informe o nome da patrulha/matilha.')
      return
    }

    const ramoId = Number(form.ramo)
    const secaoId = Number(form.secao)
    const secao = secoes.find((s) => s.secao_id === secaoId)
    if (!secao || secao.ramo !== ramoId) {
      setError('A seção informada não pertence ao ramo selecionado.')
      return
    }

    setSaving(true)
    setError(null)

    const payload = {
      empresa_id: empresaId,
      nome: form.nome.trim().toUpperCase(),
      ramo: ramoId,
      secao: secaoId,
      secaonome_foto: form.secaonome_foto.trim() || null,
    }

    const result = isNew
      ? await supabase
          .from('secao_nome')
          .insert(payload)
          .select('secaonome_id')
          .single()
      : await supabase
          .from('secao_nome')
          .update(payload)
          .eq('secaonome_id', Number(id))
          .eq('empresa_id', empresaId)
          .select('secaonome_id')
          .single()

    setSaving(false)

    if (result.error) {
      setError(result.error.message)
      return
    }

    navigate('/patrulhas', {
      state: { flashSuccess: 'Salvo com sucesso!' },
    })
  }

  async function onDelete() {
    if (!canWrite || !empresaId || isNew) return
    const ok = await toast.confirm({
      title: 'Excluir patrulha?',
      message: `Tem certeza que deseja excluir "${form.nome}"?`,
      confirmLabel: 'Sim, excluir',
      cancelLabel: 'Não',
      danger: true,
    })
    if (!ok) return

    const { error: delError } = await supabase
      .from('secao_nome')
      .delete()
      .eq('secaonome_id', Number(id))
      .eq('empresa_id', empresaId)

    if (delError) {
      setError(delError.message)
      return
    }

    navigate('/patrulhas', {
      state: { flashSuccess: 'Patrulha/matilha excluída com sucesso!' },
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
    return <div className="loading">Carregando patrulha…</div>
  }

  const disabled = saving || !canWrite

  return (
    <>
      <header className="page-header">
        <div>
          <h2>{isNew ? 'Nova patrulha / matilha' : 'Editar patrulha / matilha'}</h2>
          <p>
            Grupo <strong>{empresa?.nome}</strong>
          </p>
        </div>
        <Link className="btn btn-soft" to="/patrulhas">
          Voltar
        </Link>
      </header>

      {secoes.length === 0 ? (
        <AlertMessage tone="info" title="Cadastre as seções primeiro">
          Vá em <Link to="/secoes">Seções</Link> antes de criar patrulhas.
        </AlertMessage>
      ) : null}

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
              onChange={(e) => {
                update('ramo', e.target.value)
                update('secao', '')
              }}
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

          <div className="field">
            <label htmlFor="secao">Seção</label>
            <select
              id="secao"
              className="select"
              value={form.secao}
              onChange={(e) => update('secao', e.target.value)}
              disabled={disabled || !form.ramo}
              required
            >
              <option value="">Selecione…</option>
              {secoesDoRamo.map((secao) => (
                <option key={secao.secao_id} value={secao.secao_id}>
                  {secao.nome}
                </option>
              ))}
            </select>
            {!form.ramo ? (
              <span className="field-hint">Selecione o ramo primeiro</span>
            ) : secoesDoRamo.length === 0 ? (
              <span className="field-hint">
                Nenhuma seção neste ramo para o seu grupo
              </span>
            ) : null}
          </div>

          <div className="field field-span-2">
            <label htmlFor="nome">Nome</label>
            <input
              id="nome"
              className="input"
              placeholder="Ex.: ÁGUIA, LOBISOMEM…"
              value={form.nome}
              onChange={(e) => update('nome', e.target.value)}
              disabled={disabled}
              required
            />
          </div>

          <div className="field field-span-2">
            <label htmlFor="secaonome_foto">Foto (URL opcional)</label>
            <input
              id="secaonome_foto"
              className="input"
              placeholder="https://..."
              value={form.secaonome_foto}
              onChange={(e) => update('secaonome_foto', e.target.value)}
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
          <Link className="btn btn-soft" to="/patrulhas">
            Cancelar
          </Link>
        </div>
      </form>
    </>
  )
}
