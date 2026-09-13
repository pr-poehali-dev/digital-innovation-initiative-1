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
  is_active: boolean;
  effective_date: string | null;
  scenario: string;
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
  commitments_total?: number;
  commitments_paid?: number;
  commitments_open?: number;
  expected?: number;
  forecast?: number;
  remaining?: number;
  deviation?: number;
  deviation_pct?: number | null;
  total_budget?: number;
  projects_budget?: number;
  own_budget?: number;
  total_fact?: number;
  by_project?: Array<{ id: number; title: string; budget: number; fact: number }>;
}

export interface CapacityMonthCell {
  plan_load_pct: number;
  fact_load_pct: number | null;
  plan_days: number | null;
  fact_days: number | null;
}

export interface CapacityAssignmentRow {
  assignment_id: number;
  person_id: number | null;
  person_name: string | null;
  role_title: string | null;
  role_title_ref: string | null;
  is_vacant: boolean;
  months: Record<string, CapacityMonthCell>;
  year_avg_plan_pct: number;
  overload_by_month: Record<string, number>;
}

export interface FotRow {
  id: number;
  assignment_id: number | null;
  person_id: number | null;
  person_name: string | null;
  role_title: string | null;
  month: string;
  cost_basis: string;
  bonus: number;
  accruals: number;
  other_payments: number;
  plan_total: number;
  fact_total: number | null;
}

export interface FinancialActual {
  id: number;
  category_id: number;
  category_title: string;
  month: string;
  amount: number;
  paid_amount: number | null;
  source_ref: string | null;
}

export interface FinancialCommitment {
  id: number;
  category_id: number;
  category_title: string;
  contract_ref: string | null;
  amount: number;
  paid_amount: number;
  start_date: string | null;
  end_date: string | null;
  status: string;
}

export interface FinancialExpected {
  id: number;
  category_id: number;
  category_title: string;
  month: string;
  amount: number;
  comment: string | null;
}

export interface ResourceRequirement {
  id: number;
  project_id: number | null;
  initiative_id: number | null;
  task_id: number | null;
  task_title: string | null;
  milestone_id: number | null;
  milestone_title: string | null;
  stage_id: number | null;
  stage_title: string | null;
  role_id: number | null;
  role_title: string | null;
  role_title_ref: string | null;
  headcount: number;
  required_load_pct: number;
  period_start: string | null;
  period_end: string | null;
  need_by_date: string | null;
  search_start_date: string | null;
  reason: string | null;
  criticality: "low" | "medium" | "high" | "critical";
  required_competencies: string | null;
  closing_method: string | null;
  status: string;
  estimated_monthly_cost: number | null;
  estimated_total_cost: number | null;
  funding_confirmed: boolean;
  budget_line_id: number | null;
  cost_category_id: number | null;
  cost_category_title: string | null;
  resolved_assignment_id: number | null;
  closed_at: string | null;
  is_overdue: boolean;
  comment: string | null;
}

export interface RequirementDashboardItem {
  id: number;
  role_title: string | null;
  role_title_ref: string | null;
  project_id: number | null;
  initiative_id: number | null;
  project_title: string | null;
  need_by_date: string | null;
  search_start_date?: string | null;
  criticality?: string;
  days_overdue?: number;
  estimated_total_cost?: number | null;
}

export interface RequirementDashboard {
  start_search_now: RequirementDashboardItem[];
  overdue: RequirementDashboardItem[];
  upcoming_90: RequirementDashboardItem[];
  without_funding: RequirementDashboardItem[];
  total_unresolved_cost: number;
  tasks_without_resource: Array<{ id: number; title: string; project_id: number | null; due_at: string | null }>;
}

/** Расчёт-предупреждение по ресурсам проекта/инициативы — ничего не
 * меняет и не переназначает, только показывает потенциальные конфликты
 * для решения руководителем. */
export interface ResourceConflicts {
  overloaded_people: Array<{
    person_id: number; person_name: string; total_load_pct: number;
    sources: Array<{ project_id: number | null; plan_load_pct: number }>;
  }>;
  overlapping_assignments: Array<{
    person_id: number; person_name: string;
    assignment_a: number; project_a: number | null; start_a: string; end_a: string;
    assignment_b: number; project_b: number | null; start_b: string; end_b: string;
  }>;
  open_roles: Array<{
    id: number; role_title: string | null; role_title_ref: string | null; status: string;
    criticality: string; need_by_date: string | null; search_start_date: string | null; funding_confirmed: boolean;
  }>;
  search_should_have_started: ResourceConflicts["open_roles"];
  unfunded_requirements: ResourceConflicts["open_roles"];
  assignment_outside_period: Array<{
    assignment_id: number; person_id: number | null; person_name: string | null;
    period_start: string; period_end: string; project_plan_start: string; project_plan_end: string;
  }>;
  tasks_without_owner: Array<{ id: number; title: string; status: string; due_at: string | null }>;
}

