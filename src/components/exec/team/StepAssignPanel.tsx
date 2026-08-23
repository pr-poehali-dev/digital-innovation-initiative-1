import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/ui/icon";
import { fmtDate } from "@/components/exec/ExecUI";
import { DateField, Modal, SelectField, TextField } from "@/components/exec/ExecForm";
import { Avatar, LoadBadge, RaciTag } from "./TeamUI";
import {
  AssigneeWeek,
  PeopleRefs,
  RACI_ROLE,
  StepAssignee,
  TimeEntry,
  WorkloadRow,
  fmtWeek,
  peopleApi,
  weekRange,
  weekStart,
} from "@/lib/execPeopleApi";

/** Назначение людей, часов и учёт трудозатрат по задаче */
export default function StepAssignPanel({
  stepId,
  stepTitle,
  startDate,
  dueDate,
  refs,
  onClose,
  onChanged,
}: {
  stepId: number;
  stepTitle: string;
  startDate: string | null;
  dueDate: string | null;
  refs: PeopleRefs | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [assignees, setAssignees] = useState<StepAssignee[]>([]);
  const [weeks, setWeeks] = useState<AssigneeWeek[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState<StepAssignee | null>(null);
  const [weekOpen, setWeekOpen] = useState<StepAssignee | null>(null);
  const [preview, setPreview] = useState<Map<number, WorkloadRow[]>>(new Map());

  const load = () => {
    setLoading(true);
    peopleApi
      .stepAssignees(stepId)
      .then((d) => {
        setAssignees(d.assignees);
        setWeeks(d.weeks);
        setEntries(d.time_entries);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [stepId]);

  // Загрузка исполнителей на период задачи — до сохранения
  useEffect(() => {
    const ids = assignees.map((a) => a.person_id);
    if (!ids.length) return;
    const from = weekStart(startDate || new Date());
    const to = dueDate || new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10);
    peopleApi
      .workload(from, to, ids)
      .then((d) => {
        const m = new Map<number, WorkloadRow[]>();
        d.rows.forEach((r) => {
          const arr = m.get(r.person_id) || [];
          arr.push(r);
          m.set(r.person_id, arr);
        });
        setPreview(m);
      })
      .catch(() => undefined);
  }, [assignees, startDate, dueDate]);

  const roleA = assignees.find((a) => a.raci_role === "A");
  const planTotal = assignees.reduce((s, a) => s + Number(a.plan_hours || 0), 0);
  const factTotal = assignees.reduce((s, a) => s + Number(a.fact_hours || 0), 0);

  const overloadWarn = (personId: number) => {
    const rows = preview.get(personId) || [];
    const bad = rows.filter((r) => r.state === "overload");
    return bad.length ? bad : null;
  };

  const remove = async (id: number) => {
    await peopleApi.removeAssignee(id);
    load();
    onChanged?.();
  };

  return (
    <Modal
      title="Исполнители и часы"
      subtitle={stepTitle}
      onClose={onClose}
      onSave={onClose}
      saveLabel="Готово"
      wide
    >
      {loading ? (
        <p className="py-6 text-center text-sm text-slate-400">Загружаю…</p>
      ) : (
        <div className="space-y-4">
          {!roleA && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 flex items-start gap-2">
              <Icon name="TriangleAlert" size={14} className="text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-700">
                У задачи нет ответственного. Назначьте одного человека с ролью «Ответственный».
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <Box label="Исполнителей" value={assignees.length} />
            <Box label="План, ч" value={planTotal} />
            <Box label="Факт, ч" value={factTotal} />
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">Назначения</p>
            <button
              onClick={() => setAddOpen(true)}
              className="px-2.5 py-1.5 rounded-lg bg-violet-600 text-white text-xs hover:bg-violet-700 transition-colors inline-flex items-center gap-1.5"
            >
              <Icon name="UserPlus" size={13} />
              Добавить
            </button>
          </div>

          {!assignees.length ? (
            <p className="py-5 text-center text-sm text-slate-400">Никто не назначен</p>
          ) : (
            <div className="space-y-2">
              {assignees.map((a) => {
                const warn = overloadWarn(a.person_id);
                const myWeeks = weeks.filter((w) => w.assignee_id === a.id);
                return (
                  <div key={a.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex flex-wrap items-start gap-2.5">
                      <Avatar name={a.display_name} size={30} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <RaciTag role={a.raci_role} />
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {a.display_name}
                          </p>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {RACI_ROLE[a.raci_role]?.title}
                          {a.position_title ? ` · ${a.position_title}` : ""}
                          {myWeeks.length ? ` · ${myWeeks.length} нед. вручную` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-slate-500">План / факт</p>
                        <p className="text-sm font-semibold text-slate-900 tabular-nums">
                          {a.plan_hours ?? "—"} / {a.fact_hours}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setWeekOpen(a)}
                          title="Распределить по неделям"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                        >
                          <Icon name="CalendarRange" size={14} />
                        </button>
                        <button
                          onClick={() => setTimeOpen(a)}
                          title="Внести трудозатраты"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                        >
                          <Icon name="Timer" size={14} />
                        </button>
                        <button
                          onClick={() => remove(a.id)}
                          title="Убрать"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Icon name="Trash2" size={14} />
                        </button>
                      </div>
                    </div>

                    {warn && (
                      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 flex items-start gap-2">
                        <Icon
                          name="TriangleAlert"
                          size={13}
                          className="text-amber-600 mt-0.5 flex-shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-[11px] text-amber-800 font-medium">
                            Перегрузка в {warn.length} нед.
                          </p>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {warn.slice(0, 4).map((w) => (
                              <span
                                key={w.week_start}
                                className="text-[10px] text-amber-700 bg-amber-100 rounded px-1.5 py-0.5"
                              >
                                {fmtWeek(w.week_start).split(" — ")[0]}: {w.load_pct}%
                              </span>
                            ))}
                          </div>
                          <p className="text-[10px] text-amber-600 mt-1">
                            Это предупреждение, назначение возможно
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {entries.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-slate-900 mb-2">Трудозатраты</p>
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {entries.map((t) => (
                      <tr key={t.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap text-xs">
                          {fmtDate(t.work_date)}
                        </td>
                        <td className="px-3 py-2 text-slate-900 text-xs">{t.display_name}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-sm">
                          {t.hours} ч
                        </td>
                        <td className="px-3 py-2 text-slate-500 text-xs">{t.comment || ""}</td>
                        <td className="px-2 py-2 w-8">
                          <button
                            onClick={async () => {
                              await peopleApi.deleteTimeEntry(t.id);
                              load();
                              onChanged?.();
                            }}
                            className="text-slate-300 hover:text-red-600 transition-colors"
                          >
                            <Icon name="X" size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {addOpen && (
        <AddAssigneeForm
          stepId={stepId}
          refs={refs}
          existing={assignees}
          startDate={startDate}
          dueDate={dueDate}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            load();
            onChanged?.();
          }}
        />
      )}

      {timeOpen && (
        <TimeEntryForm
          stepId={stepId}
          assignee={timeOpen}
          onClose={() => setTimeOpen(null)}
          onSaved={() => {
            setTimeOpen(null);
            load();
            onChanged?.();
          }}
        />
      )}

      {weekOpen && (
        <WeekSplitForm
          assignee={weekOpen}
          startDate={startDate}
          dueDate={dueDate}
          current={weeks.filter((w) => w.assignee_id === weekOpen.id)}
          onClose={() => setWeekOpen(null)}
          onSaved={() => {
            setWeekOpen(null);
            load();
            onChanged?.();
          }}
        />
      )}
    </Modal>
  );
}

function Box({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900 tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

function AddAssigneeForm({
  stepId,
  refs,
  existing,
  startDate,
  dueDate,
  onClose,
  onSaved,
}: {
  stepId: number;
  refs: PeopleRefs | null;
  existing: StepAssignee[];
  startDate: string | null;
  dueDate: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({ person_id: "", raci_role: "R", plan_hours: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [check, setCheck] = useState<WorkloadRow[] | null>(null);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  // Проверяем загрузку выбранного человека до сохранения
  useEffect(() => {
    if (!f.person_id) {
      setCheck(null);
      return;
    }
    const from = weekStart(startDate || new Date());
    const to = dueDate || new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10);
    peopleApi
      .workload(from, to, [Number(f.person_id)])
      .then((d) => setCheck(d.rows))
      .catch(() => setCheck(null));
  }, [f.person_id, startDate, dueDate]);

  const taken = new Set(existing.map((a) => `${a.person_id}-${a.raci_role}`));
  const hasA = existing.some((a) => a.raci_role === "A");

  const projected = useMemo(() => {
    if (!check || !f.plan_hours) return null;
    const hours = Number(f.plan_hours);
    const activeWeeks = check.filter((r) => r.capacity_hours > 0).length || 1;
    const perWeek = hours / activeWeeks;
    return check.map((r) => ({
      ...r,
      planned_hours: r.planned_hours + perWeek,
      load_pct: r.capacity_hours
        ? Math.round(((r.planned_hours + perWeek) / r.capacity_hours) * 1000) / 10
        : null,
    }));
  }, [check, f.plan_hours]);

  const willOverload = (projected || []).filter((r) => (r.load_pct ?? 0) > 100);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await peopleApi.saveAssignee({
        step_id: stepId,
        person_id: f.person_id,
        raci_role: f.raci_role,
        plan_hours: f.plan_hours || null,
        valid_from: startDate,
        valid_to: dueDate,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Назначить на задачу"
      onClose={onClose}
      onSave={save}
      saving={saving}
      canSave={!!f.person_id && !taken.has(`${f.person_id}-${f.raci_role}`)}
      error={error}
    >
      <SelectField
        label="Сотрудник"
        value={f.person_id}
        onChange={(v) => set("person_id", v)}
        required
        options={(refs?.persons || []).map((p) => ({
          value: String(p.id),
          label: p.position_title ? `${p.display_name} — ${p.position_title}` : p.display_name,
        }))}
      />
      <SelectField
        label="Роль"
        value={f.raci_role}
        onChange={(v) => set("raci_role", v)}
        options={Object.entries(RACI_ROLE).map(([value, r]) => ({
          value,
          label: r.title,
        }))}
        placeholder="выберите"
        hint={
          hasA && f.raci_role === "A"
            ? "Прежний ответственный будет заменён: у задачи может быть только один A"
            : undefined
        }
      />
      <TextField
        label="Плановые часы"
        value={f.plan_hours}
        onChange={(v) => set("plan_hours", v)}
        hint="Часы этого человека по задаче"
      />

      {taken.has(`${f.person_id}-${f.raci_role}`) && (
        <p className="text-xs text-amber-700">
          Этот сотрудник уже назначен с такой ролью.
        </p>
      )}

      {check && check.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-700 mb-2">
            Загрузка на период задачи {startDate ? `с ${fmtDate(startDate)}` : ""}
            {dueDate ? ` по ${fmtDate(dueDate)}` : ""}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(projected || check).slice(0, 10).map((r) => (
              <span
                key={r.week_start}
                className="inline-flex items-center gap-1 text-[11px] bg-white border border-slate-200 rounded px-1.5 py-1"
              >
                <span className="text-slate-500">{fmtWeek(r.week_start).split(" — ")[0]}</span>
                <LoadBadge
                  pct={r.load_pct}
                  state={
                    (r.load_pct ?? 0) > 100 ? "overload" : (r.load_pct ?? 0) >= 80 ? "normal" : "free"
                  }
                />
              </span>
            ))}
          </div>
          {willOverload.length > 0 && (
            <p className="text-[11px] text-amber-700 mt-2 flex items-start gap-1.5">
              <Icon name="TriangleAlert" size={12} className="mt-0.5 flex-shrink-0" />
              После назначения перегрузка в {willOverload.length} нед. Решение за руководителем —
              сохранить можно.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

function TimeEntryForm({
  stepId,
  assignee,
  onClose,
  onSaved,
}: {
  stepId: number;
  assignee: StepAssignee;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    work_date: new Date().toISOString().slice(0, 10),
    hours: "",
    comment: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await peopleApi.saveTimeEntry({
        person_id: assignee.person_id,
        step_id: stepId,
        ...f,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Внести трудозатраты"
      subtitle={assignee.display_name}
      onClose={onClose}
      onSave={save}
      saving={saving}
      canSave={!!f.hours && Number(f.hours) > 0}
      error={error}
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <DateField label="Дата" value={f.work_date} onChange={(v) => set("work_date", v)} />
        <TextField label="Часы" value={f.hours} onChange={(v) => set("hours", v)} required />
      </div>
      <TextField label="Комментарий" value={f.comment} onChange={(v) => set("comment", v)} />
      <p className="text-[11px] text-slate-400">
        Фактические часы задачи складываются из этих записей и не редактируются напрямую.
      </p>
    </Modal>
  );
}

function WeekSplitForm({
  assignee,
  startDate,
  dueDate,
  current,
  onClose,
  onSaved,
}: {
  assignee: StepAssignee;
  startDate: string | null;
  dueDate: string | null;
  current: AssigneeWeek[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const list = useMemo(() => {
    const from = startDate || new Date().toISOString().slice(0, 10);
    const to = dueDate || new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10);
    return weekRange(from, to);
  }, [startDate, dueDate]);

  const [vals, setVals] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    const cur = new Map(current.map((c) => [c.week_start, c.hours]));
    const even = list.length ? Number(assignee.plan_hours || 0) / list.length : 0;
    list.forEach((w) => {
      init[w] = String(cur.get(w) ?? (even ? Math.round(even * 10) / 10 : ""));
    });
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const total = Object.values(vals).reduce((s, v) => s + (Number(v) || 0), 0);
  const diff = Math.round((total - Number(assignee.plan_hours || 0)) * 10) / 10;

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await peopleApi.saveAssigneeWeeks(
        assignee.id,
        list.map((w) => ({ week_start: w, hours: Number(vals[w]) || 0 })),
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Распределить часы по неделям"
      subtitle={`${assignee.display_name} · план ${assignee.plan_hours ?? 0} ч`}
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={error}
    >
      <p className="text-xs text-slate-500">
        Если не заполнять вручную, часы распределяются равномерно по рабочим дням.
      </p>
      <div className="space-y-1.5 max-h-[45vh] overflow-y-auto">
        {list.map((w) => (
          <div key={w} className="flex items-center gap-3">
            <span className="text-sm text-slate-600 flex-1">{fmtWeek(w)}</span>
            <input
              value={vals[w] || ""}
              onChange={(e) => setVals((s) => ({ ...s, [w]: e.target.value }))}
              placeholder="0"
              className="w-24 px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm text-right tabular-nums focus:border-violet-600 outline-none"
            />
            <span className="text-xs text-slate-400 w-4">ч</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <span className="text-sm text-slate-600">Итого</span>
        <span className="text-sm font-semibold text-slate-900 tabular-nums">
          {Math.round(total * 10) / 10} ч
          {diff !== 0 && (
            <span className={diff > 0 ? "text-amber-600 ml-2" : "text-slate-400 ml-2"}>
              {diff > 0 ? "+" : ""}
              {diff} к плану
            </span>
          )}
        </span>
      </div>
    </Modal>
  );
}
