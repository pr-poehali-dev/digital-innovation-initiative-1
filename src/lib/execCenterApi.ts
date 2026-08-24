import { accessHeaders } from "./execAccess";

const BASE = "https://functions.poehali.dev/35ba7401-e32b-436c-9baa-b7774c77fc87";

export interface Center {
  id: number;
  title: string;
  short_name: string | null;
  status: string;
  parent_org: string | null;
  head_person_id: number | null;
  head_name: string | null;
  mission: string | null;
  rationale: string | null;
  problem_statement: string | null;
  scope_included: string | null;
  scope_excluded: string | null;
  success_criteria: string | null;
  planned_headcount: number | null;
  start_date: string | null;
  review_date: string | null;
  initiative_id: number | null;
  initiative_title?: string | null;
  plan_id: number | null;
  plan_title?: string | null;
  note: string | null;
  reserve_pct: number | string;
  annual_fund_hours: number | string;
  backup_coverage_pct: number | string;
  roadmap_text: string | null;
  expected_effects: string | null;
  functions_count?: number;
  goals_count?: number;
  roles_headcount?: number;
  goals?: CenterGoal[];
  functions?: CenterFunction[];
  roles?: CenterRole[];
}

export interface CenterGoal {
  id: number;
  center_id: number;
  parent_goal_id: number | null;
  kind: string;
  title: string;
  description: string | null;
  metric: string | null;
  baseline_value: string | null;
  target_value: string | null;
  horizon: string | null;
  due_date: string | null;
  owner_person_id: number | null;
  owner_name: string | null;
  status: string;
  progress_pct: number | null;
  sort_order: number;
}

export interface CenterFunction {
  id: number;
  center_id: number;
  code: string | null;
  title: string;
  description: string | null;
  purpose: string | null;
  result_description: string | null;
  goal_id: number | null;
  goal_title: string | null;
  owner_person_id: number | null;
  owner_name: string | null;
  backup_person_id: number | null;
  backup_name: string | null;
  criticality: string;
  work_category: string;
  regularity: string | null;
  hours_per_month: number | null;
  fte_estimate: number | null;
  status: string;
  sort_order: number;
  note: string | null;
  steps_total?: number;
  steps_done?: number;
  steps_overdue?: number;
}

export interface CenterRole {
  id: number;
  center_id: number;
  title: string;
  purpose: string | null;
  duties: string | null;
  requirements: string | null;
  headcount: number;
  hours_per_week: number | null;
  grade: string | null;
  person_id: number | null;
  person_name: string | null;
  status: string;
  justification: string | null;
  sort_order: number;
  function_ids: number[];
}

export interface CenterStats {
  functions: number;
  functions_no_owner: number;
  critical_functions: number;
  critical_no_backup: number;
  hours_per_month: number;
  fte_total: number;
  roles: number;
  headcount: number;
  headcount_filled: number;
  vacant_roles: number;
  goals: number;
  tasks: number;
  goals_no_metric: number;
}

export interface CenterRefs {
  persons: { id: number; display_name: string; position_title: string | null }[];
  initiatives: { id: number; title: string }[];
  plans: { id: number; title: string }[];
}

