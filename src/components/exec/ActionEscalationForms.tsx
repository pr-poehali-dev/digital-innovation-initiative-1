import { useState } from "react";
import Icon from "@/components/ui/icon";
import { PersonRef } from "@/lib/execCabinetApi";
import {
  ControlAction,
  ESCALATION_LEVELS,
  Escalation,
  controlApi,
} from "@/lib/execControlApi";
import { DateField, Modal, Section, SelectField, TextArea } from "./ExecForm";

export function ActionForm({
  action,
  target,
  persons,
  decisions,
  onClose,
  onSaved,
}: {
  action?: ControlAction | null;
  target: { kind: "issue" | "risk"; id: number; title: string };
  persons: PersonRef[];
  decisions: { id: number; question: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const a = action;
  const [f, setF] = useState({
    description: a?.description || "",
    responsible_person_id: a?.responsible_person_id ? String(a.responsible_person_id) : "",
    start_date: a?.start_date || "",
    due_at: a?.due_at || "",
    fact_date: a?.fact_date || "",
    status: a?.status || "not_started",
    completion_criteria: a?.completion_criteria || "",
    result: a?.result || "",
    delay_reason: a?.delay_reason || "",
    decision_id: a?.decision_id ? String(a.decision_id) : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k: string) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const isDone = f.status === "done";

  const save = async () => {
    if (!f.description.trim()) {
      setError("Опишите действие");
      return;
    }
    if (isDone && (!f.result.trim() || !f.fact_date)) {
      setError("Выполненное действие требует результата и фактической даты");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await controlApi.saveAction({
        ...(a ? { id: a.id } : {}),
        ...f,
        issue_id: target.kind === "issue" ? target.id : null,
        risk_id: target.kind === "risk" ? target.id : null,
        responsible_person_id: f.responsible_person_id ? Number(f.responsible_person_id) : null,
        decision_id: f.decision_id ? Number(f.decision_id) : null,
        start_date: f.start_date || null,
        due_at: f.due_at || null,
        fact_date: f.fact_date || null,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={a ? "Действие" : "Новое действие"}
      subtitle={`${target.kind === "issue" ? "По проблеме" : "По риску"}: ${target.title}`}
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={error}
      canSave={!!f.description.trim()}
    >
      <TextArea label="Описание действия" value={f.description} onChange={set("description")} rows={2} />
      <div className="grid sm:grid-cols-2 gap-4">
        <SelectField
          label="Ответственный"
          value={f.responsible_person_id}
          onChange={set("responsible_person_id")}
          options={persons.map((p) => ({
            value: String(p.id),
            label: p.position_title ? `${p.display_name} — ${p.position_title}` : p.display_name,
          }))}
        />
        <SelectField
          label="Статус"
          value={f.status}
          onChange={set("status")}
          options={[
            { value: "not_started", label: "Не начато" },
            { value: "in_progress", label: "В работе" },
            { value: "done", label: "Выполнено" },
            { value: "cancelled", label: "Отменено" },
            { value: "needs_review", label: "Требует пересмотра" },
          ]}
          hint="«Просрочено» определяется по дате"
        />
        <DateField label="Дата начала" value={f.start_date} onChange={set("start_date")} />
        <DateField label="Срок" value={f.due_at} onChange={set("due_at")} />
      </div>
      <TextArea
        label="Критерий завершения"
        value={f.completion_criteria}
        onChange={set("completion_criteria")}
        rows={2}
      />
      {isDone && (
        <div className="p-3 rounded-lg border border-green-500/30 bg-green-500/5 space-y-3">
          <TextArea label="Результат" value={f.result} onChange={set("result")} rows={2} />
          <DateField label="Фактическая дата завершения" value={f.fact_date} onChange={set("fact_date")} />
        </div>
      )}
      <TextArea
        label="Причина просрочки"
        value={f.delay_reason}
        onChange={set("delay_reason")}
        rows={2}
      />
      <SelectField
        label="Выполняется по решению"
        value={f.decision_id}
        onChange={set("decision_id")}
        options={decisions.map((d) => ({ value: String(d.id), label: d.question }))}
        hint="Если действие вытекает из решения Группы"
      />
    </Modal>
  );
}

export function EscalationForm({
  escalation,
  target,
  persons,
  bodies,
  decisions,
  onClose,
  onSaved,
}: {
  escalation?: Escalation | null;
  target: { kind: "issue" | "risk"; id: number; title: string };
  persons: PersonRef[];
  bodies: { id: number; title: string }[];
  decisions: { id: number; question: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const e = escalation;
  const [f, setF] = useState({
    level_code: e?.level_code || "group",
    passed_at: e?.passed_at || new Date().toISOString().slice(0, 10),
    reason: e?.reason || "",
    prepared_by_person_id: "",
    passed_to_person_id: "",
    passed_to_body_id: "",
    review_due_at: e?.review_due_at || "",
    decision_text: e?.decision_text || "",
    decided_at: e?.decided_at || "",
    result: e?.result || "",
    decision_id: e?.decision_id ? String(e.decision_id) : "",
    status: e?.status || "sent",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k: string) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const personOptions = persons.map((p) => ({
    value: String(p.id),
    label: p.position_title ? `${p.display_name} — ${p.position_title}` : p.display_name,
  }));

  const save = async () => {
    if (!f.level_code || !f.passed_at) {
      setError("Укажите уровень и дату передачи");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await controlApi.saveEscalation({
        ...(e ? { id: e.id } : {}),
        ...f,
        issue_id: target.kind === "issue" ? target.id : null,
        risk_id: target.kind === "risk" ? target.id : null,
        prepared_by_person_id: f.prepared_by_person_id ? Number(f.prepared_by_person_id) : null,
        passed_to_person_id: f.passed_to_person_id ? Number(f.passed_to_person_id) : null,
        passed_to_body_id: f.passed_to_body_id ? Number(f.passed_to_body_id) : null,
        decision_id: f.decision_id ? Number(f.decision_id) : null,
        review_due_at: f.review_due_at || null,
        decided_at: f.decided_at || null,
      });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={e ? "Запись эскалации" : "Передать на следующий уровень"}
      subtitle={`${target.kind === "issue" ? "По проблеме" : "По риску"}: ${target.title}`}
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={error}
      canSave={!!f.level_code && !!f.passed_at}
    >
      <Section title="Передача">
        <div className="grid sm:grid-cols-2 gap-4">
          <SelectField
            label="Уровень эскалации"
            value={f.level_code}
            onChange={set("level_code")}
            options={ESCALATION_LEVELS.map((l) => ({ value: l.code, label: l.title }))}
            required
          />
          <DateField label="Дата передачи" value={f.passed_at} onChange={set("passed_at")} />
        </div>
        <TextArea label="Основание эскалации" value={f.reason} onChange={set("reason")} rows={2} />
        <div className="grid sm:grid-cols-2 gap-4">
          <SelectField
            label="Кто подготовил материалы"
            value={f.prepared_by_person_id}
            onChange={set("prepared_by_person_id")}
            options={personOptions}
          />
          <DateField label="Срок рассмотрения" value={f.review_due_at} onChange={set("review_due_at")} />
          <SelectField
            label="Передано лицу"
            value={f.passed_to_person_id}
            onChange={set("passed_to_person_id")}
            options={personOptions}
          />
          <SelectField
            label="Передано органу"
            value={f.passed_to_body_id}
            onChange={set("passed_to_body_id")}
            options={bodies.map((b) => ({ value: String(b.id), label: b.title }))}
          />
        </div>
      </Section>

      <Section title="Результат рассмотрения">
        <SelectField
          label="Статус"
          value={f.status}
          onChange={set("status")}
          options={[
            { value: "sent", label: "Передано" },
            { value: "in_review", label: "На рассмотрении" },
            { value: "decided", label: "Решение принято" },
            { value: "returned", label: "Возвращено" },
            { value: "closed", label: "Закрыто" },
          ]}
        />
        <TextArea label="Принятое решение" value={f.decision_text} onChange={set("decision_text")} rows={2} />
        <div className="grid sm:grid-cols-2 gap-4">
          <DateField label="Дата решения" value={f.decided_at} onChange={set("decided_at")} />
          <SelectField
            label="Связанное управленческое решение"
            value={f.decision_id}
            onChange={set("decision_id")}
            options={decisions.map((d) => ({ value: String(d.id), label: d.question }))}
          />
        </div>
        <TextArea label="Результат" value={f.result} onChange={set("result")} rows={2} />
      </Section>
    </Modal>
  );
}

export function LiftBlockForm({
  target,
  onClose,
  onSaved,
}: {
  target: { kind: "issue" | "risk"; id: number; title: string; blockWhat: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!result.trim()) {
      setError("Укажите результат снятия блокировки");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await controlApi.liftBlock({
        kind: target.kind,
        id: target.id,
        block_lifted_at: date,
        block_lift_result: result,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Снять блокировку"
      subtitle={target.title}
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={error}
      saveLabel="Снять блокировку"
      canSave={!!result.trim()}
    >
      <div className="p-3 rounded-lg border border-gray-800 bg-gray-900">
        <p className="text-xs text-gray-500 mb-1">Было заблокировано</p>
        <p className="text-sm text-gray-300">{target.blockWhat}</p>
      </div>
      <DateField label="Дата снятия" value={date} onChange={setDate} />
      <TextArea
        label="Результат снятия"
        value={result}
        onChange={setResult}
        rows={3}
        hint="Что было сделано для снятия блокировки"
      />
      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
        <Icon name="Info" size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-gray-400 leading-relaxed">
          Снятие блокировки не переводит проблему в статус «Устранена». Это отдельное действие.
        </p>
      </div>
    </Modal>
  );
}
