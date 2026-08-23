import { useState } from "react";
import {
  DateField,
  Modal,
  Section,
  SelectField,
  TextArea,
  TextField,
} from "@/components/exec/ExecForm";
import {
  CENTER_STATUS,
  Center,
  CenterFunction,
  CenterGoal,
  CenterRefs,
  CenterRole,
  CRITICALITY,
  FUNC_STATUS,
  GOAL_STATUS,
  ROLE_STATUS,
  centerApi,
} from "@/lib/execCenterApi";

const opts = (m: Record<string, { title: string }>) =>
  Object.entries(m).map(([value, v]) => ({ value, label: v.title }));

const personOpts = (refs: CenterRefs) =>
  refs.persons.map((p) => ({
    value: String(p.id),
    label: p.position_title ? `${p.display_name} — ${p.position_title}` : p.display_name,
  }));

function useSaver(onSaved: () => void) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<unknown>) => {
    setSaving(true);
    setError("");
    try {
      await fn();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };
  return { saving, error, run };
}

/* ---------- Паспорт центра ---------- */

export function CenterForm({
  center,
  refs,
  onClose,
  onSaved,
}: {
  center?: Center;
  refs: CenterRefs;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    title: center?.title || "",
    short_name: center?.short_name || "",
    status: center?.status || "draft",
    parent_org: center?.parent_org || "",
    head_person_id: center?.head_person_id ? String(center.head_person_id) : "",
    problem_statement: center?.problem_statement || "",
    rationale: center?.rationale || "",
    mission: center?.mission || "",
    scope_included: center?.scope_included || "",
    scope_excluded: center?.scope_excluded || "",
    success_criteria: center?.success_criteria || "",
    planned_headcount: center?.planned_headcount ? String(center.planned_headcount) : "",
    start_date: center?.start_date || "",
    review_date: center?.review_date || "",
    initiative_id: center?.initiative_id ? String(center.initiative_id) : "",
    plan_id: center?.plan_id ? String(center.plan_id) : "",
    note: center?.note || "",
  });
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const { saving, error, run } = useSaver(onSaved);

  return (
    <Modal
      title={center ? "Паспорт центра" : "Новый центр"}
      subtitle="Обоснование создания, границы и ожидаемый результат"
      onClose={onClose}
      onSave={() => run(() => centerApi.saveCenter({ ...(center ? { id: center.id } : {}), ...f }))}
      saving={saving}
      canSave={!!f.title.trim()}
      error={error}
      wide
    >
      <Section title="Основное">
        <TextField
          label="Полное название"
          value={f.title}
          onChange={set("title")}
          required
          hint="Как центр будет называться в приказе"
        />
        <div className="grid sm:grid-cols-2 gap-4">
          <TextField label="Краткое название" value={f.short_name} onChange={set("short_name")} />
          <SelectField
            label="Статус"
            value={f.status}
            onChange={set("status")}
            options={opts(CENTER_STATUS).filter((o) => o.value !== "archived")}
          />
          <TextField
            label="В составе"
            value={f.parent_org}
            onChange={set("parent_org")}
            hint="Блок или подразделение"
          />
          <SelectField
            label="Руководитель"
            value={f.head_person_id}
            onChange={set("head_person_id")}
            options={personOpts(refs)}
          />
        </div>
      </Section>

      <Section title="Обоснование">
        <TextArea
          label="Какую проблему решаем"
          value={f.problem_statement}
          onChange={set("problem_statement")}
          rows={3}
          hint="Что сейчас не работает и чем это грозит организации"
        />
        <TextArea
          label="Почему нужен отдельный центр"
          value={f.rationale}
          onChange={set("rationale")}
          rows={3}
          hint="Почему задачу нельзя закрыть существующими силами"
        />
        <TextArea
          label="Миссия центра"
          value={f.mission}
          onChange={set("mission")}
          rows={2}
          hint="Одно-два предложения: зачем центр существует"
        />
      </Section>

      <Section title="Границы ответственности">
        <TextArea
          label="Что входит в зону центра"
          value={f.scope_included}
          onChange={set("scope_included")}
          rows={3}
        />
        <TextArea
          label="Что НЕ входит"
          value={f.scope_excluded}
          onChange={set("scope_excluded")}
          rows={2}
          hint="Помогает избежать споров о полномочиях"
        />
      </Section>

      <Section title="Результат и сроки">
        <TextArea
          label="Критерии успеха"
          value={f.success_criteria}
          onChange={set("success_criteria")}
          rows={3}
          hint="По каким признакам поймём, что центр себя оправдал"
        />
        <div className="grid sm:grid-cols-2 gap-4">
          <TextField
            label="Планируемая численность"
            value={f.planned_headcount}
            onChange={(v) => set("planned_headcount")(v.replace(/\D/g, "").slice(0, 4))}
            hint="Человек"
          />
          <DateField label="Дата запуска" value={f.start_date} onChange={set("start_date")} />
          <DateField
            label="Дата пересмотра"
            value={f.review_date}
            onChange={set("review_date")}
          />
        </div>
      </Section>

      <Section title="Связи">
        <div className="grid sm:grid-cols-2 gap-4">
          <SelectField
            label="Инициатива"
            value={f.initiative_id}
            onChange={set("initiative_id")}
            options={refs.initiatives.map((i) => ({ value: String(i.id), label: i.title }))}
          />
          <SelectField
            label="Рабочий план"
            value={f.plan_id}
            onChange={set("plan_id")}
            options={refs.plans.map((p) => ({ value: String(p.id), label: p.title }))}
            hint="Откуда берутся задачи и загрузка"
          />
        </div>
        <TextArea label="Заметки" value={f.note} onChange={set("note")} rows={2} />
      </Section>
    </Modal>
  );
}

