import { useEffect, useState, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { projectsApi, tasksApi, generateApi, documentsApi, putFileToPresignedUrl } from "@/lib/api";
import { analytics } from "@/lib/analytics";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";

interface Project { id: number; title: string; task_count: number; }
interface TaskItem { id: number; title: string; status: string; versions: number; }
interface ProjectDoc { id: number; name: string; file_type: string; category?: string; }
interface Run { id: number; version: number; status: string; summary?: string; }
interface VisualItem {
  slide_index: number;
  slide_title: string;
  visual_type: string;
  render_mode: string;
  source_prompt: string;
  generation_status: string;
  asset_url?: string;
  active_asset_url?: string;
  user_override_url?: string;
  active_asset_kind?: string;
  can_restore_ai?: boolean;
  warnings?: string[];
}

const VISUAL_TYPE_LABEL: Record<string, string> = {
  image: "Картинка", diagram: "Диаграмма", timeline: "Таймлайн",
  process: "Процесс", comparison: "Сравнение", matrix: "Матрица",
  orgchart: "Оргсхема", cycle: "Цикл",
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  done:          { label: "Готово",            cls: "bg-green-100 text-green-700" },
  rendered:      { label: "Отрисован",         cls: "bg-blue-100 text-blue-700" },
  user_override: { label: "Заменено вами",     cls: "bg-purple-100 text-purple-700" },
  pending_render:{ label: "Генерируется…",     cls: "bg-yellow-100 text-yellow-700" },
  pending:       { label: "Ожидает",           cls: "bg-slate-100 text-slate-600" },
  failed:        { label: "Ошибка",            cls: "bg-red-100 text-red-600" },
  image_pending: { label: "Картинка не готова",cls: "bg-orange-100 text-orange-700" },
};

export default function VisualsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initProject = Number(searchParams.get("project")) || null;
  const initTask    = Number(searchParams.get("task"))    || null;
  const initRun     = Number(searchParams.get("run"))     || null;

  const [projects, setProjects]     = useState<Project[]>([]);
  const [tasks, setTasks]           = useState<TaskItem[]>([]);
  const [runs, setRuns]             = useState<Run[]>([]);
  const [visuals, setVisuals]       = useState<VisualItem[]>([]);

  const [projectId, setProjectId]   = useState<number | null>(initProject);
  const [taskId, setTaskId]         = useState<number | null>(initTask);
  const [runId, setRunId]           = useState<number | null>(initRun);

  const [mode, setMode] = useState<"task" | "files">("task");
  const [projectDocs, setProjectDocs] = useState<ProjectDoc[]>([]);
  const [loadingDocs,  setLoadingDocs]  = useState(false);
  const [findingDocId, setFindingDocId] = useState<number | null>(null);

  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingTasks,    setLoadingTasks]    = useState(false);
  const [loadingVisuals,  setLoadingVisuals]  = useState(false);

  const [rerendering,  setRerendering]  = useState<number | null>(null);
  const [uploading,    setUploading]    = useState<number | null>(null);
  const [restoring,    setRestoring]    = useState<number | null>(null);
  const [editPrompt,   setEditPrompt]   = useState<Record<number, string>>({});
  const [editingIdx,   setEditingIdx]   = useState<number | null>(null);
  const [lightbox,     setLightbox]     = useState<string | null>(null);
  const [error,        setError]        = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<number | null>(null);

  // Синхронизация URL
  useEffect(() => {
    const p: Record<string, string> = {};
    if (projectId) p.project = String(projectId);
    if (taskId)    p.task    = String(taskId);
    if (runId)     p.run     = String(runId);
    setSearchParams(p, { replace: true });
  }, [projectId, taskId, runId]);

  // Загрузка проектов
  useEffect(() => {
    projectsApi.list()
      .then((d) => setProjects((d as { projects: Project[] }).projects || []))
      .catch(() => setError("Не удалось загрузить проекты"))
      .finally(() => setLoadingProjects(false));
  }, []);

  // Загрузка заданий при выборе проекта
  useEffect(() => {
    if (!projectId) return;
    setLoadingTasks(true);
    setTasks([]); setTaskId(null); setRunId(null); setVisuals([]);
    setError("");
    tasksApi.list(projectId)
      .then((d) => setTasks((d as { tasks: TaskItem[] }).tasks || []))
      .catch(() => setError("Не удалось загрузить задания"))
      .finally(() => setLoadingTasks(false));
  }, [projectId]);

  // Сброс state при смене вкладки
  useEffect(() => {
    setTaskId(null); setRunId(null); setVisuals([]);
    setProjectDocs([]); setError(""); setEditingIdx(null);
  }, [mode]);

  // Загрузка PPTX-материалов при режиме "из файлов"
  useEffect(() => {
    if (!projectId || mode !== "files") return;
    setLoadingDocs(true);
    setProjectDocs([]);
    documentsApi.list(projectId)
      .then((d) => {
        const docs = (d as { documents: ProjectDoc[] }).documents || [];
        const PPTX_TYPES = ["pptx", "ppt", "pptm"];
        const pptxDocs = docs.filter(doc => PPTX_TYPES.includes(doc.file_type?.toLowerCase()));
        setProjectDocs(pptxDocs);
        // Отправляем событие после загрузки — знаем реальное число файлов
        analytics.visiualsModeSelected("project_files", projectId, { count: pptxDocs.length });
        if (pptxDocs.length === 0) {
          analytics.projectFilesEmptyState(projectId, docs.length);
        }
      })
      .catch(() => setError("Не удалось загрузить материалы"))
      .finally(() => setLoadingDocs(false));
  }, [projectId, mode]);

  // Загрузка runs при выборе задания
  useEffect(() => {
    if (!taskId) return;
    setRunId(null); setVisuals([]);
    tasksApi.get(taskId)
      .then((d) => {
        const t = d as { runs: Run[] };
        const r = (t.runs || []).filter(r => r.status === "done");
        setRuns(r);
        if (r.length > 0) setRunId(r[0].id);
      })
      .catch(() => setError("Не удалось загрузить версии"));
  }, [taskId]);

  // Загрузка визуалов при выборе run
  useEffect(() => {
    if (!runId) return;
    setLoadingVisuals(true); setVisuals([]);
    generateApi.getRun(runId)
      .then((d) => {
        const res = d as { visual_plan?: VisualItem[] };
        setVisuals(res.visual_plan || []);
      })
      .catch(() => setError("Не удалось загрузить визуалы"))
      .finally(() => setLoadingVisuals(false));
  }, [runId]);

  const updateVisual = (slideIndex: number, patch: Partial<VisualItem>) =>
    setVisuals(prev => prev.map(v => v.slide_index === slideIndex ? { ...v, ...patch } : v));

  // Найти задание, в котором используется документ с данным id
  const handleFindTaskByDoc = async (docId: number) => {
    if (!projectId) return;
    setFindingDocId(docId);
    setError("");
    try {
      const d = await tasksApi.list(projectId) as { tasks: (TaskItem & { document_ids?: number[] })[] };
      const allTasks = d.tasks || [];
      // Загружаем детали заданий параллельно (ограничиваем 10 первыми для скорости)
      const sample = allTasks.slice(0, 10);
      const details = await Promise.all(
        sample.map(t => tasksApi.get(t.id).then(r => r as { id: number; documents: { document_id: number }[] }).catch(() => null))
      );
      const matches = details.filter(r => r && r.documents?.some(d => d.document_id === docId));
      if (matches.length > 0) {
        const found = matches[0]!;
        analytics.projectFileLookupResult(projectId, docId, "found", matches.length, found.id);
        setMode("task");
        setTaskId(found.id);
      } else {
        analytics.projectFileLookupResult(projectId, docId, "not_found", 0);
        setError("Этот файл не прикреплён ни к одному заданию. Создайте новое задание.");
      }
    } catch (e) {
      const errCode = e instanceof Error ? e.message : "unknown";
      analytics.projectFileLookupResult(projectId, docId, "error", 0, undefined, errCode);
      setError("Не удалось выполнить поиск. Попробуйте вручную.");
    } finally {
      setFindingDocId(null);
    }
  };

  const handleRerender = async (slideIndex: number) => {
    if (!runId) return;
    setRerendering(slideIndex);
    try {
      const prompt = editPrompt[slideIndex];
      const res = await generateApi.renderVisual(runId, slideIndex, prompt) as { visual: VisualItem };
      if (res?.visual) { updateVisual(slideIndex, res.visual); setEditingIdx(null); }
    } catch (e) { setError(e instanceof Error ? e.message : "Ошибка генерации"); }
    finally { setRerendering(null); }
  };

  const handleUploadClick = (slideIndex: number) => {
    uploadTarget.current = slideIndex;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const slideIndex = uploadTarget.current;
    if (!file || slideIndex === null || !runId) return;
    e.target.value = "";
    setUploading(slideIndex);
    try {
      const mime = file.type || "image/png";
      const res1 = await generateApi.getVisualUploadUrl(runId, slideIndex, file.name, mime) as { upload_url: string; s3_key: string };
      await putFileToPresignedUrl(res1.upload_url, file);
      const res2 = await generateApi.confirmVisualOverride(runId, slideIndex, res1.s3_key, mime, file.name) as { visual: VisualItem };
      if (res2?.visual) updateVisual(slideIndex, res2.visual);
    } catch (e) { setError(e instanceof Error ? e.message : "Ошибка загрузки"); }
    finally { setUploading(null); }
  };

  const handleRestore = async (slideIndex: number) => {
    if (!runId) return;
    setRestoring(slideIndex);
    try {
      const res = await generateApi.restoreAiVisual(runId, slideIndex) as { visual: VisualItem };
      if (res?.visual) updateVisual(slideIndex, res.visual);
    } catch (e) { setError(e instanceof Error ? e.message : "Ошибка"); }
    finally { setRestoring(null); }
  };

  const imgUrl = (v: VisualItem) =>
    v.user_override_url || v.active_asset_url || v.asset_url;

  return (
    <Layout>
      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleFileChange} />

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} className="max-w-full max-h-full rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white/80 hover:text-white">
            <Icon name="X" size={28} />
          </button>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Заголовок */}
        <div className="flex items-center gap-3">
          <Link to="/cabinet" className="text-sm text-slate-500 hover:text-slate-700">← Кабинет</Link>
          <span className="text-slate-300">/</span>
          <h1 className="text-xl font-semibold">Визуалы презентации</h1>
        </div>

        {/* Вкладки режима */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
          {([
            { key: "task",  label: "Из задания",        icon: "Sparkles" },
            { key: "files", label: "По файлам проекта", icon: "FolderOpen" },
          ] as const).map(tab => (
            <button key={tab.key} onClick={() => {
                if (tab.key === mode) return;
                setMode(tab.key);
                // для "task" событие отправляем сразу; для "files" — после загрузки (в useEffect)
                if (tab.key === "task") {
                  analytics.visiualsModeSelected("task", projectId, { count: 0 });
                }
              }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === tab.key ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
              }`}>
              <Icon name={tab.icon} size={14} fallback="File" />
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 text-sm text-red-700">
            <Icon name="AlertCircle" size={16} />
            {error}
            <button onClick={() => setError("")} className="ml-auto"><Icon name="X" size={14} /></button>
          </div>
        )}

        {/* Шаг 1: выбор проекта */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center font-bold">1</span>
            Выберите проект
          </p>
          {loadingProjects ? (
            <div className="flex gap-2 items-center text-sm text-slate-500"><div className="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />Загрузка…</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {projects.map(p => (
                <button key={p.id} onClick={() => setProjectId(p.id)}
                  className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${projectId === p.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:border-slate-400 text-slate-700"}`}>
                  {p.title}
                  <span className="ml-1 text-xs opacity-60">{p.task_count} зад.</span>
                </button>
              ))}
              {projects.length === 0 && <p className="text-sm text-slate-400">Нет проектов. <Link to="/cabinet" className="text-blue-600 underline">Создать</Link></p>}
            </div>
          )}
        </div>

        {/* Шаг 2: режим "из задания" — выбор задания */}
        {mode === "task" && projectId && (
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center font-bold">2</span>
              Выберите задание
            </p>
            {loadingTasks ? (
              <div className="flex gap-2 items-center text-sm text-slate-500"><div className="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />Загрузка…</div>
            ) : tasks.length === 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-400">Нет заданий. <Link to={`/cabinet/project/${projectId}`} className="text-blue-600 underline">Создать задание</Link></p>
                <p className="text-xs text-slate-400">Или переключитесь на вкладку <button className="text-blue-600 underline" onClick={() => setMode("files")}>«Из материалов»</button> — там можно посмотреть PPTX-файлы проекта.</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tasks.map(t => (
                  <button key={t.id} onClick={() => setTaskId(t.id)}
                    className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${taskId === t.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:border-slate-400 text-slate-700"}`}>
                    {t.title}
                    {t.versions > 0 && <span className="ml-1 text-xs opacity-60">v{t.versions}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Шаг 2: режим "из материалов" — список PPTX файлов */}
        {mode === "files" && projectId && (
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center font-bold">2</span>
              Презентации в материалах
            </p>
            {loadingDocs ? (
              <div className="flex gap-2 items-center text-sm text-slate-500"><div className="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />Загрузка…</div>
            ) : projectDocs.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-400">В этом проекте нет PPTX-файлов.</p>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-600 space-y-2">
                  <p className="font-medium">Как добавить визуалы к презентации:</p>
                  <ol className="list-decimal list-inside space-y-1 text-slate-500 text-xs">
                    <li>Перейдите в проект и загрузите материалы</li>
                    <li>Создайте задание типа «Подготовить презентацию»</li>
                    <li>При запуске включите «Генерировать визуалы»</li>
                    <li>После генерации вернитесь сюда — визуалы появятся на вкладке «Из задания»</li>
                  </ol>
                  <Link to={`/cabinet/project/${projectId}`}
                    className="inline-flex items-center gap-1 mt-2 text-blue-600 hover:text-blue-800 text-xs">
                    Перейти в проект <Icon name="ArrowRight" size={12} />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-700 flex items-start gap-2 mb-3">
                  <Icon name="Info" size={14} className="mt-0.5 flex-shrink-0" />
                  <span>
                    Визуалы привязаны к <strong>результатам заданий</strong>, а не к самим файлам.
                    Найдите задание где используется файл — или создайте новое.
                    Для генерации визуалов включите галочку «Генерировать визуалы» перед запуском.
                  </span>
                </div>
                {projectDocs.map(doc => (
                  <div key={doc.id} className="flex items-center gap-3 border border-slate-200 rounded-xl p-3.5 bg-card">
                    <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
                      <Icon name="Presentation" size={18} className="text-orange-500" fallback="File" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.name}</p>
                      <p className="text-xs text-slate-400">{doc.file_type?.toUpperCase()} · {doc.category || "материал"}</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Link to={`/cabinet/project/${projectId}/new-task`}
                        onClick={() => analytics.projectFileCta("create_task", projectId, { id: doc.id, file_type: doc.file_type })}
                        className="text-xs border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors text-slate-700">
                        Создать задание
                      </Link>
                      <button
                        onClick={() => {
                          analytics.projectFileCta("find_in_tasks", projectId, { id: doc.id, file_type: doc.file_type });
                          handleFindTaskByDoc(doc.id);
                        }}
                        disabled={findingDocId === doc.id}
                        className="text-xs border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors text-slate-700 disabled:opacity-50 flex items-center gap-1">
                        {findingDocId === doc.id
                          ? <><div className="w-3 h-3 border border-slate-400 border-t-slate-800 rounded-full animate-spin" />Ищу…</>
                          : "Найти в заданиях"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Шаг 3: выбор версии */}
        {mode === "task" && taskId && runs.length > 1 && (
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center font-bold">3</span>
              Версия презентации
            </p>
            <div className="flex flex-wrap gap-2">
              {runs.map(r => (
                <button key={r.id} onClick={() => setRunId(r.id)}
                  className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${runId === r.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:border-slate-400 text-slate-700"}`}>
                  Версия {r.version}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Визуалы */}
        {mode === "task" && runId && (
          <div className="space-y-4">
            {loadingVisuals ? (
              <div className="bg-card border border-border rounded-2xl p-10 flex flex-col items-center gap-3 text-slate-500">
                <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
                <p className="text-sm">Загрузка визуалов…</p>
              </div>
            ) : visuals.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center gap-3 text-center">
                <Icon name="Image" size={36} className="text-slate-300" />
                <p className="font-medium text-slate-600">Визуалов нет в этой версии</p>
                <p className="text-sm text-slate-400 max-w-sm">
                  Визуалы создаются при запуске генерации с галочкой <strong>«Генерировать визуалы»</strong>.
                  Она работает для типов «Подготовить презентацию» и «По образцу».
                </p>
                {taskId && projectId && (
                  <div className="flex gap-2 mt-2 flex-wrap justify-center">
                    <Link to={`/cabinet/project/${projectId}/task/${taskId}`}
                      className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-700 transition-colors">
                      Открыть задание и перегенерировать
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">
                    Визуалы — {visuals.length} слайд{visuals.length === 1 ? "" : visuals.length < 5 ? "а" : "ов"}
                  </p>
                  {taskId && (
                    <Link to={`/cabinet/project/${projectId}/task/${taskId}`}
                      className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                      Открыть задание <Icon name="ArrowRight" size={12} />
                    </Link>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  {visuals.map(v => {
                    const st = STATUS_LABEL[v.generation_status] || { label: v.generation_status, cls: "bg-slate-100 text-slate-600" };
                    const url = imgUrl(v);
                    const isEditing = editingIdx === v.slide_index;
                    const isWorking = rerendering === v.slide_index || uploading === v.slide_index || restoring === v.slide_index;

                    return (
                      <div key={v.slide_index} className="bg-card border border-border rounded-2xl overflow-hidden">
                        {/* Картинка */}
                        <div className="relative bg-slate-50 aspect-video flex items-center justify-center group cursor-pointer"
                          onClick={() => url && setLightbox(url)}>
                          {url ? (
                            <>
                              <img src={url} className="w-full h-full object-contain" alt={v.slide_title} />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                <Icon name="ZoomIn" size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-col items-center gap-2 text-slate-400">
                              <Icon name={v.visual_type === "timeline" ? "GitCommitHorizontal" : v.visual_type === "diagram" ? "Share2" : "Image"} size={32} />
                              <p className="text-xs">{VISUAL_TYPE_LABEL[v.visual_type] || v.visual_type}</p>
                            </div>
                          )}
                          {isWorking && (
                            <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                              <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin" />
                            </div>
                          )}
                        </div>

                        {/* Инфо */}
                        <div className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium leading-tight">{v.slide_title || `Слайд ${v.slide_index}`}</p>
                              <p className="text-xs text-slate-400 mt-0.5">Слайд {v.slide_index} · {VISUAL_TYPE_LABEL[v.visual_type] || v.visual_type}</p>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${st.cls}`}>{st.label}</span>
                          </div>

                          {/* Промпт */}
                          {isEditing ? (
                            <div className="space-y-2">
                              <textarea
                                className="w-full text-xs border border-slate-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-slate-300"
                                rows={3}
                                value={editPrompt[v.slide_index] ?? v.source_prompt}
                                onChange={e => setEditPrompt(prev => ({ ...prev, [v.slide_index]: e.target.value }))}
                              />
                              <div className="flex gap-2">
                                <button onClick={() => handleRerender(v.slide_index)} disabled={isWorking}
                                  className="flex-1 text-xs bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors">
                                  {rerendering === v.slide_index ? "Генерирую…" : "↺ Перегенерировать"}
                                </button>
                                <button onClick={() => setEditingIdx(null)}
                                  className="text-xs border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
                                  Отмена
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500 line-clamp-2">{v.source_prompt}</p>
                          )}

                          {/* Кнопки */}
                          {!isEditing && (
                            <div className="flex flex-wrap gap-2 pt-1">
                              <button onClick={() => { setEditingIdx(v.slide_index); setEditPrompt(prev => ({ ...prev, [v.slide_index]: v.source_prompt })); }}
                                disabled={isWorking}
                                className="text-xs border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors flex items-center gap-1">
                                <Icon name="Pencil" size={11} /> Изменить
                              </button>
                              <button onClick={() => handleUploadClick(v.slide_index)} disabled={isWorking}
                                className="text-xs border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors flex items-center gap-1">
                                <Icon name="Upload" size={11} /> {uploading === v.slide_index ? "Загружаю…" : "Загрузить своё"}
                              </button>
                              {v.can_restore_ai && (
                                <button onClick={() => handleRestore(v.slide_index)} disabled={isWorking}
                                  className="text-xs border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors flex items-center gap-1">
                                  <Icon name="RotateCcw" size={11} /> {restoring === v.slide_index ? "…" : "AI-версия"}
                                </button>
                              )}
                            </div>
                          )}

                          {/* Предупреждения */}
                          {v.warnings && v.warnings.length > 0 && (
                            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">⚠ {v.warnings[0]}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Пустое состояние — ничего не выбрано */}
        {mode === "task" && !projectId && !loadingProjects && projects.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-10 flex flex-col items-center gap-3 text-center text-slate-400">
            <Icon name="LayoutTemplate" size={40} />
            <p className="font-medium text-slate-600">Выберите проект выше</p>
            <p className="text-sm max-w-xs">Здесь вы сможете просматривать, менять и перегенерировать визуалы к каждому слайду вашей презентации</p>
          </div>
        )}
      </div>
    </Layout>
  );
}