import { useState, useEffect, useCallback } from "react";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { getAdminToken } from "@/lib/admin-api";

const AUDIT_URL = "https://functions.poehali.dev/f647adda-565a-4846-9b28-4462ebcf2ade";

function authHeaders() {
  return { "X-Admin-Token": getAdminToken() };
}

// ── Types ─────────────────────────────────────────────────────────

type AuditEntry = {
  id: number;
  created_at: string;
  actor_email: string;
  actor_role: string;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  reason: string | null;
  ip_address: string | null;
  user_agent_preview: string;
};

type AuditDetail = AuditEntry & {
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  user_agent: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────

const ACTION_COLORS: Record<string, string> = {
  // Users / Projects
  "user.block":               "bg-red-100 text-red-700",
  "user.unblock":             "bg-green-100 text-green-700",
  "project.archive":          "bg-amber-100 text-amber-700",
  "project.restore":          "bg-blue-100 text-blue-700",
  "admin.login":              "bg-slate-100 text-slate-600",
  "admin.logout":             "bg-slate-100 text-slate-500",
  // Tickets
  "ticket.status_changed":    "bg-sky-100 text-sky-700",
  "ticket.priority_changed":  "bg-orange-100 text-orange-700",
  "ticket.assignee_changed":  "bg-indigo-100 text-indigo-700",
  // Content
  "content.published":        "bg-emerald-100 text-emerald-700",
  "content.archived":         "bg-gray-100 text-gray-600",
  // Communications
  "communication.sent":       "bg-violet-100 text-violet-700",
  "communication.cancelled":  "bg-red-100 text-red-600",
  // AI Context
  "ai_context.exported":      "bg-purple-100 text-purple-700",
};

function actionBadge(action: string) {
  const cls = ACTION_COLORS[action] ?? "bg-violet-100 text-violet-700";
  const short = action.split(".").pop() ?? action;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${cls}`}>
      {short}
    </span>
  );
}

function entityBadge(type: string | null) {
  if (!type) return null;
  const icons: Record<string, string> = {
    user: "User", project: "FolderOpen", admin: "Shield",
    ticket: "Ticket", content_item: "FileText",
    communication: "Send", ai_context: "BrainCircuit",
  };
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
      <Icon name={icons[type] ?? "FileText"} size={11} />
      {type}
    </span>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("ru", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

// ── JSON Viewer ───────────────────────────────────────────────────

function JsonBlock({ label, data }: { label: string; data: unknown }) {
  const [copied, setCopied] = useState(false);
  if (data === null || data === undefined) return null;

  const text = JSON.stringify(data, null, 2);

  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition-colors"
        >
          <Icon name={copied ? "Check" : "Copy"} size={12} />
          {copied ? "Скопировано" : "Копировать"}
        </button>
      </div>
      <pre className="bg-slate-900 text-slate-100 rounded-xl p-3 text-xs overflow-x-auto max-h-48 overflow-y-auto leading-relaxed font-mono">
        {text}
      </pre>
    </div>
  );
}

// ── Detail Drawer ─────────────────────────────────────────────────

function DetailDrawer({ entryId, onClose }: { entryId: number; onClose: () => void }) {
  const [entry, setEntry] = useState<AuditDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${AUDIT_URL}?action=get&id=${entryId}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { setEntry(d.entry ?? null); setLoading(false); });
  }, [entryId]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Icon name="ClipboardList" size={16} className="text-slate-400" />
            <span className="font-semibold text-slate-900">Запись #{entryId}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
            <Icon name="X" size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {loading && (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && !entry && (
            <p className="text-sm text-slate-400 text-center py-8">Запись не найдена</p>
          )}

          {entry && (
            <>
              {/* Meta */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Действие</span>
                  {actionBadge(entry.action)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Сущность</span>
                  <span className="text-xs text-slate-700">
                    {entityBadge(entry.entity_type)}
                    {entry.entity_id ? <span className="ml-1 font-mono">#{entry.entity_id}</span> : null}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Администратор</span>
                  <span className="text-xs font-medium text-slate-800">{entry.actor_email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Дата</span>
                  <span className="text-xs text-slate-600 font-mono">{fmtDate(entry.created_at)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">IP</span>
                  <span className="text-xs text-slate-600 font-mono">{entry.ip_address || "—"}</span>
                </div>
              </div>

              {/* Reason */}
              {entry.reason && (
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Причина</div>
                  <p className="text-sm text-slate-800">{entry.reason}</p>
                </div>
              )}

              {/* User agent */}
              {entry.user_agent && (
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">User-Agent</div>
                  <p className="text-xs text-slate-500 break-all leading-relaxed">{entry.user_agent}</p>
                </div>
              )}

              {/* JSON diffs */}
              <div className="space-y-4 border-t border-slate-100 pt-4">
                <JsonBlock label="До изменения (before)" data={entry.before_json} />
                <JsonBlock label="После изменения (after)" data={entry.after_json} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────

export default function AdminAuditPage() {
  const [entries, setEntries]   = useState<AuditEntry[]>([]);
  const [total, setTotal]       = useState(0);
  const [pages, setPages]       = useState(1);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);

  // Filters
  const [q, setQ]                     = useState("");
  const [actionFilter, setActionFilter]       = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [actorFilter, setActorFilter]         = useState("");
  const [dateFrom, setDateFrom]               = useState("");
  const [dateTo, setDateTo]                   = useState("");

  // Filter options from API
  const [availableActions, setAvailableActions]         = useState<string[]>([]);
  const [availableEntityTypes, setAvailableEntityTypes] = useState<string[]>([]);

  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({
      action: "list",
      q,
      action_filter: actionFilter,
      entity_type:   entityTypeFilter,
      actor_email:   actorFilter,
      date_from:     dateFrom,
      date_to:       dateTo,
      page:          String(page),
      per_page:      "25",
    });
    const res = await fetch(`${AUDIT_URL}?${p}`, { headers: authHeaders() });
    const data = await res.json();
    setEntries(data.entries ?? []);
    setTotal(data.total ?? 0);
    setPages(data.pages ?? 1);
    if (data.filter_options) {
      setAvailableActions(data.filter_options.actions ?? []);
      setAvailableEntityTypes(data.filter_options.entity_types ?? []);
    }
    setLoading(false);
  }, [q, actionFilter, entityTypeFilter, actorFilter, dateFrom, dateTo, page]);

  useEffect(() => { load(); }, [load]);

  // Debounce q
  useEffect(() => {
    const t = setTimeout(() => setPage(1), 400);
    return () => clearTimeout(t);
  }, [q]);

  function resetFilters() {
    setQ(""); setActionFilter(""); setEntityTypeFilter("");
    setActorFilter(""); setDateFrom(""); setDateTo(""); setPage(1);
  }

  const hasFilters = q || actionFilter || entityTypeFilter || actorFilter || dateFrom || dateTo;

  return (
    <AdminShell>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center">
            <Icon name="ClipboardList" size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Аудит</h1>
            <p className="text-sm text-slate-500">Журнал действий администратора · {total} записей</p>
          </div>
        </div>

        {/* Filters row */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-5 space-y-3">
          {/* Search */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
            <Icon name="Search" size={14} className="text-slate-400 flex-shrink-0" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Поиск по причине, email, entity_id, action..."
              className="flex-1 text-sm text-slate-800 placeholder:text-slate-400 outline-none bg-transparent"
            />
            {q && <button onClick={() => setQ("")} className="text-slate-300 hover:text-slate-500"><Icon name="X" size={13} /></button>}
          </div>

          {/* Select filters + date */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <select
              value={actionFilter}
              onChange={e => { setActionFilter(e.target.value); setPage(1); }}
              className="text-xs border border-slate-200 rounded-lg px-2 py-2 text-slate-600 bg-white outline-none"
            >
              <option value="">Все действия</option>
              {availableActions.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>

            <select
              value={entityTypeFilter}
              onChange={e => { setEntityTypeFilter(e.target.value); setPage(1); }}
              className="text-xs border border-slate-200 rounded-lg px-2 py-2 text-slate-600 bg-white outline-none"
            >
              <option value="">Все сущности</option>
              {availableEntityTypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(1); }}
              className="text-xs border border-slate-200 rounded-lg px-2 py-2 text-slate-600 bg-white outline-none"
              placeholder="От"
            />

            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(1); }}
              className="text-xs border border-slate-200 rounded-lg px-2 py-2 text-slate-600 bg-white outline-none"
              placeholder="До"
            />
          </div>

          {hasFilters && (
            <button onClick={resetFilters} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition-colors">
              <Icon name="X" size={12} />
              Сбросить фильтры
            </button>
          )}
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-slate-800 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">Записей не найдено</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {["Дата", "Администратор", "Действие", "Сущность", "ID", "Причина", "IP"].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr
                      key={e.id}
                      onClick={() => setSelectedId(e.id)}
                      className={`border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors ${
                        i === entries.length - 1 ? "border-b-0" : ""
                      } ${selectedId === e.id ? "bg-slate-50" : ""}`}
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="text-xs font-mono text-slate-500">{fmtDate(e.created_at)}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs text-slate-700">{e.actor_email}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        {actionBadge(e.action)}
                      </td>
                      <td className="px-3 py-2.5">
                        {entityBadge(e.entity_type)}
                      </td>
                      <td className="px-3 py-2.5">
                        {e.entity_id
                          ? <span className="text-xs font-mono text-slate-600">#{e.entity_id}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 max-w-[200px]">
                        <span className="text-xs text-slate-500 truncate block">{e.reason || "—"}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs font-mono text-slate-400">{e.ip_address || "—"}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <Icon name="ChevronRight" size={14} className="text-slate-300" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >←</button>
            <span className="text-sm text-slate-500">Страница {page} из {pages}</span>
            <button
              onClick={() => setPage(p => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >→</button>
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      {selectedId !== null && (
        <DetailDrawer entryId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </AdminShell>
  );
}