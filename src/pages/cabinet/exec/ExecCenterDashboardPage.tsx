import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { ErrorBox, Loading, Metric } from "@/components/exec/ExecUI";
import { Toggle } from "@/components/exec/team/TeamUI";
import {
  CheckpointRow,
  CoverageBlock,
  EmptyHint,
  FunctionRow,
  GoalRow,
  InitiativeRow,
  IssueRow,
  ReadinessPanel,
  RiskRow,
  RoleRow,
  Section,
} from "@/components/exec/center/DashBlocks";
import { DashboardData, centerApi } from "@/lib/execCenterApi";
import { WorkloadData, peopleApi, weekStart } from "@/lib/execPeopleApi";
import { useStickyState } from "@/lib/useStickyState";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PIE = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4"];

export default function ExecCenterDashboardPage() {
  const nav = useNavigate();
  const [d, setD] = useState<DashboardData | null>(null);
  const [load, setLoad] = useState<WorkloadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showTest, setShowTest] = useStickyState("dash_test", false);

  const reload = () => {
    setLoading(true);
    setError("");
    const from = weekStart(new Date());
    const to = new Date();
    to.setDate(to.getDate() + 55);
    Promise.all([
      centerApi.dashboard(),
      peopleApi.workload(from, to.toISOString().slice(0, 10)),
    ])
      .then(([dash, wl]) => {
        setD(dash);
        setLoad(wl);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(reload, []);

  const hide = <T extends { is_test: boolean }>(arr: T[]) =>
    showTest ? arr : arr.filter((x) => !x.is_test);

  const initiatives = useMemo(() => hide(d?.initiatives || []), [d, showTest]);
  const checkpoints = useMemo(() => hide(d?.checkpoints || []), [d, showTest]);
  const risks = useMemo(() => hide(d?.risks || []), [d, showTest]);
  const issues = useMemo(() => hide(d?.issues || []), [d, showTest]);

  // Показатели считаем по видимым записям, чтобы плитки не расходились с разделами
  const visible = useMemo(() => {
    const overdueCp = checkpoints.filter((c) => c.is_overdue).length;
    const blocking =
      risks.filter((r) => r.is_blocking).length + issues.filter((i) => i.is_blocking).length;
    return { overdueCp, blocking };
  }, [checkpoints, risks, issues]);

  // Загрузка команды: сколько людей в норме, резерве, перегрузе
  const loadSplit = useMemo(() => {
    if (!load) return null;
    const byPerson = new Map<number, string>();
    load.rows.forEach((r) => {
      const cur = byPerson.get(r.person_id);
      if (r.state === "overload") byPerson.set(r.person_id, "overload");
      else if (r.state === "normal" && cur !== "overload") byPerson.set(r.person_id, "normal");
      else if (!cur) byPerson.set(r.person_id, "free");
    });
    const vals = Array.from(byPerson.values());
    return {
      overload: vals.filter((v) => v === "overload").length,
      normal: vals.filter((v) => v === "normal").length,
      free: vals.filter((v) => v === "free").length,
      total: vals.length,
      capacity: Math.round(load.rows.reduce((s, r) => s + r.capacity_hours, 0)),
      planned: Math.round(load.rows.reduce((s, r) => s + r.planned_hours, 0)),
    };
  }, [load]);

  const funcByGoal = useMemo(() => {
    if (!d) return [];
    const m = new Map<string, number>();
    d.functions.forEach((f) => {
      const k = f.goal_title || "Без цели";
      m.set(k, (m.get(k) || 0) + 1);
    });
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [d]);

  const laborChart = useMemo(() => {
    if (!d) return [];
    return [
      {
        name: "Трудозатраты",
        План: Math.round(Number(d.labor.plan_hours || 0)),
        Факт: Math.round(Number(d.labor.fact_hours || 0)),
      },
    ];
  }, [d]);

  const restore = async () => {
    if (!d?.center) return;
    await centerApi.saveCenter({ id: d.center.id, status: "active" });
    reload();
  };

  const gotoReadiness = (code: string) => {
    if (["passport", "goals", "functions", "roles"].includes(code)) nav("/cabinet/exec/center");
    else if (code === "owners" || code === "competency" || code === "backup")
      nav("/cabinet/exec/center");
    else if (code === "labor") nav("/cabinet/exec/workload");
  };

  if (loading) {
    return (
      <Layout>
        <Loading />
      </Layout>
    );
  }
  if (error) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-10">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      </Layout>
    );
  }
  if (!d?.center) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <Icon name="Building2" size={32} className="text-slate-300 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-slate-900">Центр ещё не создан</h1>
          <p className="text-sm text-slate-500 mt-1.5">
            Создайте паспорт Центра, чтобы видеть управленческую картину целиком.
          </p>
          <button
            onClick={() => nav("/cabinet/exec/center")}
            className="mt-4 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700 transition-colors"
          >
            Создать Центр
          </button>
        </div>
      </Layout>
    );
  }

  const s = d.stats;
  const c = d.center;

  return (
    <Layout>
      <div className="max-w-[1500px] mx-auto px-4 py-6">
        <header className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-slate-900">{c.title}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-slate-500">
              {c.head_name && <span>Руководитель: {c.head_name}</span>}
              {c.parent_org && <span>· {c.parent_org}</span>}
              {c.status === "archived" && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded text-[11px] border border-amber-200 bg-amber-50 text-amber-700">
                    в архиве
                  </span>
                  <button
                    onClick={restore}
                    className="text-[11px] text-violet-600 hover:text-violet-700 transition-colors"
                  >
                    вернуть в работу
                  </button>
                </span>
              )}
            </div>
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
              onClick={() => nav("/cabinet/exec/center")}
              className="px-3 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700 transition-colors inline-flex items-center gap-1.5"
            >
              <Icon name="Pencil" size={15} />
              Паспорт
            </button>
          </div>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
          <Metric
            label="Цели"
            value={s.goals}
            tone={s.goals_no_metric ? "warning" : "default"}
            icon="Target"
          />
          <Metric
            label="Функции"
            value={s.functions}
            tone={s.functions_no_owner ? "danger" : "default"}
            icon="Network"
          />
          <Metric
            label="Численность"
            value={`${s.headcount_filled}/${s.headcount}`}
            tone={s.vacant_roles ? "warning" : "default"}
            icon="Users"
          />
          <Metric
            label="Просрочено вех"
            value={visible.overdueCp}
            tone={visible.overdueCp ? "danger" : "success"}
            icon="Flag"
            onClick={() => nav("/cabinet/exec/control")}
          />
          <Metric
            label="Блокировки"
            value={visible.blocking}
            tone={visible.blocking ? "danger" : "success"}
            icon="Ban"
            onClick={() => nav("/cabinet/exec/control")}
          />
          <Metric
            label="План / факт, ч"
            value={`${Math.round(Number(d.labor.plan_hours || 0))} / ${Math.round(
              Number(d.labor.fact_hours || 0),
            )}`}
            icon="Timer"
            onClick={() => nav("/cabinet/exec/workload")}
          />
        </div>

        <div className="grid lg:grid-cols-3 gap-4 mb-4">
          <div className="lg:col-span-2">
            <ReadinessPanel
              items={d.readiness}
              pct={s.readiness_pct}
              onGoto={gotoReadiness}
            />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-900 mb-3">Результаты работы</p>
            <div className="space-y-2.5">
              <ResultRow
                label="Задач выполнено"
                value={d.results.steps_done}
                total={d.results.steps_done + d.results.steps_open}
              />
              <ResultRow
                label="Контрольных точек пройдено"
                value={d.results.cp_done}
                total={d.results.cp_total}
              />
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="text-xs text-slate-500">Просрочено задач</span>
                <span
                  className={`text-sm font-semibold tabular-nums ${
                    d.results.steps_overdue ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {d.results.steps_overdue}
                </span>
              </div>
              {loadSplit && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Перегружено людей</span>
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      loadSplit.overload ? "text-red-600" : "text-green-600"
                    }`}
                  >
                    {loadSplit.overload} из {loadSplit.total}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {s.test_records > 0 && (
          <div className="flex items-center gap-3 mb-4 px-1">
            <Toggle
              checked={showTest}
              onChange={setShowTest}
              label={`Показывать проверочные записи (${s.test_records})`}
            />
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-4">
          <Section
            title="Цели и показатели"
            icon="Target"
            count={d.goals.length}
            action={
              <button
                onClick={() => nav("/cabinet/exec/center")}
                className="text-xs text-violet-600 hover:text-violet-700 transition-colors"
              >
                Изменить
              </button>
            }
          >
            {!d.goals.length ? (
              <EmptyHint
                text="Цели Центра ещё не заданы"
                icon="Target"
                actionText="Добавить цель"
                onAction={() => nav("/cabinet/exec/center")}
              />
            ) : (
              <div className="space-y-2">
                {d.goals.map((g) => (
                  <GoalRow key={g.id} g={g} onClick={() => nav("/cabinet/exec/center")} />
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Функции и владельцы"
            icon="Network"
            count={d.functions.length}
            action={
              s.functions_no_owner > 0 ? (
                <span className="text-xs text-red-600">
                  без владельца: {s.functions_no_owner}
                </span>
              ) : undefined
            }
          >
            {!d.functions.length ? (
              <EmptyHint
                text="Функции Центра ещё не описаны"
                icon="Network"
                actionText="Добавить функцию"
                onAction={() => nav("/cabinet/exec/center")}
              />
            ) : (
              <div className="space-y-2">
                {d.functions.map((f) => (
                  <FunctionRow key={f.id} f={f} onClick={() => nav("/cabinet/exec/center")} />
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Покрытие компетенциями"
            icon="Award"
            count={s.competency_gaps}
            action={
              <button
                onClick={() => nav("/cabinet/exec/team")}
                className="text-xs text-violet-600 hover:text-violet-700 transition-colors"
              >
                Команда
              </button>
            }
          >
            {!d.functions.length ? (
              <EmptyHint text="Сначала опишите функции Центра" icon="Award" />
            ) : s.functions_no_competency === d.functions.length ? (
              <EmptyHint
                text="Требования к компетенциям пока не заданы"
                icon="Award"
                actionText="Задать требования"
                onAction={() => nav("/cabinet/exec/center")}
              />
            ) : (
              <CoverageBlock gaps={d.gaps} />
            )}
          </Section>

          <Section
            title="Обоснование численности"
            icon="Users"
            count={s.headcount}
            action={
              <span className="text-xs text-slate-500">
                занято {s.headcount_filled} из {s.headcount}
              </span>
            }
          >
            {!d.roles.length ? (
              <EmptyHint
                text="Штатные позиции ещё не описаны"
                icon="Users"
                actionText="Добавить позицию"
                onAction={() => nav("/cabinet/exec/center")}
              />
            ) : (
              <div className="space-y-2">
                {d.roles.map((r) => (
                  <RoleRow key={r.id} r={r} />
                ))}
              </div>
            )}
          </Section>

          <Section title="Инициативы и проекты" icon="Rocket" count={initiatives.length}>
            {!initiatives.length ? (
              <EmptyHint
                text="Инициативы к Центру не привязаны"
                icon="Rocket"
                actionText="Открыть инициативы"
                onAction={() => nav("/cabinet/exec/initiatives")}
              />
            ) : (
              <div className="space-y-2">
                {initiatives.map((i) => (
                  <InitiativeRow
                    key={i.id}
                    i={i}
                    onClick={() => nav(`/cabinet/exec/initiatives/${i.id}`)}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Контрольные точки и вехи"
            icon="Flag"
            count={checkpoints.length}
            action={
              visible.overdueCp > 0 ? (
                <span className="text-xs text-red-600">просрочено: {visible.overdueCp}</span>
              ) : undefined
            }
          >
            {!checkpoints.length ? (
              <EmptyHint text="Контрольных точек нет" icon="Flag" />
            ) : (
              <div className="space-y-1.5 max-h-[380px] overflow-y-auto">
                {checkpoints.map((c2) => (
                  <CheckpointRow
                    key={`${c2.kind}-${c2.id}`}
                    c={c2}
                    onClick={() =>
                      nav(c2.kind === "milestone" ? "/cabinet/exec/control" : "/cabinet/exec/planner")
                    }
                  />
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Риски"
            icon="ShieldAlert"
            count={risks.length}
            action={
              <button
                onClick={() => nav("/cabinet/exec/control")}
                className="text-xs text-violet-600 hover:text-violet-700 transition-colors"
              >
                Контроль
              </button>
            }
          >
            {!risks.length ? (
              <EmptyHint text="Открытых рисков нет" icon="ShieldCheck" />
            ) : (
              <div className="space-y-1.5">
                {risks.map((r) => (
                  <RiskRow key={r.id} r={r} />
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Проблемы и блокировки"
            icon="Ban"
            count={issues.length}
            action={
              <button
                onClick={() => nav("/cabinet/exec/control")}
                className="text-xs text-violet-600 hover:text-violet-700 transition-colors"
              >
                Контроль
              </button>
            }
          >
            {!issues.length ? (
              <EmptyHint text="Открытых проблем нет" icon="CircleCheck" />
            ) : (
              <div className="space-y-1.5">
                {issues.map((i) => (
                  <IssueRow key={i.id} i={i} />
                ))}
              </div>
            )}
          </Section>

          <Section title="Трудозатраты: план и факт" icon="Timer">
            <div style={{ width: "100%", height: 190 }}>
              <ResponsiveContainer>
                <BarChart data={laborChart} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar
                    dataKey="План"
                    fill="#8b5cf6"
                    radius={[3, 3, 0, 0]}
                    cursor="pointer"
                    onClick={() => nav("/cabinet/exec/workload")}
                  />
                  <Bar
                    dataKey="Факт"
                    fill="#10b981"
                    radius={[3, 3, 0, 0]}
                    cursor="pointer"
                    onClick={() => nav("/cabinet/exec/workload")}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {loadSplit && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                <MiniStat label="Ёмкость, ч" value={loadSplit.capacity} />
                <MiniStat label="Запланировано, ч" value={loadSplit.planned} />
                <MiniStat
                  label="Загрузка"
                  value={
                    loadSplit.capacity
                      ? `${Math.round((loadSplit.planned / loadSplit.capacity) * 100)}%`
                      : "—"
                  }
                />
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-2">
              План — сумма часов назначений, факт — записи учёта времени
            </p>
          </Section>

          <Section title="Распределение функций по целям" icon="ChartPie">
            {!funcByGoal.length ? (
              <EmptyHint text="Функции ещё не привязаны к целям" icon="ChartPie" />
            ) : (
              <div style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={funcByGoal}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={75}
                      label={(e: { name: string }) => e.name.slice(0, 16)}
                      labelLine={false}
                    >
                      {funcByGoal.map((_, i) => (
                        <Cell key={i} fill={PIE[i % PIE.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </Section>
        </div>
      </div>
    </Layout>
  );
}

function ResultRow({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-500">{label}</span>
        <span className="text-sm font-semibold text-slate-900 tabular-nums">
          {value} / {total}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-violet-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
      <p className="text-[10px] text-slate-500 leading-tight">{label}</p>
      <p className="text-sm font-semibold text-slate-900 tabular-nums mt-0.5">{value}</p>
    </div>
  );
}