/* ---------- Цель или задача ---------- */

export function CenterGoalForm({
  goal,
  centerId,
  parentGoalId,
  kind,
  goals,
  refs,
  onClose,
  onSaved,
}: {
  goal?: CenterGoal;
  centerId: number;
  parentGoalId?: number | null;
  kind?: string;
  goals: CenterGoal[];
  refs: CenterRefs;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isTask = (goal?.kind || kind || "goal") === "task";
  const [f, setF] = useState({
    kind: goal?.kind || kind || "goal",
    title: goal?.title || "",
    description: goal?.description || "",
    metric: goal?.metric || "",
    baseline_value: goal?.baseline_value || "",
    target_value: goal?.target_value || "",
    horizon: goal?.horizon || "",
    due_date: goal?.due_date || "",
    owner_person_id: goal?.owner_person_id ? String(goal.owner_person_id) : "",
    status: goal?.status || "planned",
    progress_pct: goal?.progress_pct != null ? String(goal.progress_pct) : "",
    parent_goal_id: goal
      ? goal.parent_goal_id
        ? String(goal.parent_goal_id)
        : ""
      : parentGoalId
        ? String(parentGoalId)
        : "",
  });
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const { saving, error, run } = useSaver(onSaved);

  return (
    <Modal
      title={goal ? "Изменить" : isTask ? "Новая задача" : "Новая цель"}
      subtitle={
        isTask
          ? "Конкретный результат, который приближает цель"
          : "Чего центр должен достичь и как это измерить"
      }
      onClose={onClose}
      onSave={() =>
        run(() =>
          centerApi.saveGoal({
            ...(goal ? { id: goal.id } : {}),
            center_id: centerId,
            ...f,
          }),
        )
      }
      saving={saving}
      canSave={!!f.title.trim()}
      error={error}
    >
      <Section title="Суть">
        <TextField label="Формулировка" value={f.title} onChange={set("title")} required />
        <TextArea
          label="Пояснение"
          value={f.description}
          onChange={set("description")}
          rows={2}
        />
        <div className="grid sm:grid-cols-2 gap-4">
          <SelectField
            label="Тип"
            value={f.kind}
            onChange={set("kind")}
            options={[
              { value: "goal", label: "Цель" },
              { value: "task", label: "Задача" },
            ]}
            placeholder="Цель"
          />
          <SelectField
            label="Относится к цели"
            value={f.parent_goal_id}
            onChange={set("parent_goal_id")}
            options={goals
              .filter((g) => g.kind === "goal" && g.id !== goal?.id)
              .map((g) => ({ value: String(g.id), label: g.title }))}
            placeholder="Самостоятельная"
          />
        </div>
      </Section>

      <Section title="Измеримость">
        <TextField
          label="Показатель"
          value={f.metric}
          onChange={set("metric")}
          hint="Чем измеряем достижение, например «Доля автоматизированных проверок»"
        />
        <div className="grid sm:grid-cols-2 gap-4">
          <TextField label="Сейчас" value={f.baseline_value} onChange={set("baseline_value")} />
          <TextField label="Цель" value={f.target_value} onChange={set("target_value")} />
        </div>
      </Section>

      <Section title="Сроки и ответственность">
        <div className="grid sm:grid-cols-2 gap-4">
          <TextField
            label="Горизонт"
            value={f.horizon}
            onChange={set("horizon")}
            hint="Например «2027 год» или «1 полугодие»"
          />
          <DateField label="Срок" value={f.due_date} onChange={set("due_date")} />
          <SelectField
            label="Ответственный"
            value={f.owner_person_id}
            onChange={set("owner_person_id")}
            options={personOpts(refs)}
          />
          <SelectField
            label="Статус"
            value={f.status}
            onChange={set("status")}
            options={opts(GOAL_STATUS)}
          />
          <TextField
            label="Прогресс, %"
            value={f.progress_pct}
            onChange={(v) => set("progress_pct")(v.replace(/\D/g, "").slice(0, 3))}
          />
        </div>
      </Section>
    </Modal>
  );
}

/* ---------- Функция центра ---------- */

export function CenterFunctionForm({
  fn,
  centerId,
  goals,
  refs,
  onClose,
  onSaved,
}: {
  fn?: CenterFunction;
  centerId: number;
  goals: CenterGoal[];
  refs: CenterRefs;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    code: fn?.code || "",
    title: fn?.title || "",
    description: fn?.description || "",
    purpose: fn?.purpose || "",
    result_description: fn?.result_description || "",
    goal_id: fn?.goal_id ? String(fn.goal_id) : "",
    owner_person_id: fn?.owner_person_id ? String(fn.owner_person_id) : "",
    backup_person_id: fn?.backup_person_id ? String(fn.backup_person_id) : "",
    criticality: fn?.criticality || "medium",
    regularity: fn?.regularity || "",
    hours_per_month: fn?.hours_per_month != null ? String(fn.hours_per_month) : "",
    fte_estimate: fn?.fte_estimate != null ? String(fn.fte_estimate) : "",
    status: fn?.status || "planned",
    note: fn?.note || "",
  });
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const { saving, error, run } = useSaver(onSaved);

  const num = (k: keyof typeof f) => (v: string) =>
    set(k)(v.replace(/[^\d.,]/g, "").slice(0, 8));

  return (
    <Modal
      title={fn ? "Функция центра" : "Новая функция"}
      subtitle="Что именно центр делает и кто за это отвечает"
      onClose={onClose}
      onSave={() =>
        run(() =>
          centerApi.saveFunction({
            ...(fn ? { id: fn.id } : {}),
            center_id: centerId,
            ...f,
          }),
        )
      }
      saving={saving}
      canSave={!!f.title.trim()}
      error={error}
      wide
    >
      <Section title="Описание">
        <div className="grid sm:grid-cols-[120px_1fr] gap-4">
          <TextField label="Код" value={f.code} onChange={set("code")} hint="Ф-01" />
          <TextField label="Название функции" value={f.title} onChange={set("title")} required />
        </div>
        <TextArea
          label="Что включает"
          value={f.description}
          onChange={set("description")}
          rows={3}
        />
        <TextArea
          label="Зачем нужна"
          value={f.purpose}
          onChange={set("purpose")}
          rows={2}
          hint="Какую потребность закрывает"
        />
        <TextArea
          label="Результат функции"
          value={f.result_description}
          onChange={set("result_description")}
          rows={2}
          hint="Что получается на выходе: отчёт, регламент, работающий сервис"
        />
      </Section>

      <Section title="Ответственность">
        <div className="grid sm:grid-cols-2 gap-4">
          <SelectField
            label="Ответственный"
            value={f.owner_person_id}
            onChange={set("owner_person_id")}
            options={personOpts(refs)}
          />
          <SelectField
            label="Замещающий"
            value={f.backup_person_id}
            onChange={set("backup_person_id")}
            options={personOpts(refs)}
            hint="Кто подхватит, если основной недоступен"
          />
          <SelectField
            label="Критичность"
            value={f.criticality}
            onChange={set("criticality")}
            options={opts(CRITICALITY)}
          />
          <SelectField
            label="Служит цели"
            value={f.goal_id}
            onChange={set("goal_id")}
            options={goals
              .filter((g) => g.kind === "goal")
              .map((g) => ({ value: String(g.id), label: g.title }))}
          />
        </div>
      </Section>

      <Section title="Объём работы">
        <div className="grid sm:grid-cols-2 gap-4">
          <TextField
            label="Регулярность"
            value={f.regularity}
            onChange={set("regularity")}
            hint="Постоянно, ежемесячно, по запросу"
          />
          <SelectField
            label="Статус"
            value={f.status}
            onChange={set("status")}
            options={opts(FUNC_STATUS)}
          />
          <TextField
            label="Часов в месяц"
            value={f.hours_per_month}
            onChange={num("hours_per_month")}
            hint="Сколько времени занимает функция"
          />
          <TextField
            label="Ставок (FTE)"
            value={f.fte_estimate}
            onChange={num("fte_estimate")}
            hint="0.5 — половина ставки"
          />
        </div>
        <TextArea label="Заметки" value={f.note} onChange={set("note")} rows={2} />
      </Section>
    </Modal>
  );
}

