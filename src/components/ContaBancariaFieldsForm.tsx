import { useState } from 'react'
import type {
  ApiPixProvedor,
  ContaBancariaFields,
} from '@/lib/contaBancariaFields'
import { labelApiPixProvedor } from '@/lib/contaBancariaFields'

type TabId = 'pix' | 'infinitepay'

const TABS: { id: TabId; label: string }[] = [
  { id: 'pix', label: 'PIX API' },
  { id: 'infinitepay', label: 'InfinitePay' },
]

type Props = {
  idPrefix: string
  value: ContaBancariaFields
  onChange: (next: ContaBancariaFields) => void
  disabled?: boolean
}

function pixHints(provedor: ApiPixProvedor) {
  if (provedor === 'bradesco') {
    return {
      ativoLabel: 'PIX Bradesco ativo nesta conta',
      intro:
        'Credenciais do Portal Bradesco Developers (produto PIX). Conta do grupo (sem ramo) = mensalidades; com ramo = atividades. Usado quando não houver tag InfinitePay.',
      urlPlaceholder:
        'Produção: qrpix.bradesco.com.br · Homologação: qrpix-h.bradesco.com.br',
      urlHint: (
        <>
          Vazio = produção (<code>https://qrpix.bradesco.com.br</code>). Em
          homologação use <code>https://qrpix-h.bradesco.com.br</code>. O
          certificado público deve ser o mesmo cadastrado no portal (mTLS).
        </>
      ),
      certHint:
        'Certificado A1 ICP-Brasil (produção). Tem que começar com BEGIN CERTIFICATE. No portal, envie só o público; aqui cole o .crt/.cer aprovado.',
      keyHint:
        'Cole o .key sem senha (-----BEGIN PRIVATE KEY-----). Arquivo ENCRYPTED não funciona na API PIX Bradesco.',
      clientIdPlaceholder: 'Client ID do Portal Bradesco Developers',
      clientSecretPlaceholder: 'Client Secret (visível só por poucos dias no portal)',
    }
  }
  return {
    ativoLabel: 'PIX Sicredi ativo nesta conta',
    intro:
      'Conta do grupo (sem ramo) = mensalidades. Conta com ramo = atividades daquele ramo. Usado quando não houver tag InfinitePay.',
    urlPlaceholder:
      'Produção: api-pix.sicredi.com.br · Homologação: api-pix-h.sicredi.com.br',
    urlHint: (
      <>
        Vazio = produção. Credenciais de homologação do portal exigem{' '}
        <code>https://api-pix-h.sicredi.com.br</code> — senão o Sicredi responde
        Access Denied.
      </>
    ),
    certHint:
      'Tem que começar com BEGIN CERTIFICATE. Não use o CSR (BEGIN CERTIFICATE REQUEST).',
    keyHint:
      'Cole o .key sem senha (-----BEGIN PRIVATE KEY-----). Arquivo ENCRYPTED não funciona no PIX Sicredi.',
    clientIdPlaceholder: 'Client ID da API do banco',
    clientSecretPlaceholder: 'Client Secret da API do banco',
  }
}

export function ContaBancariaFieldsForm({
  idPrefix,
  value,
  onChange,
  disabled,
}: Props) {
  const [tab, setTab] = useState<TabId>('pix')
  const hints = pixHints(value.api_pix_provedor)
  const provedorLabel = labelApiPixProvedor(value.api_pix_provedor)

  function setField<K extends keyof ContaBancariaFields>(
    key: K,
    fieldValue: ContaBancariaFields[K],
  ) {
    onChange({ ...value, [key]: fieldValue })
  }

  function setProvedor(next: ApiPixProvedor) {
    const patch: ContaBancariaFields = {
      ...value,
      api_pix_provedor: next,
    }
    // Se o nome do banco estiver vazio ou for o outro provedor, sugere o atual.
    const banco = value.banco_nome.trim().toLowerCase()
    if (
      !banco ||
      banco === 'sicredi' ||
      banco === 'bradesco' ||
      banco === 'banco bradesco'
    ) {
      patch.banco_nome = next === 'bradesco' ? 'Bradesco' : 'Sicredi'
    }
    onChange(patch)
  }

  return (
    <div className="conta-bancaria-fields">
      <div className="form-grid-2">
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor={`${idPrefix}-descricao`}>Descrição / apelido</label>
          <input
            id={`${idPrefix}-descricao`}
            className="input"
            value={value.descricao}
            onChange={(e) => setField('descricao', e.target.value)}
            placeholder="Ex.: Caixa do grupo, Conta eventos"
            disabled={disabled}
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-banco`}>Nome do banco</label>
          <input
            id={`${idPrefix}-banco`}
            className="input"
            value={value.banco_nome}
            onChange={(e) => setField('banco_nome', e.target.value)}
            placeholder="Ex.: Sicredi, Bradesco"
            disabled={disabled}
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-agencia`}>Agência</label>
          <input
            id={`${idPrefix}-agencia`}
            className="input"
            value={value.agencia}
            onChange={(e) => setField('agencia', e.target.value)}
            placeholder="0001"
            disabled={disabled}
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-conta`}>Conta</label>
          <input
            id={`${idPrefix}-conta`}
            className="input"
            value={value.conta}
            onChange={(e) => setField('conta', e.target.value)}
            placeholder="12345-6"
            disabled={disabled}
          />
        </div>
      </div>

      <div
        className="tabs"
        role="tablist"
        aria-label="Integrações de pagamento"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className={`tab${tab === item.id ? ' active' : ''}`}
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'pix' ? (
        <div className="form-grid-2" role="tabpanel">
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor={`${idPrefix}-pix-provedor`}>Provedor PIX</label>
            <select
              id={`${idPrefix}-pix-provedor`}
              className="select"
              value={value.api_pix_provedor}
              onChange={(e) =>
                setProvedor(e.target.value === 'bradesco' ? 'bradesco' : 'sicredi')
              }
              disabled={disabled}
            >
              <option value="sicredi">Sicredi</option>
              <option value="bradesco">Bradesco</option>
            </select>
            <span className="field-hint">{hints.intro}</span>
          </div>

          <label
            className="sicredi-pix-ativo"
            style={{ gridColumn: '1 / -1', marginTop: '0.35rem' }}
          >
            <input
              type="checkbox"
              checked={value.api_pix_ativo}
              onChange={(e) => setField('api_pix_ativo', e.target.checked)}
              disabled={disabled}
            />
            {hints.ativoLabel}
          </label>

          <div className="field">
            <label htmlFor={`${idPrefix}-api-id`}>Client ID</label>
            <input
              id={`${idPrefix}-api-id`}
              className="input"
              value={value.api_client_id}
              onChange={(e) => setField('api_client_id', e.target.value)}
              placeholder={hints.clientIdPlaceholder}
              autoComplete="off"
              disabled={disabled}
            />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-api-secret`}>Client Secret</label>
            <input
              id={`${idPrefix}-api-secret`}
              className="input"
              type="password"
              value={value.api_client_secret}
              onChange={(e) => setField('api_client_secret', e.target.value)}
              placeholder={
                value.has_api_client_secret
                  ? '•••• já cadastrado — deixe vazio para manter'
                  : hints.clientSecretPlaceholder
              }
              autoComplete="new-password"
              disabled={disabled}
            />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor={`${idPrefix}-api-pix`}>Chave PIX</label>
            <input
              id={`${idPrefix}-api-pix`}
              className="input"
              value={value.api_pix_chave}
              onChange={(e) => setField('api_pix_chave', e.target.value)}
              placeholder="E-mail, CPF/CNPJ, telefone ou chave aleatória"
              autoComplete="off"
              disabled={disabled}
            />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor={`${idPrefix}-api-base`}>URL base (opcional)</label>
            <input
              id={`${idPrefix}-api-base`}
              className="input"
              value={value.api_pix_base_url}
              onChange={(e) => setField('api_pix_base_url', e.target.value)}
              placeholder={hints.urlPlaceholder}
              autoComplete="off"
              disabled={disabled}
            />
            <span className="field-hint">{hints.urlHint}</span>
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor={`${idPrefix}-api-cert`}>
              Certificado aprovado (.crt / .cer)
            </label>
            <textarea
              id={`${idPrefix}-api-cert`}
              className="input"
              rows={4}
              value={value.api_pix_cert}
              onChange={(e) => setField('api_pix_cert', e.target.value)}
              placeholder={
                value.has_api_pix_cert
                  ? 'Já cadastrado — cole um novo apenas para substituir'
                  : '-----BEGIN CERTIFICATE-----'
              }
              disabled={disabled}
            />
            <span className="field-hint">
              {hints.certHint}
              {value.has_api_pix_cert
                ? ' O certificado atual não é exibido por segurança.'
                : ''}
            </span>
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor={`${idPrefix}-api-key`}>Chave privada (.key)</label>
            <textarea
              id={`${idPrefix}-api-key`}
              className="input"
              rows={4}
              value={value.api_pix_key}
              onChange={(e) => setField('api_pix_key', e.target.value)}
              placeholder={
                value.has_api_pix_key
                  ? 'Já cadastrada — cole uma nova apenas para substituir'
                  : '-----BEGIN PRIVATE KEY-----'
              }
              disabled={disabled}
            />
            {value.has_api_pix_key ? (
              <span className="field-hint">
                A chave privada atual não é exibida por segurança. Use chave{' '}
                <strong>sem senha</strong> (BEGIN PRIVATE KEY). Se o arquivo
                estiver com senha (ENCRYPTED), converta com openssl pkcs8 …
                -nocrypt antes de colar.
              </span>
            ) : (
              <span className="field-hint">{hints.keyHint}</span>
            )}
          </div>
          <p className="field-hint" style={{ gridColumn: '1 / -1', margin: 0 }}>
            Provedor selecionado: <strong>{provedorLabel}</strong>.
          </p>
        </div>
      ) : null}

      {tab === 'infinitepay' ? (
        <div className="form-grid-2" role="tabpanel">
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor={`${idPrefix}-infinitepay`}>
              Tag InfinitePay (InfiniteTag)
            </label>
            <input
              id={`${idPrefix}-infinitepay`}
              className="input"
              value={value.infinitepay_handle}
              onChange={(e) => setField('infinitepay_handle', e.target.value)}
              placeholder="sua_tag (sem o $)"
              autoComplete="off"
              disabled={disabled}
            />
            <span className="field-hint">
              Se preenchida, eventos podem usar o checkout InfinitePay
              (Pix/cartão). Se vazia, vale o PIX da aba PIX API (
              {provedorLabel}).
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
