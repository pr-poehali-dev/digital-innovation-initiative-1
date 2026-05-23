import { useAuth } from "@/lib/auth-context";
import { Brain, FolderOpen, LogOut, User } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import Icon from "@/components/ui/icon";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/cabinet" className="flex items-center gap-2">
            <div className="bg-orange-500 rounded-lg p-1.5">
              <Brain className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg">DocMind AI</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <Link
              to="/cabinet"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === "/cabinet"
                  ? "bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Icon name="FolderOpen" size={16} />
              Проекты
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-7 h-7 rounded-full bg-orange-100 dark:bg-orange-950/50 flex items-center justify-center">
                <User className="h-4 w-4 text-orange-600" />
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
