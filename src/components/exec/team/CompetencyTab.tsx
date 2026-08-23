import { useState } from "react";
import Icon from "@/components/ui/icon";

import { DateField, Modal, SelectField, TextArea, TextField } from "@/components/exec/ExecForm";
import { LevelBar } from "./TeamUI";
import {
  EVIDENCE_TYPE,
  PeopleRefs,
  PersonCompetency,
  PersonDetail,
  peopleApi,
} from "@/lib/execPeopleApi";
import { fmtDate } from "@/components/exec/ExecUI";

export default function CompetencyTab({
  person,
  refs,
  onChanged,
}: {
  person: PersonDetail;
  refs: PeopleRefs | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<PersonCompetency | null>(null);

  const expired = (c: PersonCompetency) =>
    c.valid_until && new Date(c.valid_until) < new Date();

  const grouped = person.competencies.reduce<Record<string, PersonCompetency[]>>((acc, c) => {
    const k = c.domain_name || "Прочее";
    (acc[k] = acc[k] || []).push(c);
    return acc;
  }, {});

  const remove = async (id: number) => {
    await peopleApi.deleteCompetency(id);
    onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Компетенций: <span className="font-medium text-slate-700">{person.competencies.length}</span>
        </p>
        <button
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
          className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs hover:bg-violet-700 transition-colors inline-flex items-center gap-1.5"
        >
          <Icon name="Plus" size={13} />
          Добавить компетенцию
        </button>
      </div>

      {!person.competencies.length ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center">
          <Icon name="Award" size={26} className="text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-600 font-medium">Профиль компетенций не заполнен</p>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Это неполнота данных, а не замечание к сотруднику. Заполните профиль, чтобы
            видеть покрытие функций и подбирать исполнителей по навыкам.
          </p>
          <button
            onClick={() => {
              setEdit(null);
              setOpen(true);
            }}
            className="mt-3 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs hover:bg-violet-700 transition-colors"
          >
            Добавить первую компетенцию
          </button>
        </div>
      ) : (
        Object.entries(grouped).map(([domain, list]) => (
          <div key={domain}>
            <p className="text-[11px] font-semibold text-violet-600/90 uppercase tracking-wide mb-2">
              {domain}
            </p>
            <div className="space-y-2">
              {list.map((c) => (
                <div
                  key={c.id}
                  className={`rounded-lg border p-3 ${
                    expired(c) ? "border-amber-300 bg-amber-50/50" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">{c.competency_name}</p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${
                            expired(c)
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : c.confirmed_by_name
                                ? "bg-green-50 text-green-700 border-green-200"
                                : "bg-slate-100 text-slate-600 border-slate-200"
                          }`}
                        >
                          <Icon
                            name={
                              expired(c)
                                ? "RefreshCw"
                                : c.confirmed_by_name
                                  ? "BadgeCheck"
                                  : "CircleDashed"
                            }
                            size={9}
                          />
                          {expired(c)
                            ? "Требует переподтверждения"
                            : c.confirmed_by_name
                              ? "Подтверждена"
                              : "Не подтверждена"}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-slate-500">
                        <span>Оценено: {fmtDate(c.assessed_at)}</span>
                        <span>· {EVIDENCE_TYPE[c.evidence_type] || c.evidence_type}</span>
                        {c.confirmed_by_name && <span>· подтвердил {c.confirmed_by_name}</span>}
                        {c.valid_until && (
                          <span className={expired(c) ? "text-amber-700 font-medium" : ""}>
                            · действует до {fmtDate(c.valid_until)}
                          </span>
                        )}
                      </div>
                      {c.evidence_comment && (
                        <p className="text-xs text-slate-500 mt-1.5">{c.evidence_comment}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <LevelBar level={c.current_level} target={c.target_level} />
                      <button
                        onClick={() => {
                          setEdit(c);
                          setOpen(true);
                        }}
                        className="text-slate-400 hover:text-violet-600 transition-colors"
                      >
                        <Icon name="Pencil" size={14} />
                      </button>
                      <button
                        onClick={() => remove(c.id)}
                        className="text-slate-400 hover:text-red-600 transition-colors"
                      >
                        <Icon name="Trash2" size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {open && (
        <CompetencyForm
          personId={person.id}
          item={edit}
          refs={refs}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function CompetencyForm({
  personId,
  item,
  refs,
  onClose,
  onSaved,
}: {
  personId: number;
  item: PersonCompetency | null;
  refs: PeopleRefs | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    competency_id: item ? String(item.competency_id) : "",
    current_level: String(item?.current_level || 3),
    target_level: item?.target_level ? String(item.target_level) : "",
    assessed_at: item?.assessed_at || new Date().toISOString().slice(0, 10),
    valid_until: item?.valid_until || "",
    evidence_type: item?.evidence_type || "manager_review",
    evidence_ref: item?.evidence_ref || "",
    evidence_comment: item?.evidence_comment || "",
    confirmed_by_person_id: item?.confirmed_by_person_id ? String(item.confirmed_by_person_id) : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await peopleApi.saveCompetency({ person_id: personId, ...f });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const levels = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `Уровень ${n}` }));

  return (
    <Modal
      title={item ? "Изменить компетенцию" : "Добавить компетенцию"}
      subtitle="Из общего каталога компетенций"
      onClose={onClose}
      onSave={save}
      saving={saving}
      canSave={!!f.competency_id}
      error={error}
    >
      <SelectField
        label="Компетенция"
        value={f.competency_id}
        onChange={(v) => set("competency_id", v)}
        required
        options={(refs?.competencies || []).map((c) => ({
          value: String(c.id),
          label: c.domain_name ? `${c.domain_name}: ${c.name}` : c.name,
        }))}
      />
      <div className="grid sm:grid-cols-2 gap-3">
        <SelectField
          label="Текущий уровень"
          value={f.current_level}
          onChange={(v) => set("current_level", v)}
          options={levels}
          placeholder="выберите"
        />
        <SelectField
          label="Целевой уровень"
          value={f.target_level}
          onChange={(v) => set("target_level", v)}
          options={levels}
          placeholder="не задан"
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <DateField label="Дата оценки" value={f.assessed_at} onChange={(v) => set("assessed_at", v)} />
        <DateField
          label="Действует до"
          value={f.valid_until}
          onChange={(v) => set("valid_until", v)}
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <SelectField
          label="Способ подтверждения"
          value={f.evidence_type}
          onChange={(v) => set("evidence_type", v)}
          options={Object.entries(EVIDENCE_TYPE).map(([value, label]) => ({ value, label }))}
          placeholder="выберите"
        />
        <SelectField
          label="Кто подтвердил"
          value={f.confirmed_by_person_id}
          onChange={(v) => set("confirmed_by_person_id", v)}
          options={(refs?.persons || []).map((p) => ({
            value: String(p.id),
            label: p.display_name,
          }))}
          placeholder="не подтверждено"
        />
      </div>
      <TextField
        label="Ссылка на подтверждение"
        value={f.evidence_ref}
        onChange={(v) => set("evidence_ref", v)}
        placeholder="Номер сертификата или ссылка на документ"
      />
      <TextArea
        label="Комментарий"
        value={f.evidence_comment}
        onChange={(v) => set("evidence_comment", v)}
        rows={2}
      />
    </Modal>
  );
}
