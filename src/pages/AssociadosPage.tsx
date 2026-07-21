import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  importAssociadosFromPaxtuExcel,
  type ImportAssociadosResult,
} from '@/lib/importAssociadosPaxtu'
import { AddIcon } from '@/components/AddIcon'
import { AlertMessage } from '@/components/AlertMessage'
import { useToast } from '@/contexts/ToastContext'
import { useFlashSuccess } from '@/hooks/useFlashSuccess'
import type { Associado, Ramo } from '@/types/database'

type SecaoLite = { secao_id: number; nome: string; ramo: number | null }
type PatrulhaLite = {
  secaonome_id: number
  nome: string
  secao: number | null
  ramo: number | null
}

function idadeFromNascimento(value: string | null | undefined): string {
  if (!value) return '—'
  const birth = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(birth.getTime())) return '—'

  const today = new Date()
  let years = today.getFullYear() - birth.getFullYear()
  let months = today.getMonth() - birth.getMonth()
  let days = today.getDate() - birth.getDate()

  if (days < 0) months -= 1
  if (months < 0) {
    years -= 1
    months += 12
  }

  if (years < 0) return '—'
  return `${years}a ${months}m`
}

function ExcelIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#1D6F42"
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
      />
      <path fill="#145A32" d="M14 2v6h6" />
      <path
        fill="#fff"
        d="M8.2 17.2 10.1 14l-1.8-3.2h1.5l1.1 2.1 1.1-2.1h1.5L11.7 14l1.9 3.2h-1.5l-1.2-2.2-1.2 2.2H8.2z"
      />
    </svg>
  )
}

