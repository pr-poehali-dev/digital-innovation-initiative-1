import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading, fmtDate } from "@/components/exec/ExecUI";
import {
  execResourcesApi, CapacityAssignmentRow, ResourceAssignment, ResourceRequirement, ResourceConflicts,
} from "@/lib/execResourcesApi";
import { ScaleKind } from "@/lib/timeScale";

const MONTHS_SHORT = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
type ResourceMode = "schedule" | "people" | "roles" | "deficit";
const MODES: ResourceMode[] = ["schedule", "people", "roles", "deficit"];
const MODE_LABEL: Record<ResourceMode, string> = { schedule: "Расписание", people: "Люди", roles: "Роли", deficit: "Дефицит" };
const RES_SCALES: ScaleKind[] = ["week", "month", "quarter", "year"];

/** Ресурсная шкала проекта: люди, роли, загрузка и дефицит на той же
 * временной модели, что и Гант — без копирования данных в новые таблицы.
 * Источники: exec_resource_assignment, exec_resource_requirement,
 * exec_capacity_plan (те же, что во вкладке «Команда» проекта). Первый
 * выпуск — только просмотр и явное «предупреждение», без автоматических
 * кадровых решений.
 *
 * Режим/год/масштаб хранятся в URL (r_mode/r_year/r_scale), а не только в
 * useState — обновление страницы (F5) не должно сбрасывать выбранное. */
