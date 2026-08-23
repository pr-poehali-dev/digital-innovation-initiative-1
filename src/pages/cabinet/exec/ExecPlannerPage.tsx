import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { Card, Empty, ErrorBox, Loading, Metric, fmtDate } from "@/components/exec/ExecUI";
import PlanForm from "@/components/exec/PlanForm";
import PlanStepForm from "@/components/exec/PlanStepForm";
import PlanTimeline from "@/components/exec/PlanTimeline";
import PlanTreeMap from "@/components/exec/PlanTreeMap";
import AiPlanDialog from "@/components/exec/AiPlanDialog";
import {
  PLAN_STATUS,
  PRIORITY_LABEL,
  Plan,
  PlanStep,
  PlannerRefs,
  ResourceLoad,
  STEP_STATUS,
  branchProgress,
  buildTree,
  plannerApi,
} from "@/lib/execPlannerApi";

type Tree = PlanStep & { children: PlanStep[] };

function StepRow({
  node,
  depth,
  expanded,
  toggle,
  onEdit,
  onAddChild,
  onQuickStatus,
  onDelete,
}: {
  node: Tree;
  depth: number;
  expanded: Set<number>;
  toggle: (id: number) => void;
  onEdit: (s: PlanStep) => void;
  onAddChild: (s: PlanStep) => void;
  onQuickStatus: (s: PlanStep, status: string) => void;
  onDelete: (s: PlanStep) => void;
}) {
  const kids = (node.children as Tree[]).filter((c) => c.status !== "cancelled");
  const hasKids = kids.length > 0;
  const open = expanded.has(node.id);
  const st = STEP_STATUS[node.status] || STEP_STATUS.not_started;
  const pct = hasKids ? branchProgress(node) : node.status === "done" ? 100 : node.progress_pct || 0;
  const done = node.status === "done";

  return (
    <>
      <div
        className={`group flex items-start gap-2 py-2.5 px-2 rounded-lg hover:bg-slate-50 transition-colors border-l-2 ${
          node.is_overdue ? "border-red-400" : done ? "border-green-400" : "border-transparent"
        }`}
        style={{ marginLeft: `${depth * 20}px` }}
      >
        <button
          onClick={() => hasKids && toggle(node.id)}
          className={`mt-0.5 flex-shrink-0 w-4 h-4 flex items-center justify-center rounded ${
            hasKids ? "text-slate-400 hover:text-slate-700 hover:bg-slate-200" : "opacity-0"
          }`}
        >
          <Icon name={open ? "ChevronDown" : "ChevronRight"} size={13} />
        </button>

        <button
          onClick={() => onQuickStatus(node, done ? "in_progress" : "done")}
          className={`mt-0.5 flex-shrink-0 w-[17px] h-[17px] rounded border flex items-center justify-center transition-colors ${
            done
              ? "bg-green-500 border-green-500"
              : "border-slate-300 hover:border-green-500 bg-white"
          }`}
          title={done ? "Вернуть в работу" : "Отметить готовым"}
        >
          {done && <Icon name="Check" size={11} className="text-white" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {node.is_milestone && (
              <Icon name="Diamond" size={11} className="text-violet-600 flex-shrink-0" />
            )}
            <button
              onClick={() => onEdit(node)}
              className={`text-sm text-left hover:text-violet-700 transition-colors ${
                done ? "text-slate-400 line-through" : "text-slate-900"
              }`}
            >
              {node.title}
            </button>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${st.cls}`}>{st.title}</span>
            {node.is_overdue && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border bg-red-50 text-red-700 border-red-200">
                просрочено
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap mt-1 text-[11px] text-slate-500">
            {node.due_date && (
              <span className={`flex items-center gap-1 ${node.is_overdue ? "text-red-600" : ""}`}>
                <Icon name="Calendar" size={10} />
                {node.start_date ? `${fmtDate(node.start_date)} — ` : "до "}
                {fmtDate(node.due_date)}
              </span>
            )}
            {node.responsible_name && (
              <span className="flex items-center gap-1">
                <Icon name="User" size={10} />
                {node.responsible_name}
              </span>
            )}
            {node.assignees?.length > 0 && (
              <span className="flex items-center gap-1">
                <Icon name="Users" size={10} />
                {node.assignees.map((a) => a.display_name).join(", ")}
              </span>
            )}
            {node.depends_on_title && (
              <span className="flex items-center gap-1 text-amber-700">
                <Icon name="Link" size={10} />
                после «{node.depends_on_title}»
              </span>
            )}
            {hasKids && (
              <span className="flex items-center gap-1">
                <Icon name="ListTree" size={10} />
                {kids.filter((k) => k.status === "done").length}/{kids.length}
              </span>
            )}
          </div>

          {(pct > 0 || hasKids) && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1 flex-1 max-w-[220px] rounded-full bg-slate-200 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    done ? "bg-green-500" : node.is_overdue ? "bg-red-500" : "bg-violet-500"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-400">{pct}%</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={() => onAddChild(node)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-violet-700 hover:bg-slate-100"
            title="Раскрыть на действия"
          >
            <Icon name="Plus" size={13} />
          </button>
          <button
            onClick={() => onEdit(node)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-violet-700 hover:bg-slate-100"
            title="Изменить"
          >
            <Icon name="Pencil" size={13} />
          </button>
          <button
            onClick={() => onDelete(node)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-slate-100"
            title="Убрать"
          >
            <Icon name="Trash2" size={13} />
          </button>
        </div>
      </div>

      {open &&
        kids.map((c) => (
          <StepRow
            key={c.id}
            node={c}
            depth={depth + 1}
            expanded={expanded}
            toggle={toggle}
            onEdit={onEdit}
            onAddChild={onAddChild}
            onQuickStatus={onQuickStatus}
            onDelete={onDelete}
          />
        ))}
    </>
  );
}

export default function ExecPlannerPage() {
  const [params, setParams] = useSearchParams();
  const planId = params.get("plan") ? Number(params.get("plan")) : null;

  const [plans, setPlans] = useState<Plan[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [refs, setRefs] = useState<PlannerRefs>({ persons: [], initiatives: [] });
  const [load, setLoad] = useState<ResourceLoad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const viewParam = params.get("view");
  const view: "tree" | "map" | "timeline" | "resources" =
    viewParam === "timeline" || viewParam === "resources" || viewParam === "map" ? viewParam : "tree";
  const setView = (v: "tree" | "map" | "timeline" | "resources") =>
    setParams(v === "tree" ? { plan: String(planId) } : { plan: String(planId), view: v });

  const [planForm, setPlanForm] = useState<{ open: boolean; edit?: Plan | null }>({ open: false });
  const [aiOpen, setAiOpen] = useState(false);
  const [stepForm, setStepForm] = useState<{
    open: boolean;
    step?: PlanStep | null;
    parentId?: number | null;
    parentTitle?: string;
  }>({ open: false });

  const loadList = () => {
    setLoading(true);
    setError("");
    plannerApi
      .list()
      .then((d) => {
        setPlans(d.plans);
        setRefs(d.refs);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  const loadPlan = (id: number) => {
    setLoading(true);
    setError("");
    plannerApi
      .plan(id)
      .then((d) => {
        setPlan(d.plan);
        setRefs(d.refs);
        setLoad(d.load);
        setExpanded(new Set((d.plan.steps || []).map((s) => s.id)));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (planId) loadPlan(planId);
    else {
      setPlan(null);
      loadList();
    }
  }, [planId]);

  const tree = useMemo(
    () => buildTree((plan?.steps || []).filter((s) => s.status !== "cancelled")) as Tree[],
    [plan],
  );

  const stats = useMemo(() => {
    const all = (plan?.steps || []).filter((s) => s.status !== "cancelled");
    return {
      total: all.length,
      done: all.filter((s) => s.status === "done").length,
      overdue: all.filter((s) => s.is_overdue).length,
      milestones: all.filter((s) => s.is_milestone).length,
      people: new Set(
        all.flatMap((s) => [
          ...(s.responsible_person_id ? [s.responsible_person_id] : []),
          ...(s.assignees || []).map((a) => a.person_id),
        ]),
      ).size,
      outOfRange: plan?.due_date
        ? all.filter((s) => s.due_date && s.due_date > plan.due_date!).length
        : 0,
    };
  }, [plan]);

  const toggle = (id: number) =>
    setExpanded((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const quickStatus = async (s: PlanStep, status: string) => {
    const patch: Record<string, unknown> = { id: s.id, plan_id: s.plan_id, title: s.title, status };
    if (status === "done") {
      patch.progress_pct = 100;
      patch.fact_date = s.fact_date || new Date().toISOString().slice(0, 10);
    }
    try {
      await plannerApi.saveStep(patch);
      if (planId) loadPlan(planId);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const removeStep = async (s: PlanStep) => {
    try {
      await plannerApi.deleteStep(s.id);
      if (planId) loadPlan(planId);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // ── Список планов ───────────────────────────────────────────────
  if (!planId) {
    return (
      <Layout>
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6 space-y-5">
          <header className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Планировщик</h1>
              <p className="text-sm text-slate-500 mt-1">
                Задача руководителя → пошаговый план → сроки, ответственные, контроль
              </p>
            </div>
            <button
              onClick={() => setPlanForm({ open: true })}
              className="px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Icon name="Plus" size={15} />
              Новая задача
            </button>
          </header>

          {loading ? (
            <Loading />
          ) : error ? (
            <ErrorBox message={error} onRetry={loadList} />
          ) : plans.length === 0 ? (
            <Card title="Задачи" icon="GanttChartSquare">
              <div className="py-10 text-center">
                <Icon name="GanttChartSquare" size={34} className="text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-900 font-medium">Ещё нет ни одной задачи</p>
                <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">
                  Заведите задачу, разложите её на шаги, назначьте людей и сроки — и следите
                  за движением на шкале времени.
                </p>
                <button
                  onClick={() => setPlanForm({ open: true })}
                  className="mt-5 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors inline-flex items-center gap-2"
                >
                  <Icon name="Plus" size={15} />
                  Создать задачу
                </button>
              </div>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {plans
                .filter((p) => p.status !== "archived")
                .map((p) => {
                  const st = PLAN_STATUS[p.status] || PLAN_STATUS.draft;
                  const total = p.steps_total || 0;
                  const done = p.steps_done || 0;
                  const pct = total ? Math.round((done / total) * 100) : 0;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setParams({ plan: String(p.id) })}
                      className="text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-violet-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${st.cls}`}>
                          {st.title}
                        </span>
                        {(p.steps_overdue || 0) > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-red-50 text-red-700 border-red-200">
                            {p.steps_overdue} просрочено
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-slate-900 leading-snug">{p.title}</p>
                      {p.goal && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{p.goal}</p>
                      )}

                      <div className="mt-3 flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-violet-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {done}/{total}
                        </span>
                      </div>

                      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3 flex-wrap text-[11px] text-slate-500">
                        {p.owner_name && (
                          <span className="flex items-center gap-1">
                            <Icon name="User" size={10} />
                            {p.owner_name}
                          </span>
                        )}
                        {p.due_date && (
                          <span className="flex items-center gap-1">
                            <Icon name="Calendar" size={10} />
                            до {fmtDate(p.due_date)}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
            </div>
          )}
        </div>

        {planForm.open && (
          <PlanForm
            plan={planForm.edit}
            persons={refs.persons}
            initiatives={refs.initiatives}
            onClose={() => setPlanForm({ open: false })}
            onSaved={(id) => {
              setPlanForm({ open: false });
              setParams({ plan: String(id) });
              // У новой задачи план пустой — сразу предлагаем собрать его через AI
              if (!planForm.edit) setAiOpen(true);
            }}
          />
        )}
      </Layout>
    );
  }

  // ── Детальный план ──────────────────────────────────────────────
  if (loading)
    return (
      <Layout>
        <Loading />
      </Layout>
    );
  if (error || !plan)
    return (
      <Layout>
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6">
          <ErrorBox message={error || "План не найден"} onRetry={() => loadPlan(planId)} />
        </div>
      </Layout>
    );

  const st = PLAN_STATUS[plan.status] || PLAN_STATUS.draft;

  return (
    <Layout>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-5">
        <button
          onClick={() => setParams({})}
          className="text-xs text-slate-500 hover:text-violet-700 flex items-center gap-1.5"
        >
          <Icon name="ArrowLeft" size={13} />
          Все задачи
        </button>

        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold text-slate-900">{plan.title}</h1>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${st.cls}`}>
                {st.title}
              </span>
              {plan.priority && (
                <span className="text-[10px] px-1.5 py-0.5 rounded border bg-slate-100 text-slate-600 border-slate-200">
                  {PRIORITY_LABEL[plan.priority] || plan.priority}
                </span>
              )}
            </div>
            {plan.goal && <p className="text-sm text-slate-500 mt-1 max-w-3xl">{plan.goal}</p>}
            <div className="flex items-center gap-3 flex-wrap mt-2 text-xs text-slate-500">
              {plan.owner_name && (
                <span className="flex items-center gap-1">
                  <Icon name="User" size={11} />
                  {plan.owner_name}
                </span>
              )}
              {(plan.start_date || plan.due_date) && (
                <span className="flex items-center gap-1">
                  <Icon name="Calendar" size={11} />
                  {plan.start_date ? fmtDate(plan.start_date) : "…"} —{" "}
                  {plan.due_date ? fmtDate(plan.due_date) : "…"}
                </span>
              )}
              {plan.initiative_title && (
                <span className="flex items-center gap-1">
                  <Icon name="Rocket" size={11} />
                  {plan.initiative_title}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPlanForm({ open: true, edit: plan })}
              className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:border-slate-300 text-sm font-medium transition-colors flex items-center gap-1.5"
            >
              <Icon name="Pencil" size={14} />
              Задача
            </button>
            <button
              onClick={() => setAiOpen(true)}
              className="px-3 py-2 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 text-sm font-medium transition-colors flex items-center gap-1.5"
            >
              <Icon name="Sparkles" size={14} />
              AI-план
            </button>
            <button
              onClick={() => setStepForm({ open: true, parentId: null })}
              className="px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Icon name="Plus" size={15} />
              Шаг
            </button>
          </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Metric label="Шагов всего" value={stats.total} icon="ListTree" />
          <Metric
            label="Выполнено"
            value={`${stats.done}/${stats.total}`}
            icon="CheckCircle2"
            tone={stats.total && stats.done === stats.total ? "success" : "default"}
          />
          <Metric
            label="Просрочено"
            value={stats.overdue}
            icon="AlertTriangle"
            tone={stats.overdue ? "danger" : "success"}
          />
          <Metric label="Вех" value={stats.milestones} icon="Diamond" />
          <Metric label="Задействовано людей" value={stats.people} icon="Users" />
          <Metric
            label="За общим сроком"
            value={stats.outOfRange}
            icon="CalendarX"
            tone={stats.outOfRange ? "warning" : "success"}
          />
        </div>

        {stats.outOfRange > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 flex items-start gap-2.5">
            <Icon name="TriangleAlert" size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              {stats.outOfRange} шаг(ов) выходят за общий срок задачи (
              {fmtDate(plan.due_date)}). Сдвиньте сроки или пересогласуйте дату завершения.
            </p>
          </div>
        )}

        <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto no-scrollbar">
          {[
            { id: "tree", label: "План по шагам", icon: "ListTree" },
            { id: "map", label: "Дерево плана", icon: "Network" },
            { id: "timeline", label: "Шкала времени", icon: "GanttChartSquare" },
            { id: "resources", label: "Ресурсы", icon: "Users" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setView(t.id as typeof view)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap flex-shrink-0 ${
                view === t.id
                  ? "border-violet-600 text-slate-900 font-medium"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon name={t.icon} size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {view === "tree" && (
          <Card
            title="Пошаговый план"
            subtitle="Любой шаг можно раскрыть на более мелкие действия"
            icon="ListTree"
            action={
              tree.length > 0 ? (
                <button
                  onClick={() =>
                    setExpanded((p) =>
                      p.size ? new Set() : new Set((plan.steps || []).map((s) => s.id)),
                    )
                  }
                  className="text-xs text-violet-600 hover:text-violet-700"
                >
                  {expanded.size ? "Свернуть всё" : "Развернуть всё"}
                </button>
              ) : undefined
            }
          >
            {tree.length === 0 ? (
              <div className="py-8 text-center">
                <Icon name="ListTree" size={30} className="text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-900 font-medium">План пока пустой</p>
                <p className="text-sm text-slate-500 mt-1.5 max-w-sm mx-auto">
                  Пусть AI разложит задачу на шаги — или добавьте первый шаг вручную.
                </p>
                <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
                  <button
                    onClick={() => setAiOpen(true)}
                    className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors inline-flex items-center gap-2"
                  >
                    <Icon name="Sparkles" size={14} />
                    Составить план через AI
                  </button>
                  <button
                    onClick={() => setStepForm({ open: true, parentId: null })}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:border-slate-300 text-sm font-medium transition-colors inline-flex items-center gap-2"
                  >
                    <Icon name="Plus" size={14} />
                    Добавить шаг
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-0.5">
                {tree.map((n) => (
                  <StepRow
                    key={n.id}
                    node={n}
                    depth={0}
                    expanded={expanded}
                    toggle={toggle}
                    onEdit={(s) => setStepForm({ open: true, step: s })}
                    onAddChild={(s) =>
                      setStepForm({ open: true, parentId: s.id, parentTitle: s.title })
                    }
                    onQuickStatus={quickStatus}
                    onDelete={removeStep}
                  />
                ))}
              </div>
            )}
          </Card>
        )}

        {view === "map" && (
          <PlanTreeMap
            plan={plan}
            onStepClick={(s) => setStepForm({ open: true, step: s })}
          />
        )}

        {view === "timeline" && (
          <Card
            title="Шкала времени"
            subtitle="Вехи, сроки шагов и контроль общего срока"
            icon="GanttChartSquare"
          >
            <PlanTimeline
              plan={plan}
              onStepClick={(s) => setStepForm({ open: true, step: s })}
            />
          </Card>
        )}

        {view === "resources" && (
          <Card
            title="Загрузка ресурсов"
            subtitle="Кто на чём занят в этом плане"
            icon="Users"
          >
            {load.length === 0 ? (
              <Empty text="Исполнители пока не назначены" icon="Users" />
            ) : (
              <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full text-sm min-w-[600px]">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                      <th className="pb-2 font-medium">Участник</th>
                      <th className="pb-2 font-medium">Должность</th>
                      <th className="pb-2 font-medium text-center">Активных шагов</th>
                      <th className="pb-2 font-medium text-center">Просрочено</th>
                      <th className="pb-2 font-medium">Загрузка</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {load.map((r) => {
                      const over = r.total_workload > 100;
                      return (
                        <tr key={r.person_id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 text-slate-900">{r.display_name}</td>
                          <td className="py-3 text-slate-500 text-xs">
                            {r.position_title || "—"}
                          </td>
                          <td className="py-3 text-center text-slate-700">{r.active_steps}</td>
                          <td className="py-3 text-center">
                            <span className={r.overdue_steps ? "text-red-600 font-medium" : "text-slate-400"}>
                              {r.overdue_steps || "—"}
                            </span>
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-28 rounded-full bg-slate-200 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    over ? "bg-red-500" : "bg-violet-500"
                                  }`}
                                  style={{ width: `${Math.min(r.total_workload, 100)}%` }}
                                />
                              </div>
                              <span className={`text-xs ${over ? "text-red-600" : "text-slate-500"}`}>
                                {r.total_workload}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-[11px] text-slate-400 mt-3">
                  Загрузка выше 100% означает, что человек назначен на несколько параллельных шагов.
                </p>
              </div>
            )}
          </Card>
        )}
      </div>

      {planForm.open && (
        <PlanForm
          plan={planForm.edit}
          persons={refs.persons}
          initiatives={refs.initiatives}
          onClose={() => setPlanForm({ open: false })}
          onSaved={() => {
            setPlanForm({ open: false });
            loadPlan(planId);
          }}
        />
      )}

      {aiOpen && (
        <AiPlanDialog
          plan={plan}
          persons={refs.persons}
          onClose={() => setAiOpen(false)}
          onApplied={() => {
            setAiOpen(false);
            loadPlan(planId);
          }}
        />
      )}

      {stepForm.open && (
        <PlanStepForm
          step={stepForm.step}
          planId={planId}
          parentStepId={stepForm.parentId}
          parentTitle={stepForm.parentTitle}
          siblings={(plan.steps || []).filter((s) => s.status !== "cancelled")}
          persons={refs.persons}
          onClose={() => setStepForm({ open: false })}
          onSaved={() => {
            setStepForm({ open: false });
            loadPlan(planId);
          }}
        />
      )}
    </Layout>
  );
}