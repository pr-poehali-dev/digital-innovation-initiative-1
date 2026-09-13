import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading, fmtDate } from "@/components/exec/ExecUI";
import { execRoadmapApi, ProjectGanttData, GanttTask, GanttMilestone, GanttStage, ScheduleBaseline } from "@/lib/execRoadmapApi";
import {
  ScaleKind, parseISODate, diffDays, buildMonthTicks, datePx, pxPerDay, todayISO,
} from "@/lib/timeScale";
import { StageFormDialog } from "@/components/exec/PortfolioForms";

const STAGE_STATUS_CLS: Record<string, string> = {
  not_started: "bg-slate-300", in_progress: "bg-violet-500", done: "bg-emerald-500",
  blocked: "bg-red-400", cancelled: "bg-slate-200",
};
const TASK_STATUS_CLS: Record<string, string> = {
  not_started: "bg-slate-300", in_progress: "bg-violet-500", blocked: "bg-red-400",
  review: "bg-amber-400", done: "bg-emerald-500", cancelled: "bg-slate-200",
};

type Row =
  | { kind: "stage"; id: number; title: string; status: string; plan_start: string | null; plan_end: string | null; fact_start: string | null; fact_end: string | null }
  | (GanttTask & { kind: "task" });

const ROW_HEIGHT = 34;
// Виртуализация без стороннего пакета: рендерим только строки, попадающие
// в видимую область скролла (+ запас), остальные — пустой отступ. Для
// диаграммы одного проекта (десятки-сотни строк) этого достаточно —
// не тянем react-window ради разового экрана.
const OVERSCAN_PX = 400;

/** Интерактивная диаграмма Ганта проекта в режиме просмотра: этапы,
 * задачи и вехи на временной шкале с готовностью, просрочкой,
 * ответственными и зависимостями. Перетаскивание сроков мышью не
 * реализовано намеренно — изменение дат остаётся через существующие
 * формы редактирования проекта/задачи/вехи. */
