import type { SicrediPixFields } from '@/lib/sicrediPixFields'

type Props = {
  idPrefix: string
  value: SicrediPixFields
  disabled?: boolean
  onChange: (next: SicrediPixFields) => void
  hint?: string
}

export function SicrediPixFieldsForm({
  idPrefix,
  value,
  disabled,
  onChange,
  hint,
}: Props) {
  function set<K extends keyof SicrediPixFields>(
    key: K,
    next: SicrediPixFields[K],
  ) {
    onChange({ ...value, [key]: next })
  }

  return (
    <div className="sicredi-pix-fields">
      {hint ? <p className="field-hint">{hint}</p> : null}

      <label className="sicredi-pix-ativo">
        <input
          type="checkbox"
          checked={value.sicredi_pix_ativo}
          onChange={(e) => set('sicredi_pix_ativo', e.target.checked)}
          disabled={disabled}
        />
        PIX Sicredi ativo
      </label>

      <div className="form-grid form-grid-2">
        <div className="field">
          <label htmlFor={`${idPrefix}-client-id`}>Client ID</label>
          <input
            id={`${idPrefix}-client-id`}
            className="input"
            autoComplete="off"
            value={value.sicredi_pix_client_id}
            onChange={(e) => set('sicredi_pix_client_id', e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-client-secret`}>Client Secret</label>
          <input
            id={`${idPrefix}-client-secret`}
            className="input"
            type="password"
            autoComplete="new-password"
            value={value.sicredi_pix_client_secret}
            onChange={(e) => set('sicredi_pix_client_secret', e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="field field-span-2">
          <label htmlFor={`${idPrefix}-chave`}>Chave PIX</label>
          <input
            id={`${idPrefix}-chave`}
            className="input"
            autoComplete="off"
            value={value.sicredi_pix_chave}
            onChange={(e) => set('sicredi_pix_chave', e.target.value)}
            disabled={disabled}
            placeholder="E-mail, CPF/CNPJ, telefone ou chave aleatória"
          />
        </div>
        <div className="field field-span-2">
          <label htmlFor={`${idPrefix}-base-url`}>URL base (opcional)</label>
          <input
            id={`${idPrefix}-base-url`}
            className="input"
            autoComplete="off"
            value={value.sicredi_pix_base_url}
            onChange={(e) => set('sicredi_pix_base_url', e.target.value)}
            disabled={disabled}
            placeholder="https://api-pix.sicredi.com.br"
          />
        </div>
        <div className="field field-span-2">
          <label htmlFor={`${idPrefix}-cert`}>Certificado (.crt / .pem)</label>
          <textarea
            id={`${idPrefix}-cert`}
            className="input"
            rows={4}
            value={value.sicredi_pix_cert}
            onChange={(e) => set('sicredi_pix_cert', e.target.value)}
            disabled={disabled}
            placeholder="-----BEGIN CERTIFICATE-----"
          />
        </div>
        <div className="field field-span-2">
          <label htmlFor={`${idPrefix}-key`}>Chave privada (.key)</label>
          <textarea
            id={`${idPrefix}-key`}
            className="input"
            rows={4}
            value={value.sicredi_pix_key}
            onChange={(e) => set('sicredi_pix_key', e.target.value)}
            disabled={disabled}
            placeholder="-----BEGIN PRIVATE KEY-----"
          />
        </div>
      </div>
    </div>
  )
}
