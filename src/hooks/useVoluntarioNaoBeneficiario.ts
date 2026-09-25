import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { categoriaEhBeneficiario } from '@/lib/categoriaAssociado'
import { isAssociadoLogin } from '@/lib/roles'
import { supabase } from '@/lib/supabase'

/**
 * Menu Solicitações: equipe (login e-mail) sempre; portal do associado só se
 * a categoria do associado NÃO for beneficiário.
 */
export function useVoluntarioNaoBeneficiario() {
  const { profile, empresa } = useAuth()
  const associadoLogin = isAssociadoLogin(profile)
  const [loading, setLoading] = useState(associadoLogin)
  const [allowed, setAllowed] = useState(!associadoLogin)

  useEffect(() => {
    if (!associadoLogin) {
      setAllowed(true)
      setLoading(false)
      return
    }

    const registro = String(profile?.registro ?? '').trim()
    const empresaId = empresa?.id
    if (!registro || !empresaId) {
      setAllowed(false)
      setLoading(false)
      return
    }

    let mounted = true
    setLoading(true)

    void (async () => {
      const registroNum = Number(registro)
      if (!Number.isFinite(registroNum)) {
        setAllowed(false)
        setLoading(false)
        return
      }

      const { data: assoc } = await supabase
        .from('associados')
        .select('categoria')
        .eq('empresa_id', empresaId)
        .eq('registro', registroNum)
        .limit(1)
        .maybeSingle()

      if (!mounted) return

      if (!assoc?.categoria) {
        setAllowed(false)
        setLoading(false)
        return
      }

      const { data: cat } = await supabase
        .from('categoria')
        .select('nome')
        .eq('categoria_id', assoc.categoria)
        .maybeSingle()

      if (!mounted) return
      setAllowed(!categoriaEhBeneficiario(cat?.nome))
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [associadoLogin, empresa?.id, profile?.registro])

  return { loading, allowed }
}
