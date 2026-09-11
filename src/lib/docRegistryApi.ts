import { accessHeaders } from "./execAccess";

const BASE = "https://functions.poehali.dev/feb518ba-54d9-4ef9-9ca2-bc7136497969";

export interface DocMaterial {
  material_kind: "source" | "entry";
  id: number;
  title: string;
  display_title: string;
  type_code: string;
  source_status: string;
  revision_id: number | null;
  revision_label: string | null;
  origin_kind: string;
  processing_state: string;
  verification_state: string;
  applicability: string;
  file_presence: string;
  ai_usage_policy: string;
  updated_at: string;
  chunk_count: number;
  page_count: number;
}

export interface DocCitation {
  document: string;
  original_title: string;
  source_status: string;
  revision: string;
  page: string;
  clause: string;
  fragment_ref: string;
  quote: string;
  verification: string;
  origin_kind: string;
}

export interface ContextFragment {
  chunk_id: number;
  document: string;
  page: string;
  verification: string;
  origin_kind: string;
  chars: number;
  text: string;
}

export interface ContextPreview {
  query: string;
  would_send_fragments: number;
  would_send_chars: number;
  budget: number;
  fragments: ContextFragment[];
  excluded_by_policy: number;
  note: string;
}

export interface SearchResult {
  chunks: Array<{
    hit_kind: string;
    chunk_id: number;
    chunk_index: number;
    char_start: number | null;
    char_end: number | null;
    preview: string;
    source_id: number;
    document: string;
    verification_state: string;
    origin_kind: string;
    page_number: number | null;
  }>;
  entries: Array<{
    hit_kind: string;
    entry_id: number;
    entry_type: string;
    document: string;
    preview: string;
    origin_kind: string;
    verification_state: string;
    ai_usage_policy: string;
  }>;
}

export interface LegacyMapItem {
  legacy_id: number;
  target_kind: string;
  target_title: string | null;
  migration_note: string | null;
  migrated_at: string;
}

async function req(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...accessHeaders() },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data?.error?.message || "Ошибка загрузки данных");
  return data.data;
}

export const docRegistryApi = {
  list: (): Promise<{ items: DocMaterial[] }> => req("/?action=list"),

  get: (kind: string, id: number): Promise<Record<string, unknown>> =>
    req(`/?action=get&kind=${kind}&id=${id}`),

  citation: (chunkId: number): Promise<DocCitation> =>
    req(`/?action=citation&chunk_id=${chunkId}`),

  search: (q: string): Promise<SearchResult> =>
    req(`/?action=search&q=${encodeURIComponent(q)}`),

  previewContext: (q: string): Promise<ContextPreview> =>
    req(`/?action=preview_context&q=${encodeURIComponent(q)}`),

  legacyMap: (): Promise<{ items: LegacyMapItem[] }> => req("/?action=legacy_map"),
};
