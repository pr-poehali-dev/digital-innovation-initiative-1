import { useState, useEffect, useCallback } from "react";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { api } from "@/lib/strategyApi";

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

type WeeklyReview = {
  id: number; week_start: string; week_end: string;
  status: string; title: string; confidence: string;
  created_by: string; created_at: string; published_at: string | null;
};
type WeeklyReviewDetail = WeeklyReview & {
  summary: Record<string, unknown>;
  metrics: Record<string, unknown>;
  initiatives: Record<string, unknown>;
  roadmap: unknown[];
  scenarios: unknown[];
  ai_digest: Record<string, unknown>;
  decisions: Decision[];
};
type Decision = {
  id: number; review_id: number | null; title: string; description: string;
  decision_type: string; status: string; owner: string;
  linked_initiative_id: number | null; linked_roadmap_item_id: number | null;
  due_date: string | null; notes: unknown[];
  created_by: string; updated_by: string; created_at: string; updated_at: string;
};

type ViewTab = "board" | "list" | "reviews" | "decisions" | "alerts" | "watchlists";

type Alert = {
  id: number; watchlist_id: number | null; watchlist_name: string;
  alert_type: string; severity: string; status: string;
  title: string; message: string; metric_key: string | null;
  entity_type: string | null; entity_id: number | null;
  baseline_value: number | null; current_value: number | null; delta_value: number | null;
  threshold: Record<string, unknown>; evidence: Record<string, unknown>;
  first_triggered_at: string; last_triggered_at: string;
  resolved_at: string | null; assigned_to: string | null; created_at: string;
};
type AlertSummary = { open: number; critical: number; acknowledged: number; resolved_week: number; with_overdue: number };
type Watchlist = {
  id: number; name: string; description: string; scope_type: string;
  rules: unknown[]; status: string; is_system: boolean;
  created_by: string; created_at: string; active_alerts: number;
};

// ── Config ──────────────────────────────────────────────────────────

