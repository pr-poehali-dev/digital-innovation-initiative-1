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

export type HQSummary = {
  modules_total: number; modules_active: number;
  waves_total: number; waves_done: number; current_wave: number | null;
  goals_total: number; goals_on_track: number;
  risks_open: number;
  tickets_active: number; tickets_urgent: number; messages_24h: number;
  db_tables_total: number;
};

export const hqApi = {
  all:     () => hqRequest("/?action=all"),
  summary: () => hqRequest("/?action=summary"),

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

const AI_CTX_BASE = "https://functions.poehali.dev/ae7057d8-becb-483d-9353-4858fadc5fbd";

async function aiCtxReq(path: string) {
  const token = getAdminToken();
  const res = await fetch(`${AI_CTX_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(token ? { "X-Admin-Token": token } : {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export type AiCtxScope = "full" | "hq" | "project" | "passport";
export type FreshnessStatus = "fresh" | "changed" | "never_exported";

export type AiFreshness = {
  status: FreshnessStatus;
  changed_sections: string[];
  last_exported_at: string | null;
  last_exported_by: string | null;
  last_hash: string | null;
};

export const aiContextApi = {
  export: (scope: AiCtxScope = "full") =>
    aiCtxReq(`/?action=export&format=json&scope=${scope}`),
  status: (scope: AiCtxScope = "full") =>
    aiCtxReq(`/?action=status&scope=${scope}`),
};

const TICKETS_BASE = "https://functions.poehali.dev/d5e57a3f-a793-4f65-849e-8f084619e51d";

async function ticketsReq(path: string, options: RequestInit = {}) {
  const token = getAdminToken();
  const res = await fetch(`${TICKETS_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { "X-Admin-Token": token } : {}), ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export type TicketStatus   = "new" | "open" | "pending" | "waiting_user" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type TicketMsgType  = "public_reply" | "internal_note" | "system_event";

export const ticketsApi = {
  summary:    ()                          => ticketsReq("/?action=tickets_summary"),
  all:        (params: Record<string,string> = {}) => {
    const qs = new URLSearchParams({ action: "tickets_all", ...params }).toString();
    return ticketsReq(`/?${qs}`);
  },
  get:        (id: number)                => ticketsReq(`/?action=ticket_get&id=${id}`),
  add:        (d: Record<string,unknown>) => ticketsReq("/?action=add_ticket",    { method: "POST", body: JSON.stringify(d) }),
  update:     (d: Record<string,unknown>) => ticketsReq("/?action=update_ticket", { method: "PUT",  body: JSON.stringify(d) }),
  messages:   (ticket_id: number)         => ticketsReq(`/?action=ticket_messages&ticket_id=${ticket_id}`),
  addMessage: (d: Record<string,unknown>) => ticketsReq("/?action=add_ticket_message", { method: "POST", body: JSON.stringify(d) }),
};

const CONTENT_BASE = "https://functions.poehali.dev/7689e249-e586-4718-9f88-7602f8b22c51";

async function contentReq(path: string, options: RequestInit = {}) {
  const token = getAdminToken();
  const res = await fetch(`${CONTENT_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { "X-Admin-Token": token } : {}), ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export type ContentType     = "announcement" | "release_note" | "faq" | "guide" | "article" | "template";
export type ContentStatus   = "draft" | "review" | "published" | "archived";
export type CommChannel     = "in_app" | "email" | "system";
export type CommStatus      = "draft" | "scheduled" | "sent" | "failed" | "cancelled";
export type ContentAudience = "all" | "learners" | "admins" | "support" | "project_team";

export const contentApi = {
  contentSummary:       ()                          => contentReq("/?action=content_summary"),
  contentList:          (p: Record<string,string> = {}) => {
    const qs = new URLSearchParams({ action: "content_list", ...p }).toString();
    return contentReq(`/?${qs}`);
  },
  contentGet:           (id: number)                => contentReq(`/?action=content_get&id=${id}`),
  addContent:           (d: Record<string,unknown>) => contentReq("/?action=add_content",     { method: "POST", body: JSON.stringify(d) }),
  updateContent:        (d: Record<string,unknown>) => contentReq("/?action=update_content",  { method: "PUT",  body: JSON.stringify(d) }),
  publishContent:       (id: number)                => contentReq("/?action=publish_content", { method: "POST", body: JSON.stringify({ id }) }),
  archiveContent:       (id: number)                => contentReq("/?action=archive_content", { method: "POST", body: JSON.stringify({ id }) }),

  commSummary:          ()                          => contentReq("/?action=communications_summary"),
  commList:             (p: Record<string,string> = {}) => {
    const qs = new URLSearchParams({ action: "communications_list", ...p }).toString();
    return contentReq(`/?${qs}`);
  },
  commGet:              (id: number)                => contentReq(`/?action=communication_get&id=${id}`),
  addComm:              (d: Record<string,unknown>) => contentReq("/?action=add_communication",    { method: "POST", body: JSON.stringify(d) }),
  updateComm:           (d: Record<string,unknown>) => contentReq("/?action=update_communication", { method: "PUT",  body: JSON.stringify(d) }),
  sendComm:             (id: number)                => contentReq("/?action=send_communication",   { method: "POST", body: JSON.stringify({ id }) }),
  cancelComm:           (id: number)                => contentReq("/?action=cancel_communication", { method: "POST", body: JSON.stringify({ id }) }),
  commEvents:           (communication_id: number)  => contentReq(`/?action=communication_events&communication_id=${communication_id}`),
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