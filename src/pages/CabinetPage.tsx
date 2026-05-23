import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
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
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Icon name="Plus" size={16} />
            Новый проект
          </button>
        </div>

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
                    className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-1.5">Описание</label>
                  <textarea
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder="О чём этот проект?"
                    rows={3}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                  />
                </div>
                {error && <p className="text-red-500 text-sm">{error}</p>}
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="flex-1 border rounded-lg py-2.5 text-sm font-medium hover:bg-muted transition-colors"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={creating || !title.trim()}
                    className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {creating ? "Создание..." : "Создать"}
                  </button>
                </div>
              </form>
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
              <Link
                key={p.id}
                to={`/cabinet/project/${p.id}`}
                className="border rounded-2xl p-5 bg-card hover:border-orange-300 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center">
                    <Icon name="Folder" size={20} className="text-orange-500" />
                  </div>
                  {p.my_role === "owner" && (
                    <span className="text-xs bg-orange-100 dark:bg-orange-950/50 text-orange-600 px-2 py-0.5 rounded-full">Владелец</span>
                  )}
                </div>
                <h3 className="font-semibold mb-1 group-hover:text-orange-600 transition-colors">{p.title}</h3>
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
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
