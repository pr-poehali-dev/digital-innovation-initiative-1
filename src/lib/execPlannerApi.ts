import { accessHeaders } from "./execAccess";

const BASE = "https://functions.poehali.dev/b27c77a4-02b7-4462-801e-a9ef07c36f4e";
// AI-генерация вынесена отдельно: обращение к нейросети длится десятки секунд
const AI_BASE = "https://functions.poehali.dev/e1162707-6119-4ac4-b99a-32d4113db505";

export interface PlanAssignee {
  id: number;
  step_id: number;
  person_id: number;
  display_name: string;
  position_title: string | null;
  role_in_step: string | null;
  workload_pct: number | null;
  raci_role?: string;
  plan_hours?: number | null;
}

export interface PlanStep {
  id: number;
  plan_id: number;
  parent_step_id: number | null;
  title: string;
  description: string | null;
  step_type: string;
  status: string;
  start_date: string | null;
  due_date: string | null;
  fact_date: string | null;
  responsible_person_id: number | null;
  responsible_name: string | null;
  responsible_position: string | null;
  depends_on_step_id: number | null;
  depends_on_title: string | null;
  is_milestone: boolean;
  progress_pct: number;
  workload_pct: number | null;
  estimate_hours: number | null;
  fact_hours: number | null;
  sort_order: number;
  result_criteria: string | null;
  result_evidence: string | null;
  note: string | null;
  is_overdue: boolean;
  assignees: PlanAssignee[];
}

export interface Plan {
  id: number;
  title: string;
  goal: string | null;
  initiative_id: number | null;
  initiative_title: string | null;
  owner_person_id: number | null;
  owner_name: string | null;
  start_date: string | null;
  due_date: string | null;
  status: string;
  priority: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  steps_total?: number;
  steps_done?: number;
  steps_overdue?: number;
  steps?: PlanStep[];
}

export interface PersonRef {
  id: number;
  display_name: string;
  position_title: string | null;
  org_name: string | null;
}

export interface InitiativeRef {
  id: number;
  title: string;
  code: string | null;
}

export interface PlannerRefs {
  persons: PersonRef[];
  initiatives: InitiativeRef[];
}

export interface ResourceLoad {
  person_id: number;
  display_name: string;
  position_title: string | null;
  active_steps: number;
  total_steps: number;
  done_steps: number;
  in_progress_steps: number;
  blocked_steps: number;
  total_workload: number;
  overdue_steps: number;
  plan_hours: number;
  fact_hours: number;
  open_hours: number;
  unestimated_steps: number;
}

export interface LaborSummary {
  steps: number;
  estimated_steps: number;
  plan_hours: number;
  fact_hours: number;
  done_plan_hours: number;
  done_fact_hours: number;
  left_hours: number;
  unassigned_steps: number;
}

export const PLAN_STATUS: Record<string, { title: string; cls: string }> = {
  draft:     { title: "Черновик",  cls: "bg-slate-100 text-slate-600 border-slate-200" },
  active:    { title: "В работе",  cls: "bg-violet-100 text-violet-700 border-violet-200" },
  on_hold:   { title: "На паузе",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
  done:      { title: "Завершён",  cls: "bg-green-50 text-green-700 border-green-200" },
  archived:  { title: "Архив",     cls: "bg-slate-100 text-slate-500 border-slate-200" },
};

export const STEP_STATUS: Record<string, { title: string; cls: string; dot: string }> = {
  not_started: { title: "Не начато", cls: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-300" },
  in_progress: { title: "В работе",  cls: "bg-blue-50 text-blue-700 border-blue-200",     dot: "bg-blue-500" },
  blocked:     { title: "Блок",      cls: "bg-red-50 text-red-700 border-red-200",        dot: "bg-red-500" },
  done:        { title: "Готово",    cls: "bg-green-50 text-green-700 border-green-200",  dot: "bg-green-500" },
  cancelled:   { title: "Отменено",  cls: "bg-slate-100 text-slate-400 border-slate-200", dot: "bg-slate-300" },
};

export const PRIORITY_LABEL: Record<string, string> = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
  critical: "Критический",
};

async function req(path: string, options: RequestInit = {}, base = BASE) {
  const res = await fetch(`${base}${path}`, {
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

export interface AiSubstep {
  title: string;
  start_date: string | null;
  due_date: string | null;
  responsible_person_id?: number | null;
}

export interface AiStep {
  title: string;
  description: string;
  result_criteria: string;
  role_hint: string;
  is_milestone: boolean;
  start_date: string | null;
  due_date: string | null;
  substeps: AiSubstep[];
  responsible_person_id?: number | null;
}

export interface AiSuggestion {
  steps: AiStep[];
  days: number;
  start_date: string;
  used_knowledge?: string[];
}

export const plannerApi = {
  list: (): Promise<{ plans: Plan[]; refs: PlannerRefs }> => req("/?action=list"),

  plan: (planId: number): Promise<{ plan: Plan; refs: PlannerRefs; load: ResourceLoad[]; labor: LaborSummary }> =>
    req(`/?action=plan&plan_id=${planId}`),

  resourceLoad: (planId?: number): Promise<ResourceLoad[]> =>
    req(`/?action=resource_load${planId ? `&plan_id=${planId}` : ""}`),

  savePlan: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("save_plan", data),

  saveStep: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("save_step", data),

  setAssignees: (
    stepId: number,
    personIds: number[],
    workloads: Record<string, number> = {},
  ): Promise<{ step_id: number }> =>
    post("set_assignees", { step_id: stepId, person_ids: personIds, workloads }),

  reorder: (items: { id: number; sort_order: number; parent_step_id: number | null }[]) =>
    post("reorder", { items }),

  aiSuggest: (data: {
    title: string;
    goal?: string;
    start_date?: string | null;
    due_date?: string | null;
  }): Promise<AiSuggestion> =>
    req("/", { method: "POST", body: JSON.stringify(data) }, AI_BASE),

  aiApply: (planId: number, steps: AiStep[]): Promise<{ plan_id: number; created: number }> =>
    post("ai_apply", { plan_id: planId, steps }),

  deleteStep: (id: number): Promise<{ id: number }> => post("delete_step", { id }),

  deletePlan: (id: number): Promise<{ id: number }> => post("delete_plan", { id }),
};

/** Строит дерево шагов из плоского списка. */
export function buildTree(steps: PlanStep[]): (PlanStep & { children: PlanStep[] })[] {
  const map = new Map<number, PlanStep & { children: PlanStep[] }>();
  steps.forEach((s) => map.set(s.id, { ...s, children: [] }));
  const roots: (PlanStep & { children: PlanStep[] })[] = [];
  map.forEach((node) => {
    if (node.parent_step_id && map.has(node.parent_step_id)) {
      map.get(node.parent_step_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

/** Считает прогресс ветки по листьям. */
export function branchProgress(step: PlanStep & { children: PlanStep[] }): number {
  const leaves: PlanStep[] = [];
  const walk = (n: PlanStep & { children: PlanStep[] }) => {
    if (!n.children.length) leaves.push(n);
    else n.children.forEach((c) => walk(c as PlanStep & { children: PlanStep[] }));
  };
  walk(step);
  const active = leaves.filter((l) => l.status !== "cancelled");
  if (!active.length) return step.progress_pct || 0;
  const sum = active.reduce(
    (acc, l) => acc + (l.status === "done" ? 100 : l.progress_pct || 0),
    0,
  );
  return Math.round(sum / active.length);
}