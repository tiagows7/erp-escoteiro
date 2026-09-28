import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { WaitingOverlay } from '@/components/WaitingOverlay'
import {
  formDraftKey,
  usePersistedFormState,
} from '@/hooks/usePersistedFormState'
import { StaffAtividadesPanel } from '@/components/StaffAtividadesPanel'
import { formatMoneyInput, parseMoneyInput } from '@/lib/despesas'
import { isEncerrado } from '@/lib/encerrado'
import {
  calcRepasseGrupo,
  isValorGrupoTipo,
  repasseDespesaPath,
  type ValorGrupoTipo,
} from '@/lib/repasseGrupo'
import {
  RepasseGrupoCampos,
  RepasseGrupoPainel,
} from '@/components/RepasseGrupoPainel'
import { empresaTemPixParaEscopo } from '@/lib/pixSicredi'
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
  data_atividade: '',
  valor: '0,00',
  valor_grupo: '0,00',
  valor_grupo_tipo: 'por_jovem' as ValorGrupoTipo,
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
  const [searchParams] = useSearchParams()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const { empresa, profile, hasPermission } = useAuth()
  const canWrite = hasPermission('atividades.write')
  const canFinanceiro =
    !isAssociadoLogin(profile) && hasPermission('financeiro.write')
  const empresaId = empresa?.id
  const associadoLogin = isAssociadoLogin(profile)
  const ramoScoped = useMemo(() => staffRamoScope(profile), [profile])
  const toast = useToast()
  const dataFromQuery = (searchParams.get('data') || '').slice(0, 10)

  useEffect(() => {
    if (!associadoLogin || !id || id === 'novo') return
    navigate(`/atividades/${id}/contas`, { replace: true })
  }, [associadoLogin, id, navigate])

  useEffect(() => {
    if (associadoLogin && isNew) {
      navigate('/atividades', { replace: true })
    }
  }, [associadoLogin, isNew, navigate])

  const draftKey = formDraftKey(empresaId, 'atividade', id)
  const [form, setForm, { hydrateFromServer, clearDraft, restored }] =
    usePersistedFormState(draftKey, {
      ...emptyForm,
      data_atividade: dataFromQuery,
    })
  const [ramos, setRamos] = useState<Ramo[]>([])
  const [secoes, setSecoes] = useState<Secao[]>([])
  const [patrulhas, setPatrulhas] = useState<Patrulha[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)
  const [pixEscopoOk, setPixEscopoOk] = useState<boolean | null>(null)
  const [encerradoEm, setEncerradoEm] = useState<string | null>(null)
  const [repasseSalvo, setRepasseSalvo] = useState<{
    repasse: number
    jovens: number
    base: number
  } | null>(null)
  const [repasseDespesaId, setRepasseDespesaId] = useState<number | null>(null)
  const [jovensLive, setJovensLive] = useState(0)
  const [baseLive, setBaseLive] = useState(0)

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
    if (!empresaId) {
      setPixEscopoOk(null)
      return
    }
    let mounted = true
    void empresaTemPixParaEscopo({
      empresaId,
      ramoId,
      secaoId,
    }).then((ok) => {
      if (mounted) setPixEscopoOk(ok)
    })
    return () => {
      mounted = false
    }
  }, [empresaId, ramoId, secaoId])

  useEffect(() => {
    if (!isNew || !dataFromQuery) return
    setForm((prev) =>
      prev.data_atividade ? prev : { ...prev, data_atividade: dataFromQuery },
    )
  }, [isNew, dataFromQuery])

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
          'atividade_id, ramo, secao, patrulha_matilha, descricao, local, valor, data_atividade, valor_grupo, valor_grupo_tipo, encerrado_em, repasse_grupo, repasse_jovens, repasse_base, repasse_despesa_id',
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

      hydrateFromServer({
        ramo: data.ramo?.toString() ?? '',
        secao: data.secao?.toString() ?? '',
        patrulha_matilha: data.patrulha_matilha?.toString() ?? '',
        descricao: data.descricao ?? '',
        local: data.local ?? '',
        data_atividade: data.data_atividade
          ? String(data.data_atividade).slice(0, 10)
          : '',
        valor: formatMoneyInput(Number(data.valor ?? 0)),
        valor_grupo: formatMoneyInput(Number(data.valor_grupo ?? 0)),
        valor_grupo_tipo: isValorGrupoTipo(data.valor_grupo_tipo)
          ? data.valor_grupo_tipo
          : 'por_jovem',
      })
      setEncerradoEm((data.encerrado_em as string | null) ?? null)
      if (data.repasse_grupo != null) {
        setRepasseSalvo({
          repasse: Number(data.repasse_grupo),
          jovens: Number(data.repasse_jovens ?? 0),
          base: Number(data.repasse_base ?? 0),
        })
      } else {
        setRepasseSalvo(null)
      }
      setRepasseDespesaId(
        data.repasse_despesa_id != null
          ? Number(data.repasse_despesa_id)
          : null,
      )
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [id, isNew, empresaId, ramoScoped])

  useEffect(() => {
    if (isNew || !empresaId || !id) return
    let mounted = true
    void (async () => {
      const [confRes, recRes] = await Promise.all([
        supabase
          .from('atividade_confirmacao')
          .select('confirmacao_id', { count: 'exact', head: true })
          .eq('empresa_id', empresaId)
          .eq('atividade_id', Number(id)),
        supabase
          .from('receitas')
          .select('receita_valor, receita_saldo')
          .eq('empresa_id', empresaId)
          .eq('atividade_id', Number(id)),
      ])
      if (!mounted) return
      setJovensLive(confRes.count ?? 0)
      const base = ((recRes.data ?? []) as {
        receita_valor: number | null
        receita_saldo: number | null
      }[]).reduce(
        (sum, row) =>
          sum +
          Math.max(
            0,
            Number(row.receita_valor ?? 0) - Number(row.receita_saldo ?? 0),
          ),
        0,
      )
      setBaseLive(base)
    })()
    return () => {
      mounted = false
    }
  }, [id, isNew, empresaId])

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

  async function onEncerrar() {
    if (!canWrite || isNew || !empresaId || isEncerrado(encerradoEm)) return
    const ok = await toast.confirm({
      title: 'Encerrar atividade?',
      message:
        'O valor a repassar ao grupo será calculado e gravado. Depois disso a atividade fica só para visualização.',
      confirmLabel: 'Encerrar',
      danger: true,
    })
    if (!ok) return

    const tipo = form.valor_grupo_tipo
    const calc = calcRepasseGrupo({
      tipo,
      valor: parseMoneyInput(form.valor_grupo),
      jovens: jovensLive,
      baseRecebida: baseLive,
    })
    const { error: upError, data } = await supabase
      .from('atividades')
      .update({
        valor_grupo: parseMoneyInput(form.valor_grupo),
        valor_grupo_tipo: tipo,
        encerrado_em: new Date().toISOString(),
        repasse_grupo: calc.repasse,
        repasse_jovens: calc.jovens,
        repasse_base: calc.base,
      })
      .eq('atividade_id', Number(id))
      .eq('empresa_id', empresaId)
      .select('encerrado_em, repasse_grupo, repasse_jovens, repasse_base')
      .single()

    if (upError || !data) {
      setError(upError?.message ?? 'Não foi possível encerrar a atividade.')
      return
    }
    setEncerradoEm((data.encerrado_em as string | null) ?? null)
    setRepasseSalvo({
      repasse: Number(data.repasse_grupo ?? calc.repasse),
      jovens: Number(data.repasse_jovens ?? calc.jovens),
      base: Number(data.repasse_base ?? calc.base),
    })
    toast.success('Atividade encerrada', 'Repasse ao grupo calculado.')
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite) {
      setError('Sem permissão para alterar atividades.')
      return
    }
    if (!isNew && isEncerrado(encerradoEm)) {
      setError('Atividade encerrada — somente visualização.')
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
      data_atividade: form.data_atividade || null,
      valor: parseMoneyInput(form.valor),
      valor_grupo: parseMoneyInput(form.valor_grupo),
      valor_grupo_tipo: form.valor_grupo_tipo,
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

    clearDraft()
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

    clearDraft()
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

  const encerrado = isEncerrado(encerradoEm)
  const tipoGrupo = form.valor_grupo_tipo
  const preview = calcRepasseGrupo({
    tipo: tipoGrupo,
    valor: parseMoneyInput(form.valor_grupo),
    jovens: jovensLive,
    baseRecebida: baseLive,
  })
  const repasseVista =
    encerrado && repasseSalvo
      ? {
          tipo: tipoGrupo,
          valor: parseMoneyInput(form.valor_grupo),
          ...repasseSalvo,
        }
      : {
          tipo: tipoGrupo,
          valor: parseMoneyInput(form.valor_grupo),
          ...preview,
        }

  return (
    <>
      <WaitingOverlay
        open={saving}
        title="Aguarde"
        message="Salvando no banco de dados. Isso pode levar alguns instantes…"
      />
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
          {!isNew && canFinanceiro && !encerrado ? (
            <>
              <Link
                className="btn btn-accent"
                to={`/despesas/inclusao/novo?atividade_id=${id}`}
              >
                Lançar despesa
              </Link>
              <Link
                className="btn btn-soft"
                to={`/receitas/inclusao/novo?atividade_id=${id}`}
              >
                Lançar receita
              </Link>
            </>
          ) : null}
          <Link className="btn btn-soft" to="/atividades">
            Voltar
          </Link>
          {!isNew && canWrite && !encerrado ? (
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => void onEncerrar()}
            >
              Encerrar
            </button>
          ) : null}
          {!isNew && canWrite && !encerrado ? (
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
      {restored ? (
        <AlertMessage tone="info" title="Rascunho restaurado">
          Continuamos de onde você parou nesta aba.
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
                disabled={!canWrite || encerrado || ramoScoped != null}
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
              <span className="field-hint">
                {ramoId != null
                  ? pixEscopoOk === true
                    ? 'PIX do pagamento usará a conta bancária deste ramo (Cadastrar banco).'
                    : pixEscopoOk === false
                      ? 'Este ramo ainda não tem PIX ativo no cadastro do banco — o pagamento pode falhar.'
                      : 'Verificando PIX do ramo…'
                  : pixEscopoOk === true
                    ? 'Sem ramo: PIX usará a conta do grupo (mensalidades / caixa geral).'
                    : 'Com ramo informado, o PIX usa a conta bancária daquele ramo, se estiver configurada.'}
              </span>
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
                disabled={!canWrite || encerrado}
                maxLength={200}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="data_atividade">Data da atividade</label>
              <input
                id="data_atividade"
                className="input"
                type="date"
                value={form.data_atividade}
                onChange={(e) => update('data_atividade', e.target.value)}
                disabled={!canWrite || encerrado}
              />
              <span className="field-hint">
                Aparece no calendário do grupo nesta data.
              </span>
            </div>

            <div className="field">
              <label htmlFor="local">Local</label>
              <input
                id="local"
                className="input"
                value={form.local}
                onChange={(e) => update('local', e.target.value)}
                disabled={!canWrite || encerrado}
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
                disabled={!canWrite || encerrado}
              />
            </div>

            <RepasseGrupoCampos
              tipo={form.valor_grupo_tipo}
              valor={form.valor_grupo}
              disabled={!canWrite || encerrado}
              onTipo={(tipo) => update('valor_grupo_tipo', tipo)}
              onValor={(valor) => update('valor_grupo', valor)}
            />
          </div>

          <div className="form-actions">
            {canWrite && !encerrado ? (
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            ) : (
              <p className="muted">
                {encerrado
                  ? 'Atividade encerrada — somente visualização.'
                  : 'Modo leitura — sem permissão para salvar.'}
              </p>
            )}
            <Link className="btn btn-soft" to="/atividades">
              Cancelar
            </Link>
          </div>
        </form>
      </section>

      {!isNew ? (
        <RepasseGrupoPainel
          encerrado={encerrado}
          tipo={repasseVista.tipo}
          valorConfigurado={repasseVista.valor}
          repasse={repasseVista.repasse}
          jovens={repasseVista.jovens}
          base={repasseVista.base}
          jovensLabel="Jovens confirmados"
          acao={
            encerrado && canFinanceiro && repasseVista.repasse > 0 ? (
              <Link
                className="btn btn-accent"
                to={repasseDespesaPath({
                  origem: 'atividade',
                  origemId: Number(id),
                  despesaId: repasseDespesaId,
                })}
              >
                {repasseDespesaId
                  ? 'Abrir despesa do repasse'
                  : 'Lançar como despesa'}
              </Link>
            ) : null
          }
        />
      ) : null}

      {!isNew && empresaId ? (
        <div style={{ marginTop: '1.25rem' }}>
          <StaffAtividadesPanel
            empresaId={empresaId}
            codigoRamo={null}
            atividadeId={Number(id)}
            autoOpenAssociados
            embedded
          />
        </div>
      ) : null}
    </>
  )
}
