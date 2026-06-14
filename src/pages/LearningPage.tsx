import { useState, useEffect, useRef } from "react";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { learningApi, TOPIC_STATUSES, type TopicStatus } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import LearningOnboarding from "@/components/LearningOnboarding";
import { analytics } from "@/lib/analytics";

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

type Material = {
  title: string;
  source_name?: string;
  source_type?: string;
  trust_level?: "high" | "medium" | "low";
  level?: string;
  description?: string;
  why_recommended?: string;
  access_note?: string;
  source_url?: string | null;
  open_access_url?: string | null;
  source_domain?: string | null;
  link_status?: "verified_official" | "verified_publisher" | "verified_org" | "unverified" | "not_found" | null;
  where_to_find?: string;
};

type TopicPack = {
  explanation?: { what: string; why: string; practical_tip: string };
  terms?: { term: string; definition: string }[];
  materials?: Material[];
  questions?: { question: string }[];
  next_step?: string;
};

type QuizQuestion = {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  concept_tag?: string;
};

type TopicMemory = {
  attempts_count: number;
  last_score: number;
  best_score: number;
  weak_concepts: { tag: string; wrong_count: number }[];
  needs_review: boolean;
  review_priority: "high" | "medium" | "none";
  last_quiz_at?: string | null;
};

type QuizResult = {
  score: number;
  correct: number;
  total: number;
  weak_concepts: { tag: string; wrong_count: number }[];
  wrong_questions: { idx: number; question: string; concept_tag: string; correct: number; chosen: number | null }[];
  needs_review: boolean;
  review_priority: string;
};

