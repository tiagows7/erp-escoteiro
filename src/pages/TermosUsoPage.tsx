import { LegalDocumentLayout } from '@/components/LegalDocumentLayout'

const UPDATED_AT = '03/08/2026'

export function TermosUsoPage() {
  return (
    <LegalDocumentLayout title="Termos de Uso" updatedAt={UPDATED_AT}>
      <p>
        Seja bem-vindo ao web app ERP Escoteiro. Estes Termos de Uso regulam o
        acesso e a utilização do aplicativo voltado à gestão de associados,
        eventos e finanças do Grupo. Ao acessar ou utilizar a plataforma, você
        concorda integralmente com as regras descritas abaixo.
      </p>

      <h2>1. Objeto da Plataforma</h2>
      <p>
        O web app é uma ferramenta de uso restrito e exclusivo para:
      </p>
      <ul>
        <li>
          Gerenciamento de cadastro de associados (jovens e adultos
          voluntários).
        </li>
        <li>
          Controle financeiro interno (receitas e despesas do Grupo).
        </li>
        <li>
          Organização, planejamento e inscrições em eventos e atividades
          escoteiras.
        </li>
      </ul>

      <h2>2. Elegibilidade e Cadastro de Menores</h2>
      <p>
        <strong>Contas de Menores de Idade:</strong> o cadastro de associados
        menores de 18 anos deve ser obrigatoriamente realizado ou autorizado de
        forma expressa por seu responsável legal.
      </p>
      <p>
        <strong>Segurança da Conta:</strong> o usuário é responsável por manter
        o sigilo de suas credenciais de acesso (login e senha). Qualquer
        atividade realizada na conta será de responsabilidade do titular ou do
        seu responsável legal.
      </p>

      <h2>3. Responsabilidades do Usuário</h2>
      <p>Ao utilizar a plataforma, o usuário se compromete a:</p>
      <ul>
        <li>Inserir dados estritamente verdadeiros, exatos e atualizados.</li>
        <li>
          Não utilizar o sistema para fins comerciais alheios ao Movimento
          Escoteiro.
        </li>
        <li>
          Não tentar burlar os mecanismos de segurança ou extrair dados em massa
          (scraping).
        </li>
      </ul>

      <h2>4. Controle Financeiro (Receitas e Despesas)</h2>
      <p>
        Os dados inseridos no módulo financeiro servem exclusivamente para fins
        de transparência e prestação de contas interna do Grupo.
      </p>
      <p>
        O web app não funciona como uma instituição bancária ou carteira
        digital, apenas como um livro de registro contábil e gerencial.
      </p>

      <h2>5. Propriedade Intelectual</h2>
      <p>
        Toda a interface, códigos, marcas e identidade visual do web app são de
        propriedade exclusiva do Grupo Escoteiro ou de seus desenvolvedores
        voluntários. É proibida a reprodução ou distribuição do sistema sem
        autorização.
      </p>

      <h2>6. Limitação de Responsabilidade</h2>
      <p>
        O Grupo Escoteiro empenha-se em manter a plataforma segura e operacional.
        Contudo, não se responsabiliza por:
      </p>
      <ul>
        <li>
          Interrupções temporárias decorrentes de falhas de internet ou
          manutenção técnica.
        </li>
        <li>
          Danos causados por vírus ou invasões cibernéticas que fujam ao padrão
          razoável de segurança digital.
        </li>
      </ul>

      <h2>7. Alterações nos Termos e Foro</h2>
      <p>
        Estes termos podem ser atualizados a qualquer momento. Mudanças
        significativas serão notificadas na tela inicial do app. Fica eleito o
        foro da comarca de Guajará-Mirim/RO para dirimir quaisquer dúvidas.
      </p>
    </LegalDocumentLayout>
  )
}
