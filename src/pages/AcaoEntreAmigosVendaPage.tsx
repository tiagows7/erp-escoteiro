import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { AcaoSorteioModal } from '@/components/AcaoSorteioModal'
import {
  AcaoNumerosImpressos,
  type NumeroImpressoItem,
} from '@/components/AcaoNumerosImpressos'
import { PixSicrediPublicCheckoutModal } from '@/components/PixSicrediPublicCheckoutModal'
import {
  executarSorteioAcao,
  formatDateBR,
  isAcaoVendasBloqueadas,
  numerosDaFaixa,
  podeSortearAcao,
  venderAcaoEntreAmigos,
} from '@/lib/acaoEntreAmigos'
import { linkPublicoAcaoEntreAmigos } from '@/lib/acaoEntreAmigosPublic'
import { formatMoney } from '@/lib/despesas'
import { isEncerrado } from '@/lib/encerrado'
import { empresaTemPixParaEscopo } from '@/lib/pixSicredi'
import type { PixPublicAcaoInput } from '@/lib/pixSicrediPublic'
import {
  financeiroScopeFromProfile,
  isAssociadoLogin,
  staffRamoScope,
} from '@/lib/roles'
import type {
  AcaoEntreAmigos,
  AcaoEntreAmigosFaixa,
  AcaoEntreAmigosFormaPagamento,
  AcaoEntreAmigosVenda,
} from '@/types/database'

type FormaPagamentoApp = AcaoEntreAmigosFormaPagamento

function labelFormaPagamento(
  forma: AcaoEntreAmigosFormaPagamento | null | undefined,
) {
  if (forma === 'dinheiro') return 'Dinheiro'
  if (forma === 'pix_direto') return 'PIX direto'
  if (forma === 'pix') return 'PIX online'
  return '—'
}

type VendaRow = AcaoEntreAmigosVenda & {
  associado_nome?: string | null
}

type StaffFaixaRow = AcaoEntreAmigosFaixa & {
  associado_nome: string
  associado_registro: number | null
  associado_ramo: number | null
  associado_secao: number | null
  secao_nome: string | null
  total: number
  vendidos: number
  disponiveis: number
}

