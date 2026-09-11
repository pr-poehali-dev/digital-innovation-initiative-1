import { accessHeaders } from "./execAccess";

const BASE = "https://functions.poehali.dev/ef2cd6c5-1e22-49be-adeb-b0ba6bcaad6a";

export interface ResourceAssignment {
  id: number;
  project_id: number | null;
  initiative_id: number | null;
  person_id: number | null;
  person_name: string | null;
  position_title: string | null;
  role_id: number | null;
  role_title: string | null;
  role_title_ref: string | null;
  org_unit_id: number | null;
  org_unit_name: string | null;
  project_role: string;
  is_external: boolean;
  is_vacant: boolean;
  period_start: string | null;
  period_end: string | null;
  plan_load_pct: number;
  fact_load_pct: number | null;
  comment: string | null;
}

export interface TeamLoadRow {
  person_id: number;
  display_name: string;
  position_title: string | null;
  total_load_pct: number;
  assignment_count: number;
}

export interface CostCategory {
  id: number;
  code: string;
  title: string;
  sort_order: number;
}

export interface BudgetVersion {
  id: number;
  project_id: number | null;
  initiative_id: number | null;
  year: number;
  version_label: string;
  version_status: string;
  is_locked: boolean;
  created_at: string;
}

export interface BudgetLine {
  id: number;
  version_id: number;
  category_id: number;
  category_title: string;
  category_code: string;
  funding_source: string | null;
  month: string;
  amount_plan: number;
  comment: string | null;
}

export interface FinancialSummary {
  approved_budget?: number;
  fact?: number;
  commitments?: number;
  forecast?: number;
  remaining?: number;
  deviation?: number;
  deviation_pct?: number | null;
  total_budget?: number;
  projects_budget?: number;
  own_budget?: number;
  total_fact?: number;
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

export const execResourcesApi = {
  assignments: (kind: "project" | "initiative", id: number): Promise<{ items: ResourceAssignment[] }> =>
    req(`/?action=assignments&kind=${kind}&id=${id}`),
  saveAssignment: (data: Record<string, unknown>): Promise<{ id: number; overload_warning: string | null }> =>
    req("/?action=save_assignment", "POST", data),
  archiveAssignment: (id: number) => req("/?action=archive_assignment", "POST", { id }),
  teamLoad: (): Promise<{ items: TeamLoadRow[] }> => req("/?action=team_load"),
  vacantRoles: (): Promise<{ items: Array<{ id: number; role_title: string | null; role_title_ref: string | null; project_title: string | null; initiative_title: string | null }> }> =>
    req("/?action=vacant_roles"),
  portfolioFinancialKpi: (year?: number): Promise<{
    year: number; total_budget: number; total_fact: number; total_commitments: number;
    total_forecast: number; remaining: number; total_fot: number;
    projects_over_budget: Array<{ id: number; title: string; budget: number; forecast: number; deviation: number }>;
  }> => req(`/?action=portfolio_financial_kpi${year ? `&year=${year}` : ""}`),

  costCategories: (): Promise<{ items: CostCategory[] }> => req("/?action=cost_categories"),

  budgetVersions: (kind: "project" | "initiative", id: number): Promise<{ items: BudgetVersion[] }> =>
    req(`/?action=budget_versions&kind=${kind}&id=${id}`),
  createBudgetVersion: (data: Record<string, unknown>) => req("/?action=create_budget_version", "POST", data),
  setBudgetVersionStatus: (id: number, status: string) =>
    req("/?action=set_budget_version_status", "POST", { id, status }),

  budgetLines: (versionId: number): Promise<{ items: BudgetLine[]; summary: { by_category: Record<string, Record<string, number>>; total_by_month: Record<string, number>; total_year: number } }> =>
    req(`/?action=budget_lines&version_id=${versionId}`),
  saveBudgetLine: (data: Record<string, unknown>) => req("/?action=save_budget_line", "POST", data),

  actuals: (kind: "project" | "initiative", id: number) => req(`/?action=actuals&kind=${kind}&id=${id}`),
  saveActual: (data: Record<string, unknown>) => req("/?action=save_actual", "POST", data),

  commitments: (kind: "project" | "initiative", id: number) => req(`/?action=commitments&kind=${kind}&id=${id}`),
  saveCommitment: (data: Record<string, unknown>) => req("/?action=save_commitment", "POST", data),

  fot: (kind: "project" | "initiative", id: number) => req(`/?action=fot&kind=${kind}&id=${id}`),
  saveFot: (data: Record<string, unknown>) => req("/?action=save_fot", "POST", data),

  financialSummary: (kind: "project" | "initiative", id: number): Promise<FinancialSummary> =>
    req(`/?action=financial_summary&kind=${kind}&id=${id}`),

  createFinancialSnapshot: (data: Record<string, unknown>) => req("/?action=create_financial_snapshot", "POST", data),
  financialSnapshot: (id: number) => req(`/?action=financial_snapshot&id=${id}`),
};