import { useState, useEffect } from "react";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import { opsApi, type OpsErrorSeverity, type OpsErrorStatus } from "@/lib/admin-api";

// ── Types ─────────────────────────────────────────────────────────────────────

type OpsError = {
  id: number;
  title: string;
  fingerprint: string;
  module_slug: string;
  source: string;
  environment: string;
  severity: OpsErrorSeverity;
  status: OpsErrorStatus;
  occurrences_count: number;
  first_seen_at: string;
  last_seen_at: string;
  owner_email: string;
  details: string;
  resolution_notes: string;
  updated_at: string;
  updated_by: string;
};

type Summary = { open: number; critical: number; investigating: number; resolved: number };

// ── Config ────────────────────────────────────────────────────────────────────

const SEV: Record<OpsErrorSeverity, { label: string; color: string }> = {
  low:      { label: "Low",      color: "bg-gray-800 text-gray-400 border-gray-700" },
  medium:   { label: "Medium",   color: "bg-amber-900/40 text-amber-400 border-amber-800" },
  high:     { label: "High",     color: "bg-orange-900/40 text-orange-400 border-orange-800" },
  critical: { label: "Critical", color: "bg-red-900/50 text-red-400 border-red-800" },
};

const ST: Record<OpsErrorStatus, { label: string; color: string }> = {
  open:          { label: "Open",          color: "text-red-400" },
  investigating: { label: "Investigating", color: "text-amber-400" },
  muted:         { label: "Muted",         color: "text-gray-600" },
  resolved:      { label: "Resolved",      color: "text-emerald-400" },
};