export default function ProjectGanttView({
  projectId, scale, onScaleChange, dateFrom, dateTo, onRangeChange,
}: {
  projectId: number;
  scale: ScaleKind;
  onScaleChange: (s: ScaleKind) => void;
  dateFrom: string;
  dateTo: string;
  onRangeChange: (from: string, to: string) => void;
}) {
  const navigate = useNavigate();
  const [data, setData] = useState<ProjectGanttData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [collapsedStages, setCollapsedStages] = useState<Set<number>>(new Set());
  const [baselineDetail, setBaselineDetail] = useState<ScheduleBaseline | null>(null);
  const [baselineLoading, setBaselineLoading] = useState(false);
  const [stageDialogOpen, setStageDialogOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<GanttStage | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);

  const reload = () => {
    setLoading(true);
    setError("");
    execRoadmapApi.projectGantt(projectId).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };

  useEffect(reload, [projectId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener("scroll", onScroll);
    setViewportH(el.clientHeight || 600);
    return () => el.removeEventListener("scroll", onScroll);
  }, [data]);

  const rangeStart = useMemo(() => parseISODate(dateFrom) || new Date(), [dateFrom]);
  const rangeEnd = useMemo(() => parseISODate(dateTo) || new Date(), [dateTo]);
  const ticks = useMemo(() => buildMonthTicks(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  const totalWidth = Math.max(700, diffDays(rangeStart, rangeEnd) * pxPerDay(scale));
  const today = parseISODate(todayISO())!;
  const showToday = today >= rangeStart && today <= rangeEnd;
  const todayLeft = datePx(rangeStart, today, scale);

  const toggleStage = (id: number) => {
    const next = new Set(collapsedStages);
    if (next.has(id)) next.delete(id); else next.add(id);
    setCollapsedStages(next);
  };

  // Строим плоский список строк: этап, затем его задачи (если не свёрнут).
  const rows: Row[] = useMemo(() => {
    if (!data) return [];
    const out: Row[] = [];
    const tasksByStage = new Map<number | null, GanttTask[]>();
    data.tasks.forEach((t) => {
      const key = t.stage_id;
      if (!tasksByStage.has(key)) tasksByStage.set(key, []);
      tasksByStage.get(key)!.push(t);
    });
    data.stages.forEach((s) => {
      out.push({ kind: "stage", ...s });
      if (!collapsedStages.has(s.id)) {
        (tasksByStage.get(s.id) || []).forEach((t) => out.push({ kind: "task", ...t }));
      }
    });
    // Задачи без этапа — отдельным псевдо-блоком в конце
    const orphanTasks = tasksByStage.get(null) || [];
    orphanTasks.forEach((t) => out.push({ kind: "task", ...t }));
    return out;
  }, [data, collapsedStages]);

  const totalHeight = rows.length * ROW_HEIGHT;
  const firstVisible = Math.max(0, Math.floor((scrollTop - OVERSCAN_PX) / ROW_HEIGHT));
  const lastVisible = Math.min(rows.length, Math.ceil((scrollTop + viewportH + OVERSCAN_PX) / ROW_HEIGHT));
  const visibleRows = rows.slice(firstVisible, lastVisible);
  const topPad = firstVisible * ROW_HEIGHT;

  // Критический путь: задачи, участвующие хотя бы в одной зависимости —
  // упрощённая подсветка без полного расчёта резервов (первый выпуск).
  const criticalTaskIds = useMemo(() => {
    if (!data) return new Set<number>();
    const ids = new Set<number>();
    data.dependencies.forEach((d) => {
      if (d.src_kind === "task") ids.add(d.src_id);
      if (d.tgt_kind === "task") ids.add(d.tgt_id);
    });
    return ids;
  }, [data]);

  const toggleBaseline = () => {
    if (baselineDetail) { setBaselineDetail(null); return; }
    if (!data?.latest_baseline) return;
    setBaselineLoading(true);
    execRoadmapApi.baseline(data.latest_baseline.id).then(setBaselineDetail).finally(() => setBaselineLoading(false));
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;
  if (!data.stages.length && !data.tasks.length && !data.milestones.length) {
    return <Empty text="В проекте пока нет этапов, задач или вех для отображения на диаграмме" icon="GanttChartSquare" />;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
          {(["month", "quarter", "year"] as ScaleKind[]).map((s) => (
            <button
              key={s}
              onClick={() => onScaleChange(s)}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                scale === s ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {{ month: "Месяц", quarter: "Квартал", year: "Год" }[s]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {data.latest_baseline && (
            <button
              onClick={toggleBaseline}
              disabled={baselineLoading}
              className={`h-8 px-2.5 text-xs rounded-md border flex items-center gap-1.5 transition-colors ${
                baselineDetail ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-500 hover:border-slate-300"
              }`}
              title={`Baseline версия ${data.latest_baseline.version_number} от ${fmtDate(data.latest_baseline.created_at)}`}
            >
              <Icon name="History" size={12} /> {baselineLoading ? "Загрузка…" : "Сравнить с baseline"}
            </button>
          )}
          <button
            onClick={() => { const d = new Date(); onRangeChange(
              new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10),
              new Date(d.getFullYear(), d.getMonth() + 3, 0).toISOString().slice(0, 10),
            ); }}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-violet-300 text-slate-600 hover:text-violet-700 flex items-center gap-1.5"
          >
            <Icon name="CalendarClock" size={13} /> Сегодня
          </button>
          <button
            onClick={() => { setEditingStage(null); setStageDialogOpen(true); }}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-violet-300 text-slate-600 hover:text-violet-700 flex items-center gap-1.5"
          >
            <Icon name="Plus" size={13} /> Этап
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <div style={{ minWidth: totalWidth + 280 }}>
            <div className="flex sticky top-0 bg-white z-10 border-b border-slate-200">
              <div className="w-[280px] flex-shrink-0 px-3 py-2 text-xs font-medium text-slate-500 border-r border-slate-100">
                Этап / задача
              </div>
              <div className="relative" style={{ width: totalWidth }}>
                <div className="flex h-full">
                  {ticks.map((t, i) => (
                    <div
                      key={i}
                      className={`text-[11px] text-slate-500 px-1.5 py-2 border-r border-slate-100 flex-shrink-0 ${t.isYearStart ? "font-semibold text-slate-700" : ""}`}
                      style={{ width: pxPerDay(scale) * 30.44 }}
                    >
                      {t.label}
                    </div>
                  ))}
                </div>
                {showToday && <div className="absolute top-0 bottom-0 w-px bg-red-400" style={{ left: todayLeft }} />}
              </div>
            </div>

            <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: 480 }}>
              <div style={{ height: totalHeight, position: "relative" }}>
                <div style={{ position: "absolute", top: topPad, left: 0, right: 0 }}>
                  {visibleRows.map((row) =>
                    row.kind === "stage" ? (
                      <StageRow
                        key={`stage-${row.id}`} row={row} rangeStart={rangeStart} scale={scale} totalWidth={totalWidth}
                        collapsed={collapsedStages.has(row.id)} onToggle={() => toggleStage(row.id)}
                        onEdit={() => {
                          const full = data?.stages.find((s) => s.id === row.id) || null;
                          setEditingStage(full);
                          setStageDialogOpen(true);
                        }}
                      />
                    ) : (
                      <TaskRow
                        key={`task-${row.id}`} task={row} rangeStart={rangeStart} scale={scale} totalWidth={totalWidth}
                        isCritical={criticalTaskIds.has(row.id)}
                      />
                    )
                  )}
                </div>
                {/* Вехи — поверх всех строк, привязаны к общей временной оси */}
                {data.milestones.map((m) => (
                  <MilestoneMarker key={`m-${m.id}`} milestone={m} rangeStart={rangeStart} scale={scale} navigate={navigate} projectId={projectId} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {baselineDetail && (
        <BaselineComparison baseline={baselineDetail} current={data} />
      )}

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-violet-500" /> в работе</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500" /> выполнено</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-slate-300" /> не начато</span>
        <span className="inline-flex items-center gap-1"><Icon name="Diamond" size={11} className="text-violet-500" /> веха</span>
        <span className="inline-flex items-center gap-1"><Icon name="Link2" size={11} className="text-amber-600" /> участвует в зависимости</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full ring-2 ring-red-400" /> просрочено</span>
      </div>

      <StageFormDialog
        open={stageDialogOpen}
        onOpenChange={setStageDialogOpen}
        stage={editingStage}
        projectId={projectId}
        onSaved={reload}
      />
    </div>
  );
}

function StageRow({
  row, rangeStart, scale, totalWidth, collapsed, onToggle, onEdit,
}: {
  row: Extract<Row, { kind: "stage" }>; rangeStart: Date; scale: ScaleKind; totalWidth: number;
  collapsed: boolean; onToggle: () => void; onEdit: () => void;
}) {
  const start = parseISODate(row.plan_start);
  const end = parseISODate(row.plan_end);
  const left = start ? datePx(rangeStart, start, scale) : 0;
  const width = start && end ? Math.max(6, datePx(rangeStart, end, scale) - left) : 0;

  return (
    <div className="flex items-center bg-slate-50/60 border-b border-slate-100 group" style={{ height: ROW_HEIGHT }}>
      <button onClick={onToggle} className="w-[254px] flex-shrink-0 px-3 flex items-center gap-1.5 text-sm font-medium text-slate-800 hover:text-violet-700 min-w-0">
        <Icon name={collapsed ? "ChevronRight" : "ChevronDown"} size={13} className="text-slate-400 flex-shrink-0" />
        <span className="truncate">{row.title}</span>
      </button>
      <button onClick={onEdit} className="w-[26px] flex-shrink-0 text-slate-300 hover:text-violet-600 opacity-0 group-hover:opacity-100 transition-opacity" title="Редактировать этап">
        <Icon name="Pencil" size={12} />
      </button>
      <div className="relative" style={{ width: totalWidth, height: ROW_HEIGHT }}
           title={`${row.title}\n${row.plan_start ? fmtDate(row.plan_start) : "нет даты"} — ${row.plan_end ? fmtDate(row.plan_end) : "нет даты"}`}>
        {start && end && (
          <div className={`absolute top-2 h-2.5 rounded ${STAGE_STATUS_CLS[row.status] || "bg-slate-300"}`} style={{ left, width }} />
        )}
      </div>
    </div>
  );
}

function TaskRow({
  task, rangeStart, scale, totalWidth, isCritical,
}: { task: GanttTask; rangeStart: Date; scale: ScaleKind; totalWidth: number; isCritical: boolean }) {
  const navigate = useNavigate();
  const due = parseISODate(task.due_at);
  const barWidth = 90; // условная ширина плашки задачи от предполагаемой стартовой точки до срока
  const left = due ? Math.max(0, datePx(rangeStart, due, scale) - barWidth) : 0;

  return (
    <div className="flex items-center border-b border-slate-50 hover:bg-slate-50/50" style={{ height: ROW_HEIGHT }}>
      <div className="w-[280px] flex-shrink-0 px-3 pl-8 min-w-0">
        <button onClick={() => navigate(`/cabinet/exec/portfolio/projects/${task.project_id}?tab=tasks`)} className="text-xs text-slate-700 hover:text-violet-700 truncate block text-left w-full" title={task.title}>
          {task.title}
        </button>
        {task.responsible_name && <p className="text-[10px] text-slate-400 truncate">{task.responsible_name}</p>}
      </div>
      <div className="relative" style={{ width: totalWidth, height: ROW_HEIGHT }}
           title={`${task.title}\n${task.due_at ? "срок " + fmtDate(task.due_at) : "без срока"}\nГотовность ${task.progress_pct}%`}>
        {due ? (
          <div
            className={`absolute top-2 h-2.5 rounded-md ${TASK_STATUS_CLS[task.status] || "bg-slate-300"} ${task.is_overdue ? "ring-2 ring-red-400" : ""} flex items-center overflow-hidden`}
            style={{ left, width: barWidth }}
          >
            <div className="h-full bg-black/20" style={{ width: `${task.progress_pct}%` }} />
            {isCritical && <Icon name="Link2" size={9} className="absolute -top-3 text-amber-600" />}
          </div>
        ) : (
          <span className="absolute top-2 left-0 text-[10px] text-slate-400 italic">без срока</span>
        )}
      </div>
    </div>
  );
}

function MilestoneMarker({
  milestone: m, rangeStart, scale, navigate, projectId,
}: { milestone: GanttMilestone; rangeStart: Date; scale: ScaleKind; navigate: ReturnType<typeof useNavigate>; projectId: number }) {
  const d = parseISODate(m.plan_date);
  if (!d) return null;
  const left = datePx(rangeStart, d, scale);
  const achieved = m.status === "achieved";
  const overdue = !achieved && m.plan_date < todayISO();
  return (
    <button
      onClick={() => navigate(`/cabinet/exec/portfolio/projects/${projectId}?tab=milestones`)}
      className="absolute z-10"
      style={{ left: left + 280 - 4, top: 4 }}
      title={`${m.title}\n${achieved ? "достигнута" : overdue ? "просрочена" : "план " + fmtDate(m.plan_date)}`}
    >
      <Icon name="Diamond" size={11} className={achieved ? "text-emerald-600" : overdue ? "text-red-500" : "text-violet-500"} />
    </button>
  );
}

interface BaselinePayloadShape {
  project?: { plan_start?: string | null; plan_end?: string | null };
  tasks?: { id: number; title: string; due_at?: string | null }[];
  milestones?: { id: number; title: string; plan_date?: string | null }[];
}

function dayDiff(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  return diffDays(new Date(a), new Date(b));
}

/** Сравнение baseline (зафиксированного снимка дат) с текущим планом.
 * Показывает только объекты, где даты разошлись — если ничего не
 * изменилось с момента фиксации baseline, список будет пуст. */
function BaselineComparison({ baseline, current }: { baseline: ScheduleBaseline; current: ProjectGanttData }) {
  const payload = baseline.payload as BaselinePayloadShape;
  const rows: { label: string; baselineDate: string | null; currentDate: string | null }[] = [];

  const projEnd = payload.project?.plan_end ?? null;
  if (projEnd && projEnd !== current.project.plan_end) {
    rows.push({ label: `Проект «${current.project.title}» — завершение`, baselineDate: projEnd, currentDate: current.project.plan_end });
  }
  (payload.tasks || []).forEach((bt) => {
    const now = current.tasks.find((t) => t.id === bt.id);
    if (now && bt.due_at !== now.due_at) {
      rows.push({ label: `Задача «${bt.title}»`, baselineDate: bt.due_at ?? null, currentDate: now.due_at });
    }
  });
  (payload.milestones || []).forEach((bm) => {
    const now = current.milestones.find((m) => m.id === bm.id);
    if (now && bm.plan_date !== now.plan_date) {
      rows.push({ label: `Веха «${bm.title}»`, baselineDate: bm.plan_date ?? null, currentDate: now.plan_date });
    }
  });

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
      <p className="font-medium text-amber-800 mb-1.5">
        Baseline версия {baseline.version_number} от {fmtDate(baseline.created_at)}
        {!baseline.integrity_ok && <span className="ml-2 text-red-600">⚠ целостность снимка нарушена</span>}
      </p>
      {rows.length === 0 ? (
        <p className="text-amber-700">Сроки не отличаются от зафиксированного baseline.</p>
      ) : (
        <div className="space-y-1">
          {rows.map((r, i) => {
            const diff = dayDiff(r.baselineDate, r.currentDate);
            return (
              <div key={i} className="flex items-center justify-between gap-2 text-amber-800">
                <span className="truncate">{r.label}</span>
                <span className="flex-shrink-0">
                  {fmtDate(r.baselineDate)} → {fmtDate(r.currentDate)}
                  {diff != null && diff !== 0 && (
                    <span className={diff > 0 ? "text-red-600 ml-1" : "text-emerald-600 ml-1"}>
                      ({diff > 0 ? "+" : ""}{diff} дн.)
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}