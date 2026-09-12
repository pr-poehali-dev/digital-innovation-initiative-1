import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading } from "@/components/exec/ExecUI";
import { Modal, TextField, TextArea, SelectField, DateField } from "@/components/exec/ExecForm";
import { CenterRefs } from "@/lib/execCenterApi";
import { orgModelApi, OrgUnitNode, ORG_UNIT_TYPE_LABEL } from "@/lib/execOrgModelApi";

const TYPE_OPTIONS = Object.entries(ORG_UNIT_TYPE_LABEL).map(([value, label]) => ({ value, label }));

export default function OrgUnitsTab({
  centerId,
  refs,
}: {
  centerId: number;
  refs: CenterRefs | null;
}) {
  const [items, setItems] = useState<OrgUnitNode[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Partial<OrgUnitNode> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const reload = () => {
    setLoading(true);
    setError("");
    orgModelApi
      .tree(centerId)
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(reload, [centerId]);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setSaveError("");
    try {
      await orgModelApi.saveUnit({ ...editing, center_id: centerId });
      setEditing(null);
      reload();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const archive = async (id: number) => {
    if (!confirm("Архивировать подразделение? История сохранится.")) return;
    try {
      await orgModelApi.archiveUnit(id);
      reload();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;

  const personOptions = (refs?.persons || []).map((p) => ({ value: String(p.id), label: p.display_name }));
  const parentOptions = (items || []).map((u) => ({ value: String(u.id), label: u.name }));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setEditing({})}
          className="px-3 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700 transition-colors inline-flex items-center gap-1.5"
        >
          <Icon name="Plus" size={15} />
          Добавить подразделение
        </button>
      </div>

      {!items?.length ? (
        <Empty text="Подразделений пока нет" icon="Building2" />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
          {items.map((u) => (
            <div key={u.id} className="p-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-slate-900">{u.name}</p>
                  {u.short_name && <span className="text-xs text-slate-400">({u.short_name})</span>}
                  <span className="text-[11px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-500">
                    {ORG_UNIT_TYPE_LABEL[u.type] || u.type}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Руководитель: {u.head_name || "не назначен"} · функций: {u.function_count} · штат{" "}
                  {u.staff_plan_fte}/{u.staff_fact_fte} FTE
                  {u.vacancy_count > 0 && `, вакансий: ${u.vacancy_count}`}
                </p>
                {u.description && <p className="text-xs text-slate-400 mt-1">{u.description}</p>}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => setEditing(u)}
                  className="text-xs px-2 py-1 rounded-md border border-slate-200 hover:border-violet-300 hover:text-violet-700 transition-colors"
                >
                  Изменить
                </button>
                <button
                  onClick={() => archive(u.id)}
                  className="text-xs px-2 py-1 rounded-md border border-slate-200 hover:border-red-300 hover:text-red-700 transition-colors"
                >
                  Архивировать
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal
          title={editing.id ? "Редактировать подразделение" : "Новое подразделение"}
          onClose={() => setEditing(null)}
          onSave={save}
          saving={saving}
          error={saveError}
          canSave={!!editing.name || !!editing.id}
        >
          <TextField
            label="Наименование"
            value={editing.name || ""}
            onChange={(v) => setEditing({ ...editing, name: v })}
            required
          />
          <TextField
            label="Краткое наименование"
            value={editing.short_name || ""}
            onChange={(v) => setEditing({ ...editing, short_name: v })}
          />
          <TextField
            label="Код"
            value={editing.code || ""}
            onChange={(v) => setEditing({ ...editing, code: v })}
          />
          <SelectField
            label="Тип"
            value={editing.type || "division"}
            onChange={(v) => setEditing({ ...editing, type: v })}
            options={TYPE_OPTIONS}
          />
          <SelectField
            label="Родительское подразделение"
            value={editing.parent_id ? String(editing.parent_id) : ""}
            onChange={(v) => setEditing({ ...editing, parent_id: v ? Number(v) : null })}
            options={parentOptions}
            placeholder="нет (верхний уровень)"
          />
          <SelectField
            label="Руководитель"
            value={editing.head_person_id ? String(editing.head_person_id) : ""}
            onChange={(v) => setEditing({ ...editing, head_person_id: v ? Number(v) : null })}
            options={personOptions}
          />
          <div className="grid grid-cols-2 gap-3">
            <DateField
              label="Действует с"
              value={editing.valid_from || ""}
              onChange={(v) => setEditing({ ...editing, valid_from: v })}
            />
            <DateField
              label="Действует по"
              value={editing.valid_to || ""}
              onChange={(v) => setEditing({ ...editing, valid_to: v })}
            />
          </div>
          <SelectField
            label="Статус"
            value={editing.status || "active"}
            onChange={(v) => setEditing({ ...editing, status: v })}
            options={[
              { value: "active", label: "Действует" },
              { value: "planned", label: "Планируется" },
            ]}
          />
          <TextArea
            label="Описание"
            value={editing.description || ""}
            onChange={(v) => setEditing({ ...editing, description: v })}
          />
        </Modal>
      )}
    </div>
  );
}
