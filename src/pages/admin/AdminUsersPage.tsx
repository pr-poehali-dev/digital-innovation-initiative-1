import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { getAdminToken } from "@/lib/admin-api";

const ADMIN_USERS_URL = "https://functions.poehali.dev/8a915c0f-1259-4816-a8e3-14280bdb94ae";

// ── Types ─────────────────────────────────────────────────────────

type UserRow = {
  id: number;
  email: string;
  name: string;
  created_at: string;
  is_blocked: boolean;
  blocked_at: string | null;
  balance_rub: number;
};

type UserDetail = UserRow & {
  block_reason: string | null;
  unblocked_at: string | null;
  balance_kopecks: number;
  projects_count: number;
  tasks_count: number;
  documents_count: number;
  active_sessions: number;
};

// ── API helpers ──────────────────────────────────────────────────

function authHeaders() {
  return { "Content-Type": "application/json", "X-Admin-Token": getAdminToken() };
}

async function fetchUsers(q: string, filter: string, page: number) {
  const params = new URLSearchParams({ action: "list", q, filter, page: String(page), per_page: "20" });
  const res = await fetch(`${ADMIN_USERS_URL}?${params}`, { headers: authHeaders() });
  return res.json();
}

async function fetchUser(id: number): Promise<{ user: UserDetail }> {
  const res = await fetch(`${ADMIN_USERS_URL}?action=get&user_id=${id}`, { headers: authHeaders() });
  return res.json();
}

async function blockUser(userId: number, reason: string) {
  const res = await fetch(`${ADMIN_USERS_URL}?action=block`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ user_id: userId, reason }),
  });
  return res.json();
}

async function unblockUser(userId: number, reason: string) {
  const res = await fetch(`${ADMIN_USERS_URL}?action=unblock`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ user_id: userId, reason }),
  });
  return res.json();
}

// ── Confirm Dialog ───────────────────────────────────────────────

type ConfirmAction = { type: "block" | "unblock"; user: UserRow };

