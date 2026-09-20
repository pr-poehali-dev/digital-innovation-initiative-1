import { useState } from "react";
import Icon from "@/components/ui/icon";
import { TextArea, SelectField, Modal } from "@/components/exec/ExecForm";
import { ScopeCandidate, ScopeUnit, processScopeApi } from "@/lib/execProcessScopeApi";

const TYPE_LABEL: Record<string, string> = {
  department: "Департамент",
  management: "Управление",
  division: "Подразделение",
  group: "Группа",
  center: "Центр",
  block: "Блок",
};

function UnitRow({
  unit,
  onChanged,
  readOnly,
}: {
  unit: ScopeUnit;
  onChanged: () => void;
  readOnly: boolean;
}) {
  const [excludeOpen, setExcludeOpen] = useState(false);
  const [reason, setReason] = useState(unit.exclusion_reason || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const confirmInclude = async () => {
    setSaving(true);
    try {
      await processScopeApi.saveUnitDecision({
        scope_id: unit.scope_id,
        org_unit_id: unit.org_unit_id,
        decision: "included",
        confirmation_status: "confirmed",
      });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const doExclude = async () => {
    if (!reason.trim()) {
      setError("Укажите причину исключения");
      return;
    }
    setSaving(true);
    try {
      await processScopeApi.saveUnitDecision({
        scope_id: unit.scope_id,
        org_unit_id: unit.org_unit_id,
        decision: "excluded",
        exclusion_reason: reason.trim(),
        confirmation_status: "confirmed",
      });
      setExcludeOpen(false);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const removeManual = async () => {
    setSaving(true);
    try {
      await processScopeApi.removeManualUnit(unit.scope_id, unit.org_unit_id);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const isExcluded = unit.decision === "excluded";
  const isPending = unit.confirmation_status === "pending";

  return (
    <div className={`rounded-lg border p-3 ${isExcluded ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-sm font-medium ${isExcluded ? "text-slate-400 line-through" : "text-slate-900"}`}>
              {unit.name}
            </p>
            {unit.code && <span className="text-[10px] text-slate-400 font-mono">{unit.code}</span>}
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-500">
              {TYPE_LABEL[unit.type] || unit.type}
            </span>
            {unit.is_manually_added && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                добавлено вручную
              </span>
            )}
            {!unit.is_manually_added && !unit.is_structural_child && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200"
                title="Подставлено системой вместе с остальными подразделениями. Не является дочерним оргюнитом Блока ВК в оргструктуре — включено по функциональному признаку."
              >
                не дочернее в оргструктуре
              </span>
            )}
            {isPending ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                ожидает решения
              </span>
            ) : isExcluded ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                исключено
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">
                подтверждено
              </span>
            )}
          </div>
          {isExcluded && unit.exclusion_reason && (
            <p className="text-xs text-slate-500 mt-1">Причина: {unit.exclusion_reason}</p>
          )}
          {unit.comment && !isExcluded && <p className="text-xs text-slate-500 mt-1">{unit.comment}</p>}
        </div>

        {!readOnly && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isExcluded ? (
              <button
                onClick={confirmInclude}
                disabled={saving}
                className="text-xs px-2 py-1 rounded-md border border-green-200 text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50"
              >
                Вернуть и подтвердить
              </button>
            ) : (
              <>
                {isPending && (
                  <button
                    onClick={confirmInclude}
                    disabled={saving}
                    className="text-xs px-2 py-1 rounded-md bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-50"
                  >
                    Подтвердить
                  </button>
                )}
                <button
                  onClick={() => setExcludeOpen(true)}
                  disabled={saving}
                  className="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-700 transition-colors disabled:opacity-50"
                >
                  Исключить
                </button>
              </>
            )}
            {unit.is_manually_added && (
              <button
                onClick={removeManual}
                disabled={saving}
                className="text-xs px-2 py-1 rounded-md text-slate-400 hover:text-red-600 transition-colors disabled:opacity-50"
                title="Удалить из списка (можно только для добавленных вручную)"
              >
                <Icon name="X" size={13} />
              </button>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      {excludeOpen && (
        <Modal
          title={`Исключить «${unit.name}»`}
          subtitle="Укажите причину — она будет видна в паспорте модели"
          onClose={() => setExcludeOpen(false)}
          onSave={doExclude}
          saving={saving}
          saveLabel="Исключить"
          canSave={!!reason.trim()}
          error={error}
        >
          <TextArea label="Причина исключения" value={reason} onChange={setReason} rows={3}
            placeholder="Например: подразделение не выполняет контрольных функций Блока ВК" />
        </Modal>
      )}
    </div>
  );
}

function AddUnitModal({
  scopeId,
  candidates,
  onClose,
  onAdded,
}: {
  scopeId: number;
  candidates: ScopeCandidate[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [orgUnitId, setOrgUnitId] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!orgUnitId) {
      setError("Выберите подразделение");
      return;
    }
    setSaving(true);
    try {
      await processScopeApi.addManualUnit(scopeId, Number(orgUnitId), comment.trim() || undefined);
      onAdded();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Добавить подразделение в границы"
      subtitle="Выбор — из существующей оргструктуры, новый оргюнит здесь не создаётся"
      onClose={onClose}
      onSave={save}
      saving={saving}
      saveLabel="Добавить"
      canSave={!!orgUnitId}
      error={error}
    >
      <SelectField
        label="Подразделение"
        value={orgUnitId}
        onChange={setOrgUnitId}
        required
        options={candidates.map((c) => ({ value: String(c.id), label: `${c.code ? c.code + " · " : ""}${c.name}` }))}
      />
      <TextArea label="Комментарий (необязательно)" value={comment} onChange={setComment} rows={2}
        placeholder="Например: функционально входит в контур Блока ВК" />
    </Modal>
  );
}

export default function ScopeUnitsStep({
  scopeId,
  units,
  candidates,
  readOnly,
  onChanged,
  onOpenOrgModel,
}: {
  scopeId: number;
  units: ScopeUnit[];
  candidates: ScopeCandidate[];
  readOnly: boolean;
  onChanged: () => void;
  onOpenOrgModel: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Состав Блока ВК</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Подразделения подставлены из существующей оргструктуры и не дублируются здесь.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenOrgModel}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-slate-400 transition-colors flex items-center gap-1.5"
          >
            <Icon name="ExternalLink" size={12} />
            Открыть оргструктуру
          </button>
          {!readOnly && (
            <button
              onClick={() => setAddOpen(true)}
              className="text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors flex items-center gap-1.5"
            >
              <Icon name="Plus" size={12} />
              Добавить подразделение
            </button>
          )}
        </div>
      </div>

      {units.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">Подразделения ещё не подставлены</p>
      ) : (
        <div className="space-y-2">
          {units.map((u) => (
            <UnitRow key={u.id} unit={u} onChanged={onChanged} readOnly={readOnly} />
          ))}
        </div>
      )}

      {addOpen && (
        <AddUnitModal
          scopeId={scopeId}
          candidates={candidates}
          onClose={() => setAddOpen(false)}
          onAdded={onChanged}
        />
      )}
    </div>
  );
}