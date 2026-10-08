import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AlertMessage } from '@/components/AlertMessage'
import { WaitingOverlay } from '@/components/WaitingOverlay'
import { useToast } from '@/contexts/ToastContext'
import { categoriaEhBeneficiario } from '@/lib/categoriaAssociado'
import { staffRamoScope } from '@/lib/roles'
import type { Ramo } from '@/types/database'

type Pessoa = {
  associado_id: number
  nome: string
  tipo: 'jovem' | 'voluntario'
  secaoNome: string | null
  compareceu: boolean
}

type AtividadeOpcao = {
  atividade_id: number
  descricao: string
  data_atividade: string | null
  ramo: number | null
}

function formatData(value: string | null | undefined) {
  if (!value) return ''
  const [ano, mes, dia] = value.slice(0, 10).split('-')
  if (!ano || !mes || !dia) return value
  return `${dia}/${mes}/${ano}`
}

export function AssiduidadeFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const routeId = isNew ? null : Number(id)
  const navigate = useNavigate()
  const toast = useToast()
  const { empresa, profile, hasPermission } = useAuth()
  const canWrite = hasPermission('atividades.write')
  const empresaId = empresa?.id
  const ramoScope = useMemo(() => staffRamoScope(profile), [profile])

  const [savedId, setSavedId] = useState<number | null>(routeId)
  const [ramo, setRamo] = useState(ramoScope != null ? String(ramoScope) : '')
  const [atividadeId, setAtividadeId] = useState('')
  const [dataAtividade, setDataAtividade] = useState('')
  const [ramos, setRamos] = useState<Ramo[]>([])
  const [atividades, setAtividades] = useState<AtividadeOpcao[]>([])
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingPessoas, setLoadingPessoas] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ramoId = ramo ? Number(ramo) : null

  const carregarPessoas = useCallback(
    async (ramoAlvo: number, marcas: Map<number, boolean>) => {
      if (!empresaId) return
      setLoadingPessoas(true)
      const [assocRes, catRes, secoesRes] = await Promise.all([
        supabase
          .from('associados')
          .select('associado_id, nome, categoria, categoria2, secao, ativo')
          .eq('empresa_id', empresaId)
          .eq('ramo', ramoAlvo)
          .or('ativo.is.null,ativo.eq.true')
          .order('nome'),
        supabase.from('categoria').select('categoria_id, nome'),
        supabase
          .from('secao')
          .select('secao_id, nome')
          .eq('empresa_id', empresaId),
      ])
      setLoadingPessoas(false)
      if (assocRes.error || catRes.error || secoesRes.error) {
        setError(
          assocRes.error?.message ||
            catRes.error?.message ||
            secoesRes.error?.message ||
            'Não foi possível carregar as pessoas do ramo.',
        )
        setPessoas([])
        return
      }
      const catMap = new Map(
        (catRes.data ?? []).map((row) => [row.categoria_id, row.nome as string]),
      )
      const secaoMap = new Map(
        (secoesRes.data ?? []).map((row) => [row.secao_id, row.nome as string]),
      )
      const lista: Pessoa[] = (assocRes.data ?? []).map((row) => {
        const jovem =
          categoriaEhBeneficiario(
            row.categoria != null ? catMap.get(row.categoria) : null,
          ) ||
          categoriaEhBeneficiario(
            row.categoria2 != null ? catMap.get(row.categoria2) : null,
          )
        return {
          associado_id: row.associado_id,
          nome: row.nome?.trim() || `Associado #${row.associado_id}`,
          tipo: jovem ? 'jovem' : 'voluntario',
          secaoNome: row.secao != null ? (secaoMap.get(row.secao) ?? null) : null,
          compareceu: marcas.get(row.associado_id) === true,
        }
      })
      lista.sort((a, b) => {
        if (a.tipo !== b.tipo) return a.tipo === 'jovem' ? -1 : 1
        return a.nome.localeCompare(b.nome, 'pt-BR')
      })
      setPessoas(lista)
    },
    [empresaId],
  )

  useEffect(() => {
    if (!empresaId) {
      setLoading(false)
      return
    }

    let mounted = true
    void (async () => {
      const [ramosRes, atividadesRes, atualRes, presencaRes] = await Promise.all([
        supabase
          .from('ramos')
          .select('ramo_id, nome, idade_inicio, idade_fim')
          .order('ramo_id'),
        supabase
          .from('atividades')
          .select('atividade_id, descricao, data_atividade, ramo')
          .eq('empresa_id', empresaId)
          .order('data_atividade', { ascending: false }),
        routeId
          ? supabase
              .from('assiduidade')
              .select('ramo, data_atividade, atividade_id')
              .eq('assiduidade_id', routeId)
              .eq('empresa_id', empresaId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        routeId
          ? supabase
              .from('assiduidade_presenca')
              .select('associado_id, compareceu')
              .eq('assiduidade_id', routeId)
              .eq('empresa_id', empresaId)
          : Promise.resolve({ data: [], error: null }),
      ])

      if (!mounted) return
      const falha =
        ramosRes.error ||
        atividadesRes.error ||
        atualRes.error ||
        presencaRes.error
      if (falha) {
        setError(falha.message)
        setLoading(false)
        return
      }
      if (routeId && !atualRes.data) {
        setError('Chamada não encontrada.')
        setLoading(false)
        return
      }

      setRamos((ramosRes.data ?? []) as Ramo[])
      setAtividades((atividadesRes.data ?? []) as AtividadeOpcao[])

      const marcas = new Map<number, boolean>()
      for (const row of presencaRes.data ?? []) {
        marcas.set(row.associado_id, row.compareceu === true)
      }

      if (atualRes.data) {
        if (
          ramoScope != null &&
          atualRes.data.ramo != null &&
          atualRes.data.ramo !== ramoScope
        ) {
          setError('Esta chamada não pertence ao seu ramo.')
          setLoading(false)
          return
        }
        setSavedId(routeId)
        setRamo(String(atualRes.data.ramo))
        setAtividadeId(
          atualRes.data.atividade_id != null
            ? String(atualRes.data.atividade_id)
            : '',
        )
        setDataAtividade((atualRes.data.data_atividade ?? '').slice(0, 10))
        setLoading(false)
        await carregarPessoas(atualRes.data.ramo, marcas)
        return
      }

      setLoading(false)
      if (ramoScope != null) {
        await carregarPessoas(ramoScope, marcas)
      }
    })()

    return () => {
      mounted = false
    }
  }, [empresaId, routeId, ramoScope, carregarPessoas])

  const atividadesDoRamo = useMemo(
    () =>
      atividades.filter(
        (item) =>
          ramoId != null && (item.ramo == null || item.ramo === ramoId),
      ),
    [atividades, ramoId],
  )

  const jovens = pessoas.filter((pessoa) => pessoa.tipo === 'jovem')
  const voluntarios = pessoas.filter((pessoa) => pessoa.tipo === 'voluntario')
  const presentes = pessoas.filter((pessoa) => pessoa.compareceu).length

  function marcar(associadoId: number, compareceu: boolean) {
    setPessoas((prev) =>
      prev.map((pessoa) =>
        pessoa.associado_id === associadoId ? { ...pessoa, compareceu } : pessoa,
      ),
    )
  }

  function marcarGrupo(tipo: Pessoa['tipo'] | 'todos', compareceu: boolean) {
    setPessoas((prev) =>
      prev.map((pessoa) =>
        tipo === 'todos' || pessoa.tipo === tipo
          ? { ...pessoa, compareceu }
          : pessoa,
      ),
    )
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite) {
      setError('Sem permissão para alterar a assiduidade.')
      return
    }
    if (!empresaId) {
      setError('Grupo escoteiro não carregado.')
      return
    }
    if (ramoId == null) {
      setError('Escolha o ramo.')
      return
    }
    if (!dataAtividade) {
      setError('Informe a data da atividade.')
      return
    }

    setSaving(true)
    setError(null)
    const payload = {
      empresa_id: empresaId,
      ramo: ramoId,
      atividade_id: atividadeId ? Number(atividadeId) : null,
      data_atividade: dataAtividade,
    }

    let assiduidadeId = savedId
    if (assiduidadeId == null) {
      const { data, error: insertError } = await supabase
        .from('assiduidade')
        .insert(payload)
        .select('assiduidade_id')
        .single()
      if (insertError || !data) {
        setSaving(false)
        setError(
          insertError?.code === '23505'
            ? 'Já existe uma chamada deste ramo para esta atividade.'
            : (insertError?.message ?? 'Não foi possível salvar.'),
        )
        return
      }
      assiduidadeId = data.assiduidade_id
      setSavedId(assiduidadeId)
    } else {
      const { error: updateError } = await supabase
        .from('assiduidade')
        .update(payload)
        .eq('assiduidade_id', assiduidadeId)
        .eq('empresa_id', empresaId)
      if (updateError) {
        setSaving(false)
        setError(
          updateError.code === '23505'
            ? 'Já existe uma chamada deste ramo para esta atividade.'
            : updateError.message,
        )
        return
      }
    }

    const { error: deleteError } = await supabase
      .from('assiduidade_presenca')
      .delete()
      .eq('assiduidade_id', assiduidadeId)
      .eq('empresa_id', empresaId)
    if (deleteError) {
      setSaving(false)
      setError(deleteError.message)
      return
    }

    if (pessoas.length > 0) {
      const { error: presencaError } = await supabase
        .from('assiduidade_presenca')
        .insert(
          pessoas.map((pessoa) => ({
            assiduidade_id: assiduidadeId,
            empresa_id: empresaId,
            associado_id: pessoa.associado_id,
            compareceu: pessoa.compareceu,
          })),
        )
      if (presencaError) {
        setSaving(false)
        setError(presencaError.message)
        return
      }
    }

    setSaving(false)
    navigate('/assiduidade', {
      state: { flashSuccess: 'Salvo com sucesso!' },
    })
  }

  async function onDelete() {
    if (!savedId || !empresaId || !canWrite) return
    const ok = await toast.confirm({
      title: 'Excluir chamada?',
      message: 'A presença marcada nesta data também será excluída.',
      confirmLabel: 'Sim, excluir',
      cancelLabel: 'Não',
      danger: true,
    })
    if (!ok) return
    setSaving(true)
    const { error: deleteError } = await supabase
      .from('assiduidade')
      .delete()
      .eq('assiduidade_id', savedId)
      .eq('empresa_id', empresaId)
    setSaving(false)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    navigate('/assiduidade', {
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
    return <div className="loading">Carregando…</div>
  }

  const disabled = saving || !canWrite

  function renderGrupo(titulo: string, lista: Pessoa[], tipo: Pessoa['tipo']) {
    return (
      <section className="portal-secao-group">
        <h3>
          {titulo}{' '}
          <span className="muted">
            ({lista.filter((pessoa) => pessoa.compareceu).length} de {lista.length})
          </span>
        </h3>
        {lista.length === 0 ? (
          <div className="empty">Ninguém deste grupo neste ramo.</div>
        ) : (
          <>
            {canWrite ? (
              <div className="row-actions" style={{ marginBottom: '0.6rem' }}>
                <button
                  type="button"
                  className="btn btn-soft"
                  disabled={disabled}
                  onClick={() => marcarGrupo(tipo, true)}
                >
                  Marcar todos
                </button>
                <button
                  type="button"
                  className="btn btn-soft"
                  disabled={disabled}
                  onClick={() => marcarGrupo(tipo, false)}
                >
                  Desmarcar todos
                </button>
              </div>
            ) : null}
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Seção</th>
                    <th>Compareceu</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((pessoa) => (
                    <tr key={pessoa.associado_id}>
                      <td>{pessoa.nome}</td>
                      <td>{pessoa.secaoNome || '—'}</td>
                      <td>
                        <label className="field-checks">
                          <input
                            type="checkbox"
                            checked={pessoa.compareceu}
                            disabled={disabled}
                            onChange={(e) =>
                              marcar(pessoa.associado_id, e.target.checked)
                            }
                          />
                          {pessoa.compareceu ? 'Sim' : 'Não'}
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    )
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
          <h2>{savedId == null ? 'Nova chamada' : 'Editar chamada'}</h2>
          <p>
            Grupo <strong>{empresa?.nome}</strong>
            {pessoas.length > 0 ? ` · ${presentes} compareceram` : ''}
          </p>
        </div>
        <Link className="btn btn-soft" to="/assiduidade">
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
          <div className="field">
            <label htmlFor="ramo">Ramo</label>
            <select
              id="ramo"
              className="select"
              value={ramo}
              disabled={disabled || ramoScope != null}
              onChange={(e) => {
                const next = e.target.value
                setRamo(next)
                setAtividadeId('')
                if (!next) {
                  setPessoas([])
                  return
                }
                void carregarPessoas(Number(next), new Map())
              }}
            >
              <option value="">Selecione…</option>
              {ramos
                .filter((item) =>
                  ramoScope != null
                    ? item.ramo_id === ramoScope
                    : item.ramo_id >= 1 && item.ramo_id <= 4,
                )
                .map((item) => (
                  <option key={item.ramo_id} value={item.ramo_id}>
                    {item.nome}
                  </option>
                ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="atividade">Atividade</label>
            <select
              id="atividade"
              className="select"
              value={atividadeId}
              disabled={disabled || ramoId == null}
              onChange={(e) => {
                const next = e.target.value
                setAtividadeId(next)
                const escolhida = atividades.find(
                  (item) => String(item.atividade_id) === next,
                )
                if (escolhida?.data_atividade) {
                  setDataAtividade(escolhida.data_atividade.slice(0, 10))
                }
              }}
            >
              <option value="">Sem atividade</option>
              {atividadesDoRamo.map((item) => (
                <option key={item.atividade_id} value={item.atividade_id}>
                  {item.descricao?.trim() || `Atividade #${item.atividade_id}`}
                  {item.data_atividade
                    ? ` · ${formatData(item.data_atividade)}`
                    : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="data_atividade">Data da atividade</label>
            <input
              id="data_atividade"
              className="input"
              type="date"
              value={dataAtividade}
              disabled={disabled}
              required
              onChange={(e) => setDataAtividade(e.target.value)}
            />
          </div>
        </div>

        {ramoId == null ? (
          <p className="field-hint">
            Escolha o ramo para trazer os jovens e os voluntários.
          </p>
        ) : loadingPessoas ? (
          <div className="loading">Carregando jovens e voluntários…</div>
        ) : (
          <>
            {atividadesDoRamo.length === 0 ? (
              <p className="field-hint">
                Nenhuma atividade cadastrada neste ramo. A chamada pode ser
                salva só com a data.
              </p>
            ) : null}
            <div className="portal-secao-groups">
              {renderGrupo('Jovens', jovens, 'jovem')}
              {renderGrupo('Voluntários', voluntarios, 'voluntario')}
            </div>
          </>
        )}

        <div className="form-actions">
          {canWrite ? (
            <>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              {savedId != null ? (
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
          <Link className="btn btn-soft" to="/assiduidade">
            Cancelar
          </Link>
        </div>
      </form>
    </>
  )
}
