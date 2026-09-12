import { accessHeaders } from "./execAccess";

// Тот же backend, что и execCenterApi/execOrgModelApi — цели, KPI и эффекты
// являются расширением exec-center, отдельная cloud function не создавалась.
const BASE = "https://functions.poehali.dev/35ba7401-e32b-436c-9baa-b7774c77fc87";

async function req(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...accessHeaders(), ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data?.error?.message || "Ошибка загрузки данных");
  return data.data;
}

const post = (action: string, body: unknown) =>
  req(`/?action=${action}`, { method: "POST", body: JSON.stringify(body) });

export type GoalLevel = "strategic" | "organization" | "center" | "org_unit" | "initiative" | "project";
export type GoalStatus = "draft" | "agreed" | "active" | "achieved" | "paused" | "cancelled" | "archived";
export type ProgressMode = "manual" | "by_indicators" | "by_children" | "weighted";
export type StatusColor = "green" | "yellow" | "red" | "gray";
export type IndicatorType = "kpi" | "performance" | "effect" | "process" | "quality"
  | "deadline" | "financial" | "resource" | "risk" | "informational";
export type ImprovementDirection = "higher_is_better" | "lower_is_better" | "in_range" | "target_exact" | "observe_only";
export type FormulaKind = "manual" | "sum" | "average" | "percentage" | "ratio" | "difference" | "running_total";

export const GOAL_LEVEL_LABEL: Record<GoalLevel, string> = {
  strategic: "Стратегическая цель", organization: "Цель организации", center: "Цель Центра",
  org_unit: "Цель подразделения", initiative: "Цель инициативы", project: "Цель проекта",
};
export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  draft: "Черновик", agreed: "Согласована", active: "Действует", achieved: "Достигнута",
  paused: "Приостановлена", cancelled: "Отменена", archived: "Архивирована",
};
export const INDICATOR_TYPE_LABEL: Record<IndicatorType, string> = {
  kpi: "KPI", performance: "Результативность", effect: "Эффект", process: "Процессный",
  quality: "Качество", deadline: "Срок", financial: "Финансовый", resource: "Ресурсный",
  risk: "Риск-индикатор", informational: "Информационный",
};
export const IMPROVEMENT_DIRECTION_LABEL: Record<ImprovementDirection, string> = {
  higher_is_better: "Больше — лучше", lower_is_better: "Меньше — лучше",
  in_range: "Попадание в диапазон", target_exact: "Точное значение", observe_only: "Только наблюдение",
};
export const FORMULA_KIND_LABEL: Record<FormulaKind, string> = {
  manual: "Ручной ввод", sum: "Сумма", average: "Среднее", percentage: "Процент",
  ratio: "Отношение", difference: "Разница", running_total: "Накопительный итог",
};
export const STATUS_COLOR_LABEL: Record<StatusColor, string> = {
  green: "Норма", yellow: "Риск отклонения", red: "Порог нарушен", gray: "Недостаточно данных",
};

export interface StatusLight {
  color: StatusColor;
  reason: string;
  plan: number | null;
  actual: number | null;
  deviation: number | null;
}

export interface Goal {
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
  owner_name?: string | null;
  status: GoalStatus;
  progress_pct: number | null;
  goal_level: GoalLevel;
  code: string | null;
  org_unit_id: number | null;
  org_unit_name?: string | null;
  priority: string;
  valid_from: string | null;
  valid_to: string | null;
  achievement_criteria: string | null;
  actual_date: string | null;
  progress_mode: ProgressMode;
  manual_status_confirmed: boolean;
  is_overdue?: boolean;
  progress?: { mode: ProgressMode; progress_pct: number | null; details: unknown[]; warning?: string; weight_warning?: string };
  links_count?: number;
}

export interface GoalDetail extends Goal {
  parent_goal_title: string | null;
  children: { id: number; title: string; status: GoalStatus; goal_level: GoalLevel }[];
  indicators: { indicator_id: number; title: string; indicator_status: string; weight_pct: number | null }[];
  links: { id: number; link_type: string; src_kind: string; src_id: number; tgt_kind: string; tgt_id: number }[];
}

export interface Indicator {
  id: number;
  code: string | null;
  title: string;
  purpose: string | null;
  indicator_type: IndicatorType;
  unit: string | null;
  improvement_direction: ImprovementDirection;
  periodicity: string;
  owner_person_id: number | null;
  owner_name?: string | null;
  data_entry_person_id: number | null;
  data_entry_name?: string | null;
  data_source: string | null;
  baseline_value: number | null;
  target_value: number | null;
  threshold_yellow: number | null;
  threshold_red: number | null;
  range_min: number | null;
  range_max: number | null;
  is_calculated: boolean;
  active_methodology_id: number | null;
  applicability: "active" | "deprecated";
  status: "draft" | "active" | "archived";
  latest_value?: IndicatorValue | null;
  status_light: StatusLight;
  data_quality_warnings: string[];
}

