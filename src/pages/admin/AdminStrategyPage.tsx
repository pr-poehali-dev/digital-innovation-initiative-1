import { useState, useEffect, useCallback } from "react";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { getAdminToken } from "@/lib/admin-api";

const STRATEGY_URL = "https://functions.poehali.dev/04817687-9635-4376-b40c-816fb73e7eb7";

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
  recommended_focus?: string; raw?: string; error?: string;
};
type Hypothesis = {
  id: number; title: string; problem: string; hypothesis: string;
  expected_impact: string; effort: string; target_metric: string;
  target_segment: string; evidence: string; how_to_measure: string;
};
type Profile = {
  mission_text: string; north_star_name: string; north_star_definition: string;
  target_segments: string[]; quarter_goals: string[];
  priority_themes: string[]; non_goals: string[];
};

// ── API ────────────────────────────────────────────────────────────

function hdr() {
  return { "Content-Type": "application/json", "X-Admin-Token": getAdminToken() };
}

async function stratReq(action: string, days: string, extra: Record<string, string> = {}, body?: object) {
  const qs = new URLSearchParams({ action, days, ...extra }).toString();
  const res = await fetch(`${STRATEGY_URL}/?${qs}`, {
    method: body ? "POST" : "GET",
    headers: hdr(),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
}

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

// ── Profile Editor ─────────────────────────────────────────────────

function ProfileEditor({ profile, onSave }: { profile: Profile; onSave: (p: Profile) => void }) {
  const [form, setForm] = useState<Profile>(profile);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(profile); }, [profile]);

  async function save() {
    setSaving(true);
    const res = await fetch(`${STRATEGY_URL}/?action=strategy_profile_update`, {
      method: "POST", headers: hdr(),
      body: JSON.stringify({
        mission_text: form.mission_text, north_star_name: form.north_star_name,
        north_star_definition: form.north_star_definition,
        target_segments: form.target_segments, quarter_goals: form.quarter_goals,
        priority_themes: form.priority_themes, non_goals: form.non_goals,
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

  return (
    <div className="space-y-5">
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
            placeholder="Например: завершённые цели обучения" />
        </div>
        <div>
          <label className={lbl}>Определение North Star</label>
          <input className={inp} value={form.north_star_definition}
            onChange={e => setForm(f => ({ ...f, north_star_definition: e.target.value }))}
            placeholder="Пользователи, достигшие цели за 90 дней" />
        </div>
      </div>
      {listField("Целевые сегменты", form.target_segments, "target_segments")}
      {listField("Цели на квартал", form.quarter_goals, "quarter_goals")}
      {listField("Приоритетные направления", form.priority_themes, "priority_themes")}
      {listField("Вне скоупа (non-goals)", form.non_goals, "non_goals")}
      <button onClick={save} disabled={saving}
        className="px-5 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors">
        {saving ? "Сохраняю..." : "Сохранить профиль"}
      </button>
    </div>
  );
}

// ── Tabs config ────────────────────────────────────────────────────

type Tab = "overview" | "health" | "trajectory" | "segments" | "learning" | "support" | "ai_lab" | "profile";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "overview",   label: "Обзор",      icon: "LayoutDashboard" },
  { key: "health",     label: "Здоровье",   icon: "HeartPulse" },
  { key: "trajectory", label: "Траектория", icon: "GitBranch" },
  { key: "segments",   label: "Сегменты",   icon: "PieChart" },
  { key: "learning",   label: "Обучение",   icon: "GraduationCap" },
  { key: "support",    label: "Support",    icon: "MessageSquare" },
  { key: "ai_lab",     label: "AI Lab",     icon: "Sparkles" },
  { key: "profile",    label: "Профиль",    icon: "Settings" },
];

// ── Main Page ──────────────────────────────────────────────────────

export default function AdminStrategyPage() {
  const [tab, setTab]     = useState<Tab>("overview");
  const [period, setPeriod] = useState<Period>("30");

  const [overview,   setOverview]   = useState<{ kpis: KPI[] } | null>(null);
  const [health,     setHealth]     = useState<{ metrics: KPI[] } | null>(null);
  const [trajectory, setTrajectory] = useState<{ funnel: FunnelStage[]; biggest_dropoff: Record<string, unknown> } | null>(null);
  const [segments,   setSegments]   = useState<SegmentRow[] | null>(null);
  const [learning,   setLearning]   = useState<LearningData | null>(null);
  const [support,    setSupport]    = useState<SupportData | null>(null);
  const [profile,    setProfile]    = useState<Profile>({
    mission_text: "", north_star_name: "", north_star_definition: "",
    target_segments: [], quarter_goals: [], priority_themes: [], non_goals: [],
  });

  const [aiSummary,      setAiSummary]      = useState<AISummary | null>(null);
  const [hypotheses,     setHypotheses]     = useState<Hypothesis[] | null>(null);
  const [hypoFocus,      setHypoFocus]      = useState("growth");
  const [segPlan,        setSegPlan]        = useState<Record<string, unknown> | null>(null);
  const [segPlanTarget,  setSegPlanTarget]  = useState("stalled");

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
  }, [period, overview, health, trajectory, segments, learning, support]);

  function switchTab(t: Tab) { setTab(t); loadTab(t); }

  function changePeriod(p: Period) {
    setPeriod(p);
    setOverview(null); setHealth(null); setTrajectory(null);
    setSegments(null); setLearning(null); setSupport(null);
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
    setLoad("ai_summary", false);
    showToast("AI-сводка готова");
  }

  async function genHypotheses() {
    setLoad("hypotheses", true); setHypotheses(null);
    const d = await stratReq("strategy_ai_hypotheses", period, { focus: hypoFocus });
    setHypotheses(d.hypotheses?.hypotheses ?? null);
    setLoad("hypotheses", false);
    showToast("Гипотезы сгенерированы");
  }

  async function genSegPlan() {
    setLoad("seg_plan", true); setSegPlan(null);
    const res = await fetch(`${STRATEGY_URL}/?action=strategy_ai_segment_plan&days=${period}`, {
      method: "POST", headers: hdr(), body: JSON.stringify({ segment: segPlanTarget }),
    });
    const d = await res.json();
    setSegPlan(d.segment_plan ?? null);
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

              {profile.north_star_name && (
                <div className="bg-violet-900/20 border border-violet-800/60 rounded-xl px-5 py-4">
                  <p className="text-[10px] text-violet-400 font-semibold uppercase tracking-wide mb-1">North Star</p>
                  <p className="text-xl font-bold text-violet-300">{profile.north_star_name}</p>
                  {profile.north_star_definition && (
                    <p className="text-xs text-violet-400/70 mt-1">{profile.north_star_definition}</p>
                  )}
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
                </div>
              )}
              {aiSummary?.error && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
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
                  <div className="bg-violet-900/20 border border-violet-800/40 rounded-xl p-3 mt-3">
                    <p className="text-sm text-violet-200 font-medium">{aiSummary.headline}</p>
                    {aiSummary.recommended_focus && <p className="text-xs text-violet-400/80 mt-1">{aiSummary.recommended_focus}</p>}
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
                          <span className="text-xs font-semibold text-gray-200">{String(step.action ?? "")}</span>
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

        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium z-50 bg-emerald-900 text-emerald-300 border border-emerald-700 transition-all">
          {toast}
        </div>
      )}
    </AdminShell>
  );
}
