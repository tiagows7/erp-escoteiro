import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'

type Lookup = { id: number; nome: string }

const emptyForm = {
  fordespesa_nome: '',
  fordespesa_cnpj: '',
  fordespesa_tipo: 'J',
  fordespesa_despesa: 'D',
  fordespesa_email: '',
  fordespesa_email2: '',
  fordespesa_fone1: '',
  fordespesa_fone2: '',
  fordespesa_fone3: '',
  fordespesa_endereco: '',
  fordespesa_numero: '',
  fordespesa_complemento: '',
  fordespesa_bairro: '',
  fordespesa_uf: '',
  fordespesa_cidade: '',
  fordespesa_cep: '',
}

function numOrNull(value: string) {
  return value ? Number(value) : null
}

function strOrNull(value: string) {
  const v = value.trim()
  return v || null
}

export function FornecedorFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const { empresa, hasPermission } = useAuth()
  const canWrite = hasPermission('financeiro.write')
  const empresaId = empresa?.id
  const toast = useToast()

  const [form, setForm] = useState(emptyForm)
  const [estados, setEstados] = useState<{ codigo: string; nome: string }[]>(
    [],
  )
  const [cidades, setCidades] = useState<Lookup[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)

  useEffect(() => {
    void supabase
      .from('estado')
      .select('codigo, nome')
      .order('nome')
      .then(({ data }) =>
        setEstados(
          (data ?? []).map((row) => ({
            codigo: String(row.codigo),
            nome: row.nome as string,
          })),
        ),
      )
  }, [])

  useEffect(() => {
    if (!form.fordespesa_uf) {
      setCidades([])
      return
    }
    void supabase
      .from('cidade')
      .select('codigo, nome')
      .eq('uf', form.fordespesa_uf)
      .order('nome')
      .limit(1000)
      .then(({ data }) =>
        setCidades(
          (data ?? []).map((row) => ({
            id: row.codigo as number,
            nome: row.nome as string,
          })),
        ),
      )
  }, [form.fordespesa_uf])

  useEffect(() => {
    if (isNew || !empresaId) return
    let mounted = true

    void (async () => {
      const { data, error: loadError } = await supabase
        .from('fornecedor_despesa')
        .select(
          'fordespesa_id, fordespesa_nome, fordespesa_cnpj, fordespesa_tipo, fordespesa_despesa, fordespesa_email, fordespesa_email2, fordespesa_fone1, fordespesa_fone2, fordespesa_fone3, fordespesa_endereco, fordespesa_numero, fordespesa_complemento, fordespesa_bairro, fordespesa_uf, fordespesa_cidade, fordespesa_cep',
        )
        .eq('fordespesa_id', Number(id))
        .eq('empresa_id', empresaId)
        .maybeSingle()

      if (!mounted) return
      if (loadError || !data) {
        setError(loadError?.message ?? 'Fornecedor não encontrado')
        setLoading(false)
        return
      }

      setForm({
        fordespesa_nome: data.fordespesa_nome ?? '',
        fordespesa_cnpj: data.fordespesa_cnpj ?? '',
        fordespesa_tipo: data.fordespesa_tipo ?? 'J',
        fordespesa_despesa: data.fordespesa_despesa ?? 'D',
        fordespesa_email: data.fordespesa_email ?? '',
        fordespesa_email2: data.fordespesa_email2 ?? '',
        fordespesa_fone1: data.fordespesa_fone1 ?? '',
        fordespesa_fone2: data.fordespesa_fone2 ?? '',
        fordespesa_fone3: data.fordespesa_fone3 ?? '',
        fordespesa_endereco: data.fordespesa_endereco ?? '',
        fordespesa_numero: data.fordespesa_numero ?? '',
        fordespesa_complemento: data.fordespesa_complemento ?? '',
        fordespesa_bairro: data.fordespesa_bairro ?? '',
        fordespesa_uf: data.fordespesa_uf ?? '',
        fordespesa_cidade: data.fordespesa_cidade?.toString() ?? '',
        fordespesa_cep: data.fordespesa_cep ?? '',
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
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function payload() {
    return {
      empresa_id: empresaId!,
      fordespesa_nome: form.fordespesa_nome.trim(),
      fordespesa_cnpj: strOrNull(form.fordespesa_cnpj),
      fordespesa_tipo: form.fordespesa_tipo || null,
      fordespesa_despesa: form.fordespesa_despesa || null,
      fordespesa_email: strOrNull(form.fordespesa_email),
      fordespesa_email2: strOrNull(form.fordespesa_email2),
      fordespesa_fone1: strOrNull(form.fordespesa_fone1),
      fordespesa_fone2: strOrNull(form.fordespesa_fone2),
      fordespesa_fone3: strOrNull(form.fordespesa_fone3),
      fordespesa_endereco: strOrNull(form.fordespesa_endereco),
      fordespesa_numero: strOrNull(form.fordespesa_numero),
      fordespesa_complemento: strOrNull(form.fordespesa_complemento),
      fordespesa_bairro: strOrNull(form.fordespesa_bairro),
      fordespesa_uf: strOrNull(form.fordespesa_uf.toUpperCase()),
      fordespesa_cidade: numOrNull(form.fordespesa_cidade),
      fordespesa_cep: strOrNull(form.fordespesa_cep),
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite) {
      setError('Sem permissão para alterar fornecedores.')
      return
    }
    if (!empresaId) {
      setError('Grupo escoteiro não carregado.')
      return
    }
    if (!form.fordespesa_nome.trim()) {
      setError('Informe o nome.')
      return
    }

    setSaving(true)
    setError(null)

    if (isNew) {
      const { error: insertError } = await supabase
        .from('fornecedor_despesa')
        .insert(payload())

      setSaving(false)
      if (insertError) {
        setError(insertError.message)
        return
      }
    } else {
      const { error: updateError } = await supabase
        .from('fornecedor_despesa')
        .update(payload())
        .eq('fordespesa_id', Number(id))
        .eq('empresa_id', empresaId)

      setSaving(false)
      if (updateError) {
        setError(updateError.message)
        return
      }
    }

    navigate('/cadastros/fornecedores', {
      state: { flashSuccess: 'Salvo com sucesso!' },
    })
  }

  async function onDelete() {
    if (!canWrite || !empresaId || isNew) return

    const ok = await toast.confirm({
      title: 'Excluir fornecedor?',
      message: `Tem certeza que deseja excluir "${form.fordespesa_nome}"?`,
      confirmLabel: 'Sim, excluir',
      cancelLabel: 'Não',
      danger: true,
    })
    if (!ok) return

    setSaving(true)
    setError(null)
    const { error: deleteError } = await supabase
      .from('fornecedor_despesa')
      .delete()
      .eq('fordespesa_id', Number(id))
      .eq('empresa_id', empresaId)

    setSaving(false)
    if (deleteError) {
      setError(deleteError.message)
      return
    }

    navigate('/cadastros/fornecedores', {
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
    return <div className="loading">Carregando fornecedor…</div>
  }

  const disabled = saving || !canWrite

  return (
    <>
      <header className="page-header">
        <div>
          <h2>{isNew ? 'Novo fornecedor' : 'Editar fornecedor'}</h2>
          <p>
            Grupo <strong>{empresa?.nome}</strong>
          </p>
        </div>
        <Link className="btn btn-soft" to="/cadastros/fornecedores">
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
            <label htmlFor="fordespesa_nome">Nome</label>
            <input
              id="fordespesa_nome"
              className="input"
              value={form.fordespesa_nome}
              onChange={(e) => update('fordespesa_nome', e.target.value)}
              disabled={disabled}
              required
              maxLength={70}
            />
          </div>

          <div className="field">
            <label htmlFor="fordespesa_cnpj">CPF / CNPJ</label>
            <input
              id="fordespesa_cnpj"
              className="input"
              value={form.fordespesa_cnpj}
              onChange={(e) => update('fordespesa_cnpj', e.target.value)}
              disabled={disabled}
              maxLength={14}
            />
          </div>

          <div className="field">
            <label htmlFor="fordespesa_tipo">Tipo pessoa</label>
            <select
              id="fordespesa_tipo"
              className="select"
              value={form.fordespesa_tipo}
              onChange={(e) => update('fordespesa_tipo', e.target.value)}
              disabled={disabled}
            >
              <option value="J">Jurídica</option>
              <option value="F">Física</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="fordespesa_despesa">Natureza</label>
            <select
              id="fordespesa_despesa"
              className="select"
              value={form.fordespesa_despesa}
              onChange={(e) => update('fordespesa_despesa', e.target.value)}
              disabled={disabled}
            >
              <option value="D">Despesa</option>
              <option value="R">Receita</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="fordespesa_fone1">Telefone 1</label>
            <input
              id="fordespesa_fone1"
              className="input"
              value={form.fordespesa_fone1}
              onChange={(e) => update('fordespesa_fone1', e.target.value)}
              disabled={disabled}
              maxLength={14}
            />
          </div>

          <div className="field">
            <label htmlFor="fordespesa_fone2">Telefone 2</label>
            <input
              id="fordespesa_fone2"
              className="input"
              value={form.fordespesa_fone2}
              onChange={(e) => update('fordespesa_fone2', e.target.value)}
              disabled={disabled}
              maxLength={14}
            />
          </div>

          <div className="field">
            <label htmlFor="fordespesa_fone3">Telefone 3</label>
            <input
              id="fordespesa_fone3"
              className="input"
              value={form.fordespesa_fone3}
              onChange={(e) => update('fordespesa_fone3', e.target.value)}
              disabled={disabled}
              maxLength={14}
            />
          </div>

          <div className="field">
            <label htmlFor="fordespesa_email">E-mail</label>
            <input
              id="fordespesa_email"
              className="input"
              type="email"
              value={form.fordespesa_email}
              onChange={(e) => update('fordespesa_email', e.target.value)}
              disabled={disabled}
              maxLength={60}
            />
          </div>

          <div className="field">
            <label htmlFor="fordespesa_email2">E-mail 2</label>
            <input
              id="fordespesa_email2"
              className="input"
              type="email"
              value={form.fordespesa_email2}
              onChange={(e) => update('fordespesa_email2', e.target.value)}
              disabled={disabled}
              maxLength={60}
            />
          </div>

          <div className="field field-span-2">
            <label htmlFor="fordespesa_endereco">Endereço</label>
            <input
              id="fordespesa_endereco"
              className="input"
              value={form.fordespesa_endereco}
              onChange={(e) => update('fordespesa_endereco', e.target.value)}
              disabled={disabled}
              maxLength={60}
            />
          </div>

          <div className="field">
            <label htmlFor="fordespesa_numero">Número</label>
            <input
              id="fordespesa_numero"
              className="input"
              value={form.fordespesa_numero}
              onChange={(e) => update('fordespesa_numero', e.target.value)}
              disabled={disabled}
              maxLength={10}
            />
          </div>

          <div className="field">
            <label htmlFor="fordespesa_complemento">Complemento</label>
            <input
              id="fordespesa_complemento"
              className="input"
              value={form.fordespesa_complemento}
              onChange={(e) => update('fordespesa_complemento', e.target.value)}
              disabled={disabled}
              maxLength={20}
            />
          </div>

          <div className="field">
            <label htmlFor="fordespesa_bairro">Bairro</label>
            <input
              id="fordespesa_bairro"
              className="input"
              value={form.fordespesa_bairro}
              onChange={(e) => update('fordespesa_bairro', e.target.value)}
              disabled={disabled}
              maxLength={30}
            />
          </div>

          <div className="field">
            <label htmlFor="fordespesa_cep">CEP</label>
            <input
              id="fordespesa_cep"
              className="input"
              value={form.fordespesa_cep}
              onChange={(e) => update('fordespesa_cep', e.target.value)}
              disabled={disabled}
              maxLength={8}
            />
          </div>

          <div className="field">
            <label htmlFor="fordespesa_uf">UF</label>
            <select
              id="fordespesa_uf"
              className="select"
              value={form.fordespesa_uf}
              onChange={(e) => {
                update('fordespesa_uf', e.target.value)
                update('fordespesa_cidade', '')
              }}
              disabled={disabled}
            >
              <option value="">Selecione</option>
              {estados.map((uf) => (
                <option key={uf.codigo} value={uf.codigo}>
                  {uf.codigo} — {uf.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="fordespesa_cidade">Cidade</label>
            <select
              id="fordespesa_cidade"
              className="select"
              value={form.fordespesa_cidade}
              onChange={(e) => update('fordespesa_cidade', e.target.value)}
              disabled={disabled || !form.fordespesa_uf}
            >
              <option value="">Selecione</option>
              {cidades.map((cidade) => (
                <option key={cidade.id} value={cidade.id}>
                  {cidade.nome}
                </option>
              ))}
            </select>
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
          <Link className="btn btn-soft" to="/cadastros/fornecedores">
            Cancelar
          </Link>
        </div>
      </form>
    </>
  )
}
