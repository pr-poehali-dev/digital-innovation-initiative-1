import { accessHeaders } from "./execAccess";

const BASE = "https://functions.poehali.dev/e5ae8865-a58c-4be1-8cbf-a3afdf08a1b7";

export type DataKind = "fact" | "calc" | "expert" | "target";
export type SlideGroup = "intro" | "current" | "target" | "conclusion";

export const DATA_KIND_LABEL: Record<DataKind, { title: string; cls: string }> = {
  fact: { title: "Факт", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  calc: { title: "Расчёт", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  expert: { title: "Экспертная оценка", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  target: { title: "Целевое значение", cls: "bg-violet-50 text-violet-700 border-violet-200" },
};

export const SLIDE_GROUP_LABEL: Record<SlideGroup, string> = {
  intro: "Введение",
  current: "Текущее состояние",
  target: "Целевая модель",
  conclusion: "Выводы и решения",
};

export interface DeckSlide {
  key: string;
  catalog_title: string;
  group: SlideGroup;
  data_kind: DataKind;
  checks: string[];
  is_ready: boolean;
  missing_checks: string[];
  order_index: number;
  is_included: boolean;
  title_override: string | null;
  thesis_text: string | null;
  narrative_text: string | null;
  speaker_notes: string | null;
  has_override: boolean;
}

export interface ExpertValue {
  id: number;
  center_id: number;
  metric_key: string;
  value_text: string;
  unit: string | null;
  comment: string | null;
  created_by: string | null;
  updated_at: string;
}

export interface DeckData {
  center: { id: number; title: string; status: string } | null;
  slides: DeckSlide[];
  expert_values: ExpertValue[];
  readiness: Record<string, boolean>;
}

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

export const deckApi = {
  deck: (centerId?: number): Promise<DeckData> =>
    req(`/?action=deck${centerId ? `&center_id=${centerId}` : ""}`),

  saveSlide: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("save_slide", data),

  reorderSlides: (centerId: number, order: string[]): Promise<{ updated: number }> =>
    post("reorder_slides", { center_id: centerId, order }),

  saveExpertValue: (data: Record<string, unknown>): Promise<{ id: number }> =>
    post("save_expert_value", data),

  deleteExpertValue: (id: number) => post("delete_expert_value", { id }),
};

/** Понятная подпись источника данных для показа на слайде и в детализации. */
export function sourceLabel(kind: DataKind): string {
  switch (kind) {
    case "fact":
      return "Подтверждено задачами, назначениями и трудозатратами кабинета";
    case "calc":
      return "Рассчитано по данным кабинета и заданным параметрам";
    case "expert":
      return "Внесено вручную как экспертная оценка для моделирования";
    case "target":
      return "Относится к целевой структуре, ещё не действует фактически";
  }
}
