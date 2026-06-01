import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { getAdminToken } from "@/lib/admin-api";

const ADMIN_PROJECTS_URL = "https://functions.poehali.dev/31ce72f9-002e-4250-8da4-614aebf97e54";

type Project = {
  id: number;
  title: string;
  description_preview: string;
  owner_email: string;
  owner_name: string;
  members_count: number;
  tasks_count: number;
  documents_count: number;
  is_archived: boolean;
  archived_at: string | null;
  created_at: string;
};

function authHeaders() {
  return { "Content-Type": "application/json", "X-Admin-Token": getAdminToken() };
}

async function fetchProjects(q: string, filter: string, page: number) {
  const params = new URLSearchParams({ action: "list", q, filter, page: String(page), per_page: "20" });
  const res = await fetch(`${ADMIN_PROJECTS_URL}?${params}`, { headers: authHeaders() });
  return res.json();
}

const FILTERS = [
  { value: "all",      label: "Все" },
  { value: "active",   label: "Активные" },
  { value: "archived", label: "Архив" },
];

export default function AdminProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects]   = useState<Project[]>([]);
  const [total, setTotal]         = useState(0);
  const [pages, setPages]         = useState(1);
  const [page, setPage]           = useState(1);
  const [q, setQ]                 = useState("");
  const [filter, setFilter]       = useState("all");
  const [loading, setLoading]     = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchProjects(q, filter, page);
    setProjects(data.projects ?? []);
    setTotal(data.total ?? 0);
    setPages(data.pages ?? 1);
    setLoading(false);
  }, [q, filter, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setPage(1), 400);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <AdminShell>
      <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center">
            <Icon name="FolderOpen" size={18} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Проекты</h1>
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
              placeholder="Поиск по названию или описанию..."
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
                    ? "bg-indigo-600 text-white shadow-sm"
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
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : projects.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">Проекты не найдены</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Проект</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Владелец</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Участники</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Задачи</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Документы</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Статус</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {projects.map((p, i) => (
                  <tr
                    key={p.id}
                    className={`border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer ${i === projects.length - 1 ? "border-b-0" : ""}`}
                    onClick={() => navigate(`/admin/projects/${p.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          p.is_archived ? "bg-slate-100" : "bg-indigo-100"
                        }`}>
                          <Icon name="FolderOpen" size={14} className={p.is_archived ? "text-slate-400" : "text-indigo-600"} />
                        </div>
                        <div className="min-w-0">
                          <div className={`text-sm font-medium truncate ${p.is_archived ? "text-slate-400" : "text-slate-800"}`}>
                            {p.title}
                          </div>
                          {p.description_preview && (
                            <div className="text-xs text-slate-400 truncate max-w-xs">{p.description_preview}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="text-sm text-slate-700">{p.owner_name}</div>
                      <div className="text-xs text-slate-400">{p.owner_email}</div>
                    </td>
                    <td className="px-3 py-3 text-center hidden lg:table-cell">
                      <span className="text-sm font-medium text-slate-700">{p.members_count}</span>
                    </td>
                    <td className="px-3 py-3 text-center hidden lg:table-cell">
                      <span className="text-sm font-medium text-slate-700">{p.tasks_count}</span>
                    </td>
                    <td className="px-3 py-3 text-center hidden lg:table-cell">
                      <span className="text-sm font-medium text-slate-700">{p.documents_count}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${
                        p.is_archived
                          ? "bg-slate-100 text-slate-500"
                          : "bg-green-50 text-green-600"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${p.is_archived ? "bg-slate-400" : "bg-green-500"}`} />
                        {p.is_archived ? "Архив" : "Активен"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Icon name="ChevronRight" size={16} className="text-slate-300" />
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
    </AdminShell>
  );
}
