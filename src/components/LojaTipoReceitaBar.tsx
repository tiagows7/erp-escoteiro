import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AlertMessage } from '@/components/AlertMessage'
import { TipoReceitaField } from '@/components/TipoReceitaField'

export function LojaTipoReceitaBar({
  empresaId,
  onInformado,
  canEdit = true,
}: {
  empresaId: number
  onInformado: (informado: boolean) => void
  canEdit?: boolean
}) {
  const [value, setValue] = useState('')
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    void supabase
      .from('empresa')
      .select('loja_receita_tipo_id')
      .eq('id', empresaId)
      .maybeSingle()
      .then(({ data, error: loadError }) => {
        if (!mounted) return
        const id = data?.loja_receita_tipo_id
        setValue(id != null ? String(id) : '')
        setReady(true)
        onInformado(id != null)
        setError(loadError?.message ?? null)
      })
    return () => {
      mounted = false
    }
  }, [empresaId, onInformado])

  async function change(next: string) {
    const previous = value
    setValue(next)
    setSaving(true)
    setError(null)
    const { error: saveError } = await supabase
      .from('empresa')
      .update({
        loja_receita_tipo_id: next ? Number(next) : null,
      })
      .eq('id', empresaId)
    setSaving(false)
    if (saveError) {
      setValue(previous)
      setError(saveError.message)
      onInformado(Boolean(previous))
      return
    }
    onInformado(Boolean(next))
  }

  if (!ready) return null
  if (!canEdit) return null

  return (
    <section className="panel" style={{ marginBottom: '1rem' }}>
      {error ? (
        <AlertMessage tone="error" title="Tipo de receita da loja">
          {error}
        </AlertMessage>
      ) : null}
      <div className="form-grid">
        <TipoReceitaField
          empresaId={empresaId}
          value={value}
          onChange={(next) => void change(next)}
          disabled={saving}
          hint="As vendas da loja e da loja online entram neste tipo. O portal usa o plano de contas desse contato."
        />
      </div>
    </section>
  )
}
