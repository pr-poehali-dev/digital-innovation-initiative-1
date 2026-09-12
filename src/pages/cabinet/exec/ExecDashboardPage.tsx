import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { Metric, Empty, Loading, ErrorBox, fmtDate } from "@/components/exec/ExecUI";
import PageGuide from "@/components/exec/PageGuide";
import { execPageGuides } from "@/config/execPageGuides";
import {
  execReportsApi, DashboardKpi, AttentionItem, PortfolioRow, UpcomingEvents,
} from "@/lib/execReportsApi";
import { execResourcesApi, TeamLoadRow, RequirementDashboard } from "@/lib/execResourcesApi";

const KPI_CARDS: Array<{
  key: keyof DashboardKpi; label: string; icon: string; tone: "default" | "danger" | "warning" | "success";
  path?: string; filter?: Record<string, string>;
}> = [
  { key: "active_actions", label: "Активные поручения", icon: "ClipboardCheck", tone: "default", path: "/cabinet/exec/assignments", filter: { tab: "all" } },
  { key: "overdue_actions", label: "Просроченные поручения", icon: "AlertTriangle", tone: "danger", path: "/cabinet/exec/assignments", filter: { tab: "overdue" } },
  { key: "active_projects", label: "Активные проекты", icon: "Folder", tone: "default", path: "/cabinet/exec/portfolio", filter: { tab: "projects", status: "in_progress" } },
  { key: "overdue_tasks", label: "Просроченные задачи", icon: "ListTodo", tone: "danger", path: "/cabinet/exec/portfolio", filter: { tab: "tasks", overdue: "1" } },
  { key: "blocked_tasks", label: "Заблокированные задачи", icon: "Ban", tone: "warning", path: "/cabinet/exec/portfolio", filter: { tab: "tasks", status: "blocked" } },
  { key: "milestones_7", label: "Вехи на 7 дней", icon: "Flag", tone: "warning", path: "/cabinet/exec/control", filter: { tab: "milestones" } },
  { key: "milestones_14", label: "Вехи на 14 дней", icon: "Flag", tone: "default", path: "/cabinet/exec/control", filter: { tab: "milestones" } },
  { key: "milestones_30", label: "Вехи на 30 дней", icon: "Flag", tone: "default", path: "/cabinet/exec/control", filter: { tab: "milestones" } },
  { key: "critical_risks", label: "Критические риски", icon: "ShieldAlert", tone: "danger", path: "/cabinet/exec/control", filter: { tab: "risks", level: "critical" } },
  { key: "open_issues", label: "Открытые проблемы", icon: "AlertOctagon", tone: "danger", path: "/cabinet/exec/control", filter: { tab: "issues" } },
  { key: "pending_decisions", label: "Требуют решения", icon: "HelpCircle", tone: "warning", path: "/cabinet/exec/decisions", filter: { open: "1" } },
  { key: "results_pending", label: "Результаты на подтверждении", icon: "FileQuestion", tone: "warning", path: "/cabinet/exec/portfolio", filter: { tab: "dashboard" } },
  { key: "effects_pending", label: "Эффекты на подтверждении", icon: "TrendingUp", tone: "warning", path: "/cabinet/exec/portfolio", filter: { tab: "dashboard" } },
  { key: "effects_confirmed", label: "Подтверждённые эффекты", icon: "CheckCircle2", tone: "success", path: "/cabinet/exec/portfolio", filter: { tab: "dashboard" } },
];

const ATTENTION_ICON: Record<string, string> = {
  action: "ClipboardCheck", milestone: "Flag", task: "ListTodo", risk: "ShieldAlert",
  issue: "AlertOctagon", decision: "HelpCircle", result: "FileQuestion", effect: "TrendingUp", project: "Folder",
  project_budget: "Wallet", person_overload: "Users", requirement_overdue: "UserSearch",
  requirement_search: "UserSearch", requirement_no_funding: "UserSearch", task_no_resource: "ListTodo",
};

