import { accessHeaders } from "./execAccess";

const BASE = "https://functions.poehali.dev/de1ac45d-0eee-4870-b78f-ceb7ef6dea28";

export interface TeamMember {
  id: number;
  display_name: string;
  position_title: string | null;
  org_name: string | null;
  email: string | null;
  phone: string | null;
  employment_type: string | null;
  employment_status: string;
  record_state: string | null;
  is_external: boolean;
  note: string | null;
  hours_per_week: number | null;
  fte: number | null;
  work_schedule: string | null;
  competency_count: number;
  owned_functions: number;
  open_steps: number;
  overdue_steps: number;
  done_steps: number;
  fact_hours_total: number;
  function_ids: number[];
  initiative_ids: number[];
  competency_ids: number[];
  competency_names: string;
}

export interface PersonCompetency {
  id: number;
  person_id: number;
  competency_id: number;
  competency_name: string;
  competency_code: string | null;
  domain_name: string | null;
  current_level: number;
  target_level: number | null;
  assessed_at: string;
  valid_until: string | null;
  evidence_type: string;
  evidence_ref: string | null;
  evidence_comment: string | null;
  confirmed_by_person_id: number | null;
  confirmed_by_name: string | null;
  confirmed_at: string | null;
}

export interface PersonCapacity {
  id: number;
  person_id: number;
  valid_from: string;
  valid_to: string | null;
  hours_per_week: number;
  fte: number;
  work_schedule: string;
  note: string | null;
}

export interface PersonAbsence {
  id: number;
  person_id: number;
  absence_type: string;
  date_from: string;
  date_to: string;
  hours_per_day: number | null;
  approved_by: string | null;
  comment: string | null;
}

export interface ProfileRecord {
  id: number;
  person_id: number;
  record_type: string;
  title: string;
  organization: string | null;
  description: string | null;
  date_from: string | null;
  date_to: string | null;
  competency_id: number | null;
  competency_name: string | null;
  document_ref: string | null;
}

export interface PersonFunction {
  id: number;
  function_id: number;
  function_title: string;
  function_code: string | null;
  raci_role: string;
  is_backup: boolean;
  valid_from: string;
  valid_to: string | null;
  criticality: string;
  center_id: number | null;
}

export interface PersonStep {
  id: number;
  title: string;
  status: string;
  step_type: string;
  is_control_point: boolean;
  start_date: string | null;
  due_date: string | null;
  estimate_hours: number | null;
  progress_pct: number | null;
  assignee_id: number;
  raci_role: string;
  plan_hours: number | null;
  workload_pct: number | null;
  plan_title: string | null;
  plan_id: number | null;
  initiative_id: number | null;
  initiative_title: string | null;
  fact_hours: number;
  is_overdue: boolean;
}

export interface TimeEntry {
  id: number;
  person_id: number;
  step_id: number;
  step_title?: string;
  display_name?: string;
  work_date: string;
  hours: number;
  comment: string | null;
  source: string;
  status: string;
}

export interface PersonDetail extends TeamMember {
  competencies: PersonCompetency[];
  capacity: PersonCapacity[];
  absences: PersonAbsence[];
  profile_records: ProfileRecord[];
  functions: PersonFunction[];
  steps: PersonStep[];
  time_entries: TimeEntry[];
  role_assignments: Record<string, unknown>[];
}

export interface WorkloadRow {
  person_id: number;
  display_name: string;
  position_title: string | null;
  week_start: string;
  capacity_hours: number;
  planned_hours: number;
  load_pct: number | null;
  state: "free" | "normal" | "overload" | "unknown";
  absence_type?: string;
  absence_days?: number;
}

export interface WorkloadData {
  rows: WorkloadRow[];
  thresholds: { low: number; high: number };
  calendar_missing_days: number;
  calendar_confirmed_year: number;
  calendar_provisional: boolean;
  date_from: string;
  date_to: string;
}

export interface WeekDetailRow {
  step_id: number;
  title: string;
  status: string;
  due_date: string | null;
  start_date: string | null;
  assignee_id: number;
  raci_role: string;
  plan_hours: number | null;
  plan_title: string | null;
  initiative_title: string | null;
  function_title: string | null;
  week_hours: number;
  is_manual: boolean;
  fact_hours: number;
}

export interface StepAssignee {
  id: number;
  step_id: number;
  person_id: number;
  display_name: string;
  position_title: string | null;
  raci_role: string;
  role_in_step: string | null;
  plan_hours: number | null;
  workload_pct: number | null;
  valid_from: string | null;
  valid_to: string | null;
  fact_hours: number;
}

