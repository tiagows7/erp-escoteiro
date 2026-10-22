import { createClient } from 'npm:@supabase/supabase-js@2.49.8'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const FINANCEIRO_WRITE = ['super_admin', 'admin', 'tesoureiro']
const SITE = 'https://www.erpescoteiro.com.br'
const MAX_ITENS = 40

type Item = {
  associado_id: number
  tipo_nome: string
  valor: number
  competencia: string
  vencimento: string
  /** Título gerado — usado para montar o PIX. */
  receita_id?: number | null
}

type PixEmailInfo = {
  pix_copia_e_cola: string
  link: string
  valor: number
}

type AssociadoMail = {
  associado_id: number
  nome: string | null
  registro: number | null
  email: string | null
  responsavel_email: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const smtpPassword = Deno.env.get('LOCAWEB_SMTP_PASSWORD')?.trim() ?? ''
    const smtpUser =
      Deno.env.get('LOCAWEB_SMTP_USER')?.trim() || 'adm@erpescoteiro.com.br'
    const smtpHost = Deno.env.get('LOCAWEB_SMTP_HOST')?.trim() || 'email-ssl.com.br'
    const smtpPort = Number(Deno.env.get('LOCAWEB_SMTP_PORT') || '465')

    if (!smtpPassword) {
      return json(
        {
          error:
            'A senha da caixa adm@erpescoteiro.com.br ainda não foi configurada no servidor.',
        },
        503,
      )
    }

    const body = await req.json().catch(() => null)
    if (body?.action === 'lembrete_vencidas') {
      return await lembreteVencidas(req, body)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401)

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user: caller },
      error: callerError,
    } = await callerClient.auth.getUser()
    if (callerError || !caller) return json({ error: 'Sessão inválida.' }, 401)

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role, ativo, empresa_id')
      .eq('id', caller.id)
      .maybeSingle()

    if (!callerProfile || callerProfile.ativo === false) {
      return json({ error: 'Perfil inválido.' }, 403)
    }
    if (!FINANCEIRO_WRITE.includes(callerProfile.role ?? '')) {
      return json({ error: 'Sem permissão para enviar cobranças.' }, 403)
    }

    const empresaId = Number(body?.empresa_id)
    const itens = Array.isArray(body?.itens) ? (body.itens as Item[]) : []
    if (!Number.isFinite(empresaId) || empresaId <= 0) {
      return json({ error: 'Grupo inválido.' }, 400)
    }
    if (
      callerProfile.role !== 'super_admin' &&
      Number(callerProfile.empresa_id) !== empresaId
    ) {
      return json({ error: 'Grupo diferente do seu usuário.' }, 403)
    }
    if (itens.length === 0 || itens.length > MAX_ITENS) {
      return json({ error: `Envie de 1 a ${MAX_ITENS} mensalidades por vez.` }, 400)
    }

    const { data: empresa } = await admin
      .from('empresa')
      .select('id, nome')
      .eq('id', empresaId)
      .maybeSingle()
    if (!empresa) return json({ error: 'Grupo não encontrado.' }, 404)

    const ids = [
      ...new Set(
        itens
          .map((item) => Number(item.associado_id))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    ]
    const { data: associados, error: assocError } = await admin
      .from('associados')
      .select('associado_id, nome, registro, email, responsavel_email')
      .eq('empresa_id', empresaId)
      .in('associado_id', ids)

    if (assocError) return json({ error: assocError.message }, 500)

    const porId = new Map(
      ((associados ?? []) as AssociadoMail[]).map((row) => [
        row.associado_id,
        row,
      ]),
    )

    const semEmail: { associado_id: number; nome: string }[] = []
    const prontos: {
      associado_id: number
      nome: string
      email: string
      item: Item
      registro: number | null
    }[] = []

    for (const item of itens) {
      const id = Number(item.associado_id)
      const associado = porId.get(id)
      const nome = (associado?.nome ?? '').trim() || 'Associado'
      const destino = emailDestino(
        associado?.responsavel_email,
        associado?.email,
      )
      if (!associado || !destino) {
        semEmail.push({ associado_id: id, nome })
        continue
      }
      prontos.push({
        associado_id: id,
        nome,
        email: destino,
        item,
        registro: associado.registro,
      })
    }

    const enviados: number[] = []
    const falhas: { associado_id: number; nome: string; erro: string }[] = []

    if (prontos.length > 0) {
      const smtp = await SmtpSession.connect({
        host: smtpHost,
        port: smtpPort,
        user: smtpUser,
        password: smtpPassword,
      })
      try {
        for (const row of prontos) {
          const receitaId = Number(row.item.receita_id)
          const pix =
            Number.isFinite(receitaId) && receitaId > 0
              ? await criarPixMensalidadeEmail({
                  empresaId,
                  associadoId: row.associado_id,
                  receitaIds: [receitaId],
                  descricao: `Mensalidade ${row.item.competencia} — ${empresa.nome}`,
                })
              : null
          const texto = montarTexto({
            grupo: empresa.nome as string,
            nome: row.nome,
            registro: row.registro,
            tipo: String(row.item.tipo_nome ?? '').trim(),
            valor: Number(row.item.valor),
            competencia: String(row.item.competencia ?? '').trim(),
            vencimento: String(row.item.vencimento ?? '').trim(),
            pix,
          })
          try {
            await smtp.send({
              from: smtpUser,
              to: row.email,
              subject: `Mensalidade ${row.item.competencia} — ${empresa.nome}`,
              text: texto,
              html: textoParaHtml(texto),
            })
            enviados.push(row.associado_id)
          } catch (err) {
            const erro = err instanceof Error ? err.message : String(err)
            falhas.push({
              associado_id: row.associado_id,
              nome: row.nome,
              erro,
            })
            if (/auth|535|503|password|senha/i.test(erro)) break
          }
        }
      } finally {
        await smtp.close()
      }
    }

    return json({
      enviados: enviados.length,
      sem_email: semEmail,
      falhas,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json({ error: message }, 500)
  }
})

