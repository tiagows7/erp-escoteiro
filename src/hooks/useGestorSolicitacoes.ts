import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { nomeEhDirigente, usuarioSemRamo } from '@/lib/solicitacaoSituacao'
import { supabase } from '@/lib/supabase'

/**
 * Quem vê a lista e muda a situação: dirigente (categoria ou função)
 * ou usuário sem ramo no cadastro.
 */
export function useGestorSolicitacoes() {
  const { profile, empresa } = useAuth()
  const semRamo = usuarioSemRamo(profile?.codigo_ramo)
  const [loading, setLoading] = useState(!semRamo)
  const [gestor, setGestor] = useState(semRamo)

  useEffect(() => {
    if (semRamo) {
      setGestor(true)
      setLoading(false)
      return
    }

    const registro = String(profile?.registro ?? '').replace(/\D/g, '')
    const empresaId = empresa?.id
    if (!registro || !empresaId) {
      setGestor(false)
      setLoading(false)
      return
    }

    let mounted = true
    setLoading(true)

    void (async () => {
      const registroNum = Number(registro)
      if (!Number.isFinite(registroNum)) {
        if (mounted) {
          setGestor(false)
          setLoading(false)
        }
        return
      }

      const { data: assoc } = await supabase
        .from('associados')
        .select('categoria, funcao')
        .eq('empresa_id', empresaId)
        .eq('registro', registroNum)
        .limit(1)
        .maybeSingle()

      if (!mounted) return
      if (!assoc) {
        setGestor(false)
        setLoading(false)
        return
      }

      const [catRes, funRes] = await Promise.all([
        assoc.categoria
          ? supabase
              .from('categoria')
              .select('nome')
              .eq('categoria_id', assoc.categoria)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        assoc.funcao
          ? supabase
              .from('funcao')
              .select('nome')
              .eq('funcao_id', assoc.funcao)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ])

      if (!mounted) return
      setGestor(
        nomeEhDirigente(catRes.data?.nome) || nomeEhDirigente(funRes.data?.nome),
      )
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [semRamo, empresa?.id, profile?.registro])

  return { loading, gestor }
}
