import { accessHeaders } from "./execAccess";

const BASE = "https://functions.poehali.dev/2846d4ff-d9bc-4e86-864a-adbeba8dabcf";

export interface DictValue {
  code: string;
  title: string;
  color: string | null;
}
export type Dictionaries = Record<string, DictValue[]>;

export interface Issue {
  level: "blocking" | "warning";
  code: string;
  title: string;
  detail: string;
  initiative_id?: number;
  decision_id?: number;
  stakeholder_id?: number;
}

export interface Initiative {
  id: number;
  code: string | null;
  title: string;
  summary: string | null;
  problem: string | null;
  goal: string | null;
  expected_result: string | null;
  status: string;
  stage: string | null;
  priority: string | null;
  scale: string | null;
  realization_form: string | null;
  plan_start: string | null;
  plan_end: string | null;
  fact_start: string | null;
  fact_end: string | null;
  solution_title: string | null;
  solution_type: string | null;
  effect_description: string | null;
  effect_metric: string | null;
  effect_baseline: string | null;
  effect_target: string | null;
  effect_actual: string | null;
  budget_need: string | null;
  budget_source: string | null;
  escalation_level: string | null;
  owner_name?: string | null;
  manager_name?: string | null;
  curator_name?: string | null;
  effect_owner_name?: string | null;
  owner_person_id: number | null;
  manager_person_id: number | null;
  curator_person_id: number | null;
  effect_owner_person_id: number | null;
  stakeholders_count?: number;
  open_decisions?: number;
  verification_status: string;
  is_test_data?: boolean;
  // Бюджетное планирование
  budget_year: number | null;
  budget_kind: "capex" | "opex" | null;
  budget_source_prev: string | null;
  budget_source_new: string | null;
  budget_amount: number | string | null;
  budget_status: string;
  budget_owner_person_id: number | null;
  budget_owner_name?: string | null;
  budget_materials_note: string | null;
  budget_due_date: string | null;
  budget_finance_comment: string | null;
  // Портфель и организационная принадлежность
  portfolio_id: number | null;
  portfolio_title?: string | null;
  customer_org_unit_id: number | null;
  customer_org_unit_name?: string | null;
  executor_org_unit_id: number | null;
  executor_org_unit_name?: string | null;
  external_code: string | null;
  cancel_reason: string | null;
  cancel_basis: string | null;
  cancelled_at: string | null;
  cancelled_by_person_id: number | null;
  cancelled_by_name?: string | null;
  source_note: string | null;
  source_ref: string | null;
  data_as_of: string | null;
  // Сводка для карточек списка (приходит только из action=initiatives)
  open_decision_requests?: number;
  next_milestone_title?: string | null;
  next_milestone_date?: string | null;
  top_risk_title?: string | null;
  top_risk_score?: number | null;
}

export interface Portfolio {
  id: number;
  code: string | null;
  title: string;
  description: string | null;
  owner_org_unit_id: number | null;
  owner_org_unit_name?: string | null;
  status: string;
  initiatives_count?: number;
}

export interface OrgUnit {
  id: number;
  code: string;
  name: string;
  type: string;
  parent_id: number | null;
  level: number;
}

export interface DecisionRequest {
  id: number;
  initiative_id: number;
  question: string;
  options: string | null;
  recommended_option: string | null;
  due_at: string | null;
  consequence_if_not_decided: string | null;
  prepared_by_person_id: number | null;
  prepared_by_name?: string | null;
  status: "open" | "decided" | "withdrawn";
  decided_option: string | null;
  decided_at: string | null;
  decided_by_person_id: number | null;
  decided_by_name?: string | null;
  source_note: string | null;
  verification_status: string;
  /** decision — управленческое решение (стратегический выбор);
   * data_clarification — уточнение исходных данных у владельца инициативы,
   * не является решением по существу инициативы. */
  question_type?: "decision" | "data_clarification";
}

