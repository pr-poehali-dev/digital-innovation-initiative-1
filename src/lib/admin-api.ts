const BASE = "https://functions.poehali.dev/e3e85012-90f7-4ae1-bb12-b829a56fa72b";
const TOKEN_KEY = "admin_token";

export function getAdminToken(): string {
  return sessionStorage.getItem(TOKEN_KEY) || "";
}

function setAdminToken(token: string) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

async function request(path: string, options: RequestInit = {}) {
  const token = getAdminToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-Admin-Token": token } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

const HQ_BASE = "https://functions.poehali.dev/d30df439-1b62-4d68-bc12-6124c4afa049";

async function hqRequest(path: string, options: RequestInit = {}) {
  const token = getAdminToken();
  const res = await fetch(`${HQ_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-Admin-Token": token } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export type HQGoalStatus = "planned" | "on_track" | "at_risk" | "done";
export type HQIdeaStatus  = "new" | "considering" | "in_plan" | "rejected" | "done";
export type HQRiskImpact  = "high" | "medium" | "low";
export type HQRiskStatus  = "open" | "mitigated" | "closed";

export const hqApi = {
  all: () => hqRequest("/?action=all"),

  saveBlock: (key: string, content: string) =>
    hqRequest("/?action=save_block", { method: "PUT", body: JSON.stringify({ key, content }) }),

  addGoal: (d: { title: string; horizon: string; status: HQGoalStatus; criterion: string }) =>
    hqRequest("/?action=add_goal", { method: "POST", body: JSON.stringify(d) }),
  updateGoal: (d: { id: number; title?: string; horizon?: string; status?: HQGoalStatus; criterion?: string }) =>
    hqRequest("/?action=update_goal", { method: "PUT", body: JSON.stringify(d) }),

  addDecision: (d: { what: string; why: string; changed: string; decided_at?: string }) =>
    hqRequest("/?action=add_decision", { method: "POST", body: JSON.stringify(d) }),

  addRisk: (d: { title: string; impact: HQRiskImpact; mitigation: string; status: HQRiskStatus }) =>
    hqRequest("/?action=add_risk", { method: "POST", body: JSON.stringify(d) }),
  updateRisk: (d: { id: number; title?: string; impact?: HQRiskImpact; mitigation?: string; status?: HQRiskStatus }) =>
    hqRequest("/?action=update_risk", { method: "PUT", body: JSON.stringify(d) }),

  addRule: (d: { category: string; rule_text: string; order_index?: number }) =>
    hqRequest("/?action=add_rule", { method: "POST", body: JSON.stringify(d) }),

  addIdea: (d: { title: string; why: string; priority: string; source: string }) =>
    hqRequest("/?action=add_idea", { method: "POST", body: JSON.stringify(d) }),
  updateIdea: (d: { id: number; title?: string; why?: string; priority?: string; status?: HQIdeaStatus; source?: string }) =>
    hqRequest("/?action=update_idea", { method: "PUT", body: JSON.stringify(d) }),
};

const PROJECT_BASE = "https://functions.poehali.dev/696f59af-1bfd-4efe-91bf-d8ce4e48ada4";

async function projectRequest(path: string, options: RequestInit = {}) {
  const token = getAdminToken();
  const res = await fetch(`${PROJECT_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { "X-Admin-Token": token } : {}), ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export type ProjectWaveStatus = "planned" | "in_progress" | "done";
export type ProjectItemStatus = "todo" | "in_progress" | "done";
export type ProjectGapType    = "gap" | "conflict" | "duplicate" | "unclear";
export type ProjectGapStatus  = "open" | "resolved";

export const projectApi = {
  all: () => projectRequest("/?action=all"),
  saveSection: (key: string, content: string) =>
    projectRequest("/?action=save_section", { method: "PUT", body: JSON.stringify({ key, content }) }),
  addGap: (d: { title: string; description: string; gap_type: ProjectGapType; status: ProjectGapStatus }) =>
    projectRequest("/?action=add_gap", { method: "POST", body: JSON.stringify(d) }),
  updateGap: (d: { id: number; title?: string; description?: string; gap_type?: ProjectGapType; status?: ProjectGapStatus }) =>
    projectRequest("/?action=update_gap", { method: "PUT", body: JSON.stringify(d) }),
  addDecision: (d: { what: string; why: string; changed: string }) =>
    projectRequest("/?action=add_decision", { method: "POST", body: JSON.stringify(d) }),
  addWave: (d: { title: string; goal: string; status: ProjectWaveStatus }) =>
    projectRequest("/?action=add_wave", { method: "POST", body: JSON.stringify(d) }),
  updateWave: (d: { id: number; title?: string; goal?: string; status?: ProjectWaveStatus }) =>
    projectRequest("/?action=update_wave", { method: "PUT", body: JSON.stringify(d) }),
  addWaveItem: (d: { wave_id: number; title: string }) =>
    projectRequest("/?action=add_wave_item", { method: "POST", body: JSON.stringify(d) }),
  updateWaveItem: (d: { id: number; title?: string; status?: ProjectItemStatus }) =>
    projectRequest("/?action=update_wave_item", { method: "PUT", body: JSON.stringify(d) }),
};

export const adminApi = {
  async me() {
    return request("?action=me");
  },

  async login(email: string, password: string) {
    const result = await request("?action=login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (result.ok && result.data.token) {
      setAdminToken(result.data.token);
    }
    return result;
  },

  async logout() {
    const result = await request("?action=logout", { method: "POST" });
    setAdminToken("");
    return result;
  },
};