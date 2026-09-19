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

export interface RoadmapBaselineDeviation {
  has_baseline: boolean;
  baseline_version: number | null;
  baseline_integrity_ok: boolean | null;
  has_forecast: boolean;
  has_fact_data: boolean;
  baseline_start: string | null;
  baseline_end: string | null;
  deviation_start_days: number | null;
  deviation_end_days: number | null;
  shifted_tasks_count: number;
  shifted_milestones_count: number;
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
  has_cross_project_dependency: boolean;
  critical_risk_count: number;
  open_issue_count: number;
  resource_gap_count: number;
  baseline_deviation: RoadmapBaselineDeviation;
  critical_path_changed?: boolean;
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
  is_conditional_scenario?: boolean;
  decision_request_id?: number | null;
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
  cross_dependency_only?: boolean;
  shifted_only?: boolean;
  min_shift_days?: number;
  no_baseline_only?: boolean;
  no_forecast_only?: boolean;
  no_fact_only?: boolean;
  integrity_violated_only?: boolean;
  critical_path_changed_only?: boolean;
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
  is_active: boolean;
}

export interface ScheduleBaseline extends ScheduleBaselineSummary {
  payload: Record<string, unknown>;
  integrity_ok: boolean;
}

export interface GanttStage {
  id: number;
  project_id: number;
  title: string;
  sort_order: number;
  status: string;
  plan_start: string | null;
  plan_end: string | null;
  forecast_end: string | null;
  fact_start: string | null;
  fact_end: string | null;
}

export interface GanttTask {
  id: number;
  title: string;
  project_id: number;
  stage_id: number | null;
  milestone_id: number | null;
  responsible_person_id: number | null;
  responsible_name: string | null;
  responsible_role?: string | null;
  due_at: string | null;
  plan_start?: string | null;
  forecast_date: string | null;
  fact_date: string | null;
  priority: string;
  status: string;
  progress_pct: number;
  is_overdue: boolean;
  parent_task_id?: number | null;
  outline_code?: string | null;
  sort_order?: number;
}

export interface GanttMilestone {
  id: number;
  title: string;
  project_id: number;
  plan_date_original: string | null;
  plan_date: string;
  forecast_date: string | null;
  fact_date: string | null;
  status: string;
  responsible_person_id: number | null;
  responsible_name: string | null;
  responsible_role?: string | null;
  achievement_criteria: string | null;
  parent_milestone_id?: number | null;
  outline_code?: string | null;
  sort_order?: number;
  is_conditional_scenario?: boolean;
  decision_request_id?: number | null;
}

export interface ProjectGanttData {
  project: {
    id: number; title: string; status: string; priority: string; progress_pct: number;
    plan_start: string | null; plan_end: string | null; fact_start: string | null; fact_end: string | null;
  };
  stages: GanttStage[];
  tasks: GanttTask[];
  milestones: GanttMilestone[];
  dependencies: ScheduleDependency[];
  latest_baseline: ScheduleBaselineSummary | null;
}

export interface DependencyGraphNode {
  kind: DependencyKind;
  id: number;
  title: string;
  status: string | null;
  plan_start: string | null;
  plan_end: string | null;
  is_overdue: boolean;
  progress_pct: number | null;
  responsible_name: string | null;
  stage_id: number | null;
  stage_title?: string | null;
  external: boolean;
  external_project_id?: number | null;
  in_count: number;
  out_count: number;
}

export interface DependencyGraphEdge {
  id: number;
  dependency_type: DependencyType;
  src_kind: DependencyKind;
  src_id: number;
  tgt_kind: DependencyKind;
  tgt_id: number;
  lag_days: number;
  lag_kind: "calendar" | "working";
  is_cross_project: boolean;
  violated: boolean;
}

export interface DependencyGraphData {
  project: { id: number; title: string };
  nodes: DependencyGraphNode[];
  edges: DependencyGraphEdge[];
}

export interface CriticalPathNode {
  kind: DependencyKind;
  id: number;
  title: string;
  status: string;
  early_start: string;
  early_finish: string;
  late_start: string;
  late_finish: string;
  total_float_days: number;
  free_float_days: number;
  is_critical: boolean;
  criticality_reason: string | null;
  next_critical: { kind: DependencyKind; id: number; title: string } | null;
}

export interface CriticalPathData {
  project: { id: number; title: string };
  computable: boolean;
  warnings: string[];
  incomplete_objects: { kind: DependencyKind; id: number; title: string; reason: string }[];
  cycle: { chain: { kind: DependencyKind; id: number; title: string }[] } | null;
  nodes: CriticalPathNode[];
  project_duration_days: number | null;
}

