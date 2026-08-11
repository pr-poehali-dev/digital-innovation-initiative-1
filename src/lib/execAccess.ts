import { getAdminToken } from "./admin-api";

export interface CabinetAccess {
  email: string;
  role: "head" | "curator" | "contributor" | "viewer";
  can_confirm: boolean;
}

export const ACCESS_ROLE_LABEL: Record<string, string> = {
  head: "Руководитель Группы",
  curator: "Куратор направления",
  contributor: "Участник",
  viewer: "Наблюдатель",
};

/** Заголовки доступа: админ-вход или обычный вход из списка допущенных. */
export function accessHeaders(): Record<string, string> {
  const adminToken = getAdminToken();
  if (adminToken) return { "X-Admin-Token": adminToken };
  const sid = localStorage.getItem("session_id");
  return sid ? { "X-Session-Id": sid } : {};
}

export function hasAnyAccess(): boolean {
  return !!getAdminToken() || !!localStorage.getItem("session_id");
}
