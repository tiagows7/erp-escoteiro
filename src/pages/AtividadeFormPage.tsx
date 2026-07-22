import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { formatMoney, parseMoneyInput } from '@/lib/despesas'
import { isAssociadoLogin, staffRamoScope } from '@/lib/roles'
import type { Ramo } from '@/types/database'

type Secao = { secao_id: number; nome: string; ramo: number | null }
type Patrulha = {
  secaonome_id: number
  nome: string
  ramo: number | null
  secao: number | null
}

const emptyForm = {
  ramo: '',
  secao: '',
  patrulha_matilha: '',
  descricao: '',
  local: '',
  valor: '0,00',
}

function unidadeLabel(ramoId: number | null): string {
  switch (ramoId) {
    case 1:
      return 'Matilha'
    case 4:
      return 'Clã'
    default:
      return 'Patrulha'
  }
}

export function AtividadeFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const { empresa, profile, hasPermission } = useAuth()
  const canWrite = hasPermission('atividades.write')
  const empresaId = empresa?.id
  const associadoLogin = isAssociadoLogin(profile)
  const ramoScoped = useMemo(() => staffRamoScope(profile), [profile])
  const toast = useToast()

  useEffect(() => {
    if (!associadoLogin || !id || id === 'novo') return
    navigate(`/atividades/${id}/contas`, { replace: true })
  }, [associadoLogin, id, navigate])

  useEffect(() => {
    if (associadoLogin && isNew) {
      navigate('/atividades', { replace: true })
    }
  }, [associadoLogin, isNew, navigate])

  const [form, setForm] = useState(emptyForm)
  const [ramos, setRamos] = useState<Ramo[]>([])
  const [secoes, setSecoes] = useState<Secao[]>([])
  const [patrulhas, setPatrulhas] = useState<Patrulha[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)

  const ramoId = form.ramo ? Number(form.ramo) : null
  const secaoId = form.secao ? Number(form.secao) : null

  const secoesDoRamo = useMemo(() => {
    if (ramoId == null) return []
    return secoes.filter((s) => s.ramo === ramoId)
  }, [ramoId, secoes])

  const patrulhasDaSecao = useMemo(() => {
    if (ramoId == null || secaoId == null) return []
    return patrulhas.filter(
      (p) => p.ramo === ramoId && p.secao === secaoId,
    )
  }, [ramoId, secaoId, patrulhas])

  const temPatrulha = patrulhasDaSecao.length > 0
  const labelUnidade = unidadeLabel(ramoId)

  useEffect(() => {
    if (ramoScoped == null || !isNew) return
    setForm((prev) => ({ ...prev, ramo: String(ramoScoped) }))
  }, [ramoScoped, isNew])

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
      supabase
        .from('secao_nome')
        .select('secaonome_id, nome, ramo, secao')
        .eq('empresa_id', empresaId)
        .order('nome'),
    ]).then(([r, s, p]) => {
      setRamos((r.data as Ramo[]) ?? [])
      setSecoes((s.data as Secao[]) ?? [])
      setPatrulhas((p.data as Patrulha[]) ?? [])
    })
  }, [empresaId])

  useEffect(() => {
    if (isNew || !empresaId) return
    let mounted = true

    void (async () => {
      const { data, error: loadError } = await supabase
        .from('atividades')
        .select(
          'atividade_id, ramo, secao, patrulha_matilha, descricao, local, valor',
        )
        .eq('atividade_id', Number(id))
        .eq('empresa_id', empresaId)
        .maybeSingle()

      if (!mounted) return
      if (loadError || !data) {
        setError(loadError?.message ?? 'Atividade não encontrada neste grupo')
        setLoading(false)
        return
      }

      if (ramoScoped != null && data.ramo != null && data.ramo !== ramoScoped) {
        setError('Esta atividade não pertence ao seu ramo.')
        setLoading(false)
        return
      }

      setForm({
        ramo: data.ramo?.toString() ?? '',
        secao: data.secao?.toString() ?? '',
        patrulha_matilha: data.patrulha_matilha?.toString() ?? '',
        descricao: data.descricao ?? '',
        local: data.local ?? '',
        valor: formatMoney(Number(data.valor ?? 0))
          .replace('R$', '')
          .trim(),
      })
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [id, isNew, empresaId, ramoScoped])

  function update(field: keyof typeof emptyForm, value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'ramo') {
        next.secao = ''
        next.patrulha_matilha = ''
      }
      if (field === 'secao') {
        next.patrulha_matilha = ''
      }
      return next
    })
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite) {
      setError('Sem permissão para alterar atividades.')
      return
    }
    if (!empresaId) {
      setError('Grupo escoteiro não carregado.')
      return
    }
    if (ramoScoped != null && !form.ramo) {
      setError('Selecione o ramo.')
      return
    }
    if (!form.descricao.trim()) {
      setError('Informe a descrição da atividade.')
      return
    }

    setSaving(true)
    setError(null)

    const ramoValue =
      ramoScoped != null
        ? ramoScoped
        : form.ramo
          ? Number(form.ramo)
          : null

    const payload = {
      empresa_id: empresaId,
      ramo: ramoValue,
      secao: form.secao ? Number(form.secao) : null,
      patrulha_matilha: form.patrulha_matilha
        ? Number(form.patrulha_matilha)
        : null,
      descricao: form.descricao.trim(),
      local: form.local.trim() || null,
      valor: parseMoneyInput(form.valor),
    }

    const result = isNew
      ? await supabase
          .from('atividades')
          .insert(payload)
          .select('atividade_id')
          .single()
      : await supabase
          .from('atividades')
          .update(payload)
          .eq('atividade_id', Number(id))
          .eq('empresa_id', empresaId)
          .select('atividade_id')
          .single()

    setSaving(false)

    if (result.error) {
      setError(result.error.message)
      return
    }

    navigate('/atividades', {
      state: {
        flash: isNew ? 'Atividade criada.' : 'Atividade atualizada.',
      },
    })
  }

  async function onDelete() {
    if (!canWrite || isNew || !empresaId) return
    const ok = await toast.confirm({
      title: 'Excluir atividade?',
      message: 'Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return

    const { error: delError } = await supabase
      .from('atividades')
      .delete()
      .eq('atividade_id', Number(id))
      .eq('empresa_id', empresaId)

    if (delError) {
      setError(delError.message)
      return
    }

    navigate('/atividades', {
      state: { flash: 'Atividade excluída.' },
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

  if (loading || associadoLogin) {
    return (
      <div className="loading">
        {associadoLogin ? 'Redirecionando…' : 'Carregando atividade…'}
      </div>
    )
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h2>{isNew ? 'Nova atividade' : 'Editar atividade'}</h2>
          <p>Defina ramo, seção e, quando houver, patrulha/matilha</p>
        </div>
        <div className="page-header-actions actions-pair">
          {!isNew ? (
            <Link
              className="btn btn-primary"
              to={`/atividades/${id}/contas`}
            >
              Contas
            </Link>
          ) : null}
          <Link className="btn btn-soft" to="/atividades">
            Voltar
          </Link>
          {!isNew && canWrite ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => void onDelete()}
            >
              Excluir
            </button>
          ) : null}
        </div>
      </header>

      {error ? (
        <AlertMessage tone="error" title="Não foi possível salvar">
          {error}
        </AlertMessage>
      ) : null}

      <section className="panel">
        <form onSubmit={onSubmit}>
          <div className="form-grid form-grid-2">
            <div className="field">
              <label htmlFor="ramo">Ramo</label>
              <select
                id="ramo"
                className="select"
                value={form.ramo}
                onChange={(e) => update('ramo', e.target.value)}
                disabled={!canWrite || ramoScoped != null}
              >
                <option value="">Grupo todo (todos os ramos)</option>
                {ramos
                  .filter((r) =>
                    ramoScoped != null
                      ? r.ramo_id === ramoScoped
                      : r.ramo_id >= 1 && r.ramo_id <= 5,
                  )
                  .map((r) => (
                    <option key={r.ramo_id} value={r.ramo_id}>
                      {r.nome}
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
                disabled={!canWrite || !form.ramo}
              >
                <option value="">
                  {form.ramo
                    ? 'Toda a seção / nenhuma'
                    : 'Grupo todo (sem seção)'}
                </option>
                {secoesDoRamo.map((s) => (
                  <option key={s.secao_id} value={s.secao_id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </div>

            {temPatrulha ? (
              <div className="field">
                <label htmlFor="patrulha_matilha">{labelUnidade}</label>
                <select
                  id="patrulha_matilha"
                  className="select"
                  value={form.patrulha_matilha}
                  onChange={(e) => update('patrulha_matilha', e.target.value)}
                  disabled={!canWrite || !form.secao}
                >
                  <option value="">Toda a seção (opcional)</option>
                  {patrulhasDaSecao.map((p) => (
                    <option key={p.secaonome_id} value={p.secaonome_id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="field field-span-2">
              <label htmlFor="descricao">Descrição da atividade</label>
              <input
                id="descricao"
                className="input"
                value={form.descricao}
                onChange={(e) => update('descricao', e.target.value)}
                disabled={!canWrite}
                maxLength={200}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="local">Local</label>
              <input
                id="local"
                className="input"
                value={form.local}
                onChange={(e) => update('local', e.target.value)}
                disabled={!canWrite}
                maxLength={120}
              />
            </div>

            <div className="field">
              <label htmlFor="valor">Valor da atividade</label>
              <input
                id="valor"
                className="input"
                inputMode="decimal"
                value={form.valor}
                onChange={(e) => update('valor', e.target.value)}
                disabled={!canWrite}
              />
            </div>
          </div>

          <div className="form-actions">
            {canWrite ? (
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            ) : (
              <p className="muted">Modo leitura — sem permissão para salvar.</p>
            )}
            <Link className="btn btn-soft" to="/atividades">
              Cancelar
            </Link>
          </div>
        </form>
      </section>
    </>
  )
}
