import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertMessage } from '@/components/AlertMessage'
import { WaitingOverlay } from '@/components/WaitingOverlay'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { useGestorSolicitacoes } from '@/hooks/useGestorSolicitacoes'
import { supabase } from '@/lib/supabase'
import {
  isSolicitacaoSituacao,
  type SolicitacaoSituacao,
} from '@/lib/solicitacaoSituacao'
import type { Ramo } from '@/types/database'

type Secao = {
  secao_id: number
  nome: string
  ramo: number | null
}

function todayIso() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const emptyForm = {
  ramo_id: '',
  secao_id: '',
  texto: '',
  data_solicitacao: todayIso(),
  situacao: 'em_andamento' as SolicitacaoSituacao,
  data_resolvida: '',
}

export function SolicitacaoFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const { empresa, profile, user, hasPermission } = useAuth()
  const toast = useToast()
  const empresaId = empresa?.id
  const canWrite = hasPermission('solicitacoes.write')
  const { loading: gestorLoading, gestor } = useGestorSolicitacoes()

  const [form, setForm] = useState(emptyForm)
  const [ramos, setRamos] = useState<Ramo[]>([])
  const [secoes, setSecoes] = useState<Secao[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)

  const secoesDoRamo = useMemo(() => {
    if (!form.ramo_id) return []
    return secoes.filter((s) => s.ramo === Number(form.ramo_id))
  }, [form.ramo_id, secoes])

  useEffect(() => {
    if (!isNew) return
    setForm((prev) => ({
      ...prev,
      ramo_id: profile?.codigo_ramo ? String(profile.codigo_ramo) : prev.ramo_id,
      secao_id: profile?.codigo_secao
        ? String(profile.codigo_secao)
        : prev.secao_id,
    }))
  }, [isNew, profile?.codigo_ramo, profile?.codigo_secao])

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
        .from('solicitacoes')
        .select(
          'solicitacao_id, ramo_id, secao_id, texto, data_solicitacao, situacao, resolvida, data_resolvida',
        )
        .eq('solicitacao_id', Number(id))
        .eq('empresa_id', empresaId)
        .maybeSingle()

      if (!mounted) return
      if (loadError || !data) {
        setError(loadError?.message ?? 'Solicitação não encontrada.')
        setLoading(false)
        return
      }

      setForm({
        ramo_id: String(data.ramo_id ?? ''),
        secao_id: String(data.secao_id ?? ''),
        texto: data.texto ?? '',
        data_solicitacao: data.data_solicitacao?.slice(0, 10) ?? todayIso(),
        situacao: isSolicitacaoSituacao(data.situacao)
          ? data.situacao
          : data.resolvida
            ? 'realizada'
            : 'em_andamento',
        data_resolvida: data.data_resolvida?.slice(0, 10) ?? '',
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
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'ramo_id') next.secao_id = ''
      if (key === 'situacao' && value === 'em_andamento') {
        next.data_resolvida = ''
      }
      if (
        key === 'situacao' &&
        value !== 'em_andamento' &&
        !next.data_resolvida
      ) {
        next.data_resolvida = todayIso()
      }
      return next
    })
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite || !empresaId) return

    const ramoId = Number(form.ramo_id)
    const secaoId = Number(form.secao_id)
    const texto = form.texto.trim()
    if (!ramoId || !secaoId || !texto) {
      setError('Informe o ramo, a seção e o texto da solicitação.')
      return
    }
    if (
      !isNew &&
      gestor &&
      form.situacao !== 'em_andamento' &&
      !form.data_resolvida
    ) {
      setError('Informe a data da situação.')
      return
    }

    setSaving(true)
    setError(null)

    const payload = {
      empresa_id: empresaId,
      ramo_id: ramoId,
      secao_id: secaoId,
      texto,
      data_solicitacao: form.data_solicitacao || todayIso(),
      situacao: isNew ? 'em_andamento' : form.situacao,
      resolvida: !isNew && form.situacao === 'realizada',
      data_resolvida:
        isNew || form.situacao === 'em_andamento' ? null : form.data_resolvida,
    }

    if (isNew) {
      const { data, error: insertError } = await supabase
        .from('solicitacoes')
        .insert({
          ...payload,
          user_id: user?.id ?? null,
          user_nome: profile?.nome ?? null,
        })
        .select('solicitacao_id')
        .single()

      setSaving(false)
      if (insertError || !data) {
        setError(
          insertError?.message ?? 'Não foi possível salvar a solicitação.',
        )
        return
      }
      if (gestor) {
        navigate(`/solicitacoes/${data.solicitacao_id}`, {
          state: { flashSuccess: 'Solicitação registrada!' },
        })
        return
      }
      toast.success(
        'Solicitação registrada',
        'O pedido foi enviado para o grupo.',
      )
      setForm({
        ...emptyForm,
        data_solicitacao: todayIso(),
        ramo_id: profile?.codigo_ramo ? String(profile.codigo_ramo) : '',
        secao_id: profile?.codigo_secao ? String(profile.codigo_secao) : '',
      })
      return
    }

    if (!gestor) {
      setSaving(false)
      setError('Só dirigentes ou usuários sem ramo alteram a solicitação.')
      return
    }

    const { error: updateError } = await supabase
      .from('solicitacoes')
      .update(payload)
      .eq('solicitacao_id', Number(id))
      .eq('empresa_id', empresaId)

    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    toast.success('Solicitação salva!')
  }

  async function excluir() {
    if (!gestor || !empresaId || isNew) return
    if (!window.confirm('Excluir esta solicitação?')) return
    setSaving(true)
    const { error: delError } = await supabase
      .from('solicitacoes')
      .delete()
      .eq('solicitacao_id', Number(id))
      .eq('empresa_id', empresaId)
    setSaving(false)
    if (delError) {
      setError(delError.message)
      return
    }
    navigate('/solicitacoes', {
      state: { flashSuccess: 'Solicitação excluída.' },
    })
  }

  const podeEditar = isNew ? canWrite : gestor

  if (gestorLoading || loading) {
    return <div className="loading">Carregando solicitação…</div>
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

  return (
    <>
      <WaitingOverlay open={saving} message="Salvando solicitação…" />
      <header className="page-header">
        <div>
          <h2>{isNew ? 'Nova solicitação' : 'Solicitação'}</h2>
          <p>
            Ramo, seção e descrição do pedido —{' '}
            <strong>{empresa?.nome}</strong>
          </p>
        </div>
        <Link
          className="btn btn-soft"
          to={gestor ? '/solicitacoes' : '/dashboard'}
        >
          Voltar
        </Link>
      </header>

      <section className="panel">
        {error ? (
          <AlertMessage tone="error" title="Atenção">
            {error}
          </AlertMessage>
        ) : null}

        <form className="form-grid" onSubmit={(e) => void onSubmit(e)}>
          <div className="field">
            <label htmlFor="sol_ramo">Ramo</label>
            <select
              id="sol_ramo"
              className="select"
              value={form.ramo_id}
              disabled={!podeEditar}
              onChange={(e) => update('ramo_id', e.target.value)}
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
            <label htmlFor="sol_secao">Seção</label>
            <select
              id="sol_secao"
              className="select"
              value={form.secao_id}
              disabled={!podeEditar || !form.ramo_id}
              onChange={(e) => update('secao_id', e.target.value)}
              required
            >
              <option value="">
                {form.ramo_id ? 'Selecione…' : 'Escolha o ramo primeiro'}
              </option>
              {secoesDoRamo.map((secao) => (
                <option key={secao.secao_id} value={secao.secao_id}>
                  {secao.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="sol_data">Data da solicitação</label>
            <input
              id="sol_data"
              className="input"
              type="date"
              value={form.data_solicitacao}
              disabled={!podeEditar}
              onChange={(e) => update('data_solicitacao', e.target.value)}
              required
            />
          </div>

          <div className="field field-span-2">
            <label htmlFor="sol_texto">Solicitação</label>
            <textarea
              id="sol_texto"
              className="input"
              rows={5}
              value={form.texto}
              disabled={!podeEditar}
              onChange={(e) => update('texto', e.target.value)}
              placeholder="Descreva o pedido…"
              required
            />
          </div>

          {!isNew && gestor ? (
            <>
              <div className="field">
                <label htmlFor="sol_situacao">Situação</label>
                <select
                  id="sol_situacao"
                  className="select"
                  value={form.situacao}
                  onChange={(e) =>
                    update('situacao', e.target.value as SolicitacaoSituacao)
                  }
                >
                  <option value="em_andamento">Em andamento</option>
                  <option value="realizada">Realizada</option>
                  <option value="nao_realizada">Não realizada</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="sol_data_resolvida">Data da situação</label>
                <input
                  id="sol_data_resolvida"
                  className="input"
                  type="date"
                  value={form.data_resolvida}
                  disabled={form.situacao === 'em_andamento'}
                  onChange={(e) => update('data_resolvida', e.target.value)}
                />
              </div>
            </>
          ) : null}

          {podeEditar ? (
            <div className="form-actions field-span-2">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              {!isNew && gestor ? (
                <button
                  className="btn btn-danger"
                  type="button"
                  disabled={saving}
                  onClick={() => void excluir()}
                >
                  Excluir
                </button>
              ) : null}
              <Link
                className="btn btn-soft"
                to={gestor ? '/solicitacoes' : '/dashboard'}
              >
                Cancelar
              </Link>
            </div>
          ) : null}
        </form>
      </section>
    </>
  )
}
