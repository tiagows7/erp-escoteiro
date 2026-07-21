import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import {
  DESPESA_SITUACAO,
  formatMoney,
  situacaoDespesaLabel,
  situacaoFromSaldo,
} from '@/lib/despesas'
import { isNotaImage, uploadDespesaNota } from '@/lib/uploadDespesaNota'
import {
  matchesFinanceiroScope,
  resolveFinanceiroScope,
} from '@/lib/financeiroScope'
import {
  atividadeLabel,
  loadAtividadesLookup,
  type AtividadeLookup,
} from '@/lib/atividadesLookup'
import type { Ramo } from '@/types/database'

type Lookup = { id: number; nome: string; ramo?: number | null; secao?: number | null }

const emptyForm = {
  despesa_fornecedor: '',
  despesa_ramo: '',
  despesa_secao: '',
  despesa_secaonome: '',
  atividade_id: '',
  despesa_numeronota: '',
  despesa_emissao: '',
  despesa_vencimento: '',
  despesa_valor: '',
  despesa_finalidade: '',
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

export function DespesaFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const { empresa, profile, hasPermission } = useAuth()
  const canWrite = hasPermission('financeiro.write')
  const empresaId = empresa?.id
  const scope = useMemo(() => resolveFinanceiroScope(profile), [profile])
  const toast = useToast()

  const [form, setForm] = useState({
    ...emptyForm,
    despesa_emissao: todayISO(),
    despesa_vencimento: todayISO(),
  })
  const [saldo, setSaldo] = useState<number | null>(null)
  const [situacao, setSituacao] = useState<number | null>(null)
  const [paidAmount, setPaidAmount] = useState(0)
  const [ramos, setRamos] = useState<Ramo[]>([])
  const [secoes, setSecoes] = useState<Lookup[]>([])
  const [patrulhas, setPatrulhas] = useState<Lookup[]>([])
  const [fornecedores, setFornecedores] = useState<Lookup[]>([])
  const [atividades, setAtividades] = useState<AtividadeLookup[]>([])
  const [documentoUrl, setDocumentoUrl] = useState<string | null>(null)
  const [notaFile, setNotaFile] = useState<File | null>(null)
  const [notaPreview, setNotaPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)

  useEffect(() => {
    if (!scope || !isNew) return
    setForm((prev) => ({
      ...prev,
      despesa_ramo: String(scope.ramo),
      despesa_secao:
        scope.secao != null ? String(scope.secao) : prev.despesa_secao,
    }))
  }, [scope, isNew])

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
        .select('secaonome_id, nome, secao, ramo')
        .eq('empresa_id', empresaId)
        .order('nome'),
      supabase
        .from('fornecedor_despesa')
        .select('fordespesa_id, fordespesa_nome')
        .eq('empresa_id', empresaId)
        .order('fordespesa_nome'),
    ]).then(([r, s, p, f]) => {
      setRamos((r.data as Ramo[]) ?? [])
      setSecoes(
        (s.data ?? []).map((row) => ({
          id: row.secao_id as number,
          nome: row.nome as string,
          ramo: (row.ramo as number | null) ?? null,
        })),
      )
      setPatrulhas(
        (p.data ?? []).map((row) => ({
          id: row.secaonome_id as number,
          nome: row.nome as string,
          ramo: (row.ramo as number | null) ?? null,
          secao: (row.secao as number | null) ?? null,
        })),
      )
      setFornecedores(
        (f.data ?? []).map((row) => ({
          id: row.fordespesa_id as number,
          nome:
            (row.fordespesa_nome as string) ||
            `Fornecedor #${row.fordespesa_id}`,
        })),
      )
    })
  }, [empresaId])

  const secoesFiltradas = useMemo(() => {
    if (!form.despesa_ramo) return secoes
    return secoes.filter((s) => s.ramo === Number(form.despesa_ramo))
  }, [secoes, form.despesa_ramo])

  const patrulhasFiltradas = useMemo(() => {
    let list = patrulhas
    if (form.despesa_ramo) {
      list = list.filter((p) => p.ramo === Number(form.despesa_ramo))
    }
    if (form.despesa_secao) {
      list = list.filter((p) => p.secao === Number(form.despesa_secao))
    }
    return list
  }, [patrulhas, form.despesa_ramo, form.despesa_secao])

  const atividadesFiltradas = useMemo(() => {
    let list = atividades
    if (form.despesa_ramo) {
      list = list.filter((a) => a.ramo === Number(form.despesa_ramo))
    }
    if (form.despesa_secao) {
      list = list.filter((a) => a.secao === Number(form.despesa_secao))
    }
    return list
  }, [atividades, form.despesa_ramo, form.despesa_secao])

  useEffect(() => {
    if (!empresaId) return
    void loadAtividadesLookup(empresaId, { scope }).then((res) => {
      if (!res.error) setAtividades(res.data)
    })
  }, [empresaId, scope])

  useEffect(() => {
    if (isNew || !empresaId) return
    let mounted = true

    void (async () => {
      const { data, error: loadError } = await supabase
        .from('despesas')
        .select(
          'despesa_id, despesa_fornecedor, despesa_ramo, despesa_secao, despesa_secaonome, atividade_id, despesa_numeronota, despesa_emissao, despesa_vencimento, despesa_valor, despesa_saldo, despesa_situacao, despesa_finalidade, despesa_documento',
        )
        .eq('despesa_id', Number(id))
        .eq('empresa_id', empresaId)
        .maybeSingle()

      if (!mounted) return
      if (loadError || !data) {
        setError(loadError?.message ?? 'Despesa não encontrada')
        setLoading(false)
        return
      }

      if (
        !matchesFinanceiroScope(
          scope,
          data.despesa_ramo as number | null,
          data.despesa_secao as number | null,
        )
      ) {
        setError('Esta despesa não pertence ao seu ramo/seção.')
        setLoading(false)
        return
      }

      const valorNum = Number(data.despesa_valor ?? 0)
      const saldoNum = Number(data.despesa_saldo ?? 0)

      setForm({
        despesa_fornecedor: data.despesa_fornecedor?.toString() ?? '',
        despesa_ramo: data.despesa_ramo?.toString() ?? '',
        despesa_secao: data.despesa_secao?.toString() ?? '',
        despesa_secaonome: data.despesa_secaonome?.toString() ?? '',
        atividade_id: data.atividade_id?.toString() ?? '',
        despesa_numeronota: data.despesa_numeronota ?? '',
        despesa_emissao: data.despesa_emissao?.slice(0, 10) ?? '',
        despesa_vencimento: data.despesa_vencimento?.slice(0, 10) ?? '',
        despesa_valor: data.despesa_valor != null ? String(data.despesa_valor) : '',
        despesa_finalidade: data.despesa_finalidade ?? '',
      })
      setSaldo(saldoNum)
      setSituacao(data.despesa_situacao)
      setPaidAmount(Math.max(0, valorNum - saldoNum))
      setDocumentoUrl(data.despesa_documento ?? null)
      setNotaFile(null)
      setNotaPreview(null)
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

  function onNotaChange(file: File | null) {
    if (notaPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(notaPreview)
    }
    setNotaFile(file)
    if (file && file.type.startsWith('image/')) {
      setNotaPreview(URL.createObjectURL(file))
    } else {
      setNotaPreview(null)
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite) {
      setError('Sem permissão para alterar despesas.')
      return
    }
    if (!empresaId) {
      setError('Grupo escoteiro não carregado.')
      return
    }
    if (!form.despesa_finalidade.trim()) {
      setError('Informe a finalidade.')
      return
    }
    const valor = Number(String(form.despesa_valor).replace(',', '.'))
    if (!Number.isFinite(valor) || valor <= 0) {
      setError('Informe um valor maior que zero.')
      return
    }

    const ramoPayload = scope ? scope.ramo : numOrNull(form.despesa_ramo)
    const secaoPayload =
      scope?.secao != null ? scope.secao : numOrNull(form.despesa_secao)

    setSaving(true)
    setError(null)

    if (isNew) {
      const { data: created, error: insertError } = await supabase
        .from('despesas')
        .insert({
          empresa_id: empresaId,
          despesa_fornecedor: numOrNull(form.despesa_fornecedor),
          despesa_ramo: ramoPayload,
          despesa_secao: secaoPayload,
          despesa_secaonome: numOrNull(form.despesa_secaonome),
          atividade_id: numOrNull(form.atividade_id),
          despesa_numeronota: strOrNull(form.despesa_numeronota),
          despesa_emissao: strOrNull(form.despesa_emissao),
          despesa_vencimento: strOrNull(form.despesa_vencimento),
          despesa_valor: valor,
          despesa_saldo: valor,
          despesa_situacao: DESPESA_SITUACAO.ABERTO,
          despesa_finalidade: form.despesa_finalidade.trim(),
        })
        .select('despesa_id')
        .single()

      if (insertError || !created) {
        setSaving(false)
        setError(insertError?.message ?? 'Não foi possível salvar a despesa.')
        return
      }

      if (notaFile) {
        const up = await uploadDespesaNota(
          empresaId,
          created.despesa_id as number,
          notaFile,
        )
        if ('error' in up) {
          setSaving(false)
          setError(
            `Despesa salva, mas a nota não foi enviada: ${up.error}`,
          )
          return
        }
      }
    } else {
      const newSaldo =
        situacao === DESPESA_SITUACAO.ABERTO
          ? valor
          : Math.max(0, valor - paidAmount)

      const { error: updateError } = await supabase
        .from('despesas')
        .update({
          despesa_fornecedor: numOrNull(form.despesa_fornecedor),
          despesa_ramo: ramoPayload,
          despesa_secao: secaoPayload,
          despesa_secaonome: numOrNull(form.despesa_secaonome),
          atividade_id: numOrNull(form.atividade_id),
          despesa_numeronota: strOrNull(form.despesa_numeronota),
          despesa_emissao: strOrNull(form.despesa_emissao),
          despesa_vencimento: strOrNull(form.despesa_vencimento),
          despesa_valor: valor,
          despesa_saldo: newSaldo,
          despesa_situacao: situacaoFromSaldo(valor, newSaldo),
          despesa_finalidade: form.despesa_finalidade.trim(),
        })
        .eq('despesa_id', Number(id))
        .eq('empresa_id', empresaId)

      if (updateError) {
        setSaving(false)
        setError(updateError.message)
        return
      }

      if (notaFile) {
        const up = await uploadDespesaNota(empresaId, Number(id), notaFile)
        if ('error' in up) {
          setSaving(false)
          setError(`Dados salvos, mas a nota não foi enviada: ${up.error}`)
          return
        }
      }
    }

    setSaving(false)
    navigate('/despesas/inclusao', {
      state: { flashSuccess: 'Salvo com sucesso!' },
    })
  }

  async function onDelete() {
    if (!canWrite || !empresaId || isNew) return
    if (
      situacao === DESPESA_SITUACAO.PAGO ||
      situacao === DESPESA_SITUACAO.PARCIAL
    ) {
      setError('Não é possível excluir despesa com pagamento registrado.')
      return
    }

    const ok = await toast.confirm({
      title: 'Excluir despesa?',
      message: `Tem certeza que deseja excluir "${form.despesa_finalidade}"?`,
      confirmLabel: 'Sim, excluir',
      cancelLabel: 'Não',
      danger: true,
    })
    if (!ok) return

    setSaving(true)
    setError(null)
    const { error: deleteError } = await supabase
      .from('despesas')
      .delete()
      .eq('despesa_id', Number(id))
      .eq('empresa_id', empresaId)

    setSaving(false)
    if (deleteError) {
      setError(deleteError.message)
      return
    }

    navigate('/despesas/inclusao', {
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
    return <div className="loading">Carregando despesa…</div>
  }

  const disabled = saving || !canWrite
  const isPaid = situacao === DESPESA_SITUACAO.PAGO

  return (
    <>
      <header className="page-header">
        <div>
          <h2>{isNew ? 'Nova despesa' : 'Editar despesa'}</h2>
          <p>
            Grupo <strong>{empresa?.nome}</strong>
            {!isNew && situacao != null ? (
              <>
                {' '}
                · {situacaoDespesaLabel(situacao)}
                {saldo != null ? ` · Saldo ${formatMoney(saldo)}` : ''}
              </>
            ) : null}
          </p>
        </div>
        <Link className="btn btn-soft" to="/despesas/inclusao">
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
            <label htmlFor="despesa_fornecedor">Fornecedor</label>
            <select
              id="despesa_fornecedor"
              className="select"
              value={form.despesa_fornecedor}
              onChange={(e) => update('despesa_fornecedor', e.target.value)}
              disabled={disabled || isPaid}
            >
              <option value="">Selecione</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="despesa_ramo">Ramo</label>
            <select
              id="despesa_ramo"
              className="select"
              value={form.despesa_ramo}
              onChange={(e) => {
                update('despesa_ramo', e.target.value)
                update('despesa_secao', '')
                update('despesa_secaonome', '')
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
          </div>

          <div className="field">
            <label htmlFor="despesa_secao">Seção</label>
            <select
              id="despesa_secao"
              className="select"
              value={form.despesa_secao}
              onChange={(e) => {
                update('despesa_secao', e.target.value)
                update('despesa_secaonome', '')
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
          </div>

          <div className="field">
            <label htmlFor="despesa_secaonome">Patrulha / Matilha</label>
            <select
              id="despesa_secaonome"
              className="select"
              value={form.despesa_secaonome}
              onChange={(e) => update('despesa_secaonome', e.target.value)}
              disabled={disabled || isPaid}
            >
              <option value="">Selecione</option>
              {patrulhasFiltradas.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="field field-span-2">
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
                if (ativ.ramo != null) update('despesa_ramo', String(ativ.ramo))
                if (ativ.secao != null) update('despesa_secao', String(ativ.secao))
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
            <label htmlFor="despesa_numeronota">Nº documento / nota</label>
            <input
              id="despesa_numeronota"
              className="input"
              value={form.despesa_numeronota}
              onChange={(e) => update('despesa_numeronota', e.target.value)}
              disabled={disabled || isPaid}
              maxLength={20}
            />
          </div>

          <div className="field">
            <label htmlFor="despesa_emissao">Emissão</label>
            <input
              id="despesa_emissao"
              className="input"
              type="date"
              value={form.despesa_emissao}
              onChange={(e) => update('despesa_emissao', e.target.value)}
              disabled={disabled || isPaid}
            />
          </div>

          <div className="field">
            <label htmlFor="despesa_vencimento">Vencimento</label>
            <input
              id="despesa_vencimento"
              className="input"
              type="date"
              value={form.despesa_vencimento}
              onChange={(e) => update('despesa_vencimento', e.target.value)}
              disabled={disabled || isPaid}
            />
          </div>

          <div className="field">
            <label htmlFor="despesa_valor">Valor</label>
            <input
              id="despesa_valor"
              className="input"
              inputMode="decimal"
              value={form.despesa_valor}
              onChange={(e) => update('despesa_valor', e.target.value)}
              disabled={disabled || isPaid}
              required
            />
          </div>

          <div className="field field-span-2">
            <label htmlFor="despesa_finalidade">Finalidade</label>
            <input
              id="despesa_finalidade"
              className="input"
              value={form.despesa_finalidade}
              onChange={(e) => update('despesa_finalidade', e.target.value)}
              disabled={disabled || isPaid}
              required
              maxLength={100}
            />
          </div>

          <div className="field field-span-2">
            <label htmlFor="despesa_nota">Nota / comprovante</label>
            <input
              id="despesa_nota"
              className="input"
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf,.pdf,.png,.jpg,.jpeg,.webp"
              onChange={(e) => onNotaChange(e.target.files?.[0] ?? null)}
              disabled={disabled}
            />
            <span className="field-hint">
              PDF ou imagem (PNG/JPG/WEBP), até 5 MB.
            </span>

            <div className="despesa-nota-preview">
              {notaPreview ? (
                <img src={notaPreview} alt="Prévia da nota" />
              ) : notaFile ? (
                <p className="muted" style={{ margin: 0 }}>
                  Arquivo selecionado: <strong>{notaFile.name}</strong>
                </p>
              ) : documentoUrl ? (
                <>
                  {isNotaImage(documentoUrl) ? (
                    <img src={documentoUrl} alt="Nota da despesa" />
                  ) : null}
                  <a
                    className="btn btn-soft"
                    href={documentoUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir nota anexada
                  </a>
                </>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  Nenhuma nota anexada.
                </p>
              )}
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
            <p className="muted">Despesa paga — edição bloqueada.</p>
          ) : (
            <p className="muted">Modo leitura — sem permissão para salvar.</p>
          )}
          {!isNew && saldo != null && saldo > 0 && canWrite ? (
            <Link className="btn btn-soft" to={`/despesas/pagamento/${id}`}>
              Registrar pagamento
            </Link>
          ) : null}
          <Link className="btn btn-soft" to="/despesas/inclusao">
            Cancelar
          </Link>
        </div>
      </form>
    </>
  )
}
