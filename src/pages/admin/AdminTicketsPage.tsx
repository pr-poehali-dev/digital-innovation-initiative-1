import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import { ticketsApi, getAdminToken, type TicketStatus, type TicketPriority, type TicketMsgType } from "@/lib/admin-api";

// ── Types ─────────────────────────────────────────────────────────────────────

type Ticket = {
  id: number;
  ticket_no: string;
  status: TicketStatus;
  priority: TicketPriority;
  source: string;
  module_slug: string;
  requester_name: string;
  requester_email: string;
  requester_user_id: number | null;
  subject: string;
  body: string;
  assignee_email: string;
  owner_email: string;
  tags_json: string[];
  first_response_at: string | null;
  last_message_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
  // SLA fields
  sla_state: "ok" | "due_soon" | "overdue";
  is_overdue: boolean;
  age_hours: number;
  response_due_at: string | null;
  resolve_due_at: string | null;
  resp_sla_met: boolean;
};

type TicketMessage = {
  id: number;
  ticket_id: number;
  message_type: TicketMsgType;
  author_name: string;
  author_email: string;
  body: string;
  created_at: string;
  created_by: string;
};

type Summary = {
  new: number;
  open: number;
  waiting_user: number;
  urgent: number;
  unassigned: number;
  resolved_today: number;
  active: number;
  overdue: number;
};

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<TicketStatus, { label: string; color: string }> = {
  new:          { label: "New",          color: "text-blue-400 bg-blue-900/30 border-blue-800" },
  open:         { label: "Open",         color: "text-emerald-400 bg-emerald-900/30 border-emerald-800" },
  pending:      { label: "Pending",      color: "text-violet-400 bg-violet-900/30 border-violet-800" },
  waiting_user: { label: "Waiting user", color: "text-amber-400 bg-amber-900/30 border-amber-800" },
  resolved:     { label: "Resolved",     color: "text-gray-400 bg-gray-800 border-gray-700" },
  closed:       { label: "Closed",       color: "text-gray-600 bg-gray-900 border-gray-800" },
};

const PRIORITY_CFG: Record<TicketPriority, { label: string; color: string; dot: string }> = {
  low:    { label: "Low",    color: "text-gray-500",   dot: "bg-gray-600" },
  medium: { label: "Medium", color: "text-blue-400",   dot: "bg-blue-500" },
  high:   { label: "High",   color: "text-orange-400", dot: "bg-orange-500" },
  urgent: { label: "Urgent", color: "text-red-400",    dot: "bg-red-500 animate-pulse" },
};

const STATUSES: TicketStatus[]    = ["new", "open", "pending", "waiting_user", "resolved", "closed"];
const PRIORITIES: TicketPriority[] = ["low", "medium", "high", "urgent"];
const SOURCES = ["email", "web", "api", "chat", "phone", "other"];

const QUEUES = [
  { key: "all",          label: "Все" },
  { key: "unassigned",   label: "Без исп." },
  { key: "urgent",       label: "Срочные" },
  { key: "overdue",      label: "Просроченные" },
  { key: "waiting_user", label: "Ожидают" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const TICKETS_URL = "https://functions.poehali.dev/d5e57a3f-a793-4f65-849e-8f084619e51d";

async function bulkTickets(ids: number[], op: string, extra: Record<string, string> = {}) {
  const res = await fetch(`${TICKETS_URL}/?action=bulk_tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Token": getAdminToken() },
    body: JSON.stringify({ ids, op, ...extra }),
  });
  return res.json();
}

// ── Saved Views types + API ───────────────────────────────────────────────────

type ViewFilters = {
  queue?: string;
  status?: string;
  priority?: string;
  module?: string;
  search?: string;
  onlyUnassigned?: boolean;
};

type SavedView = {
  id: number;
  name: string;
  description: string;
  scope: "personal" | "shared";
  filters: ViewFilters;
  order_index: number;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
  created_by: string;
  is_mine: boolean;
};

async function viewsReq(action: string, body?: object) {
  const method = body ? "POST" : "GET";
  const url = `${TICKETS_URL}/?action=${action}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", "X-Admin-Token": getAdminToken() },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
}

function slaColor(state: string) {
  if (state === "overdue")  return "text-red-400";
  if (state === "due_soon") return "text-amber-400";
  return "text-gray-600";
}

function slaLabel(t: Ticket) {
  if (t.is_overdue) return `+${Math.round(t.age_hours)}h overdue`;
  const h = t.age_hours;
  if (!h && h !== 0) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.floor(h / 24)}d`;
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status, onClick }: { status: TicketStatus; onClick?: () => void }) {
  const cfg = STATUS_CFG[status];
  return (
    <span
      onClick={onClick}
      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.color} ${
        onClick ? "cursor-pointer hover:opacity-80" : ""
      }`}
    >
      {cfg.label}
    </span>
  );
}

