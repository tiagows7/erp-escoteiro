import { PlaceholderPage } from '@/pages/PlaceholderPage'

export function GrupoProdutosPage() {
  return (
    <PlaceholderPage
      title="Grupo de Produtos"
      description="Categorias de produtos do estoque"
      delphiUnit="unit_grupoprodutocons.pas"
      planned={[
        'Listagem de grupos de produtos',
        'Cadastro e edição',
        'Organização dos produtos por grupo',
      ]}
    />
  )
}

export function ProdutosPage() {
  return (
    <PlaceholderPage
      title="Produtos"
      description="Cadastro de produtos e saldos do estoque"
      delphiUnit="unit_cadastroprodutocons.pas"
      planned={[
        'Listagem de produtos',
        'Cadastro com grupo, custo e preço',
        'Consulta de saldo',
      ]}
    />
  )
}

export function EntradaEstoquePage() {
  return (
    <PlaceholderPage
      title="Entrada de Estoque"
      description="Movimentações de entrada no estoque"
      delphiUnit="unit_entradaestoquecons.pas"
      planned={[
        'Lançamento de entradas',
        'Seleção de produtos e quantidades',
        'Histórico de movimentações',
      ]}
    />
  )
}
