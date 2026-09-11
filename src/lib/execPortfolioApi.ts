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
  metric: string | null;
  unit: string | null;
  baseline_value: string | null;
  plan_value: string | null;
  actual_value: string | null;
  confirmation_status: string;
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

  projects: (): Promise<{ items: ExecProject[] }> => req("/?action=projects"),
  saveProject: (data: Record<string, unknown>) => req("/?action=save_project", "POST", data),

  tasks: (projectId?: number): Promise<{ items: ExecTask[] }> =>
    req(`/?action=tasks${projectId ? `&project_id=${projectId}` : ""}`),
  saveTask: (data: Record<string, unknown>) => req("/?action=save_task", "POST", data),

  results: (projectId?: number): Promise<{ items: ExecResult[] }> =>
    req(`/?action=results${projectId ? `&project_id=${projectId}` : ""}`),
  saveResult: (data: Record<string, unknown>) => req("/?action=save_result", "POST", data),

  effects: (resultId?: number): Promise<{ items: ExecEffect[] }> =>
    req(`/?action=effects${resultId ? `&result_id=${resultId}` : ""}`),
  saveEffect: (data: Record<string, unknown>) => req("/?action=save_effect", "POST", data),

  saveLink: (data: Record<string, unknown>) => req("/?action=save_link", "POST", data),
  links: (kind: string, id: number) => req(`/?action=links&kind=${kind}&id=${id}`),

  createSnapshot: (data: Record<string, unknown>) => req("/?action=create_snapshot", "POST", data),
  snapshots: () => req("/?action=snapshots"),
  snapshot: (id: number) => req(`/?action=snapshot&id=${id}`),
};
