import { useState } from "react";
import Icon from "@/components/ui/icon";
import {
  PersonRef,
  PlanStep,
  STEP_STATUS,
  plannerApi,
} from "@/lib/execPlannerApi";
import { DateField, Modal, Section, SelectField, TextArea, TextField } from "./ExecForm";
import PersonPicker from "./PersonPicker";
import { execApi } from "@/lib/execCabinetApi";

/** Добавление исполнителя по ФИО прямо в форме шага */
function AddAssigneeInline({
  persons,
  onCreated,
}: {
  persons: PersonRef[];
  onCreated: (p: PersonRef) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pos, setPos] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const exists = persons.some(
    (p) => p.display_name.trim().toLowerCase() === name.trim().toLowerCase(),
  );
  const ok = name.trim().length >= 3 && !exists;

  const create = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await execApi.createPerson({
        display_name: name.trim(),
        position_title: pos.trim() || undefined,
      });
      onCreated({
        id: res.id,
        display_name: name.trim(),
        position_title: pos.trim() || null,
        org_name: null,
      });
      setName("");
      setPos("");
      setOpen(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-700 transition-colors"
      >
        <Icon name="UserPlus" size={13} />
        Добавить исполнителя по ФИО
      </button>
    );
  }

  return (
    <div className="mt-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setErr("");
        }}
        placeholder="Фамилия Имя Отчество"
        className="w-full px-2.5 py-1.5 rounded-md bg-white border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-300"
      />
      <input
        value={pos}
        onChange={(e) => setPos(e.target.value)}
        placeholder="Должность (необязательно)"
        className="w-full px-2.5 py-1.5 rounded-md bg-white border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-300"
      />
      {exists && name.trim() && (
        <p className="text-[11px] text-amber-600">Такой участник уже есть в списке</p>
      )}
      {err && <p className="text-[11px] text-red-600">{err}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={create}
          disabled={!ok || busy}
          className="px-3 py-1.5 rounded-md bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-medium transition-colors"
        >
          {busy ? "Добавляю…" : "Добавить"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setName("");
            setPos("");
            setErr("");
          }}
          className="px-3 py-1.5 rounded-md text-slate-500 hover:text-slate-700 text-sm transition-colors"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}

export default function PlanStepForm({
  step,
  planId,
  parentStepId,
  parentTitle,
  siblings,
  persons: personsProp,
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
  const [persons, setPersons] = useState<PersonRef[]>(personsProp);
  const addPerson = (p: PersonRef) =>
    setPersons((prev) =>
      prev.some((x) => x.id === p.id)
        ? prev
        : [...prev, p].sort((a, b) => a.display_name.localeCompare(b.display_name, "ru")),
    );
  const [f, setF] = useState({
    title: s?.title || "",
    description: s?.description || "",
    status: s?.status || "not_started",
    start_date: s?.start_date || "",
    due_date: s?.due_date || "",
    fact_date: s?.fact_date || "",
    responsible_person_id: s?.responsible_person_id ? String(s.responsible_person_id) : "",
    depends_on_step_id: s?.depends_on_step_id ? String(s.depends_on_step_id) : "",
    parent_step_id: s
      ? s.parent_step_id
        ? String(s.parent_step_id)
        : ""
      : parentStepId
        ? String(parentStepId)
        : "",
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
        ...f,
        parent_step_id: f.parent_step_id ? Number(f.parent_step_id) : null,
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

  // Возможные родители: всё дерево плана минус сам шаг и его потомки
  const parentOptions = (() => {
    const banned = new Set<number>();
    if (s) {
      banned.add(s.id);
      let grew = true;
      while (grew) {
        grew = false;
        siblings.forEach((x) => {
          if (x.parent_step_id && banned.has(x.parent_step_id) && !banned.has(x.id)) {
            banned.add(x.id);
            grew = true;
          }
        });
      }
    }
    const out: { value: string; label: string }[] = [];
    const walk = (parent: number | null, depth: number) => {
      siblings
        .filter((x) => (x.parent_step_id ?? null) === parent && !banned.has(x.id))
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
        .forEach((x) => {
          out.push({
            value: String(x.id),
            label: `${"— ".repeat(depth)}${x.title}`,
          });
          walk(x.id, depth + 1);
        });
    };
    walk(null, 0);
    return out;
  })();

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

      <Section title="Место в плане">
        <SelectField
          label="Вложен в шаг"
          value={f.parent_step_id}
          onChange={set("parent_step_id")}
          options={parentOptions}
          hint="Куда относится этот шаг. «Верхний уровень» — самостоятельный раздел плана"
          placeholder="Верхний уровень"
        />
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Меняя это поле, вы переносите шаг вместе со всеми его подшагами в другую ветвь.
          Чтобы создать вложенный подшаг, нажмите «+» на нужном шаге в списке плана.
        </p>
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
            hint="Очерёдность, а не вложенность: этот шаг не начнётся раньше указанного"
          />
        </div>
      </Section>

      <Section title="Ресурсы">
        <PersonPicker
          label="Ответственный"
          value={f.responsible_person_id}
          persons={persons}
          onChange={set("responsible_person_id")}
          onPersonCreated={addPerson}
          hint="Отвечает за результат шага. Можно выбрать из списка или ввести ФИО"
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
          <AddAssigneeInline
            persons={persons}
            onCreated={(p) => {
              addPerson(p);
              setAssignees((prev) => [...prev, p.id]);
            }}
          />
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