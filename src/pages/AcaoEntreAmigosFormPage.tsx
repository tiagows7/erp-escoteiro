import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import {
  formDraftKey,
  usePersistedFormState,
} from '@/hooks/usePersistedFormState'
import { AcaoSorteioModal } from '@/components/AcaoSorteioModal'
import { DocumentosLinks } from '@/components/DocumentosLinks'
import {
  faixaConflitaComOutras,
  faixaDentroDaAcao,
  formatDateBR,
  executarSorteioAcao,
  isAcaoPrazoVendasExpirado,
  isAcaoTodosVendidos,
  isAcaoVendasBloqueadas,
  podeSortearAcao,
} from '@/lib/acaoEntreAmigos'
import {
  formatMoney,
  parseMoneyInput,
  situacaoDespesaLabel,
} from '@/lib/despesas'
import { isEncerrado } from '@/lib/encerrado'
import { situacaoTituloLabel } from '@/lib/receitas'
import { isAssociadoLogin, staffRamoScope } from '@/lib/roles'
import { uploadAcaoEntreAmigosImagem } from '@/lib/uploadAcaoEntreAmigosImagem'
import type { AcaoEntreAmigosFaixa, Ramo } from '@/types/database'

type ReceitaRow = {
  receita_id: number
  receita_descricao: string | null
  receita_emissao: string | null
  receita_vencimento: string | null
  receita_valor: number | null
  receita_saldo: number | null
  receita_situacao: number | null
  receita_documento: string | null
  associados: { nome: string | null } | null
}

type DespesaRow = {
  despesa_id: number
  despesa_finalidade: string | null
  despesa_emissao: string | null
  despesa_vencimento: string | null
  despesa_valor: number | null
  despesa_saldo: number | null
  despesa_situacao: number | null
  despesa_documento: string | null
  fornecedor_despesa: { fordespesa_nome: string | null } | null
}

