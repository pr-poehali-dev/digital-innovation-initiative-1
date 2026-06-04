import { useState, useEffect, useRef } from "react";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { learningApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type Goal = {
  id: number;
  title: string;
  description?: string;
  status: string;
  ai_plan?: AIPlan | null;
  created_at: string;
};

type AIPlan = {
  summary: string;
  duration_weeks: number;
  phases: { phase: number; title: string; duration_weeks: number; topics: { title: string; description: string; subtopics?: string[] }[] }[];
  key_skills: string[];
  resources_hint: string;
};

type Topic = {
  id: number;
  parent_id: number | null;
  title: string;
  description?: string;
  order_index: number;
  status: "not_started" | "in_progress" | "done" | "skipped";
};

type Note = {
  id: number;
  goal_id?: number;
  topic_id?: number;
  kind: string;
  title?: string;
  content: string;
  url?: string;
  created_at: string;
};

type Progress = {
  total: number;
  done: number;
  in_progress: number;
  not_started: number;
  percent: number;
  notes_count: number;
};

const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-slate-100 text-slate-500",
  in_progress: "bg-blue-100 text-blue-700",
  done: "bg-emerald-100 text-emerald-700",
  skipped: "bg-slate-100 text-slate-400",
};
const STATUS_LABELS: Record<string, string> = {
  not_started: "Не начата",
  in_progress: "Изучаю",
  done: "Готово",
  skipped: "Пропущена",
};
const KIND_ICONS: Record<string, string> = {
  note: "StickyNote",
  link: "Link",
  insight: "Lightbulb",
  summary: "FileText",
  question: "HelpCircle",
};
const KIND_LABELS: Record<string, string> = {
  note: "Заметка",
  link: "Ссылка",
  insight: "Инсайт",
  summary: "Конспект",
  question: "Вопрос",
};

