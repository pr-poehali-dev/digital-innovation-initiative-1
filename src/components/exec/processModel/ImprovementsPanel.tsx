import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { Empty, Loading } from "@/components/exec/ExecUI";
import { Modal, TextArea, SelectField } from "@/components/exec/ExecForm";
import {
  processModelApi,
  ProcessImprovement,
  ProcessIssue,
  InitiativeLite,
  Refs,
  PersonRef,
} from "@/lib/execProcessModelApi";

function ImprovementModal({
  toBeDiagramId,
  processNodeId,
  improvement,
  refs,
  people,
  onClose,
  onSaved,
}: {
  toBeDiagramId: number;
  processNodeId: number;
  improvement: ProcessImprovement | null;
  refs: Refs | null;
  people: PersonRef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [description, setDescription] = useState(improvement?.description || "");
  const [expectedEffectNote, setExpectedEffectNote] = useState(improvement?.expected_effect_note || "");
  const [effectType, setEffectType] = useState(improvement?.effect_type || "");
  const [ownerPersonId, setOwnerPersonId] = useState(improvement?.owner_person_id ? String(improvement.owner_person_id) : "");
  const [issues, setIssues] = useState<ProcessIssue[]>([]);
  const [asIsIssueId, setAsIsIssueId] = useState(improvement?.as_is_issue_id ? String(improvement.as_is_issue_id) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    processModelApi.processIssues(processNodeId).then((r) => setIssues(r.items));
  }, [processNodeId]);

  const save = async () => {
    if (!description.trim()) {
      setError("Опишите изменение");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await processModelApi.saveImprovement({
        id: improvement?.id,
        expected_updated_at: improvement?.updated_at,
        to_be_diagram_id: toBeDiagramId,
        as_is_issue_id: asIsIssueId ? Number(asIsIssueId) : null,
        description: description.trim(),
        expected_effect_note: expectedEffectNote.trim() || null,
        effect_type: effectType || null,
        owner_person_id: ownerPersonId ? Number(ownerPersonId) : null,
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
    <Modal title={improvement ? "Редактировать изменение" : "Новое изменение TO-BE"} onClose={onClose} onSave={save}
      saving={saving} canSave={!!description.trim()} error={error} wide>
      <SelectField label="Связанная проблема AS-IS" value={asIsIssueId} onChange={setAsIsIssueId}
        options={issues.map((i) => ({ value: String(i.id), label: i.title }))} placeholder="без привязки" />
      <TextArea label="Описание изменения" value={description} onChange={setDescription} rows={3} />
      <TextArea label="Ожидаемый эффект" value={expectedEffectNote} onChange={setExpectedEffectNote} rows={2}
        hint="Экономический эффект не рассчитывается автоматически — опишите эффект текстом" />
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Тип эффекта" value={effectType} onChange={setEffectType}
          options={Object.entries(refs?.effect_types || {}).map(([v, l]) => ({ value: v, label: l }))} />
        <SelectField label="Владелец изменения" value={ownerPersonId} onChange={setOwnerPersonId}
          options={people.map((p) => ({ value: String(p.id), label: p.display_name }))} placeholder="не назначен" />
      </div>
    </Modal>
  );
}

export default function ImprovementsPanel({
  toBeDiagramId,
  processNodeId,
  refs,
  people,
  canEdit,
}: {
  toBeDiagramId: number;
  processNodeId: number;
  refs: Refs | null;
  people: PersonRef[];
  canEdit: boolean;
}) {
  const [items, setItems] = useState<ProcessImprovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ improvement: ProcessImprovement | null } | null>(null);
  const [suggested, setSuggested] = useState<InitiativeLite[]>([]);
  const [linkingId, setLinkingId] = useState<number | null>(null);
  const [allInitiatives, setAllInitiatives] = useState<InitiativeLite[]>([]);
  const [pickInitiative, setPickInitiative] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([processModelApi.improvements(toBeDiagramId), processModelApi.suggestInitiativeLinks(toBeDiagramId)])
      .then(([i, s]) => { setItems(i.items); setSuggested(s.items); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [toBeDiagramId]);

  const deleteImprovement = async (id: number) => {
    if (!confirm("Удалить изменение?")) return;
    await processModelApi.deleteImprovement(id);
    load();
  };

  const openLinking = (id: number) => {
    setLinkingId(id);
    setPickInitiative("");
    if (allInitiatives.length === 0) processModelApi.initiativesLite().then((r) => setAllInitiatives(r.items));
  };

  const confirmLink = async (improvementId: number, initiativeId: number) => {
    await processModelApi.saveImprovement({ id: improvementId, initiative_id: initiativeId });
    setLinkingId(null);
    load();
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Изменения TO-BE и их ожидаемый эффект. Связь с инициативой подтверждается вручную.</p>
        {canEdit && (
          <button onClick={() => setModal({ improvement: null })}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 flex items-center gap-1.5 flex-shrink-0">
            <Icon name="Plus" size={12} /> Добавить изменение
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <Empty text="Изменения пока не добавлены" icon="Sparkles" />
      ) : (
        <div className="space-y-2">
          {items.map((im) => (
            <div key={im.id} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {im.issue_title && (
                    <p className="text-[11px] text-slate-400 mb-0.5">из проблемы: {im.issue_title}</p>
                  )}
                  <p className="text-sm font-medium text-slate-900">{im.description}</p>
                  {im.expected_effect_note && <p className="text-xs text-slate-500 mt-1">{im.expected_effect_note}</p>}
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {im.effect_type && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-violet-200 bg-violet-50 text-violet-700">{refs?.effect_types[im.effect_type]}</span>
                    )}
                    {im.owner_name && <span className="text-[10px] text-slate-400">владелец: {im.owner_name}</span>}
                  </div>
                  {im.initiative_id ? (
                    <p className="text-[11px] text-green-700 mt-1.5 flex items-center gap-1">
                      <Icon name="Link2" size={11} /> связано с инициативой {im.initiative_code ? `${im.initiative_code} — ` : ""}{im.initiative_title}
                    </p>
                  ) : canEdit && (
                    <button onClick={() => openLinking(im.id)} className="text-[11px] text-violet-600 hover:text-violet-700 mt-1.5 flex items-center gap-1">
                      <Icon name="Link" size={11} /> Связать с инициативой портфеля
                    </button>
                  )}
                  {linkingId === im.id && (
                    <div className="mt-2 p-2 rounded-lg border border-violet-200 bg-violet-50 space-y-2">
                      {suggested.length > 0 && (
                        <div>
                          <p className="text-[10px] text-violet-600 uppercase tracking-wide mb-1">Возможный вариант (на основе связей проблем этого процесса)</p>
                          {suggested.map((s) => (
                            <button key={s.id} onClick={() => confirmLink(im.id, s.id)}
                              className="text-xs px-2 py-1 rounded-md border border-violet-300 bg-white text-violet-700 hover:bg-violet-100 mr-1.5 mb-1">
                              {s.external_code ? `${s.external_code} — ` : ""}{s.title}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <select value={pickInitiative} onChange={(e) => setPickInitiative(e.target.value)}
                          className="flex-1 text-xs px-2 py-1 rounded-md border border-slate-300">
                          <option value="">выбрать инициативу…</option>
                          {allInitiatives.map((i) => (
                            <option key={i.id} value={i.id}>{i.external_code ? `${i.external_code} — ` : ""}{i.title}</option>
                          ))}
                        </select>
                        <button disabled={!pickInitiative} onClick={() => confirmLink(im.id, Number(pickInitiative))}
                          className="text-xs px-2 py-1 rounded-md bg-violet-600 text-white disabled:opacity-40">Подтвердить</button>
                        <button onClick={() => setLinkingId(null)} className="text-xs text-slate-500 px-1">Отмена</button>
                      </div>
                    </div>
                  )}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => setModal({ improvement: im })} className="text-slate-400 hover:text-violet-600 p-1"><Icon name="Pencil" size={13} /></button>
                    <button onClick={() => deleteImprovement(im.id)} className="text-slate-300 hover:text-red-600 p-1"><Icon name="Trash2" size={13} /></button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <ImprovementModal toBeDiagramId={toBeDiagramId} processNodeId={processNodeId} improvement={modal.improvement}
          refs={refs} people={people} onClose={() => setModal(null)} onSaved={load} />
      )}
    </div>
  );
}