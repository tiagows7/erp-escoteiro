import type { ContaBancariaFields } from '@/lib/contaBancariaFields'

type Props = {
  idPrefix: string
  value: ContaBancariaFields
  onChange: (next: ContaBancariaFields) => void
  disabled?: boolean
}

export function ContaBancariaFieldsForm({
  idPrefix,
  value,
  onChange,
  disabled,
}: Props) {
  function setField<K extends keyof ContaBancariaFields>(
    key: K,
    fieldValue: ContaBancariaFields[K],
  ) {
    onChange({ ...value, [key]: fieldValue })
  }

  return (
    <div className="conta-bancaria-fields form-grid-2">
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
          placeholder="Ex.: Sicredi, Banco do Brasil"
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

      <p
        className="form-section-title"
        style={{ gridColumn: '1 / -1', margin: '0.5rem 0 0' }}
      >
        PIX / API do banco
      </p>
      <p className="field-hint" style={{ gridColumn: '1 / -1', margin: 0 }}>
        Conta do grupo (sem ramo) = mensalidades. Conta com ramo = atividades
        daquele ramo.
      </p>

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
        PIX Sicredi ativo nesta conta
      </label>

      <div className="field">
        <label htmlFor={`${idPrefix}-api-id`}>Client ID</label>
        <input
          id={`${idPrefix}-api-id`}
          className="input"
          value={value.api_client_id}
          onChange={(e) => setField('api_client_id', e.target.value)}
          placeholder="Client ID da API do banco"
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
          placeholder="Client Secret da API do banco"
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
          placeholder="Produção: api-pix.sicredi.com.br · Homologação: api-pix-h.sicredi.com.br"
          autoComplete="off"
          disabled={disabled}
        />
        <span className="field-hint">
          Vazio = produção. Credenciais de homologação do portal exigem{' '}
          <code>https://api-pix-h.sicredi.com.br</code> — senão o Sicredi
          responde Access Denied.
        </span>
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
          placeholder="-----BEGIN CERTIFICATE-----"
          disabled={disabled}
        />
        <span className="field-hint">
          Tem que começar com <code>BEGIN CERTIFICATE</code>. Não use o CSR (
          <code>BEGIN CERTIFICATE REQUEST</code>).
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
          placeholder="-----BEGIN PRIVATE KEY-----"
          disabled={disabled}
        />
      </div>
    </div>
  )
}
