import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { projectsApi, documentsApi, uploadDocumentChunked, mediaApi, tasksApi, workspaceApi, fileToBase64 } from "@/lib/api";
import { analytics } from "@/lib/analytics";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import HelpPanel from "@/components/HelpPanel";

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
  const [tab, setTab] = useState<"overview" | "copilot" | "hypotheses" | "artifacts" | "tasks" | "docs" | "team">("overview");

  // Workspace state
  type Hypothesis = { id: number; title: string; statement: string; assumptions: string; success_criteria: string; status: string; conclusion: string; priority: string; created_at: string; updated_at: string };
  type Artifact = { id: number; title: string; artifact_type: string; summary: string; mode: string; created_at: string; content?: string };
  type WsContext = { goals_text: string; constraints_text: string; key_facts_text: string; stakeholders_text: string; updated_at?: string } | null;

  const [wsContext, setWsContext] = useState<WsContext>(null);
  const [wsContextEdit, setWsContextEdit] = useState(false);
  const [wsContextDraft, setWsContextDraft] = useState({ goals_text: "", constraints_text: "", key_facts_text: "", stakeholders_text: "" });
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [openArtifact, setOpenArtifact] = useState<Artifact | null>(null);
  const [copilotMsg, setCopilotMsg] = useState("");
  const [copilotMode, setCopilotMode] = useState("analyst");
  const [copilotSave, setCopilotSave] = useState(false);
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotHistory, setCopilotHistory] = useState<{ q: string; a: string; artifact_id?: number }[]>([]);
  const [hypForm, setHypForm] = useState(false);
  const [hypDraft, setHypDraft] = useState({ title: "", statement: "", assumptions: "", success_criteria: "", priority: "medium" });
  const [openHyp, setOpenHyp] = useState<Hypothesis | null>(null);
  const copilotEndRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
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
    workspaceApi.getContext(projectId).then((d: { context: WsContext }) => {
      setWsContext(d.context);
      if (d.context) setWsContextDraft({ goals_text: d.context.goals_text, constraints_text: d.context.constraints_text, key_facts_text: d.context.key_facts_text, stakeholders_text: d.context.stakeholders_text });
    }).catch(() => {});
    workspaceApi.getHypotheses(projectId).then((d: { hypotheses: Hypothesis[] }) => setHypotheses(d.hypotheses || [])).catch(() => {});
    workspaceApi.getArtifacts(projectId).then((d: { artifacts: Artifact[] }) => setArtifacts(d.artifacts || [])).catch(() => {});
  };

  useEffect(() => { load(); analytics.workspaceOpened(projectId, "overview"); }, [projectId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!["pdf", "docx", "pptx"].includes(ext)) {
      setUploadError("Поддерживаются только PDF, DOCX, PPTX");
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    setUploadError("");
    try {
      await uploadDocumentChunked(projectId, file, uploadCategory, setUploadProgress);
      load();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setUploading(false);
      setUploadProgress(0);
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

  const handleCopilot = async () => {
    if (!copilotMsg.trim() || copilotLoading) return;
    const q = copilotMsg;
    setCopilotMsg("");
    setCopilotLoading(true);
    try {
      const res = await workspaceApi.copilot({ project_id: projectId, message: q, mode: copilotMode, save_as_artifact: copilotSave, artifact_type: "analysis" }) as { answer: string; artifact_id?: number };
      setCopilotHistory(prev => [...prev, { q, a: res.answer, artifact_id: res.artifact_id }]);
      analytics.workspaceCopilotUsed(projectId, copilotMode, copilotSave);
      if (res.artifact_id) {
        analytics.workspaceArtifactCreated(projectId, "analysis", copilotMode);
        workspaceApi.getArtifacts(projectId).then((d: { artifacts: Artifact[] }) => setArtifacts(d.artifacts || [])).catch(() => {});
      }
      setTimeout(() => copilotEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch {
      setCopilotHistory(prev => [...prev, { q, a: "Не удалось получить ответ. Попробуй ещё раз." }]);
    } finally {
      setCopilotLoading(false);
    }
  };

  const handleSaveContext = async () => {
    await workspaceApi.updateContext(projectId, wsContextDraft);
    analytics.workspaceContextUpdated(projectId, wsContextDraft);
    setWsContextEdit(false);
    workspaceApi.getContext(projectId).then((d: { context: WsContext }) => setWsContext(d.context)).catch(() => {});
  };

  const handleCreateHypothesis = async () => {
    if (!hypDraft.title.trim()) return;
    await workspaceApi.createHypothesis({ project_id: projectId, ...hypDraft });
    analytics.workspaceHypothesisCreated(projectId, hypDraft.priority);
    setHypForm(false);
    setHypDraft({ title: "", statement: "", assumptions: "", success_criteria: "", priority: "medium" });
    workspaceApi.getHypotheses(projectId).then((d: { hypotheses: Hypothesis[] }) => setHypotheses(d.hypotheses || [])).catch(() => {});
  };

  const handleHypStatus = async (id: number, status: string) => {
    await workspaceApi.updateHypothesis({ id, status });
    analytics.workspaceHypothesisUpdated(projectId, id, status);
    workspaceApi.getHypotheses(projectId).then((d: { hypotheses: Hypothesis[] }) => setHypotheses(d.hypotheses || [])).catch(() => {});
  };

  const handleOpenArtifact = async (id: number) => {
    const res = await workspaceApi.getArtifact(id) as { artifact: Artifact };
    setOpenArtifact(res.artifact);
    analytics.workspaceArtifactOpened(projectId, id);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const d = await projectsApi.invite(projectId, inviteEmail) as { name?: string; pending?: boolean; message?: string };
      if (d.pending) {
        setInviteMsg(`⏳ ${d.message || "Приглашение отправлено — участник получит доступ после регистрации"}`);
      } else {
        setInviteMsg(`✓ ${d.name} добавлен в проект`);
        load();
      }
      setInviteEmail("");
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

        <HelpPanel
          title="Как работать с проектом"
          summary="Проект — ваше рабочее пространство. Загрузите материалы, создайте задание — AI сделает презентацию."
          steps={[
            { num: 1, title: "Загрузите материалы", description: "Перейдите на вкладку «Материалы» и загрузите документы: конспекты, статьи, стандарты, шаблоны." },
            { num: 2, title: "Создайте задание", description: "Нажмите «Новое задание» — выберите тип (презентация, анализ, доклад) и опишите тему." },
            { num: 3, title: "Запустите AI", description: "На странице задания нажмите «Запустить AI». AI прочитает ваши материалы и создаст результат." },
            { num: 4, title: "Проверьте или скачайте", description: "Просмотрите результат, скачайте PPTX или запустите аудит готовой презентации." },
          ]}
          sections={[
            {
              title: "Какие роли у документов",
              icon: "Tag",
              subsections: [
                { title: "📜 Стандарт / Критерии", content: "Нормативные требования и чеклисты. AI сверяет с ними содержимое." },
                { title: "📋 Образец / Шаблон", content: "Пример структуры и оформления. AI берёт форму, но не предметный смысл." },
                { title: "📚 Источник", content: "Основные материалы — лекции, статьи, конспекты. AI использует как фактическую базу." },
                { title: "📎 Дополнительный", content: "Вспомогательные материалы для контекста." },
              ],
            },
            {
              title: "Что такое Аудит",
              icon: "ShieldCheck",
              content: "Аудит проверяет готовую PPTX на соответствие вашим документам. Найдёт противоречия, отсутствующие разделы, неточные формулировки. Доступен через кнопку «Аудит» в правом углу.",
            },
            {
              title: "Что такое Поиск",
              icon: "Search",
              content: "Семантический поиск по всем загруженным материалам. Найдите нужную цитату или факт в своих документах без ручного просмотра.",
            },
          ]}
          tips={[
            { kind: "tip", text: "Назначайте роли документам — это помогает AI правильно расставить приоритеты при генерации." },
            { kind: "warning", text: "Без загруженных материалов AI будет опираться только на общие знания, а не на ваши источники." },
            { kind: "example", text: "Хороший стек: Программа курса (Критерии) + 3–5 лекций (Источник) + образец презентации (Шаблон)." },
          ]}
        />

        <div className="flex gap-0.5 mb-6 border-b overflow-x-auto">
          {([
            { key: "overview",    label: "🏠 Обзор" },
            { key: "copilot",     label: "🤖 AI Copilot" },
            { key: "hypotheses",  label: `💡 Гипотезы${hypotheses.length ? ` (${hypotheses.length})` : ""}` },
            { key: "artifacts",   label: `📦 Артефакты${artifacts.length ? ` (${artifacts.length})` : ""}` },
            { key: "tasks",       label: `📋 Задания (${tasks.length})` },
            { key: "docs",        label: `📄 Файлы (${docs.length})` },
            { key: "team",        label: "👥 Команда" },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? "border-slate-800 text-slate-900"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Обзор ── */}
        {tab === "overview" && (
          <div className="space-y-5">
            {/* Карточки-счётчики */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Гипотез", count: hypotheses.length, active: hypotheses.filter(h => h.status === "open" || h.status === "testing").length, icon: "Lightbulb", color: "text-amber-600 bg-amber-50" },
                { label: "Артефактов", count: artifacts.length, active: 0, icon: "Package", color: "text-violet-600 bg-violet-50" },
                { label: "Файлов", count: docs.length, active: docs.filter(d => d.status === "ready").length, icon: "FileText", color: "text-blue-600 bg-blue-50" },
                { label: "Заданий", count: tasks.length, active: tasks.filter(t => t.status === "completed").length, icon: "CheckSquare", color: "text-emerald-600 bg-emerald-50" },
              ].map(c => (
                <div key={c.label} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${c.color}`}>
                    <Icon name={c.icon} size={18} />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-slate-900">{c.count}</p>
                    <p className="text-xs text-slate-500">{c.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Контекст пространства */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-slate-800 flex items-center justify-center">
                    <Icon name="Map" size={14} className="text-white" />
                  </div>
                  <span className="font-semibold text-slate-900">Контекст пространства</span>
                </div>
                <button onClick={() => setWsContextEdit(!wsContextEdit)} className="text-xs text-violet-600 hover:text-violet-800 font-medium">
                  {wsContextEdit ? "Отмена" : "Редактировать"}
                </button>
              </div>
              {wsContextEdit ? (
                <div className="space-y-3">
                  {[
                    { key: "goals_text",        label: "Цели и задачи пространства",       placeholder: "Чего хотим достичь в этом проекте?" },
                    { key: "constraints_text",   label: "Ограничения",                      placeholder: "Что нельзя, какие ресурсы, сроки..." },
                    { key: "key_facts_text",     label: "Ключевые факты / контекст",        placeholder: "Важные вещи, которые AI должен знать..." },
                    { key: "stakeholders_text",  label: "Стейкхолдеры",                     placeholder: "Кто вовлечён, кто принимает решения..." },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{f.label}</label>
                      <textarea
                        className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                        rows={2}
                        placeholder={f.placeholder}
                        value={wsContextDraft[f.key as keyof typeof wsContextDraft]}
                        onChange={e => setWsContextDraft(prev => ({ ...prev, [f.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <button onClick={handleSaveContext} className="w-full py-2 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 transition-colors">
                    Сохранить контекст
                  </button>
                </div>
              ) : wsContext && (wsContext.goals_text || wsContext.key_facts_text || wsContext.constraints_text) ? (
                <div className="space-y-3">
                  {wsContext.goals_text && <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Цели</p><p className="text-sm text-slate-700 leading-relaxed">{wsContext.goals_text}</p></div>}
                  {wsContext.constraints_text && <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Ограничения</p><p className="text-sm text-slate-700 leading-relaxed">{wsContext.constraints_text}</p></div>}
                  {wsContext.key_facts_text && <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Ключевые факты</p><p className="text-sm text-slate-700 leading-relaxed">{wsContext.key_facts_text}</p></div>}
                  {wsContext.stakeholders_text && <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Стейкхолдеры</p><p className="text-sm text-slate-700 leading-relaxed">{wsContext.stakeholders_text}</p></div>}
                </div>
              ) : (
                <div className="py-6 text-center">
                  <p className="text-sm text-slate-400 mb-3">Добавь контекст — AI будет использовать его в каждом ответе</p>
                  <button onClick={() => setWsContextEdit(true)} className="text-sm text-violet-600 font-medium hover:text-violet-800">Добавить контекст</button>
                </div>
              )}
            </div>

            {/* Открытые гипотезы */}
            {hypotheses.filter(h => h.status === "open" || h.status === "testing").length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Icon name="Lightbulb" size={15} className="text-amber-600" />
                  <span className="text-sm font-semibold text-slate-800">Активные гипотезы</span>
                </div>
                <div className="space-y-2">
                  {hypotheses.filter(h => h.status === "open" || h.status === "testing").slice(0, 3).map(h => (
                    <div key={h.id} onClick={() => { setOpenHyp(h); setTab("hypotheses"); }} className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-amber-100 cursor-pointer hover:border-amber-300 transition-colors">
                      <span className="text-sm text-slate-700 font-medium leading-snug">{h.title}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ml-2 flex-shrink-0 ${h.status === "testing" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>{h.status === "testing" ? "проверяется" : "открыта"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Последние артефакты */}
            {artifacts.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Icon name="Package" size={15} className="text-violet-600" />
                  <span className="text-sm font-semibold text-slate-800">Последние артефакты</span>
                </div>
                <div className="space-y-2">
                  {artifacts.slice(0, 3).map(a => (
                    <div key={a.id} onClick={() => handleOpenArtifact(a.id)} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">{a.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{a.summary?.slice(0, 80)}...</p>
                      </div>
                      <Icon name="ChevronRight" size={13} className="text-slate-400 flex-shrink-0 ml-2" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── AI Copilot ── */}
        {tab === "copilot" && (
          <div className="space-y-4">
            {/* Режим */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2.5">Режим AI</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "analyst",    label: "🔍 Аналитик",   desc: "анализ, gap, summary" },
                  { key: "strategist", label: "🎯 Стратег",    desc: "гипотезы, roadmap" },
                  { key: "pm",         label: "📋 PM",         desc: "задачи, план, критерии" },
                  { key: "researcher", label: "🔬 Исследователь", desc: "обзоры, сравнения" },
                ].map(m => (
                  <button key={m.key} onClick={() => setCopilotMode(m.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${copilotMode === m.key ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}>
                    {m.label}
                    <span className="text-[10px] opacity-60">{m.desc}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <input type="checkbox" id="ws-save" checked={copilotSave} onChange={e => setCopilotSave(e.target.checked)} className="w-4 h-4 rounded" />
                <label htmlFor="ws-save" className="text-xs text-slate-600 cursor-pointer">Сохранять ответы как артефакты</label>
              </div>
            </div>

            {/* История */}
            <div className="space-y-3 min-h-[200px]">
              {copilotHistory.length === 0 && (
                <div className="bg-gradient-to-br from-slate-50 to-violet-50 border border-slate-200 rounded-2xl p-6 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-violet-100 flex items-center justify-center mx-auto">
                    <Icon name="Sparkles" size={22} className="text-violet-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">AI Copilot знает контекст проекта</p>
                    <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">Он читает твои файлы, гипотезы и контекст пространства — не нужно вставлять всё в промпт вручную</p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 pt-1">
                    {["Проанализируй текущие гипотезы", "Сделай summary по файлам", "Предложи следующие шаги"].map(s => (
                      <button key={s} onClick={() => setCopilotMsg(s)} className="text-xs px-3 py-1.5 bg-white border border-violet-200 text-violet-700 rounded-full hover:bg-violet-50 transition-colors">{s}</button>
                    ))}
                  </div>
                </div>
              )}
              {copilotHistory.map((h, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-end">
                    <div className="bg-slate-800 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%] text-sm">{h.q}</div>
                  </div>
                  <div className="flex gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon name="Sparkles" size={13} className="text-violet-600" />
                    </div>
                    <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 flex-1">
                      <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{h.a}</p>
                      {h.artifact_id && (
                        <button onClick={() => handleOpenArtifact(h.artifact_id!)} className="mt-2 flex items-center gap-1 text-[11px] text-violet-600 hover:text-violet-800 font-medium">
                          <Icon name="Package" size={11} />
                          Сохранён как артефакт
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {copilotLoading && (
                <div className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                    <Icon name="Sparkles" size={13} className="text-violet-600" />
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-slate-500">AI анализирует проект...</span>
                  </div>
                </div>
              )}
              <div ref={copilotEndRef} />
            </div>

            {/* Input */}
            <div className="flex gap-2 bg-white border border-slate-200 rounded-2xl p-3">
              <textarea
                className="flex-1 text-sm resize-none focus:outline-none min-h-[44px] max-h-[120px] text-slate-800"
                placeholder="Что нужно проанализировать, исследовать или подготовить?"
                value={copilotMsg}
                onChange={e => setCopilotMsg(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleCopilot(); } }}
              />
              <button onClick={handleCopilot} disabled={!copilotMsg.trim() || copilotLoading}
                className="self-end flex items-center justify-center w-10 h-10 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white rounded-xl transition-colors flex-shrink-0">
                <Icon name="Send" size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── Гипотезы ── */}
        {tab === "hypotheses" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Гипотезы и эксперименты</p>
              <button onClick={() => setHypForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white rounded-xl text-xs font-semibold hover:bg-slate-700 transition-colors">
                <Icon name="Plus" size={12} />
                Новая гипотеза
              </button>
            </div>

            {hypForm && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-800">Новая гипотеза</p>
                {[
                  { key: "title", label: "Формулировка *", placeholder: "Если мы сделаем X, то Y увеличится на Z%", required: true },
                  { key: "statement", label: "Детальное описание", placeholder: "Почему мы так думаем?" },
                  { key: "assumptions", label: "Предпосылки", placeholder: "Что должно быть верным для этой гипотезы?" },
                  { key: "success_criteria", label: "Критерии успеха", placeholder: "Как поймём, что гипотеза подтвердилась?" },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{f.label}</label>
                    <input className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                      placeholder={f.placeholder}
                      value={hypDraft[f.key as keyof typeof hypDraft]}
                      onChange={e => setHypDraft(prev => ({ ...prev, [f.key]: e.target.value }))} />
                  </div>
                ))}
                <div className="flex gap-2">
                  <select className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" value={hypDraft.priority} onChange={e => setHypDraft(prev => ({ ...prev, priority: e.target.value }))}>
                    <option value="high">🔴 Высокий приоритет</option>
                    <option value="medium">🟡 Средний</option>
                    <option value="low">🟢 Низкий</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setHypForm(false)} className="flex-1 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">Отмена</button>
                  <button onClick={handleCreateHypothesis} disabled={!hypDraft.title.trim()} className="flex-1 py-2 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 disabled:opacity-50">Создать</button>
                </div>
              </div>
            )}

            {hypotheses.length === 0 && !hypForm ? (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center">
                <Icon name="Lightbulb" size={28} className="text-amber-400 mx-auto mb-3" />
                <p className="font-semibold text-slate-700 mb-1">Нет гипотез</p>
                <p className="text-sm text-slate-400 mb-4">Добавь гипотезы для проверки — AI поможет их проанализировать</p>
                <button onClick={() => setHypForm(true)} className="text-sm text-violet-600 font-medium hover:text-violet-800">Добавить первую гипотезу</button>
              </div>
            ) : (
              <div className="space-y-3">
                {[
                  { status: "open",      label: "Открытые",       color: "border-amber-200 bg-amber-50" },
                  { status: "testing",   label: "Проверяются",    color: "border-blue-200 bg-blue-50" },
                  { status: "confirmed", label: "Подтверждены",   color: "border-emerald-200 bg-emerald-50" },
                  { status: "rejected",  label: "Отклонены",      color: "border-slate-200 bg-slate-50" },
                ].map(group => {
                  const grouped = hypotheses.filter(h => h.status === group.status);
                  if (!grouped.length) return null;
                  return (
                    <div key={group.status}>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{group.label} ({grouped.length})</p>
                      <div className="space-y-2">
                        {grouped.map(h => (
                          <div key={h.id} className={`rounded-2xl border p-4 space-y-2 ${group.color}`}>
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-semibold text-slate-800 leading-snug flex-1">{h.title}</p>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${h.priority === "high" ? "bg-red-100 text-red-700" : h.priority === "low" ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"}`}>
                                {h.priority === "high" ? "HIGH" : h.priority === "low" ? "LOW" : "MED"}
                              </span>
                            </div>
                            {h.statement && <p className="text-xs text-slate-600 leading-snug">{h.statement}</p>}
                            {h.success_criteria && <p className="text-[11px] text-slate-500"><span className="font-semibold">Критерий:</span> {h.success_criteria}</p>}
                            {h.conclusion && <p className="text-[11px] text-emerald-700 font-medium"><span className="font-semibold">Вывод:</span> {h.conclusion}</p>}
                            {/* Статусные кнопки */}
                            <div className="flex gap-1 pt-1 flex-wrap">
                              {h.status !== "open"      && <button onClick={() => handleHypStatus(h.id, "open")}      className="text-[10px] px-2 py-0.5 bg-white border border-slate-200 rounded-full hover:bg-slate-50 text-slate-600">→ открыта</button>}
                              {h.status !== "testing"   && <button onClick={() => handleHypStatus(h.id, "testing")}   className="text-[10px] px-2 py-0.5 bg-white border border-blue-200 rounded-full hover:bg-blue-50 text-blue-600">→ проверяется</button>}
                              {h.status !== "confirmed" && <button onClick={() => handleHypStatus(h.id, "confirmed")} className="text-[10px] px-2 py-0.5 bg-white border border-emerald-200 rounded-full hover:bg-emerald-50 text-emerald-600">→ подтверждена</button>}
                              {h.status !== "rejected"  && <button onClick={() => handleHypStatus(h.id, "rejected")}  className="text-[10px] px-2 py-0.5 bg-white border border-red-200 rounded-full hover:bg-red-50 text-red-600">→ отклонена</button>}
                              <button onClick={() => { setCopilotMsg(`Проанализируй гипотезу: "${h.title}". ${h.statement}`); setTab("copilot"); }}
                                className="text-[10px] px-2 py-0.5 bg-violet-600 text-white rounded-full hover:bg-violet-700">🤖 спросить AI</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Артефакты ── */}
        {tab === "artifacts" && (
          <div className="space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Артефакты — результаты AI-работы в этом пространстве</p>
            {artifacts.length === 0 ? (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center">
                <Icon name="Package" size={28} className="text-violet-400 mx-auto mb-3" />
                <p className="font-semibold text-slate-700 mb-1">Артефактов пока нет</p>
                <p className="text-sm text-slate-400 mb-4">Включи «Сохранять как артефакт» в AI Copilot — ответы будут сохраняться здесь</p>
                <button onClick={() => setTab("copilot")} className="text-sm text-violet-600 font-medium hover:text-violet-800">Открыть Copilot</button>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {artifacts.map(a => (
                  <div key={a.id} onClick={() => handleOpenArtifact(a.id)}
                    className="bg-white border border-slate-200 rounded-2xl p-4 cursor-pointer hover:border-violet-300 hover:shadow-sm transition-all space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800 leading-snug flex-1">{a.title}</p>
                      <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full flex-shrink-0">{a.artifact_type}</span>
                    </div>
                    <p className="text-xs text-slate-500 leading-snug line-clamp-2">{a.summary}</p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      <Icon name="Sparkles" size={9} />
                      <span>{a.mode}</span>
                      <span>·</span>
                      <span>{new Date(a.created_at).toLocaleDateString("ru-RU")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Модал артефакта */}
        {openArtifact && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setOpenArtifact(null)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div>
                  <p className="font-semibold text-slate-900">{openArtifact.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{openArtifact.artifact_type} · {openArtifact.mode}</p>
                </div>
                <button onClick={() => setOpenArtifact(null)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100"><Icon name="X" size={16} /></button>
              </div>
              <div className="overflow-y-auto flex-1 p-5">
                <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{openArtifact.content}</p>
              </div>
            </div>
          </div>
        )}

        {tab === "tasks" && (
          <div className="space-y-3">
            {tasks.length === 0 ? (
              <div className="space-y-4">
                {/* Empty state — дружелюбный с карточками */}
                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center mb-2">
                  <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto mb-4">
                    <Icon name="Sparkles" size={26} className="text-orange-400" />
                  </div>
                  <p className="font-semibold text-foreground text-lg mb-1">Заданий пока нет</p>
                  <p className="text-sm text-muted-foreground mb-5 max-w-sm mx-auto">
                    Создайте первое задание — AI прочитает ваши материалы и подготовит результат
                  </p>
                  <Link
                    to={`/cabinet/project/${projectId}/new-task`}
                    className="inline-flex items-center gap-2 bg-slate-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-700 transition-colors"
                  >
                    <Icon name="Plus" size={15} />
                    Создать первое задание
                  </Link>
                </div>

                {/* Карточки быстрых сценариев */}
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Что можно сделать</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {[
                    {
                      emoji: "✨", title: "Создать презентацию",
                      desc: "AI соберёт PPTX из ваших документов по теме",
                      color: "border-orange-200 bg-orange-50/50 hover:border-orange-300",
                      link: `/cabinet/project/${projectId}/new-task`,
                    },
                    {
                      emoji: "🛡", title: "Проверить готовую презентацию",
                      desc: "Загрузите PPTX — AI найдёт ошибки и даст правки",
                      color: "border-blue-200 bg-blue-50/50 hover:border-blue-300",
                      link: `/cabinet/project/${projectId}/audit`,
                    },
                    {
                      emoji: "📝", title: "Подготовить доклад или анализ",
                      desc: "AI напишет текст, ответит на вопрос или составит план",
                      color: "border-green-200 bg-green-50/50 hover:border-green-300",
                      link: `/cabinet/project/${projectId}/new-task`,
                    },
                    {
                      emoji: "🔍", title: "Найти в материалах",
                      desc: "Умный поиск по всем загруженным документам проекта",
                      color: "border-slate-200 bg-slate-50/50 hover:border-slate-300",
                      link: `/cabinet/project/${projectId}/search`,
                    },
                  ].map((s) => (
                    <Link key={s.title} to={s.link}
                      className={`flex items-start gap-3 border rounded-xl p-4 transition-all ${s.color}`}>
                      <span className="text-xl flex-shrink-0">{s.emoji}</span>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{s.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{s.desc}</p>
                      </div>
                      <Icon name="ChevronRight" size={14} className="text-slate-400 ml-auto flex-shrink-0 mt-0.5" />
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <>
              {/* Quick action bar — когда уже есть задания */}
              <div className="flex flex-wrap gap-2 mb-1 pb-4 border-b border-slate-100">
                {[
                  { emoji: "✨", label: "Новое задание", link: `/cabinet/project/${projectId}/new-task`, cls: "bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100" },
                  { emoji: "🛡", label: "Аудит PPTX", link: `/cabinet/project/${projectId}/audit`, cls: "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100" },
                  { emoji: "🔍", label: "Поиск по материалам", link: `/cabinet/project/${projectId}/search`, cls: "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100" },
                ].map((a) => (
                  <Link key={a.label} to={a.link}
                    className={`inline-flex items-center gap-1.5 border text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${a.cls}`}>
                    <span>{a.emoji}</span>{a.label}
                  </Link>
                ))}
              </div>
              {tasks.map((t) => (
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
              ))}
              </>
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
              <p className="text-sm text-muted-foreground mb-4">PDF, DOCX или PPTX — до 100 МБ</p>

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
              {uploading && uploadProgress > 0 && (
                <div className="mt-3 max-w-xs mx-auto">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Загружаю...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5">
                    <div className="bg-slate-800 h-1.5 rounded-full transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}
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