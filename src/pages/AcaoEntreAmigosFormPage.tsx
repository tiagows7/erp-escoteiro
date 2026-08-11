import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { staffRamoScope } from '@/lib/roles'
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
  nome: '',
  numero_inicial: '1',
  numero_final: '100',
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

export function AcaoEntreAmigosFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const { empresa, profile, hasPermission } = useAuth()
  const canWrite = hasPermission('vendas.write')
  const empresaId = empresa?.id
  const ramoScoped = useMemo(() => staffRamoScope(profile), [profile])
  const toast = useToast()

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
    return patrulhas.filter((p) => p.ramo === ramoId && p.secao === secaoId)
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
        .from('acao_entre_amigos')
        .select(
          'acao_id, ramo, secao, patrulha_matilha, nome, numero_inicial, numero_final',
        )
        .eq('acao_id', Number(id))
        .eq('empresa_id', empresaId)
        .maybeSingle()

      if (!mounted) return
      if (loadError || !data) {
        setError(loadError?.message ?? 'Ação não encontrada neste grupo')
        setLoading(false)
        return
      }

      if (ramoScoped != null && data.ramo != null && data.ramo !== ramoScoped) {
        setError('Esta ação não pertence ao seu ramo.')
        setLoading(false)
        return
      }

      setForm({
        ramo: data.ramo?.toString() ?? '',
        secao: data.secao?.toString() ?? '',
        patrulha_matilha: data.patrulha_matilha?.toString() ?? '',
        nome: data.nome ?? '',
        numero_inicial: String(data.numero_inicial ?? 1),
        numero_final: String(data.numero_final ?? 1),
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
      setError('Sem permissão para alterar ações entre amigos.')
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
    if (!form.nome.trim()) {
      setError('Informe o nome da ação.')
      return
    }

    const numeroInicial = Number(String(form.numero_inicial).replace(/\D/g, ''))
    const numeroFinal = Number(String(form.numero_final).replace(/\D/g, ''))
    if (!Number.isFinite(numeroInicial) || !Number.isFinite(numeroFinal)) {
      setError('Informe número inicial e final válidos.')
      return
    }
    if (numeroInicial < 0) {
      setError('O número inicial não pode ser negativo.')
      return
    }
    if (numeroFinal < numeroInicial) {
      setError('O número final deve ser maior ou igual ao inicial.')
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
      nome: form.nome.trim(),
      numero_inicial: numeroInicial,
      numero_final: numeroFinal,
    }

    const result = isNew
      ? await supabase
          .from('acao_entre_amigos')
          .insert(payload)
          .select('acao_id')
          .single()
      : await supabase
          .from('acao_entre_amigos')
          .update(payload)
          .eq('acao_id', Number(id))
          .eq('empresa_id', empresaId)
          .select('acao_id')
          .single()

    setSaving(false)

    if (result.error) {
      setError(result.error.message)
      return
    }

    navigate('/vendas/acao-entre-amigos', {
      state: { flashSuccess: 'Salvo com sucesso!' },
    })
  }

  async function onDelete() {
    if (!canWrite || isNew || !empresaId) return
    const ok = await toast.confirm({
      title: 'Excluir ação entre amigos?',
      message: 'Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return

    const { error: delError } = await supabase
      .from('acao_entre_amigos')
      .delete()
      .eq('acao_id', Number(id))
      .eq('empresa_id', empresaId)

    if (delError) {
      setError(delError.message)
      return
    }

    navigate('/vendas/acao-entre-amigos', {
      state: { flashSuccess: 'Ação excluída com sucesso!' },
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
    return <div className="loading">Carregando ação…</div>
  }

  const disabled = saving || !canWrite
  const qtdePreview = (() => {
    const a = Number(String(form.numero_inicial).replace(/\D/g, ''))
    const b = Number(String(form.numero_final).replace(/\D/g, ''))
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null
    return b - a + 1
  })()

  return (
    <>
      <header className="page-header">
        <div>
          <h2>{isNew ? 'Nova ação entre amigos' : 'Editar ação entre amigos'}</h2>
          <p>Nome, faixa de números e escopo (ramo / seção / patrulha)</p>
        </div>
        <div className="page-header-actions actions-pair">
          <Link className="btn btn-soft" to="/vendas/acao-entre-amigos">
            Voltar
          </Link>
        </div>
      </header>

      <form className="panel" onSubmit={(e) => void onSubmit(e)}>
        {error ? (
          <AlertMessage tone="error" title="Atenção">
            {error}
          </AlertMessage>
        ) : null}

        <div className="form-grid form-grid-2">
          <div className="field field-span-2">
            <label htmlFor="nome">Nome da ação</label>
            <input
              id="nome"
              className="input"
              value={form.nome}
              onChange={(e) => update('nome', e.target.value)}
              disabled={disabled}
              required
              placeholder="Ex.: Rifa da Alcateia 2026"
            />
          </div>

          <div className="field">
            <label htmlFor="ramo">Ramo</label>
            <select
              id="ramo"
              className="select"
              value={form.ramo}
              onChange={(e) => update('ramo', e.target.value)}
              disabled={disabled || ramoScoped != null}
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
              disabled={disabled || !form.ramo}
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
                disabled={disabled || !form.secao}
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

          <div className="field">
            <label htmlFor="numero_inicial">Número inicial</label>
            <input
              id="numero_inicial"
              className="input"
              inputMode="numeric"
              value={form.numero_inicial}
              onChange={(e) => update('numero_inicial', e.target.value)}
              disabled={disabled}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="numero_final">Número final</label>
            <input
              id="numero_final"
              className="input"
              inputMode="numeric"
              value={form.numero_final}
              onChange={(e) => update('numero_final', e.target.value)}
              disabled={disabled}
              required
            />
            {qtdePreview != null ? (
              <span className="field-hint">{qtdePreview} número(s) na faixa</span>
            ) : null}
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
          <Link className="btn btn-soft" to="/vendas/acao-entre-amigos">
            Cancelar
          </Link>
        </div>
      </form>
    </>
  )
}
