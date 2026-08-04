import { LegalDocumentLayout } from '@/components/LegalDocumentLayout'

const UPDATED_AT = '03/08/2026'
const DPO_EMAIL = 'tiagows7@gmail.com'

export function PrivacidadePage() {
  return (
    <LegalDocumentLayout
      title="Política de Privacidade"
      updatedAt={UPDATED_AT}
    >
      <p>
        O ERP Escoteiro valoriza a privacidade e a segurança das informações de
        seus membros. Esta Política explica, de forma clara e transparente, como
        coletamos, usamos, armazenamos e protegemos os seus dados pessoais, em
        total conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº
        13.709/2018).
      </p>

      <h2>1. Dados Coletados e Finalidades</h2>
      <p>
        Para que o web app cumpra suas funções de gerenciamento, coletamos os
        seguintes dados:
      </p>
      <ul>
        <li>
          <strong>Dados do Associado (jovens e adultos):</strong> nome completo,
          data de nascimento, gênero, registro escoteiro, foto de perfil,
          restrições médicas/alimentares e contatos de emergência.
          <br />
          <em>Finalidade:</em> identificação do membro, garantia de segurança em
          atividades de campo e divisão por ramos escoteiros.
        </li>
        <li>
          <strong>Dados do responsável legal (para menores):</strong> nome, CPF,
          e-mail, telefone e grau de parentesco.
          <br />
          <em>Finalidade:</em> obtenção de consentimento legal e comunicação
          direta.
        </li>
        <li>
          <strong>Dados de eventos:</strong> presença em reuniões, acampamentos e
          status de pagamento de taxas.
          <br />
          <em>Finalidade:</em> logística de transporte, alimentação e emissão de
          certificados.
        </li>
        <li>
          <strong>Dados financeiros:</strong> registros de mensalidades,
          doações, compras de materiais e reembolsos.
          <br />
          <em>Finalidade:</em> transparência contábil e auditoria interna do
          Grupo Escoteiro.
        </li>
      </ul>

      <h2>2. Tratamento de Dados de Menores de Idade</h2>
      <p>
        De acordo com o Artigo 14 da LGPD, o tratamento de dados de crianças
        (até 12 anos incompletos) exige o consentimento específico e em destaque
        dado por pelo menos um dos pais ou pelo responsável legal. O web app
        disponibilizará travas de validação para garantir que esse consentimento
        seja registrado eletronicamente no primeiro acesso.
      </p>

      <h2>3. Compartilhamento de Dados</h2>
      <p>
        Os dados dos associados são de uso estritamente interno do Grupo
        Escoteiro. Eles não são vendidos, alugados ou compartilhados com fins
        comerciais. O compartilhamento ocorre apenas:
      </p>
      <ul>
        <li>
          Com a União dos Escoteiros do Brasil (UEB) para fins de registro
          oficial e seguros.
        </li>
        <li>
          Com equipes médicas ou autoridades em caso de emergência durante
          acampamentos.
        </li>
        <li>Por obrigação legal ou ordem judicial.</li>
      </ul>

      <h2>4. Armazenamento e Segurança dos Dados</h2>
      <p>
        Os dados são armazenados em servidores de nuvem confiáveis, que utilizam
        criptografia em repouso e em trânsito (HTTPS).
      </p>
      <p>
        O acesso às informações financeiras e cadastrais completas é restrito
        exclusivamente à Diretoria do Grupo e chefes de seção autorizados.
      </p>

      <h2>5. Seus Direitos (Artigo 18 da LGPD)</h2>
      <p>
        O associado (ou seu responsável legal) pode, a qualquer momento,
        solicitar através dos canais oficiais do Grupo:
      </p>
      <ul>
        <li>Confirmação da existência e acesso aos dados armazenados.</li>
        <li>Correção de dados incompletos ou desatualizados.</li>
        <li>
          Eliminação dos dados pessoais (ressalvados os dados de guarda
          obrigatória por lei ou estatuto scout).
        </li>
      </ul>

      <h2>6. Contato e Encarregado de Dados (DPO)</h2>
      <p>
        Para exercer seus direitos ou tirar dúvidas sobre esta política, entre
        em contato com nosso Encarregado pelo Tratamento de Dados Pessoais
        através do e-mail:{' '}
        <a href={`mailto:${DPO_EMAIL}`}>{DPO_EMAIL}</a>.
      </p>
    </LegalDocumentLayout>
  )
}
