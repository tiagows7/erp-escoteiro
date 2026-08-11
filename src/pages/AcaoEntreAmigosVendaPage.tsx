import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { numerosDaFaixa } from '@/lib/acaoEntreAmigos'
import { formatMoney } from '@/lib/despesas'
import { isAssociadoLogin } from '@/lib/roles'
import type {
  AcaoEntreAmigos,
  AcaoEntreAmigosFaixa,
  AcaoEntreAmigosVenda,
} from '@/types/database'

type VendaRow = AcaoEntreAmigosVenda & {
  associado_nome?: string | null
}

export function AcaoEntreAmigosVendaPage() {
  const { id } = useParams()
  const acaoId = Number(id)
  const { empresa, profile, user, hasPermission } = useAuth()
  const empresaId = empresa?.id
  const associadoLogin = isAssociadoLogin(profile)
  const canStaffEdit = !associadoLogin && hasPermission('vendas.write')
  const toast = useToast()

  const [acao, setAcao] = useState<AcaoEntreAmigos | null>(null)
  const [faixa, setFaixa] = useState<AcaoEntreAmigosFaixa | null>(null)
  const [vendas, setVendas] = useState<VendaRow[]>([])
  const [associadoId, setAssociadoId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNumero, setSelectedNumero] = useState<number | null>(null)
  const [compradorNome, setCompradorNome] = useState('')
  const [compradorTelefone, setCompradorTelefone] = useState('')
  const [saving, setSaving] = useState(false)

  const vendidos = useMemo(
    () => new Map(vendas.map((v) => [v.numero, v])),
    [vendas],
  )

  const numeros = useMemo(() => {
    if (associadoLogin && faixa) {
      return numerosDaFaixa(faixa.numero_inicial, faixa.numero_final)
    }
    if (!associadoLogin && acao) {
      return numerosDaFaixa(acao.numero_inicial, acao.numero_final)
    }
    return []
  }, [associadoLogin, faixa, acao])

  async function reload() {
    if (!empresaId || !Number.isFinite(acaoId) || acaoId <= 0) return

    setLoading(true)
    setError(null)

    let assocId: number | null = null
    if (associadoLogin && profile?.registro) {
      const registroNum = Number(String(profile.registro).replace(/\D/g, ''))
      if (Number.isFinite(registroNum) && registroNum > 0) {
        const { data: assoc } = await supabase
          .from('associados')
          .select('associado_id')
          .eq('empresa_id', empresaId)
          .eq('registro', registroNum)
          .maybeSingle()
        assocId = (assoc?.associado_id as number | null) ?? null
      }
      setAssociadoId(assocId)
      if (assocId == null) {
        setError('Associado não encontrado para o seu registro.')
        setAcao(null)
        setFaixa(null)
        setVendas([])
        setLoading(false)
        return
      }
    }

    const [acaoRes, faixaRes, vendasRes] = await Promise.all([
      supabase
        .from('acao_entre_amigos')
        .select(
          'acao_id, empresa_id, ramo, secao, patrulha_matilha, nome, numero_inicial, numero_final, valor_numero, created_at',
        )
        .eq('acao_id', acaoId)
        .eq('empresa_id', empresaId)
        .maybeSingle(),
      associadoLogin && assocId != null
        ? supabase
            .from('acao_entre_amigos_faixa')
            .select(
              'faixa_id, empresa_id, acao_id, associado_id, numero_inicial, numero_final, created_at',
            )
            .eq('acao_id', acaoId)
            .eq('empresa_id', empresaId)
            .eq('associado_id', assocId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from('acao_entre_amigos_venda')
        .select(
          'venda_id, empresa_id, acao_id, numero, comprador_nome, comprador_telefone, valor, associado_vendedor_id, vendido_por, vendido_em, created_at, associados!associado_vendedor_id(nome)',
        )
        .eq('acao_id', acaoId)
        .eq('empresa_id', empresaId)
        .order('numero'),
    ])

    if (acaoRes.error || !acaoRes.data) {
      setError(acaoRes.error?.message ?? 'Ação não encontrada.')
      setAcao(null)
      setLoading(false)
      return
    }

    if (associadoLogin) {
      if (faixaRes.error || !faixaRes.data) {
        setError(
          faixaRes.error?.message ??
            'Você não tem numeração atribuída nesta ação.',
        )
        setAcao(acaoRes.data as AcaoEntreAmigos)
        setFaixa(null)
        setVendas([])
        setLoading(false)
        return
      }
      setFaixa(faixaRes.data as AcaoEntreAmigosFaixa)
    }

    if (vendasRes.error) {
      setError(vendasRes.error.message)
      setLoading(false)
      return
    }

    setAcao(acaoRes.data as AcaoEntreAmigos)
    setVendas(
      ((vendasRes.data ?? []) as unknown as Array<
        AcaoEntreAmigosVenda & {
          associados: { nome: string | null } | null
        }
      >).map((row) => ({
        ...row,
        associado_nome: row.associados?.nome ?? null,
      })),
    )
    setError(null)
    setLoading(false)
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, acaoId, associadoLogin, profile?.registro])

  function openNumero(numero: number) {
    if (vendidos.has(numero)) return
    if (associadoLogin && !faixa) return
    setSelectedNumero(numero)
    setCompradorNome('')
    setCompradorTelefone('')
  }

  async function onVender(event: FormEvent) {
    event.preventDefault()
    if (!empresaId || !acao || selectedNumero == null) return
    if (!compradorNome.trim()) {
      setError('Informe o nome do comprador.')
      return
    }
    if (!compradorTelefone.trim()) {
      setError('Informe o telefone do comprador.')
      return
    }
    if (associadoLogin && associadoId == null) {
      setError('Não foi possível identificar o vendedor (associado).')
      return
    }

    setSaving(true)
    setError(null)

    const { error: insertError } = await supabase
      .from('acao_entre_amigos_venda')
      .insert({
        empresa_id: empresaId,
        acao_id: acao.acao_id,
        numero: selectedNumero,
        comprador_nome: compradorNome.trim(),
        comprador_telefone: compradorTelefone.trim(),
        valor: Number(acao.valor_numero ?? 0),
        associado_vendedor_id: associadoLogin ? associadoId : null,
        vendido_por: user?.id ?? null,
      })

    setSaving(false)

    if (insertError) {
      setError(
        insertError.message.includes('duplicate') ||
          insertError.message.includes('unique')
          ? 'Este número já foi vendido.'
          : insertError.message,
      )
      return
    }

    toast.success('Venda registrada!', `Número ${selectedNumero} vendido.`)
    setSelectedNumero(null)
    setCompradorNome('')
    setCompradorTelefone('')
    await reload()
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
    return <div className="loading">Carregando números…</div>
  }

  if (!acao) {
    return (
      <section className="panel">
        <AlertMessage tone="error" title="Atenção">
          {error ?? 'Ação não encontrada'}
        </AlertMessage>
        <Link className="btn btn-soft" to="/vendas/acao-entre-amigos">
          Voltar
        </Link>
      </section>
    )
  }

  const vendidosNaFaixa = numeros.filter((n) => vendidos.has(n)).length

  return (
    <>
      <header className="page-header">
        <div>
          <h2>{associadoLogin ? 'Vender números' : 'Vendas da ação'}</h2>
          <p>
            {acao.nome} · {formatMoney(Number(acao.valor_numero ?? 0))} cada
            {faixa
              ? ` · sua faixa ${faixa.numero_inicial}–${faixa.numero_final}`
              : null}
          </p>
        </div>
        <div className="page-header-actions actions-pair">
          {canStaffEdit ? (
            <Link
              className="btn btn-soft"
              to={`/vendas/acao-entre-amigos/${acao.acao_id}`}
            >
              Editar ação
            </Link>
          ) : null}
          <Link className="btn btn-soft" to="/vendas/acao-entre-amigos">
            Voltar
          </Link>
        </div>
      </header>

      {error ? (
        <AlertMessage tone="error" title="Atenção">
          {error}
        </AlertMessage>
      ) : null}

      {associadoLogin && !faixa ? (
        <section className="panel">
          <div className="empty">
            Você ainda não tem numeração atribuída nesta ação.
          </div>
        </section>
      ) : (
        <>
          <section className="panel">
            <p className="muted" style={{ marginTop: 0 }}>
              {vendidosNaFaixa} de {numeros.length} número(s) vendido(s). Toque
              em um número disponível para registrar a venda.
            </p>
            <div className="acao-numeros-grid">
              {numeros.map((numero) => {
                const venda = vendidos.get(numero)
                const sold = !!venda
                return (
                  <button
                    key={numero}
                    type="button"
                    className={`acao-numero-btn ${sold ? 'is-sold' : ''} ${
                      selectedNumero === numero ? 'is-selected' : ''
                    }`}
                    disabled={sold || saving}
                    onClick={() => openNumero(numero)}
                    title={
                      sold
                        ? `${venda.comprador_nome} · ${venda.comprador_telefone}`
                        : `Vender nº ${numero}`
                    }
                  >
                    {numero}
                  </button>
                )
              })}
            </div>
          </section>

          {selectedNumero != null ? (
            <section className="panel">
              <h3 style={{ marginTop: 0 }}>
                Venda do número {selectedNumero}
              </h3>
              <p className="muted">
                Valor: {formatMoney(Number(acao.valor_numero ?? 0))}
              </p>
              <form
                className="form-grid form-grid-2"
                onSubmit={(e) => void onVender(e)}
              >
                <div className="field">
                  <label htmlFor="comprador_nome">Nome do comprador</label>
                  <input
                    id="comprador_nome"
                    className="input"
                    value={compradorNome}
                    onChange={(e) => setCompradorNome(e.target.value)}
                    disabled={saving}
                    required
                    autoFocus
                  />
                </div>
                <div className="field">
                  <label htmlFor="comprador_telefone">Telefone</label>
                  <input
                    id="comprador_telefone"
                    className="input"
                    value={compradorTelefone}
                    onChange={(e) => setCompradorTelefone(e.target.value)}
                    disabled={saving}
                    required
                    inputMode="tel"
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div className="form-actions field-span-2">
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={saving}
                  >
                    {saving ? 'Salvando…' : 'Confirmar venda'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-soft"
                    disabled={saving}
                    onClick={() => setSelectedNumero(null)}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          <section className="panel">
            <h3 style={{ marginTop: 0 }}>Vendas registradas</h3>
            {vendas.length === 0 ? (
              <div className="empty">Nenhuma venda ainda.</div>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Nº</th>
                      <th>Comprador</th>
                      <th>Telefone</th>
                      <th>Valor</th>
                      {!associadoLogin ? <th>Vendedor</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {(associadoLogin
                      ? vendas.filter(
                          (v) =>
                            faixa &&
                            v.numero >= faixa.numero_inicial &&
                            v.numero <= faixa.numero_final,
                        )
                      : vendas
                    ).map((v) => (
                      <tr key={v.venda_id}>
                        <td>{v.numero}</td>
                        <td>{v.comprador_nome}</td>
                        <td>{v.comprador_telefone}</td>
                        <td>{formatMoney(v.valor)}</td>
                        {!associadoLogin ? (
                          <td>{v.associado_nome || '—'}</td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  )
}
