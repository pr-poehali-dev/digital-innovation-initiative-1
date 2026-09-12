import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { Card, Empty, ErrorBox, Loading, Metric } from "@/components/exec/ExecUI";
import { centerApi, Center, CenterRefs } from "@/lib/execCenterApi";
import { orgModelApi, OrgOverview } from "@/lib/execOrgModelApi";
import OrgStructureTab from "@/components/exec/orgmodel/OrgStructureTab";
import OrgUnitsTab from "@/components/exec/orgmodel/OrgUnitsTab";
import OrgFunctionsTab from "@/components/exec/orgmodel/OrgFunctionsTab";
import OrgRolesTab from "@/components/exec/orgmodel/OrgRolesTab";
import OrgPeopleTab from "@/components/exec/orgmodel/OrgPeopleTab";
import OrgRaciTab from "@/components/exec/orgmodel/OrgRaciTab";
import OrgCompetenciesTab from "@/components/exec/orgmodel/OrgCompetenciesTab";
import OrgGapsTab from "@/components/exec/orgmodel/OrgGapsTab";
import OrgResourcePlanTab from "@/components/exec/orgmodel/OrgResourcePlanTab";

type SubTab =
  | "overview" | "structure" | "units" | "functions" | "roles"
  | "people" | "raci" | "competencies" | "gaps" | "plan";

const TABS: { id: SubTab; title: string; icon: string }[] = [
  { id: "overview", title: "Главная", icon: "LayoutDashboard" },
  { id: "structure", title: "Структура Центра", icon: "Network" },
  { id: "units", title: "Подразделения", icon: "Building2" },
  { id: "functions", title: "Функции", icon: "ListChecks" },
  { id: "roles", title: "Роли и штат", icon: "IdCard" },
  { id: "people", title: "Люди и назначения", icon: "UsersRound" },
  { id: "raci", title: "RACI", icon: "Table2" },
  { id: "competencies", title: "Компетенции", icon: "GraduationCap" },
  { id: "gaps", title: "Дефициты", icon: "AlertTriangle" },
  { id: "plan", title: "Годовой ресурсный план", icon: "CalendarRange" },
];

export default function ExecOrgModelPage() {
  const [center, setCenter] = useState<Center | null>(null);
  const [refs, setRefs] = useState<CenterRefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<SubTab>("overview");

  const reload = () => {
    setLoading(true);
    setError("");
    centerApi
      .list()
      .then(async (centers) => {
        const active = centers.find((c) => c.status !== "archived") || centers[0] || null;
        setCenter(active);
        const r = await centerApi.refs();
        setRefs(r);
      })
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
  if (!center) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <Icon name="Network" size={32} className="text-slate-300 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-slate-900">Центр ещё не создан</h1>
          <p className="text-sm text-slate-500 mt-1.5">
            Организационная модель строится поверх паспорта Центра — сначала создайте его на
            странице «Центр цифровизации».
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-[1400px] mx-auto px-4 py-6">
        <header className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-slate-900">Организационная модель</h1>
            <p className="text-sm text-slate-500 mt-1">
              {center.title} — функции → подразделения → роли → люди → компетенции → ресурсный план
            </p>
          </div>
        </header>

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

        {tab === "overview" && <OverviewTab centerId={center.id} onNavigate={setTab} />}
        {tab === "structure" && <OrgStructureTab centerId={center.id} />}
        {tab === "units" && <OrgUnitsTab centerId={center.id} refs={refs} />}
        {tab === "functions" && <OrgFunctionsTab centerId={center.id} />}
        {tab === "roles" && <OrgRolesTab centerId={center.id} refs={refs} />}
        {tab === "people" && <OrgPeopleTab centerId={center.id} />}
        {tab === "raci" && <OrgRaciTab refs={refs} />}
        {tab === "competencies" && <OrgCompetenciesTab centerId={center.id} />}
        {tab === "gaps" && <OrgGapsTab centerId={center.id} />}
        {tab === "plan" && <OrgResourcePlanTab />}
      </div>
    </Layout>
  );
}

