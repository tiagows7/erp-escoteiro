import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { AppLayout } from '@/components/AppLayout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { RequirePermission } from '@/components/RequirePermission'
import { LoginPage } from '@/pages/LoginPage'
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
  GrupoProdutosPage,
  ProdutosPage,
  EntradaEstoquePage,
  EventosPage,
  VendasPage,
  ProjetosPage,
} from '@/pages/placeholders'
import { UsuariosPage } from '@/pages/UsuariosPage'
import { UsuarioFormPage } from '@/pages/UsuarioFormPage'
import { FornecedoresPage } from '@/pages/FornecedoresPage'
import { FornecedorFormPage } from '@/pages/FornecedorFormPage'
import { TipoMensalidadePage } from '@/pages/TipoMensalidadePage'
import { TipoMensalidadeFormPage } from '@/pages/TipoMensalidadeFormPage'
import { TipoPagamentoPage } from '@/pages/TipoPagamentoPage'
import { TipoPagamentoFormPage } from '@/pages/TipoPagamentoFormPage'
import { DespesasInclusaoPage } from '@/pages/DespesasInclusaoPage'
import { DespesaFormPage } from '@/pages/DespesaFormPage'
import { DespesasPagamentoPage } from '@/pages/DespesasPagamentoPage'
import { DespesaPagamentoFormPage } from '@/pages/DespesaPagamentoFormPage'
import { ReceitasInclusaoPage } from '@/pages/ReceitasInclusaoPage'
import { ReceitaFormPage } from '@/pages/ReceitaFormPage'
import { GeraMensalidadePage } from '@/pages/GeraMensalidadePage'
import { ReceitasRecebimentoPage } from '@/pages/ReceitasRecebimentoPage'
import { ReceitaRecebimentoFormPage } from '@/pages/ReceitaRecebimentoFormPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route
              index
              element={
                <RequirePermission permission="dashboard.view">
                  <DashboardPage />
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
                <RequirePermission permission="estrutura.view">
                  <SecoesPage />
                </RequirePermission>
              }
            />
            <Route
              path="secoes/:id"
              element={
                <RequirePermission permission="estrutura.view">
                  <SecaoFormPage />
                </RequirePermission>
              }
            />
            <Route
              path="patrulhas"
              element={
                <RequirePermission permission="estrutura.view">
                  <PatrulhasPage />
                </RequirePermission>
              }
            />
            <Route
              path="patrulhas/:id"
              element={
                <RequirePermission permission="estrutura.view">
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
                <RequirePermission permission="financeiro.view">
                  <TipoPagamentoPage />
                </RequirePermission>
              }
            />
            <Route
              path="cadastros/tipo-pagamento/:id"
              element={
                <RequirePermission permission="financeiro.view">
                  <TipoPagamentoFormPage />
                </RequirePermission>
              }
            />
            <Route
              path="cadastros/tipo-mensalidade"
              element={
                <RequirePermission permission="financeiro.view">
                  <TipoMensalidadePage />
                </RequirePermission>
              }
            />
            <Route
              path="cadastros/tipo-mensalidade/:id"
              element={
                <RequirePermission permission="financeiro.view">
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
              path="estoque"
              element={<Navigate to="/estoque/produtos" replace />}
            />
            <Route
              path="estoque/grupos-produtos"
              element={
                <RequirePermission permission="estoque.view">
                  <GrupoProdutosPage />
                </RequirePermission>
              }
            />
            <Route
              path="estoque/produtos"
              element={
                <RequirePermission permission="estoque.view">
                  <ProdutosPage />
                </RequirePermission>
              }
            />
            <Route
              path="estoque/entrada"
              element={
                <RequirePermission permission="estoque.view">
                  <EntradaEstoquePage />
                </RequirePermission>
              }
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
                  <VendasPage />
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
              path="grupos"
              element={
                <RequirePermission permission="grupos.write">
                  <GruposPage />
                </RequirePermission>
              }
            />
            <Route
              path="grupos/:id"
              element={
                <RequirePermission permission="grupos.write">
                  <GrupoFormPage />
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
