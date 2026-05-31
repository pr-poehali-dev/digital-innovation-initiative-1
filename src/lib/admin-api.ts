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