const SEVERITIES: OpsErrorSeverity[] = ["low", "medium", "high", "critical"];
const STATUSES: OpsErrorStatus[]     = ["open", "investigating", "muted", "resolved"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function LastUpdated({ at, by }: { at?: string; by?: string }) {
  if (!at || at.startsWith("0001")) return null;
  const d = new Date(at);
  if (isNaN(d.getTime())) return null;
  const fmt = d.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <p className="text-[10px] text-gray-700 flex items-center gap-1 mt-1">
      <Icon name="Clock" size={9} />
      {fmt}
      {by ? <><span className="mx-0.5">·</span>{by}</> : null}
    </p>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${color}`}>
      {label}
    </span>
  );
}

function fmtDate(iso: string) {
  if (!iso || iso.startsWith("0001")) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function nextStatus(current: OpsErrorStatus): OpsErrorStatus {
  const idx = STATUSES.indexOf(current);
  return STATUSES[(idx + 1) % STATUSES.length];
}

// ── Add Form ──────────────────────────────────────────────────────────────────

type AddFormProps = {
  onAdd: (item: OpsError) => void;
  onCancel: () => void;
};

function AddForm({ onAdd, onCancel }: AddFormProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    severity: "medium" as OpsErrorSeverity,
    module_slug: "",
    source: "",
    environment: "",
    owner_email: "",
    details: "",
  });

  function set(k: string, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function submit() {
    if (!form.title.trim()) return;
    setSaving(true);
    const { ok, data } = await opsApi.addError(form);
    setSaving(false);
    if (ok && data.error) {
      onAdd(data.error);
      toast({ title: "Ошибка добавлена" });
    } else {
      toast({ title: "Не удалось добавить", variant: "destructive" });
    }
  }

  const inputCls = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-red-700 transition-colors";
  const labelCls = "block text-xs text-gray-500 mb-1";

  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 mb-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls}>Заголовок <span className="text-red-500">*</span></label>
          <input
            className={inputCls}
            placeholder="Краткое описание ошибки"
            value={form.title}
            onChange={e => set("title", e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Severity</label>
          <select className={inputCls} value={form.severity} onChange={e => set("severity", e.target.value)}>
            {SEVERITIES.map(s => <option key={s} value={s}>{SEV[s].label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Module slug</label>
          <input className={inputCls} placeholder="auth, billing, …" value={form.module_slug} onChange={e => set("module_slug", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Source</label>
          <input className={inputCls} placeholder="backend, frontend, …" value={form.source} onChange={e => set("source", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Environment</label>
          <input className={inputCls} placeholder="production, staging, …" value={form.environment} onChange={e => set("environment", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Owner email</label>
          <input className={inputCls} type="email" placeholder="owner@example.com" value={form.owner_email} onChange={e => set("owner_email", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Details</label>
          <textarea
            className={`${inputCls} resize-none`}
            rows={3}
            placeholder="Подробности, стектрейс, контекст…"
            value={form.details}
            onChange={e => set("details", e.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={submit}
          disabled={saving || !form.title.trim()}
          className="px-4 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {saving ? "Добавляю…" : "Добавить"}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm rounded-lg transition-colors"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function ErrorRow({
  item,
  onStatusChange,
}: {
  item: OpsError;
  onStatusChange: (id: number, status: OpsErrorStatus) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="px-4 py-3">
      {/* Main row */}
      <div
        className="flex items-center gap-3 cursor-pointer"
        onClick={() => setOpen(o => !o)}
      >
        <Badge label={SEV[item.severity].label} color={SEV[item.severity].color} />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-200 truncate">{item.title}</p>
          <p className="text-[11px] text-gray-600 font-mono truncate">
            {[item.module_slug, item.source].filter(Boolean).join(" · ")}
          </p>
          {item.resolution_notes && (
            <p className="text-[11px] text-gray-500 italic truncate mt-0.5">{item.resolution_notes}</p>
          )}
        </div>

        {/* Status cycle button */}
        <button
          onClick={e => { e.stopPropagation(); onStatusChange(item.id, nextStatus(item.status)); }}
          className={`text-xs font-semibold px-2 py-1 rounded-md bg-gray-800 hover:bg-gray-700 transition-colors flex-shrink-0 ${ST[item.status].color}`}
        >
          {ST[item.status].label}
        </button>

        {/* Last seen */}
        <span className="text-[11px] text-gray-600 flex-shrink-0 hidden sm:block">
          {fmtDate(item.last_seen_at)}
        </span>

        {/* Count badge */}
        {item.occurrences_count > 0 && (
          <span className="text-[10px] font-mono bg-gray-800 text-gray-500 border border-gray-700 px-1.5 py-0.5 rounded flex-shrink-0">
            ×{item.occurrences_count}
          </span>
        )}

        <Icon name={open ? "ChevronUp" : "ChevronDown"} size={14} className="text-gray-600 flex-shrink-0" />
      </div>

      {/* Expanded detail */}
      {open && (
        <div className="mt-3 pl-2 border-l border-gray-800 space-y-2 text-xs text-gray-400">
          {item.details && (
            <p className="leading-relaxed whitespace-pre-wrap text-gray-300">{item.details}</p>
          )}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-gray-600">
            <span>First seen: <span className="text-gray-500">{fmtDate(item.first_seen_at)}</span></span>
            <span>Last seen: <span className="text-gray-500">{fmtDate(item.last_seen_at)}</span></span>
            {item.owner_email && <span>Owner: <span className="text-gray-500">{item.owner_email}</span></span>}
            {item.environment && <span>Env: <span className="text-gray-500 font-mono">{item.environment}</span></span>}
          </div>
          <LastUpdated at={item.updated_at} by={item.updated_by} />
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminErrorsPage() {
  const { toast } = useToast();
  const [errors, setErrors]   = useState<OpsError[]>([]);
  const [summary, setSummary] = useState<Summary>({ open: 0, critical: 0, investigating: 0, resolved: 0 });
  const [loading, setLoading] = useState(true);

  // Filters
  const [q, setQ]               = useState("");
  const [sevFilter, setSev]     = useState<string>("");
  const [stFilter, setSt]       = useState<string>("");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [showAdd, setShowAdd]   = useState(false);

  useEffect(() => {
    opsApi.allErrors().then(({ data }) => {
      setErrors(data.errors ?? []);
      setSummary(data.summary ?? { open: 0, critical: 0, investigating: 0, resolved: 0 });
      setLoading(false);
    });
  }, []);

  // Derived list
  const filtered = errors.filter(e => {
    if (q && !e.title.toLowerCase().includes(q.toLowerCase()) && !e.fingerprint.toLowerCase().includes(q.toLowerCase())) return false;
    if (sevFilter && e.severity !== sevFilter) return false;
    if (stFilter && e.status !== stFilter) return false;
    if (onlyOpen && e.status === "resolved") return false;
    return true;
  });

  async function handleStatusChange(id: number, status: OpsErrorStatus) {
    const prev = errors.find(e => e.id === id);
    if (!prev) return;
    // Optimistic update
    setErrors(es => es.map(e => e.id === id ? { ...e, status } : e));
    const { ok } = await opsApi.updateError({ id, status });
    if (!ok) {
      // Rollback
      setErrors(es => es.map(e => e.id === id ? { ...e, status: prev.status } : e));
      toast({ title: "Не удалось обновить статус", variant: "destructive" });
    }
  }

  function handleAdded(item: OpsError) {
    setErrors(es => [item, ...es]);
    setShowAdd(false);
  }

  const cards = [
    { label: "Open",          value: summary.open,          color: "text-red-400",     icon: "AlertCircle" },
    { label: "Critical",      value: summary.critical,      color: "text-red-500",     icon: "Flame" },
    { label: "Investigating", value: summary.investigating, color: "text-amber-400",   icon: "Search" },
    { label: "Resolved",      value: summary.resolved,      color: "text-emerald-400", icon: "CheckCircle2" },
  ];

  return (
    <AdminShell>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-red-900/40 border border-red-800 flex items-center justify-center flex-shrink-0">
            <Icon name="AlertTriangle" size={18} className="text-red-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white leading-tight">Ошибки</h1>
            <p className="text-xs text-gray-500">Реестр ошибок и инцидентов платформы</p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {cards.map(c => (
            <div key={c.label} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <Icon name={c.icon} size={13} className={c.color} />
                <span className="text-xs text-gray-500">{c.label}</span>
              </div>
              <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-48">
            <Icon name="Search" size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
            <input
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-600 transition-colors"
              placeholder="Поиск по заголовку…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          <select
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none"
            value={sevFilter}
            onChange={e => setSev(e.target.value)}
          >
            <option value="">Все severity</option>
            {SEVERITIES.map(s => <option key={s} value={s}>{SEV[s].label}</option>)}
          </select>
          <select
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none"
            value={stFilter}
            onChange={e => setSt(e.target.value)}
          >
            <option value="">Все статусы</option>
            {STATUSES.map(s => <option key={s} value={s}>{ST[s].label}</option>)}
          </select>
          <button
            onClick={() => setOnlyOpen(o => !o)}
            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              onlyOpen
                ? "bg-red-900/40 border-red-800 text-red-400"
                : "bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300"
            }`}
          >
            Только открытые
          </button>
          <button
            onClick={() => setShowAdd(s => !s)}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Icon name="Plus" size={14} />
            Добавить
          </button>
        </div>

        {/* Add form */}
        {showAdd && (
          <AddForm
            onAdd={handleAdded}
            onCancel={() => setShowAdd(false)}
          />
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* List */}
        {!loading && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
            {filtered.length === 0 ? (
              <p className="text-center text-gray-600 text-sm py-12">Ошибок не найдено</p>
            ) : (
              filtered.map(item => (
                <ErrorRow key={item.id} item={item} onStatusChange={handleStatusChange} />
              ))
            )}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
