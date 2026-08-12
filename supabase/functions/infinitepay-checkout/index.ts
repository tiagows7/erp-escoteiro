import { createClient } from 'npm:@supabase/supabase-js@2.49.8'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const INFINITEPAY_LINKS_URL = 'https://api.checkout.infinitepay.io/links'
const INFINITEPAY_CHECK_URL =
  'https://api.checkout.infinitepay.io/payment_check'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizeHandle(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(/^\$+/, '')
    .trim()
}

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

type EventoTipoResolvido = {
  tipo_id: number
  label: string
  valor: number
}

async function resolveEventoTiposLinhas(
  admin: ReturnType<typeof createClient>,
  eventoId: number,
  nomesCount: number,
  tipoIdsRaw: unknown,
): Promise<
  | { ok: true; linhas: EventoTipoResolvido[]; valorTotal: number; tipoIds: number[] }
  | { ok: false; error: string }
> {
  const { data: tipos } = await admin
    .from('venda_evento_tipo')
    .select('tipo_id, label, valor, ordem')
    .eq('evento_id', eventoId)
    .eq('ativo', true)
    .order('ordem')
    .order('tipo_id')

  const lista = (tipos ?? []) as EventoTipoResolvido[]
  if (lista.length === 0) {
    const { data: evento } = await admin
      .from('venda_eventos')
      .select('valor_convite')
      .eq('evento_id', eventoId)
      .maybeSingle()
    const valor = Number(evento?.valor_convite ?? 0)
    const fallback = {
      tipo_id: 0,
      label: 'Inteira',
      valor,
    }
    const linhas = Array.from({ length: nomesCount }, () => fallback)
    return {
      ok: true,
      linhas,
      valorTotal: Math.round(valor * nomesCount * 100) / 100,
      tipoIds: [],
    }
  }

  const defaultTipo = lista[0]
  const requested = Array.isArray(tipoIdsRaw)
    ? tipoIdsRaw.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
    : []

  const linhas: EventoTipoResolvido[] = []
  const tipoIds: number[] = []
  for (let i = 0; i < nomesCount; i += 1) {
    const id = requested[i] ?? defaultTipo.tipo_id
    const found = lista.find((t) => t.tipo_id === id) ?? defaultTipo
    linhas.push({
      tipo_id: found.tipo_id,
      label: String(found.label ?? ''),
      valor: Number(found.valor ?? 0),
    })
    tipoIds.push(found.tipo_id)
  }

  const valorTotal =
    Math.round(linhas.reduce((s, l) => s + l.valor, 0) * 100) / 100
  return { ok: true, linhas, valorTotal, tipoIds }
}

async function resolveInfinitePayHandle(
  admin: ReturnType<typeof createClient>,
  empresaId: number,
  ramoId: number | null,
): Promise<string | null> {
  const { data: contas } = await admin
    .from('empresa_conta_bancaria')
    .select('id, ramo_id, infinitepay_handle')
    .eq('empresa_id', empresaId)
    .order('id', { ascending: true })

  const list = (contas ?? []) as {
    id: number
    ramo_id: number | null
    infinitepay_handle: string | null
  }[]

  const candidatos =
    ramoId != null
      ? [
          ...list.filter((c) => c.ramo_id === ramoId),
          ...list.filter((c) => c.ramo_id == null),
        ]
      : list.filter((c) => c.ramo_id == null)

  for (const row of candidatos) {
    const handle = normalizeHandle(row.infinitepay_handle)
    if (handle) return handle
  }
  return null
}

async function resolveEventoRamo(
  admin: ReturnType<typeof createClient>,
  evento: {
    empresa_id: number
    ramo: number | null
    secao: number | null
  },
): Promise<number | null> {
  let ramoId = evento.ramo ?? null
  if (ramoId == null && evento.secao != null) {
    const { data: secaoRow } = await admin
      .from('secao')
      .select('ramo')
      .eq('empresa_id', evento.empresa_id)
      .eq('secao_id', evento.secao)
      .maybeSingle()
    ramoId = (secaoRow?.ramo as number | null) ?? null
  }
  return ramoId
}

async function fetchConvitesByCompraId(
  admin: ReturnType<typeof createClient>,
  compraId: number | null | undefined,
): Promise<{ numero: number; nome: string }[]> {
  if (!compraId) return []
  const { data } = await admin
    .from('venda_evento_convite')
    .select('numero, nome')
    .eq('compra_id', compraId)
    .order('numero')
  return (data ?? []).map((r) => ({
    numero: Number(r.numero),
    nome: String(r.nome ?? ''),
  }))
}

