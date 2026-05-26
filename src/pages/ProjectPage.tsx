import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { projectsApi, documentsApi, fileToBase64, mediaApi, tasksApi } from "@/lib/api";
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
  category?: string;
  page_count?: number;
  text_length?: number;
  media_type?: string;
}

const CATEGORIES = [
  { value: "lecture", label: "Лекция", icon: "GraduationCap", color: "text-purple-700 bg-purple-50" },
  { value: "notes", label: "Конспект", icon: "Notebook", color: "text-blue-700 bg-blue-50" },
  { value: "article", label: "Статья", icon: "Newspaper", color: "text-green-700 bg-green-50" },
  { value: "handout", label: "Раздатка", icon: "FileText", color: "text-amber-700 bg-amber-50" },
  { value: "standard", label: "Стандарт", icon: "BookMarked", color: "text-red-700 bg-red-50" },
  { value: "reference", label: "Образец", icon: "Copy", color: "text-cyan-700 bg-cyan-50" },
  { value: "other", label: "Другое", icon: "File", color: "text-slate-700 bg-slate-100" },
];

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
  const [uploadCategory, setUploadCategory] = useState("notes");
  const [menuDocId, setMenuDocId] = useState<number | null>(null);
  const [renamingDoc, setRenamingDoc] = useState<{ id: number; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    projectsApi.get(projectId).then((d) => setProject(d)).catch(() => {});
    documentsApi.list(projectId).then((d) => setDocs(d.documents || [])).catch(() => {});
    tasksApi.list(projectId).then((d) => setTasks(d.tasks || [])).catch(() => {});
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
      await documentsApi.upload(projectId, file.name, ext, b64, uploadCategory);
      load();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>, mediaType: "image" | "audio") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const imageExts = ["jpg", "jpeg", "png", "webp", "heic"];
    const audioExts = ["ogg", "oga", "opus", "mp3", "wav", "m4a"];
    if (mediaType === "image" && !imageExts.includes(ext)) {
      setUploadError("Поддерживаются: JPG, PNG, WEBP, HEIC");
      return;
    }
    if (mediaType === "audio" && !audioExts.includes(ext)) {
      setUploadError("Поддерживаются: OGG, OPUS, MP3, WAV, M4A (для лучшего качества — OGG, до 1 МБ)");
      return;
    }
    setUploading(true);
    setUploadError("");
    try {
      const b64 = await fileToBase64(file);
      await mediaApi.upload(projectId, file.name, b64, mediaType, uploadCategory);
      load();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Ошибка загрузки медиа");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleOpenDoc = async (docId: number) => {
    setMenuDocId(null);
    try {
      const d = await documentsApi.getUrl(docId);
      // Декодируем base64 → blob (защищённое скачивание через бэкенд)
      const byteChars = atob(d.file_data);
      const byteArr = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArr], { type: d.mime || "application/octet-stream" });
      const blobUrl = URL.createObjectURL(blob);

      const ft = (d.file_type || "").toLowerCase();
      const inlineTypes = ["pdf", "jpg", "jpeg", "png", "webp"];
      const ua = navigator.userAgent;
      const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
      const isSafari = /^((?!chrome|android).)*safari/i.test(ua);

      // iOS Safari блокирует window.open(blob:) — на iOS всегда скачиваем
      // На десктопе и Android — открываем PDF/картинки во вкладке
      if (inlineTypes.includes(ft) && !isIOS && !isSafari) {
        const w = window.open(blobUrl, "_blank");
        if (!w) {
          // Попап заблокирован — fallback в скачивание
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = d.filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      } else {
        // Скачиваем как файл (iOS/Safari/Office)
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = d.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Не удалось открыть");
    }
  };

  const handleRename = async () => {
    if (!renamingDoc || !renameValue.trim()) return;
    try {
      await documentsApi.rename(renamingDoc.id, renameValue.trim());
      setRenamingDoc(null);
      setRenameValue("");
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await documentsApi.delete(confirmDelete.id);
      setConfirmDelete(null);
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Ошибка");
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

        <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">{project.title}</h1>
            {project.description && (
              <p className="text-muted-foreground text-sm mt-1">{project.description}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Link
              to={`/cabinet/project/${projectId}/audit`}
              className="flex items-center gap-2 border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Icon name="ShieldCheck" size={16} />
              Аудит
            </Link>
            <Link
              to={`/cabinet/project/${projectId}/search`}
              className="flex items-center gap-2 border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Icon name="Search" size={16} />
              Поиск
            </Link>
            <Link
              to={`/cabinet/project/${projectId}/new-task`}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Icon name="Plus" size={16} />
              Новое задание
            </Link>
          </div>
        </div>

        <div className="flex gap-1 mb-6 border-b">
          {(["tasks", "docs", "team"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? "border-slate-800 text-slate-900"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "tasks" ? `Задания (${tasks.length})` : t === "docs" ? `Материалы (${docs.length})` : "Команда"}
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
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <Icon name="Upload" size={22} className="text-slate-600" />
              </div>
              <p className="font-medium mb-1">Загрузить материал</p>
              <p className="text-sm text-muted-foreground mb-4">PDF, DOCX или PPTX — до 20 МБ</p>

              <div className="max-w-xs mx-auto mb-4 text-left">
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Тип материала</label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
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
                  {uploading ? "Загружаю..." : "Документ"}
                </label>

                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => handleMediaUpload(e, "image")}
                  className="hidden"
                  id="photo-upload"
                />
                <label
                  htmlFor="photo-upload"
                  className={`inline-flex items-center gap-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <Icon name="Camera" size={14} />
                  Фото (OCR)
                </label>

                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => handleMediaUpload(e, "audio")}
                  className="hidden"
                  id="audio-upload"
                />
                <label
                  htmlFor="audio-upload"
                  className={`inline-flex items-center gap-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <Icon name="Mic" size={14} />
                  Аудио
                </label>
              </div>
              <p className="text-xs text-slate-500 mt-3">Фото — распознаётся текст с доски / тетради. Аудио (OGG до 1 МБ) — расшифровывается лекция.</p>
              {uploadError && <p className="text-red-500 text-sm mt-2">{uploadError}</p>}
            </div>

            {docs.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-4">Материалов пока нет</p>
            ) : (
              <div className="space-y-2">
                {docs.map((doc) => {
                  const cat = CATEGORIES.find((c) => c.value === doc.category) || CATEGORIES[CATEGORIES.length - 1];
                  const mediaIcon = doc.media_type === "image" ? "Camera" : doc.media_type === "audio" ? "Mic" : cat.icon;
                  const mediaLabel = doc.media_type === "image" ? "Фото" : doc.media_type === "audio" ? "Аудио" : cat.label;
                  return (
                    <div key={doc.id} className="relative flex items-center gap-3 border border-slate-200 rounded-xl p-3.5 bg-card">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${cat.color}`}>
                        <Icon name={mediaIcon} size={16} fallback="FileText" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.name}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium">{mediaLabel}</span>
                          {" · "}{doc.file_type.toUpperCase()}
                          {" · "}{formatSize(doc.file_size)}
                          {doc.page_count ? ` · ${doc.page_count} стр.` : ""}
                          {" · "}{doc.uploaded_by}
                        </p>
                      </div>
                      <button
                        onClick={() => handleOpenDoc(doc.id)}
                        title="Открыть"
                        className="flex items-center gap-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        <Icon name="Eye" size={13} />
                        <span className="hidden sm:inline">Открыть</span>
                      </button>
                      <Link
                        to={`/cabinet/project/${projectId}/document/${doc.id}`}
                        className="flex items-center gap-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg transition-colors"
                        title="Чат с документом"
                      >
                        <Icon name="MessageCircle" size={13} />
                        <span className="hidden sm:inline">Спросить</span>
                      </Link>
                      <button
                        onClick={() => setMenuDocId(menuDocId === doc.id ? null : doc.id)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                        title="Действия"
                      >
                        <Icon name="MoreVertical" size={16} />
                      </button>
                      {menuDocId === doc.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenuDocId(null)} />
                          <div className="absolute right-2 top-full mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-48">
                            <button
                              onClick={() => { setMenuDocId(null); setRenamingDoc({ id: doc.id, name: doc.name }); setRenameValue(doc.name); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                            >
                              <Icon name="Pencil" size={14} />
                              Переименовать
                            </button>
                            <button
                              onClick={() => { setMenuDocId(null); handleOpenDoc(doc.id); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                            >
                              <Icon name="Download" size={14} />
                              Скачать оригинал
                            </button>
                            <div className="border-t border-slate-100 my-1" />
                            <button
                              onClick={() => { setMenuDocId(null); setConfirmDelete({ id: doc.id, name: doc.name }); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 text-left"
                            >
                              <Icon name="Trash2" size={14} />
                              Удалить
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
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

      {/* Модалка переименования */}
      {renamingDoc && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white border rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-semibold mb-4 text-slate-800">Переименовать материал</h2>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRename(); }}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-500 mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => { setRenamingDoc(null); setRenameValue(""); }} className="flex-1 border border-slate-300 rounded-lg py-2.5 text-sm font-medium hover:bg-slate-50">
                Отмена
              </button>
              <button onClick={handleRename} disabled={!renameValue.trim()} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50">
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка удаления */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white border rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center mx-auto mb-3">
              <Icon name="AlertTriangle" size={24} className="text-red-600" />
            </div>
            <h2 className="text-lg font-semibold mb-2 text-center text-slate-800">Удалить материал?</h2>
            <p className="text-sm text-slate-600 mb-1 text-center">«{confirmDelete.name}»</p>
            <p className="text-xs text-slate-500 mb-5 text-center">Будут удалены: файл, извлечённый текст, фрагменты для поиска и история чата по нему. Это действие необратимо.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 border border-slate-300 rounded-lg py-2.5 text-sm font-medium hover:bg-slate-50">
                Отмена
              </button>
              <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-lg py-2.5 text-sm font-medium">
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}