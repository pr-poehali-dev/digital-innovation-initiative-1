import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAdmin } from "@/lib/admin-context";
import Icon from "@/components/ui/icon";
import SeoMeta from "@/components/SeoMeta";
import { useExecSettings } from "@/lib/execSettings";

const CABINET_NAV = [
  { label: "Мой фокус",    icon: "Crosshair",       href: "/admin/exec" },
  { label: "Инициативы",   icon: "Rocket",          href: "/admin/exec/initiatives" },
  { label: "Контроль",     icon: "Flag",            href: "/admin/exec/control" },
  { label: "Стейкхолдеры", icon: "Users",           href: "/admin/exec/stakeholders" },
  { label: "Решения",      icon: "GitPullRequest",  href: "/admin/exec/decisions" },
  { label: "Полномочия",   icon: "Shield",          href: "/admin/exec/authority" },
  { label: "Участники",    icon: "Contact",         href: "/admin/exec/persons" },
  { label: "Диагностика",  icon: "Stethoscope",     href: "/admin/exec/diagnostics" },
];

const NAV = [
  { label: "Дашборд",     icon: "LayoutDashboard", href: "/admin" },
  { label: "Пользователи", icon: "Users",           href: "/admin/users" },
  { label: "Проекты",     icon: "FolderOpen",       href: "/admin/projects" },
  { label: "Активность",  icon: "Activity",          href: "/admin/activity" },
  { label: "Аудит",       icon: "ClipboardList",    href: "/admin/audit" },
  { label: "AI-операции", icon: "Sparkles",          href: "/admin/ai-runs" },
  { label: "Кошелёк",    icon: "Wallet",            href: "/admin/wallet" },
  { label: "Ошибки",      icon: "AlertTriangle",    href: "/admin/errors" },
  { label: "Алерты",      icon: "Bell",             href: "/admin/alerts" },
  { label: "Flags",        icon: "ToggleRight",      href: "/admin/flags" },
  { label: "Тикеты",      icon: "Ticket",           href: "/admin/tickets" },
  { label: "Стратегия",    icon: "TrendingUp",        href: "/admin/strategy" },
  { label: "Benchmark",    icon: "FlaskConical",       href: "/admin/benchmark" },
  { label: "Execution",    icon: "Rocket",            href: "/admin/execution" },
  { label: "Компетенции",  icon: "BrainCircuit",      href: "/admin/competencies" },
  { label: "Adoption",     icon: "BarChart2",          href: "/admin/analytics/competency-map" },
  { label: "Автоматизация", icon: "Zap",             href: "/admin/automations" },
  { label: "Контент",     icon: "FileText",         href: "/admin/content" },
  { label: "Презентации", icon: "Presentation",     href: "/admin/presentations" },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { session, logout } = useAdmin();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [settings, setSettings] = useExecSettings();
  const inCabinet = pathname.startsWith("/admin/exec");

  const cabinetNav = settings.showHistory
    ? [...CABINET_NAV, { label: "Журнал", icon: "History", href: "/admin/exec/history" }]
    : CABINET_NAV;

  const toggleHistory = () => {
    const next = !settings.showHistory;
    setSettings({ showHistory: next });
    if (!next && pathname === "/admin/exec/history") navigate("/admin/exec");
  };

  const handleLogout = async () => {
    await logout();
    navigate("/admin/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex bg-gray-950 text-white">
      <SeoMeta noindex />
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 flex flex-col border-r border-gray-800">
        <div className="px-4 py-5 flex items-center gap-2 border-b border-gray-800">
          <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center">
            <Icon name="Shield" size={14} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-white">Траектория</span>
          <span className="ml-auto text-xs text-gray-600 font-medium">admin</span>
        </div>

        <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
          <p className="px-3 pb-1.5 pt-1 text-[10px] font-semibold text-orange-500/80 uppercase tracking-wider">
            Кабинет руководителя
          </p>
          {cabinetNav.map(item => (
            <NavLink
              key={item.href}
              to={item.href}
              end={item.href === "/admin/exec"}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-orange-500/15 text-orange-300 font-medium"
                    : "text-gray-400 hover:text-white hover:bg-gray-900"
                }`
              }
            >
              <Icon name={item.icon} size={16} />
              {item.label}
            </NavLink>
          ))}

          <p className="px-3 pb-1.5 pt-4 text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
            Платформа
          </p>
          {NAV.map(item => (
            <NavLink
              key={item.href}
              to={item.href}
              end={item.href === "/admin"}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-gray-800 text-white font-medium"
                    : "text-gray-400 hover:text-white hover:bg-gray-900"
                }`
              }
            >
              <Icon name={item.icon} size={16} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {inCabinet && (
          <div className="px-3 py-2.5 border-t border-gray-800">
            <button
              onClick={toggleHistory}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-900 transition-colors"
              title={
                settings.showHistory
                  ? "Скрыть журнал изменений из меню"
                  : "Показать журнал изменений в меню"
              }
            >
              <Icon name={settings.showHistory ? "Eye" : "EyeOff"} size={15} />
              <span className="flex-1 text-left">Журнал</span>
              <span
                className={`w-8 h-[18px] rounded-full flex items-center px-0.5 transition-colors ${
                  settings.showHistory ? "bg-orange-500" : "bg-gray-700"
                }`}
              >
                <span
                  className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                    settings.showHistory ? "translate-x-[14px]" : ""
                  }`}
                />
              </span>
            </button>
          </div>
        )}

        <div className="p-3 border-t border-gray-800">
          <div className="px-3 py-2 mb-1">
            <p className="text-xs text-gray-500 truncate">{session?.actor_email}</p>
            <p className="text-xs text-orange-500 font-medium">{session?.actor_role}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-900 transition-colors"
          >
            <Icon name="LogOut" size={14} />
            Выйти
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}