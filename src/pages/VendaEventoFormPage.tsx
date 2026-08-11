import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import {
  formatMoney,
  parseMoneyInput,
  situacaoDespesaLabel,
} from '@/lib/despesas'
import { documentLabel, parseDocumentUrls } from '@/lib/documentUrls'
import { isEncerrado } from '@/lib/encerrado'
import { situacaoTituloLabel } from '@/lib/receitas'
import { totalConvitesEvento } from '@/lib/vendaEventos'
import { uploadVendaEventoImagem } from '@/lib/uploadVendaEventoImagem'
import { isAssociadoLogin, staffRamoScope } from '@/lib/roles'
import type { Ramo } from '@/types/database'

type Secao = { secao_id: number; nome: string; ramo: number | null }
type Patrulha = {
  secaonome_id: number
  nome: string
  ramo: number | null
  secao: number | null
}

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

function DocumentosLinks({ value }: { value: string | null | undefined }) {
  const docs = parseDocumentUrls(value)
  if (docs.length === 0) return <span className="muted">—</span>
  return (
    <div className="portal-doc-links">
      {docs.map((url, index) => (
        <a
          key={url}
          className="btn btn-soft"
          href={url}
          target="_blank"
          rel="noreferrer"
        >
          {docs.length === 1 ? 'Ver documento' : documentLabel(url, index)}
        </a>
      ))}
    </div>
  )
}

