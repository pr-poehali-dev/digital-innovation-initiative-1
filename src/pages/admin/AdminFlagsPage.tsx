import { useState, useEffect } from "react";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import { opsApi, type OpsFlagStatus } from "@/lib/admin-api";

// ── Types ─────────────────────────────────────────────────────────────────────

type OpsFlag = {
  id: number;
  key: string;
  name: string;
  description: string;
  environment: string;
  enabled: boolean;
  rollout_percent: number;
  owner_email: string;
  status: OpsFlagStatus;
  notes: string;
  updated_at: string;
  updated_by: string;
};

type Summary = { enabled: number; disabled: number; planned: number; deprecated: number };

// ── Config ────────────────────────────────────────────────────────────────────

const FLAG_STATUSES: OpsFlagStatus[] = ["active", "planned", "deprecated"];

const ST: Record<OpsFlagStatus, { label: string; color: string }> = {
  active:     { label: "Активен",     color: "bg-emerald-900/40 text-emerald-400 border-emerald-800" },
  planned:    { label: "Запланирован", color: "bg-blue-900/40 text-blue-400 border-blue-800" },
  deprecated: { label: "Устарел",     color: "bg-gray-800 text-gray-600 border-gray-700" },
};

const ENVIRONMENTS = ["production", "staging", "development"];

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

const ENV_COLORS: Record<string, string> = {
  production:  "bg-red-900/30 text-red-400 border-red-800",
  staging:     "bg-amber-900/30 text-amber-400 border-amber-800",
  development: "bg-blue-900/30 text-blue-400 border-blue-800",
};

// ── Toggle switch ─────────────────────────────────────────────────────────────

