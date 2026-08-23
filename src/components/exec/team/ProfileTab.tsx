import { useState } from "react";
import Icon from "@/components/ui/icon";
import { Empty, fmtDate } from "@/components/exec/ExecUI";
import { DateField, Modal, SelectField, TextArea, TextField } from "@/components/exec/ExecForm";
import {
  PeopleRefs,
  PersonDetail,
  ProfileRecord,
  RECORD_TYPE,
  peopleApi,
} from "@/lib/execPeopleApi";

export default function ProfileTab({
  person,
  refs,
  onChanged,
}: {
  person: PersonDetail;
  refs: PeopleRefs | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<ProfileRecord | null>(null);

  const remove = async (id: number) => {
    await peopleApi.deleteProfileRecord(id);
    onChanged();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end">
        <button
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
          className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs hover:bg-violet-700 transition-colors inline-flex items-center gap-1.5"
        >
          <Icon name="Plus" size={13} />
          Добавить запись
        </button>
      </div>

      {!person.profile_records.length ? (
        <Empty text="Опыт и образование не заполнены" icon="GraduationCap" />
      ) : (
        Object.entries(RECORD_TYPE).map(([type, meta]) => {
          const list = person.profile_records.filter((r) => r.record_type === type);
          if (!list.length) return null;
          return (
            <div key={type}>
              <p className="text-[11px] font-semibold text-violet-600/90 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Icon name={meta.icon} size={12} />
                {meta.title}
              </p>
              <div className="space-y-2">
                {list.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-lg border border-slate-200 bg-white p-3 flex items-start gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">{r.title}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-500">
                        {r.organization && <span>{r.organization}</span>}
                        {(r.date_from || r.date_to) && (
                          <span>
                            {r.date_from ? fmtDate(r.date_from) : "…"} —{" "}
                            {r.date_to ? fmtDate(r.date_to) : "по настоящее время"}
                          </span>
                        )}
                        {r.competency_name && (
                          <span className="inline-flex items-center gap-1 text-violet-600">
                            <Icon name="Link2" size={10} />
                            {r.competency_name}
                          </span>
                        )}
                      </div>
                      {r.description && (
                        <p className="text-xs text-slate-500 mt-1.5">{r.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => {
                          setEdit(r);
                          setOpen(true);
                        }}
                        className="text-slate-400 hover:text-violet-600 transition-colors"
                      >
                        <Icon name="Pencil" size={14} />
                      </button>
                      <button
                        onClick={() => remove(r.id)}
                        className="text-slate-400 hover:text-red-600 transition-colors"
                      >
                        <Icon name="Trash2" size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}

      {open && (
        <RecordForm
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

function RecordForm({
  personId,
  item,
  refs,
  onClose,
  onSaved,
}: {
  personId: number;
  item: ProfileRecord | null;
  refs: PeopleRefs | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    record_type: item?.record_type || "experience",
    title: item?.title || "",
    organization: item?.organization || "",
    description: item?.description || "",
    date_from: item?.date_from || "",
    date_to: item?.date_to || "",
    competency_id: item?.competency_id ? String(item.competency_id) : "",
    document_ref: item?.document_ref || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const isTool = f.record_type === "tool";

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await peopleApi.saveProfileRecord({
        person_id: personId,
        ...(item ? { id: item.id } : {}),
        ...f,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={item ? "Изменить запись" : "Добавить запись"}
      onClose={onClose}
      onSave={save}
      saving={saving}
      canSave={!!f.title.trim() && (!isTool || !!f.competency_id)}
      error={error}
    >
      <SelectField
        label="Тип записи"
        value={f.record_type}
        onChange={(v) => set("record_type", v)}
        options={Object.entries(RECORD_TYPE).map(([value, m]) => ({ value, label: m.title }))}
        placeholder="выберите"
      />
      <TextField
        label={isTool ? "Название инструмента" : "Название"}
        value={f.title}
        onChange={(v) => set("title", v)}
        required
      />
      {isTool && (
        <SelectField
          label="Связь с компетенцией"
          value={f.competency_id}
          onChange={(v) => set("competency_id", v)}
          required
          hint="Обязательно, чтобы не появлялись разные написания одного навыка"
          options={(refs?.competencies || []).map((c) => ({
            value: String(c.id),
            label: c.name,
          }))}
        />
      )}
      {!isTool && (
        <TextField
          label={f.record_type === "education" ? "Учебное заведение" : "Организация"}
          value={f.organization}
          onChange={(v) => set("organization", v)}
        />
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <DateField label="Начало" value={f.date_from} onChange={(v) => set("date_from", v)} />
        <DateField label="Окончание" value={f.date_to} onChange={(v) => set("date_to", v)} />
      </div>
      <TextArea
        label="Описание"
        value={f.description}
        onChange={(v) => set("description", v)}
        rows={2}
      />
      <TextField
        label="Ссылка на документ"
        value={f.document_ref}
        onChange={(v) => set("document_ref", v)}
      />
    </Modal>
  );
}
