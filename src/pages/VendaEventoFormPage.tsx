import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { formatMoney, parseMoneyInput } from '@/lib/despesas'
import { totalConvitesEvento } from '@/lib/vendaEventos'
import { uploadVendaEventoImagem } from '@/lib/uploadVendaEventoImagem'
import { isAssociadoLogin } from '@/lib/roles'

const emptyForm = {
  nome: '',
  numero_inicial: '1',
  numero_final: '100',
  valor_convite: '0,00',
  data_evento: '',
}

export function VendaEventoFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const { empresa, profile, hasPermission } = useAuth()
  const associadoLogin = isAssociadoLogin(profile)
  const canWrite = !associadoLogin && hasPermission('vendas.write')
  const empresaId = empresa?.id
  const toast = useToast()

  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)
  const [imagemUrl, setImagemUrl] = useState<string | null>(null)
  const [imagemFile, setImagemFile] = useState<File | null>(null)
  const [imagemPreview, setImagemPreview] = useState<string | null>(null)
  const imagemInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isNew || !empresaId) return
    let mounted = true
    void (async () => {
      const { data, error: loadError } = await supabase
        .from('venda_eventos')
        .select(
          'evento_id, nome, numero_inicial, numero_final, valor_convite, data_evento, imagem_url',
        )
        .eq('evento_id', Number(id))
        .eq('empresa_id', empresaId)
        .maybeSingle()

      if (!mounted) return
      if (loadError || !data) {
        setError(loadError?.message ?? 'Evento não encontrado.')
        setLoading(false)
        return
      }

      setForm({
        nome: data.nome ?? '',
        numero_inicial: String(data.numero_inicial ?? 1),
        numero_final: String(data.numero_final ?? 1),
        valor_convite: formatMoney(Number(data.valor_convite ?? 0))
          .replace('R$', '')
          .trim(),
        data_evento: data.data_evento
          ? String(data.data_evento).slice(0, 10)
          : '',
      })
      setImagemUrl(data.imagem_url ?? null)
      setImagemPreview(data.imagem_url ?? null)
      setImagemFile(null)
      setLoading(false)
    })()
    return () => {
      mounted = false
    }
  }, [id, isNew, empresaId])

  if (associadoLogin && isNew) {
    return <Navigate to="/vendas/eventos" replace />
  }

  function update(field: keyof typeof emptyForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function onImagemFileChange(file: File | null) {
    if (imagemPreview && imagemPreview.startsWith('blob:')) {
      URL.revokeObjectURL(imagemPreview)
    }
    setImagemFile(file)
    setImagemPreview(file ? URL.createObjectURL(file) : imagemUrl)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite) {
      setError('Sem permissão para alterar eventos.')
      return
    }
    if (!empresaId) {
      setError('Grupo escoteiro não carregado.')
      return
    }
    if (!form.nome.trim()) {
      setError('Informe o nome do evento.')
      return
    }

    const numeroInicial = Number(String(form.numero_inicial).replace(/\D/g, ''))
    const numeroFinal = Number(String(form.numero_final).replace(/\D/g, ''))
    if (!Number.isFinite(numeroInicial) || !Number.isFinite(numeroFinal)) {
      setError('Informe convite inicial e final válidos.')
      return
    }
    if (numeroFinal < numeroInicial) {
      setError('O convite final deve ser maior ou igual ao inicial.')
      return
    }

    setSaving(true)
    setError(null)

    const payload = {
      empresa_id: empresaId,
      nome: form.nome.trim(),
      numero_inicial: numeroInicial,
      numero_final: numeroFinal,
      valor_convite: parseMoneyInput(form.valor_convite),
      data_evento: form.data_evento || null,
    }

    const result = isNew
      ? await supabase
          .from('venda_eventos')
          .insert(payload)
          .select('evento_id')
          .single()
      : await supabase
          .from('venda_eventos')
          .update(payload)
          .eq('evento_id', Number(id))
          .eq('empresa_id', empresaId)
          .select('evento_id')
          .single()

    if (result.error) {
      setSaving(false)
      setError(result.error.message)
      return
    }

    const eventoIdSalvo = Number(result.data?.evento_id ?? id)
    if (imagemFile && Number.isFinite(eventoIdSalvo) && eventoIdSalvo > 0) {
      const imgOk = await uploadVendaEventoImagem(
        empresaId,
        eventoIdSalvo,
        imagemFile,
      )
      if ('error' in imgOk) {
        setSaving(false)
        setError(`Evento salvo, mas a imagem falhou: ${imgOk.error}`)
        if (isNew) {
          navigate(`/vendas/eventos/${eventoIdSalvo}`, {
            state: { flashSuccess: 'Evento salvo. Ajuste a imagem se precisar.' },
          })
        }
        return
      }
      setImagemUrl(imgOk.url)
      setImagemPreview(imgOk.url)
      setImagemFile(null)
    }

    setSaving(false)

    if (isNew && eventoIdSalvo > 0) {
      navigate(`/vendas/eventos/${eventoIdSalvo}/vender`, {
        state: { flashSuccess: 'Evento salvo! Já pode vender convites.' },
      })
      return
    }

    toast.success('Pronto!', 'Salvo com sucesso!')
  }

  async function onDelete() {
    if (!canWrite || isNew || !empresaId) return
    const ok = await toast.confirm({
      title: 'Excluir evento?',
      message: 'As compras e a lista de convites também serão removidas.',
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return

    const { error: delError } = await supabase
      .from('venda_eventos')
      .delete()
      .eq('evento_id', Number(id))
      .eq('empresa_id', empresaId)

    if (delError) {
      setError(delError.message)
      return
    }
    navigate('/vendas/eventos', {
      state: { flashSuccess: 'Evento excluído.' },
    })
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
    return <div className="loading">Carregando evento…</div>
  }

  const disabled = saving || !canWrite
  const qtdePreview = totalConvitesEvento(
    Number(String(form.numero_inicial).replace(/\D/g, '')),
    Number(String(form.numero_final).replace(/\D/g, '')),
  )

  return (
    <>
      <header className="page-header">
        <div>
          <h2>{isNew ? 'Novo evento' : 'Editar evento'}</h2>
          <p>Nome, faixa de convites e valor unitário</p>
        </div>
        <div className="page-header-actions actions-pair">
          {!isNew ? (
            <Link
              className="btn btn-primary"
              to={`/vendas/eventos/${id}/vender`}
            >
              Vender / lista
            </Link>
          ) : null}
          <Link className="btn btn-soft" to="/vendas/eventos">
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

        <div className="form-grid form-grid-2">
          <div className="field field-span-2">
            <label htmlFor="nome">Nome do evento</label>
            <input
              id="nome"
              className="input"
              value={form.nome}
              onChange={(e) => update('nome', e.target.value)}
              disabled={disabled}
              required
              placeholder="Ex.: Jantar beneficente 2026"
            />
          </div>

          <div className="field">
            <label htmlFor="data_evento">Data do evento</label>
            <input
              id="data_evento"
              type="date"
              className="input"
              value={form.data_evento}
              onChange={(e) => update('data_evento', e.target.value)}
              disabled={disabled}
            />
          </div>

          <div className="field">
            <label htmlFor="valor_convite">Valor de cada convite</label>
            <input
              id="valor_convite"
              className="input"
              inputMode="decimal"
              value={form.valor_convite}
              onChange={(e) => update('valor_convite', e.target.value)}
              disabled={disabled}
            />
          </div>

          <div className="field">
            <label htmlFor="numero_inicial">Convite inicial</label>
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
            <label htmlFor="numero_final">Convite final</label>
            <input
              id="numero_final"
              className="input"
              inputMode="numeric"
              value={form.numero_final}
              onChange={(e) => update('numero_final', e.target.value)}
              disabled={disabled}
              required
            />
            {qtdePreview > 0 ? (
              <span className="field-hint">{qtdePreview} convite(s) na faixa</span>
            ) : null}
          </div>

          <div className="field field-span-2">
            <label htmlFor="evento-imagem">Imagem do evento</label>
            <div className="logo-upload-field">
              {imagemPreview ? (
                <img
                  className="acao-imagem-preview"
                  src={imagemPreview}
                  alt="Pré-visualização da imagem do evento"
                />
              ) : (
                <div className="logo-preview logo-preview-placeholder">
                  Sem imagem
                </div>
              )}
              <div>
                <input
                  ref={imagemInputRef}
                  id="evento-imagem"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  disabled={disabled}
                  onChange={(e) =>
                    onImagemFileChange(e.target.files?.[0] ?? null)
                  }
                />
                <span className="field-hint">
                  PNG, JPG, WEBP ou GIF · máx. 2 MB. Aparece na tela de vender.
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
          {canWrite ? (
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
            <p className="muted">Modo leitura — sem permissão para salvar.</p>
          )}
        </div>
      </form>
    </>
  )
}