/* ---------- Штатная роль ---------- */

export function CenterRoleForm({
  role,
  centerId,
  functions,
  refs,
  onClose,
  onSaved,
}: {
  role?: CenterRole;
  centerId: number;
  functions: CenterFunction[];
  refs: CenterRefs;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    title: role?.title || "",
    purpose: role?.purpose || "",
    duties: role?.duties || "",
    requirements: role?.requirements || "",
    headcount: role?.headcount != null ? String(role.headcount) : "1",
    hours_per_week: role?.hours_per_week != null ? String(role.hours_per_week) : "",
    grade: role?.grade || "",
    person_id: role?.person_id ? String(role.person_id) : "",
    status: role?.status || "needed",
    justification: role?.justification || "",
  });
  const [fnIds, setFnIds] = useState<number[]>(role?.function_ids || []);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const { saving, error, run } = useSaver(onSaved);

  const toggle = (id: number) =>
    setFnIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Modal
      title={role ? "Штатная роль" : "Новая роль"}
      subtitle="Обоснование ставки: чем человек будет занят"
      onClose={onClose}
      onSave={() =>
        run(() =>
          centerApi.saveRole({
            ...(role ? { id: role.id } : {}),
            center_id: centerId,
            ...f,
            function_ids: fnIds,
          }),
        )
      }
      saving={saving}
      canSave={!!f.title.trim()}
      error={error}
      wide
    >
      <Section title="Роль">
        <TextField
          label="Название должности"
          value={f.title}
          onChange={set("title")}
          required
          hint="Например «Аналитик по автоматизации контроля»"
        />
        <TextArea
          label="Назначение роли"
          value={f.purpose}
          onChange={set("purpose")}
          rows={2}
        />
        <TextArea
          label="Обязанности"
          value={f.duties}
          onChange={set("duties")}
          rows={3}
        />
        <TextArea
          label="Требования к кандидату"
          value={f.requirements}
          onChange={set("requirements")}
          rows={3}
          hint="Опыт, образование, навыки"
        />
      </Section>

      <Section title="Занятость">
        <div className="grid sm:grid-cols-2 gap-4">
          <TextField
            label="Ставок"
            value={f.headcount}
            onChange={(v) => set("headcount")(v.replace(/[^\d.,]/g, "").slice(0, 5))}
            hint="1 — полная ставка"
          />
          <TextField
            label="Часов в неделю"
            value={f.hours_per_week}
            onChange={(v) => set("hours_per_week")(v.replace(/[^\d.,]/g, "").slice(0, 5))}
          />
          <TextField label="Грейд или разряд" value={f.grade} onChange={set("grade")} />
          <SelectField
            label="Статус"
            value={f.status}
            onChange={set("status")}
            options={opts(ROLE_STATUS)}
          />
          <SelectField
            label="Кто занимает"
            value={f.person_id}
            onChange={set("person_id")}
            options={personOpts(refs)}
            placeholder="Вакансия"
          />
        </div>
        <TextArea
          label="Обоснование ставки"
          value={f.justification}
          onChange={set("justification")}
          rows={3}
          hint="Почему нужен отдельный человек, а не совмещение"
        />
      </Section>

      {functions.length > 0 && (
        <Section title="Закреплённые функции">
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {functions.map((x) => (
              <label
                key={x.id}
                className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={fnIds.includes(x.id)}
                  onChange={() => toggle(x.id)}
                  className="mt-0.5 w-4 h-4 rounded accent-violet-600 flex-shrink-0"
                />
                <span className="min-w-0">
                  <span className="text-sm text-slate-700 block leading-snug">
                    {x.code ? `${x.code}. ` : ""}
                    {x.title}
                  </span>
                  {x.hours_per_month != null && (
                    <span className="text-[11px] text-slate-400">
                      {x.hours_per_month} ч/мес
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
          <p className="text-[11px] text-slate-400">
            Сумма часов закреплённых функций показывает, обоснована ли ставка.
          </p>
        </Section>
      )}
    </Modal>
  );
}
