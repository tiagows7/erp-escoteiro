import { supabase } from '@/lib/supabase'

export type EmailMensalidadeItem = {
  associado_id: number
  tipo_nome: string
  valor: number
  competencia: string
  vencimento: string
}

export type EmailMensalidadeResultado = {
  enviados: number
  sem_email: { associado_id: number; nome: string }[]
  falhas: { associado_id: number; nome: string; erro: string }[]
}

const LOTE = 25

export async function enviarEmailsMensalidade(opts: {
  empresaId: number
  itens: EmailMensalidadeItem[]
  onProgress?: (feitos: number, total: number) => void
}): Promise<EmailMensalidadeResultado> {
  const total: EmailMensalidadeResultado = {
    enviados: 0,
    sem_email: [],
    falhas: [],
  }

  for (let i = 0; i < opts.itens.length; i += LOTE) {
    const itens = opts.itens.slice(i, i + LOTE)
    const { data, error } = await supabase.functions.invoke(
      'enviar-email-mensalidade',
      { body: { empresa_id: opts.empresaId, itens } },
    )
    if (error) {
      const fromBody = await readFunctionsError(error)
      throw new Error(
        fromBody || 'Não foi possível enviar os e-mails de cobrança.',
      )
    }
    const row = data as EmailMensalidadeResultado | null
    total.enviados += Number(row?.enviados ?? 0)
    total.sem_email.push(...(row?.sem_email ?? []))
    total.falhas.push(...(row?.falhas ?? []))
    opts.onProgress?.(Math.min(i + itens.length, opts.itens.length), opts.itens.length)
    if ((row?.falhas ?? []).some((f) => /senha|auth|535|503/i.test(f.erro))) {
      break
    }
  }

  return total
}

async function readFunctionsError(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: Response })?.context
  if (!ctx || typeof ctx.json !== 'function') return null
  try {
    const body = await ctx.json()
    if (body?.error) return String(body.error)
  } catch {
    /* ignore */
  }
  return null
}
