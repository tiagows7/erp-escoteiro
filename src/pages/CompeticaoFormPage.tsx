import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertMessage } from '@/components/AlertMessage'
import { WaitingOverlay } from '@/components/WaitingOverlay'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { supabase } from '@/lib/supabase'

type Secao = {
  secao_id: number
  nome: string
  ramo: number | null
}

type Equipe = {
  secaonome_id: number
  nome: string
  secao: number | null
}

type Participante = {
  participante_id: number
  secaonome_id: number
}

type Prova = {
  prova_id: number
  nome: string
  ordem: number
  data_execucao: string | null
}

type Pontuacao = {
  prova_id: number
  participante_id: number
  pontos: number
}

const emptyForm = {
  nome: '',
  secao_id: '',
  descricao: '',
  data_inicio: '',
  data_fim: '',
}

function num(value: string) {
  return Number(String(value).replace(',', '.'))
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(value: string | null) {
  if (!value) return 'Data não informada'
  const [ano, mes, dia] = value.slice(0, 10).split('-')
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : value
}

export function CompeticaoFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const { empresa, hasPermission } = useAuth()
  const empresaId = empresa?.id
  const canWrite = hasPermission('competicoes.write')
  const toast = useToast()

  const [form, setForm] = useState(emptyForm)
  const [secoes, setSecoes] = useState<Secao[]>([])
  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [participantes, setParticipantes] = useState<Participante[]>([])
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set())
  const [provas, setProvas] = useState<Prova[]>([])
  const [pontos, setPontos] = useState<Record<string, string>>({})
  const [novaProva, setNovaProva] = useState('')
  const [novaProvaData, setNovaProvaData] = useState(todayISO())
  const [encerradoEm, setEncerradoEm] = useState<string | null>(null)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const equipesDaSecao = useMemo(() => {
    if (!form.secao_id) return []
    return equipes.filter((equipe) => equipe.secao === Number(form.secao_id))
  }, [equipes, form.secao_id])

  const equipeMap = useMemo(
    () => new Map(equipes.map((equipe) => [equipe.secaonome_id, equipe.nome])),
    [equipes],
  )

  async function carregarCadastros() {
    if (!empresaId) return
    const [secoesRes, equipesRes] = await Promise.all([
      supabase
        .from('secao')
        .select('secao_id, nome, ramo')
        .eq('empresa_id', empresaId)
        .order('nome'),
      supabase
        .from('secao_nome')
        .select('secaonome_id, nome, secao')
        .eq('empresa_id', empresaId)
        .order('nome'),
    ])
    setSecoes((secoesRes.data as Secao[]) ?? [])
    setEquipes((equipesRes.data as Equipe[]) ?? [])
  }

  async function carregarCompeticao() {
    if (!empresaId || isNew) return
    setLoading(true)
    const competicaoId = Number(id)
    const [competicaoRes, participantesRes, provasRes] = await Promise.all([
      supabase
        .from('competicoes')
        .select(
          'competicao_id, nome, secao_id, descricao, data_inicio, data_fim, encerrado_em',
        )
        .eq('competicao_id', competicaoId)
        .eq('empresa_id', empresaId)
        .maybeSingle(),
      supabase
        .from('competicao_participante')
        .select('participante_id, secaonome_id')
        .eq('competicao_id', competicaoId)
        .eq('empresa_id', empresaId),
      supabase
        .from('competicao_prova')
        .select('prova_id, nome, ordem, data_execucao')
        .eq('competicao_id', competicaoId)
        .eq('empresa_id', empresaId)
        .order('ordem')
        .order('prova_id'),
    ])

    if (competicaoRes.error || !competicaoRes.data) {
      setError(competicaoRes.error?.message ?? 'Competição não encontrada.')
      setLoading(false)
      return
    }

    const part = (participantesRes.data as Participante[]) ?? []
    const provasData = (provasRes.data as Prova[]) ?? []
    const provaIds = provasData.map((prova) => prova.prova_id)
    let pontuacoes: Pontuacao[] = []
    if (provaIds.length > 0) {
      const { data } = await supabase
        .from('competicao_pontuacao')
        .select('prova_id, participante_id, pontos')
        .eq('empresa_id', empresaId)
        .in('prova_id', provaIds)
      pontuacoes = (data as Pontuacao[]) ?? []
    }

    setForm({
      nome: competicaoRes.data.nome ?? '',
      secao_id: String(competicaoRes.data.secao_id ?? ''),
      descricao: competicaoRes.data.descricao ?? '',
      data_inicio: competicaoRes.data.data_inicio ?? '',
      data_fim: competicaoRes.data.data_fim ?? '',
    })
    setEncerradoEm(competicaoRes.data.encerrado_em ?? null)
    setParticipantes(part)
    setSelecionadas(new Set(part.map((item) => item.secaonome_id)))
    setProvas(provasData)
    setPontos(
      Object.fromEntries(
        pontuacoes.map((item) => [
          `${item.prova_id}:${item.participante_id}`,
          String(item.pontos ?? 0),
        ]),
      ),
    )
    setError(null)
    setLoading(false)
  }

  useEffect(() => {
    void carregarCadastros()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  useEffect(() => {
    if (isNew) {
      setForm(emptyForm)
      setSelecionadas(new Set())
      setParticipantes([])
      setProvas([])
      setPontos({})
      setEncerradoEm(null)
      setLoading(false)
      return
    }
    void carregarCompeticao()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew, empresaId])

  const ranking = useMemo(() => {
    return participantes
      .map((participante) => {
        const total = provas.reduce(
          (soma, prova) =>
            soma + (num(pontos[`${prova.prova_id}:${participante.participante_id}`] ?? '0') || 0),
          0,
        )
        return {
          participante,
          nome:
            equipeMap.get(participante.secaonome_id) ??
            `Equipe ${participante.secaonome_id}`,
          total,
        }
      })
      .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome))
  }, [participantes, provas, pontos, equipeMap])

  async function salvar(event: FormEvent) {
    event.preventDefault()
    if (!canWrite || !empresaId) return
    if (!form.nome.trim()) {
      setError('Informe o nome da competição.')
      return
    }
    if (!form.secao_id) {
      setError('Selecione a seção.')
      return
    }
    if (selecionadas.size < 2) {
      setError('Selecione pelo menos duas matilhas/patrulhas.')
      return
    }
    if (form.data_inicio && form.data_fim && form.data_fim < form.data_inicio) {
      setError('A data final não pode ser anterior à data inicial.')
      return
    }

    setSaving(true)
    setError(null)
    const payload = {
      empresa_id: empresaId,
      nome: form.nome.trim(),
      secao_id: Number(form.secao_id),
      descricao: form.descricao.trim() || null,
      data_inicio: form.data_inicio || null,
      data_fim: form.data_fim || null,
    }

    if (isNew) {
      const { data, error: insertError } = await supabase
        .from('competicoes')
        .insert(payload)
        .select('competicao_id')
        .single()
      if (insertError || !data) {
        setSaving(false)
        setError(insertError?.message ?? 'Não foi possível criar a competição.')
        return
      }
      const competicaoId = data.competicao_id as number
      const { error: participantesError } = await supabase
        .from('competicao_participante')
        .insert(
          [...selecionadas].map((secaonomeId) => ({
            empresa_id: empresaId,
            competicao_id: competicaoId,
            secaonome_id: secaonomeId,
          })),
        )
      if (participantesError) {
        await supabase
          .from('competicoes')
          .delete()
          .eq('competicao_id', competicaoId)
        setSaving(false)
        setError(participantesError.message)
        return
      }
      setSaving(false)
      navigate(`/competicoes/${competicaoId}`, {
        state: { flashSuccess: 'Competição criada com sucesso!' },
        replace: true,
      })
      return
    }

    const competicaoId = Number(id)
    const { error: updateError } = await supabase
      .from('competicoes')
      .update(payload)
      .eq('competicao_id', competicaoId)
      .eq('empresa_id', empresaId)
    if (updateError) {
      setSaving(false)
      setError(updateError.message)
      return
    }

    const atuais = new Set(participantes.map((item) => item.secaonome_id))
    const remover = participantes
      .filter((item) => !selecionadas.has(item.secaonome_id))
      .map((item) => item.participante_id)
    const adicionar = [...selecionadas].filter((item) => !atuais.has(item))

    if (remover.length > 0) {
      const { error: removeError } = await supabase
        .from('competicao_participante')
        .delete()
        .eq('empresa_id', empresaId)
        .in('participante_id', remover)
      if (removeError) {
        setSaving(false)
        setError(removeError.message)
        return
      }
    }
    if (adicionar.length > 0) {
      const { error: addError } = await supabase
        .from('competicao_participante')
        .insert(
          adicionar.map((secaonomeId) => ({
            empresa_id: empresaId,
            competicao_id: competicaoId,
            secaonome_id: secaonomeId,
          })),
        )
      if (addError) {
        setSaving(false)
        setError(addError.message)
        return
      }
    }
    await carregarCompeticao()
    setSaving(false)
    toast.success('Competição salva!')
  }

  async function adicionarProva() {
    if (!canWrite || !empresaId || isNew || !novaProva.trim()) return
    if (!novaProvaData) {
      setError('Informe a data de execução da prova.')
      return
    }
    setSaving(true)
    const { error: insertError } = await supabase
      .from('competicao_prova')
      .insert({
        empresa_id: empresaId,
        competicao_id: Number(id),
        nome: novaProva.trim(),
        ordem: provas.length,
        data_execucao: novaProvaData,
      })
    if (insertError) {
      setError(insertError.message)
    } else {
      setNovaProva('')
      setNovaProvaData(todayISO())
      await carregarCompeticao()
    }
    setSaving(false)
  }

  async function excluirProva(prova: Prova) {
    if (!canWrite || !empresaId) return
    const ok = await toast.confirm({
      title: 'Excluir prova?',
      message: `A prova "${prova.nome}" e suas pontuações serão excluídas.`,
      confirmLabel: 'Excluir',
      cancelLabel: 'Cancelar',
      danger: true,
    })
    if (!ok) return
    setSaving(true)
    const { error: deleteError } = await supabase
      .from('competicao_prova')
      .delete()
      .eq('prova_id', prova.prova_id)
      .eq('empresa_id', empresaId)
    if (deleteError) setError(deleteError.message)
    else await carregarCompeticao()
    setSaving(false)
  }

  async function salvarPontuacao() {
    if (!canWrite || !empresaId || isNew) return
    const rows = provas.flatMap((prova) =>
      participantes.map((participante) => {
        const valor = num(
          pontos[`${prova.prova_id}:${participante.participante_id}`] ?? '0',
        )
        return {
          empresa_id: empresaId,
          prova_id: prova.prova_id,
          participante_id: participante.participante_id,
          pontos: Number.isFinite(valor) ? valor : 0,
          updated_at: new Date().toISOString(),
        }
      }),
    )
    if (rows.length === 0) return
    setSaving(true)
    const { error: upsertError } = await supabase
      .from('competicao_pontuacao')
      .upsert(rows, { onConflict: 'prova_id,participante_id' })
    setSaving(false)
    if (upsertError) setError(upsertError.message)
    else toast.success('Pontuação salva!')
  }

  async function alternarEncerramento() {
    if (!canWrite || !empresaId || isNew) return
    setSaving(true)
    const next = encerradoEm ? null : new Date().toISOString()
    const { error: updateError } = await supabase
      .from('competicoes')
      .update({ encerrado_em: next })
      .eq('competicao_id', Number(id))
      .eq('empresa_id', empresaId)
    setSaving(false)
    if (updateError) setError(updateError.message)
    else setEncerradoEm(next)
  }

  async function excluirCompeticao() {
    if (!canWrite || !empresaId || isNew) return
    const ok = await toast.confirm({
      title: 'Excluir competição?',
      message: `A competição "${form.nome}" e toda sua pontuação serão excluídas.`,
      confirmLabel: 'Excluir',
      cancelLabel: 'Cancelar',
      danger: true,
    })
    if (!ok) return
    setSaving(true)
    const { error: deleteError } = await supabase
      .from('competicoes')
      .delete()
      .eq('competicao_id', Number(id))
      .eq('empresa_id', empresaId)
    setSaving(false)
    if (deleteError) setError(deleteError.message)
    else {
      navigate('/competicoes', {
        state: { flashSuccess: 'Competição excluída com sucesso!' },
      })
    }
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

  if (loading) return <div className="loading">Carregando competição…</div>

  const disabled = saving || !canWrite || !!encerradoEm

  return (
    <>
      <WaitingOverlay
        open={saving}
        title="Aguarde"
        message="Salvando competição…"
      />
      <header className="page-header">
        <div>
          <h2>{isNew ? 'Nova competição' : form.nome}</h2>
          <p>
            Grupo <strong>{empresa?.nome}</strong>{' '}
            {encerradoEm ? (
              <span className="badge badge-danger">Encerrada</span>
            ) : null}
          </p>
        </div>
        <Link className="btn btn-soft" to="/competicoes">
          Voltar
        </Link>
      </header>

      {error ? (
        <AlertMessage tone="error" title="Atenção">
          {error}
        </AlertMessage>
      ) : null}

      <form className="panel" onSubmit={(event) => void salvar(event)}>
        <h3 style={{ marginTop: 0 }}>Cadastro</h3>
        <div className="form-grid form-grid-2">
          <div className="field">
            <label htmlFor="competicao_nome">Nome</label>
            <input
              id="competicao_nome"
              className="input"
              value={form.nome}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, nome: event.target.value }))
              }
              disabled={disabled}
              maxLength={120}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="competicao_secao">Seção</label>
            <select
              id="competicao_secao"
              className="select"
              value={form.secao_id}
              onChange={(event) => {
                setForm((prev) => ({
                  ...prev,
                  secao_id: event.target.value,
                }))
                setSelecionadas(new Set())
              }}
              disabled={disabled}
              required
            >
              <option value="">Selecione…</option>
              {secoes.map((secao) => (
                <option key={secao.secao_id} value={secao.secao_id}>
                  {secao.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="competicao_inicio">Data inicial</label>
            <input
              id="competicao_inicio"
              className="input"
              type="date"
              value={form.data_inicio}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  data_inicio: event.target.value,
                }))
              }
              disabled={disabled}
            />
          </div>
          <div className="field">
            <label htmlFor="competicao_fim">Data final</label>
            <input
              id="competicao_fim"
              className="input"
              type="date"
              value={form.data_fim}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, data_fim: event.target.value }))
              }
              disabled={disabled}
            />
          </div>
          <div className="field field-span-2">
            <label htmlFor="competicao_descricao">Descrição</label>
            <textarea
              id="competicao_descricao"
              className="input"
              rows={3}
              value={form.descricao}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  descricao: event.target.value,
                }))
              }
              disabled={disabled}
              maxLength={500}
            />
          </div>
          <div className="field field-span-2">
            <label>Matilhas / Patrulhas participantes</label>
            {!form.secao_id ? (
              <p className="field-hint">Selecione a seção primeiro.</p>
            ) : equipesDaSecao.length < 2 ? (
              <AlertMessage tone="info" title="Cadastre as equipes">
                Esta seção precisa ter pelo menos duas matilhas/patrulhas
                cadastradas.
              </AlertMessage>
            ) : (
              <div className="competicao-equipes-opcoes">
                {equipesDaSecao.map((equipe) => (
                  <label key={equipe.secaonome_id}>
                    <input
                      type="checkbox"
                      checked={selecionadas.has(equipe.secaonome_id)}
                      onChange={(event) =>
                        setSelecionadas((prev) => {
                          const next = new Set(prev)
                          if (event.target.checked) {
                            next.add(equipe.secaonome_id)
                          } else {
                            next.delete(equipe.secaonome_id)
                          }
                          return next
                        })
                      }
                      disabled={disabled}
                    />
                    {equipe.nome}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="form-actions">
          {canWrite && !encerradoEm ? (
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Salvando…' : isNew ? 'Criar competição' : 'Salvar'}
            </button>
          ) : null}
          {!isNew && canWrite ? (
            <>
              <button
                className="btn btn-soft"
                type="button"
                disabled={saving}
                onClick={() => void alternarEncerramento()}
              >
                {encerradoEm ? 'Reabrir competição' : 'Encerrar competição'}
              </button>
              <button
                className="btn btn-danger"
                type="button"
                disabled={saving}
                onClick={() => void excluirCompeticao()}
              >
                Excluir
              </button>
            </>
          ) : null}
          <Link className="btn btn-soft" to="/competicoes">
            Cancelar
          </Link>
        </div>
      </form>

      {!isNew ? (
        <>
          <section className="panel">
            <div className="competicao-section-head">
              <div>
                <h3>Provas e pontuação</h3>
                <p className="muted">
                  Crie as provas e informe os pontos de cada equipe.
                </p>
              </div>
              {!encerradoEm && canWrite ? (
                <div className="competicao-nova-prova">
                  <div className="field">
                    <label htmlFor="nova_prova_nome">Nome da prova</label>
                    <input
                      id="nova_prova_nome"
                      className="input"
                      placeholder="Ex.: Corrida de revezamento"
                      value={novaProva}
                      onChange={(event) => setNovaProva(event.target.value)}
                      maxLength={120}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="nova_prova_data">Data de execução</label>
                    <input
                      id="nova_prova_data"
                      className="input"
                      type="date"
                      value={novaProvaData}
                      onChange={(event) => setNovaProvaData(event.target.value)}
                      required
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-soft"
                    disabled={saving || !novaProva.trim() || !novaProvaData}
                    onClick={() => void adicionarProva()}
                  >
                    Adicionar prova
                  </button>
                </div>
              ) : null}
            </div>

            {provas.length === 0 ? (
              <div className="empty">Nenhuma prova cadastrada.</div>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data competicao-pontuacao-table">
                    <thead>
                      <tr>
                        <th>Prova</th>
                        {participantes.map((participante) => (
                          <th key={participante.participante_id}>
                            {equipeMap.get(participante.secaonome_id) ?? 'Equipe'}
                          </th>
                        ))}
                        {canWrite && !encerradoEm ? <th></th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {provas.map((prova) => (
                        <tr key={prova.prova_id}>
                          <td>
                            <strong>{prova.nome}</strong>
                            <span className="field-hint">
                              Executada em {formatDate(prova.data_execucao)}
                            </span>
                          </td>
                          {participantes.map((participante) => {
                            const key = `${prova.prova_id}:${participante.participante_id}`
                            return (
                              <td key={participante.participante_id}>
                                <input
                                  className="input competicao-pontos-input"
                                  inputMode="decimal"
                                  value={pontos[key] ?? ''}
                                  onChange={(event) =>
                                    setPontos((prev) => ({
                                      ...prev,
                                      [key]: event.target.value,
                                    }))
                                  }
                                  disabled={!canWrite || !!encerradoEm}
                                  placeholder="0"
                                />
                              </td>
                            )
                          })}
                          {canWrite && !encerradoEm ? (
                            <td>
                              <button
                                type="button"
                                className="btn btn-danger"
                                onClick={() => void excluirProva(prova)}
                              >
                                Excluir
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {canWrite && !encerradoEm ? (
                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={saving}
                      onClick={() => void salvarPontuacao()}
                    >
                      Salvar pontuação
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </section>

          <section className="panel">
            <h3 style={{ marginTop: 0 }}>Classificação</h3>
            {ranking.length === 0 ? (
              <div className="empty">Nenhuma equipe participante.</div>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Posição</th>
                      <th>Matilha / Patrulha</th>
                      <th>Total de pontos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((item, index) => (
                      <tr key={item.participante.participante_id}>
                        <td>
                          <strong>{index + 1}º</strong>
                        </td>
                        <td>{item.nome}</td>
                        <td>{item.total.toLocaleString('pt-BR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </>
  )
}