export interface PlanProjectRef {
  id: number;
  title: string;
  progress_pct: number;
  plan_start: string | null;
  plan_end: string | null;
  forecast_end: string | null;
  overdue_task_count: number;
  overdue_milestone_count: number;
}

export interface InitiativeMilestoneRef {
  id: number;
  title: string;
  plan_date: string | null;
  status: string;
  days_left: number | null;
}

export interface InitiativeLabor {
  plan_hours: number | string;
  fact_hours: number | string;
  open_steps: number;
  overdue_steps: number;
}

export interface InitiativeFunctionRef {
  id: number;
  title: string;
  code: string | null;
  criticality: string;
}

export interface Stakeholder {
  id: number;
  initiative_id: number;
  person_id: number | null;
  display_name: string | null;
  position_title: string | null;
  org_name: string | null;
  role_in_initiative: string | null;
  formal_participation: number;
  can_decide: boolean;
  must_approve: boolean;
  can_block: boolean;
  controls_resource: boolean;
  participation_state: string;
  position_on_topic: string | null;
  confirmed_requirements: string | null;
  stated_remarks: string | null;
  support_conditions: string | null;
  open_questions: string | null;
  noninvolvement_risk: string;
  engagement_goal: string | null;
  key_messages: string | null;
  contact_format: string | null;
  contact_frequency: string | null;
  responsible_name?: string | null;
  responsible_person_id: number | null;
  next_action: string | null;
  next_action_due: string | null;
  engagement_status: string;
  initiative_title?: string;
  initiative_code?: string;
  is_overdue?: boolean;
  verification_status: string;
}

export interface Decision {
  id: number;
  initiative_id: number;
  decision_type_code: string;
  type_title: string;
  category: string | null;
  question: string;
  basis: string | null;
  raised_at: string | null;
  due_at: string | null;
  status: string;
  proposed_option: string | null;
  materials: string | null;
  final_decision: string | null;
  decided_by_name: string | null;
  body_title: string | null;
  decided_at: string | null;
  result_document: string | null;
  execution_status: string;
  escalation_level: string | null;
  initiative_title?: string;
  initiative_code?: string;
  is_overdue?: boolean;
  verification_status: string;
}

export interface Participation {
  id: number;
  decision_id: number;
  decision_type_code: string | null;
  role_code: string | null;
  role_title: string | null;
  display_name: string | null;
  participation_kind: string;
  is_mandatory: boolean;
  sequence_order: number;
}

export interface Dependency {
  id: number;
  predecessor_id: number;
  dependent_id: number;
  dependency_type: string;
  condition_text: string | null;
  is_mandatory: boolean;
  condition_met: boolean;
  predecessor_question: string;
  dependent_question: string;
}

export interface RoleTemplate {
  id: number;
  code: string;
  title: string;
  purpose: string | null;
  role_kind: string | null;
  duties: string | null;
  authorities: string | null;
  limitations: string | null;
  appointed_by: string | null;
  escalates_to: string | null;
  is_mandatory: boolean;
}

export interface RoleAssignment {
  id: number;
  initiative_id: number;
  role_code: string;
  role_title: string;
  display_name: string | null;
  position_title?: string | null;
  role_kind?: string | null;
  initiative_title?: string;
  date_from: string | null;
  date_to: string | null;
  status: string;
  verification_status: string;
}

export interface PersonRef {
  id: number;
  display_name: string;
  position_title: string | null;
  org_name: string | null;
}

export interface RefsData {
  persons: PersonRef[];
  decision_types: { code: string; title: string; category: string; stage: string }[];
  bodies: { id: number; title: string }[];
  initiatives: { id: number; code: string | null; title: string }[];
  org_units: OrgUnit[];
  portfolios: { id: number; code: string | null; title: string }[];
  dictionaries: Dictionaries;
}

export interface AuditEntry {
  id: number;
  entity_type: string;
  entity_id: number;
  action: string;
  actor: string | null;
  after_json: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
  subject_title: string | null;
  subject_detail: string | null;
}

