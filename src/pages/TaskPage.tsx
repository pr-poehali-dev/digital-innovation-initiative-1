import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { tasksApi, generateApi, exportApi, downloadBase64File, putFileToPresignedUrl } from "@/lib/api";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import TaskSettingsModal from "@/components/TaskSettingsModal";
import HelpPanel from "@/components/HelpPanel";

interface TaskDoc {
  id: number;
  name: string;
  file_type: string;
  role: string;
  usage_mode?: string;
  priority?: string;
  must_use?: boolean;
  instruction?: string;
}

interface InfluenceMap {
  structure_from?: string[];
  content_from?: string[];
  methodology_from?: string[];
  format_from?: string[];
  background_from?: string[];
  ignored?: string[];
  ai_additions?: string[];
  conflicts_resolved?: string[];
}

interface Run {
  id: number;
  version: number;
  summary?: string;
  status: string;
  created_at: string;
}

interface Task {
  id: number;
  project_id: number;
  title: string;
  task_type: string;
  topic?: string;
  goal?: string;
  audience?: string;
  style?: string;
  requested_slide_count?: number;
  additional_instructions?: string;
  style_preset?: string;
  status: string;
  created_by: string;
  documents: TaskDoc[];
  runs: Run[];
}

interface VisualPlanItem {
  slide_index: number;
  slide_title: string;
  visual_type: string;
  render_mode: string;
  source_prompt: string;
  source_doc_name?: string;
  source_type?: string;
  generation_status: string;
  asset_url?: string;
  warnings?: string[];
}

interface RunResult {
  id: number;
  version: number;
  content?: string;
  status: string;
  created_by: string;
  revisions: { instruction: string; created_at: string }[];
  influence_map?: InfluenceMap | null;
  visual_plan?: VisualPlanItem[];
  visual_warnings?: string[];
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  // P0: новая модель
  standard: { label: "📜 Стандарт", color: "text-purple-700 bg-purple-50" },
  content: { label: "📚 Материал", color: "text-green-700 bg-green-50" },
  methodology: { label: "🧭 Методика", color: "text-cyan-700 bg-cyan-50" },
  template: { label: "🎨 Образец формата", color: "text-blue-700 bg-blue-50" },
  background: { label: "📎 Фон", color: "text-slate-700 bg-slate-100" },
  // Legacy совместимость
  reference_presentation: { label: "🎨 Образец", color: "text-blue-700 bg-blue-50" },
  content_source: { label: "📚 Материал", color: "text-green-700 bg-green-50" },
  draft: { label: "Черновик", color: "text-yellow-700 bg-yellow-50" },
};

const TASK_TYPE_LABELS: Record<string, string> = {
  answer_question: "Ответить на вопрос",
  analyze: "Анализ материалов",
  structure: "Структура презентации",
  write_text: "Написать текст работы",
  prepare_presentation: "Подготовить презентацию",
  presentation_by_reference: "Презентация по образцу",
  revise: "Доработать результат",
};

