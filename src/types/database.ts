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
  /** true = provisório; false = definitivo */
  registro_provisorio: boolean | null
  conquista_cruzeiro_do_sul: boolean | null
  conquista_lis_de_ouro: boolean | null
  conquista_escoteiro_patria: boolean | null
  conquista_insignia_bp: boolean | null
  conquista_cruzeiro_do_sul_data: string | null
  conquista_lis_de_ouro_data: string | null
  conquista_escoteiro_patria_data: string | null
  conquista_insignia_bp_data: string | null
  conquista_insignia_madeira: boolean | null
  conquista_insignia_madeira_data: string | null
  lgpd_aceite_em: string | null
  lgpd_aceite_ip: string | null
  lgpd_aceite_por: string | null
  lgpd_aceite_versao: string | null
  lgpd_aceite_texto: string | null
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
  registro: string | null
  /**
   * Rotas de menu liberadas. `null` = acesso padrão do papel.
   * Associados (login por registro) ignoram este campo.
   */
  menu_keys: string[] | null
}

export type Empresa = {
  id: number
  nome: string
  cnpj: string | null
  email: string | null
  slug: string | null
  telefone: string | null
  estado: string | null
  cidade: number | null
  logo_url: string | null
  ativo: boolean | null
  plataforma_plano_id?: number | null
  plataforma_isento?: boolean | null
  /** Dia do mês (1–28) do vencimento da mensalidade da plataforma. */
  plataforma_dia_vencimento?: number | null
  /** Dia do mês (1–28) do vencimento das mensalidades dos associados. */
  dia_vencimento_mensalidade?: number | null
  sicredi_pix_client_id?: string | null
  sicredi_pix_client_secret?: string | null
  sicredi_pix_chave?: string | null
  sicredi_pix_cert?: string | null
  sicredi_pix_key?: string | null
  sicredi_pix_base_url?: string | null
  sicredi_pix_ativo?: boolean | null
}

export type EmpresaRamoPixSicredi = {
  id: number
  empresa_id: number
  ramo_id: number
  sicredi_pix_client_id: string | null
  sicredi_pix_client_secret: string | null
  sicredi_pix_chave: string | null
  sicredi_pix_cert: string | null
  sicredi_pix_key: string | null
  sicredi_pix_base_url: string | null
  sicredi_pix_ativo: boolean
}

