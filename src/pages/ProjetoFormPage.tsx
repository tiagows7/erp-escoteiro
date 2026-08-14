import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { formatMoney, parseMoneyInput, situacaoDespesaLabel } from '@/lib/despesas'
import { DocumentosLinks } from '@/components/DocumentosLinks'
import { isEncerrado } from '@/lib/encerrado'
import { situacaoTituloLabel } from '@/lib/receitas'
import { isAssociadoLogin, staffRamoScope } from '@/lib/roles'
import type { Projeto, Ramo } from '@/types/database'

type Secao = { secao_id: number; nome: string; ramo: number | null }

type ReceitaRow = {
  receita_id: number
  receita_descricao: string | null
  receita_emissao: string | null
  receita_vencimento: string | null
  receita_valor: number | null
  receita_saldo: number | null
  receita_situacao: number | null
  receita_documento: string | null
  associados: { nome: string | null } | null
}

type DespesaRow = {
  despesa_id: number
  despesa_finalidade: string | null
  despesa_emissao: string | null
  despesa_vencimento: string | null
  despesa_valor: number | null
  despesa_saldo: number | null
  despesa_situacao: number | null
  despesa_documento: string | null
  fornecedor_despesa: { fordespesa_nome: string | null } | null
}

const emptyForm = {
  ramo: '',
  secao: '',
  descricao: '',
  valor: '0,00',
}

