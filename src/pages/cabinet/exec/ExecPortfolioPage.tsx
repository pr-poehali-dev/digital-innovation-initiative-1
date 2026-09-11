import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Metric, Empty, Loading, ErrorBox, fmtDate } from "@/components/exec/ExecUI";
import { ProjectFormDialog, TaskFormDialog, PROJECT_STATUSES, TASK_STATUSES } from "@/components/exec/PortfolioForms";
import { execPortfolioApi, PortfolioDashboard, ExecProject, ExecTask } from "@/lib/execPortfolioApi";
import { execApi } from "@/lib/execCabinetApi";
import { controlApi } from "@/lib/execControlApi";

const PRIORITY_CLS: Record<string, string> = {
  urgent: "bg-red-100 text-red-700",
  high: "bg-amber-100 text-amber-700",
  normal: "bg-slate-100 text-slate-600",
  low: "bg-slate-50 text-slate-400",
};

const PROJECT_STATUS_LABEL: Record<string, string> = Object.fromEntries(PROJECT_STATUSES.map((s) => [s.value, s.label]));
const TASK_STATUS_LABEL: Record<string, string> = Object.fromEntries(TASK_STATUSES.map((s) => [s.value, s.label]));

type MainTab = "dashboard" | "projects" | "tasks";

export default function ExecPortfolioPage() {
  const navigate = useNavigate();
  const [mainTab, setMainTab] = useState<MainTab>("dashboard");
  const [data, setData] = useState<PortfolioDashboard | null>(null);
  const [projects, setProjects] = useState<ExecProject[]>([]);
  const [tasks, setTasks] = useState<ExecTask[]>([]);
  const [initiatives, setInitiatives] = useState<Array<{ id: number; title: string }>>([]);
  const [actions, setActions] = useState<Array<{ id: number; title: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [snapBusy, setSnapBusy] = useState(false);
  const [snapMsg, setSnapMsg] = useState("");

  const [projectDialog, setProjectDialog] = useState(false);
  const [taskDialog, setTaskDialog] = useState(false);

  const loadDashboard = useCallback(() => {
    execPortfolioApi.dashboard().then(setData).catch((e) => setError((e as Error).message));
  }, []);

  const loadProjects = useCallback(() => {
    execPortfolioApi.projects().then((d) => setProjects(d.items)).catch((e) => setError((e as Error).message));
  }, []);

  const loadTasks = useCallback(() => {
    execPortfolioApi.tasks().then((d) => setTasks(d.items)).catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([
      execPortfolioApi.dashboard().then(setData),
      execPortfolioApi.projects().then((d) => setProjects(d.items)),
      execPortfolioApi.tasks().then((d) => setTasks(d.items)),
      execApi.initiatives().then((d) => setInitiatives(d.items.map((i) => ({ id: i.id, title: i.title })))),
      controlApi.actions().then((d) => setActions(d.items.map((a) => ({ id: a.id, title: a.title || a.description })))),
    ])
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const makeSnapshot = async () => {
    setSnapBusy(true);
    setSnapMsg("");
    try {
      const r = await execPortfolioApi.createSnapshot({ title: "Справка руководителю" });
      setSnapMsg(`Снимок №${r.id} сохранён (${fmtDate(r.created_at)}). Данные зафиксированы неизменяемо.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSnapBusy(false);
    }
  };

  if (loading) return <Layout><Loading /></Layout>;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Icon name="LayoutDashboard" size={22} className="text-violet-600" />
              Поручения и портфель
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Что поручено, что в работе, что просрочено и что требует вашего решения.
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button size="sm" variant="outline" onClick={makeSnapshot} disabled={snapBusy}>
              <Icon name="Camera" size={14} className="mr-1.5" /> Снимок
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="bg-violet-600 hover:bg-violet-700">
                  <Icon name="Plus" size={14} className="mr-1.5" /> Создать
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setProjectDialog(true)}>
                  <Icon name="Folder" size={14} className="mr-2" /> Проект / мероприятие
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTaskDialog(true)}>
                  <Icon name="ListTodo" size={14} className="mr-2" /> Задача
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/cabinet/exec/control")}>
                  <Icon name="ClipboardCheck" size={14} className="mr-2" /> Поручение
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/cabinet/exec/initiatives")}>
                  <Icon name="Rocket" size={14} className="mr-2" /> Инициатива
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {error && <ErrorBox message={error} onRetry={() => { loadDashboard(); loadProjects(); loadTasks(); }} />}
        {snapMsg && <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-3 py-2">{snapMsg}</div>}

        <div className="flex gap-1 border-b border-slate-200">
          {(["dashboard", "projects", "tasks"] as MainTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setMainTab(t)}
              className={`text-sm px-3 py-2 font-medium border-b-2 ${
                mainTab === t ? "border-violet-600 text-violet-700" : "border-transparent text-muted-foreground"
              }`}
            >
              {{ dashboard: "Сводка", projects: `Проекты (${projects.length})`, tasks: `Задачи (${tasks.length})` }[t]}
            </button>
          ))}
        </div>

        {mainTab === "dashboard" && data && <DashboardTab data={data} />}

        {mainTab === "projects" && (
          projects.length === 0 ? <Empty text="Проектов пока нет" icon="Folder" /> :
          <div className="space-y-1.5">
            {projects.map((p) => (
              <div
                key={p.id}
                onClick={() => navigate(`/cabinet/exec/portfolio/projects/${p.id}`)}
                className="rounded-xl border border-slate-200 bg-white p-3.5 cursor-pointer hover:border-violet-300"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {PROJECT_STATUS_LABEL[p.status] || p.status} · Готовность {p.progress_pct}%
                      {p.initiative_title && ` · ${p.initiative_title}`}
                    </div>
                  </div>
                  {p.overdue_task_count > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 flex-shrink-0">
                      {p.overdue_task_count} просрочено
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {mainTab === "tasks" && (
          tasks.length === 0 ? <Empty text="Задач пока нет" icon="ListTodo" /> :
          <div className="space-y-1.5">
            {tasks.map((t) => (
              <div key={t.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm truncate">{t.title}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {TASK_STATUS_LABEL[t.status] || t.status} · {t.due_at ? fmtDate(t.due_at) : "Без срока"}
                    {t.project_title && ` · ${t.project_title}`}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {t.is_overdue && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">просрочена</span>}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_CLS[t.priority] || PRIORITY_CLS.normal}`}>{t.priority}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ProjectFormDialog open={projectDialog} onOpenChange={setProjectDialog} project={null} initiatives={initiatives} onSaved={() => { loadProjects(); loadDashboard(); }} />
      <TaskFormDialog open={taskDialog} onOpenChange={setTaskDialog} task={null} projects={projects.map((p) => ({ id: p.id, title: p.title }))} actions={actions} onSaved={() => { loadTasks(); loadDashboard(); }} />
    </Layout>
  );
}

function DashboardTab({ data }: { data: PortfolioDashboard }) {
  const requiresDecision = data.pending_decisions.length;
  const totalOverdue = data.overdue_actions.length + data.overdue_tasks.length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Metric label="Просрочено" value={totalOverdue} tone={totalOverdue > 0 ? "danger" : "default"} icon="AlertTriangle" />
        <Metric label="Вехи (30 дн.)" value={data.upcoming_milestones.length} tone="warning" icon="Flag" />
        <Metric label="Требуют решения" value={requiresDecision} tone={requiresDecision > 0 ? "warning" : "default"} icon="HelpCircle" />
        <Metric label="Критичных рисков" value={data.top_risks.length} tone={data.top_risks.length > 0 ? "danger" : "default"} icon="ShieldAlert" />
      </div>

      {requiresDecision > 0 && (
        <Section title="Требует вашего решения" icon="HelpCircle" tone="warning">
          {data.pending_decisions.map((d) => (
            <Row key={d.id} title={d.question} sub={d.due_at ? `Срок: ${fmtDate(d.due_at)}` : "Срок не установлен"} />
          ))}
        </Section>
      )}

      {data.overdue_actions.length > 0 && (
        <Section title="Просроченные поручения" icon="AlertTriangle" tone="danger">
          {data.overdue_actions.map((a) => (
            <Row key={a.id} title={a.title} sub={`Срок был: ${fmtDate(a.due_at)}`} badge={a.priority} extra={a.is_on_control ? "На личном контроле" : undefined} />
          ))}
        </Section>
      )}

      {data.overdue_tasks.length > 0 && (
        <Section title="Просроченные задачи" icon="ListTodo" tone="danger">
          {data.overdue_tasks.map((t) => (
            <Row key={t.id} title={t.title} sub={`Срок был: ${fmtDate(t.due_at)}`} badge={t.priority} />
          ))}
        </Section>
      )}

      {data.upcoming_actions.length > 0 && (
        <Section title="Поручения на ближайшие 30 дней" icon="Calendar">
          {data.upcoming_actions.map((a) => (
            <Row key={a.id} title={a.title} sub={fmtDate(a.due_at)} badge={a.priority} />
          ))}
        </Section>
      )}

      {data.upcoming_milestones.length > 0 && (
        <Section title="Контрольные точки (30 дней)" icon="Flag">
          {data.upcoming_milestones.map((m) => (
            <Row key={m.id} title={m.title} sub={fmtDate(m.plan_date)} />
          ))}
        </Section>
      )}

      {data.top_risks.length > 0 && (
        <Section title="Ключевые риски" icon="ShieldAlert" tone="danger">
          {data.top_risks.map((r) => (
            <Row key={r.id} title={r.description} sub={`Оценка риска: ${r.risk_score} (вероятность ${r.probability} × влияние ${r.impact})`} />
          ))}
        </Section>
      )}

      <Section title="Проекты по статусам" icon="Kanban">
        {data.projects_by_status.length === 0 ? (
          <Empty text="Проектов пока нет" icon="Kanban" />
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.projects_by_status.map((p) => (
              <div key={p.status} className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs">
                <span className="font-medium">{PROJECT_STATUS_LABEL[p.status] || p.status}</span>
                <span className="text-muted-foreground ml-1.5">{p.cnt}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {data.recent_results.length > 0 && (
        <Section title="Последние результаты" icon="CheckCircle2" tone="success">
          {data.recent_results.map((r) => (
            <Row key={r.id} title={r.title} sub={r.achieved_at ? fmtDate(r.achieved_at) : "Дата не установлена"} />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title, icon, tone = "default", children,
}: { title: string; icon: string; tone?: "default" | "warning" | "danger" | "success"; children: React.ReactNode }) {
  const toneCls: Record<string, string> = {
    default: "text-slate-700", warning: "text-amber-700", danger: "text-red-700", success: "text-emerald-700",
  };
  return (
    <div>
      <div className={`text-sm font-semibold mb-2 flex items-center gap-1.5 ${toneCls[tone]}`}>
        <Icon name={icon} size={15} /> {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ title, sub, badge, extra }: { title: string; sub?: string; badge?: string; extra?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-sm truncate">{title}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
        {extra && <div className="text-[11px] text-red-600 mt-0.5 font-medium">{extra}</div>}
      </div>
      {badge && <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${PRIORITY_CLS[badge] || PRIORITY_CLS.normal}`}>{badge}</span>}
    </div>
  );
}
