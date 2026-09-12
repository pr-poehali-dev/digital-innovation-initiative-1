import { accessHeaders } from "./execAccess";

// Тот же backend, что и execCenterApi — organizационная модель является
// расширением exec-center, отдельная cloud function не создавалась.
const BASE = "https://functions.poehali.dev/35ba7401-e32b-436c-9baa-b7774c77fc87";

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

export interface OrgUnitNode {
  id: number;
  code: string | null;
  name: string;
  short_name: string | null;
  type: string;
  parent_id: number | null;
  path: string;
  level: number;
  sort_order: number;
  status: string;
  is_archived: boolean;
  description: string | null;
  valid_from: string | null;
  valid_to: string | null;
  head_person_id: number | null;
  head_name: string | null;
  head_position: string | null;
  function_count: number;
  staff_plan_fte: number;
  staff_fact_fte: number;
  vacancy_count: number;
}

export interface OrgUnitDetail extends OrgUnitNode {
  parent_name: string | null;
  functions: { id: number; code: string | null; title: string; criticality: string; status: string; role: string }[];
  roles: {
    id: number; title: string; code: string | null; headcount: number; status: string;
    occupied_count: number; vacant_count: number;
  }[];
  positions: {
    id: number; role_id: number; role_title: string; fte: number; person_id: number | null;
    person_name: string | null; status: string; date_from: string | null; date_to: string | null;
  }[];
  initiatives: { id: number; title: string; status: string; stage: string | null }[];
}

export interface StaffingByUnit {
  org_unit_id: number;
  org_unit_name: string;
  staff_plan_fte: number;
  staff_fact_fte: number;
  vacancy_count: number;
  frozen_count: number;
}

export interface StaffingTotal {
  staff_plan_fte: number;
  staff_fact_fte: number;
  vacancy_count: number;
  external_count: number;
}

export interface CompetencyGapRow {
  role_id: number;
  role_title: string;
  org_unit_id: number | null;
  org_unit_name: string | null;
  competency_id: number;
  competency_name: string;
  required_level: number;
  is_critical: boolean;
  position_id: number | null;
  person_id: number | null;
  person_name: string | null;
  current_level: number | null;
  gap: number;
}

export interface VacantRoleRow {
  role_id: number;
  role_title: string;
  org_unit_id: number | null;
  org_unit_name: string | null;
  vacancy_count: number;
  required_competencies: string[] | null;
}

export interface OrgOverview {
  staffing: StaffingTotal;
  by_unit: StaffingByUnit[];
  external_count: number;
  overloaded_count: number;
  overloaded_people: { person_id: number; display_name: string; total_load_pct: number }[];
  open_requirements_count: number;
  role_competency_gaps_count: number;
  vacant_roles_count: number;
  functions_without_owner_count: number;
  functions_without_unit_count: number;
  raci_without_owner_count: number;
}

export interface RaciItem {
  id: number;
  entity_type: string;
  entity_id: number;
  person_id: number;
  person_name: string;
  person_status: string;
  raci_role: "R" | "A" | "C" | "I";
  is_collective_a: boolean;
  valid_from: string;
  valid_to: string | null;
  note: string | null;
}

export interface RaciWarning {
  code: "no_owner" | "multiple_owners" | "inactive_person";
  message: string;
}

export const RACI_ENTITY_LABEL: Record<string, string> = {
  process: "Процесс",
  initiative: "Инициатива",
  project: "Проект",
  result: "Результат",
  milestone: "Контрольная точка",
};

export const RACI_ROLE_LABEL: Record<string, string> = {
  R: "Выполняет (R)",
  A: "Ответственный (A)",
  C: "Консультирует (C)",
  I: "Информируется (I)",
};

export const ORG_UNIT_TYPE_LABEL: Record<string, string> = {
  department: "Департамент",
  management: "Управление",
  division: "Подразделение",
  group: "Группа",
  center: "Центр",
};

