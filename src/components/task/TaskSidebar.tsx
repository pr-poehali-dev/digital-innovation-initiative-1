import Icon from "@/components/ui/icon";

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
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  standard: { label: "📜 Стандарт", color: "text-purple-700 bg-purple-50" },
  content: { label: "📚 Материал", color: "text-green-700 bg-green-50" },
  methodology: { label: "🧭 Методика", color: "text-cyan-700 bg-cyan-50" },
  template: { label: "🎨 Образец формата", color: "text-blue-700 bg-blue-50" },
  background: { label: "📎 Фон", color: "text-slate-700 bg-slate-100" },
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

interface Props {
  task: Task;
  activeRun: RunResult | null;
  onOpenSettings: () => void;
  onLoadRun: (runId: number) => void;
}

export default function TaskSidebar({ task, activeRun, onOpenSettings, onLoadRun }: Props) {
  return (
    <>
      <div className="border rounded-2xl p-4 bg-card">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h2 className="font-semibold flex-1">{task.title}</h2>
          <button
            onClick={onOpenSettings}
            className="text-xs flex items-center gap-1 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg px-2 py-1 flex-shrink-0"
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
            onClick={onOpenSettings}
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
                onClick={() => onLoadRun(run.id)}
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
    </>
  );
}
