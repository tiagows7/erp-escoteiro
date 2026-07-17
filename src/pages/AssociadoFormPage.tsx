import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import type { Ramo } from '@/types/database'

type Lookup = { id: number; nome: string }
type TabId = 'geral' | 'endereco' | 'outras' | 'responsavel'

const emptyForm = {
  registro: '',
  registro_identificador: '',
  nome: '',
  email: '',
  fone_residencial: '',
  celular: '',
  rg: '',
  cpf: '',
  data_nascimento: '',
  validade_registro: '',
  tipo_mensalidade: '',
  ativo: true,
  isento: false,
  endereco_cep: '',
  endereco: '',
  endereco_numero: '',
  endereco_complemento: '',
  endereco_bairro: '',
  endereco_uf: '',
  endereco_cidade: '',
  categoria: '',
  categoria2: '',
  ramo: '',
  secao: '',
  patrulha_matilha: '',
  funcao: '',
  responsavel_nome: '',
  responsavel_foneresi: '',
  responsavel_fonecelular: '',
  responsavel_email: '',
  responsavel_cpf: '',
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'geral', label: 'Geral' },
  { id: 'endereco', label: 'Endereço' },
  { id: 'outras', label: 'Outras informações' },
  { id: 'responsavel', label: 'Responsáveis' },
]

function numOrNull(value: string) {
  return value ? Number(value) : null
}

function strOrNull(value: string) {
  const v = value.trim()
  return v || null
}

