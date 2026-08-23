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
  proposed: { title: "На согласовании", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  approved: { title: "Утверждён", cls: "bg-violet-100 text-violet-700 border-violet-200" },
  active: { title: "Работает", cls: "bg-green-50 text-green-700 border-green-200" },
  archived: { title: "Архив", cls: "bg-slate-100 text-slate-500 border-slate-200" },
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
};
