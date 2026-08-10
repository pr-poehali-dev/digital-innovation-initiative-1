import { useState } from "react";
import Icon from "@/components/ui/icon";
import { PersonRef } from "@/lib/execCabinetApi";
import { Milestone, MILESTONE_TYPES, controlApi } from "@/lib/execControlApi";
import { DateField, Modal, Section, SelectField, TextArea, TextField } from "./ExecForm";

export default function MilestoneForm({
  milestone,
  initiativeId,
  initiatives,
  milestones,
  decisions,
  persons,
  onClose,
  onSaved,
}: {
  milestone?: Milestone | null;
  initiativeId?: number;
  initiatives: { id: number; title: string }[];
  milestones: Milestone[];
  decisions: { id: number; question: string }[];
  persons: PersonRef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const m = milestone;
  const [f, setF] = useState({
    initiative_id: String(m?.initiative_id || initiativeId || ""),
    title: m?.title || "",
    milestone_type: m?.milestone_type || "",
    plan_date: m?.plan_date || "",
    fact_date: m?.fact_date || "",
    status: m?.status || "not_started",
    responsible_person_id: m?.responsible_person_id ? String(m.responsible_person_id) : "",
    depends_on_milestone_id: m?.depends_on_milestone_id ? String(m.depends_on_milestone_id) : "",
    decision_id: m?.decision_id ? String(m.decision_id) : "",
    achievement_criteria: m?.achievement_criteria || "",
    achievement_evidence: m?.achievement_evidence || "",
    confirmed_by_person_id: m?.confirmed_by_person_id ? String(m.confirmed_by_person_id) : "",
    reschedule_reason: "",
    reschedule_approved_by: "",
    comment: m?.comment || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const dateChanged = !!m && !!f.plan_date && f.plan_date.slice(0, 10) !== (m.plan_date || "").slice(0, 10);
  const isAchieved = f.status === "achieved";

  const personOptions = persons.map((p) => ({
    value: String(p.id),
    label: p.position_title ? `${p.display_name} — ${p.position_title}` : p.display_name,
  }));

  const save = async () => {
    if (!f.initiative_id || !f.title.trim()) {
      setError("Укажите инициативу и наименование точки");
      return;
    }
    if (isAchieved && (!f.achievement_evidence.trim() || !f.fact_date || !f.confirmed_by_person_id)) {
      setError(
        "Достижение требует подтверждающего результата, фактической даты и подтверждающего лица",
      );
      return;
    }
    if (dateChanged && !f.reschedule_reason.trim()) {
      setError("Укажите причину переноса срока");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await controlApi.saveMilestone({
        ...(m ? { id: m.id } : {}),
        ...f,
        initiative_id: Number(f.initiative_id),
        responsible_person_id: f.responsible_person_id ? Number(f.responsible_person_id) : null,
        depends_on_milestone_id: f.depends_on_milestone_id
          ? Number(f.depends_on_milestone_id)
          : null,
        decision_id: f.decision_id ? Number(f.decision_id) : null,
        confirmed_by_person_id: f.confirmed_by_person_id
          ? Number(f.confirmed_by_person_id)
          : null,
        plan_date: f.plan_date || null,
        fact_date: f.fact_date || null,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const depOptions = milestones
    .filter((x) => x.id !== m?.id && String(x.initiative_id) === f.initiative_id)
    .map((x) => ({ value: String(x.id), label: x.title }));

  return (
    <Modal
      title={m ? "Контрольная точка" : "Новая контрольная точка"}
      subtitle="Просрочка определяется автоматически по плановой дате"
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={error}
      canSave={!!f.initiative_id && !!f.title.trim()}
      wide
    >
      <Section title="Основное">
        <div className="grid sm:grid-cols-2 gap-4">
          <SelectField
            label="Инициатива"
            value={f.initiative_id}
            onChange={set("initiative_id")}
            options={initiatives.map((i) => ({ value: String(i.id), label: i.title }))}
            required
          />
          <SelectField
            label="Тип точки"
            value={f.milestone_type}
            onChange={set("milestone_type")}
            options={MILESTONE_TYPES.map((t) => ({ value: t.code, label: t.title }))}
          />
        </div>
        <TextField
          label="Наименование контрольной точки"
          value={f.title}
          onChange={set("title")}
          placeholder="Например: Согласована концепция решения"
          required
        />
        <div className="grid sm:grid-cols-2 gap-4">
          <SelectField
            label="Статус"
            value={f.status}
            onChange={set("status")}
            options={[
              { value: "not_started", label: "Не начато" },
              { value: "in_progress", label: "В работе" },
              { value: "achieved", label: "Достигнуто" },
              { value: "cancelled", label: "Отменено" },
            ]}
            hint="«Просрочено» ставится системой, не вручную"
          />
          <SelectField
            label="Ответственный"
            value={f.responsible_person_id}
            onChange={set("responsible_person_id")}
            options={personOptions}
          />
        </div>
      </Section>

      <Section title="Сроки">
        {m?.plan_date_original && (
          <div className="p-3 rounded-lg bg-gray-900 border border-gray-800 flex items-center gap-4 flex-wrap">
            <div>
              <p className="text-xs text-gray-500">Первоначальная дата</p>
              <p className="text-sm text-gray-300">
                {new Date(m.plan_date_original).toLocaleDateString("ru-RU")}
              </p>
            </div>
            {m.reschedule_count > 0 && (
              <span className="text-xs px-2 py-1 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                переносов: {m.reschedule_count}
              </span>
            )}
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <DateField label="Плановая дата" value={f.plan_date} onChange={set("plan_date")} />
          <DateField label="Фактическая дата" value={f.fact_date} onChange={set("fact_date")} />
        </div>
        {dateChanged && (
          <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-3">
            <p className="text-xs text-amber-300 flex items-center gap-1.5">
              <Icon name="CalendarClock" size={13} />
              Срок переносится — укажите основание
            </p>
            <TextArea
              label="Причина переноса"
              value={f.reschedule_reason}
              onChange={set("reschedule_reason")}
              rows={2}
            />
            <TextField
              label="Кто согласовал перенос"
              value={f.reschedule_approved_by}
              onChange={set("reschedule_approved_by")}
            />
          </div>
        )}
      </Section>

      <Section title="Критерий достижения">
        <TextArea
          label="Ожидаемый результат — критерий достижения"
          value={f.achievement_criteria}
          onChange={set("achievement_criteria")}
          rows={2}
          hint="Например: получено согласование владельца процесса и ИТ-исполнителя"
        />
        <TextArea
          label="Подтверждающий результат"
          value={f.achievement_evidence}
          onChange={set("achievement_evidence")}
          rows={2}
          hint={isAchieved ? "Обязательно при статусе «Достигнуто»" : "Документ, решение, ссылка"}
        />
        <SelectField
          label="Кто подтвердил достижение"
          value={f.confirmed_by_person_id}
          onChange={set("confirmed_by_person_id")}
          options={personOptions}
          hint={isAchieved ? "Обязательно при статусе «Достигнуто»" : undefined}
        />
      </Section>

      <Section title="Связи">
        <div className="grid sm:grid-cols-2 gap-4">
          <SelectField
            label="Зависит от точки"
            value={f.depends_on_milestone_id}
            onChange={set("depends_on_milestone_id")}
            options={depOptions}
            hint="Не может достигаться раньше предшествующей"
          />
          <SelectField
            label="Связанное решение"
            value={f.decision_id}
            onChange={set("decision_id")}
            options={decisions.map((d) => ({ value: String(d.id), label: d.question }))}
          />
        </div>
        <TextArea label="Комментарий" value={f.comment} onChange={set("comment")} rows={2} />
      </Section>
    </Modal>
  );
}
