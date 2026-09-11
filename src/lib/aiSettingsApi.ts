import { accessHeaders } from "./execAccess";

const BASE = "https://functions.poehali.dev/a1b61d31-1172-45f3-86cf-26f80352dcc4";

export interface AiModuleSetting {
  module_code: string;
  module_label: string;
  service: string;
  trigger_type: string;
  is_enabled: boolean;
  data_description: string | null;
  last_used_at: string | null;
  last_result: string | null;
  updated_by: string | null;
  updated_at: string;
  emergency_env_flag: string | null;
  emergency_env_state: "unverified" | "not_applicable";
  emergency_env_blocked_here: boolean;
  effective_enabled: boolean;
}

export interface AiModulesResponse {
  global_enabled: boolean;
  modules: AiModuleSetting[];
}

export interface AiLogItem {
  id: number;
  module_code: string;
  service: string;
  action: string;
  object_type: string | null;
  object_id: string | null;
  data_kind: string | null;
  approx_volume: number | null;
  result: string;
  error_message: string | null;
  duration_ms: number | null;
  initiated_by: string | null;
  created_at: string;
}

async function req(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...accessHeaders(),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data?.error?.message || "Ошибка загрузки данных");
  return data.data;
}

const post = (action: string, body: unknown) =>
  req(`/?action=${action}`, { method: "POST", body: JSON.stringify(body) });

export const aiSettingsApi = {
  list: (): Promise<AiModulesResponse> => req("/?action=list"),

  setGlobal: (enabled: boolean): Promise<{ global_enabled: boolean }> =>
    post("set_global", { enabled }),

  setModule: (moduleCode: string, enabled: boolean): Promise<{ module_code: string; enabled: boolean }> =>
    post("set_module", { module_code: moduleCode, enabled }),

  log: (limit = 100, moduleCode?: string): Promise<{ items: AiLogItem[] }> =>
    req(`/?action=log&limit=${limit}${moduleCode ? `&module_code=${moduleCode}` : ""}`),
};