import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import AiContextExporter from "@/components/admin/AiContextExporter";
import { ticketsApi, contentApi } from "@/lib/admin-api";

type Card = { label: string; icon: string; href: string; color: string; highlight?: boolean; badge?: string; badgeNote?: string };

// Дата синхронизации планового контура (HQ / plan / roadmap) с фактическим состоянием продукта
const SYNC_DATE = "11.07.2026";

const PLATFORM: Card[] = [
  { label: "Штаб",        icon: "Command",    href: "/admin/hq",      color: "text-violet-400", highlight: true, badge: "Актуализировано", badgeNote: `HQ / plan / roadmap синхронизированы · ${SYNC_DATE}` },
  { label: "План",        icon: "ClipboardList", href: "/admin/plan",  color: "text-indigo-400" },
  { label: "Архитектура", icon: "Map",        href: "/admin/project",  color: "text-cyan-400" },
  { label: "Паспорт",     icon: "BookMarked", href: "/admin/passport", color: "text-emerald-400" },
];

const OPERATIONS: Card[] = [
  { label: "Ошибки",     icon: "AlertTriangle", href: "/admin/errors",   color: "text-red-400" },
  { label: "Алерты",     icon: "Bell",          href: "/admin/alerts",   color: "text-amber-400" },
  { label: "Флаги",      icon: "ToggleRight",   href: "/admin/flags",    color: "text-violet-400" },
  { label: "Тикеты",     icon: "Ticket",        href: "/admin/tickets",  color: "text-sky-400" },
  { label: "Контент",    icon: "FileText",      href: "/admin/content",  color: "text-cyan-400" },
  { label: "Активность", icon: "Activity",      href: "/admin/activity", color: "text-orange-400" },
  { label: "Аудит",      icon: "ShieldCheck",   href: "/admin/audit",    color: "text-red-400" },
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
            {card.badge && (
              <span
                title={card.badgeNote}
                className="inline-flex items-center gap-1 self-start rounded-md border border-teal-800/60 bg-teal-900/25 px-1.5 py-0.5 text-[10px] font-medium text-teal-300/90"
              >
                <Icon name="Check" size={10} />
                {card.badge}
              </span>
            )}
            {card.badgeNote && (
              <span className="text-[10px] leading-tight text-gray-600">{card.badgeNote}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

type TicketSummary = { new: number; open: number; urgent: number; unassigned: number; waiting_user: number; active: number };

function TicketsSummaryWidget() {
  const navigate = useNavigate();
  const [s, setS] = useState<TicketSummary | null>(null);
  useEffect(() => {
    ticketsApi.summary().then(r => { if (r.ok) setS(r.data.summary); }).catch(() => {});
  }, []);
  if (!s) return null;
  const items = [
    { label: "Открытые",  value: s.open,         color: "text-emerald-400" },
    { label: "Срочные",   value: s.urgent,       color: "text-red-400" },
    { label: "Без исп.",  value: s.unassigned,   color: "text-amber-400" },
    { label: "Ожидают",   value: s.waiting_user, color: "text-blue-400" },
  ];
  return (
    <button onClick={() => navigate("/admin/tickets")}
      className="w-full text-left bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl px-4 py-3 transition-all">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Icon name="Ticket" size={13} className="text-sky-400" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Поддержка</span>
        </div>
        <span className="text-[10px] text-gray-700">{s.active} активных</span>
      </div>
      <div className="flex gap-4">
        {items.map(i => (
          <div key={i.label}>
            <p className={`text-lg font-bold ${i.color}`}>{i.value}</p>
            <p className="text-[10px] text-gray-600">{i.label}</p>
          </div>
        ))}
      </div>
    </button>
  );
}

type ContentSummaryType = { draft: number; review: number; published: number; published_week: number };
type CommSummaryType    = { draft: number; scheduled: number; sent_today: number; failed: number };

function ContentSummaryWidget() {
  const navigate = useNavigate();
  const [cs, setCs] = useState<ContentSummaryType | null>(null);
  const [ms, setMs] = useState<CommSummaryType | null>(null);
  useEffect(() => {
    contentApi.contentSummary().then(r => { if (r.ok) setCs(r.data.summary); }).catch(() => {});
    contentApi.commSummary().then(r => { if (r.ok) setMs(r.data.summary); }).catch(() => {});
  }, []);
  if (!cs && !ms) return null;
  return (
    <button onClick={() => navigate("/admin/content")}
      className="w-full text-left bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl px-4 py-3 transition-all">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Icon name="FileText" size={13} className="text-cyan-400" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Контент</span>
        </div>
        {ms && ms.failed > 0 && (
          <span className="text-[10px] text-red-400">{ms.failed} ошибок</span>
        )}
      </div>
      <div className="flex gap-6">
        {cs && (
          <>
            <div><p className="text-lg font-bold text-emerald-400">{cs.published}</p><p className="text-[10px] text-gray-600">Опубл.</p></div>
            <div><p className="text-lg font-bold text-amber-400">{cs.review}</p><p className="text-[10px] text-gray-600">На ревью</p></div>
            <div><p className="text-lg font-bold text-gray-400">{cs.draft}</p><p className="text-[10px] text-gray-600">Черновик</p></div>
          </>
        )}
        {ms && (
          <>
            <div className="border-l border-gray-800 pl-4 ml-2">
              <p className="text-lg font-bold text-blue-400">{ms.scheduled}</p><p className="text-[10px] text-gray-600">Запланир.</p>
            </div>
            <div><p className="text-lg font-bold text-emerald-400">{ms.sent_today}</p><p className="text-[10px] text-gray-600">Отправлено</p></div>
          </>
        )}
      </div>
    </button>
  );
}

export default function AdminDashboard() {
  return (
    <AdminShell>
      <div className="p-6 max-w-3xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Центр управления</h1>
          <p className="text-gray-500 text-sm mt-1">Управление платформой</p>
        </div>

        <CardGroup title="Платформа" icon="Layers" cards={PLATFORM} />
        <CardGroup title="Операции" icon="Cpu" cards={OPERATIONS} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TicketsSummaryWidget />
          <ContentSummaryWidget />
        </div>
        <CardGroup title="Пользователи и проекты" icon="Users" cards={USERS_AND_PROJECTS} />

        <div className="pt-2 border-t border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Icon name="BrainCircuit" size={13} className="text-gray-600" />
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">AI-контекст</span>
            </div>
          </div>
          <AiContextExporter defaultScope="full" variant="card" />
        </div>
      </div>
    </AdminShell>
  );
}