function PriorityDot({ priority }: { priority: TicketPriority }) {
  return (
    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_CFG[priority].dot}`} />
  );
}

function Spinner() {
  return (
    <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
  );
}

// ── Overview card ─────────────────────────────────────────────────────────────

function OverviewCard({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div className="bg-gray-800/60 rounded-lg px-2 py-2 flex flex-col items-center border border-gray-700/60">
      <span className={`text-lg font-bold leading-none ${color}`}>{value}</span>
      <span className="text-[10px] text-gray-500 mt-0.5 text-center leading-tight">{label}</span>
    </div>
  );
}

// ── Add Ticket Form ───────────────────────────────────────────────────────────

type AddFormProps = {
  onAdd: (ticket: Ticket) => void;
  onCancel: () => void;
};

function AddTicketForm({ onAdd, onCancel }: AddFormProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    subject: "",
    requester_name: "",
    requester_email: "",
    priority: "medium" as TicketPriority,
    status: "new" as TicketStatus,
    source: "web",
    module_slug: "",
    body: "",
    owner_email: "",
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function submit() {
    if (!form.subject.trim()) return;
    setSaving(true);
    const { ok, data } = await ticketsApi.add(form as Record<string, unknown>);
    setSaving(false);
    if (ok && data.ticket) {
      onAdd(data.ticket as Ticket);
      toast({ title: "Тикет создан" });
    } else {
      toast({ title: "Не удалось создать тикет", variant: "destructive" });
    }
  }

  const inputCls =
    "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600 transition-colors";
  const labelCls = "block text-[10px] text-gray-500 mb-1";

  return (
    <div className="bg-gray-900 border-b border-gray-800 px-4 py-4 space-y-3">
      <p className="text-xs font-semibold text-gray-300">Новый тикет</p>

      <div>
        <label className={labelCls}>Тема *</label>
        <input
          className={inputCls}
          placeholder="Тема обращения"
          value={form.subject}
          onChange={e => set("subject", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Имя заявителя</label>
          <input
            className={inputCls}
            placeholder="Имя"
            value={form.requester_name}
            onChange={e => set("requester_name", e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Email заявителя</label>
          <input
            className={inputCls}
            type="email"
            placeholder="email@example.com"
            value={form.requester_email}
            onChange={e => set("requester_email", e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={labelCls}>Приоритет</label>
          <select
            className={inputCls}
            value={form.priority}
            onChange={e => set("priority", e.target.value as TicketPriority)}
          >
            {PRIORITIES.map(p => (
              <option key={p} value={p}>
                {PRIORITY_CFG[p].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Статус</label>
          <select
            className={inputCls}
            value={form.status}
            onChange={e => set("status", e.target.value as TicketStatus)}
          >
            {STATUSES.map(s => (
              <option key={s} value={s}>
                {STATUS_CFG[s].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Источник</label>
          <select
            className={inputCls}
            value={form.source}
            onChange={e => set("source", e.target.value)}
          >
            {SOURCES.map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>Модуль</label>
        <input
          className={inputCls}
          placeholder="module-slug"
          value={form.module_slug}
          onChange={e => set("module_slug", e.target.value)}
        />
      </div>

      <div>
        <label className={labelCls}>Описание</label>
        <textarea
          className={`${inputCls} resize-none`}
          rows={3}
          placeholder="Описание проблемы…"
          value={form.body}
          onChange={e => set("body", e.target.value)}
        />
      </div>

      <div>
        <label className={labelCls}>Owner email</label>
        <input
          className={inputCls}
          type="email"
          placeholder="owner@example.com"
          value={form.owner_email}
          onChange={e => set("owner_email", e.target.value)}
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={submit}
          disabled={saving || !form.subject.trim()}
          className="px-3 py-1.5 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
        >
          {saving ? <Spinner /> : null}
          Создать
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs rounded-lg transition-colors"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}

// ── Ticket Row ────────────────────────────────────────────────────────────────

function TicketRow({
  ticket,
  selected,
  onClick,
  bulkMode,
  isChecked,
  onCheck,
}: {
  ticket: Ticket;
  selected: boolean;
  onClick: () => void;
  bulkMode: boolean;
  isChecked: boolean;
  onCheck: (id: number, checked: boolean) => void;
}) {
  return (
    <div
      onClick={bulkMode ? undefined : onClick}
      className={`px-4 py-3 cursor-pointer transition-colors hover:bg-gray-800/50 ${
        selected && !bulkMode ? "bg-violet-900/20 border-l-2 border-violet-500" : "border-l-2 border-transparent"
      } ${isChecked ? "bg-violet-900/10" : ""}`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        {bulkMode && (
          <input
            type="checkbox"
            checked={isChecked}
            onChange={e => { e.stopPropagation(); onCheck(ticket.id, e.target.checked); }}
            onClick={e => e.stopPropagation()}
            className="w-3 h-3 accent-violet-500 cursor-pointer flex-shrink-0"
          />
        )}
        <PriorityDot priority={ticket.priority} />
        <span className="font-mono text-[10px] text-gray-600 flex-shrink-0">{ticket.ticket_no}</span>
        {/* SLA badge */}
        {ticket.sla_state && ticket.sla_state !== "ok" && (
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
            ticket.sla_state === "overdue"
              ? "bg-red-900/40 text-red-400 border border-red-800"
              : "bg-amber-900/30 text-amber-400 border border-amber-800"
          }`}>
            {ticket.sla_state === "overdue" ? "Overdue" : "Due soon"}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <span className={`text-[9px] font-mono ${slaColor(ticket.sla_state ?? "ok")}`}>
            {slaLabel(ticket)}
          </span>
          <StatusBadge status={ticket.status} />
        </div>
      </div>
      <p
        className={`text-sm font-medium truncate leading-snug ${bulkMode ? "cursor-pointer" : ""}`}
        onClick={bulkMode ? onClick : undefined}
        style={{ color: "#e2e8f0" }}
      >
        {ticket.subject}
      </p>
      <div className="flex items-center gap-1.5 mt-1">
        <span className="text-[10px] text-gray-600 truncate flex-1">{ticket.requester_email}</span>
        {ticket.assignee_email && (
          <span className="text-[10px] text-gray-600 truncate max-w-[80px]">→ {ticket.assignee_email}</span>
        )}
        <span className="text-[10px] text-gray-700 flex-shrink-0">
          {fmtDate(ticket.last_message_at || ticket.created_at)}
        </span>
      </div>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: TicketMessage }) {
  if (msg.message_type === "system_event") {
    return (
      <div className="text-center py-1">
        <span className="text-[10px] text-gray-600">→ {msg.body}</span>
      </div>
    );
  }

  if (msg.message_type === "internal_note") {
    return (
      <div className="border-l-2 border-amber-600 bg-amber-900/20 rounded-r-xl px-4 py-3">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-400 border border-amber-800">
            internal
          </span>
          <span className="text-[10px] text-gray-500 font-medium">{msg.author_name || msg.author_email}</span>
          <span className="text-[10px] text-gray-700 ml-auto">{fmtDate(msg.created_at)}</span>
        </div>
        <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{msg.body}</p>
      </div>
    );
  }

  // public_reply
  return (
    <div className="bg-gray-800/60 rounded-xl px-4 py-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] font-medium text-gray-300">{msg.author_name || msg.author_email}</span>
        <span className="text-[10px] text-gray-500">{msg.author_email}</span>
        <span className="text-[10px] text-gray-700 ml-auto">{fmtDate(msg.created_at)}</span>
      </div>
      <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{msg.body}</p>
    </div>
  );
}

