import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { RegistroProvisorioBadge } from '@/components/RegistroProvisorioBadge'
import { getLoginVia, isAssociadoLogin } from '@/lib/roles'

type VoluntarioPessoa = {
  associado_id: number
  nome: string
  registro: number | null
  registro_provisorio: boolean
  secaoNome: string | null
  funcaoNome: string | null
}

type Coluna = {
  id: string
  titulo: string
  hint: string
  className: string
  pessoas: VoluntarioPessoa[]
}

function nomeContem(nome: string | null | undefined, termo: string) {
  return (nome ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .includes(termo)
}

function ramoCardClass(ramoId: number, ramoNome: string): string {
  const byId: Record<number, string> = {
    1: 'stat-card-lobinho',
    2: 'stat-card-escoteiro',
    3: 'stat-card-senior',
    4: 'stat-card-pioneiro',
    5: 'stat-card-diretoria',
  }
  if (byId[ramoId]) return byId[ramoId]
  if (nomeContem(ramoNome, 'LOBINHO')) return 'stat-card-lobinho'
  if (nomeContem(ramoNome, 'ESCOTEIRO')) return 'stat-card-escoteiro'
  if (nomeContem(ramoNome, 'SENIOR')) return 'stat-card-senior'
  if (nomeContem(ramoNome, 'PIONEIRO')) return 'stat-card-pioneiro'
  if (nomeContem(ramoNome, 'DIRETORIA') || nomeContem(ramoNome, 'VOLUNTAR')) {
    return 'stat-card-diretoria'
  }
  return ''
}

function sortByNome(a: VoluntarioPessoa, b: VoluntarioPessoa) {
  return a.nome.localeCompare(b.nome, 'pt-BR')
}

/** Nos cards de ramo: chefes de seção primeiro, depois assistentes, depois os demais. */
function sortEscotistasRamo(a: VoluntarioPessoa, b: VoluntarioPessoa) {
  const rank = (p: VoluntarioPessoa) => {
    if (nomeContem(p.funcaoNome, 'ASSISTENTE')) return 1
    if (nomeContem(p.funcaoNome, 'CHEFE')) return 0
    return 2
  }
  const byFuncao = rank(a) - rank(b)
  if (byFuncao !== 0) return byFuncao
  return sortByNome(a, b)
}

function isFuncaoDirigente(funcNome: string | null) {
  return (
    nomeContem(funcNome, 'DIRIGENTE') ||
    nomeContem(funcNome, 'DIRETOR') ||
    nomeContem(funcNome, 'DIRETO')
  )
}

export function VoluntariosPanel({ empresaId }: { empresaId: number }) {
  const { hasPermission, profile } = useAuth()
  const associadoLogin = isAssociadoLogin(profile)
  // Login por registro: só consulta — nunca abre cadastro do associado.
  const canOpenAssociado =
    !associadoLogin &&
    getLoginVia() !== 'registro' &&
    hasPermission('associados.view')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [colunas, setColunas] = useState<Coluna[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [assocRes, catRes, funcRes, ramoRes, secaoRes] = await Promise.all([
      supabase
        .from('associados')
        .select(
          'associado_id, nome, registro, registro_provisorio, categoria, funcao, ramo, secao',
        )
        .eq('empresa_id', empresaId)
        .or('ativo.is.null,ativo.eq.true')
        .order('nome'),
      supabase.from('categoria').select('categoria_id, nome'),
      supabase.from('funcao').select('funcao_id, nome'),
      supabase.from('ramos').select('ramo_id, nome').order('ramo_id'),
      supabase
        .from('secao')
        .select('secao_id, nome')
        .eq('empresa_id', empresaId),
    ])

    if (assocRes.error) {
      setError(assocRes.error.message)
      setColunas([])
      setLoading(false)
      return
    }

    const catMap = new Map(
      ((catRes.data ?? []) as { categoria_id: number; nome: string }[]).map(
        (c) => [c.categoria_id, c.nome],
      ),
    )
    const funcMap = new Map(
      ((funcRes.data ?? []) as { funcao_id: number; nome: string }[]).map(
        (f) => [f.funcao_id, f.nome],
      ),
    )
    const secaoMap = new Map(
      ((secaoRes.data ?? []) as { secao_id: number; nome: string }[]).map(
        (s) => [s.secao_id, s.nome],
      ),
    )
    const ramos = ((ramoRes.data ?? []) as { ramo_id: number; nome: string }[])
      .slice()
      .sort((a, b) => a.ramo_id - b.ramo_id)

    const dirigentes: VoluntarioPessoa[] = []
    const porRamo = new Map<number, VoluntarioPessoa[]>()
    for (const ramo of ramos) porRamo.set(ramo.ramo_id, [])

    type Row = {
      associado_id: number
      nome: string | null
      registro: number | null
      registro_provisorio: boolean | null
      categoria: number | null
      funcao: number | null
      ramo: number | null
      secao: number | null
    }

    for (const row of (assocRes.data as Row[]) ?? []) {
      const catNome =
        row.categoria != null ? (catMap.get(row.categoria) ?? null) : null
      const funcNome =
        row.funcao != null ? (funcMap.get(row.funcao) ?? null) : null

      const isDirigente =
        nomeContem(catNome, 'DIRIGENTE') || isFuncaoDirigente(funcNome)
      const isEscotista =
        nomeContem(catNome, 'ESCOTISTA') ||
        nomeContem(funcNome, 'ESCOTISTA') ||
        nomeContem(funcNome, 'CHEFE') ||
        nomeContem(funcNome, 'ASSISTENTE')

      if (!isDirigente && !isEscotista) continue

      const pessoa: VoluntarioPessoa = {
        associado_id: row.associado_id,
        nome: row.nome?.trim() || `Associado #${row.associado_id}`,
        registro: row.registro,
        registro_provisorio: row.registro_provisorio === true,
        secaoNome:
          row.secao != null
            ? (secaoMap.get(row.secao) ?? `Seção ${row.secao}`)
            : null,
        funcaoNome: funcNome,
      }

      if (isDirigente) {
        dirigentes.push(pessoa)
        continue
      }

      if (row.ramo != null) {
        const list = porRamo.get(row.ramo) ?? []
        list.push(pessoa)
        porRamo.set(row.ramo, list)
      } else {
        const list = porRamo.get(0) ?? []
        list.push(pessoa)
        porRamo.set(0, list)
      }
    }

    dirigentes.sort(sortByNome)

    const next: Coluna[] = []

    if (dirigentes.length > 0) {
      next.push({
        id: 'dirigentes',
        titulo: 'Dirigentes',
        hint: 'Categoria / função dirigente',
        className: 'stat-card-diretoria',
        pessoas: dirigentes,
      })
    }

    for (const ramo of ramos) {
      const pessoas = (porRamo.get(ramo.ramo_id) ?? []).sort(sortEscotistasRamo)
      if (pessoas.length === 0) continue
      next.push({
        id: `ramo-${ramo.ramo_id}`,
        titulo: ramo.nome,
        hint: 'Chefes de seção, depois assistentes',
        className: ramoCardClass(ramo.ramo_id, ramo.nome),
        pessoas,
      })
    }

    const semRamo = (porRamo.get(0) ?? []).sort(sortEscotistasRamo)
    if (semRamo.length > 0) {
      next.push({
        id: 'sem-ramo',
        titulo: 'Sem ramo',
        hint: 'Escotistas sem ramo cadastrado',
        className: '',
        pessoas: semRamo,
      })
    }

    setColunas(next)
    setLoading(false)
  }, [empresaId])

  useEffect(() => {
    void load()
  }, [load])

  const total = useMemo(
    () => colunas.reduce((acc, col) => acc + col.pessoas.length, 0),
    [colunas],
  )

  if (loading) {
    return (
      <section className="panel conquistas-panel">
        <div className="loading">Carregando voluntários…</div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="panel conquistas-panel">
        <p className="muted">{error}</p>
      </section>
    )
  }

  return (
    <section className="panel conquistas-panel">
      <p className="muted" style={{ marginTop: 0 }}>
        {total} voluntário(s) ativo(s) · dirigentes, depois ramos (chefe →
        assistentes).
      </p>

      <div className="conquistas-grid voluntarios-grid">
        {colunas.map((col) => (
          <article
            key={col.id}
            className={`stat-card conquistas-coluna ${col.className}`}
          >
            <span>{col.titulo}</span>
            <strong>{col.pessoas.length}</strong>
            <em className="stat-card-hint">{col.hint}</em>
            <ul className="conquistas-lista">
              {col.pessoas.map((pessoa) => (
                <li
                  key={`${col.id}-${pessoa.associado_id}`}
                  className="conquistas-lista-item"
                >
                  <div className="conquista-pessoa-card">
                    <div className="conquistas-lista-nome">
                      {canOpenAssociado ? (
                        <Link to={`/associados/${pessoa.associado_id}`}>
                          {pessoa.nome}
                        </Link>
                      ) : (
                        pessoa.nome
                      )}
                      {pessoa.registro_provisorio ? (
                        <RegistroProvisorioBadge />
                      ) : null}
                    </div>
                    {pessoa.funcaoNome ? (
                      <span className="conquistas-lista-secao">
                        {pessoa.funcaoNome}
                      </span>
                    ) : null}
                    {pessoa.secaoNome ? (
                      <span className="conquistas-lista-secao muted">
                        {pessoa.secaoNome}
                      </span>
                    ) : null}
                    {pessoa.registro != null ? (
                      <span className="conquistas-lista-data muted">
                        Reg. {pessoa.registro}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  )
}
