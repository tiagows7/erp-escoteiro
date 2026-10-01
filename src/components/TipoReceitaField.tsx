import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type TipoOpcao = {
  fordespesa_id: number
  fordespesa_nome: string | null
}

export function TipoReceitaField({
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
  const [tipos, setTipos] = useState<TipoOpcao[]>([])

  useEffect(() => {
    if (!empresaId) {
      setTipos([])
      return
    }
    let mounted = true
    void supabase
      .from('fornecedor_despesa')
      .select('fordespesa_id, fordespesa_nome')
      .eq('empresa_id', empresaId)
      .eq('fordespesa_despesa', 'R')
      .order('fordespesa_nome')
      .then(({ data }) => {
        if (mounted) setTipos((data ?? []) as TipoOpcao[])
      })
    return () => {
      mounted = false
    }
  }, [empresaId])

  return (
    <div className="field field-span-2">
      <label htmlFor="receita_tipo_id">Tipo de receita</label>
      <select
        id="receita_tipo_id"
        className="select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">Sem tipo</option>
        {tipos.map((tipo) => (
          <option key={tipo.fordespesa_id} value={tipo.fordespesa_id}>
            {tipo.fordespesa_nome?.trim() || `Tipo #${tipo.fordespesa_id}`}
          </option>
        ))}
      </select>
      <span className="field-hint">
        Contato marcado como receita. O portal usa o plano de contas desse
        contato para agrupar os títulos. Os que já têm tipo permanecem como
        estavam.
      </span>
    </div>
  )
}