export default function ExecDashboardPage() {
  const navigate = useNavigate();
  const [kpiData, setKpiData] = useState<DashboardKpi | null>(null);
  const [attention, setAttention] = useState<AttentionItem[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioRow[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingEvents | null>(null);
  const [finKpi, setFinKpi] = useState<Awaited<ReturnType<typeof execResourcesApi.portfolioFinancialKpi>> | null>(null);
  const [teamLoad, setTeamLoad] = useState<TeamLoadRow[]>([]);
  const [vacancies, setVacancies] = useState<Array<{ id: number; role_title: string | null; role_title_ref: string | null; project_title: string | null; initiative_title: string | null }>>([]);
  const [reqDash, setReqDash] = useState<RequirementDashboard | null>(null);
  const openRequirement = (r: { project_id: number | null; initiative_id?: number | null }) => {
    if (r.project_id) navigate(`/cabinet/exec/portfolio/projects/${r.project_id}?tab=requirements`);
  };
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
      execResourcesApi.requirementDashboard().then(setReqDash).catch(() => {}),
    ])
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const openFiltered = (path?: string, filter?: Record<string, string>) => {
    if (!path) return;
    const qs = filter ? `?${new URLSearchParams(filter).toString()}` : "";
    navigate(`${path}${qs}`);
  };

  const ATTENTION_TAB: Record<string, string> = {
    project_budget: "planfact", requirement_overdue: "requirements",
    requirement_search: "requirements", requirement_no_funding: "requirements",
    task_no_resource: "requirements",
  };
  const openAttentionItem = (a: AttentionItem) => {
    if (a.project_id) {
      const tab = ATTENTION_TAB[a.kind];
      navigate(`/cabinet/exec/portfolio/projects/${a.project_id}${tab ? `?tab=${tab}` : ""}`);
    } else if (a.kind === "person_overload") {
      navigate("/cabinet/exec/workload?overload=1");
    }
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

        <PageGuide {...execPageGuides.dashboard} />

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {KPI_CARDS.map((c) => (
            <Metric
              key={c.key}
              label={c.label}
              value={kpiData[c.key]}
              tone={c.tone}
              icon={c.icon}
              onClick={c.path ? () => openFiltered(c.path, c.filter) : undefined}
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
              <Metric label="Обязательства (открыто)" value={`${finKpi.total_commitments_open.toLocaleString("ru-RU")} ₽`} icon="FileSignature" />
              <Metric label="Прогноз" value={`${finKpi.total_forecast.toLocaleString("ru-RU")} ₽`} icon="TrendingUp" />
              <Metric label="Остаток" value={`${finKpi.remaining.toLocaleString("ru-RU")} ₽`} tone={finKpi.remaining < 0 ? "danger" : "default"} icon="Coins" />
              <Metric label="ФОТ" value={`${finKpi.total_fot.toLocaleString("ru-RU")} ₽`} icon="Users" />
            </div>
            {finKpi.projects_over_budget.length > 0 && (
              <div className="mt-2 space-y-1">
                {finKpi.projects_over_budget.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/cabinet/exec/portfolio/projects/${p.id}?tab=planfact`)}
                    className="w-full text-left text-xs bg-red-50 text-red-700 rounded-lg px-3 py-1.5 flex justify-between hover:bg-red-100"
                  >
                    <span>{p.title}</span>
                    <span className="font-medium">перерасход {p.deviation.toLocaleString("ru-RU")} ₽</span>
                  </button>
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
                <button
                  key={t.person_id}
                  onClick={() => navigate("/cabinet/exec/workload?overload=1")}
                  className="w-full text-left text-xs bg-amber-50 text-amber-800 rounded-lg px-3 py-1.5 flex justify-between hover:bg-amber-100"
                >
                  <span>{t.display_name} — перегрузка</span>
                  <span className="font-medium">{t.total_load_pct}% ({t.assignment_count} проектов)</span>
                </button>
              ))}
              {vacancies.length > 0 && (
                <button
                  onClick={() => navigate("/cabinet/exec/team")}
                  className="text-xs text-violet-600 px-1 hover:underline"
                >
                  Вакантных ролей: {vacancies.length} — открыть команду
                </button>
              )}
              {teamLoad.filter((t) => t.total_load_pct > 100).length === 0 && vacancies.length === 0 && (
                <div className="text-xs text-muted-foreground px-1">Перегрузок и вакансий нет</div>
              )}
            </div>
          </div>
        )}

        {reqDash && (reqDash.overdue.length > 0 || reqDash.start_search_now.length > 0 || reqDash.without_funding.length > 0 || reqDash.upcoming_90.length > 0) && (
          <div>
            <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <Icon name="UserSearch" size={15} className="text-violet-700" /> Ресурсные потребности
            </div>
            <div className="space-y-1.5">
              {reqDash.overdue.map((r) => (
                <button
                  key={`ov${r.id}`}
                  onClick={() => openRequirement(r)}
                  className="w-full text-left text-xs bg-red-50 text-red-700 rounded-lg px-3 py-1.5 flex justify-between hover:bg-red-100"
                >
                  <span>{r.role_title_ref || r.role_title} — просрочена ({r.project_title})</span>
                  <span className="font-medium">на {r.days_overdue} дн.</span>
                </button>
              ))}
              {reqDash.start_search_now.map((r) => (
                <button
                  key={`ss${r.id}`}
                  onClick={() => openRequirement(r)}
                  className="w-full text-left text-xs bg-amber-50 text-amber-800 rounded-lg px-3 py-1.5 flex justify-between hover:bg-amber-100"
                >
                  <span>{r.role_title_ref || r.role_title} — пора начинать поиск ({r.project_title})</span>
                  <span className="font-medium">найти до {r.need_by_date ? fmtDate(r.need_by_date) : "—"}</span>
                </button>
              ))}
              {reqDash.without_funding.length > 0 && (
                <div className="text-xs text-muted-foreground px-1">
                  Без финансирования: {reqDash.without_funding.length} · расчётная стоимость незакрытых: {reqDash.total_unresolved_cost.toLocaleString("ru-RU")} ₽
                </div>
              )}
              {reqDash.upcoming_90.length > 0 && (
                <div className="text-xs text-muted-foreground px-1">На ближайшие 90 дней: {reqDash.upcoming_90.length} потребностей</div>
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
                  {(a.project_id || a.kind === "person_overload") && (
                    <button
                      onClick={() => openAttentionItem(a)}
                      className="text-[11px] text-violet-600 flex-shrink-0"
                    >
                      {a.kind === "person_overload" ? "Загрузка команды" : "Открыть"}
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