import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading, Card } from "@/components/exec/ExecUI";
import { orgModelApi, CompetencyGapRow, VacantRoleRow } from "@/lib/execOrgModelApi";

/** Дефициты ролей и компетенций. Расчёт — подсказка для планирования, а не
 * кадровое решение (данные читаются на лету из exec_center_role_competency,
 * exec_person_competency, exec_role_position — ничего не копируется). */
export default function OrgGapsTab({ centerId }: { centerId: number }) {
  const [data, setData] = useState<{ competency_gaps: CompetencyGapRow[]; vacant_roles: VacantRoleRow[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = () => {
    setLoading(true);
    setError("");
    orgModelApi
      .competencyGaps(centerId)
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
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 flex items-start gap-2">
        <Icon name="Info" size={15} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          Автоматический расчёт — подсказка для планирования, а не готовое кадровое решение.
          Способ закрытия дефицита (обучение, перераспределение, найм, подрядчик, временный
          эксперт) выбирает руководитель.
        </p>
      </div>

      <Card title="Вакантные роли" icon="UserMinus" subtitle="Незанятые штатные единицы">
        {!data.vacant_roles.length ? (
          <Empty text="Вакансий нет" icon="UserCheck" />
        ) : (
          <div className="divide-y divide-slate-100">
            {data.vacant_roles.map((v) => (
              <div key={v.role_id} className="py-2.5 flex items-center justify-between text-sm">
                <div>
                  <p className="text-slate-900">{v.role_title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {v.org_unit_name || "без подразделения"}
                    {v.required_competencies?.length ? ` · требуются: ${v.required_competencies.join(", ")}` : ""}
                  </p>
                </div>
                <span className="text-amber-700 font-medium">{v.vacancy_count} вак.</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Дефицит компетенций" icon="GraduationCap" subtitle="Требуемый уровень выше подтверждённого у занимающего роль">
        {!data.competency_gaps.length ? (
          <Empty text="Дефицитов компетенций не обнаружено" icon="ShieldCheck" />
        ) : (
          <div className="divide-y divide-slate-100">
            {data.competency_gaps.map((g, i) => (
              <div key={i} className="py-2.5 flex items-center justify-between text-sm">
                <div>
                  <p className="text-slate-900">
                    {g.role_title} — {g.competency_name}
                    {g.is_critical && <span className="ml-1.5 text-[11px] text-red-600">критично</span>}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {g.person_name || "вакансия"} · требуется {g.required_level}, текущий{" "}
                    {g.current_level ?? "не подтверждён"}
                  </p>
                </div>
                <span className="text-red-600 font-medium">-{g.gap}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
