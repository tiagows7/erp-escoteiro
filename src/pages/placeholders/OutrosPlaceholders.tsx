import { PlaceholderPage } from '@/pages/PlaceholderPage'

export function EventosPage() {
  return (
    <PlaceholderPage
      title="Eventos"
      description="Agenda e eventos do grupo escoteiro"
      delphiUnit="Eventos"
      planned={[
        'Listagem de eventos',
        'Cadastro de data, local e participantes',
        'Controle de atividades do grupo',
      ]}
    />
  )
}

export function VendasPage() {
  return (
    <PlaceholderPage
      title="Vendas"
      description="Vendas de produtos e serviços"
      delphiUnit="Vendas"
      planned={[
        'Registro de vendas',
        'Integração com estoque',
        'Consulta de histórico',
      ]}
    />
  )
}

export function ProjetosPage() {
  return (
    <PlaceholderPage
      title="Projetos"
      description="Projetos e atividades do grupo"
      delphiUnit="Projetos"
      planned={[
        'Listagem de projetos',
        'Cadastro e acompanhamento',
        'Vínculo com ramos e seções',
      ]}
    />
  )
}
