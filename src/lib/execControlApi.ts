import { CabinetAccess, accessHeaders } from "./execAccess";

const BASE = "https://functions.poehali.dev/662c8b92-fe3c-4b24-b1ee-50765f111ea4";

export interface Milestone {
  id: number;
  initiative_id: number;
  initiative_title?: string;
  title: string;
  milestone_type: string | null;
  plan_date_original: string | null;
  plan_date: string | null;
  fact_date: string | null;
  status: string;
  is_overdue: boolean;
  days_left: number | null;
  responsible_person_id: number | null;
  responsible_name: string | null;
  depends_on_milestone_id: number | null;
  depends_on_title: string | null;
  decision_id: number | null;
  decision_question: string | null;
  achievement_criteria: string | null;
  achievement_evidence: string | null;
  confirmed_by_person_id: number | null;
  confirmed_by_name: string | null;
  reschedule_reason: string | null;
  reschedule_approved_by: string | null;
  reschedule_count: number;
  comment: string | null;
  verification_status: string;
}

export interface Issue {
  id: number;
  initiative_id: number;
  initiative_title?: string;
  title: string;
  description: string | null;
  detected_at: string | null;
  category: string | null;
  criticality: string;
  criticality_auto_raised: boolean;
  impact_deadline: boolean;
  impact_result: boolean;
  impact_cost: boolean;
  impact_quality: boolean;
  impact_compliance: boolean;
  root_cause: string | null;
  owner_person_id: number | null;
  owner_name: string | null;
  responsible_person_id: number | null;
  responsible_name: string | null;
  action_plan: string | null;
  due_at: string | null;
  status: string;
  resolution_criteria: string | null;
  resolution_result: string | null;
  resolved_at: string | null;
  resolved_confirmed_by_person_id: number | null;
  resolved_confirmed_by_name: string | null;
  needs_escalation: boolean;
  escalation_level: string | null;
  is_blocking: boolean;
  block_what: string | null;
  block_since: string | null;
  block_who_can_lift: string | null;
  block_requirements: string | null;
  block_escalation_level: string | null;
  block_deadline: string | null;
  block_status: string | null;
  block_lifted_at: string | null;
  block_lifted_by: string | null;
  block_lift_result: string | null;
  block_active: boolean;
  is_overdue: boolean;
  actions_count: number;
  escalations_count: number;
  verification_status: string;
}

export interface Risk {
  id: number;
  initiative_id: number;
  initiative_title?: string;
  description: string;
  cause: string | null;
  consequence: string | null;
  probability: number;
  impact: number;
  risk_score: number;
  risk_level: string;
  trigger_indicator: string | null;
  owner_person_id: number | null;
  owner_name: string | null;
  preventive_measures: string | null;
  response_plan: string | null;
  detected_at: string | null;
  last_assessed_at: string | null;
  assessed_by_person_id: number | null;
  assessed_by_name: string | null;
  next_review_at: string | null;
  review_overdue: boolean;
  status: string;
  materialized_issue_id: number | null;
  materialized_issue_title: string | null;
  is_blocking: boolean;
  block_what: string | null;
  block_since: string | null;
  block_who_can_lift: string | null;
  block_requirements: string | null;
  block_escalation_level: string | null;
  block_deadline: string | null;
  block_status: string | null;
  block_active: boolean;
  actions_count: number;
  verification_status: string;
}

export interface ControlAction {
  id: number;
  issue_id: number | null;
  risk_id: number | null;
  issue_title: string | null;
  risk_description: string | null;
  description: string;
  responsible_person_id: number | null;
  responsible_name: string | null;
  start_date: string | null;
  due_at: string | null;
  fact_date: string | null;
  status: string;
  completion_criteria: string | null;
  result: string | null;
  result_confirmed_by_name: string | null;
  delay_reason: string | null;
  decision_id: number | null;
  decision_question: string | null;
  is_overdue: boolean;
}

