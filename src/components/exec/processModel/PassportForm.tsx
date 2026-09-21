import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { TextArea, SelectField } from "@/components/exec/ExecForm";
import {
  processModelApi,
  ProcessDetail,
  CompletenessResult,
  PersonRef,
  OrgUnitRef,
  ParticipationKind,
  ConflictError,
} from "@/lib/execProcessModelApi";
import ConflictDialog from "./ConflictDialog";

const PARTICIPATION_LABEL: Record<ParticipationKind, string> = {
  owner: "Владелец",
  executor: "Исполнитель",
  reviewer: "Проверяющий",
  consumer: "Потребитель",
  supplier: "Поставщик",
};

function ParticipantsBlock({
  nodeId,
  participants,
  people,
  orgUnits,
  canEdit,
  onChanged,
}: {
  nodeId: number;
  participants: ProcessDetail["participants"];
  people: PersonRef[];
  orgUnits: OrgUnitRef[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [roleTitle, setRoleTitle] = useState("");
  const [personId, setPersonId] = useState("");
  const [orgUnitId, setOrgUnitId] = useState("");
  const [kind, setKind] = useState<ParticipationKind>("executor");
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!roleTitle.trim()) return;
    setSaving(true);
    try {
      await processModelApi.saveParticipant({
        process_node_id: nodeId,
        role_title: roleTitle.trim(),
        person_id: personId ? Number(personId) : null,
        org_unit_id: orgUnitId ? Number(orgUnitId) : null,
        participation_kind: kind,
      });
      setRoleTitle(""); setPersonId(""); setOrgUnitId(""); setKind("executor");
      setAdding(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    await processModelApi.removeParticipant(id);
    onChanged();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Участники и роли</p>
        {canEdit && !adding && (
          <button onClick={() => setAdding(true)} className="text-xs text-violet-600 hover:text-violet-700 flex items-center gap-1">
            <Icon name="Plus" size={12} /> Добавить
          </button>
        )}
      </div>
      {participants.length === 0 && !adding && (
        <p className="text-xs text-slate-400">Участники ещё не указаны</p>
      )}
      <div className="space-y-1.5">
        {participants.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2 text-xs bg-slate-50 rounded-md px-2.5 py-1.5">
            <div className="min-w-0">
              <span className="font-medium text-slate-800">{p.role_title}</span>
              <span className="text-slate-400 mx-1.5">·</span>
              <span className="text-slate-500">{PARTICIPATION_LABEL[p.participation_kind]}</span>
              {(p.person_name || p.org_unit_name) && (
                <span className="text-slate-400"> — {p.person_name || p.org_unit_name}</span>
              )}
            </div>
            {canEdit && (
              <button onClick={() => remove(p.id)} className="text-slate-300 hover:text-red-600 flex-shrink-0">
                <Icon name="X" size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
      {adding && (
        <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-2.5 space-y-2">
          <input
            value={roleTitle}
            onChange={(e) => setRoleTitle(e.target.value)}
            placeholder="Название роли, например «Куратор процесса»"
            className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 text-xs outline-none focus:border-violet-500"
          />
          <div className="grid grid-cols-2 gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value as ParticipationKind)}
              className="px-2.5 py-1.5 rounded-md border border-slate-300 text-xs">
              {Object.entries(PARTICIPATION_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={personId} onChange={(e) => setPersonId(e.target.value)}
              className="px-2.5 py-1.5 rounded-md border border-slate-300 text-xs">
              <option value="">без сотрудника</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
            </select>
          </div>
          <select value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 text-xs">
            <option value="">без подразделения</option>
            {orgUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <div className="flex justify-end gap-2">
            <button onClick={() => setAdding(false)} className="text-xs text-slate-500 px-2 py-1">Отмена</button>
            <button onClick={add} disabled={saving || !roleTitle.trim()}
              className="text-xs px-2.5 py-1 rounded-md bg-violet-600 text-white disabled:opacity-40">
              Добавить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PassportForm({
  detail,
  people,
  orgUnits,
  canEdit,
  onChanged,
}: {
  detail: ProcessDetail;
  people: PersonRef[];
  orgUnits: OrgUnitRef[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const p = detail.passport;
  const [goal, setGoal] = useState(p?.goal || "");
  const [boundaries, setBoundaries] = useState(p?.boundaries_note || "");
  const [trigger, setTrigger] = useState(p?.trigger_event || "");
  const [inputs, setInputs] = useState(p?.inputs_note || "");
  const [outputs, setOutputs] = useState(p?.outputs_note || "");
  const [suppliers, setSuppliers] = useState(p?.suppliers_note || "");
  const [consumers, setConsumers] = useState(p?.consumers_note || "");
  const [ownerId, setOwnerId] = useState(detail.node.owner_person_id ? String(detail.node.owner_person_id) : "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [completeness, setCompleteness] = useState<CompletenessResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [conflict, setConflict] = useState<ConflictError | null>(null);

  useEffect(() => {
    setGoal(p?.goal || ""); setBoundaries(p?.boundaries_note || ""); setTrigger(p?.trigger_event || "");
    setInputs(p?.inputs_note || ""); setOutputs(p?.outputs_note || ""); setSuppliers(p?.suppliers_note || "");
    setConsumers(p?.consumers_note || ""); setOwnerId(detail.node.owner_person_id ? String(detail.node.owner_person_id) : "");
    setCompleteness(null);
  }, [detail.node.id]);

  const runCheck = () => {
    setChecking(true);
    processModelApi.passportCompleteness(detail.node.id).then(setCompleteness).finally(() => setChecking(false));
  };

  // Итерация 4, раздел 1: сервер отклоняет устаревшее сохранение (409), если
  // паспорт был изменён другим пользователем после открытия формы —
  // expected_updated_at берём из уже загруженного паспорта.
  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await processModelApi.savePassport({
        process_node_id: detail.node.id,
        goal: goal.trim(), boundaries_note: boundaries.trim(), trigger_event: trigger.trim(),
        inputs_note: inputs.trim(), outputs_note: outputs.trim(),
        suppliers_note: suppliers.trim(), consumers_note: consumers.trim(),
        expected_updated_at: p?.updated_at,
      });
      if (ownerId !== (detail.node.owner_person_id ? String(detail.node.owner_person_id) : "")) {
        await processModelApi.saveProcessNode({ id: detail.node.id, owner_person_id: ownerId ? Number(ownerId) : null, expected_updated_at: detail.node.updated_at });
      }
      setSaved(true);
      onChanged();
    } catch (e) {
      if (e instanceof ConflictError) setConflict(e);
      else throw e;
    } finally {
      setSaving(false);
    }
  };

  const disabled = !canEdit || detail.node.model_status === "confirmed" || detail.node.model_status === "published";

  return (
    <>
    {conflict && (
      <ConflictDialog
        error={conflict}
        onReload={() => { setConflict(null); onChanged(); }}
        onDismiss={() => setConflict(null)}
      />
    )}
    <div className="grid md:grid-cols-[1fr_260px] gap-4">
      <div className="space-y-3">
        <SelectField label="Владелец процесса" value={ownerId} onChange={(v) => { setOwnerId(v); setSaved(false); }}
          options={people.map((pp) => ({ value: String(pp.id), label: pp.display_name }))}
          placeholder="не назначен" required hint={disabled ? undefined : "Обязательно для подтверждения"} />
        <TextArea label="Цель процесса" value={goal} onChange={(v) => { setGoal(v); setSaved(false); }} rows={2}
          placeholder="Проверяемая формулировка: что достигается в результате" />
        <TextArea label="Границы процесса" value={boundaries} onChange={(v) => { setBoundaries(v); setSaved(false); }} rows={2}
          placeholder="С чего процесс начинается и чем заканчивается" />
        <TextArea label="Запускающее событие" value={trigger} onChange={(v) => { setTrigger(v); setSaved(false); }} rows={2}
          placeholder="Например: получено уведомление регулятора об изменении требований" />
        <div className="grid grid-cols-2 gap-3">
          <TextArea label="Входы" value={inputs} onChange={(v) => { setInputs(v); setSaved(false); }} rows={2} />
          <TextArea label="Выходы" value={outputs} onChange={(v) => { setOutputs(v); setSaved(false); }} rows={2} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextArea label="Поставщики входов" value={suppliers} onChange={(v) => { setSuppliers(v); setSaved(false); }} rows={2} />
          <TextArea label="Потребители результата" value={consumers} onChange={(v) => { setConsumers(v); setSaved(false); }} rows={2} />
        </div>

        {!disabled && (
          <div className="flex items-center gap-3">
            <button onClick={save} disabled={saving}
              className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700 transition-colors disabled:opacity-40">
              {saving ? "Сохраняю…" : "Сохранить"}
            </button>
            {saved && <span className="text-xs text-green-600">Сохранено</span>}
          </div>
        )}

        <ParticipantsBlock nodeId={detail.node.id} participants={detail.participants} people={people}
          orgUnits={orgUnits} canEdit={!disabled} onChanged={onChanged} />
      </div>

      <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3.5 space-y-3 h-fit sticky top-4">
        <div className="flex items-center gap-2">
          <Icon name="Compass" size={14} className="text-violet-600" />
          <p className="text-xs font-semibold text-slate-900">Проверка паспорта</p>
        </div>
        <button onClick={runCheck} disabled={checking}
          className="w-full px-3 py-1.5 rounded-lg border border-violet-300 bg-white text-violet-700 text-xs font-medium hover:bg-violet-50 disabled:opacity-50 flex items-center justify-center gap-1.5">
          {checking ? <span className="w-3 h-3 border border-violet-300 border-t-violet-600 rounded-full animate-spin" /> : <Icon name="ListChecks" size={12} />}
          Проверить
        </button>
        {completeness && (
          <div className="space-y-1.5">
            {completeness.ready.map((it) => (
              <div key={it.code} className="flex items-start gap-1.5 text-[11px] text-green-700">
                <Icon name="CheckCircle2" size={12} className="flex-shrink-0 mt-0.5" />
                <span>{it.label}</span>
              </div>
            ))}
            {completeness.needs_attention.map((it) => (
              <div key={it.code} className="flex items-start gap-1.5 text-[11px] text-amber-700">
                <Icon name="AlertTriangle" size={12} className="flex-shrink-0 mt-0.5" />
                <div>
                  <p>{it.label}</p>
                  {it.detail && <p className="text-amber-600/80">{it.detail}</p>}
                </div>
              </div>
            ))}
            {completeness.can_confirm && (
              <div className="pt-1.5 mt-1.5 border-t border-violet-200 text-[11px] text-green-700 flex items-center gap-1.5">
                <Icon name="BadgeCheck" size={12} /> Готово для подтверждения
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    </>
  );
}