/** Conta bancária do grupo (várias por empresa/ramo/seção). */
export type EmpresaContaBancaria = {
  id: number
  empresa_id: number
  ramo_id: number | null
  secao_id: number | null
  descricao: string | null
  banco_nome: string | null
  agencia: string | null
  conta: string | null
  api_client_id: string | null
  api_client_secret?: string | null
  api_pix_chave: string | null
  api_pix_ativo: boolean
  api_pix_cert?: string | null
  api_pix_key?: string | null
  api_pix_base_url: string | null
  /** InfiniteTag (sem $). Null = usa PIX Sicredi da conta. */
  infinitepay_handle: string | null
  has_api_client_secret?: boolean
  has_api_pix_cert?: boolean
  has_api_pix_key?: boolean
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

export type DashboardDetalheRamo = {
  associado_id: number
  nome: string
  registro: number | null
  data_nascimento: string | null
  anos: number
  meses: number
  secao_id?: number | null
  secao_nome: string | null
}

export type DashboardAniversariante = {
  associado_id: number
  nome: string
  registro: number | null
  data_nascimento: string | null
  dia: number
  idade: number
  ramo_nome: string | null
  secao_nome: string | null
  eh_hoje: boolean
}

export type Atividade = {
  atividade_id: number
  empresa_id: number
  ramo: number | null
  secao: number | null
  patrulha_matilha: number | null
  descricao: string
  local: string | null
  valor: number
  data_atividade: string | null
  created_at: string | null
}

export type CalendarioGrupoEvento = {
  id: number
  empresa_id: number
  ramo: number | null
  secao: number | null
  titulo: string
  descricao: string | null
  local: string | null
  data_inicio: string
  data_fim: string | null
  hora_inicio: string | null
  hora_fim: string | null
  created_at: string | null
  updated_at: string | null
}

export type Projeto = {
  projeto_id: number
  empresa_id: number
  ramo: number | null
  secao: number | null
  descricao: string
  valor: number
  encerrado_em: string | null
  created_at: string | null
}

export type AcaoEntreAmigos = {
  acao_id: number
  empresa_id: number
  ramo: number | null
  secao: number | null
  patrulha_matilha: number | null
  nome: string
  numero_inicial: number
  numero_final: number
  valor_numero: number
  data_sorteio: string | null
  data_limite_venda: string | null
  imagem_url: string | null
  encerrado_em: string | null
  quantidade_premios?: number | null
  numero_sorteado: number | null
  numeros_sorteados?: number[] | null
  sorteado_em: string | null
  created_at: string | null
}

export type AcaoEntreAmigosFaixa = {
  faixa_id: number
  empresa_id: number
  acao_id: number
  associado_id: number
  numero_inicial: number
  numero_final: number
  link_token: string
  created_at: string | null
}

export type AcaoEntreAmigosFormaPagamento =
  | 'dinheiro'
  | 'pix_direto'
  | 'pix'

export type AcaoEntreAmigosVenda = {
  venda_id: number
  empresa_id: number
  acao_id: number
  numero: number
  comprador_nome: string
  comprador_telefone: string
  valor: number
  forma_pagamento: AcaoEntreAmigosFormaPagamento | null
  associado_vendedor_id: number | null
  vendido_por: string | null
  pix_cobranca_id: number | null
  vendido_em: string
  created_at: string | null
}

export type VendaEvento = {
  evento_id: number
  empresa_id: number
  ramo: number | null
  secao: number | null
  patrulha_matilha: number | null
  nome: string
  numero_inicial: number
  numero_final: number
  valor_convite: number
  data_evento: string | null
  imagem_url: string | null
  link_token: string
  encerrado_em: string | null
  created_at: string | null
}

export type VendaEventoTipo = {
  tipo_id: number
  empresa_id: number
  evento_id: number
  label: string
  valor: number
  ordem: number
  ativo: boolean
  created_at: string | null
}

export type VendaEventoFormaPagamento =
  | 'dinheiro'
  | 'pix_direto'
  | 'pix'
  | 'infinitepay'

export type VendaEventoCompra = {
  compra_id: number
  empresa_id: number
  evento_id: number
  quantidade: number
  comprador_telefone: string | null
  valor: number
  forma_pagamento: VendaEventoFormaPagamento | null
  vendido_por: string | null
  pix_cobranca_id: number | null
  vendido_em: string
  created_at: string | null
}

export type VendaEventoConvite = {
  convite_id: number
  empresa_id: number
  evento_id: number
  compra_id: number
  numero: number
  nome: string
  tipo_id: number | null
  valor_unitario: number | null
  tipo_label: string | null
  created_at: string | null
}

export type AtividadeConfirmacao = {
  confirmacao_id: number
  empresa_id: number
  atividade_id: number
  associado_id: number
  confirmado_em: string
  created_at: string | null
}

export type AtividadePagamento = {
  pagamento_id: number
  empresa_id: number
  atividade_id: number
  associado_id: number
  valor: number
  pago_em: string
  created_at: string | null
  receita_id: number | null
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
      atividades: {
        Row: Atividade
        Insert: Partial<Atividade>
        Update: Partial<Atividade>
      }
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
      dashboard_detalhe_ramo: {
        Args: { p_ramo: number }
        Returns: DashboardDetalheRamo[]
      }
      dashboard_aniversariantes_mes: {
        Args: { p_mes?: number }
        Returns: DashboardAniversariante[]
      }
    }
  }
}