/** SMTP TLS na porta 465 (Localweb), sem dependência externa. */
class SmtpSession {
  private conn: Deno.TcpConn | Deno.TlsConn
  private buffer = new Uint8Array(0)
  private encoder = new TextEncoder()
  private decoder = new TextDecoder()

  private constructor(conn: Deno.TcpConn | Deno.TlsConn) {
    this.conn = conn
  }

  static async connect(opts: {
    host: string
    port: number
    user: string
    password: string
  }): Promise<SmtpSession> {
    const conn =
      opts.port === 465
        ? await Deno.connectTls({ hostname: opts.host, port: opts.port })
        : await Deno.connect({ hostname: opts.host, port: opts.port })
    const session = new SmtpSession(conn)
    try {
      await session.expect(220)
      await session.command(`EHLO erpescoteiro.com.br`, 250)
      if (opts.port !== 465) {
        await session.command('STARTTLS', 220)
        // Deno.startTls exists on Deno Deploy / recent Deno
        const tls = await Deno.startTls(conn as Deno.TcpConn, {
          hostname: opts.host,
        })
        session.conn = tls
        session.buffer = new Uint8Array(0)
        await session.command(`EHLO erpescoteiro.com.br`, 250)
      }
      await session.command('AUTH LOGIN', 334)
      await session.command(b64(opts.user), 334)
      await session.command(b64(opts.password), 235)
      return session
    } catch (err) {
      try {
        conn.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  }

  async send(opts: {
    from: string
    to: string
    subject: string
    text: string
    html: string
  }) {
    const boundary = `b${crypto.randomUUID().replaceAll('-', '')}`
    const subject = encodeSubject(opts.subject)
    const headers = [
      `From: ${opts.from}`,
      `To: ${opts.to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ].join('\r\n')
    const body = [
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      opts.text.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n'),
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      opts.html.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n'),
      `--${boundary}--`,
      '',
    ].join('\r\n')

    await this.command(`MAIL FROM:<${opts.from}>`, 250)
    await this.command(`RCPT TO:<${opts.to}>`, 250)
    await this.command('DATA', 354)
    await this.write(`${headers}\r\n\r\n${body}\r\n.\r\n`)
    await this.expect(250)
  }

  async close() {
    try {
      await this.command('QUIT', 221)
    } catch {
      /* ignore */
    }
    try {
      this.conn.close()
    } catch {
      /* ignore */
    }
  }

  private async command(line: string, code: number) {
    await this.write(`${line}\r\n`)
    await this.expect(code)
  }

  private async write(text: string) {
    await this.conn.write(this.encoder.encode(text))
  }

  private async expect(code: number) {
    const lines: string[] = []
    while (true) {
      const line = await this.readLine()
      lines.push(line)
      if (line.length >= 4 && line[3] === ' ') break
    }
    const joined = lines.join('\n')
    const got = Number(joined.slice(0, 3))
    if (got !== code) {
      throw new Error(`SMTP ${code} esperado, veio: ${joined}`)
    }
  }

  private async readLine(): Promise<string> {
    while (true) {
      for (let i = 0; i < this.buffer.length - 1; i++) {
        if (this.buffer[i] === 13 && this.buffer[i + 1] === 10) {
          const line = this.decoder.decode(this.buffer.subarray(0, i))
          this.buffer = this.buffer.subarray(i + 2)
          return line
        }
      }
      const chunk = new Uint8Array(4096)
      const n = await this.conn.read(chunk)
      if (n === null) throw new Error('SMTP: conexão fechada')
      const next = new Uint8Array(this.buffer.length + n)
      next.set(this.buffer)
      next.set(chunk.subarray(0, n), this.buffer.length)
      this.buffer = next
    }
  }
}

function b64(value: string): string {
  return btoa(value)
}

function encodeSubject(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value
  const bytes = new TextEncoder().encode(value)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return `=?UTF-8?B?${btoa(bin)}?=`
}

function emailDestino(
  responsavel: string | null | undefined,
  proprio: string | null | undefined,
): string | null {
  for (const raw of [responsavel, proprio]) {
    const email = (raw ?? '').trim().toLowerCase()
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return email
  }
  return null
}

function montarTexto(opts: {
  grupo: string
  nome: string
  registro: number | null
  tipo: string
  valor: number
  competencia: string
  vencimento: string
  pix?: PixEmailInfo | null
}): string {
  const grupo = opts.grupo.trim() || 'Grupo Escoteiro'
  const reg =
    opts.registro != null && String(opts.registro).trim()
      ? ` (reg. ${opts.registro})`
      : ''
  const valor = opts.valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
  const linhas = [
    `Olá! Mensagem do ${grupo}.`,
    '',
    `${opts.nome}${reg} possui 1 mensalidade em aberto.`,
    `Total: ${valor}.`,
    '',
    `• Competência ${opts.competencia}`,
  ]
  if (opts.tipo) linhas.push(`• ${opts.tipo}: ${valor}`)
  if (opts.vencimento) linhas.push(`• Vencimento ${opts.vencimento}`)
  linhas.push(...blocoPix(opts.pix))
  linhas.push(
    '',
    'Você também pode pagar pelo aplicativo do grupo:',
    SITE,
  )
  if (opts.registro != null && String(opts.registro).trim()) {
    linhas.push(
      `Login: registro ${String(opts.registro).replace(/\D/g, '')} e a senha cadastrada.`,
    )
  }
  linhas.push('', 'Qualquer dúvida, fale conosco. Obrigado!')
  return linhas.join('\n')
}

function blocoPix(pix: PixEmailInfo | null | undefined): string[] {
  if (!pix?.pix_copia_e_cola) {
    return [
      '',
      'Para pagar, acesse o aplicativo do grupo, abra Mensalidades em aberto e toque em Pagar.',
    ]
  }
  return [
    '',
    'Pague agora com PIX:',
    pix.link,
    '',
    'Ou copie e cole no app do seu banco:',
    pix.pix_copia_e_cola,
    '',
    'Após o pagamento, a baixa no sistema é automática.',
  ]
}

async function criarPixMensalidadeEmail(opts: {
  empresaId: number
  associadoId: number
  receitaIds: number[]
  descricao: string
}): Promise<PixEmailInfo | null> {
  const ids = [
    ...new Set(
      opts.receitaIds.filter((n) => Number.isFinite(n) && n > 0),
    ),
  ]
  if (ids.length === 0) return null

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/pix-sicredi`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'create_mensalidade_email',
        empresa_id: opts.empresaId,
        associado_id: opts.associadoId,
        receita_ids: ids,
        descricao: opts.descricao,
      }),
    })
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean
      configured?: boolean
      cobranca?: {
        pix_copia_e_cola?: string | null
        link_token?: string | null
        valor?: number
      }
      error?: string
    } | null
    const code = data?.cobranca?.pix_copia_e_cola?.trim()
    const token = data?.cobranca?.link_token?.trim()
    if (!data?.ok || !code || !token) return null
    return {
      pix_copia_e_cola: code,
      link: `${SITE}/pagar-mensalidade/${token}`,
      valor: Number(data.cobranca?.valor ?? 0),
    }
  } catch {
    return null
  }
}