type SessionData = {
  intro: string;
  key_points: { point: string; detail: string }[];
  terms: { term: string; definition: string }[];
  reflection_questions?: string[];
  practical_case: string;
  takeaway: string;
  next_step: string;
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

  // Topic Learning Mode
  const [activeTopic, setActiveTopic] = useState<Topic | null>(null);
  const [topicTab, setTopicTab] = useState<"learn" | "session" | "quiz">("learn");
  const [topicPack, setTopicPack] = useState<TopicPack | null>(null);
  const [topicPackLoading, setTopicPackLoading] = useState(false);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionMinutes, setSessionMinutes] = useState(30);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  // Находки
  const [noteContent, setNoteContent] = useState("");
  const [noteKind, setNoteKind] = useState("note");
  const [noteUrl, setNoteUrl] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);

  // Онбординг: показываем первую тему из онбординга сразу
  const [onboardingFirstTopic, setOnboardingFirstTopic] = useState<Topic | null>(null);

  // Memory Layer
  const [topicMemory, setTopicMemory] = useState<TopicMemory | null>(null);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [quizStartTime, setQuizStartTime] = useState<number | null>(null);
  const [reviewTopics, setReviewTopics] = useState<{ topic_id: number; title: string; last_score: number; weak_concepts: { tag: string; wrong_count: number }[]; review_priority: string }[]>([]);

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
    const [topicsData, notesData, progressData, checkinsData, reviewData] = await Promise.all([
      learningApi.getTopics(goalId) as Promise<{ topics: Topic[] }>,
      learningApi.getNotes(goalId) as Promise<{ notes: Note[] }>,
      learningApi.getProgress(goalId) as Promise<{ progress: Progress }>,
      learningApi.getCheckins(goalId).catch(() => ({ checkins: [] })) as Promise<{ checkins: typeof checkins }>,
      learningApi.getReviewTopics(goalId).catch(() => ({ review_topics: [] })) as Promise<{ review_topics: typeof reviewTopics }>,
    ]);
    setTopics(topicsData.topics || []);
    setNotes(notesData.notes || []);
    setProgress(progressData.progress || null);
    setCheckins(checkinsData.checkins || []);
    setReviewTopics(reviewData.review_topics || []);
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

  async function openTopic(topic: Topic) {
    setActiveTopic(topic);
    setTopicTab("learn");
    setTopicPack(null);
    setSessionData(null);
    setQuizQuestions([]);
    setQuizAnswers({});
    setQuizSubmitted(false);
    setQuizResult(null);
    setTopicMemory(null);
    if (!activeGoal) return;
    setTopicPackLoading(true);
    try {
      const data = await learningApi.topicLearn({
        topic_id: topic.id,
        topic_title: topic.title,
        goal_title: activeGoal.title,
        mode: "full",
      }) as { pack: TopicPack; memory?: TopicMemory | null };
      setTopicPack(data.pack);
      setTopicMemory(data.memory || null);
    } catch {
      toast({ title: "AI не смог загрузить тему, попробуй ещё раз", variant: "destructive" });
    } finally {
      setTopicPackLoading(false);
    }
  }

  async function loadSession(minutes: number) {
    if (!activeTopic || !activeGoal) return;
    setSessionLoading(true);
    setSessionData(null);
    try {
      const data = await learningApi.topicLearn({
        topic_id: activeTopic.id,
        topic_title: activeTopic.title,
        goal_title: activeGoal.title,
        mode: "session",
        minutes,
      }) as { session: SessionData };
      setSessionData(data.session);
    } catch {
      toast({ title: "Не удалось загрузить сессию", variant: "destructive" });
    } finally {
      setSessionLoading(false);
    }
  }

  async function loadQuiz() {
    if (!activeTopic || !activeGoal) return;
    setQuizLoading(true);
    setQuizQuestions([]);
    setQuizAnswers({});
    setQuizSubmitted(false);
    setQuizResult(null);
    setQuizStartTime(Date.now());
    try {
      const data = await learningApi.topicLearn({
        topic_id: activeTopic.id,
        topic_title: activeTopic.title,
        goal_title: activeGoal.title,
        mode: "quiz",
      }) as { questions: QuizQuestion[]; memory?: TopicMemory | null };
      setQuizQuestions(data.questions || []);
      if (data.memory) setTopicMemory(data.memory);
    } catch {
      toast({ title: "Не удалось загрузить проверку", variant: "destructive" });
    } finally {
      setQuizLoading(false);
    }
  }

  // Инструкция
  const [showGuide, setShowGuide] = useState(false);

  // Callback: онбординг завершён — цель и первая тема готовы
  async function handleOnboardingDone(goal: Goal, firstTopic: Topic | null) {
    setGoals(prev => {
      const exists = prev.some(g => g.id === goal.id);
      return exists ? prev.map(g => g.id === goal.id ? goal : g) : [goal, ...prev];
    });
    setActiveGoal(goal);
    setOnboardingFirstTopic(firstTopic);
  }

  // Автооткрытие первой темы после онбординга
  useEffect(() => {
    if (!onboardingFirstTopic || !activeGoal) return;
    // Ждём загрузки топиков
    if (topics.length === 0) return;
    const topic = topics.find(t => t.id === onboardingFirstTopic.id) ?? topics.find(t => t.parent_id !== null) ?? topics[0];
    if (topic) {
      openTopic(topic);
      setOnboardingFirstTopic(null);
    }
  }, [topics, onboardingFirstTopic, activeGoal?.id]);

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
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate">Учебный кабинет</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Изучай новые сферы с AI-наставником</p>
          </div>
          <button
            onClick={() => setShowNewGoal(true)}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 active:bg-violet-800 transition-colors flex-shrink-0"
          >
            <Icon name="Plus" size={15} />
            <span className="hidden xs:inline">Новая</span> цель
          </button>
        </div>

        {/* Инструкция */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
          <button
            onClick={() => setShowGuide(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                <Icon name="HelpCircle" size={13} className="text-violet-600" />
              </div>
              <span className="text-sm font-semibold text-slate-700">Как пользоваться AI-коучем?</span>
              <span className="text-[11px] text-slate-400">— нажми, чтобы {showGuide ? "свернуть" : "раскрыть"}</span>
            </div>
            <Icon name={showGuide ? "ChevronUp" : "ChevronDown"} size={16} className="text-slate-400 flex-shrink-0" />
          </button>

          {showGuide && (
            <div className="border-t border-slate-100 px-4 py-4 space-y-4">
              <p className="text-sm text-slate-600 leading-relaxed">
                Этот раздел — твой личный AI-коуч. Он не просто хранит список тем, а <strong>активно тебя учит</strong>: объясняет, подбирает материалы, проводит сессии и проверяет понимание.
              </p>

              <div className="grid sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-xs font-bold text-slate-700 mb-1.5">① Создай учебную цель</p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Нажми <strong>«Новая цель»</strong> и напиши, что хочешь освоить — например: «Основы внутреннего контроля и аудита». AI сам разобьёт цель на этапы и темы.
                  </p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-xs font-bold text-slate-700 mb-1.5">② Нажми «Учить» на теме</p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Наведи на любую тему в плане — появится кнопка <strong>«Учить»</strong>. AI откроет панель с объяснением, источниками и вопросами именно по этой теме.
                  </p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-xs font-bold text-slate-700 mb-1.5">③ Учись в трёх режимах</p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    <strong>📖 Учить</strong> — объяснение + материалы с указанием источника.<br />
                    <strong>⏱ Сессия</strong> — 20/30/45 мин структурированного обучения.<br />
                    <strong>✅ Проверка</strong> — 5 вопросов с разбором ошибок.
                  </p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="p-3 bg-violet-50 rounded-xl border border-violet-100">
                  <p className="text-xs font-bold text-violet-700 mb-1">После изучения темы</p>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Отметь статус темы прямо в панели: <strong>Изучаю → Понимаю → Применяю</strong>. Это обновит прогресс и поможет AI понять, что идти дальше.
                  </p>
                </div>
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                  <p className="text-xs font-bold text-amber-700 mb-1">Вкладка «Наставник»</p>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Там можно задать любой вопрос в свободной форме — AI ответит в контексте твоей учебной цели. Используй для уточнений после сессии.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Icon name="Lightbulb" size={13} className="text-amber-500 flex-shrink-0" />
                <p className="text-xs text-slate-500">
                  <strong>Совет:</strong> начни с создания цели «Основы внутреннего контроля» — AI сразу составит план на несколько недель.
                </p>
              </div>
            </div>
          )}
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
          <LearningOnboarding onGoalCreated={handleOnboardingDone} />
        ) : (
          <div className={`grid grid-cols-1 gap-5 ${activeTopic ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>

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

            {/* Центральная колонка — детали цели */}
            {activeGoal && (
              <div className={`${activeTopic ? "lg:col-span-2" : "lg:col-span-3"} space-y-4`}>

                {/* Прогресс-шапка */}
                {progress && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-snug min-w-0 line-clamp-2">{activeGoal.title}</h2>
                      <span className="text-xl sm:text-2xl font-bold text-violet-600 flex-shrink-0">{progress.percent}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500"
                        style={{ width: `${progress.percent}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-xs text-slate-500">
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
                      <span className="flex items-center gap-1">
                        <Icon name="StickyNote" size={12} />
                        Находок: {progress.notes_count}
                      </span>
                    </div>
                  </div>
                )}

                {/* Вкладки */}
                <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto scrollbar-hide">
                  {(["plan", "notes", "ai", "roadmap"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`px-3 sm:px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all flex-shrink-0 ${
                        tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {t === "plan" ? "📋 План" : t === "notes" ? "📌 Находки" : t === "ai" ? "🤖 Ментор" : "🗓 30/60/90"}
                    </button>
                  ))}
                </div>

                {/* Вкладка: Plan */}
                {tab === "plan" && (
                  <div className="space-y-3">
                    {/* Review-карточка: темы с пробелами */}
                    {reviewTopics.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-2.5">
                        <div className="flex items-center gap-2">
                          <Icon name="RotateCcw" size={13} className="text-amber-600 flex-shrink-0" />
                          <span className="text-xs font-bold text-slate-700">
                            {reviewTopics.length === 1
                              ? "Есть тема, к которой стоит вернуться"
                              : `Есть ${reviewTopics.length} темы, к которым стоит вернуться`}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {reviewTopics.slice(0, 3).map(r => (
                            <button
                              key={r.topic_id}
                              onClick={() => {
                                const t = topics.find(t => t.id === r.topic_id);
                                if (t && activeGoal) {
                                  analytics.learningReviewTopicOpened(activeGoal.id, r.topic_id);
                                  openTopic(t);
                                }
                              }}
                              className="w-full flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-amber-100 hover:border-amber-300 hover:bg-amber-50 transition-colors text-left group"
                            >
                              <span className="text-xs font-medium text-slate-700 leading-snug flex-1">{r.title}</span>
                              <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                                <span className="text-[10px] text-slate-400">{r.last_score}%</span>
                                <Icon name="ChevronRight" size={11} className="text-amber-400 group-hover:text-amber-600 transition-colors" />
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

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
                            <div className="px-3 sm:px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                                  <Icon name="BookOpen" size={13} className="text-white" />
                                </div>
                                <span className="text-sm font-semibold text-slate-800 truncate">{phase.title}</span>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <div className="w-12 sm:w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-violet-500 rounded-full" style={{ width: `${donePct}%` }} />
                                </div>
                                <span className="text-xs text-slate-400">{donePct}%</span>
                              </div>
                            </div>
                            {children.length > 0 && (
                              <div className="divide-y divide-slate-50">
                                {children.map(topic => {
                                  const cur = TOPIC_STATUSES.find(s => s.value === topic.status) ?? TOPIC_STATUSES[0];
                                  const isActive = activeTopic?.id === topic.id;
                                  return (
                                    <div
                                      key={topic.id}
                                      className={`px-4 py-2.5 flex items-center gap-3 transition-colors group cursor-pointer ${
                                        isActive ? "bg-violet-50 border-l-2 border-violet-500" : "hover:bg-slate-50"
                                      }`}
                                      onClick={() => {
                                        const needsReview = reviewTopics.some(r => r.topic_id === topic.id);
                                        if (isActive) { setActiveTopic(null); } else {
                                          if (needsReview && activeGoal) analytics.learningReviewTopicOpened(activeGoal.id, topic.id);
                                          openTopic(topic);
                                        }
                                      }}
                                    >
                                      <div className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${cur.dot}`} />
                                      <span className={`text-sm flex-1 leading-snug min-w-0 ${
                                        isActive ? "text-violet-700 font-medium" :
                                        topic.status === "applied" ? "text-slate-500" : "text-slate-700"
                                      }`}>
                                        {topic.title}
                                        {reviewTopics.find(r => r.topic_id === topic.id) && (
                                          <span className={`ml-1.5 inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                                            reviewTopics.find(r => r.topic_id === topic.id)?.review_priority === "high"
                                              ? "bg-red-50 text-red-600 border-red-200"
                                              : "bg-amber-50 text-amber-600 border-amber-200"
                                          }`}>
                                            <Icon name="AlertCircle" size={8} />
                                            повторить
                                          </span>
                                        )}
                                      </span>
                                      {/* Кнопка «Учить» */}
                                      <button
                                        onClick={e => { e.stopPropagation(); if (isActive) { setActiveTopic(null); } else { openTopic(topic); } }}
                                        className={`flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                                          isActive
                                            ? "bg-violet-100 text-violet-700"
                                            : "opacity-0 group-hover:opacity-100 bg-violet-50 text-violet-600 hover:bg-violet-100"
                                        }`}
                                      >
                                        <Icon name="Sparkles" size={10} />
                                        {isActive ? "Закрыть" : "Учить"}
                                      </button>
                                      {/* 4-уровневый inline-селектор */}
                                      <div className="flex gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
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

            {/* ── Topic Learning Mode — правая панель ── */}
            {activeTopic && (
              <div className="lg:col-span-2 space-y-4">
                {/* Заголовок панели */}
                <div className="bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-violet-200 uppercase tracking-widest mb-1">AI-коуч · Тема</p>
                      <h3 className="text-sm font-bold text-white leading-snug">{activeTopic.title}</h3>
                    </div>
                    <button onClick={() => setActiveTopic(null)} className="flex-shrink-0 w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors">
                      <Icon name="X" size={13} className="text-white" />
                    </button>
                  </div>
                  {/* Вкладки внутри панели */}
                  <div className="flex gap-1 mt-3">
                    {(["learn", "session", "quiz"] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => {
                          setTopicTab(t);
                          if (t === "session" && !sessionData && !sessionLoading) loadSession(sessionMinutes);
                          if (t === "quiz" && quizQuestions.length === 0 && !quizLoading) loadQuiz();
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                          topicTab === t ? "bg-white text-violet-700" : "text-violet-200 hover:text-white hover:bg-white/20"
                        }`}
                      >
                        {t === "learn" ? "📖 Учить" : t === "session" ? "⏱ Сессия" : "✅ Проверка"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Memory: блок "нужно повторить" — если есть память с пробелами */}
                {topicMemory && topicMemory.needs_review && topicTab === "learn" && !topicPackLoading && (
                  <div className={`rounded-2xl p-3.5 space-y-2.5 border ${
                    topicMemory.review_priority === "high"
                      ? "bg-red-50 border-red-200"
                      : "bg-amber-50 border-amber-200"
                  }`}>
                    <div className="flex items-center gap-2">
                      <Icon name="AlertCircle" size={14} className={topicMemory.review_priority === "high" ? "text-red-500" : "text-amber-500"} />
                      <span className="text-xs font-bold text-slate-700">
                        {topicMemory.review_priority === "high" ? "Есть серьёзные пробелы — стоит повторить" : "Есть места, которые стоит закрепить"}
                      </span>
                      <span className="ml-auto text-[10px] font-semibold text-slate-400">
                        Последний результат: {topicMemory.last_score}%
                      </span>
                    </div>
                    {topicMemory.weak_concepts.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {topicMemory.weak_concepts.slice(0, 3).map(w => (
                          <span key={w.tag} className="text-[10px] font-medium bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                            {w.tag.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => {
                          if (activeGoal && activeTopic) analytics.learningReviewSessionStarted(activeGoal.id, activeTopic.id, 20);
                          setTopicTab("session");
                          setSessionMinutes(20);
                          if (!sessionData && !sessionLoading) loadSession(20);
                        }}
                        className="flex-1 flex items-center justify-center gap-1 text-[10px] font-bold py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
                      >
                        <Icon name="PlayCircle" size={11} />
                        Сессия по пробелам
                      </button>
                      <button
                        onClick={() => {
                          if (activeGoal && activeTopic) analytics.learningReviewQuizRetaken(activeGoal.id, activeTopic.id);
                          setTopicTab("quiz");
                          loadQuiz();
                        }}
                        className="flex-1 flex items-center justify-center gap-1 text-[10px] font-semibold py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <Icon name="RotateCcw" size={11} />
                        Проверить снова
                      </button>
                    </div>
                  </div>
                )}

                {/* CTA: первая сессия — показывается всегда на вкладке Учить поверх контента */}
                {topicTab === "learn" && !topicPackLoading && topicPack && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        analytics.learningFirstSessionStarted(activeGoal!.id, activeTopic.id, 20);
                        setTopicTab("session");
                        setSessionMinutes(20);
                        if (!sessionData && !sessionLoading) loadSession(20);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                    >
                      <Icon name="PlayCircle" size={15} />
                      Начать 20-мин сессию
                    </button>
                    <button
                      onClick={() => {
                        setTopicTab("quiz");
                        if (quizQuestions.length === 0 && !quizLoading) loadQuiz();
                      }}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
                    >
                      <Icon name="CheckSquare" size={14} />
                      Проверить
                    </button>
                  </div>
                )}

                {/* Вкладка: Учить */}
                {topicTab === "learn" && (
                  <div className="space-y-3">
                    {topicPackLoading ? (
                      <div className="bg-white border border-slate-200 rounded-2xl p-8 flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-sm text-slate-500">AI изучает тему и готовит пакет...</p>
                      </div>
                    ) : topicPack ? (
                      <>
                        {/* Объяснение */}
                        {topicPack.explanation && (
                          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center">
                                <Icon name="BookOpen" size={13} className="text-violet-600" />
                              </div>
                              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Объяснение</span>
                            </div>
                            <p className="text-sm text-slate-800 leading-relaxed">{topicPack.explanation.what}</p>
                            {topicPack.explanation.why && (
                              <div className="p-3 bg-violet-50 rounded-xl border border-violet-100">
                                <p className="text-xs font-semibold text-violet-700 mb-0.5">Почему важно</p>
                                <p className="text-xs text-slate-700 leading-relaxed">{topicPack.explanation.why}</p>
                              </div>
                            )}
                            {topicPack.explanation.practical_tip && (
                              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                                <p className="text-xs font-semibold text-emerald-700 mb-0.5">Практический совет</p>
                                <p className="text-xs text-slate-700 leading-relaxed">{topicPack.explanation.practical_tip}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Термины */}
                        {topicPack.terms && topicPack.terms.length > 0 && (
                          <div className="bg-white border border-slate-200 rounded-2xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center">
                                <Icon name="BookMarked" size={13} className="text-amber-600" />
                              </div>
                              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Ключевые термины</span>
                            </div>
                            <div className="space-y-2">
                              {topicPack.terms.map((t, i) => (
                                <div key={i} className="flex gap-2">
                                  <span className="text-xs font-semibold text-slate-700 flex-shrink-0 min-w-[90px]">{t.term}</span>
                                  <span className="text-xs text-slate-500 leading-snug">{t.definition}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Материалы */}
                        {topicPack.materials && topicPack.materials.length > 0 && (
                          <div className="bg-white border border-slate-200 rounded-2xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center">
                                <Icon name="Library" size={13} className="text-blue-600" />
                              </div>
                              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Рекомендуемые материалы</span>
                            </div>
                            <div className="space-y-3">
                              {topicPack.materials.map((m, i) => {
                                const trustColor = m.trust_level === "high"
                                  ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                  : m.trust_level === "medium"
                                  ? "bg-amber-100 text-amber-700 border-amber-200"
                                  : "bg-slate-100 text-slate-500 border-slate-200";
                                const trustLabel = m.trust_level === "high" ? "★ Надёжный" : m.trust_level === "medium" ? "◆ Средний" : "○ Прочее";
                                const typeLabel: Record<string, string> = {
                                  official_framework: "Фреймворк",
                                  official_guidance: "Гайданс",
                                  professional_standard: "Стандарт",
                                  academic: "Академический",
                                  consulting_overview: "Консалтинг",
                                  book: "Книга",
                                  course: "Курс",
                                  tool: "Инструмент",
                                };
                                const isVerified = m.link_status === "verified_official" || m.link_status === "verified_publisher" || m.link_status === "verified_org";
                                const verifiedUrl = m.source_url || m.open_access_url;
                                const linkBadge = isVerified
                                  ? m.link_status === "verified_official"
                                    ? { label: "Офиц. источник", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" }
                                    : { label: "Проверено", cls: "bg-blue-50 text-blue-700 border-blue-200" }
                                  : null;
                                return (
                                  <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                                    {/* Заголовок + trust badge */}
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="text-xs font-semibold text-slate-800 leading-snug flex-1">{m.title}</p>
                                      <span className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border ${trustColor}`}>
                                        {trustLabel}
                                      </span>
                                    </div>
                                    {/* Source name + type + verified badge */}
                                    {m.source_name && (
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-[10px] font-semibold text-slate-500">{m.source_name}</span>
                                        {m.source_type && (
                                          <span className="text-[9px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">
                                            {typeLabel[m.source_type] || m.source_type}
                                          </span>
                                        )}
                                        {linkBadge && (
                                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${linkBadge.cls}`}>
                                            <Icon name="ShieldCheck" size={8} />
                                            {linkBadge.label}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                    {/* Описание */}
                                    {(m.description || m.why_recommended) && (
                                      <p className="text-[11px] text-slate-600 leading-snug">{m.why_recommended || m.description}</p>
                                    )}
                                    {/* Ссылки */}
                                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                                      {isVerified && verifiedUrl ? (
                                        <>
                                          <a
                                            href={verifiedUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1 text-[10px] font-semibold text-white bg-violet-600 hover:bg-violet-700 px-2 py-1 rounded-lg transition-colors active:opacity-80"
                                          >
                                            <Icon name="ExternalLink" size={9} />
                                            Открыть источник
                                          </a>
                                          {m.open_access_url && m.open_access_url !== verifiedUrl && (
                                            <a
                                              href={m.open_access_url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1 rounded-lg transition-colors"
                                            >
                                              <Icon name="Unlock" size={9} />
                                              Open access
                                            </a>
                                          )}
                                        </>
                                      ) : m.access_note ? (
                                        <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                          <Icon name="MapPin" size={9} />
                                          {m.access_note}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Вопросы для самопроверки */}
                        {topicPack.questions && topicPack.questions.length > 0 && (
                          <div className="bg-white border border-slate-200 rounded-2xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center">
                                <Icon name="HelpCircle" size={13} className="text-indigo-600" />
                              </div>
                              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Вопросы для размышления</span>
                            </div>
                            <div className="space-y-2">
                              {topicPack.questions.map((q, i) => (
                                <div key={i} className="flex gap-2 text-xs text-slate-700">
                                  <span className="text-slate-400 flex-shrink-0">{i + 1}.</span>
                                  <span className="leading-snug">{q.question}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Next step */}
                        {topicPack.next_step && (
                          <div className="flex items-start gap-3 px-4 py-3 bg-indigo-50 rounded-2xl border border-indigo-100">
                            <Icon name="ArrowRight" size={15} className="text-indigo-500 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-semibold text-indigo-700 mb-0.5">Следующий шаг</p>
                              <p className="text-xs text-slate-700 leading-snug">{topicPack.next_step}</p>
                            </div>
                          </div>
                        )}

                        {/* Кнопка обновить статус */}
                        <div className="flex flex-wrap gap-2">
                          {TOPIC_STATUSES.filter(s => s.value !== "not_started").map(s => (
                            <button
                              key={s.value}
                              onClick={() => handleTopicStatus(activeTopic, s.value)}
                              className={`flex-1 min-w-[60px] py-2 rounded-xl text-xs font-semibold transition-all ${
                                activeTopic.status === s.value
                                  ? `${s.bg} ${s.color} ring-1 ring-current`
                                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                              }`}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                )}

                {/* Вкладка: Сессия */}
                {topicTab === "session" && (
                  <div className="space-y-3">
                    {!sessionData && !sessionLoading && (
                      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                        <p className="text-sm font-semibold text-slate-800">Выбери длину сессии</p>
                        <div className="flex gap-2">
                          {[20, 30, 45].map(m => (
                            <button
                              key={m}
                              onClick={() => setSessionMinutes(m)}
                              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
                                sessionMinutes === m ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                              }`}
                            >
                              {m} мин
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => loadSession(sessionMinutes)}
                          className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-colors"
                        >
                          <Icon name="Sparkles" size={15} />
                          Начать сессию
                        </button>
                      </div>
                    )}

                    {sessionLoading && (
                      <div className="bg-white border border-slate-200 rounded-2xl p-8 flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-sm text-slate-500">AI готовит учебную сессию...</p>
                      </div>
                    )}

                    {sessionData && (
                      <>
                        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4">
                          {/* Введение */}
                          <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Введение</p>
                            <p className="text-sm text-slate-800 leading-relaxed">{sessionData.intro}</p>
                          </div>
                          {/* Ключевые тезисы */}
                          {sessionData.key_points?.length > 0 && (
                            <div>
                              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Ключевые тезисы</p>
                              <div className="space-y-2">
                                {sessionData.key_points.map((kp, i) => (
                                  <div key={i} className="p-3 bg-slate-50 rounded-xl">
                                    <p className="text-xs font-semibold text-slate-800">{kp.point}</p>
                                    <p className="text-xs text-slate-500 mt-0.5 leading-snug">{kp.detail}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Термины */}
                          {sessionData.terms?.length > 0 && (
                            <div>
                              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Термины сессии</p>
                              <div className="space-y-1.5">
                                {sessionData.terms.map((t, i) => (
                                  <div key={i} className="flex gap-2 text-xs">
                                    <span className="font-semibold text-slate-700 flex-shrink-0">{t.term} —</span>
                                    <span className="text-slate-500 leading-snug">{t.definition}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Практический кейс */}
                          {sessionData.practical_case && (
                            <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                              <p className="text-xs font-semibold text-amber-700 mb-1">Практический сценарий</p>
                              <p className="text-xs text-slate-700 leading-snug">{sessionData.practical_case}</p>
                            </div>
                          )}
                          {/* Вопросы для рефлексии */}
                          {sessionData.reflection_questions && sessionData.reflection_questions.length > 0 && (
                            <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                              <p className="text-xs font-semibold text-indigo-700 mb-2">Подумай сам</p>
                              <div className="space-y-1.5">
                                {sessionData.reflection_questions.map((q, i) => (
                                  <div key={i} className="flex gap-2 text-xs text-slate-700">
                                    <span className="text-indigo-400 flex-shrink-0">→</span>
                                    <span className="leading-snug">{q}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Вывод */}
                          {sessionData.takeaway && (
                            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                              <p className="text-xs font-semibold text-emerald-700 mb-1">Главный вывод</p>
                              <p className="text-xs text-slate-800 font-medium leading-snug">{sessionData.takeaway}</p>
                            </div>
                          )}
                          {sessionData.next_step && (
                            <div className="flex items-start gap-2 text-xs text-slate-600">
                              <Icon name="ArrowRight" size={13} className="text-violet-500 flex-shrink-0 mt-0.5" />
                              <span><strong>Дальше:</strong> {sessionData.next_step}</span>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => { setSessionData(null); }}
                          className="w-full py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-200 transition-colors"
                        >
                          Повторить сессию
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Вкладка: Проверка */}
                {topicTab === "quiz" && (
                  <div className="space-y-3">
                    {quizLoading && (
                      <div className="bg-white border border-slate-200 rounded-2xl p-8 flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-sm text-slate-500">AI составляет вопросы...</p>
                      </div>
                    )}

                    {!quizLoading && quizQuestions.length === 0 && (
                      <div className="bg-white border border-slate-200 rounded-2xl p-5 text-center space-y-3">
                        <Icon name="HelpCircle" size={28} className="text-slate-300 mx-auto" />
                        <p className="text-sm text-slate-500">AI составит 5 вопросов по теме</p>
                        <button onClick={loadQuiz} className="w-full py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-colors">
                          Начать проверку
                        </button>
                      </div>
                    )}

                    {quizQuestions.length > 0 && (
                      <>
                        <div className="space-y-3">
                          {quizQuestions.map((q, qi) => (
                            <div key={qi} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                              <p className="text-sm font-semibold text-slate-800 leading-snug">{qi + 1}. {q.question}</p>
                              <div className="space-y-1.5">
                                {q.options.map((opt, oi) => {
                                  const chosen = quizAnswers[qi] === oi;
                                  const isCorrect = q.correct === oi;
                                  const showResult = quizSubmitted;
                                  return (
                                    <button
                                      key={oi}
                                      disabled={quizSubmitted}
                                      onClick={() => !quizSubmitted && setQuizAnswers(prev => ({ ...prev, [qi]: oi }))}
                                      className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-all border ${
                                        showResult && isCorrect ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold" :
                                        showResult && chosen && !isCorrect ? "bg-red-50 border-red-300 text-red-700" :
                                        chosen ? "bg-violet-50 border-violet-300 text-violet-800" :
                                        "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                                      }`}
                                    >
                                      {opt}
                                    </button>
                                  );
                                })}
                              </div>
                              {quizSubmitted && q.explanation && (
                                <div className={`p-2.5 rounded-lg text-[11px] leading-snug ${
                                  quizAnswers[qi] === q.correct ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
                                }`}>
                                  {q.explanation}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {!quizSubmitted ? (
                          <button
                            onClick={async () => {
                              setQuizSubmitted(true);
                              if (!activeGoal || !activeTopic) return;
                              const duration = quizStartTime ? Math.round((Date.now() - quizStartTime) / 1000) : undefined;
                              const answersMap: Record<string, number> = {};
                              Object.entries(quizAnswers).forEach(([k, v]) => { answersMap[k] = v; });
                              try {
                                const res = await learningApi.saveQuizResult({
                                  goal_id: activeGoal.id,
                                  topic_id: activeTopic.id,
                                  quiz_payload: quizQuestions,
                                  user_answers: answersMap,
                                  duration_sec: duration,
                                }) as QuizResult;
                                setQuizResult(res);
                                analytics.learningQuizCompleted(activeGoal.id, activeTopic.id, res.score, res.total);
                                if (res.needs_review) {
                                  analytics.learningMemoryFlaggedReview(activeGoal.id, activeTopic.id, res.review_priority);
                                  // Обновляем reviewTopics
                                  const rd = await learningApi.getReviewTopics(activeGoal.id) as { review_topics: typeof reviewTopics };
                                  setReviewTopics(rd.review_topics || []);
                                }
                              } catch {
                                // Тихий фолбек: quiz работает, память просто не сохранилась
                              }
                            }}
                            disabled={Object.keys(quizAnswers).length < quizQuestions.length}
                            className="w-full py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-40 transition-colors"
                          >
                            Проверить ответы
                          </button>
                        ) : (
                          <div className="space-y-3">
                            {/* Score card */}
                            <div className={`rounded-2xl p-4 space-y-3 ${
                              quizResult && quizResult.score >= 80 ? "bg-emerald-50 border border-emerald-200"
                              : quizResult && quizResult.score >= 60 ? "bg-amber-50 border border-amber-200"
                              : "bg-red-50 border border-red-200"
                            }`}>
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Результат</p>
                                  <p className="text-2xl font-bold text-slate-900 mt-0.5">
                                    {quizResult ? `${quizResult.score}%` : `${Object.entries(quizAnswers).filter(([qi, oi]) => quizQuestions[+qi]?.correct === oi).length} / ${quizQuestions.length}`}
                                  </p>
                                </div>
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                                  quizResult && quizResult.score >= 80 ? "bg-emerald-100"
                                  : quizResult && quizResult.score >= 60 ? "bg-amber-100"
                                  : "bg-red-100"
                                }`}>
                                  <Icon name={quizResult && quizResult.score >= 80 ? "Trophy" : quizResult && quizResult.score >= 60 ? "AlertCircle" : "Target"} size={22}
                                    className={quizResult && quizResult.score >= 80 ? "text-emerald-600" : quizResult && quizResult.score >= 60 ? "text-amber-600" : "text-red-500"} />
                                </div>
                              </div>

                              {/* Слабые концепты */}
                              {quizResult && quizResult.weak_concepts.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-slate-600 mb-1.5">Стоит повторить:</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {quizResult.weak_concepts.map(w => (
                                      <span key={w.tag} className="text-[10px] font-medium bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                                        {w.tag.replace(/_/g, " ")}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Рекомендация */}
                              {quizResult && quizResult.needs_review && (
                                <p className="text-xs text-slate-600 leading-snug">
                                  {quizResult.score < 60
                                    ? "Рекомендую пройти сессию по этой теме ещё раз — есть пробелы, которые стоит закрыть."
                                    : "Неплохо! Есть несколько аспектов, которые стоит повторить для уверенного понимания."}
                                </p>
                              )}
                            </div>

                            {/* CTA кнопки */}
                            <div className="flex gap-2">
                              {quizResult && quizResult.needs_review && (
                                <button
                                  onClick={() => {
                                    if (activeGoal && activeTopic) analytics.learningReviewSessionStarted(activeGoal.id, activeTopic.id, 20);
                                    setTopicTab("session");
                                    setSessionMinutes(20);
                                    if (!sessionData && !sessionLoading) loadSession(20);
                                  }}
                                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-violet-600 text-white rounded-xl text-xs font-bold hover:bg-violet-700 transition-colors"
                                >
                                  <Icon name="PlayCircle" size={13} />
                                  Сессия по пробелам
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  if (activeGoal && activeTopic) analytics.learningReviewQuizRetaken(activeGoal.id, activeTopic.id);
                                  loadQuiz();
                                }}
                                className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-200 transition-colors"
                              >
                                Пройти ещё раз
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
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