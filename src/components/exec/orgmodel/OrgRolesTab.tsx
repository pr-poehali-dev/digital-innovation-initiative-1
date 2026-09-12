import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading } from "@/components/exec/ExecUI";
import { Modal, TextField, TextArea, SelectField } from "@/components/exec/ExecForm";
import { centerApi, Center, CenterRefs, CenterRole } from "@/lib/execCenterApi";
import { orgModelApi, OrgUnitNode, ROLE_POSITION_STATUS } from "@/lib/execOrgModelApi";

interface RolePosition {
  id: number;
  role_id: number;
  fte: number;
  person_id: number | null;
  person_name: string | null;
  status: string;
}

/** Роли и штатные единицы. Разделяет организационную роль (exec_center_role),
 * штатную единицу (exec_role_position) и конкретного человека (exec_person) —
 * одна роль может иметь несколько единиц: часть занята, часть вакантна. */
export default function OrgRolesTab({
  centerId,
  refs,
}: {
  centerId: number;
  refs: CenterRefs | null;
}) {
  const [center, setCenter] = useState<Center | null>(null);
  const [units, setUnits] = useState<OrgUnitNode[] | null>(null);
  const [positions, setPositions] = useState<Record<number, RolePosition[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingRole, setEditingRole] = useState<Partial<CenterRole> | null>(null);
  const [editingPosition, setEditingPosition] = useState<{ role_id: number } & Partial<RolePosition> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const reload = () => {
    setLoading(true);
    setError("");
    Promise.all([centerApi.center(centerId), orgModelApi.tree(centerId)])
      .then(async ([c, t]) => {
        setCenter(c.center);
        setUnits(t.items);
        const posByRole: Record<number, RolePosition[]> = {};
        for (const unit of t.items) {
          const detail = await orgModelApi.unitDetail(unit.id).catch(() => null);
          if (!detail) continue;
          for (const p of detail.positions) {
            if (!posByRole[p.role_id]) posByRole[p.role_id] = [];
            posByRole[p.role_id].push(p);
          }
        }
        setPositions(posByRole);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(reload, [centerId]);

  const saveRole = async () => {
    if (!editingRole) return;
    setSaving(true);
    setSaveError("");
    try {
      await centerApi.saveRole({ ...editingRole, center_id: centerId });
      setEditingRole(null);
      reload();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const savePosition = async () => {
    if (!editingPosition) return;
    setSaving(true);
    setSaveError("");
    try {
      await orgModelApi.savePosition(editingPosition);
      setEditingPosition(null);
      reload();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;

  const roles = center?.roles || [];
  const unitOptions = (units || []).map((u) => ({ value: String(u.id), label: u.name }));
  const personOptions = (refs?.persons || []).map((p) => ({ value: String(p.id), label: p.display_name }));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setEditingRole({})}
          className="px-3 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700 transition-colors inline-flex items-center gap-1.5"
        >
          <Icon name="Plus" size={15} />
          Добавить роль
        </button>
      </div>

      {!roles.length ? (
        <Empty text="Роли ещё не заведены" icon="IdCard" />
      ) : (
        <div className="space-y-3">
          {roles.map((r) => {
            const rolePositions = positions[r.id] || [];
            return (
              <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{r.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Плановая численность: {r.headcount} FTE · штатных единиц: {rolePositions.length}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingRole(r)}
                      className="text-xs px-2 py-1 rounded-md border border-slate-200 hover:border-violet-300 hover:text-violet-700 transition-colors"
                    >
                      Изменить роль
                    </button>
                    <button
                      onClick={() => setEditingPosition({ role_id: r.id, fte: 1, status: "vacant" })}
                      className="text-xs px-2 py-1 rounded-md border border-violet-200 text-violet-700 hover:bg-violet-50 transition-colors"
                    >
                      + Штатная единица
                    </button>
                  </div>
                </div>
                {rolePositions.length > 0 && (
                  <div className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
                    {rolePositions.map((p) => {
                      const st = ROLE_POSITION_STATUS[p.status] || ROLE_POSITION_STATUS.vacant;
                      return (
                        <div key={p.id} className="py-2 flex items-center justify-between text-sm">
                          <span className="text-slate-700">
                            {p.person_name || "вакансия"} · {p.fte} FTE
                          </span>
                          <span className={`text-[11px] px-1.5 py-0.5 rounded border ${st.cls}`}>{st.title}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editingRole && (
        <Modal
          title={editingRole.id ? "Редактировать роль" : "Новая роль"}
          onClose={() => setEditingRole(null)}
          onSave={saveRole}
          saving={saving}
          error={saveError}
        >
          <TextField
            label="Название роли"
            value={editingRole.title || ""}
            onChange={(v) => setEditingRole({ ...editingRole, title: v })}
            required
          />
          <TextField
            label="Код роли"
            value={(editingRole as unknown as { code?: string }).code || ""}
            onChange={(v) => setEditingRole({ ...editingRole, code: v } as Partial<CenterRole>)}
          />
          <SelectField
            label="Подразделение"
            value={(editingRole as unknown as { org_unit_id?: number }).org_unit_id
              ? String((editingRole as unknown as { org_unit_id?: number }).org_unit_id)
              : ""}
            onChange={(v) => setEditingRole({ ...editingRole, org_unit_id: v ? Number(v) : null } as Partial<CenterRole>)}
            options={unitOptions}
          />
          <TextField
            label="Плановая численность, FTE"
            value={String(editingRole.headcount ?? "")}
            onChange={(v) => setEditingRole({ ...editingRole, headcount: Number(v.replace(",", ".")) || 0 })}
            hint="Дробные ставки поддерживаются: 1.0 / 0.5 / 0.25"
          />
          <TextArea
            label="Основные обязанности"
            value={editingRole.duties || ""}
            onChange={(v) => setEditingRole({ ...editingRole, duties: v })}
          />
        </Modal>
      )}

      {editingPosition && (
        <Modal
          title="Штатная единица"
          onClose={() => setEditingPosition(null)}
          onSave={savePosition}
          saving={saving}
          error={saveError}
        >
          <TextField
            label="Ставка, FTE"
            value={String(editingPosition.fte ?? 1)}
            onChange={(v) =>
              setEditingPosition({ ...editingPosition, fte: Number(v.replace(",", ".")) || 1 })
            }
            hint="1,0 / 0,5 / 0,25"
          />
          <SelectField
            label="Человек (пусто = вакансия)"
            value={editingPosition.person_id ? String(editingPosition.person_id) : ""}
            onChange={(v) =>
              setEditingPosition({
                ...editingPosition,
                person_id: v ? Number(v) : null,
                status: v ? "occupied" : "vacant",
              })
            }
            options={personOptions}
          />
          <SelectField
            label="Статус"
            value={editingPosition.status || "vacant"}
            onChange={(v) => setEditingPosition({ ...editingPosition, status: v })}
            options={[
              { value: "occupied", label: "Занята" },
              { value: "vacant", label: "Вакансия" },
              { value: "frozen", label: "Заморожена" },
              { value: "eliminated", label: "Упразднена" },
            ]}
          />
        </Modal>
      )}
    </div>
  );
}
