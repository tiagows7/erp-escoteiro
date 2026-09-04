import { useEffect, useState } from 'react'

type Props = {
  id?: string
  value: number
  max: number
  disabled?: boolean
  onChange: (value: number) => void
}

function clampQuantidade(n: number, max: number) {
  const maxSafe = Math.max(1, max || 1)
  if (!Number.isFinite(n)) return 1
  return Math.min(Math.max(1, Math.floor(n)), maxSafe)
}

export function QuantidadeStepper({
  id,
  value,
  max,
  disabled,
  onChange,
}: Props) {
  const [texto, setTexto] = useState(String(value))
  const maxSafe = Math.max(1, max || 1)

  useEffect(() => {
    setTexto(String(value))
  }, [value])

  function commit(n: number) {
    const next = clampQuantidade(n, maxSafe)
    onChange(next)
    setTexto(String(next))
  }

  return (
    <div className={`quantidade-stepper${disabled ? ' is-disabled' : ''}`}>
      <button
        type="button"
        className="quantidade-stepper-btn"
        aria-label="Diminuir quantidade"
        disabled={disabled || value <= 1}
        onClick={() => commit(value - 1)}
      >
        −
      </button>
      <input
        id={id}
        className="input quantidade-stepper-input"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        value={texto}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '')
          setTexto(v)
          if (v === '') return
          const n = Number(v)
          if (!Number.isFinite(n) || n < 1) return
          const next = Math.min(n, maxSafe)
          onChange(next)
          if (next !== n) setTexto(String(next))
        }}
        onBlur={() => {
          if (texto.trim() === '') {
            commit(value >= 1 ? value : 1)
            return
          }
          commit(Number(texto))
        }}
      />
      <button
        type="button"
        className="quantidade-stepper-btn"
        aria-label="Aumentar quantidade"
        disabled={disabled || value >= maxSafe}
        onClick={() => commit(value + 1)}
      >
        +
      </button>
    </div>
  )
}
