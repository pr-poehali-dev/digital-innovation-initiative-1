import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading, fmtDate } from "@/components/exec/ExecUI";
import { CheckField, DateField, Modal, SelectField, TextArea, TextField } from "@/components/exec/ExecForm";
import {
  Center,
  CenterRefs,
  Participation,
  PARTICIPATION_FORMAT,
  RESOURCE_SOURCE,
  centerApi,
} from "@/lib/execCenterApi";
import { PersonDetail } from "@/lib/execPeopleApi";

/** Участие сотрудника распределённой команды в модели Центра —
 * до его официального создания. Дополняет RACI и не дублирует его. */
export default function ParticipationTab({ person }: { person: PersonDetail }) {
  const [center, setCenter] = useState<Center | null>(null);
  const [refs, setRefs] = useState<CenterRefs | null>(null);
  const [participation, setParticipation] = useState<Participation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([centerApi.model(), centerApi.refs()])
      .then(([m, r]) => {
        setCenter(m.center);
        setRefs(r);
        const mine = m.current_team.participation.find((p) => p.person_id === person.id);
        setParticipation(mine || null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [person.id]);

  const remove = async () => {
    if (!participation) return;
    if (!window.confirm("Убрать участие в модели Центра?")) return;
    await centerApi.deleteParticipation(participation.id);
    load();
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!center) {
    return (
      <Empty
        text="Паспорт Центра ещё не создан — сначала откройте раздел Центра"
        icon="Building2"
      />
    );
  }

  const totalHours = participation?.total_hours_per_week;
  const centerHours = participation?.center_hours_per_week;
  const otherHours =
    totalHours != null && centerHours != null ? Number(totalHours) - Number(centerHours) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 flex items-start gap-2">
        <Icon name="Info" size={14} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          Здесь фиксируется, как сотрудник участвует в работе Центра ещё до его официального
          создания — параллельно с текущим подразделением.
        </p>
      </div>

      {!participation ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center">
          <Icon name="UsersRound" size={26} className="text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-600 font-medium">
            Участие в модели Центра не описано
          </p>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Добавьте формат участия и долю времени, выделяемую на задачи Центра, чтобы верно
            считать загрузку и обоснование численности.
          </p>
          <button
            onClick={() => setFormOpen(true)}
            className="mt-3 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs hover:bg-violet-700 transition-colors"
          >
            Описать участие
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <span
                className={`text-xs px-2 py-0.5 rounded border font-medium ${
                  PARTICIPATION_FORMAT[participation.participation_format]?.cls ||
                  "bg-slate-100 text-slate-600 border-slate-200"
                }`}
              >
                {participation.format_title}
              </span>
              <span className="text-xs px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600">
                {participation.source_title}
              </span>
              {participation.planned_transfer && (
                <span className="text-xs px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-700">
                  Планируется перевод
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setFormOpen(true)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                title="Изменить"
              >
                <Icon name="Pencil" size={14} />
              </button>
              <button
                onClick={remove}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                title="Убрать"
              >
                <Icon name="Trash2" size={14} />
              </button>
            </div>
          </div>

          {participation.role_in_model && (
            <div>
              <p className="text-xs text-slate-400">Роль в модели Центра</p>
              <p className="text-sm text-slate-800 mt-0.5">{participation.role_in_model}</p>
            </div>
          )}

          <div className="grid sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
            <div>
              <p className="text-xs text-slate-400">Общая ёмкость</p>
              <p className="text-sm font-medium text-slate-800 mt-0.5">
                {totalHours != null ? `${totalHours} ч/нед` : "не задана"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Доступно для Центра</p>
              <p className="text-sm font-semibold text-violet-700 mt-0.5">
                {centerHours != null ? `${centerHours} ч/нед` : "не задано"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Остаётся на прочие задачи</p>
              <p className="text-sm text-slate-600 mt-0.5">
                {otherHours != null ? `${otherHours} ч/нед` : "—"}
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-400">Плановые часы по задачам Центра</p>
              <p className="text-sm text-slate-700 mt-0.5">
                {participation.center_plan_hours} ч
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Фактические часы по задачам Центра</p>
              <p className="text-sm text-slate-700 mt-0.5">
                {participation.center_fact_hours} ч
              </p>
            </div>
          </div>

          {participation.target_role_title && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-400">Планируемая роль после создания Центра</p>
              <p className="text-sm text-slate-800 mt-0.5">{participation.target_role_title}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 pt-2 border-t border-slate-100">
            {participation.date_from && <span>с {fmtDate(participation.date_from)}</span>}
            {participation.date_to && <span>по {fmtDate(participation.date_to)}</span>}
          </div>

          {participation.note && (
            <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">
              {participation.note}
            </p>
          )}

          {participation.functions.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-400 mb-1.5">Функции по матрице RACI</p>
              <div className="flex flex-wrap gap-1.5">
                {participation.functions.map((f) => (
                  <span
                    key={`${f.function_id}-${f.raci_role}`}
                    className="text-[11px] px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600"
                  >
                    {f.function_title} ({f.raci_role}
                    {f.is_backup ? ", замещ." : ""})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {formOpen && refs && (
        <ParticipationForm
          personId={person.id}
          centerId={center.id}
          participation={participation}
          refs={refs}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

export function ParticipationForm({
  personId,
  centerId,
  participation,
  onClose,
  onSaved,
}: {
  personId: number;
  centerId: number;
  participation: Participation | null;
  refs: CenterRefs;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    role_in_model: participation?.role_in_model || "",
    participation_format: participation?.participation_format || "partial",
    center_hours_per_week:
      participation?.center_hours_per_week != null
        ? String(participation.center_hours_per_week)
        : "",
    target_role_title: participation?.target_role_title || "",
    planned_transfer: participation?.planned_transfer || false,
    resource_source: participation?.resource_source || "own_staff",
    date_from: participation?.date_from || "",
    date_to: participation?.date_to || "",
    note: participation?.note || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (v: string | boolean) =>
    setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await centerApi.saveParticipation({
        ...(participation ? { id: participation.id } : {}),
        person_id: personId,
        center_id: centerId,
        ...f,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={participation ? "Участие в модели Центра" : "Описать участие"}
      subtitle="Формат работы в интересах Центра параллельно с текущим подразделением"
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={error}
      wide
    >
      <TextField
        label="Роль в модели Центра"
        value={f.role_in_model}
        onChange={(v) => set("role_in_model")(v)}
        hint="Например: аналитик, куратор функции, эксперт"
      />
      <div className="grid sm:grid-cols-2 gap-4">
        <SelectField
          label="Формат участия"
          value={f.participation_format}
          onChange={(v) => set("participation_format")(v)}
          options={Object.entries(PARTICIPATION_FORMAT).map(([value, x]) => ({
            value,
            label: x.title,
          }))}
        />
        <SelectField
          label="Источник ресурса"
          value={f.resource_source}
          onChange={(v) => set("resource_source")(v)}
          options={Object.entries(RESOURCE_SOURCE).map(([value, x]) => ({
            value,
            label: x.title,
          }))}
        />
      </div>
      <TextField
        label="Часов в неделю на задачи Центра"
        value={f.center_hours_per_week}
        onChange={(v) => set("center_hours_per_week")(v.replace(/[^\d.,]/g, "").slice(0, 6))}
        hint="Из общей рабочей ёмкости — сколько выделяется именно Центру"
      />
      <TextField
        label="Планируемая роль после создания Центра"
        value={f.target_role_title}
        onChange={(v) => set("target_role_title")(v)}
      />
      <CheckField
        label="Предполагается перевод в штат Центра"
        checked={f.planned_transfer}
        onChange={(v) => set("planned_transfer")(v)}
      />
      <div className="grid sm:grid-cols-2 gap-4">
        <DateField label="Дата начала участия" value={f.date_from} onChange={(v) => set("date_from")(v)} />
        <DateField label="Дата окончания" value={f.date_to} onChange={(v) => set("date_to")(v)} />
      </div>
      <TextArea label="Заметки" value={f.note} onChange={(v) => set("note")(v)} rows={2} />
    </Modal>
  );
}