function ConfirmDialog({
  action,
  onConfirm,
  onCancel,
  loading,
}: {
  action: ConfirmAction;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState("");
  const isBlock = action.type === "block";
  const valid = reason.trim().length >= 10;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${isBlock ? "bg-red-100" : "bg-green-100"}`}>
          <Icon name={isBlock ? "ShieldOff" : "ShieldCheck"} size={22} className={isBlock ? "text-red-600" : "text-green-600"} />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-1">
          {isBlock ? "Заблокировать пользователя" : "Разблокировать пользователя"}
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          <span className="font-medium text-slate-700">{action.user.email}</span>
          {isBlock
            ? " — будет заблокирован. Все активные сессии будут аннулированы."
            : " — получит доступ к системе."}
        </p>

        <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
          Причина <span className="text-red-400">*</span>
        </label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Минимум 10 символов..."
          rows={3}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 resize-none outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
          autoFocus
        />
        <div className="flex justify-between items-center mt-1 mb-4">
          <span className={`text-xs ${reason.trim().length >= 10 ? "text-green-600" : "text-slate-400"}`}>
            {reason.trim().length}/10 символов минимум
          </span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={!valid || loading}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              isBlock ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"
            }`}
          >
            {loading ? "Выполняется..." : isBlock ? "Заблокировать" : "Разблокировать"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── User Drawer ──────────────────────────────────────────────────

function UserDrawer({
  userId,
  onClose,
  onAction,
}: {
  userId: number;
  onClose: () => void;
  onAction: (user: UserRow, type: "block" | "unblock") => void;
}) {
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUser(userId).then(d => {
      setUser(d.user ?? null);
      setLoading(false);
    });
  }, [userId]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white h-full shadow-2xl flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Карточка пользователя</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
            <Icon name="X" size={18} />
          </button>
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && !user && (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Пользователь не найден</div>
        )}

        {user && (
          <div className="flex-1 px-5 py-4 space-y-5">
            {/* Avatar + name */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-lg">{user.name?.charAt(0)?.toUpperCase() ?? "?"}</span>
              </div>
              <div>
                <div className="font-semibold text-slate-900">{user.name}</div>
                <div className="text-sm text-slate-500">{user.email}</div>
              </div>
            </div>

            {/* Status badge */}
            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${
              user.is_blocked ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
            }`}>
              <Icon name={user.is_blocked ? "ShieldOff" : "ShieldCheck"} size={14} />
              {user.is_blocked ? "Заблокирован" : "Активен"}
            </div>

            {/* Block reason */}
            {user.is_blocked && user.block_reason && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                <div className="text-xs font-semibold text-red-600 mb-1 uppercase tracking-wide">Причина блокировки</div>
                <div className="text-sm text-red-800">{user.block_reason}</div>
                {user.blocked_at && (
                  <div className="text-xs text-red-400 mt-1">{new Date(user.blocked_at).toLocaleString("ru")}</div>
                )}
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Проекты", value: user.projects_count, icon: "FolderOpen" },
                { label: "Задачи", value: user.tasks_count, icon: "Sparkles" },
                { label: "Документы", value: user.documents_count, icon: "FileText" },
                { label: "Сессии", value: user.active_sessions, icon: "Monitor" },
              ].map(s => (
                <div key={s.label} className="bg-slate-50 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                    <Icon name={s.icon} size={12} />
                    {s.label}
                  </div>
                  <div className="text-xl font-bold text-slate-900">{s.value}</div>
                </div>
              ))}
            </div>

            {/* Wallet */}
            <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Icon name="Wallet" size={15} />
                Баланс кошелька
              </div>
              <div className="font-semibold text-slate-900">{user.balance_rub.toLocaleString("ru")} ₽</div>
            </div>

            {/* Dates */}
            <div className="text-xs text-slate-400 space-y-1">
              <div>Зарегистрирован: {new Date(user.created_at).toLocaleString("ru")}</div>
              {user.unblocked_at && <div>Разблокирован: {new Date(user.unblocked_at).toLocaleString("ru")}</div>}
            </div>

            {/* Actions */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <a
                href={`/admin/activity?user_id=${user.id}`}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 font-medium text-sm rounded-xl transition-colors"
              >
                <Icon name="Activity" size={15} />
                Посмотреть активность
              </a>
              {user.is_blocked ? (
                <button
                  onClick={() => onAction(user, "unblock")}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-50 hover:bg-green-100 text-green-700 font-semibold text-sm rounded-xl transition-colors"
                >
                  <Icon name="ShieldCheck" size={15} />
                  Разблокировать
                </button>
              ) : (
                <button
                  onClick={() => onAction(user, "block")}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 font-semibold text-sm rounded-xl transition-colors"
                >
                  <Icon name="ShieldOff" size={15} />
                  Заблокировать
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const navigate = useNavigate();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const [drawerUserId, setDrawerUserId] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchUsers(q, filter, page);
    setUsers(data.users ?? []);
    setTotal(data.total ?? 0);
    setPages(data.pages ?? 1);
    setLoading(false);
  }, [q, filter, page]);

  useEffect(() => { load(); }, [load]);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => setPage(1), 400);
    return () => clearTimeout(t);
  }, [q]);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleConfirm(reason: string) {
    if (!confirmAction) return;
    setActionLoading(true);
    const fn = confirmAction.type === "block" ? blockUser : unblockUser;
    const res = await fn(confirmAction.user.id, reason);
    setActionLoading(false);
    setConfirmAction(null);

    if (res.ok) {
      showToast(confirmAction.type === "block" ? "Пользователь заблокирован" : "Пользователь разблокирован");
      load();
      if (drawerUserId === confirmAction.user.id) setDrawerUserId(null);
    } else {
      showToast(res.error || "Ошибка", false);
    }
  }

  function handleDrawerAction(user: UserRow, type: "block" | "unblock") {
    setDrawerUserId(null);
    setConfirmAction({ type, user });
  }

  const FILTERS = [
    { value: "all",     label: "Все" },
    { value: "active",  label: "Активные" },
    { value: "blocked", label: "Заблокированные" },
  ];

  return (
    <AdminShell>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
            <Icon name="Users" size={18} className="text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Пользователи</h1>
            <p className="text-sm text-slate-500">Всего: {total}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="flex-1 flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5">
            <Icon name="Search" size={15} className="text-slate-400 flex-shrink-0" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Поиск по email, имени или ID..."
              className="flex-1 text-sm text-slate-800 placeholder:text-slate-400 outline-none bg-transparent"
            />
            {q && (
              <button onClick={() => setQ("")} className="text-slate-300 hover:text-slate-500">
                <Icon name="X" size={14} />
              </button>
            )}
          </div>
          <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1">
            {FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => { setFilter(f.value); setPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filter === f.value
                    ? "bg-violet-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">Пользователи не найдены</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Пользователь</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Регистрация</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Баланс</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Статус</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr
                    key={u.id}
                    className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${i === users.length - 1 ? "border-b-0" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-xs font-bold">{u.name?.charAt(0)?.toUpperCase() ?? "?"}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">{u.name}</div>
                          <div className="text-xs text-slate-400 truncate">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-xs text-slate-500">
                        {new Date(u.created_at).toLocaleDateString("ru")}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-sm text-slate-700 font-medium">{u.balance_rub.toLocaleString("ru")} ₽</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${
                        u.is_blocked
                          ? "bg-red-50 text-red-600"
                          : "bg-green-50 text-green-600"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${u.is_blocked ? "bg-red-500" : "bg-green-500"}`} />
                        {u.is_blocked ? "Заблокирован" : "Активен"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setDrawerUserId(u.id)}
                          className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                          title="Открыть карточку"
                        >
                          <Icon name="ChevronRight" size={16} />
                        </button>
                        {u.is_blocked ? (
                          <button
                            onClick={() => setConfirmAction({ type: "unblock", user: u })}
                            className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Разблокировать"
                          >
                            <Icon name="ShieldCheck" size={15} />
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmAction({ type: "block", user: u })}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Заблокировать"
                          >
                            <Icon name="ShieldOff" size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ←
            </button>
            <span className="text-sm text-slate-500">Страница {page} из {pages}</span>
            <button
              onClick={() => setPage(p => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              →
            </button>
          </div>
        )}
      </div>

      {/* Drawer */}
      {drawerUserId && (
        <UserDrawer
          userId={drawerUserId}
          onClose={() => setDrawerUserId(null)}
          onAction={handleDrawerAction}
        />
      )}

      {/* Confirm dialog */}
      {confirmAction && (
        <ConfirmDialog
          action={confirmAction}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmAction(null)}
          loading={actionLoading}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white transition-all ${
          toast.ok ? "bg-green-600" : "bg-red-600"
        }`}>
          <Icon name={toast.ok ? "CheckCircle" : "AlertCircle"} size={16} />
          {toast.msg}
        </div>
      )}
    </AdminShell>
  );
}