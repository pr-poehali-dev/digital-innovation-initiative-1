import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading } from "@/components/exec/ExecUI";
import { execRoadmapApi, RoadmapData, RoadmapProject, RoadmapFilters } from "@/lib/execRoadmapApi";
import {
  ScaleKind, parseISODate, diffDays, buildMonthTicks, datePx, pxPerDay,
  todayISO, defaultRangeForScale,
} from "@/lib/timeScale";

const STATUS_CLS: Record<string, string> = {
  idea: "bg-slate-300", planned: "bg-sky-400", in_progress: "bg-violet-500",
  on_hold: "bg-amber-400", completed: "bg-emerald-500", cancelled: "bg-slate-300",
};
const PRIORITY_LABEL: Record<string, string> = { urgent: "срочный", high: "высокий", normal: "обычный", low: "низкий" };

/** Дорожная карта портфеля: инициативы → проекты, с этапами и вехами
 * внутри полосы. Рисуется через SVG/CSS без сторонних Gantt-библиотек —
 * первая фаза только просмотр (фильтры, масштаб, раскрытие, переход в
 * карточку), без перетаскивания мышью. */
export type RoadmapViewMode = "actual" | "baseline" | "deviation";

export default function RoadmapView({
  filters, scale, onScaleChange, dateFrom, dateTo, onRangeChange, viewMode = "actual",
}: {
  filters: RoadmapFilters;
  scale: ScaleKind;
  onScaleChange: (s: ScaleKind) => void;
  dateFrom: string;
  dateTo: string;
  onRangeChange: (from: string, to: string) => void;
  viewMode?: RoadmapViewMode;
}) {
  const navigate = useNavigate();
  const [data, setData] = useState<RoadmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const reload = () => {
    setLoading(true);
    setError("");
    execRoadmapApi.roadmap({ ...filters, date_from: dateFrom, date_to: dateTo })
      .then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };

  useEffect(reload, [JSON.stringify(filters), dateFrom, dateTo]);

  const rangeStart = useMemo(() => parseISODate(dateFrom) || new Date(), [dateFrom]);
  const rangeEnd = useMemo(() => parseISODate(dateTo) || new Date(), [dateTo]);
  const ticks = useMemo(() => buildMonthTicks(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  const totalWidth = Math.max(600, diffDays(rangeStart, rangeEnd) * pxPerDay(scale));
  const today = parseISODate(todayISO())!;
  const todayLeft = datePx(rangeStart, today, scale);
  const showToday = today >= rangeStart && today <= rangeEnd;

  const goToday = () => {
    const r = defaultRangeForScale(scale);
    onRangeChange(r.from, r.to);
  };

  const toggle = (key: string) => {
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key); else next.add(key);
    setCollapsed(next);
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data || !data.initiatives.length) return <Empty text="Проектов в выбранном диапазоне не найдено" icon="CalendarRange" />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
          {(["month", "quarter", "year"] as ScaleKind[]).map((s) => (
            <button
              key={s}
              onClick={() => { onScaleChange(s); const r = defaultRangeForScale(s); onRangeChange(r.from, r.to); }}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                scale === s ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {{ week: "Неделя", month: "Месяц", quarter: "Квартал", year: "Год" }[s]}
            </button>
          ))}
        </div>
        <button
          onClick={goToday}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-violet-300 text-slate-600 hover:text-violet-700 flex items-center gap-1.5"
        >
          <Icon name="CalendarClock" size={13} /> Сегодня
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        <div style={{ minWidth: totalWidth + 260 }}>
          {/* Заголовок шкалы */}
          <div className="flex sticky top-0 bg-white z-10 border-b border-slate-200">
            <div className="w-[260px] flex-shrink-0 px-3 py-2 text-xs font-medium text-slate-500 border-r border-slate-100">
              Инициатива / проект
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
              {showToday && (
                <div className="absolute top-0 bottom-0 w-px bg-red-400" style={{ left: todayLeft }} title="Сегодня" />
              )}
            </div>
          </div>

          {/* Строки инициатив и проектов */}
          {data.initiatives.map((init) => {
            const key = `init-${init.id ?? "none"}`;
            const isCollapsed = collapsed.has(key);
            return (
              <div key={key}>
                <div className="flex items-center border-b border-slate-100 bg-slate-50/60">
                  <button
                    onClick={() => toggle(key)}
                    className="w-[260px] flex-shrink-0 px-3 py-2 text-sm font-medium text-slate-800 flex items-center gap-1.5 hover:text-violet-700"
                  >
                    <Icon name={isCollapsed ? "ChevronRight" : "ChevronDown"} size={14} className="text-slate-400 flex-shrink-0" />
                    <span className="truncate">{init.title}</span>
                    <span className="text-[11px] text-slate-400 flex-shrink-0">({init.projects.length})</span>
                  </button>
                  <div style={{ width: totalWidth }} />
                </div>
                {!isCollapsed && init.projects.map((p) => (
                  <ProjectRow
                    key={p.id} project={p} rangeStart={rangeStart} scale={scale}
                    totalWidth={totalWidth} onOpen={() => navigate(`/cabinet/exec/portfolio/projects/${p.id}`)}
                    collapsed={collapsed} toggle={toggle} viewMode={viewMode}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
        {Object.entries(STATUS_CLS).slice(0, 5).map(([status, cls]) => (
          <span key={status} className="inline-flex items-center gap-1">
            <span className={`inline-block w-2 h-2 rounded-full ${cls}`} />
            {{ idea: "Идея", planned: "Запланирован", in_progress: "В работе", on_hold: "Приостановлен", completed: "Завершён" }[status]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1"><Icon name="Diamond" size={11} className="text-violet-500" /> веха</span>
        <span className="inline-flex items-center gap-1"><Icon name="TriangleAlert" size={11} className="text-red-500" /> критический риск</span>
      </div>
    </div>
  );
}

function ProjectRow({
  project: p, rangeStart, scale, totalWidth, onOpen, collapsed, toggle, viewMode,
}: {
  project: RoadmapProject; rangeStart: Date; scale: ScaleKind; totalWidth: number;
  onOpen: () => void; collapsed: Set<string>; toggle: (k: string) => void; viewMode: RoadmapViewMode;
}) {
  const stageKey = `proj-${p.id}`;
  const hasStages = p.stages.length > 0;
  const isStagesCollapsed = collapsed.has(stageKey) || !hasStages;

  const start = parseISODate(p.plan_start);
  const end = parseISODate(p.plan_end);
  const left = start ? Math.max(0, datePx(rangeStart, start, scale)) : 0;
  const width = start && end ? Math.max(6, datePx(rangeStart, end, scale) - left) : 0;

  const dev = p.baseline_deviation;
  const baselineStart = parseISODate(dev.baseline_start);
  const baselineEnd = parseISODate(dev.baseline_end);
  const bLeft = baselineStart ? Math.max(0, datePx(rangeStart, baselineStart, scale)) : 0;
  const bWidth = baselineStart && baselineEnd ? Math.max(6, datePx(rangeStart, baselineEnd, scale) - bLeft) : 0;
  const deviationDays = dev.deviation_end_days;

  const warnings: string[] = [];
  if (p.is_overdue) warnings.push("просрочен");
  if (p.critical_risk_count > 0) warnings.push(`${p.critical_risk_count} критич. риск(ов)`);
  if (p.resource_gap_count > 0) warnings.push(`дефицит ресурсов`);
  if (p.is_overbudget) warnings.push("прогноз перерасхода");
  if (p.has_cross_project_dependency) warnings.push("есть межпроектная зависимость");
  if (viewMode !== "actual" && !dev.has_baseline) warnings.push("нет baseline");
  if (viewMode === "deviation" && dev.has_baseline && !dev.baseline_integrity_ok) warnings.push("нарушена целостность baseline");
  if (viewMode === "deviation" && deviationDays) warnings.push(`сдвиг ${deviationDays > 0 ? "+" : ""}${deviationDays} дн.`);
  if (viewMode === "deviation" && p.critical_path_changed) warnings.push("критический путь изменился");

  const nextMilestone = p.milestones
    .filter((m) => m.status !== "achieved")
    .sort((a, b) => a.plan_date.localeCompare(b.plan_date))[0];
  if (nextMilestone) warnings.push(`ближайшая веха: ${nextMilestone.title}`);

  return (
    <div>
      <div className="flex items-center border-b border-slate-50 hover:bg-slate-50/50 group">
        <div className="w-[260px] flex-shrink-0 px-3 py-2 pl-7 min-w-0">
          <div className="flex items-center gap-1.5">
            {hasStages && (
              <button onClick={() => toggle(stageKey)} className="text-slate-400 hover:text-slate-700 flex-shrink-0">
                <Icon name={isStagesCollapsed ? "ChevronRight" : "ChevronDown"} size={12} />
              </button>
            )}
            <button onClick={onOpen} className="text-xs text-slate-800 hover:text-violet-700 truncate text-left min-w-0" title={p.title}>
              {p.title}
            </button>
            {p.has_cross_project_dependency && (
              <Icon name="Link2" size={11} className="text-amber-600 flex-shrink-0" />
            )}
          </div>
          {warnings.length > 0 && (
            <p className="text-[10px] text-amber-700 mt-0.5 pl-4 truncate" title={warnings.join(" · ")}>{warnings.join(" · ")}</p>
          )}
        </div>
        <div className="relative py-2" style={{ width: totalWidth, height: 32 }} title={`${p.title}\n${p.plan_start ?? "нет даты"} — ${p.plan_end ?? "нет даты"}\nГотовность ${p.progress_pct}%\nПриоритет: ${PRIORITY_LABEL[p.priority] ?? p.priority}`}>
            {viewMode !== "actual" && baselineStart && baselineEnd && (
              <div
                className="absolute top-0.5 h-2 rounded bg-slate-300 border border-slate-400"
                style={{ left: bLeft, width: bWidth }}
                title={`Baseline: ${dev.baseline_start} — ${dev.baseline_end}`}
              />
            )}
            {(viewMode === "actual" || viewMode === "deviation") && (start && end ? (
              <div
                className={`absolute h-4 rounded-md ${viewMode === "deviation" ? "top-3" : "top-1"} ${STATUS_CLS[p.status] || "bg-slate-300"} ${p.is_overdue ? "ring-2 ring-red-400" : ""} opacity-90 flex items-center overflow-hidden cursor-pointer`}
                style={{ left, width }}
                onClick={onOpen}
              >
                <div className="h-full bg-black/20" style={{ width: `${p.progress_pct}%` }} />
              </div>
            ) : (
              <span className="absolute top-1.5 left-0 text-[10px] text-slate-400 italic">даты не заданы</span>
            ))}
            {viewMode === "baseline" && !(baselineStart && baselineEnd) && (
              <span className="absolute top-1.5 left-0 text-[10px] text-slate-400 italic">нет baseline</span>
            )}
            {p.milestones.map((m) => {
              const md = parseISODate(m.plan_date);
              if (!md) return null;
              const mLeft = datePx(rangeStart, md, scale);
              const achieved = m.status === "achieved";
              return (
                <div
                  key={m.id}
                  className="absolute top-0"
                  style={{ left: mLeft - 4 }}
                  title={`${m.title} · ${achieved ? "достигнута" : "план " + m.plan_date}`}
                >
                  <Icon name="Diamond" size={9} className={achieved ? "text-emerald-600" : m.plan_date < todayISO() ? "text-red-500" : "text-violet-500"} />
                </div>
              );
            })}
        </div>
      </div>
      {!isStagesCollapsed && p.stages.map((s) => (
        <div key={s.id} className="flex items-center border-b border-slate-50">
          <div className="w-[260px] flex-shrink-0 px-3 py-1.5 pl-11 text-[11px] text-slate-500 truncate">{s.title}</div>
          <div className="relative" style={{ width: totalWidth, height: 20 }}>
            {s.plan_start && s.plan_end && (
              <div
                className="absolute top-1 h-2.5 rounded bg-slate-300"
                style={{
                  left: Math.max(0, datePx(rangeStart, parseISODate(s.plan_start)!, scale)),
                  width: Math.max(4, datePx(rangeStart, parseISODate(s.plan_end)!, scale) - datePx(rangeStart, parseISODate(s.plan_start)!, scale)),
                }}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}