export default function TaskPage() {
  const { id, taskId } = useParams<{ id: string; taskId: string }>();
  const projectId = Number(id);
  const tId = Number(taskId);

  const [task, setTask] = useState<Task | null>(null);
  const [activeRun, setActiveRun] = useState<RunResult | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [loadingRun, setLoadingRun] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [revision, setRevision] = useState("");
  const [prompt, setPrompt] = useState("");
  const [genError, setGenError] = useState("");
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [useVisuals, setUseVisuals] = useState(true);
  const [allowAiImages, setAllowAiImages] = useState(true);
  const [reRenderingVisual, setReRenderingVisual] = useState<number | null>(null);
  const [editingVisualPrompt, setEditingVisualPrompt] = useState<Record<number, string>>({});
  const [uploadingVisual, setUploadingVisual] = useState<number | null>(null);
  const [restoringVisual, setRestoringVisual] = useState<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Explainable AI: панель рассуждения и правки фрагмента
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string>("");
  const [loadingExplain, setLoadingExplain] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [refining, setRefining] = useState(false);

  const [showSettings, setShowSettings] = useState(false);

  const loadTask = () => {
    tasksApi.get(tId).then((d) => {
      setTask(d);
      if (d.runs.length > 0 && !activeRun) {
        loadRun(d.runs[0].id);
      }
    });
  };

  const loadRun = (runId: number) => {
    setLoadingRun(true);
    generateApi.getRun(runId).then((d) => {
      setActiveRun(d);
    }).finally(() => setLoadingRun(false));
  };

  useEffect(() => { loadTask(); }, [tId]);

  const handleGenerate = async (isRevision = false) => {
    setGenerating(true);
    setGenError("");
    try {
      const result = await generateApi.run(
        tId,
        isRevision ? revision : prompt || undefined,
        isRevision && activeRun ? activeRun.id : undefined,
        useWebSearch,
        useVisuals,
        allowAiImages,
      );
      // Бэкенд возвращает {run_id, version, content} — нормализуем в RunResult с полем `id`
      setActiveRun({
        id: result.run_id || result.id,
        version: result.version,
        content: result.content,
        status: "done",
        created_by: "",
        revisions: [],
      });
      setRevision("");
      setPrompt("");
      loadTask();
      setTimeout(() => contentRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err: unknown) {
      setGenError(err instanceof Error ? err.message : "Ошибка генерации");
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = () => {
    if (activeRun?.content) {
      navigator.clipboard.writeText(activeRun.content);
    }
  };

  const handleRenderVisual = async (slideIndex: number) => {
    if (!activeRun) return;
    setReRenderingVisual(slideIndex);
    try {
      const newPrompt = editingVisualPrompt[slideIndex];
      const result = await generateApi.renderVisual(activeRun.id, slideIndex, newPrompt);
      if (result?.visual) {
        setActiveRun((prev) => {
          if (!prev) return prev;
          const updatedPlan = (prev.visual_plan || []).map((vp) =>
            vp.slide_index === slideIndex ? { ...vp, ...result.visual } : vp
          );
          return { ...prev, visual_plan: updatedPlan };
        });
        setEditingVisualPrompt((prev) => { const n = { ...prev }; delete n[slideIndex]; return n; });
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setReRenderingVisual(null);
    }
  };

  const handleVisualUpload = async (slideIndex: number, file: File) => {
    if (!activeRun) return;
    setUploadingVisual(slideIndex);
    try {
      const mime = file.type || "image/png";
      const { upload_url, s3_key } = await generateApi.getVisualUploadUrl(
        activeRun.id, slideIndex, file.name, mime,
      );
      await putFileToPresignedUrl(upload_url, file);
      const result = await generateApi.confirmVisualOverride(
        activeRun.id, slideIndex, s3_key, mime, file.name,
      );
      if (result?.visual) {
        setActiveRun((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            visual_plan: (prev.visual_plan || []).map((vp) =>
              vp.slide_index === slideIndex ? { ...vp, ...result.visual } : vp,
            ),
          };
        });
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setUploadingVisual(null);
    }
  };

  const handleRestoreAi = async (slideIndex: number) => {
    if (!activeRun) return;
    setRestoringVisual(slideIndex);
    try {
      const result = await generateApi.restoreAiVisual(activeRun.id, slideIndex);
      if (result?.visual) {
        setActiveRun((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            visual_plan: (prev.visual_plan || []).map((vp) =>
              vp.slide_index === slideIndex ? { ...vp, ...result.visual } : vp,
            ),
          };
        });
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setRestoringVisual(null);
    }
  };

  const handleExportPptx = async () => {
    if (!activeRun) return;
    setExporting(true);
    setExportError("");
    try {
      const data = await exportApi.exportPptx(activeRun.id);
      downloadBase64File(data.file_data, data.filename, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : "Ошибка экспорта");
    } finally {
      setExporting(false);
    }
  };

  const handleExportDocx = async () => {
    if (!activeRun) return;
    setExporting(true);
    setExportError("");
    try {
      const data = await exportApi.exportDocx(activeRun.id);
      downloadBase64File(data.file_data, data.filename, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : "Ошибка экспорта");
    } finally {
      setExporting(false);
    }
  };

  // Кликаем на блок → получаем рассуждение AI откуда и почему он его написал
  const handleSelectBlock = async (blockText: string) => {
    if (!activeRun) return;
    setSelectedBlock(blockText);
    setExplanation("");
    setRefineInstruction("");

    // Если у activeRun нет id (только что после генерации) — перезагружаем версию
    let runId = activeRun.id;
    if (!runId && task?.runs && task.runs.length > 0) {
      runId = task.runs[0].id;
    }
    if (!runId) {
      setExplanation("Ошибка: не удалось определить версию. Обновите страницу.");
      return;
    }

    setLoadingExplain(true);
    try {
      const d = await generateApi.explainBlock(runId, blockText);
      setExplanation(d.explanation);
    } catch (err: unknown) {
      setExplanation("Ошибка: " + (err instanceof Error ? err.message : "не удалось получить обоснование"));
    } finally {
      setLoadingExplain(false);
    }
  };

  // Просим AI переработать выбранный фрагмент с учётом наших пожеланий
  const handleRefineBlock = async () => {
    if (!activeRun || !selectedBlock || !refineInstruction.trim()) return;
    let runId = activeRun.id;
    if (!runId && task?.runs && task.runs.length > 0) {
      runId = task.runs[0].id;
    }
    if (!runId) {
      alert("Не удалось определить версию. Обновите страницу.");
      return;
    }
    setRefining(true);
    try {
      const d = await generateApi.refineBlock(runId, selectedBlock, refineInstruction.trim());
      setSelectedBlock(null);
      setExplanation("");
      setRefineInstruction("");
      // Загружаем новую версию
      loadRun(d.new_run_id);
      loadTask();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setRefining(false);
    }
  };

  // Разбиваем контент на смысловые блоки для кликабельности
  const splitContentIntoBlocks = (content: string): string[] => {
    if (!content) return [];
    // Делим по двойному переносу строки или по слайдам ### Слайд N:
    const blocks: string[] = [];
    const parts = content.split(/\n\n+/);
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed) blocks.push(trimmed);
    }
    return blocks;
  };

  if (!task) {
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
          <Link to="/cabinet" className="hover:text-foreground">Проекты</Link>
          <Icon name="ChevronRight" size={14} />
          <Link to={`/cabinet/project/${projectId}`} className="hover:text-foreground">Проект</Link>
          <Icon name="ChevronRight" size={14} />
          <span className="text-foreground font-medium">{task.title}</span>
        </div>

        <HelpPanel
          title="Как работать с заданием"
          summary="Здесь AI создаёт презентацию по вашим материалам. Нажмите «Запустить AI» — и получите готовый результат."
          steps={[
            { num: 1, title: "Проверьте документы", description: "Убедитесь, что нужные материалы прикреплены к заданию. Можно добавить в разделе проекта." },
            { num: 2, title: "Настройте параметры", description: "Нажмите ⚙ чтобы задать тему, аудиторию, число слайдов или дополнительные инструкции." },
            { num: 3, title: "Запустите генерацию", description: "Нажмите «Запустить AI». Это займёт 20–60 секунд." },
            { num: 4, title: "Просмотрите результат", description: "Читайте текст прямо на странице. Можно перегенерировать или попросить ревизию." },
            { num: 5, title: "Скачайте PPTX", description: "Нажмите «⬇ PPTX» — файл откроется в PowerPoint или Google Slides." },
          ]}
          sections={[
            {
              title: "Что делают чекбоксы перед генерацией",
              icon: "ToggleLeft",
              subsections: [
                { title: "🌐 Поиск в интернете", content: "AI дополнит ответ актуальными данными из сети. Включайте для тем, где важна свежая информация." },
                { title: "🎨 Генерировать визуалы", content: "AI вставит схемы и диаграммы на слайды. Если в тексте есть маркеры [[process:...]] или [КАРТИНКА:...]  — они сработают." },
                { title: "🖼 Картинки AI", content: "Дополнительно к схемам — AI нарисует картинки через YandexArt. Занимает дольше." },
              ],
            },
            {
              title: "Блок «Визуалы» в результате",
              icon: "LayoutTemplate",
              content: "Появляется после генерации, если были visual-промпты. Для каждого визуала можно: перегенерировать, изменить описание или загрузить своё изображение вместо AI-варианта.",
            },
            {
              title: "Как добавить visual-промпт в задание",
              icon: "Type",
              subsections: [
                { title: "Схема процесса", content: "Напишите в «Дополнительных инструкциях»: [[process: шаг1 → шаг2 → шаг3]]" },
                { title: "Таймлайн", content: "[[timeline: январь — старт, февраль — разработка, март — запуск]]" },
                { title: "Картинка AI", content: "В документе или инструкциях: [КАРТИНКА: описание изображения на русском]" },
              ],
            },
            {
              title: "Что делать, если результат не понравился",
              icon: "RefreshCw",
              subsections: [
                { title: "Запустить ревизию", content: "Напишите в поле «Инструкция для ревизии» что именно изменить — AI переработает только нужные части." },
                { title: "Перегенерировать", content: "Нажмите «Запустить AI» повторно — будет создана новая версия. Старая сохраняется в истории." },
                { title: "Изменить настройки", content: "Откройте ⚙ и уточните тему, аудиторию или инструкции — это улучшит следующий результат." },
              ],
            },
          ]}
          tips={[
            { kind: "tip", text: "Чем точнее описана тема и аудитория — тем лучше результат." },
            { kind: "warning", text: "Если документы не загружены — AI будет опираться только на общие знания, без ваших материалов." },
            { kind: "example", text: "Пример хорошей инструкции: «Сделать 8 слайдов для защиты диплома, аудитория — научный совет, стиль — академический»." },
          ]}
        />

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <div className="border rounded-2xl p-4 bg-card">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h2 className="font-semibold flex-1">{task.title}</h2>
                <button
                  onClick={() => setShowSettings(true)}
                  className="text-xs flex items-center gap-1 text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-400 rounded-md px-2 py-1 flex-shrink-0"
                  title="Изменить настройки задания"
                >
                  <Icon name="Settings" size={12} />
                  Изменить
                </button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{TASK_TYPE_LABELS[task.task_type]}</p>
              {task.topic && (
                <div className="mb-2">
                  <p className="text-xs text-muted-foreground">Тема</p>
                  <p className="text-sm">{task.topic}</p>
                </div>
              )}
              {task.goal && (
                <div className="mb-2">
                  <p className="text-xs text-muted-foreground">Цель</p>
                  <p className="text-sm">{task.goal}</p>
                </div>
              )}
              {task.audience && (
                <div className="mb-2">
                  <p className="text-xs text-muted-foreground">Аудитория</p>
                  <p className="text-sm">{task.audience}</p>
                </div>
              )}
              {task.style && (
                <div className="mb-2">
                  <p className="text-xs text-muted-foreground">Стиль</p>
                  <p className="text-sm">{task.style}</p>
                </div>
              )}
              {task.requested_slide_count && (
                <div className="mb-2">
                  <p className="text-xs text-muted-foreground">Слайдов</p>
                  <p className="text-sm">{task.requested_slide_count}</p>
                </div>
              )}
            </div>

            <div className="border rounded-2xl p-4 bg-card">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium">Документы задания</p>
                <button
                  onClick={() => setShowSettings(true)}
                  className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800"
                >
                  <Icon name="Settings" size={12} />
                  Настроить
                </button>
              </div>
              {task.documents.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-2">Нет прикреплённых документов</p>
              ) : (
                <div className="space-y-2">
                  {task.documents.map((doc) => (
                    <div key={doc.id} className="border border-slate-100 rounded-lg p-2 space-y-1.5">
                      <div className="flex items-start gap-2">
                        <Icon name="FileText" size={14} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{doc.name}</p>
                          <div className="flex flex-wrap items-center gap-1 mt-1">
                            {ROLE_LABELS[doc.role] && (
                              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${ROLE_LABELS[doc.role].color}`}>
                                {ROLE_LABELS[doc.role].label}
                              </span>
                            )}
                            {doc.must_use && (
                              <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">🔴 обязательный</span>
                            )}
                            {doc.priority && doc.priority !== "medium" && (
                              <span className="text-xs text-slate-500">
                                {doc.priority === "high" ? "↑ высокий приоритет" : "↓ низкий приоритет"}
                              </span>
                            )}
                            {doc.usage_mode && (
                              <span className="text-xs text-slate-400 italic">{doc.usage_mode.replace(/_/g, " ")}</span>
                            )}
                          </div>
                          {doc.instruction && (
                            <p className="text-xs text-slate-500 mt-1 italic">📝 {doc.instruction}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {task.runs.length > 0 && (
              <div className="border rounded-2xl p-4 bg-card">
                <p className="text-sm font-medium mb-3">Версии</p>
                <div className="space-y-1.5">
                  {task.runs.map((run) => (
                    <button
                      key={run.id}
                      onClick={() => loadRun(run.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        activeRun?.id === run.id
                          ? "bg-orange-50 dark:bg-orange-950/30 text-orange-600"
                          : "hover:bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span className="font-medium">Версия {run.version}</span>
                      <span className="text-xs ml-2">{new Date(run.created_at).toLocaleDateString("ru-RU")}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-2 space-y-4">
            {task.runs.length === 0 && !activeRun && (
              <div className="border rounded-2xl p-8 bg-card text-center">
                <div className="w-14 h-14 rounded-2xl bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center mx-auto mb-4">
                  <Icon name="Sparkles" size={24} className="text-orange-500" />
                </div>
                <h3 className="font-semibold mb-2">Готово к запуску</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  {task.documents.length === 0
                    ? "Задание настроено. Можно запустить генерацию (без привязанных документов AI будет работать только с темой)."
                    : `Задание настроено с ${task.documents.length} документами. Нажмите запустить.`
                  }
                </p>
                <div className="mb-4">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Дополнительное указание AI (необязательно)..."
                    rows={2}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mb-4 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={useWebSearch}
                      onChange={(e) => setUseWebSearch(e.target.checked)}
                      className="w-4 h-4 rounded accent-slate-800" />
                    <Icon name="Globe" size={14} className="text-slate-600" />
                    <span>Интернет</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={useVisuals}
                      onChange={(e) => setUseVisuals(e.target.checked)}
                      className="w-4 h-4 rounded accent-slate-800" />
                    <Icon name="LayoutTemplate" size={14} className="text-slate-600" />
                    <span>Генерировать визуалы</span>
                  </label>
                  {useVisuals && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={allowAiImages}
                        onChange={(e) => setAllowAiImages(e.target.checked)}
                        className="w-4 h-4 rounded accent-slate-800" />
                      <Icon name="Image" size={14} className="text-slate-600" />
                      <span>Картинки AI</span>
                    </label>
                  )}
                </div>
                {genError && <p className="text-red-500 text-sm mb-3">{genError}</p>}
                <button
                  onClick={() => handleGenerate(false)}
                  disabled={generating}
                  className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 mx-auto"
                >
                  <Icon name="Sparkles" size={16} />
                  {generating ? "Генерирую..." : "Запустить AI"}
                </button>
              </div>
            )}

            {(activeRun || loadingRun) && (
              <div ref={contentRef} className="border rounded-2xl bg-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b">
                  <div className="flex items-center gap-2">
                    <Icon name="Sparkles" size={16} className="text-orange-500" />
                    <span className="text-sm font-medium">
                      {loadingRun ? "Загрузка..." : `Версия ${activeRun?.version}`}
                    </span>
                    {activeRun?.status === "done" && (
                      <span className="text-xs bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400 px-2 py-0.5 rounded-full">Готово</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={copyToClipboard}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Icon name="Copy" size={13} />
                      Скопировать
                    </button>
                    <button
                      onClick={handleExportPptx}
                      disabled={exporting || loadingRun}
                      className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-white px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Icon name="Download" size={13} />
                      PPTX
                    </button>
                    <button
                      onClick={handleExportDocx}
                      disabled={exporting || loadingRun}
                      className="flex items-center gap-1.5 text-xs bg-blue-700 hover:bg-blue-800 text-white px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Icon name="FileText" size={13} />
                      DOCX
                    </button>
                  </div>
                </div>

                {loadingRun ? (
                  <div className="p-6 space-y-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className={`h-4 bg-muted animate-pulse rounded ${i === 4 ? "w-2/3" : ""}`} />
                    ))}
                  </div>
                ) : activeRun?.content ? (
                  <div className="p-5">
                    {/* P0: Карта влияния документов */}
                    {activeRun.influence_map && (
                      <div className="mb-4 border border-slate-200 rounded-xl bg-slate-50 p-4">
                        <p className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                          <Icon name="Map" size={14} />
                          Карта влияния документов
                        </p>
                        <div className="space-y-1.5 text-xs">
                          {activeRun.influence_map.structure_from && activeRun.influence_map.structure_from.length > 0 && (
                            <div className="flex gap-2">
                              <span className="font-medium text-purple-700 min-w-[100px]">📜 Структура:</span>
                              <span className="text-slate-700">{activeRun.influence_map.structure_from.join(", ")}</span>
                            </div>
                          )}
                          {activeRun.influence_map.content_from && activeRun.influence_map.content_from.length > 0 && (
                            <div className="flex gap-2">
                              <span className="font-medium text-green-700 min-w-[100px]">📚 Контент:</span>
                              <span className="text-slate-700">{activeRun.influence_map.content_from.join(", ")}</span>
                            </div>
                          )}
                          {activeRun.influence_map.format_from && activeRun.influence_map.format_from.length > 0 && (
                            <div className="flex gap-2">
                              <span className="font-medium text-blue-700 min-w-[100px]">🎨 Формат:</span>
                              <span className="text-slate-700">{activeRun.influence_map.format_from.join(", ")}</span>
                            </div>
                          )}
                          {activeRun.influence_map.methodology_from && activeRun.influence_map.methodology_from.length > 0 && (
                            <div className="flex gap-2">
                              <span className="font-medium text-cyan-700 min-w-[100px]">🧭 Методика:</span>
                              <span className="text-slate-700">{activeRun.influence_map.methodology_from.join(", ")}</span>
                            </div>
                          )}
                          {activeRun.influence_map.ai_additions && activeRun.influence_map.ai_additions.length > 0 && (
                            <div className="flex gap-2">
                              <span className="font-medium text-slate-600 min-w-[100px]">🤖 От AI:</span>
                              <span className="text-slate-700">{activeRun.influence_map.ai_additions.join("; ")}</span>
                            </div>
                          )}
                          {activeRun.influence_map.ignored && activeRun.influence_map.ignored.length > 0 && (
                            <div className="flex gap-2">
                              <span className="font-medium text-amber-700 min-w-[100px]">⚠️ Пропущено:</span>
                              <span className="text-slate-700">{activeRun.influence_map.ignored.join(", ")}</span>
                            </div>
                          )}
                          {activeRun.influence_map.conflicts_resolved && activeRun.influence_map.conflicts_resolved.length > 0 && (
                            <div className="flex gap-2">
                              <span className="font-medium text-red-700 min-w-[100px]">⚖️ Конфликты:</span>
                              <span className="text-slate-700">{activeRun.influence_map.conflicts_resolved.join("; ")}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-slate-500 mb-3 flex items-center gap-1.5">
                      <Icon name="MousePointerClick" size={12} />
                      Кликни на любой блок — AI объяснит откуда взято и даст переписать
                    </p>
                    <div className="space-y-2.5">
                      {splitContentIntoBlocks(activeRun.content).map((block, i) => (
                        <div
                          key={i}
                          onClick={() => handleSelectBlock(block)}
                          className={`whitespace-pre-wrap text-sm leading-relaxed font-sans cursor-pointer p-2.5 rounded-lg border transition-colors ${
                            selectedBlock === block
                              ? "border-slate-800 bg-slate-50"
                              : "border-transparent hover:border-slate-200 hover:bg-slate-50/50"
                          }`}
                        >
                          {block}
                        </div>
                      ))}
                    </div>

                    {/* Блок ВИЗУАЛЫ */}
                    {activeRun.visual_plan && activeRun.visual_plan.length > 0 && (
                      <div className="mt-6 border border-slate-200 rounded-xl overflow-hidden">
                        <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-2">
                          <Icon name="LayoutTemplate" size={15} className="text-slate-600" />
                          <span className="text-sm font-semibold text-slate-800">
                            Визуалы ({activeRun.visual_plan.length})
                          </span>
                          <span className="text-xs text-slate-500 ml-1">— вставятся в PPTX при экспорте</span>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {activeRun.visual_plan.map((vp) => {
                            const isUserOverride = vp.generation_status === "user_override" ||
                              (vp as Record<string,unknown>).active_asset_kind === "user_uploaded";
                            const canRestoreAi = !!(vp as Record<string,unknown>).can_restore_ai;

                            const statusColor: Record<string, string> = {
                              done: "bg-green-100 text-green-700",
                              pending_render: "bg-blue-100 text-blue-700",
                              failed: "bg-red-100 text-red-700",
                              pending: "bg-slate-100 text-slate-600",
                              rendered: "bg-green-100 text-green-700",
                              user_override: "bg-violet-100 text-violet-700",
                              image_pending: "bg-amber-100 text-amber-700",
                            };
                            const statusLabel: Record<string, string> = {
                              done: "✅ Готово",
                              pending_render: "⚙️ При экспорте",
                              rendered: "✅ Отрисован",
                              failed: "❌ Ошибка",
                              pending: "⏳ Ожидает",
                              user_override: "👤 Заменено пользователем",
                              image_pending: "🕐 Картинка не готова",
                            };
                            const typeIcon: Record<string, string> = {
                              image: "🖼", diagram: "📊", timeline: "📅",
                              process: "🔄", comparison: "⚖️", matrix: "🔲",
                              orgchart: "🏢", cycle: "♻️",
                            };
                            const sourceLabel: Record<string, string> = {
                              task_instruction: "Инструкция задания",
                              doc_instruction: "Инструкция к документу",
                              pptx_text: "Текст PPTX",
                              pptx_notes: "Notes PPTX",
                              docx: "DOCX",
                              pdf: "PDF",
                              text: "Документ",
                            };
                            const layoutLabel: Record<string, string> = {
                              title_text_left_visual_right: "Текст слева / Визуал справа",
                              title_text_top_timeline_bottom: "Текст сверху / Таймлайн снизу",
                            };
                            const isEditing = vp.slide_index in editingVisualPrompt;
                            const activeUrl = (vp as Record<string,unknown>).user_override_url as string
                              || (vp as Record<string,unknown>).active_asset_url as string
                              || vp.asset_url;

                            return (
                              <div key={vp.slide_index} className={`px-4 py-3 space-y-2 ${isUserOverride ? "bg-violet-50/40" : ""}`}>
                                <div className="flex items-start gap-2 flex-wrap">
                                  <span className="text-base">{typeIcon[vp.visual_type] || "🎨"}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                      <span className="text-xs font-semibold text-slate-700">
                                        Слайд {vp.slide_index}
                                      </span>
                                      <span className="text-xs text-slate-500 truncate max-w-[180px]">
                                        {vp.slide_title}
                                      </span>
                                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[vp.generation_status] || "bg-slate-100 text-slate-600"}`}>
                                        {statusLabel[vp.generation_status] || vp.generation_status}
                                      </span>
                                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full capitalize">
                                        {vp.visual_type}
                                      </span>
                                    </div>
                                    {(vp as Record<string,unknown>).layout_mode && (
                                      <p className="text-xs text-slate-400 mb-0.5">
                                        📐 {layoutLabel[(vp as Record<string,unknown>).layout_mode as string] || (vp as Record<string,unknown>).layout_mode as string}
                                      </p>
                                    )}
                                    <p className="text-xs text-slate-500 mb-0.5">
                                      📌 {sourceLabel[vp.source_type || ""] || vp.source_type}
                                      {vp.source_doc_name ? ` · ${vp.source_doc_name}` : ""}
                                    </p>
                                    {!isEditing ? (
                                      <p className="text-xs text-slate-700 italic">«{vp.source_prompt}»</p>
                                    ) : (
                                      <textarea
                                        value={editingVisualPrompt[vp.slide_index]}
                                        onChange={(e) => setEditingVisualPrompt((p) => ({ ...p, [vp.slide_index]: e.target.value }))}
                                        rows={2}
                                        className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs bg-white resize-none mt-1"
                                      />
                                    )}
                                    {vp.warnings && vp.warnings.length > 0 && (
                                      <p className="text-xs text-red-500 mt-1">⚠️ {vp.warnings[0]}</p>
                                    )}
                                    {activeUrl && (
                                      <a href={activeUrl} target="_blank" rel="noopener noreferrer"
                                        className="text-xs text-blue-600 hover:text-blue-800 underline mt-1 inline-block">
                                        {isUserOverride ? "Открыть мой файл ↗" : "Открыть ↗"}
                                      </a>
                                    )}
                                  </div>

                                  {/* Кнопки действий */}
                                  <div className="flex flex-col gap-1 flex-shrink-0">
                                    {/* Изменить промпт */}
                                    {!isEditing ? (
                                      <button
                                        onClick={() => setEditingVisualPrompt((p) => ({ ...p, [vp.slide_index]: vp.source_prompt }))}
                                        className="text-xs border border-slate-200 hover:border-slate-400 text-slate-600 px-2 py-1 rounded-md"
                                      >
                                        Изменить
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => setEditingVisualPrompt((p) => { const n = { ...p }; delete n[vp.slide_index]; return n; })}
                                        className="text-xs border border-slate-200 text-slate-500 px-2 py-1 rounded-md"
                                      >
                                        Отмена
                                      </button>
                                    )}

                                    {/* Перегенерировать (только если не user override) */}
                                    {!isUserOverride && (
                                      <button
                                        onClick={() => handleRenderVisual(vp.slide_index)}
                                        disabled={reRenderingVisual === vp.slide_index}
                                        className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-2 py-1 rounded-md disabled:opacity-50"
                                      >
                                        {reRenderingVisual === vp.slide_index ? "..." : "↺ Перегенерировать"}
                                      </button>
                                    )}

                                    {/* Загрузить своё */}
                                    <label className={`text-xs border px-2 py-1 rounded-md text-center cursor-pointer transition-colors
                                      ${uploadingVisual === vp.slide_index
                                        ? "border-slate-200 text-slate-400 pointer-events-none"
                                        : "border-violet-300 text-violet-700 hover:bg-violet-50"}`}>
                                      {uploadingVisual === vp.slide_index ? "Загружаю..." : "⬆ Загрузить своё"}
                                      <input
                                        type="file"
                                        accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                                        className="hidden"
                                        disabled={uploadingVisual === vp.slide_index}
                                        onChange={(e) => {
                                          const f = e.target.files?.[0];
                                          if (f) handleVisualUpload(vp.slide_index, f);
                                          e.target.value = "";
                                        }}
                                      />
                                    </label>

                                    {/* Вернуть AI */}
                                    {isUserOverride && canRestoreAi && (
                                      <button
                                        onClick={() => handleRestoreAi(vp.slide_index)}
                                        disabled={restoringVisual === vp.slide_index}
                                        className="text-xs border border-slate-200 text-slate-500 hover:text-slate-800 px-2 py-1 rounded-md disabled:opacity-50"
                                      >
                                        {restoringVisual === vp.slide_index ? "..." : "↩ AI-версия"}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {activeRun.visual_warnings && activeRun.visual_warnings.length > 0 && (
                          <div className="bg-amber-50 border-t border-amber-200 px-4 py-2">
                            <p className="text-xs text-amber-700 font-medium mb-1">⚠️ Предупреждения визуалов:</p>
                            {activeRun.visual_warnings.map((w, i) => (
                              <p key={i} className="text-xs text-amber-600">• {w}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {exportError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                {exportError}
              </div>
            )}

            {activeRun && !loadingRun && (
              <div className="border rounded-2xl p-4 bg-card">
                <p className="text-sm font-semibold mb-3">Доработать результат</p>
                <p className="text-xs text-muted-foreground mb-3">
                  Напишите что изменить — AI создаст новую версию
                </p>
                <textarea
                  value={revision}
                  onChange={(e) => setRevision(e.target.value)}
                  placeholder="Например: сократи до 8 слайдов, усили деловой стиль, добавь акцент на риски..."
                  rows={3}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none mb-3"
                />
                {genError && <p className="text-red-500 text-sm mb-3">{genError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleGenerate(false)}
                    disabled={generating}
                    className="flex items-center gap-2 border rounded-lg px-4 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    <Icon name="RotateCcw" size={14} />
                    Повторить
                  </button>
                  <button
                    onClick={() => handleGenerate(true)}
                    disabled={generating || !revision.trim()}
                    className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    <Icon name="Sparkles" size={14} />
                    {generating ? "Генерирую..." : "Доработать"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Боковая панель «Рассуждение AI» — открывается при клике на блок */}
      {selectedBlock && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[420px] bg-white border-l border-slate-200 shadow-2xl z-40 flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon name="Lightbulb" size={18} className="text-amber-500" />
              <h3 className="font-semibold text-slate-800">Рассуждение AI</h3>
            </div>
            <button
              onClick={() => { setSelectedBlock(null); setExplanation(""); setRefineInstruction(""); }}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
            >
              <Icon name="X" size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Выбранный фрагмент</p>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700 max-h-32 overflow-y-auto whitespace-pre-wrap">
                {selectedBlock}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Откуда и почему</p>
              {loadingExplain ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-3 bg-slate-100 rounded animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{explanation}</div>
              )}
            </div>

            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Точечная правка</p>
              <p className="text-xs text-slate-500 mb-2">AI переработает ТОЛЬКО этот фрагмент, остальная работа не изменится</p>
              <textarea
                value={refineInstruction}
                onChange={(e) => setRefineInstruction(e.target.value)}
                placeholder="Например: сделай конкретнее с примерами из банковской практики"
                rows={3}
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none"
              />
            </div>
          </div>

          <div className="px-5 py-4 border-t border-slate-200 flex gap-2">
            <button
              onClick={() => { setSelectedBlock(null); setExplanation(""); setRefineInstruction(""); }}
              className="flex-1 border border-slate-300 rounded-lg py-2 text-sm font-medium hover:bg-slate-50"
            >
              Закрыть
            </button>
            <button
              onClick={handleRefineBlock}
              disabled={refining || !refineInstruction.trim()}
              className="flex-[2] flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
            >
              <Icon name="Sparkles" size={14} />
              {refining ? "Переписываю..." : "Переписать фрагмент"}
            </button>
          </div>
        </div>
      )}

      {/* Модалка настроек задания */}
      {showSettings && task && (
        <TaskSettingsModal
          task={task}
          onClose={() => setShowSettings(false)}
          onSaved={() => { loadTask(); }}
        />
      )}
    </Layout>
  );
}