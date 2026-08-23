import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { ErrorBox, Loading, Metric, fmtDate } from "@/components/exec/ExecUI";
import { Modal } from "@/components/exec/ExecForm";
import { Toggle, RaciTag } from "@/components/exec/team/TeamUI";
import WeekGrid from "@/components/exec/team/WeekGrid";
import {
  DiagItem,
  PeopleRefs,
  TeamMember,
  WeekDetailRow,
  WorkloadData,
  fmtWeek,
  peopleApi,
  weekStart,
} from "@/lib/execPeopleApi";
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

const PIE_COLORS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7"];

export default function ExecWorkloadPage() {
  const nav = useNavigate();
  const [data, setData] = useState<WorkloadData | null>(null);
  const [people, setPeople] = useState<TeamMember[]>([]);
  const [refs, setRefs] = useState<PeopleRefs | null>(null);
  const [diag, setDiag] = useState<DiagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [weeks, setWeeks] = useState(8);
  const [fPerson, setFPerson] = useState("");
  const [fFunction, setFFunction] = useState("");
  const [fInitiative, setFInitiative] = useState("");
  const [onlyOverload, setOnlyOverload] = useState(false);
  const [showFree, setShowFree] = useState(true);
  const [detail, setDetail] = useState<{
    personId: number;
    week: string;
    name: string;
    rows: WeekDetailRow[];
  } | null>(null);
  const [drill, setDrill] = useState<{ title: string; items: DiagItem[] } | null>(null);

  const reload = () => {
    setLoading(true);
    setError("");
    const from = weekStart(new Date());
    const to = new Date();
    to.setDate(to.getDate() + weeks * 7);
    Promise.all([
      peopleApi.workload(from, to.toISOString().slice(0, 10)),
      peopleApi.people(),
      peopleApi.refs(),
      peopleApi.diagnostics(),
    ])
      .then(([w, p, r, d]) => {
        setData(w);
        setPeople(p);
        setRefs(r);
        setDiag(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(reload, [weeks]);

  const personIndex = useMemo(() => {
    const m = new Map<number, TeamMember>();
    people.forEach((p) => m.set(p.id, p));
    return m;
  }, [people]);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.rows.filter((r) => {
      const p = personIndex.get(r.person_id);
      if (p && (p.record_state || "active") === "archived") return false;
      if (fPerson && r.person_id !== Number(fPerson)) return false;
      if (fFunction && !(p?.function_ids || []).includes(Number(fFunction))) return false;
      if (fInitiative && !(p?.initiative_ids || []).includes(Number(fInitiative))) return false;
      return true;
    });
  }, [data, personIndex, fPerson, fFunction, fInitiative]);

  const visibleRows = useMemo(() => {
    let out = rows;
    if (onlyOverload) {
      const ids = new Set(rows.filter((r) => r.state === "overload").map((r) => r.person_id));
      out = out.filter((r) => ids.has(r.person_id));
    }
    if (!showFree) {
      const ids = new Set(rows.filter((r) => r.planned_hours > 0).map((r) => r.person_id));
      out = out.filter((r) => ids.has(r.person_id));
    }
    return out;
  }, [rows, onlyOverload, showFree]);

  const stats = useMemo(() => {
    const ids = new Set(rows.map((r) => r.person_id));
    const overloadIds = new Set(rows.filter((r) => r.state === "overload").map((r) => r.person_id));
    const idle = new Set(
      Array.from(ids).filter((id) => !rows.some((r) => r.person_id === id && r.planned_hours > 0)),
    );
    const capacity = rows.reduce((s, r) => s + r.capacity_hours, 0);
    const planned = rows.reduce((s, r) => s + r.planned_hours, 0);
    return {
      people: ids.size,
      overloaded: overloadIds.size,
      idle: idle.size,
      capacity: Math.round(capacity),
      planned: Math.round(planned),
      pct: capacity ? Math.round((planned / capacity) * 100) : 0,
    };
  }, [rows]);

  const byWeek = useMemo(() => {
    const m = new Map<string, { week: string; Ёмкость: number; План: number; Перегружено: number }>();
    rows.forEach((r) => {
      const k = r.week_start;
      const cur = m.get(k) || { week: fmtWeek(k).split(" — ")[0], Ёмкость: 0, План: 0, Перегружено: 0 };
      cur["Ёмкость"] += r.capacity_hours;
      cur["План"] += r.planned_hours;
      if (r.state === "overload") cur["Перегружено"] += 1;
      m.set(k, cur);
    });
    return Array.from(m.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({
        ...v,
        Ёмкость: Math.round(v["Ёмкость"]),
        План: Math.round(v["План"]),
      }));
  }, [rows]);

  const byPerson = useMemo(() => {
    const m = new Map<number, { name: string; План: number; Ёмкость: number; id: number }>();
    rows.forEach((r) => {
      const cur = m.get(r.person_id) || {
        name: r.display_name,
        План: 0,
        Ёмкость: 0,
        id: r.person_id,
      };
      cur["План"] += r.planned_hours;
      cur["Ёмкость"] += r.capacity_hours;
      m.set(r.person_id, cur);
    });
    return Array.from(m.values())
      .map((x) => ({ ...x, План: Math.round(x["План"]), Ёмкость: Math.round(x["Ёмкость"]) }))
      .sort((a, b) => b["План"] - a["План"])
      .slice(0, 12);
  }, [rows]);

  const planFact = useMemo(() => {
    const m = new Map<number, { name: string; План: number; Факт: number; id: number }>();
    people
      .filter((p) => (p.record_state || "active") !== "archived")
      .forEach((p) => {
        m.set(p.id, {
          name: p.display_name,
          План: 0,
          Факт: Math.round(Number(p.fact_hours_total || 0)),
          id: p.id,
        });
      });
    rows.forEach((r) => {
      const e = m.get(r.person_id);
      if (e) e["План"] += r.planned_hours;
    });
    return Array.from(m.values())
      .map((x) => ({ ...x, План: Math.round(x["План"]) }))
      .filter((x) => x["План"] > 0 || x["Факт"] > 0)
      .slice(0, 12);
  }, [people, rows]);

  const byFunction = useMemo(() => {
    const m = new Map<string, number>();
    people.forEach((p) => {
      const ids = p.function_ids || [];
      const share = rows
        .filter((r) => r.person_id === p.id)
        .reduce((s, r) => s + r.planned_hours, 0);
      if (!share) return;
      if (!ids.length) {
        m.set("Без функции", (m.get("Без функции") || 0) + share);
        return;
      }
      ids.forEach((fid) => {
        const f = refs?.functions.find((x) => x.id === fid);
        const key = f ? f.title : `Функция #${fid}`;
        m.set(key, (m.get(key) || 0) + share / ids.length);
      });
    });
    return Array.from(m.entries())
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);
  }, [people, rows, refs]);

  const diagCounts = useMemo(() => {
    const by = (code: string) => diag.filter((d) => d.code === code);
    return {
      noResponsible: by("S01"),
      noDue: by("S02"),
      noEstimate: by("S03"),
      noCapacity: by("P01"),
      expiredComp: by("P02"),
      noComp: by("P03"),
      overload: by("P04"),
      funcNoOwner: by("F01"),
      funcNoBackup: by("F02"),
      funcNoComp: by("F03"),
      calendar: [...by("C01"), ...by("C02")],
    };
  }, [diag]);

  const openCell = async (personId: number, week: string) => {
    const p = personIndex.get(personId);
    try {
      const r = await peopleApi.weekDetail(personId, week);
      setDetail({ personId, week, name: p?.display_name || "", rows: r });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Layout>
      <div className="max-w-[1500px] mx-auto px-4 py-6">
        <header className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Загрузка команды</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Ёмкость, плановые часы и перегрузка по неделям
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => nav("/cabinet/exec/team")}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5"
            >
              <Icon name="Users" size={15} />
              <span className="hidden sm:inline">Команда</span>
            </button>
            <button
              onClick={() => nav("/cabinet/exec/assign")}
              className="px-3 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700 transition-colors inline-flex items-center gap-1.5"
            >
              <Icon name="UserCheck" size={15} />
              Назначить
            </button>
          </div>
        </header>

        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} onRetry={reload} />
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
              <Metric label="Сотрудников" value={stats.people} icon="Users" />
              <Metric
                label="Перегружены"
                value={stats.overloaded}
                tone={stats.overloaded ? "danger" : "default"}
                icon="TrendingUp"
                onClick={() => setOnlyOverload(true)}
              />
              <Metric
                label="Без назначений"
                value={stats.idle}
                icon="CircleDashed"
                onClick={() => setShowFree(true)}
              />
              <Metric label="Ёмкость, ч" value={stats.capacity} icon="Clock" />
              <Metric label="План, ч" value={stats.planned} icon="CalendarClock" />
              <Metric
                label="Загрузка"
                value={`${stats.pct}%`}
                tone={
                  stats.pct > (data?.thresholds.high || 100)
                    ? "danger"
                    : stats.pct >= (data?.thresholds.low || 80)
                      ? "success"
                      : "default"
                }
                icon="Gauge"
              />
            </div>

            {data?.calendar_provisional && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 mb-4 flex items-start gap-2">
                <Icon name="Info" size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-800">
                  Календарь после {data.calendar_confirmed_year} года предварительный: переносы
                  выходных официально не утверждены. Расчёт выполняется, но может измениться.
                </p>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white p-3 mb-4">
              <div className="flex flex-wrap gap-2">
                <select
                  value={weeks}
                  onChange={(e) => setWeeks(Number(e.target.value))}
                  className="px-2.5 py-2 rounded-lg border border-slate-200 text-sm text-slate-700"
                >
                  <option value={4}>4 недели</option>
                  <option value={8}>8 недель</option>
                  <option value={13}>Квартал</option>
                  <option value={26}>Полгода</option>
                </select>
                <select
                  value={fPerson}
                  onChange={(e) => setFPerson(e.target.value)}
                  className="px-2.5 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 max-w-[180px]"
                >
                  <option value="">Все сотрудники</option>
                  {people
                    .filter((p) => (p.record_state || "active") !== "archived")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name}
                      </option>
                    ))}
                </select>
                <select
                  value={fFunction}
                  onChange={(e) => setFFunction(e.target.value)}
                  className="px-2.5 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 max-w-[180px]"
                >
                  <option value="">Все функции</option>
                  {refs?.functions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.title}
                    </option>
                  ))}
                </select>
                <select
                  value={fInitiative}
                  onChange={(e) => setFInitiative(e.target.value)}
                  className="px-2.5 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 max-w-[180px]"
                >
                  <option value="">Все инициативы</option>
                  {refs?.initiatives.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-slate-100">
                <Toggle
                  checked={onlyOverload}
                  onChange={setOnlyOverload}
                  label="Только перегруженные"
                />
                <Toggle checked={showFree} onChange={setShowFree} label="Показывать без назначений" />
                {(fPerson || fFunction || fInitiative || onlyOverload) && (
                  <button
                    onClick={() => {
                      setFPerson("");
                      setFFunction("");
                      setFInitiative("");
                      setOnlyOverload(false);
                    }}
                    className="text-xs text-slate-500 hover:text-slate-700 transition-colors ml-auto"
                  >
                    Сбросить фильтры
                  </button>
                )}
              </div>
            </div>

            <WeekGrid
              rows={visibleRows}
              thresholds={data?.thresholds || { low: 80, high: 100 }}
              onCell={openCell}
              onPerson={(id) => nav(`/cabinet/exec/team/${id}`)}
            />

            <div className="grid lg:grid-cols-2 gap-4 mt-4">
              <ChartCard title="Ёмкость и план по неделям" icon="ChartColumn">
                <div style={{ width: "100%", height: 230 }}>
                  <ResponsiveContainer>
                    <BarChart data={byWeek} margin={{ top: 5, right: 5, left: -22, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Ёмкость" fill="#cbd5e1" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="План" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title="Перегрузка по неделям" icon="TriangleAlert">
                <div style={{ width: "100%", height: 230 }}>
                  <ResponsiveContainer>
                    <BarChart data={byWeek} margin={{ top: 5, right: 5, left: -22, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                      />
                      <Bar
                        dataKey="Перегружено"
                        fill="#ef4444"
                        radius={[3, 3, 0, 0]}
                        cursor="pointer"
                        onClick={() => setOnlyOverload(true)}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Нажмите на столбец, чтобы оставить только перегруженных
                </p>
              </ChartCard>

              <ChartCard title="Загрузка сотрудников" icon="Users">
                <div style={{ width: "100%", height: 250 }}>
                  <ResponsiveContainer>
                    <BarChart
                      data={byPerson}
                      layout="vertical"
                      margin={{ top: 5, right: 10, left: 5, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={100}
                        tick={{ fontSize: 10, fill: "#64748b" }}
                      />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Ёмкость" fill="#e2e8f0" radius={[0, 3, 3, 0]} />
                      <Bar
                        dataKey="План"
                        fill="#8b5cf6"
                        radius={[0, 3, 3, 0]}
                        cursor="pointer"
                        onClick={(d: { id?: number }) => d?.id && nav(`/cabinet/exec/team/${d.id}`)}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Нажмите на полосу плана, чтобы открыть сотрудника
                </p>
              </ChartCard>

              <ChartCard title="Плановые и фактические часы" icon="Scale">
                <div style={{ width: "100%", height: 250 }}>
                  <ResponsiveContainer>
                    <BarChart
                      data={planFact}
                      layout="vertical"
                      margin={{ top: 5, right: 10, left: 5, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={100}
                        tick={{ fontSize: 10, fill: "#64748b" }}
                      />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar
                        dataKey="План"
                        fill="#8b5cf6"
                        radius={[0, 3, 3, 0]}
                        cursor="pointer"
                        onClick={(d: { id?: number }) => d?.id && nav(`/cabinet/exec/team/${d.id}`)}
                      />
                      <Bar
                        dataKey="Факт"
                        fill="#10b981"
                        radius={[0, 3, 3, 0]}
                        cursor="pointer"
                        onClick={(d: { id?: number }) => d?.id && nav(`/cabinet/exec/team/${d.id}`)}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title="Распределение по функциям" icon="ChartPie">
                {!byFunction.length ? (
                  <p className="py-16 text-center text-sm text-slate-400">
                    Часы ещё не распределены по функциям
                  </p>
                ) : (
                  <div style={{ width: "100%", height: 250 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={byFunction}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={(e: { name: string }) => e.name.slice(0, 14)}
                          labelLine={false}
                        >
                          {byFunction.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            fontSize: 12,
                            borderRadius: 8,
                            border: "1px solid #e2e8f0",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </ChartCard>

              <ChartCard title="Качество данных" icon="ShieldAlert">
                <div className="grid grid-cols-2 gap-2">
                  <DiagTile
                    label="Задач без ответственного"
                    n={diagCounts.noResponsible.length}
                    tone="danger"
                    onClick={() => nav("/cabinet/exec/assign")}
                  />
                  <DiagTile
                    label="Задач без срока"
                    n={diagCounts.noDue.length}
                    tone="warning"
                    onClick={() =>
                      setDrill({ title: "Задачи без срока", items: diagCounts.noDue })
                    }
                  />
                  <DiagTile
                    label="Задач без оценки"
                    n={diagCounts.noEstimate.length}
                    tone="warning"
                    onClick={() =>
                      setDrill({ title: "Задачи без трудоёмкости", items: diagCounts.noEstimate })
                    }
                  />
                  <DiagTile
                    label="Перегруженных"
                    n={diagCounts.overload.length}
                    tone="danger"
                    onClick={() => setOnlyOverload(true)}
                  />
                  <DiagTile
                    label="Без ёмкости"
                    n={diagCounts.noCapacity.length}
                    tone="warning"
                    onClick={() =>
                      setDrill({ title: "Сотрудники без ёмкости", items: diagCounts.noCapacity })
                    }
                  />
                  <DiagTile
                    label="Без компетенций"
                    n={diagCounts.noComp.length}
                    tone="warning"
                    onClick={() =>
                      setDrill({ title: "Сотрудники без компетенций", items: diagCounts.noComp })
                    }
                  />
                  <DiagTile
                    label="Истёк срок навыка"
                    n={diagCounts.expiredComp.length}
                    tone="warning"
                    onClick={() =>
                      setDrill({
                        title: "Истёк срок подтверждения компетенций",
                        items: diagCounts.expiredComp,
                      })
                    }
                  />
                  <DiagTile
                    label="Функций без владельца"
                    n={diagCounts.funcNoOwner.length}
                    tone="danger"
                    onClick={() => nav("/cabinet/exec/center")}
                  />
                  <DiagTile
                    label="Критичных без замены"
                    n={diagCounts.funcNoBackup.length}
                    tone="danger"
                    onClick={() => nav("/cabinet/exec/center")}
                  />
                  <DiagTile
                    label="Календарь"
                    n={diagCounts.calendar.length}
                    tone="warning"
                    onClick={() =>
                      setDrill({ title: "Производственный календарь", items: diagCounts.calendar })
                    }
                  />
                </div>
              </ChartCard>
            </div>
          </>
        )}

        {detail && (
          <Modal
            title={`${detail.name}: ${fmtWeek(detail.week)}`}
            subtitle="Задачи и часы недели"
            onClose={() => setDetail(null)}
            onSave={() => {
              nav(`/cabinet/exec/team/${detail.personId}`);
            }}
            saveLabel="Открыть сотрудника"
            wide
          >
            {!detail.rows.length ? (
              <p className="py-6 text-center text-sm text-slate-400">
                На эту неделю задач не назначено
              </p>
            ) : (
              <div className="space-y-2">
                {detail.rows.map((r) => (
                  <div
                    key={r.assignee_id}
                    className="rounded-lg border border-slate-200 p-3 flex flex-wrap items-start gap-2.5"
                  >
                    <RaciTag role={r.raci_role} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">{r.title}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-500">
                        {r.plan_title && <span>{r.plan_title}</span>}
                        {r.initiative_title && <span>{r.initiative_title}</span>}
                        {r.function_title && <span>{r.function_title}</span>}
                        {r.due_date && <span>срок {fmtDate(r.due_date)}</span>}
                        {r.is_manual && (
                          <span className="text-violet-600">часы заданы вручную</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[11px] text-slate-500">Часы недели</p>
                      <p className="text-sm font-semibold text-slate-900 tabular-nums">
                        {r.week_hours || r.plan_hours || 0}
                      </p>
                      <p className="text-[11px] text-slate-400">факт {r.fact_hours}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Modal>
        )}

        {drill && (
          <Modal
            title={drill.title}
            subtitle={`Найдено: ${drill.items.length}`}
            onClose={() => setDrill(null)}
            onSave={() => setDrill(null)}
            saveLabel="Закрыть"
            wide
          >
            {!drill.items.length ? (
              <p className="py-6 text-center text-sm text-slate-400">Проблем не найдено</p>
            ) : (
              <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
                {drill.items.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (d.entity === "person" && d.entity_id) {
                        nav(`/cabinet/exec/team/${d.entity_id}`);
                      } else if (d.entity === "step") {
                        nav("/cabinet/exec/planner");
                      } else if (d.entity === "function") {
                        nav("/cabinet/exec/center");
                      }
                    }}
                    className="w-full text-left rounded-lg border border-slate-200 p-2.5 hover:border-violet-300 transition-colors"
                  >
                    <p className="text-sm text-slate-900">{d.title}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{d.message}</p>
                  </button>
                ))}
              </div>
            )}
          </Modal>
        )}
      </div>
    </Layout>
  );
}

function ChartCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-1.5">
        <Icon name={icon} size={14} className="text-violet-600" />
        {title}
      </p>
      {children}
    </section>
  );
}

function DiagTile({
  label,
  n,
  tone,
  onClick,
}: {
  label: string;
  n: number;
  tone: "danger" | "warning";
  onClick: () => void;
}) {
  const ok = n === 0;
  const cls = ok
    ? "border-slate-200 bg-slate-50 text-slate-400"
    : tone === "danger"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <button
      onClick={onClick}
      disabled={ok}
      className={`rounded-lg border p-2.5 text-left transition-colors ${cls} ${
        ok ? "" : "hover:brightness-95"
      }`}
    >
      <p className="text-lg font-semibold tabular-nums">{n}</p>
      <p className="text-[11px] leading-tight mt-0.5">{label}</p>
    </button>
  );
}
