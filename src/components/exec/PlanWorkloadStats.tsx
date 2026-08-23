import { useMemo, useState } from "react";
import Icon from "@/components/ui/icon";
import { LaborSummary, PlanStep, ResourceLoad } from "@/lib/execPlannerApi";

const h = (v: number | null | undefined) =>
  v == null || Number(v) === 0 ? "—" : `${Number(v).toLocaleString("ru-RU")} ч`;

function Metric({
  label,
  value,
  hint,
  tone = "slate",
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "slate" | "violet" | "green" | "red" | "amber";
  icon: string;
}) {
  const tones = {
    slate: "text-slate-900 border-slate-200 bg-white",
    violet: "text-violet-700 border-violet-200 bg-violet-50/60",
    green: "text-emerald-700 border-emerald-200 bg-emerald-50/60",
    red: "text-red-700 border-red-200 bg-red-50/60",
    amber: "text-amber-700 border-amber-200 bg-amber-50/60",
  };
  return (
    <div className={`rounded-xl border p-3.5 ${tones[tone]}`}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-xs text-slate-500 leading-tight">{label}</span>
        <Icon name={icon} size={14} className="text-slate-400 flex-shrink-0" />
      </div>
      <div className="text-xl font-semibold leading-none">{value}</div>
      {hint && <div className="text-[11px] text-slate-400 mt-1.5 leading-snug">{hint}</div>}
    </div>
  );
}

