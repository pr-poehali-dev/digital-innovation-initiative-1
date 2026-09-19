import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading, fmtDate } from "@/components/exec/ExecUI";
import { execPortfolioApi } from "@/lib/execPortfolioApi";
import { execRoadmapApi, ProjectGanttData, GanttTask, GanttMilestone, CriticalPathData } from "@/lib/execRoadmapApi";
import { PlanProjectRef } from "@/lib/execCabinetApi";
import ProjectGanttView from "@/components/exec/roadmap/ProjectGanttView";
import DependencyGraphView from "@/components/exec/roadmap/DependencyGraphView";
import MilestonesTimelineView from "@/components/exec/roadmap/MilestonesTimelineView";
import { ScaleKind, defaultRangeForScale, autoScale, diffDays, parseISODate } from "@/lib/timeScale";

type Mode = "table" | "gantt" | "network" | "milestones";

const MODES: { id: Mode; label: string; icon: string }[] = [
  { id: "table", label: "Таблица", icon: "Table2" },
  { id: "gantt", label: "Диаграмма Ганта", icon: "GanttChartSquare" },
  { id: "network", label: "Сетевая схема", icon: "Network" },
  { id: "milestones", label: "Вехи", icon: "Diamond" },
];

const STATUS_LABEL: Record<string, string> = {
  not_started: "Не начато", in_progress: "В работе", blocked: "Заблокировано",
  review: "На проверке", done: "Выполнено", cancelled: "Отменено", achieved: "Достигнуто",
};

/**
 * Единый план исполнения инициативы: 4 представления одних и тех же данных
 * (задачи, вехи, зависимости, критический путь). Переиспользует существующий
 * механизм «Траектории» (ProjectGanttView / DependencyGraphView /
 * MilestonesTimelineView, работающие поверх exec_project) — второй, упрощённый
 * Гант здесь НЕ создаётся.
 */
