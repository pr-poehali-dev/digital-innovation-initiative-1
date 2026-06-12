import { useState, useEffect } from "react";
import Icon from "@/components/ui/icon";
import { learningApi } from "@/lib/api";
import { analytics } from "@/lib/analytics";
import { useToast } from "@/hooks/use-toast";

type Topic = {
  id: number;
  parent_id: number | null;
  title: string;
  description?: string;
  order_index: number;
  status: string;
};

type Goal = {
  id: number;
  title: string;
  description?: string;
  status: string;
  ai_plan?: unknown;
  created_at: string;
};

type Props = {
  onGoalCreated: (goal: Goal, firstTopic: Topic | null) => void;
};

const TEMPLATES = [
  { id: "internal_control", label: "Внутренний контроль", icon: "ShieldCheck", title: "Основы внутреннего контроля", desc: "Хочу разобраться в принципах и инструментах внутреннего контроля для применения в своей функции." },
  { id: "internal_audit", label: "Внутренний аудит", icon: "Search", title: "Внутренний аудит", desc: "Хочу освоить методологию внутреннего аудита, понять как планировать и проводить проверки." },
  { id: "project_management", label: "Управление проектами", icon: "FolderKanban", title: "Управление проектами", desc: "Хочу научиться управлять проектами: планирование, риски, команда, delivery." },
  { id: "operations", label: "Операционный менеджмент", icon: "Settings2", title: "Операционный менеджмент", desc: "Хочу понять операционные процессы, метрики эффективности и инструменты оптимизации." },
  { id: "ai_for_function", label: "AI в работе", icon: "Sparkles", title: "Применение AI в профессиональной деятельности", desc: "Хочу научиться применять AI-инструменты для автоматизации и повышения эффективности в своей функции." },
  { id: "risk_management", label: "Управление рисками", icon: "AlertTriangle", title: "Управление рисками", desc: "Хочу разобраться в методологии управления рисками: идентификация, оценка, реагирование." },
];

type Phase = "idle" | "creating" | "generating" | "done" | "error";

