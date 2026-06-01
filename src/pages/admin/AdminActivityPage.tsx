import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { getAdminToken } from "@/lib/admin-api";

const ACTIVITY_URL = "https://functions.poehali.dev/c3350df2-e2f0-424c-acc4-036e65286249";

function authHeaders() {
  return { "X-Admin-Token": getAdminToken() };
}

// ── Types ─────────────────────────────────────────────────────────

type ActivityEntry = {
  id: number;
  created_at: string;
  user_id: number | null;
  user_email: string | null;
  user_name: string | null;
  project_id: number | null;
  project_title: string | null;
  action: string;
  action_label: string;
  entity_type: string | null;
  entity_id: number | null;
  summary: string | null;
};

type FilterOptions = {
  actions: string[];
  entity_types: string[];
  users: { user_id: number; email: string }[];
};

// ── Helpers ───────────────────────────────────────────────────────

const ACTION_COLORS: Record<string, string> = {
  created_project:        "bg-violet-100 text-violet-700",
  created_task:           "bg-blue-100 text-blue-700",
  uploaded_document:      "bg-cyan-100 text-cyan-700",
  generated:              "bg-amber-100 text-amber-700",
  invited_member:         "bg-green-100 text-green-700",
  archived_project:       "bg-slate-100 text-slate-600",
  restored_project:       "bg-emerald-100 text-emerald-700",
  admin_archived_project: "bg-orange-100 text-orange-700",
  admin_restored_project: "bg-teal-100 text-teal-700",
  renamed_document:       "bg-indigo-100 text-indigo-700",
};

const ENTITY_ICONS: Record<string, string> = {
  project:        "FolderOpen",
  task:           "Sparkles",
  document:       "FileText",
  generation_run: "Zap",
  member:         "UserPlus",
};

function ActionBadge({ action, label }: { action: string; label: string }) {
  const cls = ACTION_COLORS[action] ?? "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap ${cls}`}>
      {label}
    </span>
  );
}

