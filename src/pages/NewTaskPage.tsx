import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { documentsApi, tasksApi } from "@/lib/api";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";

interface Document {
  id: number;
  name: string;
  file_type: string;
  status: string;
}

const TASK_TYPES = [
  { value: "answer_question", label: "Ответить на вопрос", icon: "MessageCircle", desc: "Задать вопрос по загруженным документам" },
  { value: "analyze", label: "Анализ материалов", icon: "Search", desc: "Суммировать, выделить ключевые идеи" },
  { value: "structure", label: "Структура презентации", icon: "Layers", desc: "Предложить 2-3 варианта структуры" },
  { value: "prepare_presentation", label: "Подготовить презентацию", icon: "Presentation", desc: "Создать полный текст слайдов" },
  { value: "presentation_by_reference", label: "Презентация по образцу", icon: "Copy", desc: "По форме загруженной презентации" },
  { value: "write_text", label: "Написать текст работы", icon: "FileText", desc: "Аналитическая записка, введение, выводы" },
  { value: "revise", label: "Доработать результат", icon: "Pencil", desc: "Скорректировать уже созданный материал" },
];

// P0: новые роли документов с явной семантикой
const DOC_ROLES = [
  {
    value: "standard",
    label: "📜 Стандарт / норматив",
    desc: "Высший приоритет. AI возьмёт отсюда СТРУКТУРУ и требования.",
    color: "text-purple-700 bg-purple-50",
  },
  {
    value: "content",
    label: "📚 Содержательный материал",
    desc: "Факты, тезисы, формулировки. Это «мясо» результата.",
    color: "text-green-700 bg-green-50",
  },
  {
    value: "methodology",
    label: "🧭 Методика",
    desc: "Логика, подход, методы аргументации.",
    color: "text-cyan-700 bg-cyan-50",
  },
  {
    value: "template",
    label: "🎨 Образец формата",
    desc: "ТОЛЬКО формат и стиль. Содержание НЕ копируется.",
    color: "text-blue-700 bg-blue-50",
  },
  {
    value: "background",
    label: "📎 Фоновый контекст",
    desc: "Использовать осторожно, только при необходимости.",
    color: "text-slate-700 bg-slate-100",
  },
  {
    value: "excluded",
    label: "⛔ Не использовать",
    desc: "Документ есть в проекте, но в этом задании не участвует.",
    color: "text-muted-foreground bg-muted",
  },
];

const USAGE_MODES: Record<string, { value: string; label: string }[]> = {
  standard: [
    { value: "structure_source", label: "Брать структуру" },
    { value: "requirements", label: "Брать требования к оформлению" },
    { value: "both", label: "Структура + требования" },
  ],
  content: [
    { value: "facts_only", label: "Только факты и тезисы" },
    { value: "full_content", label: "Полное содержание" },
    { value: "selected_topics", label: "Отдельные темы (указать в инструкции)" },
  ],
  methodology: [
    { value: "methodology_only", label: "Только логика и метод" },
    { value: "guidelines", label: "Рекомендации по оформлению" },
  ],
  template: [
    { value: "format_only", label: "ТОЛЬКО формат, НЕ содержание" },
    { value: "format_and_tone", label: "Формат + тон подачи" },
    { value: "structure_only", label: "Только список слайдов" },
  ],
  background: [
    { value: "context_only", label: "Только как контекст" },
  ],
  excluded: [],
};

const PRIORITIES = [
  { value: "high", label: "Высокий" },
  { value: "medium", label: "Средний" },
  { value: "low", label: "Низкий" },
];

const STYLES = ["академический", "деловой", "формальный", "краткий"];

