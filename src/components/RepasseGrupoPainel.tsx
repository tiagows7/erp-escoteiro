import type { ReactNode } from 'react'
import { formatMoney } from '@/lib/despesas'
import {
  valorGrupoTipoLabel,
  type ValorGrupoTipo,
} from '@/lib/repasseGrupo'

type CamposProps = {
  tipo: ValorGrupoTipo
  valor: string
  disabled?: boolean
  onTipo: (tipo: ValorGrupoTipo) => void
  onValor: (valor: string) => void
}

export function RepasseGrupoCampos({
  tipo,
  valor,
  disabled,
  onTipo,
  onValor,
}: CamposProps) {
  const percentual = tipo === 'percentual'
  return (
    <>
      <div className="field">
        <label htmlFor="valor_grupo_tipo">Repasse ao grupo</label>
        <select
          id="valor_grupo_tipo"
          className="select"
          value={tipo}
          disabled={disabled}
          onChange={(e) =>
            onTipo(e.target.value === 'percentual' ? 'percentual' : 'por_jovem')
          }
        >
          <option value="por_jovem">Valor por jovem</option>
          <option value="percentual">Percentual</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="valor_grupo">
          {percentual ? 'Percentual do grupo (%)' : 'Valor por jovem'}
        </label>
        <input
          id="valor_grupo"
          className="input"
          inputMode="decimal"
          value={valor}
          disabled={disabled}
          onChange={(e) => onValor(e.target.value)}
        />
        <span className="field-hint">
          {percentual
            ? 'Percentual sobre o valor já recebido. O repasse é fixado ao encerrar.'
            : 'Valor em reais por jovem. O repasse é fixado ao encerrar.'}
        </span>
      </div>
    </>
  )
}

type PainelProps = {
  encerrado: boolean
  tipo: ValorGrupoTipo
  valorConfigurado: number
  repasse: number
  jovens: number
  base: number
  jovensLabel: string
  acao?: ReactNode
}

export function RepasseGrupoPainel({
  encerrado,
  tipo,
  valorConfigurado,
  repasse,
  jovens,
  base,
  jovensLabel,
  acao,
}: PainelProps) {
  return (
    <section className="panel" style={{ marginTop: '1rem' }}>
      <h3 style={{ marginTop: 0 }}>
        {encerrado
          ? 'Repasse ao grupo escoteiro'
          : 'Previsão de repasse ao grupo'}
      </h3>
      <div className="atividade-contas-grid">
        <div>
          <span className="muted">Forma</span>
          <strong>{valorGrupoTipoLabel(tipo)}</strong>
        </div>
        <div>
          <span className="muted">
            {tipo === 'percentual' ? 'Percentual' : 'Por jovem'}
          </span>
          <strong>
            {tipo === 'percentual'
              ? `${valorConfigurado.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
              : formatMoney(valorConfigurado)}
          </strong>
        </div>
        <div>
          <span className="muted">{jovensLabel}</span>
          <strong>{jovens}</strong>
        </div>
        {tipo === 'percentual' ? (
          <div>
            <span className="muted">Base recebida</span>
            <strong>{formatMoney(base)}</strong>
          </div>
        ) : null}
      </div>
      <div className="atividade-contas-saldo atividade-contas-saldo--ok">
        <div>
          <span className="muted">Valor a repassar</span>
          <strong>{formatMoney(repasse)}</strong>
        </div>
        <p>
          {encerrado
            ? 'Valor calculado no encerramento.'
            : 'Será gravado quando encerrar.'}
        </p>
      </div>
      {acao ? <div style={{ marginTop: '0.85rem' }}>{acao}</div> : null}
    </section>
  )
}
