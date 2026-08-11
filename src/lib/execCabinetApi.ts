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
    dictionaries: Dictionaries;
  }> => req(`/?action=initiative&id=${id}`),

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

  auditLog: (entity = "", limit = 200): Promise<AuditData> =>
    req(`/?action=audit_log&limit=${limit}${entity ? `&entity=${entity}` : ""}`),
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