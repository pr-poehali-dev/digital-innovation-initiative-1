import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading, fmtDate } from "@/components/exec/ExecUI";
import { Avatar, LoadBadge, RaciTag, Toggle } from "@/components/exec/team/TeamUI";
import PersonForm from "@/components/exec/team/PersonForm";
import CompetencyTab from "@/components/exec/team/CompetencyTab";
import WorkloadTab from "@/components/exec/team/WorkloadTab";
import ProfileTab from "@/components/exec/team/ProfileTab";
import {
  EMPLOYMENT_TYPE,
  PeopleRefs,
  PersonDetail,
  RACI_ROLE,
  peopleApi,
  weekStart,
} from "@/lib/execPeopleApi";

const TABS = [
  { id: "main", title: "Основное", icon: "User" },
  { id: "functions", title: "Функции и роли", icon: "Network" },
  { id: "competencies", title: "Компетенции", icon: "Award" },
  { id: "profile", title: "Опыт и образование", icon: "GraduationCap" },
  { id: "workload", title: "Загрузка", icon: "CalendarRange" },
  { id: "tasks", title: "Задачи", icon: "ListChecks" },
  { id: "results", title: "Результаты", icon: "Trophy" },
];

export default function ExecPersonDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const pid = Number(id);
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [refs, setRefs] = useState<PeopleRefs | null>(null);
  const [load, setLoad] = useState<{ pct: number | null; state: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("main");
  const [editOpen, setEditOpen] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const reload = () => {
    setError("");
    const from = weekStart(new Date());
    const to = new Date();
    to.setDate(to.getDate() + 6);
    Promise.all([
      peopleApi.person(pid),
      peopleApi.refs(),
      peopleApi.workload(from, to.toISOString().slice(0, 10), [pid]),
    ])
      .then(([p, r, w]) => {
        setPerson(p);
        setRefs(r);
        const row = w.rows[0];
        setLoad(row ? { pct: row.load_pct, state: row.state } : null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(reload, [pid]);

  const openSteps = useMemo(
    () => (person?.steps || []).filter((s) => s.status !== "done"),
    [person],
  );
  const doneSteps = useMemo(
    () => (person?.steps || []).filter((s) => s.status === "done"),
    [person],
  );
  const overdue = useMemo(() => openSteps.filter((s) => s.is_overdue), [openSteps]);

  if (loading) {
    return (
      <Layout>
        <Loading />
      </Layout>
    );
  }
  if (error || !person) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-10">
          <ErrorBox message={error || "Сотрудник не найден"} onRetry={reload} />
        </div>
      </Layout>
    );
  }

  const planTotal = person.steps.reduce((s, x) => s + Number(x.plan_hours || 0), 0);
  const factTotal = person.steps.reduce((s, x) => s + Number(x.fact_hours || 0), 0);

  return (
    <Layout>
      <div className="max-w-[1200px] mx-auto px-4 py-6">
        <button
          onClick={() => nav("/cabinet/exec/team")}
          className="text-sm text-slate-500 hover:text-slate-900 transition-colors inline-flex items-center gap-1.5 mb-4"
        >
          <Icon name="ArrowLeft" size={15} />
          Команда
        </button>

        <header className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 mb-4">
          <div className="flex flex-wrap items-start gap-4">
            <Avatar name={person.display_name} size={52} />
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold text-slate-900">{person.display_name}</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {person.position_title || "Должность не указана"}
                {person.org_name ? ` · ${person.org_name}` : ""}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2.5 text-xs text-slate-500">
                {person.email && (
                  <span className="inline-flex items-center gap-1">
                    <Icon name="Mail" size={12} />
                    {person.email}
                  </span>
                )}
                {person.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Icon name="Phone" size={12} />
                    {person.phone}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Icon name="Briefcase" size={12} />
                  {EMPLOYMENT_TYPE[person.employment_type || ""] || "Не указан"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {load && (
                <div className="text-right">
                  <p className="text-[11px] text-slate-500 mb-1">Загрузка недели</p>
                  <LoadBadge pct={load.pct} state={load.state} size="lg" />
                </div>
              )}
              <button
                onClick={() => setEditOpen(true)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5"
              >
                <Icon name="Pencil" size={14} />
                <span className="hidden sm:inline">Изменить</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4 pt-4 border-t border-slate-100">
            <Stat label="Открытых задач" value={openSteps.length} onClick={() => setTab("tasks")} />
            <Stat
              label="Просрочено"
              value={overdue.length}
              tone={overdue.length ? "danger" : "default"}
              onClick={() => setTab("tasks")}
            />
            <Stat
              label="Компетенций"
              value={person.competencies.length}
              tone={person.competencies.length ? "default" : "warning"}
              onClick={() => setTab("competencies")}
            />
            <Stat
              label="Функций"
              value={person.functions.length}
              onClick={() => setTab("functions")}
            />
            <Stat
              label="План / факт"
              value={`${planTotal} / ${factTotal} ч`}
              onClick={() => setTab("results")}
            />
          </div>
        </header>

        <div className="border-b border-slate-200 mb-4 overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors inline-flex items-center gap-1.5 ${
                  tab === t.id
                    ? "border-violet-600 text-violet-700 font-medium"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <Icon name={t.icon} size={14} />
                {t.title}
              </button>
            ))}
          </div>
        </div>

        {tab === "main" && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <Row label="ФИО" value={person.display_name} />
            <Row label="Должность" value={person.position_title} />
            <Row label="Подразделение" value={person.org_name} />
            <Row label="Электронная почта" value={person.email} />
            <Row label="Телефон" value={person.phone} />
            <Row
              label="Формат занятости"
              value={EMPLOYMENT_TYPE[person.employment_type || ""] || null}
            />
            <Row
              label="Статус"
              value={
                { active: "Работает", leave: "В отпуске", left: "Уволен" }[
                  person.employment_status
                ] || person.employment_status
              }
            />
            <Row label="Примечание" value={person.note} />
          </div>
        )}

        {tab === "functions" && (
          <div className="space-y-4">
            {!person.functions.length ? (
              <Empty text="Сотрудник не назначен ни на одну функцию" icon="Network" />
            ) : (
              <div className="space-y-2">
                {person.functions.map((f) => (
                  <div
                    key={f.id}
                    className="rounded-lg border border-slate-200 bg-white p-3 flex flex-wrap items-center gap-3"
                  >
                    <RaciTag role={f.raci_role} backup={f.is_backup} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        {f.function_code ? `${f.function_code}. ` : ""}
                        {f.function_title}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {RACI_ROLE[f.raci_role]?.title}
                        {f.is_backup ? " (замещающий)" : ""} · с {fmtDate(f.valid_from)}
                      </p>
                    </div>
                    {f.criticality === "high" && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] border border-red-200 bg-red-50 text-red-700">
                        Критичная
                      </span>
                    )}
                    <button
                      onClick={() => nav("/cabinet/exec/center")}
                      className="text-slate-400 hover:text-violet-600 transition-colors"
                      title="Открыть функцию"
                    >
                      <Icon name="ExternalLink" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">
                Назначение на функции выполняется в разделе Центра через матрицу RACI.
              </p>
              <button
                onClick={() => nav("/cabinet/exec/center")}
                className="mt-2 text-xs text-violet-600 hover:text-violet-700 transition-colors inline-flex items-center gap-1"
              >
                Перейти в Центр
                <Icon name="ArrowRight" size={12} />
              </button>
            </div>
          </div>
        )}

        {tab === "competencies" && (
          <CompetencyTab person={person} refs={refs} onChanged={reload} />
        )}

        {tab === "profile" && <ProfileTab person={person} refs={refs} onChanged={reload} />}

        {tab === "workload" && <WorkloadTab person={person} onChanged={reload} />}

        {tab === "tasks" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                Открытых: <span className="font-medium text-slate-700">{openSteps.length}</span>
                {overdue.length > 0 && (
                  <span className="text-red-600 ml-2">просрочено {overdue.length}</span>
                )}
              </p>
              <Toggle checked={showDone} onChange={setShowDone} label="Показать завершённые" />
            </div>
            {!(showDone ? doneSteps : openSteps).length ? (
              <Empty
                text={showDone ? "Завершённых задач нет" : "Открытых задач нет"}
                icon="ListChecks"
              />
            ) : (
              <div className="space-y-2">
                {(showDone ? doneSteps : openSteps).map((s) => (
                  <div
                    key={s.assignee_id}
                    className={`rounded-lg border bg-white p-3 ${
                      s.is_overdue ? "border-red-200" : "border-slate-200"
                    }`}
                  >
                    <div className="flex flex-wrap items-start gap-2.5">
                      <RaciTag role={s.raci_role} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">{s.title}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-500">
                          {s.plan_title && <span>{s.plan_title}</span>}
                          {s.initiative_title && (
                            <button
                              onClick={() => nav(`/cabinet/exec/initiatives/${s.initiative_id}`)}
                              className="text-violet-600 hover:underline"
                            >
                              {s.initiative_title}
                            </button>
                          )}
                          {s.due_date && (
                            <span className={s.is_overdue ? "text-red-600 font-medium" : ""}>
                              срок {fmtDate(s.due_date)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-slate-500">План / факт</p>
                        <p className="text-sm font-medium text-slate-900 tabular-nums">
                          {s.plan_hours ?? "—"} / {s.fact_hours} ч
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "results" && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Завершено задач</p>
                <p className="text-2xl font-semibold text-slate-900 mt-1">{doneSteps.length}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Плановые часы</p>
                <p className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                  {planTotal}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Фактические часы</p>
                <p className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                  {factTotal}
                </p>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-900 mb-2">Записи трудозатрат</p>
              {!person.time_entries.length ? (
                <Empty text="Трудозатраты не вносились" icon="Timer" />
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[520px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                          <th className="text-left font-medium px-3 py-2">Дата</th>
                          <th className="text-left font-medium px-3 py-2">Задача</th>
                          <th className="text-right font-medium px-3 py-2">Часы</th>
                          <th className="text-left font-medium px-3 py-2">Комментарий</th>
                        </tr>
                      </thead>
                      <tbody>
                        {person.time_entries.map((t) => (
                          <tr key={t.id} className="border-b border-slate-100 last:border-0">
                            <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                              {fmtDate(t.work_date)}
                            </td>
                            <td className="px-3 py-2 text-slate-900">{t.step_title}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">
                              {t.hours}
                            </td>
                            <td className="px-3 py-2 text-slate-500 text-xs">{t.comment || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {editOpen && (
          <PersonForm
            person={person}
            onClose={() => setEditOpen(false)}
            onSaved={() => {
              setEditOpen(false);
              reload();
            }}
          />
        )}
      </div>
    </Layout>
  );
}

function Stat({
  label,
  value,
  tone = "default",
  onClick,
}: {
  label: string;
  value: number | string;
  tone?: "default" | "danger" | "warning";
  onClick?: () => void;
}) {
  const cls = {
    default: "text-slate-900",
    danger: "text-red-600",
    warning: "text-amber-600",
  }[tone];
  return (
    <button onClick={onClick} className="text-left group">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`text-lg font-semibold mt-0.5 tabular-nums ${cls} group-hover:underline`}>
        {value}
      </p>
    </button>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-wrap gap-2 py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500 w-44 flex-shrink-0">{label}</span>
      <span className="text-sm text-slate-900">{value || "—"}</span>
    </div>
  );
}