async function resolveCompraIdPedido(
  admin: ReturnType<typeof createClient>,
  pedido: Record<string, unknown>,
): Promise<number | null> {
  if (pedido.compra_id != null) return Number(pedido.compra_id)
  const pedidoId = pedido.id as number
  const { data } = await admin
    .from('venda_evento_compra')
    .select('compra_id')
    .eq('infinitepay_pedido_id', pedidoId)
    .maybeSingle()
  return data?.compra_id != null ? Number(data.compra_id) : null
}

async function baixarPedidoEvento(
  admin: ReturnType<typeof createClient>,
  pedido: Record<string, unknown>,
  webhookPayload: unknown,
) {
  const pedidoId = pedido.id as number
  const empresaId = pedido.empresa_id as number
  const eventoId = pedido.evento_id as number
  const telefone = String(pedido.comprador_telefone ?? '').trim()
  const nomes = Array.isArray(pedido.nomes)
    ? (pedido.nomes as unknown[])
        .map((n) => String(n ?? '').trim())
        .filter(Boolean)
        .map((n) => n.slice(0, 200))
    : []
  const valorTotal = Number(pedido.valor)

  if (!eventoId || nomes.length === 0) {
    throw new Error('Pedido InfinitePay incompleto.')
  }

  if (pedido.compra_id || pedido.status === 'pago') {
    const compraId = await resolveCompraIdPedido(admin, pedido)
    const convites = await fetchConvitesByCompraId(admin, compraId)
    return {
      already: true as const,
      compra_id: compraId,
      convites,
      numeros: convites.map((c) => c.numero),
    }
  }

  const { data: existingCompra } = await admin
    .from('venda_evento_compra')
    .select('compra_id')
    .eq('infinitepay_pedido_id', pedidoId)
    .maybeSingle()
  if (existingCompra?.compra_id) {
    await admin
      .from('infinitepay_pedidos')
      .update({
        status: 'pago',
        compra_id: existingCompra.compra_id,
        paid_at: new Date().toISOString(),
        raw_webhook: webhookPayload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pedidoId)
    const convites = await fetchConvitesByCompraId(
      admin,
      existingCompra.compra_id,
    )
    return {
      already: true as const,
      compra_id: Number(existingCompra.compra_id),
      convites,
      numeros: convites.map((c) => c.numero),
    }
  }

  const resolvedTipos = await resolveEventoTiposLinhas(
    admin,
    eventoId,
    nomes.length,
    pedido.tipo_ids,
  )
  if (!resolvedTipos.ok) {
    throw new Error(resolvedTipos.error)
  }

  const { data: evento, error: eventoError } = await admin
    .from('venda_eventos')
    .select('evento_id, empresa_id, numero_inicial, numero_final, encerrado_em')
    .eq('evento_id', eventoId)
    .eq('empresa_id', empresaId)
    .maybeSingle()

  if (eventoError || !evento) {
    throw new Error(eventoError?.message ?? 'Evento não encontrado.')
  }

  const { data: ocupados } = await admin
    .from('venda_evento_convite')
    .select('numero')
    .eq('evento_id', eventoId)

  const ocupadosSet = new Set(
    (ocupados ?? []).map((r) => Number(r.numero)),
  )
  const livres: number[] = []
  for (
    let n = Number(evento.numero_inicial);
    n <= Number(evento.numero_final);
    n += 1
  ) {
    if (!ocupadosSet.has(n)) {
      livres.push(n)
      if (livres.length >= nomes.length) break
    }
  }

  if (livres.length < nomes.length) {
    throw new Error(
      `Só há ${livres.length} convite(s) disponível(is) após o pagamento.`,
    )
  }

  const { data: compra, error: compraError } = await admin
    .from('venda_evento_compra')
    .insert({
      empresa_id: empresaId,
      evento_id: eventoId,
      quantidade: nomes.length,
      comprador_telefone: telefone ? telefone.slice(0, 40) : null,
      valor: valorTotal,
      forma_pagamento: 'infinitepay',
      vendido_por: null,
      infinitepay_pedido_id: pedidoId,
    })
    .select('compra_id')
    .single()

  if (compraError || !compra) {
    throw new Error(compraError?.message ?? 'Falha ao gravar compra.')
  }

  const rows = nomes.map((nome, i) => {
    const linha = resolvedTipos.linhas[i]
    const tipoId = linha?.tipo_id && linha.tipo_id > 0 ? linha.tipo_id : null
    return {
      empresa_id: empresaId,
      evento_id: eventoId,
      compra_id: compra.compra_id,
      numero: livres[i],
      nome,
      tipo_id: tipoId,
      valor_unitario: linha?.valor ?? 0,
      tipo_label: linha?.label ?? null,
    }
  })

  const { error: conviteError } = await admin
    .from('venda_evento_convite')
    .insert(rows)

  if (conviteError) {
    throw new Error(conviteError.message)
  }

  const wh = (webhookPayload ?? {}) as Record<string, unknown>
  await admin
    .from('infinitepay_pedidos')
    .update({
      status: 'pago',
      compra_id: compra.compra_id,
      paid_at: new Date().toISOString(),
      invoice_slug: wh.invoice_slug ? String(wh.invoice_slug) : null,
      transaction_nsu: wh.transaction_nsu
        ? String(wh.transaction_nsu)
        : null,
      capture_method: wh.capture_method
        ? String(wh.capture_method)
        : null,
      receipt_url: wh.receipt_url ? String(wh.receipt_url) : null,
      raw_webhook: webhookPayload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pedidoId)

  const convites = livres.map((numero, i) => ({
    numero,
    nome: nomes[i] ?? '',
  }))
  return {
    already: false as const,
    compra_id: compra.compra_id,
    numeros: livres,
    convites,
  }
}

function withPagoRedirect(url: string, orderNsu: string): string {
  try {
    const u = new URL(url)
    u.searchParams.set('pago', '1')
    u.searchParams.set('order_nsu', orderNsu)
    return u.toString()
  } catch {
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}pago=1&order_nsu=${encodeURIComponent(orderNsu)}`
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const admin = adminClient()
    const url = new URL(req.url)
    const pathHint = url.pathname.toLowerCase()

    // Webhook: InfinitePay envia POST com body de pagamento
    const contentType = req.headers.get('content-type') ?? ''
    let body: Record<string, unknown> = {}
    if (contentType.includes('application/json')) {
      body = (await req.json()) as Record<string, unknown>
    }

    const isWebhook =
      pathHint.includes('webhook') ||
      body?.action === 'webhook' ||
      (!!body?.order_nsu &&
        !!body?.transaction_nsu &&
        body?.action == null &&
        !body?.link_token)

    if (isWebhook && body?.order_nsu) {
      const orderNsu = String(body.order_nsu)
      const { data: pedido, error } = await admin
        .from('infinitepay_pedidos')
        .select('*')
        .eq('order_nsu', orderNsu)
        .maybeSingle()

      if (error || !pedido) {
        return json({ error: 'Pedido não encontrado.' }, 404)
      }

      try {
        await baixarPedidoEvento(
          admin,
          pedido as Record<string, unknown>,
          body,
        )
        return json({ ok: true }, 200)
      } catch (e) {
        console.error('infinitepay webhook baixar', e)
        return json(
          { error: e instanceof Error ? e.message : 'Falha ao baixar' },
          400,
        )
      }
    }

    const action = String(body.action ?? '')

    if (action === 'config_evento') {
      const token = String(body.link_token ?? '').trim()
      if (!token) return json({ error: 'Link inválido.' }, 400)

      const { data: evento, error: eventoError } = await admin
        .from('venda_eventos')
        .select(
          'evento_id, empresa_id, ramo, secao, encerrado_em, valor_convite',
        )
        .eq('link_token', token)
        .maybeSingle()

      if (eventoError || !evento) {
        return json({ error: 'Link inválido ou expirado.' }, 404)
      }

      if (evento.encerrado_em) {
        return json({
          ok: true,
          encerrado: true,
          infinitepay: false,
          pix_sicredi: false,
        })
      }

      const ramoId = await resolveEventoRamo(admin, {
        empresa_id: evento.empresa_id as number,
        ramo: (evento.ramo as number | null) ?? null,
        secao: (evento.secao as number | null) ?? null,
      })
      const handle = await resolveInfinitePayHandle(
        admin,
        evento.empresa_id as number,
        ramoId,
      )

      // PIX Sicredi: conta com PIX ativo (mesma resolução da function pix-sicredi)
      const { data: contas } = await admin
        .from('empresa_conta_bancaria')
        .select('ramo_id, api_pix_ativo, api_pix_chave, api_pix_cert, api_pix_key, api_client_id, api_client_secret')
        .eq('empresa_id', evento.empresa_id)
      const list = (contas ?? []) as {
        ramo_id: number | null
        api_pix_ativo: boolean | null
        api_pix_chave: string | null
        api_pix_cert: string | null
        api_pix_key: string | null
        api_client_id: string | null
        api_client_secret: string | null
      }[]
      const candidatos =
        ramoId != null
          ? [
              ...list.filter((c) => c.ramo_id === ramoId),
              ...list.filter((c) => c.ramo_id == null),
            ]
          : list.filter((c) => c.ramo_id == null)
      const pixSicredi = candidatos.some(
        (c) =>
          c.api_pix_ativo === true &&
          !!(c.api_pix_chave ?? '').trim() &&
          !!(c.api_pix_cert ?? '').trim() &&
          !!(c.api_pix_key ?? '').trim() &&
          !!(c.api_client_id ?? '').trim() &&
          !!(c.api_client_secret ?? '').trim(),
      )

      return json({
        ok: true,
        encerrado: false,
        infinitepay: !!handle,
        pix_sicredi: pixSicredi,
        prefer: handle ? 'infinitepay' : pixSicredi ? 'pix_sicredi' : 'nenhum',
      })
    }

    if (action === 'create_evento') {
      const token = String(body.link_token ?? '').trim()
      const fone = String(body.comprador_telefone ?? '').trim()
      const nomesOrdered = (Array.isArray(body.nomes) ? body.nomes : [])
        .map((n) => String(n ?? '').trim())
        .filter(Boolean)
        .map((n) => n.slice(0, 200))
      const redirectUrl = String(body.redirect_url ?? '').trim()
      const siteOrigin = String(body.site_origin ?? '').trim()

      if (!token) return json({ error: 'Link inválido.' }, 400)
      if (!fone) {
        return json({ error: 'Informe o telefone do comprador.' }, 400)
      }
      if (nomesOrdered.length === 0) {
        return json({ error: 'Informe ao menos um nome.' }, 400)
      }

      const { data: evento, error: eventoError } = await admin
        .from('venda_eventos')
        .select(
          'evento_id, empresa_id, nome, valor_convite, numero_inicial, numero_final, link_token, ramo, secao, encerrado_em',
        )
        .eq('link_token', token)
        .maybeSingle()

      if (eventoError || !evento) {
        return json({ error: 'Link inválido ou expirado.' }, 404)
      }
      if (evento.encerrado_em) {
        return json({ error: 'Este evento está encerrado.' }, 409)
      }

      const total =
        Number(evento.numero_final) - Number(evento.numero_inicial) + 1
      const { count: vendidos } = await admin
        .from('venda_evento_convite')
        .select('convite_id', { count: 'exact', head: true })
        .eq('evento_id', evento.evento_id)
      const disponiveis = Math.max(0, total - (vendidos ?? 0))
      if (nomesOrdered.length > disponiveis) {
        return json(
          { error: `Só há ${disponiveis} convite(s) disponível(is).` },
          409,
        )
      }

      const resolvedTipos = await resolveEventoTiposLinhas(
        admin,
        Number(evento.evento_id),
        nomesOrdered.length,
        body.tipo_ids,
      )
      if (!resolvedTipos.ok) {
        return json({ error: resolvedTipos.error }, 400)
      }
      const valor = resolvedTipos.valorTotal
      if (!Number.isFinite(valor) || valor <= 0) {
        return json(
          {
            error:
              'Valor total inválido. Convites isentos (R$ 0) devem ser registrados pela organização.',
          },
          400,
        )
      }
      const valorCentavos = Math.round(valor * 100)

      const ramoId = await resolveEventoRamo(admin, {
        empresa_id: evento.empresa_id as number,
        ramo: (evento.ramo as number | null) ?? null,
        secao: (evento.secao as number | null) ?? null,
      })
      const handle = await resolveInfinitePayHandle(
        admin,
        evento.empresa_id as number,
        ramoId,
      )

      if (!handle) {
        return json(
          {
            error: 'InfinitePay não configurado para este evento.',
            use_pix: true,
            infinitepay: false,
          },
          503,
        )
      }

      const orderNsu = crypto.randomUUID()
      const descricao =
        String(body.descricao ?? '').trim() ||
        `${evento.nome} · ${nomesOrdered.length} convite(s)`

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const webhookUrl = `${supabaseUrl}/functions/v1/infinitepay-checkout`
      const finalRedirect = redirectUrl
        ? withPagoRedirect(redirectUrl, orderNsu)
        : siteOrigin
          ? `${siteOrigin.replace(/\/$/, '')}/ingresso/${token}?pago=1&order_nsu=${orderNsu}`
          : undefined

      const { data: pedido, error: insertError } = await admin
        .from('infinitepay_pedidos')
        .insert({
          empresa_id: evento.empresa_id,
          evento_id: evento.evento_id,
          order_nsu: orderNsu,
          handle,
          nomes: nomesOrdered,
          tipo_ids: resolvedTipos.tipoIds,
          comprador_telefone: fone.slice(0, 40),
          comprador_nome: nomesOrdered[0] ?? null,
          valor,
          descricao,
          status: 'pendente',
        })
        .select('id, order_nsu')
        .single()

      if (insertError || !pedido) {
        return json(
          { error: insertError?.message ?? 'Falha ao criar pedido.' },
          400,
        )
      }

      const phoneDigits = fone.replace(/\D/g, '')
      const phoneE164 =
        phoneDigits.length >= 10
          ? phoneDigits.startsWith('55')
            ? `+${phoneDigits}`
            : `+55${phoneDigits}`
          : undefined

      const payload: Record<string, unknown> = {
        handle,
        order_nsu: orderNsu,
        webhook_url: webhookUrl,
        items: [
          {
            quantity: nomesOrdered.length,
            price: valorCentavos,
            description: descricao.slice(0, 120),
          },
        ],
        customer: {
          name: (nomesOrdered[0] ?? 'Comprador').slice(0, 120),
          ...(phoneE164 ? { phone_number: phoneE164 } : {}),
        },
      }
      if (finalRedirect) payload.redirect_url = finalRedirect

      const ipRes = await fetch(INFINITEPAY_LINKS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const ipBody = await ipRes.json().catch(() => ({}))

      if (!ipRes.ok || !ipBody?.url) {
        await admin
          .from('infinitepay_pedidos')
          .update({
            status: 'erro',
            raw_create: ipBody,
            updated_at: new Date().toISOString(),
          })
          .eq('id', pedido.id)
        return json(
          {
            error:
              ipBody?.message ||
              ipBody?.error ||
              'Não foi possível gerar o link InfinitePay.',
            details: ipBody,
          },
          502,
        )
      }

      await admin
        .from('infinitepay_pedidos')
        .update({
          checkout_url: String(ipBody.url),
          raw_create: ipBody,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pedido.id)

      return json({
        ok: true,
        infinitepay: true,
        url: String(ipBody.url),
        order_nsu: orderNsu,
        pedido_id: pedido.id,
      })
    }

    if (action === 'status') {
      const orderNsu = String(body.order_nsu ?? '').trim()
      if (!orderNsu) return json({ error: 'Pedido inválido.' }, 400)

      const { data: pedido, error } = await admin
        .from('infinitepay_pedidos')
        .select('*')
        .eq('order_nsu', orderNsu)
        .maybeSingle()

      if (error || !pedido) {
        return json({ error: 'Pedido não encontrado.' }, 404)
      }

      if (pedido.status === 'pago') {
        const compraId = await resolveCompraIdPedido(
          admin,
          pedido as Record<string, unknown>,
        )
        const convites = await fetchConvitesByCompraId(admin, compraId)
        return json({
          ok: true,
          paid: true,
          compra_id: compraId,
          convites,
          pedido: {
            id: pedido.id,
            order_nsu: pedido.order_nsu,
            status: pedido.status,
            valor: pedido.valor,
            compra_id: compraId,
          },
        })
      }

      // Tenta consultar InfinitePay se tiver slug/transaction
      const slug = String(body.slug ?? pedido.invoice_slug ?? '').trim()
      const transactionNsu = String(
        body.transaction_nsu ?? pedido.transaction_nsu ?? '',
      ).trim()

      if (slug && transactionNsu) {
        const checkRes = await fetch(INFINITEPAY_CHECK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            handle: pedido.handle,
            order_nsu: orderNsu,
            transaction_nsu: transactionNsu,
            slug,
          }),
        })
        const checkBody = await checkRes.json().catch(() => ({}))
        if (checkBody?.paid || checkBody?.success === true) {
          const baixado = await baixarPedidoEvento(
            admin,
            pedido as Record<string, unknown>,
            {
              ...checkBody,
              order_nsu: orderNsu,
              invoice_slug: slug,
              transaction_nsu: transactionNsu,
            },
          )
          return json({
            ok: true,
            paid: true,
            compra_id: baixado.compra_id ?? null,
            convites: baixado.convites ?? [],
          })
        }
      }

      return json({
        ok: true,
        paid: false,
        pedido: {
          id: pedido.id,
          order_nsu: pedido.order_nsu,
          status: pedido.status,
          valor: pedido.valor,
        },
      })
    }

    return json({ error: 'Ação inválida.' }, 400)
  } catch (e) {
    console.error('infinitepay-checkout', e)
    return json(
      { error: e instanceof Error ? e.message : 'Erro interno' },
      500,
    )
  }
})