function EntityIcon({ type }: { type: string | null }) {
  if (!type) return null;
  return <Icon name={ENTITY_ICONS[type] ?? "FileText"} size={12} className="text-slate-400" />;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("ru", {
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Detail Drawer ─────────────────────────────────────────────────

function DetailDrawer({
  entry,
  onClose,
  onFilterByUser,
  onFilterByProject,
}: {
  entry: ActivityEntry;
  onClose: () => void;
  onFilterByUser: (userId: number) => void;
  onFilterByProject: (projectId: number) => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white h-full shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Icon name="Activity" size={15} className="text-slate-400" />
            <span className="font-semibold text-slate-900">Событие #{entry.id}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
            <Icon name="X" size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Action */}
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Действие</div>
            <ActionBadge action={entry.action} label={entry.action_label} />
          </div>

          {/* Date */}
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Дата</div>
            <div className="text-sm font-mono text-slate-700">
              {new Date(entry.created_at).toLocaleString("ru", {
                day: "2-digit", month: "2-digit", year: "numeric",
                hour: "2-digit", minute: "2-digit", second: "2-digit",
              })}
            </div>
          </div>

          {/* User */}
          {entry.user_id && (
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Пользователь</div>
              <div className="flex items-center justify-between bg-slate-50 rounded-xl p-2.5">
                <div>
                  <div className="text-sm font-medium text-slate-800">{entry.user_name || "—"}</div>
                  <div className="text-xs text-slate-500">{entry.user_email || ""}</div>
                </div>
                <button
                  onClick={() => { onClose(); onFilterByUser(entry.user_id!); }}
                  className="text-xs text-violet-600 hover:text-violet-800 font-medium px-2 py-1 bg-violet-50 rounded-lg"
                >
                  Фильтр
                </button>
              </div>
            </div>
          )}

          {/* Project */}
          {entry.project_id && (
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Проект</div>
              <div className="flex items-center justify-between bg-slate-50 rounded-xl p-2.5">
                <div className="text-sm font-medium text-slate-800 truncate mr-2">
                  {entry.project_title || `#${entry.project_id}`}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => { onClose(); onFilterByProject(entry.project_id!); }}
                    className="text-xs text-violet-600 hover:text-violet-800 font-medium px-2 py-1 bg-violet-50 rounded-lg"
                  >
                    Фильтр
                  </button>
                  <button
                    onClick={() => navigate(`/admin/projects/${entry.project_id}`)}
                    className="text-xs text-slate-500 hover:text-slate-800 font-medium px-2 py-1 bg-white border border-slate-200 rounded-lg"
                  >
                    ↗
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Entity */}
          {(entry.entity_type || entry.entity_id) && (
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Сущность</div>
              <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                <EntityIcon type={entry.entity_type} />
                <span className="text-xs text-slate-600">{entry.entity_type}</span>
                {entry.entity_id && (
                  <span className="text-xs font-mono text-slate-500">#{entry.entity_id}</span>
                )}
              </div>
            </div>
          )}

          {/* Summary */}
          {entry.summary && (
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Детали</div>
              <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-700 leading-relaxed break-words">
                {entry.summary}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────

export default function AdminActivityPage() {
  const [searchParams] = useSearchParams();

  const [entries, setEntries]     = useState<ActivityEntry[]>([]);
  const [total, setTotal]         = useState(0);
  const [pages, setPages]         = useState(1);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(true);
  const [filterOpts, setFilterOpts] = useState<FilterOptions>({ actions: [], entity_types: [], users: [] });

  // Filters — инициализируем из URL params (для cross-links)
  const [q, setQ]                   = useState(searchParams.get("q") || "");
  const [actionFilter, setActionFilter]   = useState(searchParams.get("action_filter") || "");
  const [entityTypeFilter, setEntityTypeFilter] = useState(searchParams.get("entity_type") || "");
  const [userFilter, setUserFilter]       = useState(searchParams.get("user_id") || "");
  const [projectFilter, setProjectFilter] = useState(searchParams.get("project_id") || "");
  const [dateFrom, setDateFrom]           = useState(searchParams.get("date_from") || "");
  const [dateTo, setDateTo]               = useState(searchParams.get("date_to") || "");

  const [selected, setSelected] = useState<ActivityEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({
      action: "list",
      q,
      action_filter:  actionFilter,
      entity_type:    entityTypeFilter,
      user_id:        userFilter,
      project_id:     projectFilter,
      date_from:      dateFrom,
      date_to:        dateTo,
      page:           String(page),
      per_page:       "50",
    });
    const res = await fetch(`${ACTIVITY_URL}?${p}`, { headers: authHeaders() });
    const data = await res.json();
    setEntries(data.entries ?? []);
    setTotal(data.total ?? 0);
    setPages(data.pages ?? 1);
    if (data.filter_options) setFilterOpts(data.filter_options);
    setLoading(false);
  }, [q, actionFilter, entityTypeFilter, userFilter, projectFilter, dateFrom, dateTo, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setPage(1), 400);
    return () => clearTimeout(t);
  }, [q]);

  function resetFilters() {
    setQ(""); setActionFilter(""); setEntityTypeFilter("");
    setUserFilter(""); setProjectFilter(""); setDateFrom(""); setDateTo("");
    setPage(1);
  }

  const hasFilters = q || actionFilter || entityTypeFilter || userFilter || projectFilter || dateFrom || dateTo;

  return (
    <AdminShell>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center">
            <Icon name="Activity" size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Активность</h1>
            <p className="text-sm text-slate-500">Журнал пользовательских событий · {total} записей</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-5 space-y-3">
          {/* Search */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
            <Icon name="Search" size={14} className="text-slate-400 flex-shrink-0" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Поиск по деталям, действию, entity_id, user_id..."
              className="flex-1 text-sm text-slate-800 placeholder:text-slate-400 outline-none bg-transparent"
            />
            {q && <button onClick={() => setQ("")} className="text-slate-300 hover:text-slate-500"><Icon name="X" size={13} /></button>}
          </div>

          {/* Select filters */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <select
              value={actionFilter}
              onChange={e => { setActionFilter(e.target.value); setPage(1); }}
              className="text-xs border border-slate-200 rounded-lg px-2 py-2 text-slate-600 bg-white outline-none col-span-1"
            >
              <option value="">Все действия</option>
              {filterOpts.actions.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>

            <select
              value={entityTypeFilter}
              onChange={e => { setEntityTypeFilter(e.target.value); setPage(1); }}
              className="text-xs border border-slate-200 rounded-lg px-2 py-2 text-slate-600 bg-white outline-none"
            >
              <option value="">Все сущности</option>
              {filterOpts.entity_types.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <select
              value={userFilter}
              onChange={e => { setUserFilter(e.target.value); setPage(1); }}
              className="text-xs border border-slate-200 rounded-lg px-2 py-2 text-slate-600 bg-white outline-none"
            >
              <option value="">Все пользователи</option>
              {filterOpts.users.map(u => (
                <option key={u.user_id} value={String(u.user_id)}>{u.email}</option>
              ))}
            </select>

            <input
              type="text"
              value={projectFilter}
              onChange={e => { setProjectFilter(e.target.value); setPage(1); }}
              placeholder="Project ID"
              className="text-xs border border-slate-200 rounded-lg px-2 py-2 text-slate-600 bg-white outline-none font-mono"
            />

            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(1); }}
              className="text-xs border border-slate-200 rounded-lg px-2 py-2 text-slate-600 bg-white outline-none"
            />

            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(1); }}
              className="text-xs border border-slate-200 rounded-lg px-2 py-2 text-slate-600 bg-white outline-none"
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
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">Событий не найдено</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {["Дата", "Пользователь", "Действие", "Сущность", "Проект", "Детали"].map(h => (
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
                      onClick={() => setSelected(e)}
                      className={`border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors ${
                        i === entries.length - 1 ? "border-b-0" : ""
                      } ${selected?.id === e.id ? "bg-slate-50" : ""}`}
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="text-xs font-mono text-slate-500">{fmtDate(e.created_at)}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-xs text-slate-700 font-medium truncate max-w-[120px]">
                          {e.user_name || "—"}
                        </div>
                        {e.user_email && (
                          <div className="text-xs text-slate-400 truncate max-w-[120px]">{e.user_email}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <ActionBadge action={e.action} label={e.action_label} />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <EntityIcon type={e.entity_type} />
                          <span className="text-xs text-slate-500">{e.entity_type || "—"}</span>
                          {e.entity_id && <span className="text-xs font-mono text-slate-400">#{e.entity_id}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 max-w-[120px]">
                        <span className="text-xs text-slate-500 truncate block">
                          {e.project_title || (e.project_id ? `#${e.project_id}` : "—")}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 max-w-[180px]">
                        <span className="text-xs text-slate-600 truncate block">{e.summary || "—"}</span>
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

      {/* Drawer */}
      {selected && (
        <DetailDrawer
          entry={selected}
          onClose={() => setSelected(null)}
          onFilterByUser={uid => { setUserFilter(String(uid)); setPage(1); }}
          onFilterByProject={pid => { setProjectFilter(String(pid)); setPage(1); }}
        />
      )}
    </AdminShell>
  );
}
