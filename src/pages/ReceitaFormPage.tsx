import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import {
  RECEITA_ORIGEM,
  formatMoney,
  situacaoFromSaldo,
  situacaoTituloLabel,
  TITULO_SITUACAO,
} from '@/lib/receitas'
import {
  isReceitaDocumentoImage,
  uploadReceitaDocumentos,
} from '@/lib/uploadReceitaDocumento'
import {
  documentLabel,
  parseDocumentUrls,
  serializeDocumentUrls,
} from '@/lib/documentUrls'
import {
  matchesFinanceiroScope,
  resolveFinanceiroScope,
} from '@/lib/financeiroScope'
import {
  atividadeLabel,
  loadAtividadesLookup,
  type AtividadeLookup,
} from '@/lib/atividadesLookup'
import {
  loadProjetosLookup,
  projetoLabel,
  type ProjetoLookup,
} from '@/lib/projetosLookup'
import type { Ramo } from '@/types/database'

type Lookup = { id: number; nome: string; ramo?: number | null }

const emptyForm = {
  receita_descricao: '',
  associado_id: '',
  receita_ramo: '',
  receita_secao: '',
  atividade_id: '',
  projeto_id: '',
  receita_emissao: '',
  receita_vencimento: '',
  receita_valor: '',
  receita_observacao: '',
}

function numOrNull(value: string) {
  return value ? Number(value) : null
}

