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

const PASSPORT_BASE = "https://functions.poehali.dev/7a808b5e-cd1e-4e96-9fcb-e4d11cf9006a";

async function ppReq(path: string, options: RequestInit = {}) {
  const token = getAdminToken();
  const res = await fetch(`${PASSPORT_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { "X-Admin-Token": token } : {}), ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export type PPModuleStatus   = "active" | "planned" | "deprecated" | "draft";
export type PPModuleCategory = "platform" | "operations" | "content" | "analytics" | "support" | "finance" | "domain";
export type PPEntityKind     = "business" | "system" | "content" | "analytics" | "support" | "finance" | "internal";
export type PPOverlapType    = "duplicate" | "overlap" | "responsibility_gap" | "unclear_boundary" | "missing_owner";
export type PPOverlapStatus  = "open" | "resolved";
export type PPDepType        = "reads" | "writes" | "auth" | "navigation" | "shared_ui" | "background_job" | "reporting";

export const passportApi = {
  all: () => ppReq("/?action=all"),

  addModule: (d: Record<string, string>) =>
    ppReq("/?action=add_module", { method: "POST", body: JSON.stringify(d) }),
  updateModule: (d: Record<string, string | number>) =>
    ppReq("/?action=update_module", { method: "PUT", body: JSON.stringify(d) }),

  addRoute: (d: { module_id: number; title: string; route: string; route_type?: string; description?: string; status?: string; owner_email?: string }) =>
    ppReq("/?action=add_route", { method: "POST", body: JSON.stringify(d) }),
  updateRoute: (d: Record<string, string | number>) =>
    ppReq("/?action=update_route", { method: "PUT", body: JSON.stringify(d) }),

  addEntity: (d: Record<string, string | number | null>) =>
    ppReq("/?action=add_entity", { method: "POST", body: JSON.stringify(d) }),
  updateEntity: (d: Record<string, string | number | null>) =>
    ppReq("/?action=update_entity", { method: "PUT", body: JSON.stringify(d) }),

  addDependency: (d: { from_module_id: number; to_module_id: number; dep_type?: string; criticality?: string; notes?: string }) =>
    ppReq("/?action=add_dependency", { method: "POST", body: JSON.stringify(d) }),

  addOverlap: (d: { title: string; overlap_type?: string; description?: string; related_module_id?: number | null; resolution?: string }) =>
    ppReq("/?action=add_overlap", { method: "POST", body: JSON.stringify(d) }),
  updateOverlap: (d: Record<string, string | number | null>) =>
    ppReq("/?action=update_overlap", { method: "PUT", body: JSON.stringify(d) }),

  saveNotes: (content: string) =>
    ppReq("/?action=save_notes", { method: "PUT", body: JSON.stringify({ content }) }),
};

const OPS_BASE = "https://functions.poehali.dev/7730f705-e699-49ac-9cda-1aafb13a0bad";

async function opsReq(path: string, options: RequestInit = {}) {
  const token = getAdminToken();
  const res = await fetch(`${OPS_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { "X-Admin-Token": token } : {}), ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export type OpsErrorSeverity = "low" | "medium" | "high" | "critical";
export type OpsErrorStatus   = "open" | "investigating" | "muted" | "resolved";
export type OpsAlertSeverity = "low" | "medium" | "high" | "critical";
export type OpsAlertStatus   = "active" | "triggered" | "muted" | "resolved";
export type OpsFlagStatus    = "active" | "planned" | "deprecated";

export const opsApi = {
  allErrors: () => opsReq("/?action=all&module=errors"),
  addError:  (d: Record<string, unknown>) => opsReq("/?action=add_error",  { method: "POST", body: JSON.stringify(d) }),
  updateError:(d: Record<string, unknown>) => opsReq("/?action=update_error",{ method: "PUT",  body: JSON.stringify(d) }),

  allAlerts: () => opsReq("/?action=all&module=alerts"),
  addAlert:  (d: Record<string, unknown>) => opsReq("/?action=add_alert",  { method: "POST", body: JSON.stringify(d) }),
  updateAlert:(d: Record<string, unknown>) => opsReq("/?action=update_alert",{ method: "PUT",  body: JSON.stringify(d) }),

  allFlags: () => opsReq("/?action=all&module=flags"),
  addFlag:  (d: Record<string, unknown>) => opsReq("/?action=add_flag",   { method: "POST", body: JSON.stringify(d) }),
  updateFlag:(d: Record<string, unknown>) => opsReq("/?action=update_flag", { method: "PUT",  body: JSON.stringify(d) }),
  toggleFlag:(id: number)                 => opsReq("/?action=toggle_flag", { method: "PUT",  body: JSON.stringify({ id }) }),
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