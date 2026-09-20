import { useEffect, useState } from "react";
import { TextArea, SelectField } from "@/components/exec/ExecForm";
import { ProcessModelScope, processScopeApi } from "@/lib/execProcessScopeApi";
import { TeamMember } from "@/lib/execPeopleApi";

export default function ScopePurposeStep({
  scope,
  people,
  readOnly,
  onSaved,
}: {
  scope: ProcessModelScope;
  people: TeamMember[];
  readOnly: boolean;
  onSaved: () => void;
}) {
  const [purpose, setPurpose] = useState(scope.purpose || "");
  const [scopeIn, setScopeIn] = useState(scope.scope_in || "");
  const [scopeOut, setScopeOut] = useState(scope.scope_out || "");
  const [ownerId, setOwnerId] = useState(scope.owner_person_id ? String(scope.owner_person_id) : "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPurpose(scope.purpose || "");
    setScopeIn(scope.scope_in || "");
    setScopeOut(scope.scope_out || "");
    setOwnerId(scope.owner_person_id ? String(scope.owner_person_id) : "");
  }, [scope.id]);

  const save = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await processScopeApi.saveScope({
        scope_id: scope.id,
        purpose: purpose.trim(),
        scope_in: scopeIn.trim(),
        scope_out: scopeOut.trim(),
        owner_person_id: ownerId ? Number(ownerId) : null,
      });
      setSaved(true);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Назначение и границы Блока ВК</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Формулировки — вручную, без анализа документов. Помощник справа подскажет пример.
        </p>
      </div>

      <TextArea
        label="Зачем существует Блок ВК"
        value={purpose}
        onChange={(v) => { setPurpose(v); setSaved(false); }}
        rows={3}
        placeholder="Например: обеспечение внутреннего контроля, комплаенса и противодействия недобросовестным практикам"
        hint={readOnly ? undefined : "Обязательное поле"}
      />
      <TextArea
        label="Что входит в границы модели"
        value={scopeIn}
        onChange={(v) => { setScopeIn(v); setSaved(false); }}
        rows={3}
        placeholder="Например: контрольные и надзорные функции подразделений блока"
      />
      <TextArea
        label="Что не входит (исключения)"
        value={scopeOut}
        onChange={(v) => { setScopeOut(v); setSaved(false); }}
        rows={3}
        placeholder="Например: операционная деятельность бизнес-подразделений — объектов контроля"
      />
      <SelectField
        label="Владелец модели (необязательно)"
        value={ownerId}
        onChange={(v) => { setOwnerId(v); setSaved(false); }}
        options={people.map((p) => ({ value: String(p.id), label: p.display_name }))}
        placeholder="не назначен"
      />

      {!readOnly && (
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={save}
            disabled={saving || !purpose.trim()}
            className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700 transition-colors disabled:opacity-40"
          >
            {saving ? "Сохраняю…" : "Сохранить"}
          </button>
          {saved && <span className="text-xs text-green-600">Сохранено</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      )}
    </div>
  );
}