export interface Escalation {
  id: number;
  issue_id: number | null;
  risk_id: number | null;
  issue_title: string | null;
  risk_description: string | null;
  level_code: string;
  passed_at: string;
  reason: string | null;
  prepared_by_name: string | null;
  passed_to_name: string | null;
  body_title: string | null;
  review_due_at: string | null;
  decision_text: string | null;
  decided_at: string | null;
  result: string | null;
  decision_id: number | null;
  decision_question: string | null;
  status: string;
  is_overdue: boolean;
}

export interface ControlFocus {
  metrics: {
    critical_issues: number;
    blockers: number;
    overdue_milestones: number;
    upcoming_milestones: number;
    high_risks: number;
    open_escalations: number;
  };
  critical_issues: {
    id: number;
    title: string;
    criticality: string;
    due_at: string | null;
    initiative_id: number;
    initiative_title: string;
    is_overdue: boolean;
  }[];
  blockers: {
    id: number;
    kind: string;
    subject: string;
    block_what: string;
    block_deadline: string | null;
    initiative_id: number;
    initiative_title: string;
    is_overdue: boolean;
  }[];
  upcoming_milestones: {
    id: number;
    title: string;
    plan_date: string;
    milestone_type: string | null;
    initiative_id: number;
    initiative_title: string;
    days_left: number;
  }[];
  overdue_milestones: {
    id: number;
    title: string;
    plan_date: string;
    plan_date_original: string | null;
    initiative_id: number;
    initiative_title: string;
    days_overdue: number;
  }[];
  high_risks: {
    id: number;
    description: string;
    risk_score: number;
    risk_level: string;
    next_review_at: string | null;
    initiative_id: number;
    initiative_title: string;
  }[];
  group_agenda: {
    id: number;
    question: string;
    due_at: string | null;
    review_target_date: string | null;
    initiative_id: number;
    initiative_title: string;
    body_title: string | null;
  }[];
  my_escalations: {
    id: number;
    level_code: string;
    passed_at: string;
    review_due_at: string | null;
    status: string;
    reason: string | null;
    subject: string;
    initiative_id: number;
    initiative_title: string;
    is_overdue: boolean;
  }[];
  stalled_initiatives: {
    id: number;
    title: string;
    reasons: string[];
    computed_next: { source: string; text: string; due: string } | null;
  }[];
}

let lastWarning: string | null = null;

export function takeWarning(): string | null {
  const w = lastWarning;
  lastWarning = null;
  return w;
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
  if (!res.ok || !data.ok) throw new Error(data?.error?.message || "Ошибка загрузки данных");
  lastWarning = data.warning || null;
  return data.data;
}

export interface DemoStats {
  milestones: number;
  issues: number;
  risks: number;
  actions: number;
  escalations: number;
  real_milestones: number;
  real_issues: number;
  real_risks: number;
}

export const controlApi = {
  whoami: (): Promise<CabinetAccess> => req("/?action=whoami"),

  focus: (): Promise<ControlFocus> => req("/?action=control_focus"),

  all: (
    initiativeId?: number,
  ): Promise<{
    milestones: Milestone[];
    issues: Issue[];
    risks: Risk[];
    actions: ControlAction[];
    escalations: Escalation[];
    access: CabinetAccess;
  }> => req(`/?action=all${initiativeId ? `&initiative_id=${initiativeId}` : ""}`),

  demoStats: (): Promise<DemoStats> => req("/?action=demo_stats"),

  clearDemo: (): Promise<{ deleted: Record<string, number> }> =>
    req("/?action=clear_demo", {
      method: "POST",
      body: JSON.stringify({ confirm: "УДАЛИТЬ ДЕМОДАННЫЕ" }),
    }),

  saveMilestone: (p: Record<string, unknown>): Promise<{ id: number }> =>
    req("/?action=save_milestone", { method: "POST", body: JSON.stringify(p) }),

  saveIssue: (p: Record<string, unknown>): Promise<{ id: number }> =>
    req("/?action=save_issue", { method: "POST", body: JSON.stringify(p) }),

  saveRisk: (p: Record<string, unknown>): Promise<{ id: number }> =>
    req("/?action=save_risk", { method: "POST", body: JSON.stringify(p) }),

  saveAction: (p: Record<string, unknown>): Promise<{ id: number }> =>
    req("/?action=save_action", { method: "POST", body: JSON.stringify(p) }),

  saveEscalation: (p: Record<string, unknown>): Promise<{ id: number }> =>
    req("/?action=save_escalation", { method: "POST", body: JSON.stringify(p) }),

  liftBlock: (p: {
    kind: "issue" | "risk";
    id: number;
    block_lifted_at: string;
    block_lift_result: string;
  }): Promise<{ id: number }> =>
    req("/?action=lift_block", { method: "POST", body: JSON.stringify(p) }),

  setNextAction: (p: Record<string, unknown>): Promise<{ id: number }> =>
    req("/?action=set_next_action", { method: "POST", body: JSON.stringify(p) }),
};