export interface FinancialTimelineMonth {
  budget_plan: number;
  fot_plan: number;
  fot_fact: number;
  fact: number;
  commitments_open: number;
  expected: number;
  forecast: number;
  deviation: number;
  cumulative_budget: number;
  cumulative_forecast: number;
}

export interface FinancialKeyPayment {
  kind: "actual" | "commitment";
  id: number;
  date: string | null;
  amount: number;
  comment: string | null;
}

export interface FinancialMilestone {
  id: number;
  title: string;
  plan_date: string;
  fact_date: string | null;
  status: string;
  milestone_type: string | null;
}

/** Финансовая шкала проекта на той же временной оси, что Гант/ресурсы —
 * читает существующий финансовый контур помесячно, ничего не копирует в
 * таблицы расписания. */
export interface FinancialTimeline {
  year: number;
  months: Record<string, FinancialTimelineMonth>;
  key_payments: FinancialKeyPayment[];
  milestones: FinancialMilestone[];
  commitments_without_dates: number;
  has_approved_budget: boolean;
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
    year: number; total_budget: number; total_fact: number; total_commitments_open: number;
    total_expected: number; total_forecast: number; remaining: number; total_fot: number;
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

  capacityPlan: (kind: "project" | "initiative", id: number, year: number): Promise<{ items: CapacityAssignmentRow[]; year: number }> =>
    req(`/?action=capacity_plan&kind=${kind}&id=${id}&year=${year}`),
  saveCapacityCell: (data: Record<string, unknown>) => req("/?action=save_capacity_cell", "POST", data),

  actuals: (kind: "project" | "initiative", id: number): Promise<{ items: FinancialActual[] }> =>
    req(`/?action=actuals&kind=${kind}&id=${id}`),
  saveActual: (data: Record<string, unknown>) => req("/?action=save_actual", "POST", data),

  commitments: (kind: "project" | "initiative", id: number): Promise<{ items: FinancialCommitment[] }> =>
    req(`/?action=commitments&kind=${kind}&id=${id}`),
  saveCommitment: (data: Record<string, unknown>) => req("/?action=save_commitment", "POST", data),

  expected: (kind: "project" | "initiative", id: number): Promise<{ items: FinancialExpected[] }> =>
    req(`/?action=expected&kind=${kind}&id=${id}`),
  saveExpected: (data: Record<string, unknown>) => req("/?action=save_expected", "POST", data),

  fot: (kind: "project" | "initiative", id: number): Promise<{ items: FotRow[] }> =>
    req(`/?action=fot&kind=${kind}&id=${id}`),
  saveFot: (data: Record<string, unknown>) => req("/?action=save_fot", "POST", data),

  financialSummary: (kind: "project" | "initiative", id: number): Promise<FinancialSummary> =>
    req(`/?action=financial_summary&kind=${kind}&id=${id}`),

  createFinancialSnapshot: (data: Record<string, unknown>) => req("/?action=create_financial_snapshot", "POST", data),
  financialSnapshot: (id: number) => req(`/?action=financial_snapshot&id=${id}`),
  exportFinancialXlsx: (id: number): Promise<{ filename: string; content_base64: string }> =>
    req(`/?action=export_financial_xlsx&id=${id}`),

  requirements: (kind: "project" | "initiative", id: number): Promise<{ items: ResourceRequirement[] }> =>
    req(`/?action=requirements&kind=${kind}&id=${id}`),
  saveRequirement: (data: Record<string, unknown>) => req("/?action=save_requirement", "POST", data),
  archiveRequirement: (id: number) => req("/?action=archive_requirement", "POST", { id }),
  resolveRequirement: (data: Record<string, unknown>): Promise<{ assignment_id: number; requirement_id: number; was_overdue: boolean }> =>
    req("/?action=resolve_requirement", "POST", data),
  requirementDashboard: (): Promise<RequirementDashboard> => req("/?action=requirement_dashboard"),
  hiringLeadTimes: (): Promise<{ items: Array<{ closing_method: string; lead_time_days: number }> }> =>
    req("/?action=hiring_lead_times"),
  resourceConflicts: (kind: "project" | "initiative", id: number): Promise<ResourceConflicts> =>
    req(`/?action=resource_conflicts&kind=${kind}&id=${id}`),
  financialTimeline: (projectId: number, year: number): Promise<FinancialTimeline> =>
    req(`/?action=financial_timeline&kind=project&id=${projectId}&year=${year}`),
};