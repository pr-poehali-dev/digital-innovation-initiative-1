import { useState } from "react";
import Icon from "@/components/ui/icon";
import { PersonRef } from "@/lib/execCabinetApi";
import { Issue, RISK_LEVEL_LABEL, Risk, controlApi } from "@/lib/execControlApi";
import { DateField, Modal, Section, SelectField, TextArea } from "./ExecForm";

function level(score: number): string {
  if (score >= 16) return "critical";
  if (score >= 10) return "high";
  if (score >= 5) return "medium";
  return "low";
}

const SCALE = [
  { v: "1", p: "Очень низкая", i: "Незначительное" },
  { v: "2", p: "Низкая", i: "Малое" },
  { v: "3", p: "Средняя", i: "Умеренное" },
  { v: "4", p: "Высокая", i: "Существенное" },
  { v: "5", p: "Очень высокая", i: "Критическое" },
];

export default function RiskForm({
  risk,
  initiativeId,
  initiatives,
  issues,
  persons,
  onClose,
  onSaved,
}: {
  risk?: Risk | null;
  initiativeId?: number;
  initiatives: { id: number; title: string }[];
  issues: Issue[];
  persons: PersonRef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const r = risk;
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    initiative_id: String(r?.initiative_id || initiativeId || ""),
    description: r?.description || "",
    cause: r?.cause || "",
    consequence: r?.consequence || "",
    probability: String(r?.probability ?? 3),
    impact: String(r?.impact ?? 3),
    trigger_indicator: r?.trigger_indicator || "",
    owner_person_id: r?.owner_person_id ? String(r.owner_person_id) : "",
    preventive_measures: r?.preventive_measures || "",
    response_plan: r?.response_plan || "",
    detected_at: r?.detected_at || today,
    last_assessed_at: r?.last_assessed_at || today,
    assessed_by_person_id: r?.assessed_by_person_id ? String(r.assessed_by_person_id) : "",
    next_review_at: r?.next_review_at || "",
    status: r?.status || "active",
    materialized_issue_id: r?.materialized_issue_id ? String(r.materialized_issue_id) : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const score = Number(f.probability) * Number(f.impact);
  const lvl = RISK_LEVEL_LABEL[level(score)];
  const isMaterialized = f.status === "materialized";

  const personOptions = persons.map((p) => ({
    value: String(p.id),
    label: p.position_title ? `${p.display_name} — ${p.position_title}` : p.display_name,
  }));

  const save = async () => {
    if (!f.initiative_id || !f.description.trim()) {
      setError("Укажите инициативу и описание риска");
      return;
    }
    if (isMaterialized && !f.materialized_issue_id) {
      setError("Риск «реализовался» требует связи с возникшей проблемой");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await controlApi.saveRisk({
        ...(r ? { id: r.id } : {}),
        ...f,
        initiative_id: Number(f.initiative_id),
        probability: Number(f.probability),
        impact: Number(f.impact),
        owner_person_id: f.owner_person_id ? Number(f.owner_person_id) : null,
        assessed_by_person_id: f.assessed_by_person_id ? Number(f.assessed_by_person_id) : null,
        materialized_issue_id: f.materialized_issue_id ? Number(f.materialized_issue_id) : null,
        detected_at: f.detected_at || null,
        last_assessed_at: f.last_assessed_at || null,
        next_review_at: f.next_review_at || null,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const issueOptions = issues
    .filter((i) => String(i.initiative_id) === f.initiative_id)
    .map((i) => ({ value: String(i.id), label: i.title }));

  return (
    <Modal
      title={r ? "Риск" : "Новый риск"}
      subtitle="Риск — событие, которое может возникнуть в будущем"
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={error}
      canSave={!!f.initiative_id && !!f.description.trim()}
      wide
    >
      <Section title="Описание риска">
        <SelectField
          label="Инициатива"
          value={f.initiative_id}
          onChange={set("initiative_id")}
          options={initiatives.map((i) => ({ value: String(i.id), label: i.title }))}
          required
        />
        <TextArea
          label="Описание риска"
          value={f.description}
          onChange={set("description")}
          rows={2}
          hint="Что может произойти"
        />
        <div className="grid sm:grid-cols-2 gap-4">
          <TextArea label="Причина" value={f.cause} onChange={set("cause")} rows={2} />
          <TextArea
            label="Возможное последствие"
            value={f.consequence}
            onChange={set("consequence")}
            rows={2}
          />
        </div>
        <TextArea
          label="Индикатор наступления"
          value={f.trigger_indicator}
          onChange={set("trigger_indicator")}
          rows={2}
          hint="По какому признаку поймём, что риск реализуется"
        />
      </Section>

      <Section title="Оценка">
        <div className="grid sm:grid-cols-2 gap-4">
          <SelectField
            label="Вероятность"
            value={f.probability}
            onChange={set("probability")}
            options={SCALE.map((s) => ({ value: s.v, label: `${s.v} — ${s.p}` }))}
          />
          <SelectField
            label="Влияние"
            value={f.impact}
            onChange={set("impact")}
            options={SCALE.map((s) => ({ value: s.v, label: `${s.v} — ${s.i}` }))}
          />
        </div>
        <div className={`p-3 rounded-lg border flex items-center gap-3 ${lvl.cls}`}>
          <Icon name="Gauge" size={18} />
          <div>
            <p className="text-xs opacity-80">Уровень риска рассчитан автоматически</p>
            <p className="text-sm font-medium">
              {f.probability} × {f.impact} = {score} — {lvl.title}
            </p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <DateField label="Дата выявления" value={f.detected_at} onChange={set("detected_at")} />
          <DateField
            label="Дата последней оценки"
            value={f.last_assessed_at}
            onChange={set("last_assessed_at")}
          />
          <SelectField
            label="Кто оценил"
            value={f.assessed_by_person_id}
            onChange={set("assessed_by_person_id")}
            options={personOptions}
          />
          <DateField
            label="Дата следующего пересмотра"
            value={f.next_review_at}
            onChange={set("next_review_at")}
          />
        </div>
      </Section>

      <Section title="Управление риском">
        <SelectField
          label="Владелец риска"
          value={f.owner_person_id}
          onChange={set("owner_person_id")}
          options={personOptions}
        />
        <TextArea
          label="Предупреждающие меры"
          value={f.preventive_measures}
          onChange={set("preventive_measures")}
          rows={2}
        />
        <TextArea
          label="План реагирования"
          value={f.response_plan}
          onChange={set("response_plan")}
          rows={2}
          hint="Что делаем, если риск наступит"
        />
        <SelectField
          label="Статус"
          value={f.status}
          onChange={set("status")}
          options={[
            { value: "active", label: "Активен" },
            { value: "mitigated", label: "Снижен" },
            { value: "accepted", label: "Принят" },
            { value: "materialized", label: "Реализовался" },
            { value: "closed", label: "Закрыт" },
            { value: "irrelevant", label: "Неактуален" },
          ]}
        />
        {isMaterialized && (
          <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/5 space-y-3">
            <p className="text-xs text-red-300 flex items-center gap-1.5">
              <Icon name="TriangleAlert" size={13} />
              Риск реализовался — обязательно укажите возникшую проблему
            </p>
            <SelectField
              label="Возникшая проблема"
              value={f.materialized_issue_id}
              onChange={set("materialized_issue_id")}
              options={issueOptions}
              placeholder={
                issueOptions.length ? "выберите проблему" : "сначала заведите проблему"
              }
              required
            />
          </div>
        )}
      </Section>
    </Modal>
  );
}
