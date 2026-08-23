import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading, Metric, fmtDate } from "@/components/exec/ExecUI";
import { DateField, Modal, SelectField, TextField } from "@/components/exec/ExecForm";
import { Avatar, LoadBadge } from "@/components/exec/team/TeamUI";
import StepAssignPanel from "@/components/exec/team/StepAssignPanel";
import {
  OBJECT_KIND,
  ObjectKind,
  PeopleRefs,
  UnassignedStep,
  WorkloadRow,
  fmtWeek,
  peopleApi,
  weekStart,
} from "@/lib/execPeopleApi";
import { useStickyState } from "@/lib/useStickyState";

export default function ExecAssignPage() {
  const nav = useNavigate();
  const [steps, setSteps] = useState<UnassignedStep[]>([]);
  const [refs, setRefs] = useState<PeopleRefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [q, setQ] = useStickyState("assign_q", "");
  const [fKind, setFKind] = useStickyState<string>("assign_kind", "");
  const [result, setResult] = useState<{
    updated: number;
    by_kind: Record<string, number>;
    remaining: number;
  } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [panel, setPanel] = useState<UnassignedStep | null>(null);

  const reload = () => {
    setLoading(true);
    setError("");
    Promise.all([peopleApi.unassignedSteps(), peopleApi.refs()])
      .then(([s, r]) => {
        setSteps(s);
        setRefs(r);
        setSel(new Set());
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(reload, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return steps.filter((s) => {
      if (fKind && s.object_kind !== fKind) return false;
      if (!query) return true;
      return `${s.title} ${s.plan_title || ""} ${s.initiative_title || ""}`
        .toLowerCase()
        .includes(query);
    });
  }, [steps, q, fKind]);

  // Часы требуются только задачам: у этапа они из дочерних,
  // у контрольной точки трудоёмкости нет
  const noEstimate = steps.filter(
    (s) => s.object_kind === "task" && s.estimate_hours == null,
  ).length;
  const noDue = steps.filter((s) => !s.due_date).length;
  const byKind = steps.reduce<Record<string, number>>((a, s) => {
    a[s.object_kind] = (a[s.object_kind] || 0) + 1;
    return a;
  }, {});

  const toggle = (id: number) => {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    setSel((s) => (s.size === filtered.length ? new Set() : new Set(filtered.map((x) => x.id))));
  };

  return (
    <Layout>
      <div className="max-w-[1200px] mx-auto px-4 py-6">
        <header className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Назначение ответственных</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Задачи без ответственного: назначьте по одной или сразу нескольким
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => nav("/cabinet/exec/workload")}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5"
            >
              <Icon name="CalendarRange" size={15} />
              <span className="hidden sm:inline">Загрузка</span>
            </button>
            <button
              onClick={() => setBulkOpen(true)}
              disabled={!sel.size}
              className="px-3 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700 disabled:opacity-40 transition-colors inline-flex items-center gap-1.5"
            >
              <Icon name="UserCheck" size={15} />
              Назначить ({sel.size})
            </button>
          </div>
        </header>

        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} onRetry={reload} />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <Metric
                label="Без ответственного"
                value={steps.length}
                tone={steps.length ? "danger" : "success"}
                icon="UserX"
              />
              <Metric
                label="Задач без трудоёмкости"
                value={noEstimate}
                tone={noEstimate ? "warning" : "default"}
                icon="Scale"
                onClick={() => setFKind("task")}
              />
              <Metric
                label="Без срока"
                value={noDue}
                tone={noDue ? "warning" : "default"}
                icon="CalendarX"
              />
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => setFKind("")}
                className={`px-2.5 py-1 rounded-lg border text-xs transition-colors ${
                  !fKind
                    ? "border-violet-300 bg-violet-50 text-violet-700"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                Все объекты: {steps.length}
              </button>
              {(Object.keys(OBJECT_KIND) as ObjectKind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setFKind(fKind === k ? "" : k)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-colors ${
                    fKind === k
                      ? "border-violet-300 bg-violet-50 text-violet-700"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <Icon name={OBJECT_KIND[k].icon} size={11} />
                  {OBJECT_KIND[k].title}: {byKind[k] || 0}
                  {!OBJECT_KIND[k].needsHours && (
                    <span className="text-slate-400">· часы не нужны</span>
                  )}
                </button>
              ))}
            </div>

            {result && (
              <div className="rounded-xl border border-green-200 bg-green-50 p-3 mb-3 flex items-start gap-2.5">
                <Icon name="CircleCheck" size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-green-800 font-medium">
                    Назначено объектов: {result.updated}
                  </p>
                  <p className="text-[11px] text-green-700 mt-0.5">
                    {(Object.keys(result.by_kind) as ObjectKind[])
                      .map((k) => `${OBJECT_KIND[k]?.title || k}: ${result.by_kind[k]}`)
                      .join(" · ")}
                    {" — "}осталось без ответственного: {result.remaining}
                  </p>
                </div>
                <button
                  onClick={() => setResult(null)}
                  className="text-green-600 hover:text-green-800 transition-colors"
                >
                  <Icon name="X" size={14} />
                </button>
              </div>
            )}

            {!steps.length ? (
              <Empty text="У всех задач есть ответственный" icon="CircleCheck" />
            ) : (
              <>
                <div className="rounded-xl border border-slate-200 bg-white p-3 mb-3 flex flex-wrap items-center gap-3">
                  <div className="relative flex-1 min-w-[200px]">
                    <Icon
                      name="Search"
                      size={15}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Поиск по задаче, плану или инициативе"
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-violet-400"
                    />
                  </div>
                  <button
                    onClick={toggleAll}
                    className="text-xs text-violet-600 hover:text-violet-700 transition-colors whitespace-nowrap"
                  >
                    {sel.size === filtered.length ? "Снять выделение" : "Выбрать все"}
                  </button>
                  <span className="text-xs text-slate-400">Найдено: {filtered.length}</span>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  {filtered.map((s) => (
                    <div
                      key={s.id}
                      className={`flex flex-wrap items-start gap-3 p-3 border-b border-slate-100 last:border-0 transition-colors ${
                        sel.has(s.id) ? "bg-violet-50/50" : "hover:bg-slate-50/60"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={sel.has(s.id)}
                        onChange={() => toggle(s.id)}
                        className="mt-1 w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${
                              OBJECT_KIND[s.object_kind].cls
                            }`}
                          >
                            <Icon name={OBJECT_KIND[s.object_kind].icon} size={9} />
                            {s.object_kind_title}
                          </span>
                          <p className="text-sm font-medium text-slate-900">{s.title}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-500">
                          {s.parent_title && <span>в «{s.parent_title}»</span>}
                          {s.plan_title && <span>· {s.plan_title}</span>}
                          {s.initiative_title && <span>· {s.initiative_title}</span>}
                          <span className={s.due_date ? "" : "text-amber-600"}>
                            · {s.due_date ? `срок ${fmtDate(s.due_date)}` : "срок не задан"}
                          </span>
                          <span
                            className={
                              s.estimate_hours != null
                                ? ""
                                : OBJECT_KIND[s.object_kind].needsHours
                                  ? "text-amber-600"
                                  : "text-slate-400"
                            }
                          >
                            ·{" "}
                            {s.estimate_hours != null
                              ? `${s.estimate_hours} ч`
                              : s.object_kind === "stage"
                                ? "часы из дочерних задач"
                                : s.object_kind === "control_point"
                                  ? "часы не требуются"
                                  : "трудоёмкость не задана"}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => setPanel(s)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 hover:bg-white hover:border-violet-300 transition-colors inline-flex items-center gap-1.5 flex-shrink-0"
                      >
                        <Icon name="UserPlus" size={12} />
                        Назначить
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {bulkOpen && (
          <BulkAssignForm
            stepIds={Array.from(sel)}
            steps={steps.filter((s) => sel.has(s.id))}
            refs={refs}
            onClose={() => setBulkOpen(false)}
            onSaved={(r) => {
              setBulkOpen(false);
              setResult({ updated: r.updated, by_kind: r.by_kind, remaining: r.remaining_without_owner });
              reload();
            }}
          />
        )}

        {panel && (
          <StepAssignPanel
            stepId={panel.id}
            stepTitle={panel.title}
            startDate={null}
            dueDate={panel.due_date}
            refs={refs}
            onClose={() => setPanel(null)}
            onChanged={reload}
          />
        )}
      </div>
    </Layout>
  );
}

function BulkAssignForm({
  stepIds,
  steps,
  refs,
  onClose,
  onSaved,
}: {
  stepIds: number[];
  steps: UnassignedStep[];
  refs: PeopleRefs | null;
  onClose: () => void;
  onSaved: (r: {
    updated: number;
    by_kind: Record<string, number>;
    remaining_without_owner: number;
  }) => void;
}) {
  const [f, setF] = useState({
    responsible_id: "",
    hours_each: "",
    due_date: "",
    priority: "",
  });
  const [execs, setExecs] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [check, setCheck] = useState<WorkloadRow[] | null>(null);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const tasksOnly = steps.filter((s) => s.step_type !== "stage");
  const stagesCount = steps.length - tasksOnly.length;

  useEffect(() => {
    if (!f.responsible_id) {
      setCheck(null);
      return;
    }
    const from = weekStart(new Date());
    const to = new Date();
    to.setDate(to.getDate() + 56);
    peopleApi
      .workload(from, to.toISOString().slice(0, 10), [Number(f.responsible_id)])
      .then((d) => setCheck(d.rows))
      .catch(() => setCheck(null));
  }, [f.responsible_id]);

  const projected = useMemo(() => {
    if (!check) return null;
    const per = Number(f.hours_each || 0) * tasksOnly.length;
    if (!per) return check;
    const active = check.filter((r) => r.capacity_hours > 0).length || 1;
    const add = per / active;
    return check.map((r) => ({
      ...r,
      planned_hours: r.planned_hours + add,
      load_pct: r.capacity_hours
        ? Math.round(((r.planned_hours + add) / r.capacity_hours) * 1000) / 10
        : null,
    }));
  }, [check, f.hours_each, tasksOnly.length]);

  const willOverload = (projected || []).filter((r) => (r.load_pct ?? 0) > 100);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const r = await peopleApi.bulkAssign({
        step_ids: stepIds,
        responsible_id: f.responsible_id || null,
        executor_ids: execs,
        hours_each: f.hours_each || null,
        due_date: f.due_date || null,
        priority: f.priority || null,
      });
      onSaved(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Массовое назначение: ${stepIds.length} задач`}
      subtitle="Один ответственный и общие параметры для всех выбранных"
      onClose={onClose}
      onSave={save}
      saving={saving}
      canSave={!!f.responsible_id || execs.length > 0}
      error={error}
      wide
    >
      <SelectField
        label="Ответственный (роль A)"
        value={f.responsible_id}
        onChange={(v) => set("responsible_id", v)}
        options={(refs?.persons || []).map((p) => ({
          value: String(p.id),
          label: p.position_title ? `${p.display_name} — ${p.position_title}` : p.display_name,
        }))}
        placeholder="не назначать"
      />

      <div>
        <p className="text-xs text-slate-500 mb-1.5">Исполнители (роль R)</p>
        <div className="flex flex-wrap gap-1.5">
          {(refs?.persons || []).map((p) => {
            const on = execs.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() =>
                  setExecs((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))
                }
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs transition-colors ${
                  on
                    ? "border-violet-300 bg-violet-50 text-violet-700"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                <Avatar name={p.display_name} size={18} />
                {p.display_name}
                {on && <Icon name="Check" size={11} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <TextField
          label="Часов на задачу"
          value={f.hours_each}
          onChange={(v) => set("hours_each", v)}
          hint="Каждому исполнителю"
        />
        <DateField label="Общий срок" value={f.due_date} onChange={(v) => set("due_date", v)} />
        <SelectField
          label="Приоритет"
          value={f.priority}
          onChange={(v) => set("priority", v)}
          options={[
            { value: "low", label: "Низкий" },
            { value: "normal", label: "Обычный" },
            { value: "high", label: "Высокий" },
          ]}
          placeholder="не менять"
        />
      </div>

      {stagesCount > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 flex items-start gap-2">
          <Icon name="Info" size={13} className="text-slate-500 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-slate-600">
            Среди выбранных {stagesCount} этап(ов). Ответственный будет назначен, но часы не
            записываются: трудозатраты этапа складываются из дочерних задач.
          </p>
        </div>
      )}

      {check && check.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-700 mb-2">
            Загрузка ответственного после назначения
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(projected || check).slice(0, 8).map((r) => (
              <span
                key={r.week_start}
                className="inline-flex items-center gap-1 text-[11px] bg-white border border-slate-200 rounded px-1.5 py-1"
              >
                <span className="text-slate-500">{fmtWeek(r.week_start).split(" — ")[0]}</span>
                <LoadBadge
                  pct={r.load_pct}
                  state={
                    (r.load_pct ?? 0) > 100
                      ? "overload"
                      : (r.load_pct ?? 0) >= 80
                        ? "normal"
                        : "free"
                  }
                />
              </span>
            ))}
          </div>
          {willOverload.length > 0 && (
            <p className="text-[11px] text-amber-700 mt-2 flex items-start gap-1.5">
              <Icon name="TriangleAlert" size={12} className="mt-0.5 flex-shrink-0" />
              Возникнет перегрузка в {willOverload.length} нед. Назначение всё равно возможно.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
