import { accessHeaders } from "./execAccess";

// Контур «Процессное управление» — функции, архитектура процессов, паспорт,
// справочники, детерминированные проверки. НЕ AI-модуль: backend не вызывает
// YandexGPT/Yandex Vision, все проверки — точные сравнения строк на сервере.
const BASE = "https://functions.poehali.dev/2114209b-904f-48c4-97a0-516c96626f50";

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

export type ProcessLevel = "direction" | "process" | "subprocess" | "operation";
export type ModelStatus = "draft" | "in_review" | "confirmed" | "published" | "archived";
export type ParticipationKind = "owner" | "executor" | "reviewer" | "consumer" | "supplier";

export type NodeType = "start" | "end" | "task" | "gateway" | "subprocess" | "document" | "system" | "control" | "note";
export type LaneType = "org_unit" | "role" | "placeholder";
export type DiagramVariant = "as_is" | "to_be";

export type QualitativeLevel = "low" | "medium" | "high" | "critical";
export type ControlType = "preventive" | "detective";
export type ControlMethod = "manual" | "automated" | "mixed";
export type MetricKind = "result" | "quality" | "deadline" | "cost" | "risk";
export type ProblemType =
  | "delay" | "extra_approval" | "duplication" | "manual_operation" | "responsibility_gap"
  | "no_control" | "data_gap" | "system_limitation" | "normative_conflict" | "other";
export type IssueStatus = "open" | "addressed" | "closed";
export type EffectType =
  | "time_reduction" | "risk_reduction" | "quality_improvement" | "cost_reduction"
  | "manual_op_elimination" | "control_strengthening" | "automation" | "duplication_elimination";

export interface Refs {
  levels: Record<ProcessLevel, string>;
  statuses: Record<ModelStatus, string>;
  participation_kinds: Record<ParticipationKind, string>;
  confirmation_statuses: Record<string, string>;
  node_types: Record<NodeType, string>;
  lane_types: Record<LaneType, string>;
  qualitative_levels: Record<QualitativeLevel, string>;
  control_types: Record<ControlType, string>;
  control_methods: Record<ControlMethod, string>;
  control_periodicities: Record<string, string>;
  metric_kinds: Record<MetricKind, string>;
  metric_periodicities: Record<string, string>;
  problem_types: Record<ProblemType, string>;
  issue_statuses: Record<IssueStatus, string>;
  effect_types: Record<EffectType, string>;
  user_role: string;
  can_confirm: boolean;
  can_edit: boolean;
}

export interface OverviewStage {
  code: string;
  label: string;
  done: boolean;
}

export interface OverviewMetrics {
  functions_total: number;
  functions_confirmed: number;
  processes_total: number;
  processes_by_level: Record<string, number>;
  passports_filled: number;
  diagrams_as_is: number;
  diagrams_to_be: number;
  risks_without_controls: number;
  processes_without_owner: number;
  docs_need_confirmation: number;
  open_questions: number;
}

export interface OverviewUnit {
  org_unit_id: number;
  code: string | null;
  name: string;
  short_name: string | null;
  decision: string;
  confirmation_status: string;
}

export interface Overview {
  scope: Record<string, unknown> | null;
  units: OverviewUnit[];
  metrics: OverviewMetrics;
  stages: OverviewStage[];
  progress_pct: number;
  next_step: { code: string; label: string } | null;
}

