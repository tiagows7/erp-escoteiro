import { useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { isAssociadoLogin } from '@/lib/roles'

export const SUGESTAO_SITUACOES = [
  'pendente',
  'sera_atendida',
  'feita',
  'nao_sera_feita',
] as const

export type SugestaoSituacao = (typeof SUGESTAO_SITUACOES)[number]

export function sugestaoSituacaoLabel(s: SugestaoSituacao | string | null) {
  switch (s) {
    case 'sera_atendida':
      return 'Será atendida'
    case 'feita':
      return 'Já foi feita'
    case 'nao_sera_feita':
      return 'Não será feita'
    case 'pendente':
    default:
      return 'Pendente'
  }
}

type SugestaoRow = {
  sugestao_id: number
  titulo: string
  descricao: string
  empresa_nome: string
  user_nome?: string | null
  user_email?: string | null
  created_at: string
  situacao: SugestaoSituacao
  motivo: string | null
  avaliacao_em: string | null
}

type EditDraft = {
  situacao: SugestaoSituacao
  motivo: string
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
  const [drafts, setDrafts] = useState<Record<number, EditDraft>>({})
  const [savingId, setSavingId] = useState<number | null>(null)

  async function loadMine() {
    if (!user?.id) {
      setMine([])
      setLoadingMine(false)
      return
    }
    setLoadingMine(true)
    let query = supabase
      .from('sugestao_melhoria')
      .select(
        'sugestao_id, titulo, descricao, empresa_nome, user_nome, user_email, created_at, situacao, motivo, avaliacao_em',
      )
      .order('created_at', { ascending: false })
      .limit(isSuperAdmin ? 100 : 30)

    if (!isSuperAdmin) {
      query = query.eq('user_id', user.id)
    }

    const { data, error: qErr } = await query
    if (qErr) {
      setError(qErr.message)
      setMine([])
    } else {
      const rows = (data as SugestaoRow[]) ?? []
      setMine(rows)
      if (isSuperAdmin) {
        const next: Record<number, EditDraft> = {}
        for (const row of rows) {
          next[row.sugestao_id] = {
            situacao: row.situacao || 'pendente',
            motivo: row.motivo ?? '',
          }
        }
        setDrafts(next)
      }
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
      situacao: 'pendente',
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

  async function salvarAvaliacao(row: SugestaoRow) {
    if (!isSuperAdmin || !user?.id) return
    const draft = drafts[row.sugestao_id]
    if (!draft) return

    const situacao = draft.situacao
    const motivo = draft.motivo.trim()

    if (situacao !== 'pendente' && motivo.length < 3) {
      setError(
        'Informe o motivo da avaliação (obrigatório quando a situação não é pendente).',
      )
      return
    }

    setSavingId(row.sugestao_id)
    setError(null)

    const { error: updError } = await supabase
      .from('sugestao_melhoria')
      .update({
        situacao,
        motivo: situacao === 'pendente' ? null : motivo.slice(0, 2000),
        avaliacao_em: new Date().toISOString(),
        avaliacao_por: user.id,
      })
      .eq('sugestao_id', row.sugestao_id)

    setSavingId(null)
    if (updError) {
      setError(updError.message)
      return
    }

    toast.success('Avaliação salva.')
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

      {!isSuperAdmin ? (
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
      ) : error ? (
        <AlertMessage tone="error" title="Atenção">
          {error}
        </AlertMessage>
      ) : null}

      <section className="panel" style={{ marginTop: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>
          {isSuperAdmin ? 'Sugestões recebidas' : 'Minhas sugestões'}
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
                  {isSuperAdmin ? <th>Grupo / Usuário</th> : null}
                  <th>Título</th>
                  <th>Descrição</th>
                  <th>Situação</th>
                  <th>Motivo</th>
                  {isSuperAdmin ? <th></th> : null}
                </tr>
              </thead>
              <tbody>
                {mine.map((row) => {
                  const draft = drafts[row.sugestao_id]
                  return (
                    <tr key={row.sugestao_id}>
                      <td>
                        {new Date(row.created_at).toLocaleString('pt-BR')}
                      </td>
                      {isSuperAdmin ? (
                        <td>
                          <div>{row.empresa_nome}</div>
                          <div className="muted" style={{ fontSize: '0.85em' }}>
                            {row.user_nome ?? '—'}
                            {row.user_email ? ` · ${row.user_email}` : ''}
                          </div>
                        </td>
                      ) : null}
                      <td>{row.titulo}</td>
                      <td style={{ whiteSpace: 'pre-wrap', maxWidth: 280 }}>
                        {row.descricao}
                      </td>
                      <td>
                        {isSuperAdmin && draft ? (
                          <select
                            className="select"
                            value={draft.situacao}
                            onChange={(ev) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [row.sugestao_id]: {
                                  ...prev[row.sugestao_id],
                                  situacao: ev.target
                                    .value as SugestaoSituacao,
                                },
                              }))
                            }
                          >
                            {SUGESTAO_SITUACOES.map((s) => (
                              <option key={s} value={s}>
                                {sugestaoSituacaoLabel(s)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <strong>
                            {sugestaoSituacaoLabel(row.situacao)}
                          </strong>
                        )}
                      </td>
                      <td style={{ minWidth: 180 }}>
                        {isSuperAdmin && draft ? (
                          <textarea
                            className="input"
                            rows={3}
                            value={draft.motivo}
                            onChange={(ev) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [row.sugestao_id]: {
                                  ...prev[row.sugestao_id],
                                  motivo: ev.target.value,
                                },
                              }))
                            }
                            placeholder={
                              draft.situacao === 'pendente'
                                ? 'Motivo (opcional enquanto pendente)'
                                : 'Motivo da decisão (obrigatório)'
                            }
                            maxLength={2000}
                          />
                        ) : row.motivo ? (
                          <span style={{ whiteSpace: 'pre-wrap' }}>
                            {row.motivo}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      {isSuperAdmin ? (
                        <td>
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={savingId === row.sugestao_id}
                            onClick={() => void salvarAvaliacao(row)}
                          >
                            {savingId === row.sugestao_id
                              ? 'Salvando…'
                              : 'Salvar'}
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
