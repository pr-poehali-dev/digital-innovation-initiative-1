import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { STRATEGY_URL, strategyHdr as hdrFn, stratReq, stratAction as roadmapReq, api as stratApi } from "@/lib/strategyApi";

function hdr() { return hdrFn(); }

// ── Types ──────────────────────────────────────────────────────────

type Period = "7" | "30" | "90" | "180";
type KPI = { key: string; label: string; value: number | null; prev?: number; delta?: number | null; unit?: string };
type FunnelStage = { stage: string; label: string; users: number; conv_from_prev: number; conv_total: number };
type SegmentRow = { key: string; label: string; size: number; activation_rate: number; completion_rate: number; ticket_rate: number; flagged_share: number };
type LearningData = {
  goals_by_status: Record<string, number>;
  zero_checkin_active_pct: number; reopen_events_period: number;
  avg_checkins_per_active_goal: number; checkins_in_period: number;
  checkin_distribution: { bucket: string; goals: number }[];
  users_with_education_items: number;
};
type SupportData = {
  total_tickets: number; by_priority: { priority: string; count: number }[];
  by_status: { status: string; count: number }[];
  by_module: { module: string; count: number }[];
  repeat_requesters: { email: string; tickets: number }[];
  stalled_users_with_tickets: number; critical_open: number;
};
type AISummary = {
  headline?: string; health_score?: number; health_reasoning?: string;
  key_insights?: { title: string; claim: string; confidence: string; impact: string }[];
  top_risks?: string[]; top_opportunities?: string[];
  recommended_focus?: string; next_actions?: string[];
  data_maturity?: string; raw?: string; error?: string;
};
type Hypothesis = {
  id: number; title: string; problem: string; hypothesis: string;
  expected_impact: string; effort: string; target_metric: string;
  target_segment: string; evidence: string; how_to_measure: string;
};
type StrategicPillar = { id: string; title: string; description: string };
type Guardrail       = { title: string; description: string };
type Profile = {
  vision_text: string; product_thesis: string;
  mission_text: string; north_star_name: string; north_star_definition: string;
  target_segments: string[]; quarter_goals: string[];
  priority_themes: string[]; non_goals: string[];
  strategic_pillars: StrategicPillar[];
  guardrails: Guardrail[];
};
type RoadmapItem = {
  id: number; title: string; description: string;
  lane: "now" | "next" | "later"; status: string;
  source_type: string; source_report_id: number | null;
  source_payload: Record<string, unknown>;
  target_segment: string; target_metric: string;
  impact: string; effort: string; confidence: string;
  owner: string; sort_order: number;
  created_by: string; created_at: string; updated_at: string;
};
type RoadmapBoard = { now: RoadmapItem[]; next: RoadmapItem[]; later: RoadmapItem[] };
type ReportItem = {
  id: number; report_type: string;
  period_start: string | null; period_end: string | null;
  created_by: string; created_at: string;
  meta: { data_maturity?: string; health_score?: number; sample_users?: number; focus?: string; segment?: string };
};
type InsightPayload = {
  source_type: "summary" | "hypothesis" | "next_action" | "segment_plan" | "manual";
  source_report_id?: number | null;
  insight_payload?: Record<string, unknown>;
  prefill_title?: string;
  prefill_target_metric?: string;
  prefill_target_segment?: string;
  prefill_impact?: string;
  prefill_effort?: string;
  prefill_description?: string;
};

// ── API (via strategyApi.ts) ────────────────────────────────────────

// ── Helpers ────────────────────────────────────────────────────────

function DeltaBadge({ delta }: { delta?: number | null }) {
  if (delta === null || delta === undefined) return null;
  const up = delta >= 0;
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
      up ? "bg-emerald-900/40 text-emerald-400" : "bg-red-900/40 text-red-400"
    }`}>
      {up ? "▲" : "▼"} {Math.abs(delta)}%
    </span>
  );
}

function ConfBadge({ conf }: { conf: string }) {
  const cfg: Record<string, string> = {
    high:   "bg-emerald-900/40 text-emerald-400 border-emerald-800",
    medium: "bg-amber-900/30 text-amber-400 border-amber-800",
    low:    "bg-gray-800 text-gray-500 border-gray-700",
  };
  return <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${cfg[conf] ?? cfg.low}`}>{conf}</span>;
}

