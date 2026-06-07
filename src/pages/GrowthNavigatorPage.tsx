import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { analytics } from "@/lib/analytics";
import { growthApi } from "@/lib/growthApi";
import { profApi } from "@/lib/profApi";
import { bridgeApi } from "@/lib/bridgeApi";

// ── Types ────────────────────────────────────────────────────────────

type GapItem = {
  competency_id: number; name: string; code: string; domain_name: string;
  current_level: number; confidence: string; target_level: number;
  importance: string; gap: number; evidence_count: number;
  level_descriptors: Record<string, string>;
};
type GapSummary = {
  role_id: number; role_name: string;
  total: number; assessed: number; on_target: number;
  fit_pct: number; coverage_pct: number;
  critical_gaps: GapItem[]; quick_wins: GapItem[];
  strengths: GapItem[]; all_gaps: GapItem[];
};
type PlanItem = {
  id: number; competency_id: number | null; competency_name: string;
  item_type: string; title: string; description: string;
  priority: string; current_level: number | null; target_level: number | null;
  gap_value: number | null; importance: string | null;
  status: string; sort_order: number; due_date: string | null;
  updated_at: string;
};
type Plan = {
  id: number; target_role_profile_id: number; role_name: string;
  status: string; plan_version: number;
  summary: {
    role_name?: string; total_gaps?: number; critical_gaps?: number;
    quick_wins?: number; on_target?: number; focus_competencies?: string[];
  };
  created_at: string; updated_at: string;
  items: PlanItem[];
};
type Progress = {
  plan_id: number; role_name: string;
  total_items: number; done: number; in_progress: number;
  skipped: number; not_started: number; done_pct: number;
  evidence_added_week: number; competencies_assessed: number;
  critical_gaps_remaining: number;
};
type Recommendation = {
  id: number; title: string; item_type: string; priority: string;
  description: string; competency_name: string;
  current_level: number | null; target_level: number | null;
  gap_value: number | null; importance: string | null; why: string;
};
type RoleProfile = { id: number; name: string; description: string };
type LearningAssignment = {
  id: number; plan_item_id: number | null; competency_id: number | null;
  competency_name: string; content_type: string; content_id: number | null;
  content_title: string; content_url: string;
  recommendation_strength: string; is_required: boolean;
  source: string; status: string; reason_text: string;
  progress_pct: number | null; assigned_at: string;
  started_at: string | null; completed_at: string | null; link_id: number | null;
};
type LearningRec = {
  plan_item_id: number; competency_id: number; competency_name: string;
  current_level: number; gap_value: number; importance: string;
  link_id: number; content_type: string; content_id: number | null;
  content_title: string; content_url: string;
  recommendation_strength: string; is_required: boolean; match_reason: string;
  why: string;
};
type LearningProgress = {
  total: number; completed: number; started: number;
  skipped: number; done_pct: number; competencies_covered: number;
};
type LearningEvidence = {
  id: number; competency_name: string; title: string;
  description: string; source_ref: string; created_at: string;
};

type Tab = "overview" | "gaps" | "plan" | "path";

// ── Visual constants ──────────────────────────────────────────────────

const LEVEL_LABELS: Record<number, string> = {
  0: "—", 1: "Aware", 2: "Working", 3: "Independent", 4: "Advanced", 5: "Leading",
};
const IMP_COLOR: Record<string, string> = {
  core:      "text-red-600 bg-red-50 border-red-200",
  important: "text-amber-600 bg-amber-50 border-amber-200",
  supporting:"text-slate-500 bg-slate-50 border-slate-200",
};
const STATUS_CFG: Record<string, { label: string; icon: string; cls: string; dot: string }> = {
  not_started: { label: "Не начато", icon: "Circle",       cls: "text-slate-400 bg-slate-50  border-slate-200", dot: "bg-slate-300" },
  in_progress: { label: "В процессе", icon: "PlayCircle",  cls: "text-blue-600 bg-blue-50   border-blue-200",  dot: "bg-blue-400" },
  done:        { label: "Готово",     icon: "CheckCircle2", cls: "text-emerald-600 bg-emerald-50 border-emerald-200", dot: "bg-emerald-400" },
  skipped:     { label: "Пропущено", icon: "MinusCircle",  cls: "text-slate-400 bg-slate-50  border-slate-200", dot: "bg-slate-200" },
};
const ITEM_TYPE_ICON: Record<string, string> = {
  learn: "BookOpen", practice: "Wrench", evidence: "FileCheck", reflection: "MessageSquare",
  project: "FolderKanban", assessment: "ClipboardCheck", mentor: "Users", mentoring: "Users",
};
const ITEM_TYPE_LABEL: Record<string, string> = {
  learn: "Изучение",
  practice: "Практика",
  project: "Практика на задаче",
  evidence: "Подтверждение",
  reflection: "Рефлексия",
  assessment: "Проверка прогресса",
  mentor: "Наставничество",
  mentoring: "Наставничество",
};
const PRIORITY_DOT: Record<string, string> = {
  high: "bg-red-400", medium: "bg-amber-400", low: "bg-slate-300",
};

