import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { tasksApi, generateApi, exportApi, downloadBase64File, putFileToPresignedUrl } from "@/lib/api";
import { analytics, normalizeErrorCode } from "@/lib/analytics";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import TaskSettingsModal from "@/components/TaskSettingsModal";
import HelpPanel from "@/components/HelpPanel";
import TaskSidebar from "@/components/task/TaskSidebar";
import RunViewer from "@/components/task/RunViewer";
import ExplainPanel from "@/components/task/ExplainPanel";

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

  // Определяем поддержку визуалов по контексту + reason для аналитики
  const VISUAL_TASK_TYPES = ["prepare_presentation", "presentation_by_reference"];
  const hasVisualPlan = (activeRun?.visual_plan?.length ?? 0) > 0;

  const visualsReason = (() => {
    if (!task) return "unsupported_task_type" as const;
    if (VISUAL_TASK_TYPES.includes(task.task_type)) return "presentation_task" as const;
    if (task.task_type === "revise" && hasVisualPlan) return "revise_visual_plan" as const;
    if (task.task_type === "revise" && !activeRun) return "revise_fallback_no_active_run" as const;
    return "unsupported_task_type" as const;
  })();

  const isReviseOfPresentation =
    task?.task_type === "revise" &&
    (hasVisualPlan || !activeRun);
  const supportsVisuals = task ? (VISUAL_TASK_TYPES.includes(task.task_type) || isReviseOfPresentation) : false;

  // Отправляем availability один раз при изменении task/activeRun
  const availabilityTrackedRef = useRef<string>("");
  useEffect(() => {
    if (!task) return;
    const key = `${task.id}-${activeRun?.id ?? "none"}-${hasVisualPlan}`;
    if (availabilityTrackedRef.current === key) return;
    availabilityTrackedRef.current = key;
    analytics.visualsAvailabilityResolved(
      task.id, task.task_type, supportsVisuals, visualsReason,
      !!activeRun, hasVisualPlan,
    );
  }, [task?.id, activeRun?.id, hasVisualPlan]);

  const handleGenerate = async (isRevision = false) => {
    if (!task) return;
    const effectiveVisuals = supportsVisuals ? useVisuals : false;
    const effectiveAiImages = supportsVisuals ? allowAiImages : false;

    analytics.generationSubmitted(
      tId, task.task_type,
      effectiveVisuals, effectiveAiImages,
      supportsVisuals, isRevision,
    );

    setGenerating(true);
    setGenError("");
    try {
      const result = await generateApi.run(
        tId,
        isRevision ? revision : prompt || undefined,
        isRevision && activeRun ? activeRun.id : undefined,
        useWebSearch,
        effectiveVisuals,
        effectiveAiImages,
      );
      analytics.generationResult(tId, task.task_type, "success", effectiveVisuals, effectiveAiImages);
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
      const raw = err instanceof Error ? err.message : String(err);
      const errorCode = normalizeErrorCode(raw);
      console.error("[generate] error:", raw, { taskId: tId, taskType: task.task_type, errorCode });
      analytics.generationResult(tId, task.task_type, "error", effectiveVisuals, effectiveAiImages, errorCode);

      let friendly: string;
      if (raw.includes("timeout") || raw.includes("Execution timeout") || raw.includes("504")) {
        friendly = "Генерация заняла слишком много времени. Попробуйте отключить «Картинки AI» или уменьшить число слайдов.";
      } else if (raw.includes("обязательн") && raw.includes("документ")) {
        friendly = raw;
      } else if (raw.includes("429") || raw.includes("rate") || raw.includes("лимит")) {
        friendly = "Слишком много запросов подряд. Подождите минуту и попробуйте снова.";
      } else if (raw.includes("422") || raw.includes("validation") || raw.includes("Нужен")) {
        friendly = "Не заполнены обязательные поля задания. Откройте настройки и укажите тему.";
      } else if (raw.includes("404") || raw.includes("не найдено")) {
        friendly = "Задание не найдено. Обновите страницу.";
      } else if (raw.includes("403") || raw.includes("доступ")) {
        friendly = "Нет доступа к этому заданию.";
      } else if (raw.includes("502") || raw.includes("503")) {
        friendly = "Сервис временно недоступен. Попробуйте через 1–2 минуты.";
      } else if (raw.includes("500") || raw.includes("GPT") || raw.includes("YandexGPT")) {
        friendly = "Ошибка на стороне сервиса генерации. Попробуйте через минуту.";
      } else {
        friendly = raw || "Неизвестная ошибка генерации.";
      }
      setGenError(friendly);
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

  const handleSelectBlock = async (blockText: string) => {
    if (!activeRun) return;
    setSelectedBlock(blockText);
    setExplanation("");
    setRefineInstruction("");

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
      loadRun(d.new_run_id);
      loadTask();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setRefining(false);
    }
  };

  const closeExplainPanel = () => {
    setSelectedBlock(null);
    setExplanation("");
    setRefineInstruction("");
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
            <TaskSidebar
              task={task}
              activeRun={activeRun}
              onOpenSettings={() => setShowSettings(true)}
              onLoadRun={loadRun}
            />
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
                  {supportsVisuals ? (
                    <>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={useVisuals}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setUseVisuals(val);
                            if (!val) setAllowAiImages(false);
                            analytics.visualsToggle(val, tId, task.task_type, supportsVisuals, visualsReason);
                          }}
                          className="w-4 h-4 rounded accent-slate-800" />
                        <Icon name="LayoutTemplate" size={14} className="text-slate-600" />
                        <span>Генерировать визуалы</span>
                      </label>
                      <label className={`flex items-center gap-2 ${useVisuals ? "cursor-pointer" : "opacity-40 cursor-not-allowed"}`}>
                        <input type="checkbox" checked={allowAiImages && useVisuals}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setAllowAiImages(val);
                            analytics.aiImagesToggle(val, tId, task.task_type, useVisuals);
                          }}
                          disabled={!useVisuals}
                          className="w-4 h-4 rounded accent-slate-800" />
                        <Icon name="Image" size={14} className="text-slate-600" />
                        <span>Картинки AI</span>
                      </label>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400 flex items-center gap-1.5">
                      <Icon name="Info" size={13} />
                      {task.task_type === "revise"
                        ? "Визуалы доступны если дорабатывается презентация"
                        : "Визуалы доступны для «Подготовить презентацию» и «По образцу»"}
                    </span>
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

            <RunViewer
              activeRun={activeRun}
              loadingRun={loadingRun}
              exporting={exporting}
              exportError={exportError}
              generating={generating}
              genError={genError}
              revision={revision}
              selectedBlock={selectedBlock}
              reRenderingVisual={reRenderingVisual}
              editingVisualPrompt={editingVisualPrompt}
              uploadingVisual={uploadingVisual}
              restoringVisual={restoringVisual}
              onCopy={copyToClipboard}
              onExportPptx={handleExportPptx}
              onExportDocx={handleExportDocx}
              onSelectBlock={handleSelectBlock}
              onGenerate={handleGenerate}
              onRevisionChange={setRevision}
              onRenderVisual={handleRenderVisual}
              onVisualUpload={handleVisualUpload}
              onRestoreAi={handleRestoreAi}
              onEditingVisualPromptChange={setEditingVisualPrompt}
              contentRef={contentRef}
            />
          </div>
        </div>
      </div>

      <ExplainPanel
        selectedBlock={selectedBlock}
        explanation={explanation}
        loadingExplain={loadingExplain}
        refineInstruction={refineInstruction}
        refining={refining}
        onClose={closeExplainPanel}
        onRefineInstructionChange={setRefineInstruction}
        onRefine={handleRefineBlock}
      />

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