export interface ProcessFunction {
  id: number;
  scope_id: number;
  code: string | null;
  title: string;
  org_unit_id: number | null;
  org_unit_name: string | null;
  org_unit_code: string | null;
  responsible_role: string | null;
  normative_basis: string | null;
  source_document_id: number | null;
  source_document_title: string | null;
  source_kind: "manual" | "ai_suggested";
  confirmation_status: "user_draft" | "confirmed";
  comment: string | null;
  process_links_count: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FunctionCheckIssue {
  code: string;
  level: "warning" | "blocking";
  title: string;
  detail: string;
  function_ids: number[];
}

export interface ProcessNode {
  id: number;
  scope_id: number;
  code: string | null;
  name: string;
  level: ProcessLevel;
  parent_id: number | null;
  owner_person_id: number | null;
  owner_name: string | null;
  responsible_org_unit_id: number | null;
  org_unit_name: string | null;
  result_description: string | null;
  model_status: ModelStatus;
  version: number;
  sort_order: number;
  published_at: string | null;
  published_by: string | null;
  children_count: number;
  function_links_count: number;
  has_passport: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProcessPassport {
  process_node_id: number;
  goal: string | null;
  boundaries_note: string | null;
  trigger_event: string | null;
  inputs_note: string | null;
  outputs_note: string | null;
  suppliers_note: string | null;
  consumers_note: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface ProcessParticipant {
  id: number;
  process_node_id: number;
  role_title: string;
  person_id: number | null;
  person_name: string | null;
  org_unit_id: number | null;
  org_unit_name: string | null;
  participation_kind: ParticipationKind;
}

export interface InfoSystem {
  id: number;
  name: string;
  description: string | null;
}

export interface ProcessDetail {
  node: ProcessNode;
  passport: ProcessPassport | null;
  participants: ProcessParticipant[];
  functions: { id: number; code: string | null; title: string }[];
  systems: InfoSystem[];
  documents: { id: number; title: string; source_type: string; state: string; confidentiality_level: string }[];
  diagrams: { id: number; variant: "as_is" | "to_be"; title: string | null; model_status: ModelStatus; version: number; updated_at: string; base_diagram_id?: number | null }[];
  risks: { id: number; title: string; qualitative_level: string | null; controls_count: number }[];
  metrics: { id: number; title: string; metric_kind: string }[];
  issues: { id: number; title: string; status: string }[];
}

// ── Итерация 3: риски / контроли / показатели / проблемы / улучшения ────────

export interface ProcessRisk {
  id: number;
  process_node_id: number;
  diagram_node_id: number | null;
  diagram_node_label: string | null;
  title: string;
  event_description: string | null;
  cause: string | null;
  consequence: string | null;
  qualitative_level: QualitativeLevel | null;
  severity_rank: number | null;
  owner_person_id: number | null;
  owner_name: string | null;
  owner_role: string | null;
  source_note: string | null;
  comment: string | null;
  linked_initiative_risk_id: number | null;
  verification_status: "user_draft" | "confirmed";
  controls_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProcessControl {
  id: number;
  risk_id: number;
  title: string;
  goal_note: string | null;
  control_type: ControlType | null;
  method: ControlMethod | null;
  diagram_node_id: number | null;
  diagram_node_label: string | null;
  responsible_role: string | null;
  responsible_person_id: number | null;
  responsible_name: string | null;
  responsible_org_unit_id: number | null;
  responsible_org_unit_name: string | null;
  periodicity: string | null;
  evidence_note: string | null;
  last_evidence_confirmed_by: string | null;
  last_evidence_confirmed_at: string | null;
  normative_document_note: string | null;
  info_system_id: number | null;
  info_system_name: string | null;
  comment: string | null;
  verification_status: "user_draft" | "confirmed";
  created_at: string;
  updated_at: string;
}

export interface ProcessMetric {
  id: number;
  process_node_id: number;
  diagram_node_id: number | null;
  diagram_node_label: string | null;
  title: string;
  metric_kind: MetricKind;
  measures_note: string | null;
  formula: string | null;
  unit: string | null;
  data_source: string | null;
  periodicity: string | null;
  plan_value: string | null;
  fact_value: string | null;
  threshold_note: string | null;
  owner_person_id: number | null;
  owner_name: string | null;
  goal_link_note: string | null;
  verification_status: "user_draft" | "confirmed";
  created_at: string;
  updated_at: string;
}

export interface MetricCheckItem {
  code: string;
  message: string;
  metric_id: number | null;
}

export interface ProcessIssue {
  id: number;
  process_node_id: number;
  diagram_node_id: number | null;
  diagram_node_label: string | null;
  title: string;
  description: string | null;
  problem_type: ProblemType | null;
  cause: string | null;
  impact_note: string | null;
  source_note: string | null;
  severity_rank: number | null;
  improvement_direction: string | null;
  status: IssueStatus;
  verification_status: "user_draft" | "confirmed";
  created_at: string;
  updated_at: string;
}

export interface RiskControlCheckItem {
  code: string;
  message: string;
  risk_id?: number;
  control_id?: number;
  diagram_node_id?: number;
}

export interface ProcessImprovement {
  id: number;
  to_be_diagram_id: number;
  to_be_node_id: number | null;
  to_be_node_label: string | null;
  as_is_issue_id: number | null;
  issue_title: string | null;
  description: string;
  expected_effect_note: string | null;
  effect_type: EffectType | null;
  result_metric_id: number | null;
  owner_person_id: number | null;
  owner_name: string | null;
  status: "user_draft" | "confirmed";
  initiative_id: number | null;
  initiative_title: string | null;
  initiative_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiagramDiffEntry {
  id?: number;
  as_is_id?: number;
  to_be_id?: number;
  label?: string | null;
  title?: string | null;
  node_type?: string;
  changed_fields?: string[];
}

export interface DiagramDiffGroup {
  added: DiagramDiffEntry[];
  removed: DiagramDiffEntry[];
  changed: DiagramDiffEntry[];
  unchanged: DiagramDiffEntry[];
}

export interface DiagramCompareResult {
  as_is_diagram_id: number;
  to_be_diagram_id: number;
  nodes: DiagramDiffGroup;
  edges: DiagramDiffGroup;
  lanes: DiagramDiffGroup;
  risks: { removed_on_operations: number[]; still_present_on_operations: number[] };
  summary: { added: number; removed: number; changed: number };
}

export interface InitiativeLite {
  id: number;
  title: string;
  external_code: string | null;
  status: string;
}

export interface CompletenessItem {
  code: string;
  label: string;
  ok: boolean;
  detail: string | null;
}

export interface CompletenessResult {
  ready: CompletenessItem[];
  needs_attention: CompletenessItem[];
  can_confirm: boolean;
}

export interface OrgUnitRef {
  id: number;
  code: string | null;
  name: string;
  short_name: string | null;
  type: string;
  parent_id: number | null;
}

export interface PersonRef {
  id: number;
  display_name: string;
  position_title: string | null;
  org_name: string | null;
}

export interface ClarificationNote {
  id: number;
  scope_id: number;
  entity_type: string;
  entity_id: number | null;
  question: string;
  status: "open" | "resolved";
  resolution_note: string | null;
  created_by: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface ProcessDiagram {
  id: number;
  process_node_id: number;
  variant: DiagramVariant;
  base_diagram_id: number | null;
  title: string | null;
  model_status: ModelStatus;
  version: number;
  canvas_scale: number;
  canvas_x: number;
  canvas_y: number;
  published_at: string | null;
  published_by: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface DiagramLane {
  id: number;
  diagram_id: number;
  title: string;
  lane_type: LaneType;
  org_unit_id: number | null;
  org_unit_name: string | null;
  role_title: string | null;
  placeholder_label: string | null;
  needs_clarification: boolean;
  sort_order: number;
  origin_lane_id: number | null;
}

export interface DiagramNode {
  id: number;
  diagram_id: number;
  lane_id: number | null;
  node_type: NodeType;
  label: string | null;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  description: string | null;
  input_note: string | null;
  output_note: string | null;
  duration_note: string | null;
  is_critical: boolean;
  confirmation_status: "user_draft" | "confirmed";
  gateway_outcomes: string | null;
  ref_role_title: string | null;
  ref_person_id: number | null;
  ref_person_name: string | null;
  ref_org_unit_id: number | null;
  ref_org_unit_name: string | null;
  ref_document_id: number | null;
  ref_document_title: string | null;
  ref_system_id: number | null;
  ref_system_name: string | null;
  ref_risk_id: number | null;
  ref_risk_title: string | null;
  ref_risk_level: QualitativeLevel | null;
  ref_risk_controls_count: number | null;
  system_note: string | null;
  document_note: string | null;
  note: string | null;
  origin_node_id: number | null;
}

export interface DiagramEdge {
  id: number;
  diagram_id: number;
  source_node_id: number;
  target_node_id: number;
  label: string | null;
  edge_type: "flow" | "conditional";
  origin_edge_id: number | null;
}

export interface DiagramFull {
  diagram: ProcessDiagram;
  lanes: DiagramLane[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  process_node_id: number;
}

export interface DiagramIssue {
  code: string;
  message: string;
  node_ids: number[];
}

export interface DiagramValidation {
  errors: DiagramIssue[];
  warnings: DiagramIssue[];
}

export const NODE_TYPE_ICON: Record<NodeType, string> = {
  start: "Circle",
  end: "CircleDot",
  task: "Square",
  gateway: "Diamond",
  subprocess: "Layers",
  document: "FileText",
  system: "Server",
  control: "ShieldCheck",
  note: "StickyNote",
};

export const processModelApi = {
  refs: (): Promise<Refs> => req("/?action=refs"),

  defaultScope: (): Promise<{ scope_id: number | null }> => req("/?action=default_scope"),

  overview: (scopeId?: number): Promise<Overview | null> =>
    req(`/?action=overview${scopeId ? `&scope_id=${scopeId}` : ""}`),

  // Функции
  functions: (scopeId: number): Promise<{ items: ProcessFunction[] }> =>
    req(`/?action=functions&scope_id=${scopeId}`),
  functionChecks: (scopeId: number): Promise<{ items: FunctionCheckIssue[] }> =>
    req(`/?action=function_checks&scope_id=${scopeId}`),
  saveFunction: (data: Record<string, unknown>): Promise<{ id: number }> => post("function_save", data),
  confirmFunction: (id: number): Promise<{ id: number }> => post("function_confirm", { id }),
  unconfirmFunction: (id: number): Promise<{ id: number }> => post("function_unconfirm", { id }),

  // Архитектура процессов
  processTree: (scopeId: number): Promise<{ items: ProcessNode[] }> =>
    req(`/?action=process_tree&scope_id=${scopeId}`),
  saveProcessNode: (data: Record<string, unknown>): Promise<{ id: number }> => post("process_node_save", data),
  setProcessStatus: (id: number, status: ModelStatus, comment?: string): Promise<{ id: number }> =>
    post("process_node_set_status", { id, status, comment }),
  processDetail: (id: number): Promise<ProcessDetail> => req(`/?action=process_detail&id=${id}`),

  // Паспорт
  savePassport: (data: Record<string, unknown>): Promise<{ id: number }> => post("passport_save", data),
  passportCompleteness: (processNodeId: number): Promise<CompletenessResult> =>
    req(`/?action=passport_completeness&process_node_id=${processNodeId}`),

  // Участники
  saveParticipant: (data: Record<string, unknown>): Promise<{ id: number }> => post("participant_save", data),
  removeParticipant: (id: number): Promise<{ id: number }> => post("participant_remove", { id }),

  // Системы
  systems: (): Promise<{ items: InfoSystem[] }> => req("/?action=systems"),
  createSystem: (name: string, description?: string): Promise<{ id: number }> =>
    post("system_create", { name, description }),
  linkSystem: (processNodeId: number, systemId: number): Promise<{ id: number }> =>
    post("process_system_link", { process_node_id: processNodeId, system_id: systemId }),
  unlinkSystem: (processNodeId: number, systemId: number): Promise<{ id: number }> =>
    post("process_system_unlink", { process_node_id: processNodeId, system_id: systemId }),

  // Документы
  linkDocument: (processNodeId: number, documentId: number): Promise<{ id: number }> =>
    post("process_document_link", { process_node_id: processNodeId, document_id: documentId }),
  unlinkDocument: (processNodeId: number, documentId: number): Promise<{ id: number }> =>
    post("process_document_unlink", { process_node_id: processNodeId, document_id: documentId }),

  // Связь функций и процессов
  linkFunction: (functionId: number, processNodeId: number): Promise<{ id: number }> =>
    post("function_process_link", { function_id: functionId, process_node_id: processNodeId }),
  unlinkFunction: (functionId: number, processNodeId: number): Promise<{ id: number }> =>
    post("function_process_unlink", { function_id: functionId, process_node_id: processNodeId }),

  // Заметки «требует уточнения»
  clarificationNotes: (scopeId: number): Promise<{ items: ClarificationNote[] }> =>
    req(`/?action=clarification_notes&scope_id=${scopeId}`),
  saveClarificationNote: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("clarification_note_save", data),
  resolveClarificationNote: (id: number, resolutionNote?: string): Promise<{ id: number }> =>
    post("clarification_note_resolve", { id, resolution_note: resolutionNote }),

  // Справочники
  orgUnits: (): Promise<{ items: OrgUnitRef[] }> => req("/?action=org_units"),
  people: (): Promise<{ items: PersonRef[] }> => req("/?action=people"),

  // Схемы процессов
  diagramGetOrCreate: (processNodeId: number, variant: DiagramVariant): Promise<{ id: number; created: boolean }> =>
    post("diagram_get_or_create", { process_node_id: processNodeId, variant }),
  diagramFull: (id: number): Promise<DiagramFull> => req(`/?action=diagram_full&id=${id}`),
  diagramSetStatus: (id: number, status: ModelStatus, comment?: string): Promise<{ id: number }> =>
    post("diagram_set_status", { id, status, comment }),
  diagramSaveCanvas: (diagramId: number, data: { canvas_scale?: number; canvas_x?: number; canvas_y?: number }): Promise<{ id: number }> =>
    post("diagram_save_canvas", { diagram_id: diagramId, ...data }),
  diagramValidate: (id: number): Promise<DiagramValidation> => req(`/?action=diagram_validate&id=${id}`),
  diagramExportData: (id: number): Promise<DiagramFull & { export_meta: Record<string, unknown> }> =>
    req(`/?action=diagram_export_data&id=${id}`),
  diagramAutosave: (diagramId: number, snapshot: unknown): Promise<{ id: number }> =>
    post("diagram_autosave", { diagram_id: diagramId, snapshot }),

  saveLane: (data: Record<string, unknown>): Promise<{ id: number }> => post("lane_save", data),
  deleteLane: (id: number): Promise<{ id: number }> => post("lane_delete", { id }),

  saveDiagramNode: (data: Record<string, unknown>): Promise<{ id: number }> => post("diagram_node_save", data),
  deleteDiagramNode: (id: number): Promise<{ id: number }> => post("diagram_node_delete", { id }),

  saveDiagramEdge: (data: Record<string, unknown>): Promise<{ id: number }> => post("diagram_edge_save", data),
  deleteDiagramEdge: (id: number): Promise<{ id: number }> => post("diagram_edge_delete", { id }),

  // ── Итерация 3: риски процесса ──────────────────────────────────────────
  processRisks: (processNodeId: number): Promise<{ items: ProcessRisk[] }> =>
    req(`/?action=process_risks&process_node_id=${processNodeId}`),
  saveRisk: (data: Record<string, unknown>): Promise<{ id: number }> => post("risk_save", data),
  deleteRisk: (id: number): Promise<{ id: number }> => post("risk_delete", { id }),
  confirmRisk: (id: number, confirm: boolean): Promise<{ id: number }> =>
    post(confirm ? "risk_confirm" : "risk_unconfirm", { id }),

  // Контроли
  processControls: (riskId: number): Promise<{ items: ProcessControl[] }> =>
    req(`/?action=process_controls&risk_id=${riskId}`),
  saveControl: (data: Record<string, unknown>): Promise<{ id: number }> => post("control_save", data),
  deleteControl: (id: number): Promise<{ id: number }> => post("control_delete", { id }),
  confirmControl: (id: number, confirm: boolean): Promise<{ id: number }> =>
    post(confirm ? "control_confirm" : "control_unconfirm", { id }),
  riskControlChecks: (processNodeId: number): Promise<{ items: RiskControlCheckItem[] }> =>
    req(`/?action=risk_control_checks&process_node_id=${processNodeId}`),

  // Показатели
  processMetrics: (processNodeId: number): Promise<{ items: ProcessMetric[] }> =>
    req(`/?action=process_metrics&process_node_id=${processNodeId}`),
  saveMetric: (data: Record<string, unknown>): Promise<{ id: number }> => post("metric_save", data),
  deleteMetric: (id: number): Promise<{ id: number }> => post("metric_delete", { id }),
  metricChecks: (processNodeId: number): Promise<{ items: MetricCheckItem[] }> =>
    req(`/?action=metric_checks&process_node_id=${processNodeId}`),

  // Проблемы AS-IS
  processIssues: (processNodeId: number): Promise<{ items: ProcessIssue[] }> =>
    req(`/?action=process_issues&process_node_id=${processNodeId}`),
  saveIssue: (data: Record<string, unknown>): Promise<{ id: number }> => post("issue_save", data),
  deleteIssue: (id: number): Promise<{ id: number }> => post("issue_delete", { id }),
  linkIssueInitiative: (issueId: number, initiativeId: number, note?: string): Promise<{ id: number }> =>
    post("issue_initiative_link", { issue_id: issueId, initiative_id: initiativeId, expected_effect_note: note }),
  unlinkIssueInitiative: (issueId: number, initiativeId: number): Promise<{ id: number }> =>
    post("issue_initiative_unlink", { issue_id: issueId, initiative_id: initiativeId }),

  // TO-BE: создание из AS-IS, сравнение, улучшения
  createToBeFromAsIs: (asIsDiagramId: number): Promise<{ id: number }> =>
    post("diagram_create_to_be", { as_is_diagram_id: asIsDiagramId }),
  compareDiagrams: (asIsId: number, toBeId: number): Promise<DiagramCompareResult> =>
    req(`/?action=diagram_compare&as_is_id=${asIsId}&to_be_id=${toBeId}`),
  improvements: (toBeDiagramId: number): Promise<{ items: ProcessImprovement[] }> =>
    req(`/?action=improvements&to_be_diagram_id=${toBeDiagramId}`),
  saveImprovement: (data: Record<string, unknown>): Promise<{ id: number }> => post("improvement_save", data),
  deleteImprovement: (id: number): Promise<{ id: number }> => post("improvement_delete", { id }),
  suggestInitiativeLinks: (toBeDiagramId: number): Promise<{ items: InitiativeLite[] }> =>
    req(`/?action=improvement_suggest_initiatives&to_be_diagram_id=${toBeDiagramId}`),
  initiativesLite: (): Promise<{ items: InitiativeLite[] }> => req("/?action=initiatives_lite"),
};

export const LEVEL_ORDER: ProcessLevel[] = ["direction", "process", "subprocess", "operation"];

export const STATUS_STYLE: Record<ModelStatus, { title: string; cls: string }> = {
  draft: { title: "Черновик", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  in_review: { title: "На проверке", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  confirmed: { title: "Подтверждён", cls: "bg-green-50 text-green-700 border-green-200" },
  published: { title: "Опубликован", cls: "bg-emerald-50 text-emerald-700 border-emerald-300" },
  archived: { title: "Архив", cls: "bg-slate-100 text-slate-500 border-slate-200" },
};

export const QUALITATIVE_LEVEL_STYLE: Record<QualitativeLevel, { title: string; cls: string; dot: string }> = {
  low: { title: "Низкий", cls: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" },
  medium: { title: "Средний", cls: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  high: { title: "Высокий", cls: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-500" },
  critical: { title: "Критичный", cls: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-600" },
};

export const ISSUE_STATUS_STYLE: Record<IssueStatus, { title: string; cls: string }> = {
  open: { title: "Открыта", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  addressed: { title: "В работе", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  closed: { title: "Закрыта", cls: "bg-green-50 text-green-700 border-green-200" },
};