function formatDate(value: string | null) {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

const emptyForm = {
  ramo: '',
  secao: '',
  patrulha_matilha: '',
  nome: '',
  numero_inicial: '1',
  numero_final: '100',
  valor_convite: '0,00',
  data_evento: '',
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

export function VendaEventoFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const { empresa, profile, hasPermission } = useAuth()
  const associadoLogin = isAssociadoLogin(profile)
  const canWrite = !associadoLogin && hasPermission('vendas.write')
  const canFinanceiro = !associadoLogin && hasPermission('financeiro.write')
  const empresaId = empresa?.id
  const ramoScoped = useMemo(() => staffRamoScope(profile), [profile])
  const toast = useToast()

  const [form, setForm] = useState(emptyForm)
  const [ramos, setRamos] = useState<Ramo[]>([])
  const [secoes, setSecoes] = useState<Secao[]>([])
  const [patrulhas, setPatrulhas] = useState<Patrulha[]>([])
  const [receitas, setReceitas] = useState<ReceitaRow[]>([])
  const [despesas, setDespesas] = useState<DespesaRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)
  const [imagemUrl, setImagemUrl] = useState<string | null>(null)
  const [imagemFile, setImagemFile] = useState<File | null>(null)
  const [imagemPreview, setImagemPreview] = useState<string | null>(null)
  const [encerradoEm, setEncerradoEm] = useState<string | null>(null)
  const imagemInputRef = useRef<HTMLInputElement>(null)

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
        .from('venda_eventos')
        .select(
          'evento_id, ramo, secao, patrulha_matilha, nome, numero_inicial, numero_final, valor_convite, data_evento, imagem_url, encerrado_em',
        )
        .eq('evento_id', Number(id))
        .eq('empresa_id', empresaId)
        .maybeSingle()

      if (!mounted) return
      if (loadError || !data) {
        setError(loadError?.message ?? 'Evento não encontrado.')
        setReceitas([])
        setDespesas([])
        setLoading(false)
        return
      }

      if (ramoScoped != null && data.ramo != null && data.ramo !== ramoScoped) {
        setError('Este evento não pertence ao seu ramo.')
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
        valor_convite: formatMoney(Number(data.valor_convite ?? 0))
          .replace('R$', '')
          .trim(),
        data_evento: data.data_evento
          ? String(data.data_evento).slice(0, 10)
          : '',
      })
      setImagemUrl(data.imagem_url ?? null)
      setImagemPreview(data.imagem_url ?? null)
      setImagemFile(null)
      setEncerradoEm((data.encerrado_em as string | null) ?? null)

      const [r, d] = await Promise.all([
        supabase
          .from('receitas')
          .select(
            'receita_id, receita_descricao, receita_emissao, receita_vencimento, receita_valor, receita_saldo, receita_situacao, receita_documento, associados(nome)',
          )
          .eq('empresa_id', empresaId)
          .eq('evento_id', data.evento_id)
          .order('receita_vencimento', { ascending: true }),
        supabase
          .from('despesas')
          .select(
            'despesa_id, despesa_finalidade, despesa_emissao, despesa_vencimento, despesa_valor, despesa_saldo, despesa_situacao, despesa_documento, fornecedor_despesa(fordespesa_nome)',
          )
          .eq('empresa_id', empresaId)
          .eq('evento_id', data.evento_id)
          .order('despesa_vencimento', { ascending: true }),
      ])

      if (!mounted) return
      if (r.error || d.error) {
        setError(
          r.error?.message ?? d.error?.message ?? 'Falha ao carregar contas.',
        )
        setReceitas([])
        setDespesas([])
      } else {
        setReceitas((r.data as unknown as ReceitaRow[]) ?? [])
        setDespesas((d.data as unknown as DespesaRow[]) ?? [])
      }
      setLoading(false)
    })()
    return () => {
      mounted = false
    }
  }, [id, isNew, empresaId, ramoScoped])

  const totais = useMemo(() => {
    const totalReceitas = receitas.reduce(
      (s, row) => s + Number(row.receita_valor ?? 0),
      0,
    )
    const totalDespesas = despesas.reduce(
      (s, row) => s + Number(row.despesa_valor ?? 0),
      0,
    )
    return {
      totalReceitas,
      totalDespesas,
      resultado: totalReceitas - totalDespesas,
    }
  }, [receitas, despesas])

  const resultadoTone =
    totais.resultado > 0.005
      ? 'ok'
      : totais.resultado < -0.005
        ? 'deficit'
        : 'zero'

  if (associadoLogin && isNew) {
    return <Navigate to="/vendas/eventos" replace />
  }

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

  function onImagemFileChange(file: File | null) {
    if (imagemPreview && imagemPreview.startsWith('blob:')) {
      URL.revokeObjectURL(imagemPreview)
    }
    setImagemFile(file)
    setImagemPreview(file ? URL.createObjectURL(file) : imagemUrl)
  }

  async function onEncerrar() {
    if (!canWrite || isNew || !empresaId || isEncerrado(encerradoEm)) return
    const ok = await toast.confirm({
      title: 'Encerrar evento?',
      message:
        'Depois de encerrado, não será possível vender convites nem lançar despesas/receitas — só visualizar.',
      confirmLabel: 'Encerrar',
      danger: true,
    })
    if (!ok) return

    const { error: upError, data } = await supabase
      .from('venda_eventos')
      .update({ encerrado_em: new Date().toISOString() })
      .eq('evento_id', Number(id))
      .eq('empresa_id', empresaId)
      .select('encerrado_em')
      .single()

    if (upError || !data) {
      setError(upError?.message ?? 'Não foi possível encerrar o evento.')
      return
    }
    setEncerradoEm((data.encerrado_em as string | null) ?? null)
    toast.success('Evento encerrado', 'Agora só é possível visualizar.')
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite) {
      setError('Sem permissão para alterar eventos.')
      return
    }
    if (!isNew && isEncerrado(encerradoEm)) {
      setError('Evento encerrado — somente visualização.')
      return
    }
    if (!empresaId) {
      setError('Grupo escoteiro não carregado.')
      return
    }
    if (!form.nome.trim()) {
      setError('Informe o nome do evento.')
      return
    }

    const numeroInicial = Number(String(form.numero_inicial).replace(/\D/g, ''))
    const numeroFinal = Number(String(form.numero_final).replace(/\D/g, ''))
    if (!Number.isFinite(numeroInicial) || !Number.isFinite(numeroFinal)) {
      setError('Informe convite inicial e final válidos.')
      return
    }
    if (numeroFinal < numeroInicial) {
      setError('O convite final deve ser maior ou igual ao inicial.')
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
      valor_convite: parseMoneyInput(form.valor_convite),
      data_evento: form.data_evento || null,
    }

    const result = isNew
      ? await supabase
          .from('venda_eventos')
          .insert(payload)
          .select('evento_id')
          .single()
      : await supabase
          .from('venda_eventos')
          .update(payload)
          .eq('evento_id', Number(id))
          .eq('empresa_id', empresaId)
          .select('evento_id')
          .single()

    if (result.error) {
      setSaving(false)
      setError(result.error.message)
      return
    }

    const eventoIdSalvo = Number(result.data?.evento_id ?? id)
    if (imagemFile && Number.isFinite(eventoIdSalvo) && eventoIdSalvo > 0) {
      const imgOk = await uploadVendaEventoImagem(
        empresaId,
        eventoIdSalvo,
        imagemFile,
      )
      if ('error' in imgOk) {
        setSaving(false)
        setError(`Evento salvo, mas a imagem falhou: ${imgOk.error}`)
        if (isNew) {
          navigate(`/vendas/eventos/${eventoIdSalvo}`, {
            state: {
              flashSuccess: 'Evento salvo. Ajuste a imagem se precisar.',
            },
          })
        }
        return
      }
      setImagemUrl(imgOk.url)
      setImagemPreview(imgOk.url)
      setImagemFile(null)
    }

    setSaving(false)

    if (isNew && eventoIdSalvo > 0) {
      navigate(`/vendas/eventos/${eventoIdSalvo}/vender`, {
        state: { flashSuccess: 'Evento salvo! Já pode vender convites.' },
      })
      return
    }

    toast.success('Pronto!', 'Salvo com sucesso!')
  }

  async function onDelete() {
    if (!canWrite || isNew || !empresaId) return
    if (isEncerrado(encerradoEm)) {
      setError('Evento encerrado — não é possível excluir.')
      return
    }
    const ok = await toast.confirm({
      title: 'Excluir evento?',
      message: 'As compras e a lista de convites também serão removidas.',
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return

    const { error: delError } = await supabase
      .from('venda_eventos')
      .delete()
      .eq('evento_id', Number(id))
      .eq('empresa_id', empresaId)

    if (delError) {
      setError(delError.message)
      return
    }
    navigate('/vendas/eventos', {
      state: { flashSuccess: 'Evento excluído.' },
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
    return <div className="loading">Carregando evento…</div>
  }

  const encerrado = isEncerrado(encerradoEm)
  const disabled = saving || !canWrite || encerrado
  const qtdePreview = totalConvitesEvento(
    Number(String(form.numero_inicial).replace(/\D/g, '')),
    Number(String(form.numero_final).replace(/\D/g, '')),
  )

  return (
    <>
      <header className="page-header">
        <div>
          <h2>
            {isNew ? 'Novo evento' : encerrado ? 'Evento' : 'Editar evento'}{' '}
            {encerrado ? (
              <span className="badge badge-danger">Encerrado</span>
            ) : null}
          </h2>
          <p>
            {encerrado
              ? 'Somente visualização — vendas e lançamentos bloqueados.'
              : 'Nome, ramo/seção, faixa de convites e valor unitário'}
          </p>
        </div>
        <div className="page-header-actions">
          {!isNew ? (
            <Link
              className="btn btn-primary"
              to={`/vendas/eventos/${id}/vender`}
            >
              {encerrado ? 'Lista de convites' : 'Vender / lista'}
            </Link>
          ) : null}
          {!isNew && canFinanceiro && !encerrado ? (
            <>
              <Link
                className="btn btn-accent"
                to={`/despesas/inclusao/novo?evento_id=${id}`}
              >
                Lançar despesa
              </Link>
              <Link
                className="btn btn-primary"
                to={`/receitas/inclusao/novo?evento_id=${id}`}
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
          <Link className="btn btn-soft" to="/vendas/eventos">
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
          <AlertMessage tone="info" title="Evento encerrado">
            Não é possível alterar o cadastro, vender convites nem lançar
            despesas/receitas.
          </AlertMessage>
        ) : null}

        <div className="form-grid form-grid-2">
          <div className="field field-span-2">
            <label htmlFor="nome">Nome do evento</label>
            <input
              id="nome"
              className="input"
              value={form.nome}
              onChange={(e) => update('nome', e.target.value)}
              disabled={disabled}
              required
              placeholder="Ex.: Jantar beneficente 2026"
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
            <span className="field-hint">
              Com ramo/seção, o PIX do link público usa a conta desse ramo.
            </span>
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
            <label htmlFor="data_evento">Data do evento</label>
            <input
              id="data_evento"
              type="date"
              className="input"
              value={form.data_evento}
              onChange={(e) => update('data_evento', e.target.value)}
              disabled={disabled}
            />
          </div>

          <div className="field">
            <label htmlFor="valor_convite">Valor de cada convite</label>
            <input
              id="valor_convite"
              className="input"
              inputMode="decimal"
              value={form.valor_convite}
              onChange={(e) => update('valor_convite', e.target.value)}
              disabled={disabled}
            />
          </div>

          <div className="field">
            <label htmlFor="numero_inicial">Convite inicial</label>
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
            <label htmlFor="numero_final">Convite final</label>
            <input
              id="numero_final"
              className="input"
              inputMode="numeric"
              value={form.numero_final}
              onChange={(e) => update('numero_final', e.target.value)}
              disabled={disabled}
              required
            />
            {qtdePreview > 0 ? (
              <span className="field-hint">{qtdePreview} convite(s) na faixa</span>
            ) : null}
          </div>

          <div className="field field-span-2">
            <label htmlFor="evento-imagem">Imagem do evento</label>
            <div className="logo-upload-field">
              {imagemPreview ? (
                <img
                  className="acao-imagem-preview"
                  src={imagemPreview}
                  alt="Pré-visualização da imagem do evento"
                />
              ) : (
                <div className="logo-preview logo-preview-placeholder">
                  Sem imagem
                </div>
              )}
              <div>
                <input
                  ref={imagemInputRef}
                  id="evento-imagem"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  disabled={disabled}
                  onChange={(e) =>
                    onImagemFileChange(e.target.files?.[0] ?? null)
                  }
                />
                <span className="field-hint">
                  PNG, JPG, WEBP ou GIF · máx. 2 MB. Aparece na tela de vender.
                </span>
                {imagemFile ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ marginTop: '0.4rem' }}
                    onClick={() => {
                      onImagemFileChange(null)
                      if (imagemInputRef.current) {
                        imagemInputRef.current.value = ''
                      }
                    }}
                  >
                    Remover seleção
                  </button>
                ) : null}
              </div>
            </div>
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
                ? 'Evento encerrado — somente visualização.'
                : 'Modo leitura — sem permissão para salvar.'}
            </p>
          )}
        </div>
      </form>

      {!isNew ? (
        <>
          <section
            className="panel atividade-contas-resumo"
            style={{ marginTop: '1rem' }}
          >
            <h3 style={{ marginTop: 0 }}>Resumo financeiro</h3>
            <div className="atividade-contas-grid">
              <div>
                <span className="muted">Receitas</span>
                <strong>{formatMoney(totais.totalReceitas)}</strong>
              </div>
              <div>
                <span className="muted">Despesas</span>
                <strong>{formatMoney(totais.totalDespesas)}</strong>
              </div>
            </div>
            <div
              className={`atividade-contas-saldo atividade-contas-saldo--${resultadoTone}`}
            >
              <div>
                <span className="muted">
                  {totais.resultado > 0
                    ? 'Lucro'
                    : totais.resultado < 0
                      ? 'Prejuízo'
                      : 'Resultado'}{' '}
                  (receitas − despesas)
                </span>
                <strong>{formatMoney(totais.resultado)}</strong>
              </div>
            </div>
          </section>

          <section className="panel" style={{ marginBottom: '1rem' }}>
            <h3 style={{ marginTop: 0 }}>Receitas</h3>
            {receitas.length === 0 ? (
              <div className="empty">
                Nenhuma receita vinculada a este evento.
              </div>
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
                          {canFinanceiro ? (
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
              <div className="empty">
                Nenhuma despesa vinculada a este evento.
              </div>
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
                          {canFinanceiro ? (
                            <Link to={`/despesas/inclusao/${row.despesa_id}`}>
                              {row.despesa_finalidade || '—'}
                            </Link>
                          ) : (
                            row.despesa_finalidade || '—'
                          )}
                        </td>
                        <td>
                          {row.fornecedor_despesa?.fordespesa_nome || '—'}
                        </td>
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
      ) : null}
    </>
  )
}
