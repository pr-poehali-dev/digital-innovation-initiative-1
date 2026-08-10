import { useState } from "react";
import { Dictionaries, execApi, PersonRef, Stakeholder } from "@/lib/execCabinetApi";
import {
  CheckField,
  DateField,
  DictSelect,
  Modal,
  Section,
  SelectField,
  TextArea,
  TextField,
} from "./ExecForm";

export default function StakeholderForm({
  stakeholder,
  initiativeId,
  initiatives,
  dicts,
  persons,
  onClose,
  onSaved,
}: {
  stakeholder?: Stakeholder | null;
  initiativeId?: number;
  initiatives: { id: number; title: string }[];
  dicts: Dictionaries;
  persons: PersonRef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const s = stakeholder;
  const [f, setF] = useState({
    initiative_id: String(s?.initiative_id || initiativeId || ""),
    person_id: s?.person_id ? String(s.person_id) : "",
    role_in_initiative: s?.role_in_initiative || "",
    formal_participation: String(s?.formal_participation ?? 3),
    participation_state: s?.participation_state || "no_data",
    position_on_topic: s?.position_on_topic || "",
    confirmed_requirements: s?.confirmed_requirements || "",
    stated_remarks: s?.stated_remarks || "",
    support_conditions: s?.support_conditions || "",
    open_questions: s?.open_questions || "",
    noninvolvement_risk: s?.noninvolvement_risk || "no_data",
    engagement_goal: s?.engagement_goal || "",
    key_messages: s?.key_messages || "",
    contact_format: s?.contact_format || "",
    contact_frequency: s?.contact_frequency || "",
    responsible_person_id: s?.responsible_person_id ? String(s.responsible_person_id) : "",
    next_action: s?.next_action || "",
    next_action_due: s?.next_action_due || "",
    engagement_status: s?.engagement_status || "planned",
  });
  const [flags, setFlags] = useState({
    can_decide: s?.can_decide ?? false,
    must_approve: s?.must_approve ?? false,
    can_block: s?.can_block ?? false,
    controls_resource: s?.controls_resource ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const setFlag = (k: keyof typeof flags) => (v: boolean) => setFlags((p) => ({ ...p, [k]: v }));

  const personOptions = persons.map((p) => ({
    value: String(p.id),
    label: p.position_title ? `${p.display_name} — ${p.position_title}` : p.display_name,
  }));

  const save = async () => {
    if (!f.initiative_id || !f.person_id) {
      setError("Выберите инициативу и участника");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await execApi.saveStakeholder({
        ...(s ? { id: s.id } : {}),
        ...f,
        ...flags,
        initiative_id: Number(f.initiative_id),
        person_id: Number(f.person_id),
        formal_participation: Number(f.formal_participation),
        responsible_person_id: f.responsible_person_id ? Number(f.responsible_person_id) : null,
        next_action_due: f.next_action_due || null,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={s ? "Редактирование стейкхолдера" : "Новый стейкхолдер"}
      subtitle="Фиксируются только проверяемые факты, без оценки личности"
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={error}
      canSave={!!f.initiative_id && !!f.person_id}
      wide
    >
      <Section title="Кто и где">
        <div className="grid sm:grid-cols-2 gap-4">
          <SelectField
            label="Инициатива"
            value={f.initiative_id}
            onChange={set("initiative_id")}
            options={initiatives.map((i) => ({ value: String(i.id), label: i.title }))}
            required
          />
          <SelectField
            label="Участник"
            value={f.person_id}
            onChange={set("person_id")}
            options={personOptions}
            required
          />
          <TextField
            label="Роль в отношении инициативы"
            value={f.role_in_initiative}
            onChange={set("role_in_initiative")}
            placeholder="Например: функциональный заказчик"
          />
          <SelectField
            label="Уровень формального участия"
            value={f.formal_participation}
            onChange={set("formal_participation")}
            options={[
              { value: "5", label: "5 — ключевой участник" },
              { value: "4", label: "4 — высокий" },
              { value: "3", label: "3 — средний" },
              { value: "2", label: "2 — низкий" },
              { value: "1", label: "1 — минимальный" },
            ]}
            hint="Определяется полномочиями, а не мнением"
          />
        </div>
      </Section>

      <Section title="Формальные полномочия">
        <div className="grid sm:grid-cols-2 gap-3">
          <CheckField
            label="Принимает окончательное решение"
            checked={flags.can_decide}
            onChange={setFlag("can_decide")}
          />
          <CheckField
            label="Обязательно согласовывает"
            checked={flags.must_approve}
            onChange={setFlag("must_approve")}
          />
          <CheckField
            label="Может заблокировать продвижение"
            checked={flags.can_block}
            onChange={setFlag("can_block")}
          />
          <CheckField
            label="Контролирует необходимый ресурс"
            checked={flags.controls_resource}
            onChange={setFlag("controls_resource")}
          />
        </div>
      </Section>

      <Section title="Подтверждаемые сведения">
        <div className="grid sm:grid-cols-2 gap-4">
          <DictSelect
            label="Состояние участия"
            value={f.participation_state}
            onChange={set("participation_state")}
            values={dicts.participation_state}
            hint="Каждое состояние подтверждается фактом"
          />
          <DictSelect
            label="Риск невовлечения"
            value={f.noninvolvement_risk}
            onChange={set("noninvolvement_risk")}
            values={dicts.noninvolvement_risk}
          />
        </div>
        <TextArea
          label="Позиция по вопросу"
          value={f.position_on_topic}
          onChange={set("position_on_topic")}
          rows={2}
          hint="Выраженная позиция, а не предположение о лояльности"
        />
        <div className="grid sm:grid-cols-2 gap-4">
          <TextArea
            label="Подтверждённые требования"
            value={f.confirmed_requirements}
            onChange={set("confirmed_requirements")}
            rows={2}
          />
          <TextArea
            label="Выраженные замечания"
            value={f.stated_remarks}
            onChange={set("stated_remarks")}
            rows={2}
          />
          <TextArea
            label="Условия поддержки"
            value={f.support_conditions}
            onChange={set("support_conditions")}
            rows={2}
          />
          <TextArea
            label="Нерешённые вопросы"
            value={f.open_questions}
            onChange={set("open_questions")}
            rows={2}
          />
        </div>
      </Section>

      <Section title="Взаимодействие">
        <TextArea
          label="Цель взаимодействия"
          value={f.engagement_goal}
          onChange={set("engagement_goal")}
          rows={2}
        />
        <TextArea
          label="Ключевые сообщения"
          value={f.key_messages}
          onChange={set("key_messages")}
          rows={2}
        />
        <div className="grid sm:grid-cols-2 gap-4">
          <TextField label="Формат контакта" value={f.contact_format} onChange={set("contact_format")} />
          <TextField
            label="Периодичность"
            value={f.contact_frequency}
            onChange={set("contact_frequency")}
          />
          <SelectField
            label="Ответственный за взаимодействие"
            value={f.responsible_person_id}
            onChange={set("responsible_person_id")}
            options={personOptions}
          />
          <DictSelect
            label="Статус взаимодействия"
            value={f.engagement_status}
            onChange={set("engagement_status")}
            values={dicts.engagement_status}
          />
        </div>
        <TextArea
          label="Ближайшее действие"
          value={f.next_action}
          onChange={set("next_action")}
          rows={2}
        />
        <DateField label="Срок действия" value={f.next_action_due} onChange={set("next_action_due")} />
      </Section>
    </Modal>
  );
}