function OverviewTab({
  centerId,
  onNavigate,
}: {
  centerId: number;
  onNavigate: (tab: SubTab) => void;
}) {
  const [data, setData] = useState<OrgOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = () => {
    setLoading(true);
    setError("");
    orgModelApi
      .overview(centerId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(reload, [centerId]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Metric label="Штатная численность, FTE" value={data.staffing.staff_plan_fte} icon="Users" />
        <Metric label="Фактическая численность, FTE" value={data.staffing.staff_fact_fte} icon="UserCheck" />
        <Metric
          label="Вакансии"
          value={data.staffing.vacancy_count}
          icon="UserX"
          tone={data.staffing.vacancy_count > 0 ? "warning" : "default"}
          onClick={() => onNavigate("roles")}
        />
        <Metric label="Внешние исполнители" value={data.external_count} icon="Contact" />
        <Metric
          label="Перегруженные участники"
          value={data.overloaded_count}
          icon="TrendingUp"
          tone={data.overloaded_count > 0 ? "danger" : "default"}
          onClick={() => onNavigate("people")}
        />
        <Metric
          label="Незакрытые ресурсные потребности"
          value={data.open_requirements_count}
          icon="ClipboardList"
          tone={data.open_requirements_count > 0 ? "warning" : "default"}
        />
        <Metric
          label="Дефицит ролей (вакансии)"
          value={data.vacant_roles_count}
          icon="UserMinus"
          tone={data.vacant_roles_count > 0 ? "warning" : "default"}
          onClick={() => onNavigate("gaps")}
        />
        <Metric
          label="Дефицит компетенций"
          value={data.role_competency_gaps_count}
          icon="GraduationCap"
          tone={data.role_competency_gaps_count > 0 ? "warning" : "default"}
          onClick={() => onNavigate("gaps")}
        />
        <Metric
          label="Функции без владельца"
          value={data.functions_without_owner_count}
          icon="UserCog"
          tone={data.functions_without_owner_count > 0 ? "danger" : "default"}
          onClick={() => onNavigate("functions")}
        />
        <Metric
          label="Объекты без A в RACI"
          value={data.raci_without_owner_count}
          icon="ShieldAlert"
          tone={data.raci_without_owner_count > 0 ? "danger" : "default"}
          onClick={() => onNavigate("raci")}
        />
      </div>

      <Card title="Численность по подразделениям" icon="Building2">
        {!data.by_unit.length ? (
          <Empty text="Подразделения ещё не заведены — начните со вкладки «Структура Центра»" icon="Building2" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3">Подразделение</th>
                  <th className="py-2 pr-3">Штат, FTE</th>
                  <th className="py-2 pr-3">Факт, FTE</th>
                  <th className="py-2 pr-3">Вакансии</th>
                  <th className="py-2 pr-3">Заморожено</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.by_unit.map((u) => (
                  <tr key={u.org_unit_id}>
                    <td className="py-2 pr-3 text-slate-900">{u.org_unit_name}</td>
                    <td className="py-2 pr-3">{u.staff_plan_fte}</td>
                    <td className="py-2 pr-3">{u.staff_fact_fte}</td>
                    <td className="py-2 pr-3">
                      {u.vacancy_count > 0 ? (
                        <span className="text-amber-700">{u.vacancy_count}</span>
                      ) : (
                        0
                      )}
                    </td>
                    <td className="py-2 pr-3">{u.frozen_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {data.overloaded_people.length > 0 && (
        <Card title="Перегруженные участники" icon="TrendingUp" subtitle="Суммарная плановая загрузка выше 100%">
          <div className="space-y-1.5">
            {data.overloaded_people.map((p) => (
              <div key={p.person_id} className="flex items-center justify-between text-sm py-1">
                <span className="text-slate-900">{p.display_name}</span>
                <span className="text-red-600 font-medium">{p.total_load_pct}%</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