// ── Reply Form ────────────────────────────────────────────────────────────────

type ReplyFormProps = {
  ticketId: number;
  onSent: (msg: TicketMessage) => void;
};

function ReplyForm({ ticketId, onSent }: ReplyFormProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"public_reply" | "internal_note">("public_reply");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!body.trim()) return;
    setSending(true);
    const optimistic: TicketMessage = {
      id: Date.now(),
      ticket_id: ticketId,
      message_type: tab,
      author_name: "Admin",
      author_email: "",
      body,
      created_at: new Date().toISOString(),
      created_by: "admin",
    };
    onSent(optimistic);
    setBody("");
    const { ok, data } = await ticketsApi.addMessage({
      ticket_id: ticketId,
      message_type: tab,
      body,
    });
    setSending(false);
    if (!ok) {
      toast({ title: "Ошибка отправки сообщения", variant: "destructive" });
    } else if (data.message) {
      onSent(data.message as TicketMessage);
    }
  }

  const isNote = tab === "internal_note";

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      {/* Tab switcher */}
      <div className="flex gap-1 mb-3">
        {(["public_reply", "internal_note"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
              tab === t
                ? t === "internal_note"
                  ? "bg-amber-900/40 text-amber-400 border-b-2 border-amber-500"
                  : "bg-violet-900/40 text-violet-400 border-b-2 border-violet-500"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {t === "public_reply" ? "Reply" : "Internal note"}
          </button>
        ))}
      </div>

      <textarea
        className={`w-full rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none transition-colors resize-none border ${
          isNote
            ? "bg-amber-900/10 border-amber-800/60 focus:border-amber-600"
            : "bg-gray-800 border-gray-700 focus:border-violet-600"
        }`}
        rows={3}
        placeholder={isNote ? "Внутренняя заметка (видна только команде)…" : "Ответить заявителю…"}
        value={body}
        onChange={e => setBody(e.target.value)}
      />

      <div className="flex items-center justify-between mt-2">
        <button
          onClick={send}
          disabled={sending || !body.trim()}
          className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1.5 ${
            isNote
              ? "bg-amber-700 hover:bg-amber-600 text-white"
              : "bg-violet-700 hover:bg-violet-600 text-white"
          }`}
        >
          {sending ? <Spinner /> : null}
          Отправить
        </button>
      </div>
    </div>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

type DetailPanelProps = {
  ticket: Ticket;
  messages: TicketMessage[];
  loadingMsgs: boolean;
  onTicketChange: (updated: Ticket) => void;
  onMessageSent: (msg: TicketMessage) => void;
};

function DetailPanel({
  ticket,
  messages,
  loadingMsgs,
  onTicketChange,
  onMessageSent,
}: DetailPanelProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [assigneeVal, setAssigneeVal] = useState(ticket.assignee_email);
  const [statusOpen, setStatusOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const priorityRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAssigneeVal(ticket.assignee_email);
  }, [ticket.id, ticket.assignee_email]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false);
      if (priorityRef.current && !priorityRef.current.contains(e.target as Node)) setPriorityOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function changeStatus(status: TicketStatus) {
    setStatusOpen(false);
    const { ok, data } = await ticketsApi.update({ id: ticket.id, status });
    if (ok && data.ticket) {
      onTicketChange(data.ticket as Ticket);
      toast({ title: `Статус → ${STATUS_CFG[status].label}` });
    } else {
      toast({ title: "Ошибка обновления статуса", variant: "destructive" });
    }
  }

  async function changePriority(priority: TicketPriority) {
    setPriorityOpen(false);
    const { ok, data } = await ticketsApi.update({ id: ticket.id, priority });
    if (ok && data.ticket) {
      onTicketChange(data.ticket as Ticket);
      toast({ title: `Приоритет → ${PRIORITY_CFG[priority].label}` });
    } else {
      toast({ title: "Ошибка обновления приоритета", variant: "destructive" });
    }
  }

  async function saveAssignee() {
    const { ok, data } = await ticketsApi.update({ id: ticket.id, assignee_email: assigneeVal });
    if (ok && data.ticket) {
      onTicketChange(data.ticket as Ticket);
      toast({ title: "Исполнитель обновлён" });
    } else {
      toast({ title: "Ошибка обновления исполнителя", variant: "destructive" });
    }
  }

  const inputCls =
    "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600 transition-colors";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Panel header */}
      <div className="px-6 py-4 border-b border-gray-800 flex items-start gap-3 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs text-gray-500">{ticket.ticket_no}</span>
            {ticket.module_slug && (
              <span className="text-[10px] text-violet-400 font-mono px-1.5 py-0.5 rounded bg-violet-900/30 border border-violet-800">
                {ticket.module_slug}
              </span>
            )}
            {/* SLA info in header */}
            {ticket.sla_state && ticket.sla_state !== "ok" && (
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                ticket.sla_state === "overdue"
                  ? "bg-red-900/40 text-red-400 border border-red-800"
                  : "bg-amber-900/30 text-amber-400 border border-amber-800"
              }`}>
                {ticket.sla_state === "overdue" ? "Overdue" : "Due soon"}
              </span>
            )}
          </div>
          <h2 className="text-base font-semibold text-gray-100 leading-snug">{ticket.subject}</h2>
          <p className="text-xs text-gray-500 mt-1">
            {ticket.requester_name} · {ticket.requester_email}
            {ticket.requester_user_id && (
              <button
                onClick={() => navigate(`/admin/users?id=${ticket.requester_user_id}`)}
                className="ml-2 text-violet-400 hover:underline"
              >
                профиль
              </button>
            )}
          </p>
        </div>

        {/* Status dropdown */}
        <div className="relative flex-shrink-0" ref={statusRef}>
          <StatusBadge status={ticket.status} onClick={() => setStatusOpen(o => !o)} />
          {statusOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 bg-gray-850 border border-gray-700 rounded-xl shadow-xl overflow-hidden w-36"
                 style={{ background: "#1a1d23" }}>
              {STATUSES.map(s => (
                <button
                  key={s}
                  onClick={() => changeStatus(s)}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-800 transition-colors ${
                    s === ticket.status ? "text-violet-400 bg-violet-900/20" : "text-gray-300"
                  }`}
                >
                  {STATUS_CFG[s].label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Meta row */}
      <div className="px-6 py-3 border-b border-gray-800/60 flex flex-wrap gap-x-4 gap-y-2 flex-shrink-0">
        {/* Priority */}
        <div className="relative" ref={priorityRef}>
          <button
            onClick={() => setPriorityOpen(o => !o)}
            className={`flex items-center gap-1.5 text-xs font-medium hover:opacity-80 transition-opacity ${PRIORITY_CFG[ticket.priority].color}`}
          >
            <PriorityDot priority={ticket.priority} />
            {PRIORITY_CFG[ticket.priority].label}
          </button>
          {priorityOpen && (
            <div className="absolute left-0 top-full mt-1 z-20 bg-gray-850 border border-gray-700 rounded-xl shadow-xl overflow-hidden w-28"
                 style={{ background: "#1a1d23" }}>
              {PRIORITIES.map(p => (
                <button
                  key={p}
                  onClick={() => changePriority(p)}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-800 transition-colors ${
                    p === ticket.priority ? "text-violet-400 bg-violet-900/20" : "text-gray-300"
                  }`}
                >
                  {PRIORITY_CFG[p].label}
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="text-xs text-gray-600">
          Создан: <span className="text-gray-400">{fmtDate(ticket.created_at)}</span>
        </span>
        {ticket.first_response_at && (
          <span className="text-xs text-gray-600">
            1й ответ: <span className="text-gray-400">{fmtDate(ticket.first_response_at)}</span>
          </span>
        )}
        {ticket.resolved_at && (
          <span className="text-xs text-gray-600">
            Решён: <span className="text-gray-400">{fmtDate(ticket.resolved_at)}</span>
          </span>
        )}
        {/* SLA timing */}
        {(ticket.response_due_at || ticket.resolve_due_at) && (
          <span className={`text-xs font-mono ${slaColor(ticket.sla_state ?? "ok")}`}>
            SLA: {slaLabel(ticket)}
          </span>
        )}
      </div>

      {/* Assignee */}
      <div className="px-6 py-3 border-b border-gray-800/60 flex items-center gap-2 flex-shrink-0">
        <span className="text-[10px] text-gray-500 w-20 flex-shrink-0">Исполнитель</span>
        <input
          className={`${inputCls} flex-1`}
          placeholder="email@example.com"
          value={assigneeVal}
          onChange={e => setAssigneeVal(e.target.value)}
          onBlur={saveAssignee}
          onKeyDown={e => e.key === "Enter" && saveAssignee()}
        />
      </div>

      {/* Tags */}
      {ticket.tags_json && ticket.tags_json.length > 0 && (
        <div className="px-6 py-2 border-b border-gray-800/60 flex flex-wrap gap-1 flex-shrink-0">
          {ticket.tags_json.map(tag => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 border border-gray-700"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* Original body */}
        {ticket.body && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 px-4 py-3">
            <p className="text-[10px] text-gray-600 mb-1.5 font-semibold uppercase tracking-wide">
              Исходное сообщение
            </p>
            <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{ticket.body}</p>
          </div>
        )}

        {/* Timeline */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Icon name="MessageSquare" size={14} className="text-gray-500" />
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">История</span>
            <span className="ml-auto text-[10px] text-gray-600">{messages.length} сообщений</span>
          </div>

          {loadingMsgs ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-xs text-gray-600 text-center py-4">Сообщений пока нет</p>
          ) : (
            <div className="space-y-3">
              {messages.map(msg => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
            </div>
          )}
        </div>

        {/* Reply form */}
        <ReplyForm
          ticketId={ticket.id}
          onSent={msg => onMessageSent(msg)}
        />
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminTicketsPage() {
  const { toast } = useToast();

  // Data state
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [summary, setSummary] = useState<Summary>({
    new: 0,
    open: 0,
    waiting_user: 0,
    urgent: 0,
    unassigned: 0,
    resolved_today: 0,
    active: 0,
    overdue: 0,
  });
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);

  // Loading state
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  // UI state
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<TicketStatus | "">("");
  const [filterPriority, setFilterPriority] = useState<TicketPriority | "">("");
  const [filterModule, setFilterModule] = useState("");
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);

  // Queue tabs state
  const [queue, setQueue] = useState("all");

  // Bulk mode state
  const [bulkSelected, setBulkSelected] = useState<Set<number>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkOp, setBulkOp] = useState<"assign" | "status" | "priority" | null>(null);
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [bulkStatus, setBulkStatus] = useState<TicketStatus>("open");
  const [bulkPriority, setBulkPriority] = useState<TicketPriority>("medium");
  const [bulkSaving, setBulkSaving] = useState(false);

  // Saved views state
  const [views, setViews] = useState<SavedView[]>([]);
  const [showViews, setShowViews] = useState(false);
  const [savingView, setSavingView] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [newViewScope, setNewViewScope] = useState<"personal" | "shared">("personal");

  // Load summary + list
  async function loadAll() {
    setLoadingList(true);
    const params: Record<string, string> = {};
    if (filterStatus) params.status = filterStatus;
    if (filterPriority) params.priority = filterPriority;
    if (search) params.search = search;
    if (queue === "unassigned") { params.unassigned = "1"; }
    else if (queue === "urgent") { params.urgent = "1"; }
    else if (queue === "overdue" || queue === "waiting_user") { params.queue = queue; }

    const [summaryRes, listRes] = await Promise.all([
      ticketsApi.summary(),
      ticketsApi.all(params),
    ]);

    if (summaryRes.ok && summaryRes.data) {
      setSummary(summaryRes.data as Summary);
    }
    if (listRes.ok && Array.isArray(listRes.data.tickets)) {
      setTickets(listRes.data.tickets as Ticket[]);
    } else if (!listRes.ok) {
      toast({ title: "Не удалось загрузить тикеты", variant: "destructive" });
    }
    setLoadingList(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterPriority, queue]);

  // Load saved views on mount
  useEffect(() => {
    viewsReq("views_list").then(d => {
      if (d.ok) setViews(d.views ?? []);
    });
   
  }, []);

  function applyView(v: SavedView) {
    const f = v.filters;
    setQueue(f.queue ?? "all");
    setFilterStatus((f.status ?? "") as TicketStatus | "");
    setFilterPriority((f.priority ?? "") as TicketPriority | "");
    setFilterModule(f.module ?? "");
    setSearch(f.search ?? "");
    setOnlyUnassigned(f.onlyUnassigned ?? false);
    setShowViews(false);
    viewsReq("views_use", { id: v.id });
  }

  async function saveCurrentView() {
    if (!newViewName.trim()) return;
    setSavingView(true);
    const filters: ViewFilters = {};
    if (queue && queue !== "all") filters.queue = queue;
    if (filterStatus)    filters.status = filterStatus;
    if (filterPriority)  filters.priority = filterPriority;
    if (filterModule)    filters.module = filterModule;
    if (search)          filters.search = search;
    if (onlyUnassigned)  filters.onlyUnassigned = true;
    const res = await viewsReq("views_create", {
      name: newViewName.trim(),
      scope: newViewScope,
      filters,
    });
    setSavingView(false);
    if (res.ok) {
      setNewViewName("");
      const d = await viewsReq("views_list");
      if (d.ok) setViews(d.views ?? []);
      toast({ title: "Вид сохранён" });
    }
  }

  async function deleteView(id: number) {
    await viewsReq("views_delete", { id });
    setViews(vs => vs.filter(v => v.id !== id));
  }

  // Load messages when a ticket is selected
  async function loadMessages(ticketId: number) {
    setLoadingMsgs(true);
    setMessages([]);
    const { ok, data } = await ticketsApi.messages(ticketId);
    setLoadingMsgs(false);
    if (ok && Array.isArray(data.messages)) {
      setMessages(data.messages as TicketMessage[]);
    } else if (!ok) {
      toast({ title: "Не удалось загрузить историю", variant: "destructive" });
    }
  }

  function selectTicket(ticket: Ticket) {
    setSelected(ticket);
    loadMessages(ticket.id);
  }

  function handleTicketChange(updated: Ticket) {
    setSelected(updated);
    setTickets(ts => ts.map(t => (t.id === updated.id ? updated : t)));
  }

  function handleMessageSent(msg: TicketMessage) {
    setMessages(prev => {
      // Replace optimistic if real one arrives (same body + ticket_id within ~2s)
      const existsOptimistic = prev.find(
        m => m.id !== msg.id && m.body === msg.body && m.ticket_id === msg.ticket_id
      );
      if (existsOptimistic) {
        return prev.map(m => (m === existsOptimistic ? msg : m));
      }
      // Already appended optimistically, skip duplicate
      if (prev.some(m => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
    // Update last_message_at optimistically
    if (selected?.id === msg.ticket_id) {
      setSelected(t => (t ? { ...t, last_message_at: msg.created_at } : t));
      setTickets(ts =>
        ts.map(t =>
          t.id === msg.ticket_id ? { ...t, last_message_at: msg.created_at } : t
        )
      );
    }
  }

  function handleAdd(ticket: Ticket) {
    setTickets(ts => [ticket, ...ts]);
    setShowAdd(false);
    setSummary(s => ({ ...s, new: s.new + 1 }));
    selectTicket(ticket);
  }

  // Filtered list
  const displayed = tickets.filter(t => {
    if (filterModule && !t.module_slug.includes(filterModule)) return false;
    if (onlyUnassigned && t.assignee_email) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !t.subject.toLowerCase().includes(q) &&
        !t.requester_email.toLowerCase().includes(q) &&
        !t.ticket_no.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const selectCls =
    "bg-gray-800 border border-gray-700 text-xs text-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-600 transition-colors";

  return (
    <AdminShell>
      <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
        {/* ── LEFT COLUMN ─────────────────────────────────────────────────── */}
        <div className="w-96 flex-shrink-0 border-r border-gray-800 flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2 flex-shrink-0">
            <Icon name="Ticket" size={16} className="text-violet-400" />
            <span className="text-sm font-semibold text-gray-200">Tickets</span>
            <span className="ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">
              {tickets.length}
            </span>
            <button
              onClick={() => setShowAdd(o => !o)}
              className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 text-white transition-colors"
            >
              + Новый тикет
            </button>
            <button
              onClick={() => { setBulkMode(m => !m); setBulkSelected(new Set()); }}
              className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${
                bulkMode
                  ? "bg-violet-900/40 text-violet-400 border-violet-700"
                  : "bg-gray-800 text-gray-500 border-gray-700 hover:text-gray-300"
              }`}
            >
              {bulkMode ? `✓ ${bulkSelected.size}` : "Bulk"}
            </button>
          </div>

          {/* Add form */}
          {showAdd && (
            <AddTicketForm onAdd={handleAdd} onCancel={() => setShowAdd(false)} />
          )}

          {/* Overview cards */}
          <div className="px-4 pt-3 pb-2 grid grid-cols-4 gap-1.5 flex-shrink-0">
            <OverviewCard value={summary.new} label="New" color="text-blue-400" />
            <OverviewCard value={summary.open} label="Open" color="text-emerald-400" />
            <OverviewCard value={summary.urgent} label="Urgent" color="text-red-400" />
            <OverviewCard value={summary.overdue ?? 0} label="Overdue" color="text-red-500" />
            <OverviewCard value={summary.waiting_user} label="Waiting" color="text-amber-400" />
            <OverviewCard value={summary.unassigned} label="Unassigned" color="text-gray-400" />
            <OverviewCard value={summary.active} label="Active" color="text-violet-400" />
            <OverviewCard value={summary.resolved_today} label="Resolved today" color="text-gray-500" />
          </div>

          {/* Queue tabs */}
          <div className="px-4 py-2 flex gap-1 flex-wrap border-b border-gray-800/60 flex-shrink-0">
            {QUEUES.map(q => (
              <button
                key={q.key}
                onClick={() => { setQueue(q.key); setBulkSelected(new Set()); }}
                className={`text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors ${
                  queue === q.key
                    ? "bg-violet-700 text-white"
                    : "bg-gray-800 text-gray-500 hover:text-gray-300 border border-gray-700"
                }`}
              >
                {q.label}
                {q.key === "overdue" && (summary.overdue ?? 0) > 0 && (
                  <span className="ml-1 bg-red-500 text-white text-[9px] px-1 rounded-full">{summary.overdue}</span>
                )}
                {q.key === "urgent" && summary.urgent > 0 && (
                  <span className="ml-1 bg-red-900/60 text-red-400 text-[9px] px-1 rounded-full">{summary.urgent}</span>
                )}
              </button>
            ))}
          </div>

          {/* Saved Views */}
          <div className="px-4 py-2 border-b border-gray-800/60 flex-shrink-0">
            <button
              onClick={() => setShowViews(v => !v)}
              className={`flex items-center gap-1.5 text-[10px] font-medium transition-colors ${
                showViews ? "text-violet-400" : "text-gray-600 hover:text-gray-400"
              }`}
            >
              <Icon name="Bookmark" size={11} />
              Сохранённые виды
              {views.length > 0 && (
                <span className="ml-0.5 text-[9px] bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded-full border border-gray-700">
                  {views.length}
                </span>
              )}
              <Icon name={showViews ? "ChevronUp" : "ChevronDown"} size={10} />
            </button>

            {showViews && (
              <div className="mt-2 space-y-1">
                {/* Existing views */}
                {views.length === 0 ? (
                  <p className="text-[10px] text-gray-700 italic py-1">Нет сохранённых видов</p>
                ) : (
                  views.map(v => (
                    <div key={v.id}
                      className="flex items-center gap-1.5 group rounded-lg px-2 py-1.5 hover:bg-gray-800/60 transition-colors"
                    >
                      <button
                        onClick={() => applyView(v)}
                        className="flex-1 text-left flex items-center gap-1.5 min-w-0"
                      >
                        <Icon
                          name={v.scope === "shared" ? "Users" : "User"}
                          size={10}
                          className={v.scope === "shared" ? "text-violet-500 flex-shrink-0" : "text-gray-600 flex-shrink-0"}
                        />
                        <span className="text-[10px] text-gray-300 truncate">{v.name}</span>
                        {v.use_count > 0 && (
                          <span className="text-[9px] text-gray-700 flex-shrink-0 ml-auto">{v.use_count}×</span>
                        )}
                      </button>
                      {v.is_mine && (
                        <button
                          onClick={() => deleteView(v.id)}
                          className="opacity-0 group-hover:opacity-100 text-gray-700 hover:text-red-500 transition-all p-0.5"
                        >
                          <Icon name="X" size={10} />
                        </button>
                      )}
                    </div>
                  ))
                )}

                {/* Save current filters */}
                <div className="pt-2 border-t border-gray-800 space-y-1.5">
                  <p className="text-[9px] text-gray-700 uppercase tracking-wide font-semibold">Сохранить текущие фильтры</p>
                  <input
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600"
                    placeholder="Название вида..."
                    value={newViewName}
                    onChange={e => setNewViewName(e.target.value)}
                  />
                  <div className="flex gap-1.5 items-center">
                    <select
                      value={newViewScope}
                      onChange={e => setNewViewScope(e.target.value as "personal" | "shared")}
                      className="bg-gray-800 border border-gray-700 text-[10px] text-gray-400 rounded px-1.5 py-1 focus:outline-none"
                    >
                      <option value="personal">Личный</option>
                      <option value="shared">Общий</option>
                    </select>
                    <button
                      onClick={saveCurrentView}
                      disabled={savingView || !newViewName.trim()}
                      className="flex-1 py-1 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white text-[10px] font-semibold rounded transition-colors"
                    >
                      {savingView ? "..." : "Сохранить"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="px-4 py-2 space-y-2 flex-shrink-0 border-b border-gray-800/60">
            <input
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600 transition-colors"
              placeholder="Поиск..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="flex gap-2">
              <select
                className={`${selectCls} flex-1`}
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value as TicketStatus | "")}
              >
                <option value="">Все статусы</option>
                {STATUSES.map(s => (
                  <option key={s} value={s}>
                    {STATUS_CFG[s].label}
                  </option>
                ))}
              </select>
              <select
                className={`${selectCls} flex-1`}
                value={filterPriority}
                onChange={e => setFilterPriority(e.target.value as TicketPriority | "")}
              >
                <option value="">Все приоритеты</option>
                {PRIORITIES.map(p => (
                  <option key={p} value={p}>
                    {PRIORITY_CFG[p].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <input
                className={`${selectCls} flex-1`}
                placeholder="Модуль"
                value={filterModule}
                onChange={e => setFilterModule(e.target.value)}
              />
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyUnassigned}
                  onChange={e => setOnlyUnassigned(e.target.checked)}
                  className="w-3 h-3 accent-violet-500"
                />
                <span className="text-[10px] text-gray-500">Без исп.</span>
              </label>
              <button
                onClick={loadAll}
                className="text-[10px] text-gray-500 hover:text-gray-300 px-2 py-1 rounded border border-gray-700 bg-gray-800 transition-colors"
              >
                Обновить
              </button>
            </div>
          </div>

          {/* Bulk action bar */}
          {bulkMode && bulkSelected.size > 0 && (
            <div className="px-4 py-2 bg-violet-900/20 border-b border-violet-800/40 flex items-center gap-2 flex-shrink-0 flex-wrap">
              <span className="text-[10px] text-violet-400 font-semibold">{bulkSelected.size} выбрано</span>
              <select
                value={bulkOp ?? ""}
                onChange={e => setBulkOp(e.target.value as typeof bulkOp)}
                className="bg-gray-800 border border-gray-700 text-[10px] text-gray-300 rounded px-1.5 py-1 focus:outline-none"
              >
                <option value="">Действие</option>
                <option value="assign">Назначить</option>
                <option value="status">Статус</option>
                <option value="priority">Приоритет</option>
              </select>
              {bulkOp === "assign" && (
                <input
                  value={bulkAssignee}
                  onChange={e => setBulkAssignee(e.target.value)}
                  placeholder="email исполнителя"
                  className="bg-gray-800 border border-gray-700 text-[10px] text-gray-200 rounded px-2 py-1 focus:outline-none w-40"
                />
              )}
              {bulkOp === "status" && (
                <select
                  value={bulkStatus}
                  onChange={e => setBulkStatus(e.target.value as TicketStatus)}
                  className="bg-gray-800 border border-gray-700 text-[10px] text-gray-300 rounded px-1.5 py-1 focus:outline-none"
                >
                  {STATUSES.map(s => <option key={s} value={s}>{STATUS_CFG[s].label}</option>)}
                </select>
              )}
              {bulkOp === "priority" && (
                <select
                  value={bulkPriority}
                  onChange={e => setBulkPriority(e.target.value as TicketPriority)}
                  className="bg-gray-800 border border-gray-700 text-[10px] text-gray-300 rounded px-1.5 py-1 focus:outline-none"
                >
                  {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_CFG[p].label}</option>)}
                </select>
              )}
              <button
                disabled={!bulkOp || bulkSaving}
                onClick={async () => {
                  if (!bulkOp) return;
                  setBulkSaving(true);
                  const extra: Record<string, string> = {};
                  if (bulkOp === "assign") extra.assignee_email = bulkAssignee;
                  if (bulkOp === "status") extra.status = bulkStatus;
                  if (bulkOp === "priority") extra.priority = bulkPriority;
                  await bulkTickets([...bulkSelected], bulkOp, extra);
                  setBulkSaving(false);
                  setBulkSelected(new Set());
                  setBulkOp(null);
                  loadAll();
                }}
                className="px-2.5 py-1 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white text-[10px] font-semibold rounded-lg transition-colors"
              >
                {bulkSaving ? "..." : "Применить"}
              </button>
              <button
                onClick={() => { setBulkSelected(new Set()); setBulkOp(null); }}
                className="ml-auto text-[10px] text-gray-600 hover:text-gray-400"
              >
                Сбросить
              </button>
            </div>
          )}

          {/* Select all row when bulk mode active */}
          {bulkMode && (
            <div className="px-4 py-1.5 border-b border-gray-800/60 flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setBulkSelected(new Set(displayed.map(t => t.id)))}
                className="text-[10px] text-violet-400 hover:text-violet-300"
              >
                Выбрать все ({displayed.length})
              </button>
              {bulkSelected.size > 0 && (
                <button
                  onClick={() => setBulkSelected(new Set())}
                  className="text-[10px] text-gray-600 hover:text-gray-400 ml-2"
                >
                  Снять всё
                </button>
              )}
            </div>
          )}

          {/* Ticket list */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-800/60">
            {loadingList ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : displayed.length === 0 ? (
              <p className="text-xs text-gray-600 text-center py-8">Тикетов не найдено</p>
            ) : (
              displayed.map(ticket => (
                <TicketRow
                  key={ticket.id}
                  ticket={ticket}
                  selected={selected?.id === ticket.id}
                  onClick={() => selectTicket(ticket)}
                  bulkMode={bulkMode}
                  isChecked={bulkSelected.has(ticket.id)}
                  onCheck={(id, checked) => {
                    setBulkSelected(prev => {
                      const next = new Set(prev);
                      if (checked) next.add(id); else next.delete(id);
                      return next;
                    });
                  }}
                />
              ))
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL ─────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col">
          {selected ? (
            <DetailPanel
              ticket={selected}
              messages={messages}
              loadingMsgs={loadingMsgs}
              onTicketChange={handleTicketChange}
              onMessageSent={handleMessageSent}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-2">
                <Icon name="Ticket" size={32} className="text-gray-700 mx-auto" />
                <p className="text-sm text-gray-600">Выберите тикет для просмотра</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}