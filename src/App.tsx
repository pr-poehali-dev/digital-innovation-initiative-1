import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import CookieBanner from "@/components/CookieBanner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider, useAuth } from "./lib/auth-context";
import { AdminProvider } from "./lib/admin-context";
import AdminRoute from "./components/admin/AdminRoute";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminProjectsPage from "./pages/admin/AdminProjectsPage";
import AdminProjectDetailPage from "./pages/admin/AdminProjectDetailPage";
import AdminAuditPage from "./pages/admin/AdminAuditPage";
import AdminActivityPage from "./pages/admin/AdminActivityPage";
import AdminPlanPage from "./pages/admin/AdminPlanPage";
import AdminStrategyPage from "./pages/admin/AdminStrategyPage";
import AdminExecutionPage from "./pages/admin/AdminExecutionPage";
import AdminHQPage from "./pages/admin/AdminHQPage";
import AdminProjectPage from "./pages/admin/AdminProjectPage";
import AdminPassportPage from "./pages/admin/AdminPassportPage";
import AdminErrorsPage from "./pages/admin/AdminErrorsPage";
import AdminAlertsPage from "./pages/admin/AdminAlertsPage";
import AdminFlagsPage from "./pages/admin/AdminFlagsPage";
import AdminTicketsPage from "./pages/admin/AdminTicketsPage";
import AdminAutomationsPage from "./pages/admin/AdminAutomationsPage";
import AdminContentPage from "./pages/admin/AdminContentPage";
import AdminCompetenciesPage from "./pages/admin/AdminCompetenciesPage";
import AdminAdoptionPage from "./pages/admin/AdminAdoptionPage";
import AdminBenchmarkPage from "./pages/admin/AdminBenchmarkPage";
import Index from "./pages/Index";
import WelcomePage from "./pages/WelcomePage";
import NotFound from "./pages/NotFound";
import AuthPage from "./pages/AuthPage";
import CabinetPage from "./pages/CabinetPage";
import GrowthDashboard from "./pages/GrowthDashboard";
import ProjectPage from "./pages/ProjectPage";
import NewTaskPage from "./pages/NewTaskPage";
import TaskPage from "./pages/TaskPage";
import SearchPage from "./pages/SearchPage";
import DocumentChatPage from "./pages/DocumentChatPage";
import EducationalPassportPage from "./pages/EducationalPassportPage";
import AuditPage from "./pages/AuditPage";
import VisualsPage from "./pages/VisualsPage";
import WalletPage from "./pages/WalletPage";
import LearningPage from "./pages/LearningPage";
import PrivacyPage from "./pages/legal/PrivacyPage";
import TermsPage from "./pages/legal/TermsPage";
import OfferPage from "./pages/legal/OfferPage";
import RefundPage from "./pages/legal/RefundPage";
import ConsentPage from "./pages/legal/ConsentPage";
import ProfessionalPassportPage from "./pages/ProfessionalPassportPage";
import GrowthNavigatorPage from "./pages/GrowthNavigatorPage";
import PublicProfileSettingsPage from "./pages/PublicProfileSettingsPage";
import PublicProfilePage from "./pages/PublicProfilePage";
import CompetencyMapPage from "./pages/CompetencyMapPage";
import GuidePage from "./pages/GuidePage";
import GoalsPage from "./pages/GoalsPage";
import SolutionsPage from "./pages/SolutionsPage";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const App = () => (
  <HelmetProvider>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AdminProvider>
          <AuthProvider>
            <CookieBanner />
            <Routes>
              {/* Admin routes */}
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
              <Route path="/admin/users" element={<AdminRoute><AdminUsersPage /></AdminRoute>} />
              <Route path="/admin/projects" element={<AdminRoute><AdminProjectsPage /></AdminRoute>} />
              <Route path="/admin/projects/:id" element={<AdminRoute><AdminProjectDetailPage /></AdminRoute>} />
              <Route path="/admin/audit" element={<AdminRoute><AdminAuditPage /></AdminRoute>} />
              <Route path="/admin/activity" element={<AdminRoute><AdminActivityPage /></AdminRoute>} />
              <Route path="/admin/plan" element={<AdminRoute><AdminPlanPage /></AdminRoute>} />
              <Route path="/admin/strategy" element={<AdminRoute><AdminStrategyPage /></AdminRoute>} />
              <Route path="/admin/execution" element={<AdminRoute><AdminExecutionPage /></AdminRoute>} />
              <Route path="/admin/hq" element={<AdminRoute><AdminHQPage /></AdminRoute>} />
              <Route path="/admin/project" element={<AdminRoute><AdminProjectPage /></AdminRoute>} />
              <Route path="/admin/passport" element={<AdminRoute><AdminPassportPage /></AdminRoute>} />
              <Route path="/admin/errors" element={<AdminRoute><AdminErrorsPage /></AdminRoute>} />
              <Route path="/admin/alerts" element={<AdminRoute><AdminAlertsPage /></AdminRoute>} />
              <Route path="/admin/flags" element={<AdminRoute><AdminFlagsPage /></AdminRoute>} />
              <Route path="/admin/tickets" element={<AdminRoute><AdminTicketsPage /></AdminRoute>} />
              <Route path="/admin/automations" element={<AdminRoute><AdminAutomationsPage /></AdminRoute>} />
              <Route path="/admin/content" element={<AdminRoute><AdminContentPage /></AdminRoute>} />
              <Route path="/admin/competencies" element={<AdminRoute><AdminCompetenciesPage /></AdminRoute>} />
              <Route path="/admin/analytics/competency-map" element={<AdminRoute><AdminAdoptionPage /></AdminRoute>} />
              <Route path="/admin/benchmark" element={<AdminRoute><AdminBenchmarkPage /></AdminRoute>} />
              <Route path="/admin/*" element={<AdminRoute><AdminDashboard /></AdminRoute>} />

              {/* App routes */}
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<AuthPage />} />
              <Route path="/cabinet" element={<ProtectedRoute><GrowthDashboard /></ProtectedRoute>} />
              <Route path="/cabinet/projects" element={<ProtectedRoute><CabinetPage /></ProtectedRoute>} />
              <Route path="/cabinet/project/:id" element={<ProtectedRoute><ProjectPage /></ProtectedRoute>} />
              <Route path="/cabinet/project/:id/new-task" element={<ProtectedRoute><NewTaskPage /></ProtectedRoute>} />
              <Route path="/cabinet/project/:id/task/:taskId" element={<ProtectedRoute><TaskPage /></ProtectedRoute>} />
              <Route path="/cabinet/project/:id/search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
              <Route path="/cabinet/project/:id/document/:docId" element={<ProtectedRoute><DocumentChatPage /></ProtectedRoute>} />
              <Route path="/cabinet/passport" element={<ProtectedRoute><EducationalPassportPage /></ProtectedRoute>} />
              <Route path="/cabinet/project/:id/audit" element={<ProtectedRoute><AuditPage /></ProtectedRoute>} />
              <Route path="/cabinet/visuals" element={<ProtectedRoute><VisualsPage /></ProtectedRoute>} />
              <Route path="/cabinet/wallet" element={<ProtectedRoute><WalletPage /></ProtectedRoute>} />
              <Route path="/cabinet/learning" element={<ProtectedRoute><LearningPage /></ProtectedRoute>} />
              <Route path="/cabinet/goals" element={<ProtectedRoute><GoalsPage /></ProtectedRoute>} />
              <Route path="/cabinet/solutions" element={<ProtectedRoute><SolutionsPage /></ProtectedRoute>} />
              <Route path="/cabinet/profile" element={<ProtectedRoute><ProfessionalPassportPage /></ProtectedRoute>} />
              <Route path="/cabinet/growth" element={<ProtectedRoute><GrowthNavigatorPage /></ProtectedRoute>} />
              <Route path="/cabinet/public-profile" element={<ProtectedRoute><PublicProfileSettingsPage /></ProtectedRoute>} />
              <Route path="/cabinet/competency-map" element={<ProtectedRoute><CompetencyMapPage /></ProtectedRoute>} />
              <Route path="/cabinet/headquarters" element={<Navigate to="/cabinet" replace />} />
              <Route path="/welcome" element={<ProtectedRoute><WelcomePage /></ProtectedRoute>} />
              <Route path="/guide" element={<GuidePage />} />
              <Route path="/legal/privacy" element={<PrivacyPage />} />
              <Route path="/legal/terms" element={<TermsPage />} />
              <Route path="/legal/offer" element={<OfferPage />} />
              <Route path="/legal/refund" element={<RefundPage />} />
              <Route path="/legal/consent" element={<ConsentPage />} />
              <Route path="/p/:slug" element={<PublicProfilePage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </AdminProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </HelmetProvider>
);

export default App;