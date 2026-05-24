import { useAuth } from "@/lib/auth-context";
import { LogOut, User, ArrowLeft } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";

const LOGO_URL = "https://cdn.poehali.dev/projects/74e2bb00-8b75-428a-b2fe-9c02b6a39d64/files/0a6d2e9d-2156-49ee-a4b8-7baaa8811800.jpg";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const canGoBack = location.pathname !== "/cabinet" && location.pathname !== "/";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {canGoBack && (
              <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 transition-colors px-2 py-1.5 rounded-lg hover:bg-muted"
                title="Назад"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:block">Назад</span>
              </button>
            )}
            <Link to="/cabinet" className="flex items-center gap-2 min-w-0">
              <img src={LOGO_URL} alt="DocMind AI" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
              <span className="font-bold text-lg truncate">DocMind AI</span>
            </Link>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            <Link
              to="/cabinet"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === "/cabinet"
                  ? "bg-slate-100 text-slate-800"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Icon name="FolderOpen" size={16} />
              Проекты
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center">
                <User className="h-4 w-4 text-slate-600" />
              </div>
              <span className="hidden sm:block font-medium text-foreground">{user?.name}</span>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-muted"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:block">Выйти</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