export function AcaoEntreAmigosVendaPage() {
  const { id } = useParams()
  const acaoId = Number(id)
  const { empresa, profile, hasPermission } = useAuth()
  const empresaId = empresa?.id
  const associadoLogin = isAssociadoLogin(profile)
  const canStaffEdit = !associadoLogin && hasPermission('vendas.write')
  const ramoScoped = useMemo(() => staffRamoScope(profile), [profile])
  const secaoScoped = useMemo(() => {
    const scope = financeiroScopeFromProfile(profile)
    return scope?.secao ?? null
  }, [profile])
  const toast = useToast()

  const [acao, setAcao] = useState<AcaoEntreAmigos | null>(null)
  const [faixa, setFaixa] = useState<AcaoEntreAmigosFaixa | null>(null)
  const [staffFaixas, setStaffFaixas] = useState<StaffFaixaRow[]>([])
  const [vendas, setVendas] = useState<VendaRow[]>([])
  const [associadoId, setAssociadoId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNumeros, setSelectedNumeros] = useState<number[]>([])
  const [compradorNome, setCompradorNome] = useState('')
  const [compradorTelefone, setCompradorTelefone] = useState('')
  const [formaPagamento, setFormaPagamento] =
    useState<FormaPagamentoApp | null>(null)
  const [pixOnlineDisponivel, setPixOnlineDisponivel] = useState(false)
  const [pixOpen, setPixOpen] = useState(false)
  const [pixInput, setPixInput] = useState<PixPublicAcaoInput | null>(null)
  const [saving, setSaving] = useState(false)
  const [numerosPagos, setNumerosPagos] = useState<NumeroImpressoItem[]>([])
  const [sorteioOpen, setSorteioOpen] = useState(false)
  const [sorteioRefazer, setSorteioRefazer] = useState(false)

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

    const [acaoRes, faixaRes, faixasStaffRes, secoesRes, vendasRes] =
      await Promise.all([
        supabase
          .from('acao_entre_amigos')
          .select(
            'acao_id, empresa_id, ramo, secao, patrulha_matilha, nome, numero_inicial, numero_final, valor_numero, data_sorteio, data_limite_venda, quantidade_premios, imagem_url, encerrado_em, numero_sorteado, numeros_sorteados, sorteado_em, created_at',
          )
          .eq('acao_id', acaoId)
          .eq('empresa_id', empresaId)
          .maybeSingle(),
        associadoLogin && assocId != null
          ? supabase
              .from('acao_entre_amigos_faixa')
              .select(
                'faixa_id, empresa_id, acao_id, associado_id, numero_inicial, numero_final, link_token, created_at',
              )
              .eq('acao_id', acaoId)
              .eq('empresa_id', empresaId)
              .eq('associado_id', assocId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        !associadoLogin
          ? supabase
              .from('acao_entre_amigos_faixa')
              .select(
                `faixa_id, empresa_id, acao_id, associado_id, numero_inicial, numero_final, link_token, created_at,
                 associados(nome, registro, ramo, secao)`,
              )
              .eq('acao_id', acaoId)
              .eq('empresa_id', empresaId)
              .order('numero_inicial')
          : Promise.resolve({ data: null, error: null }),
        !associadoLogin
          ? supabase
              .from('secao')
              .select('secao_id, nome')
              .eq('empresa_id', empresaId)
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from('acao_entre_amigos_venda')
          .select(
            'venda_id, empresa_id, acao_id, numero, comprador_nome, comprador_telefone, valor, forma_pagamento, associado_vendedor_id, vendido_por, vendido_em, created_at, associados!associado_vendedor_id(nome)',
          )
          .eq('acao_id', acaoId)
          .eq('empresa_id', empresaId)
          .order('numero'),
      ])

    if (acaoRes.error || !acaoRes.data) {
      setError(acaoRes.error?.message ?? 'Ação não encontrada.')
      setAcao(null)
      setStaffFaixas([])
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
        setStaffFaixas([])
        setLoading(false)
        return
      }
      setFaixa(faixaRes.data as AcaoEntreAmigosFaixa)
      setStaffFaixas([])
    }

    if (vendasRes.error) {
      setError(vendasRes.error.message)
      setLoading(false)
      return
    }

    const vendasRows = ((vendasRes.data ?? []) as unknown as Array<
      AcaoEntreAmigosVenda & {
        associados: { nome: string | null } | null
      }
    >).map((row) => ({
      ...row,
      associado_nome: row.associados?.nome ?? null,
    }))

    if (!associadoLogin) {
      if (faixasStaffRes.error) {
        setError(faixasStaffRes.error.message)
        setLoading(false)
        return
      }

      const secaoMap = new Map(
        ((secoesRes.data ?? []) as Array<{ secao_id: number; nome: string }>).map(
          (s) => [s.secao_id, s.nome],
        ),
      )

      const vendidosSet = new Set(vendasRows.map((v) => v.numero))
      let faixasList = (
        (faixasStaffRes.data ?? []) as unknown as Array<
          AcaoEntreAmigosFaixa & {
            associados: {
              nome: string | null
              registro: number | null
              ramo: number | null
              secao: number | null
            } | null
          }
        >
      ).map((row) => {
        const total = row.numero_final - row.numero_inicial + 1
        let vendidosCount = 0
        for (let n = row.numero_inicial; n <= row.numero_final; n += 1) {
          if (vendidosSet.has(n)) vendidosCount += 1
        }
        const assoc = row.associados
        return {
          ...row,
          associado_nome:
            assoc?.nome ?? `Associado #${row.associado_id}`,
          associado_registro: assoc?.registro ?? null,
          associado_ramo: assoc?.ramo ?? null,
          associado_secao: assoc?.secao ?? null,
          secao_nome:
            assoc?.secao != null
              ? (secaoMap.get(assoc.secao) ?? `Seção ${assoc.secao}`)
              : null,
          total,
          vendidos: vendidosCount,
          disponiveis: total - vendidosCount,
        } satisfies StaffFaixaRow
      })

      if (ramoScoped != null) {
        faixasList = faixasList.filter(
          (f) =>
            f.associado_ramo == null || f.associado_ramo === ramoScoped,
        )
      }
      if (secaoScoped != null) {
        faixasList = faixasList.filter(
          (f) =>
            f.associado_secao == null || f.associado_secao === secaoScoped,
        )
      }

      faixasList.sort((a, b) =>
        a.associado_nome.localeCompare(b.associado_nome, 'pt-BR'),
      )
      setStaffFaixas(faixasList)
    }

    const acaoRow = acaoRes.data as AcaoEntreAmigos
    setAcao(acaoRow)
    setVendas(vendasRows)
    setPixOnlineDisponivel(
      await empresaTemPixParaEscopo({
        empresaId,
        ramoId: acaoRow.ramo,
        secaoId: acaoRow.secao,
      }),
    )
    setError(null)
    setLoading(false)
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    empresaId,
    acaoId,
    associadoLogin,
    profile?.registro,
    ramoScoped,
    secaoScoped,
  ])

  function linkTokenParaNumeros(numeros: number[]): string | null {
    if (associadoLogin) {
      return faixa?.link_token ?? null
    }
    const match = staffFaixas.find((f) =>
      numeros.every((n) => n >= f.numero_inicial && n <= f.numero_final),
    )
    return match?.link_token ?? null
  }

  function toggleNumero(numero: number) {
    if (vendidos.has(numero)) return
    if (associadoLogin && !faixa) return
    setSelectedNumeros((prev) => {
      if (prev.includes(numero)) {
        return prev.filter((n) => n !== numero)
      }
      // Mantém nome/telefone já digitados ao adicionar mais números.
      return [...prev, numero].sort((a, b) => a - b)
    })
    setError(null)
    setNumerosPagos([])
  }

  function limparSelecao() {
    setSelectedNumeros([])
    setCompradorNome('')
    setCompradorTelefone('')
    setFormaPagamento(null)
    setError(null)
  }

  async function copiarLink(token: string | null | undefined) {
    if (!token) {
      toast.error('Atenção', 'Link ainda não disponível para esta faixa.')
      return
    }
    const url = linkPublicoAcaoEntreAmigos(token)
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copiado!', 'Envie para quem for comprar fora do app.')
    } catch {
      window.prompt('Copie o link:', url)
    }
  }

  function falhaVenda(msg: string) {
    setError(msg)
    toast.error('Atenção', msg)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function onVender(event: FormEvent) {
    event.preventDefault()
    if (!empresaId || !acao || selectedNumeros.length === 0) return
    if (isAcaoVendasBloqueadas({
      encerrado_em: acao.encerrado_em,
      data_limite_venda: acao.data_limite_venda,
      numero_inicial: acao.numero_inicial,
      numero_final: acao.numero_final,
      qtde_vendidos: vendas.length,
    })) {
      falhaVenda('As vendas desta ação estão encerradas ou o prazo já passou.')
      return
    }
    if (!compradorNome.trim()) {
      falhaVenda('Informe o nome do comprador.')
      return
    }
    if (!compradorTelefone.trim()) {
      falhaVenda('Informe o telefone do comprador.')
      return
    }
    if (!formaPagamento) {
      falhaVenda(
        'Selecione a forma de pagamento: Dinheiro, PIX online ou PIX direto.',
      )
      return
    }
    if (associadoLogin && associadoId == null) {
      falhaVenda('Não foi possível identificar o vendedor (associado).')
      return
    }

    const disponiveis = selectedNumeros.filter((n) => !vendidos.has(n))
    if (disponiveis.length === 0) {
      falhaVenda('Nenhum dos números selecionados está disponível.')
      return
    }

    const nome = compradorNome.trim()
    const telefone = compradorTelefone.trim()
    const valorUnitario = Number(acao.valor_numero ?? 0)

    if (formaPagamento === 'pix') {
      if (!pixOnlineDisponivel) {
        falhaVenda(
          'PIX online indisponível. Cadastre o PIX Sicredi do grupo ou da seção desta ação.',
        )
        return
      }
      if (!Number.isFinite(valorUnitario) || valorUnitario <= 0) {
        falhaVenda('Esta ação ainda não tem valor de número configurado.')
        return
      }
      const linkToken = linkTokenParaNumeros(disponiveis)
      if (!linkToken) {
        falhaVenda(
          associadoLogin
            ? 'Link de pagamento desta faixa ainda não está disponível.'
            : 'Selecione números de uma mesma faixa de jovem para pagar com PIX online (ou use o link público).',
        )
        return
      }
      const valor =
        Math.round(valorUnitario * disponiveis.length * 100) / 100
      setError(null)
      setNumerosPagos([])
      setPixInput({
        linkToken,
        numeros: disponiveis,
        compradorNome: nome,
        compradorTelefone: telefone,
        valor,
        descricao: `${acao.nome} · nº ${disponiveis.join(', ')}`,
      })
      setPixOpen(true)
      return
    }

    setSaving(true)
    setError(null)

    const result = await venderAcaoEntreAmigos({
      acaoId: acao.acao_id,
      numeros: disponiveis,
      compradorNome: nome,
      compradorTelefone: telefone,
      formaPagamento,
    })

    setSaving(false)

    if (!result.ok) {
      falhaVenda(result.mensagem)
      await reload()
      return
    }

    const salvos =
      result.numerosSalvos.length > 0 ? result.numerosSalvos : disponiveis
    setNumerosPagos(
      salvos.map((numero) => ({
        numero,
        nome,
      })),
    )
    toast.success('Venda registrada!', result.mensagem)
    limparSelecao()
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
  const valorUnitario = Number(acao.valor_numero ?? 0)
  const totalSelecionado = selectedNumeros.length * valorUnitario
  const encerrado = isEncerrado(acao.encerrado_em)
  const vendasBloqueadas = isAcaoVendasBloqueadas({
    encerrado_em: acao.encerrado_em,
    data_limite_venda: acao.data_limite_venda,
    numero_inicial: acao.numero_inicial,
    numero_final: acao.numero_final,
    qtde_vendidos: vendas.length,
  })
  const podeSortear =
    canStaffEdit &&
    podeSortearAcao({
      encerrado_em: acao.encerrado_em,
      data_limite_venda: acao.data_limite_venda,
      numero_inicial: acao.numero_inicial,
      numero_final: acao.numero_final,
      qtde_vendidos: vendas.length,
      numero_sorteado: acao.numero_sorteado,
      numeros_sorteados: Array.isArray(acao.numeros_sorteados)
        ? acao.numeros_sorteados
        : null,
    })

  async function onEncerrarVendas() {
    if (!canStaffEdit || !empresaId || !acao || encerrado) return
    const ok = await toast.confirm({
      title: 'Encerrar vendas?',
      message:
        'Depois de encerrada, não será possível vender mais números nesta ação.',
      confirmLabel: 'Encerrar vendas',
      danger: true,
    })
    if (!ok) return
    const { error: upError, data } = await supabase
      .from('acao_entre_amigos')
      .update({ encerrado_em: new Date().toISOString() })
      .eq('acao_id', acao.acao_id)
      .eq('empresa_id', empresaId)
      .select(
        'acao_id, empresa_id, ramo, secao, patrulha_matilha, nome, numero_inicial, numero_final, valor_numero, data_sorteio, data_limite_venda, quantidade_premios, imagem_url, encerrado_em, numero_sorteado, numeros_sorteados, sorteado_em, created_at',
      )
      .single()
    if (upError || !data) {
      setError(upError?.message ?? 'Não foi possível encerrar as vendas.')
      return
    }
    setAcao(data as AcaoEntreAmigos)
    toast.success('Vendas encerradas')
  }

  async function onSortear() {
    if (!podeSortear || !acao) return
    const jaTem =
      acao.numero_sorteado != null ||
      (Array.isArray(acao.numeros_sorteados) &&
        acao.numeros_sorteados.length > 0)
    const qtd = Math.max(1, Number(acao.quantidade_premios ?? 1) || 1)
    const ok = await toast.confirm({
      title: jaTem ? 'Sortear novamente?' : 'Realizar sorteio?',
      message: jaTem
        ? 'Um novo sorteio substituirá o(s) ganhador(es) atual(is).'
        : `Será(ão) sorteado(s) ${qtd} prêmio(s) entre os números vendidos, com contagem de 10 segundos.`,
      confirmLabel: jaTem ? 'Sortear novamente' : 'Sortear',
      danger: jaTem,
    })
    if (!ok) return
    setError(null)
    setSorteioRefazer(jaTem)
    setSorteioOpen(true)
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h2>
            {vendasBloqueadas
              ? 'Vendas da ação'
              : associadoLogin
                ? 'Vender números'
                : 'Vendas da ação'}{' '}
            {encerrado ? (
              <span className="badge badge-danger">Encerrado</span>
            ) : vendasBloqueadas ? (
              <span className="badge badge-danger">Vendas bloqueadas</span>
            ) : null}
          </h2>
          <p>
            {acao.nome} · {formatMoney(Number(acao.valor_numero ?? 0))} cada
            {acao.data_limite_venda
              ? ` · vendas até ${formatDateBR(acao.data_limite_venda)}`
              : null}
            {acao.data_sorteio
              ? ` · sorteio ${formatDateBR(acao.data_sorteio)}`
              : null}
            {(() => {
              const nums = Array.isArray(acao.numeros_sorteados)
                ? acao.numeros_sorteados.map(Number).filter(Number.isFinite)
                : acao.numero_sorteado != null
                  ? [Number(acao.numero_sorteado)]
                  : []
              if (nums.length === 0) return null
              return nums.length === 1
                ? ` · ganhador nº ${nums[0]}`
                : ` · ${nums.length} ganhadores`
            })()}
            {faixa
              ? ` · sua faixa ${faixa.numero_inicial}–${faixa.numero_final}`
              : null}
          </p>
        </div>
        <div className="page-header-actions">
          {associadoLogin && faixa?.link_token && !vendasBloqueadas ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void copiarLink(faixa.link_token)}
            >
              Copiar link de venda
            </button>
          ) : null}
          {canStaffEdit && !encerrado ? (
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => void onEncerrarVendas()}
            >
              Encerrar vendas
            </button>
          ) : null}
          {podeSortear ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void onSortear()}
            >
              {(Array.isArray(acao.numeros_sorteados) &&
                acao.numeros_sorteados.length > 0) ||
              acao.numero_sorteado != null
                ? 'Sortear novamente'
                : 'Sortear'}
            </button>
          ) : null}
          {canStaffEdit ? (
            <Link
              className="btn btn-soft"
              to={`/vendas/acao-entre-amigos/${acao.acao_id}`}
            >
              {encerrado ? 'Ver ação' : 'Editar ação'}
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

      {(() => {
        const nums = Array.isArray(acao.numeros_sorteados)
          ? acao.numeros_sorteados.map(Number).filter(Number.isFinite)
          : acao.numero_sorteado != null
            ? [Number(acao.numero_sorteado)]
            : []
        if (nums.length === 0) return null
        return (
          <AlertMessage tone="success" title="Sorteio realizado">
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {nums.map((numero, i) => {
                const v = vendas.find((x) => x.numero === numero)
                return (
                  <div key={numero}>
                    {nums.length > 1 ? <strong>{i + 1}º prêmio · </strong> : null}
                    Nº <strong>{numero}</strong>
                    {v ? (
                      <>
                        {' '}
                        · <strong>{v.comprador_nome}</strong> ·{' '}
                        {v.comprador_telefone}
                      </>
                    ) : null}
                  </div>
                )
              })}
              {canStaffEdit ? (
                <div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void onSortear()}
                  >
                    Sortear novamente
                  </button>
                </div>
              ) : null}
            </div>
          </AlertMessage>
        )
      })()}

      {numerosPagos.length > 0 && acao ? (
        <section className="panel">
          <AcaoNumerosImpressos
            acaoNome={acao.nome}
            empresaNome={empresa?.nome}
            dataSorteio={acao.data_sorteio}
            imagemUrl={acao.imagem_url}
            numeros={numerosPagos}
          />
        </section>
      ) : null}
      {vendasBloqueadas ? (
        <AlertMessage tone="info" title="Vendas bloqueadas">
          Não é possível vender novos números — só consultar o que já foi
          vendido.
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
          {!associadoLogin ? (
            <section className="panel">
              <h3 style={{ marginTop: 0 }}>Jovens e vendas</h3>
              <p className="muted">
                Lista completa dos jovens com numeração nesta ação
                {ramoScoped != null ? ' (filtrado pelo seu ramo/seção)' : ''}.
              </p>
              {staffFaixas.length === 0 ? (
                <div className="empty">
                  Nenhum jovem com faixa atribuída
                  {ramoScoped != null ? ' no seu ramo/seção' : ''}.
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Jovem</th>
                        <th>Registro</th>
                        <th>Seção</th>
                        <th>Faixa</th>
                        <th>Vendidos</th>
                        <th>Disponíveis</th>
                        <th>Total</th>
                        <th>Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffFaixas.map((f) => (
                        <tr key={f.faixa_id}>
                          <td>{f.associado_nome}</td>
                          <td>{f.associado_registro ?? '—'}</td>
                          <td>{f.secao_nome ?? '—'}</td>
                          <td>
                            {f.numero_inicial} – {f.numero_final}
                          </td>
                          <td>
                            <strong>{f.vendidos}</strong>
                          </td>
                          <td>{f.disponiveis}</td>
                          <td>{f.total}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-soft"
                              onClick={() => void copiarLink(f.link_token)}
                            >
                              Copiar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4}>
                          <strong>Totais</strong>
                        </td>
                        <td>
                          <strong>
                            {staffFaixas.reduce((s, f) => s + f.vendidos, 0)}
                          </strong>
                        </td>
                        <td>
                          {staffFaixas.reduce((s, f) => s + f.disponiveis, 0)}
                        </td>
                        <td>
                          {staffFaixas.reduce((s, f) => s + f.total, 0)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </section>
          ) : null}

          <section className="panel">
            <div
              className={`acao-venda-layout ${
                acao.imagem_url ? 'has-imagem' : ''
              }`}
            >
              {acao.imagem_url ? (
                <div className="acao-imagem-side">
                  <img
                    className="acao-imagem-banner"
                    src={acao.imagem_url}
                    alt={`Imagem da ação ${acao.nome}`}
                  />
                </div>
              ) : null}
              <div className="acao-venda-numeros">
                <p className="muted" style={{ marginTop: 0 }}>
                  {vendidosNaFaixa} de {numeros.length} número(s) vendido(s).
                  Toque em um ou mais números disponíveis; o nome e telefone
                  preenchidos valem para todos.
                </p>
                {selectedNumeros.length > 0 ? (
                  <p className="field-hint" style={{ marginTop: 0 }}>
                    Selecionados: {selectedNumeros.join(', ')} (
                    {selectedNumeros.length})
                  </p>
                ) : null}
                <div className="acao-numeros-grid">
                  {numeros.map((numero) => {
                    const venda = vendidos.get(numero)
                    const sold = !!venda
                    const selected = selectedNumeros.includes(numero)
                    return (
                      <button
                        key={numero}
                        type="button"
                        className={`acao-numero-btn ${sold ? 'is-sold' : ''} ${
                          selected ? 'is-selected' : ''
                        }`}
                        disabled={sold || saving || vendasBloqueadas}
                        onClick={() => toggleNumero(numero)}
                        title={
                          sold
                            ? `${venda.comprador_nome} · ${venda.comprador_telefone}`
                             : vendasBloqueadas ? 'Ação encerrada'
                              : selected
                                ? `Remover nº ${numero} da seleção`
                                : `Selecionar nº ${numero}`
                        }
                      >
                        {numero}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </section>

          {!vendasBloqueadas && selectedNumeros.length > 0 ? (
            <section className="panel">
              <h3 style={{ marginTop: 0 }}>
                {selectedNumeros.length === 1
                  ? `Venda do número ${selectedNumeros[0]}`
                  : `Venda de ${selectedNumeros.length} números`}
              </h3>
              <p className="muted">
                Números: {selectedNumeros.join(', ')} ·{' '}
                {formatMoney(valorUnitario)} cada · total{' '}
                {formatMoney(totalSelecionado)}
              </p>
              <p className="field-hint">
                Preencha uma vez: o mesmo nome, telefone e forma de pagamento
                serão gravados em todos os números selecionados. PIX online gera
                a cobrança Sicredi; PIX direto registra o recebimento na hora.
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
                    disabled={saving || pixOpen}
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
                    disabled={saving || pixOpen}
                    required
                    inputMode="tel"
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div className="field field-span-2">
                  <label>Forma de pagamento</label>
                  <div className="actions-pair" style={{ flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={`btn ${
                        formaPagamento === 'dinheiro'
                          ? 'btn-primary'
                          : 'btn-soft'
                      }`}
                      disabled={saving || pixOpen}
                      onClick={() => setFormaPagamento('dinheiro')}
                    >
                      Dinheiro
                    </button>
                    <button
                      type="button"
                      className={`btn ${
                        formaPagamento === 'pix' ? 'btn-primary' : 'btn-soft'
                      }`}
                      disabled={saving || pixOpen || !pixOnlineDisponivel}
                      onClick={() => setFormaPagamento('pix')}
                      title={
                        pixOnlineDisponivel
                          ? 'Gera cobrança PIX Sicredi'
                          : 'Cadastre o PIX do grupo ou da seção desta ação'
                      }
                    >
                      PIX online
                    </button>
                    <button
                      type="button"
                      className={`btn ${
                        formaPagamento === 'pix_direto'
                          ? 'btn-primary'
                          : 'btn-soft'
                      }`}
                      disabled={saving || pixOpen}
                      onClick={() => setFormaPagamento('pix_direto')}
                    >
                      PIX direto
                    </button>
                  </div>
                  {!pixOnlineDisponivel ? (
                    <p className="field-hint" style={{ marginBottom: 0 }}>
                      PIX online fica disponível quando houver PIX Sicredi do
                      grupo ou da seção informada nesta ação.
                    </p>
                  ) : formaPagamento === 'pix' ? (
                    <p className="field-hint" style={{ marginBottom: 0 }}>
                      Abre a cobrança PIX Sicredi. Após o pagamento, os números
                      são confirmados automaticamente.
                    </p>
                  ) : null}
                </div>
                <div className="form-actions field-span-2">
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={saving || pixOpen || !formaPagamento}
                  >
                    {saving
                      ? 'Salvando…'
                      : formaPagamento === 'pix'
                        ? 'Pagar com PIX'
                        : selectedNumeros.length === 1
                          ? 'Confirmar venda'
                          : `Confirmar ${selectedNumeros.length} vendas`}
                  </button>
                  <button
                    type="button"
                    className="btn btn-soft"
                    disabled={saving || pixOpen}
                    onClick={limparSelecao}
                  >
                    Limpar seleção
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
                      <th>Pagamento</th>
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
                        <td>{labelFormaPagamento(v.forma_pagamento)}</td>
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

      <AcaoSorteioModal
        open={sorteioOpen}
        acaoNome={acao.nome}
        runSorteio={() =>
          executarSorteioAcao(acao.acao_id, sorteioRefazer)
        }
        onDone={() => {
          void reload()
        }}
        onClose={() => setSorteioOpen(false)}
      />

      <PixSicrediPublicCheckoutModal
        open={pixOpen}
        title="Pagamento PIX"
        input={pixInput}
        onClose={() => {
          setPixOpen(false)
          setPixInput(null)
        }}
        onPaid={async () => {
          const nome = (pixInput?.compradorNome ?? compradorNome).trim()
          const nums = pixInput?.numeros?.length
            ? [...pixInput.numeros]
            : [...selectedNumeros]
          if (nums.length > 0) {
            setNumerosPagos(
              nums.map((numero) => ({
                numero,
                nome: nome || 'Comprador',
              })),
            )
          }
          setPixOpen(false)
          setPixInput(null)
          limparSelecao()
          toast.success(
            'Pagamento confirmado!',
            'Os números foram registrados nesta ação.',
          )
          await reload()
        }}
      />
    </>
  )
}
