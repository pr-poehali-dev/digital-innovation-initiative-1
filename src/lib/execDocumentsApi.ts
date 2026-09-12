import { accessHeaders } from "./execAccess";

// exec-reports: шаблоны, черновики/опубликованные версии, пакеты руководителя.
const REPORTS_BASE = "https://functions.poehali.dev/1ae4fb17-e225-4a89-a0e2-0bbb8db14a29";
// exec-control: повестка/протокол — расширение уже существующих встреч.
const CONTROL_BASE = "https://functions.poehali.dev/662c8b92-fe3c-4b24-b1ee-50765f111ea4";

async function req(base: string, path: string, options: RequestInit = {}) {
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...accessHeaders(), ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data?.error?.message || "Ошибка загрузки данных");
  return data.data;
}

const reportsGet = (path: string) => req(REPORTS_BASE, path);
const reportsPost = (action: string, body: unknown) =>
  req(REPORTS_BASE, `/?action=${action}`, { method: "POST", body: JSON.stringify(body) });
const controlPost = (action: string, body: unknown) =>
  req(CONTROL_BASE, `/?action=${action}`, { method: "POST", body: JSON.stringify(body) });
const controlGet = (path: string) => req(CONTROL_BASE, path);

export type DocType =
  | "weekly_report" | "monthly_report" | "actions_report" | "portfolio_report" | "project_card"
  | "initiative_brief" | "risks_issues_brief" | "budget_planfact" | "resource_plan" | "goals_kpi_report"
  | "results_effects_brief" | "decision_draft" | "meeting_agenda" | "meeting_protocol" | "executive_package";

export type TemplateStatus = "draft" | "review" | "approved" | "superseded" | "archived";
export type DocVersionStatus = "draft" | "published";

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  weekly_report: "Недельная справка", monthly_report: "Месячная справка",
  actions_report: "Отчёт по поручениям", portfolio_report: "Отчёт по портфелю",
  project_card: "Карточка проекта", initiative_brief: "Справка по инициативе",
  risks_issues_brief: "Справка по рискам и проблемам", budget_planfact: "Финансовый план-факт",
  resource_plan: "Ресурсный план", goals_kpi_report: "Отчёт по целям и KPI",
  results_effects_brief: "Справка по результатам и эффектам", decision_draft: "Проект управленческого решения",
  meeting_agenda: "Повестка совещания", meeting_protocol: "Протокол совещания",
  executive_package: "Пакет руководителя",
};

export const TEMPLATE_STATUS_LABEL: Record<TemplateStatus, string> = {
  draft: "Черновик", review: "На проверке", approved: "Утверждён",
  superseded: "Заменён новой версией", archived: "Архивирован",
};

export interface DocTemplate {
  id: number;
  code: string | null;
  title: string;
  doc_type: DocType;
  purpose: string | null;
  recipient: string | null;
  sections_json: string;
  version_number: number;
  status: TemplateStatus;
  valid_from: string | null;
  valid_to: string | null;
  author: string | null;
  approved_at: string | null;
  approved_by: string | null;
  available_formats: string;
  required_sources: string | null;
  comment: string | null;
  replaced_by_id: number | null;
  is_test_data: boolean;
  created_at: string;
}

export interface DocVersionSummary {
  id: number;
  title: string;
  template_id: number;
  doc_type: DocType;
  period_from: string | null;
  period_to: string | null;
  status: DocVersionStatus;
  version_group: string;
  version_number: number;
  author: string | null;
  created_at: string;
  published_at: string | null;
  payload_sha256: string | null;
  is_test_data: boolean;
}

export interface DocVersion extends DocVersionSummary {
  template_title: string;
  available_formats: string;
  params_json: string | null;
  payload: Record<string, unknown> | null;
  integrity_ok: boolean | null;
  quality_warnings: string[];
  knowledge_entry_id: number | null;
}

export interface ExecPackageSummary {
  id: number;
  title: string;
  recipient: string | null;
  period_from: string | null;
  period_to: string | null;
  status: DocVersionStatus;
  version_group: string;
  version_number: number;
  author: string | null;
  created_at: string;
  published_at: string | null;
}

