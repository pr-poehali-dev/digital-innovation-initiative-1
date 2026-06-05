import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  open_tickets: number;
  last_activity_at: string | null;
};

type TicketPreview = {
  id: number;
  ticket_no: string;
  status: string;
  priority: string;
  subject: string;
  created_at: string;
  assignee_email: string;
};

type CommPreview = {
  id: number;
  comm_no: string;
  channel: string;
  status: string;
  subject: string;
  sent_at: string | null;
  audience: string;
};

type ActivityEvent = {
  id: number;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  details: string;
  created_at: string;
};

type AuditEvent = {
  id: number;
  action: string;
  actor_email: string;
  reason: string | null;
  created_at: string;
};

type LearningGoal = {
  id: number;
  goal_text: string;
  target_level: string | null;
  status: string;
  started_at: string | null;
  target_date: string | null;
};

type UserDetail = UserRow & {
  block_reason: string | null;
  unblocked_at: string | null;
  balance_kopecks: number;
  projects_count: number;
  tasks_count: number;
  documents_count: number;
  active_sessions: number;
  tickets: TicketPreview[];
  tickets_open: number;
  tickets_urgent: number;
  communications: CommPreview[];
  activity: ActivityEvent[];
  audit_events: AuditEvent[];
  learning_goals: LearningGoal[];
};

// ── Helpers ───────────────────────────────────────────────────────