export interface AssigneeWeek {
  id: number;
  assignee_id: number;
  person_id: number;
  week_start: string;
  hours: number;
  is_manual: boolean;
}

export interface DiagItem {
  code: string;
  level: "error" | "warning" | "info";
  entity: string;
  entity_id: number | null;
  title: string;
  message: string;
  object_kind?: ObjectKind;
}

export type ObjectKind = "task" | "stage" | "control_point";

export interface StepInfo {
  id: number;
  title: string;
  status: string;
  step_type: string;
  is_control_point: boolean;
  due_date: string | null;
  start_date: string | null;
  estimate_hours: number | null;
  parent_step_id: number | null;
  parent_title: string | null;
  plan_title: string | null;
  plan_id: number | null;
  initiative_title: string | null;
  initiative_id: number | null;
  milestone_title: string | null;
  child_count: number;
  owner_name: string | null;
  has_owner: boolean;
  assigned_hours: number;
  fact_hours: number;
  object_kind: ObjectKind;
  object_kind_title: string;
}

export type UnassignedStep = StepInfo;

export interface StepSummary {
  estimate_hours: number | null;
  assigned_hours: number;
  fact_hours: number;
  variance: number;
  hours_mismatch: boolean;
  children_estimate: number | null;
  children_fact: number | null;
}

export interface PrevOwner {
  assignee_id: number;
  person_id: number;
  display_name: string;
  fact_hours: number;
}

export const OBJECT_KIND: Record<ObjectKind, { title: string; icon: string; cls: string; needsHours: boolean }> = {
  task: {
    title: "Задача",
    icon: "SquareCheck",
    cls: "bg-slate-100 text-slate-600 border-slate-200",
    needsHours: true,
  },
  stage: {
    title: "Этап",
    icon: "Layers",
    cls: "bg-blue-50 text-blue-700 border-blue-200",
    needsHours: false,
  },
  control_point: {
    title: "Контрольная точка",
    icon: "Flag",
    cls: "bg-violet-50 text-violet-700 border-violet-200",
    needsHours: false,
  },
};

export const DIAG_CODE: Record<string, { title: string; hint: string }> = {
  S01: { title: "Без ответственного", hint: "Не назначен сотрудник с ролью A" },
  S02: { title: "Без срока", hint: "Не указана дата завершения" },
  S03: { title: "Без трудоёмкости", hint: "Только задачи: у этапов часы из дочерних" },
  S04: { title: "Часы не сходятся", hint: "Сумма часов исполнителей ≠ трудоёмкость" },
  P01: { title: "Без рабочей ёмкости", hint: "Не задано, сколько часов в неделю доступно" },
  P02: { title: "Требуется переподтверждение", hint: "Истёк срок действия компетенции" },
  P03: { title: "Профиль не заполнен", hint: "Компетенции ещё не внесены" },
  P04: { title: "Перегрузка", hint: "План превышает доступную ёмкость" },
  F01: { title: "Функция без владельца", hint: "Не назначена роль A" },
  F02: { title: "Критичная без замены", hint: "Нет замещающего сотрудника" },
  F03: { title: "Требования не заданы", hint: "Компетенции функции не описаны" },
  C01: { title: "Календарь неполный", hint: "Заполнен меньше чем на квартал" },
  C02: { title: "Календарь предварительный", hint: "Переносы выходных не утверждены" },
};

export interface PeopleRefs {
  competencies: { id: number; code: string | null; name: string; domain_name: string | null }[];
  functions: { id: number; title: string; code: string | null; center_id: number | null; center_title: string | null }[];
  initiatives: { id: number; title: string }[];
  steps: { id: number; title: string; status: string; due_date: string | null; step_type: string; plan_title: string | null }[];
  persons: { id: number; display_name: string; position_title: string | null }[];
}

