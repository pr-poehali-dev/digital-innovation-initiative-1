import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { Empty, fmtDate } from "@/components/exec/ExecUI";
import { DateField, Modal, SelectField, TextField } from "@/components/exec/ExecForm";
import { LoadBadge } from "./TeamUI";
import {
  ABSENCE_TYPE,
  PersonAbsence,
  PersonDetail,
  WorkloadRow,
  fmtWeek,
  peopleApi,
  weekStart,
} from "@/lib/execPeopleApi";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function WorkloadTab({
  person,
  onChanged,
}: {
  person: PersonDetail;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<WorkloadRow[]>([]);
  const [provisional, setProvisional] = useState(false);
  const [loading, setLoading] = useState(true);
  const [capOpen, setCapOpen] = useState(false);
  const [absOpen, setAbsOpen] = useState(false);
  const [editAbs, setEditAbs] = useState<PersonAbsence | null>(null);
  const [weeks, setWeeks] = useState(12);

  const load = () => {
    setLoading(true);
    const from = weekStart(new Date());
    const to = new Date();
    to.setDate(to.getDate() + weeks * 7);
    peopleApi
      .workload(from, to.toISOString().slice(0, 10), [person.id])
      .then((d) => {
        setRows(d.rows);
        setProvisional(d.calendar_provisional);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [person.id, weeks]);

  const current = person.capacity.find((c) => !c.valid_to);
  const planTotal = person.steps.reduce((s, x) => s + Number(x.plan_hours || 0), 0);
  const factTotal = person.steps.reduce((s, x) => s + Number(x.fact_hours || 0), 0);

  const chartData = rows.map((r) => ({
    week: fmtWeek(r.week_start).split(" — ")[0],
    Ёмкость: r.capacity_hours,
    План: r.planned_hours,
    Загрузка: r.load_pct || 0,
  }));

  const removeAbs = async (id: number) => {
    await peopleApi.deleteAbsence(id);
    onChanged();
    load();
  };

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Ёмкость в неделю</p>
          <p className="text-xl font-semibold text-slate-900 mt-1 tabular-nums">
            {current ? `${current.hours_per_week} ч` : "—"}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {current ? `График ${current.work_schedule}` : "не задана"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Плановые часы</p>
          <p className="text-xl font-semibold text-slate-900 mt-1 tabular-nums">{planTotal} ч</p>
          <p className="text-[11px] text-slate-400 mt-0.5">по всем задачам</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Фактические часы</p>
          <p className="text-xl font-semibold text-slate-900 mt-1 tabular-nums">{factTotal} ч</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {planTotal ? `${Math.round((factTotal / planTotal) * 100)}% от плана` : "нет плана"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Отсутствия</p>
          <p className="text-xl font-semibold text-slate-900 mt-1 tabular-nums">
            {person.absences.length}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">за последний год</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setCapOpen(true)}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5"
        >
          <Icon name="Clock" size={13} />
          Изменить ёмкость
        </button>
        <button
          onClick={() => {
            setEditAbs(null);
            setAbsOpen(true);
          }}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5"
        >
          <Icon name="CalendarOff" size={13} />
          Добавить отсутствие
        </button>
        <select
          value={weeks}
          onChange={(e) => setWeeks(Number(e.target.value))}
          className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 ml-auto"
        >
          <option value={6}>6 недель</option>
          <option value={12}>12 недель</option>
          <option value={26}>26 недель</option>
        </select>
      </div>

      {provisional && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 flex items-start gap-2">
          <Icon name="Info" size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-800">
            Календарь после 2026 года предварительный: переносы выходных ещё не утверждены.
          </p>
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-400">Считаю загрузку…</div>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-900 mb-3">Ёмкость и план по неделям</p>
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                  />
                  <Bar dataKey="Ёмкость" fill="#cbd5e1" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="План" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                  <Line type="monotone" dataKey="Загрузка" stroke="#ef4444" dot={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                    <th className="text-left font-medium px-3 py-2">Неделя</th>
                    <th className="text-right font-medium px-3 py-2">Ёмкость</th>
                    <th className="text-right font-medium px-3 py-2">План</th>
                    <th className="text-center font-medium px-3 py-2">Загрузка</th>
                    <th className="text-left font-medium px-3 py-2">Отсутствие</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.week_start} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 text-slate-700">{fmtWeek(r.week_start)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                        {r.capacity_hours}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-900 font-medium">
                        {r.planned_hours}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <LoadBadge pct={r.load_pct} state={r.state} />
                      </td>
                      <td className="px-3 py-2">
                        {r.absence_type ? (
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] border ${
                              ABSENCE_TYPE[r.absence_type]?.cls || ""
                            }`}
                          >
                            {ABSENCE_TYPE[r.absence_type]?.title || r.absence_type}
                            {r.absence_days ? ` · ${r.absence_days} дн.` : ""}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div>
        <p className="text-sm font-semibold text-slate-900 mb-2">Отсутствия</p>
        {!person.absences.length ? (
          <Empty text="Отсутствий не зарегистрировано" icon="CalendarCheck" />
        ) : (
          <div className="space-y-2">
            {person.absences.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2.5"
              >
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] border ${
                    ABSENCE_TYPE[a.absence_type]?.cls || ""
                  }`}
                >
                  {ABSENCE_TYPE[a.absence_type]?.title || a.absence_type}
                </span>
                <span className="text-sm text-slate-700">
                  {fmtDate(a.date_from)} — {fmtDate(a.date_to)}
                </span>
                {a.hours_per_day && (
                  <span className="text-xs text-slate-500">{a.hours_per_day} ч/день</span>
                )}
                {a.comment && <span className="text-xs text-slate-500 truncate">{a.comment}</span>}
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditAbs(a);
                      setAbsOpen(true);
                    }}
                    className="text-slate-400 hover:text-violet-600 transition-colors"
                  >
                    <Icon name="Pencil" size={14} />
                  </button>
                  <button
                    onClick={() => removeAbs(a.id)}
                    className="text-slate-400 hover:text-red-600 transition-colors"
                  >
                    <Icon name="Trash2" size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-sm font-semibold text-slate-900 mb-2">История ёмкости</p>
        <div className="space-y-1.5">
          {person.capacity.map((c) => (
            <div
              key={c.id}
              className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-2.5 text-sm ${
                c.valid_to ? "border-slate-200 bg-slate-50/60" : "border-violet-200 bg-violet-50/40"
              }`}
            >
              <span className="font-medium text-slate-900 tabular-nums">{c.hours_per_week} ч/нед</span>
              <span className="text-xs text-slate-500">ставка {c.fte}</span>
              <span className="text-xs text-slate-500">график {c.work_schedule}</span>
              <span className="text-xs text-slate-500">
                с {fmtDate(c.valid_from)} {c.valid_to ? `по ${fmtDate(c.valid_to)}` : "— действует"}
              </span>
              {c.note && <span className="text-xs text-slate-400 truncate">{c.note}</span>}
            </div>
          ))}
        </div>
      </div>

      {capOpen && (
        <CapacityForm
          personId={person.id}
          onClose={() => setCapOpen(false)}
          onSaved={() => {
            setCapOpen(false);
            onChanged();
            load();
          }}
        />
      )}
      {absOpen && (
        <AbsenceForm
          personId={person.id}
          item={editAbs}
          onClose={() => setAbsOpen(false)}
          onSaved={() => {
            setAbsOpen(false);
            onChanged();
            load();
          }}
        />
      )}
    </div>
  );
}

function CapacityForm({
  personId,
  onClose,
  onSaved,
}: {
  personId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    hours_per_week: "40",
    fte: "1",
    work_schedule: "5/2",
    valid_from: new Date().toISOString().slice(0, 10),
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await peopleApi.saveCapacity({ person_id: personId, ...f });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Изменить рабочую ёмкость"
      subtitle="Прежний период закроется автоматически, история сохранится"
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={error}
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <TextField
          label="Часов в неделю"
          value={f.hours_per_week}
          onChange={(v) => set("hours_per_week", v)}
          required
          hint="Уже с учётом ставки"
        />
        <TextField
          label="Доля ставки"
          value={f.fte}
          onChange={(v) => set("fte", v)}
          hint="Справочно, в расчёте не используется"
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <SelectField
          label="График"
          value={f.work_schedule}
          onChange={(v) => set("work_schedule", v)}
          options={[
            { value: "5/2", label: "5/2" },
            { value: "2/2", label: "2/2" },
            { value: "flexible", label: "Гибкий" },
          ]}
          placeholder="выберите"
        />
        <DateField label="Действует с" value={f.valid_from} onChange={(v) => set("valid_from", v)} />
      </div>
      <TextField label="Основание" value={f.note} onChange={(v) => set("note", v)} />
    </Modal>
  );
}

function AbsenceForm({
  personId,
  item,
  onClose,
  onSaved,
}: {
  personId: number;
  item: PersonAbsence | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    absence_type: item?.absence_type || "vacation",
    date_from: item?.date_from || new Date().toISOString().slice(0, 10),
    date_to: item?.date_to || "",
    hours_per_day: item?.hours_per_day ? String(item.hours_per_day) : "",
    comment: item?.comment || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await peopleApi.saveAbsence({
        person_id: personId,
        ...(item ? { id: item.id } : {}),
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
      title={item ? "Изменить отсутствие" : "Добавить отсутствие"}
      onClose={onClose}
      onSave={save}
      saving={saving}
      canSave={!!f.date_from && !!f.date_to}
      error={error}
    >
      <SelectField
        label="Тип"
        value={f.absence_type}
        onChange={(v) => set("absence_type", v)}
        options={Object.entries(ABSENCE_TYPE).map(([value, x]) => ({ value, label: x.title }))}
        placeholder="выберите"
      />
      <div className="grid sm:grid-cols-2 gap-3">
        <DateField label="С" value={f.date_from} onChange={(v) => set("date_from", v)} />
        <DateField label="По" value={f.date_to} onChange={(v) => set("date_to", v)} />
      </div>
      <TextField
        label="Часов в день"
        value={f.hours_per_day}
        onChange={(v) => set("hours_per_day", v)}
        hint="Оставьте пустым, если отсутствие полное"
      />
      <TextField label="Комментарий" value={f.comment} onChange={(v) => set("comment", v)} />
    </Modal>
  );
}
