import { accessHeaders } from "./execAccess";

const BASE = "https://functions.poehali.dev/5ea8e523-6fca-49a4-b178-0a4726bc89d2";

export interface KnowledgeItem {
  id: number;
  title: string;
  doc_type: string;
  summary: string | null;
  filename: string | null;
  file_type: string | null;
  file_size: number | null;
  page_count: number | null;
  extracted_length: number | null;
  use_in_ai: boolean;
  priority: number;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  has_text: boolean;
  chunks: number;
}

export interface KnowledgeDetail extends KnowledgeItem {
  body: string | null;
  s3_key: string | null;
}

export const DOC_TYPE_LABEL: Record<string, string> = {
  rule: "Регламент",
  matrix: "Матрица ответственности",
  policy: "Политика",
  method: "Методика",
  template: "Шаблон",
  note: "Вводная",
  other: "Другое",
};

export const DOC_TYPE_STYLE: Record<string, string> = {
  rule: "bg-violet-100 text-violet-700 border-violet-200",
  matrix: "bg-blue-50 text-blue-700 border-blue-200",
  policy: "bg-amber-50 text-amber-700 border-amber-200",
  method: "bg-emerald-50 text-emerald-700 border-emerald-200",
  template: "bg-cyan-50 text-cyan-700 border-cyan-200",
  note: "bg-slate-100 text-slate-600 border-slate-200",
  other: "bg-slate-100 text-slate-600 border-slate-200",
};

export const DOC_TYPE_ICON: Record<string, string> = {
  rule: "BookMarked",
  matrix: "Grid3x3",
  policy: "Shield",
  method: "Compass",
  template: "Copy",
  note: "StickyNote",
  other: "File",
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

export const knowledgeApi = {
  list: (): Promise<{ items: KnowledgeItem[]; doc_types: Record<string, string> }> =>
    req("/?action=list"),

  get: (id: number): Promise<KnowledgeDetail> => req(`/?action=get&id=${id}`),

  saveNote: (data: {
    id?: number;
    title: string;
    doc_type: string;
    summary?: string;
    body: string;
    use_in_ai?: boolean;
    priority?: number;
  }): Promise<{ id: number }> => post("save_note", data),

  upload: (data: {
    filename: string;
    file_data: string;
    title?: string;
    doc_type: string;
    summary?: string;
    use_in_ai?: boolean;
    priority?: number;
  }): Promise<{ id: number; chunks: number; length: number }> => post("upload", data),

  toggleAi: (id: number, useInAi: boolean): Promise<{ id: number; use_in_ai: boolean }> =>
    post("toggle_ai", { id, use_in_ai: useInAi }),

  remove: (id: number): Promise<{ id: number }> => post("delete", { id }),
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
