import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { isAssociadoLogin } from '@/lib/roles'
import { supabase } from '@/lib/supabase'

/**
 * Associado (login por registro): tem ação entre amigos se existir
 * faixa de números atribuída a ele.
 */
export function useAssociadoAcaoEntreAmigos() {
  const { profile, empresa } = useAuth()
  const associadoLogin = isAssociadoLogin(profile)
  const [loading, setLoading] = useState(associadoLogin)
  const [temAcao, setTemAcao] = useState(false)

  useEffect(() => {
    if (!associadoLogin) {
      setTemAcao(false)
      setLoading(false)
      return
    }

    const empresaId = empresa?.id
    const registro = profile?.registro
    if (!empresaId || !registro) {
      setTemAcao(false)
      setLoading(false)
      return
    }

    let mounted = true
    setLoading(true)

    void (async () => {
      const registroNum = Number(String(registro).replace(/\D/g, ''))
      if (!Number.isFinite(registroNum) || registroNum <= 0) {
        if (mounted) {
          setTemAcao(false)
          setLoading(false)
        }
        return
      }

      const { data: assoc } = await supabase
        .from('associados')
        .select('associado_id')
        .eq('empresa_id', empresaId)
        .eq('registro', registroNum)
        .maybeSingle()

      if (!mounted) return
      const associadoId = (assoc?.associado_id as number | null) ?? null
      if (associadoId == null) {
        setTemAcao(false)
        setLoading(false)
        return
      }

      const { count, error } = await supabase
        .from('acao_entre_amigos_faixa')
        .select('faixa_id', { count: 'exact', head: true })
        .eq('empresa_id', empresaId)
        .eq('associado_id', associadoId)

      if (!mounted) return
      setTemAcao(!error && (count ?? 0) > 0)
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [associadoLogin, empresa?.id, profile?.registro])

  return { associadoLogin, loading, temAcao }
}
