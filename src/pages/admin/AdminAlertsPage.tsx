import { useState, useEffect } from "react";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import { opsApi, type OpsAlertSeverity, type OpsAlertStatus } from "@/lib/admin-api";

// ── Types ─────────────────────────────────────────────────────────────────────

type OpsAlert = {
  id: number;
  name: string;
  module_slug: string;
  condition_text: string;
  threshold_value: string;
  window_minutes: number;
  severity: OpsAlertSeverity;
  status: OpsAlertStatus;
  channel: string;
  owner_email: string;
  last_triggered_at: string | null;
  notes: string;
  updated_at: string;
  updated_by: string;
};

type Summary = { active: number; triggered: number; muted: number; no_owner: number };

// ── Config ────────────────────────────────────────────────────────────────────

const SEV: Record<OpsAlertSeverity, { label: string; color: string }> = {
  low:      { label: "Низкий",      color: "bg-gray-800 text-gray-400 border-gray-700" },
  medium:   { label: "Средний",     color: "bg-amber-900/40 text-amber-400 border-amber-800" },
  high:     { label: "Высокий",     color: "bg-orange-900/40 text-orange-400 border-orange-800" },
  critical: { label: "Критический", color: "bg-red-900/50 text-red-400 border-red-800" },
};

const ST: Record<OpsAlertStatus, { label: string; color: string }> = {
  active:    { label: "Активен",  color: "text-emerald-400" },
  triggered: { label: "Сработал", color: "text-red-400" },
  muted:     { label: "Заглушен", color: "text-gray-600" },
  resolved:  { label: "Решён",    color: "text-gray-500" },
};

const ALERT_SEVERITIES: OpsAlertSeverity[] = ["low", "medium", "high", "critical"];
const ALERT_STATUSES: OpsAlertStatus[]     = ["active", "triggered", "muted", "resolved"];

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

