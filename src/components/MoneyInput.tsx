import { maskMoneyInput } from '@/lib/despesas'

type MoneyInputProps = {
  id?: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  required?: boolean
  className?: string
  placeholder?: string
  'aria-label'?: string
}

/** Campo de valor em reais: só dígitos, máscara pt-BR (centavos). */
export function MoneyInput({
  id,
  value,
  onChange,
  disabled,
  required,
  className = 'input',
  placeholder = '0,00',
  'aria-label': ariaLabel,
}: MoneyInputProps) {
  return (
    <input
      id={id}
      className={className}
      inputMode="decimal"
      autoComplete="off"
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      disabled={disabled}
      required={required}
      onChange={(e) => onChange(maskMoneyInput(e.target.value))}
      onBlur={() => onChange(maskMoneyInput(value || '0'))}
    />
  )
}