export interface ExecPackage extends ExecPackageSummary {
  sections: { key: string; title: string; doc_version_id?: number }[];
  payload: { sections: { key: string; title: string; doc_version_id?: number; doc_title?: string }[] };
  payload_sha256: string | null;
  integrity_ok: boolean | null;
  comment: string | null;
}

export interface MeetingSnapshot {
  payload: Record<string, unknown>;
  payload_sha256: string;
  published_at: string;
  integrity_ok: boolean;
}

export const execDocumentsApi = {
  docTypes: (): Promise<{ doc_types: DocType[]; placeholders: Record<string, string> }> =>
    reportsGet("/?action=doc_types"),

  templates: (docType?: DocType, includeTestData = false): Promise<{ items: DocTemplate[] }> =>
    reportsGet(`/?action=doc_templates${docType ? `&doc_type=${docType}` : ""}${includeTestData ? "&include_test_data=1" : ""}`),
  template: (id: number): Promise<DocTemplate> => reportsGet(`/?action=doc_template&id=${id}`),
  saveTemplate: (payload: Partial<DocTemplate>): Promise<{ id: number }> => reportsPost("save_doc_template", payload),

  versions: (templateId?: number, status?: DocVersionStatus, includeTestData = false): Promise<{ items: DocVersionSummary[] }> =>
    reportsGet(`/?action=doc_versions${templateId ? `&template_id=${templateId}` : ""}${status ? `&status=${status}` : ""}${includeTestData ? "&include_test_data=1" : ""}`),
  version: (id: number): Promise<DocVersion> => reportsGet(`/?action=doc_version&id=${id}`),
  saveDraft: (payload: { id?: number; template_id?: number; title?: string; params: Record<string, unknown>; is_test_data?: boolean }):
    Promise<{ id: number; warnings: string[] }> => reportsPost("save_doc_draft", payload),
  publish: (id: number): Promise<{ id: number; version_number: number; payload_sha256: string; knowledge_entry_id: number }> =>
    reportsPost("publish_doc_version", { id }),

  exportHtml: async (id: number): Promise<string> => {
    const res = await fetch(`${REPORTS_BASE}/?action=export_doc_html&id=${id}`, { headers: accessHeaders() });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error?.message || "Ошибка экспорта");
    }
    return res.text();
  },
  exportXlsx: (id: number): Promise<{ filename: string; content_base64: string }> =>
    reportsGet(`/?action=export_doc_xlsx&id=${id}`),
  exportDocx: (id: number): Promise<{ filename: string; content_base64: string }> =>
    reportsGet(`/?action=export_doc_docx&id=${id}`),

  packages: (includeTestData = false): Promise<{ items: ExecPackageSummary[] }> =>
    reportsGet(`/?action=packages${includeTestData ? "&include_test_data=1" : ""}`),
  package: (id: number): Promise<ExecPackage> => reportsGet(`/?action=package&id=${id}`),
  savePackage: (payload: {
    id?: number; title?: string; recipient?: string; period_from?: string; period_to?: string;
    sections: { key: string; title: string; doc_version_id?: number }[]; comment?: string; is_test_data?: boolean;
  }): Promise<{ id: number }> => reportsPost("save_package", payload),
  publishPackage: (id: number): Promise<{ id: number; version_number: number; payload_sha256: string }> =>
    reportsPost("publish_package", { id }),

  publishAgenda: (meetingId: number): Promise<{ meeting_id: number; payload_sha256: string }> =>
    controlPost("publish_agenda", { meeting_id: meetingId }),
  publishProtocol: (meetingId: number): Promise<{ meeting_id: number; payload_sha256: string }> =>
    controlPost("publish_protocol", { meeting_id: meetingId }),
  meetingAgenda: (meetingId: number): Promise<MeetingSnapshot> => controlGet(`/?action=meeting_agenda&id=${meetingId}`),
  meetingProtocol: (meetingId: number): Promise<MeetingSnapshot> => controlGet(`/?action=meeting_protocol&id=${meetingId}`),
};
