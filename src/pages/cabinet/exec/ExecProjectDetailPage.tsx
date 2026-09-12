import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loading, ErrorBox, Empty, fmtDate } from "@/components/exec/ExecUI";
import PageGuide from "@/components/exec/PageGuide";
import ReminderQuickButton from "@/components/exec/ReminderQuickButton";
import { execPageGuides } from "@/config/execPageGuides";
import {
  ProjectFormDialog, ResultFormDialog, EffectFormDialog, LinkFormDialog,
  PROJECT_KINDS, PROJECT_STATUSES, RESULT_KINDS,
} from "@/components/exec/PortfolioForms";
import { execPortfolioApi, ProjectDetail, ExecResult, ExecEffect, HistoryEntry } from "@/lib/execPortfolioApi";
import { execApi } from "@/lib/execCabinetApi";
import { TeamTab, BudgetTab, CapacityTab, FotTab, PlanFactTab } from "@/components/exec/ProjectResourcesTab";
import { RequirementsTab } from "@/components/exec/ResourceRequirementsTab";
import ProjectGanttView from "@/components/exec/roadmap/ProjectGanttView";
import { ScaleKind, autoScale, diffDays, parseISODate, defaultRangeForScale } from "@/lib/timeScale";

function labelOf(list: { value: string; label: string }[], v: string) {
  return list.find((x) => x.value === v)?.label || v;
}

const TABS = ["overview", "gantt", "team", "requirements", "capacity", "budget", "fot", "planfact", "tasks", "milestones", "results", "effects", "risks", "issues", "documents", "links", "history"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  overview: "Обзор", gantt: "Гант", team: "Команда", requirements: "Потребности в ресурсах",
  capacity: "Загрузка", budget: "Бюджет", fot: "ФОТ",
  planfact: "План-факт", tasks: "Задачи",
  milestones: "Контрольные точки", results: "Результаты",
  effects: "Эффекты", risks: "Риски", issues: "Проблемы", documents: "Документы",
  links: "Связи", history: "История",
};

