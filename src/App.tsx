import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth-context";
import { AdminProvider } from "./lib/admin-context";
import AdminRoute from "./components/admin/AdminRoute";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminProjectsPage from "./pages/admin/AdminProjectsPage";
import AdminProjectDetailPage from "./pages/admin/AdminProjectDetailPage";
import Index from "./pages/Index";
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
import PrivacyPage from "./pages/legal/PrivacyPage";
import TermsPage from "./pages/legal/TermsPage";
import OfferPage from "./pages/legal/OfferPage";
import RefundPage from "./pages/legal/RefundPage";
import ConsentPage from "./pages/legal/ConsentPage";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AdminProvider>
          <AuthProvider>
            <Routes>
              {/* Admin routes */}
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
              <Route path="/admin/users" element={<AdminRoute><AdminUsersPage /></AdminRoute>} />
              <Route path="/admin/projects" element={<AdminRoute><AdminProjectsPage /></AdminRoute>} />
              <Route path="/admin/projects/:id" element={<AdminRoute><AdminProjectDetailPage /></AdminRoute>} />
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
              <Route path="/legal/privacy" element={<PrivacyPage />} />
              <Route path="/legal/terms" element={<TermsPage />} />
              <Route path="/legal/offer" element={<OfferPage />} />
              <Route path="/legal/refund" element={<RefundPage />} />
              <Route path="/legal/consent" element={<ConsentPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </AdminProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;