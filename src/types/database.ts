import type { AppRole } from '@/lib/roles'

export type Associado = {
  associado_id: number
  empresa_id: number
  registro: number | null
  registro_identificador: number | null
  nome: string
  endereco_cep: string | null
  endereco: string | null
  endereco_numero: string | null
  endereco_complemento: string | null
  endereco_bairro: string | null
  endereco_cidade: number | null
  endereco_uf: string | null
  categoria: number | null
  categoria2: number | null
  ramo: number | null
  secao: number | null
  funcao: number | null
  patrulha_matilha: number | null
  fone_residencial: string | null
  celular: string | null
  email: string | null
  rg: string | null
  cpf: string | null
  data_nascimento: string | null
  responsavel_nome: string | null
  responsavel_foneresi: string | null
  responsavel_fonecelular: string | null
  responsavel_email: string | null
  responsavel_cpf: string | null
  ativo: boolean | null
  isento: boolean | null
  tipo_mensalidade: number | null
  validade_registro: string | null
}

export type Profile = {
  id: string
  empresa_id: number | null
  nome: string
  username: string | null
  email: string | null
  /** Legado Delphi — preferir `role` */
  tipo: string | null
  role: AppRole
  ativo: boolean
  codigo_ramo: number | null
  codigo_secao: number | null
  codigo_secao_nome: number | null
}

export type Empresa = {
  id: number
  nome: string
  cnpj: string | null
  email: string | null
  slug: string | null
  telefone: string | null
  logo_url: string | null
  ativo: boolean | null
}

export type Ramo = {
  ramo_id: number
  nome: string
  idade_inicio: number | null
  idade_fim: number | null
}

export type DashboardRamo = {
  ramo_id: number
  ramo_nome: string
  total: number
}

export type DashboardPassagemRamo = {
  ramo_id: number
  ramo_nome: string
  ano_ini: number
  ano_fim: number
  total_passagem: number
}

export type DashboardDetalhePassagem = {
  tipo: 'chegada' | 'saida' | string
  associado_id: number
  nome: string
  data_nascimento: string | null
  anos: number
  meses: number
}

export type Database = {
  public: {
    Tables: {
      associados: {
        Row: Associado
        Insert: Partial<Associado>
        Update: Partial<Associado>
      }
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> }
      empresa: { Row: Empresa; Insert: Partial<Empresa>; Update: Partial<Empresa> }
      ramos: { Row: Ramo; Insert: Partial<Ramo>; Update: Partial<Ramo> }
    }
    Functions: {
      dashboard_contagem_ramos: {
        Args: Record<string, never>
        Returns: DashboardRamo[]
      }
      dashboard_passagens_ramo: {
        Args: Record<string, never>
        Returns: DashboardPassagemRamo[]
      }
      dashboard_detalhe_passagem: {
        Args: { p_ramo: number }
        Returns: DashboardDetalhePassagem[]
      }
    }
  }
}