export function AssociadoFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const { empresa, hasPermission } = useAuth()
  const canWrite = hasPermission('associados.write')
  const empresaId = empresa?.id
  const toast = useToast()

  const [tab, setTab] = useState<TabId>('geral')
  const [form, setForm] = useState(emptyForm)
  const [ramos, setRamos] = useState<Ramo[]>([])
  const [secoes, setSecoes] = useState<Lookup[]>([])
  const [patrulhas, setPatrulhas] = useState<Lookup[]>([])
  const [categorias, setCategorias] = useState<Lookup[]>([])
  const [funcoes, setFuncoes] = useState<Lookup[]>([])
  const [mensalidades, setMensalidades] = useState<Lookup[]>([])
  const [estados, setEstados] = useState<{ codigo: string; nome: string }[]>([])
  const [cidades, setCidades] = useState<Lookup[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)

  useEffect(() => {
    if (!empresaId) return
    void Promise.all([
      supabase.from('ramos').select('ramo_id, nome, idade_inicio, idade_fim').order('ramo_id'),
      supabase.from('categoria').select('categoria_id, nome').order('nome'),
      supabase.from('funcao').select('funcao_id, nome').order('nome'),
      supabase.from('estado').select('codigo, nome').order('nome'),
      supabase
        .from('tipo_mensalidade')
        .select('tipomensalidade_id, nome')
        .eq('empresa_id', empresaId)
        .order('nome'),
    ]).then(([r, c, f, e, m]) => {
      setRamos((r.data as Ramo[]) ?? [])
      setCategorias(
        (c.data ?? []).map((row) => ({
          id: row.categoria_id as number,
          nome: row.nome as string,
        })),
      )
      setFuncoes(
        (f.data ?? []).map((row) => ({
          id: row.funcao_id as number,
          nome: row.nome as string,
        })),
      )
      setEstados(
        (e.data ?? []).map((row) => ({
          codigo: row.codigo as string,
          nome: row.nome as string,
        })),
      )
      setMensalidades(
        (m.data ?? []).map((row) => ({
          id: row.tipomensalidade_id as number,
          nome: row.nome as string,
        })),
      )
    })
  }, [empresaId])

  useEffect(() => {
    if (!empresaId || !form.ramo) {
      setSecoes([])
      return
    }
    void supabase
      .from('secao')
      .select('secao_id, nome')
      .eq('empresa_id', empresaId)
      .eq('ramo', Number(form.ramo))
      .order('nome')
      .then(({ data }) =>
        setSecoes(
          (data ?? []).map((row) => ({
            id: row.secao_id as number,
            nome: row.nome as string,
          })),
        ),
      )
  }, [form.ramo, empresaId])

  useEffect(() => {
    if (!empresaId || !form.secao) {
      setPatrulhas([])
      return
    }
    void supabase
      .from('secao_nome')
      .select('secaonome_id, nome')
      .eq('empresa_id', empresaId)
      .eq('secao', Number(form.secao))
      .order('nome')
      .then(({ data }) =>
        setPatrulhas(
          (data ?? []).map((row) => ({
            id: row.secaonome_id as number,
            nome: row.nome as string,
          })),
        ),
      )
  }, [form.secao, empresaId])

  useEffect(() => {
    if (!form.endereco_uf) {
      setCidades([])
      return
    }
    void supabase
      .from('cidade')
      .select('codigo, nome')
      .eq('uf', form.endereco_uf)
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
  }, [form.endereco_uf])

  useEffect(() => {
    if (isNew || !empresaId) return
    let mounted = true

    void (async () => {
      const { data, error: loadError } = await supabase
        .from('associados')
        .select('*')
        .eq('associado_id', Number(id))
        .eq('empresa_id', empresaId)
        .maybeSingle()

      if (!mounted) return
      if (loadError || !data) {
        setError(loadError?.message ?? 'Associado não encontrado neste grupo')
        setLoading(false)
        return
      }

      setForm({
        registro: data.registro?.toString() ?? '',
        registro_identificador: data.registro_identificador?.toString() ?? '',
        nome: data.nome ?? '',
        email: data.email ?? '',
        fone_residencial: data.fone_residencial ?? '',
        celular: data.celular ?? '',
        rg: data.rg ?? '',
        cpf: data.cpf ?? '',
        data_nascimento: data.data_nascimento ?? '',
        validade_registro: data.validade_registro ?? '',
        tipo_mensalidade: data.tipo_mensalidade?.toString() ?? '',
        ativo: data.ativo ?? true,
        isento: data.isento ?? false,
        endereco_cep: data.endereco_cep ?? '',
        endereco: data.endereco ?? '',
        endereco_numero: data.endereco_numero ?? '',
        endereco_complemento: data.endereco_complemento ?? '',
        endereco_bairro: data.endereco_bairro ?? '',
        endereco_uf: data.endereco_uf ?? '',
        endereco_cidade: data.endereco_cidade?.toString() ?? '',
        categoria: data.categoria?.toString() ?? '',
        categoria2: data.categoria2?.toString() ?? '',
        ramo: data.ramo?.toString() ?? '',
        secao: data.secao?.toString() ?? '',
        patrulha_matilha: data.patrulha_matilha?.toString() ?? '',
        funcao: data.funcao?.toString() ?? '',
        responsavel_nome: data.responsavel_nome ?? '',
        responsavel_foneresi: data.responsavel_foneresi ?? '',
        responsavel_fonecelular: data.responsavel_fonecelular ?? '',
        responsavel_email: data.responsavel_email ?? '',
        responsavel_cpf: data.responsavel_cpf ?? '',
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

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite) {
      setError('Seu usuário não tem permissão para alterar associados.')
      return
    }
    if (!empresaId) {
      setError('Grupo escoteiro não carregado no perfil do usuário.')
      return
    }
    if (!form.nome.trim()) {
      setError('Informe o nome do associado.')
      setTab('geral')
      return
    }

    setSaving(true)
    setError(null)

    const payload = {
      empresa_id: empresaId,
      registro: numOrNull(form.registro),
      registro_identificador: numOrNull(form.registro_identificador),
      nome: form.nome.trim().toUpperCase(),
      email: strOrNull(form.email),
      fone_residencial: strOrNull(form.fone_residencial),
      celular: strOrNull(form.celular),
      rg: strOrNull(form.rg),
      cpf: strOrNull(form.cpf),
      data_nascimento: strOrNull(form.data_nascimento),
      validade_registro: strOrNull(form.validade_registro),
      tipo_mensalidade: numOrNull(form.tipo_mensalidade),
      ativo: form.ativo,
      isento: form.isento,
      endereco_cep: strOrNull(form.endereco_cep),
      endereco: strOrNull(form.endereco)?.toUpperCase() ?? null,
      endereco_numero: strOrNull(form.endereco_numero),
      endereco_complemento: strOrNull(form.endereco_complemento)?.toUpperCase() ?? null,
      endereco_bairro: strOrNull(form.endereco_bairro)?.toUpperCase() ?? null,
      endereco_uf: strOrNull(form.endereco_uf),
      endereco_cidade: numOrNull(form.endereco_cidade),
      categoria: numOrNull(form.categoria),
      categoria2: numOrNull(form.categoria2),
      ramo: numOrNull(form.ramo),
      secao: numOrNull(form.secao),
      patrulha_matilha: numOrNull(form.patrulha_matilha),
      funcao: numOrNull(form.funcao),
      responsavel_nome: strOrNull(form.responsavel_nome)?.toUpperCase() ?? null,
      responsavel_foneresi: strOrNull(form.responsavel_foneresi),
      responsavel_fonecelular: strOrNull(form.responsavel_fonecelular),
      responsavel_email: strOrNull(form.responsavel_email),
      responsavel_cpf: strOrNull(form.responsavel_cpf),
    }

    const result = isNew
      ? await supabase
          .from('associados')
          .insert(payload)
          .select('associado_id')
          .single()
      : await supabase
          .from('associados')
          .update(payload)
          .eq('associado_id', Number(id))
          .eq('empresa_id', empresaId)
          .select('associado_id')
          .single()

    setSaving(false)

    if (result.error) {
      setError(result.error.message)
      return
    }

    navigate('/associados', {
      state: { flashSuccess: 'Salvo com sucesso!' },
    })
  }

  async function onDelete() {
    if (!canWrite || !empresaId || isNew) return
    const ok = await toast.confirm({
      title: 'Excluir associado?',
      message: `Tem certeza que deseja excluir "${form.nome}"?`,
      confirmLabel: 'Sim, excluir',
      cancelLabel: 'Não',
      danger: true,
    })
    if (!ok) return

    setSaving(true)
    setError(null)

    const { error: delError } = await supabase
      .from('associados')
      .delete()
      .eq('associado_id', Number(id))
      .eq('empresa_id', empresaId)

    setSaving(false)

    if (delError) {
      setError(delError.message)
      return
    }

    navigate('/associados', {
      state: { flashSuccess: 'Associado excluído com sucesso!' },
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
    return <div className="loading">Carregando associado…</div>
  }

  const disabled = saving || !canWrite

  return (
    <>
      <header className="page-header">
        <div>
          <h2>{isNew ? 'Novo associado' : 'Editar associado'}</h2>
          <p>
            Grupo <strong>{empresa?.nome}</strong>
          </p>
        </div>
        <Link className="btn btn-soft" to="/associados">
          Voltar
        </Link>
      </header>

      <form className="panel" onSubmit={(e) => void onSubmit(e)}>
        {error ? (
          <AlertMessage tone="error" title="Não foi possível salvar">
            {error}
          </AlertMessage>
        ) : null}

        <div className="tabs" role="tablist">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              className={`tab${tab === item.id ? ' active' : ''}`}
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'geral' ? (
          <div className="form-grid">
            <div className="field">
              <label htmlFor="registro">Registro</label>
              <input
                id="registro"
                className="input"
                value={form.registro}
                onChange={(e) => update('registro', e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="field">
              <label htmlFor="registro_identificador">Identificador</label>
              <input
                id="registro_identificador"
                className="input"
                value={form.registro_identificador}
                onChange={(e) =>
                  update('registro_identificador', e.target.value)
                }
                disabled={disabled}
              />
            </div>
            <div className="field">
              <label htmlFor="validade_registro">Validade registro</label>
              <input
                id="validade_registro"
                className="input"
                type="date"
                value={form.validade_registro}
                onChange={(e) => update('validade_registro', e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="field field-span-2">
              <label htmlFor="nome">Nome</label>
              <input
                id="nome"
                className="input"
                value={form.nome}
                onChange={(e) => update('nome', e.target.value)}
                disabled={disabled}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="data_nascimento">Nascimento</label>
              <input
                id="data_nascimento"
                className="input"
                type="date"
                value={form.data_nascimento}
                onChange={(e) => update('data_nascimento', e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="field">
              <label htmlFor="rg">RG</label>
              <input
                id="rg"
                className="input"
                value={form.rg}
                onChange={(e) => update('rg', e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="field">
              <label htmlFor="cpf">CPF</label>
              <input
                id="cpf"
                className="input"
                value={form.cpf}
                onChange={(e) => update('cpf', e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="field">
              <label htmlFor="fone_residencial">Fone residencial</label>
              <input
                id="fone_residencial"
                className="input"
                value={form.fone_residencial}
                onChange={(e) => update('fone_residencial', e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="field">
              <label htmlFor="celular">Celular</label>
              <input
                id="celular"
                className="input"
                value={form.celular}
                onChange={(e) => update('celular', e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="field field-span-2">
              <label htmlFor="email">E-mail</label>
              <input
                id="email"
                className="input"
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="field">
              <label htmlFor="tipo_mensalidade">Mensalidade</label>
              <select
                id="tipo_mensalidade"
                className="select"
                value={form.tipo_mensalidade}
                onChange={(e) => update('tipo_mensalidade', e.target.value)}
                disabled={disabled}
              >
                <option value="">Selecione…</option>
                {mensalidades.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="field field-checks">
              <label>
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(e) => update('ativo', e.target.checked)}
                  disabled={disabled}
                />
                Ativo
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.isento}
                  onChange={(e) => update('isento', e.target.checked)}
                  disabled={disabled}
                />
                Isento
              </label>
            </div>
          </div>
        ) : null}

        {tab === 'endereco' ? (
          <div className="form-grid">
            <div className="field">
              <label htmlFor="endereco_cep">CEP</label>
              <input
                id="endereco_cep"
                className="input"
                value={form.endereco_cep}
                onChange={(e) => update('endereco_cep', e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="field field-span-2">
              <label htmlFor="endereco">Endereço</label>
              <input
                id="endereco"
                className="input"
                value={form.endereco}
                onChange={(e) => update('endereco', e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="field">
              <label htmlFor="endereco_numero">Número</label>
              <input
                id="endereco_numero"
                className="input"
                value={form.endereco_numero}
                onChange={(e) => update('endereco_numero', e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="field">
              <label htmlFor="endereco_complemento">Complemento</label>
              <input
                id="endereco_complemento"
                className="input"
                value={form.endereco_complemento}
                onChange={(e) => update('endereco_complemento', e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="field">
              <label htmlFor="endereco_bairro">Bairro</label>
              <input
                id="endereco_bairro"
                className="input"
                value={form.endereco_bairro}
                onChange={(e) => update('endereco_bairro', e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="field">
              <label htmlFor="endereco_uf">Estado</label>
              <select
                id="endereco_uf"
                className="select"
                value={form.endereco_uf}
                onChange={(e) => {
                  update('endereco_uf', e.target.value)
                  update('endereco_cidade', '')
                }}
                disabled={disabled}
              >
                <option value="">Selecione…</option>
                {estados.map((uf) => (
                  <option key={uf.codigo} value={uf.codigo}>
                    {uf.codigo} — {uf.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="field field-span-2">
              <label htmlFor="endereco_cidade">Cidade</label>
              <select
                id="endereco_cidade"
                className="select"
                value={form.endereco_cidade}
                onChange={(e) => update('endereco_cidade', e.target.value)}
                disabled={disabled || !form.endereco_uf}
              >
                <option value="">Selecione…</option>
                {cidades.map((cidade) => (
                  <option key={cidade.id} value={cidade.id}>
                    {cidade.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        {tab === 'outras' ? (
          <div className="form-grid">
            <div className="field">
              <label htmlFor="categoria">Categoria 1</label>
              <select
                id="categoria"
                className="select"
                value={form.categoria}
                onChange={(e) => update('categoria', e.target.value)}
                disabled={disabled}
              >
                <option value="">Selecione…</option>
                {categorias.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="categoria2">Categoria 2</label>
              <select
                id="categoria2"
                className="select"
                value={form.categoria2}
                onChange={(e) => update('categoria2', e.target.value)}
                disabled={disabled}
              >
                <option value="">Selecione…</option>
                {categorias.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="funcao">Função</label>
              <select
                id="funcao"
                className="select"
                value={form.funcao}
                onChange={(e) => update('funcao', e.target.value)}
                disabled={disabled}
              >
                <option value="">Selecione…</option>
                {funcoes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ramo">Ramo</label>
              <select
                id="ramo"
                className="select"
                value={form.ramo}
                onChange={(e) => {
                  update('ramo', e.target.value)
                  update('secao', '')
                  update('patrulha_matilha', '')
                }}
                disabled={disabled}
              >
                <option value="">Selecione…</option>
                {ramos.map((ramo) => (
                  <option key={ramo.ramo_id} value={ramo.ramo_id}>
                    {ramo.nome}
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
                onChange={(e) => {
                  update('secao', e.target.value)
                  update('patrulha_matilha', '')
                }}
                disabled={disabled || !form.ramo}
              >
                <option value="">Selecione…</option>
                {secoes.map((secao) => (
                  <option key={secao.id} value={secao.id}>
                    {secao.nome}
                  </option>
                ))}
              </select>
              {!form.ramo ? (
                <span className="field-hint">Selecione o ramo primeiro</span>
              ) : secoes.length === 0 ? (
                <span className="field-hint">
                  Nenhuma seção neste ramo para o seu grupo
                </span>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="patrulha">Patrulha / Matilha / Clã</label>
              <select
                id="patrulha"
                className="select"
                value={form.patrulha_matilha}
                onChange={(e) => update('patrulha_matilha', e.target.value)}
                disabled={disabled || !form.secao}
              >
                <option value="">Selecione…</option>
                {patrulhas.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        {tab === 'responsavel' ? (
          <div className="form-grid">
            <div className="field field-span-2">
              <label htmlFor="responsavel_nome">Nome</label>
              <input
                id="responsavel_nome"
                className="input"
                value={form.responsavel_nome}
                onChange={(e) => update('responsavel_nome', e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="field">
              <label htmlFor="responsavel_cpf">CPF</label>
              <input
                id="responsavel_cpf"
                className="input"
                value={form.responsavel_cpf}
                onChange={(e) => update('responsavel_cpf', e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="field">
              <label htmlFor="responsavel_foneresi">Fone residencial</label>
              <input
                id="responsavel_foneresi"
                className="input"
                value={form.responsavel_foneresi}
                onChange={(e) => update('responsavel_foneresi', e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="field">
              <label htmlFor="responsavel_fonecelular">Fone celular</label>
              <input
                id="responsavel_fonecelular"
                className="input"
                value={form.responsavel_fonecelular}
                onChange={(e) =>
                  update('responsavel_fonecelular', e.target.value)
                }
                disabled={disabled}
              />
            </div>
            <div className="field field-span-2">
              <label htmlFor="responsavel_email">E-mail</label>
              <input
                id="responsavel_email"
                className="input"
                type="email"
                value={form.responsavel_email}
                onChange={(e) => update('responsavel_email', e.target.value)}
                disabled={disabled}
              />
            </div>
          </div>
        ) : null}

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
          <Link className="btn btn-soft" to="/associados">
            Cancelar
          </Link>
        </div>
      </form>
    </>
  )
}
