import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading } from "@/components/exec/ExecUI";
import { SelectField } from "@/components/exec/ExecForm";
import { centerApi, CenterFunction, CRITICALITY, FUNC_STATUS } from "@/lib/execCenterApi";
import { orgModelApi, OrgUnitNode } from "@/lib/execOrgModelApi";

/** Функции Центра — переиспользует exec_center_function (не создаёт
 * параллельный справочник). Здесь только связка с подразделениями:
 * ответственное (owner, единственное) + участвующие. */
export default function OrgFunctionsTab({ centerId }: { centerId: number }) {
  const [functions, setFunctions] = useState<CenterFunction[] | null>(null);
  const [units, setUnits] = useState<OrgUnitNode[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const reload = () => {
    setLoading(true);
    setError("");
    Promise.all([centerApi.center(centerId), orgModelApi.tree(centerId)])
      .then(([c, t]) => {
        setFunctions(c.center.functions || []);
        setUnits(t.items);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(reload, [centerId]);

  const assignOwner = async (functionId: number, orgUnitId: number | null) => {
    if (!orgUnitId) return;
    setBusyId(functionId);
    try {
      await orgModelApi.saveFunctionOrgUnit({
        center_function_id: functionId,
        org_unit_id: orgUnitId,
        role: "owner",
      });
      reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!functions?.length) {
    return (
      <Empty
        text="Функции Центра ещё не заведены — добавьте их на странице «Центр цифровизации»"
        icon="ListChecks"
      />
    );
  }

  const unitOptions = (units || []).map((u) => ({ value: String(u.id), label: u.name }));
  const unitById = new Map((units || []).map((u) => [u.id, u]));

  return (
    <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
      {functions.map((f) => {
        const crit = CRITICALITY[f.criticality] || CRITICALITY.medium;
        const st = FUNC_STATUS[f.status] || FUNC_STATUS.planned;
        const ownerUnit = (f as unknown as { owner_org_unit_id?: number }).owner_org_unit_id;
        return (
          <div key={f.id} className="p-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-slate-900">{f.title}</p>
                {f.code && <span className="text-xs text-slate-400">{f.code}</span>}
                <span className={`text-[11px] px-1.5 py-0.5 rounded border ${crit.cls}`}>{crit.title}</span>
                <span className={`text-[11px] px-1.5 py-0.5 rounded border ${st.cls}`}>{st.title}</span>
                {!f.owner_name && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded border border-red-200 bg-red-50 text-red-700">
                    нет владельца (RACI)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Владелец функции: {f.owner_name || "не назначен"}
                {ownerUnit && unitById.get(ownerUnit) && ` · ответственное подразделение: ${unitById.get(ownerUnit)?.name}`}
              </p>
            </div>
            <div className="w-64 flex-shrink-0">
              <SelectField
                label="Ответственное подразделение"
                value={ownerUnit ? String(ownerUnit) : ""}
                onChange={(v) => assignOwner(f.id, v ? Number(v) : null)}
                options={unitOptions}
              />
              {busyId === f.id && <Icon name="Loader2" size={12} className="animate-spin text-slate-400" />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
