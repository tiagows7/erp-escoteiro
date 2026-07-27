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
          placeholder="Ex.: Caixa do ramo, Conta eventos"
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
      <div className="field">
        <label htmlFor={`${idPrefix}-api-id`}>API — Client ID</label>
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
      <div className="field" style={{ gridColumn: '1 / -1' }}>
        <label htmlFor={`${idPrefix}-api-secret`}>API — Client Secret</label>
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
        <span className="field-hint">
          Credenciais genéricas para integração com a API do banco.
        </span>
      </div>
    </div>
  )
}