function ToggleSwitch({ enabled, onClick }: { enabled: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors focus:outline-none ${
        enabled ? "bg-emerald-500" : "bg-gray-700"
      }`}
      aria-label={enabled ? "Выключить" : "Включить"}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
          enabled ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ── Add Form ──────────────────────────────────────────────────────────────────

function AddForm({ onAdd, onCancel }: { onAdd: (item: OpsFlag) => void; onCancel: () => void }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    key: "",
    name: "",
    description: "",
    environment: "production",
    owner_email: "",
    rollout_percent: 100,
    notes: "",
    enabled: false,
  });

  function set(k: string, v: string | number | boolean) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function submit() {
    if (!form.key.trim() || !form.name.trim()) return;
    setSaving(true);
    const { ok, data } = await opsApi.addFlag(form as Record<string, unknown>);
    setSaving(false);
    if (ok && data.flag) {
      onAdd(data.flag);
      toast({ title: "Флаг добавлен" });
    } else {
      toast({ title: "Не удалось добавить", variant: "destructive" });
    }
  }

  const inputCls = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600 transition-colors";
  const labelCls = "block text-xs text-gray-500 mb-1";

  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 mb-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Ключ <span className="text-red-500">*</span></label>
          <input
            className={`${inputCls} font-mono`}
            placeholder="feature_flag_key"
            value={form.key}
            onChange={e => set("key", e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Название <span className="text-red-500">*</span></label>
          <input
            className={inputCls}
            placeholder="Человекочитаемое название"
            value={form.name}
            onChange={e => set("name", e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Описание</label>
          <input
            className={inputCls}
            placeholder="Для чего этот флаг"
            value={form.description}
            onChange={e => set("description", e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Окружение</label>
          <select className={inputCls} value={form.environment} onChange={e => set("environment", e.target.value)}>
            {ENVIRONMENTS.map(env => <option key={env} value={env}>{env}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Ответственный</label>
          <input className={inputCls} type="email" placeholder="owner@example.com" value={form.owner_email} onChange={e => set("owner_email", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Охват % (0–100)</label>
          <input
            className={inputCls}
            type="number"
            min={0}
            max={100}
            value={form.rollout_percent}
            onChange={e => set("rollout_percent", Math.min(100, Math.max(0, Number(e.target.value))))}
          />
        </div>
        <div>
          <label className={labelCls}>Заметки</label>
          <input className={inputCls} placeholder="Дополнительно…" value={form.notes} onChange={e => set("notes", e.target.value)} />
        </div>
        {/* Enabled toggle */}
        <div className="sm:col-span-2 flex items-center gap-3">
          <ToggleSwitch enabled={form.enabled} onClick={e => { e.preventDefault(); set("enabled", !form.enabled); }} />
          <span className="text-sm text-gray-400">Включить сразу</span>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={submit}
          disabled={saving || !form.key.trim() || !form.name.trim()}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
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

function FlagRow({
  item,
  onToggle,
}: {
  item: OpsFlag;
  onToggle: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const isDeprecated = item.status === "deprecated";

  return (
    <div className={`px-4 py-3 ${isDeprecated ? "opacity-50" : ""}`}>
      {/* Main row */}
      <div
        className="flex items-center gap-3 cursor-pointer"
        onClick={() => setOpen(o => !o)}
      >
        {/* Toggle switch */}
        <ToggleSwitch
          enabled={item.enabled}
          onClick={e => { e.stopPropagation(); onToggle(item.id); }}
        />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-200 truncate">{item.name}</p>
          <p className="text-[11px] text-gray-500 font-mono truncate">{item.key}</p>
          {item.description && (
            <p className="text-[11px] text-gray-500 truncate">{item.description}</p>
          )}
        </div>

        {/* Environment badge */}
        {item.environment && (
          <Badge
            label={item.environment}
            color={ENV_COLORS[item.environment] ?? "bg-gray-800 text-gray-500 border-gray-700"}
          />
        )}

        {/* Rollout percent */}
        {item.rollout_percent < 100 && item.rollout_percent >= 0 && (
          <span className="text-[11px] text-gray-500 flex-shrink-0 hidden sm:block">
            {item.rollout_percent}%
          </span>
        )}

        {/* Owner */}
        {item.owner_email && (
          <span className="text-[11px] text-gray-600 flex-shrink-0 hidden md:block truncate max-w-32">
            {item.owner_email}
          </span>
        )}

        {/* Status badge */}
        <Badge label={ST[item.status].label} color={ST[item.status].color} />

        <Icon name={open ? "ChevronUp" : "ChevronDown"} size={14} className="text-gray-600 flex-shrink-0" />
      </div>

      {/* Expanded detail */}
      {open && (
        <div className="mt-3 pl-2 border-l border-gray-800 space-y-2 text-xs text-gray-400">
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

export default function AdminFlagsPage() {
  const { toast } = useToast();
  const [flags, setFlags]     = useState<OpsFlag[]>([]);
  const [summary, setSummary] = useState<Summary>({ enabled: 0, disabled: 0, planned: 0, deprecated: 0 });
  const [loading, setLoading] = useState(true);

  // Filters
  const [q, setQ]           = useState("");
  const [stFilter, setSt]   = useState<string>("");
  const [envFilter, setEnv] = useState<string>("");
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    opsApi.allFlags().then(({ data }) => {
      setFlags(data.flags ?? []);
      setSummary(data.summary ?? { enabled: 0, disabled: 0, planned: 0, deprecated: 0 });
      setLoading(false);
    });
  }, []);

  const filtered = flags.filter(f => {
    if (q && !f.name.toLowerCase().includes(q.toLowerCase()) && !f.key.toLowerCase().includes(q.toLowerCase())) return false;
    if (stFilter && f.status !== stFilter) return false;
    if (envFilter && f.environment !== envFilter) return false;
    return true;
  });

  async function handleToggle(id: number) {
    const prev = flags.find(f => f.id === id);
    if (!prev) return;
    // Optimistic update
    setFlags(fs => fs.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f));
    const { ok } = await opsApi.toggleFlag(id);
    if (!ok) {
      // Rollback
      setFlags(fs => fs.map(f => f.id === id ? { ...f, enabled: prev.enabled } : f));
      toast({ title: "Не удалось переключить флаг", variant: "destructive" });
    }
  }

  function handleAdded(item: OpsFlag) {
    setFlags(fs => [item, ...fs]);
    setShowAdd(false);
  }

  const cards = [
    { label: "Включены",    value: summary.enabled,    color: "text-emerald-400", icon: "ToggleRight" },
    { label: "Выключены",   value: summary.disabled,   color: "text-gray-400",    icon: "ToggleLeft" },
    { label: "Запланированы", value: summary.planned,  color: "text-blue-400",    icon: "Clock" },
    { label: "Устарели",    value: summary.deprecated, color: "text-gray-600",    icon: "Archive" },
  ];

  return (
    <AdminShell>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-violet-900/40 border border-violet-800 flex items-center justify-center flex-shrink-0">
            <Icon name="ToggleRight" size={18} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white leading-tight">Feature Flags</h1>
            <p className="text-xs text-gray-500">Управление функциональностью</p>
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
              placeholder="Поиск по ключу или названию…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          <select
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none"
            value={stFilter}
            onChange={e => setSt(e.target.value)}
          >
            <option value="">Все статусы</option>
            {FLAG_STATUSES.map(s => <option key={s} value={s}>{ST[s].label}</option>)}
          </select>
          <select
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none"
            value={envFilter}
            onChange={e => setEnv(e.target.value)}
          >
            <option value="">Все environments</option>
            {ENVIRONMENTS.map(env => <option key={env} value={env}>{env}</option>)}
          </select>
          <button
            onClick={() => setShowAdd(s => !s)}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-lg transition-colors"
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
              <p className="text-center text-gray-600 text-sm py-12">Флагов пока нет</p>
            ) : (
              filtered.map(item => (
                <FlagRow key={item.id} item={item} onToggle={handleToggle} />
              ))
            )}
          </div>
        )}
      </div>
    </AdminShell>
  );
}