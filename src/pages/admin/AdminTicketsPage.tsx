import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import { ticketsApi, type TicketStatus, type TicketPriority, type TicketMsgType } from "@/lib/admin-api";

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

// ── Helpers ───────────────────────────────────────────────────────────────────

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
          placeholder="module-slug (опционально)"
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
}: {
  ticket: Ticket;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`px-4 py-3 cursor-pointer transition-colors hover:bg-gray-800/50 ${
        selected
          ? "bg-violet-900/20 border-l-2 border-violet-500"
          : "border-l-2 border-transparent"
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <PriorityDot priority={ticket.priority} />
        <span className="font-mono text-[10px] text-gray-600 flex-shrink-0">{ticket.ticket_no}</span>
        <div className="ml-auto">
          <StatusBadge status={ticket.status} />
        </div>
      </div>
      <p className="text-sm font-medium text-gray-200 truncate leading-snug">{ticket.subject}</p>
      <div className="flex items-center gap-1.5 mt-1">
        <span className="text-[10px] text-gray-600 truncate flex-1">{ticket.requester_email}</span>
        {ticket.module_slug && (
          <span className="text-[10px] text-violet-500 font-mono flex-shrink-0">
            {ticket.module_slug}
          </span>
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
    function handle(e: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setStatusOpen(false);
      }
      if (priorityRef.current && !priorityRef.current.contains(e.target as Node)) {
        setPriorityOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  async function updateField(fields: Record<string, unknown>) {
    const { ok, data } = await ticketsApi.update({ id: ticket.id, ...fields });
    if (ok && data.ticket) {
      onTicketChange(data.ticket as Ticket);
    } else {
      toast({ title: "Ошибка обновления тикета", variant: "destructive" });
    }
  }

  async function saveAssignee() {
    if (assigneeVal === ticket.assignee_email) return;
    await updateField({ assignee_email: assigneeVal });
  }

  const isClosedOrResolved = ticket.status === "resolved" || ticket.status === "closed";

  const inputCls =
    "w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600 transition-colors";

  return (
    <div className="px-6 py-5 space-y-5 max-w-3xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-xs text-gray-600">{ticket.ticket_no}</span>
          <div className="ml-auto flex items-center gap-2">
            {/* Quick actions */}
            {!isClosedOrResolved && (
              <>
                <button
                  onClick={() => updateField({ status: "resolved" })}
                  className="px-3 py-1 text-xs font-semibold rounded-lg bg-emerald-900/40 text-emerald-400 hover:bg-emerald-800/60 border border-emerald-800 transition-colors"
                >
                  Resolve
                </button>
                <button
                  onClick={() => updateField({ status: "closed" })}
                  className="px-3 py-1 text-xs font-semibold rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700 transition-colors"
                >
                  Close
                </button>
              </>
            )}
            {isClosedOrResolved && (
              <button
                onClick={() => updateField({ status: "open" })}
                className="px-3 py-1 text-xs font-semibold rounded-lg bg-violet-900/40 text-violet-400 hover:bg-violet-800/60 border border-violet-800 transition-colors"
              >
                Reopen
              </button>
            )}
          </div>
        </div>
        <h2 className="text-xl font-bold text-white leading-snug">{ticket.subject}</h2>

        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {/* Status with dropdown */}
          <div className="relative" ref={statusRef}>
            <StatusBadge status={ticket.status} onClick={() => setStatusOpen(o => !o)} />
            {statusOpen && (
              <div className="absolute top-full left-0 mt-1 z-20 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[130px]">
                {STATUSES.map(s => (
                  <button
                    key={s}
                    onClick={() => {
                      setStatusOpen(false);
                      updateField({ status: s });
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-800 transition-colors"
                  >
                    <StatusBadge status={s} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Priority with dropdown */}
          <div className="relative" ref={priorityRef}>
            <button
              onClick={() => setPriorityOpen(o => !o)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full border border-gray-700 bg-gray-800/60 hover:opacity-80 cursor-pointer ${
                PRIORITY_CFG[ticket.priority].color
              }`}
            >
              <PriorityDot priority={ticket.priority} />
              {PRIORITY_CFG[ticket.priority].label}
            </button>
            {priorityOpen && (
              <div className="absolute top-full left-0 mt-1 z-20 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[110px]">
                {PRIORITIES.map(p => (
                  <button
                    key={p}
                    onClick={() => {
                      setPriorityOpen(false);
                      updateField({ priority: p });
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-800 transition-colors"
                  >
                    <PriorityDot priority={p} />
                    <span className={PRIORITY_CFG[p].color}>{PRIORITY_CFG[p].label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {ticket.source && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-gray-700 bg-gray-800/60 text-gray-400">
              {ticket.source}
            </span>
          )}
          {ticket.module_slug && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-violet-800 bg-violet-900/20 text-violet-400">
              {ticket.module_slug}
            </span>
          )}
        </div>
      </div>

      {/* Meta grid */}
      <div className="grid grid-cols-2 gap-4 bg-gray-900 rounded-xl p-4 border border-gray-800 text-xs">
        <div>
          <p className="text-gray-600 mb-0.5">Заявитель</p>
          <p className="text-gray-200 font-medium">{ticket.requester_name || "—"}</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-gray-500">{ticket.requester_email || "—"}</p>
            {ticket.requester_email && (
              <button
                onClick={() => {
                  navigate(`/admin/users?q=${encodeURIComponent(ticket.requester_email)}`);
                }}
                className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-violet-900/40 text-violet-400 border border-violet-800 hover:bg-violet-800/60 transition-colors"
              >
                <Icon name="User" size={9} />
                Профиль
              </button>
            )}
          </div>
        </div>
        <div>
          <p className="text-gray-600 mb-0.5">Исполнитель</p>
          <input
            className={inputCls}
            value={assigneeVal}
            placeholder="assignee@example.com"
            onChange={e => setAssigneeVal(e.target.value)}
            onBlur={saveAssignee}
          />
        </div>
        <div>
          <p className="text-gray-600 mb-0.5">Owner</p>
          <p className="text-gray-400">{ticket.owner_email || "—"}</p>
        </div>
        <div>
          <p className="text-gray-600 mb-0.5">Создан</p>
          <p className="text-gray-400">{fmtDate(ticket.created_at)}</p>
          {ticket.created_by && (
            <p className="text-gray-600 text-[10px]">{ticket.created_by}</p>
          )}
        </div>
        <div>
          <p className="text-gray-600 mb-0.5">Последнее сообщение</p>
          <p className="text-gray-400">{fmtDate(ticket.last_message_at)}</p>
        </div>
        <div>
          <p className="text-gray-600 mb-0.5">Первый ответ</p>
          <p className="text-gray-400">{fmtDate(ticket.first_response_at)}</p>
        </div>
      </div>

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

  // Load summary + list
  async function loadAll() {
    setLoadingList(true);
    const params: Record<string, string> = {};
    if (filterStatus) params.status = filterStatus;
    if (filterPriority) params.priority = filterPriority;
    if (search) params.search = search;

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
  }, [filterStatus, filterPriority]);

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
          </div>

          {/* Add form */}
          {showAdd && (
            <AddTicketForm onAdd={handleAdd} onCancel={() => setShowAdd(false)} />
          )}

          {/* Overview cards */}
          <div className="px-4 pt-3 pb-2 grid grid-cols-3 gap-2 flex-shrink-0">
            <OverviewCard value={summary.new} label="New" color="text-blue-400" />
            <OverviewCard value={summary.open} label="Open" color="text-emerald-400" />
            <OverviewCard value={summary.urgent} label="Urgent" color="text-red-400" />
            <OverviewCard value={summary.waiting_user} label="Waiting" color="text-amber-400" />
            <OverviewCard value={summary.unassigned} label="Unassigned" color="text-gray-400" />
            <OverviewCard value={summary.resolved_today} label="Resolved today" color="text-gray-500" />
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
                className={`${selectCls} flex-1 border border-gray-700 rounded-lg px-2 py-1.5`}
                placeholder="Модуль..."
                value={filterModule}
                onChange={e => setFilterModule(e.target.value)}
              />
              <button
                onClick={() => setOnlyUnassigned(o => !o)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium ${
                  onlyUnassigned
                    ? "bg-violet-900/40 text-violet-400 border-violet-700"
                    : "bg-gray-800 text-gray-500 border-gray-700 hover:text-gray-300"
                }`}
              >
                Only unassigned
              </button>
            </div>
          </div>

          {/* Ticket list */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-800/60">
            {loadingList ? (
              <div className="flex justify-center items-center py-10">
                <Spinner />
              </div>
            ) : displayed.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Icon name="InboxIcon" size={24} className="text-gray-700" fallback="Inbox" />
                <p className="text-xs text-gray-600">Тикетов не найдено</p>
              </div>
            ) : (
              displayed.map(ticket => (
                <TicketRow
                  key={ticket.id}
                  ticket={ticket}
                  selected={selected?.id === ticket.id}
                  onClick={() => selectTicket(ticket)}
                />
              ))
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {selected === null ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
              <Icon name="Inbox" size={40} className="text-gray-700" />
              <p className="text-sm text-gray-600">Выберите тикет</p>
              <p className="text-xs text-gray-700">
                Нажмите на тикет в списке слева, чтобы открыть детали
              </p>
            </div>
          ) : (
            <DetailPanel
              key={selected.id}
              ticket={selected}
              messages={messages}
              loadingMsgs={loadingMsgs}
              onTicketChange={handleTicketChange}
              onMessageSent={handleMessageSent}
            />
          )}
        </div>
      </div>
    </AdminShell>
  );
}