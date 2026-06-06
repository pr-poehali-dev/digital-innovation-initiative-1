import { useState, useEffect, useCallback } from "react";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { api, STRATEGY_URL, strategyHdr } from "@/lib/strategyApi";

// ── Types ───────────────────────────────────────────────────────────

type Initiative = {
  id: number; title: string; description: string;
  status: string; priority: string; owner: string;
  source_type: string; source_id: number | null;
  target_metric: string; target_segment: string;
  baseline_value: number | null; target_value: number | null; current_value: number | null;
  unit: string; start_date: string | null; due_date: string | null;
  health: string; progress_pct: number;
  created_by: string; created_at: string; updated_at: string;
  updates?: InitiativeUpdate[];
};

type InitiativeUpdate = {
  id: number; update_text: string; status_after: string;
  progress_pct: number | null; metric_value: number | null;
  risks: string[]; next_steps: string[];
  created_by: string; created_at: string;
};

type RoadmapItem = { id: number; title: string; target_metric: string; target_segment: string; lane: string };
type ScenarioItem = { id: number; name: string; scenario_type: string; confidence: string };
type Summary = { active: number; at_risk: number; overdue: number; done_30d: number };

type ViewTab = "board" | "list";

// ── Config ──────────────────────────────────────────────────────────

const BOARD_COLS: { key: string; label: string; colorCls: string; dotCls: string }[] = [
  { key: "draft",    label: "Draft",    colorCls: "border-gray-700 bg-gray-900/40",      dotCls: "bg-gray-600" },
  { key: "planned",  label: "Planned",  colorCls: "border-blue-800/60 bg-blue-900/10",  dotCls: "bg-blue-500" },
  { key: "active",   label: "Active",   colorCls: "border-violet-800/60 bg-violet-900/10", dotCls: "bg-violet-500" },
  { key: "at_risk",  label: "At Risk",  colorCls: "border-amber-800/60 bg-amber-900/10", dotCls: "bg-amber-500" },
  { key: "done",     label: "Done",     colorCls: "border-emerald-800/60 bg-emerald-900/10", dotCls: "bg-emerald-500" },
];

const HEALTH_CFG: Record<string, { dot: string; text: string }> = {
  green:  { dot: "bg-emerald-500", text: "text-emerald-400" },
  yellow: { dot: "bg-amber-500",   text: "text-amber-400" },
  red:    { dot: "bg-red-500",     text: "text-red-400" },
};

const PRIORITY_CFG: Record<string, string> = {
  critical: "bg-red-900/40 text-red-400 border-red-800",
  high:     "bg-orange-900/30 text-orange-400 border-orange-800",
  medium:   "bg-gray-800 text-gray-400 border-gray-700",
  low:      "bg-gray-800/40 text-gray-600 border-gray-800",
};

const SOURCE_ICON: Record<string, string> = {
  roadmap: "Kanban", scenario: "FlaskConical", report: "History", manual: "PenLine",
};

// ── Helpers ─────────────────────────────────────────────────────────

function Spinner() {
  return <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />;
}

function HealthDot({ health }: { health: string }) {
  const cfg = HEALTH_CFG[health] ?? HEALTH_CFG.green;
  return <span className={`inline-block w-2 h-2 rounded-full ${cfg.dot} flex-shrink-0`} />;
}

function ProgressBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 40 ? "bg-violet-500" : "bg-amber-500";
  return (
    <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

function MetricBar({ baseline, current, target, unit }: { baseline: number | null; current: number | null; target: number | null; unit: string }) {
  if (baseline === null || target === null) return null;
  const cur = current ?? baseline;
  const range = target - baseline;
  const pct = range !== 0 ? Math.max(0, Math.min(100, ((cur - baseline) / range) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[9px] text-gray-600">
        <span>{baseline}{unit}</span>
        <span className="text-violet-400 font-semibold">{cur}{unit}</span>
        <span>{target}{unit}</span>
      </div>
      <div className="relative w-full h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className="absolute left-0 top-0 h-full bg-violet-600/40 rounded-full" style={{ width: "100%" }} />
        <div className="absolute left-0 top-0 h-full bg-violet-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  return Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ── InitiativeCard ───────────────────────────────────────────────────

function InitiativeCard({ item, onClick, onStatusChange }: {
  item: Initiative;
  onClick: () => void;
  onStatusChange: (s: string) => void;
}) {
  const days = daysUntil(item.due_date);
  const overdue = days !== null && days < 0;
  return (
    <div
      onClick={onClick}
      className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2 cursor-pointer hover:border-gray-700 transition-colors group"
    >
      <div className="flex items-start gap-2">
        <HealthDot health={item.health} />
        <p className="text-xs font-semibold text-gray-200 flex-1 leading-snug line-clamp-2">{item.title}</p>
        {item.source_type && item.source_type !== "manual" && (
          <Icon name={SOURCE_ICON[item.source_type] ?? "Circle"} size={10} className="text-gray-700 flex-shrink-0 mt-0.5" />
        )}
      </div>

      <ProgressBar pct={item.progress_pct} />

      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${PRIORITY_CFG[item.priority] ?? PRIORITY_CFG.medium}`}>
          {item.priority}
        </span>
        {item.owner && (
          <span className="text-[9px] text-gray-600 truncate max-w-[80px]">{item.owner.split("@")[0]}</span>
        )}
        {days !== null && (
          <span className={`ml-auto text-[9px] font-semibold ${overdue ? "text-red-400" : days < 7 ? "text-amber-400" : "text-gray-600"}`}>
            {overdue ? `+${Math.abs(days)}d overdue` : `${days}d left`}
          </span>
        )}
      </div>

      {item.target_metric && (
        <div className="text-[9px] text-gray-700">📊 {item.target_metric}</div>
      )}

      <MetricBar baseline={item.baseline_value} current={item.current_value} target={item.target_value} unit={item.unit || "%"} />

      <select
        value={item.status}
        onChange={e => { e.stopPropagation(); onStatusChange(e.target.value); }}
        onClick={e => e.stopPropagation()}
        className="w-full text-[9px] font-semibold bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-400 focus:outline-none cursor-pointer"
      >
        {["draft","planned","active","at_risk","done"].map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
}

// ── Create Initiative Modal ───────────────────────────────────────────

function CreateModal({
  onClose, onCreated, roadmapItems, scenarioItems,
}: {
  onClose: () => void;
  onCreated: () => void;
  roadmapItems: RoadmapItem[];
  scenarioItems: ScenarioItem[];
}) {
  const [form, setForm] = useState({
    title: "", description: "", priority: "medium", owner: "",
    target_metric: "", target_segment: "", unit: "%",
    baseline_value: "", target_value: "", due_date: "",
    source_type: "manual", source_id: "",
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.title.trim()) return;
    setSaving(true);
    const body: Record<string, unknown> = {
      title: form.title.trim(), description: form.description,
      priority: form.priority, owner: form.owner,
      target_metric: form.target_metric, target_segment: form.target_segment,
      unit: form.unit, due_date: form.due_date || undefined,
      baseline_value: form.baseline_value ? Number(form.baseline_value) : undefined,
      target_value:   form.target_value   ? Number(form.target_value)   : undefined,
    };
    if (form.source_type === "roadmap" && form.source_id) {
      await api.initiativeFromRoadmap({ ...body, roadmap_item_id: Number(form.source_id) });
    } else if (form.source_type === "scenario" && form.source_id) {
      await api.initiativeFromScenario({ ...body, scenario_id: Number(form.source_id) });
    } else {
      await api.initiativeCreate(body);
    }
    setSaving(false);
    onCreated();
    onClose();
  }

  const F = (k: string, label: string, el: React.ReactNode) => (
    <div key={k}>
      <label className="block text-[10px] text-gray-500 mb-1 font-semibold uppercase">{label}</label>
      {el}
    </div>
  );

  const inp = (k: keyof typeof form, ph = "") => (
    <input value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
      placeholder={ph}
      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600" />
  );

  const sel = (k: keyof typeof form, opts: [string, string][]) => (
    <select value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-violet-600">
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg mx-4 p-6 space-y-4 shadow-2xl overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-100">Новая инициатива</h3>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-400 p-1"><Icon name="X" size={16} /></button>
        </div>

        <div className="space-y-3">
          {F("title", "Название *", inp("title", "Название инициативы"))}

          <div className="grid grid-cols-2 gap-3">
            {F("priority", "Приоритет", sel("priority", [["critical","Critical"],["high","High"],["medium","Medium"],["low","Low"]]))}
            {F("owner", "Owner", inp("owner", "email или имя"))}
          </div>

          {F("source_type", "Источник", sel("source_type", [
            ["manual","Вручную"], ["roadmap","Из Roadmap"], ["scenario","Из Сценария"],
          ]))}

          {form.source_type === "roadmap" && roadmapItems.length > 0 && F("source_id", "Roadmap Item",
            <select value={form.source_id} onChange={e => {
              const item = roadmapItems.find(r => String(r.id) === e.target.value);
              setForm(f => ({ ...f, source_id: e.target.value,
                title: f.title || item?.title || "",
                target_metric: f.target_metric || item?.target_metric || "",
                target_segment: f.target_segment || item?.target_segment || "",
              }));
            }} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-violet-600">
              <option value="">Выберите item...</option>
              {roadmapItems.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
          )}

          {form.source_type === "scenario" && scenarioItems.length > 0 && F("source_id", "Сценарий",
            <select value={form.source_id} onChange={e => {
              const sc = scenarioItems.find(s => String(s.id) === e.target.value);
              setForm(f => ({ ...f, source_id: e.target.value,
                target_metric: f.target_metric || sc?.scenario_type || "",
              }));
            }} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-violet-600">
              <option value="">Выберите сценарий...</option>
              {scenarioItems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}

          <div className="grid grid-cols-2 gap-3">
            {F("target_metric", "Метрика", inp("target_metric", "activation_rate"))}
            {F("target_segment", "Сегмент", inp("target_segment", "new users"))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {F("baseline_value", "Baseline", inp("baseline_value", "30"))}
            {F("target_value", "Target", inp("target_value", "45"))}
            {F("unit", "Ед.", inp("unit", "%"))}
          </div>

          {F("due_date", "Дедлайн",
            <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-violet-600" />
          )}

          {F("description", "Описание",
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600 resize-none"
              placeholder="Контекст, цели..." />
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm rounded-xl transition-colors">Отмена</button>
          <button onClick={save} disabled={saving || !form.title.trim()}
            className="flex-1 px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors">
            {saving ? "Создаю..." : "Создать"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Initiative Detail Drawer ─────────────────────────────────────────

function DetailDrawer({ initiative, onClose, onUpdated }: {
  initiative: Initiative;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [upd, setUpd] = useState({ text: "", status_after: "", progress_pct: "", metric_value: "" });
  const [savingUpd, setSavingUpd] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function addUpdate() {
    if (!upd.text.trim()) return;
    setSavingUpd(true);
    await api.initiativeUpdateAdd({
      initiative_id: initiative.id,
      update_text:   upd.text.trim(),
      status_after:  upd.status_after || undefined,
      progress_pct:  upd.progress_pct ? Number(upd.progress_pct) : undefined,
      metric_value:  upd.metric_value ? Number(upd.metric_value) : undefined,
    });
    setSavingUpd(false);
    setUpd({ text: "", status_after: "", progress_pct: "", metric_value: "" });
    onUpdated();
  }

  async function refreshMetric() {
    setRefreshing(true);
    const d = await api.initiativeMetricsRefresh(initiative.id);
    setRefreshing(false);
    if (d.ok) onUpdated();
  }

  const health = HEALTH_CFG[initiative.health] ?? HEALTH_CFG.green;

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/50" />
      <div className="w-full max-w-lg bg-gray-950 border-l border-gray-800 h-full overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-gray-800">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${PRIORITY_CFG[initiative.priority] ?? PRIORITY_CFG.medium}`}>
                {initiative.priority}
              </span>
              <span className="text-[9px] text-gray-600 font-mono">{initiative.status}</span>
              <span className={`flex items-center gap-1 text-[9px] font-semibold ${health.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${health.dot}`} /> {initiative.health}
              </span>
              {initiative.source_type !== "manual" && (
                <span className="text-[9px] text-gray-700 flex items-center gap-1">
                  <Icon name={SOURCE_ICON[initiative.source_type] ?? "Circle"} size={9} />
                  {initiative.source_type} #{initiative.source_id}
                </span>
              )}
            </div>
            <h2 className="text-base font-bold text-gray-100">{initiative.title}</h2>
            {initiative.description && <p className="text-xs text-gray-500 mt-1">{initiative.description}</p>}
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-400 p-1 flex-shrink-0"><Icon name="X" size={16} /></button>
        </div>

        <div className="p-5 space-y-5 flex-1">
          {/* Metric progress */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">
                {initiative.target_metric || "Метрика"} {initiative.unit ? `(${initiative.unit})` : ""}
              </p>
              <button onClick={refreshMetric} disabled={refreshing}
                className="flex items-center gap-1 text-[9px] text-gray-600 hover:text-violet-400 transition-colors">
                {refreshing ? <Spinner /> : <Icon name="RefreshCw" size={10} />} обновить
              </button>
            </div>
            <MetricBar baseline={initiative.baseline_value} current={initiative.current_value} target={initiative.target_value} unit={initiative.unit || "%"} />
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { l: "Baseline", v: initiative.baseline_value, cls: "text-gray-500" },
                { l: "Current",  v: initiative.current_value,  cls: "text-violet-400 font-bold" },
                { l: "Target",   v: initiative.target_value,   cls: "text-emerald-400" },
              ].map(({ l, v, cls }) => (
                <div key={l}>
                  <p className="text-[9px] text-gray-600">{l}</p>
                  <p className={`text-base ${cls}`}>{v !== null && v !== undefined ? `${v}${initiative.unit || "%"}` : "—"}</p>
                </div>
              ))}
            </div>
            <div>
              <div className="flex justify-between text-[9px] text-gray-600 mb-1">
                <span>Прогресс</span><span>{initiative.progress_pct}%</span>
              </div>
              <ProgressBar pct={initiative.progress_pct} />
            </div>
          </div>

          {/* Meta */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { l: "Owner",   v: initiative.owner || "—" },
              { l: "Сегмент", v: initiative.target_segment || "—" },
              { l: "Старт",   v: initiative.start_date || "—" },
              { l: "Дедлайн", v: initiative.due_date ? (() => { const d = daysUntil(initiative.due_date); return `${initiative.due_date}${d !== null ? ` (${d < 0 ? d+"d overdue" : d+"d"})` : ""}` })() : "—" },
            ].map(({ l, v }) => (
              <div key={l} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                <p className="text-[9px] text-gray-600 mb-0.5">{l}</p>
                <p className="text-xs text-gray-300 font-medium">{v}</p>
              </div>
            ))}
          </div>

          {/* Add update */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">Добавить обновление</p>
            <textarea value={upd.text} onChange={e => setUpd(u => ({ ...u, text: e.target.value }))}
              rows={2} placeholder="Что сделано, что изменилось..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600 resize-none" />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-[9px] text-gray-600 mb-1">Статус</p>
                <select value={upd.status_after} onChange={e => setUpd(u => ({ ...u, status_after: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-300 focus:outline-none">
                  <option value="">без изм.</option>
                  {["draft","planned","active","at_risk","done"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[9px] text-gray-600 mb-1">Progress %</p>
                <input type="number" min="0" max="100" value={upd.progress_pct}
                  onChange={e => setUpd(u => ({ ...u, progress_pct: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none" />
              </div>
              <div>
                <p className="text-[9px] text-gray-600 mb-1">Метрика</p>
                <input type="number" value={upd.metric_value}
                  onChange={e => setUpd(u => ({ ...u, metric_value: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none" />
              </div>
            </div>
            <button onClick={addUpdate} disabled={savingUpd || !upd.text.trim()}
              className="w-full py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors">
              {savingUpd ? "Сохраняю..." : "Добавить обновление"}
            </button>
          </div>

          {/* Update history */}
          {initiative.updates && initiative.updates.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">История</p>
              {initiative.updates.map(u => (
                <div key={u.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-1.5">
                  <p className="text-xs text-gray-300">{u.update_text}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {u.status_after && <span className="text-[9px] font-semibold text-violet-400">→ {u.status_after}</span>}
                    {u.progress_pct !== null && <span className="text-[9px] text-gray-600">{u.progress_pct}%</span>}
                    {u.metric_value !== null && <span className="text-[9px] text-gray-600">metric: {u.metric_value}</span>}
                    <span className="text-[9px] text-gray-700 ml-auto">
                      {new Date(u.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  {u.next_steps.length > 0 && (
                    <div className="text-[9px] text-gray-600">
                      Next: {u.next_steps.join(" · ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────

export default function AdminExecutionPage() {
  const [view, setView] = useState<ViewTab>("board");
  const [board, setBoard] = useState<Record<string, Initiative[]>>({});
  const [list,  setList]  = useState<Initiative[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [roadmapItems,  setRoadmapItems]  = useState<RoadmapItem[]>([]);
  const [scenarioItems, setScenarioItems] = useState<ScenarioItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<Initiative | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showMsg(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  const loadData = useCallback(async () => {
    setLoading(true);
    const [bd, li, sm, rm, sc] = await Promise.all([
      api.initiativesBoard(),
      api.initiativesList(),
      api.initiativesSummary(),
      api.roadmapList(),
      api.scenariosList(),
    ]);
    setBoard(bd.board ?? {});
    setList(li.initiatives ?? []);
    setSummary(sm.summary ?? null);
    setRoadmapItems(Object.values(bd.board ?? {}).flat().length > 0
      ? [] : (rm.roadmap ? [...(rm.roadmap.now ?? []), ...(rm.roadmap.next ?? []), ...(rm.roadmap.later ?? [])] : []));
    setRoadmapItems(rm.roadmap ? [...(rm.roadmap.now ?? []), ...(rm.roadmap.next ?? []), ...(rm.roadmap.later ?? [])] : []);
    setScenarioItems(sc.scenarios ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function openDetail(id: number) {
    setSelectedId(id);
    const d = await api.initiativeGet(id);
    setSelectedDetail(d.initiative ?? null);
  }

  async function handleStatusChange(id: number, status: string) {
    await api.initiativeUpdate({ id, status });
    await loadData();
    showMsg("Статус обновлён");
  }

  const SUMMARY_CARDS = summary ? [
    { label: "Active",   value: summary.active,   icon: "Activity",      cls: "text-violet-400" },
    { label: "At Risk",  value: summary.at_risk,  icon: "AlertTriangle", cls: summary.at_risk  > 0 ? "text-amber-400" : "text-gray-400" },
    { label: "Overdue",  value: summary.overdue,  icon: "Clock",         cls: summary.overdue  > 0 ? "text-red-400"   : "text-gray-400" },
    { label: "Done 30d", value: summary.done_30d, icon: "CheckCircle2",  cls: "text-emerald-400" },
  ] : [];

  return (
    <AdminShell>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-100">Execution</h1>
            <p className="text-sm text-gray-500">Инициативы, прогресс, health</p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center bg-gray-800 rounded-xl p-1 gap-1">
              {([["board","Kanban","Board"],["list","List","List"]] as const).map(([k, icon, label]) => (
                <button key={k} onClick={() => setView(k)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${view === k ? "bg-gray-700 text-gray-100" : "text-gray-500 hover:text-gray-300"}`}>
                  <Icon name={icon} size={12} />{label}
                </button>
              ))}
            </div>
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-violet-700 hover:bg-violet-600 text-white text-xs font-semibold rounded-xl transition-colors">
              <Icon name="Plus" size={13} /> Инициатива
            </button>
          </div>
        </div>

        {/* Summary cards */}
        {SUMMARY_CARDS.length > 0 && (
          <div className="grid grid-cols-4 gap-3">
            {SUMMARY_CARDS.map(({ label, value, icon, cls }) => (
              <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3">
                <Icon name={icon} size={18} className={cls} />
                <div>
                  <p className="text-[10px] text-gray-500">{label}</p>
                  <p className={`text-2xl font-bold ${cls}`}>{value}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {loading && <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>}

        {/* Board view */}
        {!loading && view === "board" && (
          <div className="grid grid-cols-5 gap-3 overflow-x-auto">
            {BOARD_COLS.map(col => {
              const items: Initiative[] = board[col.key] ?? [];
              return (
                <div key={col.key} className={`border rounded-xl p-3 min-h-[400px] min-w-[200px] ${col.colorCls}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`w-2 h-2 rounded-full ${col.dotCls}`} />
                    <span className="text-xs font-bold text-gray-200">{col.label}</span>
                    <span className="ml-auto text-[10px] text-gray-600 font-semibold">{items.length}</span>
                  </div>
                  <div className="space-y-2">
                    {items.map(item => (
                      <InitiativeCard
                        key={item.id}
                        item={item}
                        onClick={() => openDetail(item.id)}
                        onStatusChange={s => handleStatusChange(item.id, s)}
                      />
                    ))}
                    {items.length === 0 && (
                      <div className="text-center py-8 text-gray-700 text-xs">Пусто</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* List view */}
        {!loading && view === "list" && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  {["","Инициатива","Статус","Приоритет","Owner","Метрика","Прогресс","Дедлайн","Health"].map(h => (
                    <th key={h} className="text-left text-[10px] text-gray-500 font-semibold uppercase tracking-wide px-3 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map(item => {
                  const days = daysUntil(item.due_date);
                  const overdue = days !== null && days < 0;
                  return (
                    <tr key={item.id} onClick={() => openDetail(item.id)}
                      className="border-b border-gray-800/60 hover:bg-gray-800/30 cursor-pointer transition-colors">
                      <td className="px-3 py-2.5 w-6"><HealthDot health={item.health} /></td>
                      <td className="px-3 py-2.5 max-w-[200px]">
                        <p className="text-xs font-semibold text-gray-200 truncate">{item.title}</p>
                        {item.target_segment && <p className="text-[9px] text-gray-600">{item.target_segment}</p>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[10px] font-mono text-gray-400">{item.status}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${PRIORITY_CFG[item.priority] ?? PRIORITY_CFG.medium}`}>
                          {item.priority}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500 max-w-[80px] truncate">
                        {item.owner ? item.owner.split("@")[0] : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-[10px] text-gray-500 truncate max-w-[120px]">{item.target_metric || "—"}</p>
                        {item.baseline_value !== null && item.target_value !== null && (
                          <p className="text-[9px] text-gray-700">
                            {item.baseline_value}{item.unit}→{item.target_value}{item.unit}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 w-28">
                        <div className="flex items-center gap-2">
                          <ProgressBar pct={item.progress_pct} />
                          <span className="text-[9px] text-gray-600 w-8 text-right">{item.progress_pct}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {days !== null ? (
                          <span className={`text-[10px] font-semibold ${overdue ? "text-red-400" : days < 7 ? "text-amber-400" : "text-gray-600"}`}>
                            {overdue ? `${Math.abs(days)}d overdue` : `${days}d`}
                          </span>
                        ) : <span className="text-[10px] text-gray-700">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-[10px] font-semibold ${(HEALTH_CFG[item.health] ?? HEALTH_CFG.green).text}`}>
                          {item.health}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {list.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-10 text-gray-600 text-sm">
                    Инициатив пока нет. Создайте первую или конвертируйте Roadmap item.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selectedDetail && (
        <DetailDrawer
          initiative={selectedDetail}
          onClose={() => { setSelectedDetail(null); setSelectedId(null); }}
          onUpdated={async () => {
            if (selectedId) {
              const d = await api.initiativeGet(selectedId);
              setSelectedDetail(d.initiative ?? null);
            }
            await loadData();
          }}
        />
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { loadData(); showMsg("Инициатива создана"); }}
          roadmapItems={roadmapItems}
          scenarioItems={scenarioItems}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium z-50 bg-emerald-900 text-emerald-300 border border-emerald-700">
          {toast}
        </div>
      )}
    </AdminShell>
  );
}
