import { useState } from "react";
import { Dictionaries, execApi, Initiative, PersonRef } from "@/lib/execCabinetApi";
import {
  DateField,
  DictSelect,
  Modal,
  Section,
  SelectField,
  TextArea,
  TextField,
} from "./ExecForm";

type Form = Record<string, string>;

function init(i?: Initiative | null): Form {
  return {
    title: i?.title || "",
    summary: i?.summary || "",
    problem: i?.problem || "",
    goal: i?.goal || "",
    expected_result: i?.expected_result || "",
    status: i?.status || "idea",
    stage: i?.stage || "",
    priority: i?.priority || "",
    scale: i?.scale || "",
    realization_form: i?.realization_form || "",
    plan_start: i?.plan_start || "",
    plan_end: i?.plan_end || "",
    solution_title: i?.solution_title || "",
    solution_type: i?.solution_type || "",
    escalation_level: i?.escalation_level || "",
    effect_description: i?.effect_description || "",
    effect_metric: i?.effect_metric || "",
    effect_baseline: i?.effect_baseline || "",
    effect_target: i?.effect_target || "",
    effect_actual: i?.effect_actual || "",
    budget_need: i?.budget_need || "",
    budget_source: i?.budget_source || "",
    owner_person_id: i?.owner_person_id ? String(i.owner_person_id) : "",
    manager_person_id: i?.manager_person_id ? String(i.manager_person_id) : "",
    curator_person_id: i?.curator_person_id ? String(i.curator_person_id) : "",
    effect_owner_person_id: i?.effect_owner_person_id ? String(i.effect_owner_person_id) : "",
  };
}

export default function InitiativeForm({
  initiative,
  dicts,
  persons,
  onClose,
  onSaved,
}: {
  initiative?: Initiative | null;
  dicts: Dictionaries;
  persons: PersonRef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState<Form>(init(initiative));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const personOptions = persons.map((p) => ({
    value: String(p.id),
    label: p.position_title ? `${p.display_name} — ${p.position_title}` : p.display_name,
  }));

  const save = async () => {
    if (!f.title.trim()) {
      setError("Укажите наименование инициативы");
      return;
    }
    setSaving(true);
    setError("");
    const payload: Record<string, unknown> = { ...f };
    if (initiative) payload.id = initiative.id;
    [
      "owner_person_id",
      "manager_person_id",
      "curator_person_id",
      "effect_owner_person_id",
    ].forEach((k) => {
      payload[k] = f[k] ? Number(f[k]) : null;
    });
    ["plan_start", "plan_end"].forEach((k) => {
      payload[k] = f[k] || null;
    });
    try {
      await execApi.saveInitiative(payload);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={initiative ? "Редактирование инициативы" : "Новая инициатива"}
      subtitle={initiative?.code || undefined}
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={error}
      canSave={!!f.title.trim()}
      wide
    >
      <Section title="Основное">
        <TextField
          label="Наименование инициативы"
          value={f.title}
          onChange={set("title")}
          placeholder="Например: Автоматизация мониторинга инициатив"
          required
        />
        <TextArea
          label="Краткое описание"
          value={f.summary}
          onChange={set("summary")}
          rows={2}
        />
        <TextArea
          label="Проблема или потребность"
          value={f.problem}
          onChange={set("problem")}
          rows={3}
          hint="Что именно сейчас работает не так"
        />
        <TextArea label="Цель" value={f.goal} onChange={set("goal")} rows={2} />
        <TextArea
          label="Ожидаемый результат"
          value={f.expected_result}
          onChange={set("expected_result")}
          rows={2}
        />
      </Section>

      <Section title="Классификация">
        <div className="grid sm:grid-cols-2 gap-4">
          <DictSelect label="Статус" value={f.status} onChange={set("status")} values={dicts.initiative_status} required />
          <DictSelect label="Этап" value={f.stage} onChange={set("stage")} values={dicts.initiative_stage} />
          <DictSelect label="Приоритет" value={f.priority} onChange={set("priority")} values={dicts.priority} />
          <DictSelect label="Масштаб" value={f.scale} onChange={set("scale")} values={dicts.scale} />
          <DictSelect
            label="Форма реализации"
            value={f.realization_form}
            onChange={set("realization_form")}
            values={dicts.realization_form}
          />
          <DictSelect
            label="Уровень эскалации"
            value={f.escalation_level}
            onChange={set("escalation_level")}
            values={dicts.escalation_level}
          />
          <DateField label="Плановое начало" value={f.plan_start} onChange={set("plan_start")} />
          <DateField label="Плановое окончание" value={f.plan_end} onChange={set("plan_end")} />
        </div>
      </Section>

      <Section title="Роли">
        <div className="grid sm:grid-cols-2 gap-4">
          <SelectField
            label="Владелец инициативы"
            value={f.owner_person_id}
            onChange={set("owner_person_id")}
            options={personOptions}
            hint="Отвечает за результат"
          />
          <SelectField
            label="Руководитель инициативы"
            value={f.manager_person_id}
            onChange={set("manager_person_id")}
            options={personOptions}
          />
          <SelectField
            label="Куратор"
            value={f.curator_person_id}
            onChange={set("curator_person_id")}
            options={personOptions}
          />
          <SelectField
            label="Владелец эффекта"
            value={f.effect_owner_person_id}
            onChange={set("effect_owner_person_id")}
            options={personOptions}
            hint="Подтверждает достижение результата"
          />
        </div>
      </Section>

      <Section title="Создаваемое решение">
        <div className="grid sm:grid-cols-2 gap-4">
          <TextField
            label="Наименование решения"
            value={f.solution_title}
            onChange={set("solution_title")}
          />
          <DictSelect
            label="Тип решения"
            value={f.solution_type}
            onChange={set("solution_type")}
            values={dicts.solution_type}
          />
        </div>
      </Section>

      <Section title="Эффект и бюджет">
        <TextArea
          label="Описание эффекта"
          value={f.effect_description}
          onChange={set("effect_description")}
          rows={2}
        />
        <div className="grid sm:grid-cols-2 gap-4">
          <TextField label="Показатель эффекта" value={f.effect_metric} onChange={set("effect_metric")} />
          <TextField label="Базовое значение" value={f.effect_baseline} onChange={set("effect_baseline")} />
          <TextField label="Целевое значение" value={f.effect_target} onChange={set("effect_target")} />
          <TextField label="Фактическое значение" value={f.effect_actual} onChange={set("effect_actual")} />
          <TextField label="Бюджетная потребность" value={f.budget_need} onChange={set("budget_need")} />
          <TextField label="Источник финансирования" value={f.budget_source} onChange={set("budget_source")} />
        </div>
      </Section>
    </Modal>
  );
}
