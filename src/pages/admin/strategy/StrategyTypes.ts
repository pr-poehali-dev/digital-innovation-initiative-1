// ── Types ──────────────────────────────────────────────────────────

export type Period = "7" | "30" | "90" | "180";
export type KPI = { key: string; label: string; value: number | null; prev?: number; delta?: number | null; unit?: string };
export type FunnelStage = { stage: string; label: string; users: number; conv_from_prev: number; conv_total: number };
export type SegmentRow = { key: string; label: string; size: number; activation_rate: number; completion_rate: number; ticket_rate: number; flagged_share: number };
export type LearningData = {
  goals_by_status: Record<string, number>;
  zero_checkin_active_pct: number; reopen_events_period: number;
  avg_checkins_per_active_goal: number; checkins_in_period: number;
  checkin_distribution: { bucket: string; goals: number }[];
  users_with_education_items: number;
};
export type SupportData = {
  total_tickets: number; by_priority: { priority: string; count: number }[];
  by_status: { status: string; count: number }[];
  by_module: { module: string; count: number }[];
  repeat_requesters: { email: string; tickets: number }[];
  stalled_users_with_tickets: number; critical_open: number;
};
export type AISummary = {
  headline?: string; health_score?: number; health_reasoning?: string;
  key_insights?: { title: string; claim: string; confidence: string; impact: string }[];
  top_risks?: string[]; top_opportunities?: string[];
  recommended_focus?: string; next_actions?: string[];
  data_maturity?: string; raw?: string; error?: string;
};
export type Hypothesis = {
  id: number; title: string; problem: string; hypothesis: string;
  expected_impact: string; effort: string; target_metric: string;
  target_segment: string; evidence: string; how_to_measure: string;
};
export type StrategicPillar = { id: string; title: string; description: string };
export type Guardrail       = { title: string; description: string };
export type Profile = {
  vision_text: string; product_thesis: string;
  mission_text: string; north_star_name: string; north_star_definition: string;
  target_segments: string[]; quarter_goals: string[];
  priority_themes: string[]; non_goals: string[];
  strategic_pillars: StrategicPillar[];
  guardrails: Guardrail[];
};
export type RoadmapItem = {
  id: number; title: string; description: string;
  lane: "now" | "next" | "later"; status: string;
  source_type: string; source_report_id: number | null;
  source_payload: Record<string, unknown>;
  target_segment: string; target_metric: string;
  impact: string; effort: string; confidence: string;
  owner: string; sort_order: number;
  created_by: string; created_at: string; updated_at: string;
};
export type RoadmapBoard = { now: RoadmapItem[]; next: RoadmapItem[]; later: RoadmapItem[] };
export type ReportItem = {
  id: number; report_type: string;
  period_start: string | null; period_end: string | null;
  created_by: string; created_at: string;
  meta: { data_maturity?: string; health_score?: number; sample_users?: number; focus?: string; segment?: string };
};
export type InsightPayload = {
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

export type Tab = "overview" | "health" | "trajectory" | "segments" | "learning" | "support" | "ai_lab" | "roadmap" | "reports" | "scenarios" | "profile";

export const TABS: { key: Tab; label: string; icon: string }[] = [
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

// ── Visual constants ────────────────────────────────────────────────

export const PILLAR_ICONS: Record<string, string> = {
  identity: "User", competency: "BrainCircuit", navigator: "Compass",
  practice: "Briefcase", proof: "BadgeCheck", discovery: "Telescope",
};
export const PILLAR_COLORS: Record<string, string> = {
  identity: "border-violet-800/50 bg-violet-900/10",
  competency: "border-blue-800/50 bg-blue-900/10",
  navigator: "border-emerald-800/50 bg-emerald-900/10",
  practice: "border-amber-800/50 bg-amber-900/10",
  proof: "border-teal-800/50 bg-teal-900/10",
  discovery: "border-pink-800/50 bg-pink-900/10",
};
export const GUARDRAIL_ICONS: Record<string, string> = {
  "Consent-first": "ShieldCheck", "Explainability": "SearchCode",
  "Evidence > Claims": "ClipboardCheck", "Growth, not labeling": "TrendingUp", "Human Dignity": "Heart",
};
export const IMPACT_COLOR: Record<string, string> = { high: "text-red-400", medium: "text-amber-400", low: "text-gray-500" };
export const EFFORT_COLOR: Record<string, string> = { high: "bg-red-900/20 text-red-400", medium: "bg-amber-900/20 text-amber-400", low: "bg-emerald-900/20 text-emerald-400" };
export const RM_STATUS_CFG: Record<string, string> = { idea: "bg-gray-800 text-gray-500", planned: "bg-blue-900/40 text-blue-400", in_progress: "bg-violet-900/40 text-violet-400", done: "bg-emerald-900/40 text-emerald-400" };
export const SOURCE_ICON: Record<string, string> = { hypothesis: "Lightbulb", summary: "Sparkles", next_action: "ArrowRight", segment_plan: "Target", manual: "PenLine" };
