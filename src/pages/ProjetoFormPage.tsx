import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { formatMoney, parseMoneyInput } from '@/lib/despesas'
import { staffRamoScope } from '@/lib/roles'
import type { Ramo } from '@/types/database'

type Secao = { secao_id: number; nome: string; ramo: number | null }

const emptyForm = {
  ramo: '',
  secao: '',
  descricao: '',
  valor: '0,00',
}

export function ProjetoFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const { empresa, profile, hasPermission } = useAuth()
  const canWrite = hasPermission('projetos.write')
  const canFinanceiro = hasPermission('financeiro.write')
  const empresaId = empresa?.id
  const ramoScoped = useMemo(() => staffRamoScope(profile), [profile])
  const toast = useToast()

  const [form, setForm] = useState(emptyForm)
  const [ramos, setRamos] = useState<Ramo[]>([])
  const [secoes, setSecoes] = useState<Secao[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)

  const ramoId = form.ramo ? Number(form.ramo) : null

  const secoesDoRamo = useMemo(() => {
    if (ramoId == null) return []
    return secoes.filter((s) => s.ramo === ramoId)
  }, [ramoId, secoes])

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
        .from('projetos')
        .select('projeto_id, ramo, secao, descricao, valor')
        .eq('projeto_id', Number(id))
        .eq('empresa_id', empresaId)
        .maybeSingle()

      if (!mounted) return
      if (loadError || !data) {
        setError(loadError?.message ?? 'Projeto não encontrado neste grupo')
        setLoading(false)
        return
      }

      if (ramoScoped != null && data.ramo != null && data.ramo !== ramoScoped) {
        setError('Este projeto não pertence ao seu ramo.')
        setLoading(false)
        return
      }

      setForm({
        ramo: data.ramo?.toString() ?? '',
        secao: data.secao?.toString() ?? '',
        descricao: data.descricao ?? '',
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
      if (field === 'ramo') next.secao = ''
      return next
    })
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite) {
      setError('Sem permissão para alterar projetos.')
      return
    }
    if (!empresaId) {
      setError('Grupo escoteiro não carregado.')
      return
    }
    if (!form.descricao.trim()) {
      setError('Informe a descrição do projeto.')
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
      descricao: form.descricao.trim(),
      valor: parseMoneyInput(form.valor),
    }

    const result = isNew
      ? await supabase
          .from('projetos')
          .insert(payload)
          .select('projeto_id')
          .single()
      : await supabase
          .from('projetos')
          .update(payload)
          .eq('projeto_id', Number(id))
          .eq('empresa_id', empresaId)
          .select('projeto_id')
          .single()

    setSaving(false)

    if (result.error) {
      setError(result.error.message)
      return
    }

    navigate('/projetos', {
      state: { flashSuccess: 'Salvo com sucesso!' },
    })
  }

  async function onDelete() {
    if (!canWrite || isNew || !empresaId) return
    const ok = await toast.confirm({
      title: 'Excluir projeto?',
      message: 'Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return

    const { error: delError } = await supabase
      .from('projetos')
      .delete()
      .eq('projeto_id', Number(id))
      .eq('empresa_id', empresaId)

    if (delError) {
      setError(delError.message)
      return
    }

    navigate('/projetos', {
      state: { flashSuccess: 'Projeto excluído com sucesso!' },
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
    return <div className="loading">Carregando projeto…</div>
  }

  const disabled = saving || !canWrite

  return (
    <>
      <header className="page-header">
        <div>
          <h2>{isNew ? 'Novo projeto' : 'Editar projeto'}</h2>
          <p>Descrição, ramo/grupo, seção e valor</p>
        </div>
        <div className="page-header-actions actions-pair">
          {!isNew && canFinanceiro ? (
            <>
              <Link
                className="btn btn-accent"
                to={`/despesas/inclusao/novo?projeto_id=${id}`}
              >
                Lançar despesa
              </Link>
              <Link
                className="btn btn-primary"
                to={`/receitas/inclusao/novo?projeto_id=${id}`}
              >
                Lançar receita
              </Link>
            </>
          ) : null}
          <Link className="btn btn-soft" to="/projetos">
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
            <label htmlFor="descricao">Descrição do projeto</label>
            <input
              id="descricao"
              className="input"
              value={form.descricao}
              onChange={(e) => update('descricao', e.target.value)}
              disabled={disabled}
              required
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
                {form.ramo ? 'Todas / nenhuma' : 'Selecione um ramo primeiro'}
              </option>
              {secoesDoRamo.map((s) => (
                <option key={s.secao_id} value={s.secao_id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="valor">Valor do projeto</label>
            <input
              id="valor"
              className="input"
              inputMode="decimal"
              value={form.valor}
              onChange={(e) => update('valor', e.target.value)}
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
          <Link className="btn btn-soft" to="/projetos">
            Cancelar
          </Link>
        </div>
      </form>
    </>
  )
}
