const ADMIN_AUTH_URL = "https://functions.poehali.dev/e3e85012-90f7-4ae1-bb12-b829a56fa72b";

const BASE = ADMIN_AUTH_URL;

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
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
    return request("?action=login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  async logout() {
    return request("?action=logout", { method: "POST" });
  },
};