export const ROLE_POSITION_STATUS: Record<string, { title: string; cls: string }> = {
  occupied: { title: "Занята", cls: "bg-green-50 text-green-700 border-green-200" },
  vacant: { title: "Вакансия", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  frozen: { title: "Заморожена", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  eliminated: { title: "Упразднена", cls: "bg-slate-100 text-slate-500 border-slate-200" },
};

export interface OrgResourcePlanVersion {
  id: number;
  year: number;
  title: string | null;
  status: "draft" | "approved";
  note: string | null;
  line_count: number;
  approved_at: string | null;
  approved_by: string | null;
}

export interface OrgResourcePlanLine {
  id: number;
  version_id: number;
  org_unit_id: number | null;
  org_unit_name: string | null;
  role_id: number | null;
  role_title: string | null;
  month: string;
  planned_fte: number;
  available_fte: number;
  operational_demand_fte: number;
  external_fte: number;
  project_demand_fte: number;
  capacity_gap_fte: number;
  fot_plan_amount: number | null;
  comment: string | null;
}

export interface OrgResourcePlanData {
  version: OrgResourcePlanVersion;
  lines: OrgResourcePlanLine[];
}

export interface OrgResourcePlanSnapshot {
  id: number;
  version_id: number;
  version_group: string;
  version_number: number;
  payload_sha256: string;
  payload: OrgResourcePlanData;
  integrity_ok: boolean;
  is_test_data: boolean;
  created_by: string | null;
  created_at: string;
}

export interface DeptFunctionMapRow {
  center_function_id: number;
  center_function_title: string;
  bank_code: string | null;
  bank_code_title: string | null;
  dept_function_id: number | null;
  dept_function_title: string | null;
  dept_name: string | null;
}

export const orgModelApi = {
  overview: (centerId: number): Promise<OrgOverview> =>
    req(`/?action=org_overview&center_id=${centerId}`),

  tree: (centerId: number): Promise<{ items: OrgUnitNode[] }> =>
    req(`/?action=org_tree&center_id=${centerId}`),

  unitDetail: (unitId: number): Promise<OrgUnitDetail> =>
    req(`/?action=org_unit_detail&org_unit_id=${unitId}`),

  saveUnit: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("save_org_unit", data),

  archiveUnit: (id: number) => post("archive_org_unit", { id }),

  saveFunctionOrgUnit: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("save_center_function_org_unit", data),

  unassignFunctionOrgUnit: (centerFunctionId: number, orgUnitId: number) =>
    post("unassign_center_function_org_unit", { center_function_id: centerFunctionId, org_unit_id: orgUnitId }),

  staffingSummary: (centerId: number): Promise<{ by_unit: StaffingByUnit[]; total: StaffingTotal }> =>
    req(`/?action=staffing_summary&center_id=${centerId}`),

  savePosition: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("save_role_position", data),

  deletePosition: (id: number) => post("delete_role_position", { id }),

  saveRoleCompetency: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("save_role_competency", data),

  deleteRoleCompetency: (id: number) => post("delete_role_competency", { id }),

  saveRequirementCompetency: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("save_requirement_competency", data),

  competencyGaps: (centerId: number): Promise<{ competency_gaps: CompetencyGapRow[]; vacant_roles: VacantRoleRow[] }> =>
    req(`/?action=competency_gaps&center_id=${centerId}`),

  raciMatrix: (entityType: string, entityId: number): Promise<{ items: RaciItem[]; warnings: RaciWarning[] }> =>
    req(`/?action=raci_matrix&entity_type=${entityType}&entity_id=${entityId}`),

  saveRaciMatrix: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("save_raci_matrix", data),

  closeRaciMatrix: (id: number) => post("close_raci_matrix", { id }),

  deptFunctionMap: (centerId: number): Promise<{ items: DeptFunctionMapRow[] }> =>
    req(`/?action=dept_function_map&center_id=${centerId}`),

  planVersions: (): Promise<{ items: OrgResourcePlanVersion[] }> =>
    req("/?action=org_resource_plan_versions"),

  savePlanVersion: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("save_org_resource_plan_version", data),

  plan: (versionId: number): Promise<OrgResourcePlanData> =>
    req(`/?action=org_resource_plan&version_id=${versionId}`),

  savePlanLine: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("save_org_resource_plan_line", data),

  createPlanSnapshot: (data: Record<string, unknown>): Promise<{
    id: number; version_group: string; version_number: number; payload_sha256: string;
  }> => post("create_org_resource_plan_snapshot", data),

  planSnapshot: (id: number): Promise<OrgResourcePlanSnapshot> =>
    req(`/?action=org_resource_plan_snapshot&id=${id}`),
};
