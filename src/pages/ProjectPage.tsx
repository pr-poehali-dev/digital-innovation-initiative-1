import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { projectsApi, documentsApi, fileToBase64 } from "@/lib/api";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";

interface Document {
  id: number;
  name: string;
  file_type: string;
  file_size: number;
  status: string;
  created_at: string;
  uploaded_by: string;
}

interface Task {
  id: number;
  title: string;
  task_type: string;
  topic?: string;
  status: string;
  created_at: string;
  created_by: string;
  versions: number;
}

interface ActivityItem {
  action: string;
  entity_type: string;
  details?: string;
  created_at: string;
  user_name: string;
}

interface Project {
  id: number;
  title: string;
  description?: string;
  members: { id: number; name: string; email: string; role: string }[];
  activity: ActivityItem[];
  my_role: string;
}

const TASK_TYPE_LABELS: Record<string, string> = {
  answer_question: "Ответить на вопрос",
  analyze: "Анализ материалов",
  structure: "Структура презентации",
  write_text: "Написать текст работы",
  prepare_presentation: "Подготовить презентацию",
  presentation_by_reference: "Презентация по образцу",
  revise: "Доработать результат",
};

const ACTION_LABELS: Record<string, string> = {
  uploaded_document: "загрузил файл",
  created_task: "создал задание",
  generated: "сгенерировал версию",
  created_project: "создал проект",
  invited_member: "пригласил участника",
  updated_project: "обновил проект",
};

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);

  const [project, setProject] = useState<Project | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tab, setTab] = useState<"tasks" | "docs" | "team">("tasks");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMsg, setInviteMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    projectsApi.get(projectId).then((d) => setProject(d));
    documentsApi.list(projectId).then((d) => setDocs(d.documents));
    fetch(`https://functions.poehali.dev/363a1c77-0e9a-41a6-a862-b1cf2a632688/project/${projectId}`, {
      headers: { "X-Session-Id": localStorage.getItem("session_id") || "" },
    }).then((r) => r.json()).then((d) => setTasks(d.tasks || []));
  };

  useEffect(() => { load(); }, [projectId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!["pdf", "docx", "pptx"].includes(ext)) {
      setUploadError("Поддерживаются только PDF, DOCX, PPTX");
      return;
    }
    setUploading(true);
    setUploadError("");
    try {
      const b64 = await fileToBase64(file);
      await documentsApi.upload(projectId, file.name, ext, b64);
      load();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const d = await projectsApi.invite(projectId, inviteEmail);
      setInviteMsg(`✓ ${d.name} добавлен в проект`);
      setInviteEmail("");
      load();
    } catch (err: unknown) {
      setInviteMsg(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
    return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  };

  if (!project) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-64" />
            <div className="h-4 bg-muted rounded w-96" />
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link to="/cabinet" className="hover:text-foreground transition-colors">Проекты</Link>
          <Icon name="ChevronRight" size={14} />
          <span className="text-foreground font-medium">{project.title}</span>
        </div>

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{project.title}</h1>
            {project.description && (
              <p className="text-muted-foreground text-sm mt-1">{project.description}</p>
            )}
          </div>
          <Link
            to={`/cabinet/project/${projectId}/new-task`}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Icon name="Plus" size={16} />
            Новое задание
          </Link>
        </div>

        <div className="flex gap-1 mb-6 border-b">
          {(["tasks", "docs", "team"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? "border-orange-500 text-orange-600"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "tasks" ? `Задания (${tasks.length})` : t === "docs" ? `Файлы (${docs.length})` : "Команда"}
            </button>
          ))}
        </div>

        {tab === "tasks" && (
          <div className="space-y-3">
            {tasks.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                  <Icon name="ListTodo" size={22} />
                </div>
                <p className="font-medium text-foreground mb-1">Заданий пока нет</p>
                <p className="text-sm mb-4">Создайте задание чтобы начать работу с AI</p>
                <Link
                  to={`/cabinet/project/${projectId}/new-task`}
                  className="inline-flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors"
                >
                  <Icon name="Plus" size={14} />
                  Создать задание
                </Link>
              </div>
            ) : (
              tasks.map((t) => (
                <Link
                  key={t.id}
                  to={`/cabinet/project/${projectId}/task/${t.id}`}
                  className="flex items-center gap-4 border rounded-xl p-4 bg-card hover:border-orange-300 hover:shadow-sm transition-all group"
                >
                  <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center flex-shrink-0">
                    <Icon name="Sparkles" size={18} className="text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium group-hover:text-orange-600 transition-colors">{t.title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {TASK_TYPE_LABELS[t.task_type] || t.task_type}
                      {t.topic && ` · ${t.topic}`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`text-xs px-2 py-1 rounded-full mb-1 inline-block ${
                      t.versions > 0
                        ? "bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {t.versions > 0 ? `${t.versions} версий` : "Не запущено"}
                    </div>
                    <p className="text-xs text-muted-foreground">{t.created_by}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}

        {tab === "docs" && (
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-xl p-6 text-center">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                <Icon name="Upload" size={22} className="text-muted-foreground" />
              </div>
              <p className="font-medium mb-1">Загрузить файл</p>
              <p className="text-sm text-muted-foreground mb-4">PDF, DOCX или PPTX — до 20 МБ</p>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.pptx"
                onChange={handleUpload}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className={`inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""}`}
              >
                <Icon name="Upload" size={14} />
                {uploading ? "Загружаю..." : "Выбрать файл"}
              </label>
              {uploadError && <p className="text-red-500 text-sm mt-2">{uploadError}</p>}
            </div>

            {docs.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-4">Файлов пока нет</p>
            ) : (
              <div className="space-y-2">
                {docs.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-3 border rounded-xl p-3.5 bg-card">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      doc.file_type === "pdf" ? "bg-red-100 dark:bg-red-950/30" :
                      doc.file_type === "pptx" ? "bg-orange-100 dark:bg-orange-950/30" :
                      "bg-blue-100 dark:bg-blue-950/30"
                    }`}>
                      <Icon
                        name="FileText"
                        size={16}
                        className={
                          doc.file_type === "pdf" ? "text-red-600" :
                          doc.file_type === "pptx" ? "text-orange-600" : "text-blue-600"
                        }
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.file_type.toUpperCase()} · {formatSize(doc.file_size)} · {doc.uploaded_by}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      doc.status === "ready"
                        ? "bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {doc.status === "ready" ? "Готов" : "Обработка"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "team" && (
          <div className="space-y-6">
            <div className="space-y-2">
              {project.members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 border rounded-xl p-3.5 bg-card">
                  <div className="w-9 h-9 rounded-full bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center flex-shrink-0">
                    <Icon name="User" size={16} className="text-orange-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    m.role === "owner"
                      ? "bg-orange-100 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {m.role === "owner" ? "Владелец" : "Участник"}
                  </span>
                </div>
              ))}
            </div>

            {project.my_role === "owner" && (
              <div>
                {!showInvite ? (
                  <button
                    onClick={() => setShowInvite(true)}
                    className="flex items-center gap-2 border rounded-xl p-3.5 w-full text-sm text-muted-foreground hover:text-foreground hover:border-orange-300 transition-colors"
                  >
                    <Icon name="UserPlus" size={16} />
                    Пригласить участника по email
                  </button>
                ) : (
                  <form onSubmit={handleInvite} className="border rounded-xl p-4 space-y-3">
                    <p className="text-sm font-medium">Пригласить по email</p>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="email@example.com"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500 [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_white]"
                    />
                    {inviteMsg && (
                      <p className={`text-sm ${inviteMsg.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>
                        {inviteMsg}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setShowInvite(false); setInviteMsg(""); }}
                        className="flex-1 border rounded-lg py-2 text-sm hover:bg-muted transition-colors">
                        Отмена
                      </button>
                      <button type="submit"
                        className="flex-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg py-2 text-sm font-medium transition-colors">
                        Пригласить
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {project.activity.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-3 text-muted-foreground">История активности</p>
                <div className="space-y-2">
                  {project.activity.slice(0, 10).map((a, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-1.5 flex-shrink-0" />
                      <span>
                        <span className="font-medium">{a.user_name}</span>{" "}
                        <span className="text-muted-foreground">{ACTION_LABELS[a.action] || a.action}</span>
                        {a.details && <span className="text-muted-foreground"> «{a.details}»</span>}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
                        {new Date(a.created_at).toLocaleDateString("ru-RU")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}