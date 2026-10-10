import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { AlertMessage } from '@/components/AlertMessage'
import { useToast } from '@/contexts/ToastContext'
import {
  formatMoney,
  formatMoneyInput,
  maskMoneyInput,
  parseMoneyInput,
} from '@/lib/despesas'
import { PORTAL_CAIXAS, type PortalCaixaId } from '@/lib/portal'
import { supabase } from '@/lib/supabase'
import type { Ramo } from '@/types/database'

function todayIso(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export type SaldoLocalRow = {
  id: number
  empresa_id: number
  caixa_id: number
  secao_id: number | null
  nome: string
  valor: number
  data_saldo: string
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
  onSaved: (row: SaldoLocalRow, opts?: { silent?: boolean }) => void
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
  const [dataSaldo, setDataSaldo] = useState(todayIso)
  const [ordem, setOrdem] = useState('0')
  const [ativo, setAtivo] = useState(true)
  const [localId, setLocalId] = useState<number | null>(editing?.id ?? null)
  const [temMovimentos, setTemMovimentos] = useState(false)
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
      setDataSaldo((editing.data_saldo ?? '').slice(0, 10) || todayIso())
      setOrdem(String(editing.ordem ?? 0))
      setAtivo(editing.ativo !== false)
    } else {
      setNome('')
      setCaixaId(0)
      setSecaoId('')
      setValor('0,00')
      setDataSaldo(todayIso())
      setOrdem('0')
      setAtivo(true)
    }
    setError(null)
  }, [editing])

  useEffect(() => {
    setLocalId(editing?.id ?? null)
    setTemMovimentos(false)
  }, [editing?.id])

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
    if (!dataSaldo) {
      setError('Informe a data do saldo.')
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
      data_saldo: dataSaldo,
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
          'id, empresa_id, caixa_id, secao_id, nome, valor, data_saldo, ordem, ativo',
        )
        .single()

      setSaving(false)
      if (updError || !data) {
        setError(updError?.message ?? 'Não foi possível atualizar.')
        return
      }
      onSaved(data as SaldoLocalRow)
      return
    }

    const { data, error: insError } = await supabase
      .from('empresa_saldo_local')
      .insert(payload)
      .select('id, empresa_id, caixa_id, secao_id, nome, valor, data_saldo, ordem, ativo')
      .single()

    setSaving(false)
    if (insError || !data) {
      setError(insError?.message ?? 'Não foi possível cadastrar.')
      return
    }
    onSaved(data as SaldoLocalRow)
    setLocalId(data.id)
  }

  return (
    <div className="confirm-overlay" role="presentation" onClick={onClose}>
      <div
        className="passagem-dialog conta-bancaria-dialog saldo-local-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="saldo-local-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="passagem-dialog-header">
          <div>
            <h3 id="saldo-local-modal-title">
              {localId ? 'Local do saldo' : 'Novo local do saldo'}
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
              <label htmlFor="saldo-local-data">Data do saldo</label>
              <input
                id="saldo-local-data"
                className="input"
                type="date"
                value={dataSaldo}
                onChange={(e) => setDataSaldo(e.target.value)}
                required
                disabled={temMovimentos}
              />
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
                disabled={temMovimentos}
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
          {temMovimentos ? (
            <p className="field-hint">
              A data e o valor deste local acompanham o saldo final do último
              movimento.
            </p>
          ) : null}

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
              Fechar
            </button>
          </div>
        </form>

        {localId ? (
          <SaldoLocalMovimentos
            empresaId={empresaId}
            localId={localId}
            onCount={setTemMovimentos}
            onLocalAtualizado={(row) => {
              setValor(formatMoneyInput(row.valor))
              setDataSaldo((row.data_saldo ?? '').slice(0, 10))
              onSaved(row, { silent: true })
            }}
          />
        ) : (
          <p className="field-hint">
            Salve o local para lançar os movimentos por data.
          </p>
        )}
      </div>
    </div>
  )
}

