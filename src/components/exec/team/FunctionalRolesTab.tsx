import { useState } from "react";
import Icon from "@/components/ui/icon";
import { DateField, Modal, SelectField, TextArea, TextField } from "@/components/exec/ExecForm";
import { fmtDate } from "@/components/exec/ExecUI";
import {
  FUNCTIONAL_ROLE_STATUS,
  FUNCTIONAL_ROLE_TYPE,
  FunctionalRole,
  PARTICIPATION_FORMAT_LABEL,
  PeopleRefs,
  PersonDetail,
  peopleApi,
} from "@/lib/execPeopleApi";

/** Дополнительные функциональные роли сотрудника (например CDS) — не должность
 * и не назначение по инициативе, а отдельный координационный статус. */
export default function FunctionalRolesTab({
  person,
  refs,
  onChanged,
}: {
  person: PersonDetail;
  refs: PeopleRefs | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<FunctionalRole | null>(null);
  const roles = person.functional_roles || [];

  const remove = async (id: number) => {
    if (!window.confirm("Удалить функциональную роль?")) return;
    await peopleApi.deleteFunctionalRole(id);
    onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 flex items-start gap-2">
        <Icon name="Info" size={14} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          Здесь фиксируются дополнительные координационные роли сотрудника (например CDS) —
          они не меняют должность и подчинение и отделены от назначений на функции Центра по RACI.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Ролей: <span className="font-medium text-slate-700">{roles.length}</span>
        </p>
        <button
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
          className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs hover:bg-violet-700 transition-colors inline-flex items-center gap-1.5"
        >
          <Icon name="Plus" size={13} />
          Добавить роль
        </button>
      </div>

      {!roles.length ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center">
          <Icon name="ShieldCheck" size={26} className="text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-600 font-medium">
            Дополнительные функциональные роли не назначены
          </p>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Добавьте роль, если сотрудник координирует направление вне своей должности —
            например CDS, представитель в рабочей группе и т.п.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {roles.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{r.title}</p>
                    <span
                      className={`text-[11px] px-1.5 py-0.5 rounded border font-medium ${
                        FUNCTIONAL_ROLE_STATUS[r.status]?.cls ||
                        "bg-slate-100 text-slate-600 border-slate-200"
                      }`}
                    >
                      {FUNCTIONAL_ROLE_STATUS[r.status]?.title || r.status}
                    </span>
                  </div>
                  {r.scope && <p className="text-xs text-slate-500 mt-0.5">{r.scope}</p>}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => {
                      setEdit(r);
                      setOpen(true);
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                    title="Изменить"
                  >
                    <Icon name="Pencil" size={14} />
                  </button>
                  <button
                    onClick={() => remove(r.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Удалить"
                  >
                    <Icon name="Trash2" size={14} />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>{FUNCTIONAL_ROLE_TYPE[r.role_type] || r.role_type}</span>
                {r.participation_format && (
                  <span>· {PARTICIPATION_FORMAT_LABEL[r.participation_format] || r.participation_format}</span>
                )}
                {r.related_center_title && <span>· связано с «{r.related_center_title}»</span>}
                {r.date_from && <span>· с {fmtDate(r.date_from)}</span>}
              </div>

              {r.authority_source && (
                <div>
                  <p className="text-xs text-slate-400">Источник полномочий</p>
                  <p className="text-sm text-slate-700 mt-0.5">{r.authority_source}</p>
                </div>
              )}

              {r.purpose && (
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-xs text-slate-400">Цель роли</p>
                  <p className="text-sm text-slate-700 mt-0.5">{r.purpose}</p>
                </div>
              )}

              {r.duties && (
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-xs text-slate-400">Основные функции</p>
                  <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-line">{r.duties}</p>
                </div>
              )}

              {r.not_included && (
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-xs text-slate-400">Роль не включает</p>
                  <p className="text-sm text-slate-500 mt-0.5">{r.not_included}</p>
                </div>
              )}

              {r.note && (
                <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">{r.note}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {open && (
        <FunctionalRoleForm
          personId={person.id}
          item={edit}
          refs={refs}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function FunctionalRoleForm({
  personId,
  item,
  refs,
  onClose,
  onSaved,
}: {
  personId: number;
  item: FunctionalRole | null;
  refs: PeopleRefs | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    title: item?.title || "",
    scope: item?.scope || "",
    role_type: item?.role_type || "additional",
    status: item?.status || "assigned",
    participation_format: item?.participation_format || "matrix",
    authority_source: item?.authority_source || "",
    purpose: item?.purpose || "",
    duties: item?.duties || "",
    not_included: item?.not_included || "",
    related_center_id: item?.related_center_id ? String(item.related_center_id) : "",
    date_from: item?.date_from || "",
    date_to: item?.date_to || "",
    note: item?.note || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await peopleApi.saveFunctionalRole({
        ...(item ? { id: item.id } : {}),
        person_id: personId,
        ...f,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const typeOptions = Object.entries(FUNCTIONAL_ROLE_TYPE).map(([value, label]) => ({
    value,
    label,
  }));
  const statusOptions = [
    { value: "assigned", label: "Назначен" },
    { value: "proposed", label: "Предложен" },
    { value: "ended", label: "Завершён" },
  ];
  const formatOptions = Object.entries(PARTICIPATION_FORMAT_LABEL).map(([value, label]) => ({
    value,
    label,
  }));
  const centerOptions = (refs?.centers || []).map((c) => ({
    value: String(c.id),
    label: c.title,
  }));

  return (
    <Modal
      title={item ? "Изменить функциональную роль" : "Новая функциональная роль"}
      subtitle="Дополнительная координационная роль — не должность и не назначение по инициативе"
      onClose={onClose}
      onSave={save}
      saving={saving}
      canSave={!!f.title.trim()}
      error={error}
      wide
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <TextField
          label="Название роли"
          value={f.title}
          onChange={(v) => set("title", v)}
          placeholder="Например: CDS Блока внутреннего контроля"
          required
        />
        <TextField
          label="Контур / зона ответственности"
          value={f.scope}
          onChange={(v) => set("scope", v)}
          placeholder="Например: Блок внутреннего контроля"
        />
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <SelectField label="Тип роли" value={f.role_type} onChange={(v) => set("role_type", v)} options={typeOptions} />
        <SelectField label="Статус" value={f.status} onChange={(v) => set("status", v)} options={statusOptions} />
        <SelectField
          label="Формат участия"
          value={f.participation_format}
          onChange={(v) => set("participation_format", v)}
          options={formatOptions}
        />
      </div>

      <TextField
        label="Источник полномочий"
        value={f.authority_source}
        onChange={(v) => set("authority_source", v)}
        placeholder="Например: решение/назначение Блока, приказ, концепция роли"
      />

      {centerOptions.length > 0 && (
        <SelectField
          label="Связь с Центром"
          value={f.related_center_id}
          onChange={(v) => set("related_center_id", v)}
          options={centerOptions}
          hint="Необязательно — если роль связана с проектируемым Центром"
        />
      )}

      <TextArea label="Цель роли" value={f.purpose} onChange={(v) => set("purpose", v)} rows={2} />
      <TextArea
        label="Основные функции"
        value={f.duties}
        onChange={(v) => set("duties", v)}
        rows={4}
        hint="Можно перечислить пунктами через новую строку"
      />
      <TextArea
        label="Роль не включает (границы)"
        value={f.not_included}
        onChange={(v) => set("not_included", v)}
        rows={2}
      />

      <div className="grid sm:grid-cols-2 gap-4">
        <DateField label="Дата назначения" value={f.date_from} onChange={(v) => set("date_from", v)} />
        <DateField label="Дата окончания" value={f.date_to} onChange={(v) => set("date_to", v)} />
      </div>

      <TextArea label="Примечание" value={f.note} onChange={(v) => set("note", v)} rows={2} />
    </Modal>
  );
}
