import { useState, useEffect, useCallback } from "react";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import { passportApi, type PPModuleStatus, type PPModuleCategory, type PPEntityKind, type PPOverlapType, type PPOverlapStatus } from "@/lib/admin-api";
import AiContextExporter from "@/components/admin/AiContextExporter";

// ── Types ─────────────────────────────────────────────────────────────────────
type Module = {
  id: number; name: string; slug: string; category: PPModuleCategory; layer: string;
  description: string; status: PPModuleStatus; owner_email: string;
  backup_owner_email: string; primary_route: string; source_of_truth: string;
  notes: string; updated_at: string; updated_by: string;
};
type Route = {
  id: number; module_id: number; title: string; route: string; route_type: string;
  description: string; status: string; owner_email: string;
  updated_at: string; updated_by: string; module_name: string;
};
type Entity = {
  id: number; name: string; kind: PPEntityKind; description: string;
  module_id: number | null; source_of_truth_module_id: number | null;
  source_of_truth_details: string; owner_email: string;
  data_class: string; status: string; notes: string;
  updated_at: string; updated_by: string;
  module_name: string | null; sot_module_name: string | null;
};
type Dependency = {
  id: number; from_module_id: number; to_module_id: number;
  dep_type: string; criticality: string; notes: string;
  updated_at: string; updated_by: string;
  from_name: string; to_name: string;
};
type Overlap = {
  id: number; overlap_type: PPOverlapType; status: PPOverlapStatus;
  title: string; description: string; related_module_id: number | null;
  resolution: string; updated_at: string; updated_by: string; module_name: string | null;
};
type Notes = { content: string; updated_at: string; updated_by: string };
type Summary = {
  total_modules: number; total_routes: number; total_entities: number;
  no_owner_modules: number; no_sot_entities: number; open_overlaps: number; norm_pct: number;
};