function formatDate(value: string | null) {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

function escopoLabel(
  projeto: Pick<Projeto, 'ramo' | 'secao'>,
  ramoMap: Map<number, string>,
  secaoMap: Map<number, string>,
): string {
  if (projeto.ramo == null) return 'Grupo todo'
  const ramoNome = ramoMap.get(projeto.ramo) ?? `Ramo ${projeto.ramo}`
  if (projeto.secao == null) return ramoNome
  const secaoNome = secaoMap.get(projeto.secao) ?? `Seção ${projeto.secao}`
  return `${ramoNome} · ${secaoNome}`
}

export function ProjetoFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const { empresa, profile, hasPermission } = useAuth()
  const associadoLogin = isAssociadoLogin(profile)
  const canWrite = !associadoLogin && hasPermission('projetos.write')
  const canFinanceiro = !associadoLogin && hasPermission('financeiro.write')
  const empresaId = empresa?.id
  const ramoScoped = useMemo(() => staffRamoScope(profile), [profile])
  const toast = useToast()

  const [form, setForm] = useState(emptyForm)
  const [projeto, setProjeto] = useState<Projeto | null>(null)
  const [ramos, setRamos] = useState<Ramo[]>([])
  const [secoes, setSecoes] = useState<Secao[]>([])
  const [receitas, setReceitas] = useState<ReceitaRow[]>([])
  const [despesas, setDespesas] = useState<DespesaRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)

  const ramoId = form.ramo ? Number(form.ramo) : null

  const secoesDoRamo = useMemo(() => {
    if (ramoId == null) return []
    return secoes.filter((s) => s.ramo === ramoId)
  }, [ramoId, secoes])

  const ramoMap = useMemo(
    () => new Map(ramos.map((r) => [r.ramo_id, r.nome])),
    [ramos],
  )
  const secaoMap = useMemo(
    () => new Map(secoes.map((s) => [s.secao_id, s.nome])),
    [secoes],
  )

  useEffect(() => {
    if (ramoScoped == null || !isNew || associadoLogin) return
    setForm((prev) => ({ ...prev, ramo: String(ramoScoped) }))
  }, [ramoScoped, isNew, associadoLogin])

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
      setLoading(true)

      let associadoRamo: number | null = null
      if (associadoLogin && profile?.registro) {
        const registroNum = Number(String(profile.registro).replace(/\D/g, ''))
        if (Number.isFinite(registroNum) && registroNum > 0) {
          const { data: assoc } = await supabase
            .from('associados')
            .select('ramo')
            .eq('empresa_id', empresaId)
            .eq('registro', registroNum)
            .maybeSingle()
          associadoRamo = (assoc?.ramo as number | null) ?? null
        }
      }

      const { data, error: loadError } = await supabase
        .from('projetos')
        .select(
          'projeto_id, empresa_id, ramo, secao, descricao, valor, encerrado_em, created_at',
        )
        .eq('projeto_id', Number(id))
        .eq('empresa_id', empresaId)
        .maybeSingle()

      if (!mounted) return
      if (loadError || !data) {
        setError(loadError?.message ?? 'Projeto não encontrado neste grupo')
        setProjeto(null)
        setReceitas([])
        setDespesas([])
        setLoading(false)
        return
      }

      const proj = data as Projeto

      if (ramoScoped != null && proj.ramo != null && proj.ramo !== ramoScoped) {
        setError('Este projeto não pertence ao seu ramo.')
        setProjeto(null)
        setLoading(false)
        return
      }

      if (associadoLogin) {
        if (
          associadoRamo != null &&
          proj.ramo != null &&
          proj.ramo !== associadoRamo
        ) {
          setError('Este projeto não está disponível para o seu registro.')
          setProjeto(null)
          setLoading(false)
          return
        }
      }

      setProjeto(proj)
      setForm({
        ramo: proj.ramo?.toString() ?? '',
        secao: proj.secao?.toString() ?? '',
        descricao: proj.descricao ?? '',
        valor: formatMoney(Number(proj.valor ?? 0))
          .replace('R$', '')
          .trim(),
      })

      const [r, d] = await Promise.all([
        supabase
          .from('receitas')
          .select(
            'receita_id, receita_descricao, receita_emissao, receita_vencimento, receita_valor, receita_saldo, receita_situacao, receita_documento, associados(nome)',
          )
          .eq('empresa_id', empresaId)
          .eq('projeto_id', proj.projeto_id)
          .order('receita_vencimento', { ascending: true }),
        supabase
          .from('despesas')
          .select(
            'despesa_id, despesa_finalidade, despesa_emissao, despesa_vencimento, despesa_valor, despesa_saldo, despesa_situacao, despesa_documento, fornecedor_despesa(fordespesa_nome)',
          )
          .eq('empresa_id', empresaId)
          .eq('projeto_id', proj.projeto_id)
          .order('despesa_vencimento', { ascending: true }),
      ])

      if (!mounted) return
      if (r.error || d.error) {
        setError(r.error?.message ?? d.error?.message ?? 'Falha ao carregar contas.')
        setReceitas([])
        setDespesas([])
        setLoading(false)
        return
      }
      setReceitas((r.data as unknown as ReceitaRow[]) ?? [])
      setDespesas((d.data as unknown as DespesaRow[]) ?? [])

      setError(null)
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [id, isNew, empresaId, ramoScoped, associadoLogin, profile?.registro])

  const totais = useMemo(() => {
    const totalReceitas = receitas.reduce(
      (s, row) => s + Number(row.receita_valor ?? 0),
      0,
    )
    const totalDespesas = despesas.reduce(
      (s, row) => s + Number(row.despesa_valor ?? 0),
      0,
    )
    const orcamento = Number(projeto?.valor ?? 0)
    return {
      totalReceitas,
      totalDespesas,
      orcamento,
      saldoRestante: orcamento + totalReceitas - totalDespesas,
    }
  }, [receitas, despesas, projeto?.valor])

  function update(field: keyof typeof emptyForm, value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'ramo') next.secao = ''
      return next
    })
  }

  async function onEncerrar() {
    if (!canWrite || isNew || !empresaId || !projeto) return
    if (isEncerrado(projeto.encerrado_em)) return
    const ok = await toast.confirm({
      title: 'Encerrar projeto?',
      message:
        'Depois de encerrado, o projeto fica somente para visualização — sem editar nem lançar despesas/receitas.',
      confirmLabel: 'Encerrar',
      danger: true,
    })
    if (!ok) return

    const { error: upError, data } = await supabase
      .from('projetos')
      .update({ encerrado_em: new Date().toISOString() })
      .eq('projeto_id', Number(id))
      .eq('empresa_id', empresaId)
      .select(
        'projeto_id, empresa_id, ramo, secao, descricao, valor, encerrado_em, created_at',
      )
      .single()

    if (upError || !data) {
      setError(upError?.message ?? 'Não foi possível encerrar o projeto.')
      return
    }
    setProjeto(data as Projeto)
    toast.success('Projeto encerrado', 'Agora só é possível visualizar.')
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite) {
      setError('Sem permissão para alterar projetos.')
      return
    }
    if (!isNew && isEncerrado(projeto?.encerrado_em)) {
      setError('Projeto encerrado — somente visualização.')
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
    if (isEncerrado(projeto?.encerrado_em)) {
      setError('Projeto encerrado — não é possível excluir.')
      return
    }
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

  if (associadoLogin && isNew) {
    return <Navigate to="/projetos" replace />
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
    return (
      <div className="loading">
        {associadoLogin ? 'Carregando resumo do projeto…' : 'Carregando projeto…'}
      </div>
    )
  }

  if (associadoLogin) {
    if (!projeto) {
      return (
        <section className="panel">
          <AlertMessage tone="error" title="Atenção">
            {error ?? 'Projeto não encontrado'}
          </AlertMessage>
          <Link className="btn btn-soft" to="/projetos">
            Voltar
          </Link>
        </section>
      )
    }

    const tone =
      totais.saldoRestante > 0.005
        ? 'ok'
        : totais.saldoRestante < -0.005
          ? 'deficit'
          : 'zero'

    return (
      <>
        <header className="page-header">
          <div>
            <h2>
              Resumo do projeto{' '}
              {isEncerrado(projeto.encerrado_em) ? (
                <span className="badge badge-danger">Encerrado</span>
              ) : null}
            </h2>
            <p>
              {projeto.descricao} · {escopoLabel(projeto, ramoMap, secaoMap)} —{' '}
              <strong>{empresa?.nome}</strong>
            </p>
          </div>
          <Link className="btn btn-soft" to="/projetos">
            Voltar
          </Link>
        </header>

        {error ? (
          <AlertMessage tone="error" title="Atenção">
            {error}
          </AlertMessage>
        ) : null}

        <section className="panel atividade-contas-resumo">
          <div className="atividade-contas-grid">
            <div>
              <span className="muted">Orçamento</span>
              <strong>{formatMoney(totais.orcamento)}</strong>
            </div>
            <div>
              <span className="muted">Receitas</span>
              <strong>{formatMoney(totais.totalReceitas)}</strong>
            </div>
            <div>
              <span className="muted">Despesas</span>
              <strong>{formatMoney(totais.totalDespesas)}</strong>
            </div>
          </div>
          <div className={`atividade-contas-saldo atividade-contas-saldo--${tone}`}>
            <div>
              <span className="muted">Saldo restante (orçamento + receitas − despesas)</span>
              <strong>{formatMoney(totais.saldoRestante)}</strong>
            </div>
          </div>
        </section>

        {renderContasTables(false)}
      </>
    )
  }

  const encerrado = isEncerrado(projeto?.encerrado_em)
  const disabled = saving || !canWrite || encerrado

  function renderContasTables(linkLancamentos: boolean) {
    return (
      <>
        <section className="panel" style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>Receitas</h3>
          {receitas.length === 0 ? (
            <div className="empty">Nenhuma receita vinculada a este projeto.</div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Vencimento</th>
                    <th>Descrição</th>
                    <th>Associado</th>
                    <th>Valor</th>
                    <th>Saldo</th>
                    <th>Situação</th>
                    <th>Documento</th>
                  </tr>
                </thead>
                <tbody>
                  {receitas.map((row) => (
                    <tr key={row.receita_id}>
                      <td>{formatDate(row.receita_vencimento)}</td>
                      <td>
                        {linkLancamentos ? (
                          <Link to={`/receitas/inclusao/${row.receita_id}`}>
                            {row.receita_descricao || '—'}
                          </Link>
                        ) : (
                          row.receita_descricao || '—'
                        )}
                      </td>
                      <td>{row.associados?.nome || '—'}</td>
                      <td>{formatMoney(row.receita_valor)}</td>
                      <td>{formatMoney(row.receita_saldo)}</td>
                      <td>{situacaoTituloLabel(row.receita_situacao)}</td>
                      <td>
                        <DocumentosLinks value={row.receita_documento} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>
                      <strong>Total</strong>
                    </td>
                    <td>
                      <strong>{formatMoney(totais.totalReceitas)}</strong>
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <h3 style={{ marginTop: 0 }}>Despesas</h3>
          {despesas.length === 0 ? (
            <div className="empty">Nenhuma despesa vinculada a este projeto.</div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Vencimento</th>
                    <th>Finalidade</th>
                    <th>Fornecedor</th>
                    <th>Valor</th>
                    <th>Saldo</th>
                    <th>Situação</th>
                    <th>Documento</th>
                  </tr>
                </thead>
                <tbody>
                  {despesas.map((row) => (
                    <tr key={row.despesa_id}>
                      <td>{formatDate(row.despesa_vencimento)}</td>
                      <td>
                        {linkLancamentos ? (
                          <Link to={`/despesas/inclusao/${row.despesa_id}`}>
                            {row.despesa_finalidade || '—'}
                          </Link>
                        ) : (
                          row.despesa_finalidade || '—'
                        )}
                      </td>
                      <td>{row.fornecedor_despesa?.fordespesa_nome || '—'}</td>
                      <td>{formatMoney(row.despesa_valor)}</td>
                      <td>{formatMoney(row.despesa_saldo)}</td>
                      <td>{situacaoDespesaLabel(row.despesa_situacao)}</td>
                      <td>
                        <DocumentosLinks value={row.despesa_documento} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>
                      <strong>Total</strong>
                    </td>
                    <td>
                      <strong>{formatMoney(totais.totalDespesas)}</strong>
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      </>
    )
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h2>
            {isNew ? 'Novo projeto' : encerrado ? 'Projeto' : 'Editar projeto'}{' '}
            {encerrado ? <span className="badge badge-danger">Encerrado</span> : null}
          </h2>
          <p>
            {encerrado
              ? 'Somente visualização — não é possível alterar nem lançar contas.'
              : 'Descrição, ramo/grupo, seção e valor'}
          </p>
        </div>
        <div className="page-header-actions">
          {!isNew && canFinanceiro && !encerrado ? (
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
          {!isNew && canWrite && !encerrado ? (
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => void onEncerrar()}
            >
              Encerrar
            </button>
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
        {encerrado ? (
          <AlertMessage tone="info" title="Projeto encerrado">
            Cadastro e lançamentos bloqueados. Você ainda pode consultar o
            resumo financeiro abaixo.
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
          {canWrite && !encerrado ? (
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
            <p className="muted">
              {encerrado
                ? 'Projeto encerrado — somente visualização.'
                : 'Modo leitura — sem permissão para salvar.'}
            </p>
          )}
          <Link className="btn btn-soft" to="/projetos">
            Cancelar
          </Link>
        </div>
      </form>

      {!isNew ? renderContasTables(true) : null}
    </>
  )
}
