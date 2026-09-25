/** Categoria de associado cujo nome indica beneficiário (jovem). */
export function categoriaEhBeneficiario(
  nome: string | null | undefined,
): boolean {
  return (nome ?? '').toUpperCase().includes('BENEFICI')
}
