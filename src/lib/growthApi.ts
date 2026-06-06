export const GROWTH_URL = "https://functions.poehali.dev/a2a56d8c-b137-47ce-802f-3587685ae8f9";

function sessionHdr() {
  const sid = localStorage.getItem("session_id") || "";
  return {
    "Content-Type": "application/json",
    ...(sid ? { "X-Session-Id": sid } : {}),
  };
}

async function gGet(action: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  return fetch(`${GROWTH_URL}/?${qs}`, { headers: sessionHdr() }).then(r => r.json());
}

async function gPost(action: string, body: object) {
  return fetch(`${GROWTH_URL}/?action=${action}`, {
    method: "POST", headers: sessionHdr(), body: JSON.stringify(body),
  }).then(r => r.json());
}

export const growthApi = {
  gapSummary:     (role_id: number)  => gGet("professional_growth_gap_summary_me", { role_id: String(role_id) }),
  planGet:        ()                 => gGet("professional_growth_plan_get_me"),
  planGenerate:   (b: object)        => gPost("professional_growth_plan_generate_me", b),
  planArchive:    (plan_id: number)  => gPost("professional_growth_plan_archive_me", { plan_id }),
  itemAdd:        (b: object)        => gPost("professional_growth_plan_item_add_me", b),
  itemUpdate:     (b: object)        => gPost("professional_growth_plan_item_update_me", b),
  itemDelete:     (id: number)       => gPost("professional_growth_plan_item_delete_me", { id }),
  progress:       ()                 => gGet("professional_growth_progress_me"),
  recommendations:()                 => gGet("professional_growth_recommendations_me"),
  checkinAdd:     (b: object)        => gPost("professional_growth_checkin_add_me", b),
};
