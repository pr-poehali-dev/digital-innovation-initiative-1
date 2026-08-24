import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading } from "@/components/exec/ExecUI";
import {
  CENTER_STATUS,
  CRITICALITY,
  ModelData,
  PARTICIPATION_FORMAT,
  Participation,
  StaffingCategory,
  TargetFunction,
  UndocumentedPerson,
  WORK_CATEGORY,
  centerApi,
} from "@/lib/execCenterApi";

type SubTab = "current" | "target" | "staffing" | "risks";

const TABS: { id: SubTab; title: string; icon: string }[] = [
  { id: "current", title: "Текущая команда", icon: "UsersRound" },
  { id: "target", title: "Целевая структура", icon: "Building2" },
  { id: "staffing", title: "Расчёт численности", icon: "Calculator" },
  { id: "risks", title: "Риски статус-кво", icon: "ShieldAlert" },
];

const RISK_LEVEL: Record<string, { title: string; cls: string }> = {
  high: { title: "Высокий", cls: "bg-red-50 text-red-700 border-red-200" },
  medium: { title: "Средний", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  low: { title: "Низкий", cls: "bg-slate-100 text-slate-600 border-slate-200" },
};

export default function ExecCenterModelPage() {
  const nav = useNavigate();
  const [data, setData] = useState<ModelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<SubTab>("current");

  const reload = () => {
    setLoading(true);
    setError("");
    centerApi
      .model()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(reload, []);

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
  if (!data?.center) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <Icon name="Building2" size={32} className="text-slate-300 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-slate-900">Центр ещё не создан</h1>
          <p className="text-sm text-slate-500 mt-1.5">
            Сначала создайте паспорт Центра — модель распределённой команды строится на нём.
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

  const st = CENTER_STATUS[data.center.status] || CENTER_STATUS.modeling;

  return (
    <Layout>
      <div className="max-w-[1300px] mx-auto px-4 py-6">
        <header className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold text-slate-900">
                Модель Центра: текущая деятельность и целевая структура
              </h1>
              <span className={`text-[11px] px-2 py-0.5 rounded border font-medium ${st.cls}`}>
                {st.title}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              {data.center.title}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => nav("/cabinet/exec/model/wizard")}
              className="px-3 py-2 rounded-lg border border-violet-300 bg-violet-50 text-violet-700 text-sm hover:bg-violet-100 transition-colors inline-flex items-center gap-1.5"
            >
              <Icon name="Wand2" size={15} />
              Мастер заполнения
            </button>
            <button
              onClick={() => nav("/cabinet/exec/dashboard")}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5"
            >
              <Icon name="LayoutDashboard" size={15} />
              Сводка Центра
            </button>
            <button
              onClick={() => nav("/cabinet/exec/center-case")}
              className="px-3 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700 transition-colors inline-flex items-center gap-1.5"
            >
              <Icon name="FileText" size={15} />
              Обоснование
            </button>
          </div>
        </header>

        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 mb-5 flex items-start gap-2">
          <Icon name="Info" size={15} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700">
            Центр пока в статусе «{st.title.toLowerCase()}», но уже работает как распределённая
            модель: сотрудники из разных подразделений выполняют функции и задачи в его
            интересах. Здесь видно, кто фактически работает сейчас, какая структура нужна после
            официального создания и чем обоснована потребность в штате.
          </p>
        </div>

        <div className="border-b border-slate-200 mb-5 overflow-x-auto">
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

        {tab === "current" && (
          <CurrentTeamTab
            participation={data.current_team.participation}
            undocumented={data.current_team.undocumented}
            onOpenPerson={(id) => nav(`/cabinet/exec/team/${id}`)}
          />
        )}
        {tab === "target" && (
          <TargetTab functions={data.target.functions} roles={data.target.roles} />
        )}
        {tab === "staffing" && <StaffingTab staffing={data.staffing} />}
        {tab === "risks" && <RisksTab risks={data.status_quo_risks} />}
      </div>
    </Layout>
  );
}

function CurrentTeamTab({
  participation,
  undocumented,
  onOpenPerson,
}: {
  participation: Participation[];
  undocumented: UndocumentedPerson[];
  onOpenPerson: (id: number) => void;
}) {
  const totalCenterHours = participation.reduce(
    (s, p) => s + Number(p.center_hours_per_week || 0),
    0,
  );
  const totalPlan = participation.reduce((s, p) => s + p.center_plan_hours, 0);
  const totalFact = participation.reduce((s, p) => s + p.center_fact_hours, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricBox label="Участников" value={participation.length} icon="Users" />
        <MetricBox
          label="Выделено на Центр, ч/нед"
          value={Math.round(totalCenterHours)}
          icon="Clock"
        />
        <MetricBox label="Плановые часы Центра" value={Math.round(totalPlan)} icon="Calendar" />
        <MetricBox label="Фактические часы Центра" value={Math.round(totalFact)} icon="Check" />
      </div>

      {!participation.length ? (
        <Empty
          text="Участие сотрудников в модели Центра ещё не описано. Откройте карточку сотрудника → вкладка «Участие в Центре»"
          icon="UsersRound"
        />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
          {participation.map((p) => (
            <button
              key={p.id}
              onClick={() => onOpenPerson(p.person_id)}
              className="w-full text-left p-4 hover:bg-slate-50 transition-colors"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{p.display_name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {p.position_title || "Должность не указана"}
                    {p.org_name ? ` · ${p.org_name}` : ""}
                  </p>
                  {p.role_in_model && (
                    <p className="text-xs text-violet-600 mt-1">Роль в модели: {p.role_in_model}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 justify-end">
                  <span
                    className={`text-[11px] px-1.5 py-0.5 rounded border font-medium ${
                      PARTICIPATION_FORMAT[p.participation_format]?.cls ||
                      "bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    {p.format_title}
                  </span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600">
                    {p.source_title}
                  </span>
                  {p.planned_transfer && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-700">
                      план перевода
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2.5 text-xs text-slate-500">
                <span>
                  Ёмкость на Центр:{" "}
                  <b className="text-slate-700">
                    {p.center_hours_per_week != null ? `${p.center_hours_per_week} ч/нед` : "—"}
                  </b>
                  {p.total_hours_per_week != null && (
                    <span className="text-slate-400"> из {p.total_hours_per_week} ч/нед</span>
                  )}
                </span>
                <span>
                  План/факт: <b className="text-slate-700">{p.center_plan_hours} ч</b> /{" "}
                  <b className="text-slate-700">{p.center_fact_hours} ч</b>
                </span>
                {p.functions.length > 0 && <span>Функций: {p.functions.length}</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {undocumented.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800 flex items-center gap-1.5">
            <Icon name="TriangleAlert" size={15} />
            Есть владельцы функций Центра без описанного участия ({undocumented.length})
          </p>
          <p className="text-xs text-amber-700 mt-1 mb-3">
            Эти люди назначены владельцами по RACI, но карточка участия в модели ещё не
            заполнена — формат, доля времени и источник ресурса неизвестны.
          </p>
          <div className="flex flex-wrap gap-2">
            {undocumented.map((u) => (
              <button
                key={u.person_id}
                onClick={() => onOpenPerson(u.person_id)}
                className="text-xs px-2.5 py-1 rounded-lg border border-amber-300 bg-white text-amber-800 hover:bg-amber-100 transition-colors"
              >
                {u.display_name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TargetTab({
  functions,
  roles,
}: {
  functions: TargetFunction[];
  roles: { id: number; title: string; headcount: number; person_name: string | null; justification: string | null; functions: { id: number; title: string }[] }[];
}) {
  const notCovered = functions.filter((f) => f.needs_new_position);
  const coveredNow = functions.filter((f) => f.covered_now);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricBox label="Функций всего" value={functions.length} icon="Layers" />
        <MetricBox label="Выполняется сейчас" value={coveredNow.length} icon="CircleCheck" />
        <MetricBox
          label="Нужна новая позиция"
          value={notCovered.length}
          icon="TriangleAlert"
          tone={notCovered.length ? "warning" : "default"}
        />
        <MetricBox label="Штатных позиций в целевой модели" value={roles.length} icon="Briefcase" />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-2.5">
          Покрытие функций: сейчас и в целевой модели
        </h3>
        {!functions.length ? (
          <Empty text="Функции Центра ещё не описаны" icon="Layers" />
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
            {functions.map((f) => {
              const cr = CRITICALITY[f.criticality] || CRITICALITY.medium;
              const wc = WORK_CATEGORY[f.work_category] || WORK_CATEGORY.operational;
              return (
                <div key={f.id} className="p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-slate-900">{f.title}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${cr.cls}`}>
                      {cr.title}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${wc.cls}`}>
                      {wc.title}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs">
                    <span className="text-slate-500">
                      Сейчас:{" "}
                      {f.current_owner ? (
                        <b className="text-slate-700">{f.current_owner}</b>
                      ) : (
                        <span className="text-red-600 font-medium">не покрыта</span>
                      )}
                      {f.current_plan_hours > 0 && (
                        <span className="text-slate-400"> · {f.current_plan_hours} ч плана</span>
                      )}
                    </span>
                    <span className="text-slate-500">
                      В целевой модели:{" "}
                      {f.covered_in_target ? (
                        <b className="text-emerald-700">{f.target_role_count} позиц.</b>
                      ) : (
                        <span className="text-amber-600 font-medium">нужна новая позиция</span>
                      )}
                    </span>
                    <span className="text-slate-500">
                      Компетенций описано:{" "}
                      {f.req_competencies ? (
                        <b className="text-slate-700">{f.req_competencies}</b>
                      ) : (
                        <span className="text-amber-600">не заданы</span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-2.5">
          Штатные позиции целевой структуры
        </h3>
        {!roles.length ? (
          <Empty
            text="Штатные позиции ещё не описаны — добавьте их в паспорте Центра, вкладка «Штат»"
            icon="Users"
          />
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
            {roles.map((r) => (
              <div key={r.id} className="p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">{r.title}</p>
                  <span className="text-xs text-slate-500">
                    {r.headcount} ст. ·{" "}
                    {r.person_name ? (
                      <span className="text-slate-700">{r.person_name}</span>
                    ) : (
                      <span className="text-amber-600">вакансия</span>
                    )}
                  </span>
                </div>
                {r.functions.length > 0 && (
                  <p className="text-xs text-slate-500 mt-1">
                    Функции: {r.functions.map((f) => f.title).join(", ")}
                  </p>
                )}
                {!r.justification && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <Icon name="TriangleAlert" size={11} />
                    Обоснование потребности не заполнено
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StaffingTab({
  staffing,
}: {
  staffing: import("@/lib/execCenterApi").StaffingCalculation;
}) {
  const maxHours = Math.max(...staffing.categories.map((c: StaffingCategory) => c.annual_hours), 1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricBox
          label="Требуется ставок"
          value={staffing.required_fte}
          icon="Calculator"
          tone="highlight"
        />
        <MetricBox label="Доступно от команды" value={staffing.available_fte} icon="Users" />
        <MetricBox label="Занято ставок" value={staffing.staffed_fte} icon="Briefcase" />
        <MetricBox
          label="Дефицит"
          value={staffing.deficit_fte}
          icon="TrendingDown"
          tone={staffing.deficit_fte > 0 ? "warning" : "default"}
        />
      </div>

      <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
        <p className="text-sm text-violet-900 font-medium">
          Потребность в ставках = годовая трудоёмкость функций / полезный годовой фонд времени
        </p>
        <p className="text-xs text-violet-700 mt-1">
          {staffing.base_total_hours} ч базовых функций + {staffing.reserve_hours} ч резерва (
          {staffing.reserve_pct}%) + {staffing.backup_hours} ч на замещение непрерывности (
          {staffing.backup_coverage_pct}% от критичных) = {staffing.total_hours} ч в год ÷{" "}
          {staffing.annual_fund_hours} ч фонда на человека ={" "}
          <b>{staffing.required_fte} ставки</b>
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-2.5">
          Расшифровка по категориям работы
        </h3>
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          {staffing.categories.map((c: StaffingCategory) => (
            <div key={c.code}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-600">
                  {c.title} <span className="text-slate-400">· {c.function_count} функций</span>
                </span>
                <span className="font-medium text-slate-800">
                  {c.annual_hours} ч/год · {c.fte} ст.
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-violet-500"
                  style={{ width: `${(c.annual_hours / maxHours) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-400">Резерв на внеплановые задачи</p>
          <p className="text-lg font-semibold text-slate-800 mt-0.5">
            {staffing.reserve_hours} ч
            <span className="text-sm text-slate-400 font-normal"> ({staffing.reserve_pct}%)</span>
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-400">Замещение и непрерывность</p>
          <p className="text-lg font-semibold text-slate-800 mt-0.5">
            {staffing.backup_hours} ч
            <span className="text-sm text-slate-400 font-normal">
              {" "}
              ({staffing.backup_coverage_pct}% от критичных функций)
            </span>
          </p>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Параметры резерва, фонда времени и замещения задаются в паспорте Центра.
      </p>
    </div>
  );
}

function RisksTab({ risks }: { risks: { code: string; level: string; text: string }[] }) {
  if (!risks.length) {
    return (
      <Empty
        text="Существенных рисков сохранения текущего распределённого формата не выявлено"
        icon="ShieldCheck"
      />
    );
  }
  return (
    <div className="space-y-2.5">
      {risks.map((r, i) => {
        const lv = RISK_LEVEL[r.level] || RISK_LEVEL.low;
        return (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-3.5 flex items-start gap-3">
            <span className={`text-[11px] px-1.5 py-0.5 rounded border font-medium flex-shrink-0 ${lv.cls}`}>
              {lv.title}
            </span>
            <p className="text-sm text-slate-700">{r.text}</p>
          </div>
        );
      })}
    </div>
  );
}

function MetricBox({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: number | string;
  icon: string;
  tone?: "default" | "warning" | "highlight";
}) {
  const cls =
    tone === "warning"
      ? "border-amber-200 bg-amber-50"
      : tone === "highlight"
        ? "border-violet-200 bg-violet-50"
        : "border-slate-200 bg-white";
  const valCls =
    tone === "warning" ? "text-amber-700" : tone === "highlight" ? "text-violet-700" : "text-slate-900";
  return (
    <div className={`rounded-xl border p-3.5 ${cls}`}>
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <Icon name={icon} size={13} />
        {label}
      </div>
      <p className={`text-xl font-semibold mt-1.5 ${valCls}`}>{value}</p>
    </div>
  );
}