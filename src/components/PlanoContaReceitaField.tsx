import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type PlanoOpcao = {
  plano_conta_id: number
  codigo: string
  nome: string
  ativo: boolean
}

export function PlanoContaReceitaField({
  empresaId,
  value,
  onChange,
  disabled,
}: {
  empresaId: number | undefined
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const [contas, setContas] = useState<PlanoOpcao[]>([])

  useEffect(() => {
    if (!empresaId) {
      setContas([])
      return
    }
    let mounted = true
    void supabase
      .from('plano_contas')
      .select('plano_conta_id, codigo, nome, ativo')
      .eq('empresa_id', empresaId)
      .eq('natureza', 'receita')
      .order('codigo')
      .then(({ data }) => {
        if (mounted) setContas((data ?? []) as PlanoOpcao[])
      })
    return () => {
      mounted = false
    }
  }, [empresaId])

  return (
    <div className="field field-span-2">
      <label htmlFor="plano_conta_id">Plano de contas</label>
      <select
        id="plano_conta_id"
        className="select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">Sem conta</option>
        {contas
          .filter(
            (conta) => conta.ativo || String(conta.plano_conta_id) === value,
          )
          .map((conta) => (
            <option key={conta.plano_conta_id} value={conta.plano_conta_id}>
              {conta.codigo} — {conta.nome}
              {conta.ativo ? '' : ' (inativa)'}
            </option>
          ))}
      </select>
      <span className="field-hint">
        Conta de receita usada nas receitas deste cadastro. Títulos já gerados
        sem conta recebem esta classificação. Os que já têm conta permanecem
        como estavam.
      </span>
    </div>
  )
}
