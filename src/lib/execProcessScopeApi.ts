import { accessHeaders } from "./execAccess";

// Обучающий мастер процессного управления — Этап 1 «Границы Блока ВК».
// Это НЕ AI-модуль: backend не вызывает YandexGPT/Yandex Vision, документы
// сохраняются только как файл + ручные метаданные.
const BASE = "https://functions.poehali.dev/05bb2fb4-2087-4b2a-9263-4ec56be50d72";

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

export interface ProcessModelScope {
  id: number;
  block_org_unit_id: number;
  title: string;
  purpose: string | null;
  scope_in: string | null;
  scope_out: string | null;
  owner_person_id: number | null;
  model_status: "draft" | "confirmed";
  wizard_status: "not_started" | "in_progress" | "completed" | "needs_review";
  current_step: number;
  progress_pct: number;
  confirmed_at: string | null;
  confirmed_by: string | null;
  block_regulation_declared_missing: boolean;
  block_regulation_missing_reason: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScopeUnit {
  id: number;
  scope_id: number;
  org_unit_id: number;
  decision: "included" | "excluded";
  /** true — подразделение добавлено ПОЛЬЗОВАТЕЛЕМ через форму «Добавить
   * подразделение» уже после создания паспорта. Все подразделения, подставленные
   * системой при первом открытии мастера (включая функциональные, структурно
   * не дочерние), сюда НЕ относятся — см. is_structural_child. */
  is_manually_added: boolean;
  /** false — подразделение относится к Блоку ВК функционально, но не является
   * дочерним оргюнитом в оргструктуре (например ДФМ). Это объективный факт
   * структуры, а не признак ручного добавления пользователем. */
  is_structural_child: boolean;
  exclusion_reason: string | null;
  confirmation_status: "pending" | "confirmed";
  comment: string | null;
  updated_by: string | null;
  updated_at: string;
  code: string | null;
  name: string;
  short_name: string | null;
  type: string;
  parent_id: number | null;
}

export interface ScopeCandidate {
  id: number;
  code: string | null;
  name: string;
  short_name: string | null;
  type: string;
  parent_id: number | null;
}

export interface ScopeDocument {
  id: number;
  scope_id: number | null;
  org_unit_id: number | null;
  org_unit_code: string | null;
  org_unit_name: string | null;
  source_type: string;
  title: string;
  doc_number: string | null;
  doc_date: string | null;
  issuer: string | null;
  valid_from: string | null;
  valid_to: string | null;
  version_label: string | null;
  state: string;
  confidentiality_level: string;
  is_current_version: boolean;
  is_test_data: boolean;
  confirmed_actual_by: string | null;
  confirmed_actual_at: string | null;
  comment: string | null;
  original_filename: string | null;
  mime_type: string | null;
  file_size: number | null;
  has_file: boolean;
  uploaded_by: string | null;
  fixed_at: string;
}

export interface ScopePayload {
  scope: ProcessModelScope;
  units: ScopeUnit[];
  documents: ScopeDocument[];
  candidates: ScopeCandidate[];
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

export interface ScopeRefs {
  source_types: Record<string, string>;
  confidentiality_levels: Record<string, string>;
  states: Record<string, string>;
  block_org_unit_id_default: number;
  user_role: string;
  can_confirm: boolean;
}

export interface AuditLogItem {
  id: number;
  entity_type: string;
  entity_id: number;
  action: string;
  actor: string | null;
  reason: string | null;
  created_at: string;
}

export const SOURCE_TYPE_LABEL: Record<string, string> = {
  block_regulation: "Положение о Блоке ВК",
  unit_regulation: "Положение о подразделении",
  job_description: "Должностная инструкция",
  order: "Приказ / распоряжение",
  other: "Другое",
};

export const CONFIDENTIALITY_LABEL: Record<string, { title: string; cls: string }> = {
  public: { title: "Публичный", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  internal: { title: "Внутренний", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  confidential: { title: "Конфиденциальный", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  restricted: { title: "Особо ограниченный", cls: "bg-red-50 text-red-700 border-red-200" },
};

export const DOC_STATE_LABEL: Record<string, { title: string; cls: string }> = {
  draft: { title: "Черновик", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  active: { title: "Действует", cls: "bg-green-50 text-green-700 border-green-200" },
  repealed: { title: "Отменён", cls: "bg-slate-100 text-slate-500 border-slate-200" },
  expired: { title: "Истёк срок", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

/** Читает файл как base64 без префикса data:. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = String(reader.result || "");
      resolve(r.includes(",") ? r.split(",")[1] : r);
    };
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

export function downloadBase64File(fileData: string, filename: string, mime: string) {
  const bytes = atob(fileData);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const processScopeApi = {
  refs: (): Promise<ScopeRefs> => req("/?action=refs"),

  getOrCreate: (blockOrgUnitId?: number): Promise<ScopePayload> =>
    req(`/?action=get_or_create${blockOrgUnitId ? `&block_org_unit_id=${blockOrgUnitId}` : ""}`),

  saveScope: (data: Record<string, unknown>): Promise<{ id: number }> => post("save_scope", data),

  declareBlockRegulationMissing: (scopeId: number, reason: string): Promise<{ id: number }> =>
    post("declare_block_regulation_missing", { scope_id: scopeId, reason }),

  undeclareBlockRegulationMissing: (scopeId: number): Promise<{ id: number }> =>
    post("undeclare_block_regulation_missing", { scope_id: scopeId }),

  setStep: (data: { scope_id: number; current_step?: number; wizard_status?: string; progress_pct?: number }) =>
    post("set_step", data),

  saveUnitDecision: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("save_unit_decision", data),

  addManualUnit: (scopeId: number, orgUnitId: number, comment?: string): Promise<{ id: number }> =>
    post("add_manual_unit", { scope_id: scopeId, org_unit_id: orgUnitId, comment }),

  removeManualUnit: (scopeId: number, orgUnitId: number): Promise<{ id: number }> =>
    post("remove_manual_unit", { scope_id: scopeId, org_unit_id: orgUnitId }),

  uploadDocument: (data: Record<string, unknown>): Promise<{ id: number; size: number }> =>
    post("upload_document", data),

  saveDocumentMeta: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("save_document_meta", data),

  markCurrentVersion: (id: number, value: boolean): Promise<{ id: number }> =>
    post("mark_current_version", { id, is_current_version: value }),

  confirmDocumentActual: (id: number): Promise<{ id: number }> =>
    post("confirm_document_actual", { id }),

  archiveDocument: (id: number, reason?: string): Promise<{ id: number }> =>
    post("archive_document", { id, reason }),

  downloadDocument: (id: number): Promise<{ file_data: string; filename: string; mime: string; size: number }> =>
    req(`/?action=document_download&id=${id}`),

  completeness: (scopeId: number): Promise<CompletenessResult> =>
    req(`/?action=completeness&scope_id=${scopeId}`),

  confirmStage: (scopeId: number): Promise<{ id: number }> => post("confirm_stage", { scope_id: scopeId }),

  unconfirmStage: (scopeId: number): Promise<{ id: number }> => post("unconfirm_stage", { scope_id: scopeId }),

  auditLog: (scopeId: number): Promise<{ items: AuditLogItem[] }> =>
    req(`/?action=audit_log&scope_id=${scopeId}`),
};