function ImpactBadge({ impact }: { impact: string }) {
  const cfg: Record<string, string> = {
    high:   "bg-red-900/30 text-red-400",
    medium: "bg-orange-900/30 text-orange-400",
    low:    "bg-gray-800 text-gray-500",
  };
  return <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${cfg[impact] ?? cfg.low}`}>{impact} impact</span>;
}

function Spinner() {
  return <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />;
}

// ── RoadmapCard ────────────────────────────────────────────────────

const IMPACT_COLOR: Record<string, string> = { high: "text-red-400", medium: "text-amber-400", low: "text-gray-500" };
const EFFORT_COLOR: Record<string, string> = { high: "bg-red-900/20 text-red-400", medium: "bg-amber-900/20 text-amber-400", low: "bg-emerald-900/20 text-emerald-400" };
const RM_STATUS_CFG: Record<string, string> = { idea: "bg-gray-800 text-gray-500", planned: "bg-blue-900/40 text-blue-400", in_progress: "bg-violet-900/40 text-violet-400", done: "bg-emerald-900/40 text-emerald-400" };
const SOURCE_ICON: Record<string, string> = { hypothesis: "Lightbulb", summary: "Sparkles", next_action: "ArrowRight", segment_plan: "Target", manual: "PenLine" };

function RoadmapCard({ item, onMoveLane, onDelete, onStatusChange, onStartInitiative }: {
  item: RoadmapItem;
  onMoveLane: (lane: string) => void;
  onDelete: () => void;
  onStatusChange: (status: string) => void;
  onStartInitiative?: () => void;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2 group">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-gray-200 flex-1 leading-snug">{item.title}</p>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {item.lane !== "now" && (
            <button onClick={() => onMoveLane(item.lane === "later" ? "next" : "now")}
              className="p-1 text-gray-700 hover:text-gray-400 transition-colors" title="Вперёд">
              <Icon name="ChevronLeft" size={11} />
            </button>
          )}
          {item.lane !== "later" && (
            <button onClick={() => onMoveLane(item.lane === "now" ? "next" : "later")}
              className="p-1 text-gray-700 hover:text-gray-400 transition-colors" title="Назад">
              <Icon name="ChevronRight" size={11} />
            </button>
          )}
          <button onClick={onDelete} className="p-1 text-gray-700 hover:text-red-500 transition-colors">
            <Icon name="Trash2" size={11} />
          </button>
        </div>
      </div>
      {item.description && <p className="text-[10px] text-gray-500 line-clamp-2">{item.description}</p>}
      <div className="flex items-center gap-1.5 flex-wrap">
        <select value={item.status} onChange={e => { e.stopPropagation(); onStatusChange(e.target.value); }}
          onClick={e => e.stopPropagation()}
          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border-0 focus:outline-none cursor-pointer ${RM_STATUS_CFG[item.status] ?? RM_STATUS_CFG.idea}`}>
          {[["idea","Идея"],["planned","Запланировано"],["in_progress","В работе"],["done","Готово"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span className={`text-[9px] font-semibold ${IMPACT_COLOR[item.impact] ?? "text-gray-500"}`}>↑{item.impact}</span>
        <span className={`text-[9px] px-1 py-0.5 rounded ${EFFORT_COLOR[item.effort] ?? ""}`}>{item.effort} eff.</span>
        {item.source_type && item.source_type !== "manual" && (
          <Icon name={SOURCE_ICON[item.source_type] ?? "Circle"} size={10} className="text-gray-700 ml-auto" />
        )}
      </div>
      {(item.target_metric || item.target_segment) && (
        <div className="text-[9px] text-gray-700 space-y-0.5">
          {item.target_metric && <div>📊 {item.target_metric}</div>}
          {item.target_segment && <div>👥 {item.target_segment}</div>}
        </div>
      )}
      {onStartInitiative && (
        <button onClick={e => { e.stopPropagation(); onStartInitiative(); }}
          className="w-full text-[9px] font-semibold px-2 py-1 rounded-lg bg-violet-900/20 text-violet-400 hover:bg-violet-800/30 border border-violet-800/40 transition-colors flex items-center justify-center gap-1">
          <Icon name="Rocket" size={9} /> Начать инициативу
        </button>
      )}
    </div>
  );
}

// ── Profile Editor ─────────────────────────────────────────────────

const PILLAR_ICONS: Record<string, string> = {
  identity: "User", competency: "BrainCircuit", navigator: "Compass",
  practice: "Briefcase", proof: "BadgeCheck", discovery: "Telescope",
};
const PILLAR_COLORS: Record<string, string> = {
  identity: "border-violet-800/50 bg-violet-900/10",
  competency: "border-blue-800/50 bg-blue-900/10",
  navigator: "border-emerald-800/50 bg-emerald-900/10",
  practice: "border-amber-800/50 bg-amber-900/10",
  proof: "border-teal-800/50 bg-teal-900/10",
  discovery: "border-pink-800/50 bg-pink-900/10",
};
const GUARDRAIL_ICONS: Record<string, string> = {
  "Consent-first": "ShieldCheck", "Explainability": "SearchCode",
  "Evidence > Claims": "ClipboardCheck", "Growth, not labeling": "TrendingUp", "Human Dignity": "Heart",
};

function ProfileEditor({ profile, onSave }: { profile: Profile; onSave: (p: Profile) => void }) {
  const [form, setForm] = useState<Profile>(profile);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<"vision" | "core" | "pillars" | "guardrails" | "roadmap">("vision");

  useEffect(() => { setForm(profile); }, [profile]);

  async function save() {
    setSaving(true);
    const res = await fetch(`${STRATEGY_URL}/?action=strategy_profile_update`, {
      method: "POST", headers: hdr(),
      body: JSON.stringify({
        vision_text: form.vision_text, product_thesis: form.product_thesis,
        mission_text: form.mission_text, north_star_name: form.north_star_name,
        north_star_definition: form.north_star_definition,
        target_segments: form.target_segments, quarter_goals: form.quarter_goals,
        priority_themes: form.priority_themes, non_goals: form.non_goals,
        strategic_pillars: form.strategic_pillars,
        guardrails: form.guardrails,
      }),
    });
    setSaving(false);
    if ((await res.json()).ok) onSave(form);
  }

  const inp = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600 transition-colors";
  const lbl = "block text-[10px] text-gray-500 mb-1 font-semibold uppercase tracking-wide";

  function listField(label: string, items: string[], key: keyof Profile) {
    return (
      <div>
        <label className={lbl}>{label}</label>
        {items.map((v, i) => (
          <div key={i} className="flex gap-2 mb-1.5">
            <input className={`${inp} flex-1`} value={v}
              onChange={e => setForm(f => ({ ...f, [key]: (f[key] as string[]).map((x, j) => j === i ? e.target.value : x) }))} />
            <button onClick={() => setForm(f => ({ ...f, [key]: (f[key] as string[]).filter((_, j) => j !== i) }))}
              className="text-gray-700 hover:text-red-400 transition-colors">
              <Icon name="X" size={14} />
            </button>
          </div>
        ))}
        <button onClick={() => setForm(f => ({ ...f, [key]: [...(f[key] as string[]), ""] }))}
          className="text-[10px] text-violet-400 hover:text-violet-300 font-medium">
          + Добавить
        </button>
      </div>
    );
  }

  const SECTIONS = [
    { key: "vision",     label: "Видение", icon: "Telescope" },
    { key: "core",       label: "Миссия / North Star", icon: "Star" },
    { key: "pillars",    label: "Стратегические столпы", icon: "Columns3" },
    { key: "guardrails", label: "Принципы", icon: "ShieldCheck" },
    { key: "roadmap",    label: "Цели и приоритеты", icon: "ListTodo" },
  ] as const;

  return (
    <div className="space-y-5">
      {/* Section nav */}
      <div className="flex gap-1.5 flex-wrap border-b border-gray-800 pb-3">
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${section === s.key ? "bg-violet-700 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700"}`}>
            <Icon name={s.icon} size={11} />{s.label}
          </button>
        ))}
      </div>

      {/* Vision */}
      {section === "vision" && (
        <div className="space-y-4">
          <div className="bg-violet-900/20 border border-violet-800/40 rounded-xl p-4">
            <p className="text-[10px] text-violet-400 font-semibold uppercase mb-3">Видение платформы</p>
            <textarea className={`${inp} resize-none`} rows={4} value={form.vision_text}
              onChange={e => setForm(f => ({ ...f, vision_text: e.target.value }))}
              placeholder="Глобальная платформа раскрытия профессионального потенциала..." />
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-[10px] text-gray-400 font-semibold uppercase mb-3">Продуктовый тезис</p>
            <p className="text-[10px] text-gray-600 mb-2">Что мы строим? Чем это НЕ является?</p>
            <textarea className={`${inp} resize-none`} rows={5} value={form.product_thesis}
              onChange={e => setForm(f => ({ ...f, product_thesis: e.target.value }))}
              placeholder="Мы строим Professional Operating System — профессиональную операционную систему человека. Не просто LMS, не просто job board..." />
          </div>
        </div>
      )}

      {/* Core */}
      {section === "core" && (
        <div className="space-y-4">
          <div>
            <label className={lbl}>Миссия продукта</label>
            <textarea className={`${inp} resize-none`} rows={3} value={form.mission_text}
              onChange={e => setForm(f => ({ ...f, mission_text: e.target.value }))}
              placeholder="Зачем существует этот продукт..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>North Star метрика</label>
              <input className={inp} value={form.north_star_name}
                onChange={e => setForm(f => ({ ...f, north_star_name: e.target.value }))}
                placeholder="Professionals with Verified Growth" />
            </div>
            <div>
              <label className={lbl}>Определение North Star</label>
              <input className={inp} value={form.north_star_definition}
                onChange={e => setForm(f => ({ ...f, north_star_definition: e.target.value }))}
                placeholder="Пользователи с подтверждённой картой компетенций и карьерным результатом за 90 дней" />
            </div>
          </div>
          {listField("Целевые сегменты", form.target_segments, "target_segments")}
        </div>
      )}

      {/* Pillars */}
      {section === "pillars" && (
        <div className="space-y-3">
          <p className="text-[10px] text-gray-500">6 стратегических столпов платформы</p>
          <div className="grid grid-cols-2 gap-3">
            {form.strategic_pillars.map((p, i) => (
              <div key={i} className={`border rounded-xl p-4 space-y-2 ${PILLAR_COLORS[p.id] ?? "border-gray-800 bg-gray-900"}`}>
                <div className="flex items-center gap-2">
                  <Icon name={PILLAR_ICONS[p.id] ?? "Circle"} size={14} className="text-gray-400 flex-shrink-0" />
                  <input className="bg-transparent border-none text-sm font-semibold text-gray-200 focus:outline-none w-full"
                    value={p.title}
                    onChange={e => setForm(f => ({ ...f, strategic_pillars: f.strategic_pillars.map((x, j) => j === i ? { ...x, title: e.target.value } : x) }))} />
                </div>
                <textarea className="w-full bg-transparent text-xs text-gray-500 resize-none focus:outline-none focus:text-gray-300 transition-colors" rows={3}
                  value={p.description}
                  onChange={e => setForm(f => ({ ...f, strategic_pillars: f.strategic_pillars.map((x, j) => j === i ? { ...x, description: e.target.value } : x) }))} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Guardrails */}
      {section === "guardrails" && (
        <div className="space-y-3">
          <p className="text-[10px] text-gray-500">Принципы, которые не нарушаем</p>
          {form.guardrails.map((g, i) => (
            <div key={i} className="flex gap-4 bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center">
                <Icon name={GUARDRAIL_ICONS[g.title] ?? "Shield"} size={15} className="text-violet-400" />
              </div>
              <div className="flex-1 space-y-1.5">
                <input className="w-full bg-transparent border-b border-gray-700 text-xs font-semibold text-gray-200 pb-1 focus:outline-none focus:border-violet-600"
                  value={g.title}
                  onChange={e => setForm(f => ({ ...f, guardrails: f.guardrails.map((x, j) => j === i ? { ...x, title: e.target.value } : x) }))} />
                <textarea className="w-full bg-transparent text-xs text-gray-500 resize-none focus:outline-none focus:text-gray-300 transition-colors" rows={2}
                  value={g.description}
                  onChange={e => setForm(f => ({ ...f, guardrails: f.guardrails.map((x, j) => j === i ? { ...x, description: e.target.value } : x) }))} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Roadmap */}
      {section === "roadmap" && (
        <div className="space-y-5">
          {listField("Цели на квартал", form.quarter_goals, "quarter_goals")}
          {listField("Приоритетные направления", form.priority_themes, "priority_themes")}
          {listField("Вне скоупа (non-goals)", form.non_goals, "non_goals")}
        </div>
      )}

      <button onClick={save} disabled={saving}
        className="px-5 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors">
        {saving ? "Сохраняю..." : "Сохранить"}
      </button>
    </div>
  );
}

// ── Tabs config ────────────────────────────────────────────────────

type Tab = "overview" | "health" | "trajectory" | "segments" | "learning" | "support" | "ai_lab" | "roadmap" | "reports" | "scenarios" | "profile";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "overview",   label: "Обзор",      icon: "LayoutDashboard" },
  { key: "health",     label: "Здоровье",   icon: "HeartPulse" },
  { key: "trajectory", label: "Траектория", icon: "GitBranch" },
  { key: "segments",   label: "Сегменты",   icon: "PieChart" },
  { key: "learning",   label: "Обучение",   icon: "GraduationCap" },
  { key: "support",    label: "Support",    icon: "MessageSquare" },
  { key: "ai_lab",     label: "AI Lab",     icon: "Sparkles" },
  { key: "roadmap",    label: "Roadmap",    icon: "Kanban" },
  { key: "scenarios",  label: "Сценарии",   icon: "FlaskConical" },
  { key: "reports",    label: "История",    icon: "History" },
  { key: "profile",    label: "Профиль",    icon: "Settings" },
];

// ── Main Page ──────────────────────────────────────────────────────

export default function AdminStrategyPage() {
  const navigate = useNavigate();
  const [tab, setTab]     = useState<Tab>("overview");
  const [period, setPeriod] = useState<Period>("30");

  const [overview,   setOverview]   = useState<{ kpis: KPI[] } | null>(null);
  const [health,     setHealth]     = useState<{ metrics: KPI[] } | null>(null);
  const [trajectory, setTrajectory] = useState<{ funnel: FunnelStage[]; biggest_dropoff: Record<string, unknown> } | null>(null);
  const [segments,   setSegments]   = useState<SegmentRow[] | null>(null);
  const [learning,   setLearning]   = useState<LearningData | null>(null);
  const [support,    setSupport]    = useState<SupportData | null>(null);
  const [profile,    setProfile]    = useState<Profile>({
    vision_text: "", product_thesis: "",
    mission_text: "", north_star_name: "", north_star_definition: "",
    target_segments: [], quarter_goals: [], priority_themes: [], non_goals: [],
    strategic_pillars: [], guardrails: [],
  });

  const [aiSummary,      setAiSummary]      = useState<AISummary | null>(null);
  const [hypotheses,     setHypotheses]     = useState<Hypothesis[] | null>(null);
  const [hypoFocus,      setHypoFocus]      = useState("growth");
  const [segPlan,        setSegPlan]        = useState<Record<string, unknown> | null>(null);
  const [segPlanTarget,  setSegPlanTarget]  = useState("stalled");

  // W6.3: Scenarios
  const [scenarioType,    setScenarioType]    = useState("activation_uplift");
  const [scenarioDelta,   setScenarioDelta]   = useState(10);
  const [scenarioName,    setScenarioName]    = useState("");
  const [scenarioResult,  setScenarioResult]  = useState<Record<string, unknown> | null>(null);
  const [savedScenarios,  setSavedScenarios]  = useState<Record<string, unknown>[]>([]);
  const [openedScenario,  setOpenedScenario]  = useState<Record<string, unknown> | null>(null);

  // W6.2: Roadmap + Reports
  const [roadmap,      setRoadmap]      = useState<RoadmapBoard>({ now: [], next: [], later: [] });
  const [reports,      setReports]      = useState<ReportItem[]>([]);
  const [selectedReport, setSelectedReport] = useState<Record<string, unknown> | null>(null);
  const [itemModal,    setItemModal]    = useState<InsightPayload | null>(null);
  const [itemForm,     setItemForm]     = useState({ title: "", description: "", lane: "next", target_metric: "", target_segment: "", impact: "medium", effort: "medium", confidence: "medium", owner: "" });
  const [savingItem,   setSavingItem]   = useState(false);
  const [lastSummaryReportId,  setLastSummaryReportId]  = useState<number | null>(null);
  const [lastHypoReportId,     setLastHypoReportId]     = useState<number | null>(null);
  const [lastSegPlanReportId,  setLastSegPlanReportId]  = useState<number | null>(null);

  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [toast,   setToast]   = useState<string | null>(null);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }
  function setLoad(key: string, v: boolean) { setLoading(prev => ({ ...prev, [key]: v })); }

  useEffect(() => {
    stratReq("strategy_profile_get", period).then(d => {
      if (d.profile && d.profile.mission_text !== undefined) setProfile(d.profile);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTab = useCallback(async (t: Tab, force = false) => {
    if (t === "overview" && (!overview || force)) {
      setLoad("overview", true);
      const d = await stratReq("strategy_overview", period);
      setOverview(d.overview ?? null);
      setLoad("overview", false);
    }
    if (t === "health" && (!health || force)) {
      setLoad("health", true);
      const d = await stratReq("strategy_product_health", period);
      setHealth(d.health ?? null);
      setLoad("health", false);
    }
    if (t === "trajectory" && (!trajectory || force)) {
      setLoad("trajectory", true);
      const d = await stratReq("strategy_trajectory", period);
      setTrajectory(d.trajectory ?? null);
      setLoad("trajectory", false);
    }
    if (t === "segments" && (!segments || force)) {
      setLoad("segments", true);
      const d = await stratReq("strategy_segments", period);
      setSegments(d.segments ?? null);
      setLoad("segments", false);
    }
    if (t === "learning" && (!learning || force)) {
      setLoad("learning", true);
      const d = await stratReq("strategy_learning", period);
      setLearning(d.learning ?? null);
      setLoad("learning", false);
    }
    if (t === "support" && (!support || force)) {
      setLoad("support", true);
      const d = await stratReq("strategy_support_pain_map", period);
      setSupport(d.support ?? null);
      setLoad("support", false);
    }
    if (t === "roadmap") {
      setLoad("roadmap", true);
      const d = await roadmapReq("strategy_roadmap_list");
      setRoadmap(d.roadmap ?? { now: [], next: [], later: [] });
      setLoad("roadmap", false);
    }
    if (t === "reports") {
      setLoad("reports", true);
      const d = await roadmapReq("strategy_reports_list");
      setReports(d.reports ?? []);
      setLoad("reports", false);
    }
    if (t === "scenarios") {
      setLoad("scenarios_list", true);
      const d = await roadmapReq("strategy_scenarios_list");
      setSavedScenarios(d.scenarios ?? []);
      setLoad("scenarios_list", false);
    }
  }, [period, overview, health, trajectory, segments, learning, support]);

  function switchTab(t: Tab) { setTab(t); loadTab(t); }

  function changePeriod(p: Period) {
    setPeriod(p);
    setOverview(null); setHealth(null); setTrajectory(null);
    setSegments(null); setLearning(null); setSupport(null);
  }

  // Pre-fill itemForm when modal opens
  useEffect(() => {
    if (!itemModal) return;
    setItemForm({
      title:           itemModal.prefill_title ?? "",
      description:     itemModal.prefill_description ?? "",
      lane:            "next",
      target_metric:   itemModal.prefill_target_metric ?? "",
      target_segment:  itemModal.prefill_target_segment ?? "",
      impact:          itemModal.prefill_impact ?? "medium",
      effort:          itemModal.prefill_effort ?? "medium",
      confidence:      "medium",
      owner:           "",
    });
  }, [itemModal]);

  async function handleSaveToRoadmap() {
    if (!itemModal || !itemForm.title.trim()) return;
    setSavingItem(true);
    await roadmapReq("strategy_roadmap_from_insight", {
      source_type:      itemModal.source_type,
      source_report_id: itemModal.source_report_id ?? null,
      insight_payload:  itemModal.insight_payload ?? {},
      lane:             itemForm.lane,
      title:            itemForm.title.trim(),
      target_metric:    itemForm.target_metric,
      target_segment:   itemForm.target_segment,
      impact:           itemForm.impact,
      effort:           itemForm.effort,
    });
    setSavingItem(false);
    setItemModal(null);
    showToast("Добавлено в Roadmap");
    if (tab === "roadmap") {
      const d = await roadmapReq("strategy_roadmap_list");
      setRoadmap(d.roadmap ?? { now: [], next: [], later: [] });
    }
  }

  // Reload current tab when period changes
  useEffect(() => {
    loadTab(tab, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  // Initial load
  useEffect(() => { loadTab("overview"); }, []); // eslint-disable-line

  // ── AI ───────────────────────────────────────────────────────────

  async function genAiSummary() {
    setLoad("ai_summary", true); setAiSummary(null);
    const d = await stratReq("strategy_ai_summary", period);
    setAiSummary(d.ai_summary ?? null);
    if (d.report_id) setLastSummaryReportId(d.report_id);
    setLoad("ai_summary", false);
    showToast("AI-сводка готова");
  }

  async function genHypotheses() {
    setLoad("hypotheses", true); setHypotheses(null);
    const d = await stratReq("strategy_ai_hypotheses", period, { focus: hypoFocus });
    setHypotheses(d.hypotheses?.hypotheses ?? null);
    if (d.report_id) setLastHypoReportId(d.report_id);
    setLoad("hypotheses", false);
    showToast("Гипотезы сгенерированы");
  }

  async function runScenario() {
    setLoad("scenario_run", true);
    setScenarioResult(null);
    const res = await fetch(`${STRATEGY_URL}/?action=strategy_scenario_run&days=${period}`, {
      method: "POST", headers: hdr(),
      body: JSON.stringify({
        scenario_type: scenarioType,
        target_delta:  scenarioDelta,
        name:          scenarioName.trim() || undefined,
      }),
    });
    const d = await res.json();
    setScenarioResult(d ?? null);
    setLoad("scenario_run", false);
    // refresh saved list
    const list = await roadmapReq("strategy_scenarios_list");
    setSavedScenarios(list.scenarios ?? []);
  }

  async function genSegPlan() {
    setLoad("seg_plan", true); setSegPlan(null);
    const res = await fetch(`${STRATEGY_URL}/?action=strategy_ai_segment_plan&days=${period}`, {
      method: "POST", headers: hdr(), body: JSON.stringify({ segment: segPlanTarget }),
    });
    const d = await res.json();
    setSegPlan(d.segment_plan ?? null);
    if (d.report_id) setLastSegPlanReportId(d.report_id);
    setLoad("seg_plan", false);
    showToast("План сегмента готов");
  }

  // ── Render ───────────────────────────────────────────────────────

  return (
    <AdminShell>
      <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-gray-950 overflow-hidden">

        {/* TOP BAR */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-800 flex-shrink-0">
          <Icon name="TrendingUp" size={18} className="text-violet-400" />
          <span className="text-sm font-semibold text-gray-200">Strategy Intelligence</span>
          <div className="flex gap-1 ml-4">
            {(["7","30","90","180"] as Period[]).map(p => (
              <button key={p} onClick={() => changePeriod(p)}
                className={`text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors ${
                  period === p ? "bg-violet-700 text-white" : "bg-gray-800 text-gray-500 hover:text-gray-300 border border-gray-700"
                }`}>
                {p} дн.
              </button>
            ))}
          </div>
          {profile.north_star_name && (
            <div className="ml-auto hidden lg:flex items-center gap-2">
              <Icon name="Star" size={11} className="text-violet-500" />
              <span className="text-[10px] text-gray-600 italic">{profile.north_star_name}</span>
            </div>
          )}
        </div>

        {/* TAB BAR */}
        <div className="flex border-b border-gray-800 px-4 flex-shrink-0 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => switchTab(t.key)}
              className={`flex items-center gap-1.5 py-2.5 px-3 text-xs font-medium border-b-2 -mb-px mr-1 transition-colors whitespace-nowrap ${
                tab === t.key
                  ? "border-violet-500 text-violet-400"
                  : "border-transparent text-gray-600 hover:text-gray-400"
              }`}>
              <Icon name={t.icon} size={13} />
              {t.label}
            </button>
          ))}
        </div>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ── OVERVIEW ───────────────────────────────────────────── */}
          {tab === "overview" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-100">Обзор продукта · {period} дней</h2>
                <button onClick={genAiSummary} disabled={loading.ai_summary}
                  className="flex items-center gap-2 px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white text-xs font-semibold rounded-xl transition-colors">
                  {loading.ai_summary ? <Spinner /> : <Icon name="Sparkles" size={13} />}
                  AI Executive Summary
                </button>
              </div>

              {/* Vision banner */}
              {profile.vision_text && (
                <div className="bg-gradient-to-br from-violet-950/60 to-indigo-950/60 border border-violet-800/50 rounded-2xl px-6 py-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon name="Telescope" size={13} className="text-violet-400" />
                    <p className="text-[10px] text-violet-400 font-semibold uppercase tracking-wide">Видение платформы</p>
                  </div>
                  <p className="text-sm text-violet-200 leading-relaxed">{profile.vision_text}</p>
                  {profile.product_thesis && (
                    <p className="text-xs text-violet-400/60 mt-2 italic">{profile.product_thesis.split('.')[0]}.</p>
                  )}
                </div>
              )}

              {profile.north_star_name && (
                <div className="bg-violet-900/20 border border-violet-800/60 rounded-xl px-5 py-4">
                  <p className="text-[10px] text-violet-400 font-semibold uppercase tracking-wide mb-1">North Star</p>
                  <p className="text-xl font-bold text-violet-300">{profile.north_star_name}</p>
                  {profile.north_star_definition && (
                    <p className="text-xs text-violet-400/70 mt-1">{profile.north_star_definition}</p>
                  )}
                </div>
              )}

              {/* Strategic Pillars */}
              {profile.strategic_pillars && profile.strategic_pillars.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-3">Стратегические столпы</p>
                  <div className="grid grid-cols-3 gap-2">
                    {profile.strategic_pillars.map((p) => (
                      <div key={p.id} className={`border rounded-xl p-3 ${PILLAR_COLORS[p.id] ?? "border-gray-800 bg-gray-900"}`}>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Icon name={PILLAR_ICONS[p.id] ?? "Circle"} size={12} className="text-gray-400 flex-shrink-0" />
                          <p className="text-[10px] font-semibold text-gray-300">{p.title}</p>
                        </div>
                        <p className="text-[9px] text-gray-600 leading-relaxed">{p.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Guardrails */}
              {profile.guardrails && profile.guardrails.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-3">Принципы платформы</p>
                  <div className="flex flex-wrap gap-2">
                    {profile.guardrails.map((g) => (
                      <div key={g.title} className="flex items-center gap-1.5 bg-gray-800/60 border border-gray-700/60 rounded-lg px-2.5 py-1.5" title={g.description}>
                        <Icon name={GUARDRAIL_ICONS[g.title] ?? "Shield"} size={11} className="text-violet-400 flex-shrink-0" />
                        <span className="text-[10px] font-semibold text-gray-400">{g.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {loading.overview && <div className="flex justify-center py-10"><Spinner /></div>}
              {overview && (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                  {overview.kpis.map(k => (
                    <div key={k.key} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-500">{k.label}</span>
                        <DeltaBadge delta={k.delta} />
                      </div>
                      <p className="text-2xl font-bold text-gray-100">{k.value ?? "—"}</p>
                      {k.prev !== undefined && (
                        <p className="text-[10px] text-gray-700 mt-1">Пред. период: {k.prev}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {aiSummary && !aiSummary.error && (
                <div className="bg-gray-900 border border-violet-800/40 rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <Icon name="Sparkles" size={16} className="text-violet-400" />
                    <h3 className="text-sm font-semibold text-gray-200">AI Executive Summary</h3>
                    {aiSummary.health_score && (
                      <span className={`ml-auto text-sm font-bold px-3 py-1 rounded-full ${
                        aiSummary.health_score >= 7 ? "bg-emerald-900/40 text-emerald-400" :
                        aiSummary.health_score >= 4 ? "bg-amber-900/30 text-amber-400" : "bg-red-900/30 text-red-400"
                      }`}>
                        Health: {aiSummary.health_score}/10
                      </span>
                    )}
                  </div>
                  {aiSummary.headline && <p className="text-base font-medium text-gray-200">{aiSummary.headline}</p>}
                  {aiSummary.health_reasoning && <p className="text-sm text-gray-400">{aiSummary.health_reasoning}</p>}

                  {aiSummary.key_insights && aiSummary.key_insights.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-wide">Ключевые инсайты</p>
                      {aiSummary.key_insights.map((ins, i) => (
                        <div key={i} className="bg-gray-800/60 border border-gray-700/60 rounded-xl px-4 py-3">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-sm font-semibold text-gray-200">{ins.title}</span>
                            <ConfBadge conf={ins.confidence} />
                            <ImpactBadge impact={ins.impact} />
                            <button onClick={() => setItemModal({ source_type: "summary", source_report_id: lastSummaryReportId, insight_payload: ins as Record<string,unknown>, prefill_title: ins.title, prefill_description: ins.claim, prefill_impact: ins.impact })}
                              className="text-[9px] font-medium px-2 py-0.5 rounded bg-gray-800 text-gray-600 hover:text-violet-400 hover:bg-violet-900/20 border border-gray-700 transition-colors ml-auto">
                              + Roadmap
                            </button>
                          </div>
                          <p className="text-xs text-gray-400">{ins.claim}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    {aiSummary.top_risks && aiSummary.top_risks.length > 0 && (
                      <div>
                        <p className="text-[10px] text-red-400 font-semibold uppercase tracking-wide mb-2">Риски</p>
                        {aiSummary.top_risks.map((r, i) => (
                          <div key={i} className="flex items-start gap-2 mb-1.5">
                            <span className="text-red-500 flex-shrink-0 mt-0.5">⚠</span>
                            <span className="text-xs text-gray-400">{r}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {aiSummary.top_opportunities && aiSummary.top_opportunities.length > 0 && (
                      <div>
                        <p className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wide mb-2">Возможности</p>
                        {aiSummary.top_opportunities.map((o, i) => (
                          <div key={i} className="flex items-start gap-2 mb-1.5">
                            <span className="text-emerald-500 flex-shrink-0 mt-0.5">✦</span>
                            <span className="text-xs text-gray-400">{o}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {aiSummary.recommended_focus && (
                    <div className="bg-violet-900/20 border border-violet-800/40 rounded-xl px-4 py-3">
                      <p className="text-[10px] text-violet-400 font-semibold uppercase tracking-wide mb-1">Рекомендованный фокус</p>
                      <p className="text-sm text-violet-200">{aiSummary.recommended_focus}</p>
                    </div>
                  )}

                  {aiSummary.next_actions && aiSummary.next_actions.length > 0 && (
                    <div>
                      <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-2">Следующие шаги</p>
                      <div className="space-y-1.5">
                        {aiSummary.next_actions.map((a, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-violet-500 font-bold flex-shrink-0">{i+1}.</span>
                            <span className="text-xs text-gray-300 flex-1">{a}</span>
                            <button onClick={() => setItemModal({ source_type: "next_action", source_report_id: lastSummaryReportId, insight_payload: { text: a }, prefill_title: a, prefill_impact: "high", prefill_effort: "low" })}
                              className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-gray-800 text-gray-600 hover:text-violet-400 hover:bg-violet-900/20 border border-gray-700 transition-colors flex-shrink-0">
                              + Roadmap
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {aiSummary.data_maturity && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-600">Зрелость данных:</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        aiSummary.data_maturity === "mature"  ? "bg-emerald-900/40 text-emerald-400" :
                        aiSummary.data_maturity === "growing" ? "bg-amber-900/30 text-amber-400" :
                        "bg-gray-800 text-gray-500"
                      }`}>{aiSummary.data_maturity}</span>
                    </div>
                  )}
                </div>
              )}
              {aiSummary?.error && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-[10px] text-gray-600 mb-2">Raw response:</p>
                  <p className="text-xs text-gray-500 font-mono whitespace-pre-wrap">{aiSummary.raw}</p>
                </div>
              )}
            </div>
          )}

          {/* ── HEALTH ─────────────────────────────────────────────── */}
          {tab === "health" && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-gray-100">Product Health · {period} дней</h2>
              {loading.health && <div className="flex justify-center py-10"><Spinner /></div>}
              {health && (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                  {health.metrics.map(m => (
                    <div key={m.key} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <p className="text-[10px] text-gray-500 mb-2">{m.label}</p>
                      <p className="text-2xl font-bold text-gray-100">
                        {m.value !== null && m.value !== undefined ? m.value : "—"}
                        {m.unit && m.value !== null
                          ? <span className="text-base text-gray-500 ml-0.5">{m.unit}</span>
                          : null}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── TRAJECTORY ─────────────────────────────────────────── */}
          {tab === "trajectory" && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-gray-100">User Trajectory · {period} дней</h2>
              {loading.trajectory && <div className="flex justify-center py-10"><Spinner /></div>}
              {trajectory && (
                <>
                  {trajectory.biggest_dropoff && (trajectory.biggest_dropoff as Record<string, unknown>).lost && (
                    <div className="bg-red-900/20 border border-red-800/60 rounded-xl px-5 py-3">
                      <p className="text-[10px] text-red-400 font-semibold uppercase tracking-wide mb-1">Наибольший отвал</p>
                      <p className="text-sm text-red-300">
                        {String(trajectory.biggest_dropoff.from ?? "")} → {String(trajectory.biggest_dropoff.to ?? "")}:{" "}
                        потеряно <span className="font-bold">{String(trajectory.biggest_dropoff.lost ?? "")}</span> пользователей{" "}
                        (<span className="font-bold">{String(trajectory.biggest_dropoff.loss_pct ?? "")}%</span>)
                      </p>
                    </div>
                  )}
                  <div className="space-y-2">
                    {trajectory.funnel.map((stage, i) => (
                      <div key={stage.stage} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-gray-800 border border-gray-700 text-[10px] text-gray-500 flex items-center justify-center font-bold flex-shrink-0">
                              {i + 1}
                            </span>
                            <span className="text-sm font-semibold text-gray-200">{stage.label}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xl font-bold text-gray-100">{stage.users}</span>
                            {i > 0 && (
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                stage.conv_from_prev >= 70 ? "bg-emerald-900/40 text-emerald-400" :
                                stage.conv_from_prev >= 40 ? "bg-amber-900/30 text-amber-400" :
                                "bg-red-900/30 text-red-400"
                              }`}>
                                {stage.conv_from_prev}% от предыд.
                              </span>
                            )}
                            <span className="text-[10px] text-gray-600">{stage.conv_total}% от top</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-violet-600 rounded-full transition-all"
                            style={{ width: `${stage.conv_total}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── SEGMENTS ───────────────────────────────────────────── */}
          {tab === "segments" && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-gray-100">Сегменты пользователей · {period} дней</h2>
              {loading.segments && <div className="flex justify-center py-10"><Spinner /></div>}
              {segments && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-600 border-b border-gray-800">
                        {["Сегмент", "Размер", "Activation", "Completion", "Тикеты/чел.", "Flagged"].map(h => (
                          <th key={h} className="text-left py-2 px-3 font-semibold uppercase tracking-wide text-[10px]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {segments.map(seg => (
                        <tr key={seg.key} className="border-b border-gray-800/60 hover:bg-gray-900/60 transition-colors">
                          <td className="py-3 px-3 font-medium text-gray-200">{seg.label}</td>
                          <td className="py-3 px-3 text-gray-300 font-semibold">{seg.size}</td>
                          <td className="py-3 px-3">
                            <span className={`font-semibold ${seg.activation_rate >= 50 ? "text-emerald-400" : seg.activation_rate >= 25 ? "text-amber-400" : "text-red-400"}`}>
                              {seg.activation_rate}%
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span className={`font-semibold ${seg.completion_rate >= 30 ? "text-emerald-400" : seg.completion_rate >= 10 ? "text-amber-400" : "text-red-400"}`}>
                              {seg.completion_rate}%
                            </span>
                          </td>
                          <td className="py-3 px-3 text-gray-400">{seg.ticket_rate}%</td>
                          <td className="py-3 px-3">
                            {seg.flagged_share > 0
                              ? <span className="text-orange-400 font-semibold">{seg.flagged_share}%</span>
                              : <span className="text-gray-700">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── LEARNING ───────────────────────────────────────────── */}
          {tab === "learning" && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-gray-100">Learning Intelligence · {period} дней</h2>
              {loading.learning && <div className="flex justify-center py-10"><Spinner /></div>}
              {learning && (
                <>
                  <div className="grid grid-cols-4 gap-3">
                    {Object.entries(learning.goals_by_status).map(([status, count]) => (
                      <div key={status} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                        <p className="text-2xl font-bold text-gray-100">{count}</p>
                        <p className="text-[10px] text-gray-500 mt-1 capitalize">{status}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Активных без чекинов", value: `${learning.zero_checkin_active_pct}%`, warn: learning.zero_checkin_active_pct > 40 },
                      { label: "Среднее чекинов/цель",  value: learning.avg_checkins_per_active_goal, warn: false },
                      { label: "Чекинов за период",     value: learning.checkins_in_period, warn: false },
                      { label: "Реопенов за период",    value: learning.reopen_events_period, warn: false },
                      { label: "С образованием",        value: learning.users_with_education_items, warn: false },
                    ].map(m => (
                      <div key={m.label} className={`bg-gray-900 border rounded-xl p-4 ${m.warn ? "border-amber-800/60" : "border-gray-800"}`}>
                        <p className="text-[10px] text-gray-500 mb-2">{m.label}</p>
                        <p className={`text-2xl font-bold ${m.warn ? "text-amber-400" : "text-gray-100"}`}>{String(m.value)}</p>
                      </div>
                    ))}
                  </div>

                  {learning.checkin_distribution.length > 0 && (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Распределение по числу чекинов</p>
                      <div className="space-y-2">
                        {learning.checkin_distribution.map(d => {
                          const max = Math.max(...learning.checkin_distribution.map(x => x.goals));
                          return (
                            <div key={d.bucket} className="flex items-center gap-3">
                              <span className="text-xs text-gray-600 w-14 flex-shrink-0">{d.bucket} чек.</span>
                              <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full bg-violet-600 rounded-full" style={{ width: `${max > 0 ? d.goals / max * 100 : 0}%` }} />
                              </div>
                              <span className="text-xs text-gray-400 w-10 text-right">{d.goals}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── SUPPORT ────────────────────────────────────────────── */}
          {tab === "support" && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-gray-100">Support Pain Map · {period} дней</h2>
              {loading.support && <div className="flex justify-center py-10"><Spinner /></div>}
              {support && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Всего тикетов", value: support.total_tickets, cls: "text-gray-100" },
                      { label: "Critical open", value: support.critical_open, cls: support.critical_open > 0 ? "text-red-400" : "text-gray-100" },
                      { label: "Stalled + тикеты", value: support.stalled_users_with_tickets, cls: support.stalled_users_with_tickets > 0 ? "text-amber-400" : "text-gray-100" },
                    ].map(m => (
                      <div key={m.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                        <p className="text-[10px] text-gray-500 mb-2">{m.label}</p>
                        <p className={`text-2xl font-bold ${m.cls}`}>{m.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-3">По приоритету</p>
                      {support.by_priority.map(r => (
                        <div key={r.priority} className="flex items-center justify-between py-1.5 border-b border-gray-800/60 last:border-0">
                          <span className="text-xs text-gray-400 capitalize">{r.priority}</span>
                          <span className="text-xs font-semibold text-gray-200">{r.count}</span>
                        </div>
                      ))}
                    </div>
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-3">По модулю</p>
                      {support.by_module.map(r => (
                        <div key={r.module} className="flex items-center justify-between py-1.5 border-b border-gray-800/60 last:border-0">
                          <span className="text-xs text-gray-400 font-mono truncate max-w-[160px]">{r.module}</span>
                          <span className="text-xs font-semibold text-gray-200">{r.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {support.repeat_requesters.length > 0 && (
                    <div className="bg-gray-900 border border-amber-800/40 rounded-xl p-4">
                      <p className="text-[10px] text-amber-400 font-semibold uppercase tracking-wide mb-3">Повторные обращения</p>
                      <div className="space-y-1.5">
                        {support.repeat_requesters.map(r => (
                          <div key={r.email} className="flex items-center justify-between">
                            <span className="text-xs text-gray-400">{r.email}</span>
                            <span className="text-xs font-bold text-amber-400">{r.tickets} тикетов</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── AI LAB ─────────────────────────────────────────────── */}
          {tab === "ai_lab" && (
            <div className="space-y-6 max-w-3xl">
              <div>
                <h2 className="text-lg font-bold text-gray-100">AI Strategy Lab</h2>
                <p className="text-sm text-gray-500 mt-1">ИИ анализирует реальные данные системы. Каждый вывод опирается на агрегированные метрики за выбранный период.</p>
              </div>

              {/* Executive Summary */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-200">Executive Summary</p>
                    <p className="text-[10px] text-gray-600">Стратегическая сводка + health score + риски и возможности</p>
                  </div>
                  <button onClick={genAiSummary} disabled={loading.ai_summary}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white text-xs font-semibold rounded-xl transition-colors">
                    {loading.ai_summary ? <Spinner /> : <Icon name="Sparkles" size={13} />}
                    Сгенерировать
                  </button>
                </div>
                {aiSummary && !aiSummary.error && aiSummary.headline && (
                  <div className="space-y-2 mt-3">
                    <div className="bg-violet-900/20 border border-violet-800/40 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <p className="text-sm text-violet-200 font-medium">{aiSummary.headline}</p>
                        {aiSummary.health_score && (
                          <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                            aiSummary.health_score >= 7 ? "bg-emerald-900/40 text-emerald-400" :
                            aiSummary.health_score >= 4 ? "bg-amber-900/30 text-amber-400" : "bg-red-900/30 text-red-400"
                          }`}>{aiSummary.health_score}/10</span>
                        )}
                      </div>
                      {aiSummary.recommended_focus && <p className="text-xs text-violet-400/80">{aiSummary.recommended_focus}</p>}
                    </div>
                    {aiSummary.next_actions && aiSummary.next_actions.length > 0 && (
                      <div className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-3">
                        <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-2">Следующие шаги</p>
                        {aiSummary.next_actions.map((a, i) => (
                          <div key={i} className="flex items-start gap-1.5 mb-1">
                            <span className="text-violet-500 font-bold text-[10px] flex-shrink-0 mt-0.5">{i+1}.</span>
                            <span className="text-xs text-gray-300">{a}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Hypotheses */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-200">Гипотезы роста</p>
                    <p className="text-[10px] text-gray-600">10 структурированных гипотез с evidence и оценкой impact/effort</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select value={hypoFocus} onChange={e => setHypoFocus(e.target.value)}
                      className="bg-gray-800 border border-gray-700 text-xs text-gray-300 rounded-lg px-2 py-1.5 focus:outline-none">
                      {[["growth","Рост"],["completion","Completion"],["churn","Churn risk"],["support","Support load"],["onboarding","Onboarding"]].map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    <button onClick={genHypotheses} disabled={loading.hypotheses}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-semibold rounded-xl transition-colors">
                      {loading.hypotheses ? <Spinner /> : <Icon name="Lightbulb" size={13} />}
                      Генерировать
                    </button>
                  </div>
                </div>
                {hypotheses && hypotheses.length > 0 && (
                  <div className="space-y-3 mt-3">
                    {hypotheses.map((h, i) => (
                      <div key={i} className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                          <span className="text-xs font-bold text-gray-200">#{h.id}. {h.title}</span>
                          <div className="flex gap-1 flex-shrink-0">
                            <ImpactBadge impact={h.expected_impact} />
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                              h.effort === "low" ? "bg-emerald-900/40 text-emerald-400" :
                              h.effort === "medium" ? "bg-amber-900/30 text-amber-400" : "bg-red-900/30 text-red-400"
                            }`}>{h.effort} effort</span>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mb-1"><span className="text-gray-600">Проблема:</span> {h.problem}</p>
                        <p className="text-xs text-gray-400 italic mb-1">{h.hypothesis}</p>
                        <p className="text-[10px] text-gray-600">
                          Метрика: <span className="text-gray-500">{h.target_metric}</span>
                          {" · "}Сегмент: <span className="text-gray-500">{h.target_segment}</span>
                        </p>
                        <p className="text-[10px] text-violet-500 mt-1">На основе: {h.evidence}</p>
                        <div className="pt-2 flex justify-end">
                          <button onClick={() => setItemModal({ source_type: "hypothesis", source_report_id: lastHypoReportId, insight_payload: h as unknown as Record<string,unknown>, prefill_title: h.title, prefill_description: h.hypothesis, prefill_target_metric: h.target_metric, prefill_target_segment: h.target_segment, prefill_impact: h.expected_impact, prefill_effort: h.effort })}
                            className="text-[9px] font-medium px-2.5 py-1 rounded bg-gray-800 text-gray-600 hover:text-violet-400 hover:bg-violet-900/20 border border-gray-700 transition-colors">
                            + В Roadmap
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Segment Plan */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-200">План работы с сегментом</p>
                    <p className="text-[10px] text-gray-600">Конкретные шаги, ожидаемый результат, критерий успеха</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select value={segPlanTarget} onChange={e => setSegPlanTarget(e.target.value)}
                      className="bg-gray-800 border border-gray-700 text-xs text-gray-300 rounded-lg px-2 py-1.5 focus:outline-none">
                      {[["stalled","Застрявшие"],["new","Новые"],["support_heavy","Support-heavy"],["active","Активные"],["flagged","Flagged"]].map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    <button onClick={genSegPlan} disabled={loading.seg_plan}
                      className="flex items-center gap-2 px-4 py-2 bg-orange-700 hover:bg-orange-600 disabled:opacity-40 text-white text-xs font-semibold rounded-xl transition-colors">
                      {loading.seg_plan ? <Spinner /> : <Icon name="Target" size={13} />}
                      Создать план
                    </button>
                  </div>
                </div>
                {segPlan && (
                  <div className="space-y-3 mt-3">
                    {segPlan.diagnosis && (
                      <div className="bg-amber-900/20 border border-amber-800/40 rounded-xl p-3">
                        <p className="text-[10px] text-amber-400 font-semibold uppercase mb-1">Диагноз</p>
                        <p className="text-sm text-amber-200">{String(segPlan.diagnosis)}</p>
                      </div>
                    )}
                    {Array.isArray(segPlan.plan) && (segPlan.plan as Record<string, unknown>[]).map((step, i) => (
                      <div key={i} className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-5 h-5 rounded-full bg-gray-700 text-[10px] text-gray-400 flex items-center justify-center font-bold flex-shrink-0">
                            {String(step.step ?? i + 1)}
                          </span>
                          <span className="text-xs font-semibold text-gray-200 flex-1">{String(step.action ?? "")}</span>
                          <button onClick={() => setItemModal({ source_type: "segment_plan", source_report_id: lastSegPlanReportId, insight_payload: { ...step, segment: segPlanTarget }, prefill_title: String(step.action ?? ""), prefill_description: String(step.expected_result ?? ""), prefill_target_segment: segPlanTarget, prefill_target_metric: String(step.metric_to_watch ?? "") })}
                            className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-gray-800 text-gray-600 hover:text-violet-400 hover:bg-violet-900/20 border border-gray-700 transition-colors flex-shrink-0">
                            + Roadmap
                          </button>
                        </div>
                        <p className="text-[10px] text-gray-500 ml-7">
                          → {String(step.expected_result ?? "")} · {String(step.timeline ?? "")}
                        </p>
                      </div>
                    ))}
                    {segPlan.success_criteria && (
                      <div className="bg-emerald-900/20 border border-emerald-800/40 rounded-xl p-3">
                        <p className="text-[10px] text-emerald-400 font-semibold uppercase mb-1">Критерий успеха</p>
                        <p className="text-xs text-emerald-200">{String(segPlan.success_criteria)}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── PROFILE ────────────────────────────────────────────── */}
          {tab === "profile" && (
            <div className="max-w-2xl space-y-4">
              <div>
                <h2 className="text-lg font-bold text-gray-100 mb-1">Strategy Profile</h2>
                <p className="text-sm text-gray-500">ИИ использует этот профиль как контекст при генерации Executive Summary, гипотез и планов.</p>
              </div>
              <ProfileEditor
                profile={profile}
                onSave={p => { setProfile(p); showToast("Профиль сохранён"); }}
              />
            </div>
          )}

          {/* ── ROADMAP ────────────────────────────────────────────── */}
          {tab === "roadmap" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-100">Strategic Roadmap</h2>
                <button onClick={() => setItemModal({ source_type: "manual", prefill_title: "" })}
                  className="flex items-center gap-2 px-4 py-2 bg-violet-700 hover:bg-violet-600 text-white text-xs font-semibold rounded-xl transition-colors">
                  <Icon name="Plus" size={13} /> Добавить инициативу
                </button>
              </div>
              {loading.roadmap && <div className="flex justify-center py-10"><Spinner /></div>}
              {!loading.roadmap && (
                <div className="grid grid-cols-3 gap-4">
                  {(["now","next","later"] as const).map(lane => {
                    const LANE_CFG = {
                      now:   { label: "Сейчас", bg: "border-red-800/60 bg-red-900/10",     badge: "bg-red-900/40 text-red-400 border-red-800",     dot: "bg-red-500" },
                      next:  { label: "Далее",  bg: "border-amber-800/60 bg-amber-900/10", badge: "bg-amber-900/30 text-amber-400 border-amber-800", dot: "bg-amber-500" },
                      later: { label: "Потом",  bg: "border-gray-700 bg-gray-900/50",       badge: "bg-gray-800 text-gray-400 border-gray-700",      dot: "bg-gray-500" },
                    };
                    const cfg  = LANE_CFG[lane];
                    const items = roadmap[lane] ?? [];
                    return (
                      <div key={lane} className={`border rounded-xl p-4 min-h-[400px] ${cfg.bg}`}>
                        <div className="flex items-center gap-2 mb-4">
                          <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                          <span className="text-sm font-bold text-gray-200">{cfg.label}</span>
                          <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.badge}`}>{items.length}</span>
                        </div>
                        <div className="space-y-2">
                          {items.map(item => (
                            <RoadmapCard key={item.id} item={item}
                              onMoveLane={async (newLane) => {
                                await roadmapReq("strategy_roadmap_update", { id: item.id, lane: newLane });
                                const d = await roadmapReq("strategy_roadmap_list");
                                setRoadmap(d.roadmap ?? { now: [], next: [], later: [] });
                              }}
                              onDelete={async () => {
                                await roadmapReq("strategy_roadmap_delete", { id: item.id });
                                const d = await roadmapReq("strategy_roadmap_list");
                                setRoadmap(d.roadmap ?? { now: [], next: [], later: [] });
                              }}
                              onStatusChange={async (newStatus) => {
                                await roadmapReq("strategy_roadmap_update", { id: item.id, status: newStatus });
                                const d = await roadmapReq("strategy_roadmap_list");
                                setRoadmap(d.roadmap ?? { now: [], next: [], later: [] });
                              }}
                              onStartInitiative={async () => {
                                await stratApi.initiativeFromRoadmap({ roadmap_item_id: item.id });
                                showToast("Инициатива создана → Execution");
                                setTimeout(() => navigate("/admin/execution"), 1200);
                              }}
                            />
                          ))}
                          {items.length === 0 && (
                            <div className="text-center py-8 text-gray-700 text-xs">Пока пусто</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── SCENARIOS ───────────────────────────────────────────── */}
          {tab === "scenarios" && (
            <div className="space-y-5 max-w-3xl">
              <h2 className="text-lg font-bold text-gray-100">Scenario Planner</h2>
              <p className="text-sm text-gray-500">Детерминированный what-if калькулятор. ИИ интерпретирует результат, но математику считает система.</p>

              {/* Configurator */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Настройка сценария</p>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1.5 font-semibold uppercase">Тип сценария</label>
                    <select value={scenarioType} onChange={e => setScenarioType(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-violet-600">
                      {[
                        ["activation_uplift",       "Activation Rate Uplift"],
                        ["goal_to_checkin_uplift",  "Goal → First Check-in Uplift"],
                        ["second_checkin_uplift",   "Second Check-in Uplift"],
                        ["stalled_goals_reduction", "Stalled Goals Reduction"],
                        ["repeat_ticket_reduction", "Repeat Ticket Rate Reduction"],
                      ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1.5 font-semibold uppercase">
                      Целевое изменение
                      <span className="ml-1 font-normal text-gray-600">(п.п.)</span>
                    </label>
                    <div className="flex items-center gap-3">
                      <input type="range" min="1" max="30" step="1" value={scenarioDelta}
                        onChange={e => setScenarioDelta(Number(e.target.value))}
                        className="flex-1 accent-violet-500" />
                      <span className="text-xl font-bold text-violet-400 w-12 text-right">+{scenarioDelta}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-gray-500 mb-1.5 font-semibold uppercase">Название (необязательно)</label>
                  <input value={scenarioName} onChange={e => setScenarioName(e.target.value)}
                    placeholder="Например: Q3 onboarding improvement"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600" />
                </div>

                <div className="flex items-center gap-3">
                  <button onClick={runScenario} disabled={loading.scenario_run}
                    className="flex items-center gap-2 px-5 py-2.5 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors">
                    {loading.scenario_run ? <Spinner /> : <Icon name="FlaskConical" size={14} />}
                    Запустить сценарий
                  </button>
                  <span className="text-[10px] text-gray-600">Период: {period} дней · Результат сохраняется автоматически</span>
                </div>
              </div>

              {/* Result */}
              {scenarioResult && !('error' in scenarioResult) && (
                <div className="space-y-4">
                  {/* Confidence banner */}
                  <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                    String(scenarioResult.confidence) === "high"   ? "bg-emerald-900/20 border-emerald-800/60" :
                    String(scenarioResult.confidence) === "medium" ? "bg-amber-900/20 border-amber-800/60" :
                    "bg-gray-800/60 border-gray-700"
                  }`}>
                    <Icon name={String(scenarioResult.confidence) === "high" ? "ShieldCheck" : "AlertTriangle"} size={16}
                      className={String(scenarioResult.confidence) === "high" ? "text-emerald-400" : String(scenarioResult.confidence) === "medium" ? "text-amber-400" : "text-gray-500"} />
                    <div>
                      <span className="text-xs font-semibold text-gray-200">
                        Confidence: {String(scenarioResult.confidence).toUpperCase()}
                      </span>
                      <span className="text-[10px] text-gray-500 ml-2">sample_size: {String(scenarioResult.sample_size)}</span>
                    </div>
                    {Number(scenarioResult.sample_size) < 20 && (
                      <span className="ml-auto text-[10px] text-gray-600 italic">сценарий иллюстративный</span>
                    )}
                  </div>

                  {/* Baseline vs Projected cards */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-3">Baseline</p>
                      {Object.entries((scenarioResult.baseline as Record<string, unknown>) ?? {}).map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between py-1 border-b border-gray-800/60 last:border-0">
                          <span className="text-[10px] text-gray-500 font-mono">{k}</span>
                          <span className="text-xs font-semibold text-gray-200">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="bg-gray-900 border border-violet-800/40 rounded-xl p-4">
                      <p className="text-[10px] text-violet-400 font-semibold uppercase tracking-wide mb-3">Projected</p>
                      {Object.entries((scenarioResult.projected as Record<string, unknown>) ?? {}).map(([k, v]) => {
                        const delta = ((scenarioResult.delta as Record<string, unknown>) ?? {})[k];
                        const isPositive = typeof delta === "number" ? delta > 0 : String(delta ?? "").startsWith("+");
                        return (
                          <div key={k} className="flex items-center justify-between py-1 border-b border-gray-800/60 last:border-0">
                            <span className="text-[10px] text-gray-500 font-mono">{k}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-violet-300">{String(v)}</span>
                              {delta !== undefined && delta !== 0 && (
                                <span className={`text-[9px] font-semibold ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                                  {isPositive ? "▲" : "▼"} {Math.abs(Number(delta))}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Assumptions */}
                  {Array.isArray(scenarioResult.assumptions) && (scenarioResult.assumptions as string[]).length > 0 && (
                    <div className="bg-gray-800/40 border border-gray-700/60 rounded-xl p-4">
                      <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-2">Допущения</p>
                      {(scenarioResult.assumptions as string[]).map((a, i) => (
                        <div key={i} className="flex items-start gap-2 mb-1">
                          <span className="text-gray-600 flex-shrink-0 mt-0.5">→</span>
                          <span className="text-xs text-gray-400">{a}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* AI Commentary */}
                  {scenarioResult.ai_commentary && typeof scenarioResult.ai_commentary === "object" && !('error' in (scenarioResult.ai_commentary as Record<string,unknown>)) && (
                    <div className="bg-violet-900/20 border border-violet-800/40 rounded-xl p-5 space-y-3">
                      <div className="flex items-center gap-2">
                        <Icon name="Sparkles" size={14} className="text-violet-400" />
                        <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide">AI Интерпретация</p>
                      </div>

                      {(scenarioResult.ai_commentary as Record<string,unknown>).key_impact && (
                        <p className="text-base font-medium text-violet-200">
                          {String((scenarioResult.ai_commentary as Record<string,unknown>).key_impact)}
                        </p>
                      )}
                      {(scenarioResult.ai_commentary as Record<string,unknown>).interpretation && (
                        <p className="text-sm text-gray-400">
                          {String((scenarioResult.ai_commentary as Record<string,unknown>).interpretation)}
                        </p>
                      )}

                      {Array.isArray((scenarioResult.ai_commentary as Record<string,unknown>).required_initiatives) && (
                        <div>
                          <p className="text-[10px] text-gray-500 font-semibold uppercase mb-2">Требуемые инициативы</p>
                          {((scenarioResult.ai_commentary as Record<string,unknown>).required_initiatives as string[]).map((init, i) => (
                            <div key={i} className="flex items-center gap-2 mb-1.5">
                              <span className="text-violet-500 flex-shrink-0">•</span>
                              <span className="text-xs text-gray-300 flex-1">{init}</span>
                              <button onClick={() => setItemModal({
                                source_type: "next_action",
                                source_report_id: typeof scenarioResult.scenario_id === "number" ? scenarioResult.scenario_id : null,
                                insight_payload: { text: init, scenario_type: scenarioType },
                                prefill_title: init,
                                prefill_impact: "high",
                                prefill_effort: "medium",
                              })}
                                className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-gray-800 text-gray-600 hover:text-violet-400 hover:bg-violet-900/20 border border-gray-700 transition-colors flex-shrink-0">
                                + Roadmap
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {Array.isArray((scenarioResult.ai_commentary as Record<string,unknown>).risks) && (
                        <div>
                          <p className="text-[10px] text-red-400 font-semibold uppercase mb-1.5">Риски</p>
                          {((scenarioResult.ai_commentary as Record<string,unknown>).risks as string[]).map((r, i) => (
                            <div key={i} className="flex items-start gap-2 mb-1">
                              <span className="text-red-500 flex-shrink-0 mt-0.5">⚠</span>
                              <span className="text-xs text-gray-400">{r}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {(scenarioResult.ai_commentary as Record<string,unknown>).confidence_note && (
                        <p className="text-[10px] text-gray-600 italic border-t border-gray-800 pt-2">
                          {String((scenarioResult.ai_commentary as Record<string,unknown>).confidence_note)}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Create initiative from scenario */}
                  <div className="flex justify-end">
                    <button onClick={async () => {
                      await stratApi.initiativeFromScenario({ scenario_id: scenarioResult.scenario_id });
                      showToast("Инициатива создана → Execution");
                      setTimeout(() => navigate("/admin/execution"), 1200);
                    }}
                      className="flex items-center gap-2 px-4 py-2 bg-violet-900/30 hover:bg-violet-800/40 text-violet-400 text-xs font-semibold rounded-xl border border-violet-800/40 transition-colors">
                      <Icon name="Rocket" size={13} /> Создать инициативу из сценария
                    </button>
                  </div>
                </div>
              )}

              {/* Saved scenarios list */}
              {savedScenarios.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Сохранённые сценарии</p>
                  <div className="space-y-2">
                    {savedScenarios.map(sc => {
                      const CONF_COLOR: Record<string, string> = { high: "text-emerald-400", medium: "text-amber-400", low: "text-gray-500" };
                      return (
                        <div key={String(sc.id)} className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-200 truncate">{String(sc.name)}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-[10px] text-gray-600 font-mono">{String(sc.scenario_type)}</span>
                              <span className={`text-[10px] font-semibold ${CONF_COLOR[String(sc.confidence)] ?? "text-gray-500"}`}>
                                {String(sc.confidence)} confidence
                              </span>
                              <span className="text-[10px] text-gray-700">sample: {String(sc.sample_size)}</span>
                              <span className="text-[10px] text-gray-700">
                                {new Date(String(sc.created_at)).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            <button onClick={async () => {
                              const d = await fetch(`${STRATEGY_URL}/?action=strategy_scenario_get&id=${sc.id}`, { headers: hdr() }).then(r => r.json());
                              setOpenedScenario(d.scenario ?? null);
                            }}
                              className="text-[10px] px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700 rounded-lg transition-colors">
                              Открыть
                            </button>
                            <button onClick={async () => {
                              await roadmapReq("strategy_scenario_delete", { id: sc.id });
                              setSavedScenarios(prev => prev.filter(x => x.id !== sc.id));
                              if (openedScenario && (openedScenario as Record<string,unknown>).id === sc.id) setOpenedScenario(null);
                            }}
                              className="text-gray-700 hover:text-red-500 p-1.5 transition-colors">
                              <Icon name="Trash2" size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Opened saved scenario detail */}
              {openedScenario && (
                <div className="bg-gray-900 border border-violet-800/40 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-200">{String((openedScenario as Record<string,unknown>).name)}</p>
                    <button onClick={() => setOpenedScenario(null)} className="text-gray-600 hover:text-gray-400 p-1"><Icon name="X" size={14} /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">Baseline</p>
                      {Object.entries((openedScenario as Record<string,unknown>).baseline as Record<string,unknown> ?? {}).map(([k,v]) => (
                        <div key={k} className="flex justify-between py-0.5"><span className="text-gray-600 font-mono text-[10px]">{k}</span><span className="text-gray-300">{String(v)}</span></div>
                      ))}
                    </div>
                    <div>
                      <p className="text-[10px] text-violet-400 uppercase tracking-wide mb-2">Projected</p>
                      {Object.entries((openedScenario as Record<string,unknown>).projected as Record<string,unknown> ?? {}).map(([k,v]) => (
                        <div key={k} className="flex justify-between py-0.5"><span className="text-gray-600 font-mono text-[10px]">{k}</span><span className="text-violet-300">{String(v)}</span></div>
                      ))}
                    </div>
                  </div>
                  {(openedScenario as Record<string,unknown>).ai_commentary && typeof (openedScenario as Record<string,unknown>).ai_commentary === "object" && (
                    <div className="bg-gray-800/40 rounded-xl p-3">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">AI Commentary</p>
                      <p className="text-xs text-gray-400">{String(((openedScenario as Record<string,unknown>).ai_commentary as Record<string,unknown>).interpretation ?? "")}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── REPORTS ────────────────────────────────────────────── */}
          {tab === "reports" && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-100">История генераций</h2>
              {loading.reports && <div className="flex justify-center py-10"><Spinner /></div>}
              {!loading.reports && reports.length === 0 && (
                <div className="text-center py-12 text-gray-600 text-sm">Отчётов пока нет. Запустите AI Summary или Гипотезы.</div>
              )}
              {!loading.reports && reports.length > 0 && (
                <div className="space-y-2">
                  {reports.map(r => {
                    const TYPE_CFG: Record<string,{label:string;color:string}> = {
                      ai_summary:      { label: "AI Summary",    color: "bg-violet-900/40 text-violet-400 border-violet-800" },
                      ai_hypotheses:   { label: "Гипотезы",      color: "bg-emerald-900/40 text-emerald-400 border-emerald-800" },
                      ai_segment_plan: { label: "План сегмента", color: "bg-orange-900/30 text-orange-400 border-orange-800" },
                    };
                    const cfg = TYPE_CFG[r.report_type] ?? { label: r.report_type, color: "bg-gray-800 text-gray-500 border-gray-700" };
                    const MATURITY_COLOR: Record<string,string> = { early: "text-gray-600", growing: "text-amber-500", mature: "text-emerald-500" };
                    return (
                      <div key={r.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.color}`}>{cfg.label}</span>
                            {r.meta.data_maturity && <span className={`text-[10px] ${MATURITY_COLOR[r.meta.data_maturity] ?? "text-gray-600"}`}>{r.meta.data_maturity}</span>}
                            {r.meta.health_score && <span className="text-[10px] text-gray-600">score: {r.meta.health_score}/10</span>}
                            {r.meta.focus && <span className="text-[10px] text-gray-600">focus: {r.meta.focus}</span>}
                            {r.meta.segment && <span className="text-[10px] text-gray-600">segment: {r.meta.segment}</span>}
                          </div>
                          <div className="text-[10px] text-gray-600">
                            {r.period_start && r.period_end ? `${r.period_start} — ${r.period_end} · ` : ""}
                            {new Date(r.created_at).toLocaleString("ru-RU",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}
                            {" · "}{r.created_by}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={async () => {
                              const d = await fetch(`${STRATEGY_URL}/?action=strategy_report_get&id=${r.id}`, { headers: hdr() }).then(x => x.json());
                              setSelectedReport(d.report ?? null);
                            }}
                            className="text-[10px] px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700 rounded-lg transition-colors">
                            Открыть
                          </button>
                          <button
                            onClick={async () => {
                              await roadmapReq("strategy_report_delete", { id: r.id });
                              setReports(prev => prev.filter(x => x.id !== r.id));
                              if (selectedReport && (selectedReport as Record<string,unknown>).id === r.id) setSelectedReport(null);
                              showToast("Отчёт удалён");
                            }}
                            className="text-gray-700 hover:text-red-500 p-1.5 transition-colors">
                            <Icon name="Trash2" size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {selectedReport && (
                <div className="bg-gray-900 border border-violet-800/40 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-gray-200">
                      Отчёт #{String((selectedReport as Record<string,unknown>).id)} · {String((selectedReport as Record<string,unknown>).report_type)}
                    </p>
                    <button onClick={() => setSelectedReport(null)} className="text-gray-600 hover:text-gray-400 p-1"><Icon name="X" size={14} /></button>
                  </div>
                  <pre className="text-[10px] text-gray-500 font-mono whitespace-pre-wrap overflow-auto max-h-80">
                    {JSON.stringify((selectedReport as Record<string,unknown>).insights, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── ITEM MODAL ─────────────────────────────────────────────── */}
      {itemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setItemModal(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg mx-4 p-6 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-100">Добавить в Roadmap</h3>
              <button onClick={() => setItemModal(null)} className="text-gray-600 hover:text-gray-400 p-1"><Icon name="X" size={16} /></button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-900/40 text-violet-400 border border-violet-800">{itemModal.source_type}</span>
              {itemModal.source_report_id && <span className="text-[10px] text-gray-600">report #{itemModal.source_report_id}</span>}
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] text-gray-500 mb-1 font-semibold uppercase">Название *</label>
                <input value={itemForm.title} onChange={e => setItemForm(f => ({...f, title: e.target.value}))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600"
                  placeholder="Название инициативы" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[["lane","Колонка",[["now","Сейчас"],["next","Далее"],["later","Потом"]]], ["impact","Импакт",[["high","Высокий"],["medium","Средний"],["low","Низкий"]]], ["effort","Усилия",[["low","Низкие"],["medium","Средние"],["high","Высокие"]]]].map(([k,lbl,opts]) => (
                  <div key={String(k)}>
                    <label className="block text-[10px] text-gray-500 mb-1 font-semibold uppercase">{String(lbl)}</label>
                    <select value={(itemForm as Record<string,string>)[String(k)]} onChange={e => setItemForm(f => ({...f, [String(k)]: e.target.value}))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-xs text-gray-300 focus:outline-none focus:border-violet-600">
                      {(opts as string[][]).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1 font-semibold uppercase">Метрика</label>
                  <input value={itemForm.target_metric} onChange={e => setItemForm(f => ({...f, target_metric: e.target.value}))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600"
                    placeholder="activation_rate" />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1 font-semibold uppercase">Сегмент</label>
                  <input value={itemForm.target_segment} onChange={e => setItemForm(f => ({...f, target_segment: e.target.value}))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600"
                    placeholder="new users" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-1 font-semibold uppercase">Описание</label>
                <textarea value={itemForm.description} onChange={e => setItemForm(f => ({...f, description: e.target.value}))}
                  rows={2} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600 resize-none"
                  placeholder="Дополнительный контекст..." />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setItemModal(null)}
                className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm rounded-xl transition-colors">
                Отмена
              </button>
              <button onClick={handleSaveToRoadmap} disabled={savingItem || !itemForm.title.trim()}
                className="flex-1 px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors">
                {savingItem ? "Добавляю..." : "В Roadmap"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium z-50 bg-emerald-900 text-emerald-300 border border-emerald-700 transition-all">
          {toast}
        </div>
      )}
    </AdminShell>
  );
}