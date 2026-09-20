import { useState } from "react";
import { Modal, TextField, TextArea, SelectField } from "@/components/exec/ExecForm";
import { processModelApi, ProcessMetric, ProcessIssue, Refs, PersonRef } from "@/lib/execProcessModelApi";

interface DiagramNodeOption {
  id: number;
  label: string;
}

export function MetricModal({
  processNodeId,
  metric,
  refs,
  people,
  diagramNodeOptions,
  onClose,
  onSaved,
}: {
  processNodeId: number;
  metric: ProcessMetric | null;
  refs: Refs | null;
  people: PersonRef[];
  diagramNodeOptions: DiagramNodeOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(metric?.title || "");
  const [metricKind, setMetricKind] = useState<string>(metric?.metric_kind || "result");
  const [diagramNodeId, setDiagramNodeId] = useState(metric?.diagram_node_id ? String(metric.diagram_node_id) : "");
  const [measuresNote, setMeasuresNote] = useState(metric?.measures_note || "");
  const [formula, setFormula] = useState(metric?.formula || "");
  const [unit, setUnit] = useState(metric?.unit || "");
  const [dataSource, setDataSource] = useState(metric?.data_source || "");
  const [periodicity, setPeriodicity] = useState(metric?.periodicity || "");
  const [planValue, setPlanValue] = useState(metric?.plan_value || "");
  const [factValue, setFactValue] = useState(metric?.fact_value || "");
  const [thresholdNote, setThresholdNote] = useState(metric?.threshold_note || "");
  const [ownerPersonId, setOwnerPersonId] = useState(metric?.owner_person_id ? String(metric.owner_person_id) : "");
  const [goalLinkNote, setGoalLinkNote] = useState(metric?.goal_link_note || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!title.trim()) {
      setError("Укажите название показателя");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await processModelApi.saveMetric({
        id: metric?.id,
        expected_updated_at: metric?.updated_at,
        process_node_id: processNodeId,
        diagram_node_id: diagramNodeId ? Number(diagramNodeId) : null,
        title: title.trim(),
        metric_kind: metricKind,
        measures_note: measuresNote.trim() || null,
        formula: formula.trim() || null,
        unit: unit.trim() || null,
        data_source: dataSource.trim() || null,
        periodicity: periodicity || null,
        plan_value: planValue.trim() || null,
        fact_value: factValue.trim() || null,
        threshold_note: thresholdNote.trim() || null,
        owner_person_id: ownerPersonId ? Number(ownerPersonId) : null,
        goal_link_note: goalLinkNote.trim() || null,
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
      title={metric ? "Редактировать показатель" : "Новый показатель процесса"}
      onClose={onClose}
      onSave={save}
      saving={saving}
      canSave={!!title.trim()}
      error={error}
      wide
    >
      <TextField label="Название показателя" value={title} onChange={setTitle} required />
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Тип" value={metricKind} onChange={setMetricKind}
          options={Object.entries(refs?.metric_kinds || {}).map(([v, l]) => ({ value: v, label: l }))} />
        <SelectField label="Операция (если не про весь процесс)" value={diagramNodeId} onChange={setDiagramNodeId}
          options={diagramNodeOptions.map((n) => ({ value: String(n.id), label: n.label }))} placeholder="весь процесс" />
      </div>
      <TextArea label="Описание" value={measuresNote} onChange={setMeasuresNote} rows={2} />
      <TextField label="Формула" value={formula} onChange={setFormula} placeholder="Если данных нет — оставьте пустым" />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Единица измерения" value={unit} onChange={setUnit} placeholder="дни, %, шт." />
        <SelectField label="Периодичность" value={periodicity} onChange={setPeriodicity}
          options={Object.entries(refs?.metric_periodicities || {}).map(([v, l]) => ({ value: v, label: l }))} />
      </div>
      <TextField label="Источник данных" value={dataSource} onChange={setDataSource} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Плановое значение" value={planValue} onChange={setPlanValue} />
        <TextField label="Фактическое значение" value={factValue} onChange={setFactValue} />
      </div>
      <TextField label="Допустимый порог" value={thresholdNote} onChange={setThresholdNote} />
      <SelectField label="Ответственная роль/сотрудник" value={ownerPersonId} onChange={setOwnerPersonId}
        options={people.map((p) => ({ value: String(p.id), label: p.display_name }))} placeholder="не назначен" />
      <TextArea label="Связь с целью процесса" value={goalLinkNote} onChange={setGoalLinkNote} rows={2}
        hint="Если пока непонятно — оставьте пустым, помощник отметит это как вопрос на уточнение" />
    </Modal>
  );
}

export function IssueModal({
  processNodeId,
  issue,
  refs,
  diagramNodeOptions,
  onClose,
  onSaved,
}: {
  processNodeId: number;
  issue: ProcessIssue | null;
  refs: Refs | null;
  diagramNodeOptions: DiagramNodeOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(issue?.title || "");
  const [description, setDescription] = useState(issue?.description || "");
  const [diagramNodeId, setDiagramNodeId] = useState(issue?.diagram_node_id ? String(issue.diagram_node_id) : "");
  const [problemType, setProblemType] = useState(issue?.problem_type || "");
  const [cause, setCause] = useState(issue?.cause || "");
  const [impactNote, setImpactNote] = useState(issue?.impact_note || "");
  const [sourceNote, setSourceNote] = useState(issue?.source_note || "");
  const [improvementDirection, setImprovementDirection] = useState(issue?.improvement_direction || "");
  const [status, setStatus] = useState<string>(issue?.status || "open");
  const [severityRank, setSeverityRank] = useState(issue?.severity_rank ? String(issue.severity_rank) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const SEVERITY_OPTIONS = [
    { value: "1", label: "Низкая" },
    { value: "2", label: "Средняя" },
    { value: "3", label: "Высокая" },
    { value: "4", label: "Критическая" },
  ];

  const save = async () => {
    if (!title.trim()) {
      setError("Укажите название проблемы");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await processModelApi.saveIssue({
        id: issue?.id,
        expected_updated_at: issue?.updated_at,
        process_node_id: processNodeId,
        diagram_node_id: diagramNodeId ? Number(diagramNodeId) : null,
        title: title.trim(),
        description: description.trim() || null,
        problem_type: problemType || null,
        cause: cause.trim() || null,
        impact_note: impactNote.trim() || null,
        source_note: sourceNote.trim() || null,
        improvement_direction: improvementDirection.trim() || null,
        status,
        severity_rank: severityRank ? Number(severityRank) : null,
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
      title={issue ? "Редактировать проблему" : "Новая проблема AS-IS"}
      onClose={onClose}
      onSave={save}
      saving={saving}
      canSave={!!title.trim()}
      error={error}
      wide
    >
      <TextField label="Название проблемы" value={title} onChange={setTitle} required />
      <TextArea label="Описание" value={description} onChange={setDescription} rows={2} />
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Тип проблемы" value={problemType} onChange={setProblemType}
          options={Object.entries(refs?.problem_types || {}).map(([v, l]) => ({ value: v, label: l }))} />
        <SelectField label="Связанная операция" value={diagramNodeId} onChange={setDiagramNodeId}
          options={diagramNodeOptions.map((n) => ({ value: String(n.id), label: n.label }))} placeholder="весь процесс" />
      </div>
      <TextArea label="Причина" value={cause} onChange={setCause} rows={2} />
      <TextArea label="Последствие" value={impactNote} onChange={setImpactNote} rows={2} />
      <TextField label="Источник" value={sourceNote} onChange={setSourceNote} />
      <TextArea label="Предлагаемое направление улучшения" value={improvementDirection} onChange={setImprovementDirection} rows={2} />
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Статус" value={status} onChange={setStatus}
          options={Object.entries(refs?.issue_statuses || {}).map(([v, l]) => ({ value: v, label: l }))} />
        <SelectField label="Серьёзность (качественно)" value={severityRank} onChange={setSeverityRank}
          options={SEVERITY_OPTIONS} placeholder="не оценена" />
      </div>
    </Modal>
  );
}