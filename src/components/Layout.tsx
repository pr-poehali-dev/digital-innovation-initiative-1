import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";


const NAV_ITEMS = [
  { label: "Главная", icon: "LayoutDashboard", href: "/cabinet", exact: true, active: true },
  { label: "Проекты и презентации", icon: "FolderOpen", href: "/cabinet/projects", active: true },
  { label: "Материалы и документы", icon: "FileText", href: "/cabinet/materials", active: false },
  { label: "Дипломы и сертификаты", icon: "Award", href: "/cabinet/passport", active: false },
  { label: "Тесты и повторение", icon: "ClipboardCheck", href: "/cabinet/tests", active: false },
  { label: "Карта компетенций", icon: "Map", href: "/cabinet/competencies", active: false },
  { label: "План развития", icon: "Target", href: "/cabinet/development", active: false },
  { label: "Карьерная траектория", icon: "TrendingUp", href: "/cabinet/career", active: false },
  { label: "Профессиональный профиль", icon: "User", href: "/cabinet/profile", active: false },
  { label: "Кошелёк", icon: "Wallet", href: "/cabinet/wallet", active: true },
];

const BOTTOM_ITEMS = [
  { label: "Настройки и приватность", icon: "Settings", href: "/cabinet/settings", active: false },
];

const MOBILE_NAV = [
  { label: "Главная", icon: "LayoutDashboard", href: "/cabinet" },
  { label: "Проекты", icon: "FolderOpen", href: "/cabinet/projects" },
  { label: "Развитие", icon: "TrendingUp", href: "/cabinet/development" },
  { label: "AI", icon: "Sparkles", href: "/cabinet" },
  { label: "Профиль", icon: "User", href: "/cabinet/profile" },
];

function SidebarLink({ item, collapsed }: { item: typeof NAV_ITEMS[0]; collapsed: boolean }) {
  const location = useLocation();
  const isActive = item.exact
    ? location.pathname === item.href
    : location.pathname.startsWith(item.href) && item.href !== "/cabinet";

  const exactActive = item.href === "/cabinet" && location.pathname === "/cabinet";
  const active = exactActive || (!item.exact && isActive);

  return (
    <Link
      to={item.active ? item.href : "#"}
      onClick={e => !item.active && e.preventDefault()}
      title={collapsed ? item.label : undefined}
      className={`
        group flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 relative
        ${active
          ? "bg-slate-800 text-white shadow-sm"
          : item.active
            ? "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            : "text-slate-400 cursor-default"
        }
        ${collapsed ? "justify-center px-2" : ""}
      `}
    >
      <Icon
        name={item.icon}
        size={16}
        className={`flex-shrink-0 ${active ? "text-white" : item.active ? "text-slate-500 group-hover:text-slate-700" : "text-slate-300"}`}
      />
      {!collapsed && (
        <div className="flex-1 min-w-0">
          <div className="text-[13px] leading-snug">{item.label}</div>
          {!item.active && (
            <div className="text-[10px] font-semibold text-slate-400 mt-0.5">Скоро</div>
          )}
        </div>
      )}
    </Link>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const canGoBack = location.pathname !== "/cabinet" && location.pathname !== "/";

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* ── Sidebar (desktop) ── */}
      <aside
        className={`hidden lg:flex flex-col fixed top-0 left-0 h-screen bg-white border-r border-slate-200 transition-all duration-200 z-20 ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        {/* Logo */}
        <div className={`flex items-center gap-3 px-4 py-4 border-b border-slate-100 ${collapsed ? "justify-center px-2" : ""}`}>
          <Link to="/cabinet" className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">Т</span>
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="font-bold text-sm text-slate-900 leading-tight">Траектория</div>
                <div className="text-[10px] text-slate-400 leading-tight">Кабинет развития</div>
              </div>
            )}
          </Link>
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              className="ml-auto text-slate-400 hover:text-slate-600 transition-colors p-1 rounded"
            >
              <Icon name="PanelLeftClose" size={16} />
            </button>
          )}
        </div>

        {/* Toggle when collapsed */}
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="flex items-center justify-center py-2 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <Icon name="PanelLeftOpen" size={16} />
          </button>
        )}

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(item => (
            <SidebarLink key={item.href} item={item} collapsed={collapsed} />
          ))}
        </nav>

        {/* Bottom */}
        <div className="px-2 py-3 border-t border-slate-100 space-y-0.5">
          {BOTTOM_ITEMS.map(item => (
            <SidebarLink key={item.href} item={item} collapsed={collapsed} />
          ))}
          {/* User */}
          <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl mt-1 ${collapsed ? "justify-center px-2" : ""}`}>
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-semibold">
                {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
              </span>
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-800 truncate">{user?.name}</div>
                <div className="text-[10px] text-slate-400 truncate">{user?.email}</div>
              </div>
            )}
            {!collapsed && (
              <button
                onClick={logout}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded"
                title="Выйти"
              >
                <Icon name="LogOut" size={14} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-200 ${collapsed ? "lg:ml-16" : "lg:ml-64"}`}>
        {/* Top bar */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10 h-14">
          <div className="px-4 lg:px-6 h-full flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {/* Mobile logo */}
              <Link to="/cabinet" className="flex items-center gap-2 lg:hidden">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
                  <span className="text-white font-bold text-xs">Т</span>
                </div>
                <span className="font-bold text-sm text-slate-900">Траектория</span>
              </Link>
              {/* Back button */}
              {canGoBack && (
                <button
                  onClick={() => navigate(-1)}
                  className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors px-2 py-1.5 rounded-lg hover:bg-slate-100"
                >
                  <Icon name="ArrowLeft" size={16} />
                  <span className="hidden sm:block text-sm">Назад</span>
                </button>
              )}
            </div>

            {/* Поиск */}
            <div className="flex-1 max-w-xs hidden md:block">
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-400 cursor-pointer hover:bg-slate-100 transition-colors">
                <Icon name="Search" size={15} />
                <span>Поиск...</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button className="relative w-8 h-8 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 transition-colors">
                <Icon name="Bell" size={18} />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-orange-500 rounded-full" />
              </button>

              <button className="flex items-center gap-2 bg-gradient-to-r from-violet-500 to-indigo-600 text-white px-3 py-1.5 rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity">
                <Icon name="Sparkles" size={13} />
                AI-помощник
              </button>

              <div className="hidden sm:flex items-center gap-2 pl-1">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs font-semibold">
                    {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
                  </span>
                </div>
                <span className="text-sm font-medium text-slate-700 max-w-[100px] truncate">{user?.name}</span>
                <Icon name="ChevronDown" size={14} className="text-slate-400" />
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 pb-20 lg:pb-6">{children}</main>
      </div>

      {/* ── Mobile bottom nav ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-20 h-16">
        <div className="flex items-center justify-around h-full px-2">
          {MOBILE_NAV.map(item => {
            const isActive = item.href === "/cabinet"
              ? location.pathname === "/cabinet"
              : location.pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-colors ${
                  isActive ? "text-slate-900" : "text-slate-400"
                }`}
              >
                <Icon
                  name={item.icon}
                  size={20}
                  className={isActive ? "text-slate-800" : "text-slate-400"}
                />
                <span className={`text-[10px] font-medium leading-none ${isActive ? "text-slate-800" : "text-slate-400"}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}