/** Só dígitos. */
export function digitsOnly(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '')
}

/** CEP com máscara 99999-999 (máx. 8 dígitos). */
export function maskCepInput(raw: string): string {
  const d = digitsOnly(raw).slice(0, 8)
  if (d.length <= 5) return d
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

/** CEP só com dígitos (para gravar). */
export function cepDigits(value: string | null | undefined): string {
  return digitsOnly(value).slice(0, 8)
}