function formatDate(value: string | null) {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

type Secao = { secao_id: number; nome: string; ramo: number | null }
type Patrulha = {
  secaonome_id: number
  nome: string
  ramo: number | null
  secao: number | null
}
type AssociadoOpt = {
  associado_id: number
  nome: string
  registro: number | null
  ramo: number | null
  secao: number | null
  patrulha_matilha: number | null
}
type FaixaRow = AcaoEntreAmigosFaixa & {
  associado_nome: string
  vendidos: number
}

const emptyForm = {
  ramo: '',
  secao: '',
  patrulha_matilha: '',
  nome: '',
  numero_inicial: '1',
  numero_final: '100',
  valor_numero: '0,00',
  data_sorteio: '',
  data_limite_venda: '',
}

function unidadeLabel(ramoId: number | null): string {
  switch (ramoId) {
    case 1:
      return 'Matilha'
    case 4:
      return 'Clã'
    default:
      return 'Patrulha'
  }
}

export function AcaoEntreAmigosFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const { empresa, profile, hasPermission } = useAuth()
  const associadoLogin = isAssociadoLogin(profile)
  const canWrite = !associadoLogin && hasPermission('vendas.write')
  const canFinanceiro = !associadoLogin && hasPermission('financeiro.write')
  const empresaId = empresa?.id
  const ramoScoped = useMemo(() => staffRamoScope(profile), [profile])
  const toast = useToast()

  const draftKey = formDraftKey(empresaId, 'acao', id)
  const [form, setForm, { hydrateFromServer, clearDraft, restored }] =
    usePersistedFormState(draftKey, emptyForm)
  const [ramos, setRamos] = useState<Ramo[]>([])
  const [secoes, setSecoes] = useState<Secao[]>([])
  const [patrulhas, setPatrulhas] = useState<Patrulha[]>([])
  const [associados, setAssociados] = useState<AssociadoOpt[]>([])
  const [faixas, setFaixas] = useState<FaixaRow[]>([])
  const [receitas, setReceitas] = useState<ReceitaRow[]>([])
  const [despesas, setDespesas] = useState<DespesaRow[]>([])
  const [faixaForm, setFaixaForm] = useState({
    associado_id: '',
    numero_inicial: '',
    numero_final: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [faixaError, setFaixaError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savingFaixa, setSavingFaixa] = useState(false)
  const [loading, setLoading] = useState(!isNew)
  const [imagemUrl, setImagemUrl] = useState<string | null>(null)
  const [imagemFile, setImagemFile] = useState<File | null>(null)
  const [imagemPreview, setImagemPreview] = useState<string | null>(null)
  const [encerradoEm, setEncerradoEm] = useState<string | null>(null)
  const [dataLimiteVenda, setDataLimiteVenda] = useState<string | null>(null)
  const [numeroSorteado, setNumeroSorteado] = useState<number | null>(null)
  const [sorteadoEm, setSorteadoEm] = useState<string | null>(null)
  const [qtdeVendidos, setQtdeVendidos] = useState(0)
  const [sorteioOpen, setSorteioOpen] = useState(false)
  const [sorteioRefazer, setSorteioRefazer] = useState(false)
  const [ganhadorNome, setGanhadorNome] = useState<string | null>(null)
  const [ganhadorTelefone, setGanhadorTelefone] = useState<string | null>(null)
  const imagemInputRef = useRef<HTMLInputElement>(null)

  const ramoId = form.ramo ? Number(form.ramo) : null
  const secaoId = form.secao ? Number(form.secao) : null
  const patrulhaId = form.patrulha_matilha
    ? Number(form.patrulha_matilha)
    : null

  const secoesDoRamo = useMemo(() => {
    if (ramoId == null) return []
    return secoes.filter((s) => s.ramo === ramoId)
  }, [ramoId, secoes])

  const patrulhasDaSecao = useMemo(() => {
    if (ramoId == null || secaoId == null) return []
    return patrulhas.filter((p) => p.ramo === ramoId && p.secao === secaoId)
  }, [ramoId, secaoId, patrulhas])

  const temPatrulha = patrulhasDaSecao.length > 0
  const labelUnidade = unidadeLabel(ramoId)

  const associadosDisponiveis = useMemo(() => {
    const jaTem = new Set(faixas.map((f) => f.associado_id))
    return associados.filter((a) => {
      if (jaTem.has(a.associado_id)) return false
      if (ramoId != null && a.ramo != null && a.ramo !== ramoId) return false
      if (secaoId != null && a.secao != null && a.secao !== secaoId) return false
      if (
        patrulhaId != null &&
        a.patrulha_matilha != null &&
        a.patrulha_matilha !== patrulhaId
      ) {
        return false
      }
      return true
    })
  }, [associados, faixas, ramoId, secaoId, patrulhaId])

  useEffect(() => {
    if (ramoScoped == null || !isNew) return
    setForm((prev) => ({ ...prev, ramo: String(ramoScoped) }))
  }, [ramoScoped, isNew])

  useEffect(() => {
    if (!empresaId) return
    void Promise.all([
      supabase
        .from('ramos')
        .select('ramo_id, nome, idade_inicio, idade_fim')
        .order('ramo_id'),
      supabase
        .from('secao')
        .select('secao_id, nome, ramo')
        .eq('empresa_id', empresaId)
        .order('nome'),
      supabase
        .from('secao_nome')
        .select('secaonome_id, nome, ramo, secao')
        .eq('empresa_id', empresaId)
        .order('nome'),
      supabase
        .from('associados')
        .select(
          'associado_id, nome, registro, ramo, secao, patrulha_matilha',
        )
        .eq('empresa_id', empresaId)
        .eq('ativo', true)
        .order('nome'),
    ]).then(([r, s, p, a]) => {
      setRamos((r.data as Ramo[]) ?? [])
      setSecoes((s.data as Secao[]) ?? [])
      setPatrulhas((p.data as Patrulha[]) ?? [])
      setAssociados((a.data as AssociadoOpt[]) ?? [])
    })
  }, [empresaId])

  async function loadFaixas(acaoId: number) {
    const [faixasRes, vendasRes] = await Promise.all([
      supabase
        .from('acao_entre_amigos_faixa')
        .select(
          'faixa_id, empresa_id, acao_id, associado_id, numero_inicial, numero_final, created_at, associados(nome)',
        )
        .eq('acao_id', acaoId)
        .eq('empresa_id', empresaId!)
        .order('numero_inicial'),
      supabase
        .from('acao_entre_amigos_venda')
        .select('numero')
        .eq('acao_id', acaoId)
        .eq('empresa_id', empresaId!),
    ])

    if (faixasRes.error) {
      setFaixaError(faixasRes.error.message)
      setFaixas([])
    } else {
      setFaixaError(null)
    }

    const vendidosSet = new Set(
      (vendasRes.data ?? []).map((v) => Number(v.numero)),
    )
    setQtdeVendidos(vendidosSet.size)

    if (faixasRes.error) return

    setFaixas(
      ((faixasRes.data ?? []) as unknown as Array<
        AcaoEntreAmigosFaixa & { associados: { nome: string | null } | null }
      >).map((row) => {
        let vendidos = 0
        for (let n = row.numero_inicial; n <= row.numero_final; n += 1) {
          if (vendidosSet.has(n)) vendidos += 1
        }
        return {
          ...row,
          associado_nome:
            row.associados?.nome ?? `Associado #${row.associado_id}`,
          vendidos,
        }
      }),
    )
  }

  useEffect(() => {
    if (isNew || !empresaId) return
    let mounted = true

    void (async () => {
      const { data, error: loadError } = await supabase
        .from('acao_entre_amigos')
        .select(
          'acao_id, ramo, secao, patrulha_matilha, nome, numero_inicial, numero_final, valor_numero, data_sorteio, data_limite_venda, imagem_url, encerrado_em, numero_sorteado, sorteado_em',
        )
        .eq('acao_id', Number(id))
        .eq('empresa_id', empresaId)
        .maybeSingle()

      if (!mounted) return
      if (loadError || !data) {
        setError(loadError?.message ?? 'Ação não encontrada neste grupo')
        setReceitas([])
        setDespesas([])
        setLoading(false)
        return
      }

      if (ramoScoped != null && data.ramo != null && data.ramo !== ramoScoped) {
        setError('Esta ação não pertence ao seu ramo.')
        setLoading(false)
        return
      }

      hydrateFromServer({
        ramo: data.ramo?.toString() ?? '',
        secao: data.secao?.toString() ?? '',
        patrulha_matilha: data.patrulha_matilha?.toString() ?? '',
        nome: data.nome ?? '',
        numero_inicial: String(data.numero_inicial ?? 1),
        numero_final: String(data.numero_final ?? 1),
        valor_numero: formatMoney(Number(data.valor_numero ?? 0))
          .replace('R$', '')
          .trim(),
        data_sorteio: data.data_sorteio
          ? String(data.data_sorteio).slice(0, 10)
          : '',
        data_limite_venda: data.data_limite_venda
          ? String(data.data_limite_venda).slice(0, 10)
          : '',
      })
      setImagemUrl(data.imagem_url ?? null)
      setImagemPreview(data.imagem_url ?? null)
      setImagemFile(null)
      setEncerradoEm((data.encerrado_em as string | null) ?? null)
      setDataLimiteVenda(
        data.data_limite_venda
          ? String(data.data_limite_venda).slice(0, 10)
          : null,
      )
      setNumeroSorteado(
        data.numero_sorteado != null
          ? Number(data.numero_sorteado)
          : null,
      )
      setSorteadoEm((data.sorteado_em as string | null) ?? null)
      if (data.numero_sorteado != null) {
        const { data: vendaGanhador } = await supabase
          .from('acao_entre_amigos_venda')
          .select('comprador_nome, comprador_telefone')
          .eq('acao_id', Number(id))
          .eq('empresa_id', empresaId)
          .eq('numero', Number(data.numero_sorteado))
          .maybeSingle()
        if (!mounted) return
        setGanhadorNome(
          vendaGanhador?.comprador_nome
            ? String(vendaGanhador.comprador_nome)
            : null,
        )
        setGanhadorTelefone(
          vendaGanhador?.comprador_telefone
            ? String(vendaGanhador.comprador_telefone)
            : null,
        )
      } else {
        setGanhadorNome(null)
        setGanhadorTelefone(null)
      }
      await loadFaixas(Number(id))

      const [r, d] = await Promise.all([
        supabase
          .from('receitas')
          .select(
            'receita_id, receita_descricao, receita_emissao, receita_vencimento, receita_valor, receita_saldo, receita_situacao, receita_documento, associados(nome)',
          )
          .eq('empresa_id', empresaId)
          .eq('acao_id', data.acao_id)
          .order('receita_vencimento', { ascending: true }),
        supabase
          .from('despesas')
          .select(
            'despesa_id, despesa_finalidade, despesa_emissao, despesa_vencimento, despesa_valor, despesa_saldo, despesa_situacao, despesa_documento, fornecedor_despesa(fordespesa_nome)',
          )
          .eq('empresa_id', empresaId)
          .eq('acao_id', data.acao_id)
          .order('despesa_vencimento', { ascending: true }),
      ])

      if (!mounted) return
      if (r.error || d.error) {
        setError(
          r.error?.message ?? d.error?.message ?? 'Falha ao carregar contas.',
        )
        setReceitas([])
        setDespesas([])
      } else {
        setReceitas((r.data as unknown as ReceitaRow[]) ?? [])
        setDespesas((d.data as unknown as DespesaRow[]) ?? [])
      }
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew, empresaId, ramoScoped])

  const totais = useMemo(() => {
    const totalReceitas = receitas.reduce(
      (s, row) => s + Number(row.receita_valor ?? 0),
      0,
    )
    const totalDespesas = despesas.reduce(
      (s, row) => s + Number(row.despesa_valor ?? 0),
      0,
    )
    return {
      totalReceitas,
      totalDespesas,
      saldoFinal: totalReceitas - totalDespesas,
    }
  }, [receitas, despesas])

  const saldoTone =
    totais.saldoFinal > 0.005
      ? 'ok'
      : totais.saldoFinal < -0.005
        ? 'deficit'
        : 'zero'

  function update(field: keyof typeof emptyForm, value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'ramo') {
        next.secao = ''
        next.patrulha_matilha = ''
      }
      if (field === 'secao') {
        next.patrulha_matilha = ''
      }
      return next
    })
  }

  function onImagemFileChange(file: File | null) {
    if (imagemPreview && imagemPreview.startsWith('blob:')) {
      URL.revokeObjectURL(imagemPreview)
    }
    setImagemFile(file)
    setImagemPreview(file ? URL.createObjectURL(file) : imagemUrl)
  }

  async function onEncerrar() {
    if (!canWrite || isNew || !empresaId || isEncerrado(encerradoEm)) return
    const ok = await toast.confirm({
      title: 'Encerrar vendas?',
      message:
        'Depois de encerrada, não será possível vender números nem alterar o cadastro — só visualizar e sortear.',
      confirmLabel: 'Encerrar vendas',
      danger: true,
    })
    if (!ok) return

    const { error: upError, data } = await supabase
      .from('acao_entre_amigos')
      .update({ encerrado_em: new Date().toISOString() })
      .eq('acao_id', Number(id))
      .eq('empresa_id', empresaId)
      .select('encerrado_em')
      .single()

    if (upError || !data) {
      setError(upError?.message ?? 'Não foi possível encerrar a ação.')
      return
    }
    setEncerradoEm((data.encerrado_em as string | null) ?? null)
    toast.success('Vendas encerradas', 'Agora é possível realizar o sorteio.')
  }

  async function onSortear(refazer = false) {
    if (!canWrite || isNew || !empresaId) return
    if (numeroSorteado != null && !refazer) {
      // botão "Sortear novamente"
      refazer = true
    }
    const ok = await toast.confirm({
      title: refazer && numeroSorteado != null ? 'Sortear novamente?' : 'Realizar sorteio?',
      message:
        refazer && numeroSorteado != null
          ? 'Um novo número será sorteado entre os vendidos e substitui o resultado anterior.'
          : 'O sistema sorteia um número entre os já vendidos, com contagem de 10 segundos.',
      confirmLabel: refazer && numeroSorteado != null ? 'Sortear novamente' : 'Sortear',
      danger: refazer && numeroSorteado != null,
    })
    if (!ok) return
    setError(null)
    setSorteioRefazer(refazer && numeroSorteado != null)
    setSorteioOpen(true)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite) {
      setError('Sem permissão para alterar ações entre amigos.')
      return
    }
    if (!isNew && isEncerrado(encerradoEm)) {
      setError('Ação encerrada — somente visualização.')
      return
    }
    if (!empresaId) {
      setError('Grupo escoteiro não carregado.')
      return
    }
    if (ramoScoped != null && !form.ramo) {
      setError('Selecione o ramo.')
      return
    }
    if (!form.nome.trim()) {
      setError('Informe o nome da ação.')
      return
    }

    const numeroInicial = Number(String(form.numero_inicial).replace(/\D/g, ''))
    const numeroFinal = Number(String(form.numero_final).replace(/\D/g, ''))
    if (!Number.isFinite(numeroInicial) || !Number.isFinite(numeroFinal)) {
      setError('Informe número inicial e final válidos.')
      return
    }
    if (numeroInicial < 0) {
      setError('O número inicial não pode ser negativo.')
      return
    }
    if (numeroFinal < numeroInicial) {
      setError('O número final deve ser maior ou igual ao inicial.')
      return
    }

    setSaving(true)
    setError(null)

    const ramoValue =
      ramoScoped != null
        ? ramoScoped
        : form.ramo
          ? Number(form.ramo)
          : null

    const payload = {
      empresa_id: empresaId,
      ramo: ramoValue,
      secao: form.secao ? Number(form.secao) : null,
      patrulha_matilha: form.patrulha_matilha
        ? Number(form.patrulha_matilha)
        : null,
      nome: form.nome.trim(),
      numero_inicial: numeroInicial,
      numero_final: numeroFinal,
      valor_numero: parseMoneyInput(form.valor_numero),
      data_sorteio: form.data_sorteio || null,
      data_limite_venda: form.data_limite_venda || null,
    }

    const result = isNew
      ? await supabase
          .from('acao_entre_amigos')
          .insert(payload)
          .select('acao_id')
          .single()
      : await supabase
          .from('acao_entre_amigos')
          .update(payload)
          .eq('acao_id', Number(id))
          .eq('empresa_id', empresaId)
          .select('acao_id')
          .single()

    if (result.error) {
      setSaving(false)
      setError(result.error.message)
      return
    }

    const acaoIdSalva = Number(result.data?.acao_id ?? id)
    if (imagemFile && Number.isFinite(acaoIdSalva) && acaoIdSalva > 0) {
      const imgOk = await uploadAcaoEntreAmigosImagem(
        empresaId,
        acaoIdSalva,
        imagemFile,
      )
      if ('error' in imgOk) {
        setSaving(false)
        setError(`Ação salva, mas a imagem falhou: ${imgOk.error}`)
        if (isNew) {
          clearDraft()
          navigate(`/vendas/acao-entre-amigos/${acaoIdSalva}`, {
            state: {
              flashSuccess:
                'Ação salva! Agora atribua as faixas. A imagem pode ser enviada na edição.',
            },
          })
        }
        return
      }
      setImagemUrl(imgOk.url)
      setImagemPreview(imgOk.url)
      setImagemFile(null)
    }

    setSaving(false)

    if (isNew && acaoIdSalva > 0) {
      clearDraft()
      navigate(`/vendas/acao-entre-amigos/${acaoIdSalva}`, {
        state: {
          flashSuccess:
            'Ação salva! Agora atribua as faixas de números aos jovens.',
        },
      })
      return
    }

    toast.success('Pronto!', 'Salvo com sucesso!')
  }

  async function onAddFaixa(event: FormEvent) {
    event.preventDefault()
    if (!canWrite || isNew || !empresaId) return
    if (isEncerrado(encerradoEm)) {
      setFaixaError('Ação encerrada — não é possível alterar faixas.')
      return
    }

    const associadoId = Number(faixaForm.associado_id)
    const ini = Number(String(faixaForm.numero_inicial).replace(/\D/g, ''))
    const fim = Number(String(faixaForm.numero_final).replace(/\D/g, ''))
    const acaoIni = Number(String(form.numero_inicial).replace(/\D/g, ''))
    const acaoFim = Number(String(form.numero_final).replace(/\D/g, ''))

    if (!Number.isFinite(associadoId) || associadoId <= 0) {
      setFaixaError('Selecione o jovem.')
      return
    }
    if (!Number.isFinite(ini) || !Number.isFinite(fim) || fim < ini) {
      setFaixaError('Informe a numeração inicial e final válidas.')
      return
    }
    if (!faixaDentroDaAcao(ini, fim, acaoIni, acaoFim)) {
      setFaixaError(
        `A faixa deve estar entre ${acaoIni} e ${acaoFim} (números da ação).`,
      )
      return
    }
    if (faixaConflitaComOutras(ini, fim, faixas)) {
      setFaixaError('Esta faixa se sobrepõe a outra já atribuída.')
      return
    }

    setSavingFaixa(true)
    setFaixaError(null)

    const { error: insertError } = await supabase
      .from('acao_entre_amigos_faixa')
      .insert({
        empresa_id: empresaId,
        acao_id: Number(id),
        associado_id: associadoId,
        numero_inicial: ini,
        numero_final: fim,
      })

    setSavingFaixa(false)

    if (insertError) {
      setFaixaError(insertError.message)
      return
    }

    setFaixaForm({ associado_id: '', numero_inicial: '', numero_final: '' })
    await loadFaixas(Number(id))
    toast.success('Pronto!', 'Faixa atribuída ao jovem.')
  }

  async function onDeleteFaixa(faixaId: number) {
    if (!canWrite || !empresaId) return
    if (isEncerrado(encerradoEm)) {
      setFaixaError('Ação encerrada — não é possível alterar faixas.')
      return
    }
    const ok = await toast.confirm({
      title: 'Remover faixa do jovem?',
      message: 'Os números voltam a ficar sem responsável.',
      confirmLabel: 'Remover',
      danger: true,
    })
    if (!ok) return

    const { error: delError } = await supabase
      .from('acao_entre_amigos_faixa')
      .delete()
      .eq('faixa_id', faixaId)
      .eq('empresa_id', empresaId)

    if (delError) {
      setFaixaError(delError.message)
      return
    }
    await loadFaixas(Number(id))
  }

  async function onDelete() {
    if (!canWrite || isNew || !empresaId) return
    if (isEncerrado(encerradoEm)) {
      setError('Ação encerrada — não é possível excluir.')
      return
    }
    const ok = await toast.confirm({
      title: 'Excluir ação entre amigos?',
      message: 'Faixas e vendas vinculadas também serão removidas.',
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return

    const { error: delError } = await supabase
      .from('acao_entre_amigos')
      .delete()
      .eq('acao_id', Number(id))
      .eq('empresa_id', empresaId)

    if (delError) {
      setError(delError.message)
      return
    }

    clearDraft()
    navigate('/vendas/acao-entre-amigos', {
      state: { flashSuccess: 'Ação excluída com sucesso!' },
    })
  }

  if (associadoLogin && !isNew) {
    return (
      <Navigate to={`/vendas/acao-entre-amigos/${id}/vender`} replace />
    )
  }
  if (associadoLogin && isNew) {
    return <Navigate to="/vendas/acao-entre-amigos" replace />
  }

  if (!empresaId) {
    return (
      <section className="panel">
        <p className="muted">
          Seu usuário precisa estar vinculado a um grupo escoteiro.
        </p>
      </section>
    )
  }

  if (loading) {
    return <div className="loading">Carregando ação…</div>
  }

  const encerrado = isEncerrado(encerradoEm)
  const numeroInicial = Number(String(form.numero_inicial).replace(/\D/g, ''))
  const numeroFinal = Number(String(form.numero_final).replace(/\D/g, ''))
  const todosVendidos = isAcaoTodosVendidos(
    numeroInicial,
    numeroFinal,
    qtdeVendidos,
  )
  const prazoExpirado = isAcaoPrazoVendasExpirado(
    form.data_limite_venda || dataLimiteVenda,
  )
  const vendasBloqueadas = isAcaoVendasBloqueadas({
    encerrado_em: encerradoEm,
    data_limite_venda: form.data_limite_venda || dataLimiteVenda,
    numero_inicial: numeroInicial,
    numero_final: numeroFinal,
    qtde_vendidos: qtdeVendidos,
  })
  const podeSortear =
    canWrite &&
    !isNew &&
    podeSortearAcao({
      encerrado_em: encerradoEm,
      data_limite_venda: form.data_limite_venda || dataLimiteVenda,
      numero_inicial: numeroInicial,
      numero_final: numeroFinal,
      qtde_vendidos: qtdeVendidos,
      numero_sorteado: numeroSorteado,
    })
  const disabled = saving || !canWrite || encerrado
  const qtdePreview = (() => {
    if (
      !Number.isFinite(numeroInicial) ||
      !Number.isFinite(numeroFinal) ||
      numeroFinal < numeroInicial
    ) {
      return null
    }
    return numeroFinal - numeroInicial + 1
  })()

  return (
    <>
      <header className="page-header">
        <div>
          <h2>
            {isNew
              ? 'Nova ação entre amigos'
              : encerrado
                ? 'Ação entre amigos'
                : 'Editar ação entre amigos'}{' '}
            {encerrado ? (
              <span className="badge badge-danger">Encerrado</span>
            ) : prazoExpirado ? (
              <span className="badge badge-danger">Prazo encerrado</span>
            ) : todosVendidos ? (
              <span className="badge">Todos vendidos</span>
            ) : null}
          </h2>
          <p>
            {encerrado
              ? 'Somente visualização — vendas e alterações bloqueadas.'
              : 'Nome, valor do número, faixa geral, prazo de vendas e atribuição aos jovens'}
          </p>
        </div>
        <div className="page-header-actions">
          {!isNew ? (
            <Link
              className="btn btn-primary"
              to={`/vendas/acao-entre-amigos/${id}/vender`}
            >
              Ver vendas
            </Link>
          ) : null}
          {!isNew && canFinanceiro && !encerrado ? (
            <>
              <Link
                className="btn btn-accent"
                to={`/despesas/inclusao/novo?acao_id=${id}`}
              >
                Lançar despesa
              </Link>
              <Link
                className="btn btn-primary"
                to={`/receitas/inclusao/novo?acao_id=${id}`}
              >
                Lançar receita
              </Link>
            </>
          ) : null}
          {!isNew && canWrite && !encerrado ? (
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => void onEncerrar()}
            >
              Encerrar vendas
            </button>
          ) : null}
          {podeSortear ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void onSortear(numeroSorteado != null)}
            >
              {numeroSorteado != null ? 'Sortear novamente' : 'Sortear'}
            </button>
          ) : null}
          <Link className="btn btn-soft" to="/vendas/acao-entre-amigos">
            Voltar
          </Link>
        </div>
      </header>

      <form className="panel" onSubmit={(e) => void onSubmit(e)}>
        {error ? (
          <AlertMessage tone="error" title="Atenção">
            {error}
          </AlertMessage>
        ) : null}
        {restored ? (
          <AlertMessage tone="info" title="Rascunho restaurado">
            Continuamos de onde você parou nesta aba.
          </AlertMessage>
        ) : null}
        {numeroSorteado != null ? (
          <AlertMessage tone="success" title="Sorteio realizado">
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.75rem',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>
                Número sorteado: <strong>{numeroSorteado}</strong>
                {ganhadorNome ? (
                  <>
                    {' '}
                    · <strong>{ganhadorNome}</strong>
                  </>
                ) : null}
                {ganhadorTelefone ? <> · {ganhadorTelefone}</> : null}
                {sorteadoEm
                  ? ` · ${new Date(sorteadoEm).toLocaleString('pt-BR')}`
                  : null}
              </span>
              {canWrite ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void onSortear(true)}
                >
                  Sortear novamente
                </button>
              ) : null}
            </div>
          </AlertMessage>
        ) : null}
        {encerrado ? (
          <AlertMessage tone="info" title="Vendas encerradas">
            Não é possível alterar o cadastro, faixas ou vender novos números.
            {numeroSorteado == null && qtdeVendidos > 0
              ? ' Use o botão Sortear para escolher o ganhador entre os números vendidos.'
              : null}
          </AlertMessage>
        ) : vendasBloqueadas ? (
          <AlertMessage tone="info" title="Vendas bloqueadas">
            {todosVendidos
              ? 'Todos os números foram vendidos.'
              : prazoExpirado
                ? `O prazo de vendas encerrou em ${formatDateBR(form.data_limite_venda || dataLimiteVenda)}.`
                : 'As vendas desta ação estão bloqueadas.'}{' '}
            Encerre formalmente e realize o sorteio quando estiver pronto.
          </AlertMessage>
        ) : null}

        <div className="form-grid form-grid-2">
          <div className="field field-span-2">
            <label htmlFor="nome">Nome da ação</label>
            <input
              id="nome"
              className="input"
              value={form.nome}
              onChange={(e) => update('nome', e.target.value)}
              disabled={disabled}
              required
              placeholder="Ex.: Rifa da Alcateia 2026"
            />
          </div>

          <div className="field">
            <label htmlFor="ramo">Ramo</label>
            <select
              id="ramo"
              className="select"
              value={form.ramo}
              onChange={(e) => update('ramo', e.target.value)}
              disabled={disabled || ramoScoped != null}
            >
              <option value="">Grupo todo (todos os ramos)</option>
              {ramos
                .filter((r) =>
                  ramoScoped != null
                    ? r.ramo_id === ramoScoped
                    : r.ramo_id >= 1 && r.ramo_id <= 5,
                )
                .map((r) => (
                  <option key={r.ramo_id} value={r.ramo_id}>
                    {r.nome}
                  </option>
                ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="secao">Seção</label>
            <select
              id="secao"
              className="select"
              value={form.secao}
              onChange={(e) => update('secao', e.target.value)}
              disabled={disabled || !form.ramo}
            >
              <option value="">
                {form.ramo
                  ? 'Toda a seção / nenhuma'
                  : 'Grupo todo (sem seção)'}
              </option>
              {secoesDoRamo.map((s) => (
                <option key={s.secao_id} value={s.secao_id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>

          {temPatrulha ? (
            <div className="field">
              <label htmlFor="patrulha_matilha">{labelUnidade}</label>
              <select
                id="patrulha_matilha"
                className="select"
                value={form.patrulha_matilha}
                onChange={(e) => update('patrulha_matilha', e.target.value)}
                disabled={disabled || !form.secao}
              >
                <option value="">Toda a seção (opcional)</option>
                {patrulhasDaSecao.map((p) => (
                  <option key={p.secaonome_id} value={p.secaonome_id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="field">
            <label htmlFor="valor_numero">Valor de cada número</label>
            <input
              id="valor_numero"
              className="input"
              inputMode="decimal"
              value={form.valor_numero}
              onChange={(e) => update('valor_numero', e.target.value)}
              disabled={disabled}
            />
          </div>

          <div className="field">
            <label htmlFor="data_limite_venda">Data limite das vendas</label>
            <input
              id="data_limite_venda"
              type="date"
              className="input"
              value={form.data_limite_venda}
              onChange={(e) => update('data_limite_venda', e.target.value)}
              disabled={disabled}
            />
            <span className="field-hint">
              Depois deste dia, as vendas ficam bloqueadas automaticamente.
            </span>
          </div>

          <div className="field">
            <label htmlFor="data_sorteio">Data do sorteio</label>
            <input
              id="data_sorteio"
              type="date"
              className="input"
              value={form.data_sorteio}
              onChange={(e) => update('data_sorteio', e.target.value)}
              disabled={disabled}
            />
          </div>

          <div className="field">
            <label htmlFor="numero_inicial">Número inicial</label>
            <input
              id="numero_inicial"
              className="input"
              inputMode="numeric"
              value={form.numero_inicial}
              onChange={(e) => update('numero_inicial', e.target.value)}
              disabled={disabled}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="numero_final">Número final</label>
            <input
              id="numero_final"
              className="input"
              inputMode="numeric"
              value={form.numero_final}
              onChange={(e) => update('numero_final', e.target.value)}
              disabled={disabled}
              required
            />
            {qtdePreview != null ? (
              <span className="field-hint">{qtdePreview} número(s) na faixa</span>
            ) : null}
          </div>

          <div className="field field-span-2">
            <label htmlFor="acao-imagem">Imagem da ação</label>
            <div className="logo-upload-field">
              {imagemPreview ? (
                <img
                  className="acao-imagem-preview"
                  src={imagemPreview}
                  alt="Pré-visualização da imagem da ação"
                />
              ) : (
                <div className="logo-preview logo-preview-placeholder">
                  Sem imagem
                </div>
              )}
              <div>
                <input
                  ref={imagemInputRef}
                  id="acao-imagem"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  disabled={disabled}
                  onChange={(e) =>
                    onImagemFileChange(e.target.files?.[0] ?? null)
                  }
                />
                <span className="field-hint">
                  PNG, JPG, WEBP ou GIF · máx. 2 MB. Aparece na tela de vender e
                  no link público.
                </span>
                {imagemFile ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ marginTop: '0.4rem' }}
                    onClick={() => {
                      onImagemFileChange(null)
                      if (imagemInputRef.current) {
                        imagemInputRef.current.value = ''
                      }
                    }}
                  >
                    Remover seleção
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="form-actions">
          {canWrite && !encerrado ? (
            <>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              {!isNew ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={saving}
                  onClick={() => void onDelete()}
                >
                  Excluir
                </button>
              ) : null}
            </>
          ) : (
            <p className="muted">
              {encerrado
                ? 'Ação encerrada — somente visualização.'
                : 'Modo leitura — sem permissão para salvar.'}
            </p>
          )}
          <Link className="btn btn-soft" to="/vendas/acao-entre-amigos">
            Cancelar
          </Link>
        </div>
      </form>

      {!isNew ? (
        <section className="panel" style={{ marginTop: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>Números por jovem</h3>
          <p className="muted">
            Selecione o associado e o intervalo de numeração que fica com ele.
          </p>

          {faixaError ? (
            <AlertMessage tone="error" title="Atenção">
              {faixaError}
            </AlertMessage>
          ) : null}

          {canWrite && !encerrado ? (
            <form
              className="form-grid form-grid-2"
              onSubmit={(e) => void onAddFaixa(e)}
              style={{ marginBottom: '1rem' }}
            >
              <div className="field field-span-2">
                <label htmlFor="faixa_associado">Jovem</label>
                <select
                  id="faixa_associado"
                  className="select"
                  value={faixaForm.associado_id}
                  onChange={(e) =>
                    setFaixaForm((prev) => ({
                      ...prev,
                      associado_id: e.target.value,
                    }))
                  }
                  disabled={savingFaixa}
                  required
                >
                  <option value="">Selecione…</option>
                  {associadosDisponiveis.map((a) => (
                    <option key={a.associado_id} value={a.associado_id}>
                      {a.nome}
                      {a.registro != null ? ` · ${a.registro}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="faixa_ini">Nº inicial</label>
                <input
                  id="faixa_ini"
                  className="input"
                  inputMode="numeric"
                  value={faixaForm.numero_inicial}
                  onChange={(e) =>
                    setFaixaForm((prev) => ({
                      ...prev,
                      numero_inicial: e.target.value,
                    }))
                  }
                  disabled={savingFaixa}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="faixa_fim">Nº final</label>
                <input
                  id="faixa_fim"
                  className="input"
                  inputMode="numeric"
                  value={faixaForm.numero_final}
                  onChange={(e) =>
                    setFaixaForm((prev) => ({
                      ...prev,
                      numero_final: e.target.value,
                    }))
                  }
                  disabled={savingFaixa}
                  required
                />
              </div>
              <div className="form-actions field-span-2">
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={savingFaixa}
                >
                  {savingFaixa ? 'Salvando…' : 'Atribuir faixa'}
                </button>
              </div>
            </form>
          ) : null}

          {faixas.length === 0 ? (
            <div className="empty">Nenhuma faixa atribuída ainda.</div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Jovem</th>
                    <th>Números</th>
                    <th>Vendidos</th>
                    <th>Qtde</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {faixas.map((f) => (
                    <tr key={f.faixa_id}>
                      <td>{f.associado_nome}</td>
                      <td>
                        {f.numero_inicial} – {f.numero_final}
                      </td>
                      <td>
                        <strong>{f.vendidos}</strong>
                      </td>
                      <td>{f.numero_final - f.numero_inicial + 1}</td>
                      <td>
                        {canWrite && !encerrado ? (
                          <button
                            type="button"
                            className="btn btn-soft"
                            onClick={() => void onDeleteFaixa(f.faixa_id)}
                          >
                            Remover
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {!isNew ? (
        <>
          <section
            className="panel atividade-contas-resumo"
            style={{ marginTop: '1rem' }}
          >
            <h3 style={{ marginTop: 0 }}>Resumo financeiro</h3>
            <div className="atividade-contas-grid">
              <div>
                <span className="muted">Receitas</span>
                <strong>{formatMoney(totais.totalReceitas)}</strong>
              </div>
              <div>
                <span className="muted">Despesas</span>
                <strong>{formatMoney(totais.totalDespesas)}</strong>
              </div>
            </div>
            <div
              className={`atividade-contas-saldo atividade-contas-saldo--${saldoTone}`}
            >
              <div>
                <span className="muted">Saldo final (receitas − despesas)</span>
                <strong>{formatMoney(totais.saldoFinal)}</strong>
              </div>
            </div>
          </section>

          <section className="panel" style={{ marginBottom: '1rem' }}>
            <h3 style={{ marginTop: 0 }}>Receitas</h3>
            {receitas.length === 0 ? (
              <div className="empty">
                Nenhuma receita vinculada a esta ação.
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Vencimento</th>
                      <th>Descrição</th>
                      <th>Associado</th>
                      <th>Valor</th>
                      <th>Saldo</th>
                      <th>Situação</th>
                      <th>Documento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receitas.map((row) => (
                      <tr key={row.receita_id}>
                        <td>{formatDate(row.receita_vencimento)}</td>
                        <td>
                          {canFinanceiro ? (
                            <Link to={`/receitas/inclusao/${row.receita_id}`}>
                              {row.receita_descricao || '—'}
                            </Link>
                          ) : (
                            row.receita_descricao || '—'
                          )}
                        </td>
                        <td>{row.associados?.nome || '—'}</td>
                        <td>{formatMoney(row.receita_valor)}</td>
                        <td>{formatMoney(row.receita_saldo)}</td>
                        <td>{situacaoTituloLabel(row.receita_situacao)}</td>
                        <td>
                          <DocumentosLinks value={row.receita_documento} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>
                        <strong>Total</strong>
                      </td>
                      <td>
                        <strong>{formatMoney(totais.totalReceitas)}</strong>
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          <section className="panel">
            <h3 style={{ marginTop: 0 }}>Despesas</h3>
            {despesas.length === 0 ? (
              <div className="empty">
                Nenhuma despesa vinculada a esta ação.
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Vencimento</th>
                      <th>Finalidade</th>
                      <th>Fornecedor</th>
                      <th>Valor</th>
                      <th>Saldo</th>
                      <th>Situação</th>
                      <th>Documento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {despesas.map((row) => (
                      <tr key={row.despesa_id}>
                        <td>{formatDate(row.despesa_vencimento)}</td>
                        <td>
                          {canFinanceiro ? (
                            <Link to={`/despesas/inclusao/${row.despesa_id}`}>
                              {row.despesa_finalidade || '—'}
                            </Link>
                          ) : (
                            row.despesa_finalidade || '—'
                          )}
                        </td>
                        <td>
                          {row.fornecedor_despesa?.fordespesa_nome || '—'}
                        </td>
                        <td>{formatMoney(row.despesa_valor)}</td>
                        <td>{formatMoney(row.despesa_saldo)}</td>
                        <td>{situacaoDespesaLabel(row.despesa_situacao)}</td>
                        <td>
                          <DocumentosLinks value={row.despesa_documento} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>
                        <strong>Total</strong>
                      </td>
                      <td>
                        <strong>{formatMoney(totais.totalDespesas)}</strong>
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      <AcaoSorteioModal
        open={sorteioOpen}
        acaoNome={form.nome}
        runSorteio={() =>
          executarSorteioAcao(Number(id), sorteioRefazer)
        }
        onDone={(g) => {
          setNumeroSorteado(g.numero)
          setGanhadorNome(g.nome || null)
          setGanhadorTelefone(g.telefone || null)
          setSorteadoEm(new Date().toISOString())
          if (!encerradoEm) setEncerradoEm(new Date().toISOString())
        }}
        onClose={() => setSorteioOpen(false)}
      />
    </>
  )
}
