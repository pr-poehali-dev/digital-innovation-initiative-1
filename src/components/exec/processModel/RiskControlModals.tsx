import { useState } from "react";
import { Modal, TextField, TextArea, SelectField, CheckField } from "@/components/exec/ExecForm";
import {
  processModelApi,
  ProcessRisk,
  ProcessControl,
  Refs,
  PersonRef,
  OrgUnitRef,
  InfoSystem,
} from "@/lib/execProcessModelApi";

interface DiagramNodeOption {
  id: number;
  label: string;
}

/** Форма риска процесса. Вероятность/влияние сознательно не запрашиваются —
 * только качественный уровень (low/medium/high/critical), как того требует ТЗ. */
export function RiskModal({
  processNodeId,
  risk,
  refs,
  people,
  diagramNodeOptions,
  onClose,
  onSaved,
}: {
  processNodeId: number;
  risk: ProcessRisk | null;
  refs: Refs | null;
  people: PersonRef[];
  diagramNodeOptions: DiagramNodeOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(risk?.title || "");
  const [eventDescription, setEventDescription] = useState(risk?.event_description || "");
  const [cause, setCause] = useState(risk?.cause || "");
  const [consequence, setConsequence] = useState(risk?.consequence || "");
  const [qualitativeLevel, setQualitativeLevel] = useState(risk?.qualitative_level || "");
  const [diagramNodeId, setDiagramNodeId] = useState(risk?.diagram_node_id ? String(risk.diagram_node_id) : "");
  const [ownerPersonId, setOwnerPersonId] = useState(risk?.owner_person_id ? String(risk.owner_person_id) : "");
  const [ownerRole, setOwnerRole] = useState(risk?.owner_role || "");
  const [sourceNote, setSourceNote] = useState(risk?.source_note || "");
  const [comment, setComment] = useState(risk?.comment || "");
  const [linkedInitiativeRiskId, setLinkedInitiativeRiskId] = useState(
    risk?.linked_initiative_risk_id ? String(risk.linked_initiative_risk_id) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!title.trim()) {
      setError("Укажите название риска");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await processModelApi.saveRisk({
        id: risk?.id,
        expected_updated_at: risk?.updated_at,
        process_node_id: processNodeId,
        diagram_node_id: diagramNodeId ? Number(diagramNodeId) : null,
        title: title.trim(),
        event_description: eventDescription.trim() || null,
        cause: cause.trim() || null,
        consequence: consequence.trim() || null,
        qualitative_level: qualitativeLevel || null,
        owner_person_id: ownerPersonId ? Number(ownerPersonId) : null,
        owner_role: ownerRole.trim() || null,
        source_note: sourceNote.trim() || null,
        comment: comment.trim() || null,
        linked_initiative_risk_id: linkedInitiativeRiskId ? Number(linkedInitiativeRiskId) : null,
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
      title={risk ? "Редактировать риск" : "Новый риск процесса"}
      subtitle="Вероятность и влияние не указываются числом — только качественный уровень."
      onClose={onClose}
      onSave={save}
      saving={saving}
      canSave={!!title.trim()}
      error={error}
      wide
    >
      <TextField label="Название риска" value={title} onChange={setTitle} required
        placeholder="Например: Регуляторное требование не выявлено вовремя" />
      <TextArea label="Описание события" value={eventDescription} onChange={setEventDescription} rows={2}
        hint="Что именно может произойти" />
      <div className="grid grid-cols-2 gap-3">
        <TextArea label="Причины" value={cause} onChange={setCause} rows={2} />
        <TextArea label="Последствия" value={consequence} onChange={setConsequence} rows={2} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Качественный уровень" value={qualitativeLevel} onChange={setQualitativeLevel}
          options={Object.entries(refs?.qualitative_levels || {}).map(([v, l]) => ({ value: v, label: l }))}
          placeholder="не оценён" hint="Если оценки нет — оставьте пустым" />
        <SelectField label="Операция на схеме AS-IS" value={diagramNodeId} onChange={setDiagramNodeId}
          options={diagramNodeOptions.map((n) => ({ value: String(n.id), label: n.label }))}
          placeholder="относится ко всему процессу" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Владелец риска" value={ownerPersonId} onChange={setOwnerPersonId}
          options={people.map((p) => ({ value: String(p.id), label: p.display_name }))} placeholder="не назначен" />
        <TextField label="Ответственная роль (текстом)" value={ownerRole} onChange={setOwnerRole}
          placeholder="Если конкретный владелец не назначен" />
      </div>
      <TextField label="Источник сведений" value={sourceNote} onChange={setSourceNote}
        placeholder="Документ, интервью, инцидент и т.п." />
      <TextField label="Ссылка на риск инициативы (ID, необязательно)" value={linkedInitiativeRiskId}
        onChange={setLinkedInitiativeRiskId}
        hint="Не копия — просто необязательная ссылка на существующую запись в реестре рисков инициатив" />
      <TextArea label="Комментарий" value={comment} onChange={setComment} rows={2} />
    </Modal>
  );
}

export function ControlModal({
  riskId,
  control,
  refs,
  people,
  orgUnits,
  systems,
  diagramNodeOptions,
  onClose,
  onSaved,
}: {
  riskId: number;
  control: ProcessControl | null;
  refs: Refs | null;
  people: PersonRef[];
  orgUnits: OrgUnitRef[];
  systems: InfoSystem[];
  diagramNodeOptions: DiagramNodeOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(control?.title || "");
  const [goalNote, setGoalNote] = useState(control?.goal_note || "");
  const [controlType, setControlType] = useState(control?.control_type || "");
  const [method, setMethod] = useState(control?.method || "");
  const [diagramNodeId, setDiagramNodeId] = useState(control?.diagram_node_id ? String(control.diagram_node_id) : "");
  const [responsibleRole, setResponsibleRole] = useState(control?.responsible_role || "");
  const [responsiblePersonId, setResponsiblePersonId] = useState(control?.responsible_person_id ? String(control.responsible_person_id) : "");
  const [responsibleOrgUnitId, setResponsibleOrgUnitId] = useState(control?.responsible_org_unit_id ? String(control.responsible_org_unit_id) : "");
  const [periodicity, setPeriodicity] = useState(control?.periodicity || "");
  const [evidenceNote, setEvidenceNote] = useState(control?.evidence_note || "");
  const [normativeDocumentNote, setNormativeDocumentNote] = useState(control?.normative_document_note || "");
  const [infoSystemId, setInfoSystemId] = useState(control?.info_system_id ? String(control.info_system_id) : "");
  const [comment, setComment] = useState(control?.comment || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!title.trim()) {
      setError("Укажите название контроля (или закройте окно и отметьте «Контроль не определён» на карточке риска)");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await processModelApi.saveControl({
        id: control?.id,
        expected_updated_at: control?.updated_at,
        risk_id: riskId,
        title: title.trim(),
        goal_note: goalNote.trim() || null,
        control_type: controlType || null,
        method: method || null,
        diagram_node_id: diagramNodeId ? Number(diagramNodeId) : null,
        responsible_role: responsibleRole.trim() || null,
        responsible_person_id: responsiblePersonId ? Number(responsiblePersonId) : null,
        responsible_org_unit_id: responsibleOrgUnitId ? Number(responsibleOrgUnitId) : null,
        periodicity: periodicity || null,
        evidence_note: evidenceNote.trim() || null,
        normative_document_note: normativeDocumentNote.trim() || null,
        info_system_id: infoSystemId ? Number(infoSystemId) : null,
        comment: comment.trim() || null,
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
      title={control ? "Редактировать контроль" : "Новый контроль"}
      subtitle="Операция → риск → контроль → исполнитель → доказательство"
      onClose={onClose}
      onSave={save}
      saving={saving}
      canSave={!!title.trim()}
      error={error}
      wide
    >
      <TextField label="Название контроля" value={title} onChange={setTitle} required
        placeholder="Например: Ежемесячная сверка реестра требований" />
      <TextArea label="Цель контроля" value={goalNote} onChange={setGoalNote} rows={2} />
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Тип" value={controlType} onChange={setControlType}
          options={Object.entries(refs?.control_types || {}).map(([v, l]) => ({ value: v, label: l }))} />
        <SelectField label="Способ выполнения" value={method} onChange={setMethod}
          options={Object.entries(refs?.control_methods || {}).map(([v, l]) => ({ value: v, label: l }))} />
      </div>
      <SelectField label="Операция на схеме" value={diagramNodeId} onChange={setDiagramNodeId}
        options={diagramNodeOptions.map((n) => ({ value: String(n.id), label: n.label }))}
        placeholder="как у риска" />
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Исполнитель (сотрудник)" value={responsiblePersonId} onChange={setResponsiblePersonId}
          options={people.map((p) => ({ value: String(p.id), label: p.display_name }))} placeholder="не назначен" />
        <TextField label="Исполнитель (роль текстом)" value={responsibleRole} onChange={setResponsibleRole} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Подразделение" value={responsibleOrgUnitId} onChange={setResponsibleOrgUnitId}
          options={orgUnits.map((u) => ({ value: String(u.id), label: u.name }))} placeholder="не указано" />
        <SelectField label="Периодичность" value={periodicity} onChange={setPeriodicity}
          options={Object.entries(refs?.control_periodicities || {}).map(([v, l]) => ({ value: v, label: l }))} />
      </div>
      <TextArea label="Доказательство выполнения" value={evidenceNote} onChange={setEvidenceNote} rows={2}
        hint="Что подтверждает фактическое выполнение контроля (лог, подпись, отчёт)" />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Нормативный документ" value={normativeDocumentNote} onChange={setNormativeDocumentNote} />
        <SelectField label="Информационная система" value={infoSystemId} onChange={setInfoSystemId}
          options={systems.map((s) => ({ value: String(s.id), label: s.name }))} placeholder="не указана" />
      </div>
      <TextArea label="Комментарий" value={comment} onChange={setComment} rows={2} />
    </Modal>
  );
}

export function ConfirmCheckField({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return <CheckField label={label} checked={checked} onChange={onChange} hint={hint} />;
}