import { useState, useEffect, useRef } from "react";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { learningApi, TOPIC_STATUSES, type TopicStatus } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type Goal = {
  id: number;
  title: string;
  description?: string;
  status: string;
  ai_plan?: AIPlan | null;
  created_at: string;
  start_date?: string | null;
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
  status: TopicStatus;
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
  applied: number;
  understood: number;
  studying: number;
  not_started: number;
  done: number;
  in_progress: number;
  percent: number;
  notes_count: number;
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
  const [tab, setTab] = useState<"plan" | "notes" | "ai" | "roadmap">("plan");

  // Check-in
  const [showCheckin, setShowCheckin] = useState(false);
  const [checkinData, setCheckinData] = useState({ learned: "", clearer_now: "", gaps: "", next_focus: "" });
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [checkinResult, setCheckinResult] = useState("");
  const [checkins, setCheckins] = useState<{id:number;week_start:string;learned:string;clearer_now:string;gaps:string;next_focus:string;ai_summary:string;created_at:string}[]>([]);

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
    const [topicsData, notesData, progressData, checkinsData] = await Promise.all([
      learningApi.getTopics(goalId) as Promise<{ topics: Topic[] }>,
      learningApi.getNotes(goalId) as Promise<{ notes: Note[] }>,
      learningApi.getProgress(goalId) as Promise<{ progress: Progress }>,
      learningApi.getCheckins(goalId).catch(() => ({ checkins: [] })) as Promise<{ checkins: typeof checkins }>,
    ]);
    setTopics(topicsData.topics || []);
    setNotes(notesData.notes || []);
    setProgress(progressData.progress || null);
    setCheckins(checkinsData.checkins || []);
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

  async function handleTopicStatus(topic: Topic, status: TopicStatus) {
    // Оптимистичное обновление — сразу показываем новый статус
    setTopics(prev => prev.map(t => t.id === topic.id ? { ...t, status } : t));
    try {
      await learningApi.updateTopic(topic.id, status);
      if (activeGoal) {
        const p = await learningApi.getProgress(activeGoal.id) as { progress: Progress };
        setProgress(p.progress);
      }
    } catch {
      // Откатываем при ошибке
      setTopics(prev => prev.map(t => t.id === topic.id ? { ...t, status: topic.status } : t));
      toast({ title: "Не удалось обновить статус", variant: "destructive" });
    }
  }

  async function handleCheckinSubmit() {
    if (!activeGoal || !checkinData.learned.trim()) return;
    setCheckinLoading(true);
    try {
      const res = await learningApi.saveCheckin({
        goal_id: activeGoal.id,
        goal_title: activeGoal.title,
        ...checkinData,
      }) as { checkin: typeof checkins[0] };
      setCheckinResult(res.checkin.ai_summary);
      setCheckins(prev => [res.checkin, ...prev]);
      setCheckinData({ learned: "", clearer_now: "", gaps: "", next_focus: "" });
    } catch {
      toast({ title: "Не удалось сохранить check-in", variant: "destructive" });
    } finally {
      setCheckinLoading(false);
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
                <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit flex-wrap">
                  {(["plan", "notes", "ai", "roadmap"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {t === "plan" ? "📋 План" : t === "notes" ? "📌 Находки" : t === "ai" ? "🤖 Наставник" : "🗓 30/60/90"}
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
                        const WEIGHTS: Record<string, number> = { not_started: 0, studying: 0.33, understood: 0.66, applied: 1, done: 1, in_progress: 0.33 };
                        const donePct = children.length
                          ? Math.round(children.reduce((sum, c) => sum + (WEIGHTS[c.status] ?? 0), 0) / children.length * 100)
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
                                {children.map(topic => {
                                  const cur = TOPIC_STATUSES.find(s => s.value === topic.status) ?? TOPIC_STATUSES[0];
                                  return (
                                    <div key={topic.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50 transition-colors group">
                                      {/* Цветная точка текущего статуса */}
                                      <div className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${cur.dot}`} />
                                      <span className={`text-sm flex-1 leading-snug ${topic.status === "applied" ? "text-slate-500" : "text-slate-700"}`}>
                                        {topic.title}
                                      </span>
                                      {/* 4-уровневый inline-селектор */}
                                      <div className="flex gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                        {TOPIC_STATUSES.map(s => (
                                          <button
                                            key={s.value}
                                            onClick={() => handleTopicStatus(topic, s.value)}
                                            title={s.label}
                                            className={`h-5 rounded px-1.5 text-[10px] font-semibold transition-all ${
                                              topic.status === s.value
                                                ? `${s.bg} ${s.color} ring-1 ring-current`
                                                : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                                            }`}
                                          >
                                            {s.value === "not_started" ? "—" : s.value === "studying" ? "S" : s.value === "understood" ? "U" : "✓"}
                                          </button>
                                        ))}
                                      </div>
                                      <span className={`hidden sm:inline text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${cur.bg} ${cur.color}`}>
                                        {cur.label}
                                      </span>
                                    </div>
                                  );
                                })}
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

                {/* Вкладка: 30/60/90 */}
                {tab === "roadmap" && (
                  <RoadmapTab
                    goal={activeGoal}
                    topics={topics}
                    notes={notes}
                    progress={progress}
                    checkins={checkins}
                    showCheckin={showCheckin}
                    setShowCheckin={setShowCheckin}
                    checkinData={checkinData}
                    setCheckinData={setCheckinData}
                    checkinLoading={checkinLoading}
                    checkinResult={checkinResult}
                    setCheckinResult={setCheckinResult}
                    onCheckinSubmit={handleCheckinSubmit}
                    onSetStartDate={async (date: string) => {
                      await learningApi.setStartDate(activeGoal.id, date);
                      setGoals(prev => prev.map(g => g.id === activeGoal.id ? { ...g, start_date: date } : g));
                      setActiveGoal(g => g ? { ...g, start_date: date } : g);
                    }}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}

// ── Вкладка 30/60/90 ─────────────────────────────────────────────────────────

const PHASE_DEFS = [
  {
    range: "0–30",
    label: "Фаза 1 — Понять",
    goal: "Понять среду, людей, процессы, данные и ограничения",
    days: [0, 30],
    color: "violet",
    topicKeywords: ["предметн", "методолог", "линии", "цикл аудит", "стандарт", "регулятор", "процесс", "stakeholder", "pain", "данных"],
    artifacts: [
      "Мандат и ожидания",
      "Stakeholder map",
      "Карта процессов as-is",
      "Реестр pain points",
      "Карта данных",
      "Черновой backlog инициатив",
    ],
    actions: [
      "Провести 10–15 установочных встреч",
      "Запросить методологию и регламенты",
      "Начать карту процессов as-is",
      "Зафиксировать 10+ pain points",
      "Понять, какие данные доступны",
    ],
  },
  {
    range: "31–60",
    label: "Фаза 2 — Выбрать",
    goal: "Приоритизировать, выбрать пилоты и согласовать roadmap",
    days: [31, 60],
    color: "blue",
    topicKeywords: ["автоматиз", "приоритиз", "AI use", "governance", "roadmap", "pilot", "матриц", "инициатив"],
    artifacts: [
      "Priority matrix",
      "Матрица Авто / AI-assist / Не сейчас",
      "Pilot charters (2–3 пилота)",
      "Target operating model",
      "AI governance draft",
      "Roadmap 6–12 месяцев",
    ],
    actions: [
      "Выбрать 2–3 quick wins",
      "Описать бизнес-кейсы пилотов",
      "Подготовить AI governance draft",
      "Согласовать дорожную карту",
      "Определить baseline метрики",
    ],
  },
  {
    range: "61–90",
    label: "Фаза 3 — Запустить",
    goal: "Запустить пилоты, зафиксировать ритм и упаковать для руководства",
    days: [61, 90],
    color: "emerald",
    topicKeywords: ["руководител", "команд", "90 дней", "ритм", "управленч", "модель команд", "operating"],
    artifacts: [
      "2–3 пилота в запуске",
      "Baseline + KPI dashboard",
      "Operating cadence",
      "Team design",
      "Management deck",
      "План на следующие 6 месяцев",
    ],
    actions: [
      "Запустить первые пилоты",
      "Ввести управленческий ритм",
      "Сформировать модель команды",
      "Подготовить презентацию для руководства",
      "Зафиксировать план следующих 6 мес.",
    ],
  },
];

const PHASE_COLORS: Record<string, { bg: string; border: string; badge: string; bar: string; btn: string }> = {
  violet: { bg: "bg-violet-50", border: "border-violet-200", badge: "bg-violet-100 text-violet-700", bar: "bg-violet-500", btn: "bg-violet-600 hover:bg-violet-700" },
  blue: { bg: "bg-blue-50", border: "border-blue-200", badge: "bg-blue-100 text-blue-700", bar: "bg-blue-500", btn: "bg-blue-600 hover:bg-blue-700" },
  emerald: { bg: "bg-emerald-50", border: "border-emerald-200", badge: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500", btn: "bg-emerald-600 hover:bg-emerald-700" },
};

function RoadmapTab({
  goal, topics, progress, checkins,
  showCheckin, setShowCheckin,
  checkinData, setCheckinData,
  checkinLoading, checkinResult, setCheckinResult,
  onCheckinSubmit, onSetStartDate,
}: {
  goal: Goal;
  topics: Topic[];
  notes?: Note[];
  progress: Progress | null;
  checkins: { id: number; week_start: string; learned: string; clearer_now: string; gaps: string; next_focus: string; ai_summary: string; created_at: string }[];
  showCheckin: boolean;
  setShowCheckin: (v: boolean) => void;
  checkinData: { learned: string; clearer_now: string; gaps: string; next_focus: string };
  setCheckinData: (v: { learned: string; clearer_now: string; gaps: string; next_focus: string }) => void;
  checkinLoading: boolean;
  checkinResult: string;
  setCheckinResult: (v: string) => void;
  onCheckinSubmit: () => void;
  onSetStartDate: (date: string) => void;
}) {
  const startDate = goal.start_date ? new Date(goal.start_date) : null;
  const today = new Date();
  const dayNumber = startDate ? Math.floor((today.getTime() - startDate.getTime()) / 86400000) + 1 : null;
  const currentPhaseIdx = dayNumber === null ? -1 : dayNumber <= 30 ? 0 : dayNumber <= 60 ? 1 : 2;

  // Определяем к какой фазе относится тема по ключевым словам
  function getPhaseForTopic(t: Topic): number {
    if (t.parent_id !== null) return -1; // не этапы — пропускаем
    const lower = t.title.toLowerCase();
    if (lower.includes("этап 1") || lower.includes("этап 2")) return 0;
    if (lower.includes("этап 3") || lower.includes("этап 4") || lower.includes("этап 5")) return 1;
    if (lower.includes("этап 6")) return 2;
    return -1;
  }

  // Дочерние темы для этапа
  function getChildrenForPhase(phaseIdx: number): Topic[] {
    const phaseRoots = topics.filter(t => t.parent_id === null && getPhaseForTopic(t) === phaseIdx);
    const rootIds = phaseRoots.map(r => r.id);
    return topics.filter(t => t.parent_id !== null && rootIds.includes(t.parent_id));
  }

  return (
    <div className="space-y-4">
      {/* Верхний блок: статус */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Цель</div>
            <div className="text-base font-bold text-slate-900">{goal.title}</div>

            {startDate ? (
              <div className="flex flex-wrap gap-4 mt-2 text-sm">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <Icon name="Calendar" size={14} className="text-slate-400" />
                  Старт: {startDate.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
                </span>
                {dayNumber !== null && dayNumber > 0 && (
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <Icon name="Clock" size={14} className="text-slate-400" />
                    День {dayNumber}
                  </span>
                )}
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  currentPhaseIdx === 0 ? "bg-violet-100 text-violet-700"
                  : currentPhaseIdx === 1 ? "bg-blue-100 text-blue-700"
                  : currentPhaseIdx === 2 ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-100 text-slate-500"
                }`}>
                  {currentPhaseIdx >= 0 ? `Фаза ${currentPhaseIdx + 1}: ${PHASE_DEFS[currentPhaseIdx].range} дней` : "Не начато"}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-2">
                <Icon name="Calendar" size={14} className="text-slate-400" />
                <span className="text-sm text-slate-500">Укажи дату старта, чтобы отслеживать прогресс по дням</span>
                <input
                  type="date"
                  className="ml-2 border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  defaultValue={new Date().toISOString().split("T")[0]}
                  onChange={e => e.target.value && onSetStartDate(e.target.value)}
                />
              </div>
            )}
          </div>

          {progress && (
            <div className="text-right">
              <div className="text-3xl font-bold text-violet-600">{progress.percent}%</div>
              <div className="text-xs text-slate-400">общий прогресс</div>
              <div className="w-24 h-1.5 bg-slate-100 rounded-full mt-1.5 ml-auto">
                <div className="h-full bg-violet-500 rounded-full" style={{ width: `${progress.percent}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3 карточки фаз */}
      {PHASE_DEFS.map((phase, idx) => {
        const c = PHASE_COLORS[phase.color];
        const children = getChildrenForPhase(idx);
        const done = children.filter(t => t.status === "done").length;
        const inProgress = children.filter(t => t.status === "in_progress").length;
        const pct = children.length ? Math.round(done / children.length * 100) : 0;
        const isCurrent = idx === currentPhaseIdx;
        const isPast = dayNumber !== null && dayNumber > phase.days[1];

        return (
          <div key={phase.range} className={`border rounded-2xl overflow-hidden ${isCurrent ? `${c.border} shadow-sm` : "border-slate-200"}`}>
            {/* Заголовок */}
            <div className={`px-5 py-3.5 flex items-center justify-between ${isCurrent ? c.bg : ""}`}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-bold ${
                  isPast ? "bg-emerald-500" : isCurrent ? (phase.color === "violet" ? "bg-violet-600" : phase.color === "blue" ? "bg-blue-600" : "bg-emerald-600") : "bg-slate-300"
                }`}>
                  {isPast ? <Icon name="Check" size={14} /> : idx + 1}
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-800">{phase.label}</div>
                  <div className="text-xs text-slate-500">{phase.goal}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {children.length > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-slate-100 rounded-full">
                      <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-slate-500">{done}/{children.length}</span>
                  </div>
                )}
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  isPast ? "bg-emerald-100 text-emerald-700"
                  : isCurrent ? c.badge
                  : "bg-slate-100 text-slate-400"
                }`}>
                  {isPast ? "Завершена" : isCurrent ? "В процессе" : "Впереди"}
                </span>
              </div>
            </div>

            <div className="px-5 pb-4 pt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Темы */}
              {children.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Темы</div>
                  <div className="space-y-1.5">
                    {children.map(t => (
                      <div key={t.id} className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
                          t.status === "done" ? "bg-emerald-500"
                          : t.status === "in_progress" ? "bg-blue-500"
                          : "border-2 border-slate-200"
                        }`}>
                          {t.status === "done" && <Icon name="Check" size={9} className="text-white" />}
                          {t.status === "in_progress" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <span className={`text-xs ${t.status === "done" ? "text-slate-400 line-through" : "text-slate-700"}`}>
                          {t.title}
                        </span>
                        {t.status === "in_progress" && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded-full">Изучаю</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Артефакты */}
              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Результаты фазы</div>
                <div className="space-y-1.5">
                  {phase.artifacts.map(a => (
                    <div key={a} className="flex items-center gap-2">
                      <Icon name="FileCheck" size={12} className={isPast ? "text-emerald-500" : "text-slate-300"} />
                      <span className={`text-xs ${isPast ? "text-slate-600" : "text-slate-500"}`}>{a}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Действия для текущей фазы */}
            {isCurrent && (
              <div className={`px-5 py-3 border-t ${c.border} ${c.bg}`}>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Что делать сейчас</div>
                <div className="flex flex-wrap gap-2">
                  {phase.actions.map(a => (
                    <span key={a} className="text-xs px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-600">{a}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* ── Что делать сейчас ───────────────────────────────────────── */}
      {currentPhaseIdx >= 0 && (() => {
        const WEIGHTS: Record<string, number> = { not_started: 0, studying: 0.33, understood: 0.66, applied: 1, done: 1, in_progress: 0.33 };
        // темы текущей фазы: берём дочерние темы этапов текущей фазы
        const phaseRootIds = topics
          .filter(t => t.parent_id === null && getPhaseForTopic(t) === currentPhaseIdx)
          .map(r => r.id);
        const phaseTopics = allChildren.filter(t => phaseRootIds.includes(t.parent_id!));
        const notDone = phaseTopics.filter(t => t.status !== "applied" && t.status !== "done");
        const studying = notDone.filter(t => t.status === "studying");
        const notStarted = notDone.filter(t => t.status === "not_started");
        const todoItems: string[] = [
          ...studying.slice(0, 2).map(t => t.title),
          ...notStarted.slice(0, 3 - Math.min(studying.length, 2)).map(t => t.title),
          ...(!checkins.length ? ["Заполнить первый weekly check-in"] : []),
          ...(checkins.length && (() => {
            const last = new Date(checkins[0].created_at);
            return (Date.now() - last.getTime()) > 6 * 86400000;
          })() ? ["Заполнить weekly check-in за эту неделю"] : []),
        ].slice(0, 5);

        if (!todoItems.length) return null;
        const c = PHASE_COLORS[PHASE_DEFS[currentPhaseIdx].color as keyof typeof PHASE_COLORS];
        return (
          <div className={`bg-white border ${c.border} rounded-2xl overflow-hidden`}>
            <div className={`px-5 py-3.5 ${c.bg} flex items-center gap-2.5 border-b ${c.border}`}>
              <Icon name="Zap" size={15} className="text-slate-700" />
              <span className="text-sm font-bold text-slate-800">Что делать сейчас</span>
              <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full ${c.badge}`}>
                Фаза {currentPhaseIdx + 1} · День {dayNumber}
              </span>
            </div>
            <div className="px-5 py-4 space-y-2">
              {todoItems.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center mt-0.5">
                    <span className="text-[10px] font-bold text-slate-500">{i + 1}</span>
                  </div>
                  <span className="text-sm text-slate-700 leading-snug">{item}</span>
                </div>
              ))}
            </div>
            {/* Осталось освоить */}
            {(() => {
              const remaining = phaseTopics.filter(t => t.status !== "applied" && t.status !== "done");
              const phasePct = phaseTopics.length
                ? Math.round(phaseTopics.reduce((s, t) => s + (WEIGHTS[t.status] ?? 0), 0) / phaseTopics.length * 100)
                : 0;
              const byStatus = {
                not_started: remaining.filter(t => t.status === "not_started").length,
                studying:    remaining.filter(t => t.status === "studying").length,
                understood:  remaining.filter(t => t.status === "understood").length,
              };
              return (
                <div className="px-5 pb-4 border-t border-slate-100 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Осталось освоить</span>
                    <span className="text-xs font-bold text-slate-600">{remaining.length} тем · {phasePct}% фазы</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
                    <div className={`h-full ${c.bar} rounded-full transition-all`} style={{ width: `${phasePct}%` }} />
                  </div>
                  <div className="flex gap-3 text-xs text-slate-500 mb-3">
                    {byStatus.not_started > 0 && <span><span className="font-semibold text-slate-400">{byStatus.not_started}</span> не начато</span>}
                    {byStatus.studying > 0    && <span><span className="font-semibold text-blue-500">{byStatus.studying}</span> изучаю</span>}
                    {byStatus.understood > 0  && <span><span className="font-semibold text-violet-500">{byStatus.understood}</span> понимаю</span>}
                  </div>
                  {remaining.slice(0, 5).map(t => {
                    const st = TOPIC_STATUSES.find(s => s.value === t.status) ?? TOPIC_STATUSES[0];
                    return (
                      <div key={t.id} className="flex items-center gap-2 py-1">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${st.dot}`} />
                        <span className="text-xs text-slate-600 flex-1 truncate">{t.title}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${st.bg} ${st.color}`}>{st.label}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* ── Weekly check-in ─────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center">
              <Icon name="CalendarCheck" size={15} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-800">Weekly check-in</div>
              <div className="text-xs text-slate-400">
                {checkins.length > 0
                  ? `Последний: ${new Date(checkins[0].created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}`
                  : "Ещё не было — начни первый"}
              </div>
            </div>
          </div>
          <button
            onClick={() => { setShowCheckin(!showCheckin); setCheckinResult(""); }}
            className="px-3.5 py-1.5 bg-slate-800 text-white text-xs font-semibold rounded-xl hover:bg-slate-700 transition-colors"
          >
            {showCheckin ? "Свернуть" : "+ Заполнить"}
          </button>
        </div>

        {showCheckin && (
          <div className="px-5 pb-5 space-y-3 border-t border-slate-100 pt-4">
            {[
              { key: "learned",     label: "Что изучено за неделю?",    placeholder: "Темы, материалы, встречи, практика..." },
              { key: "clearer_now", label: "Что стало понятнее?",        placeholder: "Инсайты, ключевые выводы..." },
              { key: "gaps",        label: "Где есть пробелы?",          placeholder: "Что осталось непонятым, где нужно глубже..." },
              { key: "next_focus",  label: "Фокус следующей недели",     placeholder: "3–5 конкретных шагов..." },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{f.label}</label>
                <textarea
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                  rows={2}
                  placeholder={f.placeholder}
                  value={checkinData[f.key as keyof typeof checkinData]}
                  onChange={e => setCheckinData({ ...checkinData, [f.key]: e.target.value })}
                />
              </div>
            ))}
            <div className="flex justify-end">
              <button
                onClick={onCheckinSubmit}
                disabled={checkinLoading || !checkinData.learned.trim()}
                className="flex items-center gap-2 px-5 py-2 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                {checkinLoading
                  ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> AI подводит итог...</>
                  : <><Icon name="Sparkles" size={14} /> Сохранить + AI-саммари</>
                }
              </button>
            </div>
            {checkinResult && (
              <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 text-sm text-violet-900 whitespace-pre-wrap leading-relaxed">
                <div className="text-xs font-semibold text-violet-500 uppercase tracking-wide mb-2">AI-саммари недели</div>
                {checkinResult}
              </div>
            )}
          </div>
        )}

        {/* История check-in'ов */}
        {checkins.length > 0 && (
          <div className="px-5 pb-4 border-t border-slate-100 pt-3 space-y-3">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">История</div>
            {checkins.slice(0, 5).map(c => (
              <div key={c.id} className="rounded-xl border border-slate-100 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">
                    {new Date(c.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{c.learned}</p>
                {c.ai_summary && (
                  <div className="bg-violet-50 rounded-lg px-3 py-2 text-xs text-violet-700 leading-relaxed line-clamp-3">
                    {c.ai_summary}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}