import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loading, ErrorBox, Empty, fmtDate } from "@/components/exec/ExecUI";
import {
  ProjectFormDialog, ResultFormDialog, EffectFormDialog, LinkFormDialog,
  PROJECT_KINDS, PROJECT_STATUSES, RESULT_KINDS,
} from "@/components/exec/PortfolioForms";
import { execPortfolioApi, ProjectDetail, ExecResult, ExecEffect, HistoryEntry } from "@/lib/execPortfolioApi";
import { execApi } from "@/lib/execCabinetApi";

function labelOf(list: { value: string; label: string }[], v: string) {
  return list.find((x) => x.value === v)?.label || v;
}

const TABS = ["overview", "tasks", "results", "risks", "links", "history"] as const;
type Tab = (typeof TABS)[number];

export default function ExecProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const pid = Number(id);

  const [data, setData] = useState<ProjectDetail | null>(null);
  const [initiatives, setInitiatives] = useState<Array<{ id: number; title: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");

  const [editOpen, setEditOpen] = useState(false);
  const [resultDialog, setResultDialog] = useState<{ open: boolean; item: ExecResult | null }>({ open: false, item: null });
  const [effectDialog, setEffectDialog] = useState<{ open: boolean; item: ExecEffect | null; resultId: number; resultTitle: string }>({
    open: false, item: null, resultId: 0, resultTitle: "",
  });
  const [effectsByResult, setEffectsByResult] = useState<Record<number, ExecEffect[]>>({});
  const [linkOpen, setLinkOpen] = useState(false);
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

  const loadEffects = async (resultId: number) => {
    const d = await execPortfolioApi.effects(resultId);
    setEffectsByResult((prev) => ({ ...prev, [resultId]: d.items }));
  };

  useEffect(() => {
    if (tab === "results" && data) {
      data.results.forEach((r) => loadEffects(r.id));
    }
  }, [tab, data]);

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

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
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
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <Icon name="Pencil" size={14} className="mr-1.5" /> Изменить
            </Button>
            <Button size="sm" variant="outline" className="text-red-600" onClick={() => setArchiveConfirm(true)}>
              <Icon name="Archive" size={14} />
            </Button>
          </div>
        </div>

        {data.description && <p className="text-sm text-muted-foreground">{data.description}</p>}

        <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
          {(["overview", "tasks", "results", "risks", "links", "history"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-xs px-3 py-2 font-medium border-b-2 flex-shrink-0 ${
                tab === t ? "border-violet-600 text-violet-700" : "border-transparent text-muted-foreground"
              }`}
            >
              {{ overview: "Обзор", tasks: `Задачи (${data.tasks.length})`, results: `Результаты (${data.results.length})`,
                 risks: `Риски и проблемы (${data.risks.length + data.issues.length})`, links: `Связи (${data.links.length})`,
                 history: "История" }[t]}
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
            {data.milestones.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-semibold text-muted-foreground mb-1.5">Контрольные точки</div>
                {data.milestones.map((m) => (
                  <div key={m.id} className="text-xs py-1 flex justify-between border-b border-slate-100">
                    <span>{m.title}</span>
                    <span className="text-muted-foreground">{fmtDate(m.plan_date)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "tasks" && (
          data.tasks.length === 0 ? <Empty text="Задач пока нет" icon="ListTodo" /> :
          <div className="space-y-1.5">
            {data.tasks.map((t) => (
              <div key={t.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-sm truncate">{t.title}</div>
                  <div className="text-[11px] text-muted-foreground">{t.due_at ? fmtDate(t.due_at) : "Без срока"} · {t.progress_pct}%</div>
                </div>
                {t.is_overdue && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 flex-shrink-0">просрочена</span>}
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
                <div className="mt-2 pl-3 border-l-2 border-slate-100 space-y-1.5">
                  {(effectsByResult[r.id] || []).map((e) => (
                    <div key={e.id} className="text-xs flex items-center justify-between">
                      <div>
                        <span className="font-medium">{e.title}</span>
                        <span className="text-muted-foreground ml-1.5">
                          {e.baseline_value || "—"} → {e.plan_value || "—"} (факт: {e.actual_value || "не измерено"})
                        </span>
                      </div>
                      <button onClick={() => setEffectDialog({ open: true, item: e, resultId: r.id, resultTitle: r.title })}>
                        <Icon name="Pencil" size={11} className="text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                  <button
                    className="text-[11px] text-violet-600 flex items-center gap-1"
                    onClick={() => setEffectDialog({ open: true, item: null, resultId: r.id, resultTitle: r.title })}
                  >
                    <Icon name="Plus" size={11} /> Добавить эффект
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "risks" && (
          <div className="space-y-3">
            {data.risks.length === 0 && data.issues.length === 0 ? (
              <Empty text="Рисков и проблем не привязано" icon="ShieldAlert" />
            ) : (
              <>
                {data.risks.map((r) => (
                  <div key={`r${r.id}`} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
                    {r.description} · оценка {r.probability * r.impact}
                  </div>
                ))}
                {data.issues.map((i) => (
                  <div key={`i${i.id}`} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs">
                    {i.title} · {i.status}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {tab === "links" && (
          <div className="space-y-2">
            <Button size="sm" onClick={() => setLinkOpen(true)}>
              <Icon name="Link" size={14} className="mr-1.5" /> Добавить связь
            </Button>
            {data.links.length === 0 ? <Empty text="Связей пока нет" icon="Link" /> : data.links.map((l) => (
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
        onSaved={() => loadEffects(effectDialog.resultId)}
      />
      <LinkFormDialog open={linkOpen} onOpenChange={setLinkOpen} srcKind="project" srcId={pid} onSaved={load} />

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