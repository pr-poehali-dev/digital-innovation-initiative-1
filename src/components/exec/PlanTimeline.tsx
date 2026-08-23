import { useMemo } from "react";
import Icon from "@/components/ui/icon";
import { Plan, PlanStep, STEP_STATUS } from "@/lib/execPlannerApi";

const DAY = 86400000;

function parse(d: string | null): number | null {
  if (!d) return null;
  const t = new Date(d.slice(0, 10)).getTime();
  return Number.isNaN(t) ? null : t;
}

function fmtShort(ms: number): string {
  return new Date(ms).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
}

interface Row {
  step: PlanStep;
  depth: number;
}

/** Плоский список шагов в порядке дерева — для строк шкалы. */
function flatten(steps: PlanStep[], parent: number | null = null, depth = 0): Row[] {
  return steps
    .filter((s) => (s.parent_step_id ?? null) === parent)
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    .flatMap((s) => [{ step: s, depth }, ...flatten(steps, s.id, depth + 1)]);
}

export default function PlanTimeline({
  plan,
  onStepClick,
}: {
  plan: Plan;
  onStepClick?: (s: PlanStep) => void;
}) {
  const steps = (plan.steps || []).filter((s) => s.status !== "cancelled");

  const { rows, from, span, ticks, todayPct, planEndPct } = useMemo(() => {
    const list = flatten(steps);
    const dates: number[] = [];
    steps.forEach((s) => {
      const a = parse(s.start_date);
      const b = parse(s.due_date);
      if (a) dates.push(a);
      if (b) dates.push(b);
    });
    const ps = parse(plan.start_date);
    const pe = parse(plan.due_date);
    if (ps) dates.push(ps);
    if (pe) dates.push(pe);
    dates.push(Date.now());

    if (!dates.length) {
      return { rows: list, from: 0, span: 0, ticks: [], todayPct: 0, planEndPct: null };
    }

    let min = Math.min(...dates);
    let max = Math.max(...dates);
    if (max - min < 14 * DAY) max = min + 14 * DAY;
    const pad = (max - min) * 0.04;
    min -= pad;
    max += pad;
    const total = max - min;

    // Метки шкалы — начала месяцев
    const marks: { pct: number; label: string }[] = [];
    const cur = new Date(min);
    cur.setDate(1);
    cur.setHours(0, 0, 0, 0);
    while (cur.getTime() <= max) {
      const t = cur.getTime();
      if (t >= min) {
        marks.push({
          pct: ((t - min) / total) * 100,
          label: cur.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" }),
        });
      }
      cur.setMonth(cur.getMonth() + 1);
    }

    return {
      rows: list,
      from: min,
      span: total,
      ticks: marks,
      todayPct: ((Date.now() - min) / total) * 100,
      planEndPct: pe !== null ? ((pe - min) / total) * 100 : null,
    };
  }, [steps, plan.start_date, plan.due_date]);

  if (!steps.length) {
    return (
      <div className="py-10 text-center">
        <Icon name="GanttChartSquare" size={30} className="text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">Добавьте шаги — здесь появится шкала времени</p>
      </div>
    );
  }

  const planEnd = parse(plan.due_date);

  return (
    <div
      className="overflow-x-auto overflow-y-hidden overscroll-x-contain"
      style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x pan-y" }}
    >
      <div className="min-w-[620px] sm:min-w-[760px]">
        {/* Шапка со шкалой */}
        <div className="flex border-b border-slate-200 pb-1.5 mb-1.5">
          <div className="w-[150px] sm:w-[240px] flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Шаг
          </div>
          <div className="flex-1 relative h-4">
            {ticks.map((t) => (
              <span
                key={t.pct}
                className="absolute text-[10px] text-slate-400 -translate-x-1/2 whitespace-nowrap"
                style={{ left: `${t.pct}%` }}
              >
                {t.label}
              </span>
            ))}
          </div>
        </div>

        {/* Строки */}
        <div className="relative">
          {/* Вертикальные линии месяцев */}
          <div className="absolute inset-0 left-[150px] sm:left-[240px] pointer-events-none">
            {ticks.map((t) => (
              <div
                key={t.pct}
                className="absolute top-0 bottom-0 w-px bg-slate-100"
                style={{ left: `${t.pct}%` }}
              />
            ))}
            {todayPct >= 0 && todayPct <= 100 && (
              <div
                className="absolute top-0 bottom-0 w-px bg-violet-500 z-10"
                style={{ left: `${todayPct}%` }}
              >
                <span className="absolute -top-0.5 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-violet-500" />
              </div>
            )}
            {planEndPct !== null && planEndPct >= 0 && planEndPct <= 100 && (
              <div
                className="absolute top-0 bottom-0 w-px border-l border-dashed border-red-400 z-10"
                style={{ left: `${planEndPct}%` }}
              />
            )}
          </div>

          {rows.map(({ step, depth }) => {
            const a = parse(step.start_date);
            const b = parse(step.due_date);
            const st = STEP_STATUS[step.status] || STEP_STATUS.not_started;
            const outOfRange = planEnd && b && b > planEnd;

            let left = 0;
            let width = 0;
            if (span > 0) {
              const s0 = a ?? b;
              const e0 = b ?? a;
              if (s0 !== null && e0 !== null) {
                left = ((s0 - from) / span) * 100;
                width = Math.max(((e0 - s0) / span) * 100, 0.8);
              }
            }

            return (
              <div
                key={step.id}
                className="flex items-center h-9 group hover:bg-slate-50 rounded transition-colors"
              >
                <div
                  className="w-[150px] sm:w-[240px] flex-shrink-0 pr-3 flex items-center gap-1.5 min-w-0"
                  style={{ paddingLeft: `${depth * 14}px` }}
                >
                  {step.is_milestone ? (
                    <Icon name="Diamond" size={11} className="text-violet-600 flex-shrink-0" />
                  ) : (
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${st.dot}`} />
                  )}
                  <button
                    onClick={() => onStepClick?.(step)}
                    className="text-xs text-slate-700 truncate hover:text-violet-700 text-left"
                    title={step.title}
                  >
                    {step.title}
                  </button>
                </div>

                <div className="flex-1 relative h-9 flex items-center">
                  {a || b ? (
                    step.is_milestone ? (
                      <div
                        className="absolute -translate-x-1/2 z-20"
                        style={{ left: `${left + width}%` }}
                        title={`${step.title}${b ? ` · ${fmtShort(b)}` : ""}`}
                      >
                        <div
                          className={`w-3 h-3 rotate-45 border-2 ${
                            step.status === "done"
                              ? "bg-green-500 border-green-500"
                              : step.is_overdue
                              ? "bg-red-500 border-red-500"
                              : "bg-white border-violet-600"
                          }`}
                        />
                      </div>
                    ) : (
                      <div
                        className="absolute h-4 rounded-md z-20 flex items-center overflow-hidden"
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={`${step.title}${a ? ` · с ${fmtShort(a)}` : ""}${
                          b ? ` по ${fmtShort(b)}` : ""
                        }`}
                      >
                        <div
                          className={`absolute inset-0 rounded-md ${
                            step.status === "done"
                              ? "bg-green-200"
                              : step.is_overdue || outOfRange
                              ? "bg-red-200"
                              : "bg-violet-200"
                          }`}
                        />
                        <div
                          className={`absolute inset-y-0 left-0 rounded-md ${
                            step.status === "done"
                              ? "bg-green-500"
                              : step.is_overdue || outOfRange
                              ? "bg-red-500"
                              : "bg-violet-500"
                          }`}
                          style={{
                            width: `${step.status === "done" ? 100 : step.progress_pct || 0}%`,
                          }}
                        />
                      </div>
                    )
                  ) : (
                    <span className="text-[10px] text-slate-300 pl-1">без дат</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Легенда */}
        <div className="flex items-center gap-4 flex-wrap pt-3 mt-1 border-t border-slate-200 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded bg-violet-500" /> в графике
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded bg-green-500" /> готово
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded bg-red-500" /> просрочено
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rotate-45 border-2 border-violet-600" /> веха
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-px h-3 bg-violet-500" /> сегодня
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 border-t border-dashed border-red-400" /> общий срок
          </span>
        </div>
      </div>
    </div>
  );
}