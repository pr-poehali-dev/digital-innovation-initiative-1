import { useEffect, useState } from "react";
import { Card, Empty, ErrorBox, Loading, Metric, fmtDate } from "@/components/exec/ExecUI";
import { goalsApi, GoalsDashboard } from "@/lib/execGoalsApi";
import type { GoalsSubTab } from "@/pages/cabinet/exec/ExecGoalsPage";

/** Главная страница раздела «Цели и показатели». Каждая карточка открывает
 * отфильтрованный список — переключением вкладки (без query-параметров,
 * т.к. вкладки живут в состоянии страницы). */
export default function GoalsOverviewTab({ centerId, onNavigate }: { centerId: number; onNavigate: (tab: GoalsSubTab) => void }) {
  const [data, setData] = useState<GoalsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = () => {
    setLoading(true);
    setError("");
    goalsApi.dashboard(centerId).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };

  useEffect(reload, [centerId]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Metric label="Активных целей" value={data.active_goals_count} icon="Target" onClick={() => onNavigate("goals")} />
        <Metric label="Достигнутых целей" value={data.achieved_goals_count} icon="CircleCheck" />
        <Metric
          label="Просроченных целей" value={data.overdue_goals_count} icon="CalendarX"
          tone={data.overdue_goals_count > 0 ? "danger" : "default"} onClick={() => onNavigate("goals")}
        />
        <Metric
          label="Целей с риском" value={data.at_risk_goals.length} icon="TrendingDown"
          tone={data.at_risk_goals.length > 0 ? "warning" : "default"} onClick={() => onNavigate("goals")}
        />
        <Metric
          label="Целей без владельца" value={data.goals_without_owner.length} icon="UserX"
          tone={data.goals_without_owner.length > 0 ? "danger" : "default"} onClick={() => onNavigate("goals")}
        />
        <Metric label="Показателей всего" value={data.indicators_total} icon="Gauge" onClick={() => onNavigate("indicators")} />
        <Metric
          label="Показателей без данных" value={data.indicators_no_data_count} icon="HelpCircle"
          tone={data.indicators_no_data_count > 0 ? "warning" : "default"} onClick={() => onNavigate("indicators")}
        />
        <Metric
          label="Показателей с нарушенным порогом" value={data.indicators_red_count} icon="TriangleAlert"
          tone={data.indicators_red_count > 0 ? "danger" : "default"} onClick={() => onNavigate("indicators")}
        />
        <Metric
          label="Результаты на подтверждении" value={data.results_pending.length} icon="FileCheck"
          tone={data.results_pending.length > 0 ? "warning" : "default"} onClick={() => onNavigate("results")}
        />
        <Metric
          label="Эффекты на подтверждении" value={data.effects_pending.length} icon="Sparkles"
          tone={data.effects_pending.length > 0 ? "warning" : "default"} onClick={() => onNavigate("effects")}
        />
      </div>

      {data.at_risk_goals.length > 0 && (
        <Card title="Цели с риском отклонения" icon="TrendingDown">
          <div className="divide-y divide-slate-100">
            {data.at_risk_goals.map((g) => (
              <div key={g.id} className="py-2 flex items-center justify-between text-sm">
                <span className="text-slate-900">{g.title}</span>
                <span className="text-amber-700 font-medium">{g.progress?.progress_pct}%</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Подтверждённые эффекты за 90 дней" icon="Sparkles">
        {!data.effects_confirmed_recent.length ? (
          <Empty text="Подтверждённых эффектов за период нет" icon="Sparkles" />
        ) : (
          <div className="divide-y divide-slate-100">
            {data.effects_confirmed_recent.map((e) => (
              <div key={e.id} className="py-2 flex items-center justify-between text-sm">
                <div>
                  <p className="text-slate-900">{e.title}</p>
                  <p className="text-xs text-slate-500">{e.metric}</p>
                </div>
                <div className="text-right">
                  <p className="text-emerald-700 font-medium">{e.actual_value}</p>
                  <p className="text-xs text-slate-400">{e.measured_at ? fmtDate(e.measured_at) : ""}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {data.indicators_quality_issues.length > 0 && (
        <Card title="Показатели без методики или источника" icon="AlertTriangle">
          <div className="divide-y divide-slate-100">
            {data.indicators_quality_issues.map((i) => (
              <div key={i.id} className="py-2 text-sm">
                <p className="text-slate-900">{i.title}</p>
                <p className="text-xs text-amber-700">{i.data_quality_warnings.join(" · ")}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}