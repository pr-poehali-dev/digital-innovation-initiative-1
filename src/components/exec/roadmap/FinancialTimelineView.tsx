import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading, fmtDate } from "@/components/exec/ExecUI";
import { execResourcesApi, FinancialTimeline } from "@/lib/execResourcesApi";

const MONTHS_SHORT = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

function fmtMoney(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} млн ₽`;
  if (Math.abs(v) >= 1000) return `${Math.round(v / 1000)} тыс ₽`;
  return `${Math.round(v)} ₽`;
}

/** Финансовая шкала проекта на той же временной оси, что Гант и ресурсы:
 * утверждённый бюджет, ФОТ, факт, обязательства, ожидаемые расходы,
 * прогноз и отклонение по месяцам. Читает существующий финансовый контур
 * (бюджет/ФОТ/факт/обязательства проекта) — суммы не копируются в новые
 * структуры, только раскладываются по месяцам года для отображения. */
export default function FinancialTimelineView({ projectId }: { projectId: number }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<FinancialTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = () => {
    setLoading(true);
    setError("");
    execResourcesApi.financialTimeline(projectId, year).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };

  useEffect(reload, [projectId, year]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  const months = Array.from({ length: 12 }, (_, i) => data.months[String(i + 1)]);
  const totalBudget = months.reduce((s, m) => s + (m?.budget_plan || 0), 0);
  const totalForecast = months.reduce((s, m) => s + (m?.forecast || 0), 0);
  const totalFact = months.reduce((s, m) => s + (m?.fact || 0), 0);
  const totalFot = months.reduce((s, m) => s + (m?.fot_plan || 0), 0);
  const deviation = totalForecast - totalBudget;
  const hasAnyData = totalBudget > 0 || totalForecast > 0 || totalFact > 0;
  const maxScale = Math.max(1, ...months.map((m) => Math.max(m?.budget_plan || 0, m?.forecast || 0, m?.fact || 0)));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => setYear(year - 1)} className="w-6 h-6 rounded hover:bg-slate-100 flex items-center justify-center">
          <Icon name="ChevronLeft" size={14} />
        </button>
        <span className="text-sm font-semibold w-14 text-center">{year}</span>
        <button onClick={() => setYear(year + 1)} className="w-6 h-6 rounded hover:bg-slate-100 flex items-center justify-center">
          <Icon name="ChevronRight" size={14} />
        </button>
      </div>

      {!hasAnyData ? (
        <Empty text="Финансовые данные за этот год пока не заведены — во вкладке «Бюджет»" icon="Wallet" />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Metric label="Утверждённый бюджет" value={fmtMoney(totalBudget)} />
            <Metric label="ФОТ (план)" value={fmtMoney(totalFot)} />
            <Metric label="Факт" value={fmtMoney(totalFact)} />
            <Metric label="Прогноз" value={fmtMoney(totalForecast)} tone={deviation > 0 ? "danger" : "default"} />
          </div>
          {deviation !== 0 && (
            <div className={`rounded-lg border p-2.5 text-xs flex items-center gap-1.5 ${deviation > 0 ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
              <Icon name={deviation > 0 ? "TrendingUp" : "TrendingDown"} size={13} />
              Отклонение прогноза от бюджета: {deviation > 0 ? "+" : ""}{fmtMoney(deviation)}
            </div>
          )}
          {data.commitments_without_dates > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 flex items-center gap-1.5">
              <Icon name="Info" size={13} /> {fmtMoney(data.commitments_without_dates)} в открытых обязательствах без дат — не распределены по месяцам, уточните сроки договора.
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-2 sticky left-0 bg-white">Показатель</th>
                  {MONTHS_SHORT.map((m) => <th key={m} className="px-1.5 py-2 text-center font-medium">{m}</th>)}
                </tr>
              </thead>
              <tbody>
                <TimelineRow label="Бюджет (план)" values={months.map((m) => m?.budget_plan || 0)} max={maxScale} cls="bg-slate-200" />
                <TimelineRow label="ФОТ (план)" values={months.map((m) => m?.fot_plan || 0)} max={maxScale} cls="bg-violet-200" />
                <TimelineRow label="Факт" values={months.map((m) => m?.fact || 0)} max={maxScale} cls="bg-emerald-300" />
                <TimelineRow label="Обязательства (открытые)" values={months.map((m) => m?.commitments_open || 0)} max={maxScale} cls="bg-amber-200" />
                <TimelineRow label="Ожидаемые расходы" values={months.map((m) => m?.expected || 0)} max={maxScale} cls="bg-sky-200" />
                <TimelineRow label="Прогноз" values={months.map((m) => m?.forecast || 0)} max={maxScale} cls="bg-red-200" bold />
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
            <LegendItem cls="bg-slate-200" label="бюджет" />
            <LegendItem cls="bg-violet-200" label="ФОТ" />
            <LegendItem cls="bg-emerald-300" label="факт" />
            <LegendItem cls="bg-amber-200" label="обязательства" />
            <LegendItem cls="bg-sky-200" label="ожидаемые" />
            <LegendItem cls="bg-red-200" label="прогноз" />
          </div>
        </>
      )}

      {data.key_payments.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1.5"><Icon name="Banknote" size={13} /> Ключевые платежи</h4>
          <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
            {data.key_payments.map((p) => (
              <div key={`${p.kind}-${p.id}`} className="p-2.5 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${p.kind === "actual" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {p.kind === "actual" ? "факт" : "обязательство"}
                  </span>
                  <span className="text-slate-600">{p.comment || "—"}</span>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{fmtMoney(p.amount)}</p>
                  <p className="text-[10px] text-slate-400">{fmtDate(p.date)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.milestones.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1.5"><Icon name="Flag" size={13} /> Финансовые контрольные точки (вехи проекта)</h4>
          <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
            {data.milestones.map((m) => (
              <div key={m.id} className="p-2.5 flex items-center justify-between text-sm">
                <span>{m.title}</span>
                <div className="text-right text-[10px] text-slate-400">
                  <span className={`px-1.5 py-0.5 rounded mr-1.5 ${m.status === "achieved" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{m.status}</span>
                  {fmtDate(m.plan_date)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "danger" }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
      <p className="text-[10px] text-slate-500 leading-snug">{label}</p>
      <p className={`text-sm font-semibold mt-1 ${tone === "danger" ? "text-red-600" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function TimelineRow({ label, values, max, cls, bold }: { label: string; values: number[]; max: number; cls: string; bold?: boolean }) {
  const allZero = values.every((v) => v === 0);
  return (
    <tr className="border-b border-slate-50">
      <td className={`py-1.5 px-2 sticky left-0 bg-white whitespace-nowrap ${bold ? "font-semibold" : "text-slate-600"}`}>{label}</td>
      {values.map((v, i) => (
        <td key={i} className="px-1 py-1.5 text-center">
          {allZero ? (
            <span className="text-slate-300">—</span>
          ) : (
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-full h-6 bg-slate-50 rounded relative overflow-hidden">
                <div className={`absolute bottom-0 left-0 right-0 ${cls}`} style={{ height: `${Math.min(100, (v / max) * 100)}%` }} />
              </div>
              <span className={`text-[9px] ${bold ? "font-semibold" : "text-slate-500"}`}>{v > 0 ? fmtMoney(v) : ""}</span>
            </div>
          )}
        </td>
      ))}
    </tr>
  );
}

function LegendItem({ cls, label }: { cls: string; label: string }) {
  return <span className="inline-flex items-center gap-1"><span className={`inline-block w-2.5 h-2.5 rounded ${cls}`} /> {label}</span>;
}
