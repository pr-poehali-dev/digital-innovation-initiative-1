import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { TextField, TextArea, SelectField, CheckField } from "@/components/exec/ExecForm";
import {
  DiagramNode,
  DiagramLane,
  OrgUnitRef,
  PersonRef,
  InfoSystem,
  NODE_TYPE_ICON,
  processModelApi,
} from "@/lib/execProcessModelApi";

const NODE_TYPE_LABEL: Record<string, string> = {
  start: "Начальное событие", end: "Конечное событие", task: "Операция", gateway: "Решение",
  subprocess: "Подпроцесс", document: "Документ", system: "Информационная система",
  control: "Контрольная процедура", note: "Примечание",
};

/** Боковая панель свойств выбранного элемента схемы. Автосохраняет изменения
 * с небольшой задержкой (debounce) — без явной кнопки "Сохранить" для каждого
 * поля, чтобы не мешать быстрой работе с холстом. */
export default function DiagramPropertiesPanel({
  node,
  lanes,
  people,
  orgUnits,
  systems,
  readOnly,
  onChanged,
  onDelete,
  onClose,
}: {
  node: DiagramNode;
  lanes: DiagramLane[];
  people: PersonRef[];
  orgUnits: OrgUnitRef[];
  systems: InfoSystem[];
  readOnly: boolean;
  onChanged: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(node.label || "");
  const [description, setDescription] = useState(node.description || "");
  const [laneId, setLaneId] = useState(node.lane_id ? String(node.lane_id) : "");
  const [personId, setPersonId] = useState(node.ref_person_id ? String(node.ref_person_id) : "");
  const [roleTitle, setRoleTitle] = useState(node.ref_role_title || "");
  const [orgUnitId, setOrgUnitId] = useState(node.ref_org_unit_id ? String(node.ref_org_unit_id) : "");
  const [inputNote, setInputNote] = useState(node.input_note || "");
  const [outputNote, setOutputNote] = useState(node.output_note || "");
  const [documentNote, setDocumentNote] = useState(node.document_note || "");
  const [systemId, setSystemId] = useState(node.ref_system_id ? String(node.ref_system_id) : "");
  const [systemNote, setSystemNote] = useState(node.system_note || "");
  const [durationNote, setDurationNote] = useState(node.duration_note || "");
  const [isCritical, setIsCritical] = useState(node.is_critical);
  const [gatewayOutcomes, setGatewayOutcomes] = useState(node.gateway_outcomes || "");
  const [note, setNote] = useState(node.note || "");
  const [confirmed, setConfirmed] = useState(node.confirmation_status === "confirmed");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLabel(node.label || ""); setDescription(node.description || ""); setLaneId(node.lane_id ? String(node.lane_id) : "");
    setPersonId(node.ref_person_id ? String(node.ref_person_id) : ""); setRoleTitle(node.ref_role_title || "");
    setOrgUnitId(node.ref_org_unit_id ? String(node.ref_org_unit_id) : ""); setInputNote(node.input_note || "");
    setOutputNote(node.output_note || ""); setDocumentNote(node.document_note || "");
    setSystemId(node.ref_system_id ? String(node.ref_system_id) : ""); setSystemNote(node.system_note || "");
    setDurationNote(node.duration_note || ""); setIsCritical(node.is_critical); setGatewayOutcomes(node.gateway_outcomes || "");
    setNote(node.note || ""); setConfirmed(node.confirmation_status === "confirmed");
  }, [node.id]);

  const save = async (patch: Record<string, unknown>) => {
    if (readOnly) return;
    setSaving(true);
    try {
      await processModelApi.saveDiagramNode({ id: node.id, ...patch });
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-[300px] flex-shrink-0 border-l border-slate-200 bg-white h-full overflow-y-auto">
      <div className="flex items-center justify-between gap-2 p-3.5 border-b border-slate-200 sticky top-0 bg-white z-10">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name={NODE_TYPE_ICON[node.node_type]} size={15} className="text-violet-600 flex-shrink-0" />
          <p className="text-sm font-semibold text-slate-900 truncate">{NODE_TYPE_LABEL[node.node_type]}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {saving && <span className="w-3 h-3 border border-slate-300 border-t-violet-600 rounded-full animate-spin" />}
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><Icon name="X" size={16} /></button>
        </div>
      </div>

      <div className="p-3.5 space-y-3">
        <TextField label="Название" value={label} onChange={(v) => { setLabel(v); }} placeholder="Краткое название"
          hint={readOnly ? undefined : undefined} />
        {!readOnly && label !== (node.label || "") && (
          <button onClick={() => save({ label })} className="text-[11px] text-violet-600 hover:text-violet-700 -mt-2">Сохранить название</button>
        )}

        {node.node_type === "task" && (
          <>
            <TextArea label="Описание" value={description} onChange={setDescription} rows={2} />
            {!readOnly && description !== (node.description || "") && (
              <button onClick={() => save({ description })} className="text-[11px] text-violet-600 hover:text-violet-700 -mt-2">Сохранить описание</button>
            )}

            <SelectField label="Дорожка" value={laneId}
              onChange={(v) => { setLaneId(v); save({ lane_id: v ? Number(v) : null }); }}
              options={lanes.map((l) => ({ value: String(l.id), label: l.title }))} placeholder="не выбрана"
              hint="Операция должна находиться в дорожке своего исполнителя" />

            <SelectField label="Исполнитель (сотрудник)" value={personId}
              onChange={(v) => { setPersonId(v); save({ person_id: v ? Number(v) : null }); }}
              options={people.map((p) => ({ value: String(p.id), label: p.display_name }))} placeholder="не назначен" />
            <TextField label="Исполнитель (роль текстом)" value={roleTitle}
              onChange={setRoleTitle} placeholder="Если конкретный сотрудник не назначен" />
            {!readOnly && roleTitle !== (node.ref_role_title || "") && (
              <button onClick={() => save({ ref_role_title: roleTitle || null })} className="text-[11px] text-violet-600 hover:text-violet-700 -mt-2">Сохранить роль</button>
            )}
            <SelectField label="Подразделение-исполнитель" value={orgUnitId}
              onChange={(v) => { setOrgUnitId(v); save({ ref_org_unit_id: v ? Number(v) : null }); }}
              options={orgUnits.map((u) => ({ value: String(u.id), label: u.name }))} placeholder="как у дорожки" />

            <TextArea label="Вход" value={inputNote} onChange={setInputNote} rows={2} />
            {!readOnly && inputNote !== (node.input_note || "") && (
              <button onClick={() => save({ input_note: inputNote })} className="text-[11px] text-violet-600 hover:text-violet-700 -mt-2">Сохранить вход</button>
            )}
            <TextArea label="Результат" value={outputNote} onChange={setOutputNote} rows={2} />
            {!readOnly && outputNote !== (node.output_note || "") && (
              <button onClick={() => save({ output_note: outputNote })} className="text-[11px] text-violet-600 hover:text-violet-700 -mt-2">Сохранить результат</button>
            )}

            <TextField label="Длительность" value={durationNote} onChange={setDurationNote}
              placeholder="Например: 2 рабочих дня — если данных нет, оставьте пустым" />
            {!readOnly && durationNote !== (node.duration_note || "") && (
              <button onClick={() => save({ duration_note: durationNote || null })} className="text-[11px] text-violet-600 hover:text-violet-700 -mt-2">Сохранить</button>
            )}

            <CheckField label="Критичная операция" checked={isCritical}
              onChange={(v) => { setIsCritical(v); save({ is_critical: v }); }} />
          </>
        )}

        {node.node_type === "gateway" && (
          <>
            <TextArea label="Варианты выхода" value={gatewayOutcomes} onChange={setGatewayOutcomes} rows={2}
              placeholder="Например: Да → согласовать; Нет → отклонить" />
            {!readOnly && gatewayOutcomes !== (node.gateway_outcomes || "") && (
              <button onClick={() => save({ gateway_outcomes: gatewayOutcomes || null })} className="text-[11px] text-violet-600 hover:text-violet-700 -mt-2">Сохранить</button>
            )}
          </>
        )}

        {node.node_type === "document" && (
          <>
            <TextField label="Название документа" value={documentNote} onChange={setDocumentNote}
              hint="Привязка к реестру документов — в следующей итерации, пока укажите название текстом" />
            {!readOnly && documentNote !== (node.document_note || "") && (
              <button onClick={() => save({ document_note: documentNote || null })} className="text-[11px] text-violet-600 hover:text-violet-700 -mt-2">Сохранить</button>
            )}
          </>
        )}

        {node.node_type === "system" && (
          <>
            <SelectField label="Система из справочника" value={systemId}
              onChange={(v) => { setSystemId(v); save({ system_id: v ? Number(v) : null }); }}
              options={systems.map((s) => ({ value: String(s.id), label: s.name }))} placeholder="не выбрана" />
            <TextField label="Или название текстом" value={systemNote} onChange={setSystemNote} />
            {!readOnly && systemNote !== (node.system_note || "") && (
              <button onClick={() => save({ system_note: systemNote || null })} className="text-[11px] text-violet-600 hover:text-violet-700 -mt-2">Сохранить</button>
            )}
          </>
        )}

        {(node.node_type === "note" || node.node_type === "control") && (
          <>
            <TextArea label="Комментарий" value={note} onChange={setNote} rows={3} />
            {!readOnly && note !== (node.note || "") && (
              <button onClick={() => save({ note: note || null })} className="text-[11px] text-violet-600 hover:text-violet-700 -mt-2">Сохранить</button>
            )}
          </>
        )}

        <div className="pt-2 border-t border-slate-100">
          <CheckField label="Элемент подтверждён" checked={confirmed}
            onChange={(v) => { setConfirmed(v); save({ confirmation_status: v ? "confirmed" : "user_draft" }); }}
            hint="Отметьте, когда формулировка проверена и согласована" />
        </div>

        {!readOnly && (
          <button onClick={onDelete}
            className="w-full mt-2 px-3 py-2 rounded-lg border border-red-200 text-red-600 text-xs hover:bg-red-50 transition-colors flex items-center justify-center gap-1.5">
            <Icon name="Trash2" size={13} />
            Удалить элемент
          </button>
        )}
      </div>
    </div>
  );
}