function strOrNull(value: string) {
  const v = value.trim()
  return v || null
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function ReceitaFormPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const { empresa, profile, hasPermission } = useAuth()
  const canWrite = hasPermission('financeiro.write')
  const empresaId = empresa?.id
  const scope = useMemo(() => resolveFinanceiroScope(profile), [profile])
  const toast = useToast()
  const projetoIdParam = searchParams.get('projeto_id')

  const [form, setForm] = useState({
    ...emptyForm,
    receita_emissao: todayISO(),
    receita_vencimento: todayISO(),
  })
  const [origem, setOrigem] = useState<string>(RECEITA_ORIGEM.AVULSA)
  const [saldo, setSaldo] = useState<number | null>(null)
  const [situacao, setSituacao] = useState<number | null>(null)
  const [paidAmount, setPaidAmount] = useState(0)
  const [ramos, setRamos] = useState<Ramo[]>([])
  const [secoes, setSecoes] = useState<Lookup[]>([])
  const [associados, setAssociados] = useState<Lookup[]>([])
  const [atividades, setAtividades] = useState<AtividadeLookup[]>([])
  const [projetos, setProjetos] = useState<ProjetoLookup[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)
  const [documentoUrls, setDocumentoUrls] = useState<string[]>([])
  const [docFiles, setDocFiles] = useState<File[]>([])

  useEffect(() => {
    if (!scope || !isNew) return
    setForm((prev) => ({
      ...prev,
      receita_ramo: String(scope.ramo),
      receita_secao:
        scope.secao != null ? String(scope.secao) : prev.receita_secao,
    }))
  }, [scope, isNew])

  useEffect(() => {
    if (!empresaId) return
    let associadosQuery = supabase
      .from('associados')
      .select('associado_id, nome')
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .order('nome')
      .limit(2000)
    if (scope) {
      associadosQuery = associadosQuery.eq('ramo', scope.ramo)
      if (scope.secao != null) {
        associadosQuery = associadosQuery.eq('secao', scope.secao)
      }
    }
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
      associadosQuery,
    ]).then(([r, s, a]) => {
      setRamos((r.data as Ramo[]) ?? [])
      setSecoes(
        (s.data ?? []).map((row) => ({
          id: row.secao_id as number,
          nome: row.nome as string,
          ramo: (row.ramo as number | null) ?? null,
        })),
      )
      setAssociados(
        (a.data ?? []).map((row) => ({
          id: row.associado_id as number,
          nome: row.nome as string,
        })),
      )
    })
  }, [empresaId, scope])

  const secoesFiltradas = useMemo(() => {
    if (!form.receita_ramo) return secoes
    return secoes.filter((s) => s.ramo === Number(form.receita_ramo))
  }, [secoes, form.receita_ramo])

  const atividadesFiltradas = useMemo(() => {
    let list = atividades
    if (form.receita_ramo) {
      list = list.filter((a) => a.ramo === Number(form.receita_ramo))
    }
    if (form.receita_secao) {
      list = list.filter((a) => a.secao === Number(form.receita_secao))
    }
    return list
  }, [atividades, form.receita_ramo, form.receita_secao])

  const projetosFiltrados = useMemo(() => {
    let list = projetos
    if (form.receita_ramo) {
      list = list.filter(
        (p) => p.ramo == null || p.ramo === Number(form.receita_ramo),
      )
    }
    if (form.receita_secao) {
      list = list.filter(
        (p) => p.secao == null || p.secao === Number(form.receita_secao),
      )
    }
    return list
  }, [projetos, form.receita_ramo, form.receita_secao])

  useEffect(() => {
    if (!empresaId) return
    void loadAtividadesLookup(empresaId, { scope }).then((res) => {
      if (!res.error) setAtividades(res.data)
    })
    void loadProjetosLookup(empresaId, { scope }).then((res) => {
      if (!res.error) setProjetos(res.data)
    })
  }, [empresaId, scope])

  useEffect(() => {
    if (!isNew || !projetoIdParam || projetos.length === 0) return
    const pid = Number(projetoIdParam)
    if (!Number.isFinite(pid) || pid <= 0) return
    const projeto = projetos.find((p) => p.projeto_id === pid)
    if (!projeto) return
    setForm((prev) => ({
      ...prev,
      projeto_id: String(projeto.projeto_id),
      receita_ramo:
        prev.receita_ramo ||
        (projeto.ramo != null ? String(projeto.ramo) : prev.receita_ramo),
      receita_secao:
        prev.receita_secao ||
        (projeto.secao != null ? String(projeto.secao) : prev.receita_secao),
      receita_descricao:
        prev.receita_descricao.trim() || `Projeto: ${projeto.descricao}`,
      receita_valor:
        prev.receita_valor.trim() ||
        formatMoney(Number(projeto.valor ?? 0)).replace('R$', '').trim(),
    }))
  }, [isNew, projetoIdParam, projetos])

  useEffect(() => {
    if (isNew || !empresaId) return
    let mounted = true

    void (async () => {
      const { data, error: loadError } = await supabase
        .from('receitas')
        .select(
          'receita_id, receita_descricao, associado_id, receita_ramo, receita_secao, atividade_id, projeto_id, receita_emissao, receita_vencimento, receita_valor, receita_saldo, receita_situacao, receita_observacao, receita_origem, receita_documento',
        )
        .eq('receita_id', Number(id))
        .eq('empresa_id', empresaId)
        .maybeSingle()

      if (!mounted) return
      if (loadError || !data) {
        setError(loadError?.message ?? 'Receita não encontrada')
        setLoading(false)
        return
      }

      if (
        !matchesFinanceiroScope(
          scope,
          data.receita_ramo as number | null,
          data.receita_secao as number | null,
        )
      ) {
        setError('Esta receita não pertence ao seu ramo/seção.')
        setLoading(false)
        return
      }

      const valorNum = Number(data.receita_valor ?? 0)
      const saldoNum = Number(data.receita_saldo ?? 0)

      setForm({
        receita_descricao: data.receita_descricao ?? '',
        associado_id: data.associado_id?.toString() ?? '',
        receita_ramo: data.receita_ramo?.toString() ?? '',
        receita_secao: data.receita_secao?.toString() ?? '',
        atividade_id: data.atividade_id?.toString() ?? '',
        projeto_id: data.projeto_id?.toString() ?? '',
        receita_emissao: data.receita_emissao?.slice(0, 10) ?? '',
        receita_vencimento: data.receita_vencimento?.slice(0, 10) ?? '',
        receita_valor: data.receita_valor != null ? String(data.receita_valor) : '',
        receita_observacao: data.receita_observacao ?? '',
      })
      setOrigem(data.receita_origem ?? RECEITA_ORIGEM.AVULSA)
      setSaldo(saldoNum)
      setSituacao(data.receita_situacao)
      setPaidAmount(Math.max(0, valorNum - saldoNum))
      setDocumentoUrls(parseDocumentUrls(data.receita_documento))
      setDocFiles([])
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [id, isNew, empresaId, scope])

  function update<K extends keyof typeof emptyForm>(
    key: K,
    value: (typeof emptyForm)[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function onDocChange(list: FileList | null) {
    setDocFiles(list ? Array.from(list) : [])
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite) {
      setError('Sem permissão para alterar receitas.')
      return
    }
    if (!empresaId) {
      setError('Grupo escoteiro não carregado.')
      return
    }
    if (!form.receita_descricao.trim()) {
      setError('Informe a descrição.')
      return
    }
    const valor = Number(String(form.receita_valor).replace(',', '.'))
    if (!Number.isFinite(valor) || valor <= 0) {
      setError('Informe um valor maior que zero.')
      return
    }

    const isMensalidadeSave = origem === RECEITA_ORIGEM.MENSALIDADE
    // Mensalidade = conta do grupo (caixa 0); não cai nos ramos.
    const ramoPayload = isMensalidadeSave
      ? null
      : scope
        ? scope.ramo
        : numOrNull(form.receita_ramo)
    const secaoPayload = isMensalidadeSave
      ? null
      : scope?.secao != null
        ? scope.secao
        : numOrNull(form.receita_secao)

    setSaving(true)
    setError(null)

    if (isNew) {
      const { data: inserted, error: insertError } = await supabase
        .from('receitas')
        .insert({
          empresa_id: empresaId,
          receita_origem: RECEITA_ORIGEM.AVULSA,
          receita_descricao: form.receita_descricao.trim(),
          associado_id: numOrNull(form.associado_id),
          receita_ramo: ramoPayload,
          receita_secao: secaoPayload,
          atividade_id: numOrNull(form.atividade_id),
          projeto_id: numOrNull(form.projeto_id),
          receita_emissao: strOrNull(form.receita_emissao),
          receita_vencimento: strOrNull(form.receita_vencimento),
          receita_valor: valor,
          receita_saldo: valor,
          receita_situacao: TITULO_SITUACAO.ABERTO,
          receita_observacao: strOrNull(form.receita_observacao),
        })
        .select('receita_id')
        .single()

      if (insertError || !inserted?.receita_id) {
        setSaving(false)
        setError(insertError?.message ?? 'Falha ao salvar receita.')
        return
      }

      if (docFiles.length > 0) {
        const up = await uploadReceitaDocumentos(
          empresaId,
          inserted.receita_id as number,
          docFiles,
        )
        if ('error' in up) {
          setSaving(false)
          setError(
            `Receita salva, mas o comprovante não foi enviado: ${up.error}`,
          )
          return
        }
      }
    } else {
      if (origem === RECEITA_ORIGEM.MENSALIDADE && situacao !== TITULO_SITUACAO.ABERTO) {
        setSaving(false)
        setError('Mensalidade com recebimento não pode ser alterada por aqui.')
        return
      }

      const newSaldo =
        situacao === TITULO_SITUACAO.ABERTO
          ? valor
          : Math.max(0, valor - paidAmount)

      const { error: updateError } = await supabase
        .from('receitas')
        .update({
          receita_descricao: form.receita_descricao.trim(),
          associado_id: numOrNull(form.associado_id),
          receita_ramo: ramoPayload,
          receita_secao: secaoPayload,
          atividade_id: numOrNull(form.atividade_id),
          projeto_id: numOrNull(form.projeto_id),
          receita_emissao: strOrNull(form.receita_emissao),
          receita_vencimento: strOrNull(form.receita_vencimento),
          receita_valor: valor,
          receita_saldo: newSaldo,
          receita_situacao: situacaoFromSaldo(valor, newSaldo),
          receita_observacao: strOrNull(form.receita_observacao),
        })
        .eq('receita_id', Number(id))
        .eq('empresa_id', empresaId)

      if (updateError) {
        setSaving(false)
        setError(updateError.message)
        return
      }

      if (docFiles.length > 0) {
        const up = await uploadReceitaDocumentos(
          empresaId,
          Number(id),
          docFiles,
          serializeDocumentUrls(documentoUrls),
        )
        if ('error' in up) {
          setSaving(false)
          setError(`Dados salvos, mas o comprovante não foi enviado: ${up.error}`)
          return
        }
      }
    }

    setSaving(false)
    navigate('/receitas/inclusao', {
      state: { flashSuccess: 'Salvo com sucesso!' },
    })
  }

  async function onDelete() {
    if (!canWrite || !empresaId || isNew) return
    if (
      situacao === TITULO_SITUACAO.PAGO ||
      situacao === TITULO_SITUACAO.PARCIAL
    ) {
      setError('Não é possível excluir receita com recebimento registrado.')
      return
    }

    const ok = await toast.confirm({
      title: 'Excluir receita?',
      message: `Tem certeza que deseja excluir "${form.receita_descricao}"?`,
      confirmLabel: 'Sim, excluir',
      cancelLabel: 'Não',
      danger: true,
    })
    if (!ok) return

    setSaving(true)
    setError(null)
    const { error: deleteError } = await supabase
      .from('receitas')
      .delete()
      .eq('receita_id', Number(id))
      .eq('empresa_id', empresaId)

    setSaving(false)
    if (deleteError) {
      setError(deleteError.message)
      return
    }

    navigate('/receitas/inclusao', {
      state: { flashSuccess: 'Excluído com sucesso!' },
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
    return <div className="loading">Carregando receita…</div>
  }

  const disabled = saving || !canWrite
  const isPaid = situacao === TITULO_SITUACAO.PAGO
  const isMensalidade = origem === RECEITA_ORIGEM.MENSALIDADE

  return (
    <>
      <header className="page-header">
        <div>
          <h2>{isNew ? 'Nova receita' : 'Editar receita'}</h2>
          <p>
            Grupo <strong>{empresa?.nome}</strong>
            {!isNew && situacao != null ? (
              <>
                {' '}
                · {isMensalidade ? 'Mensalidade' : 'Avulsa'} ·{' '}
                {situacaoTituloLabel(situacao)}
                {saldo != null ? ` · Saldo ${formatMoney(saldo)}` : ''}
              </>
            ) : null}
          </p>
        </div>
        <Link className="btn btn-soft" to="/receitas/inclusao">
          Voltar
        </Link>
      </header>

      <form className="panel" onSubmit={(e) => void onSubmit(e)}>
        {error ? (
          <AlertMessage tone="error" title="Atenção">
            {error}
          </AlertMessage>
        ) : null}

        <div className="form-grid">
          <div className="field field-span-2">
            <label htmlFor="receita_descricao">Descrição</label>
            <input
              id="receita_descricao"
              className="input"
              value={form.receita_descricao}
              onChange={(e) => update('receita_descricao', e.target.value)}
              disabled={disabled || isPaid}
              required
              maxLength={120}
            />
          </div>

          <div className="field field-span-2">
            <label htmlFor="associado_id">Associado (opcional)</label>
            <select
              id="associado_id"
              className="select"
              value={form.associado_id}
              onChange={(e) => update('associado_id', e.target.value)}
              disabled={disabled || isPaid || isMensalidade}
            >
              <option value="">Nenhum</option>
              {associados.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="receita_ramo">Ramo</label>
            {isMensalidade ? (
              <input
                id="receita_ramo"
                className="input"
                value="Conta do grupo"
                disabled
                readOnly
              />
            ) : (
              <select
                id="receita_ramo"
                className="select"
                value={form.receita_ramo}
                onChange={(e) => {
                  update('receita_ramo', e.target.value)
                  update('receita_secao', '')
                  update('atividade_id', '')
                }}
                disabled={disabled || isPaid || !!scope}
              >
                <option value="">Selecione</option>
                {ramos.map((ramo) => (
                  <option key={ramo.ramo_id} value={ramo.ramo_id}>
                    {ramo.nome}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="field">
            <label htmlFor="receita_secao">Seção</label>
            {isMensalidade ? (
              <input
                id="receita_secao"
                className="input"
                value="—"
                disabled
                readOnly
              />
            ) : (
            <select
              id="receita_secao"
              className="select"
              value={form.receita_secao}
              onChange={(e) => {
                update('receita_secao', e.target.value)
                update('atividade_id', '')
              }}
              disabled={disabled || isPaid || (scope != null && scope.secao != null)}
            >
              <option value="">Selecione</option>
              {secoesFiltradas.map((secao) => (
                <option key={secao.id} value={secao.id}>
                  {secao.nome}
                </option>
              ))}
            </select>
            )}
          </div>

          <div className="field">
            <label htmlFor="atividade_id">Atividade</label>
            <select
              id="atividade_id"
              className="select"
              value={form.atividade_id}
              onChange={(e) => {
                const value = e.target.value
                update('atividade_id', value)
                if (!value) return
                const ativ = atividades.find(
                  (a) => a.atividade_id === Number(value),
                )
                if (!ativ || scope) return
                if (ativ.ramo != null) update('receita_ramo', String(ativ.ramo))
                if (ativ.secao != null) update('receita_secao', String(ativ.secao))
              }}
              disabled={disabled || isPaid}
            >
              <option value="">Nenhuma</option>
              {atividadesFiltradas.map((a) => (
                <option key={a.atividade_id} value={a.atividade_id}>
                  {atividadeLabel(a)}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="projeto_id">Projeto</label>
            <select
              id="projeto_id"
              className="select"
              value={form.projeto_id}
              onChange={(e) => {
                const value = e.target.value
                update('projeto_id', value)
                if (!value) return
                const proj = projetos.find(
                  (p) => p.projeto_id === Number(value),
                )
                if (!proj || scope) return
                if (proj.ramo != null) update('receita_ramo', String(proj.ramo))
                if (proj.secao != null)
                  update('receita_secao', String(proj.secao))
              }}
              disabled={disabled || isPaid}
            >
              <option value="">Nenhum</option>
              {projetosFiltrados.map((p) => (
                <option key={p.projeto_id} value={p.projeto_id}>
                  {projetoLabel(p)}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="receita_emissao">Emissão</label>
            <input
              id="receita_emissao"
              className="input"
              type="date"
              value={form.receita_emissao}
              onChange={(e) => update('receita_emissao', e.target.value)}
              disabled={disabled || isPaid}
            />
          </div>

          <div className="field">
            <label htmlFor="receita_vencimento">Vencimento</label>
            <input
              id="receita_vencimento"
              className="input"
              type="date"
              value={form.receita_vencimento}
              onChange={(e) => update('receita_vencimento', e.target.value)}
              disabled={disabled || isPaid}
            />
          </div>

          <div className="field">
            <label htmlFor="receita_valor">Valor</label>
            <input
              id="receita_valor"
              className="input"
              inputMode="decimal"
              value={form.receita_valor}
              onChange={(e) => update('receita_valor', e.target.value)}
              disabled={disabled || isPaid}
              required
            />
          </div>

          <div className="field field-span-2">
            <label htmlFor="receita_observacao">Observação</label>
            <input
              id="receita_observacao"
              className="input"
              value={form.receita_observacao}
              onChange={(e) => update('receita_observacao', e.target.value)}
              disabled={disabled || isPaid}
              maxLength={200}
            />
          </div>

          <div className="field field-span-2">
            <label htmlFor="receita_documento">Comprovante / documento</label>
            <input
              id="receita_documento"
              className="input"
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,application/pdf,.pdf,.png,.jpg,.jpeg,.webp"
              onChange={(e) => onDocChange(e.target.files)}
              disabled={disabled}
            />
            <span className="field-hint">
              Você pode selecionar vários arquivos. PDF ou imagem (PNG/JPG/WEBP),
              até 5 MB cada. Aparecem no portal da transparência.
            </span>
            <div className="despesa-nota-preview">
              {docFiles.length > 0 ? (
                <ul className="doc-file-list">
                  {docFiles.map((file) => (
                    <li key={`${file.name}-${file.size}`}>
                      <strong>{file.name}</strong>
                      <span className="muted">
                        {' '}
                        ({Math.round(file.size / 1024)} KB)
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {documentoUrls.length > 0 ? (
                <ul className="doc-file-list">
                  {documentoUrls.map((url, index) => (
                    <li key={url}>
                      {isReceitaDocumentoImage(url) ? (
                        <img src={url} alt={documentLabel(url, index)} />
                      ) : null}
                      <a
                        className="btn btn-soft"
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {documentLabel(url, index)}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : docFiles.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  Nenhum documento anexado.
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="form-actions">
          {canWrite && !isPaid ? (
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
          ) : isPaid ? (
            <p className="muted">Receita quitada — edição bloqueada.</p>
          ) : (
            <p className="muted">Modo leitura — sem permissão para salvar.</p>
          )}
          {!isNew && saldo != null && saldo > 0 && canWrite ? (
            <Link className="btn btn-soft" to={`/receitas/recebimento/${id}`}>
              Registrar recebimento
            </Link>
          ) : null}
          <Link className="btn btn-soft" to="/receitas/inclusao">
            Cancelar
          </Link>
        </div>
      </form>
    </>
  )
}
