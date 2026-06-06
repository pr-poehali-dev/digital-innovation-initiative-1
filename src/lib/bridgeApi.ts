import { getAdminToken } from "@/lib/admin-api";

export const BRIDGE_URL = "https://functions.poehali.dev/e74b5863-44f8-4ddf-b5b8-6f9dd33434b4";

function sessionHdr() {
  const sid = localStorage.getItem("session_id") || "";
  return {
    "Content-Type": "application/json",
    ...(sid ? { "X-Session-Id": sid } : {}),
  };
}

function adminHdr() {
  return { "Content-Type": "application/json", "X-Admin-Token": getAdminToken() };
}

async function bPost(action: string, body: object = {}, useAdmin = false) {
  return fetch(`${BRIDGE_URL}?action=${action}`, {
    method: "POST",
    headers: useAdmin ? adminHdr() : sessionHdr(),
    body: JSON.stringify(body),
  }).then(r => r.json());
}

async function bGet(action: string, useAdmin = false) {
  return fetch(`${BRIDGE_URL}?action=${action}`, {
    headers: useAdmin ? adminHdr() : sessionHdr(),
  }).then(r => r.json());
}

export const bridgeApi = {
  // Admin actions (X-Admin-Token fallback когда BRIDGE_SERVICE_TOKEN не задан)
  backfill:    ()  => bPost("learning_completion_backfill", {}, true),
  replay:      ()  => bPost("learning_completion_replay",   {}, true),
  syncStatus:  ()  => bGet("learning_completion_sync_status", true),

  // User actions (X-Session-Id)
  evidenceList: () => bGet("learning_evidence_list", false),
};
