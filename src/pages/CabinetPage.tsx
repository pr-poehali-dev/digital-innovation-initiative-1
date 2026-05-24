import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { projectsApi } from "@/lib/api";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";

interface Project {
  id: number;
  title: string;
  description?: string;
  doc_count: number;
  task_count: number;
  updated_at: string;
  owner_name: string;
  my_role: string;
}

export default function CabinetPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const [menuProjectId, setMenuProjectId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Project | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [confirmArchive, setConfirmArchive] = useState<Project | null>(null);

  const load = () => {
    setLoading(true);
    projectsApi.list()
      .then((d) => setProjects(d.projects))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    setError("");
    try {
      await projectsApi.create(title.trim(), desc.trim());
      setTitle(""); setDesc(""); setShowCreate(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (p: Project) => {
    setMenuProjectId(null);
    setEditing(p);
    setEditTitle(p.title);
    setEditDesc(p.description || "");
  };

  const saveEdit = async () => {
    if (!editing || !editTitle.trim()) return;
    setSavingEdit(true);
    try {
      await projectsApi.update(editing.id, editTitle.trim(), editDesc.trim());
      setEditing(null);
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleArchive = async () => {
    if (!confirmArchive) return;
    try {
      await projectsApi.archive(confirmArchive.id);
      setConfirmArchive(null);
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Ошибка");
    }
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Мои проекты</h1>
            <p className="text-muted-foreground text-sm mt-1">Создавайте проекты для разных задач и загружайте материалы</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Icon name="Plus" size={16} />
            Новый проект
          </button>
        </div>

        {/* Создание */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
            <div className="bg-card border rounded-2xl p-6 w-full max-w-md shadow-xl">
              <h2 className="text-lg font-semibold mb-5">Новый проект</h2>
              <form onSubmit={create} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-1.5">Название *</label>
                  <input
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Например: IPMO Модуль 3"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-1.5">Описание</label>
                  <textarea
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder="О чём этот проект?"
                    rows={3}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none"
                  />
                </div>
                {error && <p className="text-red-500 text-sm">{error}</p>}
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowCreate(false)} className="flex-1 border rounded-lg py-2.5 text-sm font-medium hover:bg-muted transition-colors">
                    Отмена
                  </button>
                  <button type="submit" disabled={creating || !title.trim()} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50">
                    {creating ? "Создание..." : "Создать"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Редактирование */}
        {editing && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
            <div className="bg-card border rounded-2xl p-6 w-full max-w-md shadow-xl">
              <h2 className="text-lg font-semibold mb-5">Редактировать проект</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-1.5">Название *</label>
                  <input
                    autoFocus
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-1.5">Описание</label>
                  <textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    rows={3}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none"
                  />
                </div>
                <div className="flex gap-3 pt-1">
                  <button onClick={() => setEditing(null)} className="flex-1 border rounded-lg py-2.5 text-sm font-medium hover:bg-muted transition-colors">
                    Отмена
                  </button>
                  <button onClick={saveEdit} disabled={savingEdit || !editTitle.trim()} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50">
                    {savingEdit ? "Сохранение..." : "Сохранить"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Подтверждение архивации */}
        {confirmArchive && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
            <div className="bg-card border rounded-2xl p-6 w-full max-w-md shadow-xl">
              <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center mx-auto mb-3">
                <Icon name="AlertTriangle" size={24} className="text-red-600" />
              </div>
              <h2 className="text-lg font-semibold mb-2 text-center">Удалить проект?</h2>
              <p className="text-sm text-slate-600 mb-1 text-center">«{confirmArchive.title}»</p>
              <p className="text-xs text-slate-500 mb-5 text-center">
                Проект и все его материалы будут скрыты из кабинета. Данные сохраняются на сервере и могут быть восстановлены.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmArchive(null)} className="flex-1 border rounded-lg py-2.5 text-sm font-medium hover:bg-muted transition-colors">
                  Отмена
                </button>
                <button onClick={handleArchive} className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
                  Удалить
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border rounded-2xl p-5 animate-pulse bg-muted/30 h-32" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Icon name="FolderOpen" size={28} />
            </div>
            <p className="font-medium text-foreground mb-1">Проектов пока нет</p>
            <p className="text-sm">Создайте первый проект и начните работу с документами</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map((p) => (
              <div
                key={p.id}
                className="relative border border-slate-200 rounded-2xl p-5 bg-card hover:border-slate-400 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <button
                    onClick={() => navigate(`/cabinet/project/${p.id}`)}
                    className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center"
                  >
                    <Icon name="Folder" size={20} className="text-orange-500" />
                  </button>
                  <div className="flex items-center gap-2">
                    {p.my_role === "owner" && (
                      <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">Владелец</span>
                    )}
                    {/* Меню действий — только для владельца */}
                    {p.my_role === "owner" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuProjectId(menuProjectId === p.id ? null : p.id); }}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                        title="Действия"
                      >
                        <Icon name="MoreVertical" size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {menuProjectId === p.id && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuProjectId(null)} />
                    <div className="absolute right-3 top-14 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-48">
                      <button
                        onClick={() => openEdit(p)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                      >
                        <Icon name="Pencil" size={14} />
                        Редактировать
                      </button>
                      <button
                        onClick={() => { setMenuProjectId(null); navigate(`/cabinet/project/${p.id}`); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                      >
                        <Icon name="FolderOpen" size={14} />
                        Открыть
                      </button>
                      <div className="border-t border-slate-100 my-1" />
                      <button
                        onClick={() => { setMenuProjectId(null); setConfirmArchive(p); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 text-left"
                      >
                        <Icon name="Trash2" size={14} />
                        Удалить
                      </button>
                    </div>
                  </>
                )}

                <Link to={`/cabinet/project/${p.id}`} className="block">
                  <h3 className="font-semibold mb-1 group-hover:text-slate-900 transition-colors">{p.title}</h3>
                  {p.description && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{p.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mt-3">
                    <span className="flex items-center gap-1">
                      <Icon name="FileText" size={12} />
                      {p.doc_count} файлов
                    </span>
                    <span className="flex items-center gap-1">
                      <Icon name="ListTodo" size={12} />
                      {p.task_count} заданий
                    </span>
                    <span className="ml-auto">{new Date(p.updated_at).toLocaleDateString("ru-RU")}</span>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