export const RACI_ROLE: Record<string, { title: string; short: string; cls: string }> = {
  A: { title: "Ответственный", short: "A", cls: "bg-violet-100 text-violet-700 border-violet-300" },
  R: { title: "Исполнитель", short: "R", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  C: { title: "Консультант", short: "C", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  I: { title: "Информируется", short: "I", cls: "bg-slate-100 text-slate-600 border-slate-200" },
};

export const LOAD_STATE: Record<string, { title: string; cls: string; bar: string }> = {
  free: { title: "Резерв", cls: "bg-slate-100 text-slate-600 border-slate-200", bar: "bg-slate-300" },
  normal: { title: "Норма", cls: "bg-green-50 text-green-700 border-green-200", bar: "bg-green-500" },
  overload: { title: "Перегрузка", cls: "bg-red-50 text-red-700 border-red-200", bar: "bg-red-500" },
  unknown: { title: "Нет данных", cls: "bg-slate-50 text-slate-400 border-slate-200", bar: "bg-slate-200" },
};

export const ABSENCE_TYPE: Record<string, { title: string; cls: string }> = {
  vacation: { title: "Отпуск", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  sick: { title: "Больничный", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  trip: { title: "Командировка", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  training: { title: "Обучение", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  other: { title: "Другое", cls: "bg-slate-100 text-slate-600 border-slate-200" },
};

export const EVIDENCE_TYPE: Record<string, string> = {
  experience: "Опыт работы",
  project: "Проект",
  certificate: "Сертификат",
  manager_review: "Оценка руководителя",
  training: "Обучение",
  self: "Самооценка",
};

export const RECORD_TYPE: Record<string, { title: string; icon: string }> = {
  experience: { title: "Опыт работы", icon: "Briefcase" },
  education: { title: "Образование", icon: "GraduationCap" },
  certificate: { title: "Сертификат", icon: "Award" },
  tool: { title: "Инструмент", icon: "Wrench" },
};

export const EMPLOYMENT_TYPE: Record<string, string> = {
  staff: "Штат",
  parttime: "Совместитель",
  contract: "Подряд",
  intern: "Стажёр",
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

export const peopleApi = {
  people: (q?: string): Promise<TeamMember[]> =>
    req(`/?action=people${q ? `&q=${encodeURIComponent(q)}` : ""}`),

  person: (id: number): Promise<PersonDetail> => req(`/?action=person&id=${id}`),

  refs: (): Promise<PeopleRefs> => req("/?action=refs"),

  savePerson: (data: Record<string, unknown>): Promise<{ id?: number; needs_confirmation?: boolean; duplicates?: TeamMember[] }> =>
    post("save_person", data),

  saveCompetency: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("save_competency", data),

  deleteCompetency: (id: number) => post("delete_competency", { id }),

  saveCapacity: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("save_capacity", data),

  saveAbsence: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("save_absence", data),

  deleteAbsence: (id: number) => post("delete_absence", { id }),

  saveProfileRecord: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("save_profile_record", data),

  deleteProfileRecord: (id: number) => post("delete_profile_record", { id }),

  mergePerson: (sourceId: number, targetId: number) =>
    post("merge_person", { source_id: sourceId, target_id: targetId }),

  workload: (dateFrom: string, dateTo: string, personIds?: number[]): Promise<WorkloadData> =>
    post("workload", { date_from: dateFrom, date_to: dateTo, person_ids: personIds || [] }),

  weekDetail: (personId: number, weekStart: string): Promise<WeekDetailRow[]> =>
    req(`/?action=week_detail&person_id=${personId}&week_start=${weekStart}`),

  stepAssignees: (stepId: number): Promise<{
    assignees: StepAssignee[];
    weeks: AssigneeWeek[];
    time_entries: TimeEntry[];
    step: StepInfo;
    summary: StepSummary;
  }> => req(`/?action=step_assignees&step_id=${stepId}`),

  saveAssignee: (
    data: Record<string, unknown>,
  ): Promise<{ id?: number; needs_decision?: boolean; previous_owner?: PrevOwner }> =>
    post("save_assignee", data),

  removeAssignee: (id: number) => post("remove_assignee", { id }),

  saveAssigneeWeeks: (assigneeId: number, weeks: { week_start: string; hours: number }[]) =>
    post("save_assignee_weeks", { assignee_id: assigneeId, weeks }),

  saveTimeEntry: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("save_time_entry", data),

  deleteTimeEntry: (id: number) => post("delete_time_entry", { id }),

  bulkAssign: (data: Record<string, unknown>): Promise<{
    updated: number;
    by_kind: Record<string, number>;
    remaining_without_owner: number;
  }> => post("bulk_assign", data),

  diagDetail: (code: string): Promise<StepInfo[]> =>
    req(`/?action=diag_detail&code=${code}`),

  unassignedSteps: (): Promise<UnassignedStep[]> => req("/?action=unassigned_steps"),

  diagnostics: (): Promise<DiagItem[]> => req("/?action=diagnostics"),
};

/** Понедельник недели для даты */
export function weekStart(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : new Date(d);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date.toISOString().slice(0, 10);
}

/** Список понедельников в диапазоне */
export function weekRange(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = new Date(weekStart(from));
  const end = new Date(to);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 7);
  }
  return out;
}

export function fmtWeek(w: string): string {
  const d = new Date(w);
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const m = (x: Date) => x.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
  return `${m(d)} — ${m(end)}`;
}

export function fmtWeekShort(w: string): string {
  const d = new Date(w);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}
