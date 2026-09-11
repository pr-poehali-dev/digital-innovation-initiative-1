import { accessHeaders } from "./execAccess";

const BASE = "https://functions.poehali.dev/1ae4fb17-e225-4a89-a0e2-0bbb8db14a29";

export interface DashboardKpi {
  active_actions: number;
  overdue_actions: number;
  active_projects: number;
  overdue_tasks: number;
  blocked_tasks: number;
  milestones_7: number;
  milestones_14: number;
  milestones_30: number;
  critical_risks: number;
  open_issues: number;
  pending_decisions: number;
  results_pending: number;
  effects_pending: number;
  effects_confirmed: number;
}

export interface AttentionItem {
  kind: string;
  id: number;
  title: string;
  reason: string;
  due_at: string | null;
  days_overdue: number | null;
  priority: string | null;
  project_id: number | null;
  rank: number;
}

export interface PortfolioRow {
  id: number;
  title: string;
  project_kind: string;
  status: string;
  priority: string;
  progress_pct: number;
  plan_end: string | null;
  overdue_task_count: number;
  next_milestone_title: string | null;
  next_milestone_date: string | null;
  top_risk: string | null;
  open_issue: string | null;
  pending_decision: string | null;
  last_result: string | null;
}

export interface UpcomingEvents {
  actions: Array<{ id: number; title: string; due_at: string; priority: string }>;
  tasks: Array<{ id: number; title: string; due_at: string; project_id: number | null }>;
  milestones: Array<{ id: number; title: string; plan_date: string; project_id: number | null }>;
  project_deadlines: Array<{ id: number; title: string; plan_end: string }>;
}

export interface ReportSnapshot {
  id: number;
  title: string;
  report_kind: string;
  period_from: string | null;
  period_to: string | null;
  created_by: string;
  created_at: string;
  version_group: string;
  version_number: number;
  is_test_data: boolean;
}

export interface ReportDetail extends ReportSnapshot {
  payload: Record<string, unknown>;
  params: Record<string, unknown> | null;
  payload_sha256: string;
  integrity_ok: boolean;
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

export const execReportsApi = {
  kpi: (): Promise<DashboardKpi> => req("/?action=kpi"),
  attention: (): Promise<{ items: AttentionItem[] }> => req("/?action=attention"),
  portfolioTable: (filters: Record<string, string> = {}): Promise<{ items: PortfolioRow[] }> => {
    const qs = new URLSearchParams(filters).toString();
    return req(`/?action=portfolio_table${qs ? `&${qs}` : ""}`);
  },
  upcoming: (): Promise<UpcomingEvents> => req("/?action=upcoming"),
  reportKinds: (): Promise<Record<string, string>> => req("/?action=report_kinds"),

  createReport: (data: Record<string, unknown>): Promise<{
    id: number; created_at: string; version_group: string; version_number: number;
    payload_sha256: string; title: string;
  }> => req("/?action=create_report", "POST", data),

  reports: (reportKind?: string): Promise<{ items: ReportSnapshot[] }> =>
    req(`/?action=reports${reportKind ? `&report_kind=${reportKind}` : ""}`),
  report: (id: number): Promise<ReportDetail> => req(`/?action=report&id=${id}`),

  exportHtml: async (id: number): Promise<string> => {
    const res = await fetch(`${BASE}/?action=export_html&id=${id}`, { headers: accessHeaders() });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error?.message || "Ошибка экспорта");
    }
    return res.text();
  },
  exportXlsx: (id: number): Promise<{ filename: string; content_base64: string }> =>
    req(`/?action=export_xlsx&id=${id}`),
};