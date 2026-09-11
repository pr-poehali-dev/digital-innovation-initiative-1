import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { Metric, Empty, Loading, ErrorBox, fmtDate } from "@/components/exec/ExecUI";
import {
  execReportsApi, DashboardKpi, AttentionItem, PortfolioRow, UpcomingEvents,
} from "@/lib/execReportsApi";
import { execResourcesApi, TeamLoadRow } from "@/lib/execResourcesApi";

const KPI_CARDS: Array<{ key: keyof DashboardKpi; label: string; icon: string; tone: "default" | "danger" | "warning" | "success"; filter?: Record<string, string> }> = [
  { key: "active_actions", label: "Активные поручения", icon: "ClipboardCheck", tone: "default" },
  { key: "overdue_actions", label: "Просроченные поручения", icon: "AlertTriangle", tone: "danger" },
  { key: "active_projects", label: "Активные проекты", icon: "Folder", tone: "default", filter: { tab: "projects", status: "in_progress" } },
  { key: "overdue_tasks", label: "Просроченные задачи", icon: "ListTodo", tone: "danger", filter: { tab: "tasks", overdue: "1" } },
  { key: "blocked_tasks", label: "Заблокированные задачи", icon: "Ban", tone: "warning", filter: { tab: "tasks", status: "blocked" } },
  { key: "milestones_7", label: "Вехи на 7 дней", icon: "Flag", tone: "warning" },
  { key: "milestones_14", label: "Вехи на 14 дней", icon: "Flag", tone: "default" },
  { key: "milestones_30", label: "Вехи на 30 дней", icon: "Flag", tone: "default" },
  { key: "critical_risks", label: "Критические риски", icon: "ShieldAlert", tone: "danger", filter: { tab: "risks", level: "critical" } },
  { key: "open_issues", label: "Открытые проблемы", icon: "AlertOctagon", tone: "danger" },
  { key: "pending_decisions", label: "Требуют решения", icon: "HelpCircle", tone: "warning" },
  { key: "results_pending", label: "Результаты на подтверждении", icon: "FileQuestion", tone: "warning" },
  { key: "effects_pending", label: "Эффекты на подтверждении", icon: "TrendingUp", tone: "warning" },
  { key: "effects_confirmed", label: "Подтверждённые эффекты", icon: "CheckCircle2", tone: "success" },
];

const ATTENTION_ICON: Record<string, string> = {
  action: "ClipboardCheck", milestone: "Flag", task: "ListTodo", risk: "ShieldAlert",
  issue: "AlertOctagon", decision: "HelpCircle", result: "FileQuestion", effect: "TrendingUp", project: "Folder",
};

