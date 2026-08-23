import { useMemo } from "react";
import Icon from "@/components/ui/icon";
import { Avatar } from "./TeamUI";
import { ABSENCE_TYPE, WorkloadRow, fmtWeek, fmtWeekShort } from "@/lib/execPeopleApi";

interface PersonRow {
  person_id: number;
  display_name: string;
  position_title: string | null;
  cells: Map<string, WorkloadRow>;
  maxPct: number;
  totalPlan: number;
}

export default function WeekGrid({
  rows,
  thresholds,
  onCell,
  onPerson,
}: {
  rows: WorkloadRow[];
  thresholds: { low: number; high: number };
  onCell: (personId: number, week: string) => void;
  onPerson: (personId: number) => void;
}) {
  const weeks = useMemo(
    () => Array.from(new Set(rows.map((r) => r.week_start))).sort(),
    [rows],
  );

  const people = useMemo(() => {
    const map = new Map<number, PersonRow>();
    rows.forEach((r) => {
      let p = map.get(r.person_id);
      if (!p) {
        p = {
          person_id: r.person_id,
          display_name: r.display_name,
          position_title: r.position_title,
          cells: new Map(),
          maxPct: 0,
          totalPlan: 0,
        };
        map.set(r.person_id, p);
      }
      p.cells.set(r.week_start, r);
      p.maxPct = Math.max(p.maxPct, r.load_pct || 0);
      p.totalPlan += r.planned_hours;
    });
    return Array.from(map.values()).sort((a, b) => b.maxPct - a.maxPct);
  }, [rows]);

  const cellColor = (r: WorkloadRow | undefined) => {
    if (!r) return "bg-slate-50";
    if (r.absence_type && r.planned_hours === 0) return "bg-sky-50";
    if (r.capacity_hours === 0) return "bg-slate-100";
    const pct = r.load_pct ?? 0;
    if (pct > thresholds.high) return "bg-red-100 hover:bg-red-200";
    if (pct >= thresholds.low) return "bg-green-100 hover:bg-green-200";
    if (pct > 0) return "bg-slate-100 hover:bg-slate-200";
    return "bg-white hover:bg-slate-50";
  };

  const textColor = (r: WorkloadRow | undefined) => {
    if (!r) return "text-slate-300";
    const pct = r.load_pct ?? 0;
    if (pct > thresholds.high) return "text-red-800";
    if (pct >= thresholds.low) return "text-green-800";
    if (pct > 0) return "text-slate-700";
    return "text-slate-400";
  };

  if (!people.length) {
    return (
      <div className="py-10 text-center">
        <Icon name="CalendarRange" size={26} className="text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-400">Нет данных за выбранный период</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="border-collapse" style={{ minWidth: 240 + weeks.length * 78 }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-20 bg-slate-50 border-b border-r border-slate-200 text-left px-3 py-2 w-[240px] min-w-[240px]">
                <span className="text-xs font-medium text-slate-500">Сотрудник</span>
              </th>
              {weeks.map((w) => (
                <th
                  key={w}
                  title={fmtWeek(w)}
                  className="bg-slate-50 border-b border-slate-200 px-1 py-2 w-[78px] min-w-[78px]"
                >
                  <span className="text-[11px] font-medium text-slate-500 tabular-nums">
                    {fmtWeekShort(w)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.person_id} className="group">
                <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-b border-r border-slate-200 px-3 py-2 transition-colors">
                  <button
                    onClick={() => onPerson(p.person_id)}
                    className="flex items-center gap-2 text-left w-full min-w-0"
                  >
                    <Avatar name={p.display_name} size={26} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-900 truncate hover:text-violet-700 transition-colors">
                        {p.display_name}
                      </span>
                      <span className="block text-[11px] text-slate-400 truncate">
                        {p.position_title || "—"}
                      </span>
                    </span>
                  </button>
                </td>
                {weeks.map((w) => {
                  const r = p.cells.get(w);
                  return (
                    <td
                      key={w}
                      onClick={() => r && onCell(p.person_id, w)}
                      title={
                        r
                          ? `${fmtWeek(w)}\nЁмкость: ${r.capacity_hours} ч\nПлан: ${
                              r.planned_hours
                            } ч\nЗагрузка: ${r.load_pct ?? "—"}%${
                              r.absence_type
                                ? `\n${ABSENCE_TYPE[r.absence_type]?.title}: ${r.absence_days} дн.`
                                : ""
                            }`
                          : ""
                      }
                      className={`border-b border-slate-100 text-center cursor-pointer transition-colors ${cellColor(
                        r,
                      )}`}
                    >
                      <div className="px-1 py-1.5">
                        <span
                          className={`block text-xs font-medium tabular-nums ${textColor(r)}`}
                        >
                          {r ? (r.planned_hours > 0 ? `${r.planned_hours}ч` : "—") : "—"}
                        </span>
                        <span className={`block text-[10px] tabular-nums ${textColor(r)}`}>
                          {r?.load_pct != null ? `${r.load_pct}%` : ""}
                        </span>
                        {r?.absence_type && (
                          <span
                            className="block w-full h-[3px] rounded-full bg-sky-400 mt-0.5"
                            title={ABSENCE_TYPE[r.absence_type]?.title}
                          />
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-4 px-3 py-2.5 border-t border-slate-200 bg-slate-50/60 text-[11px] text-slate-500">
        <Legend cls="bg-slate-100" text={`Резерв, до ${thresholds.low}%`} />
        <Legend cls="bg-green-100" text={`Норма, ${thresholds.low}–${thresholds.high}%`} />
        <Legend cls="bg-red-100" text={`Перегрузка, свыше ${thresholds.high}%`} />
        <Legend cls="bg-sky-50" text="Отсутствие" />
        <span className="ml-auto">Нажмите на ячейку, чтобы увидеть задачи недели</span>
      </div>
    </div>
  );
}

function Legend({ cls, text }: { cls: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-3 h-3 rounded border border-slate-200 ${cls}`} />
      {text}
    </span>
  );
}
