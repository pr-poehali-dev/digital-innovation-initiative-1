import { getAdminToken } from "@/lib/admin-api";

export const STRATEGY_URL = "https://functions.poehali.dev/04817687-9635-4376-b40c-816fb73e7eb7";

export function strategyHdr() {
  return { "Content-Type": "application/json", "X-Admin-Token": getAdminToken() };
}

export async function stratReq(action: string, days: string, extra: Record<string, string> = {}, body?: object) {
  const qs = new URLSearchParams({ action, days, ...extra }).toString();
  const res = await fetch(`${STRATEGY_URL}/?${qs}`, {
    method: body ? "POST" : "GET",
    headers: strategyHdr(),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
}

export async function stratAction(action: string, body?: object) {
  const res = await fetch(`${STRATEGY_URL}/?action=${action}`, {
    method: body ? "POST" : "GET",
    headers: strategyHdr(),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
}

// Typed helpers
export const api = {
  roadmapList:        ()              => stratAction("strategy_roadmap_list"),
  roadmapCreate:      (b: object)     => stratAction("strategy_roadmap_create", b),
  roadmapUpdate:      (b: object)     => stratAction("strategy_roadmap_update", b),
  roadmapDelete:      (id: number)    => stratAction("strategy_roadmap_delete", { id }),
  roadmapFromInsight: (b: object)     => stratAction("strategy_roadmap_from_insight", b),

  reportsList:        ()              => stratAction("strategy_reports_list"),
  reportGet:          (id: number)    => fetch(`${STRATEGY_URL}/?action=strategy_report_get&id=${id}`, { headers: strategyHdr() }).then(r => r.json()),
  reportDelete:       (id: number)    => stratAction("strategy_report_delete", { id }),

  scenariosList:      ()              => stratAction("strategy_scenarios_list"),
  scenarioGet:        (id: number)    => fetch(`${STRATEGY_URL}/?action=strategy_scenario_get&id=${id}`, { headers: strategyHdr() }).then(r => r.json()),
  scenarioDelete:     (id: number)    => stratAction("strategy_scenario_delete", { id }),

  initiativesList:    ()              => stratAction("strategy_initiatives_list"),
  initiativesBoard:   ()              => stratAction("strategy_initiatives_board"),
  initiativeSummary:  ()              => stratAction("strategy_initiatives_summary"),
  initiativeGet:      (id: number)    => fetch(`${STRATEGY_URL}/?action=strategy_initiative_get&id=${id}`, { headers: strategyHdr() }).then(r => r.json()),
  initiativeCreate:   (b: object)     => stratAction("strategy_initiative_create", b),
  initiativeUpdate:   (b: object)     => stratAction("strategy_initiative_update", b),
  initiativeArchive:  (id: number)    => stratAction("strategy_initiative_update", { id, status: "archived" }),
  initiativeFromRoadmap:   (b: object) => stratAction("strategy_initiative_from_roadmap", b),
  initiativeFromScenario:  (b: object) => stratAction("strategy_initiative_from_scenario", b),
  initiativeUpdateAdd:     (b: object) => stratAction("strategy_initiative_update_add", b),
  initiativeMetricsRefresh: (id: number) => stratAction("strategy_initiative_metrics_refresh", { id }),

  weeklyReviewsList:    ()           => stratAction("strategy_weekly_reviews_list"),
  weeklyReviewGenerate: (b: object)  => stratAction("strategy_weekly_review_generate", b),
  weeklyReviewGet:      (id: number) => fetch(`${STRATEGY_URL}/?action=strategy_weekly_review_get&id=${id}`, { headers: strategyHdr() }).then(r => r.json()),
  weeklyReviewPublish:  (id: number) => stratAction("strategy_weekly_review_publish", { id }),
  weeklyReviewDelete:   (id: number) => stratAction("strategy_weekly_review_delete", { id }),

  decisionsList:  (params?: Record<string, string>) => {
    const qs = params ? `&${new URLSearchParams(params).toString()}` : "";
    return fetch(`${STRATEGY_URL}/?action=strategy_decisions_list${qs}`, { headers: strategyHdr() }).then(r => r.json());
  },
  decisionCreate: (b: object) => stratAction("strategy_decision_create", b),
  decisionUpdate: (b: object) => stratAction("strategy_decision_update", b),
  decisionDelete: (id: number) => stratAction("strategy_decision_delete", { id }),
};