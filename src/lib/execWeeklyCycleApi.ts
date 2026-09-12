import { accessHeaders } from "./execAccess";

const BASE = "https://functions.poehali.dev/2846d4ff-d9bc-4e86-864a-adbeba8dabcf";

export type EntityType = "action" | "task" | "project" | "initiative" | "milestone" | "decision" | "risk" | "issue" | "requirement" | "document";

export interface MyDayItem {
  id: number;
  title?: string;
  question?: string;
  description?: string;
  due_at?: string | null;
  plan_date?: string | null;
  need_by_date?: string | null;
  priority?: string | null;
  criticality?: string | null;
  status?: string;
  initiative_id?: number | null;
  initiative_title?: string | null;
  project_id?: number | null;
  project_title?: string | null;
  role_title?: string | null;
  role_title_ref?: string | null;
  risk_score?: number;
  days_overdue?: number | null;
  plan_end?: string;
  control_result?: string | null;
}

export interface Reminder {
  id: number;
  title: string;
  remind_at: string;
  entity_type: EntityType | null;
  entity_id: number | null;
  comment: string | null;
  priority: string;
  status: string;
  repeat_rule: "none" | "daily" | "weekly" | "monthly";
  is_due: boolean;
}

export interface MyDayV2Data {
  today: string;
  week_start: string;
  week_end: string;
  timezone: string;
  overdue: { actions: MyDayItem[]; tasks: MyDayItem[] };
  today_items: { actions: MyDayItem[]; tasks: MyDayItem[]; milestones: MyDayItem[] };
  week_items: { actions: MyDayItem[]; tasks: MyDayItem[]; milestones: MyDayItem[]; project_deadlines: MyDayItem[] };
  pending_decisions: MyDayItem[];
  decisions_awaiting_control: MyDayItem[];
  critical_risks: MyDayItem[];
  critical_issues: MyDayItem[];
  requirements_to_search: MyDayItem[];
  reminders: Reminder[];
  active_weekly_plan: { id: number; week_start: string; week_end: string; title: string | null; main_goal: string | null; status: string } | null;
}

export interface WeeklyPlanItem {
  id: number;
  weekly_plan_id: number;
  entity_type: EntityType;
  entity_id: number;
  plan_date: string | null;
  week_priority: string;
  expected_result: string | null;
  is_done: boolean;
  comment: string | null;
  sort_order: number;
  carried_over_from_item_id: number | null;
  carry_over_count: number;
  entity_title: string | null;
}

export interface WeeklyPlan {
  id: number;
  week_start: string;
  week_end: string;
  title: string | null;
  main_goal: string | null;
  comment: string | null;
  status: "draft" | "active" | "closed";
  author: string | null;
  created_at: string;
  closed_at: string | null;
  summary_text: string | null;
  items: WeeklyPlanItem[];
}

export interface WeeklySummarySnapshot {
  id: number;
  weekly_plan_id: number;
  payload: { plan: Omit<WeeklyPlan, "items">; items: WeeklyPlanItem[]; stats: WeeklyStats };
  payload_sha256: string;
  version_group: string;
  version_number: number;
  integrity_ok: boolean;
  created_by: string;
  created_at: string;
}

export interface WeeklyStats {
  planned: number;
  done: number;
  not_done: number;
  carried_over: number;
}

async function req(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...accessHeaders(), ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data?.error?.message || "Ошибка загрузки данных");
  return data.data;
}

export const weeklyCycleApi = {
  myDayV2: (): Promise<MyDayV2Data> => req("/?action=my_day_v2"),

  reminders: (includeTestData = false): Promise<{ items: Reminder[] }> =>
    req(`/?action=reminders${includeTestData ? "&include_test_data=1" : ""}`),
  saveReminder: (payload: {
    title: string; remind_at: string; entity_type?: EntityType; entity_id?: number;
    comment?: string; priority?: string; repeat_rule?: "none" | "daily" | "weekly" | "monthly";
  }): Promise<{ id: number }> => req("/?action=save_reminder", { method: "POST", body: JSON.stringify(payload) }),
  updateReminderStatus: (payload: {
    id: number; status: "done" | "snoozed" | "cancelled" | "planned"; snooze_until?: string;
  }): Promise<{ id: number }> => req("/?action=update_reminder_status", { method: "POST", body: JSON.stringify(payload) }),

  weeklyPlanCurrent: (offset = 0): Promise<WeeklyPlan> => req(`/?action=weekly_plan_current&offset=${offset}`),
  weeklyPlan: (id: number): Promise<WeeklyPlan> => req(`/?action=weekly_plan&id=${id}`),
  weeklyPlans: (): Promise<{ items: WeeklyPlan[] }> => req("/?action=weekly_plans"),

  addWeeklyItem: (payload: {
    weekly_plan_id: number; entity_type: EntityType; entity_id: number;
    plan_date?: string; week_priority?: string; expected_result?: string; comment?: string;
  }): Promise<{ id: number }> => req("/?action=add_weekly_item", { method: "POST", body: JSON.stringify(payload) }),
  setWeeklyItemDone: (id: number, isDone: boolean): Promise<{ id: number }> =>
    req("/?action=set_weekly_item_done", { method: "POST", body: JSON.stringify({ id, is_done: isDone }) }),
  carryOverItem: (payload: { item_id: number; target_weekly_plan_id: number; reason?: string }): Promise<{ id: number }> =>
    req("/?action=carry_over_item", { method: "POST", body: JSON.stringify(payload) }),

  closeWeeklyPlan: (payload: { id: number; summary_text?: string; is_test_data?: boolean }): Promise<{
    id: number; created_at: string; version_group: string; version_number: number;
    payload_sha256: string; stats: WeeklyStats;
  }> => req("/?action=close_weekly_plan", { method: "POST", body: JSON.stringify(payload) }),
  weeklySummarySnapshot: (id: number): Promise<WeeklySummarySnapshot> => req(`/?action=weekly_summary_snapshot&id=${id}`),
};