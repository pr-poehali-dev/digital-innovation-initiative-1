import { useState } from "react";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading } from "@/components/exec/ExecUI";
import { Modal, SelectField, DateField, CheckField } from "@/components/exec/ExecForm";
import { CenterRefs } from "@/lib/execCenterApi";
import {
  orgModelApi, RaciItem, RaciWarning, RACI_ENTITY_LABEL, RACI_ROLE_LABEL,
} from "@/lib/execOrgModelApi";

const ENTITY_OPTIONS = Object.entries(RACI_ENTITY_LABEL).map(([value, label]) => ({ value, label }));
const ROLE_OPTIONS = Object.entries(RACI_ROLE_LABEL).map(([value, label]) => ({ value, label }));

/** RACI для process/initiative/project/result/milestone — единая матрица
 * exec_raci_matrix. Функции Центра используют отдельную готовую
 * exec_function_raci (её RACI показан на вкладке «Функции» дашборда Центра). */
export default function OrgRaciTab({ refs }: { refs: CenterRefs | null }) {
  const [entityType, setEntityType] = useState("initiative");
  const [entityId, setEntityId] = useState("");
  const [data, setData] = useState<{ items: RaciItem[]; warnings: RaciWarning[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const load = () => {
    const eid = Number(entityId);
    if (!eid) return;
    setLoading(true);
    setError("");
    orgModelApi
      .raciMatrix(entityType, eid)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  const save = async () => {
    setSaving(true);
    setSaveError("");
    try {
      await orgModelApi.saveRaciMatrix({ ...form, entity_type: entityType, entity_id: Number(entityId) });
      setAdding(false);
      setForm({});
      load();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const close = async (id: number) => {
    try {
      await orgModelApi.closeRaciMatrix(id);
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const personOptions = (refs?.persons || []).map((p) => ({ value: String(p.id), label: p.display_name }));
  const initiativeOptions = (refs?.initiatives || []).map((i) => ({ value: String(i.id), label: i.title }));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-end gap-3">
        <div className="w-52">
          <SelectField label="Тип объекта" value={entityType} onChange={setEntityType} options={ENTITY_OPTIONS} />
        </div>
        {entityType === "initiative" ? (
          <div className="w-64">
            <SelectField label="Объект" value={entityId} onChange={setEntityId} options={initiativeOptions} />
          </div>
        ) : (
          <div className="w-40">
            <label className="block">
              <span className="text-xs text-slate-500 mb-1.5 block">ID объекта</span>
              <input
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm outline-none focus:border-violet-600"
              />
            </label>
          </div>
        )}
        <button
          onClick={load}
          className="px-3 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700 transition-colors"
        >
          Показать
        </button>
      </div>

      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={load} />}

      {data && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          {data.warnings.length > 0 && (
            <div className="space-y-1.5">
              {data.warnings.map((w, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-center gap-2"
                >
                  <Icon name="TriangleAlert" size={13} />
                  {w.message}
                </div>
              ))}
            </div>
          )}

          {!data.items.length ? (
            <Empty text="Матрица RACI для этого объекта ещё не заполнена" icon="Table2" />
          ) : (
            <div className="divide-y divide-slate-100">
              {data.items.map((it) => (
                <div key={it.id} className="py-2 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium text-slate-900">{RACI_ROLE_LABEL[it.raci_role]}</span>
                    <span className="text-slate-700 ml-2">{it.person_name}</span>
                    {it.person_status !== "active" && (
                      <span className="ml-2 text-[11px] text-red-600">неактивен(на)</span>
                    )}
                  </div>
                  <button
                    onClick={() => close(it.id)}
                    className="text-xs text-slate-400 hover:text-red-600 transition-colors"
                  >
                    Завершить
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => setAdding(true)}
            className="text-sm text-violet-700 hover:text-violet-900 inline-flex items-center gap-1.5"
          >
            <Icon name="Plus" size={14} />
            Добавить назначение
          </button>
        </div>
      )}

      {adding && (
        <Modal
          title="Назначение RACI"
          onClose={() => setAdding(false)}
          onSave={save}
          saving={saving}
          error={saveError}
        >
          <SelectField
            label="Человек"
            value={String(form.person_id || "")}
            onChange={(v) => setForm({ ...form, person_id: Number(v) })}
            options={personOptions}
            required
          />
          <SelectField
            label="Роль RACI"
            value={String(form.raci_role || "R")}
            onChange={(v) => setForm({ ...form, raci_role: v })}
            options={ROLE_OPTIONS}
          />
          {form.raci_role === "A" && (
            <CheckField
              label="Разрешить коллективную ответственность (несколько A)"
              checked={!!form.is_collective_a}
              onChange={(v) => setForm({ ...form, is_collective_a: v })}
            />
          )}
          <DateField
            label="Действует с"
            value={String(form.valid_from || "")}
            onChange={(v) => setForm({ ...form, valid_from: v })}
          />
        </Modal>
      )}
    </div>
  );
}