export function AssociadosPage() {
  const { empresa, hasPermission } = useAuth()
  const canWrite = hasPermission('associados.write')
  const empresaId = empresa?.id
  useFlashSuccess()
  const toast = useToast()

  const [rows, setRows] = useState<Associado[]>([])
  const [ramos, setRamos] = useState<Ramo[]>([])
  const [secoes, setSecoes] = useState<SecaoLite[]>([])
  const [patrulhas, setPatrulhas] = useState<PatrulhaLite[]>([])
  const [q, setQ] = useState('')
  const [filtroRamo, setFiltroRamo] = useState('')
  const [filtroSecao, setFiltroSecao] = useState('')
  const [filtroPatrulha, setFiltroPatrulha] = useState('')
  const [filtroAtivo, setFiltroAtivo] = useState<'todos' | 'ativos' | 'inativos'>(
    'ativos',
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportAssociadosResult | null>(
    null,
  )
  const [reloadToken, setReloadToken] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!empresaId) return
    void Promise.all([
      supabase.from('ramos').select('ramo_id, nome, idade_inicio, idade_fim').order('ramo_id'),
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
    ]).then(([r, s, p]) => {
      setRamos((r.data as Ramo[]) ?? [])
      setSecoes((s.data as SecaoLite[]) ?? [])
      setPatrulhas((p.data as PatrulhaLite[]) ?? [])
    })
  }, [empresaId])

  const secoesFiltradas = useMemo(() => {
    if (!filtroRamo) return secoes
    return secoes.filter((s) => s.ramo === Number(filtroRamo))
  }, [secoes, filtroRamo])

  const patrulhasFiltradas = useMemo(() => {
    let list = patrulhas
    if (filtroRamo) list = list.filter((p) => p.ramo === Number(filtroRamo))
    if (filtroSecao) list = list.filter((p) => p.secao === Number(filtroSecao))
    return list
  }, [patrulhas, filtroRamo, filtroSecao])

  useEffect(() => {
    if (!empresaId) {
      setRows([])
      setLoading(false)
      return
    }

    let mounted = true
    const handle = window.setTimeout(() => {
      void (async () => {
        setLoading(true)
        let query = supabase
          .from('associados')
          .select(
            'associado_id, registro, registro_identificador, nome, data_nascimento, celular, email, ativo, ramo, secao, patrulha_matilha, empresa_id',
          )
          .eq('empresa_id', empresaId)
          .order('nome')
          .limit(500)

        const term = q.trim()
        if (term) {
          if (/^\d+$/.test(term)) {
            query = query.eq('registro', Number(term))
          } else {
            query = query.ilike('nome', `%${term}%`)
          }
        }
        if (filtroRamo) query = query.eq('ramo', Number(filtroRamo))
        if (filtroSecao) query = query.eq('secao', Number(filtroSecao))
        if (filtroPatrulha) {
          query = query.eq('patrulha_matilha', Number(filtroPatrulha))
        }
        if (filtroAtivo === 'ativos') query = query.eq('ativo', true)
        if (filtroAtivo === 'inativos') query = query.eq('ativo', false)

        const { data, error: queryError } = await query
        if (!mounted) return

        if (queryError) {
          setError(queryError.message)
          setRows([])
        } else {
          setError(null)
          setRows((data as Associado[]) ?? [])
        }
        setLoading(false)
      })()
    }, 250)

    return () => {
      mounted = false
      window.clearTimeout(handle)
    }
  }, [
    q,
    empresaId,
    filtroRamo,
    filtroSecao,
    filtroPatrulha,
    filtroAtivo,
    reloadToken,
  ])

  async function handleImportFile(file: File | null) {
    if (!file || !empresaId) return
    const confirmed = await toast.confirm({
      title: 'Importar Excel?',
      message:
        'Deseja importar os associados deste arquivo?\n\n' +
        'Registros já existentes neste grupo serão atualizados.\n' +
        'Também serão criados logins (nº registro / senha = data de nascimento sem barras).',
      confirmLabel: 'Sim, importar',
      cancelLabel: 'Não',
    })
    if (!confirmed) {
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setImporting(true)
    setImportResult(null)
    setError(null)
    try {
      const buffer = await file.arrayBuffer()
      const result = await importAssociadosFromPaxtuExcel(
        supabase,
        empresaId,
        buffer,
      )
      setImportResult(result)
      setReloadToken((n) => n + 1)
      const extra = [
        result.createdLookups > 0
          ? `${result.createdLookups} cadastro(s) auxiliar(es)`
          : '',
        result.createdUsers > 0
          ? `${result.createdUsers} usuário(s) criado(s)`
          : '',
        result.usersFailed > 0
          ? `${result.usersFailed} login(s) com falha`
          : '',
      ]
        .filter(Boolean)
        .join(', ')
      const extraMsg = extra ? ` ${extra}.` : ''
      if (result.failed.length === 0 && result.usersFailed === 0) {
        toast.success(
          'Importação concluída',
          `${result.inserted} novo(s) e ${result.updated} atualizado(s).${extraMsg}`,
        )
      } else {
        toast.error(
          'Importação com pendências',
          `${result.failed.length} linha(s) / ${result.usersFailed} login(s) com falha.${extraMsg}`,
        )
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível importar o arquivo Excel.',
      )
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const ramoMap = useMemo(
    () => new Map(ramos.map((item) => [item.ramo_id, item.nome])),
    [ramos],
  )
  const secaoMap = useMemo(
    () => new Map(secoes.map((item) => [item.secao_id, item.nome])),
    [secoes],
  )
  const patrulhaMap = useMemo(
    () => new Map(patrulhas.map((item) => [item.secaonome_id, item.nome])),
    [patrulhas],
  )

  if (!empresaId) {
    return (
      <section className="panel">
        <p className="muted">
          Seu usuário precisa estar vinculado a um grupo escoteiro.
        </p>
      </section>
    )
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h2>Associados</h2>
          <p>
            Membros do grupo <strong>{empresa?.nome}</strong>
          </p>
        </div>
        {canWrite ? (
          <div className="page-header-actions actions-pair">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              hidden
              onChange={(e) => void handleImportFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className="btn btn-excel btn-with-icon"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
            >
              <ExcelIcon />
              {importing ? 'Importando…' : 'Importar Excel'}
            </button>
            <Link className="btn btn-primary btn-with-icon" to="/associados/novo">
              <AddIcon />
              Novo associado
            </Link>
          </div>
        ) : null}
      </header>

      {importing ? (
        <div className="import-progress" role="status" aria-live="polite">
          <span className="spinner spinner-dark" aria-hidden="true" />
          <div>
            <strong>Aguarde — importação em andamento</strong>
            <p>
              Lendo o arquivo Excel e gravando os associados. Isso pode levar
              alguns instantes…
            </p>
          </div>
        </div>
      ) : null}

      <section className="panel">
        <div className="toolbar filtros-associados">
          <input
            className="input"
            placeholder="Buscar por nome ou registro…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="select"
            value={filtroRamo}
            onChange={(e) => {
              setFiltroRamo(e.target.value)
              setFiltroSecao('')
              setFiltroPatrulha('')
            }}
          >
            <option value="">Todos os ramos</option>
            {ramos.map((ramo) => (
              <option key={ramo.ramo_id} value={ramo.ramo_id}>
                {ramo.nome}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={filtroSecao}
            onChange={(e) => {
              setFiltroSecao(e.target.value)
              setFiltroPatrulha('')
            }}
          >
            <option value="">Todas as seções</option>
            {secoesFiltradas.map((secao) => (
              <option key={secao.secao_id} value={secao.secao_id}>
                {secao.nome}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={filtroPatrulha}
            onChange={(e) => setFiltroPatrulha(e.target.value)}
          >
            <option value="">Todas as patrulhas</option>
            {patrulhasFiltradas.map((item) => (
              <option key={item.secaonome_id} value={item.secaonome_id}>
                {item.nome}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={filtroAtivo}
            onChange={(e) =>
              setFiltroAtivo(e.target.value as 'todos' | 'ativos' | 'inativos')
            }
          >
            <option value="ativos">Somente ativos</option>
            <option value="inativos">Somente inativos</option>
            <option value="todos">Todos</option>
          </select>
        </div>

        {error ? (
          <AlertMessage tone="error" title="Não foi possível carregar">
            {error}
          </AlertMessage>
        ) : null}

        {importResult ? (
          <AlertMessage
            tone={
              importResult.failed.length || importResult.usersFailed
                ? 'error'
                : 'success'
            }
            title="Importação concluída"
          >
            <p>
              {importResult.inserted} novo(s), {importResult.updated}{' '}
              atualizado(s)
              {importResult.createdLookups
                ? `, ${importResult.createdLookups} cadastro(s) auxiliar(es) criado(s)`
                : ''}
              {importResult.createdUsers
                ? `, ${importResult.createdUsers} usuário(s) criado(s)`
                : ''}
              {importResult.usersSkipped
                ? `, ${importResult.usersSkipped} login(s) já existente(s)/sem data`
                : ''}
              {importResult.usersFailed
                ? `, ${importResult.usersFailed} login(s) com falha`
                : ''}
              {importResult.failed.length
                ? `, ${importResult.failed.length} com erro`
                : ''}{' '}
              (de {importResult.total} linha(s)).
            </p>
            {importResult.userErrors.length ? (
              <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem' }}>
                {importResult.userErrors.map((item) => (
                  <li key={`user-${item.nome}-${item.motivo}`}>
                    Login {item.nome}: {item.motivo}
                  </li>
                ))}
              </ul>
            ) : null}
            {importResult.failed.length ? (
              <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem' }}>
                {importResult.failed.slice(0, 20).map((item) => (
                  <li key={`${item.nome}-${item.motivo}`}>
                    {item.nome}: {item.motivo}
                  </li>
                ))}
                {importResult.failed.length > 20 ? (
                  <li>…e mais {importResult.failed.length - 20}</li>
                ) : null}
              </ul>
            ) : null}
          </AlertMessage>
        ) : null}

        <p className="field-hint" style={{ marginBottom: '0.75rem' }}>
          {loading ? 'Carregando…' : `${rows.length} associado(s) encontrado(s)`}
        </p>

        {loading ? (
          <div className="loading">Carregando associados…</div>
        ) : rows.length === 0 ? (
          <div className="empty">Nenhum associado encontrado neste grupo.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>Registro</th>
                  <th>Nome</th>
                  <th>Idade</th>
                  <th>Ramo</th>
                  <th>Seção</th>
                  <th>Patrulha</th>
                  <th>Contato</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.associado_id}>
                    <td>
                      <Link
                        className="btn btn-soft"
                        to={`/associados/${row.associado_id}`}
                      >
                        Abrir
                      </Link>
                    </td>
                    <td>
                      {row.registro}
                      {row.registro_identificador
                        ? `-${row.registro_identificador}`
                        : ''}
                    </td>
                    <td>
                      {row.nome}{' '}
                      {row.ativo === false ? (
                        <span className="badge">Inativo</span>
                      ) : null}
                    </td>
                    <td>{idadeFromNascimento(row.data_nascimento)}</td>
                    <td>{(row.ramo && ramoMap.get(row.ramo)) || '—'}</td>
                    <td>{(row.secao && secaoMap.get(row.secao)) || '—'}</td>
                    <td>
                      {(row.patrulha_matilha &&
                        patrulhaMap.get(row.patrulha_matilha)) ||
                        '—'}
                    </td>
                    <td>{row.celular || row.email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
