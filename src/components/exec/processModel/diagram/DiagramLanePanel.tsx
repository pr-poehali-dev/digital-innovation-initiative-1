import { useState } from "react";
import Icon from "@/components/ui/icon";
import { TextField, SelectField, Modal } from "@/components/exec/ExecForm";
import { DiagramLane, LaneType, OrgUnitRef, processModelApi } from "@/lib/execProcessModelApi";

/** Модалка создания/редактирования дорожки. Дорожка по подразделению
 * ссылается на существующий org_units (без дублирования справочника),
 * по роли — свободный текст, "требует уточнения" — временная подпись без
 * создания фиктивной записи ни в одном справочнике. */
export default function DiagramLaneModal({
  diagramId,
  lane,
  orgUnits,
  onClose,
  onSaved,
}: {
  diagramId: number;
  lane: DiagramLane | null;
  orgUnits: OrgUnitRef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [laneType, setLaneType] = useState<LaneType>(lane?.lane_type || "org_unit");
  const [title, setTitle] = useState(lane?.title || "");
  const [orgUnitId, setOrgUnitId] = useState(lane?.org_unit_id ? String(lane.org_unit_id) : "");
  const [roleTitle, setRoleTitle] = useState(lane?.role_title || "");
  const [placeholderLabel, setPlaceholderLabel] = useState(lane?.placeholder_label || "Требует уточнения");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!title.trim()) {
      setError("Укажите название дорожки");
      return;
    }
    if (laneType === "org_unit" && !orgUnitId) {
      setError("Выберите подразделение или смените тип дорожки на «Роль» / «Требует уточнения»");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await processModelApi.saveLane({
        id: lane?.id,
        diagram_id: diagramId,
        title: title.trim(),
        lane_type: laneType,
        org_unit_id: laneType === "org_unit" ? Number(orgUnitId) : null,
        role_title: laneType === "role" ? roleTitle.trim() : null,
        placeholder_label: laneType === "placeholder" ? placeholderLabel.trim() : null,
        needs_clarification: laneType === "placeholder",
      });
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={lane ? "Изменить дорожку" : "Добавить дорожку"}
      subtitle="Дорожка — участник процесса: подразделение, роль или временная подпись"
      onClose={onClose}
      onSave={save}
      saving={saving}
      canSave={!!title.trim()}
      error={error}
    >
      <div className="flex gap-1.5">
        {([
          { v: "org_unit", label: "Подразделение", icon: "Building2" },
          { v: "role", label: "Роль", icon: "UserCog" },
          { v: "placeholder", label: "Требует уточнения", icon: "HelpCircle" },
        ] as { v: LaneType; label: string; icon: string }[]).map((opt) => (
          <button
            key={opt.v}
            onClick={() => setLaneType(opt.v)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border text-xs transition-colors ${
              laneType === opt.v ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-500 hover:border-slate-300"
            }`}
          >
            <Icon name={opt.icon} size={13} />
            {opt.label}
          </button>
        ))}
      </div>

      <TextField label="Название дорожки" value={title} onChange={setTitle} required
        placeholder={laneType === "org_unit" ? "Подставится из подразделения" : "Например: Заявитель"} />

      {laneType === "org_unit" && (
        <SelectField
          label="Подразделение"
          value={orgUnitId}
          onChange={(v) => { setOrgUnitId(v); const u = orgUnits.find((x) => String(x.id) === v); if (u && !title.trim()) setTitle(u.name); }}
          required
          options={orgUnits.map((u) => ({ value: String(u.id), label: u.name }))}
        />
      )}
      {laneType === "role" && (
        <TextField label="Название роли" value={roleTitle} onChange={setRoleTitle} placeholder="Например: Куратор процесса" />
      )}
      {laneType === "placeholder" && (
        <TextField label="Пояснение" value={placeholderLabel} onChange={setPlaceholderLabel}
          hint="Ответственный ещё не подтверждён — фиктивная запись в справочник не создаётся" />
      )}
    </Modal>
  );
}
