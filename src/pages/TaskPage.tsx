import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { tasksApi, generateApi, exportApi, downloadBase64File } from "@/lib/api";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import TaskSettingsModal from "@/components/TaskSettingsModal";

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

interface RunResult {
  id: number;
  version: number;
  content?: string;
  status: string;
  created_by: string;
  revisions: { instruction: string; created_at: string }[];
  influence_map?: InfluenceMap | null;
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

            {task.documents.length > 0 && (
              <div className="border rounded-2xl p-4 bg-card">
                <p className="text-sm font-medium mb-3">Документы задания</p>
                <div className="space-y-2">
                  {task.documents.map((doc) => (
                    <div key={doc.id} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Icon name="FileText" size={14} className="text-muted-foreground flex-shrink-0" />
                        <span className="text-xs flex-1 truncate">{doc.name}</span>
                        {doc.must_use && (
                          <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full" title="Обязательный документ">
                            🔴
                          </span>
                        )}
                        {ROLE_LABELS[doc.role] && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${ROLE_LABELS[doc.role].color}`}>
                            {ROLE_LABELS[doc.role].label}
                          </span>
                        )}
                      </div>
                      {doc.instruction && (
                        <p className="text-xs text-slate-500 pl-6 italic">📝 {doc.instruction}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                <label className="flex items-center gap-2 justify-center mb-4 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={useWebSearch}
                    onChange={(e) => setUseWebSearch(e.target.checked)}
                    className="w-4 h-4 rounded accent-slate-800"
                  />
                  <Icon name="Globe" size={14} className="text-slate-600" />
                  <span>Дополнить материалами из интернета</span>
                </label>
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