export interface AuditData {
  items: AuditEntry[];
  by_entity: { entity_type: string; cnt: number }[];
  metrics: { total: number; today: number; actors: number };
}

export interface FocusData {
  metrics: {
    initiatives_total: number;
    initiatives_no_owner: number;
    initiatives_no_effect_owner: number;
    decisions_open: number;
    decisions_overdue: number;
    actions_overdue: number;
    stakeholders_total: number;
  };
  initiatives: Initiative[];
  pending_decisions: Decision[];
  stakeholder_actions: Stakeholder[];
  escalations: Decision[];
  group_agenda: Decision[];
  issues: Issue[];
  dictionaries: Dictionaries;
}

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
  if (!res.ok || !data.ok) {
    throw new Error(data?.error?.message || "Ошибка загрузки данных");
  }
  return data.data;
}

export const execApi = {
  focus: (): Promise<FocusData> => req("/?action=focus"),

  initiatives: (): Promise<{ items: Initiative[]; dictionaries: Dictionaries }> =>
    req("/?action=initiatives"),

  initiative: (
    id: number,
  ): Promise<{
    initiative: Initiative;
    stakeholders: Stakeholder[];
    decisions: Decision[];
    assignments: RoleAssignment[];
    next_milestone: InitiativeMilestoneRef | null;
    issue_stats: { open_issues: number; blocking_issues: number };
    risk_stats: { open_risks: number; high_risks: number };
    labor: InitiativeLabor;
    functions: InitiativeFunctionRef[];
    action_stats: { open_actions: number; overdue_actions: number };
    decision_requests: DecisionRequest[];
    plan_project: PlanProjectRef | null;
    dictionaries: Dictionaries;
  }> => req(`/?action=initiative&id=${id}`),

  portfolios: (): Promise<{ items: Portfolio[] }> => req("/?action=portfolios"),

  orgUnits: (): Promise<{ items: OrgUnit[] }> => req("/?action=org_units"),

  stakeholders: (): Promise<{ items: Stakeholder[]; dictionaries: Dictionaries }> =>
    req("/?action=stakeholders"),

  decisions: (): Promise<{
    items: Decision[];
    participation: Participation[];
    dependencies: Dependency[];
    dictionaries: Dictionaries;
  }> => req("/?action=decisions"),

  authorityMatrix: (): Promise<{
    types: { code: string; title: string; category: string; stage: string }[];
    roles: { code: string; title: string; role_kind: string }[];
    cells: {
      decision_type_code: string;
      role_code: string;
      participation_kind: string;
      initiative_id: number;
    }[];
    dictionaries: Dictionaries;
  }> => req("/?action=authority_matrix"),

  roles: (): Promise<{ roles: RoleTemplate[]; assignments: RoleAssignment[] }> =>
    req("/?action=roles"),

  diagnostics: (): Promise<{ issues: Issue[] }> => req("/?action=diagnostics"),

  persons: (): Promise<{ items: { id: number; display_name: string; position_title: string; org_name: string }[] }> =>
    req("/?action=persons"),

  refs: (): Promise<RefsData> => req("/?action=refs"),

  createPerson: (payload: {
    display_name: string;
    position_title?: string;
    org_name?: string;
  }): Promise<{ id: number }> =>
    req("/?action=create_person", { method: "POST", body: JSON.stringify(payload) }),

  saveAssignment: (payload: Record<string, unknown>): Promise<{ id: number }> =>
    req("/?action=save_assignment", { method: "POST", body: JSON.stringify(payload) }),

  setVerification: (payload: {
    entity: "initiative" | "stakeholder" | "decision" | "role_assignment";
    id: number;
    verification_status: string;
    reason?: string;
  }): Promise<{ id: number; verification_status: string }> =>
    req("/?action=set_verification", { method: "POST", body: JSON.stringify(payload) }),

  saveInitiative: (payload: Record<string, unknown>): Promise<{ id: number }> =>
    req("/?action=save_initiative", { method: "POST", body: JSON.stringify(payload) }),

  saveStakeholder: (payload: Record<string, unknown>): Promise<{ id: number }> =>
    req("/?action=save_stakeholder", { method: "POST", body: JSON.stringify(payload) }),

  saveDecision: (payload: Record<string, unknown>): Promise<{ id: number }> =>
    req("/?action=save_decision", { method: "POST", body: JSON.stringify(payload) }),

  saveDecisionRequest: (payload: Record<string, unknown>): Promise<{ id: number }> =>
    req("/?action=save_decision_request", { method: "POST", body: JSON.stringify(payload) }),

  auditLog: (entity = "", limit = 200): Promise<AuditData> =>
    req(`/?action=audit_log&limit=${limit}${entity ? `&entity=${entity}` : ""}`),

  myDay: (): Promise<MyDayData> => req("/?action=my_day"),

  portfolioSummary: (): Promise<PortfolioSummary> => req("/?action=portfolio_summary"),
};