export default function ExecProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const pid = Number(id);

  const [data, setData] = useState<ProjectDetail | null>(null);
  const [initiatives, setInitiatives] = useState<Array<{ id: number; title: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const urlTab = searchParams.get("tab") as Tab | null;
  const [tab, setTabState] = useState<Tab>(urlTab && TABS.includes(urlTab) ? urlTab : "overview");

  const setTab = (t: Tab) => {
    setTabState(t);
    const next = new URLSearchParams(searchParams);
    next.set("tab", t);
    setSearchParams(next, { replace: true });
  };

  // Гант проекта: масштаб и диапазон дат хранятся в URL, как и на портфельной дорожной карте.
  const ganttScale: ScaleKind = (searchParams.get("gscale") as ScaleKind) || "quarter";
  const ganttFrom = searchParams.get("gfrom") || defaultRangeForScale(ganttScale).from;
  const ganttTo = searchParams.get("gto") || defaultRangeForScale(ganttScale).to;

  const setGanttScale = (s: ScaleKind) => {
    const next = new URLSearchParams(searchParams);
    next.set("gscale", s);
    setSearchParams(next, { replace: true });
  };
  const setGanttRange = (from: string, to: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("gfrom", from);
    next.set("gto", to);
    const nextScale = autoScale(diffDays(parseISODate(from) || new Date(), parseISODate(to) || new Date()));
    next.set("gscale", nextScale);
    setSearchParams(next, { replace: true });
  };
  const [expandedTaskRes, setExpandedTaskRes] = useState<number | null>(null);
  const [expandedMilestoneRes, setExpandedMilestoneRes] = useState<number | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [resultDialog, setResultDialog] = useState<{ open: boolean; item: ExecResult | null }>({ open: false, item: null });
  const [effectDialog, setEffectDialog] = useState<{ open: boolean; item: ExecEffect | null; resultId: number; resultTitle: string }>({
    open: false, item: null, resultId: 0, resultTitle: "",
  });
  const [allEffects, setAllEffects] = useState<ExecEffect[]>([]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDefaultKind, setLinkDefaultKind] = useState("doc_source");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [archiveConfirm, setArchiveConfirm] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    execPortfolioApi
      .project(pid)
      .then(setData)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [pid]);

  useEffect(load, [load]);
  useEffect(() => {
    execApi.initiatives().then((d) => setInitiatives(d.items.map((i) => ({ id: i.id, title: i.title })))).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === "history" && data) {
      execPortfolioApi.history("project", pid).then((d) => setHistory(d.items)).catch(() => {});
    }
  }, [tab, pid, data]);

  const loadAllEffects = useCallback(async () => {
    if (!data) return;
    const lists = await Promise.all(data.results.map((r) => execPortfolioApi.effects(r.id)));
    setAllEffects(lists.flatMap((l) => l.items));
  }, [data]);

  useEffect(() => {
    if ((tab === "effects" || tab === "results") && data) {
      loadAllEffects();
    }
  }, [tab, data, loadAllEffects]);

  const doArchive = async () => {
    try {
      await execPortfolioApi.archiveProject(pid);
      navigate("/cabinet/exec/portfolio");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (loading) return <Layout><Loading /></Layout>;
  if (error) return <Layout><div className="max-w-4xl mx-auto px-4 py-6"><ErrorBox message={error} onRetry={load} /></div></Layout>;
  if (!data) return null;

  const documentLinks = data.links.filter((l) => l.other_kind === "doc_source");
  const nonDocLinks = data.links.filter((l) => l.other_kind !== "doc_source");

  return (
    <Layout>
      <div className={`mx-auto px-4 py-6 space-y-4 ${tab === "gantt" ? "max-w-[1400px]" : "max-w-4xl"}`}>
        <button onClick={() => navigate("/cabinet/exec/portfolio")} className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground">
          <Icon name="ArrowLeft" size={14} /> К портфелю
        </button>

        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">{data.title}</h1>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{labelOf(PROJECT_KINDS, data.project_kind)}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">{labelOf(PROJECT_STATUSES, data.status)}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-500">Готовность {data.progress_pct}%</span>
              {data.initiative_title && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">Инициатива: {data.initiative_title}</span>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <ReminderQuickButton entityType="project" entityId={pid} title={data.title} variant="icon" />
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <Icon name="Pencil" size={14} className="mr-1.5" /> Изменить
            </Button>
            <Button size="sm" variant="outline" className="text-red-600" onClick={() => setArchiveConfirm(true)}>
              <Icon name="Archive" size={14} />
            </Button>
          </div>
        </div>

        {data.description && <p className="text-sm text-muted-foreground">{data.description}</p>}

        <PageGuide {...(tab === "gantt" ? execPageGuides.projectGantt : execPageGuides.projectDetail)} />

        <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
          {(TABS as readonly Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-xs px-3 py-2 font-medium border-b-2 flex-shrink-0 ${
                tab === t ? "border-violet-600 text-violet-700" : "border-transparent text-muted-foreground"
              }`}
            >
              {TAB_LABEL[t]}
              {t === "tasks" && ` (${data.tasks.length})`}
              {t === "milestones" && ` (${data.milestones.length})`}
              {t === "results" && ` (${data.results.length})`}
              {t === "effects" && ` (${allEffects.length})`}
              {t === "risks" && ` (${data.risks.length})`}
              {t === "issues" && ` (${data.issues.length})`}
              {t === "documents" && ` (${documentLinks.length})`}
              {t === "links" && ` (${nonDocLinks.length})`}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-muted-foreground">Начало план:</span> {data.plan_start ? fmtDate(data.plan_start) : "—"}</div>
              <div><span className="text-muted-foreground">Завершение план:</span> {data.plan_end ? fmtDate(data.plan_end) : "—"}</div>
              <div><span className="text-muted-foreground">Начало факт:</span> {data.fact_start ? fmtDate(data.fact_start) : "—"}</div>
              <div><span className="text-muted-foreground">Завершение факт:</span> {data.fact_end ? fmtDate(data.fact_end) : "—"}</div>
            </div>
          </div>
        )}

        {tab === "gantt" && (
          <ProjectGanttView
            projectId={pid} scale={ganttScale} onScaleChange={setGanttScale}
            dateFrom={ganttFrom} dateTo={ganttTo} onRangeChange={setGanttRange}
          />
        )}

        {tab === "team" && <TeamTab kind="project" parentId={pid} />}
        {tab === "requirements" && <RequirementsTab kind="project" parentId={pid} />}
        {tab === "capacity" && <CapacityTab kind="project" parentId={pid} />}
        {tab === "budget" && <BudgetTab kind="project" parentId={pid} />}
        {tab === "fot" && <FotTab kind="project" parentId={pid} />}
        {tab === "planfact" && <PlanFactTab kind="project" parentId={pid} />}

        {tab === "tasks" && (
          data.tasks.length === 0 ? <Empty text="Задач пока нет" icon="ListTodo" /> :
          <div className="space-y-1.5">
            {data.tasks.map((t) => (
              <div key={t.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-sm truncate">{t.title}</div>
                    <div className="text-[11px] text-muted-foreground">{t.due_at ? fmtDate(t.due_at) : "Без срока"} · {t.progress_pct}%</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {t.is_overdue && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">просрочена</span>}
                    <button
                      onClick={() => setExpandedTaskRes(expandedTaskRes === t.id ? null : t.id)}
                      className="text-[11px] text-violet-600 flex items-center gap-1"
                    >
                      <Icon name="UserSearch" size={12} /> Ресурсы
                    </button>
                  </div>
                </div>
                {expandedTaskRes === t.id && (
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <RequirementsTab kind="project" parentId={pid} taskId={t.id} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "milestones" && (
          data.milestones.length === 0 ? <Empty text="Контрольных точек пока нет" icon="Flag" /> :
          <div className="space-y-1.5">
            {data.milestones.map((m) => (
              <div key={m.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">{m.title}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">{fmtDate(m.plan_date)} · {m.status}</span>
                    <button
                      onClick={() => setExpandedMilestoneRes(expandedMilestoneRes === m.id ? null : m.id)}
                      className="text-[11px] text-violet-600 flex items-center gap-1"
                    >
                      <Icon name="UserSearch" size={12} /> Ресурсы
                    </button>
                  </div>
                </div>
                {expandedMilestoneRes === m.id && (
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <RequirementsTab kind="project" parentId={pid} milestoneId={m.id} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "results" && (
          <div className="space-y-3">
            <Button size="sm" onClick={() => setResultDialog({ open: true, item: null })}>
              <Icon name="Plus" size={14} className="mr-1.5" /> Добавить результат
            </Button>
            {data.results.length === 0 ? <Empty text="Результатов пока нет" icon="CheckCircle2" /> : data.results.map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-medium">{r.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {labelOf(RESULT_KINDS, r.result_kind)} · {r.achieved_at ? fmtDate(r.achieved_at) : "Дата не установлена"}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setResultDialog({ open: true, item: r })}>
                    <Icon name="Pencil" size={12} />
                  </Button>
                </div>
                <button
                  className="text-[11px] text-violet-600 flex items-center gap-1 mt-2"
                  onClick={() => setEffectDialog({ open: true, item: null, resultId: r.id, resultTitle: r.title })}
                >
                  <Icon name="Plus" size={11} /> Добавить эффект к этому результату
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === "effects" && (
          allEffects.length === 0 ? <Empty text="Эффектов пока нет" icon="TrendingUp" /> :
          <div className="space-y-1.5">
            {allEffects.map((e) => (
              <div key={e.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">{e.title}</div>
                  <button onClick={() => setEffectDialog({ open: true, item: e, resultId: e.result_id || 0, resultTitle: e.result_title || "" })}>
                    <Icon name="Pencil" size={12} className="text-muted-foreground" />
                  </button>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {e.metric || "Показатель не указан"}: {e.baseline_value || "—"} → {e.plan_value || "—"} (факт: {e.actual_value || "не измерено"})
                </div>
                <div className="text-[10px] mt-1">
                  <span className={`px-1.5 py-0.5 rounded ${
                    e.confirmation_status === "confirmed" ? "bg-emerald-100 text-emerald-700" :
                    e.confirmation_status === "disputed" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
                  }`}>
                    {e.confirmation_status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "risks" && (
          data.risks.length === 0 ? <Empty text="Рисков не привязано" icon="ShieldAlert" /> :
          <div className="space-y-1.5">
            {data.risks.map((r) => (
              <div key={r.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
                {r.description} · оценка риска {r.probability * r.impact} (вероятность {r.probability} × влияние {r.impact}) · {r.status}
              </div>
            ))}
          </div>
        )}

        {tab === "issues" && (
          data.issues.length === 0 ? <Empty text="Проблем не привязано" icon="AlertOctagon" /> :
          <div className="space-y-1.5">
            {data.issues.map((i) => (
              <div key={i.id} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs">
                {i.title} · {i.status}
              </div>
            ))}
          </div>
        )}

        {tab === "documents" && (
          <div className="space-y-2">
            <Button size="sm" onClick={() => { setLinkDefaultKind("doc_source"); setLinkOpen(true); }}>
              <Icon name="Plus" size={14} className="mr-1.5" /> Привязать документ
            </Button>
            {documentLinks.length === 0 ? <Empty text="Документы не привязаны" icon="FileText" /> : documentLinks.map((l) => (
              <div key={l.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs flex items-center justify-between">
                <span>{l.other_title || `Документ #${l.other_id}`}</span>
                <button onClick={() => execPortfolioApi.archiveLink(l.id).then(load)}>
                  <Icon name="X" size={12} className="text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === "links" && (
          <div className="space-y-2">
            <Button size="sm" onClick={() => { setLinkDefaultKind("project"); setLinkOpen(true); }}>
              <Icon name="Link" size={14} className="mr-1.5" /> Добавить связь
            </Button>
            {nonDocLinks.length === 0 ? <Empty text="Связей пока нет" icon="Link" /> : nonDocLinks.map((l) => (
              <div key={l.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs flex items-center justify-between">
                <span>{l.link_type_label} — {l.other_title || `${l.other_kind} #${l.other_id}`}</span>
                <button onClick={() => execPortfolioApi.archiveLink(l.id).then(load)}>
                  <Icon name="X" size={12} className="text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === "history" && (
          history.length === 0 ? <Empty text="История пуста" icon="History" /> :
          <div className="space-y-1.5">
            {history.map((h) => (
              <div key={h.id} className="text-xs border-b border-slate-100 py-1.5">
                <span className="font-medium">{h.action}</span>
                <span className="text-muted-foreground ml-1.5">{h.actor} · {fmtDate(h.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <ProjectFormDialog open={editOpen} onOpenChange={setEditOpen} project={data} initiatives={initiatives} onSaved={load} />
      <ResultFormDialog
        open={resultDialog.open} onOpenChange={(v) => setResultDialog({ open: v, item: null })}
        result={resultDialog.item} projects={[{ id: data.id, title: data.title }]} defaultProjectId={data.id}
        onSaved={load}
      />
      <EffectFormDialog
        open={effectDialog.open} onOpenChange={(v) => setEffectDialog((p) => ({ ...p, open: v }))}
        effect={effectDialog.item} resultId={effectDialog.resultId} resultTitle={effectDialog.resultTitle}
        onSaved={loadAllEffects}
      />
      <LinkFormDialog open={linkOpen} onOpenChange={setLinkOpen} srcKind="project" srcId={pid} onSaved={load} defaultTgtKind={linkDefaultKind} />

      <AlertDialog open={archiveConfirm} onOpenChange={setArchiveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Архивировать проект?</AlertDialogTitle>
            <AlertDialogDescription>
              Проект будет скрыт из активного портфеля, но данные сохранятся и их можно будет посмотреть позже.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={doArchive}>Архивировать</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}