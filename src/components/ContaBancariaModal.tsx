import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ContaBancariaFieldsForm } from '@/components/ContaBancariaFieldsForm'
import {
  CONTA_BANCARIA_SELECT,
  contaBancariaFromRow,
  contaBancariaHasData,
  contaBancariaToDb,
  emptyContaBancariaFields,
  type ContaBancariaFields,
  type ContaBancariaRow,
} from '@/lib/contaBancariaFields'
import { supabase } from '@/lib/supabase'

type RamoOpt = { ramo_id: number; nome: string }
type SecaoOpt = { secao_id: number; nome: string; ramo: number | null }

type Props = {
  empresaId: number
  ramos: RamoOpt[]
  secoes: SecaoOpt[]
  editing: ContaBancariaRow | null
  onClose: () => void
  onSaved: (row: ContaBancariaRow) => void
}

export function ContaBancariaModal({
  empresaId,
  ramos,
  secoes,
  editing,
  onClose,
  onSaved,
}: Props) {
  const [fields, setFields] = useState<ContaBancariaFields>(
    emptyContaBancariaFields(),
  )
  const [ramoId, setRamoId] = useState('')
  const [secaoId, setSecaoId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (editing) {
      setFields(contaBancariaFromRow(editing))
      setRamoId(editing.ramo_id != null ? String(editing.ramo_id) : '')
      setSecaoId(editing.secao_id != null ? String(editing.secao_id) : '')
    } else {
      setFields(emptyContaBancariaFields())
      setRamoId('')
      setSecaoId('')
    }
    setError(null)
  }, [editing])

  const secoesDoRamo = useMemo(() => {
    if (!ramoId) return []
    const r = Number(ramoId)
    return secoes.filter((s) => s.ramo === r)
  }, [secoes, ramoId])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!fields.banco_nome.trim()) {
      setError('Informe o nome do banco.')
      return
    }
    if (!contaBancariaHasData(fields)) {
      setError('Preencha ao menos os dados da conta.')
      return
    }
    if (fields.api_pix_ativo) {
      const cert = fields.api_pix_cert.trim()
      const needsNewCert = !editing?.has_api_pix_cert && !cert
      if (needsNewCert) {
        setError('Com PIX ativo, informe o certificado aprovado (.crt/.cer).')
        return
      }
      if (cert.includes('BEGIN CERTIFICATE REQUEST')) {
        setError(
          'No certificado você colou o CSR (pedido). Baixe no Portal Sicredi o .crt/.cer aprovado (BEGIN CERTIFICATE, sem REQUEST).',
        )
        return
      }
      if (cert && !cert.includes('BEGIN CERTIFICATE')) {
        setError(
          'Certificado PIX inválido. Cole o .crt/.cer aprovado com -----BEGIN CERTIFICATE-----.',
        )
        return
      }
    }

    setSaving(true)
    setError(null)

    const ramoNum = ramoId ? Number(ramoId) : null
    const secaoNum = secaoId ? Number(secaoId) : null
    const payload = {
      empresa_id: empresaId,
      ramo_id: ramoNum,
      secao_id: secaoNum,
      ...contaBancariaToDb(fields, { keepExistingSecrets: !!editing?.id }),
      updated_at: new Date().toISOString(),
    }

    if (editing?.id) {
      const { data, error: updError } = await supabase
        .from('empresa_conta_bancaria')
        .update(payload)
        .eq('id', editing.id)
        .select(CONTA_BANCARIA_SELECT)
        .maybeSingle()

      setSaving(false)
      if (updError || !data) {
        setError(updError?.message ?? 'Não foi possível atualizar a conta.')
        return
      }
      onSaved(normalizeRow(data))
      onClose()
      return
    }

    const { data, error: insError } = await supabase
      .from('empresa_conta_bancaria')
      .insert(payload)
      .select(CONTA_BANCARIA_SELECT)
      .maybeSingle()

    setSaving(false)
    if (insError || !data) {
      setError(insError?.message ?? 'Não foi possível cadastrar a conta.')
      return
    }
    onSaved(normalizeRow(data))
    onClose()
  }

  return (
    <div className="confirm-overlay" role="presentation" onClick={onClose}>
      <div
        className="passagem-dialog conta-bancaria-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conta-bancaria-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="passagem-dialog-header">
          <div>
            <h3 id="conta-bancaria-modal-title">
              {editing ? 'Editar conta bancária' : 'Cadastrar banco'}
            </h3>
            <p className="muted">
              Informe os dados da conta e, nas abas, as integrações Sicredi e
              InfinitePay. Sem ramo = mensalidades do grupo; com ramo =
              atividades.
            </p>
          </div>
          <button type="button" className="btn btn-soft" onClick={onClose}>
            Fechar
          </button>
        </header>

        <form onSubmit={(e) => void onSubmit(e)}>
          <div className="form-grid-2" style={{ marginBottom: '0.85rem' }}>
            <div className="field">
              <label htmlFor="conta-banco-ramo">Ramo (opcional)</label>
              <select
                id="conta-banco-ramo"
                className="select"
                value={ramoId}
                onChange={(e) => {
                  setRamoId(e.target.value)
                  setSecaoId('')
                }}
                disabled={saving}
              >
                <option value="">Grupo (sem ramo)</option>
                {ramos.map((ramo) => (
                  <option key={ramo.ramo_id} value={ramo.ramo_id}>
                    {ramo.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="conta-banco-secao">Seção (opcional)</label>
              <select
                id="conta-banco-secao"
                className="select"
                value={secaoId}
                onChange={(e) => setSecaoId(e.target.value)}
                disabled={saving || !ramoId}
              >
                <option value="">
                  {ramoId ? 'Ramo inteiro' : 'Selecione um ramo'}
                </option>
                {secoesDoRamo.map((secao) => (
                  <option key={secao.secao_id} value={secao.secao_id}>
                    {secao.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <ContaBancariaFieldsForm
            key={editing?.id ?? 'nova-conta'}
            idPrefix="conta-banco-modal"
            value={fields}
            onChange={setFields}
            disabled={saving}
          />

          {error ? (
            <p className="field-hint" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          ) : null}

          <div className="form-actions" style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="btn btn-soft"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function normalizeRow(data: Record<string, unknown>): ContaBancariaRow {
  return {
    id: Number(data.id),
    empresa_id: Number(data.empresa_id),
    ramo_id: data.ramo_id != null ? Number(data.ramo_id) : null,
    secao_id: data.secao_id != null ? Number(data.secao_id) : null,
    ...contaBancariaFromRow({
      descricao: (data.descricao as string | null) ?? '',
      banco_nome: (data.banco_nome as string | null) ?? '',
      agencia: (data.agencia as string | null) ?? '',
      conta: (data.conta as string | null) ?? '',
      api_client_id: (data.api_client_id as string | null) ?? '',
      api_pix_chave: (data.api_pix_chave as string | null) ?? '',
      api_pix_ativo: data.api_pix_ativo === true,
      api_pix_base_url: (data.api_pix_base_url as string | null) ?? '',
      infinitepay_handle: (data.infinitepay_handle as string | null) ?? '',
      has_api_client_secret: data.has_api_client_secret === true,
      has_api_pix_cert: data.has_api_pix_cert === true,
      has_api_pix_key: data.has_api_pix_key === true,
    }),
  }
}
