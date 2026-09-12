import { accessHeaders } from "./execAccess";

// Тот же backend, что и execPortfolioApi — дорожная карта и шкала вех
// являются расширением exec-portfolio, отдельная cloud function не создавалась.
const BASE = "https://functions.poehali.dev/8e392cec-0a59-421f-8961-018b8097103a";

async function req(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: accessHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data?.error?.message || "Ошибка загрузки данных");
  return data.data;
}

async function post(action: string, body: unknown) {
  const res = await fetch(`${BASE}/?action=${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...accessHeaders() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data?.error?.message || "Ошибка сохранения");
  return data.data;
}

export interface RoadmapProject {
  id: number;
  title: string;
  project_kind: string;
  status: string;
  priority: string;
  progress_pct: number;
  initiative_id: number | null;
  initiative_title: string | null;
  plan_start: string | null;
  plan_end: string | null;
  fact_start: string | null;
  fact_end: string | null;
  forecast_end: string | null;
  manager_person_id: number | null;
  manager_name: string | null;
  is_overdue: boolean;
  is_overbudget: boolean;
  critical_risk_count: number;
  open_issue_count: number;
  resource_gap_count: number;
  stages: { id: number; title: string; status: string; plan_start: string | null; plan_end: string | null }[];
  milestones: {
    id: number; title: string; project_id: number | null; initiative_id: number | null;
    plan_date_original: string | null; plan_date: string; fact_date: string | null;
    status: string; milestone_type: string | null; responsible_person_id: number | null; reschedule_count: number;
  }[];
}

export interface RoadmapInitiativeGroup {
  id: number | null;
  title: string;
  projects: RoadmapProject[];
}

export interface RoadmapData {
  initiatives: RoadmapInitiativeGroup[];
  projects: RoadmapProject[];
}

export interface TimelineMilestone {
  id: number;
  title: string;
  milestone_type: string | null;
  plan_date_original: string | null;
  plan_date: string;
  fact_date: string | null;
  status: string;
  achievement_criteria: string | null;
  achievement_evidence: string | null;
  reschedule_count: number;
  reschedule_reason: string | null;
  project_id: number | null;
  project_title: string | null;
  initiative_id: number | null;
  initiative_title: string | null;
  responsible_person_id: number | null;
  responsible_name: string | null;
  confirmed_by_person_id: number | null;
  confirmed_at: string | null;
  is_overdue: boolean;
  deviation_days: number | null;
  dependent_task_count: number;
}

export interface RoadmapFilters {
  date_from?: string;
  date_to?: string;
  initiative_id?: number;
  project_kind?: string;
  status?: string;
  priority?: string;
  owner_person_id?: number;
  overdue_only?: boolean;
  critical_risk_only?: boolean;
  resource_gap_only?: boolean;
  overbudget_only?: boolean;
}

export interface MilestoneFilters {
  date_from?: string;
  date_to?: string;
  project_id?: number;
  initiative_id?: number;
  status?: string;
  overdue_only?: boolean;
}

function toQuery(filters: object): string {
  const params = new URLSearchParams();
  Object.entries(filters as Record<string, unknown>).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "" || v === false) return;
    params.set(k, v === true ? "1" : String(v));
  });
  const s = params.toString();
  return s ? `&${s}` : "";
}

export type DependencyKind = "task" | "milestone" | "project" | "stage";
export type DependencyType = "FS" | "SS" | "FF" | "SF";

export interface ScheduleDependency {
  id: number;
  dependency_type: DependencyType;
  src_kind: DependencyKind;
  src_id: number;
  tgt_kind: DependencyKind;
  tgt_id: number;
  lag_days: number;
  lag_kind: "calendar" | "working";
  note: string | null;
  created_at: string;
}

export interface ScheduleBaselineSummary {
  id: number;
  scope_kind: "project" | "portfolio";
  scope_id: number | null;
  title: string;
  version_number: number;
  payload_sha256: string;
  created_by: string;
  created_at: string;
  is_test_data: boolean;
}

export interface ScheduleBaseline extends ScheduleBaselineSummary {
  payload: Record<string, unknown>;
  integrity_ok: boolean;
}

export const execRoadmapApi = {
  roadmap: (filters: RoadmapFilters): Promise<RoadmapData> => req(`/?action=roadmap${toQuery(filters)}`),
  milestonesTimeline: (filters: MilestoneFilters): Promise<{ items: TimelineMilestone[] }> =>
    req(`/?action=milestones_timeline${toQuery(filters)}`),

  saveDependency: (payload: {
    dependency_type: DependencyType; src_kind: DependencyKind; src_id: number;
    tgt_kind: DependencyKind; tgt_id: number; lag_days?: number; lag_kind?: string; note?: string;
  }): Promise<{ id: number }> => post("save_dependency", payload),
  archiveDependency: (id: number): Promise<{ id: number }> => post("archive_dependency", { id }),
  dependencies: (kind?: DependencyKind, id?: number): Promise<{ items: ScheduleDependency[] }> =>
    req(`/?action=dependencies${kind && id ? `&kind=${kind}&id=${id}` : ""}`),

  createBaseline: (payload: { scope_kind: "project" | "portfolio"; scope_id?: number; title?: string; is_test_data?: boolean }):
    Promise<{ id: number; created_at: string; version_number: number; payload_sha256: string; title: string }> =>
    post("create_baseline", payload),
  baselines: (scopeKind?: string, scopeId?: number): Promise<{ items: ScheduleBaselineSummary[] }> =>
    req(`/?action=baselines${scopeKind ? `&scope_kind=${scopeKind}` : ""}${scopeId ? `&scope_id=${scopeId}` : ""}`),
  baseline: (id: number): Promise<ScheduleBaseline> => req(`/?action=baseline&id=${id}`),
};