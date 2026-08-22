import { useState } from "react";
import {
  InitiativeRef,
  PRIORITY_LABEL,
  PersonRef,
  PLAN_STATUS,
  Plan,
  plannerApi,
} from "@/lib/execPlannerApi";
import { DateField, Modal, Section, SelectField, TextArea, TextField } from "./ExecForm";

export default function PlanForm({
  plan,
  persons,
  initiatives,
  onClose,
  onSaved,
}: {
  plan?: Plan | null;
  persons: PersonRef[];
  initiatives: InitiativeRef[];
  onClose: () => void;
  onSaved: (id: number) => void;
}) {
  const [f, setF] = useState({
    title: plan?.title || "",
    goal: plan?.goal || "",
    initiative_id: plan?.initiative_id ? String(plan.initiative_id) : "",
    owner_person_id: plan?.owner_person_id ? String(plan.owner_person_id) : "",
    start_date: plan?.start_date || "",
    due_date: plan?.due_date || "",
    status: plan?.status || "active",
    priority: plan?.priority || "medium",
    note: plan?.note || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.title.trim()) {
      setError("Укажите название задачи");
      return;
    }
    if (f.start_date && f.due_date && f.start_date > f.due_date) {
      setError("Дата начала позже общего срока");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const r = await plannerApi.savePlan({
        ...(plan ? { id: plan.id } : {}),
        ...f,
        initiative_id: f.initiative_id || null,
        owner_person_id: f.owner_person_id || null,
      });
      onSaved(r.id);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={plan ? "Задача руководителя" : "Новая задача"}
      subtitle="Из задачи разворачивается пошаговый план со сроками и ответственными"
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={error}
      canSave={!!f.title.trim()}
    >
      <Section title="Задача">
        <TextField
          label="Что нужно сделать"
          value={f.title}
          onChange={set("title")}
          placeholder="Например: Запустить мониторинг инициатив блока"
          required
        />
        <TextArea
          label="Цель и ожидаемый результат"
          value={f.goal}
          onChange={set("goal")}
          rows={3}
        />
      </Section>

      <Section title="Рамки">
        <div className="grid sm:grid-cols-2 gap-4">
          <DateField label="Начало" value={f.start_date} onChange={set("start_date")} />
          <DateField label="Общий срок" value={f.due_date} onChange={set("due_date")} />
          <SelectField
            label="Статус"
            value={f.status}
            onChange={set("status")}
            options={Object.entries(PLAN_STATUS)
              .filter(([k]) => k !== "archived")
              .map(([k, v]) => ({ value: k, label: v.title }))}
          />
          <SelectField
            label="Приоритет"
            value={f.priority}
            onChange={set("priority")}
            options={Object.entries(PRIORITY_LABEL).map(([k, v]) => ({ value: k, label: v }))}
          />
        </div>
      </Section>

      <Section title="Связи">
        <div className="grid sm:grid-cols-2 gap-4">
          <SelectField
            label="Владелец задачи"
            value={f.owner_person_id}
            onChange={set("owner_person_id")}
            options={persons.map((p) => ({
              value: String(p.id),
              label: p.position_title ? `${p.display_name} — ${p.position_title}` : p.display_name,
            }))}
          />
          <SelectField
            label="Инициатива"
            value={f.initiative_id}
            onChange={set("initiative_id")}
            options={initiatives.map((i) => ({ value: String(i.id), label: i.title }))}
            hint="Если задача — часть инициативы"
          />
        </div>
        <TextArea label="Примечание" value={f.note} onChange={set("note")} rows={2} />
      </Section>
    </Modal>
  );
}