export default function ExecDashboardPage() {
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const [kpiData, setKpiData] = useState<DashboardKpi | null>(null);
  const [attention, setAttention] = useState<AttentionItem[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioRow[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingEvents | null>(null);
  const [finKpi, setFinKpi] = useState<Awaited<ReturnType<typeof execResourcesApi.portfolioFinancialKpi>> | null>(null);
  const [teamLoad, setTeamLoad] = useState<TeamLoadRow[]>([]);
  const [vacancies, setVacancies] = useState<Array<{ id: number; role_title: string | null; role_title_ref: string | null; project_title: string | null; initiative_title: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([
      execReportsApi.kpi().then(setKpiData),
      execReportsApi.attention().then((d) => setAttention(d.items)),
      execReportsApi.portfolioTable().then((d) => setPortfolio(d.items)),
      execReportsApi.upcoming().then(setUpcoming),
      execResourcesApi.portfolioFinancialKpi().then(setFinKpi).catch(() => {}),
      execResourcesApi.teamLoad().then((d) => setTeamLoad(d.items)).catch(() => {}),
      execResourcesApi.vacantRoles().then((d) => setVacancies(d.items)).catch(() => {}),
    ])
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const openFiltered = (filter?: Record<string, string>) => {
    if (!filter) return;
    setSearchParams(filter);
    navigate(`/cabinet/exec/portfolio?${new URLSearchParams(filter).toString()}`);
  };

  if (loading) return <Layout><Loading /></Layout>;
  if (error) return <Layout><div className="max-w-4xl mx-auto px-4 py-6"><ErrorBox message={error} onRetry={load} /></div></Layout>;
  if (!kpiData) return null;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Icon name="Gauge" size={22} className="text-violet-600" />
              Дашборд руководителя
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Ключевые показатели и то, что требует вашего внимания сегодня.</p>
          </div>
          <button
            onClick={() => navigate("/cabinet/exec/reports")}
            className="text-xs px-3 py-2 rounded-lg bg-violet-600 text-white font-medium flex items-center gap-1.5 flex-shrink-0"
          >
            <Icon name="FileText" size={14} /> Отчёты
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {KPI_CARDS.map((c) => (
            <Metric
              key={c.key}
              label={c.label}
              value={kpiData[c.key]}
              tone={c.tone}
              icon={c.icon}
              onClick={c.filter ? () => openFiltered(c.filter) : undefined}
            />
          ))}
        </div>

        {finKpi && (
          <div>
            <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <Icon name="Wallet" size={15} className="text-emerald-700" /> Финансы {finKpi.year}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <Metric label="Бюджет на год" value={`${finKpi.total_budget.toLocaleString("ru-RU")} ₽`} icon="PiggyBank" />
              <Metric label="Факт" value={`${finKpi.total_fact.toLocaleString("ru-RU")} ₽`} icon="Receipt" />
              <Metric label="Обязательства" value={`${finKpi.total_commitments.toLocaleString("ru-RU")} ₽`} icon="FileSignature" />
              <Metric label="Прогноз" value={`${finKpi.total_forecast.toLocaleString("ru-RU")} ₽`} icon="TrendingUp" />
              <Metric label="Остаток" value={`${finKpi.remaining.toLocaleString("ru-RU")} ₽`} tone={finKpi.remaining < 0 ? "danger" : "default"} icon="Coins" />
              <Metric label="ФОТ" value={`${finKpi.total_fot.toLocaleString("ru-RU")} ₽`} icon="Users" />
            </div>
            {finKpi.projects_over_budget.length > 0 && (
              <div className="mt-2 space-y-1">
                {finKpi.projects_over_budget.map((p) => (
                  <div key={p.id} className="text-xs bg-red-50 text-red-700 rounded-lg px-3 py-1.5 flex justify-between">
                    <span>{p.title}</span>
                    <span className="font-medium">перерасход {p.deviation.toLocaleString("ru-RU")} ₽</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {(teamLoad.length > 0 || vacancies.length > 0) && (
          <div>
            <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <Icon name="Users" size={15} className="text-blue-700" /> Команда
            </div>
            <div className="space-y-1.5">
              {teamLoad.filter((t) => t.total_load_pct > 100).map((t) => (
                <div key={t.person_id} className="text-xs bg-amber-50 text-amber-800 rounded-lg px-3 py-1.5 flex justify-between">
                  <span>{t.display_name} — перегрузка</span>
                  <span className="font-medium">{t.total_load_pct}% ({t.assignment_count} проектов)</span>
                </div>
              ))}
              {vacancies.length > 0 && (
                <div className="text-xs text-muted-foreground px-1">Вакантных ролей: {vacancies.length}</div>
              )}
              {teamLoad.filter((t) => t.total_load_pct > 100).length === 0 && vacancies.length === 0 && (
                <div className="text-xs text-muted-foreground px-1">Перегрузок и вакансий нет</div>
              )}
            </div>
          </div>
        )}

        <div>
          <div className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-amber-700">
            <Icon name="Bell" size={15} /> Требует моего внимания
          </div>
          {attention.length === 0 ? (
            <Empty text="Ничего срочного нет" icon="CheckCircle2" />
          ) : (
            <div className="space-y-1.5">
              {attention.slice(0, 25).map((a) => (
                <div key={`${a.kind}-${a.id}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <Icon name={ATTENTION_ICON[a.kind] || "Circle"} size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm truncate">{a.title}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {a.reason}
                        {a.days_overdue !== null && a.days_overdue > 0 && ` · просрочка ${a.days_overdue} дн.`}
                        {a.due_at && ` · ${fmtDate(a.due_at)}`}
                      </div>
                    </div>
                  </div>
                  {a.project_id && (
                    <button
                      onClick={() => navigate(`/cabinet/exec/portfolio/projects/${a.project_id}`)}
                      className="text-[11px] text-violet-600 flex-shrink-0"
                    >
                      Открыть
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="text-sm font-semibold mb-2">Портфель проектов</div>
          {portfolio.length === 0 ? (
            <Empty text="Проектов пока нет" icon="Folder" />
          ) : (
            <div className="space-y-1.5">
              {portfolio.map((p) => (
                <div
                  key={p.id}
                  onClick={() => navigate(`/cabinet/exec/portfolio/projects/${p.id}`)}
                  className="rounded-xl border border-slate-200 bg-white p-3 cursor-pointer hover:border-violet-300"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-medium">{p.title}</div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 flex-shrink-0">{p.status}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>Готовность {p.progress_pct}%</span>
                    {p.plan_end && <span>План: {fmtDate(p.plan_end)}</span>}
                    {p.next_milestone_title && <span>Веха: {p.next_milestone_title} ({fmtDate(p.next_milestone_date)})</span>}
                    {p.overdue_task_count > 0 && <span className="text-red-600 font-medium">{p.overdue_task_count} просрочено</span>}
                    {p.top_risk && <span className="text-amber-700">Риск: {p.top_risk}</span>}
                    {p.pending_decision && <span className="text-amber-700">Решение: {p.pending_decision}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {upcoming && (
          <div>
            <div className="text-sm font-semibold mb-2">Ближайшие 30 дней</div>
            <div className="space-y-1.5">
              {upcoming.actions.map((a) => (
                <div key={`a${a.id}`} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs flex justify-between">
                  <span>Поручение: {a.title}</span><span className="text-muted-foreground">{fmtDate(a.due_at)}</span>
                </div>
              ))}
              {upcoming.milestones.map((m) => (
                <div key={`m${m.id}`} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs flex justify-between">
                  <span>Веха: {m.title}</span><span className="text-muted-foreground">{fmtDate(m.plan_date)}</span>
                </div>
              ))}
              {upcoming.tasks.map((t) => (
                <div key={`t${t.id}`} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs flex justify-between">
                  <span>Задача: {t.title}</span><span className="text-muted-foreground">{fmtDate(t.due_at)}</span>
                </div>
              ))}
              {upcoming.project_deadlines.map((p) => (
                <div key={`p${p.id}`} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs flex justify-between">
                  <span>Завершение проекта: {p.title}</span><span className="text-muted-foreground">{fmtDate(p.plan_end)}</span>
                </div>
              ))}
              {upcoming.actions.length + upcoming.milestones.length + upcoming.tasks.length + upcoming.project_deadlines.length === 0 && (
                <Empty text="На ближайшие 30 дней ничего не запланировано" icon="Calendar" />
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}