import { useState } from "react";
import Icon from "@/components/ui/icon";
import { PersonRef } from "@/lib/execCabinetApi";
import {
  ESCALATION_LEVELS,
  ISSUE_CATEGORIES,
  Issue,
  controlApi,
} from "@/lib/execControlApi";
import {
  CheckField,
  DateField,
  Modal,
  Section,
  SelectField,
  TextArea,
  TextField,
} from "./ExecForm";

export default function IssueForm({
  issue,
  initiativeId,
  initiatives,
  persons,
  onClose,
  onSaved,
}: {
  issue?: Issue | null;
  initiativeId?: number;
  initiatives: { id: number; title: string }[];
  persons: PersonRef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const s = issue;
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    initiative_id: String(s?.initiative_id || initiativeId || ""),
    title: s?.title || "",
    description: s?.description || "",
    detected_at: s?.detected_at || today,
    category: s?.category || "",
    criticality: s?.criticality || "medium",
    root_cause: s?.root_cause || "",
    owner_person_id: s?.owner_person_id ? String(s.owner_person_id) : "",
    responsible_person_id: s?.responsible_person_id ? String(s.responsible_person_id) : "",
    action_plan: s?.action_plan || "",
    due_at: s?.due_at || "",
    status: s?.status || "open",
    resolution_criteria: s?.resolution_criteria || "",
    resolution_result: s?.resolution_result || "",
    resolved_at: s?.resolved_at || "",
    resolved_confirmed_by_person_id: s?.resolved_confirmed_by_person_id
      ? String(s.resolved_confirmed_by_person_id)
      : "",
    escalation_level: s?.escalation_level || "",
    block_what: s?.block_what || "",
    block_since: s?.block_since || today,
    block_who_can_lift: s?.block_who_can_lift || "",
    block_requirements: s?.block_requirements || "",
    block_escalation_level: s?.block_escalation_level || "",
    block_deadline: s?.block_deadline || "",
  });
  const [flags, setFlags] = useState({
    impact_deadline: s?.impact_deadline ?? false,
    impact_result: s?.impact_result ?? false,
    impact_cost: s?.impact_cost ?? false,
    impact_quality: s?.impact_quality ?? false,
    impact_compliance: s?.impact_compliance ?? false,
    needs_escalation: s?.needs_escalation ?? false,
    is_blocking: s?.is_blocking ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const setFlag = (k: keyof typeof flags) => (v: boolean) => setFlags((p) => ({ ...p, [k]: v }));

  const personOptions = persons.map((p) => ({
    value: String(p.id),
    label: p.position_title ? `${p.display_name} — ${p.position_title}` : p.display_name,
  }));

  const isResolving = f.status === "resolved" || f.status === "closed";

  const save = async () => {
    if (!f.initiative_id || !f.title.trim()) {
      setError("Укажите инициативу и название проблемы");
      return;
    }
    if (
      isResolving &&
      (!f.resolution_criteria.trim() ||
        !f.resolution_result.trim() ||
        !f.resolved_at ||
        !f.resolved_confirmed_by_person_id)
    ) {
      setError(
        "Устранение требует критерия, результата, даты и подтверждающего лица",
      );
      return;
    }
    if (
      flags.is_blocking &&
      (!f.block_what.trim() ||
        !f.block_since ||
        !f.block_who_can_lift.trim() ||
        !f.block_requirements.trim() ||
        !f.block_escalation_level ||
        !f.block_deadline)
    ) {
      setError("При блокировке заполните все шесть полей блока");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await controlApi.saveIssue({
        ...(s ? { id: s.id } : {}),
        ...f,
        ...flags,
        initiative_id: Number(f.initiative_id),
        owner_person_id: f.owner_person_id ? Number(f.owner_person_id) : null,
        responsible_person_id: f.responsible_person_id ? Number(f.responsible_person_id) : null,
        resolved_confirmed_by_person_id: f.resolved_confirmed_by_person_id
          ? Number(f.resolved_confirmed_by_person_id)
          : null,
        due_at: f.due_at || null,
        resolved_at: f.resolved_at || null,
        detected_at: f.detected_at || null,
        block_since: flags.is_blocking ? f.block_since : null,
        block_deadline: flags.is_blocking ? f.block_deadline : null,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={s ? "Проблема" : "Новая проблема"}
      subtitle="Проблема — событие, которое уже возникло"
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={error}
      canSave={!!f.initiative_id && !!f.title.trim()}
      wide
    >
      <Section title="Суть проблемы">
        <div className="grid sm:grid-cols-2 gap-4">
          <SelectField
            label="Инициатива"
            value={f.initiative_id}
            onChange={set("initiative_id")}
            options={initiatives.map((i) => ({ value: String(i.id), label: i.title }))}
            required
          />
          <SelectField
            label="Категория"
            value={f.category}
            onChange={set("category")}
            options={ISSUE_CATEGORIES.map((c) => ({ value: c.code, label: c.title }))}
          />
        </div>
        <TextField label="Краткое название" value={f.title} onChange={set("title")} required />
        <TextArea label="Описание" value={f.description} onChange={set("description")} rows={3} />
        <div className="grid sm:grid-cols-2 gap-4">
          <DateField label="Дата выявления" value={f.detected_at} onChange={set("detected_at")} />
          <SelectField
            label="Критичность"
            value={f.criticality}
            onChange={set("criticality")}
            options={[
              { value: "low", label: "Низкая" },
              { value: "medium", label: "Средняя" },
              { value: "high", label: "Высокая" },
              { value: "critical", label: "Критическая" },
            ]}
            hint={flags.is_blocking ? "При блокировке повышается автоматически" : undefined}
          />
        </div>
        <TextArea
          label="Причина"
          value={f.root_cause}
          onChange={set("root_cause")}
          rows={2}
          hint="Если подтверждена"
        />
      </Section>

      <Section title="Влияние">
        <div className="grid sm:grid-cols-2 gap-3">
          <CheckField label="На сроки" checked={flags.impact_deadline} onChange={setFlag("impact_deadline")} />
          <CheckField label="На результат" checked={flags.impact_result} onChange={setFlag("impact_result")} />
          <CheckField label="На стоимость" checked={flags.impact_cost} onChange={setFlag("impact_cost")} />
          <CheckField label="На качество" checked={flags.impact_quality} onChange={setFlag("impact_quality")} />
          <CheckField
            label="На соблюдение требований"
            checked={flags.impact_compliance}
            onChange={setFlag("impact_compliance")}
          />
        </div>
      </Section>

      <Section title="Устранение">
        <div className="grid sm:grid-cols-2 gap-4">
          <SelectField
            label="Владелец проблемы"
            value={f.owner_person_id}
            onChange={set("owner_person_id")}
            options={personOptions}
            hint="Отвечает за результат и эскалацию"
          />
          <SelectField
            label="Ответственный за устранение"
            value={f.responsible_person_id}
            onChange={set("responsible_person_id")}
            options={personOptions}
            hint="Выполняет конкретные действия"
          />
        </div>
        <TextArea label="План действий" value={f.action_plan} onChange={set("action_plan")} rows={2} />
        <div className="grid sm:grid-cols-2 gap-4">
          <DateField label="Срок устранения" value={f.due_at} onChange={set("due_at")} />
          <SelectField
            label="Статус"
            value={f.status}
            onChange={set("status")}
            options={[
              { value: "open", label: "Открыта" },
              { value: "in_progress", label: "В работе" },
              { value: "awaiting_decision", label: "Ожидает решения" },
              { value: "resolved", label: "Устранена" },
              { value: "closed", label: "Закрыта" },
              { value: "irrelevant", label: "Неактуальна" },
            ]}
          />
        </div>
        <TextArea
          label="Критерий устранения"
          value={f.resolution_criteria}
          onChange={set("resolution_criteria")}
          rows={2}
          hint="Без него нельзя перевести в «Устранена»"
        />
        {isResolving && (
          <div className="p-3 rounded-lg border border-green-500/30 bg-green-500/5 space-y-3">
            <p className="text-xs text-green-300 flex items-center gap-1.5">
              <Icon name="CircleCheck" size={13} />
              Подтверждение устранения
            </p>
            <TextArea
              label="Результат устранения"
              value={f.resolution_result}
              onChange={set("resolution_result")}
              rows={2}
            />
            <div className="grid sm:grid-cols-2 gap-4">
              <DateField label="Дата устранения" value={f.resolved_at} onChange={set("resolved_at")} />
              <SelectField
                label="Кто подтвердил"
                value={f.resolved_confirmed_by_person_id}
                onChange={set("resolved_confirmed_by_person_id")}
                options={personOptions}
              />
            </div>
          </div>
        )}
      </Section>

      <Section title="Эскалация и блокировка">
        <div className="grid sm:grid-cols-2 gap-4">
          <CheckField
            label="Требуется эскалация"
            checked={flags.needs_escalation}
            onChange={setFlag("needs_escalation")}
          />
          <SelectField
            label="Уровень эскалации"
            value={f.escalation_level}
            onChange={set("escalation_level")}
            options={ESCALATION_LEVELS.map((l) => ({ value: l.code, label: l.title }))}
          />
        </div>

        <CheckField
          label="Блокирует продвижение инициативы"
          checked={flags.is_blocking}
          onChange={setFlag("is_blocking")}
          hint="При включении шесть полей ниже обязательны"
        />

        {flags.is_blocking && (
          <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/5 space-y-3">
            <TextArea
              label="Что именно заблокировано"
              value={f.block_what}
              onChange={set("block_what")}
              rows={2}
            />
            <div className="grid sm:grid-cols-2 gap-4">
              <DateField label="Заблокировано с" value={f.block_since} onChange={set("block_since")} />
              <DateField
                label="Крайний срок снятия"
                value={f.block_deadline}
                onChange={set("block_deadline")}
              />
            </div>
            <TextField
              label="Кто может снять блокировку"
              value={f.block_who_can_lift}
              onChange={set("block_who_can_lift")}
            />
            <TextArea
              label="Что требуется для снятия"
              value={f.block_requirements}
              onChange={set("block_requirements")}
              rows={2}
            />
            <SelectField
              label="Уровень эскалации блокировки"
              value={f.block_escalation_level}
              onChange={set("block_escalation_level")}
              options={ESCALATION_LEVELS.map((l) => ({ value: l.code, label: l.title }))}
            />
          </div>
        )}
      </Section>
    </Modal>
  );
}