export interface IndicatorDetail extends Indicator {
  methodology_versions: Methodology[];
  values: IndicatorValue[];
  goals: { goal_id: number; goal_title: string; weight_pct: number | null }[];
}

export interface Methodology {
  id: number;
  indicator_id: number;
  version_number: number;
  description_text: string | null;
  formula_kind: FormulaKind;
  numerator_desc: string | null;
  denominator_desc: string | null;
  rounding_rule: string | null;
  period_kind: string;
  exceptions_text: string | null;
  component_sources: string | null;
  approved_at: string | null;
  approved_by: string | null;
  status: "draft" | "active" | "superseded";
}

export interface IndicatorValue {
  id: number;
  indicator_id: number;
  methodology_id: number | null;
  period_kind: string;
  period_start: string;
  period_end: string | null;
  plan_value: number | null;
  actual_value: number | null;
  forecast_value: number | null;
  threshold_value: number | null;
  data_source: string | null;
  entered_by: string | null;
  confirmed_by: string | null;
  verification_status: "unconfirmed" | "confirmed" | "disputed";
  comment: string | null;
  superseded_by_id: number | null;
}

export interface GoalsDashboard {
  goals_total: number;
  active_goals_count: number;
  achieved_goals_count: number;
  overdue_goals_count: number;
  at_risk_goals: Goal[];
  goals_without_owner: Goal[];
  indicators_total: number;
  indicators_no_data_count: number;
  indicators_red_count: number;
  indicators_quality_issues: Indicator[];
  results_pending: { id: number; title: string; result_kind: string }[];
  effects_pending: { id: number; title: string; metric: string | null }[];
  effects_confirmed_recent: { id: number; title: string; metric: string | null; actual_value: string | null; measured_at: string | null }[];
  goals: Goal[];
}

export interface GoalsReportSnapshot {
  id: number;
  title: string;
  report_kind: string;
  period_from: string | null;
  period_to: string | null;
  version_group: string;
  version_number: number;
  payload_sha256: string;
  is_test_data: boolean;
  created_by: string;
  created_at: string;
  payload: Record<string, unknown>;
  integrity_ok: boolean;
}

export const goalsApi = {
  dashboard: (centerId: number): Promise<GoalsDashboard> => req(`/?action=goals_dashboard&center_id=${centerId}`),
  tree: (centerId: number): Promise<{ items: Goal[] }> => req(`/?action=goals_tree&center_id=${centerId}`),
  goalDetail: (id: number): Promise<GoalDetail> => req(`/?action=goal_detail&id=${id}`),
  saveGoal: (payload: Partial<Goal> & { center_id?: number }): Promise<{ id: number }> => post("save_goal", payload),

  listIndicators: (applicability: "active" | "deprecated" = "active"): Promise<{ items: Indicator[] }> =>
    req(`/?action=list_indicators&applicability=${applicability}`),
  indicatorDetail: (id: number): Promise<IndicatorDetail> => req(`/?action=indicator_detail&id=${id}`),
  saveIndicator: (payload: Partial<Indicator>): Promise<{ id: number }> => post("save_indicator", payload),

  saveMethodology: (payload: Partial<Methodology> & { indicator_id: number }): Promise<{ id: number }> =>
    post("save_methodology", payload),

  saveIndicatorValue: (payload: Partial<IndicatorValue> & { indicator_id: number; period_start: string }): Promise<{ id: number }> =>
    post("save_indicator_value", payload),
  confirmIndicatorValue: (id: number, verification_status: "confirmed" | "disputed" = "confirmed"): Promise<{ id: number }> =>
    post("confirm_indicator_value", { id, verification_status }),

  saveGoalIndicator: (payload: { goal_id: number; indicator_id: number; weight_pct?: number; note?: string }): Promise<{ id: number }> =>
    post("save_goal_indicator", payload),

  confirmEffect: (id: number, confirmed_by_person_id?: number): Promise<{ id: number }> =>
    post("confirm_effect", { id, confirmed_by_person_id }),

  createReportSnapshot: (payload: { center_id: number; period_from?: string; period_to?: string; is_test_data?: boolean }):
    Promise<{ id: number; version_group: string; version_number: number; payload_sha256: string; title: string }> =>
    post("create_goals_report_snapshot", payload),
  reportSnapshot: (id: number): Promise<GoalsReportSnapshot> => req(`/?action=goals_report_snapshot&id=${id}`),
  exportHtml: async (id: number): Promise<string> => {
    const res = await fetch(`${BASE}/?action=export_goals_report_html&id=${id}`, { headers: accessHeaders() });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error?.message || "Ошибка экспорта");
    }
    return res.text();
  },
  exportXlsx: (id: number): Promise<{ filename: string; content_base64: string }> =>
    req(`/?action=export_goals_report_xlsx&id=${id}`),
};