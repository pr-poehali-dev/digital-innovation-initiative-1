import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading, fmtDate } from "@/components/exec/ExecUI";
import {
  execRoadmapApi, ScheduleComparisonData, ScheduleComparisonRow, ScheduleBaselineSummary,
} from "@/lib/execRoadmapApi";
import { parseISODate, diffDays, datePx, pxPerDay, buildMonthTicks, todayISO, ScaleKind } from "@/lib/timeScale";
import ScheduleChangeLogView from "@/components/exec/roadmap/ScheduleChangeLogView";

const KIND_ICON: Record<string, string> = { project: "Folder", stage: "FolderTree", task: "ListTodo", milestone: "Diamond" };
const KIND_LABEL: Record<string, string> = { project: "Проект", stage: "Этап", task: "Задача", milestone: "Веха" };

/** Сравнение четырёх слоёв расписания проекта на одной временной шкале:
 * baseline (зафиксированный снимок) / актуальный план / прогноз / факт.
 * Цвет не единственный носитель информации — у каждого слоя свой стиль
 * заливки/штриховки и подпись. Первый выпуск — только просмотр и выбор
 * версии baseline, без редактирования сроков мышью. */
export default function ScheduleComparisonView({ projectId }: { projectId: number }) {
  const navigate = useNavigate();
  const [data, setData] = useState<ScheduleComparisonData | null>(null);
  const [baselines, setBaselines] = useState<ScheduleBaselineSummary[]>([]);
  const [selectedBaselineId, setSelectedBaselineId] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [busyActivate, setBusyActivate] = useState(false);
  const [mode, setMode] = useState<"comparison" | "history">("comparison");

  const reload = (baselineId?: number) => {
    setLoading(true);
    setError("");
    Promise.all([
      execRoadmapApi.scheduleComparison(projectId, baselineId),
      execRoadmapApi.baselines("project", projectId),
    ])
      .then(([cmp, bl]) => { setData(cmp); setBaselines(bl.items); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => reload(selectedBaselineId), [projectId, selectedBaselineId]);

  const activateBaseline = async (id: number) => {
    setBusyActivate(true);
    try {
      await execRoadmapApi.setActiveBaseline(id);
      reload(selectedBaselineId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyActivate(false);
    }
  };

  const createBaseline = async () => {
    setBusyActivate(true);
    try {
      const r = await execRoadmapApi.createBaseline({ scope_kind: "project", scope_id: projectId });
      await execRoadmapApi.setActiveBaseline(r.id);
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyActivate(false);
    }
  };

  const allRows = useMemo(() => {
    if (!data) return [];
    return [data.rows.project, ...data.rows.stages, ...data.rows.tasks, ...data.rows.milestones];
  }, [data]);

  const criticalKeys = useMemo(() => {
    if (!data) return new Set<string>();
    const s = new Set<string>();
    data.summary.newly_critical.forEach((c) => s.add(`${c.kind}:${c.id}`));
    return s;
  }, [data]);

  const filteredRows = useMemo(() => {
    return allRows.filter((r) => {
      if (onlyChanged && !r.deviation_end_days && !r.deviation_start_days) return false;
      if (onlyCritical && !criticalKeys.has(`${r.kind}:${r.id}`)) return false;
      return true;
    });
  }, [allRows, onlyChanged, onlyCritical, criticalKeys]);

  const dateBounds = useMemo(() => {
    const dates: Date[] = [];
    allRows.forEach((r) => {
      [r.baseline_start, r.baseline_end, r.actual_start, r.actual_end, r.forecast_end, r.fact_start, r.fact_end].forEach((d) => {
        const parsed = parseISODate(d);
        if (parsed) dates.push(parsed);
      });
    });
    if (!dates.length) return null;
    const min = new Date(Math.min(...dates.map((d) => d.getTime())));
    const max = new Date(Math.max(...dates.map((d) => d.getTime())));
    min.setDate(min.getDate() - 5);
    max.setDate(max.getDate() + 5);
    return { min, max };
  }, [allRows]);

  const scale: ScaleKind = dateBounds ? (diffDays(dateBounds.min, dateBounds.max) > 400 ? "year" : diffDays(dateBounds.min, dateBounds.max) > 120 ? "quarter" : "month") : "month";
  const ticks = dateBounds ? buildMonthTicks(dateBounds.min, dateBounds.max) : [];
  const totalWidth = dateBounds ? Math.max(600, diffDays(dateBounds.min, dateBounds.max) * pxPerDay(scale)) : 600;
  const today = parseISODate(todayISO())!;

  const openRow = (r: ScheduleComparisonRow) => {
    if (r.kind === "project") return;
    const tab = r.kind === "milestone" ? "milestones" : r.kind === "task" ? "tasks" : "gantt";
    navigate(`/cabinet/exec/portfolio/projects/${projectId}?tab=${tab}`);
  };

  const ModeSwitch = (
    <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-0.5 w-fit">
      <button
        onClick={() => setMode("comparison")}
        className={`px-2.5 py-1 text-xs rounded-md transition-colors ${mode === "comparison" ? "bg-violet-100 text-violet-700" : "text-slate-500 hover:text-slate-700"}`}
      >
        Сравнение
      </button>
      <button
        onClick={() => setMode("history")}
        className={`px-2.5 py-1 text-xs rounded-md transition-colors flex items-center gap-1 ${mode === "history" ? "bg-violet-100 text-violet-700" : "text-slate-500 hover:text-slate-700"}`}
      >
        <Icon name="History" size={11} /> История изменений
      </button>
    </div>
  );

  if (mode === "history") {
    return (
      <div className="space-y-3">
        {ModeSwitch}
        <ScheduleChangeLogView projectId={projectId} />
      </div>
    );
  }

  if (loading) return <div className="space-y-3">{ModeSwitch}<Loading /></div>;
  if (error) return <div className="space-y-3">{ModeSwitch}<ErrorBox message={error} onRetry={() => reload(selectedBaselineId)} /></div>;
  if (!data) return null;

  return (
    <div className="space-y-3">
      {ModeSwitch}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <select
            value={selectedBaselineId ?? (data.baseline?.id ?? "")}
            onChange={(e) => setSelectedBaselineId(e.target.value ? Number(e.target.value) : undefined)}
            className="h-8 text-xs rounded-md border border-slate-200 px-2 text-slate-600"
          >
            <option value="">Действующая версия</option>
            {baselines.map((b) => (
              <option key={b.id} value={b.id}>
                Версия {b.version_number}{b.is_active ? " (действующая)" : ""} · {fmtDate(b.created_at)}
              </option>
            ))}
          </select>
          {data.baseline && !baselines.find((b) => b.id === data.baseline!.id)?.is_active && (
            <button
              onClick={() => activateBaseline(data.baseline!.id)}
              disabled={busyActivate}
              className="h-8 px-2.5 text-xs rounded-md border border-violet-300 bg-violet-50 text-violet-700"
            >
              Сделать действующей
            </button>
          )}
          <button
            onClick={createBaseline}
            disabled={busyActivate}
            className="h-8 px-2.5 text-xs rounded-md border border-slate-200 text-slate-600 hover:border-slate-300 flex items-center gap-1.5"
          >
            <Icon name="Camera" size={12} /> Создать baseline из текущего плана
          </button>
        </div>
        <div className="flex items-center gap-2">
          <FilterToggle active={onlyChanged} label="Только с отклонениями" icon="TrendingUp" onClick={() => setOnlyChanged(!onlyChanged)} />
          <FilterToggle active={onlyCritical} label="Только критические" icon="Zap" onClick={() => setOnlyCritical(!onlyCritical)} />
        </div>
      </div>

      {data.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
          {data.warnings.map((w, i) => <p key={i} className="flex items-center gap-1.5"><Icon name="Info" size={13} /> {w}</p>)}
        </div>
      )}

      <SummaryPanel data={data} />

      {!allRows.length ? (
        <Empty text="Нет данных для сравнения" icon="GitCompare" />
      ) : !dateBounds ? (
        <Empty text="Ни у одного объекта нет дат для отображения на шкале" icon="CalendarX" />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <div style={{ minWidth: totalWidth + 280 }}>
            <div className="flex sticky top-0 bg-white z-10 border-b border-slate-200">
              <div className="w-[280px] flex-shrink-0 px-3 py-2 text-xs font-medium text-slate-500 border-r border-slate-100">Объект</div>
              <div className="relative" style={{ width: totalWidth }}>
                <div className="flex h-full">
                  {ticks.map((t, i) => (
                    <div key={i} className="text-[11px] text-slate-500 px-1.5 py-2 border-r border-slate-100 flex-shrink-0" style={{ width: pxPerDay(scale) * 30.44 }}>
                      {t.label}
                    </div>
                  ))}
                </div>
                {today >= dateBounds.min && today <= dateBounds.max && (
                  <div className="absolute top-0 bottom-0 w-px bg-red-400" style={{ left: datePx(dateBounds.min, today, scale) }} />
                )}
              </div>
            </div>
            {filteredRows.map((r) => (
              <ComparisonRow
                key={`${r.kind}-${r.id}`} row={r} rangeStart={dateBounds.min} scale={scale} totalWidth={totalWidth}
                isCritical={criticalKeys.has(`${r.kind}:${r.id}`)} onOpen={() => openRow(r)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-4 h-2 rounded bg-slate-200 border border-slate-300" /> baseline</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-4 h-2 rounded bg-violet-400" /> актуальный план</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 border-t-2 border-dashed border-amber-500" /> прогноз</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-4 h-2 rounded bg-emerald-500" /> факт</span>
      </div>
    </div>
  );
}

function FilterToggle({ active, label, icon, onClick }: { active: boolean; label: string; icon: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`h-8 px-2.5 text-xs rounded-md border flex items-center gap-1.5 transition-colors ${
        active ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-500 hover:border-slate-300"
      }`}
    >
      <Icon name={icon} size={12} /> {label}
    </button>
  );
}

function SummaryPanel({ data }: { data: ScheduleComparisonData }) {
  const s = data.summary;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <Metric label="Смещение окончания проекта" value={s.project_end_shift_days != null ? `${s.project_end_shift_days > 0 ? "+" : ""}${s.project_end_shift_days} дн.` : "—"}
              tone={s.project_end_shift_days && s.project_end_shift_days > 0 ? "danger" : "default"} />
      <Metric label="Сдвинутые задачи" value={s.shifted_tasks_count} />
      <Metric label="Сдвинутые вехи" value={s.shifted_milestones_count} />
      <Metric label="Новые критические" value={s.newly_critical.length} tone={s.newly_critical.length > 0 ? "danger" : "default"} />
      <Metric label="Больше не критические" value={s.no_longer_critical.length} tone={s.no_longer_critical.length > 0 ? "success" : "default"} />
      <Metric label="Просрочено" value={s.overdue_count} tone={s.overdue_count > 0 ? "danger" : "default"} />
      <Metric label="Без фактических дат" value={s.no_fact_data_count} tone={s.no_fact_data_count > 0 ? "warning" : "default"} />
      <Metric label="Режим календаря" value="календарные дни" />
    </div>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "danger" | "warning" | "success" }) {
  const cls = { default: "text-slate-900", danger: "text-red-600", warning: "text-amber-600", success: "text-emerald-600" }[tone];
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
      <p className="text-[10px] text-slate-500 leading-snug">{label}</p>
      <p className={`text-sm font-semibold mt-1 ${cls}`}>{value}</p>
    </div>
  );
}

function ComparisonRow({
  row: r, rangeStart, scale, totalWidth, isCritical, onOpen,
}: { row: ScheduleComparisonRow; rangeStart: Date; scale: ScaleKind; totalWidth: number; isCritical: boolean; onOpen: () => void }) {
  const bs = parseISODate(r.baseline_start), be = parseISODate(r.baseline_end);
  const as = parseISODate(r.actual_start), ae = parseISODate(r.actual_end);
  const fe = parseISODate(r.forecast_end);
  const facts = parseISODate(r.fact_start), facte = parseISODate(r.fact_end);

  const px = (d: Date) => datePx(rangeStart, d, scale);
  const fmt = (d: string | null | undefined) => fmtDate(d ?? null);

  return (
    <div className="flex items-start border-b border-slate-50 hover:bg-slate-50/50">
      <div className="w-[280px] flex-shrink-0 px-3 py-2 min-w-0">
        <button onClick={onOpen} className="flex items-center gap-1.5 text-xs text-slate-800 hover:text-violet-700 text-left min-w-0 w-full">
          <Icon name={KIND_ICON[r.kind]} size={12} className="text-slate-400 flex-shrink-0" />
          <span className="truncate">{r.title}</span>
        </button>
        <div className="flex flex-wrap gap-1 mt-1 pl-4.5">
          <span className="text-[9px] px-1 rounded bg-slate-100 text-slate-500">{KIND_LABEL[r.kind]}</span>
          {isCritical && <span className="text-[9px] px-1 rounded bg-red-100 text-red-700 flex items-center gap-0.5"><Icon name="Zap" size={8} />критич.</span>}
          {r.baseline_missing && <span className="text-[9px] px-1 rounded bg-slate-100 text-slate-400">нет в baseline</span>}
        </div>
        {r.data_quality_warning && (
          <p className="text-[9px] text-amber-600 mt-1 flex items-center gap-1"><Icon name="TriangleAlert" size={9} />{r.data_quality_warning}</p>
        )}
        {r.deviation_end_days != null && r.deviation_end_days !== 0 && (
          <p className={`text-[10px] mt-1 font-medium ${r.deviation_end_days > 0 ? "text-red-600" : "text-emerald-600"}`}>
            {r.deviation_end_days > 0 ? "+" : ""}{r.deviation_end_days} дн.
          </p>
        )}
      </div>
      <div className="relative py-3" style={{ width: totalWidth, height: 56 }}>
        {bs && be && (
          <div className="absolute top-1 h-2 rounded bg-slate-200 border border-slate-300" style={{ left: px(bs), width: Math.max(4, px(be) - px(bs)) }} title={`Baseline: ${fmt(r.baseline_start)} — ${fmt(r.baseline_end)}`} />
        )}
        {as && ae && (
          <div className={`absolute top-4 h-2 rounded ${isCritical ? "bg-red-400" : "bg-violet-400"}`} style={{ left: px(as), width: Math.max(4, px(ae) - px(as)) }} title={`Актуальный план: ${fmt(r.actual_start)} — ${fmt(r.actual_end)}`} />
        )}
        {!as && ae && (
          <div className={`absolute top-4 h-2 w-2 rounded-full ${isCritical ? "bg-red-400" : "bg-violet-400"}`} style={{ left: px(ae) - 4 }} title={`Актуальный план: ${fmt(r.actual_end)}`} />
        )}
        {fe && (
          <div className="absolute top-7 flex items-center" style={{ left: px(fe) - 4 }} title={`Прогноз: ${fmt(r.forecast_end)}`}>
            <Icon name="TrendingUp" size={10} className="text-amber-500" />
          </div>
        )}
        {facts && facte && (
          <div className="absolute top-9 h-2 rounded bg-emerald-500" style={{ left: px(facts), width: Math.max(4, px(facte) - px(facts)) }} title={`Факт: ${fmt(r.fact_start)} — ${fmt(r.fact_end)}`} />
        )}
        {!facts && facte && (
          <div className="absolute top-9 h-2 w-2 rounded-full bg-emerald-500" style={{ left: px(facte) - 4 }} title={`Факт: ${fmt(r.fact_end)}`} />
        )}
        {!facte && !facts && (r.status === "done" || r.status === "achieved" || r.status === "completed") && (
          <span className="absolute top-9 text-[9px] text-slate-400 italic" style={{ left: 0 }}>нет данных</span>
        )}
      </div>
    </div>
  );
}