export const CENTER_STATUS: Record<string, { title: string; cls: string }> = {
  draft: { title: "Черновик", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  modeling: { title: "Моделирование", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  preparation: { title: "Подготовка к созданию", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  proposed: { title: "На согласовании", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  approved: { title: "Утверждён", cls: "bg-violet-100 text-violet-700 border-violet-200" },
  active: { title: "Действует", cls: "bg-green-50 text-green-700 border-green-200" },
  archived: { title: "Архив", cls: "bg-slate-100 text-slate-500 border-slate-200" },
};

export const PARTICIPATION_FORMAT: Record<string, { title: string; cls: string }> = {
  permanent: { title: "Постоянно", cls: "bg-green-50 text-green-700 border-green-200" },
  partial: { title: "Частично", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  expert: { title: "Экспертно", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  temporary: { title: "Временно", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

export const RESOURCE_SOURCE: Record<string, { title: string }> = {
  own_staff: { title: "Собственный штат" },
  other_unit: { title: "Другое подразделение" },
  project_team: { title: "Проектная команда" },
  contractor: { title: "Подрядчик" },
};

export const WORK_CATEGORY: Record<string, { title: string; cls: string }> = {
  operational: { title: "Постоянные функции", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  project: { title: "Проектная работа", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  management: { title: "Управление и координация", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  analytics: { title: "Аналитика и отчётность", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

export const CRITICALITY: Record<string, { title: string; cls: string }> = {
  low: { title: "Низкая", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  medium: { title: "Средняя", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  high: { title: "Высокая", cls: "bg-red-50 text-red-700 border-red-200" },
};

export const FUNC_STATUS: Record<string, { title: string; cls: string }> = {
  planned: { title: "Планируется", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  running: { title: "Выполняется", cls: "bg-green-50 text-green-700 border-green-200" },
  paused: { title: "Приостановлена", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

export const ROLE_STATUS: Record<string, { title: string; cls: string }> = {
  needed: { title: "Требуется", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  approved: { title: "Согласована", cls: "bg-violet-100 text-violet-700 border-violet-200" },
  filled: { title: "Закрыта", cls: "bg-green-50 text-green-700 border-green-200" },
};

export const GOAL_STATUS: Record<string, { title: string; cls: string }> = {
  planned: { title: "Запланировано", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  in_progress: { title: "В работе", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  done: { title: "Достигнуто", cls: "bg-green-50 text-green-700 border-green-200" },
  at_risk: { title: "Под угрозой", cls: "bg-red-50 text-red-700 border-red-200" },
};

export interface DashGoal {
  id: number;
  kind: string;
  title: string;
  metric: string | null;
  baseline_value: string | null;
  target_value: string | null;
  status: string;
  progress_pct: number | null;
  due_date: string | null;
  owner_name: string | null;
  function_count: number;
  last_value: number | null;
  last_period: string | null;
}

export interface DashFunction {
  id: number;
  code: string | null;
  title: string;
  criticality: string;
  status: string;
  goal_id: number | null;
  goal_title: string | null;
  hours_per_month: number | null;
  fte_estimate: number | null;
  owner_name: string | null;
  owner_id: number | null;
  backup_name: string | null;
  req_competencies: number;
  req_critical: number;
  initiative_count: number;
  open_steps: number;
}

export interface CoverageRow {
  function_id: number;
  function_title: string;
  competency_name: string;
  required_level: number;
  is_critical: boolean;
  person_id: number | null;
  display_name: string | null;
  current_level: number | null;
}

export interface DashRole {
  id: number;
  title: string;
  headcount: number;
  hours_per_week: number | null;
  grade: string | null;
  person_id: number | null;
  person_name: string | null;
  status: string;
  justification: string | null;
  function_count: number;
}

export interface DashInitiative {
  id: number;
  title: string;
  status: string;
  stage: string | null;
  priority: string | null;
  plan_start: string | null;
  plan_end: string | null;
  effect_metric: string | null;
  effect_target: string | null;
  effect_actual: string | null;
  open_steps: number;
  overdue_steps: number;
  milestone_count: number;
  is_test: boolean;
}

export interface Checkpoint {
  id: number;
  title: string;
  due_date: string | null;
  status: string | null;
  fact_date: string | null;
  initiative_title: string | null;
  kind: "milestone" | "control_point";
  is_overdue: boolean;
  is_test: boolean;
}

export interface DashRisk {
  id: number;
  title: string;
  status: string | null;
  probability: number | null;
  impact: number | null;
  risk_score: number | null;
  severity: string;
  is_blocking: boolean;
  block_what: string | null;
  block_status: string | null;
  function_title: string | null;
  initiative_title: string | null;
  is_test: boolean;
}

export interface DashIssue {
  id: number;
  title: string;
  severity: string | null;
  status: string | null;
  is_blocking: boolean;
  block_what: string | null;
  block_status: string | null;
  due_at: string | null;
  needs_escalation: boolean;
  initiative_title: string | null;
  is_test: boolean;
}

export interface ReadinessItem {
  code: string;
  title: string;
  done: boolean;
  hint: string;
}

export interface DashStats {
  goals: number;
  tasks: number;
  goals_no_metric: number;
  goals_no_value: number;
  functions: number;
  functions_no_owner: number;
  critical_functions: number;
  critical_no_backup: number;
  functions_no_competency: number;
  competency_gaps: number;
  hours_per_month: number;
  fte_total: number;
  roles: number;
  headcount: number;
  headcount_filled: number;
  vacant_roles: number;
  roles_no_justification: number;
  initiatives: number;
  checkpoints: number;
  checkpoints_overdue: number;
  risks: number;
  risks_high: number;
  issues: number;
  blocking: number;
  test_records: number;
  readiness_pct: number;
  readiness_done: number;
  readiness_total: number;
}

export interface DashboardData {
  center: Center | null;
  goals: DashGoal[];
  functions: DashFunction[];
  coverage: CoverageRow[];
  gaps: CoverageRow[];
  roles: DashRole[];
  initiatives: DashInitiative[];
  checkpoints: Checkpoint[];
  risks: DashRisk[];
  issues: DashIssue[];
  labor: {
    plan_hours: number | string;
    fact_hours: number | string;
    people_involved: number;
    people_reported: number;
  };
  results: {
    steps_done: number;
    steps_open: number;
    steps_overdue: number;
    cp_done: number;
    cp_total: number;
  };
  stats: DashStats;
  readiness: ReadinessItem[];
}

export const SEVERITY: Record<string, { title: string; cls: string }> = {
  critical: { title: "Критичный", cls: "bg-red-100 text-red-800 border-red-300" },
  high: { title: "Высокий", cls: "bg-red-50 text-red-700 border-red-200" },
  medium: { title: "Средний", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  low: { title: "Низкий", cls: "bg-slate-100 text-slate-600 border-slate-200" },
};

async function req(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...accessHeaders(),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data?.error?.message || "Ошибка загрузки данных");
  return data.data;
}

const post = (action: string, body: unknown) =>
  req(`/?action=${action}`, { method: "POST", body: JSON.stringify(body) });

export const centerApi = {
  list: (): Promise<Center[]> => req("/?action=list"),

  refs: (): Promise<CenterRefs> => req("/?action=refs"),

  dashboard: (centerId?: number): Promise<DashboardData> =>
    req(`/?action=dashboard${centerId ? `&center_id=${centerId}` : ""}`),

  functionDetail: (functionId: number): Promise<{
    raci: Record<string, unknown>[];
    competencies: Record<string, unknown>[];
    initiatives: Record<string, unknown>[];
    dept_functions: Record<string, unknown>[];
    steps: Record<string, unknown>[];
  }> => req(`/?action=function_detail&function_id=${functionId}`),

  saveRaci: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("save_raci", data),

  closeRaci: (id: number) => post("close_raci", { id }),

  saveFunctionCompetency: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("save_function_competency", data),

  linkFunctionInitiative: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("link_function_initiative", data),

  center: (
    id: number,
  ): Promise<{ center: Center; stats: CenterStats; refs: CenterRefs }> =>
    req(`/?action=center&center_id=${id}`),

  saveCenter: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("save_center", data),

  saveGoal: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("save_goal", data),

  saveFunction: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("save_function", data),

  saveRole: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("save_role", data),

  linkSteps: (functionId: number | null, stepIds: number[]): Promise<{ updated: number }> =>
    post("link_steps", { function_id: functionId, step_ids: stepIds }),

  deleteGoal: (id: number) => post("delete_goal", { id }),
  deleteFunction: (id: number) => post("delete_function", { id }),
  deleteRole: (id: number) => post("delete_role", { id }),
  deleteCenter: (id: number) => post("delete_center", { id }),

  model: (centerId?: number): Promise<ModelData> =>
    req(`/?action=model${centerId ? `&center_id=${centerId}` : ""}`),

  saveParticipation: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("save_participation", data),

  deleteParticipation: (id: number) => post("delete_participation", { id }),

  taskTemplates: (functionId?: number): Promise<{ items: TaskTemplate[] }> =>
    req(`/?action=task_templates${functionId ? `&function_id=${functionId}` : ""}`),

  saveTaskTemplate: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("save_task_template", data),

  deleteTaskTemplate: (id: number) => post("delete_task_template", { id }),

  generateRegularTasks: (
    horizonDays?: number,
    templateId?: number,
  ): Promise<{ created: { template_id: number; step_id: number; due_date: string }[]; count: number }> =>
    post("generate_regular_tasks", { horizon_days: horizonDays, template_id: templateId }),

  regularTasksSummary: (): Promise<{
    templates: { active_templates: number; hours_per_instance_sum: number };
    instances: { missed: number; upcoming: number; done: number; total_hours: number };
  }> => req("/?action=regular_tasks_summary"),
};

export interface TaskTemplate {
  id: number;
  function_id: number;
  function_title: string;
  title: string;
  description: string | null;
  periodicity: "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
  default_responsible_person_id: number | null;
  default_responsible_name: string | null;
  estimate_hours: number | string | null;
  checklist_json: string | null;
  expected_result: string | null;
  day_offset: number;
  is_active: boolean;
  plan_id: number | null;
  plan_title: string | null;
  last_generated_for: string | null;
  instances_count: number;
  overdue_instances: number;
}

export const REGULARITY_LABEL: Record<string, string> = {
  daily: "Ежедневно",
  weekly: "Еженедельно",
  monthly: "Ежемесячно",
  quarterly: "Ежеквартально",
  yearly: "Ежегодно",
  event: "По событию",
  on_demand: "По требованию",
};

export const PERIODICITY_OPTIONS = [
  { value: "daily", label: "Ежедневно" },
  { value: "weekly", label: "Еженедельно" },
  { value: "monthly", label: "Ежемесячно" },
  { value: "quarterly", label: "Ежеквартально" },
  { value: "yearly", label: "Ежегодно" },
];

// ── Распределённая модель Центра ──────────────────────────────────────

export interface Participation {
  id: number;
  person_id: number;
  center_id: number;
  display_name: string;
  position_title: string | null;
  org_name: string | null;
  employment_type: string | null;
  total_hours_per_week: number | null;
  role_in_model: string | null;
  participation_format: string;
  format_title: string;
  center_hours_per_week: number | null;
  target_role_title: string | null;
  planned_transfer: boolean;
  resource_source: string;
  source_title: string;
  date_from: string | null;
  date_to: string | null;
  note: string | null;
  functions: {
    person_id: number;
    function_id: number;
    raci_role: string;
    is_backup: boolean;
    function_title: string;
    criticality: string;
  }[];
  center_plan_hours: number;
  center_fact_hours: number;
}

export interface UndocumentedPerson {
  person_id: number;
  display_name: string;
  position_title: string | null;
  org_name: string | null;
}

export interface TargetFunction {
  id: number;
  title: string;
  criticality: string;
  work_category: string;
  hours_per_month: number | null;
  target_role_count: number;
  current_owner: string | null;
  current_plan_hours: number;
  req_competencies: number;
  covered_now: boolean;
  covered_in_target: boolean;
  needs_new_position: boolean;
}

export interface TargetRole {
  id: number;
  title: string;
  headcount: number;
  hours_per_week: number | null;
  grade: string | null;
  person_id: number | null;
  person_name: string | null;
  status: string;
  justification: string | null;
  functions: { id: number; title: string }[];
}

export interface StaffingCategory {
  code: string;
  title: string;
  annual_hours: number;
  function_count: number;
  fte: number;
}

export interface StaffingCalculation {
  annual_fund_hours: number | string;
  reserve_pct: number | string;
  backup_coverage_pct: number | string;
  categories: StaffingCategory[];
  base_total_hours: number;
  reserve_hours: number;
  backup_hours: number;
  total_hours: number;
  required_fte: number;
  available_hours: number;
  available_fte: number;
  staffed_fte: number;
  deficit_fte: number;
  target_gap_fte: number;
}

export interface StatusQuoRisk {
  code: string;
  level: "high" | "medium" | "low";
  text: string;
}

export interface ModelData {
  center: Center | null;
  current_team: {
    participation: Participation[];
    undocumented: UndocumentedPerson[];
  };
  target: {
    roles: TargetRole[];
    functions: TargetFunction[];
  };
  staffing: StaffingCalculation;
  status_quo_risks: StatusQuoRisk[];
}