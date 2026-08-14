import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { AppLayout } from '@/components/AppLayout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { RequirePermission } from '@/components/RequirePermission'
import { LoginPage } from '@/pages/LoginPage'
import { TermosUsoPage } from '@/pages/TermosUsoPage'
import { PrivacidadePage } from '@/pages/PrivacidadePage'
import { DashboardPage } from '@/pages/DashboardPage'
import { AssociadosPage } from '@/pages/AssociadosPage'
import { AssociadoFormPage } from '@/pages/AssociadoFormPage'
import { GruposPage } from '@/pages/GruposPage'
import { GrupoFormPage } from '@/pages/GrupoFormPage'
import { SecoesPage } from '@/pages/SecoesPage'
import { SecaoFormPage } from '@/pages/SecaoFormPage'
import { PatrulhasPage } from '@/pages/PatrulhasPage'
import { PatrulhaFormPage } from '@/pages/PatrulhaFormPage'
import {
  EventosPage,
} from '@/pages/placeholders'
import { GrupoProdutoPage } from '@/pages/GrupoProdutoPage'
import { GrupoProdutoFormPage } from '@/pages/GrupoProdutoFormPage'
import { ProdutoPage } from '@/pages/ProdutoPage'
import { ProdutoFormPage } from '@/pages/ProdutoFormPage'
import { ProdutoFichaPage } from '@/pages/ProdutoFichaPage'
import { AcertoEstoquePage } from '@/pages/AcertoEstoquePage'
import { AcertoEstoqueFormPage } from '@/pages/AcertoEstoqueFormPage'
import { ProjetosPage } from '@/pages/ProjetosPage'
import { ProjetoFormPage } from '@/pages/ProjetoFormPage'
import { AcaoEntreAmigosPage } from '@/pages/AcaoEntreAmigosPage'
import { AcaoEntreAmigosFormPage } from '@/pages/AcaoEntreAmigosFormPage'
import { AcaoEntreAmigosVendaPage } from '@/pages/AcaoEntreAmigosVendaPage'
import { AcaoEntreAmigosPublicPage } from '@/pages/AcaoEntreAmigosPublicPage'
import { VendaEventosPage } from '@/pages/VendaEventosPage'
import { VendaEventoFormPage } from '@/pages/VendaEventoFormPage'
import { VendaEventoVendaPage } from '@/pages/VendaEventoVendaPage'
import { VendaEventoPublicPage } from '@/pages/VendaEventoPublicPage'
import { LojaPage } from '@/pages/LojaPage'
import { LojaCaixaPage } from '@/pages/LojaCaixaPage'
import { UsuariosPage } from '@/pages/UsuariosPage'
import { UsuarioFormPage } from '@/pages/UsuarioFormPage'
import { FornecedoresPage } from '@/pages/FornecedoresPage'
import { FornecedorFormPage } from '@/pages/FornecedorFormPage'
import { CalendarioGrupoPage } from '@/pages/CalendarioGrupoPage'
import { HomeRedirectPage } from '@/pages/HomeRedirectPage'
import { TipoMensalidadePage } from '@/pages/TipoMensalidadePage'
import { TipoMensalidadeFormPage } from '@/pages/TipoMensalidadeFormPage'
import { TipoPagamentoPage } from '@/pages/TipoPagamentoPage'
import { TipoPagamentoFormPage } from '@/pages/TipoPagamentoFormPage'
import { DespesasInclusaoPage } from '@/pages/DespesasInclusaoPage'
import { DespesaFormPage } from '@/pages/DespesaFormPage'
import { DespesasPagamentoPage } from '@/pages/DespesasPagamentoPage'
import { DespesaPagamentoFormPage } from '@/pages/DespesaPagamentoFormPage'
import { DespesasRelatorioPage } from '@/pages/DespesasRelatorioPage'
import { GrupoMeuRedirectPage } from '@/pages/GrupoMeuRedirectPage'
import { BackupPage } from '@/pages/BackupPage'
import { AuditoriaPage } from '@/pages/AuditoriaPage'
import { ConquistasPage } from '@/pages/ConquistasPage'
import { ReceitasInclusaoPage } from '@/pages/ReceitasInclusaoPage'
import { ReceitaFormPage } from '@/pages/ReceitaFormPage'
import { GeraMensalidadePage } from '@/pages/GeraMensalidadePage'
import { ReceitasRecebimentoPage } from '@/pages/ReceitasRecebimentoPage'
import { ReceitaRecebimentoFormPage } from '@/pages/ReceitaRecebimentoFormPage'
import { PortalTransparenciaPage } from '@/pages/PortalTransparenciaPage'
import { PortalRedirectPage } from '@/pages/PortalRedirectPage'
import { AtividadesPage } from '@/pages/AtividadesPage'
import { AtividadeFormPage } from '@/pages/AtividadeFormPage'
import { AtividadeContasPage } from '@/pages/AtividadeContasPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/termos-de-uso" element={<TermosUsoPage />} />
          <Route
            path="/politica-de-privacidade"
            element={<PrivacidadePage />}
          />
          <Route
            path="/transparencia/:slug"
            element={<PortalTransparenciaPage />}
          />
          <Route
            path="/rifa/:token"
            element={<AcaoEntreAmigosPublicPage />}
          />
          <Route
            path="/ingresso/:token"
            element={<VendaEventoPublicPage />}
          />
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<HomeRedirectPage />} />
            <Route
              path="dashboard"
              element={
                <RequirePermission permission="dashboard.view">
                  <DashboardPage />
                </RequirePermission>
              }
            />
            <Route
              path="calendario"
              element={
                <RequirePermission permission="dashboard.view">
                  <CalendarioGrupoPage />
                </RequirePermission>
              }
            />

            <Route
              path="associados"
              element={
                <RequirePermission permission="associados.view">
                  <AssociadosPage />
                </RequirePermission>
              }
            />
            <Route
              path="associados/:id"
              element={
                <RequirePermission permission="associados.view">
                  <AssociadoFormPage />
                </RequirePermission>
              }
            />
            <Route
              path="secoes"
              element={
                <RequirePermission permission="estrutura.view" grupoAdmin>
                  <SecoesPage />
                </RequirePermission>
              }
            />
            <Route
              path="secoes/:id"
              element={
                <RequirePermission permission="estrutura.view" grupoAdmin>
                  <SecaoFormPage />
                </RequirePermission>
              }
            />
            <Route
              path="patrulhas"
              element={
                <RequirePermission permission="estrutura.view" grupoAdmin>
                  <PatrulhasPage />
                </RequirePermission>
              }
            />
            <Route
              path="patrulhas/:id"
              element={
                <RequirePermission permission="estrutura.view" grupoAdmin>
                  <PatrulhaFormPage />
                </RequirePermission>
              }
            />

            <Route
              path="cadastros/usuarios"
              element={
                <RequirePermission permission="usuarios.view">
                  <UsuariosPage />
                </RequirePermission>
              }
            />
            <Route
              path="cadastros/usuarios/:id"
              element={
                <RequirePermission permission="usuarios.view">
                  <UsuarioFormPage />
                </RequirePermission>
              }
            />
            <Route
              path="cadastros/tipo-pagamento"
              element={
                <RequirePermission permission="financeiro.view" grupoAdmin>
                  <TipoPagamentoPage />
                </RequirePermission>
              }
            />
            <Route
              path="cadastros/tipo-pagamento/:id"
              element={
                <RequirePermission permission="financeiro.view" grupoAdmin>
                  <TipoPagamentoFormPage />
                </RequirePermission>
              }
            />
            <Route
              path="cadastros/tipo-mensalidade"
              element={
                <RequirePermission permission="financeiro.view" grupoAdmin>
                  <TipoMensalidadePage />
                </RequirePermission>
              }
            />
            <Route
              path="cadastros/tipo-mensalidade/:id"
              element={
                <RequirePermission permission="financeiro.view" grupoAdmin>
                  <TipoMensalidadeFormPage />
                </RequirePermission>
              }
            />
            <Route
              path="cadastros/fornecedores"
              element={
                <RequirePermission permission="financeiro.view">
                  <FornecedoresPage />
                </RequirePermission>
              }
            />
            <Route
              path="cadastros/fornecedores/:id"
              element={
                <RequirePermission permission="financeiro.view">
                  <FornecedorFormPage />
                </RequirePermission>
              }
            />
            <Route
              path="cadastros/calendario"
              element={<Navigate to="/calendario" replace />}
            />

            <Route
              path="estoque"
              element={<Navigate to="/estoque/produtos" replace />}
            />
            <Route
              path="estoque/grupos-produtos"
              element={
                <RequirePermission permission="estoque.view">
                  <GrupoProdutoPage />
                </RequirePermission>
              }
            />
            <Route
              path="estoque/grupos-produtos/:id"
              element={
                <RequirePermission permission="estoque.view">
                  <GrupoProdutoFormPage />
                </RequirePermission>
              }
            />
            <Route
              path="estoque/produtos"
              element={
                <RequirePermission permission="estoque.view">
                  <ProdutoPage />
                </RequirePermission>
              }
            />
            <Route
              path="estoque/produtos/:id/ficha"
              element={
                <RequirePermission permission="estoque.view">
                  <ProdutoFichaPage />
                </RequirePermission>
              }
            />
            <Route
              path="estoque/produtos/:id"
              element={
                <RequirePermission permission="estoque.view">
                  <ProdutoFormPage />
                </RequirePermission>
              }
            />
            <Route
              path="estoque/acerto"
              element={
                <RequirePermission permission="estoque.view">
                  <AcertoEstoquePage />
                </RequirePermission>
              }
            />
            <Route
              path="estoque/acerto/novo"
              element={
                <RequirePermission permission="estoque.write">
                  <AcertoEstoqueFormPage />
                </RequirePermission>
              }
            />
            <Route
              path="estoque/entrada"
              element={<Navigate to="/estoque/acerto" replace />}
            />

            <Route
              path="despesas/inclusao"
              element={
                <RequirePermission permission="financeiro.view">
                  <DespesasInclusaoPage />
                </RequirePermission>
              }
            />
            <Route
              path="despesas/inclusao/:id"
              element={
                <RequirePermission permission="financeiro.view">
                  <DespesaFormPage />
                </RequirePermission>
              }
            />
            <Route
              path="despesas/pagamento"
              element={
                <RequirePermission permission="financeiro.view">
                  <DespesasPagamentoPage />
                </RequirePermission>
              }
            />
            <Route
              path="despesas/pagamento/:id"
              element={
                <RequirePermission permission="financeiro.view">
                  <DespesaPagamentoFormPage />
                </RequirePermission>
              }
            />
            <Route
              path="despesas/relatorio"
              element={
                <RequirePermission permission="financeiro.view">
                  <DespesasRelatorioPage />
                </RequirePermission>
              }
            />

            <Route
              path="receitas/inclusao"
              element={
                <RequirePermission permission="financeiro.view">
                  <ReceitasInclusaoPage />
                </RequirePermission>
              }
            />
            <Route
              path="receitas/inclusao/:id"
              element={
                <RequirePermission permission="financeiro.view">
                  <ReceitaFormPage />
                </RequirePermission>
              }
            />
            <Route
              path="receitas/gera-mensalidade"
              element={
                <RequirePermission permission="financeiro.view">
                  <GeraMensalidadePage />
                </RequirePermission>
              }
            />
            <Route
              path="receitas/relatorio"
              element={
                <RequirePermission permission="financeiro.view">
                  <ReceitasRecebimentoPage />
                </RequirePermission>
              }
            />
            <Route
              path="receitas/recebimento"
              element={
                <RequirePermission permission="financeiro.view">
                  <ReceitasRecebimentoPage />
                </RequirePermission>
              }
            />
            <Route
              path="receitas/recebimento/:id"
              element={
                <RequirePermission permission="financeiro.view">
                  <ReceitaRecebimentoFormPage />
                </RequirePermission>
              }
            />

            <Route
              path="atividades"
              element={
                <RequirePermission permission="atividades.view">
                  <AtividadesPage />
                </RequirePermission>
              }
            />
            <Route
              path="atividades/:id/contas"
              element={
                <RequirePermission permission="atividades.view">
                  <AtividadeContasPage />
                </RequirePermission>
              }
            />
            <Route
              path="atividades/:id"
              element={
                <RequirePermission permission="atividades.view">
                  <AtividadeFormPage />
                </RequirePermission>
              }
            />
            <Route
              path="eventos"
              element={
                <RequirePermission permission="eventos.view">
                  <EventosPage />
                </RequirePermission>
              }
            />
            <Route
              path="vendas"
              element={
                <RequirePermission permission="vendas.view">
                  <Navigate to="/vendas/acao-entre-amigos" replace />
                </RequirePermission>
              }
            />
            <Route
              path="vendas/acao-entre-amigos"
              element={
                <RequirePermission permission="vendas.view">
                  <AcaoEntreAmigosPage />
                </RequirePermission>
              }
            />
            <Route
              path="vendas/acao-entre-amigos/:id/vender"
              element={
                <RequirePermission permission="vendas.view">
                  <AcaoEntreAmigosVendaPage />
                </RequirePermission>
              }
            />
            <Route
              path="vendas/acao-entre-amigos/:id"
              element={
                <RequirePermission permission="vendas.view">
                  <AcaoEntreAmigosFormPage />
                </RequirePermission>
              }
            />
            <Route
              path="vendas/eventos"
              element={
                <RequirePermission permission="vendas.view">
                  <VendaEventosPage />
                </RequirePermission>
              }
            />
            <Route
              path="vendas/eventos/:id/vender"
              element={
                <RequirePermission permission="vendas.view">
                  <VendaEventoVendaPage />
                </RequirePermission>
              }
            />
            <Route
              path="vendas/eventos/:id"
              element={
                <RequirePermission permission="vendas.view">
                  <VendaEventoFormPage />
                </RequirePermission>
              }
            />
            <Route
              path="vendas/loja"
              element={
                <RequirePermission permission="vendas.view">
                  <LojaPage />
                </RequirePermission>
              }
            />
            <Route
              path="vendas/loja/caixa"
              element={
                <RequirePermission permission="vendas.view">
                  <LojaCaixaPage />
                </RequirePermission>
              }
            />
            <Route
              path="projetos"
              element={
                <RequirePermission permission="projetos.view">
                  <ProjetosPage />
                </RequirePermission>
              }
            />
            <Route
              path="projetos/:id"
              element={
                <RequirePermission permission="projetos.view">
                  <ProjetoFormPage />
                </RequirePermission>
              }
            />

            <Route
              path="grupos"
              element={
                <RequirePermission permission="grupos.write">
                  <GruposPage />
                </RequirePermission>
              }
            />
            <Route
              path="grupos/meu"
              element={
                <RequirePermission permission="grupos.view">
                  <GrupoMeuRedirectPage />
                </RequirePermission>
              }
            />
            <Route
              path="grupos/:id"
              element={
                <RequirePermission anyOf={['grupos.write', 'grupos.view']}>
                  <GrupoFormPage />
                </RequirePermission>
              }
            />

            <Route
              path="auditoria"
              element={
                <RequirePermission permission="auditoria.view">
                  <AuditoriaPage />
                </RequirePermission>
              }
            />

            <Route
              path="backup"
              element={
                <RequirePermission permission="grupos.write">
                  <BackupPage />
                </RequirePermission>
              }
            />

            <Route
              path="conquistas"
              element={
                <RequirePermission permission="dashboard.view">
                  <ConquistasPage />
                </RequirePermission>
              }
            />

            <Route
              path="portal-transparencia"
              element={
                <RequirePermission permission="portal.view">
                  <PortalRedirectPage />
                </RequirePermission>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </ToastProvider>
      </BrowserRouter>
    </AuthProvider>
  )
}