export default function PlanWorkloadStats({
  load,
  labor,
  steps,
  onPersonClick,
}: {
  load: ResourceLoad[];
  labor?: LaborSummary;
  steps: PlanStep[];
  onPersonClick?: (personId: number) => void;
}) {
  const [sort, setSort] = useState<"load" | "hours" | "overdue" | "name">("load");
  const [open, setOpen] = useState<number | null>(null);

  const totals = useMemo(() => {
    const planH = Number(labor?.plan_hours || 0);
    const factH = Number(labor?.fact_hours || 0);
    const leftH = Number(labor?.left_hours || 0);
    const donePlan = Number(labor?.done_plan_hours || 0);
    const doneFact = Number(labor?.done_fact_hours || 0);
    const noEstimate = (labor?.steps || 0) - (labor?.estimated_steps || 0);
    // Точность оценки считаем только по завершённым шагам, где есть обе цифры
    const accuracy = donePlan > 0 ? Math.round((doneFact / donePlan) * 100) : null;
    return { planH, factH, leftH, donePlan, doneFact, noEstimate, accuracy };
  }, [labor]);

  const rowsSorted = useMemo(() => {
    const arr = [...load];
    arr.sort((a, b) => {
      if (sort === "name") return a.display_name.localeCompare(b.display_name, "ru");
      if (sort === "hours") return Number(b.open_hours) - Number(a.open_hours);
      if (sort === "overdue") return b.overdue_steps - a.overdue_steps;
      return b.total_workload - a.total_workload;
    });
    return arr;
  }, [load, sort]);

  const maxHours = Math.max(1, ...load.map((r) => Number(r.open_hours) || 0));
  const overloaded = load.filter((r) => r.total_workload > 100).length;
  const idle = load.filter((r) => r.active_steps === 0).length;

  const stepsOf = (personId: number) =>
    steps
      .filter(
        (s) =>
          s.responsible_person_id === personId &&
          s.status !== "done" &&
          s.status !== "cancelled",
      )
      .sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"));

  return (
    <div className="space-y-5">
      {/* Часы по плану */}
      <div>
        <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <Icon name="Clock" size={15} className="text-slate-400" />
          Трудозатраты по плану
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Metric
            label="Запланировано"
            value={h(totals.planH)}
            hint={
              totals.noEstimate > 0
                ? `${totals.noEstimate} шаг(ов) без оценки`
                : "Все шаги оценены"
            }
            tone="violet"
            icon="Target"
          />
          <Metric
            label="Отработано"
            value={h(totals.factH)}
            hint={
              totals.planH > 0
                ? `${Math.round((totals.factH / totals.planH) * 100)}% от плана`
                : undefined
            }
            tone="green"
            icon="CircleCheck"
          />
          <Metric
            label="Осталось"
            value={h(totals.leftH)}
            hint="По незавершённым шагам"
            tone="amber"
            icon="Hourglass"
          />
          <Metric
            label="Точность оценки"
            value={totals.accuracy != null ? `${totals.accuracy}%` : "—"}
            hint={
              totals.accuracy == null
                ? "Нужны факты по готовым шагам"
                : totals.accuracy > 110
                  ? "Работа занимает больше, чем планировали"
                  : totals.accuracy < 90
                    ? "Укладываетесь быстрее плана"
                    : "Оценки близки к реальности"
            }
            tone={
              totals.accuracy == null
                ? "slate"
                : totals.accuracy > 110
                  ? "red"
                  : "green"
            }
            icon="ChartNoAxesCombined"
          />
        </div>
      </div>

      {/* Пробелы в назначении */}
      {(labor?.unassigned_steps || 0) > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 flex items-start gap-2.5">
          <Icon
            name="TriangleAlert"
            size={15}
            className="text-amber-600 flex-shrink-0 mt-0.5"
          />
          <div className="text-sm text-amber-800">
            <b>{labor?.unassigned_steps}</b> незавершённых шагов ни на кого не назначены — они
            не попадают в расчёт загрузки. Назначьте ответственных, чтобы статистика была полной.
          </div>
        </div>
      )}

      {/* Люди */}
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 mr-auto">
            <Icon name="Users" size={15} className="text-slate-400" />
            Загрузка людей
            <span className="text-xs font-normal text-slate-400">
              {load.length} чел.
              {overloaded > 0 && (
                <span className="text-red-600"> · перегружено {overloaded}</span>
              )}
              {idle > 0 && <span className="text-slate-400"> · свободно {idle}</span>}
            </span>
          </h3>
          <div className="flex items-center gap-1 text-xs">
            {(
              [
                ["load", "По загрузке"],
                ["hours", "По часам"],
                ["overdue", "По просрочкам"],
                ["name", "По имени"],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                onClick={() => setSort(k)}
                className={`px-2.5 py-1 rounded-lg border transition-colors ${
                  sort === k
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {rowsSorted.map((r) => {
            const over = r.total_workload > 100;
            const openH = Number(r.open_hours) || 0;
            const expanded = open === r.person_id;
            const list = expanded ? stepsOf(r.person_id) : [];
            return (
              <div
                key={r.person_id}
                className={`rounded-xl border transition-colors ${
                  over ? "border-red-200 bg-red-50/40" : "border-slate-200 bg-white"
                }`}
              >
                <button
                  onClick={() => setOpen(expanded ? null : r.person_id)}
                  className="w-full p-3.5 text-left"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
                        over ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {r.display_name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-900">
                          {r.display_name}
                        </span>
                        {over && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">
                            перегрузка
                          </span>
                        )}
                        {r.overdue_steps > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                            просрочено {r.overdue_steps}
                          </span>
                        )}
                      </div>
                      {r.position_title && (
                        <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                          {r.position_title}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-500">
                        <span>
                          В работе: <b className="text-slate-700">{r.active_steps}</b>
                        </span>
                        <span>
                          Готово: <b className="text-emerald-600">{r.done_steps}</b>
                        </span>
                        <span>
                          Осталось: <b className="text-slate-700">{h(openH)}</b>
                        </span>
                        <span>
                          Факт: <b className="text-slate-700">{h(r.fact_hours)}</b>
                        </span>
                        {r.unestimated_steps > 0 && (
                          <span className="text-amber-600">
                            без оценки: {r.unestimated_steps}
                          </span>
                        )}
                      </div>

                      {/* Полоса часов */}
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-slate-200/70 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              over ? "bg-red-500" : "bg-violet-500"
                            }`}
                            style={{ width: `${(openH / maxHours) * 100}%` }}
                          />
                        </div>
                        <span
                          className={`text-[11px] flex-shrink-0 ${
                            over ? "text-red-600 font-medium" : "text-slate-400"
                          }`}
                        >
                          {r.total_workload}%
                        </span>
                        <Icon
                          name={expanded ? "ChevronUp" : "ChevronDown"}
                          size={13}
                          className="text-slate-400 flex-shrink-0"
                        />
                      </div>
                    </div>
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-slate-200/70 px-3.5 py-2.5">
                    {list.length === 0 ? (
                      <p className="text-xs text-slate-400 py-1">
                        Нет открытых шагов, где этот человек — ответственный
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {list.map((s) => (
                          <li key={s.id}>
                            <button
                              onClick={() => onPersonClick?.(s.id)}
                              className="w-full text-left flex items-center gap-2 text-xs group"
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                  s.is_overdue ? "bg-red-500" : "bg-slate-300"
                                }`}
                              />
                              <span className="text-slate-700 truncate group-hover:text-violet-700 transition-colors">
                                {s.title}
                              </span>
                              <span className="ml-auto flex items-center gap-2 flex-shrink-0 text-[11px]">
                                {s.estimate_hours != null && (
                                  <span className="text-slate-400">{s.estimate_hours} ч</span>
                                )}
                                {s.due_date && (
                                  <span
                                    className={
                                      s.is_overdue ? "text-red-600" : "text-slate-400"
                                    }
                                  >
                                    {new Date(s.due_date.slice(0, 10)).toLocaleDateString(
                                      "ru-RU",
                                      { day: "2-digit", month: "short" },
                                    )}
                                  </span>
                                )}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
          Загрузка выше 100% означает, что человек назначен на несколько параллельных шагов.
          Часы делятся между исполнителями шага пропорционально их участию. Нажмите на человека,
          чтобы увидеть его открытые шаги.
        </p>
      </div>
    </div>
  );
}