function textoParaHtml(texto: string): string {
  const corpo = escapeHtml(texto).replaceAll('\n', '<br>')
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1f2933">${corpo}</div>`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

type ReceitaVencida = {
  receita_id: number
  empresa_id: number
  associado_id: number
  receita_vencimento: string
  receita_competencia: string | null
  receita_saldo: number
  receita_descricao: string | null
}

async function lembreteVencidas(req: Request, _body: unknown): Promise<Response> {
  const esperado = Deno.env.get('MENSALIDADE_LEMBRETE_SECRET')?.trim() ?? ''
  const recebido = req.headers.get('x-lembrete-secret')?.trim() ?? ''
  if (!esperado || recebido !== esperado) {
    return json({ error: 'Não autorizado.' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)
  const hoje = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Sao_Paulo',
  })
  const limite = somarDias(hoje, -2)

  const { data: receitas, error } = await admin
    .from('receitas')
    .select(
      'receita_id, empresa_id, associado_id, receita_vencimento, receita_competencia, receita_saldo, receita_descricao',
    )
    .eq('receita_origem', 'M')
    .in('receita_situacao', [1, 2])
    .gt('receita_saldo', 0)
    .lte('receita_vencimento', limite)
    .not('associado_id', 'is', null)
    .limit(2000)

  if (error) return json({ error: error.message }, 500)

  const deHoje = ((receitas ?? []) as ReceitaVencida[]).filter((row) => {
    const dias = diasEntre(row.receita_vencimento, hoje)
    return dias >= 2 && dias % 2 === 0
  })
  if (deHoje.length === 0) {
    return json({ enviados: 0, sem_email: 0, pulados: 0 })
  }

  const ids = deHoje.map((row) => row.receita_id)
  const { data: jaEnviados } = await admin
    .from('mensalidade_lembrete_email')
    .select('receita_id')
    .eq('enviado_em', hoje)
    .in('receita_id', ids)
  const enviadosHoje = new Set(
    (jaEnviados ?? []).map((row) => row.receita_id as number),
  )
  const pendentes = deHoje.filter((row) => !enviadosHoje.has(row.receita_id))
  if (pendentes.length === 0) {
    return json({ enviados: 0, sem_email: 0, pulados: deHoje.length })
  }

  const empresaIds = [...new Set(pendentes.map((row) => row.empresa_id))]
  const { data: empresas, error: empresaError } = await admin
    .from('empresa')
    .select('id, nome, envia_email_vencimento')
    .in('id', empresaIds)
  if (empresaError) return json({ error: empresaError.message }, 500)
  const gruposAtivos = (empresas ?? []).filter(
    (row) => row.envia_email_vencimento === true,
  )
  const ativos = new Set(gruposAtivos.map((row) => row.id as number))
  const liberados = pendentes.filter((row) => ativos.has(row.empresa_id))
  if (liberados.length === 0) {
    return json({
      enviados: 0,
      sem_email: 0,
      pulados: deHoje.length,
      grupos_inativos: empresaIds.length,
    })
  }

  const associadoIds = [...new Set(liberados.map((row) => row.associado_id))]
  const { data: associados } = await admin
    .from('associados')
    .select('associado_id, nome, registro, email, responsavel_email')
    .in('associado_id', associadoIds)
  const grupoNome = new Map(
    gruposAtivos.map((row) => [row.id as number, String(row.nome ?? '')]),
  )
  const pessoas = new Map(
    ((associados ?? []) as AssociadoMail[]).map((row) => [row.associado_id, row]),
  )

  const grupos = new Map<string, ReceitaVencida[]>()
  for (const row of liberados) {
    const chave = `${row.empresa_id}:${row.associado_id}`
    const lista = grupos.get(chave) ?? []
    lista.push(row)
    grupos.set(chave, lista)
  }

  const smtpPassword = Deno.env.get('LOCAWEB_SMTP_PASSWORD')?.trim() ?? ''
  const smtpUser =
    Deno.env.get('LOCAWEB_SMTP_USER')?.trim() || 'adm@erpescoteiro.com.br'
  const smtpHost = Deno.env.get('LOCAWEB_SMTP_HOST')?.trim() || 'email-ssl.com.br'
  const smtpPort = Number(Deno.env.get('LOCAWEB_SMTP_PORT') || '465')
  if (!smtpPassword) {
    return json(
      {
        error:
          'A senha da caixa adm@erpescoteiro.com.br ainda não foi configurada no servidor.',
      },
      503,
    )
  }
  const smtp = await SmtpSession.connect({
    host: smtpHost,
    port: smtpPort,
    user: smtpUser,
    password: smtpPassword,
  })

  let enviados = 0
  let semEmail = 0
  let falhas = 0
  const MAX_ENVIOS = 60
  try {
    for (const lista of grupos.values()) {
      if (enviados >= MAX_ENVIOS) break
      const primeiro = lista[0]
      const pessoa = pessoas.get(primeiro.associado_id)
      const destino = emailDestino(pessoa?.responsavel_email, pessoa?.email)
      const nome = (pessoa?.nome ?? '').trim() || 'Associado'
      if (!destino) {
        semEmail += 1
        continue
      }
      const grupo = grupoNome.get(primeiro.empresa_id)?.trim() || 'Grupo Escoteiro'
      const receitaIds = lista.map((row) => Number(row.receita_id))
      const pix = await criarPixMensalidadeEmail({
        empresaId: primeiro.empresa_id,
        associadoId: primeiro.associado_id,
        receitaIds,
        descricao:
          lista.length === 1
            ? `Mensalidade vencida — ${grupo}`
            : `Mensalidades vencidas (${lista.length}) — ${grupo}`,
      })
      const texto = montarTextoVencido({
        grupo,
        nome,
        registro: pessoa?.registro ?? null,
        titulos: lista,
        pix,
      })
      try {
        await smtp.send({
          from: smtpUser,
          to: destino,
          subject: `Mensalidade vencida — ${grupo}`,
          text: texto,
          html: textoParaHtml(texto),
        })
        const { error: logError } = await admin
          .from('mensalidade_lembrete_email')
          .insert(
            lista.map((row) => ({
              receita_id: row.receita_id,
              enviado_em: hoje,
            })),
          )
        if (logError) {
          falhas += 1
          continue
        }
        enviados += 1
      } catch {
        falhas += 1
      }
    }
  } finally {
    await smtp.close()
  }

  return json({
    enviados,
    sem_email: semEmail,
    falhas,
    pendentes: grupos.size,
  })
}

function montarTextoVencido(opts: {
  grupo: string
  nome: string
  registro: number | null
  titulos: ReceitaVencida[]
  pix?: PixEmailInfo | null
}): string {
  const reg =
    opts.registro != null && String(opts.registro).trim()
      ? ` (reg. ${opts.registro})`
      : ''
  const linhas = [
    `Olá! Mensagem do ${opts.grupo}.`,
    '',
    `${opts.nome}${reg} possui ${opts.titulos.length} mensalidade(s) vencida(s).`,
    '',
  ]
  let total = 0
  for (const titulo of opts.titulos) {
    const saldo = Number(titulo.receita_saldo ?? 0)
    total += saldo
    const valor = saldo.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    })
    linhas.push(
      `• ${formatarCompetencia(titulo.receita_competencia)} — vencimento ${formatarData(titulo.receita_vencimento)} — em aberto ${valor}`,
    )
  }
  linhas.push(
    '',
    `Total em aberto: ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`,
  )
  linhas.push(...blocoPix(opts.pix))
  linhas.push(
    '',
    'Você também pode pagar pelo aplicativo do grupo:',
    SITE,
  )
  if (opts.registro != null && String(opts.registro).trim()) {
    linhas.push(
      `Login: registro ${String(opts.registro).replace(/\D/g, '')} e a senha cadastrada.`,
    )
  }
  linhas.push('', 'Qualquer dúvida, fale conosco. Obrigado!')
  return linhas.join('\n')
}

function formatarData(iso: string | null): string {
  if (!iso) return '—'
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  if (!ano || !mes || !dia) return iso
  return `${dia}/${mes}/${ano}`
}

function formatarCompetencia(iso: string | null): string {
  if (!iso) return 'Mensalidade'
  const [ano, mes] = iso.slice(0, 10).split('-')
  if (!ano || !mes) return 'Mensalidade'
  return `${mes}/${ano}`
}

function diasEntre(inicio: string, fim: string): number {
  const a = Date.parse(`${inicio.slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${fim.slice(0, 10)}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

function somarDias(iso: string, dias: number): string {
  const data = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  data.setUTCDate(data.getUTCDate() + dias)
  return data.toISOString().slice(0, 10)
}
