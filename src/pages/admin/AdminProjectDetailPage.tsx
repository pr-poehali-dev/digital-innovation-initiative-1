import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { getAdminToken } from "@/lib/admin-api";

const URL = "https://functions.poehali.dev/31ce72f9-002e-4250-8da4-614aebf97e54";

function authHeaders() {
  return { "Content-Type": "application/json", "X-Admin-Token": getAdminToken() };
}

// ── Types ─────────────────────────────────────────────────────────

type Project = {
  id: number; title: string; description: string;
  owner_id: number; owner_email: string; owner_name: string;
  members_count: number; tasks_count: number; documents_count: number;
  created_at: string; updated_at: string;
  archived_at: string | null; is_archived: boolean;
};

type Member  = { user_id: number; name: string; email: string; role: string; joined_at: string | null; is_blocked: boolean };
type Task    = { id: number; title: string; task_type: string; status: string; created_at: string; is_archived: boolean; creator_name: string; versions: number };
type Doc     = { id: number; original_name: string; file_type: string; file_size: number; created_at: string; is_archived: boolean; text_length: number };

// ── Confirm Dialog ────────────────────────────────────────────────

function ConfirmDialog({
  type, projectTitle, onConfirm, onCancel, loading,
}: {
  type: "archive" | "restore";
  projectTitle: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState("");
  const isArchive = type === "archive";
  const valid = reason.trim().length >= 10;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${isArchive ? "bg-amber-100" : "bg-green-100"}`}>
          <Icon name={isArchive ? "Archive" : "ArchiveRestore"} size={22} className={isArchive ? "text-amber-600" : "text-green-600"} />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-1">
          {isArchive ? "Архивировать проект" : "Восстановить проект"}
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          <span className="font-medium text-slate-700">«{projectTitle}»</span>
          {isArchive
            ? " — проект будет скрыт из поиска и интерфейса пользователей."
            : " — проект снова станет доступен пользователям."}
        </p>

        <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
          Причина <span className="text-red-400">*</span>
        </label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Минимум 10 символов..."
          rows={3}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none outline-none focus:ring-2 focus:ring-violet-400"
          autoFocus
        />
        <div className="flex justify-between items-center mt-1 mb-4">
          <span className={`text-xs ${valid ? "text-green-600" : "text-slate-400"}`}>
            {reason.trim().length}/10 мин.
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
            Отмена
          </button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={!valid || loading}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 ${
              isArchive ? "bg-amber-500 hover:bg-amber-600" : "bg-green-500 hover:bg-green-600"
            }`}
          >
            {loading ? "Выполняется..." : isArchive ? "Архивировать" : "Восстановить"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────

function OverviewTab({ project }: { project: Project }) {
  const stats = [
    { label: "Участников", value: project.members_count, icon: "Users" },
    { label: "Задач",      value: project.tasks_count,   icon: "Sparkles" },
    { label: "Документов", value: project.documents_count, icon: "FileText" },
  ];
  return (
    <div className="space-y-5">
      {/* Owner */}
      <div className="bg-slate-50 rounded-xl p-4">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Владелец</div>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">{project.owner_name?.charAt(0)?.toUpperCase() ?? "?"}</span>
          </div>
          <div>
            <div className="font-medium text-slate-900 text-sm">{project.owner_name}</div>
            <div className="text-xs text-slate-500">{project.owner_email}</div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {stats.map(s => (
          <div key={s.label} className="bg-slate-50 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-slate-900">{s.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Description */}
      {project.description && (
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Описание</div>
          <p className="text-sm text-slate-700 leading-relaxed">{project.description}</p>
        </div>
      )}

      {/* Dates */}
      <div className="text-xs text-slate-400 space-y-1 border-t border-slate-100 pt-3">
        <div>Создан: {new Date(project.created_at).toLocaleString("ru")}</div>
        {project.updated_at && <div>Обновлён: {new Date(project.updated_at).toLocaleString("ru")}</div>}
        {project.archived_at && <div className="text-amber-600">Архивирован: {new Date(project.archived_at).toLocaleString("ru")}</div>}
      </div>

      {/* Cross-link */}
      <a
        href={`/admin/activity?project_id=${project.id}`}
        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 font-medium text-sm rounded-xl transition-colors"
      >
        <Icon name="Activity" size={15} />
        Посмотреть активность проекта
      </a>
    </div>
  );
}

// ── Members Tab ───────────────────────────────────────────────────

function MembersTab({ projectId }: { projectId: number }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${URL}?action=members&project_id=${projectId}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { setMembers(d.members ?? []); setLoading(false); });
  }, [projectId]);

  const ROLE_LABELS: Record<string, string> = { owner: "Владелец", admin: "Админ", member: "Участник" };

  if (loading) return <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-2">
      {members.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Участников нет</p>}
      {members.map(m => (
        <div key={m.user_id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
          <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center flex-shrink-0">
            <span className="text-slate-600 text-xs font-bold">{m.name?.charAt(0)?.toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
              {m.name}
              {m.is_blocked && (
                <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-md font-medium">Заблокирован</span>
              )}
            </div>
            <div className="text-xs text-slate-400">{m.email}</div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${
              m.role === "owner" ? "bg-violet-100 text-violet-700" :
              m.role === "admin" ? "bg-blue-100 text-blue-700" :
              "bg-slate-100 text-slate-600"
            }`}>
              {ROLE_LABELS[m.role] ?? m.role}
            </span>
            {m.joined_at && (
              <span className="text-xs text-slate-400 hidden sm:block">
                {new Date(m.joined_at).toLocaleDateString("ru")}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tasks Tab ─────────────────────────────────────────────────────

function TasksTab({ projectId }: { projectId: number }) {
  const [tasks, setTasks]   = useState<Task[]>([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [pages, setPages]   = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${URL}?action=tasks&project_id=${projectId}&page=${page}&per_page=10`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { setTasks(d.tasks ?? []); setTotal(d.total ?? 0); setPages(d.pages ?? 1); setLoading(false); });
  }, [projectId, page]);

  const STATUS_COLORS: Record<string, string> = {
    done: "bg-green-100 text-green-700",
    in_progress: "bg-blue-100 text-blue-700",
    pending: "bg-slate-100 text-slate-600",
  };

  if (loading) return <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      {tasks.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Задач нет</p>}
      <div className="space-y-2 mb-3">
        {tasks.map(t => (
          <div key={t.id} className={`p-3 rounded-xl border ${t.is_archived ? "bg-slate-50 border-slate-100" : "bg-white border-slate-200"}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate ${t.is_archived ? "text-slate-400" : "text-slate-800"}`}>{t.title}</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {t.creator_name} · {new Date(t.created_at).toLocaleDateString("ru")} · {t.versions} версий
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {t.is_archived && <span className="text-xs bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-md">Архив</span>}
                {t.status && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${STATUS_COLORS[t.status] ?? "bg-slate-100 text-slate-600"}`}>
                    {t.status}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2.5 py-1 rounded-lg border text-sm text-slate-600 disabled:opacity-40">←</button>
          <span className="text-xs text-slate-500">{page}/{pages}</span>
          <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="px-2.5 py-1 rounded-lg border text-sm text-slate-600 disabled:opacity-40">→</button>
        </div>
      )}
    </div>
  );
}

// ── Documents Tab ─────────────────────────────────────────────────

function DocumentsTab({ projectId }: { projectId: number }) {
  const [docs, setDocs]     = useState<Doc[]>([]);
  const [page, setPage]     = useState(1);
  const [pages, setPages]   = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${URL}?action=documents&project_id=${projectId}&page=${page}&per_page=10`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { setDocs(d.documents ?? []); setPages(d.pages ?? 1); setLoading(false); });
  }, [projectId, page]);

  function fmtSize(b: number) {
    if (!b) return "—";
    if (b < 1024) return `${b} Б`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} КБ`;
    return `${(b / 1024 / 1024).toFixed(1)} МБ`;
  }

  if (loading) return <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      {docs.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Документов нет</p>}
      <div className="space-y-2 mb-3">
        {docs.map(d => (
          <div key={d.id} className={`p-3 rounded-xl border ${d.is_archived ? "bg-slate-50 border-slate-100" : "bg-white border-slate-200"}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Icon name="FileText" size={13} className="text-blue-500" />
                </div>
                <div className="min-w-0">
                  <div className={`text-sm font-medium truncate ${d.is_archived ? "text-slate-400" : "text-slate-800"}`}>{d.original_name}</div>
                  <div className="text-xs text-slate-400">{fmtSize(d.file_size)} · {d.file_type?.toUpperCase()} · {new Date(d.created_at).toLocaleDateString("ru")}</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {d.is_archived && <span className="text-xs bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-md">Архив</span>}
                {d.text_length > 0 && <span className="text-xs bg-green-50 text-green-600 px-1.5 py-0.5 rounded-md">Текст</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2.5 py-1 rounded-lg border text-sm text-slate-600 disabled:opacity-40">←</button>
          <span className="text-xs text-slate-500">{page}/{pages}</span>
          <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="px-2.5 py-1 rounded-lg border text-sm text-slate-600 disabled:opacity-40">→</button>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────

const TABS = [
  { key: "overview",   label: "Обзор",       icon: "LayoutDashboard" },
  { key: "members",    label: "Участники",   icon: "Users" },
  { key: "tasks",      label: "Задачи",      icon: "Sparkles" },
  { key: "documents",  label: "Документы",   icon: "FileText" },
];

export default function AdminProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const projectId = Number(id);

  const [project, setProject]   = useState<Project | null>(null);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState("overview");
  const [confirm, setConfirm]   = useState<"archive" | "restore" | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast]       = useState<{ msg: string; ok: boolean } | null>(null);

  function loadProject() {
    fetch(`${URL}?action=get&project_id=${projectId}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { setProject(d.project ?? null); setLoading(false); });
  }

  useEffect(() => { loadProject(); }, [projectId]);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleConfirm(reason: string) {
    if (!confirm) return;
    setActionLoading(true);
    const res = await fetch(`${URL}?action=${confirm}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ project_id: projectId, reason }),
    }).then(r => r.json());
    setActionLoading(false);
    setConfirm(null);

    if (res.ok) {
      setProject(res.project);
      showToast(confirm === "archive" ? "Проект архивирован" : "Проект восстановлен");
    } else {
      showToast(res.error || "Ошибка", false);
    }
  }

  if (loading) {
    return (
      <AdminShell>
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminShell>
    );
  }

  if (!project) {
    return (
      <AdminShell>
        <div className="p-6 text-center text-slate-400">Проект не найден</div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="p-6 max-w-3xl mx-auto">
        {/* Breadcrumb */}
        <button
          onClick={() => navigate("/admin/projects")}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-700 mb-4 transition-colors"
        >
          <Icon name="ArrowLeft" size={15} />
          Назад к проектам
        </button>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${project.is_archived ? "bg-slate-100" : "bg-indigo-100"}`}>
              <Icon name="FolderOpen" size={20} className={project.is_archived ? "text-slate-400" : "text-indigo-600"} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">{project.title}</h1>
                {project.is_archived && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg font-medium">Архив</span>
                )}
              </div>
              <p className="text-sm text-slate-500">ID: {project.id}</p>
            </div>
          </div>

          {/* Dangerous action */}
          <div>
            {project.is_archived ? (
              <button
                onClick={() => setConfirm("restore")}
                className="flex items-center gap-1.5 px-3 py-2 bg-green-50 hover:bg-green-100 text-green-700 text-sm font-semibold rounded-xl transition-colors"
              >
                <Icon name="ArchiveRestore" size={14} />
                Восстановить
              </button>
            ) : (
              <button
                onClick={() => setConfirm("archive")}
                className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 text-sm font-semibold rounded-xl transition-colors"
              >
                <Icon name="Archive" size={14} />
                Архивировать
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-5">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon name={t.icon} size={13} />
              <span className="hidden sm:block">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div>
          {tab === "overview"  && <OverviewTab project={project} />}
          {tab === "members"   && <MembersTab projectId={projectId} />}
          {tab === "tasks"     && <TasksTab projectId={projectId} />}
          {tab === "documents" && <DocumentsTab projectId={projectId} />}
        </div>
      </div>

      {/* Confirm dialog */}
      {confirm && project && (
        <ConfirmDialog
          type={confirm}
          projectTitle={project.title}
          onConfirm={handleConfirm}
          onCancel={() => setConfirm(null)}
          loading={actionLoading}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${
          toast.ok ? "bg-green-600" : "bg-red-600"
        }`}>
          <Icon name={toast.ok ? "CheckCircle" : "AlertCircle"} size={16} />
          {toast.msg}
        </div>
      )}
    </AdminShell>
  );
}