export default function ResourceTimelineView({ projectId }: { projectId: number }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlMode = searchParams.get("r_mode") as ResourceMode | null;
  const mode: ResourceMode = urlMode && MODES.includes(urlMode) ? urlMode : "schedule";
  const urlYear = Number(searchParams.get("r_year"));
  const year = urlYear && !Number.isNaN(urlYear) ? urlYear : new Date().getFullYear();
  const urlScale = searchParams.get("r_scale") as ScaleKind | null;
  const scale: ScaleKind = urlScale && RES_SCALES.includes(urlScale) ? urlScale : "month";

  const setMode = (m: ResourceMode) => {
    const next = new URLSearchParams(searchParams);
    next.set("r_mode", m);
    setSearchParams(next, { replace: true });
  };
  const setYear = (y: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("r_year", String(y));
    setSearchParams(next, { replace: true });
  };
  const setScale = (s: ScaleKind) => {
    const next = new URLSearchParams(searchParams);
    next.set("r_scale", s);
    setSearchParams(next, { replace: true });
  };

  const [capacity, setCapacity] = useState<CapacityAssignmentRow[]>([]);
  const [assignments, setAssignments] = useState<ResourceAssignment[]>([]);
  const [requirements, setRequirements] = useState<ResourceRequirement[]>([]);
  const [conflicts, setConflicts] = useState<ResourceConflicts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = () => {
    setLoading(true);
    setError("");
    Promise.all([
      execResourcesApi.capacityPlan("project", projectId, year),
      execResourcesApi.assignments("project", projectId),
      execResourcesApi.requirements("project", projectId),
      execResourcesApi.resourceConflicts("project", projectId),
    ])
      .then(([cap, asg, req, conf]) => {
        setCapacity(cap.items); setAssignments(asg.items); setRequirements(req.items); setConflicts(conf);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(reload, [projectId, year]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;

  const deficitCount =
    (conflicts?.open_roles.length || 0) + (conflicts?.overloaded_people.length || 0) +
    (conflicts?.overlapping_assignments.length || 0) + (conflicts?.assignment_outside_period.length || 0) +
    (conflicts?.tasks_without_owner.length || 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex bg-slate-100 rounded-lg p-0.5">
          {(Object.keys(MODE_LABEL) as ResourceMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                mode === m ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {m === "deficit" && deficitCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">{deficitCount}</span>
              )}
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
        {mode === "schedule" && (
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              {(["week", "month", "quarter", "year"] as ScaleKind[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setScale(s)}
                  className={`px-2 py-1 text-[11px] rounded-md ${scale === s ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}
                >
                  {{ week: "Неделя", month: "Месяц", quarter: "Квартал", year: "Год" }[s]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setYear(year - 1)} className="w-6 h-6 rounded hover:bg-slate-100 flex items-center justify-center">
                <Icon name="ChevronLeft" size={14} />
              </button>
              <span className="text-sm font-semibold w-12 text-center">{year}</span>
              <button onClick={() => setYear(year + 1)} className="w-6 h-6 rounded hover:bg-slate-100 flex items-center justify-center">
                <Icon name="ChevronRight" size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {mode === "schedule" && <ScheduleHeatmap rows={capacity} scale={scale} />}
      {mode === "people" && <PeopleMode assignments={assignments} />}
      {mode === "roles" && <RolesMode assignments={assignments} requirements={requirements} />}
      {mode === "deficit" && <DeficitMode conflicts={conflicts} />}
    </div>
  );
}

// ============ РАСПИСАНИЕ: ТЕПЛОВАЯ КАРТА ЗАГРУЗКИ ============

function loadStatus(pct: number | null): { label: string; icon: string; cls: string } {
  if (pct === null || pct === undefined) return { label: "нет данных", icon: "Minus", cls: "bg-slate-50 text-slate-400" };
  if (pct === 0) return { label: "доступен", icon: "CircleDashed", cls: "bg-slate-50 text-slate-500" };
  if (pct > 100) return { label: "перегрузка", icon: "TriangleAlert", cls: "bg-red-100 text-red-700" };
  if (pct >= 80) return { label: "оптимальная", icon: "CircleCheck", cls: "bg-emerald-100 text-emerald-700" };
  return { label: "загрузка", icon: "Circle", cls: "bg-violet-50 text-violet-600" };
}

/** Помесячная тепловая карта план/факт загрузки по назначениям проекта,
 * с признаком перегрузки по ВСЕМ проектам человека (не только этому).
 * Масштаб недели/квартала/года — группировка того же месячного источника
 * (exec_capacity_plan хранит помесячно) в более крупные/мелкие подписи,
 * без изменения формата данных. */
function ScheduleHeatmap({ rows, scale }: { rows: CapacityAssignmentRow[]; scale: ScaleKind }) {
  const [detail, setDetail] = useState<{ row: CapacityAssignmentRow; month: number } | null>(null);

  if (!rows.length) return <Empty text="Команда пока не сформирована — добавьте участников во вкладке «Команда»" icon="CalendarRange" />;

  // Масштаб "неделя" в первом выпуске показывает тот же помесячный ряд
  // с пометкой — недельной детализации в источнике (exec_capacity_plan)
  // пока нет, подменять её выдуманными числами нельзя.
  const weekNotice = scale === "week";

  return (
    <div className="space-y-2">
      {weekNotice && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 flex items-center gap-1.5">
          <Icon name="Info" size={13} /> Недельной детализации загрузки пока нет — показаны те же месячные значения плана/факта.
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="text-xs w-full">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-2 sticky left-0 bg-white">Человек / роль</th>
              {MONTHS_SHORT.map((m) => <th key={m} className="px-1 py-2 text-center font-medium">{m}</th>)}
              <th className="px-2 py-2 text-center font-medium">Год, ср.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.assignment_id} className="border-b border-slate-100">
                <td className="py-1.5 px-2 sticky left-0 bg-white whitespace-nowrap">
                  {r.person_name || r.role_title_ref || r.role_title || "—"}
                  {r.is_vacant && <span className="ml-1 text-amber-600">(вакансия)</span>}
                </td>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                  const cell = r.months[String(m)];
                  const overloadAllProjects = (r.overload_by_month[String(m)] || 0) > 100;
                  const st = loadStatus(cell?.plan_load_pct ?? null);
                  return (
                    <td key={m} className="px-1 py-1.5 text-center">
                      <button
                        onClick={() => setDetail({ row: r, month: m })}
                        className={`w-full rounded px-1 py-1 flex flex-col items-center gap-0.5 ${overloadAllProjects ? "bg-red-100 text-red-700 ring-1 ring-red-300" : st.cls}`}
                        title={overloadAllProjects ? "Перегрузка по сумме всех проектов этого человека в этом месяце" : st.label}
                      >
                        <Icon name={overloadAllProjects ? "TriangleAlert" : st.icon} size={10} />
                        <span className="font-medium">{cell?.plan_load_pct ?? 0}%</span>
                      </button>
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-center font-semibold">{r.year_avg_plan_pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
        <LegendItem icon="CircleDashed" cls="text-slate-500" label="доступен (0%)" />
        <LegendItem icon="Circle" cls="text-violet-600" label="загрузка 1–79%" />
        <LegendItem icon="CircleCheck" cls="text-emerald-700" label="оптимальная 80–100%" />
        <LegendItem icon="TriangleAlert" cls="text-red-700" label="перегрузка >100%" />
        <LegendItem icon="Minus" cls="text-slate-400" label="нет данных" />
      </div>

      {detail && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-xl p-4 max-w-sm w-full space-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm">{MONTHS_SHORT[detail.month - 1]} — {detail.row.person_name || detail.row.role_title || "Вакансия"}</h4>
              <button onClick={() => setDetail(null)}><Icon name="X" size={16} /></button>
            </div>
            <p className="text-xs text-slate-500">Загрузка создаётся назначением на этот проект. Чтобы увидеть загрузку по другим проектам — откройте «Загрузка команды» в общем портфеле.</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded bg-slate-50 p-2"><p className="text-slate-400">План</p><p className="font-semibold">{detail.row.months[String(detail.month)]?.plan_load_pct ?? 0}%</p></div>
              <div className="rounded bg-slate-50 p-2"><p className="text-slate-400">Факт</p><p className="font-semibold">{detail.row.months[String(detail.month)]?.fact_load_pct ?? "—"}</p></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LegendItem({ icon, cls, label }: { icon: string; cls: string; label: string }) {
  return <span className="inline-flex items-center gap-1"><Icon name={icon} size={11} className={cls} /> {label}</span>;
}

// ============ ЛЮДИ ============

function PeopleMode({ assignments }: { assignments: ResourceAssignment[] }) {
  if (!assignments.length) return <Empty text="Участники не назначены" icon="Users" />;
  return (
    <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
      {assignments.map((a) => (
        <div key={a.id} className="p-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-medium text-slate-800">{a.person_name || (a.is_vacant ? "Вакансия" : "Без привязки")}</span>
              {a.is_external && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">внешний</span>}
              {a.is_vacant && <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">вакансия</span>}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{a.role_title_ref || a.role_title || "—"} · {a.position_title || a.project_role}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-sm font-semibold text-slate-700">{a.plan_load_pct}%</p>
            <p className="text-[10px] text-slate-400">{fmtDate(a.period_start)} — {fmtDate(a.period_end)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============ РОЛИ ============

function RolesMode({ assignments, requirements }: { assignments: ResourceAssignment[]; requirements: ResourceRequirement[] }) {
  const filledRoles = assignments.filter((a) => !a.is_vacant);
  const vacantRoles = assignments.filter((a) => a.is_vacant);
  const openRequirements = requirements.filter((r) => !["closed", "cancelled"].includes(r.status));

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold text-slate-500 mb-2">Закрытые роли ({filledRoles.length})</h4>
        {filledRoles.length === 0 ? <Empty text="Нет закрытых ролей" icon="UserCheck" /> : (
          <div className="grid gap-2">
            {filledRoles.map((a) => (
              <div key={a.id} className="rounded-lg border border-slate-200 bg-white p-2.5 flex items-center justify-between text-sm">
                <span>{a.role_title_ref || a.role_title}</span>
                <span className="text-slate-500 text-xs">{a.person_name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <h4 className="text-xs font-semibold text-slate-500 mb-2">Вакантные роли ({vacantRoles.length})</h4>
        {vacantRoles.length === 0 ? <Empty text="Нет вакантных ролей" icon="UserX" /> : (
          <div className="grid gap-2">
            {vacantRoles.map((a) => (
              <div key={a.id} className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 flex items-center justify-between text-sm">
                <span>{a.role_title_ref || a.role_title}</span>
                <Icon name="UserX" size={14} className="text-amber-600" />
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <h4 className="text-xs font-semibold text-slate-500 mb-2">Незакрытые потребности ({openRequirements.length})</h4>
        {openRequirements.length === 0 ? <Empty text="Все ресурсные потребности закрыты" icon="CircleCheck" /> : (
          <div className="grid gap-2">
            {openRequirements.map((r) => (
              <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-2.5 flex items-center justify-between text-sm">
                <span>{r.role_title_ref || r.role_title}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.is_overdue ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"}`}>
                  {r.is_overdue ? "просрочено" : r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============ ДЕФИЦИТ (расчёт-предупреждение) ============

function DeficitMode({ conflicts }: { conflicts: ResourceConflicts | null }) {
  const navigate = useNavigate();
  if (!conflicts) return null;
  const nothing =
    !conflicts.overloaded_people.length && !conflicts.overlapping_assignments.length &&
    !conflicts.open_roles.length && !conflicts.assignment_outside_period.length &&
    !conflicts.tasks_without_owner.length;

  if (nothing) return <Empty text="Конфликтов ресурсов не обнаружено" icon="ShieldCheck" />;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-500 flex items-center gap-1.5">
        <Icon name="Info" size={13} /> Это расчёт-предупреждение — ничего не переназначено автоматически, решение принимаете вы.
      </div>

      <ConflictSection title="Перегруженные люди" icon="TriangleAlert" tone="danger" items={conflicts.overloaded_people} empty="Нет перегруженных">
        {(p) => (
          <>
            <span className="font-medium">{p.person_name}</span>
            <span className="text-red-600 font-semibold">{p.total_load_pct}% суммарно</span>
          </>
        )}
      </ConflictSection>

      <ConflictSection title="Пересекающиеся назначения" icon="CalendarClock" tone="danger" items={conflicts.overlapping_assignments} empty="Нет пересечений">
        {(o) => (
          <>
            <span className="font-medium">{o.person_name}</span>
            <span className="text-xs text-slate-500">{fmtDate(o.start_a)}–{fmtDate(o.end_a)} и {fmtDate(o.start_b)}–{fmtDate(o.end_b)}</span>
          </>
        )}
      </ConflictSection>

      <ConflictSection title="Поиск должен был начаться" icon="Clock" tone="warning" items={conflicts.search_should_have_started} empty="Все своевременно">
        {(r) => (
          <>
            <span className="font-medium">{r.role_title_ref || r.role_title}</span>
            <span className="text-xs text-amber-600">нужен к {fmtDate(r.need_by_date)}</span>
          </>
        )}
      </ConflictSection>

      <ConflictSection title="Без подтверждённого финансирования" icon="Banknote" tone="warning" items={conflicts.unfunded_requirements} empty="Всё профинансировано">
        {(r) => <span className="font-medium">{r.role_title_ref || r.role_title}</span>}
      </ConflictSection>

      <ConflictSection title="Назначение за пределами периода проекта" icon="CalendarX" tone="warning" items={conflicts.assignment_outside_period} empty="Все назначения в периоде">
        {(a) => (
          <>
            <span className="font-medium">{a.person_name || "—"}</span>
            <span className="text-xs text-slate-500">{fmtDate(a.period_start)}–{fmtDate(a.period_end)} vs проект {fmtDate(a.project_plan_start)}–{fmtDate(a.project_plan_end)}</span>
          </>
        )}
      </ConflictSection>

      <ConflictSection title="Задачи без ответственного" icon="UserX" tone="warning" items={conflicts.tasks_without_owner} empty="У всех задач есть ответственный">
        {(t) => (
          <button onClick={() => navigate(`?tab=tasks`)} className="font-medium hover:text-violet-700 text-left">{t.title}</button>
        )}
      </ConflictSection>
    </div>
  );
}

function ConflictSection<T>({
  title, icon, tone, items, empty, children,
}: { title: string; icon: string; tone: "danger" | "warning"; items: T[]; empty: string; children: (item: T) => React.ReactNode }) {
  const toneCls = tone === "danger" ? "text-red-600" : "text-amber-600";
  return (
    <div>
      <h4 className={`text-xs font-semibold mb-2 flex items-center gap-1.5 ${items.length ? toneCls : "text-slate-400"}`}>
        <Icon name={icon} size={13} /> {title} ({items.length})
      </h4>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400 pl-5">{empty}</p>
      ) : (
        <div className="grid gap-1.5">
          {items.map((item, i) => (
            <div key={i} className="rounded-lg border border-slate-200 bg-white p-2 flex items-center justify-between gap-2 text-sm">
              {children(item)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}