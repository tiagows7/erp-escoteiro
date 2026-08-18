import { useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { isAssociadoLogin } from '@/lib/roles'

type SugestaoRow = {
  sugestao_id: number
  titulo: string
  descricao: string
  empresa_nome: string
  created_at: string
}

export function SugestoesMelhoriaPage() {
  const { profile, empresa, user, isSuperAdmin } = useAuth()
  const toast = useToast()
  const emailLogin = !isAssociadoLogin(profile)

  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mine, setMine] = useState<SugestaoRow[]>([])
  const [loadingMine, setLoadingMine] = useState(true)

  async function loadMine() {
    if (!user?.id) {
      setMine([])
      setLoadingMine(false)
      return
    }
    setLoadingMine(true)
    let query = supabase
      .from('sugestao_melhoria')
      .select('sugestao_id, titulo, descricao, empresa_nome, created_at')
      .order('created_at', { ascending: false })
      .limit(isSuperAdmin ? 50 : 20)

    if (!isSuperAdmin) {
      query = query.eq('user_id', user.id)
    }

    const { data, error: qErr } = await query
    if (qErr) {
      setError(qErr.message)
      setMine([])
    } else {
      setMine((data as SugestaoRow[]) ?? [])
    }
    setLoadingMine(false)
  }

  useEffect(() => {
    if (!emailLogin) return
    void loadMine()
  }, [emailLogin, user?.id, isSuperAdmin])

  if (!emailLogin) {
    return <Navigate to="/dashboard" replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const t = titulo.trim()
    const d = descricao.trim()
    if (!t || !d) {
      setError('Informe um título e a descrição da sugestão.')
      return
    }
    if (d.length < 10) {
      setError('Descreva a melhoria com pelo menos 10 caracteres.')
      return
    }

    setSaving(true)
    setError(null)

    const { error: insertError } = await supabase.from('sugestao_melhoria').insert({
      empresa_id: empresa?.id ?? null,
      empresa_nome: (empresa?.nome ?? 'Plataforma').trim() || 'Plataforma',
      user_id: user?.id ?? null,
      user_nome: (profile?.nome ?? 'Usuário').trim() || 'Usuário',
      user_email: (profile?.email ?? user?.email ?? null)?.trim() || null,
      titulo: t.slice(0, 200),
      descricao: d.slice(0, 5000),
    })

    setSaving(false)
    if (insertError) {
      setError(insertError.message)
      return
    }

    setTitulo('')
    setDescricao('')
    toast.success('Sugestão enviada. Obrigado!')
    void loadMine()
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h2>Sugestões de melhorias</h2>
          <p>
            Peça alterações ou melhorias no sistema. Seu nome e o grupo serão
            registrados junto com a sugestão.
          </p>
        </div>
      </header>

      <form className="panel" onSubmit={(ev) => void onSubmit(ev)}>
        {error ? (
          <AlertMessage tone="error" title="Atenção">
            {error}
          </AlertMessage>
        ) : null}

        <p className="muted" style={{ marginBottom: '0.85rem' }}>
          Grupo: <strong>{empresa?.nome ?? 'Plataforma'}</strong>
          {' · '}
          Usuário: <strong>{profile?.nome ?? '—'}</strong>
          {profile?.email || user?.email
            ? ` (${profile?.email ?? user?.email})`
            : null}
        </p>

        <div className="form-grid">
          <div className="field field-span-2">
            <label htmlFor="sugestao-titulo">Título</label>
            <input
              id="sugestao-titulo"
              className="input"
              value={titulo}
              onChange={(ev) => setTitulo(ev.target.value)}
              maxLength={200}
              required
              placeholder="Ex.: Relatório de mensalidades por seção"
            />
          </div>
          <div className="field field-span-2">
            <label htmlFor="sugestao-descricao">Descrição</label>
            <textarea
              id="sugestao-descricao"
              className="input"
              rows={6}
              value={descricao}
              onChange={(ev) => setDescricao(ev.target.value)}
              maxLength={5000}
              required
              placeholder="Descreva o que gostaria que mudasse ou fosse adicionado…"
            />
          </div>
        </div>

        <div className="form-actions" style={{ marginTop: '1rem' }}>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={saving}
          >
            {saving ? 'Enviando…' : 'Enviar sugestão'}
          </button>
        </div>
      </form>

      <section className="panel" style={{ marginTop: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>
          {isSuperAdmin ? 'Últimas sugestões' : 'Minhas sugestões'}
        </h3>
        {loadingMine ? (
          <p className="muted">Carregando…</p>
        ) : mine.length === 0 ? (
          <p className="muted">Nenhuma sugestão enviada ainda.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Data</th>
                  {isSuperAdmin ? <th>Grupo</th> : null}
                  <th>Título</th>
                  <th>Descrição</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((row) => (
                  <tr key={row.sugestao_id}>
                    <td>
                      {new Date(row.created_at).toLocaleString('pt-BR')}
                    </td>
                    {isSuperAdmin ? <td>{row.empresa_nome}</td> : null}
                    <td>{row.titulo}</td>
                    <td style={{ whiteSpace: 'pre-wrap' }}>{row.descricao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
