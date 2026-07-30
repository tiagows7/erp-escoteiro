import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AlertMessage } from '@/components/AlertMessage'
import { parseMoneyInput } from '@/lib/despesas'
import { PORTAL_CAIXAS, type PortalCaixaId } from '@/lib/portal'
import { supabase } from '@/lib/supabase'
import type { Ramo } from '@/types/database'

export type SaldoLocalRow = {
  id: number
  empresa_id: number
  caixa_id: number
  secao_id: number | null
  nome: string
  valor: number
  ordem: number
  ativo: boolean
}

type SecaoLite = { secao_id: number; nome: string; ramo: number | null }

type Props = {
  empresaId: number
  ramos: Ramo[]
  secoes: SecaoLite[]
  editing: SaldoLocalRow | null
  onClose: () => void
  onSaved: (row: SaldoLocalRow) => void
}

export function SaldoLocalModal({
  empresaId,
  secoes,
  editing,
  onClose,
  onSaved,
}: Props) {
  const [nome, setNome] = useState('')
  const [caixaId, setCaixaId] = useState<PortalCaixaId>(0)
  const [secaoId, setSecaoId] = useState('')
  const [valor, setValor] = useState('0,00')
  const [ordem, setOrdem] = useState('0')
  const [ativo, setAtivo] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (editing) {
      setNome(editing.nome)
      setCaixaId(
        (editing.caixa_id >= 0 && editing.caixa_id <= 4
          ? editing.caixa_id
          : 0) as PortalCaixaId,
      )
      setSecaoId(editing.secao_id != null ? String(editing.secao_id) : '')
      setValor(
        Number(editing.valor).toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      )
      setOrdem(String(editing.ordem ?? 0))
      setAtivo(editing.ativo !== false)
    } else {
      setNome('')
      setCaixaId(0)
      setSecaoId('')
      setValor('0,00')
      setOrdem('0')
      setAtivo(true)
    }
    setError(null)
  }, [editing])

  const secoesDoCaixa = useMemo(() => {
    if (caixaId < 1 || caixaId > 4) return []
    return secoes.filter((s) => s.ramo === caixaId)
  }, [caixaId, secoes])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const nomeTrim = nome.trim()
    if (!nomeTrim) {
      setError('Informe o nome do local (ex.: Conta do grupo).')
      return
    }

    const valorNum = parseMoneyInput(valor)
    if (!Number.isFinite(valorNum) || valorNum < 0) {
      setError('Informe um valor válido.')
      return
    }

    setSaving(true)
    setError(null)

    const payload = {
      empresa_id: empresaId,
      caixa_id: caixaId,
      secao_id:
        caixaId >= 1 && secaoId ? Number(secaoId) : null,
      nome: nomeTrim,
      valor: valorNum,
      ordem: Number(ordem) || 0,
      ativo,
      updated_at: new Date().toISOString(),
    }

    if (editing) {
      const { data, error: updError } = await supabase
        .from('empresa_saldo_local')
        .update(payload)
        .eq('id', editing.id)
        .eq('empresa_id', empresaId)
        .select(
          'id, empresa_id, caixa_id, secao_id, nome, valor, ordem, ativo',
        )
        .single()

      setSaving(false)
      if (updError || !data) {
        setError(updError?.message ?? 'Não foi possível atualizar.')
        return
      }
      onSaved(data as SaldoLocalRow)
      onClose()
      return
    }

    const { data, error: insError } = await supabase
      .from('empresa_saldo_local')
      .insert(payload)
      .select('id, empresa_id, caixa_id, secao_id, nome, valor, ordem, ativo')
      .single()

    setSaving(false)
    if (insError || !data) {
      setError(insError?.message ?? 'Não foi possível cadastrar.')
      return
    }
    onSaved(data as SaldoLocalRow)
    onClose()
  }

  return (
    <div className="confirm-overlay" role="presentation" onClick={onClose}>
      <div
        className="passagem-dialog conta-bancaria-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="saldo-local-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="passagem-dialog-header">
          <div>
            <h3 id="saldo-local-modal-title">
              {editing ? 'Editar local do saldo' : 'Novo local do saldo'}
            </h3>
            <p className="muted">
              Ex.: Conta do grupo, Investimento, Dinheiro em caixa — aparece no
              portal abaixo do caixa.
            </p>
          </div>
          <button type="button" className="btn btn-soft" onClick={onClose}>
            Fechar
          </button>
        </header>

        {error ? (
          <AlertMessage tone="error" title="Atenção">
            {error}
          </AlertMessage>
        ) : null}

        <form onSubmit={onSubmit}>
          <div className="form-grid form-grid-2">
            <div className="field field-span-2">
              <label htmlFor="saldo-local-nome">Nome do local</label>
              <input
                id="saldo-local-nome"
                className="input"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                maxLength={80}
                required
                placeholder="Conta do grupo"
              />
            </div>

            <div className="field">
              <label htmlFor="saldo-local-caixa">Caixa</label>
              <select
                id="saldo-local-caixa"
                className="select"
                value={caixaId}
                onChange={(e) => {
                  setCaixaId(Number(e.target.value) as PortalCaixaId)
                  setSecaoId('')
                }}
              >
                {PORTAL_CAIXAS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="saldo-local-secao">Seção (opcional)</label>
              <select
                id="saldo-local-secao"
                className="select"
                value={secaoId}
                onChange={(e) => setSecaoId(e.target.value)}
                disabled={caixaId < 1 || secoesDoCaixa.length === 0}
              >
                <option value="">Todo o caixa</option>
                {secoesDoCaixa.map((s) => (
                  <option key={s.secao_id} value={s.secao_id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="saldo-local-valor">Valor</label>
              <input
                id="saldo-local-valor"
                className="input"
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="saldo-local-ordem">Ordem</label>
              <input
                id="saldo-local-ordem"
                className="input"
                inputMode="numeric"
                value={ordem}
                onChange={(e) => setOrdem(e.target.value)}
              />
            </div>

            <label
              className="field-span-2"
              style={{
                display: 'inline-flex',
                gap: '0.5rem',
                alignItems: 'center',
              }}
            >
              <input
                type="checkbox"
                checked={ativo}
                onChange={(e) => setAtivo(e.target.checked)}
              />
              Exibir no portal
            </label>
          </div>

          <div className="form-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              type="button"
              className="btn btn-soft"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
