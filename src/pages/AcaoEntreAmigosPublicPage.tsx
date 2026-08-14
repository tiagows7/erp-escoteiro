import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertMessage } from '@/components/AlertMessage'
import {
  AcaoNumerosImpressos,
  type NumeroImpressoItem,
} from '@/components/AcaoNumerosImpressos'
import { PixSicrediPublicCheckoutModal } from '@/components/PixSicrediPublicCheckoutModal'
import { numerosDaFaixa } from '@/lib/acaoEntreAmigos'
import {
  fetchAcaoPublicInfo,
  type AcaoPublicInfo,
} from '@/lib/acaoEntreAmigosPublic'
import { formatMoney } from '@/lib/despesas'
import type { PixPublicAcaoInput } from '@/lib/pixSicrediPublic'

export function AcaoEntreAmigosPublicPage() {
  const { token } = useParams()
  const [info, setInfo] = useState<AcaoPublicInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [selectedNumeros, setSelectedNumeros] = useState<number[]>([])
  const [compradorNome, setCompradorNome] = useState('')
  const [compradorTelefone, setCompradorTelefone] = useState('')
  const [pixOpen, setPixOpen] = useState(false)
  const [pixInput, setPixInput] = useState<PixPublicAcaoInput | null>(null)
  const [numerosPagos, setNumerosPagos] = useState<NumeroImpressoItem[]>([])

  const vendidos = useMemo(
    () => new Set(info?.numeros_vendidos ?? []),
    [info],
  )

  const numeros = useMemo(() => {
    if (!info) return []
    return numerosDaFaixa(info.numero_inicial, info.numero_final)
  }, [info])

  async function load() {
    if (!token) {
      setError('Link inválido.')
      setLoading(false)
      return
    }
    setLoading(true)
    const res = await fetchAcaoPublicInfo(token)
    if (res.error || !res.data) {
      setError(res.error ?? 'Link inválido.')
      setInfo(null)
      setLoading(false)
      return
    }
    setInfo(res.data)
    setError(null)
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  function toggleNumero(numero: number) {
    if (vendidos.has(numero) || pixOpen) return
    setSelectedNumeros((prev) => {
      if (prev.includes(numero)) return prev.filter((n) => n !== numero)
      return [...prev, numero].sort((a, b) => a - b)
    })
    setError(null)
    setSuccess(null)
    setNumerosPagos([])
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!token || !info || selectedNumeros.length === 0) return
    if (info.encerrado) {
      setError('Esta ação entre amigos está encerrada.')
      return
    }
    if (!compradorNome.trim()) {
      setError('Informe o seu nome.')
      return
    }
    if (!compradorTelefone.trim()) {
      setError('Informe o seu telefone.')
      return
    }

    const valorUnitario = Number(info.valor_numero ?? 0)
    if (!Number.isFinite(valorUnitario) || valorUnitario <= 0) {
      setError('Esta ação ainda não tem valor de número configurado.')
      return
    }

    const valor =
      Math.round(valorUnitario * selectedNumeros.length * 100) / 100

    setError(null)
    setSuccess(null)
    setNumerosPagos([])
    setPixInput({
      linkToken: token,
      numeros: selectedNumeros,
      compradorNome: compradorNome.trim(),
      compradorTelefone: compradorTelefone.trim(),
      valor,
      descricao: `${info.acao_nome} · nº ${selectedNumeros.join(', ')}`,
    })
    setPixOpen(true)
  }

  if (loading) {
    return (
      <div className="public-rifa-page">
        <div className="loading">Carregando rifa…</div>
      </div>
    )
  }

  if (!info) {
    return (
      <div className="public-rifa-page">
        <section className="panel">
          <AlertMessage tone="error" title="Link inválido">
            {error ?? 'Este link de venda não está disponível.'}
          </AlertMessage>
          <Link className="btn btn-soft" to="/login">
            Ir para o login
          </Link>
        </section>
      </div>
    )
  }

  const valorUnitario = Number(info.valor_numero ?? 0)
  const total = selectedNumeros.length * valorUnitario
  const vendidosCount = numeros.filter((n) => vendidos.has(n)).length

  return (
    <div className="public-rifa-page">
      <header className="public-rifa-header">
        <p className="muted">{info.empresa_nome}</p>
        <h1>
          {info.acao_nome}{' '}
          {info.encerrado ? (
            <span className="badge badge-danger">Encerrado</span>
          ) : null}
        </h1>
        <p>
          Vendedor: <strong>{info.vendedor_nome}</strong> ·{' '}
          {formatMoney(valorUnitario)} por número
          {info.data_limite_venda
            ? ` · vendas até ${(() => {
                const [y, m, d] = String(info.data_limite_venda)
                  .slice(0, 10)
                  .split('-')
                return y && m && d ? `${d}/${m}/${y}` : info.data_limite_venda
              })()}`
            : ''}
          {info.data_sorteio
            ? ` · sorteio ${(() => {
                const [y, m, d] = String(info.data_sorteio)
                  .slice(0, 10)
                  .split('-')
                return y && m && d ? `${d}/${m}/${y}` : info.data_sorteio
              })()}`
            : ''}
          {info.numero_sorteado != null
            ? ` · ganhador nº ${info.numero_sorteado}`
            : ''}
        </p>
      </header>

      {error ? (
        <AlertMessage tone="error" title="Atenção">
          {error}
        </AlertMessage>
      ) : null}
      {info.numero_sorteado != null ? (
        <AlertMessage tone="success" title="Sorteio realizado">
          Número sorteado: <strong>{info.numero_sorteado}</strong>
        </AlertMessage>
      ) : null}
      {info.encerrado ? (
        <AlertMessage tone="info" title="Vendas encerradas">
          Este link não aceita mais compras.
        </AlertMessage>
      ) : null}
      {success ? (
        <AlertMessage tone="success" title="Pronto!">
          {success}
        </AlertMessage>
      ) : null}

      {numerosPagos.length > 0 ? (
        <section className="panel">
          <AcaoNumerosImpressos
            acaoNome={info.acao_nome}
            empresaNome={info.empresa_nome}
            dataSorteio={info.data_sorteio}
            imagemUrl={info.imagem_url}
            numeros={numerosPagos}
          />
        </section>
      ) : null}

      <section className="panel">
        <div
          className={`acao-venda-layout ${info.imagem_url ? 'has-imagem' : ''}`}
        >
          {info.imagem_url ? (
            <div className="acao-imagem-side">
              <img
                className="acao-imagem-banner"
                src={info.imagem_url}
                alt={`Imagem da ação ${info.acao_nome}`}
              />
            </div>
          ) : null}
          <div className="acao-venda-numeros">
            <p className="muted" style={{ marginTop: 0 }}>
              {vendidosCount} de {numeros.length} número(s) já vendido(s).
              {!info.encerrado
                ? ' Selecione os números, informe seus dados e pague via PIX para confirmar.'
                : ''}
            </p>
            {!info.encerrado && selectedNumeros.length > 0 ? (
              <p className="field-hint">
                Selecionados: {selectedNumeros.join(', ')}
              </p>
            ) : null}
            <div className="acao-numeros-grid">
              {numeros.map((numero) => {
                const sold = vendidos.has(numero)
                const selected = selectedNumeros.includes(numero)
                return (
                  <button
                    key={numero}
                    type="button"
                    className={`acao-numero-btn ${sold ? 'is-sold' : ''} ${
                      selected ? 'is-selected' : ''
                    }`}
                    disabled={sold || pixOpen || info.encerrado}
                    onClick={() => toggleNumero(numero)}
                  >
                    {numero}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {!info.encerrado && selectedNumeros.length > 0 ? (
        <section className="panel">
          <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>
            {selectedNumeros.length === 1
              ? `Pagar número ${selectedNumeros[0]}`
              : `Pagar ${selectedNumeros.length} números`}
          </h2>
          <p className="muted">
            Total: {formatMoney(total)} ({formatMoney(valorUnitario)} cada) ·
            pagamento via PIX do ramo
          </p>
          <form
            className="form-grid form-grid-2"
            onSubmit={(e) => onSubmit(e)}
          >
            <div className="field">
              <label htmlFor="nome">Seu nome</label>
              <input
                id="nome"
                className="input"
                value={compradorNome}
                onChange={(e) => setCompradorNome(e.target.value)}
                disabled={pixOpen}
                required
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="telefone">Seu telefone</label>
              <input
                id="telefone"
                className="input"
                value={compradorTelefone}
                onChange={(e) => setCompradorTelefone(e.target.value)}
                disabled={pixOpen}
                required
                inputMode="tel"
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="form-actions field-span-2">
              <button
                className="btn btn-primary"
                type="submit"
                disabled={pixOpen}
              >
                Pagar com PIX
              </button>
              <button
                type="button"
                className="btn btn-soft"
                disabled={pixOpen}
                onClick={() => setSelectedNumeros([])}
              >
                Limpar seleção
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <PixSicrediPublicCheckoutModal
        open={pixOpen}
        title="Pagamento PIX"
        input={pixInput}
        onClose={() => {
          setPixOpen(false)
          setPixInput(null)
        }}
        onPaid={() => {
          const nome = (pixInput?.compradorNome ?? compradorNome).trim()
          const nums = pixInput?.numeros?.length
            ? [...pixInput.numeros]
            : [...selectedNumeros]
          if (nums.length > 0) {
            setNumerosPagos(
              nums.map((numero) => ({
                numero,
                nome: nome || 'Comprador',
              })),
            )
          }
          setSuccess('Pagamento confirmado! Seus números foram registrados.')
          setSelectedNumeros([])
          setCompradorNome('')
          setCompradorTelefone('')
          setPixOpen(false)
          setPixInput(null)
          void load()
        }}
      />
    </div>
  )
}
