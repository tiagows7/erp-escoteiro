import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type TipoOpcao = {
  fordespesa_id: number
  fordespesa_nome: string | null
  fordespesa_despesa: string | null
}

export function TipoReceitaField({
  empresaId,
  value,
  onChange,
  disabled,
  hint,
  label = 'Tipo de receita',
  id = 'receita_tipo_id',
}: {
  empresaId: number | undefined
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  hint?: string
  label?: string
  id?: string
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
      .select('fordespesa_id, fordespesa_nome, fordespesa_despesa')
      .eq('empresa_id', empresaId)
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
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className="select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">Sem tipo</option>
        {tipos
          .filter(
            (tipo) =>
              tipo.fordespesa_despesa !== 'D' ||
              String(tipo.fordespesa_id) === value,
          )
          .map((tipo) => (
            <option key={tipo.fordespesa_id} value={tipo.fordespesa_id}>
              {tipo.fordespesa_nome?.trim() || `Tipo #${tipo.fordespesa_id}`}
            </option>
          ))}
      </select>
      <span className="field-hint">
        {hint ??
          'Contato marcado como receita. O portal usa o plano de contas desse contato para agrupar os títulos. Os que já têm tipo permanecem como estavam.'}
      </span>
    </div>
  )
}
