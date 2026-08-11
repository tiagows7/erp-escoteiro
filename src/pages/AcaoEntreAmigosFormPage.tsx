import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import {
  faixaConflitaComOutras,
  faixaDentroDaAcao,
} from '@/lib/acaoEntreAmigos'
import { formatMoney, parseMoneyInput } from '@/lib/despesas'
import { isAssociadoLogin, staffRamoScope } from '@/lib/roles'
import type { AcaoEntreAmigosFaixa, Ramo } from '@/types/database'

type Secao = { secao_id: number; nome: string; ramo: number | null }
type Patrulha = {
  secaonome_id: number
  nome: string
  ramo: number | null
  secao: number | null
}
type AssociadoOpt = {
  associado_id: number
  nome: string
  registro: number | null
  ramo: number | null
  secao: number | null
  patrulha_matilha: number | null
}
type FaixaRow = AcaoEntreAmigosFaixa & { associado_nome: string }

const emptyForm = {
  ramo: '',
  secao: '',
  patrulha_matilha: '',
  nome: '',
  numero_inicial: '1',
  numero_final: '100',
  valor_numero: '0,00',
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
  const associadoLogin = isAssociadoLogin(profile)
  const canWrite = !associadoLogin && hasPermission('vendas.write')
  const empresaId = empresa?.id
  const ramoScoped = useMemo(() => staffRamoScope(profile), [profile])
  const toast = useToast()

  const [form, setForm] = useState(emptyForm)
  const [ramos, setRamos] = useState<Ramo[]>([])
  const [secoes, setSecoes] = useState<Secao[]>([])
  const [patrulhas, setPatrulhas] = useState<Patrulha[]>([])
  const [associados, setAssociados] = useState<AssociadoOpt[]>([])
  const [faixas, setFaixas] = useState<FaixaRow[]>([])
  const [faixaForm, setFaixaForm] = useState({
    associado_id: '',
    numero_inicial: '',
    numero_final: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [faixaError, setFaixaError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savingFaixa, setSavingFaixa] = useState(false)
  const [loading, setLoading] = useState(!isNew)

  const ramoId = form.ramo ? Number(form.ramo) : null
  const secaoId = form.secao ? Number(form.secao) : null
  const patrulhaId = form.patrulha_matilha
    ? Number(form.patrulha_matilha)
    : null

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

  const associadosDisponiveis = useMemo(() => {
    const jaTem = new Set(faixas.map((f) => f.associado_id))
    return associados.filter((a) => {
      if (jaTem.has(a.associado_id)) return false
      if (ramoId != null && a.ramo != null && a.ramo !== ramoId) return false
      if (secaoId != null && a.secao != null && a.secao !== secaoId) return false
      if (
        patrulhaId != null &&
        a.patrulha_matilha != null &&
        a.patrulha_matilha !== patrulhaId
      ) {
        return false
      }
      return true
    })
  }, [associados, faixas, ramoId, secaoId, patrulhaId])

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
      supabase
        .from('associados')
        .select(
          'associado_id, nome, registro, ramo, secao, patrulha_matilha',
        )
        .eq('empresa_id', empresaId)
        .eq('ativo', true)
        .order('nome'),
    ]).then(([r, s, p, a]) => {
      setRamos((r.data as Ramo[]) ?? [])
      setSecoes((s.data as Secao[]) ?? [])
      setPatrulhas((p.data as Patrulha[]) ?? [])
      setAssociados((a.data as AssociadoOpt[]) ?? [])
    })
  }, [empresaId])

  async function loadFaixas(acaoId: number) {
    const { data, error: loadError } = await supabase
      .from('acao_entre_amigos_faixa')
      .select(
        'faixa_id, empresa_id, acao_id, associado_id, numero_inicial, numero_final, created_at, associados(nome)',
      )
      .eq('acao_id', acaoId)
      .eq('empresa_id', empresaId!)
      .order('numero_inicial')

    if (loadError) {
      setFaixaError(loadError.message)
      setFaixas([])
      return
    }

    setFaixas(
      ((data ?? []) as unknown as Array<
        AcaoEntreAmigosFaixa & { associados: { nome: string | null } | null }
      >).map((row) => ({
        ...row,
        associado_nome:
          row.associados?.nome ?? `Associado #${row.associado_id}`,
      })),
    )
  }

  useEffect(() => {
    if (isNew || !empresaId) return
    let mounted = true

    void (async () => {
      const { data, error: loadError } = await supabase
        .from('acao_entre_amigos')
        .select(
          'acao_id, ramo, secao, patrulha_matilha, nome, numero_inicial, numero_final, valor_numero',
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
        valor_numero: formatMoney(Number(data.valor_numero ?? 0))
          .replace('R$', '')
          .trim(),
      })
      await loadFaixas(Number(id))
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      valor_numero: parseMoneyInput(form.valor_numero),
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

    if (isNew && result.data?.acao_id) {
      navigate(`/vendas/acao-entre-amigos/${result.data.acao_id}`, {
        state: {
          flashSuccess:
            'Ação salva! Agora atribua as faixas de números aos jovens.',
        },
      })
      return
    }

    toast.success('Pronto!', 'Salvo com sucesso!')
  }

  async function onAddFaixa(event: FormEvent) {
    event.preventDefault()
    if (!canWrite || isNew || !empresaId) return

    const associadoId = Number(faixaForm.associado_id)
    const ini = Number(String(faixaForm.numero_inicial).replace(/\D/g, ''))
    const fim = Number(String(faixaForm.numero_final).replace(/\D/g, ''))
    const acaoIni = Number(String(form.numero_inicial).replace(/\D/g, ''))
    const acaoFim = Number(String(form.numero_final).replace(/\D/g, ''))

    if (!Number.isFinite(associadoId) || associadoId <= 0) {
      setFaixaError('Selecione o jovem.')
      return
    }
    if (!Number.isFinite(ini) || !Number.isFinite(fim) || fim < ini) {
      setFaixaError('Informe a numeração inicial e final válidas.')
      return
    }
    if (!faixaDentroDaAcao(ini, fim, acaoIni, acaoFim)) {
      setFaixaError(
        `A faixa deve estar entre ${acaoIni} e ${acaoFim} (números da ação).`,
      )
      return
    }
    if (faixaConflitaComOutras(ini, fim, faixas)) {
      setFaixaError('Esta faixa se sobrepõe a outra já atribuída.')
      return
    }

    setSavingFaixa(true)
    setFaixaError(null)

    const { error: insertError } = await supabase
      .from('acao_entre_amigos_faixa')
      .insert({
        empresa_id: empresaId,
        acao_id: Number(id),
        associado_id: associadoId,
        numero_inicial: ini,
        numero_final: fim,
      })

    setSavingFaixa(false)

    if (insertError) {
      setFaixaError(insertError.message)
      return
    }

    setFaixaForm({ associado_id: '', numero_inicial: '', numero_final: '' })
    await loadFaixas(Number(id))
    toast.success('Pronto!', 'Faixa atribuída ao jovem.')
  }

  async function onDeleteFaixa(faixaId: number) {
    if (!canWrite || !empresaId) return
    const ok = await toast.confirm({
      title: 'Remover faixa do jovem?',
      message: 'Os números voltam a ficar sem responsável.',
      confirmLabel: 'Remover',
      danger: true,
    })
    if (!ok) return

    const { error: delError } = await supabase
      .from('acao_entre_amigos_faixa')
      .delete()
      .eq('faixa_id', faixaId)
      .eq('empresa_id', empresaId)

    if (delError) {
      setFaixaError(delError.message)
      return
    }
    await loadFaixas(Number(id))
  }

  async function onDelete() {
    if (!canWrite || isNew || !empresaId) return
    const ok = await toast.confirm({
      title: 'Excluir ação entre amigos?',
      message: 'Faixas e vendas vinculadas também serão removidas.',
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

  if (associadoLogin && !isNew) {
    return (
      <Navigate to={`/vendas/acao-entre-amigos/${id}/vender`} replace />
    )
  }
  if (associadoLogin && isNew) {
    return <Navigate to="/vendas/acao-entre-amigos" replace />
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
          <p>Nome, valor do número, faixa geral e atribuição aos jovens</p>
        </div>
        <div className="page-header-actions actions-pair">
          {!isNew ? (
            <Link
              className="btn btn-primary"
              to={`/vendas/acao-entre-amigos/${id}/vender`}
            >
              Ver vendas
            </Link>
          ) : null}
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
            <label htmlFor="valor_numero">Valor de cada número</label>
            <input
              id="valor_numero"
              className="input"
              inputMode="decimal"
              value={form.valor_numero}
              onChange={(e) => update('valor_numero', e.target.value)}
              disabled={disabled}
            />
          </div>

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

      {!isNew ? (
        <section className="panel" style={{ marginTop: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>Números por jovem</h3>
          <p className="muted">
            Selecione o associado e o intervalo de numeração que fica com ele.
          </p>

          {faixaError ? (
            <AlertMessage tone="error" title="Atenção">
              {faixaError}
            </AlertMessage>
          ) : null}

          {canWrite ? (
            <form
              className="form-grid form-grid-2"
              onSubmit={(e) => void onAddFaixa(e)}
              style={{ marginBottom: '1rem' }}
            >
              <div className="field field-span-2">
                <label htmlFor="faixa_associado">Jovem</label>
                <select
                  id="faixa_associado"
                  className="select"
                  value={faixaForm.associado_id}
                  onChange={(e) =>
                    setFaixaForm((prev) => ({
                      ...prev,
                      associado_id: e.target.value,
                    }))
                  }
                  disabled={savingFaixa}
                  required
                >
                  <option value="">Selecione…</option>
                  {associadosDisponiveis.map((a) => (
                    <option key={a.associado_id} value={a.associado_id}>
                      {a.nome}
                      {a.registro != null ? ` · ${a.registro}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="faixa_ini">Nº inicial</label>
                <input
                  id="faixa_ini"
                  className="input"
                  inputMode="numeric"
                  value={faixaForm.numero_inicial}
                  onChange={(e) =>
                    setFaixaForm((prev) => ({
                      ...prev,
                      numero_inicial: e.target.value,
                    }))
                  }
                  disabled={savingFaixa}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="faixa_fim">Nº final</label>
                <input
                  id="faixa_fim"
                  className="input"
                  inputMode="numeric"
                  value={faixaForm.numero_final}
                  onChange={(e) =>
                    setFaixaForm((prev) => ({
                      ...prev,
                      numero_final: e.target.value,
                    }))
                  }
                  disabled={savingFaixa}
                  required
                />
              </div>
              <div className="form-actions field-span-2">
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={savingFaixa}
                >
                  {savingFaixa ? 'Salvando…' : 'Atribuir faixa'}
                </button>
              </div>
            </form>
          ) : null}

          {faixas.length === 0 ? (
            <div className="empty">Nenhuma faixa atribuída ainda.</div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Jovem</th>
                    <th>Números</th>
                    <th>Qtde</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {faixas.map((f) => (
                    <tr key={f.faixa_id}>
                      <td>{f.associado_nome}</td>
                      <td>
                        {f.numero_inicial} – {f.numero_final}
                      </td>
                      <td>{f.numero_final - f.numero_inicial + 1}</td>
                      <td>
                        {canWrite ? (
                          <button
                            type="button"
                            className="btn btn-soft"
                            onClick={() => void onDeleteFaixa(f.faixa_id)}
                          >
                            Remover
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </>
  )
}