export interface MyDayData {
  me_person_id: number | null;
  recent_initiatives: {
    id: number;
    title: string;
    status: string;
    priority: string | null;
    updated_at: string;
    owner_name: string | null;
  }[];
  my_actions: {
    id: number;
    title: string | null;
    description: string | null;
    due_at: string | null;
    status: string;
    priority: string;
    initiative_title: string | null;
    is_overdue: boolean;
  }[];
  incoming_actions: {
    id: number;
    title: string | null;
    description: string | null;
    responsible_person_id: number | null;
    responsible_name: string | null;
    status: string;
    due_at: string | null;
  }[];
  upcoming_meetings: {
    id: number;
    title: string;
    meeting_at: string;
    location: string | null;
  }[];
}

export interface PortfolioSummary {
  by_status: { status: string; cnt: number }[];
  by_budget_status: { budget_status: string; cnt: number; amount: number | string }[];
  flags: {
    active_total: number;
    no_owner: number;
    no_next_step: number;
    overdue_milestone: number;
    needs_decision: number;
    budget_not_ready: number;
  };
}

export const BUDGET_STATUS_LABEL: Record<string, { title: string; cls: string }> = {
  not_started: { title: "Не начата", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  in_progress: { title: "В проработке", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  submitted: { title: "Подана", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  approved: { title: "Утверждена", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { title: "Отклонена", cls: "bg-red-50 text-red-700 border-red-200" },
  not_required: { title: "Не требуется", cls: "bg-slate-50 text-slate-400 border-slate-200" },
};

export const BUDGET_KIND_LABEL: Record<string, string> = {
  capex: "Инвестиционный (CAPEX)",
  opex: "Текущие расходы (OPEX)",
};

export function dictTitle(dicts: Dictionaries, type: string, code: string | null): string {
  if (!code) return "—";
  return dicts[type]?.find((v) => v.code === code)?.title || code;
}

export function dictColor(dicts: Dictionaries, type: string, code: string | null): string {
  const c = code ? dicts[type]?.find((v) => v.code === code)?.color : null;
  const map: Record<string, string> = {
    red: "bg-red-500/15 text-red-300 border-red-500/30",
    orange: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    green: "bg-green-500/15 text-green-300 border-green-500/30",
    emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    blue: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    indigo: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    purple: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    cyan: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
    gray: "bg-gray-500/15 text-gray-400 border-gray-600/30",
  };
  return map[c || "gray"] || map.gray;
}

export const PARTICIPATION_LETTERS: Record<string, { letter: string; title: string }> = {
  initiate: { letter: "И", title: "Инициирует" },
  prepare: { letter: "Г", title: "Готовит материалы" },
  inform_provide: { letter: "В", title: "Предоставляет информацию" },
  recommend: { letter: "Р", title: "Рекомендует" },
  approve: { letter: "С", title: "Согласовывает" },
  decide: { letter: "П", title: "Принимает решение" },
  execute: { letter: "ИС", title: "Исполняет" },
  control: { letter: "К", title: "Контролирует" },
  notify: { letter: "У", title: "Уведомляется" },
};