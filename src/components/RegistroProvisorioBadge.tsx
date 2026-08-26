/** Badge para associados com registro provisório. */
export function RegistroProvisorioBadge({
  provisorio,
}: {
  provisorio?: boolean | null
}) {
  if (!provisorio) return null
  return <span className="badge badge-warning">Provisório</span>
}
