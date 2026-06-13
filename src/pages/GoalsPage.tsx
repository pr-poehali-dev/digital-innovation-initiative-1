import { useState, useEffect, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { goalsApi, learningPackApi } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Goal {
  id: number;
  title: string;
  target_role: string | null;
  goal_type: string;
  description: string | null;
  priority: string;
  deadline: string | null;
  status: string;
  ai_target_profile_json: Competency[] | null;
  ai_gap_analysis_json: GapData | null;
  ai_analyzed_at: string | null;
  created_at: string;
  learning_path?: LearningPath | null;
}

interface Competency {
  name: string;
  target_level: string;
  reason: string;
}

interface GapItem {
  name: string;
  status: "has" | "partial" | "missing";
  evidence: string;
}

interface Milestone {
  id: number;
  title: string;
  description: string | null;
  due_date: string | null;
  sort_order: number;
  status: "planned" | "in_progress" | "done";
}

interface LearningPath {
  id: number;
  title: string;
  summary: string | null;
  milestones: Milestone[];
}

interface GapData {
  gap_analysis: GapItem[];
  summary: string;
  recommended_milestones: { title: string; description: string; timeframe: string }[];
}

interface Material {
  id: number;
  mm_id: number;
  url: string;
  domain: string;
  title: string;
  description: string | null;
  source_type: string;
  trust_level: string;
  trust_label: string;
  trust_color: string;
  format: string;
  estimated_minutes: number | null;
  relevance_score: number;
  selection_reason: string | null;
  progress_status: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GOAL_TYPES = [
  { value: "profession", label: "Целевая профессия" },
  { value: "skill", label: "Развитие навыка" },
  { value: "exam", label: "Подготовка к экзамену" },
  { value: "self_study", label: "Самообразование" },
];

const PRIORITIES = [
  { value: "high", label: "Высокий", color: "text-red-600 bg-red-50" },
  { value: "medium", label: "Средний", color: "text-amber-600 bg-amber-50" },
  { value: "low", label: "Низкий", color: "text-slate-500 bg-slate-100" },
];

const GAP_COLORS: Record<string, string> = {
  has: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-700",
  missing: "bg-red-100 text-red-600",
};
const GAP_LABELS: Record<string, string> = { has: "Есть", partial: "Частично", missing: "Нет" };

const MS_STATUS_COLORS: Record<string, string> = {
  planned: "bg-slate-100 text-slate-600",
  in_progress: "bg-blue-100 text-blue-700",
  done: "bg-emerald-100 text-emerald-700",
};

const TRUST_BADGE: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  B: "bg-blue-100 text-blue-700 border border-blue-200",
  C: "bg-slate-100 text-slate-500 border border-slate-200",
};

const FORMAT_ICON: Record<string, string> = {
  article: "FileText", course: "GraduationCap", video: "Play",
  book: "BookOpen", doc: "File", report: "BarChart2", lecture: "Mic",
};

const PROGRESS_LABELS: Record<string, string> = {
  new: "Не открыто", opened: "Открыто", in_progress: "Изучаю", done: "Изучено", saved: "Сохранено",
};
const PROGRESS_COLORS: Record<string, string> = {
  new: "text-slate-400", opened: "text-slate-500", in_progress: "text-blue-600",
  done: "text-emerald-600", saved: "text-violet-600",
};

// ── GoalsPage ─────────────────────────────────────────────────────────────────

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingPath, setGeneratingPath] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await goalsApi.list() as { goals: Goal[] };
      setGoals(res.goals || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openGoal = async (id: number) => {
    try {
      const res = await goalsApi.get(id) as { goal: Goal };
      setSelectedGoal(res.goal);
    } catch (e) { console.error(e); }
  };

  const handleAnalyze = async (goalId: number) => {
    setAnalyzing(true);
    try {
      const res = await goalsApi.analyze(goalId) as { goal_id: number };
      await openGoal(res.goal_id);
      load();
    } catch (e) { alert("Ошибка AI-анализа: " + (e as Error).message); }
    finally { setAnalyzing(false); }
  };

  const handleGeneratePath = async (goalId: number) => {
    setGeneratingPath(true);
    try {
      await goalsApi.generatePath(goalId);
      await openGoal(goalId);
    } catch (e) { alert("Ошибка построения плана: " + (e as Error).message); }
    finally { setGeneratingPath(false); }
  };

  const handleMilestoneStatus = async (msId: number, status: string, goalId: number) => {
    try {
      await goalsApi.updateMilestone(msId, status);
      await openGoal(goalId);
    } catch (e) { console.error(e); }
  };

  const handleArchive = async (goalId: number) => {
    if (!confirm("Архивировать цель?")) return;
    try {
      await goalsApi.archive(goalId);
      setSelectedGoal(null);
      load();
    } catch (e) { console.error(e); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Мои цели</h1>
          <p className="text-sm text-slate-500 mt-0.5">Поставь цель — AI построит план и подберёт материалы</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          <Icon name="Plus" size={16} />
          Добавить цель
        </button>
      </div>

      {goals.length === 0 && !showCreate && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Icon name="Target" size={32} className="text-violet-600" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Пока нет целей</h2>
          <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
            Добавь первую цель — AI проанализирует паспорт, покажет gaps и подберёт реальные материалы для изучения
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors"
          >
            Создать первую цель
          </button>
        </div>
      )}

      {goals.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {goals.map(g => (
            <GoalCard key={g.id} goal={g} onClick={() => openGoal(g.id)} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateGoalModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => { setShowCreate(false); load(); openGoal(id); }}
        />
      )}

      {selectedGoal && (
        <GoalDetail
          goal={selectedGoal}
          analyzing={analyzing}
          generatingPath={generatingPath}
          onClose={() => setSelectedGoal(null)}
          onAnalyze={() => handleAnalyze(selectedGoal.id)}
          onGeneratePath={() => handleGeneratePath(selectedGoal.id)}
          onMilestoneStatus={(msId, status) => handleMilestoneStatus(msId, status, selectedGoal.id)}
          onArchive={() => handleArchive(selectedGoal.id)}
          onUpdated={() => { openGoal(selectedGoal.id); load(); }}
        />
      )}
    </div>
  );
}

// ── GoalCard ──────────────────────────────────────────────────────────────────

function GoalCard({ goal, onClick }: { goal: Goal; onClick: () => void }) {
  const priority = PRIORITIES.find(p => p.value === goal.priority);
  const goalType = GOAL_TYPES.find(t => t.value === goal.goal_type);
  const hasAnalysis = !!goal.ai_analyzed_at;
  const gaps = goal.ai_gap_analysis_json?.gap_analysis || [];
  const hasCount = gaps.filter(g => g.status === "has").length;
  const missingCount = gaps.filter(g => g.status === "missing").length;

  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl border border-slate-200 p-5 text-left hover:border-violet-300 hover:shadow-md transition-all group"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 text-sm leading-snug group-hover:text-violet-700 transition-colors line-clamp-2">
            {goal.title}
          </h3>
          {goal.target_role && <p className="text-xs text-slate-500 mt-0.5">{goal.target_role}</p>}
        </div>
        {priority && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${priority.color}`}>
            {priority.label}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
        {goalType && <span>{goalType.label}</span>}
        {goal.deadline && (
          <>
            <span className="text-slate-300">·</span>
            <span className="flex items-center gap-1">
              <Icon name="Calendar" size={11} />
              {new Date(goal.deadline).toLocaleDateString("ru-RU", { month: "short", year: "numeric" })}
            </span>
          </>
        )}
      </div>
      {hasAnalysis && gaps.length > 0 ? (
        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1 text-emerald-600"><Icon name="CheckCircle" size={12} />{hasCount} есть</span>
          {missingCount > 0 && <span className="flex items-center gap-1 text-red-500"><Icon name="AlertCircle" size={12} />{missingCount} нет</span>}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-violet-600">
          <Icon name="Sparkles" size={12} />
          <span>{hasAnalysis ? "Анализ готов" : "Нажми для AI-анализа"}</span>
        </div>
      )}
    </button>
  );
}

// ── GoalDetail ────────────────────────────────────────────────────────────────

function GoalDetail({
  goal, analyzing, generatingPath, onClose, onAnalyze, onGeneratePath,
  onMilestoneStatus, onArchive, onUpdated,
}: {
  goal: Goal; analyzing: boolean; generatingPath: boolean;
  onClose: () => void; onAnalyze: () => void; onGeneratePath: () => void;
  onMilestoneStatus: (msId: number, status: string) => void;
  onArchive: () => void; onUpdated: () => void;
}) {
  const [expandedMs, setExpandedMs] = useState<number | null>(null);

  const competencies: Competency[] = goal.ai_target_profile_json || [];
  const gapData: GapData | null = goal.ai_gap_analysis_json;
  const gaps: GapItem[] = gapData?.gap_analysis || [];
  const hasAnalysis = !!goal.ai_analyzed_at;
  const hasPath = !!goal.learning_path;
  const milestones: Milestone[] = goal.learning_path?.milestones || [];
  const doneCount = milestones.filter(m => m.status === "done").length;
  const priority = PRIORITIES.find(p => p.value === goal.priority);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-start justify-between gap-4 z-10">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {priority && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${priority.color}`}>
                  {priority.label}
                </span>
              )}
              {goal.deadline && (
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Icon name="Calendar" size={11} />
                  до {new Date(goal.deadline).toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-slate-900 leading-snug">{goal.title}</h2>
            {goal.target_role && <p className="text-sm text-slate-500 mt-0.5">{goal.target_role}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onArchive} className="text-xs text-slate-400 hover:text-red-500 transition-colors px-2 py-1">Архив</button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
              <Icon name="X" size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 px-6 py-5 space-y-6">
          {goal.description && (
            <p className="text-sm text-slate-600 leading-relaxed">{goal.description}</p>
          )}

          {/* AI Analysis */}
          {!hasAnalysis ? (
            <div className="bg-violet-50 rounded-2xl p-5 text-center border border-violet-100">
              <div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Icon name="Sparkles" size={24} className="text-violet-600" />
              </div>
              <p className="text-sm font-semibold text-slate-800 mb-1">AI-анализ на основе паспорта</p>
              <p className="text-xs text-slate-500 mb-4">AI изучит твои дипломы и покажет, чего не хватает для цели</p>
              <button
                onClick={onAnalyze}
                disabled={analyzing}
                className="bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors flex items-center gap-2 mx-auto"
              >
                {analyzing
                  ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Анализирую...</>
                  : <><Icon name="Sparkles" size={14} />Запустить AI-анализ</>}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {gapData?.summary && (
                <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-700 leading-relaxed border border-slate-100">
                  {gapData.summary}
                </div>
              )}
              {competencies.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Целевые компетенции</h3>
                  <div className="space-y-2">
                    {competencies.map((c, i) => {
                      const gap = gaps.find(g => g.name === c.name);
                      const gapStatus = gap?.status || "missing";
                      return (
                        <div key={i} className="flex items-start gap-3 bg-white rounded-xl border border-slate-100 px-4 py-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5 shrink-0 ${GAP_COLORS[gapStatus]}`}>
                            {GAP_LABELS[gapStatus]}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800">{c.name}</p>
                            {gap?.evidence && <p className="text-xs text-slate-500 mt-0.5 leading-snug">{gap.evidence}</p>}
                          </div>
                          <span className="text-[10px] text-slate-400 shrink-0 mt-0.5 capitalize">{c.target_level}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <button onClick={onAnalyze} disabled={analyzing} className="text-xs text-slate-400 hover:text-violet-600 transition-colors flex items-center gap-1">
                <Icon name="RefreshCw" size={11} />
                {analyzing ? "Анализирую..." : "Обновить анализ"}
              </button>
            </div>
          )}

          {/* Plan + Materials */}
          {hasAnalysis && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  План развития
                  {milestones.length > 0 && (
                    <span className="ml-2 text-violet-600 normal-case font-semibold">{doneCount}/{milestones.length} шагов</span>
                  )}
                </h3>
                {!hasPath && (
                  <button
                    onClick={onGeneratePath}
                    disabled={generatingPath}
                    className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {generatingPath
                      ? <><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />Строю план...</>
                      : <><Icon name="Map" size={12} />Построить план</>}
                  </button>
                )}
              </div>

              {milestones.length > 0 ? (
                <div className="space-y-2">
                  {milestones.map((m, i) => (
                    <MilestoneRow
                      key={m.id}
                      milestone={m}
                      index={i}
                      goalId={goal.id}
                      isExpanded={expandedMs === m.id}
                      onToggle={() => setExpandedMs(expandedMs === m.id ? null : m.id)}
                      onStatusChange={(status) => onMilestoneStatus(m.id, status)}
                    />
                  ))}
                  <button onClick={onGeneratePath} disabled={generatingPath} className="text-xs text-slate-400 hover:text-violet-600 transition-colors flex items-center gap-1 mt-1">
                    <Icon name="RefreshCw" size={11} />
                    {generatingPath ? "Строю план..." : "Перестроить план"}
                  </button>
                </div>
              ) : (
                !hasPath && (
                  <div className="text-xs text-slate-400 text-center py-4 bg-slate-50 rounded-xl">
                    Нажми «Построить план» чтобы AI создал пошаговый маршрут
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MilestoneRow с Materials ───────────────────────────────────────────────────

function MilestoneRow({
  milestone, index, goalId, isExpanded, onToggle, onStatusChange,
}: {
  milestone: Milestone; index: number; goalId: number;
  isExpanded: boolean; onToggle: () => void; onStatusChange: (s: string) => void;
}) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<number, { text: string; loading: boolean }>>({});

  const loadMaterials = useCallback(async () => {
    try {
      const res = await learningPackApi.list(milestone.id) as { materials: Material[]; job: { status: string } | null };
      setMaterials(res.materials || []);
      setJobStatus(res.job?.status || null);
    } catch (e) { console.error(e); }
  }, [milestone.id]);

  useEffect(() => {
    if (isExpanded) {
      setLoadingMaterials(true);
      loadMaterials().finally(() => setLoadingMaterials(false));
    }
  }, [isExpanded, loadMaterials]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await learningPackApi.generate(milestone.id, goalId);
      await loadMaterials();
    } catch (e) {
      alert("Ошибка подбора материалов: " + (e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const handleSummarize = async (mat: Material, type = "brief") => {
    const key = mat.id;
    setSummaries(prev => ({ ...prev, [key]: { text: prev[key]?.text || "", loading: true } }));
    try {
      const res = await learningPackApi.summarize(mat.id, milestone.id, type) as { summary: string };
      setSummaries(prev => ({ ...prev, [key]: { text: res.summary, loading: false } }));
    } catch (e) {
      setSummaries(prev => ({ ...prev, [key]: { text: "Ошибка получения выжимки", loading: false } }));
    }
  };

  const handleProgress = async (mat: Material, status: string) => {
    try {
      await learningPackApi.progress(mat.id, milestone.id, status);
      setMaterials(prev => prev.map(m => m.id === mat.id ? { ...m, progress_status: status } : m));
      if (status === "opened" && mat.url) window.open(mat.url, "_blank", "noopener");
    } catch (e) { console.error(e); }
  };

  return (
    <div className={`rounded-xl border transition-all ${milestone.status === "done" ? "border-emerald-100 bg-emerald-50/30" : "border-slate-100 bg-white"}`}>
      {/* Milestone header */}
      <div className="flex items-start gap-3 px-4 py-3">
        <span className="text-xs text-slate-400 font-mono w-5 shrink-0 mt-0.5">{index + 1}</span>
        <div className="flex-1 min-w-0">
          <button onClick={onToggle} className="text-left w-full group">
            <p className={`text-sm font-medium ${milestone.status === "done" ? "line-through text-slate-400" : "text-slate-800 group-hover:text-violet-700"} transition-colors`}>
              {milestone.title}
            </p>
            {milestone.description && (
              <p className="text-xs text-slate-500 mt-0.5 leading-snug">{milestone.description}</p>
            )}
          </button>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onToggle}
            className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 transition-colors"
          >
            <Icon name="BookOpen" size={12} />
            <span className="hidden sm:inline">Материалы</span>
            <Icon name={isExpanded ? "ChevronUp" : "ChevronDown"} size={12} />
          </button>
          <select
            value={milestone.status}
            onChange={e => onStatusChange(e.target.value)}
            className={`text-[10px] font-semibold px-2 py-1 rounded-lg border-0 cursor-pointer outline-none ${MS_STATUS_COLORS[milestone.status]}`}
          >
            <option value="planned">Запланировано</option>
            <option value="in_progress">В процессе</option>
            <option value="done">Готово</option>
          </select>
        </div>
      </div>

      {/* Materials panel */}
      {isExpanded && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-3">
          {loadingMaterials ? (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-violet-400" />
              Загружаю материалы...
            </div>
          ) : materials.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-xs text-slate-500 mb-3">
                {jobStatus === "failed"
                  ? "Ошибка подбора. Попробуй ещё раз."
                  : "Материалы ещё не подобраны"}
              </p>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors mx-auto"
              >
                {generating
                  ? <><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />Ищу материалы...</>
                  : <><Icon name="Search" size={12} />Подобрать материалы</>}
              </button>
              {generating && (
                <p className="text-[10px] text-slate-400 mt-2">AI ищет реальные источники — займёт ~20 секунд</p>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {materials.map(mat => (
                  <MaterialCard
                    key={mat.id}
                    material={mat}
                    summary={summaries[mat.id]}
                    onOpen={() => handleProgress(mat, "opened")}
                    onSummarize={() => handleSummarize(mat, "brief")}
                    onMarkDone={() => handleProgress(mat, mat.progress_status === "done" ? "in_progress" : "done")}
                  />
                ))}
              </div>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="text-xs text-slate-400 hover:text-violet-600 transition-colors flex items-center gap-1"
              >
                <Icon name="RefreshCw" size={11} />
                {generating ? "Ищу..." : "Обновить подборку"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── MaterialCard ──────────────────────────────────────────────────────────────

function MaterialCard({
  material, summary, onOpen, onSummarize, onMarkDone,
}: {
  material: Material;
  summary?: { text: string; loading: boolean };
  onOpen: () => void;
  onSummarize: () => void;
  onMarkDone: () => void;
}) {
  const [showSummary, setShowSummary] = useState(false);
  const isDone = material.progress_status === "done";
  const iconName = FORMAT_ICON[material.format] || "FileText";

  const handleSummarize = () => {
    setShowSummary(true);
    if (!summary?.text) onSummarize();
  };

  return (
    <div className={`rounded-xl border p-3 transition-all ${isDone ? "border-emerald-100 bg-emerald-50/40 opacity-75" : "border-slate-100 bg-slate-50/50 hover:border-slate-200"}`}>
      <div className="flex items-start gap-3">
        {/* Format icon */}
        <div className="w-8 h-8 rounded-lg bg-white border border-slate-100 flex items-center justify-center shrink-0 mt-0.5">
          <Icon name={iconName} size={14} className="text-slate-500" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Title + trust */}
          <div className="flex items-start gap-2 mb-1">
            <p className={`text-sm font-medium leading-snug flex-1 ${isDone ? "line-through text-slate-400" : "text-slate-800"}`}>
              {material.title}
            </p>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${TRUST_BADGE[material.trust_level] || TRUST_BADGE.C}`}>
              {material.trust_label}
            </span>
          </div>

          {/* Domain + time */}
          <div className="flex items-center gap-2 text-[10px] text-slate-400 mb-2">
            <span>{material.domain}</span>
            {material.estimated_minutes && (
              <>
                <span>·</span>
                <span className="flex items-center gap-0.5">
                  <Icon name="Clock" size={9} />
                  {material.estimated_minutes} мин
                </span>
              </>
            )}
            {material.progress_status !== "new" && (
              <>
                <span>·</span>
                <span className={PROGRESS_COLORS[material.progress_status]}>
                  {PROGRESS_LABELS[material.progress_status]}
                </span>
              </>
            )}
          </div>

          {/* Selection reason */}
          {material.selection_reason && (
            <p className="text-[11px] text-slate-500 leading-snug mb-2 italic">{material.selection_reason}</p>
          )}

          {/* Summary */}
          {showSummary && (
            <div className="bg-white rounded-lg border border-slate-100 p-3 mb-2">
              {summary?.loading ? (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-violet-400" />
                  AI готовит выжимку...
                </div>
              ) : (
                <p className="text-xs text-slate-700 leading-relaxed">{summary?.text}</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onOpen}
              className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 font-medium transition-colors"
            >
              <Icon name="ExternalLink" size={11} />
              Открыть
            </button>
            <span className="text-slate-200">|</span>
            <button
              onClick={handleSummarize}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-violet-600 transition-colors"
            >
              <Icon name="Zap" size={11} />
              {showSummary ? "Скрыть выжимку" : "Кратко объяснить"}
            </button>
            <span className="text-slate-200">|</span>
            <button
              onClick={onMarkDone}
              className={`flex items-center gap-1 text-xs transition-colors ${isDone ? "text-emerald-600 hover:text-slate-500" : "text-slate-400 hover:text-emerald-600"}`}
            >
              <Icon name={isDone ? "CheckCircle" : "Circle"} size={11} />
              {isDone ? "Изучено" : "Отметить изученным"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CreateGoalModal ───────────────────────────────────────────────────────────

function CreateGoalModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [title, setTitle] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [goalType, setGoalType] = useState("profession");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const res = await goalsApi.create({
        title: title.trim(),
        target_role: targetRole.trim() || undefined,
        goal_type: goalType,
        description: description.trim() || undefined,
        priority,
        deadline: deadline || undefined,
      }) as { id: number };
      onCreated(res.id);
    } catch (e) {
      alert("Ошибка: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-900">Новая цель</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <Icon name="X" size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Название цели *</label>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Например: Стать корпоративным юристом"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Тип цели</label>
            <select value={goalType} onChange={e => setGoalType(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
              {GOAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Целевая роль / позиция</label>
            <input value={targetRole} onChange={e => setTargetRole(e.target.value)}
              placeholder="Например: Старший юрисконсульт"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Приоритет</label>
              <select value={priority} onChange={e => setPriority(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
                {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Срок</label>
              <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Описание</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Опиши что именно хочешь достичь и зачем" rows={3}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-slate-200 text-slate-700 text-sm font-semibold py-2.5 rounded-xl hover:bg-slate-50 transition-colors">
              Отмена
            </button>
            <button type="submit" disabled={saving || !title.trim()}
              className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors">
              {saving ? "Создаю..." : "Создать"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