export default function InitiativePlanTab({
  initiativeId,
  planProject,
  onProjectCreated,
}: {
  initiativeId: number;
  planProject: PlanProjectRef | null;
  onProjectCreated: () => void;
}) {
  const [mode, setMode] = useState<Mode>("table");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const createPlan = async () => {
    setCreating(true);
    setCreateError("");
    try {
      await execPortfolioApi.saveProject({
        title: "План исполнения",
        project_kind: "project",
        initiative_id: initiativeId,
        status: "in_progress",
      });
      onProjectCreated();
    } catch (e) {
      setCreateError((e as Error).message);
      setCreating(false);
    }
  };

  if (!planProject) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <Icon name="GanttChartSquare" size={28} className="mx-auto text-slate-400 mb-3" />
        <p className="text-sm text-slate-600 mb-1">План исполнения ещё не заведён</p>
        <p className="text-xs text-slate-400 mb-4 max-w-md mx-auto">
          Вехи инициативы уже есть, но задачи с продолжительностью, зависимостями и Гантом
          требуют рабочего плана-контейнера. Он создаётся один раз.
        </p>
        <button
          onClick={createPlan}
          disabled={creating}
          className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
        >
          {creating ? "Создаю…" : "Создать план исполнения"}
        </button>
        {createError && <p className="text-xs text-red-600 mt-3">{createError}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`px-3.5 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                mode === m.id ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon name={m.icon} size={14} />
              {m.label}
            </button>
          ))}
        </div>
        <Link
          to={`/cabinet/exec/portfolio/projects/${planProject.id}`}
          className="text-xs text-slate-500 hover:text-violet-700 flex items-center gap-1.5 px-2 py-1"
        >
          <Icon name="Maximize2" size={12} />
          Расширенное планирование
        </Link>
      </div>

      {mode === "table" && <PlanTable projectId={planProject.id} />}
      {mode === "gantt" && <PlanGanttMode projectId={planProject.id} />}
      {mode === "network" && <DependencyGraphView projectId={planProject.id} embedded />}
      {mode === "milestones" && <PlanMilestonesMode projectId={planProject.id} />}
    </div>
  );
}

function PlanGanttMode({ projectId }: { projectId: number }) {
  const [scale, setScale] = useState<ScaleKind>("quarter");
  const [range, setRange] = useState(defaultRangeForScale("quarter"));
  return (
    <ProjectGanttView
      projectId={projectId}
      scale={scale}
      onScaleChange={setScale}
      dateFrom={range.from}
      dateTo={range.to}
      onRangeChange={(from, to) => {
        setRange({ from, to });
        setScale(autoScale(diffDays(parseISODate(from) || new Date(), parseISODate(to) || new Date())));
      }}
      embedded
    />
  );
}

function PlanMilestonesMode({ projectId }: { projectId: number }) {
  const range = defaultRangeForScale("year");
  return <MilestonesTimelineView filters={{ project_id: projectId }} scale="year" dateFrom={range.from} dateTo={range.to} embedded />;
}

/** Явный статус расчёта критического пути — никогда не молчит и не
 * подставляет ложную критичность вместо честного «не рассчитан». */
function CpmStatusBanner({ cpm }: { cpm: CriticalPathData | null }) {
  if (!cpm) return null;

  if (cpm.cycle) {
    return (
      <div className="px-3 py-2 bg-red-50 border-b border-red-200 text-[11px] text-red-700 flex items-start gap-1.5">
        <Icon name="RefreshCcw" size={13} className="flex-shrink-0 mt-0.5" />
        <span>Критический путь не рассчитан: обнаружен цикл зависимостей — {cpm.cycle.chain.map((c) => c.title).join(" → ")}.</span>
      </div>
    );
  }

  if (!cpm.computable) {
    return (
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600 flex items-start gap-1.5">
        <Icon name="Info" size={13} className="flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-medium">Критический путь не рассчитан</span> — недостаточно задач и подтверждённых зависимостей.
          {cpm.warnings.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {cpm.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
          {cpm.incomplete_objects.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {cpm.incomplete_objects.map((o) => (
                <li key={`${o.kind}-${o.id}`}>«{o.title}»: {o.reason}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-200 text-[11px] text-emerald-700 flex items-start gap-1.5">
      <Icon name="Zap" size={13} className="flex-shrink-0 mt-0.5" />
      <div>
        <span className="font-medium">Критический путь рассчитан</span>
        {cpm.project_duration_days != null && ` — длительность цепочки ${cpm.project_duration_days} дн.`}
        {cpm.incomplete_objects.length > 0 && (
          <span className="block mt-0.5 text-slate-600">
            {cpm.incomplete_objects.length} объект(ов) не участвовали в расчёте: {cpm.incomplete_objects.map((o) => o.title).join(", ")}.
          </span>
        )}
      </div>
    </div>
  );
}

type Row =
  | { kind: "task"; item: GanttTask; depth: number }
  | { kind: "milestone"; item: GanttMilestone; depth: number };

function buildHierarchy(tasks: GanttTask[], milestones: GanttMilestone[]): Row[] {
  const rows: Row[] = [];

  const taskChildren = new Map<number | null, GanttTask[]>();
  tasks.forEach((t) => {
    const key = t.parent_task_id ?? null;
    if (!taskChildren.has(key)) taskChildren.set(key, []);
    taskChildren.get(key)!.push(t);
  });
  const msChildren = new Map<number | null, GanttMilestone[]>();
  milestones.forEach((m) => {
    const key = m.parent_milestone_id ?? null;
    if (!msChildren.has(key)) msChildren.set(key, []);
    msChildren.get(key)!.push(m);
  });

  const sortByOutline = <T extends { outline_code?: string | null; sort_order?: number }>(a: T, b: T) =>
    (a.sort_order ?? 100) - (b.sort_order ?? 100) || (a.outline_code || "").localeCompare(b.outline_code || "", undefined, { numeric: true });

  const walkMilestones = (parentId: number | null, depth: number) => {
    (msChildren.get(parentId) || []).sort(sortByOutline).forEach((m) => {
      rows.push({ kind: "milestone", item: m, depth });
      walkMilestones(m.id, depth + 1);
    });
  };
  const walkTasks = (parentId: number | null, depth: number) => {
    (taskChildren.get(parentId) || []).sort(sortByOutline).forEach((t) => {
      rows.push({ kind: "task", item: t, depth });
      walkTasks(t.id, depth + 1);
    });
  };

  walkMilestones(null, 0);
  walkTasks(null, 0);
  return rows;
}

function PlanTable({ projectId }: { projectId: number }) {
  const [data, setData] = useState<ProjectGanttData | null>(null);
  const [cpm, setCpm] = useState<CriticalPathData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = () => {
    setLoading(true);
    setError("");
    Promise.all([execRoadmapApi.projectGantt(projectId), execRoadmapApi.criticalPath(projectId)])
      .then(([g, c]) => { setData(g); setCpm(c); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(reload, [projectId]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;
  if (data.tasks.length === 0 && data.milestones.length === 0) {
    return <Empty text="В плане пока нет ни задач, ни вех" icon="Table2" />;
  }

  const rows = buildHierarchy(data.tasks, data.milestones);
  const criticalSet = new Set(
    cpm?.computable ? cpm.nodes.filter((n) => n.is_critical).map((n) => `${n.kind}:${n.id}`) : [],
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <CpmStatusBanner cpm={cpm} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
              <th className="py-2 px-3 font-medium">№</th>
              <th className="py-2 px-3 font-medium">Задача / веха</th>
              <th className="py-2 px-3 font-medium">Тип</th>
              <th className="py-2 px-3 font-medium">Роль</th>
              <th className="py-2 px-3 font-medium">Ответственный</th>
              <th className="py-2 px-3 font-medium">План начало</th>
              <th className="py-2 px-3 font-medium">План окончание</th>
              <th className="py-2 px-3 font-medium">Прогноз</th>
              <th className="py-2 px-3 font-medium">Факт</th>
              <th className="py-2 px-3 font-medium">Статус</th>
              <th className="py-2 px-3 font-medium">%</th>
              <th className="py-2 px-3 font-medium">Критич.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const isTask = r.kind === "task";
              const isConditional = !isTask && !!(r.item as GanttMilestone).is_conditional_scenario;
              const isCritical = !isConditional && criticalSet.has(`${r.kind}:${r.item.id}`);
              const isOverdue = isTask ? (r.item as GanttTask).is_overdue : false;
              return (
                <tr key={`${r.kind}-${r.item.id}`} className={isConditional ? "bg-amber-50/50" : isCritical ? "bg-red-50/40" : undefined}>
                  <td className="py-2 px-3 text-xs font-mono text-slate-400">{r.item.outline_code || "—"}</td>
                  <td className="py-2 px-3" style={{ paddingLeft: 12 + r.depth * 20 }}>
                    <span className={`text-sm ${isConditional ? "text-amber-700 italic" : isOverdue ? "text-red-600" : "text-slate-800"}`}>
                      {r.item.title}
                    </span>
                    {isConditional && (
                      <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300 align-middle">
                        требует решения
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-xs text-slate-500">
                    {isTask ? "Задача" : isConditional ? "Условный сценарий" : "Веха"}
                  </td>
                  <td className="py-2 px-3 text-xs text-slate-500">{r.item.responsible_role || "—"}</td>
                  <td className="py-2 px-3 text-xs text-slate-700">{r.item.responsible_name || "—"}</td>
                  <td className="py-2 px-3 text-xs text-slate-500">
                    {isTask ? fmtDate((r.item as GanttTask).plan_start || null) : "—"}
                  </td>
                  <td className="py-2 px-3 text-xs text-slate-500">
                    {isTask ? fmtDate((r.item as GanttTask).due_at) : fmtDate((r.item as GanttMilestone).plan_date)}
                  </td>
                  <td className="py-2 px-3 text-xs text-slate-500">{fmtDate(r.item.forecast_date)}</td>
                  <td className="py-2 px-3 text-xs text-slate-500">{fmtDate(r.item.fact_date)}</td>
                  <td className="py-2 px-3">
                    <span className={`text-[11px] px-1.5 py-0.5 rounded ${isOverdue ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>
                      {STATUS_LABEL[r.item.status] || r.item.status}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-xs text-slate-500">
                    {isTask ? `${(r.item as GanttTask).progress_pct}%` : "—"}
                  </td>
                  <td className="py-2 px-3">
                    {isConditional ? (
                      <Icon name="HelpCircle" size={13} className="text-amber-500" />
                    ) : isCritical ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-700 border border-red-500/30">
                        да
                      </span>
                    ) : !cpm?.computable ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-400">
                        не рассчитано
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}