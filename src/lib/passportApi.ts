function getSession(): string {
  return localStorage.getItem("session_id") || "";
}

export const PROF_URL = "https://functions.poehali.dev/7a7bb043-f17f-4bfd-b1e1-aae69aa43036";

function sessionHdr() {
  const sid = getSession();
  return {
    "Content-Type": "application/json",
    ...(sid ? { "X-Session-Id": sid } : {}),
  };
}

async function pGet(action: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  return fetch(`${PROF_URL}/?${qs}`, { headers: sessionHdr() }).then(r => r.json());
}

async function pPost(action: string, body: object) {
  return fetch(`${PROF_URL}/?action=${action}`, {
    method: "POST", headers: sessionHdr(), body: JSON.stringify(body),
  }).then(r => r.json());
}

export const passportApi = {
  getMe:        ()        => pGet("professional_passport_get_me"),
  upsertMe:     (b: object) => pPost("professional_passport_upsert_me", b),
  completionMe: ()        => pGet("professional_passport_completion_me"),
  summaryMe:    ()        => pGet("professional_passport_summary_me"),

  eduList:      ()        => pGet("professional_education_list_me"),
  eduUpsert:    (b: object) => pPost("professional_education_upsert_me", b),
  eduDelete:    (id: number) => pPost("professional_education_delete_me", { id }),

  workList:     ()        => pGet("professional_work_experience_list_me"),
  workUpsert:   (b: object) => pPost("professional_work_experience_upsert_me", b),
  workDelete:   (id: number) => pPost("professional_work_experience_delete_me", { id }),

  visibilityGet:    ()        => pGet("professional_visibility_get_me"),
  visibilityUpsert: (b: object) => pPost("professional_visibility_upsert_me", b),
};