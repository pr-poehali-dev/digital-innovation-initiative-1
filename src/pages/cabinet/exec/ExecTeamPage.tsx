import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading, Metric } from "@/components/exec/ExecUI";
import { Avatar, LoadBadge, PersonWarnings, StatChip, Toggle } from "@/components/exec/team/TeamUI";
import PersonForm from "@/components/exec/team/PersonForm";
import { useStickyState } from "@/lib/useStickyState";
import {
  EMPLOYMENT_TYPE,
  PeopleRefs,
  TeamMember,
  WorkloadData,
  peopleApi,
  weekStart,
} from "@/lib/execPeopleApi";

type View = "cards" | "table";

export default function ExecTeamPage() {
  const nav = useNavigate();
  const [items, setItems] = useState<TeamMember[]>([]);
  const [refs, setRefs] = useState<PeopleRefs | null>(null);
  const [load, setLoad] = useState<WorkloadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useStickyState<View>("team_view", "cards");
  const [q, setQ] = useStickyState("team_q", "");
  const [fStatus, setFStatus] = useStickyState("team_status", "");
  const [fFunction, setFFunction] = useStickyState("team_function", "");
  const [fInitiative, setFInitiative] = useStickyState("team_initiative", "");
  const [fWarning, setFWarning] = useStickyState("team_warning", "");
  const [showArchived, setShowArchived] = useStickyState("team_archived", false);
  const [sort, setSort] = useStickyState("team_sort", "name");
  const [formOpen, setFormOpen] = useState(false);

  const reload = () => {
    setLoading(true);
    setError("");
    const from = weekStart(new Date());
    const to = new Date();
    to.setDate(to.getDate() + 27);
    Promise.all([
      peopleApi.people(),
      peopleApi.refs(),
      peopleApi.workload(from, to.toISOString().slice(0, 10)),
    ])
      .then(([p, r, w]) => {
        setItems(p);
        setRefs(r);
        setLoad(w);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(reload, []);

  // Текущая загрузка: ближайшая неделя
  const currentLoad = useMemo(() => {
    const map = new Map<number, { pct: number | null; state: string }>();
    if (!load) return map;
    const first = load.rows.length ? load.rows[0].week_start : "";
    const wk = load.rows.reduce((a, r) => (r.week_start < a ? r.week_start : a), first);
    load.rows.filter((r) => r.week_start === wk).forEach((r) => {
      map.set(r.person_id, { pct: r.load_pct, state: r.state });
    });
    return map;
  }, [load]);

  const overloadedIds = useMemo(() => {
    const s = new Set<number>();
    load?.rows.filter((r) => r.state === "overload").forEach((r) => s.add(r.person_id));
    return s;
  }, [load]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items.filter((p) => {
      const archived = (p.record_state || "active") === "archived";
      if (archived !== showArchived) return false;
      if (query) {
        const hay = `${p.display_name} ${p.position_title || ""} ${p.org_name || ""} ${
          p.competency_names || ""
        }`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      if (fStatus && (p.employment_status || "active") !== fStatus) return false;
      if (fFunction && !(p.function_ids || []).includes(Number(fFunction))) return false;
      if (fInitiative && !(p.initiative_ids || []).includes(Number(fInitiative))) return false;
      if (fWarning === "no_capacity" && p.hours_per_week) return false;
      if (fWarning === "no_competency" && p.competency_count) return false;
      if (fWarning === "no_assignment" && (p.open_steps || p.owned_functions)) return false;
      if (fWarning === "overload" && !overloadedIds.has(p.id)) return false;
      if (fWarning === "overdue" && !p.overdue_steps) return false;
      return true;
    });
  }, [items, q, fStatus, fFunction, fInitiative, fWarning, showArchived, overloadedIds]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const pct = (id: number) => currentLoad.get(id)?.pct ?? -1;
    if (sort === "load") arr.sort((a, b) => pct(b.id) - pct(a.id));
    else if (sort === "tasks") arr.sort((a, b) => b.open_steps - a.open_steps);
    else if (sort === "overdue") arr.sort((a, b) => b.overdue_steps - a.overdue_steps);
    else arr.sort((a, b) => a.display_name.localeCompare(b.display_name, "ru"));
    return arr;
  }, [filtered, sort, currentLoad]);

  const stats = useMemo(() => {
    const active = items.filter((p) => (p.record_state || "active") !== "archived");
    return {
      total: active.length,
      noCapacity: active.filter((p) => !p.hours_per_week).length,
      noCompetency: active.filter((p) => !p.competency_count).length,
      overloaded: active.filter((p) => overloadedIds.has(p.id)).length,
      noAssignment: active.filter((p) => !p.open_steps && !p.owned_functions).length,
      overdue: active.reduce((s, p) => s + (p.overdue_steps || 0), 0),
    };
  }, [items, overloadedIds]);

  const resetFilters = () => {
    setQ("");
    setFStatus("");
    setFFunction("");
    setFInitiative("");
    setFWarning("");
  };

  const hasFilters = q || fStatus || fFunction || fInitiative || fWarning;

  return (
    <Layout>
      <div className="max-w-[1400px] mx-auto px-4 py-6">
        <header className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Команда</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Единый справочник сотрудников, компетенций и загрузки
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
              onClick={() => setFormOpen(true)}
              className="px-3 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700 transition-colors inline-flex items-center gap-1.5"
            >
              <Icon name="UserPlus" size={15} />
              Добавить
            </button>
          </div>
        </header>

        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} onRetry={reload} />
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-5">
              <Metric
                label="Сотрудников"
                value={stats.total}
                icon="Users"
                onClick={() => { resetFilters(); setShowArchived(false); }}
              />
              <Metric
                label="Перегружены"
                value={stats.overloaded}
                tone={stats.overloaded ? "danger" : "default"}
                icon="TrendingUp"
                onClick={() => setFWarning("overload")}
              />
              <Metric
                label="Просроченных задач"
                value={stats.overdue}
                tone={stats.overdue ? "danger" : "default"}
                icon="CalendarX"
                onClick={() => setFWarning("overdue")}
              />
              <Metric
                label="Без ёмкости"
                value={stats.noCapacity}
                tone={stats.noCapacity ? "warning" : "default"}
                icon="Clock"
                onClick={() => setFWarning("no_capacity")}
              />
              <Metric
                label="Профиль не заполнен"
                value={stats.noCompetency}
                icon="Award"
                onClick={() => setFWarning("no_competency")}
              />
              <Metric
                label="Без назначений"
                value={stats.noAssignment}
                icon="CircleDashed"
                onClick={() => setFWarning("no_assignment")}
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3 mb-4">
              <div className="flex flex-col lg:flex-row gap-3">
                <div className="relative flex-1 min-w-0">
                  <Icon
                    name="Search"
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Поиск по ФИО, должности или компетенции"
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-violet-400"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={fStatus}
                    onChange={(e) => setFStatus(e.target.value)}
                    className="px-2.5 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:border-violet-400"
                  >
                    <option value="">Все статусы</option>
                    <option value="active">Работает</option>
                    <option value="leave">В отпуске</option>
                    <option value="left">Уволен</option>
                  </select>
                  <select
                    value={fFunction}
                    onChange={(e) => setFFunction(e.target.value)}
                    className="px-2.5 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 max-w-[180px] focus:outline-none focus:border-violet-400"
                  >
                    <option value="">Все функции</option>
                    {refs?.functions.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.code ? `${f.code}. ` : ""}
                        {f.title}
                      </option>
                    ))}
                  </select>
                  <select
                    value={fInitiative}
                    onChange={(e) => setFInitiative(e.target.value)}
                    className="px-2.5 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 max-w-[180px] focus:outline-none focus:border-violet-400"
                  >
                    <option value="">Все инициативы</option>
                    {refs?.initiatives.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.title}
                      </option>
                    ))}
                  </select>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    className="px-2.5 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:border-violet-400"
                  >
                    <option value="name">По алфавиту</option>
                    <option value="load">По загрузке</option>
                    <option value="tasks">По числу задач</option>
                    <option value="overdue">По просрочке</option>
                  </select>
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                    {(["cards", "table"] as View[]).map((v) => (
                      <button
                        key={v}
                        onClick={() => setView(v)}
                        className={`px-2.5 py-2 text-sm transition-colors ${
                          view === v ? "bg-violet-600 text-white" : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <Icon name={v === "cards" ? "LayoutGrid" : "List"} size={15} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-slate-100">
                <Toggle checked={showArchived} onChange={setShowArchived} label="Показать архивные" />
                {fWarning && (
                  <button
                    onClick={() => setFWarning("")}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-50 text-violet-700 text-xs border border-violet-200"
                  >
                    {fWarning === "overload" && "Только перегруженные"}
                    {fWarning === "overdue" && "С просрочкой"}
                    {fWarning === "no_capacity" && "Без ёмкости"}
                    {fWarning === "no_competency" && "Профиль компетенций не заполнен"}
                    {fWarning === "no_assignment" && "Без назначений"}
                    <Icon name="X" size={11} />
                  </button>
                )}
                {hasFilters && (
                  <button
                    onClick={resetFilters}
                    className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    Сбросить фильтры
                  </button>
                )}
                <span className="text-xs text-slate-400 ml-auto">
                  Найдено: {sorted.length}
                </span>
              </div>
            </div>

            {!sorted.length ? (
              <Empty
                text={hasFilters ? "Никто не подходит под фильтры" : "Сотрудников пока нет"}
                icon="Users"
              />
            ) : view === "cards" ? (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {sorted.map((p) => {
                  const cl = currentLoad.get(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => nav(`/cabinet/exec/team/${p.id}`)}
                      className="text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-violet-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start gap-3">
                        <Avatar name={p.display_name} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {p.display_name}
                          </p>
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            {p.position_title || "Должность не указана"}
                          </p>
                        </div>
                        {cl && <LoadBadge pct={cl.pct} state={cl.state} />}
                      </div>
                      {p.functional_role_count > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {p.functional_role_titles.split(", ").map((t) => (
                            <span
                              key={t}
                              title={t}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border border-violet-200 bg-violet-50 text-violet-700 max-w-[160px] truncate"
                            >
                              <Icon name="ShieldCheck" size={10} />
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-3 mt-3">
                        <StatChip icon="ListChecks" value={p.open_steps} label="Открытых задач" />
                        {p.overdue_steps > 0 && (
                          <StatChip
                            icon="CalendarX"
                            value={p.overdue_steps}
                            label="Просрочено"
                            tone="danger"
                          />
                        )}
                        <StatChip icon="Award" value={p.competency_count} label="Компетенций" />
                        {p.owned_functions > 0 && (
                          <StatChip
                            icon="Crown"
                            value={p.owned_functions}
                            label="Владелец функций"
                            tone="success"
                          />
                        )}
                        {p.hours_per_week ? (
                          <StatChip
                            icon="Clock"
                            value={`${p.hours_per_week} ч`}
                            label="Ёмкость в неделю"
                          />
                        ) : null}
                      </div>
                      <PersonWarnings p={p} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[860px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                        <th className="text-left font-medium px-3 py-2.5">Сотрудник</th>
                        <th className="text-left font-medium px-3 py-2.5">Должность</th>
                        <th className="text-left font-medium px-3 py-2.5">Занятость</th>
                        <th className="text-center font-medium px-3 py-2.5">Ёмкость</th>
                        <th className="text-center font-medium px-3 py-2.5">Загрузка</th>
                        <th className="text-center font-medium px-3 py-2.5">Задач</th>
                        <th className="text-center font-medium px-3 py-2.5">Просрочка</th>
                        <th className="text-center font-medium px-3 py-2.5">Навыков</th>
                        <th className="text-center font-medium px-3 py-2.5">Функций</th>
                        <th className="text-center font-medium px-3 py-2.5">Доп. роли</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((p) => {
                        const cl = currentLoad.get(p.id);
                        return (
                          <tr
                            key={p.id}
                            onClick={() => nav(`/cabinet/exec/team/${p.id}`)}
                            className="border-b border-slate-100 last:border-0 hover:bg-violet-50/40 cursor-pointer transition-colors"
                          >
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <Avatar name={p.display_name} size={26} />
                                <span className="font-medium text-slate-900">{p.display_name}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-slate-600">
                              {p.position_title || "—"}
                            </td>
                            <td className="px-3 py-2.5 text-slate-600 text-xs">
                              {EMPLOYMENT_TYPE[p.employment_type || ""] || "—"}
                            </td>
                            <td className="px-3 py-2.5 text-center tabular-nums text-slate-600">
                              {p.hours_per_week ? `${p.hours_per_week} ч` : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {cl ? <LoadBadge pct={cl.pct} state={cl.state} /> : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-center tabular-nums">{p.open_steps}</td>
                            <td className="px-3 py-2.5 text-center tabular-nums">
                              {p.overdue_steps ? (
                                <span className="text-red-600 font-medium">{p.overdue_steps}</span>
                              ) : (
                                <span className="text-slate-300">0</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center tabular-nums">
                              {p.competency_count || <span className="text-slate-300">0</span>}
                            </td>
                            <td className="px-3 py-2.5 text-center tabular-nums">
                              {p.owned_functions || <span className="text-slate-300">0</span>}
                            </td>
                            <td className="px-3 py-2.5 text-center" title={p.functional_role_titles}>
                              {p.functional_role_count ? (
                                <span className="inline-flex items-center gap-1 text-violet-700 font-medium tabular-nums">
                                  <Icon name="ShieldCheck" size={12} />
                                  {p.functional_role_count}
                                </span>
                              ) : (
                                <span className="text-slate-300">0</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {formOpen && (
          <PersonForm
            onClose={() => setFormOpen(false)}
            onSaved={(id) => {
              setFormOpen(false);
              nav(`/cabinet/exec/team/${id}`);
            }}
          />
        )}
      </div>
    </Layout>
  );
}