export default function NewTaskPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const projectId = Number(id);

  const [docs, setDocs] = useState<Document[]>([]);
  const [taskType, setTaskType] = useState("prepare_presentation");
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState("");
  const [audience, setAudience] = useState("");
  const [style, setStyle] = useState("");
  const [slideCount, setSlideCount] = useState("");
  const [instructions, setInstructions] = useState("");
  // P0: orchestration по каждому документу
  type DocConfig = {
    role: string;
    usage_mode: string;
    priority: string;
    must_use: boolean;
    instruction: string;
  };
  const [docConfigs, setDocConfigs] = useState<Record<number, DocConfig>>({});

  const updateDocConfig = (docId: number, patch: Partial<DocConfig>) => {
    setDocConfigs((prev) => {
      const existing = prev[docId] || {
        role: "",
        usage_mode: "",
        priority: "medium",
        must_use: false,
        instruction: "",
      };
      return { ...prev, [docId]: { ...existing, ...patch } };
    });
  };
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    documentsApi.list(projectId).then((d) => {
      setDocs(d.documents.filter((doc: Document) => doc.status === "ready"));
    });
  }, [projectId]);

  useEffect(() => {
    const t = TASK_TYPES.find((t) => t.value === taskType);
    if (t && !title) setTitle(t.label);
  }, [taskType]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !topic.trim()) {
      setError("Заполните название и тему");
      return;
    }
    setCreating(true);
    setError("");
    try {
      // P0: отправляем полную orchestration по каждому документу
      const documentRoles = Object.entries(docConfigs)
        .filter(([, cfg]) => cfg.role && cfg.role !== "")
        .map(([docId, cfg]) => ({
          document_id: Number(docId),
          role: cfg.role,
          usage_mode: cfg.usage_mode || undefined,
          priority: cfg.priority || "medium",
          must_use: cfg.must_use,
          instruction: cfg.instruction || undefined,
        }));
      const task = await tasksApi.create({
        project_id: projectId,
        title: title.trim(),
        task_type: taskType,
        topic: topic.trim(),
        goal: goal.trim() || undefined,
        audience: audience.trim() || undefined,
        style: style || undefined,
        requested_slide_count: slideCount ? Number(slideCount) : undefined,
        additional_instructions: instructions.trim() || undefined,
        document_roles: documentRoles,
      });
      navigate(`/cabinet/project/${projectId}/task/${task.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка");
      setCreating(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link to="/cabinet" className="hover:text-foreground">Проекты</Link>
          <Icon name="ChevronRight" size={14} />
          <Link to={`/cabinet/project/${projectId}`} className="hover:text-foreground">Проект</Link>
          <Icon name="ChevronRight" size={14} />
          <span className="text-foreground font-medium">Новое задание</span>
        </div>

        <h1 className="text-2xl font-bold mb-8">Новое задание для AI</h1>

        <form onSubmit={handleCreate} className="space-y-8">
          <div>
            <p className="text-sm font-semibold mb-3">Тип задания *</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {TASK_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTaskType(t.value)}
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
            {taskType && (() => {
              const hints: Record<string, { icon: string; color: string; text: React.ReactNode }> = {
                prepare_presentation: {
                  icon: "Sparkles", color: "bg-blue-50 border-blue-200 text-blue-700",
                  text: <>Доступны <strong>визуалы и AI-картинки</strong> — диаграммы, схемы, таймлайны. Включите «Генерировать визуалы» перед запуском.</>
                },
                presentation_by_reference: {
                  icon: "Sparkles", color: "bg-blue-50 border-blue-200 text-blue-700",
                  text: <>Доступны <strong>визуалы и AI-картинки</strong>. Прикрепите PPTX-образец с ролью «Образец формата» и поставьте «Обязательно использовать» — AI воспроизведёт его структуру.</>
                },
                revise: {
                  icon: "Info", color: "bg-amber-50 border-amber-200 text-amber-700",
                  text: <>Визуалы доступны если вы дорабатываете <strong>презентацию</strong> (в активной версии есть визуалы). Для текстовых результатов визуалы не применяются.</>
                },
                analyze: {
                  icon: "Info", color: "bg-slate-50 border-slate-200 text-slate-600",
                  text: <>Визуалы и AI-картинки для этого типа недоступны. Результат — текстовый анализ.</>
                },
                write_text: {
                  icon: "Info", color: "bg-slate-50 border-slate-200 text-slate-600",
                  text: <>Визуалы и AI-картинки для этого типа недоступны. Результат — текстовая работа.</>
                },
                answer_question: {
                  icon: "Info", color: "bg-slate-50 border-slate-200 text-slate-600",
                  text: <>Визуалы для этого типа недоступны. Результат — текстовый ответ по документам.</>
                },
                structure: {
                  icon: "Info", color: "bg-slate-50 border-slate-200 text-slate-600",
                  text: <>Визуалы недоступны. Результат — план структуры. Для презентации с визуалами используйте «Подготовить презентацию».</>
                },
              };
              const h = hints[taskType];
              if (!h) return null;
              return (
                <div className={`mt-3 flex items-start gap-2 border rounded-xl px-3 py-2.5 text-xs ${h.color}`}>
                  <Icon name={h.icon} size={14} className="mt-0.5 flex-shrink-0" fallback="Info" />
                  <span>{h.text}</span>
                </div>
              );
            })()}
          </div>

          <div className="space-y-4">
            <p className="text-sm font-semibold">Параметры задания</p>
            <div>
              <label className="text-sm text-muted-foreground block mb-1.5">Название задания *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Например: Презентация по управлению проектами"
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500 [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_white]"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1.5">Тема *</label>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="О чём должен быть результат?"
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500 [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_white]"
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-1.5">Цель</label>
                <input
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="Что должно получиться?"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500 [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_white]"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1.5">Аудитория</label>
                <input
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder="Для кого?"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500 [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_white]"
                />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-1.5">Стиль изложения</label>
                <select
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500"
                >
                  <option value="">Не указан</option>
                  {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1.5">Число слайдов</label>
                <input
                  type="number"
                  value={slideCount}
                  onChange={(e) => setSlideCount(e.target.value)}
                  placeholder="Например: 12"
                  min={1}
                  max={50}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500 [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_white]"
                />
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1.5">Дополнительные указания</label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Любые дополнительные требования к результату..."
                rows={3}
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none"
              />
            </div>
          </div>

          {docs.length > 0 && (
            <div>
              <div className="mb-3">
                <p className="text-sm font-semibold mb-1">Документы и их роли в задании</p>
                <p className="text-xs text-muted-foreground">
                  Каждому документу укажи <strong>роль</strong> и <strong>как его использовать</strong>.
                  AI применит иерархию: <span className="font-semibold">Стандарт → Содержание → Методика → Образец формата → Фон</span>.
                </p>
              </div>
              <div className="space-y-3">
                {docs.map((doc) => {
                  const cfg = docConfigs[doc.id] || { role: "", usage_mode: "", priority: "medium", must_use: false, instruction: "" };
                  const roleInfo = DOC_ROLES.find((r) => r.value === cfg.role);
                  const usageOptions = USAGE_MODES[cfg.role] || [];
                  return (
                    <div key={doc.id} className="border border-slate-200 rounded-xl p-4 space-y-3">
                      {/* Шапка документа */}
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          doc.file_type === "pdf" ? "bg-red-100" :
                          doc.file_type === "pptx" ? "bg-orange-100" : "bg-blue-100"
                        }`}>
                          <Icon name="FileText" size={15} className={
                            doc.file_type === "pdf" ? "text-red-600" :
                            doc.file_type === "pptx" ? "text-orange-600" : "text-blue-600"
                          } />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{doc.name}</p>
                          <p className="text-xs text-muted-foreground">{doc.file_type.toUpperCase()}</p>
                        </div>
                        {roleInfo && (
                          <span className={`text-xs px-2 py-1 rounded-full ${roleInfo.color}`}>
                            {roleInfo.label}
                          </span>
                        )}
                      </div>

                      {/* 1. Роль */}
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1.5">Роль в задании</label>
                        <select
                          value={cfg.role}
                          onChange={(e) => updateDocConfig(doc.id, { role: e.target.value, usage_mode: "" })}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-500"
                        >
                          <option value="">— не выбрана —</option>
                          {DOC_ROLES.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                        {roleInfo && (
                          <p className="text-xs text-slate-500 mt-1">{roleInfo.desc}</p>
                        )}
                      </div>

                      {/* 2. Дополнительные настройки — только если выбрана нормальная роль */}
                      {cfg.role && cfg.role !== "excluded" && (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            {/* Режим использования */}
                            {usageOptions.length > 0 && (
                              <div>
                                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Как использовать</label>
                                <select
                                  value={cfg.usage_mode}
                                  onChange={(e) => updateDocConfig(doc.id, { usage_mode: e.target.value })}
                                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-slate-500"
                                >
                                  <option value="">по умолчанию</option>
                                  {usageOptions.map((m) => (
                                    <option key={m.value} value={m.value}>{m.label}</option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {/* Приоритет */}
                            <div>
                              <label className="text-xs font-semibold text-slate-700 block mb-1.5">Приоритет</label>
                              <select
                                value={cfg.priority}
                                onChange={(e) => updateDocConfig(doc.id, { priority: e.target.value })}
                                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-slate-500"
                              >
                                {PRIORITIES.map((p) => (
                                  <option key={p.value} value={p.value}>{p.label}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* Чекбокс «обязательный» */}
                          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={cfg.must_use}
                              onChange={(e) => updateDocConfig(doc.id, { must_use: e.target.checked })}
                              className="w-4 h-4 accent-slate-800"
                            />
                            <span>Обязательно использовать этот документ</span>
                          </label>

                          {/* Инструкция */}
                          <div>
                            <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                              Инструкция AI <span className="text-slate-400 font-normal">(что брать / что не брать)</span>
                            </label>
                            <textarea
                              value={cfg.instruction}
                              onChange={(e) => updateDocConfig(doc.id, { instruction: e.target.value })}
                              placeholder={
                                cfg.role === "template"
                                  ? "Например: возьми только формат слайдов и стиль заголовков. Не копируй темы и вехи."
                                  : cfg.role === "standard"
                                  ? "Например: используй структуру из главы 2 — введение / 3 главы / заключение."
                                  : "Например: бери только разделы про управление рисками и финансы."
                              }
                              rows={2}
                              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {docs.length === 0 && (
            <div className="border rounded-xl p-4 bg-muted/30 text-sm text-muted-foreground">
              <p>Нет загруженных файлов. <Link to={`/cabinet/project/${projectId}`} className="text-orange-500 hover:underline">Загрузить документы →</Link></p>
            </div>
          )}

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex gap-3">
            <Link
              to={`/cabinet/project/${projectId}`}
              className="flex-1 text-center border rounded-lg py-3 text-sm font-medium hover:bg-muted transition-colors"
            >
              Отмена
            </Link>
            <button
              type="submit"
              disabled={creating}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg py-3 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {creating ? "Создание..." : "Создать задание"}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}