import { useEffect, useState } from "react";
import { Empty, ErrorBox, Loading, Card } from "@/components/exec/ExecUI";
import { execResourcesApi, TeamLoadRow } from "@/lib/execResourcesApi";
import { orgModelApi, OrgUnitDetail } from "@/lib/execOrgModelApi";

/** Люди и назначения: загрузка команды переиспользует
 * exec_resource_assignment (через exec-resources), штатные позиции —
 * через новые exec_role_position. Не копирует данные, только агрегирует. */
export default function OrgPeopleTab({ centerId }: { centerId: number }) {
  const [load, setLoad] = useState<TeamLoadRow[] | null>(null);
  const [details, setDetails] = useState<OrgUnitDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = () => {
    setLoading(true);
    setError("");
    Promise.all([execResourcesApi.teamLoad(), orgModelApi.tree(centerId)])
      .then(async ([l, t]) => {
        setLoad(l.items);
        const ds = await Promise.all(t.items.map((u) => orgModelApi.unitDetail(u.id).catch(() => null)));
        setDetails(ds.filter(Boolean) as OrgUnitDetail[]);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(reload, [centerId]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;

  const allPositions = details.flatMap((d) =>
    d.positions.map((p) => ({ ...p, org_unit_name: d.name })),
  );

  return (
    <div className="space-y-5">
      <Card title="Загрузка людей по проектам и инициативам" icon="TrendingUp" subtitle="Из exec_resource_assignment">
        {!load?.length ? (
          <Empty text="Назначений пока нет" icon="Users" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3">Сотрудник</th>
                  <th className="py-2 pr-3">Должность</th>
                  <th className="py-2 pr-3">Загрузка</th>
                  <th className="py-2 pr-3">Назначений</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {load.map((r) => (
                  <tr key={r.person_id}>
                    <td className="py-2 pr-3 text-slate-900">{r.display_name}</td>
                    <td className="py-2 pr-3 text-slate-500">{r.position_title || "—"}</td>
                    <td className={`py-2 pr-3 font-medium ${r.total_load_pct > 100 ? "text-red-600" : "text-slate-700"}`}>
                      {r.total_load_pct}%
                    </td>
                    <td className="py-2 pr-3 text-slate-500">{r.assignment_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Штатные позиции и вакансии" icon="IdCard" subtitle="Роль → человек / вакансия, по подразделениям">
        {!allPositions.length ? (
          <Empty text="Штатные единицы ещё не заведены — добавьте их на вкладке «Роли и штат»" icon="UserCheck" />
        ) : (
          <div className="divide-y divide-slate-100">
            {allPositions.map((p) => (
              <div key={p.id} className="py-2 flex items-center justify-between text-sm">
                <div>
                  <span className="text-slate-900">{p.role_title}</span>
                  <span className="text-slate-400 ml-2 text-xs">{p.org_unit_name}</span>
                </div>
                <span className={p.person_id ? "text-slate-700" : "text-amber-700"}>
                  {p.person_name || "вакансия"} · {p.fte} FTE
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}