import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { tasksApi, generateApi, exportApi, downloadBase64File } from "@/lib/api";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";

interface TaskDoc {
  id: number;
  name: string;
  file_type: string;
  role: string;
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
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  standard: { label: "Стандарт", color: "text-purple-600 bg-purple-50 dark:bg-purple-950/30" },
  reference_presentation: { label: "Образец", color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30" },
  content_source: { label: "Материал", color: "text-green-600 bg-green-50 dark:bg-green-950/30" },
  draft: { label: "Черновик", color: "text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30" },
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
  const contentRef = useRef<HTMLDivElement>(null);

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
      );
      setActiveRun({ ...result, revisions: [] });
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
              <h2 className="font-semibold mb-1">{task.title}</h2>
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
                    <div key={doc.id} className="flex items-center gap-2">
                      <Icon name="FileText" size={14} className="text-muted-foreground flex-shrink-0" />
                      <span className="text-xs flex-1 truncate">{doc.name}</span>
                      {ROLE_LABELS[doc.role] && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${ROLE_LABELS[doc.role].color}`}>
                          {ROLE_LABELS[doc.role].label}
                        </span>
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
                      {exporting ? "Создаю..." : "Скачать PPTX"}
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
                    <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">{activeRun.content}</pre>
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
    </Layout>
  );
}