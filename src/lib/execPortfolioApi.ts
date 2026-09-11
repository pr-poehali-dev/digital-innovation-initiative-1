import { accessHeaders } from "./execAccess";

const BASE = "https://functions.poehali.dev/8e392cec-0a59-421f-8961-018b8097103a";

export interface ExecProject {
  id: number;
  title: string;
  project_kind: string;
  description: string | null;
  status: string;
  priority: string;
  progress_pct: number;
  initiative_id: number | null;
  initiative_title: string | null;
  plan_start: string | null;
  plan_end: string | null;
  fact_start: string | null;
  fact_end: string | null;
  task_count: number;
  overdue_task_count: number;
  updated_at: string;
}

export interface ExecTask {
  id: number;
  title: string;
  description: string | null;
  project_id: number | null;
  project_title: string | null;
  stage_id: number | null;
  milestone_id: number | null;
  action_id: number | null;
  responsible_person_id: number | null;
  responsible_email: string | null;
  due_at: string | null;
  priority: string;
  status: string;
  progress_pct: number;
  expected_result: string | null;
  actual_result: string | null;
  is_overdue: boolean;
}

export interface ExecResult {
  id: number;
  title: string;
  result_kind: string;
  description: string | null;
  project_id: number | null;
  project_title: string | null;
  initiative_id: number | null;
  achieved_at: string | null;
  effect_count: number;
}

export interface ExecEffect {
  id: number;
  title: string;
  result_id: number | null;
  result_title: string | null;
  project_id: number | null;
  initiative_id: number | null;
  metric: string | null;
  unit: string | null;
  baseline_value: string | null;
  plan_value: string | null;
  actual_value: string | null;
  measured_at: string | null;
  calculation_method: string | null;
  data_source: string | null;
  confirmation_status: string;
}

export interface ExecLink {
  id: number;
  link_type: string;
  link_type_label: string;
  src_kind: string;
  src_id: number;
  tgt_kind: string;
  tgt_id: number;
  other_kind: string;
  other_id: number;
  other_title: string | null;
  note: string | null;
  created_at: string;
}

export interface HistoryEntry {
  id: number;
  entity_type: string;
  entity_id: number;
  action: string;
  actor: string;
  after_json: Record<string, unknown> | null;
  created_at: string;
}

export interface ProjectDetail extends ExecProject {
  stages: Array<{ id: number; title: string; status: string }>;
  tasks: ExecTask[];
  milestones: Array<{ id: number; title: string; plan_date: string; status: string }>;
  results: ExecResult[];
  risks: Array<{ id: number; description: string; probability: number; impact: number; status: string }>;
  issues: Array<{ id: number; title: string; status: string }>;
  links: ExecLink[];
}

export interface PortfolioDashboard {
  overdue_actions: Array<{ id: number; title: string; status: string; priority: string; due_at: string; is_on_control: boolean }>;
  upcoming_actions: Array<{ id: number; title: string; status: string; priority: string; due_at: string }>;
  overdue_tasks: Array<{ id: number; title: string; status: string; priority: string; project_id: number | null; due_at: string }>;
  upcoming_milestones: Array<{ id: number; title: string; plan_date: string; status: string; initiative_id: number | null; project_id: number | null }>;
  projects_by_status: Array<{ status: string; cnt: number }>;
  pending_decisions: Array<{ id: number; question: string; status: string; due_at: string | null }>;
  top_risks: Array<{ id: number; description: string; probability: number; impact: number; risk_score: number; status: string }>;
  recent_results: Array<{ id: number; title: string; achieved_at: string | null; result_kind: string }>;
}

async function req(path: string, method: "GET" | "POST" = "GET", body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...accessHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data?.error?.message || "Ошибка загрузки данных");
  return data.data;
}

export const execPortfolioApi = {
  dashboard: (): Promise<PortfolioDashboard> => req("/?action=dashboard"),

  projects: (includeArchived = false): Promise<{ items: ExecProject[] }> =>
    req(`/?action=projects${includeArchived ? "&include_archived=1" : ""}`),
  project: (id: number): Promise<ProjectDetail> => req(`/?action=project&id=${id}`),
  saveProject: (data: Record<string, unknown>) => req("/?action=save_project", "POST", data),
  archiveProject: (id: number) => req("/?action=archive_project", "POST", { id }),

  tasks: (projectId?: number): Promise<{ items: ExecTask[] }> =>
    req(`/?action=tasks${projectId ? `&project_id=${projectId}` : ""}`),
  saveTask: (data: Record<string, unknown>) => req("/?action=save_task", "POST", data),
  archiveTask: (id: number) => req("/?action=archive_task", "POST", { id }),

  results: (projectId?: number): Promise<{ items: ExecResult[] }> =>
    req(`/?action=results${projectId ? `&project_id=${projectId}` : ""}`),
  saveResult: (data: Record<string, unknown>) => req("/?action=save_result", "POST", data),
  archiveResult: (id: number) => req("/?action=archive_result", "POST", { id }),

  effects: (resultId?: number): Promise<{ items: ExecEffect[] }> =>
    req(`/?action=effects${resultId ? `&result_id=${resultId}` : ""}`),
  saveEffect: (data: Record<string, unknown>) => req("/?action=save_effect", "POST", data),
  archiveEffect: (id: number) => req("/?action=archive_effect", "POST", { id }),

  saveLink: (data: Record<string, unknown>) => req("/?action=save_link", "POST", data),
  archiveLink: (id: number) => req("/?action=archive_link", "POST", { id }),
  links: (kind: string, id: number): Promise<{ items: ExecLink[] }> =>
    req(`/?action=links&kind=${kind}&id=${id}`),

  history: (kind: string, id: number): Promise<{ items: HistoryEntry[] }> =>
    req(`/?action=history&kind=${kind}&id=${id}`),

  createSnapshot: (data: Record<string, unknown>) => req("/?action=create_snapshot", "POST", data),
  snapshots: () => req("/?action=snapshots"),
  snapshot: (id: number) => req(`/?action=snapshot&id=${id}`),
};