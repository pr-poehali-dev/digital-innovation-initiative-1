import Icon from "@/components/ui/icon";

const TASK_TYPES = [
  { value: "answer_question", label: "Ответить на вопрос", icon: "MessageCircle", desc: "Задать вопрос по загруженным документам" },
  { value: "analyze", label: "Анализ материалов", icon: "Search", desc: "Суммировать, выделить ключевые идеи" },
  { value: "structure", label: "Структура презентации", icon: "Layers", desc: "Предложить 2-3 варианта структуры" },
  { value: "prepare_presentation", label: "Подготовить презентацию", icon: "Presentation", desc: "Создать полный текст слайдов" },
  { value: "presentation_by_reference", label: "Презентация по образцу", icon: "Copy", desc: "По форме загруженной презентации" },
  { value: "write_text", label: "Написать текст работы", icon: "FileText", desc: "Аналитическая записка, введение, выводы" },
  { value: "revise", label: "Доработать результат", icon: "Pencil", desc: "Скорректировать уже созданный материал" },
];

const HINTS: Record<string, { icon: string; color: string; text: React.ReactNode }> = {
  prepare_presentation: {
    icon: "Sparkles", color: "bg-blue-50 border-blue-200 text-blue-700",
    text: <>Доступны <strong>визуалы и AI-картинки</strong> — диаграммы, схемы, таймлайны. Включите «Генерировать визуалы» перед запуском.</>,
  },
  presentation_by_reference: {
    icon: "Sparkles", color: "bg-blue-50 border-blue-200 text-blue-700",
    text: <>Доступны <strong>визуалы и AI-картинки</strong>. Прикрепите PPTX-образец с ролью «Образец формата» и поставьте «Обязательно использовать» — AI воспроизведёт его структуру.</>,
  },
  revise: {
    icon: "Info", color: "bg-amber-50 border-amber-200 text-amber-700",
    text: <>Визуалы доступны если вы дорабатываете <strong>презентацию</strong> (в активной версии есть визуалы). Для текстовых результатов визуалы не применяются.</>,
  },
  analyze: {
    icon: "Info", color: "bg-slate-50 border-slate-200 text-slate-600",
    text: <>Визуалы и AI-картинки для этого типа недоступны. Результат — текстовый анализ.</>,
  },
  write_text: {
    icon: "Info", color: "bg-slate-50 border-slate-200 text-slate-600",
    text: <>Визуалы и AI-картинки для этого типа недоступны. Результат — текстовая работа.</>,
  },
  answer_question: {
    icon: "Info", color: "bg-slate-50 border-slate-200 text-slate-600",
    text: <>Визуалы для этого типа недоступны. Результат — текстовый ответ по документам.</>,
  },
  structure: {
    icon: "Info", color: "bg-slate-50 border-slate-200 text-slate-600",
    text: <>Визуалы недоступны. Результат — план структуры. Для презентации с визуалами используйте «Подготовить презентацию».</>,
  },
};

interface Props {
  taskType: string;
  onChange: (value: string) => void;
}

export default function TaskTypeSelector({ taskType, onChange }: Props) {
  const hint = HINTS[taskType];

  return (
    <div>
      <p className="text-sm font-semibold mb-3">Тип задания *</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {TASK_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
              taskType === t.value
                ? "border-orange-500 bg-orange-50 dark:bg-orange-950/30"
                : "border-border hover:border-orange-300"
            }`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
              taskType === t.value ? "bg-orange-500" : "bg-muted"
            }`}>
              <Icon name={t.icon} size={15} className={taskType === t.value ? "text-white" : "text-muted-foreground"} fallback="Sparkles" />
            </div>
            <div>
              <p className={`text-sm font-medium ${taskType === t.value ? "text-orange-600" : ""}`}>{t.label}</p>
              <p className="text-xs text-muted-foreground">{t.desc}</p>
            </div>
          </button>
        ))}
      </div>

      {hint && (
        <div className={`mt-3 flex items-start gap-2 border rounded-xl px-3 py-2.5 text-xs ${hint.color}`}>
          <Icon name={hint.icon} size={14} className="mt-0.5 flex-shrink-0" fallback="Info" />
          <span>{hint.text}</span>
        </div>
      )}
    </div>
  );
}