const MOVIMENTO_SELECT =
  'id, data_movimento, valor_aplicado, valor_resgatado, valor_creditos, valor_debitos, saldo_final'

type MovimentoRow = {
  id: number
  data_movimento: string
  valor_aplicado: number
  valor_resgatado: number
  valor_creditos: number
  valor_debitos: number
  saldo_final: number
}

function formatDataMovimento(value: string | null | undefined): string {
  if (!value) return '—'
  const [ano, mes, dia] = value.slice(0, 10).split('-')
  if (!ano || !mes || !dia) return value
  return `${dia}/${mes}/${ano}`
}

function SaldoLocalMovimentos({
  empresaId,
  localId,
  onCount,
  onLocalAtualizado,
}: {
  empresaId: number
  localId: number
  onCount: (tem: boolean) => void
  onLocalAtualizado: (row: SaldoLocalRow) => void
}) {
  const toast = useToast()
  const [rows, setRows] = useState<MovimentoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [dataMovimento, setDataMovimento] = useState(todayIso)
  const [aplicado, setAplicado] = useState('0,00')
  const [resgatado, setResgatado] = useState('0,00')
  const [creditos, setCreditos] = useState('0,00')
  const [debitos, setDebitos] = useState('0,00')

  const carregar = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from('empresa_saldo_local_movimento')
      .select(MOVIMENTO_SELECT)
      .eq('local_id', localId)
      .eq('empresa_id', empresaId)
      .order('data_movimento', { ascending: true })
    if (queryError) {
      setError(queryError.message)
      setRows([])
      onCount(false)
    } else {
      const lista = (data ?? []) as MovimentoRow[]
      setRows(lista)
      onCount(lista.length > 0)
      setError(null)
    }
    setLoading(false)
  }, [empresaId, localId, onCount])

  useEffect(() => {
    setLoading(true)
    void carregar()
  }, [carregar])

  function limpar() {
    setEditId(null)
    setDataMovimento(todayIso())
    setAplicado('0,00')
    setResgatado('0,00')
    setCreditos('0,00')
    setDebitos('0,00')
  }

  function preencher(row: MovimentoRow) {
    setEditId(row.id)
    setDataMovimento(row.data_movimento.slice(0, 10))
    setAplicado(formatMoneyInput(row.valor_aplicado))
    setResgatado(formatMoneyInput(row.valor_resgatado))
    setCreditos(formatMoneyInput(row.valor_creditos))
    setDebitos(formatMoneyInput(row.valor_debitos))
    setError(null)
  }

  async function sincronizarLocal() {
    const { data } = await supabase
      .from('empresa_saldo_local')
      .select(
        'id, empresa_id, caixa_id, secao_id, nome, valor, data_saldo, ordem, ativo',
      )
      .eq('id', localId)
      .eq('empresa_id', empresaId)
      .maybeSingle()
    if (data) onLocalAtualizado(data as SaldoLocalRow)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!dataMovimento) {
      setError('Informe a data do movimento.')
      return
    }
    const valores = [aplicado, resgatado, creditos, debitos].map(parseMoneyInput)
    if (valores.some((n) => !Number.isFinite(n) || n < 0)) {
      setError('Os valores do movimento não podem ser negativos.')
      return
    }
    setSaving(true)
    setError(null)
    const payload = {
      empresa_id: empresaId,
      local_id: localId,
      data_movimento: dataMovimento,
      valor_aplicado: valores[0],
      valor_resgatado: valores[1],
      valor_creditos: valores[2],
      valor_debitos: valores[3],
      updated_at: new Date().toISOString(),
    }
    const query = editId
      ? supabase
          .from('empresa_saldo_local_movimento')
          .update(payload)
          .eq('id', editId)
          .eq('empresa_id', empresaId)
      : supabase.from('empresa_saldo_local_movimento').insert(payload)
    const { error: saveError } = await query
    setSaving(false)
    if (saveError) {
      setError(
        saveError.code === '23505'
          ? 'Já existe um movimento nesta data.'
          : saveError.message,
      )
      return
    }
    const atualizando = editId != null
    limpar()
    await carregar()
    await sincronizarLocal()
    toast.success(atualizando ? 'Movimento atualizado.' : 'Movimento lançado.')
  }

  async function excluir(row: MovimentoRow) {
    const ok = await toast.confirm({
      title: 'Excluir movimento?',
      message: `O lançamento de ${formatDataMovimento(row.data_movimento)} será excluído e os saldos seguintes serão recalculados.`,
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return
    setSaving(true)
    const { error: delError } = await supabase
      .from('empresa_saldo_local_movimento')
      .delete()
      .eq('id', row.id)
      .eq('empresa_id', empresaId)
    setSaving(false)
    if (delError) {
      setError(delError.message)
      return
    }
    if (editId === row.id) limpar()
    await carregar()
    await sincronizarLocal()
    toast.success('Movimento excluído.')
  }

  return (
    <section style={{ marginTop: '1.25rem' }}>
      <h4 style={{ margin: '0 0 0.35rem' }}>Movimentos</h4>
      <p className="field-hint" style={{ marginTop: 0 }}>
        Um lançamento por data. O saldo final é o saldo anterior mais o
        aplicado, menos o resgatado, mais os créditos e menos os débitos.
      </p>
      {error ? (
        <AlertMessage tone="error" title="Atenção">
          {error}
        </AlertMessage>
      ) : null}
      <form onSubmit={(e) => void onSubmit(e)}>
        <div className="form-grid form-grid-2">
          <div className="field">
            <label htmlFor="mov-data">Data</label>
            <input
              id="mov-data"
              className="input"
              type="date"
              value={dataMovimento}
              onChange={(e) => setDataMovimento(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="mov-aplicado">Valor aplicado</label>
            <input
              id="mov-aplicado"
              className="input"
              inputMode="decimal"
              value={aplicado}
              onChange={(e) => setAplicado(maskMoneyInput(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="mov-resgatado">Valor resgatado</label>
            <input
              id="mov-resgatado"
              className="input"
              inputMode="decimal"
              value={resgatado}
              onChange={(e) => setResgatado(maskMoneyInput(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="mov-creditos">Valor créditos</label>
            <input
              id="mov-creditos"
              className="input"
              inputMode="decimal"
              value={creditos}
              onChange={(e) => setCreditos(maskMoneyInput(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="mov-debitos">Valor débitos</label>
            <input
              id="mov-debitos"
              className="input"
              inputMode="decimal"
              value={debitos}
              onChange={(e) => setDebitos(maskMoneyInput(e.target.value))}
            />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving
              ? 'Salvando…'
              : editId
                ? 'Atualizar movimento'
                : 'Lançar movimento'}
          </button>
          {editId ? (
            <button
              type="button"
              className="btn btn-soft"
              disabled={saving}
              onClick={limpar}
            >
              Cancelar edição
            </button>
          ) : null}
        </div>
      </form>
      {loading ? (
        <div className="loading">Carregando movimentos…</div>
      ) : rows.length === 0 ? (
        <div className="empty">Nenhum movimento lançado.</div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Data</th>
                <th>Aplicado</th>
                <th>Resgatado</th>
                <th>Créditos</th>
                <th>Débitos</th>
                <th>Saldo final</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDataMovimento(row.data_movimento)}</td>
                  <td>{formatMoney(row.valor_aplicado)}</td>
                  <td>{formatMoney(row.valor_resgatado)}</td>
                  <td>{formatMoney(row.valor_creditos)}</td>
                  <td>{formatMoney(row.valor_debitos)}</td>
                  <td>{formatMoney(row.saldo_final)}</td>
                  <td>
                    <div className="atividades-row-actions">
                      <button
                        type="button"
                        className="btn btn-soft"
                        disabled={saving}
                        onClick={() => preencher(row)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        disabled={saving}
                        onClick={() => void excluir(row)}
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
