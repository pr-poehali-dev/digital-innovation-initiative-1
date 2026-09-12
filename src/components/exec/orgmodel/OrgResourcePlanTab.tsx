import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading, Card } from "@/components/exec/ExecUI";
import { Modal, TextField, SelectField } from "@/components/exec/ExecForm";
import {
  orgModelApi, OrgResourcePlanVersion, OrgResourcePlanData, OrgResourcePlanLine,
} from "@/lib/execOrgModelApi";

const MONTHS_RU = [
  "янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек",
];

function monthLabel(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS_RU[d.getMonth()]} ${d.getFullYear()}`;
}

/** Годовой ресурсный план: версии + строки по месяцам + утверждённый снимок
 * (SHA-256, версионирование как у exec_financial_snapshot). Проектная
 * потребность (project_demand_fte) и дефицит считаются на лету из
 * exec_resource_requirement — без ручного повторного ввода. */
export default function OrgResourcePlanTab() {
  const [versions, setVersions] = useState<OrgResourcePlanVersion[] | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [plan, setPlan] = useState<OrgResourcePlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [newYear, setNewYear] = useState(String(new Date().getFullYear()));
  const [editingLine, setEditingLine] = useState<Partial<OrgResourcePlanLine> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [snapshotInfo, setSnapshotInfo] = useState<{ version_group: string; version_number: number; payload_sha256: string } | null>(null);

  const reloadVersions = () => {
    setLoading(true);
    setError("");
    orgModelApi
      .planVersions()
      .then((d) => {
        setVersions(d.items);
        if (!selectedVersion && d.items.length) setSelectedVersion(d.items[0].id);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(reloadVersions, []);

  const loadPlan = (versionId: number) => {
    setLoading(true);
    orgModelApi
      .plan(versionId)
      .then(setPlan)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (selectedVersion) loadPlan(selectedVersion);
  }, [selectedVersion]);

  const createVersion = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const res = await orgModelApi.savePlanVersion({ year: Number(newYear) });
      setCreatingVersion(false);
      reloadVersions();
      setSelectedVersion(res.id);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveLine = async () => {
    if (!editingLine || !selectedVersion) return;
    setSaving(true);
    setSaveError("");
    try {
      await orgModelApi.savePlanLine({ ...editingLine, version_id: selectedVersion });
      setEditingLine(null);
      loadPlan(selectedVersion);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const approve = async () => {
    if (!selectedVersion) return;
    if (!confirm("Утвердить версию плана? После утверждения строки будут доступны только на чтение, изменения потребуют новой версии.")) return;
    try {
      const res = await orgModelApi.createPlanSnapshot({ version_id: selectedVersion });
      setSnapshotInfo(res);
      reloadVersions();
      loadPlan(selectedVersion);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  if (loading && !versions) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reloadVersions} />;

  const isApproved = plan?.version.status === "approved";

  // Группировка строк по месяцу для компактной таблицы
  const months = Array.from(new Set((plan?.lines || []).map((l) => l.month))).sort();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-56">
          <SelectField
            label="Версия плана"
            value={selectedVersion ? String(selectedVersion) : ""}
            onChange={(v) => setSelectedVersion(Number(v))}
            options={(versions || []).map((v) => ({
              value: String(v.id),
              label: `${v.year} — ${v.title || "без названия"} (${v.status === "approved" ? "утверждён" : "черновик"})`,
            }))}
          />
        </div>
        <button
          onClick={() => setCreatingVersion(true)}
          className="px-3 py-2 rounded-lg border border-violet-300 text-violet-700 text-sm hover:bg-violet-50 transition-colors mt-5"
        >
          + Новая версия
        </button>
        {plan && !isApproved && (
          <button
            onClick={approve}
            className="px-3 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700 transition-colors mt-5 inline-flex items-center gap-1.5"
          >
            <Icon name="ShieldCheck" size={15} />
            Утвердить и опубликовать снимок
          </button>
        )}
      </div>

      {snapshotInfo && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-xs text-green-800">
          Снимок опубликован: {snapshotInfo.version_group} v{snapshotInfo.version_number} · SHA-256:{" "}
          <span className="font-mono">{snapshotInfo.payload_sha256.slice(0, 16)}…</span>
        </div>
      )}

      {isApproved && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 flex items-center gap-2">
          <Icon name="Lock" size={13} />
          Версия утверждена — строки доступны только на чтение. Для изменений создайте новую версию.
        </div>
      )}

      {!plan ? (
        <Empty text="Создайте первую версию годового ресурсного плана" icon="CalendarRange" />
      ) : (
        <>
          {!isApproved && (
            <div className="flex justify-end">
              <button
                onClick={() => setEditingLine({})}
                className="px-3 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700 transition-colors inline-flex items-center gap-1.5"
              >
                <Icon name="Plus" size={15} />
                Добавить строку
              </button>
            </div>
          )}

          {!months.length ? (
            <Empty text="Строки плана ещё не добавлены" icon="CalendarRange" />
          ) : (
            <Card title="Годовой план по месяцам" icon="CalendarRange">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                      <th className="py-2 pr-3">Месяц</th>
                      <th className="py-2 pr-3">Подразделение / роль</th>
                      <th className="py-2 pr-3">Штат, FTE</th>
                      <th className="py-2 pr-3">Доступно, FTE</th>
                      <th className="py-2 pr-3">Операц. потребность</th>
                      <th className="py-2 pr-3">Проектная потребность</th>
                      <th className="py-2 pr-3">Внешний ресурс</th>
                      <th className="py-2 pr-3">Дефицит/резерв</th>
                      <th className="py-2 pr-3">ФОТ, план</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {plan.lines.map((l) => (
                      <tr
                        key={l.id}
                        className={!isApproved ? "cursor-pointer hover:bg-slate-50" : ""}
                        onClick={() => !isApproved && setEditingLine(l)}
                      >
                        <td className="py-2 pr-3 text-slate-700">{monthLabel(l.month)}</td>
                        <td className="py-2 pr-3 text-slate-900">
                          {l.org_unit_name || l.role_title || "—"}
                        </td>
                        <td className="py-2 pr-3">{l.planned_fte}</td>
                        <td className="py-2 pr-3">{l.available_fte}</td>
                        <td className="py-2 pr-3">{l.operational_demand_fte}</td>
                        <td className="py-2 pr-3">{l.project_demand_fte}</td>
                        <td className="py-2 pr-3">{l.external_fte}</td>
                        <td className={`py-2 pr-3 font-medium ${l.capacity_gap_fte > 0 ? "text-red-600" : "text-green-600"}`}>
                          {l.capacity_gap_fte > 0 ? `−${l.capacity_gap_fte}` : `+${Math.abs(l.capacity_gap_fte)}`}
                        </td>
                        <td className="py-2 pr-3">{l.fot_plan_amount ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Дефицит мощности = потребность в FTE (проектная + операционная) − доступная ёмкость в FTE.
                Проектная потребность рассчитана на лету из ресурсных потребностей проектов, без
                ручного повторного ввода.
              </p>
            </Card>
          )}
        </>
      )}

      {creatingVersion && (
        <Modal
          title="Новая версия годового плана"
          onClose={() => setCreatingVersion(false)}
          onSave={createVersion}
          saving={saving}
          error={saveError}
        >
          <TextField label="Год" value={newYear} onChange={setNewYear} required />
        </Modal>
      )}

      {editingLine && (
        <Modal
          title="Строка годового плана"
          onClose={() => setEditingLine(null)}
          onSave={saveLine}
          saving={saving}
          error={saveError}
        >
          <TextField
            label="Месяц (YYYY-MM-01)"
            value={editingLine.month || ""}
            onChange={(v) => setEditingLine({ ...editingLine, month: v })}
            placeholder="2026-01-01"
            required
          />
          <TextField
            label="ID подразделения (или роли ниже)"
            value={editingLine.org_unit_id ? String(editingLine.org_unit_id) : ""}
            onChange={(v) => setEditingLine({ ...editingLine, org_unit_id: v ? Number(v) : null })}
            hint="Заполните подразделение или роль — хотя бы одно из двух"
          />
          <TextField
            label="ID роли"
            value={editingLine.role_id ? String(editingLine.role_id) : ""}
            onChange={(v) => setEditingLine({ ...editingLine, role_id: v ? Number(v) : null })}
          />
          <TextField
            label="Штатный план, FTE"
            value={String(editingLine.planned_fte ?? "")}
            onChange={(v) => setEditingLine({ ...editingLine, planned_fte: Number(v.replace(",", ".")) || 0 })}
          />
          <TextField
            label="Доступная ёмкость, FTE"
            value={String(editingLine.available_fte ?? "")}
            onChange={(v) => setEditingLine({ ...editingLine, available_fte: Number(v.replace(",", ".")) || 0 })}
          />
          <TextField
            label="Операционная потребность, FTE"
            value={String(editingLine.operational_demand_fte ?? "")}
            onChange={(v) => setEditingLine({ ...editingLine, operational_demand_fte: Number(v.replace(",", ".")) || 0 })}
          />
          <TextField
            label="Внешний ресурс, FTE"
            value={String(editingLine.external_fte ?? "")}
            onChange={(v) => setEditingLine({ ...editingLine, external_fte: Number(v.replace(",", ".")) || 0 })}
          />
          <TextField
            label="ФОТ план"
            value={String(editingLine.fot_plan_amount ?? "")}
            onChange={(v) => setEditingLine({ ...editingLine, fot_plan_amount: Number(v.replace(",", ".")) || null })}
          />
        </Modal>
      )}
    </div>
  );
}