export interface ExternalDependencyRow {
  dependency_type: DependencyType;
  lag_days: number;
  external_kind: DependencyKind;
  external_id: number;
  external_title: string;
  external_project_id: number | null;
  local_kind: DependencyKind;
  local_id: number;
  local_title: string;
  local_status: string;
}

export interface ProjectExternalDependencies {
  blocking_in: ExternalDependencyRow[];
  blocking_out: ExternalDependencyRow[];
}

export type ScheduleRowKind = "project" | "stage" | "task" | "milestone";

export interface ScheduleComparisonRow {
  kind: ScheduleRowKind;
  id: number;
  title: string;
  status: string;
  responsible_name?: string | null;
  baseline_start?: string | null;
  baseline_end?: string | null;
  actual_start?: string | null;
  actual_end?: string | null;
  forecast_end?: string | null;
  fact_start?: string | null;
  fact_end?: string | null;
  progress_pct?: number | null;
  deviation_start_days?: number | null;
  deviation_end_days?: number | null;
  data_quality_warning?: string;
  baseline_missing?: boolean;
}

export interface ScheduleComparisonSummary {
  project_end_shift_days: number | null;
  shifted_tasks_count: number;
  shifted_milestones_count: number;
  newly_critical: { kind: ScheduleRowKind; id: number }[];
  no_longer_critical: { kind: ScheduleRowKind; id: number }[];
  overdue_count: number;
  no_fact_data_count: number;
  top_shifts: ScheduleComparisonRow[];
}

export interface ScheduleComparisonData {
  project: { id: number; title: string };
  baseline: { id: number; version_number: number; created_at: string; created_by: string; integrity_ok: boolean } | null;
  warnings: string[];
  rows: {
    project: ScheduleComparisonRow;
    stages: ScheduleComparisonRow[];
    tasks: ScheduleComparisonRow[];
    milestones: ScheduleComparisonRow[];
  };
  current_cpm_computable: boolean;
  baseline_cpm_computable: boolean;
  summary: ScheduleComparisonSummary;
  calendar_mode: "calendar_days";
}

export interface BaselineVersionsComparison {
  baseline_a: { id: number; version_number: number; created_at: string };
  baseline_b: { id: number; version_number: number; created_at: string };
  diffs: {
    project: { plan_start_a: string | null; plan_start_b: string | null; plan_end_a: string | null; plan_end_b: string | null } | null;
    stages: { id: number; title: string; change: string; value_a?: string; value_b?: string }[];
    tasks: { id: number; title: string; change: string; value_a?: string; value_b?: string }[];
    milestones: { id: number; title: string; change: string; value_a?: string; value_b?: string }[];
  };
}

export interface ScheduleChangeLogEntry {
  id: number;
  object_kind: ScheduleRowKind;
  object_id: number;
  object_title: string | null;
  project_id: number | null;
  layer: "plan" | "forecast" | "fact";
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  shift_days: number | null;
  reason: string | null;
  related_decision_id: number | null;
  related_document_id: number | null;
  affected_dependency_count: number;
  criticality_changed: boolean;
  project_end_shift_days: number | null;
  actor: string;
  created_at: string;
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

  projectGantt: (projectId: number): Promise<ProjectGanttData> => req(`/?action=project_gantt&id=${projectId}`),

  dependencyGraph: (projectId: number): Promise<DependencyGraphData> =>
    req(`/?action=dependency_graph&id=${projectId}`),
  criticalPath: (projectId: number): Promise<CriticalPathData> =>
    req(`/?action=critical_path&id=${projectId}`),
  projectExternalDependencies: (projectId: number): Promise<ProjectExternalDependencies> =>
    req(`/?action=project_external_dependencies&id=${projectId}`),

  setActiveBaseline: (id: number): Promise<{ id: number }> => post("set_active_baseline", { id }),
  compareBaselines: (a: number, b: number): Promise<BaselineVersionsComparison> =>
    req(`/?action=compare_baselines&a=${a}&b=${b}`),
  scheduleComparison: (projectId: number, baselineId?: number): Promise<ScheduleComparisonData> =>
    req(`/?action=schedule_comparison&id=${projectId}${baselineId ? `&baseline_id=${baselineId}` : ""}`),
  scheduleChangeLog: (projectId: number): Promise<{ items: ScheduleChangeLogEntry[] }> =>
    req(`/?action=schedule_change_log&id=${projectId}`),
};