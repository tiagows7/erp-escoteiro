import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ContaBancariaFieldsForm } from '@/components/ContaBancariaFieldsForm'
import {
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

    setSaving(true)
    setError(null)

    const ramoNum = ramoId ? Number(ramoId) : null
    const secaoNum = secaoId ? Number(secaoId) : null
    const payload = {
      empresa_id: empresaId,
      ramo_id: ramoNum,
      secao_id: secaoNum,
      ...contaBancariaToDb(fields),
      updated_at: new Date().toISOString(),
    }

    if (editing?.id) {
      const { data, error: updError } = await supabase
        .from('empresa_conta_bancaria')
        .update(payload)
        .eq('id', editing.id)
        .select(
          'id, empresa_id, ramo_id, secao_id, descricao, banco_nome, agencia, conta, api_client_id, api_client_secret',
        )
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
      .select(
        'id, empresa_id, ramo_id, secao_id, descricao, banco_nome, agencia, conta, api_client_id, api_client_secret',
      )
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
              Informe os dados da conta e, se quiser, vincule a um ramo/seção.
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
    descricao: (data.descricao as string | null) ?? '',
    banco_nome: (data.banco_nome as string | null) ?? '',
    agencia: (data.agencia as string | null) ?? '',
    conta: (data.conta as string | null) ?? '',
    api_client_id: (data.api_client_id as string | null) ?? '',
    api_client_secret: (data.api_client_secret as string | null) ?? '',
  }
}
