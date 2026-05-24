import { useEffect, useState } from "react";
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

const DOC_ROLES = [
  { value: "standard", label: "Стандарт / нормативный", color: "text-purple-600 bg-purple-50 dark:bg-purple-950/30" },
  { value: "reference_presentation", label: "Образец презентации", color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30" },
  { value: "content_source", label: "Содержательный материал", color: "text-green-600 bg-green-50 dark:bg-green-950/30" },
  { value: "draft", label: "Черновик", color: "text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30" },
  { value: "excluded", label: "Не использовать", color: "text-muted-foreground bg-muted" },
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
  const [docRoles, setDocRoles] = useState<Record<number, string>>({});
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
      const documentRoles = Object.entries(docRoles).map(([docId, role]) => ({
        document_id: Number(docId),
        role,
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
              <p className="text-sm font-semibold mb-1">Документы и их роли</p>
              <p className="text-xs text-muted-foreground mb-3">Назначьте каждому файлу роль в этом задании</p>
              <div className="space-y-2">
                {docs.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-3 border rounded-xl p-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      doc.file_type === "pdf" ? "bg-red-100" :
                      doc.file_type === "pptx" ? "bg-orange-100" : "bg-blue-100"
                    }`}>
                      <Icon name="FileText" size={14} className={
                        doc.file_type === "pdf" ? "text-red-600" :
                        doc.file_type === "pptx" ? "text-orange-600" : "text-blue-600"
                      } />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.name}</p>
                      <p className="text-xs text-muted-foreground">{doc.file_type.toUpperCase()}</p>
                    </div>
                    <select
                      value={docRoles[doc.id] || ""}
                      onChange={(e) => setDocRoles((prev) => ({ ...prev, [doc.id]: e.target.value }))}
                      className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-background focus:outline-none focus:ring-2 focus:ring-slate-500"
                    >
                      <option value="">— не выбрана —</option>
                      {DOC_ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
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