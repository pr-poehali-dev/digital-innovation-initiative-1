export const PUB_URL = "https://functions.poehali.dev/c1b03e64-6f0c-427e-b947-2b09346a844d";

function sessionHdr() {
  const sid = localStorage.getItem("session_id") || "";
  return {
    "Content-Type": "application/json",
    ...(sid ? { "X-Session-Id": sid } : {}),
  };
}

async function pGet(action: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  return fetch(`${PUB_URL}/?${qs}`, { headers: sessionHdr() }).then(r => r.json());
}

async function pPost(action: string, body: object = {}) {
  return fetch(`${PUB_URL}/?action=${action}`, {
    method: "POST", headers: sessionHdr(), body: JSON.stringify(body),
  }).then(r => r.json());
}

export type PublicSettings = {
  id: number; user_id: number; is_published: boolean;
  public_slug: string; public_url: string;
  public_title: string | null; public_summary: string | null;
  show_headline: boolean; show_bio: boolean; show_location: boolean;
  show_roles: boolean; show_experience: boolean; show_education: boolean;
  show_links: boolean; show_competency_strengths: boolean;
  show_verified_evidence_summary: boolean; show_availability: boolean;
  show_contact: boolean; allow_indexing: boolean;
  published_at: string | null; updated_at: string;
};

export type PublicView = {
  full_name: string; primary_role: string; years_experience: number | null;
  headline?: string; bio?: string; location?: string;
  secondary_roles?: string[]; links?: Record<string, string>;
  available_for_roles?: boolean; availability_note?: string;
  experience?: { company_name: string; title: string; employment_type: string; start_date: string | null; end_date: string | null; is_current: boolean; description: string }[];
  education?: { institution: string; degree: string; field_of_study: string; start_date: string | null; end_date: string | null; is_current: boolean }[];
  strengths?: { name: string; level: number }[];
  verified_signals?: { learning_evidence_count: number; competencies_assessed: number };
};

export const publicProfileApi = {
  getMe:         ()             => pGet("public_profile_get_me"),
  upsertMe:      (b: object)    => pPost("public_profile_upsert_me", b),
  generateSlug:  (hint?: string) => pPost("public_profile_generate_slug_me", hint ? { hint } : {}),
  checkSlug:     (slug: string) => pGet("public_profile_slug_check", { slug }),
  publish:       ()             => pPost("public_profile_publish_me"),
  unpublish:     ()             => pPost("public_profile_unpublish_me"),
  previewMe:     ()             => pGet("public_profile_preview_me"),
  getBySlug:     (slug: string) => fetch(`${PUB_URL}/?action=public_profile_get_by_slug&slug=${encodeURIComponent(slug)}`).then(r => r.json()),
};

