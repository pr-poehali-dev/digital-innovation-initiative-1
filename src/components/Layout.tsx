import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";
import GlobalSearchDialog from "@/components/GlobalSearchDialog";
import { NAV_SECTIONS, NAV_SECONDARY, MOBILE_NAV, type NavSection, type NavItem } from "@/lib/routes";

// ── helpers ────────────────────────────────────────────────────────────────

function isItemActive(pathname: string, item: NavItem): boolean {
  if (item.href === "#") return false;
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

function isSectionActive(pathname: string, section: NavSection): boolean {
  return section.items.some(item => isItemActive(pathname, item));
}

// Секции с collapsible поведением (только многопунктовые, не одиночные)
const COLLAPSIBLE_SECTIONS = new Set(["profile", "growth", "learning"]);

const STORAGE_KEY = "cabinet_sidebar_sections_v1";

function loadOpenSections(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Валидируем: ожидаем Record<string, boolean>
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const safe: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "boolean") safe[k] = v;
    }
    return safe;
  } catch {
    return {};
  }
}

function saveOpenSections(state: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage может быть недоступен (private mode, quota exceeded)
  }
}

// ── Badge ─────────────────────────────────────────────────────────────────

function Badge({ tone, text }: { tone: "neutral" | "success" | "info"; text: string }) {
  const cls = {
    neutral: "bg-slate-100 text-slate-400",
    success: "bg-emerald-100 text-emerald-600",
    info:    "bg-violet-100 text-violet-600",
  }[tone];
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none ${cls}`}>
      {text}
    </span>
  );
}

// ── Sub-item ──────────────────────────────────────────────────────────────

function SubItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const location = useLocation();
  const active = isItemActive(location.pathname, item);

  const inner = (
    <>
      <Icon
        name={item.icon}
        size={14}
        className={`flex-shrink-0 ${active ? "text-white" : item.active ? "text-slate-400" : "text-slate-300"}`}
      />
      {!collapsed && (
        <span className="flex-1 min-w-0 truncate text-[13px] leading-snug">{item.label}</span>
      )}
      {!collapsed && item.badge && <Badge tone={item.badge.tone} text={item.badge.text} />}
      {!collapsed && !item.active && (
        <span className="text-[10px] font-semibold text-slate-300 leading-none">Скоро</span>
      )}
    </>
  );

  const cls = [
    "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150",
    active
      ? "bg-slate-800 text-white shadow-sm"
      : item.active
        ? "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        : "text-slate-400 cursor-default",
    collapsed ? "justify-center px-2" : "",
  ].join(" ");

  if (!item.active || item.href === "#") {
    return (
      <div
        className={cls}
        title={collapsed ? item.label : undefined}
        aria-disabled="true"
        role="menuitem"
        tabIndex={-1}
      >
        {inner}
      </div>
    );
  }

  return (
    <Link to={item.href} className={cls} title={collapsed ? item.label : undefined}>
      {inner}
    </Link>
  );
}

// ── Section ──────────────────────────────────────────────────────────────

function SectionGroup({
  section,
  collapsed,
  isOpen,
  onToggle,
}: {
  section: NavSection;
  collapsed: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const location = useLocation();
  const active = isSectionActive(location.pathname, section);
  const canCollapse = !collapsed && COLLAPSIBLE_SECTIONS.has(section.key);

  // Single-item sections (Обзор, Практика) — render as flat item
  if (section.singleItem || section.items.length === 1) {
    return <SubItem item={section.items[0]} collapsed={collapsed} />;
  }

  const sectionItemsId = `sidebar-section-${section.key}`;

  return (
    <div className="space-y-0.5">
      {/* Section header */}
      {!collapsed && (
        <button
          onClick={canCollapse ? onToggle : undefined}
          aria-expanded={canCollapse ? isOpen : undefined}
          aria-controls={canCollapse ? sectionItemsId : undefined}
          className={[
            "w-full flex items-center justify-between px-3 pt-3 pb-1",
            canCollapse ? "cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 rounded" : "cursor-default",
          ].join(" ")}
        >
          <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors ${
            active ? "text-slate-500" : "text-slate-400"
          } ${canCollapse ? "group-hover:text-slate-600" : ""}`}>
            {section.label}
          </span>
          {canCollapse && (
            <Icon
              name="ChevronDown"
              size={12}
              className={`text-slate-300 transition-transform duration-200 ${isOpen ? "rotate-0" : "-rotate-90"}`}
            />
          )}
        </button>
      )}
      {collapsed && <div className="my-1 mx-2 border-t border-slate-100" title={section.label} />}

      {/* Items — animated reveal */}
      <div
        id={sectionItemsId}
        role="group"
        aria-label={section.label}
        className={[
          "space-y-0.5 overflow-hidden transition-all duration-200",
          !collapsed && canCollapse
            ? isOpen
              ? "max-h-96 opacity-100"
              : "max-h-0 opacity-0"
            : "max-h-96 opacity-100",
        ].join(" ")}
      >
        {section.items.map(item => (
          <SubItem key={item.id} item={item} collapsed={collapsed} />
        ))}
      </div>
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Состояние раскрытия секций — инициализируем из localStorage
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const saved = loadOpenSections();
    // По умолчанию все collapsible секции открыты
    const defaults: Record<string, boolean> = {};
    COLLAPSIBLE_SECTIONS.forEach(k => { defaults[k] = true; });
    return { ...defaults, ...saved };
  });

  // Автоматически раскрываем активную секцию при навигации
  useEffect(() => {
    const activeSection = NAV_SECTIONS.find(s => isSectionActive(location.pathname, s));
    if (activeSection && COLLAPSIBLE_SECTIONS.has(activeSection.key)) {
      setOpenSections(prev => {
        if (prev[activeSection.key]) return prev; // уже открыта, не трогаем
        const next = { ...prev, [activeSection.key]: true };
        saveOpenSections(next);
        return next;
      });
    }
  }, [location.pathname]);

  const toggleSection = useCallback((key: string) => {
    setOpenSections(prev => {
      // Нельзя закрыть активную секцию
      const section = NAV_SECTIONS.find(s => s.key === key);
      if (section && isSectionActive(location.pathname, section)) return prev;
      const next = { ...prev, [key]: !prev[key] };
      saveOpenSections(next);
      return next;
    });
  }, [location.pathname]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(v => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const canGoBack = location.pathname !== "/cabinet" && location.pathname !== "/";

  return (
    <div className="min-h-screen bg-slate-50 flex">

      {/* ── Sidebar (desktop) ── */}
      <aside className={`hidden lg:flex flex-col fixed top-0 left-0 h-screen bg-white border-r border-slate-200 transition-all duration-200 z-20 ${collapsed ? "w-16" : "w-60"}`}>

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
            <button onClick={() => setCollapsed(true)} className="ml-auto text-slate-400 hover:text-slate-600 transition-colors p-1 rounded">
              <Icon name="PanelLeftClose" size={16} />
            </button>
          )}
        </div>

        {collapsed && (
          <button onClick={() => setCollapsed(false)} className="flex items-center justify-center py-2 text-slate-400 hover:text-slate-600 transition-colors">
            <Icon name="PanelLeftOpen" size={16} />
          </button>
        )}

        {/* Primary nav */}
        <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
          {NAV_SECTIONS.map(section => (
            <SectionGroup
              key={section.key}
              section={section}
              collapsed={collapsed}
              isOpen={openSections[section.key] ?? true}
              onToggle={() => toggleSection(section.key)}
            />
          ))}
        </nav>

        {/* Secondary (Кошелёк) + user */}
        <div className="px-2 py-3 border-t border-slate-100 space-y-0.5">
          {NAV_SECONDARY.map(item => (
            <SubItem key={item.id} item={item} collapsed={collapsed} />
          ))}

          <div className="my-2 border-t border-slate-100" />

          <div className={`flex items-center gap-2.5 px-3 py-2 rounded-xl ${collapsed ? "justify-center px-2" : ""}`}>
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-semibold">{user?.name?.charAt(0)?.toUpperCase() ?? "U"}</span>
            </div>
            {!collapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-800 truncate">{user?.name}</div>
                  <div className="text-[10px] text-slate-400 truncate">{user?.email}</div>
                </div>
                <button onClick={logout} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded" title="Выйти">
                  <Icon name="LogOut" size={14} />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-200 ${collapsed ? "lg:ml-16" : "lg:ml-60"}`}>

        {/* Top bar */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10 h-14">
          <div className="px-4 lg:px-6 h-full flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Link to="/cabinet" className="flex items-center gap-2 lg:hidden">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
                  <span className="text-white font-bold text-xs">Т</span>
                </div>
                <span className="font-bold text-sm text-slate-900">Траектория</span>
              </Link>
              {canGoBack && (
                <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors px-2 py-1.5 rounded-lg hover:bg-slate-100">
                  <Icon name="ArrowLeft" size={16} />
                  <span className="hidden sm:block text-sm">Назад</span>
                </button>
              )}
            </div>

            <div className="flex-1 max-w-xs hidden md:block">
              <button onClick={() => setSearchOpen(true)} className="w-full flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-400 cursor-pointer hover:bg-slate-100 transition-colors">
                <Icon name="Search" size={15} />
                <span className="flex-1 text-left">Поиск...</span>
                <kbd className="hidden lg:flex items-center gap-0.5 text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => setSearchOpen(true)} className="md:hidden w-8 h-8 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 transition-colors">
                <Icon name="Search" size={18} />
              </button>
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
                  <span className="text-white text-xs font-semibold">{user?.name?.charAt(0)?.toUpperCase() ?? "U"}</span>
                </div>
                <span className="text-sm font-medium text-slate-700 max-w-[100px] truncate">{user?.name}</span>
                <Icon name="ChevronDown" size={14} className="text-slate-400" />
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 pb-20 lg:pb-6">{children}</main>
      </div>

      {/* ── Mobile bottom nav ── */}
      <nav
        className="lg:hidden bg-white border-t border-slate-200 z-50 h-16"
        style={{ position: "fixed", bottom: 0, left: 0, right: 0, paddingBottom: "env(safe-area-inset-bottom, 0px)", transform: "translateZ(0)", WebkitTransform: "translateZ(0)" }}
      >
        <div className="flex items-center justify-around h-full px-2">
          {MOBILE_NAV.map(item => {
            const isActive = item.href === "/cabinet"
              ? location.pathname === "/cabinet"
              : location.pathname.startsWith(item.href);
            return (
              <Link key={item.href} to={item.href} className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-colors ${isActive ? "text-slate-900" : "text-slate-400"}`}>
                <Icon name={item.icon} size={20} className={isActive ? "text-slate-800" : "text-slate-400"} />
                <span className={`text-[10px] font-medium leading-none ${isActive ? "text-slate-800" : "text-slate-400"}`}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <GlobalSearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}