export default function LearningOnboarding({ onGoalCreated }: Props) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [loadingStep, setLoadingStep] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [goalRef, setGoalRef] = useState<Goal | null>(null);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    analytics.learningOnboardingViewed();
  }, []);

  // Анимация шагов загрузки
  useEffect(() => {
    if (phase !== "generating") return;
    const steps = [0, 1, 2];
    let i = 0;
    const iv = setInterval(() => {
      i = (i + 1) % steps.length;
      setLoadingStep(i);
    }, 1800);
    return () => clearInterval(iv);
  }, [phase]);

  function applyTemplate(tpl: typeof TEMPLATES[0]) {
    setSelectedTemplate(tpl.id);
    setTitle(tpl.title);
    setDesc(tpl.desc);
    if (!hasStarted) {
      setHasStarted(true);
      analytics.learningGoalStarted("template", tpl.id);
    }
  }

  function handleTitleChange(v: string) {
    setTitle(v);
    setSelectedTemplate(null);
    if (!hasStarted && v.length > 2) {
      setHasStarted(true);
      analytics.learningGoalStarted("free_input");
    }
  }

  async function handleSubmit() {
    if (!title.trim()) return;
    setErrorMsg("");
    setPhase("creating");

    let goal: Goal | null = null;
    try {
      const data = await learningApi.createGoal(title.trim(), desc.trim()) as { goal: Goal };
      goal = data.goal;
      setGoalRef(goal);
      analytics.learningGoalCreated(goal.id, selectedTemplate ? "template" : "free_input", selectedTemplate ?? undefined);
    } catch {
      setPhase("error");
      setErrorMsg("Не удалось создать цель. Попробуй ещё раз.");
      return;
    }

    setPhase("generating");
    setLoadingStep(0);

    let topicsCount = 0;
    try {
      await learningApi.generatePlan(title.trim(), desc.trim(), goal.id);
      const topicsData = await learningApi.getTopics(goal.id) as { topics: Topic[] };
      topicsCount = topicsData.topics?.length ?? 0;
      analytics.learningPlanGenerated(goal.id, topicsCount);

      // Получаем обновлённую цель с ai_plan
      const fresh = await learningApi.getGoals() as { goals: Goal[] };
      const freshGoal = fresh.goals.find(g => g.id === goal!.id) ?? goal!;

      // Первая тема (не-родительская, если есть, иначе первая)
      const allTopics = topicsData.topics ?? [];
      const leaves = allTopics.filter(t => !allTopics.some(c => c.parent_id === t.id));
      const firstTopic = leaves[0] ?? allTopics[0] ?? null;

      if (firstTopic) {
        analytics.learningFirstTopicOpened(goal.id, firstTopic.id, firstTopic.title);
      }

      setPhase("done");
      onGoalCreated(freshGoal, firstTopic);
    } catch {
      setPhase("error");
      setErrorMsg("AI не смог сгенерировать план. Попробуй ещё раз — иногда нужно пара попыток.");
    }
  }

  async function handleRetry() {
    if (!goalRef) {
      setPhase("idle");
      setErrorMsg("");
      return;
    }
    setErrorMsg("");
    setPhase("generating");
    setLoadingStep(0);
    try {
      await learningApi.generatePlan(title.trim(), desc.trim(), goalRef.id);
      const topicsData = await learningApi.getTopics(goalRef.id) as { topics: Topic[] };
      const topicsCount = topicsData.topics?.length ?? 0;
      analytics.learningPlanGenerated(goalRef.id, topicsCount);

      const fresh = await learningApi.getGoals() as { goals: Goal[] };
      const freshGoal = fresh.goals.find(g => g.id === goalRef!.id) ?? goalRef!;

      const allTopics = topicsData.topics ?? [];
      const leaves = allTopics.filter(t => !allTopics.some(c => c.parent_id === t.id));
      const firstTopic = leaves[0] ?? allTopics[0] ?? null;

      if (firstTopic) {
        analytics.learningFirstTopicOpened(goalRef.id, firstTopic.id, firstTopic.title);
      }

      setPhase("done");
      onGoalCreated(freshGoal, firstTopic);
    } catch {
      setPhase("error");
      setErrorMsg("AI снова не ответил. Проверь соединение и попробуй ещё раз.");
      toast({ title: "Не удалось сгенерировать план", variant: "destructive" });
    }
  }

  const loadingMessages = [
    "AI составляет маршрут обучения…",
    "Определяем ключевые темы и этапы…",
    "Готовим первую тему для старта…",
  ];

  // ── Экран загрузки ───────────────────────────────────────────────────
  if (phase === "creating" || phase === "generating") {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 space-y-6">
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 rounded-full bg-violet-100 animate-pulse" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon name="Sparkles" size={36} className="text-violet-500" />
          </div>
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-lg font-bold text-slate-900">
            {phase === "creating" ? "Создаём цель…" : loadingMessages[loadingStep]}
          </h2>
          <p className="text-sm text-slate-500">Обычно занимает 10–20 секунд</p>
        </div>
        <div className="flex gap-1.5">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all duration-500 ${
                i === loadingStep ? "bg-violet-500 scale-125" : "bg-violet-200"
              }`}
            />
          ))}
        </div>
        <div className="max-w-xs w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
          <div
            className="h-full bg-violet-500 rounded-full transition-all duration-700"
            style={{ width: phase === "creating" ? "20%" : `${30 + loadingStep * 25}%` }}
          />
        </div>
      </div>
    );
  }

  // ── Экран ошибки ─────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 space-y-5 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
          <Icon name="AlertCircle" size={32} className="text-red-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Что-то пошло не так</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-sm">{errorMsg}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setPhase("idle"); setErrorMsg(""); setGoalRef(null); }}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
          >
            Изменить цель
          </button>
          <button
            onClick={handleRetry}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition-colors font-medium"
          >
            <Icon name="RefreshCw" size={14} />
            Попробовать ещё раз
          </button>
        </div>
      </div>
    );
  }

  // ── Главный экран ────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Hero-блок */}
      <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 p-6 text-white relative overflow-hidden">
        <div className="absolute right-0 top-0 w-40 h-40 rounded-full bg-white/5 translate-x-12 -translate-y-12 pointer-events-none" />
        <div className="absolute right-10 bottom-0 w-24 h-24 rounded-full bg-white/5 translate-y-8 pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
              <Icon name="GraduationCap" size={16} className="text-white" />
            </div>
            <span className="text-sm font-semibold text-violet-200">Учебный кабинет</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold mb-2 leading-tight">
            Начнём обучение с конкретной цели
          </h1>
          <p className="text-sm text-violet-200 leading-relaxed">
            AI составит персональный маршрут, объяснит каждую тему, подберёт источники и проверит понимание.
          </p>
          <div className="flex flex-wrap gap-3 mt-4">
            {[
              { icon: "Map", text: "Персональный план" },
              { icon: "BookOpen", text: "AI-объяснения" },
              { icon: "CheckSquare", text: "Проверка знаний" },
            ].map(f => (
              <div key={f.text} className="flex items-center gap-1.5 text-xs text-violet-100">
                <Icon name={f.icon} size={12} />
                {f.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Шаблоны */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2.5">
          Быстрый старт — выбери тему
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {TEMPLATES.map(tpl => (
            <button
              key={tpl.id}
              onClick={() => applyTemplate(tpl)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all active:scale-95 ${
                selectedTemplate === tpl.id
                  ? "bg-violet-50 border-violet-300 shadow-sm"
                  : "bg-white border-slate-200 hover:border-violet-200 hover:bg-slate-50"
              }`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                selectedTemplate === tpl.id ? "bg-violet-600" : "bg-slate-100"
              }`}>
                <Icon
                  name={tpl.icon}
                  size={14}
                  className={selectedTemplate === tpl.id ? "text-white" : "text-slate-500"}
                />
              </div>
              <span className={`text-xs font-medium leading-tight ${
                selectedTemplate === tpl.id ? "text-violet-700" : "text-slate-700"
              }`}>
                {tpl.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Форма */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
            <Icon name="Target" size={13} className="text-violet-600" />
          </div>
          <span className="text-sm font-semibold text-slate-800">Или опиши свою цель</span>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Что хочешь освоить?
            </label>
            <input
              className="mt-1.5 w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 transition-shadow"
              placeholder="Например: управление проектами, финансовый анализ…"
              value={title}
              onChange={e => handleTitleChange(e.target.value)}
              onKeyDown={e => e.key === "Enter" && title.trim() && handleSubmit()}
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Для какой роли / контекст <span className="font-normal normal-case text-slate-400">(необязательно)</span>
            </label>
            <textarea
              className="mt-1.5 w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none transition-shadow"
              rows={2}
              placeholder="Например: внутренний аудитор, хочу перейти в PM, 3 года в operations…"
              value={desc}
              onChange={e => setDesc(e.target.value)}
            />
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!title.trim() || phase !== "idle"}
          className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors active:scale-[0.98] text-sm"
        >
          <Icon name="Sparkles" size={16} />
          Собрать мой план
        </button>

        <p className="text-xs text-slate-400 text-center">
          AI составит маршрут, разобьёт на темы и автоматически откроет первую из них
        </p>
      </div>
    </div>
  );
}
