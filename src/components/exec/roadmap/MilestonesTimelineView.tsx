import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading, fmtDate } from "@/components/exec/ExecUI";
import { execRoadmapApi, TimelineMilestone, MilestoneFilters } from "@/lib/execRoadmapApi";
import { parseISODate, buildMonthTicks, datePx, pxPerDay, diffDays, todayISO, ScaleKind } from "@/lib/timeScale";

const STATUS_META: Record<string, { label: string; icon: string; cls: string }> = {
  not_started: { label: "Не начата", icon: "Circle", cls: "text-slate-400" },
  in_progress: { label: "В работе", icon: "CircleDot", cls: "text-violet-600" },
  achieved: { label: "Достигнута", icon: "CircleCheck", cls: "text-emerald-600" },
  cancelled: { label: "Отменена", icon: "CircleX", cls: "text-slate-300" },
};

/** Отдельная временная шкала контрольных точек всех проектов. Цвет не
 * единственный носитель состояния — везде есть иконка и текстовая подпись
 * (достигнута/просрочена/отклонение в днях). Клик открывает карточку
 * проекта на вкладке контрольных точек. */
export default function MilestonesTimelineView({
  filters, scale, dateFrom, dateTo, embedded = false,
}: { filters: MilestoneFilters; scale: ScaleKind; dateFrom: string; dateTo: string; embedded?: boolean }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<TimelineMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = () => {
    setLoading(true);
    setError("");
    execRoadmapApi.milestonesTimeline({ ...filters, date_from: dateFrom, date_to: dateTo })
      .then((d) => setItems(d.items)).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };

  useEffect(reload, [JSON.stringify(filters), dateFrom, dateTo]);

  const rangeStart = useMemo(() => parseISODate(dateFrom) || new Date(), [dateFrom]);
  const rangeEnd = useMemo(() => parseISODate(dateTo) || new Date(), [dateTo]);
  const ticks = useMemo(() => buildMonthTicks(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  const totalWidth = Math.max(600, diffDays(rangeStart, rangeEnd) * pxPerDay(scale));
  const today = parseISODate(todayISO())!;

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!items.length) return <Empty text="Вех в выбранном диапазоне не найдено" icon="Diamond" />;

  const openProject = (m: TimelineMilestone) => {
    if (!embedded && m.project_id) navigate(`/cabinet/exec/portfolio/projects/${m.project_id}?tab=milestones`);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        <div style={{ minWidth: totalWidth + 40 }} className="relative pt-8 pb-4">
          <div className="flex border-b border-slate-200 pb-2">
            {ticks.map((t, i) => (
              <div key={i} className="text-[11px] text-slate-500 flex-shrink-0 px-1" style={{ width: pxPerDay(scale) * 30.44 }}>
                {t.label}
              </div>
            ))}
          </div>
          <div className="relative" style={{ height: 40 }}>
            <div className="absolute left-0 right-0 top-1/2 h-px bg-slate-200" />
            {today >= rangeStart && today <= rangeEnd && (
              <div className="absolute top-0 bottom-0 w-px bg-red-400" style={{ left: datePx(rangeStart, today, scale) }} />
            )}
            {items.map((m) => {
              const d = parseISODate(m.plan_date);
              if (!d) return null;
              const left = datePx(rangeStart, d, scale);
              const meta = STATUS_META[m.status] || STATUS_META.not_started;
              const conditional = !!m.is_conditional_scenario;
              const dotCls = conditional ? "text-amber-500" : m.is_overdue ? "text-red-500" : meta.cls;
              const title = `${m.title}\n${m.project_title || ""}\n${conditional ? "условный сценарий — требует решения руководителя" : STATUS_META[m.status]?.label || m.status}`;
              return (
                <button
                  key={m.id}
                  onClick={() => openProject(m)}
                  className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group ${embedded ? "cursor-default" : ""}`}
                  style={{ left }}
                  title={title}
                >
                  <Icon name={conditional ? "HelpCircle" : "Diamond"} size={14} className={dotCls} />
                  {!conditional && m.is_overdue && <Icon name="TriangleAlert" size={9} className="text-red-500 absolute -top-1 -right-1" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
        {items.map((m) => {
          const meta = STATUS_META[m.status] || STATUS_META.not_started;
          const conditional = !!m.is_conditional_scenario;
          return (
            <div
              key={m.id}
              className={`p-3 flex items-start gap-3 hover:bg-slate-50 ${embedded ? "" : "cursor-pointer"} ${conditional ? "bg-amber-50/40" : ""}`}
              onClick={() => openProject(m)}
            >
              <Icon
                name={conditional ? "HelpCircle" : meta.icon}
                size={16}
                className={`flex-shrink-0 mt-0.5 ${conditional ? "text-amber-500" : m.is_overdue ? "text-red-500" : meta.cls}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-sm ${conditional ? "text-amber-700 italic" : "text-slate-900"}`}>{m.title}</p>
                  {conditional ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300">требует решения</span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{meta.label}</span>
                  )}
                  {!conditional && m.is_overdue && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">Просрочена</span>}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {m.project_title || m.initiative_title || "без проекта"}
                  {m.responsible_name && ` · ${m.responsible_name}`}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-[11px] text-slate-400">
                  <span>план {fmtDate(m.plan_date)}</span>
                  {m.plan_date_original && m.plan_date_original !== m.plan_date && (
                    <span>исходно {fmtDate(m.plan_date_original)}</span>
                  )}
                  {m.fact_date && <span>факт {fmtDate(m.fact_date)}</span>}
                  {m.deviation_days != null && m.deviation_days !== 0 && (
                    <span className={m.deviation_days > 0 ? "text-amber-600" : "text-emerald-600"}>
                      отклонение {m.deviation_days > 0 ? "+" : ""}{m.deviation_days} дн.
                    </span>
                  )}
                  {m.dependent_task_count > 0 && <span>{m.dependent_task_count} завис. задач</span>}
                </div>
                {m.achievement_criteria && <p className="text-[11px] text-slate-400 mt-1">Критерий: {m.achievement_criteria}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}