export const RISK_LEVEL_LABEL: Record<string, { title: string; cls: string }> = {
  low: { title: "Низкий", cls: "bg-green-500/15 text-green-300 border-green-500/30" },
  medium: { title: "Средний", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  high: { title: "Высокий", cls: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  critical: { title: "Критический", cls: "bg-red-500/15 text-red-300 border-red-500/30" },
};

export const CRITICALITY_LABEL: Record<string, { title: string; cls: string }> = {
  low: { title: "Низкая", cls: "bg-gray-500/15 text-gray-400 border-gray-600/30" },
  medium: { title: "Средняя", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  high: { title: "Высокая", cls: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  critical: { title: "Критическая", cls: "bg-red-500/15 text-red-300 border-red-500/30" },
};

export const ISSUE_STATUS_LABEL: Record<string, string> = {
  open: "Открыта",
  in_progress: "В работе",
  awaiting_decision: "Ожидает решения",
  resolved: "Устранена",
  closed: "Закрыта",
  irrelevant: "Неактуальна",
};

export const MILESTONE_STATUS_LABEL: Record<string, string> = {
  not_started: "Не начато",
  in_progress: "В работе",
  achieved: "Достигнуто",
  cancelled: "Отменено",
};

export const RISK_STATUS_LABEL: Record<string, string> = {
  active: "Активен",
  mitigated: "Снижен",
  accepted: "Принят",
  materialized: "Реализовался",
  closed: "Закрыт",
  irrelevant: "Неактуален",
};

export const ACTION_STATUS_LABEL: Record<string, string> = {
  not_started: "Не начато",
  in_progress: "В работе",
  done: "Выполнено",
  cancelled: "Отменено",
  needs_review: "Требует пересмотра",
};

export const ESCALATION_STATUS_LABEL: Record<string, string> = {
  sent: "Передано",
  in_review: "На рассмотрении",
  decided: "Решение принято",
  returned: "Возвращено",
  closed: "Закрыто",
};

export const ESCALATION_LEVELS = [
  { code: "team", title: "Команда инициативы" },
  { code: "manager", title: "Руководитель инициативы" },
  { code: "owner", title: "Владелец инициативы" },
  { code: "group", title: "Группа сопровождения" },
  { code: "block", title: "Руководитель Блока" },
  { code: "corporate", title: "Иной уполномоченный орган" },
];

export const MILESTONE_TYPES = [
  { code: "decision", title: "Решение" },
  { code: "document", title: "Документ" },
  { code: "approval", title: "Согласование" },
  { code: "development", title: "Разработка" },
  { code: "pilot", title: "Пилот" },
  { code: "rollout", title: "Внедрение" },
  { code: "result", title: "Результат" },
  { code: "other", title: "Иное" },
];

export const ISSUE_CATEGORIES = [
  { code: "organizational", title: "Организационная" },
  { code: "resource", title: "Ресурсная" },
  { code: "technological", title: "Технологическая" },
  { code: "methodological", title: "Методологическая" },
  { code: "legal", title: "Правовая" },
  { code: "cross_functional", title: "Межфункциональная" },
  { code: "other", title: "Иная" },
];