export default function LearningPage() {
  const { toast } = useToast();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGoal, setActiveGoal] = useState<Goal | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [tab, setTab] = useState<"plan" | "notes" | "ai">("plan");

  // Создание цели
  const [showNewGoal, setShowNewGoal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);

  // AI-чат
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiHistory, setAiHistory] = useState<{ q: string; a: string }[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const aiEndRef = useRef<HTMLDivElement>(null);

  // Находки
  const [noteContent, setNoteContent] = useState("");
  const [noteKind, setNoteKind] = useState("note");
  const [noteUrl, setNoteUrl] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);

  useEffect(() => {
    loadGoals();
  }, []);

  useEffect(() => {
    if (activeGoal) {
      loadGoalData(activeGoal.id);
    }
  }, [activeGoal?.id]);

  useEffect(() => {
    aiEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiHistory]);

  async function loadGoals() {
    try {
      const data = await learningApi.getGoals() as { goals: Goal[] };
      setGoals(data.goals || []);
      if (data.goals?.length > 0 && !activeGoal) {
        setActiveGoal(data.goals[0]);
      }
    } catch {
      toast({ title: "Не удалось загрузить цели", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function loadGoalData(goalId: number) {
    const [topicsData, notesData, progressData] = await Promise.all([
      learningApi.getTopics(goalId) as Promise<{ topics: Topic[] }>,
      learningApi.getNotes(goalId) as Promise<{ notes: Note[] }>,
      learningApi.getProgress(goalId) as Promise<{ progress: Progress }>,
    ]);
    setTopics(topicsData.topics || []);
    setNotes(notesData.notes || []);
    setProgress(progressData.progress || null);
  }

  async function handleCreateGoal() {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const data = await learningApi.createGoal(newTitle, newDesc) as { goal: Goal };
      const goal = data.goal;
      setGoals(prev => [goal, ...prev]);

      // Сразу генерируем AI-план
      setGeneratingPlan(true);
      try {
        await learningApi.generatePlan(newTitle, newDesc, goal.id);
        toast({ title: "Цель создана, AI-план готов!" });
      } catch {
        toast({ title: "Цель создана. Сгенерируй план вручную." });
      } finally {
        setGeneratingPlan(false);
      }

      // Обновляем данные
      const fresh = await learningApi.getGoals() as { goals: Goal[] };
      setGoals(fresh.goals || []);
      const newGoal = fresh.goals.find(g => g.id === goal.id) || goal;
      setActiveGoal(newGoal);
      setShowNewGoal(false);
      setNewTitle("");
      setNewDesc("");
    } catch (e: unknown) {
      toast({ title: String(e), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function handleTopicStatus(topic: Topic, status: string) {
    try {
      await learningApi.updateTopic(topic.id, status);
      setTopics(prev => prev.map(t => t.id === topic.id ? { ...t, status: status as Topic["status"] } : t));
      if (activeGoal) {
        const p = await learningApi.getProgress(activeGoal.id) as { progress: Progress };
        setProgress(p.progress);
      }
    } catch {
      toast({ title: "Не удалось обновить статус", variant: "destructive" });
    }
  }

  async function handleAddNote() {
    if (!noteContent.trim() || !activeGoal) return;
    setAddingNote(true);
    try {
      await learningApi.addNote({
        content: noteContent,
        kind: noteKind,
        url: noteUrl || undefined,
        goal_id: activeGoal.id,
      });
      setNoteContent("");
      setNoteUrl("");
      setShowNoteForm(false);
      const data = await learningApi.getNotes(activeGoal.id) as { notes: Note[] };
      setNotes(data.notes || []);
    } catch {
      toast({ title: "Не удалось сохранить", variant: "destructive" });
    } finally {
      setAddingNote(false);
    }
  }

  async function handleAskAi() {
    if (!aiQuestion.trim() || !activeGoal) return;
    const q = aiQuestion;
    setAiQuestion("");
    setAiLoading(true);
    try {
      const data = await learningApi.askAi(q, activeGoal.title) as { answer: string };
      setAiHistory(prev => [...prev, { q, a: data.answer }]);
    } catch {
      toast({ title: "AI не ответил, попробуй ещё раз", variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  }

  // Строим дерево тем
  const rootTopics = topics.filter(t => t.parent_id === null);
  const childTopics = (parentId: number) => topics.filter(t => t.parent_id === parentId);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="w-7 h-7 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Учебный кабинет</h1>
            <p className="text-sm text-slate-500 mt-0.5">Изучай новые сферы с AI-наставником</p>
          </div>
          <button
            onClick={() => setShowNewGoal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 transition-colors"
          >
            <Icon name="Plus" size={15} />
            Новая цель
          </button>
        </div>

        {/* Модал создания цели */}
        {showNewGoal && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">Новая учебная цель</h2>
                <button onClick={() => setShowNewGoal(false)} className="text-slate-400 hover:text-slate-600">
                  <Icon name="X" size={20} />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Что хочешь освоить?</label>
                  <input
                    className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Например: Управление проектами, Маркетинг, Data Science..."
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleCreateGoal()}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Контекст (необязательно)</label>
                  <textarea
                    className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                    rows={3}
                    placeholder="Зачем тебе это нужно? Есть ли опыт в смежных областях?"
                    value={newDesc}
                    onChange={e => setNewDesc(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button onClick={() => setShowNewGoal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl">
                  Отмена
                </button>
                <button
                  onClick={handleCreateGoal}
                  disabled={creating || !newTitle.trim()}
                  className="flex items-center gap-2 px-5 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors"
                >
                  {creating ? (
                    generatingPlan ? (
                      <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> AI строит план...</>
                    ) : (
                      <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Создаю...</>
                    )
                  ) : (
                    <><Icon name="Sparkles" size={15} /> Создать с AI-планом</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {goals.length === 0 ? (
          /* Пустое состояние */
          <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center">
              <Icon name="GraduationCap" size={32} className="text-violet-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Начни своё обучение</h2>
              <p className="text-slate-500 text-sm mt-1 max-w-sm">
                Задай цель — AI составит персональный план, разобьёт на темы и поможет двигаться шаг за шагом
              </p>
            </div>
            <button
              onClick={() => setShowNewGoal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-colors"
            >
              <Icon name="Sparkles" size={16} />
              Создать первую цель
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">

            {/* Левая колонка — список целей */}
            <div className="lg:col-span-1 space-y-2">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1 mb-3">
                Мои цели
              </div>
              {goals.map(goal => (
                <button
                  key={goal.id}
                  onClick={() => setActiveGoal(goal)}
                  className={`w-full text-left px-3 py-3 rounded-xl border transition-all ${
                    activeGoal?.id === goal.id
                      ? "bg-violet-50 border-violet-200 shadow-sm"
                      : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      activeGoal?.id === goal.id ? "bg-violet-600" : "bg-slate-100"
                    }`}>
                      <Icon name="GraduationCap" size={14} className={activeGoal?.id === goal.id ? "text-white" : "text-slate-500"} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-800 leading-tight line-clamp-2">{goal.title}</div>
                      {goal.ai_plan && (
                        <div className="text-[11px] text-slate-400 mt-0.5">{goal.ai_plan.duration_weeks} нед.</div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Правая колонка — детали цели */}
            {activeGoal && (
              <div className="lg:col-span-3 space-y-4">

                {/* Прогресс-шапка */}
                {progress && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-lg font-bold text-slate-900">{activeGoal.title}</h2>
                      <span className="text-2xl font-bold text-violet-600">{progress.percent}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500"
                        style={{ width: `${progress.percent}%` }}
                      />
                    </div>
                    <div className="flex gap-4 mt-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                        Готово: {progress.done}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                        В процессе: {progress.in_progress}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />
                        Осталось: {progress.not_started}
                      </span>
                      <span className="flex items-center gap-1 ml-auto">
                        <Icon name="StickyNote" size={12} />
                        Находок: {progress.notes_count}
                      </span>
                    </div>
                  </div>
                )}

                {/* Вкладки */}
                <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
                  {(["plan", "notes", "ai"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {t === "plan" ? "📋 План" : t === "notes" ? "📌 Находки" : "🤖 AI-наставник"}
                    </button>
                  ))}
                </div>

                {/* Вкладка: Plan */}
                {tab === "plan" && (
                  <div className="space-y-3">
                    {activeGoal.ai_plan && (
                      <div className="bg-violet-50 border border-violet-100 rounded-xl px-4 py-3 text-sm text-violet-800">
                        {activeGoal.ai_plan.summary}
                      </div>
                    )}

                    {rootTopics.length === 0 ? (
                      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
                        <Icon name="Sparkles" size={32} className="text-violet-400 mx-auto mb-2" />
                        <p className="text-slate-500 text-sm">AI строит план...</p>
                      </div>
                    ) : (
                      rootTopics.map(phase => {
                        const children = childTopics(phase.id);
                        const donePct = children.length
                          ? Math.round(children.filter(c => c.status === "done").length / children.length * 100)
                          : 0;
                        return (
                          <div key={phase.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center">
                                  <Icon name="BookOpen" size={13} className="text-white" />
                                </div>
                                <span className="text-sm font-semibold text-slate-800">{phase.title}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-violet-500 rounded-full" style={{ width: `${donePct}%` }} />
                                </div>
                                <span className="text-xs text-slate-400">{donePct}%</span>
                              </div>
                            </div>
                            {children.length > 0 && (
                              <div className="divide-y divide-slate-50">
                                {children.map(topic => (
                                  <div key={topic.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                                    <button
                                      onClick={() => {
                                        const next = topic.status === "not_started" ? "in_progress"
                                          : topic.status === "in_progress" ? "done" : "not_started";
                                        handleTopicStatus(topic, next);
                                      }}
                                      className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                                        topic.status === "done"
                                          ? "bg-emerald-500 border-emerald-500"
                                          : topic.status === "in_progress"
                                          ? "bg-blue-500 border-blue-500"
                                          : "border-slate-300 hover:border-violet-400"
                                      }`}
                                    >
                                      {topic.status === "done" && <Icon name="Check" size={11} className="text-white" />}
                                      {topic.status === "in_progress" && <div className="w-2 h-2 rounded-full bg-white" />}
                                    </button>
                                    <span className={`text-sm flex-1 ${topic.status === "done" ? "line-through text-slate-400" : "text-slate-700"}`}>
                                      {topic.title}
                                    </span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[topic.status]}`}>
                                      {STATUS_LABELS[topic.status]}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}

                    {activeGoal.ai_plan?.key_skills && (
                      <div className="bg-white border border-slate-200 rounded-xl p-4">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Ключевые навыки</div>
                        <div className="flex flex-wrap gap-2">
                          {activeGoal.ai_plan.key_skills.map(skill => (
                            <span key={skill} className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs rounded-lg">{skill}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Вкладка: Находки */}
                {tab === "notes" && (
                  <div className="space-y-3">
                    <button
                      onClick={() => setShowNoteForm(!showNoteForm)}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                    >
                      <Icon name="Plus" size={14} />
                      Добавить находку
                    </button>

                    {showNoteForm && (
                      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                        <div className="flex gap-2 flex-wrap">
                          {Object.entries(KIND_LABELS).map(([k, label]) => (
                            <button
                              key={k}
                              onClick={() => setNoteKind(k)}
                              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                                noteKind === k ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                              }`}
                            >
                              <Icon name={KIND_ICONS[k]} size={12} />
                              {label}
                            </button>
                          ))}
                        </div>
                        <textarea
                          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                          rows={3}
                          placeholder="Что нашёл, понял, запомнил..."
                          value={noteContent}
                          onChange={e => setNoteContent(e.target.value)}
                        />
                        {noteKind === "link" && (
                          <input
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                            placeholder="https://..."
                            value={noteUrl}
                            onChange={e => setNoteUrl(e.target.value)}
                          />
                        )}
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setShowNoteForm(false)} className="px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">
                            Отмена
                          </button>
                          <button
                            onClick={handleAddNote}
                            disabled={addingNote || !noteContent.trim()}
                            className="px-4 py-1.5 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50"
                          >
                            {addingNote ? "Сохраняю..." : "Сохранить"}
                          </button>
                        </div>
                      </div>
                    )}

                    {notes.length === 0 ? (
                      <div className="bg-white border border-dashed border-slate-200 rounded-xl p-8 text-center">
                        <Icon name="StickyNote" size={28} className="text-slate-300 mx-auto mb-2" />
                        <p className="text-slate-400 text-sm">Пока нет находок. Сохраняй сюда всё полезное!</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {notes.map(note => (
                          <div key={note.id} className="bg-white border border-slate-200 rounded-xl p-4">
                            <div className="flex items-start gap-3">
                              <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <Icon name={KIND_ICONS[note.kind] || "StickyNote"} size={13} className="text-slate-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-semibold text-slate-400 uppercase">{KIND_LABELS[note.kind] || note.kind}</span>
                                  <span className="text-xs text-slate-300">·</span>
                                  <span className="text-xs text-slate-400">
                                    {new Date(note.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                                  </span>
                                </div>
                                <p className="text-sm text-slate-700 whitespace-pre-wrap">{note.content}</p>
                                {note.url && (
                                  <a href={note.url} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-600 hover:underline mt-1 block truncate">
                                    {note.url}
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Вкладка: AI-наставник */}
                {tab === "ai" && (
                  <div className="bg-white border border-slate-200 rounded-2xl flex flex-col" style={{ minHeight: 420 }}>
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                        <Icon name="Sparkles" size={15} className="text-white" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-800">AI-наставник</div>
                        <div className="text-xs text-slate-400">Тема: {activeGoal.title}</div>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ maxHeight: 380 }}>
                      {aiHistory.length === 0 && (
                        <div className="text-center py-8">
                          <p className="text-slate-400 text-sm">Задай любой вопрос по теме — объясню, помогу, направлю</p>
                          <div className="flex flex-wrap gap-2 justify-center mt-4">
                            {["С чего начать?", "Что самое важное?", "Какие книги почитать?"].map(q => (
                              <button
                                key={q}
                                onClick={() => setAiQuestion(q)}
                                className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs rounded-lg hover:bg-slate-200 transition-colors"
                              >
                                {q}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {aiHistory.map((item, i) => (
                        <div key={i} className="space-y-2">
                          <div className="flex justify-end">
                            <div className="bg-violet-600 text-white text-sm px-3.5 py-2 rounded-2xl rounded-tr-sm max-w-xs">
                              {item.q}
                            </div>
                          </div>
                          <div className="flex justify-start">
                            <div className="bg-slate-100 text-slate-800 text-sm px-3.5 py-2.5 rounded-2xl rounded-tl-sm max-w-lg whitespace-pre-wrap leading-relaxed">
                              {item.a}
                            </div>
                          </div>
                        </div>
                      ))}
                      {aiLoading && (
                        <div className="flex justify-start">
                          <div className="bg-slate-100 px-4 py-2.5 rounded-2xl rounded-tl-sm">
                            <div className="flex gap-1">
                              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                            </div>
                          </div>
                        </div>
                      )}
                      <div ref={aiEndRef} />
                    </div>

                    <div className="px-4 py-3 border-t border-slate-100 flex gap-2">
                      <input
                        className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                        placeholder="Задай вопрос наставнику..."
                        value={aiQuestion}
                        onChange={e => setAiQuestion(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && !aiLoading && handleAskAi()}
                        disabled={aiLoading}
                      />
                      <button
                        onClick={handleAskAi}
                        disabled={aiLoading || !aiQuestion.trim()}
                        className="px-3 py-2 bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors"
                      >
                        <Icon name="Send" size={15} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
