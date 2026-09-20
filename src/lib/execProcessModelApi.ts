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

export interface Refs {
  levels: Record<ProcessLevel, string>;
  statuses: Record<ModelStatus, string>;
  participation_kinds: Record<ParticipationKind, string>;
  confirmation_statuses: Record<string, string>;
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
  diagrams: { id: number; variant: "as_is" | "to_be"; title: string | null; model_status: ModelStatus; version: number; updated_at: string }[];
  risks: { id: number; title: string; qualitative_level: string | null; controls_count: number }[];
  metrics: { id: number; title: string; metric_kind: string }[];
  issues: { id: number; title: string; status: string }[];
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
};

export const LEVEL_ORDER: ProcessLevel[] = ["direction", "process", "subprocess", "operation"];

export const STATUS_STYLE: Record<ModelStatus, { title: string; cls: string }> = {
  draft: { title: "Черновик", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  in_review: { title: "На проверке", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  confirmed: { title: "Подтверждён", cls: "bg-green-50 text-green-700 border-green-200" },
  published: { title: "Опубликован", cls: "bg-emerald-50 text-emerald-700 border-emerald-300" },
  archived: { title: "Архив", cls: "bg-slate-100 text-slate-500 border-slate-200" },
};