const BOARD_COLS: { key: string; label: string; colorCls: string; dotCls: string }[] = [
  { key: "draft",    label: "Черновик",   colorCls: "border-gray-700 bg-gray-900/40",      dotCls: "bg-gray-600" },
  { key: "planned",  label: "Запланир.",  colorCls: "border-blue-800/60 bg-blue-900/10",  dotCls: "bg-blue-500" },
  { key: "active",   label: "Активна",    colorCls: "border-violet-800/60 bg-violet-900/10", dotCls: "bg-violet-500" },
  { key: "at_risk",  label: "Под риском", colorCls: "border-amber-800/60 bg-amber-900/10", dotCls: "bg-amber-500" },
  { key: "done",     label: "Готово",     colorCls: "border-emerald-800/60 bg-emerald-900/10", dotCls: "bg-emerald-500" },
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

const PRIORITY_LABELS: Record<string, string> = {
  critical: "Критический",
  high:     "Высокий",
  medium:   "Средний",
  low:      "Низкий",
};

const SOURCE_LABELS: Record<string, string> = {
  roadmap: "Дорожная карта", scenario: "Сценарий", report: "Отчёт", manual: "Вручную",
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
          {PRIORITY_LABELS[item.priority] ?? item.priority}
        </span>
        {item.owner && (
          <span className="text-[9px] text-gray-600 truncate max-w-[80px]">{item.owner.split("@")[0]}</span>
        )}
        {days !== null && (
          <span className={`ml-auto text-[9px] font-semibold ${overdue ? "text-red-400" : days < 7 ? "text-amber-400" : "text-gray-600"}`}>
            {overdue ? `+${Math.abs(days)}д просрочка` : `${days}д осталось`}
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
        {[["draft","Черновик"],["planned","Запланир."],["active","Активна"],["at_risk","Под риском"],["done","Готово"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
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
            {F("priority", "Приоритет", sel("priority", [["critical","Критический"],["high","Высокий"],["medium","Средний"],["low","Низкий"]]))}
            {F("owner", "Ответственный", inp("owner", "email или имя"))}
          </div>

          {F("source_type", "Источник", sel("source_type", [
            ["manual","Вручную"], ["roadmap","Из дорожной карты"], ["scenario","Из сценария"],
          ]))}

          {form.source_type === "roadmap" && roadmapItems.length > 0 && F("source_id", "Элемент дорожной карты",
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
            {F("baseline_value", "Стартовое", inp("baseline_value", "30"))}
            {F("target_value", "Цель", inp("target_value", "45"))}
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
                {PRIORITY_LABELS[initiative.priority] ?? initiative.priority}
              </span>
              <span className="text-[9px] text-gray-600 font-mono">{initiative.status}</span>
              <span className={`flex items-center gap-1 text-[9px] font-semibold ${health.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${health.dot}`} /> {initiative.health}
              </span>
              {initiative.source_type !== "manual" && (
                <span className="text-[9px] text-gray-700 flex items-center gap-1">
                  <Icon name={SOURCE_ICON[initiative.source_type] ?? "Circle"} size={9} />
                  {SOURCE_LABELS[initiative.source_type] ?? initiative.source_type} #{initiative.source_id}
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
                { l: "Стартовое", v: initiative.baseline_value, cls: "text-gray-500" },
                { l: "Текущее",  v: initiative.current_value,  cls: "text-violet-400 font-bold" },
                { l: "Цель",     v: initiative.target_value,   cls: "text-emerald-400" },
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
              { l: "Ответственный", v: initiative.owner || "—" },
              { l: "Сегмент",       v: initiative.target_segment || "—" },
              { l: "Старт",         v: initiative.start_date || "—" },
              { l: "Дедлайн",       v: initiative.due_date ? (() => { const d = daysUntil(initiative.due_date); return `${initiative.due_date}${d !== null ? ` (${d < 0 ? d+"д просрочка" : d+"д"})` : ""}` })() : "—" },
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
                  {[["draft","Черновик"],["planned","Запланир."],["active","Активна"],["at_risk","Под риском"],["done","Готово"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
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
                    {u.metric_value !== null && <span className="text-[9px] text-gray-600">метрика: {u.metric_value}</span>}
                    <span className="text-[9px] text-gray-700 ml-auto">
                      {new Date(u.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  {u.next_steps.length > 0 && (
                    <div className="text-[9px] text-gray-600">
                      Далее: {u.next_steps.join(" · ")}
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

// ── Decision Modal ──────────────────────────────────────────────────

function DecisionModal({ prefill, onClose, onSaved }: {
  prefill: Partial<Decision>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title:         prefill.title         ?? "",
    description:   prefill.description   ?? "",
    decision_type: prefill.decision_type ?? "other",
    status:        prefill.status        ?? "open",
    owner:         prefill.owner         ?? "",
    due_date:      prefill.due_date      ?? "",
    review_id:     prefill.review_id     ? String(prefill.review_id) : "",
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.title.trim()) return;
    setSaving(true);
    await api.decisionCreate({
      title:         form.title.trim(),
      description:   form.description,
      decision_type: form.decision_type,
      status:        form.status,
      owner:         form.owner,
      due_date:      form.due_date || undefined,
      review_id:     form.review_id ? Number(form.review_id) : undefined,
    });
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md mx-4 p-6 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-100">Создать решение</h3>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-400 p-1"><Icon name="X" size={16} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 font-semibold uppercase">Название *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600"
              placeholder="Что нужно решить?" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-gray-500 mb-1 font-semibold uppercase">Тип</label>
              <select value={form.decision_type} onChange={e => setForm(f => ({ ...f, decision_type: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-xs text-gray-300 focus:outline-none focus:border-violet-600">
                {[["priority","Приоритет"],["scope","Скоп"],["owner","Ответственный"],["metric","Метрика"],["process","Процесс"],["risk","Риск"],["other","Прочее"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1 font-semibold uppercase">Статус</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-xs text-gray-300 focus:outline-none focus:border-violet-600">
                {[["open","Открыт"],["in_progress","В работе"],["decided","Решено"],["done","Выполнено"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-gray-500 mb-1 font-semibold uppercase">Ответственный</label>
              <input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600"
                placeholder="email / имя" />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1 font-semibold uppercase">Дедлайн</label>
              <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-xs text-gray-200 focus:outline-none focus:border-violet-600" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 font-semibold uppercase">Описание / контекст</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600 resize-none"
              placeholder="Почему нужно это решение..." />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm rounded-xl transition-colors">Отмена</button>
          <button onClick={save} disabled={saving || !form.title.trim()}
            className="flex-1 px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors">
            {saving ? "Сохраняю..." : "Создать"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Watchlist Modal ─────────────────────────────────────────────────

function WatchlistModal({ prefill, onClose, onSaved }: {
  prefill: Partial<Watchlist>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name:        prefill.name        ?? "",
    description: prefill.description ?? "",
    scope_type:  prefill.scope_type  ?? "custom",
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    await api.watchlistCreate({ ...form, rules: [] });
    setSaving(false);
    onSaved();
  }

  const inp = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md mx-4 p-6 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-100">Создать наблюдение</h3>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-400 p-1"><Icon name="X" size={16} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 font-semibold uppercase">Название *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className={inp} placeholder="Например: PM/Operations Segment" />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 font-semibold uppercase">Описание</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2} className={`${inp} resize-none`} placeholder="Что отслеживаем..." />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 font-semibold uppercase">Тип scope</label>
            <select value={form.scope_type} onChange={e => setForm(f => ({ ...f, scope_type: e.target.value }))}
              className={inp}>
              {["global","segment","initiative","roadmap","custom"].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <p className="text-[10px] text-gray-600">Правила можно настроить в настройках watchlist после создания.</p>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm rounded-xl transition-colors">Отмена</button>
          <button onClick={save} disabled={saving || !form.name.trim()}
            className="flex-1 px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors">
            {saving ? "Создаю..." : "Создать"}
          </button>
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

  // W7.2: Weekly Reviews
  const [reviews, setReviews] = useState<WeeklyReview[]>([]);
  const [reviewDetail, setReviewDetail] = useState<WeeklyReviewDetail | null>(null);
  const [generatingReview, setGeneratingReview] = useState(false);
  const [reviewWeekStart, setReviewWeekStart] = useState("");
  const [showDecisionModal, setShowDecisionModal] = useState<Partial<Decision> | null>(null);

  // W7.2: Decisions
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [decisionsFilter, setDecisionsFilter] = useState("open");
  const [loadingDecisions, setLoadingDecisions] = useState(false);

  // W7.3: Alerts + Watchlists
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsSummary, setAlertsSummary] = useState<AlertSummary | null>(null);
  const [alertsFilter, setAlertsFilter] = useState<Record<string, string>>({});
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [showWatchlistModal, setShowWatchlistModal] = useState<Partial<Watchlist> | null>(null);

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

  const loadReviews = useCallback(async () => {
    const d = await api.weeklyReviewsList();
    setReviews(d.reviews ?? []);
  }, []);

  const loadDecisions = useCallback(async (filter = decisionsFilter) => {
    setLoadingDecisions(true);
    const params: Record<string, string> = filter && filter !== "all" ? { status: filter } : {};
    const d = await api.decisionsList(params);
    setDecisions(d.decisions ?? []);
    setOverdueCount(d.overdue_count ?? 0);
    setLoadingDecisions(false);
  }, [decisionsFilter]);

  const loadAlerts = useCallback(async (filter: Record<string, string> = alertsFilter) => {
    setLoadingAlerts(true);
    const [al, sm] = await Promise.all([api.alertsList(filter), api.alertsSummary()]);
    setAlerts(al.alerts ?? []);
    setAlertsSummary(sm.summary ?? null);
    setLoadingAlerts(false);
  }, [alertsFilter]);

  const loadWatchlists = useCallback(async () => {
    const d = await api.watchlistsList();
    setWatchlists(d.watchlists ?? []);
  }, []);

  useEffect(() => {
    if (view === "reviews")    loadReviews();
    if (view === "decisions")  loadDecisions(decisionsFilter);
    if (view === "alerts")     loadAlerts(alertsFilter);
    if (view === "watchlists") loadWatchlists();
  }, [view, loadReviews, loadDecisions, loadAlerts, loadWatchlists, decisionsFilter, alertsFilter]);

  async function generateReview() {
    setGeneratingReview(true);
    const body: Record<string, string> = {};
    if (reviewWeekStart) {
      const start = new Date(reviewWeekStart);
      const end = new Date(start); end.setDate(end.getDate() + 6);
      body.week_start = reviewWeekStart;
      body.week_end = end.toISOString().split("T")[0];
    }
    await api.weeklyReviewGenerate(body);
    setGeneratingReview(false);
    await loadReviews();
    showMsg("Weekly Review сгенерирован");
  }

  async function openReview(id: number) {
    const d = await api.weeklyReviewGet(id);
    setReviewDetail(d.review ?? null);
  }

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
    { label: "Активные",     value: summary.active,   icon: "Activity",      cls: "text-violet-400" },
    { label: "Под риском",   value: summary.at_risk,  icon: "AlertTriangle", cls: summary.at_risk  > 0 ? "text-amber-400" : "text-gray-400" },
    { label: "Просроченные", value: summary.overdue,  icon: "Clock",         cls: summary.overdue  > 0 ? "text-red-400"   : "text-gray-400" },
    { label: "Готово 30д",   value: summary.done_30d, icon: "CheckCircle2",  cls: "text-emerald-400" },
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
            <div className="flex items-center bg-gray-800 rounded-xl p-1 gap-0.5 flex-wrap">
              {([
                ["board",      "Kanban",       "Доска"],
                ["list",       "List",         "Список"],
                ["reviews",    "CalendarDays", "Обзоры"],
                ["decisions",  "CheckSquare",  "Решения"],
                ["alerts",     "Bell",         "Алерты"],
                ["watchlists", "Eye",          "Вотчлисты"],
              ] as const).map(([k, icon, label]) => (
                <button key={k} onClick={() => setView(k as ViewTab)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${view === k ? "bg-gray-700 text-gray-100" : "text-gray-500 hover:text-gray-300"}`}>
                  <Icon name={icon} size={12} />
                  {label}
                  {k === "alerts" && alertsSummary && alertsSummary.open > 0 && (
                    <span className={`text-[9px] font-bold px-1 rounded-full ml-0.5 ${alertsSummary.critical > 0 ? "bg-red-600 text-white" : "bg-amber-600 text-white"}`}>
                      {alertsSummary.open}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {(view === "board" || view === "list") && (
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2 bg-violet-700 hover:bg-violet-600 text-white text-xs font-semibold rounded-xl transition-colors">
                <Icon name="Plus" size={13} /> Инициатива
              </button>
            )}
            {view === "reviews" && (
              <button onClick={generateReview} disabled={generatingReview}
                className="flex items-center gap-2 px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white text-xs font-semibold rounded-xl transition-colors">
                {generatingReview ? <Spinner /> : <Icon name="CalendarDays" size={13} />}
                Сгенерировать ревью
              </button>
            )}
            {view === "decisions" && (
              <button onClick={() => setShowDecisionModal({})}
                className="flex items-center gap-2 px-4 py-2 bg-violet-700 hover:bg-violet-600 text-white text-xs font-semibold rounded-xl transition-colors">
                <Icon name="Plus" size={13} /> Решение
              </button>
            )}
            {view === "alerts" && (
              <button onClick={async () => { setEvaluating(true); await api.alertsEvaluate(); await loadAlerts(alertsFilter); setEvaluating(false); showMsg("Оценка завершена"); }}
                disabled={evaluating}
                className="flex items-center gap-2 px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white text-xs font-semibold rounded-xl transition-colors">
                {evaluating ? <Spinner /> : <Icon name="Zap" size={13} />}
                Запустить оценку
              </button>
            )}
            {view === "watchlists" && (
              <button onClick={() => setShowWatchlistModal({})}
                className="flex items-center gap-2 px-4 py-2 bg-violet-700 hover:bg-violet-600 text-white text-xs font-semibold rounded-xl transition-colors">
                <Icon name="Plus" size={13} /> Наблюдение
              </button>
            )}
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
                  {["","Инициатива","Статус","Приоритет","Ответственный","Метрика","Прогресс","Дедлайн","Здоровье"].map(h => (
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
                          {PRIORITY_LABELS[item.priority] ?? item.priority}
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
                            {overdue ? `${Math.abs(days)}д просрочка` : `${days}д`}
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

        {/* ── WEEKLY REVIEWS TAB ──────────────────────────────────── */}
        {view === "reviews" && (
          <div className="space-y-5">
            {/* Week picker */}
            <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div>
                <p className="text-[10px] text-gray-500 mb-1 font-semibold uppercase">Начало недели (необязательно)</p>
                <input type="date" value={reviewWeekStart} onChange={e => setReviewWeekStart(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-violet-600" />
              </div>
              <p className="text-xs text-gray-600 mt-4">Пусто = текущая неделя</p>
            </div>

            {/* Reviews list */}
            {reviews.length === 0 && (
              <div className="text-center py-10 text-gray-600 text-sm">
                Обзоров пока нет. Нажмите «Generate Review».
              </div>
            )}
            <div className="space-y-2">
              {reviews.map(r => {
                const CONF: Record<string, string> = { high: "text-emerald-400", medium: "text-amber-400", low: "text-gray-500" };
                return (
                  <div key={r.id} className={`bg-gray-900 border rounded-xl p-4 flex items-center gap-4 ${r.status === "published" ? "border-violet-800/40" : "border-gray-800"}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${r.status === "published" ? "bg-violet-900/40 text-violet-400 border-violet-800" : "bg-gray-800 text-gray-500 border-gray-700"}`}>
                          {r.status}
                        </span>
                        <span className={`text-[10px] font-semibold ${CONF[r.confidence] ?? "text-gray-500"}`}>
                          {{ high: "высокая", medium: "средняя", low: "низкая" }[r.confidence] ?? r.confidence} уверенность
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-gray-200">{r.title}</p>
                      <p className="text-[10px] text-gray-600">
                        {r.week_start} — {r.week_end} · {new Date(r.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · {r.created_by}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => openReview(r.id)}
                        className="text-[10px] px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700 rounded-lg transition-colors">
                        Открыть
                      </button>
                      {r.status === "draft" && (
                        <button onClick={async () => { await api.weeklyReviewPublish(r.id); await loadReviews(); showMsg("Опубликовано"); }}
                          className="text-[10px] px-2.5 py-1.5 bg-violet-900/40 hover:bg-violet-800/50 text-violet-400 border border-violet-800 rounded-lg transition-colors">
                          Опубликовать
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Review detail panel */}
            {reviewDetail && (
              <div className="bg-gray-900 border border-violet-800/40 rounded-xl p-5 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-base font-bold text-gray-100">{reviewDetail.title}</p>
                    <p className="text-[10px] text-gray-600">{reviewDetail.week_start} — {reviewDetail.week_end} · confidence: {reviewDetail.confidence}</p>
                  </div>
                  <button onClick={() => setReviewDetail(null)} className="text-gray-600 hover:text-gray-400 p-1"><Icon name="X" size={14} /></button>
                </div>

                {/* AI Digest */}
                {reviewDetail.ai_digest && !("error" in (reviewDetail.ai_digest as Record<string,unknown>)) && (
                  <div className="space-y-4">
                    {(reviewDetail.ai_digest as Record<string,unknown>).executive_summary && (
                      <div className="bg-violet-900/20 border border-violet-800/40 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Icon name="Sparkles" size={13} className="text-violet-400" />
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Общий итог</p>
                        </div>
                        <p className="text-sm text-violet-200">{String((reviewDetail.ai_digest as Record<string,unknown>).executive_summary)}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      {/* Wins */}
                      {Array.isArray((reviewDetail.ai_digest as Record<string,unknown>).wins) && (reviewDetail.ai_digest as Record<string,unknown>).wins !== null && (
                        <div className="bg-emerald-900/20 border border-emerald-800/40 rounded-xl p-3">
                          <p className="text-[10px] text-emerald-400 font-semibold uppercase mb-2">Успехи</p>
                          {((reviewDetail.ai_digest as Record<string,unknown>).wins as string[]).map((w, i) => (
                            <div key={i} className="flex gap-2 mb-1"><span className="text-emerald-500">✓</span><span className="text-xs text-gray-300">{w}</span></div>
                          ))}
                        </div>
                      )}
                      {/* Risks */}
                      {Array.isArray((reviewDetail.ai_digest as Record<string,unknown>).risks) && (
                        <div className="bg-red-900/20 border border-red-800/40 rounded-xl p-3">
                          <p className="text-[10px] text-red-400 font-semibold uppercase mb-2">Риски</p>
                          {((reviewDetail.ai_digest as Record<string,unknown>).risks as string[]).map((r, i) => (
                            <div key={i} className="flex gap-2 mb-1"><span className="text-red-500">⚠</span><span className="text-xs text-gray-300">{r}</span></div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Blockers */}
                    {Array.isArray((reviewDetail.ai_digest as Record<string,unknown>).blockers) && ((reviewDetail.ai_digest as Record<string,unknown>).blockers as string[]).length > 0 && (
                      <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3">
                        <p className="text-[10px] text-amber-400 font-semibold uppercase mb-2">Блокеры</p>
                        {((reviewDetail.ai_digest as Record<string,unknown>).blockers as string[]).map((b, i) => (
                          <div key={i} className="flex gap-2 mb-1"><span className="text-amber-500">⊘</span><span className="text-xs text-gray-300">{b}</span></div>
                        ))}
                      </div>
                    )}

                    {/* Decisions needed */}
                    {Array.isArray((reviewDetail.ai_digest as Record<string,unknown>).decisions_needed) && ((reviewDetail.ai_digest as Record<string,unknown>).decisions_needed as Record<string,unknown>[]).length > 0 && (
                      <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3">
                        <p className="text-[10px] text-violet-400 font-semibold uppercase mb-2">Требуются решения</p>
                        {((reviewDetail.ai_digest as Record<string,unknown>).decisions_needed as Record<string,unknown>[]).map((d, i) => (
                          <div key={i} className="flex items-start gap-2 mb-2">
                            <div className="flex-1">
                              <p className="text-xs font-semibold text-gray-200">{String(d.title)}</p>
                              {d.context && <p className="text-[10px] text-gray-500">{String(d.context)}</p>}
                            </div>
                            <button onClick={() => setShowDecisionModal({
                              review_id: reviewDetail.id,
                              title: String(d.title),
                              description: String(d.context ?? ""),
                              decision_type: String(d.type ?? "other"),
                            })}
                              className="text-[9px] px-2 py-0.5 bg-violet-900/30 text-violet-400 border border-violet-800/40 rounded hover:bg-violet-800/40 transition-colors flex-shrink-0">
                              + Решение
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Next week focus */}
                    {Array.isArray((reviewDetail.ai_digest as Record<string,unknown>).next_week_focus) && (
                      <div className="bg-gray-800/40 border border-gray-700/60 rounded-xl p-3">
                        <p className="text-[10px] text-gray-500 font-semibold uppercase mb-2">Фокус на следующей неделе</p>
                        {((reviewDetail.ai_digest as Record<string,unknown>).next_week_focus as string[]).map((f, i) => (
                          <div key={i} className="flex gap-2 mb-1"><span className="text-violet-500">→</span><span className="text-xs text-gray-300">{f}</span></div>
                        ))}
                      </div>
                    )}

                    {(reviewDetail.ai_digest as Record<string,unknown>).confidence_note && (
                      <p className="text-[10px] text-gray-600 italic">{String((reviewDetail.ai_digest as Record<string,unknown>).confidence_note)}</p>
                    )}
                  </div>
                )}

                {/* Initiatives snapshot */}
                {reviewDetail.initiatives && (
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { l: "Активные",   v: (reviewDetail.initiatives as Record<string,unknown>).total_active,  cls: "text-violet-400" },
                      { l: "Под риском", v: (reviewDetail.initiatives as Record<string,unknown>).at_risk,       cls: "text-amber-400" },
                      { l: "Закрыто",    v: (reviewDetail.initiatives as Record<string,unknown>).done_week,     cls: "text-emerald-400" },
                      { l: "Просрочено", v: (reviewDetail.initiatives as Record<string,unknown>).overdue,       cls: "text-red-400" },
                    ].map(({ l, v, cls }) => (
                      <div key={l} className="bg-gray-800/40 border border-gray-700/60 rounded-xl p-3 text-center">
                        <p className="text-[9px] text-gray-600 mb-0.5">{l}</p>
                        <p className={`text-xl font-bold ${cls}`}>{String(v ?? 0)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Linked decisions */}
                {reviewDetail.decisions && reviewDetail.decisions.length > 0 && (
                  <div>
                    <p className="text-[10px] text-gray-500 font-semibold uppercase mb-2">Связанные решения ({reviewDetail.decisions.length})</p>
                    {reviewDetail.decisions.map(d => (
                      <div key={d.id} className="flex items-center gap-2 py-1.5 border-b border-gray-800">
                        <span className={`w-1.5 h-1.5 rounded-full ${d.status === "done" ? "bg-emerald-500" : d.status === "open" ? "bg-amber-500" : "bg-gray-600"}`} />
                        <span className="text-xs text-gray-300 flex-1">{d.title}</span>
                        <span className="text-[9px] text-gray-600">{d.status}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={() => setShowDecisionModal({ review_id: reviewDetail.id })}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-xl border border-gray-700 transition-colors">
                    <Icon name="Plus" size={12} /> Решение
                  </button>
                  {reviewDetail.status === "draft" && (
                    <button onClick={async () => { await api.weeklyReviewPublish(reviewDetail.id); await loadReviews(); setReviewDetail(prev => prev ? { ...prev, status: "published" } : null); showMsg("Опубликовано"); }}
                      className="flex items-center gap-2 px-3 py-2 bg-violet-700 hover:bg-violet-600 text-white text-xs font-semibold rounded-xl transition-colors">
                      <Icon name="Globe" size={12} /> Опубликовать
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── DECISIONS TAB ───────────────────────────────────────── */}
        {view === "decisions" && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              {[["open","Открыт"],["in_progress","В работе"],["decided","Решено"],["done","Выполнено"],["all","Все"]].map(([v, l]) => (
                <button key={v} onClick={() => { setDecisionsFilter(v); loadDecisions(v); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${decisionsFilter === v ? "bg-violet-700 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700"}`}>
                  {l}
                </button>
              ))}
              {overdueCount > 0 && (
                <span className="ml-auto text-xs font-semibold text-red-400 flex items-center gap-1">
                  <Icon name="Clock" size={12} /> {overdueCount} просрочено
                </span>
              )}
            </div>

            {loadingDecisions && <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>}

            {!loadingDecisions && decisions.length === 0 && (
              <div className="text-center py-10 text-gray-600 text-sm">Решений пока нет. Создайте из Weekly Review или вручную.</div>
            )}

            {!loadingDecisions && decisions.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      {["Решение","Тип","Статус","Ответственный","Дедлайн","Инициатива",""].map(h => (
                        <th key={h} className="text-left text-[10px] text-gray-500 font-semibold uppercase tracking-wide px-3 py-2.5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {decisions.map(d => {
                      const days = d.due_date ? Math.round((new Date(d.due_date).getTime() - Date.now()) / 86400000) : null;
                      const overdue = days !== null && days < 0 && d.status !== "done";
                      const TYPE_COLOR: Record<string, string> = {
                        priority: "text-violet-400", risk: "text-red-400", scope: "text-amber-400",
                        owner: "text-blue-400", metric: "text-emerald-400", process: "text-gray-400", other: "text-gray-500",
                      };
                      const STATUS_CFG: Record<string, string> = {
                        open: "bg-amber-900/30 text-amber-400 border-amber-800",
                        in_progress: "bg-violet-900/30 text-violet-400 border-violet-800",
                        decided: "bg-blue-900/30 text-blue-400 border-blue-800",
                        done: "bg-emerald-900/30 text-emerald-400 border-emerald-800",
                      };
                      return (
                        <tr key={d.id} className="border-b border-gray-800/60 hover:bg-gray-800/20 transition-colors">
                          <td className="px-3 py-2.5 max-w-[220px]">
                            <p className="text-xs font-semibold text-gray-200 truncate">{d.title}</p>
                            {d.description && <p className="text-[9px] text-gray-600 truncate">{d.description}</p>}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`text-[10px] font-semibold ${TYPE_COLOR[d.decision_type] ?? "text-gray-500"}`}>
                              {{ priority:"Приоритет", scope:"Скоп", owner:"Ответственный", metric:"Метрика", process:"Процесс", risk:"Риск", other:"Прочее" }[d.decision_type] ?? d.decision_type}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <select value={d.status} onChange={async e => { await api.decisionUpdate({ id: d.id, status: e.target.value }); await loadDecisions(decisionsFilter); }}
                              onClick={e => e.stopPropagation()}
                              className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border focus:outline-none cursor-pointer bg-transparent ${STATUS_CFG[d.status] ?? "bg-gray-800 text-gray-500 border-gray-700"}`}>
                              {[["open","Открыт"],["in_progress","В работе"],["decided","Решено"],["done","Выполнено"]].map(([v,l]) => <option key={v} value={v} className="bg-gray-900">{l}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">{d.owner || "—"}</td>
                          <td className="px-3 py-2.5">
                            {days !== null ? (
                              <span className={`text-[10px] font-semibold ${overdue ? "text-red-400" : days < 3 ? "text-amber-400" : "text-gray-600"}`}>
                                {overdue ? `${Math.abs(days)}д просрочка` : `${days}д`}
                              </span>
                            ) : <span className="text-[10px] text-gray-700">—</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            {d.linked_initiative_id ? (
                              <span className="text-[10px] text-violet-400">#{d.linked_initiative_id}</span>
                            ) : <span className="text-[10px] text-gray-700">—</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            <button onClick={() => api.decisionDelete(d.id).then(() => loadDecisions(decisionsFilter))}
                              className="text-gray-700 hover:text-red-500 p-1 transition-colors">
                              <Icon name="Trash2" size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── ALERTS TAB ──────────────────────────────────────────── */}
        {view === "alerts" && (
          <div className="space-y-4">
            {/* Summary cards */}
            {alertsSummary && (
              <div className="grid grid-cols-5 gap-2">
                {[
                  { l: "Открытых",    v: alertsSummary.open,          cls: alertsSummary.open > 0 ? "text-amber-400" : "text-gray-400",    icon: "Bell" },
                  { l: "Критичных",   v: alertsSummary.critical,      cls: alertsSummary.critical > 0 ? "text-red-400" : "text-gray-400",  icon: "AlertOctagon" },
                  { l: "Принято",     v: alertsSummary.acknowledged,  cls: "text-blue-400",                                                icon: "Eye" },
                  { l: "Решено/нед",  v: alertsSummary.resolved_week, cls: "text-emerald-400",                                             icon: "CheckCircle2" },
                  { l: "Просрочено",  v: alertsSummary.with_overdue,  cls: alertsSummary.with_overdue > 0 ? "text-red-400" : "text-gray-400", icon: "Clock" },
                ].map(({ l, v, cls, icon }) => (
                  <div key={l} className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center gap-2">
                    <Icon name={icon} size={15} className={cls} />
                    <div>
                      <p className="text-[9px] text-gray-600">{l}</p>
                      <p className={`text-lg font-bold ${cls}`}>{v}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              {([
                ["","Все"],
                ["open","Открытые"],
                ["acknowledged","Принятые"],
                ["resolved","Решённые"],
                ["dismissed","Отклонённые"],
              ] as const).map(([v, l]) => (
                <button key={v} onClick={() => { const f = v ? { status: v } : {}; setAlertsFilter(f); loadAlerts(f); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${JSON.stringify(alertsFilter) === JSON.stringify(v ? { status: v } : {}) ? "bg-violet-700 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700"}`}>
                  {l}
                </button>
              ))}
              <div className="ml-auto flex gap-2">
                {(["critical","warning","info"] as const).map(sv => (
                  <button key={sv} onClick={() => { const f = { severity: sv }; setAlertsFilter(f); loadAlerts(f); }}
                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-colors border ${
                      sv === "critical" ? "border-red-800 text-red-400 hover:bg-red-900/20" :
                      sv === "warning"  ? "border-amber-800 text-amber-400 hover:bg-amber-900/20" :
                                          "border-gray-700 text-gray-500 hover:bg-gray-800"
                    } ${alertsFilter.severity === sv ? "bg-gray-800" : ""}`}>
                    {{ critical: "Критичный", warning: "Предупреждение", info: "Инфо" }[sv]}
                  </button>
                ))}
              </div>
            </div>

            {loadingAlerts && <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>}

            {!loadingAlerts && alerts.length === 0 && (
              <div className="text-center py-10 text-gray-600 text-sm">
                Алертов нет. Нажмите «Запустить оценку» чтобы проверить наблюдения.
              </div>
            )}

            {!loadingAlerts && alerts.length > 0 && (
              <div className="space-y-2">
                {alerts.map(a => {
                  const SEV: Record<string, { border: string; badge: string; dot: string }> = {
                    critical: { border: "border-red-800/50",    badge: "bg-red-900/40 text-red-400 border-red-800",       dot: "bg-red-500" },
                    warning:  { border: "border-amber-800/50",  badge: "bg-amber-900/40 text-amber-400 border-amber-800",  dot: "bg-amber-500" },
                    info:     { border: "border-gray-700",      badge: "bg-gray-800 text-gray-400 border-gray-700",        dot: "bg-gray-500" },
                  };
                  const sev = SEV[a.severity] ?? SEV.info;
                  return (
                    <div key={a.id} className={`bg-gray-900 border ${sev.border} rounded-xl p-4`}>
                      <div className="flex items-start gap-3">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${sev.dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${sev.badge}`}>{{ critical: "Критичный", warning: "Предупреждение", info: "Инфо" }[a.severity] ?? a.severity}</span>
                            <span className="text-[9px] text-gray-600 font-mono">{a.alert_type}</span>
                            {a.watchlist_name && <span className="text-[9px] text-gray-700">· {a.watchlist_name}</span>}
                            {a.entity_type && <span className="text-[9px] text-violet-500">{a.entity_type}{a.entity_id ? ` #${a.entity_id}` : ""}</span>}
                          </div>
                          <p className="text-xs font-semibold text-gray-200 mb-0.5">{a.title}</p>
                          <p className="text-[10px] text-gray-500">{a.message}</p>
                          {(a.current_value !== null || a.baseline_value !== null) && (
                            <div className="flex gap-3 mt-1.5">
                              {a.baseline_value !== null && <span className="text-[9px] text-gray-600">База: {a.baseline_value}</span>}
                              {a.current_value  !== null && <span className="text-[9px] text-gray-300 font-semibold">Текущее: {a.current_value}</span>}
                              {a.delta_value    !== null && (
                                <span className={`text-[9px] font-bold ${a.delta_value < 0 ? "text-red-400" : "text-emerald-400"}`}>
                                  Δ {a.delta_value > 0 ? "+" : ""}{a.delta_value}
                                </span>
                              )}
                            </div>
                          )}
                          <p className="text-[9px] text-gray-700 mt-1">
                            Сработал: {new Date(a.first_triggered_at).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                            {a.last_triggered_at !== a.first_triggered_at && ` · Послед.: ${new Date(a.last_triggered_at).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`}
                          </p>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          {a.status === "open" && (
                            <button onClick={async () => { await api.alertUpdate({ id: a.id, status: "acknowledged" }); await loadAlerts(alertsFilter); }}
                              className="text-[9px] px-2 py-1 bg-blue-900/30 text-blue-400 border border-blue-800 rounded-lg hover:bg-blue-800/40 transition-colors">
                              Принять
                            </button>
                          )}
                          {(a.status === "open" || a.status === "acknowledged") && (
                            <button onClick={async () => { await api.alertUpdate({ id: a.id, status: "resolved" }); await loadAlerts(alertsFilter); }}
                              className="text-[9px] px-2 py-1 bg-emerald-900/30 text-emerald-400 border border-emerald-800 rounded-lg hover:bg-emerald-800/40 transition-colors">
                              Решить
                            </button>
                          )}
                          {a.status === "open" && (
                            <button onClick={async () => { await api.alertUpdate({ id: a.id, status: "dismissed" }); await loadAlerts(alertsFilter); }}
                              className="text-[9px] px-2 py-1 bg-gray-800 text-gray-500 border border-gray-700 rounded-lg hover:bg-gray-700 transition-colors">
                              Отклонить
                            </button>
                          )}
                          <button onClick={() => setShowDecisionModal({ title: a.title, description: a.message, decision_type: a.severity === "critical" ? "risk" : "other" })}
                            className="text-[9px] px-2 py-1 bg-violet-900/30 text-violet-400 border border-violet-800 rounded-lg hover:bg-violet-800/40 transition-colors">
                            + Решение
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── WATCHLISTS TAB ──────────────────────────────────────── */}
        {view === "watchlists" && (
          <div className="space-y-3">
            {watchlists.length === 0 && (
              <div className="text-center py-10 text-gray-600 text-sm">Наблюдения загружаются...</div>
            )}
            {watchlists.map(w => (
              <div key={w.id} className={`bg-gray-900 border rounded-xl p-4 flex items-center gap-4 ${w.is_system ? "border-violet-800/30" : "border-gray-800"}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {w.is_system && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-violet-900/40 text-violet-400 border border-violet-800 rounded-full">системный</span>
                    )}
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold ${w.status === "active" ? "bg-emerald-900/30 text-emerald-400 border-emerald-800" : "bg-gray-800 text-gray-500 border-gray-700"}`}>
                      {w.status === "active" ? "Активен" : "Приостановлен"}
                    </span>
                    <span className="text-[9px] text-gray-600">{w.scope_type}</span>
                    <span className="text-[9px] text-gray-700">· {(w.rules as unknown[]).length} правил</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-200">{w.name}</p>
                  {w.description && <p className="text-[10px] text-gray-600 mt-0.5">{w.description}</p>}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {w.active_alerts > 0 && (
                    <div className="text-center">
                      <p className="text-xs font-bold text-amber-400">{w.active_alerts}</p>
                      <p className="text-[9px] text-gray-600">алертов</p>
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <button onClick={async () => { setEvaluating(true); await api.alertsEvaluate({ watchlist_id: w.id }); await Promise.all([loadWatchlists(), loadAlerts(alertsFilter)]); setEvaluating(false); showMsg("Оценено"); }}
                      disabled={evaluating || w.status !== "active"}
                      className="text-[9px] px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700 rounded-lg transition-colors disabled:opacity-40">
                      Запустить
                    </button>
                    {!w.is_system && (
                      <button onClick={async () => { await api.watchlistUpdate({ id: w.id, status: w.status === "active" ? "paused" : "active" }); await loadWatchlists(); }}
                        className="text-[9px] px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700 rounded-lg transition-colors">
                        {w.status === "active" ? "Пауза" : "Возобновить"}
                      </button>
                    )}
                    {w.is_system && (
                      <button onClick={async () => { await api.watchlistUpdate({ id: w.id, status: w.status === "active" ? "paused" : "active" }); await loadWatchlists(); }}
                        className="text-[9px] px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700 rounded-lg transition-colors">
                        {w.status === "active" ? "Пауза" : "Возобновить"}
                      </button>
                    )}
                    {!w.is_system && (
                      <button onClick={async () => { if (confirm("Удалить наблюдение?")) { await api.watchlistDelete(w.id); await loadWatchlists(); } }}
                        className="text-[9px] px-2 py-1 bg-gray-800 hover:bg-red-900/30 text-gray-600 hover:text-red-400 border border-gray-700 rounded-lg transition-colors">
                        <Icon name="Trash2" size={10} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Decision create/edit modal */}
      {showDecisionModal !== null && (
        <DecisionModal
          prefill={showDecisionModal}
          onClose={() => setShowDecisionModal(null)}
          onSaved={() => { setShowDecisionModal(null); loadDecisions(decisionsFilter); showMsg("Решение сохранено"); }}
        />
      )}

      {/* Watchlist modal */}
      {showWatchlistModal !== null && (
        <WatchlistModal
          prefill={showWatchlistModal}
          onClose={() => setShowWatchlistModal(null)}
          onSaved={() => { setShowWatchlistModal(null); loadWatchlists(); showMsg("Наблюдение создано"); }}
        />
      )}

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