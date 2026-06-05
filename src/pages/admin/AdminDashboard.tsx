import { useNavigate } from "react-router-dom";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import AiContextExporter from "@/components/admin/AiContextExporter";

type Card = { label: string; icon: string; href: string; color: string; highlight?: boolean };

const PLATFORM: Card[] = [
  { label: "Штаб",        icon: "Command",    href: "/admin/hq",      color: "text-violet-400", highlight: true },
  { label: "План",        icon: "ClipboardList", href: "/admin/plan",  color: "text-indigo-400" },
  { label: "Архитектура", icon: "Map",        href: "/admin/project",  color: "text-cyan-400" },
  { label: "Паспорт",     icon: "BookMarked", href: "/admin/passport", color: "text-emerald-400" },
];

const OPERATIONS: Card[] = [
  { label: "Ошибки",     icon: "AlertTriangle", href: "/admin/errors", color: "text-red-400" },
  { label: "Алерты",     icon: "Bell",          href: "/admin/alerts", color: "text-amber-400" },
  { label: "Флаги",      icon: "ToggleRight",   href: "/admin/flags",  color: "text-violet-400" },
  { label: "Активность", icon: "Activity",      href: "/admin/activity", color: "text-orange-400" },
  { label: "Аудит",      icon: "ShieldCheck",   href: "/admin/audit",  color: "text-red-400" },
];

const USERS_AND_PROJECTS: Card[] = [
  { label: "Пользователи", icon: "Users",      href: "/admin/users",    color: "text-blue-400" },
  { label: "Проекты",      icon: "FolderOpen", href: "/admin/projects", color: "text-purple-400" },
];

function CardGroup({ title, icon, cards }: { title: string; icon: string; cards: Card[] }) {
  const navigate = useNavigate();
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon name={icon} size={13} className="text-gray-600" />
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{title}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {cards.map(card => (
          <button
            key={card.href}
            onClick={() => navigate(card.href)}
            className={`group flex flex-col gap-3 p-4 rounded-xl border text-left transition-all ${
              card.highlight
                ? "bg-violet-900/20 border-violet-800 hover:border-violet-600"
                : "bg-gray-900 border-gray-800 hover:border-gray-700"
            }`}
          >
            <Icon name={card.icon} size={20} className={card.color} />
            <span className="text-sm font-medium text-gray-400 group-hover:text-white transition-colors leading-tight">
              {card.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <AdminShell>
      <div className="p-6 max-w-3xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Command Center</h1>
          <p className="text-gray-500 text-sm mt-1">Управление платформой</p>
        </div>

        <CardGroup title="Platform" icon="Layers" cards={PLATFORM} />
        <CardGroup title="Operations" icon="Cpu" cards={OPERATIONS} />
        <CardGroup title="Users & Projects" icon="Users" cards={USERS_AND_PROJECTS} />

        <div className="pt-2 border-t border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Icon name="BrainCircuit" size={13} className="text-gray-600" />
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">AI Context</span>
            </div>
          </div>
          <AiContextExporter defaultScope="full" variant="card" />
        </div>
      </div>
    </AdminShell>
  );
}