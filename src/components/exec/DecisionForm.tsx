import { useState } from "react";
import { Decision, Dictionaries, execApi, PersonRef } from "@/lib/execCabinetApi";
import {
  DateField,
  DictSelect,
  Modal,
  Section,
  SelectField,
  TextArea,
  TextField,
} from "./ExecForm";

export default function DecisionForm({
  decision,
  initiativeId,
  initiatives,
  decisionTypes,
  bodies,
  dicts,
  persons,
  onClose,
  onSaved,
}: {
  decision?: Decision | null;
  initiativeId?: number;
  initiatives: { id: number; title: string }[];
  decisionTypes: { code: string; title: string }[];
  bodies: { id: number; title: string }[];
  dicts: Dictionaries;
  persons: PersonRef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const d = decision;
  const [f, setF] = useState({
    initiative_id: String(d?.initiative_id || initiativeId || ""),
    decision_type_code: d?.decision_type_code || "",
    question: d?.question || "",
    basis: d?.basis || "",
    raised_at: d?.raised_at || new Date().toISOString().slice(0, 10),
    due_at: d?.due_at || "",
    status: d?.status || "raised",
    proposed_option: d?.proposed_option || "",
    materials: d?.materials || "",
    final_decision: d?.final_decision || "",
    decided_by_person_id: "",
    decided_by_body_id: "",
    decided_at: d?.decided_at || "",
    result_document: d?.result_document || "",
    execution_status: d?.execution_status || "not_started",
    control_result: "",
    escalation_level: d?.escalation_level || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const pickType = (code: string) => {
    setF((p) => ({
      ...p,
      decision_type_code: code,
      question: p.question || decisionTypes.find((t) => t.code === code)?.title || "",
    }));
  };

  const save = async () => {
    if (!f.initiative_id || !f.decision_type_code || !f.question.trim()) {
      setError("Заполните инициативу, тип решения и формулировку вопроса");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await execApi.saveDecision({
        ...(d ? { id: d.id } : {}),
        ...f,
        initiative_id: Number(f.initiative_id),
        decided_by_person_id: f.decided_by_person_id ? Number(f.decided_by_person_id) : null,
        decided_by_body_id: f.decided_by_body_id ? Number(f.decided_by_body_id) : null,
        raised_at: f.raised_at || null,
        due_at: f.due_at || null,
        decided_at: f.decided_at || null,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const isDecided = f.status === "decided";

  return (
    <Modal
      title={d ? "Редактирование решения" : "Новое управленческое решение"}
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={error}
      canSave={!!f.initiative_id && !!f.decision_type_code && !!f.question.trim()}
      wide
    >
      <Section title="Вопрос">
        <div className="grid sm:grid-cols-2 gap-4">
          <SelectField
            label="Инициатива"
            value={f.initiative_id}
            onChange={set("initiative_id")}
            options={initiatives.map((i) => ({ value: String(i.id), label: i.title }))}
            required
          />
          <SelectField
            label="Тип управленческого решения"
            value={f.decision_type_code}
            onChange={pickType}
            options={decisionTypes.map((t) => ({ value: t.code, label: t.title }))}
            required
          />
        </div>
        <TextArea
          label="Формулировка вопроса"
          value={f.question}
          onChange={set("question")}
          rows={2}
        />
        <TextArea label="Основание" value={f.basis} onChange={set("basis")} rows={2} />
        <TextArea
          label="Необходимые материалы"
          value={f.materials}
          onChange={set("materials")}
          rows={2}
        />
      </Section>

      <Section title="Сроки и статус">
        <div className="grid sm:grid-cols-2 gap-4">
          <DateField label="Дата возникновения" value={f.raised_at} onChange={set("raised_at")} />
          <DateField label="Требуемая дата решения" value={f.due_at} onChange={set("due_at")} />
          <DictSelect label="Статус" value={f.status} onChange={set("status")} values={dicts.decision_status} />
          <DictSelect
            label="Уровень эскалации"
            value={f.escalation_level}
            onChange={set("escalation_level")}
            values={dicts.escalation_level}
          />
        </div>
        <TextArea
          label="Предлагаемый вариант"
          value={f.proposed_option}
          onChange={set("proposed_option")}
          rows={2}
        />
      </Section>

      <Section title="Результат">
        <TextArea
          label="Фактически принятое решение"
          value={f.final_decision}
          onChange={set("final_decision")}
          rows={2}
          hint={isDecided ? "Обязательно при статусе «Решение принято»" : undefined}
        />
        <div className="grid sm:grid-cols-2 gap-4">
          <SelectField
            label="Принял коллегиальный орган"
            value={f.decided_by_body_id}
            onChange={set("decided_by_body_id")}
            options={bodies.map((b) => ({ value: String(b.id), label: b.title }))}
            hint="Либо орган, либо конкретное лицо"
          />
          <SelectField
            label="Принял единолично"
            value={f.decided_by_person_id}
            onChange={set("decided_by_person_id")}
            options={persons.map((p) => ({
              value: String(p.id),
              label: p.position_title ? `${p.display_name} — ${p.position_title}` : p.display_name,
            }))}
          />
          <DateField label="Дата принятия" value={f.decided_at} onChange={set("decided_at")} />
          <TextField
            label="Документ-основание"
            value={f.result_document}
            onChange={set("result_document")}
            placeholder="Например: Протокол Группы"
          />
          <DictSelect
            label="Статус исполнения"
            value={f.execution_status}
            onChange={set("execution_status")}
            values={dicts.execution_status}
          />
        </div>
        <TextArea
          label="Результат контроля"
          value={f.control_result}
          onChange={set("control_result")}
          rows={2}
        />
      </Section>
    </Modal>
  );
}