function fmtDate(iso: string | null) {
  if (!iso || iso.startsWith("0001")) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function nextStatus(current: OpsAlertStatus): OpsAlertStatus {
  const idx = ALERT_STATUSES.indexOf(current);
  return ALERT_STATUSES[(idx + 1) % ALERT_STATUSES.length];
}

// ── Add Form ──────────────────────────────────────────────────────────────────

function AddForm({ onAdd, onCancel }: { onAdd: (item: OpsAlert) => void; onCancel: () => void }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    module_slug: "",
    condition_text: "",
    threshold_value: "",
    window_minutes: 5,
    severity: "medium" as OpsAlertSeverity,
    status: "active" as OpsAlertStatus,
    channel: "",
    owner_email: "",
    notes: "",
  });

  function set(k: string, v: string | number) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function submit() {
    if (!form.name.trim()) return;
    setSaving(true);
    const { ok, data } = await opsApi.addAlert(form as Record<string, unknown>);
    setSaving(false);
    if (ok && data.alert) {
      onAdd(data.alert);
      toast({ title: "Алерт добавлен" });
    } else {
      toast({ title: "Не удалось добавить", variant: "destructive" });
    }
  }

  const inputCls = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-700 transition-colors";
  const labelCls = "block text-xs text-gray-500 mb-1";

  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 mb-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls}>Название <span className="text-red-500">*</span></label>
          <input
            className={inputCls}
            placeholder="Название алерта"
            value={form.name}
            onChange={e => set("name", e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Модуль</label>
          <input className={inputCls} placeholder="auth, billing, …" value={form.module_slug} onChange={e => set("module_slug", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Канал</label>
          <input className={inputCls} placeholder="slack, email, pagerduty…" value={form.channel} onChange={e => set("channel", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Условие</label>
          <textarea
            className={`${inputCls} resize-none`}
            rows={2}
            placeholder="error_rate > threshold за window минут"
            value={form.condition_text}
            onChange={e => set("condition_text", e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Порог</label>
          <input className={inputCls} placeholder="0.05, 500, …" value={form.threshold_value} onChange={e => set("threshold_value", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Окно (мин)</label>
          <input
            className={inputCls}
            type="number"
            min={1}
            value={form.window_minutes}
            onChange={e => set("window_minutes", Number(e.target.value))}
          />
        </div>
        <div>
          <label className={labelCls}>Критичность</label>
          <select className={inputCls} value={form.severity} onChange={e => set("severity", e.target.value)}>
            {ALERT_SEVERITIES.map(s => <option key={s} value={s}>{SEV[s].label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Статус</label>
          <select className={inputCls} value={form.status} onChange={e => set("status", e.target.value)}>
            {ALERT_STATUSES.map(s => <option key={s} value={s}>{ST[s].label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Ответственный</label>
          <input className={inputCls} type="email" placeholder="owner@example.com" value={form.owner_email} onChange={e => set("owner_email", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Заметки</label>
          <input className={inputCls} placeholder="Дополнительно…" value={form.notes} onChange={e => set("notes", e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={submit}
          disabled={saving || !form.name.trim()}
          className="px-4 py-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
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

function AlertRow({
  item,
  onStatusChange,
}: {
  item: OpsAlert;
  onStatusChange: (id: number, status: OpsAlertStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggered = fmtDate(item.last_triggered_at);

  return (
    <div className="px-4 py-3">
      {/* Main row */}
      <div
        className="flex items-center gap-3 cursor-pointer"
        onClick={() => setOpen(o => !o)}
      >
        <Badge label={SEV[item.severity].label} color={SEV[item.severity].color} />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-200 truncate">{item.name}</p>
          {item.condition_text && (
            <p className="text-[11px] text-gray-500 truncate">{item.condition_text}</p>
          )}
          {item.module_slug && (
            <p className="text-[11px] text-gray-600 font-mono truncate">{item.module_slug}</p>
          )}
        </div>

        {/* Last triggered */}
        {triggered && (
          <span className="text-[11px] text-gray-600 flex-shrink-0 hidden sm:block">
            {triggered}
          </span>
        )}

        {/* Status cycle button */}
        <button
          onClick={e => { e.stopPropagation(); onStatusChange(item.id, nextStatus(item.status)); }}
          className={`text-xs font-semibold px-2 py-1 rounded-md bg-gray-800 hover:bg-gray-700 transition-colors flex-shrink-0 ${ST[item.status].color}`}
        >
          {ST[item.status].label}
        </button>

        {/* No-owner badge */}
        {!item.owner_email && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 bg-amber-900/40 text-amber-500 border-amber-800">
            no owner
          </span>
        )}

        <Icon name={open ? "ChevronUp" : "ChevronDown"} size={14} className="text-gray-600 flex-shrink-0" />
      </div>

      {/* Expanded detail */}
      {open && (
        <div className="mt-3 pl-2 border-l border-gray-800 space-y-2 text-xs text-gray-400">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-gray-600">
            {item.threshold_value && (
              <span>Threshold: <span className="text-gray-500 font-mono">{item.threshold_value}</span></span>
            )}
            {item.window_minutes > 0 && (
              <span>Window: <span className="text-gray-500">{item.window_minutes} min</span></span>
            )}
            {item.channel && (
              <span>Channel: <span className="text-gray-500">{item.channel}</span></span>
            )}
            {item.owner_email && (
              <span>Owner: <span className="text-gray-500">{item.owner_email}</span></span>
            )}
          </div>
          {item.notes && (
            <p className="text-gray-500 leading-relaxed">{item.notes}</p>
          )}
          <LastUpdated at={item.updated_at} by={item.updated_by} />
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminAlertsPage() {
  const { toast } = useToast();
  const [alerts, setAlerts]   = useState<OpsAlert[]>([]);
  const [summary, setSummary] = useState<Summary>({ active: 0, triggered: 0, muted: 0, no_owner: 0 });
  const [loading, setLoading] = useState(true);

  // Filters
  const [q, setQ]           = useState("");
  const [sevFilter, setSev] = useState<string>("");
  const [stFilter, setSt]   = useState<string>("");
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    opsApi.allAlerts().then(({ data }) => {
      setAlerts(data.alerts ?? []);
      setSummary(data.summary ?? { active: 0, triggered: 0, muted: 0, no_owner: 0 });
      setLoading(false);
    });
  }, []);

  const filtered = alerts.filter(a => {
    if (q && !a.name.toLowerCase().includes(q.toLowerCase()) && !a.module_slug.toLowerCase().includes(q.toLowerCase())) return false;
    if (sevFilter && a.severity !== sevFilter) return false;
    if (stFilter && a.status !== stFilter) return false;
    return true;
  });

  async function handleStatusChange(id: number, status: OpsAlertStatus) {
    const prev = alerts.find(a => a.id === id);
    if (!prev) return;
    setAlerts(as => as.map(a => a.id === id ? { ...a, status } : a));
    const { ok } = await opsApi.updateAlert({ id, status });
    if (!ok) {
      setAlerts(as => as.map(a => a.id === id ? { ...a, status: prev.status } : a));
      toast({ title: "Не удалось обновить статус", variant: "destructive" });
    }
  }

  function handleAdded(item: OpsAlert) {
    setAlerts(as => [item, ...as]);
    setShowAdd(false);
  }

  const cards = [
    { label: "Активные",   value: summary.active,    color: "text-emerald-400", icon: "CheckCircle2" },
    { label: "Сработали",  value: summary.triggered, color: "text-red-400",     icon: "Zap" },
    { label: "Заглушены",  value: summary.muted,     color: "text-gray-500",    icon: "BellOff" },
    { label: "Без владельца", value: summary.no_owner, color: "text-amber-400", icon: "UserX" },
  ];

  return (
    <AdminShell>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-amber-900/40 border border-amber-800 flex items-center justify-center flex-shrink-0">
            <Icon name="Bell" size={18} className="text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white leading-tight">Алерты</h1>
            <p className="text-xs text-gray-500">Правила мониторинга и триггеры</p>
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
              placeholder="Поиск по названию…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          <select
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none"
            value={sevFilter}
            onChange={e => setSev(e.target.value)}
          >
            <option value="">Все критичности</option>
            {ALERT_SEVERITIES.map(s => <option key={s} value={s}>{SEV[s].label}</option>)}
          </select>
          <select
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none"
            value={stFilter}
            onChange={e => setSt(e.target.value)}
          >
            <option value="">Все статусы</option>
            {ALERT_STATUSES.map(s => <option key={s} value={s}>{ST[s].label}</option>)}
          </select>
          <button
            onClick={() => setShowAdd(s => !s)}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 bg-amber-700 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg transition-colors"
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
              <p className="text-center text-gray-600 text-sm py-12">Алертов не найдено</p>
            ) : (
              filtered.map(item => (
                <AlertRow key={item.id} item={item} onStatusChange={handleStatusChange} />
              ))
            )}
          </div>
        )}
      </div>
    </AdminShell>
  );
}