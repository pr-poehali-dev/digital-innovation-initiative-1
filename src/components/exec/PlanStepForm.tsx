import { useState } from "react";
import Icon from "@/components/ui/icon";
import {
  PersonRef,
  PlanStep,
  STEP_STATUS,
  plannerApi,
} from "@/lib/execPlannerApi";
import { DateField, Modal, Section, SelectField, TextArea, TextField } from "./ExecForm";

export default function PlanStepForm({
  step,
  planId,
  parentStepId,
  parentTitle,
  siblings,
  persons,
  onClose,
  onSaved,
}: {
  step?: PlanStep | null;
  planId: number;
  parentStepId?: number | null;
  parentTitle?: string;
  siblings: PlanStep[];
  persons: PersonRef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const s = step;
  const [f, setF] = useState({
    title: s?.title || "",
    description: s?.description || "",
    status: s?.status || "not_started",
    start_date: s?.start_date || "",
    due_date: s?.due_date || "",
    fact_date: s?.fact_date || "",
    responsible_person_id: s?.responsible_person_id ? String(s.responsible_person_id) : "",
    depends_on_step_id: s?.depends_on_step_id ? String(s.depends_on_step_id) : "",
    progress_pct: String(s?.progress_pct ?? 0),
    result_criteria: s?.result_criteria || "",
    result_evidence: s?.result_evidence || "",
    note: s?.note || "",
  });
  const [isMilestone, setIsMilestone] = useState(!!s?.is_milestone);
  const [assignees, setAssignees] = useState<number[]>(
    (s?.assignees || []).map((a) => a.person_id),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const isDone = f.status === "done";

  const toggleAssignee = (id: number) =>
    setAssignees((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const save = async () => {
    if (!f.title.trim()) {
      setError("Укажите название шага");
      return;
    }
    if (isDone && !f.fact_date) {
      setError("Для статуса «Готово» укажите фактическую дату");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await plannerApi.saveStep({
        ...(s ? { id: s.id } : {}),
        plan_id: planId,
        parent_step_id: s ? s.parent_step_id : (parentStepId ?? null),
        ...f,
        responsible_person_id: f.responsible_person_id || null,
        depends_on_step_id: f.depends_on_step_id || null,
        progress_pct: Number(f.progress_pct) || 0,
        is_milestone: isMilestone,
        assignee_ids: assignees,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const personOptions = persons.map((p) => ({
    value: String(p.id),
    label: p.position_title ? `${p.display_name} — ${p.position_title}` : p.display_name,
  }));

  const depOptions = siblings
    .filter((x) => x.id !== s?.id)
    .map((x) => ({ value: String(x.id), label: x.title }));

  return (
    <Modal
      title={s ? "Шаг плана" : parentStepId ? "Новое действие" : "Новый шаг"}
      subtitle={parentTitle ? `Вложен в: ${parentTitle}` : "Шаг можно раскрыть на более мелкие действия"}
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={error}
      canSave={!!f.title.trim()}
      wide
    >
      <Section title="Основное">
        <TextField
          label="Название"
          value={f.title}
          onChange={set("title")}
          placeholder="Например: Согласовать концепцию с ИТ"
          required
        />
        <TextArea label="Описание" value={f.description} onChange={set("description")} rows={2} />

        <label className="flex items-start gap-2.5 cursor-pointer group">
          <span
            onClick={(e) => {
              e.preventDefault();
              setIsMilestone(!isMilestone);
            }}
            className={`w-[18px] h-[18px] rounded border flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
              isMilestone
                ? "bg-violet-600 border-violet-600"
                : "border-slate-300 group-hover:border-slate-400"
            }`}
          >
            {isMilestone && <Icon name="Check" size={12} className="text-white" />}
          </span>
          <span className="min-w-0">
            <span className="text-sm text-slate-700 block leading-snug">Это веха</span>
            <span className="text-[11px] text-slate-400 block mt-0.5">
              Ключевая точка плана — выделяется на шкале времени
            </span>
          </span>
        </label>
      </Section>

      <Section title="Сроки и статус">
        <div className="grid sm:grid-cols-2 gap-4">
          <SelectField
            label="Статус"
            value={f.status}
            onChange={set("status")}
            options={Object.entries(STEP_STATUS)
              .filter(([k]) => k !== "cancelled")
              .map(([k, v]) => ({ value: k, label: v.title }))}
          />
          <TextField
            label="Прогресс, %"
            value={f.progress_pct}
            onChange={(v) => set("progress_pct")(v.replace(/\D/g, "").slice(0, 3))}
            hint="0–100"
          />
          <DateField label="Начало" value={f.start_date} onChange={set("start_date")} />
          <DateField label="Срок" value={f.due_date} onChange={set("due_date")} />
          <DateField label="Факт" value={f.fact_date} onChange={set("fact_date")} />
          <SelectField
            label="Зависит от шага"
            value={f.depends_on_step_id}
            onChange={set("depends_on_step_id")}
            options={depOptions}
            hint="Не может начаться раньше указанного"
          />
        </div>
      </Section>

      <Section title="Ресурсы">
        <SelectField
          label="Ответственный"
          value={f.responsible_person_id}
          onChange={set("responsible_person_id")}
          options={personOptions}
          hint="Отвечает за результат шага"
        />
        <div>
          <span className="text-xs text-slate-500 mb-1.5 block">
            Исполнители {assignees.length > 0 && `(${assignees.length})`}
          </span>
          {persons.length === 0 ? (
            <p className="text-xs text-slate-400">
              Участники не заведены — добавьте их в разделе «Участники»
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
              {persons.map((p) => {
                const on = assignees.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleAssignee(p.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                      on ? "bg-violet-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`w-[16px] h-[16px] rounded border flex items-center justify-center flex-shrink-0 ${
                        on ? "bg-violet-600 border-violet-600" : "border-slate-300"
                      }`}
                    >
                      {on && <Icon name="Check" size={11} className="text-white" />}
                    </span>
                    <span className="min-w-0">
                      <span className="text-sm text-slate-800 block leading-snug">
                        {p.display_name}
                      </span>
                      {p.position_title && (
                        <span className="text-[11px] text-slate-400 block">{p.position_title}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Section>

      <Section title="Результат">
        <TextArea
          label="Критерий выполнения"
          value={f.result_criteria}
          onChange={set("result_criteria")}
          rows={2}
          hint="По чему поймём, что шаг сделан"
        />
        <TextArea
          label="Подтверждение"
          value={f.result_evidence}
          onChange={set("result_evidence")}
          rows={2}
          hint="Документ, решение, ссылка"
        />
        <TextArea label="Комментарий" value={f.note} onChange={set("note")} rows={2} />
      </Section>
    </Modal>
  );
}
