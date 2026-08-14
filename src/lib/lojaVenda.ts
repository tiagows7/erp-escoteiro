import { supabase } from '@/lib/supabase'
import { ESTOQUE_OPERACAO, ESTOQUE_ORIGEM } from '@/lib/estoque'
import { RECEITA_ORIGEM, TITULO_SITUACAO } from '@/lib/receitas'

export type LojaVendaItem = {
  produto_id: number
  nome: string
  unitario: number
  quantidade: number
}

function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function truncate(text: string, max: number): string {
  const t = text.trim()
  return t.length <= max ? t : t.slice(0, max)
}

export type FinalizarVendaLojaInput = {
  empresaId: number
  itens: LojaVendaItem[]
  tipopagtoId: number
  tipopagtoNome?: string | null
  observacao?: string | null
}

/**
 * Finaliza venda da loja: receita quitada (entra no caixa) + baixa com
 * tipo de pagamento + saída de estoque.
 */
export async function finalizarVendaLoja(
  input: FinalizarVendaLojaInput,
): Promise<
  | { ok: true; receita_id: number; itens: number; total: number }
  | { ok: false; error: string }
> {
  if (!input.itens.length) {
    return { ok: false, error: 'Adicione pelo menos um produto.' }
  }
  if (!Number.isFinite(input.tipopagtoId) || input.tipopagtoId <= 0) {
    return { ok: false, error: 'Selecione o tipo de pagamento.' }
  }

  const total = Number(
    input.itens
      .reduce((acc, item) => acc + item.unitario * item.quantidade, 0)
      .toFixed(2),
  )
  if (total <= 0) {
    return { ok: false, error: 'Total da venda deve ser maior que zero.' }
  }

  const hoje = todayISO()
  const nomes = input.itens.map((i) => i.nome).join(', ')
  const descricao = truncate(`Venda loja — ${nomes}`, 120)
  const obsUser = (input.observacao ?? '').trim()
  const tipoNome = (input.tipopagtoNome ?? '').trim()
  const observacaoReceita = truncate(
    [
      `Venda loja · ${input.itens.length} item(ns)`,
      tipoNome ? `Pagamento: ${tipoNome}` : null,
      obsUser || null,
    ]
      .filter(Boolean)
      .join(' · '),
    200,
  )

  const { data: receita, error: receitaError } = await supabase
    .from('receitas')
    .insert({
      empresa_id: input.empresaId,
      receita_origem: RECEITA_ORIGEM.AVULSA,
      receita_descricao: descricao,
      receita_emissao: hoje,
      receita_vencimento: hoje,
      receita_valor: total,
      receita_saldo: 0,
      receita_situacao: TITULO_SITUACAO.PAGO,
      receita_observacao: observacaoReceita || null,
      receita_ramo: null,
      receita_secao: null,
    })
    .select('receita_id')
    .single()

  if (receitaError || !receita?.receita_id) {
    return {
      ok: false,
      error: receitaError?.message ?? 'Falha ao criar receita da venda.',
    }
  }

  const receitaId = receita.receita_id as number

  const { error: baixaError } = await supabase.from('receita_pagamento').insert({
    empresa_id: input.empresaId,
    receita_id: receitaId,
    tipopagto_id: input.tipopagtoId,
    data_pagamento: hoje,
    valor: total,
    observacao: truncate(
      `Recebimento loja${tipoNome ? ` — ${tipoNome}` : ''}`,
      200,
    ),
  })

  if (baixaError) {
    await supabase.from('receitas').delete().eq('receita_id', receitaId)
    return { ok: false, error: baixaError.message }
  }

  const { data: maxRow } = await supabase
    .from('movimento_estoque')
    .select('movimentoest_numero')
    .eq('empresa_id', input.empresaId)
    .order('movimentoest_numero', { ascending: false })
    .limit(1)
    .maybeSingle()

  let proximoNumero = Number(maxRow?.movimentoest_numero ?? 0) + 1
  const stockPayload = input.itens.map((item) => {
    const row = {
      empresa_id: input.empresaId,
      movimentoest_numero: proximoNumero,
      movimentoest_operacao: ESTOQUE_OPERACAO.VENDA_LOJA,
      movimentoest_emissao: hoje,
      movimentoest_sinal: '-',
      movimentoest_produto: item.produto_id,
      movimentoest_quantidade: item.quantidade,
      movimentoest_unitario: item.unitario,
      movimentoest_total: Number((item.quantidade * item.unitario).toFixed(2)),
      movimentoest_origem: ESTOQUE_ORIGEM.LOJA,
      movimentoest_obs: truncate(
        [
          `Receita #${receitaId}`,
          obsUser || null,
        ]
          .filter(Boolean)
          .join(' · '),
        200,
      ) || null,
    }
    proximoNumero += 1
    return row
  })

  const { error: stockError } = await supabase
    .from('movimento_estoque')
    .insert(stockPayload)

  if (stockError) {
    await supabase.from('receitas').delete().eq('receita_id', receitaId)
    return { ok: false, error: stockError.message }
  }

  return {
    ok: true,
    receita_id: receitaId,
    itens: input.itens.length,
    total,
  }
}
