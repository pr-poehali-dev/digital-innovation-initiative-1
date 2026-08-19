import { getAdminToken } from "./admin-api";

const BASE = "https://functions.poehali.dev/58378670-e112-4637-96f6-4038752e472c";

export type SlideLayout = "cover" | "content" | "metrics" | "process" | "roles" | "quote" | "closing";

export type BlockKind =
  | "text"
  | "bullets"
  | "metrics"
  | "cards"
  | "steps"
  | "roles"
  | "quote"
  | "banner"
  | "table";

export interface Block {
  id: string;
  kind: BlockKind;
  // text
  text?: string;
  // bullets
  items?: string[];
  // metrics: [{value,label,color}]
  metrics?: { value: string; label: string; color?: string }[];
  // cards: [{icon,title,text,color}]
  cards?: { icon?: string; title: string; text?: string; color?: string; status?: string }[];
  // steps (process): [{title,text,color}]
  steps?: { title: string; text?: string; color?: string }[];
  // roles: [{title,text,color,icon}]
  roles?: { title: string; text?: string; color?: string; icon?: string }[];
  // quote
  author?: string;
  // banner
  color?: string;
  // table
  headers?: string[];
  rows?: string[][];
}

export interface Slide {
  id: number;
  presentation_id: number;
  order_index: number;
  layout: SlideLayout;
  title: string;
  subtitle: string;
  blocks: Block[];
  created_at: string;
  updated_at: string;
}

export interface Presentation {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  cover_icon: string;
  cover_color: string;
  is_published: boolean;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
  slides_count?: number;
}

function authHeaders(): Record<string, string> {
  const token = getAdminToken();
  return token ? { "X-Admin-Token": token } : {};
}

async function req(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data?.error?.message || "Ошибка загрузки данных");
  return data.data;
}

export const bizPresentationsApi = {
  list: (): Promise<{ items: Presentation[] }> => req("/?action=list"),

  get: (id: number): Promise<{ presentation: Presentation; slides: Slide[] }> =>
    req(`/?action=get&id=${id}`),

  publicGet: (slug: string): Promise<{ presentation: Presentation; slides: Slide[] }> =>
    req(`/?action=public_get&slug=${encodeURIComponent(slug)}`),

  create: (p: {
    title: string;
    subtitle?: string;
    cover_icon?: string;
    cover_color?: string;
    slug?: string;
  }): Promise<{ id: number; slug: string }> =>
    req("/?action=create", { method: "POST", body: JSON.stringify(p) }),

  update: (p: {
    id: number;
    title?: string;
    subtitle?: string;
    cover_icon?: string;
    cover_color?: string;
    is_published?: boolean;
    slug?: string;
  }): Promise<{ id: number }> =>
    req("/?action=update", { method: "PUT", body: JSON.stringify(p) }),

  remove: (id: number): Promise<{ id: number }> =>
    req(`/?action=delete&id=${id}`, { method: "DELETE" }),

  slideAdd: (p: {
    presentation_id: number;
    layout?: SlideLayout;
    title?: string;
    subtitle?: string;
    blocks?: Block[];
    order_index?: number;
  }): Promise<{ id: number }> =>
    req("/?action=slide_add", { method: "POST", body: JSON.stringify(p) }),

  slideUpdate: (p: {
    id: number;
    layout?: SlideLayout;
    title?: string;
    subtitle?: string;
    blocks?: Block[];
    order_index?: number;
  }): Promise<{ id: number }> =>
    req("/?action=slide_update", { method: "PUT", body: JSON.stringify(p) }),

  slideDelete: (id: number): Promise<{ id: number }> =>
    req(`/?action=slide_delete&id=${id}`, { method: "DELETE" }),

  slideReorder: (order: number[]): Promise<{ updated: number }> =>
    req("/?action=slide_reorder", { method: "PUT", body: JSON.stringify({ order }) }),
};

export const LAYOUT_LABEL: Record<SlideLayout, string> = {
  cover: "Обложка",
  content: "Контент",
  metrics: "Метрики",
  process: "Процесс",
  roles: "Роли",
  quote: "Цитата",
  closing: "Финал",
};

export const COVER_COLORS = [
  { code: "violet", label: "Фиолетовый", from: "from-violet-600", to: "to-fuchsia-600" },
  { code: "blue", label: "Синий", from: "from-blue-600", to: "to-indigo-600" },
  { code: "orange", label: "Оранжевый", from: "from-orange-500", to: "to-amber-500" },
  { code: "emerald", label: "Зелёный", from: "from-emerald-500", to: "to-teal-600" },
  { code: "pink", label: "Розовый", from: "from-pink-500", to: "to-rose-500" },
];