// ── Config ────────────────────────────────────────────────────────────────────
const CAT_LABEL: Record<PPModuleCategory, string> = {
  platform: "Платформа", operations: "Операции", content: "Контент",
  analytics: "Аналитика", support: "Поддержка", finance: "Финансы", domain: "Домен",
};
const CAT_COLOR: Record<PPModuleCategory, string> = {
  platform:   "bg-violet-900/40 text-violet-300 border-violet-800",
  operations: "bg-blue-900/40 text-blue-300 border-blue-800",
  content:    "bg-emerald-900/40 text-emerald-300 border-emerald-800",
  analytics:  "bg-cyan-900/40 text-cyan-300 border-cyan-800",
  support:    "bg-amber-900/40 text-amber-300 border-amber-800",
  finance:    "bg-green-900/40 text-green-300 border-green-800",
  domain:     "bg-slate-700 text-slate-300 border-slate-600",
};
const STATUS_COLOR: Record<string, string> = {
  active:     "text-emerald-400",
  planned:    "text-blue-400",
  deprecated: "text-gray-600",
  draft:      "text-amber-400",
};
const STATUS_LABEL: Record<string, string> = {
  active:     "Активен",
  planned:    "Запланировано",
  deprecated: "Устарел",
  draft:      "Черновик",
};
const OVERLAP_TYPE_LABEL: Record<PPOverlapType, string> = {
  duplicate:          "Дубль",
  overlap:            "Пересечение",
  responsibility_gap: "Нет owner",
  unclear_boundary:   "Неясность",
  missing_owner:      "Нет owner",
};
const OVERLAP_TYPE_COLOR: Record<PPOverlapType, string> = {
  duplicate:          "bg-red-900/40 text-red-400 border-red-800",
  overlap:            "bg-amber-900/40 text-amber-400 border-amber-800",
  responsibility_gap: "bg-orange-900/40 text-orange-400 border-orange-800",
  unclear_boundary:   "bg-slate-700 text-slate-300 border-slate-600",
  missing_owner:      "bg-orange-900/40 text-orange-400 border-orange-800",
};
const KIND_LABEL: Record<PPEntityKind, string> = {
  business: "Бизнес", system: "Система", content: "Контент",
  analytics: "Аналитика", support: "Поддержка", finance: "Финансы", internal: "Внутренняя",
};
const MODULE_CATEGORIES: PPModuleCategory[] = ["platform","operations","content","analytics","support","finance","domain"];
const MODULE_STATUSES: PPModuleStatus[] = ["active","planned","deprecated","draft"];
const ENTITY_KINDS: PPEntityKind[] = ["business","system","content","analytics","support","finance","internal"];
const OVERLAP_TYPES: PPOverlapType[] = ["duplicate","overlap","responsibility_gap","unclear_boundary","missing_owner"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function Badge({ label, color }: { label: string; color: string }) {
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${color}`}>{label}</span>;
}
function LastUpdated({ at, by }: { at?: string; by?: string }) {
  if (!at || at.startsWith("0001")) return null;
  const d = new Date(at);
  if (isNaN(d.getTime())) return null;
  const fmt = d.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <p className="text-[10px] text-gray-700 flex items-center gap-1 mt-1">
      <Icon name="Clock" size={9} />{fmt}{by ? <><span className="mx-0.5">·</span>{by}</> : null}
    </p>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="px-5 py-8 text-center text-gray-600 text-sm">{text}</div>;
}
function AddBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 border border-gray-800 hover:border-gray-700 px-3 py-1.5 rounded-lg transition-all">
      <Icon name="Plus" size={12} /> {label}
    </button>
  );
}
function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="mb-1.5">
      <span className="text-[10px] text-gray-600 uppercase tracking-wider">{label}:</span>
      <span className="text-xs text-gray-400 ml-1.5">{value}</span>
    </div>
  );
}

// ── Module card ───────────────────────────────────────────────────────────────
function ModuleCard({ m, onStatusChange }: {
  m: Module;
  onStatusChange: (m: Module, next: PPModuleStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-gray-800/30 transition-colors">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-200">{m.name}</span>
            <Badge label={CAT_LABEL[m.category]} color={CAT_COLOR[m.category]} />
            {!m.owner_email && <Badge label="Нет owner" color="bg-red-900/40 text-red-400 border-red-800" />}
          </div>
          {m.primary_route && <p className="text-[11px] text-gray-600 mt-0.5 font-mono">{m.primary_route}</p>}
          {m.description && <p className="text-xs text-gray-500 mt-1 line-clamp-1">{m.description}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={e => { e.stopPropagation(); onStatusChange(m, MODULE_STATUSES[(MODULE_STATUSES.indexOf(m.status) + 1) % MODULE_STATUSES.length]); }}
            className={`text-[11px] font-medium ${STATUS_COLOR[m.status] || "text-gray-400"}`}>
            {STATUS_LABEL[m.status] ?? m.status}
          </button>
          <Icon name={open ? "ChevronUp" : "ChevronDown"} size={13} className="text-gray-600" />
        </div>
      </button>
      {open && (
        <div className="border-t border-gray-800 px-4 py-3 bg-gray-800/20">
          <Field label="Ответственный" value={m.owner_email} />
          <Field label="Слой"          value={m.layer} />
          <Field label="SOT"           value={m.source_of_truth} />
          <Field label="Заметки"       value={m.notes} />
          <LastUpdated at={m.updated_at} by={m.updated_by} />
        </div>
      )}
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
type Tab = "modules" | "routes" | "entities" | "dependencies" | "overlaps" | "notes";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "modules",      label: "Модули",      icon: "Boxes" },
  { id: "routes",       label: "Маршруты",    icon: "Route" },
  { id: "entities",     label: "Сущности",    icon: "Database" },
  { id: "dependencies", label: "Зависимости", icon: "GitMerge" },
  { id: "overlaps",     label: "Конфликты",   icon: "AlertCircle" },
  { id: "notes",        label: "Заметки",     icon: "PenLine" },
];

// ══════════════════════════════════════════════════════════════════════════════
export default function AdminPassportPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("modules");
  const [modules,      setModules]      = useState<Module[]>([]);
  const [routes,       setRoutes]       = useState<Route[]>([]);
  const [entities,     setEntities]     = useState<Entity[]>([]);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [overlaps,     setOverlaps]     = useState<Overlap[]>([]);
  const [notes,        setNotes]        = useState<Notes>({ content: "", updated_at: "", updated_by: "" });
  const [summary,      setSummary]      = useState<Summary>({ total_modules: 0, total_routes: 0, total_entities: 0, no_owner_modules: 0, no_sot_entities: 0, open_overlaps: 0, norm_pct: 0 });

  const [search,      setSearch]      = useState("");
  const [catFilter,   setCatFilter]   = useState<PPModuleCategory | "all">("all");
  const [statusFilter, setStatusFilter] = useState<PPModuleStatus | "all">("all");
  const [onlyProblems, setOnlyProblems] = useState(false);

  // add forms
  const [addingModule,   setAddingModule]   = useState(false);
  const [newModule, setNewModule] = useState({ name:"", slug:"", category:"platform" as PPModuleCategory, primary_route:"", owner_email:"", description:"", status:"active" as PPModuleStatus });
  const [addingRoute,    setAddingRoute]    = useState(false);
  const [newRoute, setNewRoute] = useState({ module_id: 0, title:"", route:"", route_type:"page", owner_email:"" });
  const [addingEntity,   setAddingEntity]   = useState(false);
  const [newEntity, setNewEntity] = useState({ name:"", kind:"business" as PPEntityKind, module_id: null as number | null, owner_email:"", description:"", source_of_truth_details:"" });
  const [addingOverlap,  setAddingOverlap]  = useState(false);
  const [newOverlap, setNewOverlap] = useState({ title:"", overlap_type:"unclear_boundary" as PPOverlapType, description:"", related_module_id: null as number | null });
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await passportApi.all();
    if (res.ok) {
      setModules(res.data.modules || []);
      setRoutes(res.data.routes || []);
      setEntities(res.data.entities || []);
      setDependencies(res.data.dependencies || []);
      setOverlaps(res.data.overlaps || []);
      setNotes(res.data.notes || { content: "", updated_at: "", updated_by: "" });
      setSummary(res.data.summary || {});
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Actions ────────────────────────────────────────────────────────────────
  async function changeModuleStatus(m: Module, next: PPModuleStatus) {
    setModules(prev => prev.map(x => x.id === m.id ? { ...x, status: next } : x));
    const res = await passportApi.updateModule({ id: m.id, status: next });
    if (!res.ok) {
      setModules(prev => prev.map(x => x.id === m.id ? { ...x, status: m.status } : x));
      toast({ title: "Не удалось обновить", variant: "destructive" });
    }
  }

  async function submitModule() {
    if (!newModule.name.trim() || !newModule.slug.trim()) return;
    const res = await passportApi.addModule(newModule as unknown as Record<string, string>);
    if (res.ok) {
      setModules(prev => [...prev, { ...newModule, id: res.data.id, layer: "admin", backup_owner_email: "", source_of_truth: "", notes: "", updated_at: new Date().toISOString(), updated_by: "" }]);
      setNewModule({ name:"", slug:"", category:"platform", primary_route:"", owner_email:"", description:"", status:"active" });
      setAddingModule(false);
      setSummary(s => ({ ...s, total_modules: s.total_modules + 1 }));
      toast({ title: "Модуль добавлен" });
    } else toast({ title: "Ошибка", variant: "destructive" });
  }

  async function submitRoute() {
    if (!newRoute.title.trim() || !newRoute.route.trim() || !newRoute.module_id) return;
    const res = await passportApi.addRoute(newRoute as { module_id: number; title: string; route: string; route_type: string; owner_email: string });
    if (res.ok) {
      const mod = modules.find(m => m.id === newRoute.module_id);
      setRoutes(prev => [...prev, { ...newRoute, id: res.data.id, description: "", status: "active", updated_at: new Date().toISOString(), updated_by: "", module_name: mod?.name || "" }]);
      setNewRoute({ module_id: 0, title:"", route:"", route_type:"page", owner_email:"" });
      setAddingRoute(false);
      toast({ title: "Маршрут добавлен" });
    } else toast({ title: "Ошибка", variant: "destructive" });
  }

  async function submitEntity() {
    if (!newEntity.name.trim()) return;
    const res = await passportApi.addEntity(newEntity as unknown as Record<string, string | number | null>);
    if (res.ok) {
      const mod = modules.find(m => m.id === newEntity.module_id);
      setEntities(prev => [...prev, { ...newEntity, id: res.data.id, source_of_truth_module_id: null, source_of_truth_details: "", data_class: "internal", status: "active", notes: "", updated_at: new Date().toISOString(), updated_by: "", module_name: mod?.name || null, sot_module_name: null }]);
      setNewEntity({ name:"", kind:"business", module_id: null, owner_email:"", description:"", source_of_truth_details:"" });
      setAddingEntity(false);
      toast({ title: "Сущность добавлена" });
    } else toast({ title: "Ошибка", variant: "destructive" });
  }

  async function submitOverlap() {
    if (!newOverlap.title.trim()) return;
    const res = await passportApi.addOverlap(newOverlap);
    if (res.ok) {
      const mod = modules.find(m => m.id === newOverlap.related_module_id);
      setOverlaps(prev => [...prev, { ...newOverlap, id: res.data.id, status: "open" as PPOverlapStatus, resolution: "", updated_at: new Date().toISOString(), updated_by: "", module_name: mod?.name || null }]);
      setNewOverlap({ title:"", overlap_type:"unclear_boundary", description:"", related_module_id: null });
      setAddingOverlap(false);
      setSummary(s => ({ ...s, open_overlaps: s.open_overlaps + 1 }));
      toast({ title: "Конфликт добавлен" });
    } else toast({ title: "Ошибка", variant: "destructive" });
  }

  async function toggleOverlap(o: Overlap) {
    const next: PPOverlapStatus = o.status === "open" ? "resolved" : "open";
    setOverlaps(prev => prev.map(x => x.id === o.id ? { ...x, status: next } : x));
    const res = await passportApi.updateOverlap({ id: o.id, status: next });
    if (!res.ok) {
      setOverlaps(prev => prev.map(x => x.id === o.id ? { ...x, status: o.status } : x));
      toast({ title: "Ошибка", variant: "destructive" });
    } else {
      setSummary(s => ({ ...s, open_overlaps: next === "open" ? s.open_overlaps + 1 : s.open_overlaps - 1 }));
    }
  }

  async function saveNotes() {
    const res = await passportApi.saveNotes(notesDraft);
    if (res.ok) {
      setNotes(prev => ({ ...prev, content: notesDraft }));
      setEditingNotes(false);
      toast({ title: "Сохранено" });
    } else toast({ title: "Ошибка", variant: "destructive" });
  }

  // ── Filters ────────────────────────────────────────────────────────────────
  const filteredModules = modules.filter(m => {
    if (catFilter !== "all" && m.category !== catFilter) return false;
    if (statusFilter !== "all" && m.status !== statusFilter) return false;
    if (onlyProblems && m.owner_email) return false;
    if (search && !m.name.toLowerCase().includes(search.toLowerCase()) && !m.slug.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (loading) {
    return (
      <AdminShell>
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="p-6 max-w-4xl space-y-6">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-900 flex items-center justify-center flex-shrink-0">
              <Icon name="BookMarked" size={18} className="text-emerald-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Паспорт платформы</h1>
              <p className="text-gray-500 text-sm mt-0.5">Реестр модулей, сущностей, owners и связей платформы</p>
            </div>
          </div>
          <AiContextExporter defaultScope="passport" />
        </div>

        {/* ── Overview cards ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Модулей",     value: summary.total_modules,    icon: "Boxes",        color: "text-violet-400" },
            { label: "Маршрутов",   value: summary.total_routes,     icon: "Route",        color: "text-blue-400" },
            { label: "Сущностей",   value: summary.total_entities,   icon: "Database",     color: "text-cyan-400" },
            { label: "Нормализация",value: `${summary.norm_pct}%`,    icon: "CheckCircle2", color: summary.norm_pct > 70 ? "text-emerald-400" : "text-amber-400" },
          ].map(c => (
            <div key={c.label} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
              <Icon name={c.icon} size={14} className={`${c.color} mb-1.5`} />
              <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
              <p className="text-[11px] text-gray-600">{c.label}</p>
            </div>
          ))}
        </div>

        {/* Alerts row */}
        {(summary.no_owner_modules > 0 || summary.no_sot_entities > 0 || summary.open_overlaps > 0) && (
          <div className="flex gap-2 flex-wrap">
            {summary.no_owner_modules > 0 && <span className="text-xs bg-red-900/30 text-red-400 border border-red-900 px-3 py-1 rounded-full">{summary.no_owner_modules} модулей без owner</span>}
            {summary.no_sot_entities  > 0 && <span className="text-xs bg-amber-900/30 text-amber-400 border border-amber-900 px-3 py-1 rounded-full">{summary.no_sot_entities} сущностей без source of truth</span>}
            {summary.open_overlaps    > 0 && <span className="text-xs bg-orange-900/30 text-orange-400 border border-orange-900 px-3 py-1 rounded-full">{summary.open_overlaps} открытых конфликтов</span>}
          </div>
        )}

        {/* ── Tabs ──────────────────────────────────────────────────────────── */}
        <div className="flex gap-1 flex-wrap border-b border-gray-800 pb-px">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors ${
                tab === t.id ? "bg-gray-900 text-white border border-b-gray-900 border-gray-800 -mb-px" : "text-gray-500 hover:text-gray-300"
              }`}>
              <Icon name={t.icon} size={12} /> {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab: Modules ──────────────────────────────────────────────────── */}
        {tab === "modules" && (
          <div className="space-y-3">
            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск..."
                className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-violet-600 w-48" />
              <select value={catFilter} onChange={e => setCatFilter(e.target.value as PPModuleCategory | "all")}
                className="bg-gray-900 border border-gray-800 text-gray-400 rounded-lg px-2 py-1.5 text-xs focus:outline-none">
                <option value="all">Все категории</option>
                {MODULE_CATEGORIES.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
              </select>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as PPModuleStatus | "all")}
                className="bg-gray-900 border border-gray-800 text-gray-400 rounded-lg px-2 py-1.5 text-xs focus:outline-none">
                <option value="all">Все статусы</option>
                {MODULE_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
              </select>
              <button onClick={() => setOnlyProblems(v => !v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${onlyProblems ? "bg-red-900/40 text-red-400 border border-red-900" : "bg-gray-900 text-gray-500 border border-gray-800"}`}>
                Только проблемные
              </button>
              <div className="ml-auto">
                <AddBtn label="Добавить модуль" onClick={() => setAddingModule(true)} />
              </div>
            </div>

            {addingModule && (
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl px-5 py-4 space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <input value={newModule.name} onChange={e => setNewModule(p => ({ ...p, name: e.target.value }))}
                    placeholder="Название" autoFocus
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-600" />
                  <input value={newModule.slug} onChange={e => setNewModule(p => ({ ...p, slug: e.target.value }))}
                    placeholder="slug (hq, plan, passport...)"
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-600" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input value={newModule.primary_route} onChange={e => setNewModule(p => ({ ...p, primary_route: e.target.value }))}
                    placeholder="Маршрут (/admin/...)"
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-600" />
                  <input value={newModule.owner_email} onChange={e => setNewModule(p => ({ ...p, owner_email: e.target.value }))}
                    placeholder="Owner email"
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-600" />
                </div>
                <div className="flex gap-2">
                  <select value={newModule.category} onChange={e => setNewModule(p => ({ ...p, category: e.target.value as PPModuleCategory }))}
                    className="bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none">
                    {MODULE_CATEGORIES.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
                  </select>
                </div>
                <input value={newModule.description} onChange={e => setNewModule(p => ({ ...p, description: e.target.value }))}
                  placeholder="Описание"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-600" />
                <div className="flex gap-2">
                  <button onClick={submitModule} className="px-4 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-lg">Добавить</button>
                  <button onClick={() => setAddingModule(false)} className="px-4 py-1.5 bg-gray-700 text-gray-300 text-xs rounded-lg">Отмена</button>
                </div>
              </div>
            )}

            {filteredModules.length === 0 && <Empty text="Модулей не найдено" />}
            <div className="space-y-2">
              {filteredModules.map(m => (
                <ModuleCard key={m.id} m={m} onStatusChange={changeModuleStatus} />
              ))}
            </div>
          </div>
        )}

        {/* ── Tab: Routes ───────────────────────────────────────────────────── */}
        {tab === "routes" && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <AddBtn label="Добавить маршрут" onClick={() => setAddingRoute(true)} />
            </div>
            {addingRoute && (
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl px-5 py-4 space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <input value={newRoute.title} onChange={e => setNewRoute(p => ({ ...p, title: e.target.value }))}
                    placeholder="Название страницы" autoFocus
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-600" />
                  <input value={newRoute.route} onChange={e => setNewRoute(p => ({ ...p, route: e.target.value }))}
                    placeholder="/admin/..."
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-600" />
                </div>
                <div className="flex gap-2">
                  <select value={newRoute.module_id} onChange={e => setNewRoute(p => ({ ...p, module_id: +e.target.value }))}
                    className="bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none flex-1">
                    <option value={0}>Выбрать модуль</option>
                    {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <select value={newRoute.route_type} onChange={e => setNewRoute(p => ({ ...p, route_type: e.target.value }))}
                    className="bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none">
                    {["page","subpage","tool","api-facing"].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={submitRoute} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg">Добавить</button>
                  <button onClick={() => setAddingRoute(false)} className="px-4 py-1.5 bg-gray-700 text-gray-300 text-xs rounded-lg">Отмена</button>
                </div>
              </div>
            )}
            {routes.length === 0 && <Empty text="Маршрутов пока нет" />}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-800">
              {routes.map(r => (
                <div key={r.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-gray-200">{r.title}</span>
                      <span className="text-[10px] font-mono text-gray-500">{r.route}</span>
                      {r.module_name && <Badge label={r.module_name} color="bg-slate-700 text-slate-300 border-slate-600" />}
                    </div>
                    {r.owner_email && <p className="text-xs text-gray-600 mt-0.5">{r.owner_email}</p>}
                    <LastUpdated at={r.updated_at} by={r.updated_by} />
                  </div>
                  <span className={`text-[11px] font-medium flex-shrink-0 ${STATUS_COLOR[r.status] || "text-gray-500"}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Tab: Entities ─────────────────────────────────────────────────── */}
        {tab === "entities" && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <AddBtn label="Добавить сущность" onClick={() => setAddingEntity(true)} />
            </div>
            {addingEntity && (
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl px-5 py-4 space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <input value={newEntity.name} onChange={e => setNewEntity(p => ({ ...p, name: e.target.value }))}
                    placeholder="Имя сущности (snake_case)" autoFocus
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-600" />
                  <select value={newEntity.kind} onChange={e => setNewEntity(p => ({ ...p, kind: e.target.value as PPEntityKind }))}
                    className="bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none">
                    {ENTITY_KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <select value={newEntity.module_id ?? ""} onChange={e => setNewEntity(p => ({ ...p, module_id: e.target.value ? +e.target.value : null }))}
                    className="bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none flex-1">
                    <option value="">Модуль-владелец</option>
                    {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <input value={newEntity.owner_email} onChange={e => setNewEntity(p => ({ ...p, owner_email: e.target.value }))}
                    placeholder="Owner email"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-600" />
                </div>
                <input value={newEntity.description} onChange={e => setNewEntity(p => ({ ...p, description: e.target.value }))}
                  placeholder="Описание"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-600" />
                <div className="flex gap-2">
                  <button onClick={submitEntity} className="px-4 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-semibold rounded-lg">Добавить</button>
                  <button onClick={() => setAddingEntity(false)} className="px-4 py-1.5 bg-gray-700 text-gray-300 text-xs rounded-lg">Отмена</button>
                </div>
              </div>
            )}
            {entities.length === 0 && <Empty text="Сущностей пока нет" />}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-800">
              {entities.map(e => (
                <div key={e.id} className={`flex items-start gap-3 px-4 py-3 ${!e.source_of_truth_module_id ? "bg-amber-900/5" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-mono text-gray-200">{e.name}</span>
                      <Badge label={KIND_LABEL[e.kind]} color="bg-slate-700 text-slate-300 border-slate-600" />
                      {!e.source_of_truth_module_id && <Badge label="Нет SOT" color="bg-amber-900/40 text-amber-400 border-amber-800" />}
                      {!e.owner_email && <Badge label="Нет owner" color="bg-red-900/40 text-red-400 border-red-800" />}
                    </div>
                    {e.description && <p className="text-xs text-gray-500 mt-0.5">{e.description}</p>}
                    {e.module_name && <p className="text-[10px] text-gray-600 mt-0.5">Модуль: {e.module_name}</p>}
                    {e.sot_module_name && <p className="text-[10px] text-gray-600">SOT: {e.sot_module_name}</p>}
                    <LastUpdated at={e.updated_at} by={e.updated_by} />
                  </div>
                  <span className={`text-[11px] font-medium flex-shrink-0 ${STATUS_COLOR[e.status] || "text-gray-500"}`}>{STATUS_LABEL[e.status] ?? e.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Tab: Dependencies ─────────────────────────────────────────────── */}
        {tab === "dependencies" && (
          <div className="space-y-3">
            {dependencies.length === 0 && <Empty text="Зависимостей пока нет" />}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-800">
              {dependencies.map(d => (
                <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-sm text-gray-300 font-medium">{d.from_name}</span>
                  <Icon name="ArrowRight" size={13} className="text-gray-600 flex-shrink-0" />
                  <span className="text-sm text-gray-300 font-medium">{d.to_name}</span>
                  <Badge label={d.dep_type} color="bg-slate-700 text-slate-300 border-slate-600" />
                  <span className={`ml-auto text-[10px] font-medium ${d.criticality === "high" ? "text-red-400" : d.criticality === "medium" ? "text-amber-400" : "text-gray-500"}`}>
                    {{ high: "Высокий", medium: "Средний", low: "Низкий" }[d.criticality] ?? d.criticality}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Tab: Overlaps ─────────────────────────────────────────────────── */}
        {tab === "overlaps" && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <AddBtn label="Добавить" onClick={() => setAddingOverlap(true)} />
            </div>
            {addingOverlap && (
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl px-5 py-4 space-y-2.5">
                <input value={newOverlap.title} onChange={e => setNewOverlap(p => ({ ...p, title: e.target.value }))}
                  placeholder="Название конфликта / пробела" autoFocus
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-600" />
                <div className="flex gap-2">
                  <select value={newOverlap.overlap_type} onChange={e => setNewOverlap(p => ({ ...p, overlap_type: e.target.value as PPOverlapType }))}
                    className="bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none">
                    {OVERLAP_TYPES.map(t => <option key={t} value={t}>{OVERLAP_TYPE_LABEL[t]}</option>)}
                  </select>
                  <select value={newOverlap.related_module_id ?? ""} onChange={e => setNewOverlap(p => ({ ...p, related_module_id: e.target.value ? +e.target.value : null }))}
                    className="flex-1 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none">
                    <option value="">Связанный модуль</option>
                    {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <textarea value={newOverlap.description} onChange={e => setNewOverlap(p => ({ ...p, description: e.target.value }))}
                  placeholder="Описание" rows={2}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-violet-600" />
                <div className="flex gap-2">
                  <button onClick={submitOverlap} className="px-4 py-1.5 bg-amber-700 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg">Добавить</button>
                  <button onClick={() => setAddingOverlap(false)} className="px-4 py-1.5 bg-gray-700 text-gray-300 text-xs rounded-lg">Отмена</button>
                </div>
              </div>
            )}
            {overlaps.length === 0 && <Empty text="Конфликтов пока нет" />}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-800">
              {overlaps.map(o => (
                <div key={o.id} className="flex items-start gap-3 px-4 py-3.5">
                  <Badge label={OVERLAP_TYPE_LABEL[o.overlap_type]} color={OVERLAP_TYPE_COLOR[o.overlap_type]} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${o.status === "resolved" ? "text-gray-600 line-through" : "text-gray-200"}`}>{o.title}</p>
                    {o.description && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{o.description}</p>}
                    {o.module_name && <p className="text-[10px] text-gray-600 mt-0.5">→ {o.module_name}</p>}
                    <LastUpdated at={o.updated_at} by={o.updated_by} />
                  </div>
                  <button onClick={() => toggleOverlap(o)}
                    className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full border font-semibold transition-all ${o.status === "resolved" ? "border-gray-700 text-gray-600" : "border-amber-800 text-amber-500"}`}>
                    {o.status === "open" ? "Открыт" : "Закрыт"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Tab: Notes ────────────────────────────────────────────────────── */}
        {tab === "notes" && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <Icon name="PenLine" size={14} className="text-gray-400" />
                <span className="text-sm font-semibold text-white">Заметки и AI контекст</span>
              </div>
              {!editingNotes && (
                <button onClick={() => { setNotesDraft(notes.content); setEditingNotes(true); }}
                  className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1">
                  <Icon name="Pencil" size={11} /> Редактировать
                </button>
              )}
            </div>
            <div className="px-5 py-4">
              {editingNotes ? (
                <>
                  <textarea autoFocus value={notesDraft} onChange={e => setNotesDraft(e.target.value)} rows={10}
                    placeholder="Заметки по архитектуре, правила Passport, вопросы без ответа..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 resize-y focus:outline-none focus:border-violet-600" />
                  <div className="flex gap-2 mt-2">
                    <button onClick={saveNotes} className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-lg">Сохранить</button>
                    <button onClick={() => setEditingNotes(false)} className="px-3 py-1.5 bg-gray-800 text-gray-400 text-xs rounded-lg">Отмена</button>
                  </div>
                </>
              ) : (
                <>
                  <p className={`text-sm leading-relaxed whitespace-pre-wrap ${notes.content ? "text-gray-300" : "text-gray-600 italic"}`}>
                    {notes.content || "Заметок пока нет"}
                  </p>
                  {notes.updated_at && !notes.updated_at.startsWith("0001") && (
                    <LastUpdated at={notes.updated_at} by={notes.updated_by} />
                  )}
                  <div className="mt-4 pt-4 border-t border-gray-800">
                    <AiContextExporter defaultScope="passport" variant="button" />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

      </div>
    </AdminShell>
  );
}