function fmtDate(iso?: string | null): string {
  if (!iso || iso.startsWith("0001")) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeDate(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Сегодня";
  if (days === 1) return "Вчера";
  if (days < 30) return `${days} дн. назад`;
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: "bg-red-500 animate-pulse",
  high: "bg-orange-500",
  medium: "bg-blue-400",
  low: "bg-gray-400",
};

const STATUS_BADGE: Record<string, string> = {
  new: "text-blue-600 bg-blue-50",
  open: "text-emerald-600 bg-emerald-50",
  pending: "text-violet-600 bg-violet-50",
  waiting_user: "text-amber-600 bg-amber-50",
  resolved: "text-gray-500 bg-gray-100",
  closed: "text-gray-400 bg-gray-50",
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

// ── Casework types ────────────────────────────────────────────────

type UserNote = {
  id: number; user_id: number; note_text: string; visibility: string;
  created_at: string; created_by: string;
  updated_at: string | null; updated_by: string | null;
};

type UserCaseFlag = {
  id: number; user_id: number; flag_type: string; title: string;
  description: string; status: string;
  created_at: string; created_by: string;
  resolved_at: string | null; resolved_by: string | null;
};

// ── Casework API helpers ──────────────────────────────────────────

async function fetchUserNotes(userId: number): Promise<UserNote[]> {
  const res = await fetch(`${ADMIN_USERS_URL}?action=user_notes&user_id=${userId}`, { headers: authHeaders() });
  const d = await res.json();
  return d.notes ?? [];
}

async function addUserNote(userId: number, noteText: string): Promise<{ ok: boolean; id?: number }> {
  const res = await fetch(`${ADMIN_USERS_URL}?action=add_user_note`, {
    method: "POST", headers: authHeaders(),
    body: JSON.stringify({ user_id: userId, note_text: noteText }),
  });
  return res.json();
}

async function deleteUserNote(noteId: number): Promise<{ ok: boolean }> {
  const res = await fetch(`${ADMIN_USERS_URL}?action=delete_user_note`, {
    method: "POST", headers: authHeaders(),
    body: JSON.stringify({ note_id: noteId }),
  });
  return res.json();
}

async function fetchUserCaseFlags(userId: number): Promise<UserCaseFlag[]> {
  const res = await fetch(`${ADMIN_USERS_URL}?action=user_case_flags&user_id=${userId}`, { headers: authHeaders() });
  const d = await res.json();
  return d.flags ?? [];
}

async function addUserCaseFlag(userId: number, title: string, flagType: string, description: string): Promise<{ ok: boolean; id?: number }> {
  const res = await fetch(`${ADMIN_USERS_URL}?action=add_user_case_flag`, {
    method: "POST", headers: authHeaders(),
    body: JSON.stringify({ user_id: userId, title, flag_type: flagType, description }),
  });
  return res.json();
}

async function resolveUserCaseFlag(flagId: number): Promise<{ ok: boolean }> {
  const res = await fetch(`${ADMIN_USERS_URL}?action=resolve_user_case_flag`, {
    method: "POST", headers: authHeaders(),
    body: JSON.stringify({ flag_id: flagId }),
  });
  return res.json();
}

async function createUserTicket(userId: number, subject: string, body: string, priority: string): Promise<{ ok: boolean; ticket_no?: string; ticket_id?: number }> {
  const res = await fetch(`${ADMIN_USERS_URL}?action=create_user_ticket`, {
    method: "POST", headers: authHeaders(),
    body: JSON.stringify({ user_id: userId, subject, body, priority }),
  });
  return res.json();
}

const FLAG_TYPES = [
  { value: "observation",        label: "Наблюдение" },
  { value: "risk",               label: "Риск" },
  { value: "fraud_suspicion",    label: "Подозрение на фрод" },
  { value: "payment_issue",      label: "Проблема с оплатой" },
  { value: "support_escalation", label: "Эскалация" },
  { value: "vip",                label: "VIP" },
  { value: "churn_risk",         label: "Риск оттока" },
  { value: "custom",             label: "Другое" },
];

const FLAG_TYPE_COLOR: Record<string, string> = {
  observation:        "bg-blue-50 text-blue-700",
  risk:               "bg-orange-50 text-orange-700",
  fraud_suspicion:    "bg-red-50 text-red-700",
  payment_issue:      "bg-amber-50 text-amber-700",
  support_escalation: "bg-violet-50 text-violet-700",
  vip:                "bg-emerald-50 text-emerald-700",
  churn_risk:         "bg-rose-50 text-rose-700",
  custom:             "bg-slate-50 text-slate-600",
};

type DrawerTab = "profile" | "tickets" | "activity" | "case";

function UserDrawer({
  userId,
  onClose,
  onAction,
}: {
  userId: number;
  onClose: () => void;
  onAction: (user: UserRow, type: "block" | "unblock") => void;
}) {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<DrawerTab>("profile");
  const [emailCopied, setEmailCopied] = useState(false);

  // Casework state
  const [notes, setNotes] = useState<UserNote[]>([]);
  const [caseFlags, setCaseFlags] = useState<UserCaseFlag[]>([]);
  const [caseLoading, setCaseLoading] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [addingFlag, setAddingFlag] = useState(false);
  const [flagForm, setFlagForm] = useState({ title: "", flag_type: "observation", description: "" });
  const [savingFlag, setSavingFlag] = useState(false);
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [ticketForm, setTicketForm] = useState({ subject: "", body: "", priority: "medium" });
  const [savingTicket, setSavingTicket] = useState(false);
  const [ticketCreated, setTicketCreated] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setTab("profile");
    setNotes([]); setCaseFlags([]); setTicketCreated(null);
    fetchUser(userId).then(d => {
      setUser(d.user ?? null);
      setLoading(false);
    });
  }, [userId]);

  // Load casework data when tab opens
  useEffect(() => {
    if (tab !== "case") return;
    setCaseLoading(true);
    Promise.all([fetchUserNotes(userId), fetchUserCaseFlags(userId)]).then(([n, f]) => {
      setNotes(n); setCaseFlags(f); setCaseLoading(false);
    });
  }, [tab, userId]);

  function copyEmail() {
    if (!user) return;
    navigator.clipboard.writeText(user.email).then(() => {
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 1500);
    });
  }

  async function handleAddNote() {
    if (!noteText.trim()) return;
    setSavingNote(true);
    const res = await addUserNote(userId, noteText.trim());
    setSavingNote(false);
    if (res.ok) {
      setNoteText(""); setAddingNote(false);
      const fresh = await fetchUserNotes(userId);
      setNotes(fresh);
    }
  }

  async function handleDeleteNote(noteId: number) {
    await deleteUserNote(noteId);
    setNotes(prev => prev.filter(n => n.id !== noteId));
  }

  async function handleAddFlag() {
    if (!flagForm.title.trim()) return;
    setSavingFlag(true);
    const res = await addUserCaseFlag(userId, flagForm.title.trim(), flagForm.flag_type, flagForm.description.trim());
    setSavingFlag(false);
    if (res.ok) {
      setFlagForm({ title: "", flag_type: "observation", description: "" });
      setAddingFlag(false);
      const fresh = await fetchUserCaseFlags(userId);
      setCaseFlags(fresh);
    }
  }

  async function handleResolveFlag(flagId: number) {
    await resolveUserCaseFlag(flagId);
    setCaseFlags(prev => prev.map(f => f.id === flagId ? { ...f, status: "resolved" } : f));
  }

  async function handleCreateTicket() {
    if (!ticketForm.subject.trim()) return;
    setSavingTicket(true);
    const res = await createUserTicket(userId, ticketForm.subject.trim(), ticketForm.body.trim(), ticketForm.priority);
    setSavingTicket(false);
    if (res.ok && res.ticket_no) {
      setTicketCreated(res.ticket_no);
      setShowTicketForm(false);
      setTicketForm({ subject: "", body: "", priority: "medium" });
    }
  }

  const TABS: { key: DrawerTab; label: string }[] = [
    { key: "profile",  label: "Профиль" },
    { key: "tickets",  label: "Тикеты" },
    { key: "activity", label: "Активность" },
    { key: "case",     label: "Кейс" },
  ];

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="font-semibold text-slate-900">Карточка пользователя</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={copyEmail}
              className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
              title="Скопировать email"
            >
              <Icon name={emailCopied ? "Check" : "Copy"} size={16} className={emailCopied ? "text-green-500" : undefined} />
            </button>
            <button
              onClick={() => navigate("/admin/audit")}
              className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
              title="Открыть аудит"
            >
              <Icon name="ShieldCheck" size={16} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 ml-1 transition-colors"
            >
              <Icon name="X" size={18} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-5 flex-shrink-0">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`py-2.5 px-1 mr-5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? "border-violet-600 text-violet-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex-1 flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && !user && (
            <div className="py-20 text-center text-slate-400 text-sm">Пользователь не найден</div>
          )}

          {!loading && user && tab === "profile" && (
            <div className="px-5 py-4 space-y-5">
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

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Проекты", value: user.projects_count, icon: "FolderOpen" },
                  { label: "Задачи", value: user.tasks_count, icon: "CheckSquare" },
                  { label: "Документы", value: user.documents_count, icon: "FileText" },
                  { label: "Сессии", value: user.active_sessions, icon: "Monitor" },
                ].map(s => (
                  <div key={s.label} className="bg-slate-50 rounded-xl p-3 flex items-center gap-2">
                    <Icon name={s.icon} size={15} className="text-slate-400 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-slate-400">{s.label}</div>
                      <div className="text-sm font-semibold text-slate-800">{s.value ?? 0}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Learning goals */}
              {user.learning_goals && user.learning_goals.length > 0 && (
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Цели обучения</p>
                  {user.learning_goals.map(g => (
                    <div key={g.id} className="flex items-center justify-between">
                      <span className="text-sm text-gray-700 truncate">{g.goal_text}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ml-2 flex-shrink-0 ${
                        g.status === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-gray-100 text-gray-500"
                      }`}>{g.status}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Audit events */}
              {user.audit_events && user.audit_events.length > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Admin-действия</p>
                  {user.audit_events.map(e => (
                    <div key={e.id} className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono text-amber-800">{e.action}</span>
                      <span className="text-[10px] text-amber-500 flex-shrink-0">{fmtDate(e.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Wallet balance */}
              <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon name="Wallet" size={16} className="text-violet-500" />
                  <span className="text-sm text-violet-700 font-medium">Баланс</span>
                </div>
                <span className="text-base font-bold text-violet-800">
                  {user.balance_rub?.toLocaleString("ru")} ₽
                </span>
              </div>

              {/* Dates */}
              <div className="space-y-1.5 text-xs text-slate-400">
                <div className="flex justify-between">
                  <span>Регистрация</span>
                  <span className="text-slate-600">{fmtDate(user.created_at)}</span>
                </div>
                {user.blocked_at && (
                  <div className="flex justify-between">
                    <span>Заблокирован</span>
                    <span className="text-red-500">{fmtDate(user.blocked_at)}</span>
                  </div>
                )}
                {user.unblocked_at && (
                  <div className="flex justify-between">
                    <span>Разблокирован</span>
                    <span className="text-green-600">{fmtDate(user.unblocked_at)}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="space-y-2 pb-2">
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

          {!loading && user && tab === "tickets" && (
            <div className="px-5 py-4 space-y-4">
              {/* Summary */}
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Icon name="Ticket" size={15} className="text-slate-400" />
                <span>
                  <span className="font-semibold text-slate-700">{user.tickets_open ?? 0}</span> открытых
                  {" · "}
                  <span className={`font-semibold ${(user.tickets_urgent ?? 0) > 0 ? "text-red-600" : "text-slate-700"}`}>
                    {user.tickets_urgent ?? 0}
                  </span> urgent
                </span>
              </div>

              {/* Ticket list */}
              {(!user.tickets || user.tickets.length === 0) ? (
                <div className="py-12 text-center text-slate-400 text-sm">Нет тикетов</div>
              ) : (
                <div className="space-y-2">
                  {user.tickets.map(t => (
                    <div key={t.id} className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[t.priority] ?? "bg-gray-400"}`} />
                        <span className="font-mono text-[10px] text-slate-500 uppercase">{t.ticket_no}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ml-auto flex-shrink-0 ${STATUS_BADGE[t.status] ?? "text-gray-500 bg-gray-100"}`}>
                          {t.status}
                        </span>
                      </div>
                      <div className="text-sm text-slate-800 truncate">{t.subject}</div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-gray-400 truncate">{t.assignee_email}</span>
                        <span className="text-[10px] text-gray-400 flex-shrink-0">{fmtDate(t.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Navigate button */}
              <button
                onClick={() => navigate("/admin/tickets")}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 font-medium text-sm rounded-xl transition-colors"
              >
                <Icon name="ExternalLink" size={15} />
                Открыть в Tickets
              </button>
            </div>
          )}

          {!loading && user && tab === "activity" && (
            <div className="px-5 py-4 space-y-5">
              {/* Activity log */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Лог активности</p>
                {(!user.activity || user.activity.length === 0) ? (
                  <div className="py-6 text-center text-slate-400 text-sm">Нет записей</div>
                ) : (
                  <div className="space-y-1.5">
                    {user.activity.map(ev => (
                      <div key={ev.id} className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 flex items-start gap-2">
                        <span className="w-2 h-2 rounded-full bg-violet-400 flex-shrink-0 mt-1.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-700">{ev.action}</span>
                            <span className="text-[10px] text-slate-400 flex-shrink-0">{fmtDate(ev.created_at)}</span>
                          </div>
                          {ev.details && (
                            <div className="text-xs text-slate-500 truncate mt-0.5">{ev.details}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Communications */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Коммуникации</p>
                {(!user.communications || user.communications.length === 0) ? (
                  <div className="py-6 text-center text-slate-400 text-sm">Нет коммуникаций</div>
                ) : (
                  <div className="space-y-1.5">
                    {user.communications.map(c => {
                      const channelIcon =
                        c.channel === "email" ? "Mail"
                        : c.channel === "push" ? "Bell"
                        : "Cpu";
                      return (
                        <div key={c.id} className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 flex items-start gap-2">
                          <Icon name={channelIcon} size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm text-slate-800 truncate">{c.subject}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${STATUS_BADGE[c.status] ?? "text-gray-500 bg-gray-100"}`}>
                                {c.status}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-0.5">
                              <span className="text-[10px] text-gray-400 uppercase">{c.channel}</span>
                              <span className="text-[10px] text-gray-400 flex-shrink-0">{fmtDate(c.sent_at)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── TAB: КЕЙС ─────────────────────────────────────────────────── */}
          {!loading && user && tab === "case" && (
            <div className="px-5 py-4 space-y-5">

              {/* Create ticket quick action */}
              <div className="bg-violet-50 border border-violet-100 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide flex items-center gap-1.5">
                    <Icon name="Ticket" size={12} /> Создать тикет
                  </p>
                  <button onClick={() => setShowTicketForm(v => !v)}
                    className="text-[10px] text-violet-600 hover:text-violet-800 font-medium">
                    {showTicketForm ? "Скрыть" : "Открыть форму"}
                  </button>
                </div>

                {ticketCreated && (
                  <div className="flex items-center gap-2 py-1.5 px-2 bg-emerald-50 border border-emerald-200 rounded-lg mb-2">
                    <Icon name="Check" size={12} className="text-emerald-600" />
                    <span className="text-xs text-emerald-700">Создан <span className="font-mono font-semibold">{ticketCreated}</span></span>
                    <button onClick={() => navigate("/admin/tickets")}
                      className="ml-auto text-[10px] text-emerald-600 hover:underline">Открыть →</button>
                  </div>
                )}

                {showTicketForm && (
                  <div className="space-y-2 mt-2">
                    <input
                      className="w-full border border-violet-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-400"
                      placeholder="Тема тикета *"
                      value={ticketForm.subject}
                      onChange={e => setTicketForm(f => ({ ...f, subject: e.target.value }))}
                    />
                    <textarea
                      className="w-full border border-violet-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-400 resize-none"
                      rows={2}
                      placeholder="Описание (необязательно)"
                      value={ticketForm.body}
                      onChange={e => setTicketForm(f => ({ ...f, body: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <select
                        className="flex-1 border border-violet-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none"
                        value={ticketForm.priority}
                        onChange={e => setTicketForm(f => ({ ...f, priority: e.target.value }))}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                      <button onClick={handleCreateTicket} disabled={savingTicket || !ticketForm.subject.trim()}
                        className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors">
                        {savingTicket ? "..." : "Создать"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Case flags */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                    <Icon name="Flag" size={12} /> Флаги кейса
                    {caseFlags.filter(f => f.status === "open").length > 0 && (
                      <span className="ml-1 text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-semibold">
                        {caseFlags.filter(f => f.status === "open").length}
                      </span>
                    )}
                  </p>
                  <button onClick={() => setAddingFlag(v => !v)}
                    className="text-[10px] text-slate-500 hover:text-slate-700 font-medium">
                    {addingFlag ? "Отмена" : "+ Добавить"}
                  </button>
                </div>

                {addingFlag && (
                  <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 space-y-2 mb-3">
                    <input
                      className="w-full border border-orange-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-orange-300"
                      placeholder="Заголовок флага *"
                      value={flagForm.title}
                      onChange={e => setFlagForm(f => ({ ...f, title: e.target.value }))}
                    />
                    <select
                      className="w-full border border-orange-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none"
                      value={flagForm.flag_type}
                      onChange={e => setFlagForm(f => ({ ...f, flag_type: e.target.value }))}
                    >
                      {FLAG_TYPES.map(ft => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
                    </select>
                    <textarea
                      className="w-full border border-orange-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none resize-none"
                      rows={2}
                      placeholder="Описание (необязательно)"
                      value={flagForm.description}
                      onChange={e => setFlagForm(f => ({ ...f, description: e.target.value }))}
                    />
                    <button onClick={handleAddFlag} disabled={savingFlag || !flagForm.title.trim()}
                      className="w-full py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors">
                      {savingFlag ? "Сохраняю..." : "Добавить флаг"}
                    </button>
                  </div>
                )}

                {caseLoading ? (
                  <div className="flex justify-center py-4">
                    <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : caseFlags.length === 0 ? (
                  <div className="py-4 text-center text-slate-400 text-sm">Флагов нет</div>
                ) : (
                  <div className="space-y-2">
                    {caseFlags.map(flag => (
                      <div key={flag.id} className={`border rounded-xl p-2.5 ${flag.status === "open" ? "bg-white border-orange-200" : "bg-slate-50 border-slate-100 opacity-60"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${FLAG_TYPE_COLOR[flag.flag_type] ?? "bg-slate-100 text-slate-600"}`}>
                                {FLAG_TYPES.find(f => f.value === flag.flag_type)?.label ?? flag.flag_type}
                              </span>
                              {flag.status === "resolved" && (
                                <span className="text-[10px] text-gray-400">✓ закрыт</span>
                              )}
                            </div>
                            <p className="text-sm text-slate-800 mt-1 font-medium">{flag.title}</p>
                            {flag.description && <p className="text-xs text-slate-500 mt-0.5">{flag.description}</p>}
                            <p className="text-[10px] text-slate-400 mt-1">{fmtDate(flag.created_at)} · {flag.created_by}</p>
                          </div>
                          {flag.status === "open" && (
                            <button onClick={() => handleResolveFlag(flag.id)}
                              className="flex-shrink-0 text-[10px] px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg font-medium transition-colors">
                              Закрыть
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Internal notes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                    <Icon name="StickyNote" size={12} /> Заметки
                    {notes.filter(n => n.visibility !== "deleted").length > 0 && (
                      <span className="ml-1 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-semibold">
                        {notes.filter(n => n.visibility !== "deleted").length}
                      </span>
                    )}
                  </p>
                  <button onClick={() => setAddingNote(v => !v)}
                    className="text-[10px] text-slate-500 hover:text-slate-700 font-medium">
                    {addingNote ? "Отмена" : "+ Добавить"}
                  </button>
                </div>

                {addingNote && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-2 mb-3">
                    <textarea
                      className="w-full border border-amber-200 rounded-lg px-2.5 py-2 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-300 resize-none"
                      rows={3}
                      placeholder="Внутренняя заметка..."
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      autoFocus
                    />
                    <button onClick={handleAddNote} disabled={savingNote || !noteText.trim()}
                      className="w-full py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors">
                      {savingNote ? "Сохраняю..." : "Сохранить заметку"}
                    </button>
                  </div>
                )}

                {caseLoading ? (
                  <div className="flex justify-center py-4">
                    <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : notes.filter(n => n.visibility !== "deleted").length === 0 ? (
                  <div className="py-4 text-center text-slate-400 text-sm">Заметок нет</div>
                ) : (
                  <div className="space-y-2">
                    {notes.filter(n => n.visibility !== "deleted").map(note => (
                      <div key={note.id} className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm text-slate-800 flex-1 whitespace-pre-wrap">{note.note_text}</p>
                          <button onClick={() => handleDeleteNote(note.id)}
                            className="flex-shrink-0 text-slate-400 hover:text-red-500 p-0.5 transition-colors">
                            <Icon name="X" size={12} />
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1.5">{fmtDate(note.created_at)} · {note.created_by}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState(searchParams.get("q") ?? "");
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
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Тикеты</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Активность</th>
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
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {(u.open_tickets ?? 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 text-sky-400 font-semibold text-xs">
                          <Icon name="Ticket" size={12} />
                          {u.open_tickets}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-slate-500">{relativeDate(u.last_activity_at)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${
                        u.is_blocked
                          ? "bg-red-50 text-red-600"
                          : "bg-green-50 text-green-600"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${u.is_blocked ? "bg-red-400" : "bg-green-400"}`} />
                        {u.is_blocked ? "Блок" : "Активен"}
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