function Spinner() {
  return <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />;
}

function LevelBadge({ level }: { level: number }) {
  const colors: Record<number, string> = {
    0: "bg-slate-100 text-slate-400",
    1: "bg-slate-100 text-slate-500",
    2: "bg-blue-100 text-blue-700",
    3: "bg-violet-100 text-violet-700",
    4: "bg-emerald-100 text-emerald-700",
    5: "bg-amber-100 text-amber-700",
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${colors[level] ?? colors[0]}`}>
      {level > 0 ? `${level} · ` : ""}{LEVEL_LABELS[level] ?? "—"}
    </span>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────

function OverviewTab({
  roles, selectedRole, onRoleChange, gapSummary, progress, recommendations, loadingGap, onGenerate, generating,
}: {
  roles: RoleProfile[]; selectedRole: number | null;
  onRoleChange: (id: number) => void;
  gapSummary: GapSummary | null; progress: Progress | null;
  recommendations: Recommendation[];
  loadingGap: boolean; onGenerate: () => void; generating: boolean;
}) {
  // Определяем состояние страницы для однозначного primary CTA
  const mapState = !selectedRole
    ? "no_role"
    : loadingGap
    ? "loading"
    : !gapSummary
    ? "loading"
    : !progress
    ? "no_plan"
    : "ready";

  return (
    <div className="space-y-4">

      {/* ── 1. Status block — всегда наверху, один primary CTA ── */}
      <div className={`rounded-2xl border-2 p-5 ${
        mapState === "no_role"  ? "bg-slate-50 border-slate-200" :
        mapState === "no_plan"  ? "bg-amber-50 border-amber-200" :
        mapState === "ready"    ? "bg-white border-slate-200" :
        "bg-white border-slate-200"
      }`}>

        {/* Роль + смена */}
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Целевая роль
            </label>
            <select value={selectedRole ?? ""} onChange={e => onRoleChange(Number(e.target.value))}
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-slate-400 bg-white">
              <option value="">— выберите роль —</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        </div>

        {/* Состояние + CTA */}
        {mapState === "no_role" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 leading-relaxed">
              Выберите роль выше — это отправная точка для анализа зон роста и формирования плана.
            </p>
            <div className="flex items-center gap-1.5">
              <Icon name="BookOpen" size={12} className="text-slate-400" />
              <p className="text-xs text-slate-400">
                Не уверены как работает навигатор?{" "}
                <Link
                  to="/guide"
                  state={{ source: "strategy_empty_state" }}
                  onClick={() => analytics.guideCtaClicked("open_guide", "strategy_empty_state")}
                  className="text-violet-600 hover:text-violet-800 font-medium underline underline-offset-2 transition-colors"
                >
                  Откройте инструкцию
                </Link>
              </p>
            </div>
          </div>
        )}

        {mapState === "loading" && (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
            <Spinner />
            <span>Анализируем данные...</span>
          </div>
        )}

        {mapState === "no_plan" && gapSummary && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-sm font-semibold text-amber-800">Можно собрать первый план развития</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Соответствие роли: <span className="font-bold">{gapSummary.fit_pct}%</span>
                  {" · "}{gapSummary.critical_gaps.length > 0
                    ? `${gapSummary.critical_gaps.length} зон, требующих внимания`
                    : "Все приоритетные зоны закрыты"}
                </p>
              </div>
              <button onClick={onGenerate} disabled={generating}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors">
                {generating ? <Spinner /> : <Icon name="Sparkles" size={14} />}
                {generating ? "Генерирую..." : "Сформировать план"}
              </button>
            </div>
          </div>
        )}

        {mapState === "ready" && gapSummary && progress && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-lg font-bold ${gapSummary.fit_pct >= 60 ? "text-emerald-600" : "text-amber-600"}`}>
                    {gapSummary.fit_pct}% соответствие роли
                  </span>
                  <span className="text-slate-400 text-sm">{gapSummary.role_name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>
                    <span className="font-semibold text-emerald-600">{progress.done}</span> выполнено
                  </span>
                  <span>
                    <span className="font-semibold text-blue-600">{progress.in_progress}</span> в работе
                  </span>
                  {progress.critical_gaps_remaining > 0 && (
                    <span>
                      <span className="font-semibold text-red-500">{progress.critical_gaps_remaining}</span> зон внимания
                    </span>
                  )}
                </div>
              </div>
              <button onClick={onGenerate} disabled={generating}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 text-sm font-semibold rounded-xl transition-colors">
                {generating ? <Spinner /> : <Icon name="RefreshCw" size={13} />}
                {generating ? "Обновляю..." : "Обновить план"}
              </button>
            </div>

            {/* Прогресс-бар */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-2 bg-slate-900 rounded-full transition-all" style={{ width: `${progress.done_pct}%` }} />
              </div>
              <span className="text-xs font-semibold text-slate-600 w-8 text-right">{progress.done_pct}%</span>
            </div>
          </div>
        )}
      </div>

      {/* ── 2. Следующий шаг — если есть ── */}
      {recommendations.length > 0 && (
        <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4">
          <p className="text-xs font-semibold text-violet-700 mb-3 flex items-center gap-1.5">
            <Icon name="Sparkles" size={13} /> Следующий шаг
          </p>
          <div className="space-y-2">
            {recommendations.slice(0, 3).map(r => (
              <div key={r.id} className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon name={ITEM_TYPE_ICON[r.item_type] ?? "Circle"} size={11} className="text-violet-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <p className="text-xs font-medium text-slate-800 leading-snug">{r.title}</p>
                    {r.item_type && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-violet-100 text-violet-600 rounded font-medium">
                        {ITEM_TYPE_LABEL[r.item_type] ?? r.item_type}
                      </span>
                    )}
                  </div>
                  {r.competency_name && <p className="text-[10px] text-slate-500">{r.competency_name}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 3. Приоритеты — quick wins первыми (легко закрыть) ── */}
      {gapSummary && (gapSummary.quick_wins.length > 0 || gapSummary.critical_gaps.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-3">
          {gapSummary.quick_wins.length > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
              <p className="text-xs font-semibold text-amber-700 mb-2.5 flex items-center gap-1.5">
                <Icon name="Zap" size={13} /> Что можно улучшить быстро
                <span className="ml-auto text-[10px] font-normal text-amber-600">один шаг до цели</span>
              </p>
              {gapSummary.quick_wins.slice(0, 4).map(g => (
                <div key={g.competency_id} className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs text-slate-700 flex-1 truncate">{g.name}</span>
                  <span className="text-[10px] text-slate-400 flex-shrink-0">{g.current_level}→{g.target_level}</span>
                </div>
              ))}
            </div>
          )}
          {gapSummary.critical_gaps.length > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
              <p className="text-xs font-semibold text-red-600 mb-2.5 flex items-center gap-1.5">
                <Icon name="AlertTriangle" size={13} /> Что мешает двигаться к роли
                <span className="ml-auto text-[10px] font-normal text-red-500">приоритет закрыть</span>
              </p>
              {gapSummary.critical_gaps.slice(0, 4).map(g => (
                <div key={g.competency_id} className="flex items-center gap-2 mb-1.5">
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border flex-shrink-0 ${IMP_COLOR[g.importance]}`}>{g.importance}</span>
                  <span className="text-xs text-slate-700 flex-1 truncate">{g.name}</span>
                  <span className="text-[10px] text-slate-400 flex-shrink-0">{g.current_level}→{g.target_level}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 4. Сильные стороны — ниже, вторично ── */}
      {gapSummary && gapSummary.strengths.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
          <p className="text-xs font-semibold text-emerald-700 mb-2.5 flex items-center gap-1.5">
            <Icon name="Star" size={13} /> Сильные стороны
          </p>
          <div className="flex flex-wrap gap-2">
            {gapSummary.strengths.slice(0, 6).map(g => (
              <div key={g.competency_id} className="flex items-center gap-1.5 bg-white rounded-lg px-2.5 py-1.5 border border-emerald-100">
                <LevelBadge level={g.current_level} />
                <span className="text-xs text-slate-700">{g.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 5. Детали — fit покрытие, Evidence — совсем вниз ── */}
      {gapSummary && progress && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { l: "Соответствие роли", v: `${gapSummary.fit_pct}%`,        cls: gapSummary.fit_pct >= 60 ? "text-emerald-600" : "text-amber-600" },
            { l: "Охват",            v: `${gapSummary.coverage_pct}%`,   cls: "text-violet-600" },
            { l: "Быстрые улучшения", v: gapSummary.quick_wins.length,   cls: "text-amber-600" },
            { l: "Подтверждений/нед", v: progress.evidence_added_week,   cls: "text-violet-600" },
          ].map(({ l, v, cls }) => (
            <div key={l} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
              <p className={`text-lg font-bold ${cls}`}>{v}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{l}</p>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

// ── Gap Map Tab ───────────────────────────────────────────────────────

function GapMapTab({ gapSummary, loadingGap }: { gapSummary: GapSummary | null; loadingGap: boolean }) {
  const [filter, setFilter] = useState<"all" | "critical" | "quick" | "done">("all");

  if (loadingGap) return <div className="flex justify-center py-10"><Spinner /></div>;
  if (!gapSummary) return (
    <div className="text-center py-12 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-2xl">
      Выберите роль во вкладке «Обзор», чтобы увидеть зоны роста
    </div>
  );

  const filtered = gapSummary.all_gaps.filter(g => {
    if (filter === "critical") return g.gap >= 2 && g.importance !== "supporting";
    if (filter === "quick")    return g.gap === 1;
    if (filter === "done")     return g.gap === 0 && g.current_level > 0;
    return true;
  });
  const domains = [...new Set(filtered.map(g => g.domain_name))];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {([["all","Все"], ["critical","Зоны внимания"], ["quick","Быстрые улучшения"], ["done","На уровне"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${filter === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            {l}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400 self-center">{filtered.length} компетенций</span>
      </div>

      {domains.map(domName => {
        const items = filtered.filter(g => g.domain_name === domName);
        return (
          <div key={domName} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{domName}</p>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-[9px] text-slate-400 font-semibold uppercase px-4 py-2">Компетенция</th>
                  <th className="text-left text-[9px] text-slate-400 font-semibold uppercase px-3 py-2 w-28">Текущий</th>
                  <th className="text-left text-[9px] text-slate-400 font-semibold uppercase px-3 py-2 w-24">Цель</th>
                  <th className="text-left text-[9px] text-slate-400 font-semibold uppercase px-3 py-2 w-16">Разрыв</th>
                  <th className="text-left text-[9px] text-slate-400 font-semibold uppercase px-3 py-2 w-20">Важность</th>
                </tr>
              </thead>
              <tbody>
                {items.map(g => {
                  const gapCls = g.gap > 1 ? "text-red-500 font-bold" : g.gap === 1 ? "text-amber-500 font-semibold" : "text-emerald-500 font-semibold";
                  return (
                    <tr key={g.competency_id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-2.5">
                        <p className="text-xs font-medium text-slate-800">{g.name}</p>
                        {g.evidence_count > 0 && (
                          <span className="text-[9px] text-violet-500">{g.evidence_count} подтвержд.</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5"><LevelBadge level={g.current_level} /></td>
                      <td className="px-3 py-2.5"><LevelBadge level={g.target_level} /></td>
                      <td className="px-3 py-2.5">
                        <span className={`text-sm ${gapCls}`}>
                          {g.gap > 0 ? `−${g.gap}` : "✓"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${IMP_COLOR[g.importance] ?? ""}`}>
                          {g.importance === "core" ? "ключевая" : g.importance === "important" ? "важная" : "базовая"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// ── Plan Tab ──────────────────────────────────────────────────────────

function PlanTab({ plan, onRefresh }: { plan: Plan | null; onRefresh: () => void }) {
  const [filter, setFilter] = useState<"all" | "not_started" | "in_progress" | "done">("all");
  const [addModal, setAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ title: "", description: "", item_type: "learn", priority: "medium" });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showMsg(m: string) { setToast(m); setTimeout(() => setToast(null), 2000); }

  async function updateStatus(item: PlanItem, status: string) {
    await growthApi.itemUpdate({ id: item.id, status });
    onRefresh();
  }

  async function addItem() {
    if (!addForm.title.trim()) return;
    setSaving(true);
    await growthApi.itemAdd(addForm);
    setSaving(false);
    setAddModal(false);
    setAddForm({ title: "", description: "", item_type: "learn", priority: "medium" });
    onRefresh();
    showMsg("Добавлено");
  }

  async function delItem(id: number) {
    await growthApi.itemDelete(id);
    onRefresh();
  }

  if (!plan) return (
    <div className="text-center py-12 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-2xl space-y-3">
      <p>Выберите роль и сформируйте план во вкладке «Обзор»</p>
      <div className="flex items-center justify-center gap-1.5">
        <Icon name="BookOpen" size={12} className="text-slate-400" />
        <p className="text-xs text-slate-400">
          Не уверены с чего начать?{" "}
          <Link
            to="/guide"
            state={{ source: "strategy_empty_state" }}
            onClick={() => analytics.guideCtaClicked("open_guide", "strategy_empty_state")}
            className="text-violet-600 hover:text-violet-800 font-medium underline underline-offset-2 transition-colors"
          >
            Откройте инструкцию
          </Link>
        </p>
      </div>
    </div>
  );

  const items = plan.items.filter(i => filter === "all" || i.status === filter);
  const grouped = ["high","medium","low"].reduce<Record<string, PlanItem[]>>((acc, p) => {
    const filtered = items.filter(i => i.priority === p);
    if (filtered.length) acc[p] = filtered;
    return acc;
  }, {});

  const PRIORITY_LABEL: Record<string, string> = { high: "Высокий приоритет", medium: "Средний", low: "Низкий" };
  const inp = "w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-slate-400 bg-white";
  const lbl = "block text-xs font-semibold text-slate-600 mb-1.5";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          {([["all","Все"], ["not_started","Не начато"], ["in_progress","В процессе"], ["done","Готово"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${filter === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {l}
            </button>
          ))}
        </div>
        <button onClick={() => setAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl">
          <Icon name="Plus" size={13} /> Добавить шаг
        </button>
      </div>

      {Object.entries(grouped).map(([priority, pitems]) => (
        <div key={priority}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-2 h-2 rounded-full ${PRIORITY_DOT[priority]}`} />
            <p className="text-xs font-semibold text-slate-500 uppercase">{PRIORITY_LABEL[priority]}</p>
          </div>
          <div className="space-y-2">
            {pitems.map(item => {
              const sc = STATUS_CFG[item.status] ?? STATUS_CFG.not_started;
              return (
                <div key={item.id} className={`bg-white border rounded-2xl p-4 transition-opacity ${item.status === "done" ? "opacity-60" : ""}`}>
                  <div className="flex items-start gap-3">
                    <Icon name={ITEM_TYPE_ICON[item.item_type] ?? "Circle"} size={15} className="text-slate-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className={`text-sm font-semibold ${item.status === "done" ? "line-through text-slate-400" : "text-slate-800"}`}>{item.title}</p>
                        {item.item_type && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-md font-medium">
                            {ITEM_TYPE_LABEL[item.item_type] ?? item.item_type}
                          </span>
                        )}
                        {item.competency_name && <span className="text-[10px] text-violet-500">{item.competency_name}</span>}
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">{item.description}</p>
                      {item.current_level != null && item.target_level != null && (
                        <p className="text-[10px] text-slate-400 mt-1">
                          Уровень: <LevelBadge level={item.current_level} /> → <LevelBadge level={item.target_level} />
                          {item.gap_value != null && <span className="ml-1 text-red-400 font-semibold">gap {item.gap_value}</span>}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Status quick-actions */}
                      {item.status === "not_started" && (
                        <button onClick={() => updateStatus(item, "in_progress")}
                          className="text-[9px] px-2 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
                          Начать
                        </button>
                      )}
                      {item.status === "in_progress" && (
                        <button onClick={() => updateStatus(item, "done")}
                          className="text-[9px] px-2 py-1 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors">
                          Готово
                        </button>
                      )}
                      {item.status !== "skipped" && item.status !== "done" && (
                        <button onClick={() => updateStatus(item, "skipped")}
                          className="text-[9px] px-2 py-1 bg-slate-50 text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors">
                          Пропустить
                        </button>
                      )}
                      {(item.status === "done" || item.status === "skipped") && (
                        <button onClick={() => updateStatus(item, "not_started")}
                          className="text-[9px] px-2 py-1 bg-slate-50 text-slate-400 border border-slate-200 rounded-lg">
                          Сбросить
                        </button>
                      )}
                      <button onClick={() => delItem(item.id)} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors">
                        <Icon name="X" size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {items.length === 0 && (
        <div className="text-center py-8 text-slate-400 text-sm">Нет шагов по фильтру</div>
      )}

      {/* Add modal */}
      {addModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setAddModal(false)}>
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md p-6 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Добавить шаг</h3>
              <button onClick={() => setAddModal(false)}><Icon name="X" size={18} className="text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={lbl}>Название *</label>
                <input className={inp} value={addForm.title} onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))} placeholder="Что нужно сделать?" />
              </div>
              <div>
                <label className={lbl}>Описание</label>
                <textarea rows={2} className={`${inp} resize-none`} value={addForm.description} onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Тип</label>
                  <select className={inp} value={addForm.item_type} onChange={e => setAddForm(f => ({ ...f, item_type: e.target.value }))}>
                    <option value="learn">Изучение</option>
                    <option value="practice">Практика</option>
                    <option value="project">Практика на задаче</option>
                    <option value="evidence">Подтверждение</option>
                    <option value="reflection">Рефлексия</option>
                    <option value="assessment">Проверка прогресса</option>
                    <option value="mentor">Наставничество</option>
                  </select>
                </div>
                <div>
                  <label className={lbl}>Приоритет</label>
                  <select className={inp} value={addForm.priority} onChange={e => setAddForm(f => ({ ...f, priority: e.target.value }))}>
                    <option value="high">Высокий</option>
                    <option value="medium">Средний</option>
                    <option value="low">Низкий</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setAddModal(false)} className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-xl">Отмена</button>
              <button onClick={addItem} disabled={saving || !addForm.title.trim()}
                className="flex-1 px-4 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl disabled:opacity-40">
                {saving ? "..." : "Добавить"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-24 right-4 px-4 py-2 bg-emerald-600 text-white text-sm rounded-xl shadow-lg z-50">{toast}</div>}
    </div>
  );
}

// ── Learning Path Tab ─────────────────────────────────────────────────

const STATUS_A: Record<string, { label: string; dot: string; badge: string }> = {
  recommended: { label: "Рекомендовано", dot: "bg-slate-300", badge: "bg-slate-100 text-slate-600 border-slate-200" },
  started:     { label: "Начато",        dot: "bg-blue-400",  badge: "bg-blue-100 text-blue-700 border-blue-200" },
  completed:   { label: "Выполнено",     dot: "bg-emerald-400", badge: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  skipped:     { label: "Пропущено",     dot: "bg-slate-200", badge: "bg-slate-100 text-slate-400 border-slate-200" },
};
const STRENGTH_BADGE: Record<string, string> = {
  high:   "bg-rose-50 text-rose-600 border-rose-200",
  medium: "bg-amber-50 text-amber-600 border-amber-200",
  low:    "bg-slate-50 text-slate-500 border-slate-200",
};

function PathTab({ plan }: { plan: Plan | null }) {
  const [assignments, setAssignments]             = useState<LearningAssignment[]>([]);
  const [learningRecs, setLearningRecs]           = useState<LearningRec[]>([]);
  const [learningProgress, setLearningProgress]   = useState<LearningProgress | null>(null);
  const [evidence, setEvidence]                   = useState<LearningEvidence[]>([]);
  const [loading, setLoading]                     = useState(true);
  const [filter, setFilter]                       = useState<"all"|"recommended"|"started"|"completed">("all");
  const [addManual, setAddManual]                 = useState(false);
  const [manualForm, setManualForm]               = useState({ content_title: "", content_url: "", content_type: "other" });
  const [toast, setToast]                         = useState<string | null>(null);

  function showMsg(m: string) { setToast(m); setTimeout(() => setToast(null), 2000); }

  const load = useCallback(async () => {
    setLoading(true);
    const [lp, lr, pr, ev] = await Promise.all([
      growthApi.learningPath(),
      growthApi.learningRecs(),
      growthApi.learningProgress(),
      bridgeApi.evidenceList(),
    ]);
    setAssignments(lp.learning_path ?? []);
    setLearningRecs(lr.recommendations ?? []);
    setLearningProgress(pr.progress ?? null);
    setEvidence(ev.evidence ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function startRec(rec: LearningRec) {
    await growthApi.learningStart({
      link_id: rec.link_id, content_type: rec.content_type, content_id: rec.content_id,
      content_title: rec.content_title, content_url: rec.content_url,
      plan_item_id: rec.plan_item_id, competency_id: rec.competency_id,
      recommendation_strength: rec.recommendation_strength,
      is_required: rec.is_required, reason_text: rec.why,
    });
    await load();
    showMsg("Начато");
  }

  async function setStatus(a: LearningAssignment, status: string) {
    if (status === "started")   await growthApi.learningStart({ id: a.id });
    if (status === "completed") await growthApi.learningComplete({ id: a.id });
    if (status === "skipped")   await growthApi.learningSkip({ id: a.id });
    await load();
  }

  async function addManualItem() {
    if (!manualForm.content_title.trim()) return;
    await growthApi.learningAddManual(manualForm);
    setAddManual(false);
    setManualForm({ content_title: "", content_url: "", content_type: "other" });
    await load();
    showMsg("Материал добавлен");
  }

  const filtered = assignments.filter(a => filter === "all" || a.status === filter);
  const inp = "w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-slate-400 bg-white";
  const lbl = "block text-xs font-semibold text-slate-600 mb-1.5";

  return (
    <div className="space-y-5">
      {/* Learning progress summary */}
      {learningProgress && learningProgress.total > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-800">Прогресс обучения</p>
            <span className={`text-xl font-bold ${learningProgress.done_pct >= 60 ? "text-emerald-600" : "text-amber-600"}`}>
              {learningProgress.done_pct}%
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full mb-3">
            <div className="h-1.5 bg-emerald-500 rounded-full" style={{ width: `${learningProgress.done_pct}%` }} />
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { l: "Всего", v: learningProgress.total,     cls: "text-slate-600" },
              { l: "Начато", v: learningProgress.started,  cls: "text-blue-600" },
              { l: "Готово", v: learningProgress.completed, cls: "text-emerald-600" },
              { l: "Компетенций", v: learningProgress.competencies_covered, cls: "text-violet-600" },
            ].map(({ l, v, cls }) => (
              <div key={l} className="p-2 bg-slate-50 rounded-xl">
                <p className={`text-lg font-bold ${cls}`}>{v}</p>
                <p className="text-[9px] text-slate-500">{l}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* W9.2 Verified Learning Evidence */}
      {evidence.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
          <p className="text-xs font-semibold text-emerald-700 mb-3 flex items-center gap-1.5">
            <Icon name="BadgeCheck" size={14} className="text-emerald-600" />
            Подтверждения опыта
            <span className="ml-auto text-[10px] font-normal text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
              {evidence.length}
            </span>
          </p>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {evidence.map(ev => (
              <div key={ev.id} className="flex items-start gap-2 p-2 bg-white rounded-xl border border-emerald-100">
                <Icon name="CheckCircle2" size={13} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-700 truncate">{ev.title}</p>
                  <p className="text-[10px] text-slate-500">{ev.competency_name}</p>
                </div>
                <span className="text-[9px] text-slate-400 flex-shrink-0">
                  {new Date(ev.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-emerald-600 mt-2 italic">
            Завершение курса фиксируется как опыт, но уровень компетенции обновляется через самооценку.
          </p>
        </div>
      )}

      {/* Recommended content — не начатые из resolver */}
      {learningRecs.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
            <Icon name="Sparkles" size={13} className="text-violet-500" />
            Что изучить сейчас
          </p>
          {learningRecs.map((rec, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center">
                  <Icon name="BookOpen" size={14} className="text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${STRENGTH_BADGE[rec.recommendation_strength] ?? ""}`}>
                      {rec.recommendation_strength === "high" ? "важно" : rec.recommendation_strength === "medium" ? "рекомендуется" : "опционально"}
                    </span>
                    {rec.is_required && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border bg-red-50 text-red-600 border-red-200">обязательно</span>
                    )}
                    <span className="text-[9px] text-slate-400">{rec.competency_name}</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-800">{rec.content_title}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{rec.why}</p>
                  {rec.content_url && (
                    <a href={rec.content_url} target="_blank" rel="noreferrer"
                      className="text-[10px] text-violet-500 hover:underline mt-0.5 block truncate max-w-xs">
                      {rec.content_url}
                    </a>
                  )}
                </div>
                <button onClick={() => startRec(rec)}
                  className="flex-shrink-0 text-[10px] px-3 py-1.5 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 transition-colors whitespace-nowrap">
                  Приступить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!plan && !loading && (
        <div className="text-center py-12 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-2xl">
          Сформируйте план развития во вкладке «Обзор» — тогда здесь появятся материалы для изучения
        </div>
      )}

      {/* My assignments */}
      {assignments.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-1.5">
              {(["all","recommended","started","completed"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold transition-colors ${filter === f ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {f === "all" ? "Все" : STATUS_A[f]?.label ?? f}
                </button>
              ))}
            </div>
            <button onClick={() => setAddManual(true)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors">
              <Icon name="Plus" size={12} /> Добавить материал
            </button>
          </div>

          {loading && <div className="flex justify-center py-4"><Spinner /></div>}

          {filtered.map(a => {
            const sa = STATUS_A[a.status] ?? STATUS_A.recommended;
            const hasEvidence = a.status === "completed" && a.competency_id != null &&
              evidence.some(ev => ev.title.includes(a.content_title.slice(0, 20)));
            return (
              <div key={a.id} className={`bg-white border rounded-2xl p-4 ${a.status === "completed" ? "opacity-70 border-emerald-200" : "border-slate-200"}`}>
                <div className="flex items-start gap-3">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${sa.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${sa.badge}`}>{sa.label}</span>
                      {hasEvidence && (
                        <span className="flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-600 border-emerald-200">
                          <Icon name="BadgeCheck" size={9} /> подтверждено
                        </span>
                      )}
                      {a.competency_name && <span className="text-[9px] text-violet-500">{a.competency_name}</span>}
                      <span className="text-[9px] text-slate-400">{a.source === "manual" ? "добавлено вручную" : a.content_type}</span>
                    </div>
                    <p className={`text-sm font-semibold text-slate-800 ${a.status === "completed" ? "line-through text-slate-400" : ""}`}>
                      {a.content_title}
                    </p>
                    {a.reason_text && <p className="text-[10px] text-slate-500 mt-0.5 italic">{a.reason_text}</p>}
                    {a.content_url && (
                      <a href={a.content_url} target="_blank" rel="noreferrer"
                        className="text-[10px] text-violet-500 hover:underline mt-0.5 block truncate max-w-xs">
                        {a.content_url}
                      </a>
                    )}
                    {a.completed_at && (
                      <p className="text-[9px] text-slate-400 mt-1">
                        Завершено: {new Date(a.completed_at).toLocaleDateString("ru-RU")}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    {a.status === "recommended" && (
                      <button onClick={() => setStatus(a, "started")}
                        className="text-[9px] px-2 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
                        Начать
                      </button>
                    )}
                    {a.status === "started" && (
                      <button onClick={() => setStatus(a, "completed")}
                        className="text-[9px] px-2 py-1 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors">
                        Готово
                      </button>
                    )}
                    {a.status !== "completed" && a.status !== "skipped" && (
                      <button onClick={() => setStatus(a, "skipped")}
                        className="text-[9px] px-2 py-1 bg-slate-50 text-slate-400 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors">
                        Пропустить
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && !loading && (
            <div className="text-center py-6 text-slate-400 text-sm">Нет материалов по фильтру</div>
          )}
        </div>
      )}

      {/* Add manual modal */}
      {addManual && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setAddManual(false)}>
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md p-6 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Добавить материал</h3>
              <button onClick={() => setAddManual(false)}><Icon name="X" size={18} className="text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={lbl}>Название *</label>
                <input className={inp} value={manualForm.content_title} onChange={e => setManualForm(f => ({ ...f, content_title: e.target.value }))} placeholder="Название курса, книги, практики..." />
              </div>
              <div>
                <label className={lbl}>URL (необязательно)</label>
                <input className={inp} value={manualForm.content_url} onChange={e => setManualForm(f => ({ ...f, content_url: e.target.value }))} placeholder="https://..." />
              </div>
              <div>
                <label className={lbl}>Тип</label>
                <select className={inp} value={manualForm.content_type} onChange={e => setManualForm(f => ({ ...f, content_type: e.target.value }))}>
                  {["course","book","article","practice","video","other"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setAddManual(false)} className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-xl">Отмена</button>
              <button onClick={addManualItem} disabled={!manualForm.content_title.trim()}
                className="flex-1 px-4 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl disabled:opacity-40">
                Добавить
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-24 right-4 px-4 py-2 bg-emerald-600 text-white text-sm rounded-xl shadow-lg z-50">{toast}</div>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────

export default function GrowthNavigatorPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [roles, setRoles] = useState<RoleProfile[]>([]);
  const [selectedRole, setSelectedRole] = useState<number | null>(null);
  const [gapSummary, setGapSummary] = useState<GapSummary | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loadingGap, setLoadingGap] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Initial load
  useEffect(() => {
    Promise.all([
      profApi.roleProfilesList(),
      growthApi.planGet(),
      growthApi.progress(),
      growthApi.recommendations(),
    ]).then(([rr, pp, pr, rec]) => {
      setRoles(rr.role_profiles ?? []);
      const loadedPlan: Plan | null = pp.plan ?? null;
      setPlan(loadedPlan);
      setProgress(pr.progress ?? null);
      setRecommendations(rec.recommendations ?? []);
      if (loadedPlan?.target_role_profile_id) {
        setSelectedRole(loadedPlan.target_role_profile_id);
      }
      setInitialLoading(false);
    });
  }, []);

  // Load gap summary when role changes
  useEffect(() => {
    if (!selectedRole) return;
    setLoadingGap(true);
    growthApi.gapSummary(selectedRole).then(d => {
      setGapSummary(d.gap_summary ?? null);
      setLoadingGap(false);
    });
  }, [selectedRole]);

  const loadPlan = useCallback(async () => {
    const [pp, pr, rec] = await Promise.all([
      growthApi.planGet(),
      growthApi.progress(),
      growthApi.recommendations(),
    ]);
    setPlan(pp.plan ?? null);
    setProgress(pr.progress ?? null);
    setRecommendations(rec.recommendations ?? []);
  }, []);

  async function handleGenerate() {
    if (!selectedRole) return;
    setGenerating(true);
    await growthApi.planGenerate({ target_role_profile_id: selectedRole });
    await loadPlan();
    setGenerating(false);
  }

  const TABS: { key: Tab; icon: string; label: string }[] = [
    { key: "overview", icon: "LayoutDashboard", label: "Обзор" },
    { key: "gaps",     icon: "BarChart2",       label: "Зоны роста" },
    { key: "plan",     icon: "ListTodo",         label: "План" },
    { key: "path",     icon: "Route",            label: "Путь" },
  ];

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center">
                <Icon name="TrendingUp" size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Навигатор развития</h1>
                <p className="text-sm text-slate-500">
                  {plan ? `Целевая роль: ${plan.role_name}` : "Выберите роль — и платформа соберёт план"}
                </p>
              </div>
            </div>
            {progress && (
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-slate-200 rounded-full">
                  <div className="h-1.5 bg-slate-900 rounded-full transition-all" style={{ width: `${progress.done_pct}%` }} />
                </div>
                <span className="text-xs font-semibold text-slate-600">{progress.done_pct}%</span>
              </div>
            )}
          </div>

          {/* Tab nav */}
          <div className="flex gap-0.5 bg-slate-100 p-1 rounded-2xl mb-6 overflow-x-auto">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors flex-shrink-0 ${
                  tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}>
                <Icon name={t.icon} size={13} />{t.label}
              </button>
            ))}
          </div>

          {initialLoading ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : (
            <>
              {tab === "overview" && (
                <OverviewTab
                  roles={roles} selectedRole={selectedRole}
                  onRoleChange={setSelectedRole}
                  gapSummary={gapSummary} progress={progress}
                  recommendations={recommendations}
                  loadingGap={loadingGap}
                  onGenerate={handleGenerate} generating={generating}
                />
              )}
              {tab === "gaps" && <GapMapTab gapSummary={gapSummary} loadingGap={loadingGap} />}
              {tab === "plan" && <PlanTab plan={plan} onRefresh={loadPlan} />}
              {tab === "path" && <PathTab plan={plan} />}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}