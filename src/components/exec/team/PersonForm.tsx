import { useState } from "react";
import Icon from "@/components/ui/icon";
import { Modal, SelectField, TextField } from "@/components/exec/ExecForm";
import { Avatar } from "./TeamUI";
import { PersonDetail, TeamMember, peopleApi } from "@/lib/execPeopleApi";

export default function PersonForm({
  person,
  onClose,
  onSaved,
}: {
  person?: PersonDetail;
  onClose: () => void;
  onSaved: (id: number) => void;
}) {
  const [f, setF] = useState({
    display_name: person?.display_name || "",
    position_title: person?.position_title || "",
    org_name: person?.org_name || "",
    email: person?.email || "",
    phone: person?.phone || "",
    employment_type: person?.employment_type || "staff",
    employment_status: person?.employment_status || "active",
    note: person?.note || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dups, setDups] = useState<TeamMember[] | null>(null);

  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (confirmDuplicate = false) => {
    if (!f.display_name.trim()) {
      setError("Укажите ФИО");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const r = await peopleApi.savePerson({
        ...(person ? { id: person.id } : {}),
        ...f,
        confirm_duplicate: confirmDuplicate,
      });
      if (r.needs_confirmation && r.duplicates?.length) {
        setDups(r.duplicates);
        setSaving(false);
        return;
      }
      onSaved(r.id as number);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (dups) {
    return (
      <Modal
        title="Похожие карточки найдены"
        subtitle="Проверьте, не создаёте ли вы дубль"
        onClose={onClose}
        onSave={() => submit(true)}
        saving={saving}
        saveLabel="Всё равно создать"
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm text-amber-800 flex items-start gap-2">
              <Icon name="TriangleAlert" size={15} className="mt-0.5 flex-shrink-0" />
              <span>
                В справочнике уже есть похожие сотрудники. Проверьте, не создаёте ли дубль.
              </span>
            </p>
          </div>
          <div className="space-y-2">
            {dups.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-3 rounded-lg border border-slate-200 p-3"
              >
                <Avatar name={d.display_name} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">{d.display_name}</p>
                  <p className="text-xs text-slate-500">
                    {d.position_title || "Должность не указана"}
                    {d.org_name ? ` · ${d.org_name}` : ""}
                  </p>
                </div>
                <span className="text-xs text-slate-400">#{d.id}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => setDups(null)}
            className="text-sm text-violet-600 hover:text-violet-700 transition-colors"
          >
            Вернуться и изменить данные
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={person ? "Изменить сотрудника" : "Новый сотрудник"}
      onClose={onClose}
      onSave={() => submit(false)}
      saving={saving}
      canSave={!!f.display_name.trim()}
      error={error}
    >
      <div className="space-y-3">
        <TextField
          label="ФИО"
          value={f.display_name}
          onChange={(v) => set("display_name", v)}
          required
          placeholder="Иванов Иван Иванович"
        />
        <div className="grid sm:grid-cols-2 gap-3">
          <TextField
            label="Должность"
            value={f.position_title}
            onChange={(v) => set("position_title", v)}
            placeholder="Руководитель направления"
          />
          <TextField
            label="Подразделение"
            value={f.org_name}
            onChange={(v) => set("org_name", v)}
            placeholder="Департамент контроля"
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <TextField label="Электронная почта" value={f.email} onChange={(v) => set("email", v)} />
          <TextField label="Телефон" value={f.phone} onChange={(v) => set("phone", v)} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <SelectField
            label="Формат занятости"
            value={f.employment_type}
            onChange={(v) => set("employment_type", v)}
            options={[
              { value: "staff", label: "Штат" },
              { value: "parttime", label: "Совместитель" },
              { value: "contract", label: "Подряд" },
              { value: "intern", label: "Стажёр" },
            ]}
          />
          <SelectField
            label="Статус"
            value={f.employment_status}
            onChange={(v) => set("employment_status", v)}
            options={[
              { value: "active", label: "Работает" },
              { value: "leave", label: "В отпуске" },
              { value: "left", label: "Уволен" },
            ]}
          />
        </div>
        <TextField label="Примечание" value={f.note} onChange={(v) => set("note", v)} />

      </div>
    </Modal>
  );
}
