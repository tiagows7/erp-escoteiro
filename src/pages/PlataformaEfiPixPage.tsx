import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import {
  emptyPlataformaEfiForm,
  formFromEfiSafe,
  loadPlataformaEfiPix,
  readCertificadoFile,
  savePlataformaEfiPix,
  type PlataformaEfiPixForm,
} from '@/lib/plataformaEfi'

export function PlataformaEfiPixPage() {
  const { isSuperAdmin, hasPermission, session } = useAuth()
  const canWrite = isSuperAdmin && hasPermission('plataforma.write')
  const toast = useToast()

  const [form, setForm] = useState<PlataformaEfiPixForm>(emptyPlataformaEfiForm())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [certName, setCertName] = useState<string | null>(null)

  useEffect(() => {
    if (!isSuperAdmin) return
    let mounted = true
    void (async () => {
      setLoading(true)
      const res = await loadPlataformaEfiPix()
      if (!mounted) return
      if (res.error) {
        setError(res.error)
      } else {
        setForm(formFromEfiSafe(res.data))
        setError(null)
      }
      setLoading(false)
    })()
    return () => {
      mounted = false
    }
  }, [isSuperAdmin])

  function setField<K extends keyof PlataformaEfiPixForm>(
    key: K,
    value: PlataformaEfiPixForm[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function onCertFile(file: File | null) {
    if (!file) return
    try {
      const content = await readCertificadoFile(file)
      setField('certificado', content)
      setCertName(file.name)
    } catch {
      setError('Não foi possível ler o arquivo do certificado.')
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canWrite) return

    if (form.ativo) {
      if (!form.client_id.trim()) {
        setError('Informe o Client ID da aplicação Efí.')
        return
      }
      if (!form.client_secret.trim() && !form.has_client_secret) {
        setError('Informe o Client Secret.')
        return
      }
      if (!form.pix_chave.trim()) {
        setError('Informe a chave PIX.')
        return
      }
      if (!form.certificado.trim() && !form.has_certificado) {
        setError('Envie o certificado .p12 ou .pem da Efí.')
        return
      }
    }

    setSaving(true)
    setError(null)
    const res = await savePlataformaEfiPix(form, session?.user?.id ?? null)
    setSaving(false)
    if (res.error) {
      setError(res.error)
      return
    }

    toast.success('Configuração Efí salva.')
    const reload = await loadPlataformaEfiPix()
    if (!reload.error) {
      setForm(formFromEfiSafe(reload.data))
      setCertName(null)
    }
  }

  if (!isSuperAdmin) {
    return (
      <section className="panel">
        <p className="muted">Acesso restrito ao administrador da plataforma.</p>
      </section>
    )
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h2>PIX Efí (plataforma)</h2>
          <p>
            Credenciais da conta Efí para cobrar a mensalidade dos grupos via
            PIX.
          </p>
        </div>
        <div className="page-header-actions actions-pair">
          <Link className="btn btn-soft" to="/plataforma/cobrancas">
            Cobranças
          </Link>
          <Link className="btn btn-soft" to="/plataforma/planos">
            Planos
          </Link>
        </div>
      </header>

      <form className="panel" onSubmit={(e) => void onSubmit(e)}>
        {error ? (
          <AlertMessage tone="error" title="Atenção">
            {error}
          </AlertMessage>
        ) : null}

        {loading ? (
          <div className="loading">Carregando configuração…</div>
        ) : (
          <>
            <p className="field-hint" style={{ marginTop: 0 }}>
              Obtenha Client ID, Client Secret e o certificado em{' '}
              <a
                href="https://dev.efipay.com.br/docs/api-pix/credenciais/"
                target="_blank"
                rel="noreferrer"
              >
                documentação Efí / API Pix
              </a>
              . O certificado (mTLS) é obrigatório em todas as chamadas Pix,
              inclusive no OAuth.
            </p>

            <div className="form-grid form-grid-2">
              <div className="field field-checks" style={{ gridColumn: '1 / -1' }}>
                <label>
                  <input
                    type="checkbox"
                    checked={form.ativo}
                    onChange={(e) => setField('ativo', e.target.checked)}
                    disabled={!canWrite || saving}
                  />
                  PIX Efí ativo na plataforma
                </label>
              </div>

              <div className="field field-checks" style={{ gridColumn: '1 / -1' }}>
                <label>
                  <input
                    type="checkbox"
                    checked={form.sandbox}
                    onChange={(e) => setField('sandbox', e.target.checked)}
                    disabled={!canWrite || saving}
                  />
                  Ambiente de homologação (sandbox)
                </label>
                <span className="field-hint">
                  Homologação: <code>pix-h.api.efipay.com.br</code> · Produção:{' '}
                  <code>pix.api.efipay.com.br</code>
                </span>
              </div>

              <div className="field">
                <label htmlFor="efi_client_id">Client ID</label>
                <input
                  id="efi_client_id"
                  className="input"
                  value={form.client_id}
                  onChange={(e) => setField('client_id', e.target.value)}
                  autoComplete="off"
                  disabled={!canWrite || saving}
                />
              </div>

              <div className="field">
                <label htmlFor="efi_client_secret">Client Secret</label>
                <input
                  id="efi_client_secret"
                  className="input"
                  type="password"
                  value={form.client_secret}
                  onChange={(e) => setField('client_secret', e.target.value)}
                  placeholder={
                    form.has_client_secret
                      ? '•••• já cadastrado — deixe vazio para manter'
                      : 'Client Secret da aplicação'
                  }
                  autoComplete="new-password"
                  disabled={!canWrite || saving}
                />
              </div>

              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="efi_pix_chave">Chave PIX</label>
                <input
                  id="efi_pix_chave"
                  className="input"
                  value={form.pix_chave}
                  onChange={(e) => setField('pix_chave', e.target.value)}
                  placeholder="E-mail, CPF/CNPJ, telefone ou chave aleatória"
                  autoComplete="off"
                  disabled={!canWrite || saving}
                />
              </div>

              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="efi_cert">Certificado (.p12 / .pem)</label>
                <input
                  id="efi_cert"
                  className="input"
                  type="file"
                  accept=".p12,.pfx,.pem,.crt"
                  onChange={(e) =>
                    void onCertFile(e.target.files?.[0] ?? null)
                  }
                  disabled={!canWrite || saving}
                />
                <span className="field-hint">
                  {certName
                    ? `Arquivo selecionado: ${certName}`
                    : form.has_certificado
                      ? 'Certificado já cadastrado — envie outro só se quiser substituir.'
                      : 'Obrigatório para API Pix Efí (mTLS).'}
                </span>
              </div>

              <div className="field">
                <label htmlFor="efi_cert_senha">
                  Senha do certificado (se houver)
                </label>
                <input
                  id="efi_cert_senha"
                  className="input"
                  type="password"
                  value={form.certificado_senha}
                  onChange={(e) =>
                    setField('certificado_senha', e.target.value)
                  }
                  placeholder={
                    form.has_certificado_senha
                      ? '•••• já cadastrada — deixe vazio para manter'
                      : 'Opcional'
                  }
                  autoComplete="new-password"
                  disabled={!canWrite || saving}
                />
              </div>

              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="efi_base_url">URL base (opcional)</label>
                <input
                  id="efi_base_url"
                  className="input"
                  value={form.base_url}
                  onChange={(e) => setField('base_url', e.target.value)}
                  placeholder="Deixe vazio para usar a URL padrão do ambiente"
                  autoComplete="off"
                  disabled={!canWrite || saving}
                />
              </div>
            </div>

            {canWrite ? (
              <div className="form-actions">
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? 'Salvando…' : 'Salvar configuração'}
                </button>
              </div>
            ) : (
              <p className="muted">Sem permissão para alterar.</p>
            )}
          </>
        )}
      </form>
    </>
  )
}
