import { getAdminToken } from "@/lib/admin-api";

export const PROF_URL = "https://functions.poehali.dev/7a7bb043-f17f-4bfd-b1e1-aae69aa43036";

export function profHdr() {
  return { "Content-Type": "application/json", "X-Admin-Token": getAdminToken() };
}

async function profGet(action: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  return fetch(`${PROF_URL}/?${qs}`, { headers: profHdr() }).then(r => r.json());
}

async function profPost(action: string, body: object) {
  return fetch(`${PROF_URL}/?action=${action}`, {
    method: "POST", headers: profHdr(), body: JSON.stringify(body),
  }).then(r => r.json());
}

export const profApi = {
  domainsList:         ()                       => profGet("professional_domains_list"),
  competenciesList:    (domain_id?: number)     => profGet("professional_competencies_list", domain_id ? { domain_id: String(domain_id) } : {}),
  competencyUpsert:    (b: object)              => profPost("professional_competency_upsert", b),
  competencyDelete:    (id: number)             => profPost("professional_competency_delete", { id }),

  roleProfilesList:    ()                       => profGet("professional_role_profiles_list"),
  roleProfileGet:      (id: number)             => profGet("professional_role_profile_get", { id: String(id) }),
  roleProfileUpsert:   (b: object)              => profPost("professional_role_profile_upsert", b),
  roleProfileTargetsUpsert: (b: object)         => profPost("professional_role_profile_targets_upsert", b),

  userCompetencyMapGet: (user_id: number, role_id?: number) =>
    profGet("professional_user_competency_map_get", { user_id: String(user_id), ...(role_id ? { role_id: String(role_id) } : {}) }),
  userCompetencyUpsert:   (b: object)           => profPost("professional_user_competency_upsert", b),
  evidenceAdd:            (b: object)           => profPost("professional_competency_evidence_add", b),
  evidenceDelete:         (id: number)          => profPost("professional_competency_evidence_delete", { id }),
  gapSummary:             (user_id: number, role_id: number) =>
    profGet("professional_competency_gap_summary", { user_id: String(user_id), role_id: String(role_id) }),

  // W9.1 Content Links (admin)
  contentLinksList:   (competency_id?: number)  =>
    profGet("professional_competency_content_links_list", competency_id ? { competency_id: String(competency_id) } : {}),
  contentLinkUpsert:  (b: object)              => profPost("professional_competency_content_link_upsert", b),
  contentLinkDelete:  (id: number)             => profPost("professional_competency_content_link_delete", { id }),
  contentCatalog:     (params?: Record<string, string>) =>
    profGet("professional_learning_content_catalog_list", params ?? {}),
};