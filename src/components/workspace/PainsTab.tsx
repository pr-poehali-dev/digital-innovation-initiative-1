import { useState } from "react";
import type { MutableRefObject } from "react";
import { workspaceApi } from "@/lib/api";
import Icon from "@/components/ui/icon";

type PainPoint = {
  id: number;
  pain_type: string;
  description: string;
  impact_level: string;
  frequency: string;
  root_cause: string;
  linked_process_id: number | null;
  linked_process_title?: string | null;
  linked_process_department?: string | null;
  linked_solution_id: number | null;
  linked_solution_title?: string | null;
  linked_solution_type?: string | null;
};

type ProcessOption = { id: number; title: string; department?: string };
type SolutionOption = { id: number; title: string; solution_type?: string };

const EMPTY_PAIN = { description: "", pain_type: "manual_work", impact_level: "medium", frequency: "", root_cause: "", linked_process_id: "", linked_solution_id: "" };

const IMPACT_COLOR: Record<string, string> = {
  critical: "bg-red-50 border-red-200",
  high: "bg-orange-50 border-orange-200",
  medium: "bg-amber-50 border-amber-200",
  low: "bg-slate-50 border-slate-200",
};
const IMPACT_BADGE: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};
const IMPACT_LABEL: Record<string, string> = { critical: "Критично", high: "Высокое", medium: "Среднее", low: "Низкое" };
const PAIN_LABELS: Record<string, string> = { manual_work: "Ручной труд", duplication: "Дублирование", delay: "Задержки", lack_of_visibility: "Нет прозрачности", control_gap: "Контрольный разрыв", data_quality: "Данные", error_rate: "Ошибки", compliance_burden: "Регуляторная нагрузка" };
const SOLUTION_TYPE_LABELS: Record<string, string> = { erp: "ERP / учётная система", bi: "BI / аналитика", rpa: "RPA / автоматизация", ocr: "OCR / распознавание", workflow: "Workflow / согласования", crm: "CRM", custom: "Самописное решение", saas: "SaaS-сервис", other: "Другое" };

interface Props {
  projectId: number;
  painPoints: PainPoint[];
  processes?: ProcessOption[];
  solutions?: SolutionOption[];
  loading?: boolean;
  onReload: () => void;
  onCreateHypothesis?: (pain: PainPoint) => void;
  // Stage 13/14: preset-очередь "Проблемы без гипотезы" / "Проблемы без решения" — та же схема, что у инициатив/гипотез.
  preset?: "without_hypothesis" | "without_solution" | null;
  presetLabel?: string;
  visiblePainPoints?: PainPoint[];
  queueFeedback?: string | null;
  onClearPreset?: () => void;
  highlightId?: number | null;
  cardRefs?: MutableRefObject<Record<number, HTMLDivElement | null>>;
  // Stage 14: если решений в проекте ещё нет ни одного, кнопка на карточке ведёт на вкладку
  // "Решения и системы" для создания нового (fallback) — иначе используется существующий startEditLinks.
  onGoToSolutions?: () => void;
  // Stage 14: вызывается после успешного сохранения привязки решения — родитель решает,
  // нужно ли вернуть внимание в очередь (success-feedback + фокус на следующей карточке).
  onAfterLinkSolution?: (painId: number) => void;
}

export default function PainsTab({
  projectId, painPoints, processes = [], solutions = [], loading = false, onReload, onCreateHypothesis,
  preset = null, presetLabel, visiblePainPoints, queueFeedback, onClearPreset, highlightId, cardRefs,
  onGoToSolutions, onAfterLinkSolution,
}: Props) {
  const isQueuePreset = preset === "without_hypothesis" || preset === "without_solution";
  const displayList = isQueuePreset && visiblePainPoints ? visiblePainPoints : painPoints;
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(EMPTY_PAIN);
  const [saving, setSaving] = useState(false);
  const [aiExtractText, setAiExtractText] = useState("");
  const [aiExtractLoading, setAiExtractLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; description: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingLinksId, setEditingLinksId] = useState<number | null>(null);
  const [linksDraft, setLinksDraft] = useState({ linked_process_id: "", linked_solution_id: "" });
  const [savingLinks, setSavingLinks] = useState(false);

  const handleCreate = async () => {
    if (!draft.description.trim()) return;
    setSaving(true);
    try {
      await workspaceApi.createPainPoint({
        project_id: projectId,
        description: draft.description,
        pain_type: draft.pain_type,
        impact_level: draft.impact_level,
        frequency: draft.frequency,
        root_cause: draft.root_cause,
        linked_process_id: draft.linked_process_id ? Number(draft.linked_process_id) : null,
        linked_solution_id: draft.linked_solution_id ? Number(draft.linked_solution_id) : null,
      });
      setDraft(EMPTY_PAIN);
      setShowForm(false);
      onReload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Не удалось сохранить запись");
    } finally { setSaving(false); }
  };

  const handleExtract = async () => {
    if (!aiExtractText.trim()) return;
    setAiExtractLoading(true);
    try {
      const res = await workspaceApi.aiExtractPains(projectId, aiExtractText) as { pains: PainPoint[] };
      for (const p of res.pains || []) {
        await workspaceApi.createPainPoint({ project_id: projectId, ...p });
      }
      setAiExtractText("");
      onReload();
    } finally { setAiExtractLoading(false); }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await workspaceApi.deletePainPoint(confirmDelete.id, projectId);
      setConfirmDelete(null);
      onReload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Не удалось удалить запись");
    } finally { setDeleting(false); }
  };

  const startEditLinks = (p: PainPoint) => {
    setEditingLinksId(p.id);
    setLinksDraft({
      linked_process_id: p.linked_process_id ? String(p.linked_process_id) : "",
      linked_solution_id: p.linked_solution_id ? String(p.linked_solution_id) : "",
    });
  };

  const handleSaveLinks = async () => {
    if (!editingLinksId) return;
    const savedId = editingLinksId;
    const wasQueueAction = preset === "without_solution" && !!linksDraft.linked_solution_id;
    setSavingLinks(true);
    try {
      await workspaceApi.updatePainPoint({
        id: editingLinksId,
        project_id: projectId,
        linked_process_id: linksDraft.linked_process_id ? Number(linksDraft.linked_process_id) : null,
        linked_solution_id: linksDraft.linked_solution_id ? Number(linksDraft.linked_solution_id) : null,
      });
      setEditingLinksId(null);
      onReload();
      // Stage 14: если решение привязано прямо из очереди without_solution — возвращаем внимание в очередь.
      if (wasQueueAction) onAfterLinkSolution?.(savedId);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Не удалось сохранить привязку");
    } finally { setSavingLinks(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs sm:text-sm text-slate-500 leading-snug">Фиксируйте ручной труд, дублирование, задержки, разрывы</p>
        <button
          onClick={() => setShowForm(true)}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none flex-shrink-0"
        >
          <Icon name="Plus" size={13} /> Добавить
        </button>
      </div>

      {/* Активный preset-чип + индикатор очереди (Stage 13/14) */}
      {isQueuePreset && (
        <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 w-fit">
          <Icon name="Filter" size={12} className="text-slate-500" />
          <span className="text-xs font-medium text-slate-700">{presetLabel || (preset === "without_solution" ? "Проблемы без решения" : "Проблемы без гипотезы")}</span>
          {displayList.length > 0 && (
            <span className="text-[10px] font-bold bg-white text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded-full">
              Осталось: {displayList.length}
            </span>
          )}
          {onClearPreset && (
            <button onClick={onClearPreset} className="text-slate-400 hover:text-slate-700" aria-label="Сбросить фильтр">
              <Icon name="X" size={12} />
            </button>
          )}
        </div>
      )}

      {/* Stage 13/14: короткий success-feedback после действия в очереди */}
      {isQueuePreset && queueFeedback && (
        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5 w-fit">
          <Icon name="CheckCircle2" size={12} /> {queueFeedback}
        </div>
      )}

      {loading && (
        <div className="space-y-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-3 h-14 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && (
        <div className="bg-violet-50 border border-violet-100 rounded-2xl p-3 sm:p-4">
          <p className="text-xs font-semibold text-violet-800 mb-2">🧠 Извлечь боли с помощью AI</p>
          <textarea
            placeholder="Опишите ситуацию или процесс — AI выделит боли..."
            rows={3}
            value={aiExtractText}
            onChange={e => setAiExtractText(e.target.value)}
            className="w-full border border-violet-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none mb-2"
          />
          <button
            disabled={!aiExtractText.trim() || aiExtractLoading}
            onClick={handleExtract}
            className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 w-full sm:w-auto justify-center"
          >
            {aiExtractLoading
              ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Анализирую...</>
              : <><Icon name="Sparkles" size={12} /> Извлечь боли</>}
          </button>
        </div>
      )}

      {!loading && showForm && (
        <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 space-y-2.5">
          <p className="text-sm font-semibold text-slate-800">Новая боль / узкое место</p>
          <textarea
            placeholder="Опишите конкретную боль *"
            rows={2}
            value={draft.description}
            onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none"
          />
          <div>
            <p className="text-xs text-slate-500 mb-1">Тип боли</p>
            <select value={draft.pain_type} onChange={e => setDraft(d => ({ ...d, pain_type: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none bg-white">
              <option value="manual_work">Ручной труд</option>
              <option value="duplication">Дублирование</option>
              <option value="delay">Задержки</option>
              <option value="lack_of_visibility">Нет прозрачности</option>
              <option value="control_gap">Контрольный разрыв</option>
              <option value="data_quality">Качество данных</option>
              <option value="error_rate">Ошибки</option>
              <option value="compliance_burden">Регуляторная нагрузка</option>
            </select>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Влияние</p>
            <select value={draft.impact_level} onChange={e => setDraft(d => ({ ...d, impact_level: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none bg-white">
              <option value="critical">Критическое</option>
              <option value="high">Высокое</option>
              <option value="medium">Среднее</option>
              <option value="low">Низкое</option>
            </select>
          </div>
          <input placeholder="Частота (ежедневно, еженедельно...)" value={draft.frequency} onChange={e => setDraft(d => ({ ...d, frequency: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none" />
          <input placeholder="Корневая причина (опционально)" value={draft.root_cause} onChange={e => setDraft(d => ({ ...d, root_cause: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none" />

          {(processes.length > 0 || solutions.length > 0) && (
            <div className="border-t border-slate-100 pt-2.5 space-y-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Привязать к (опционально)</p>
              {processes.length > 0 && (
                <select value={draft.linked_process_id} onChange={e => setDraft(d => ({ ...d, linked_process_id: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none bg-white">
                  <option value="">— Функция / процесс не выбраны —</option>
                  {processes.map(pr => <option key={pr.id} value={pr.id}>{pr.title}{pr.department ? ` (${pr.department})` : ""}</option>)}
                </select>
              )}
              {solutions.length > 0 && (
                <select value={draft.linked_solution_id} onChange={e => setDraft(d => ({ ...d, linked_solution_id: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none bg-white">
                  <option value="">— Решение / система не выбраны —</option>
                  {solutions.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={() => { setShowForm(false); setDraft(EMPTY_PAIN); }} className="flex-1 border border-slate-200 rounded-lg py-2.5 text-sm hover:bg-slate-50">Отмена</button>
            <button disabled={!draft.description.trim() || saving} onClick={handleCreate} className="flex-1 bg-slate-800 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50">
              {saving ? "Сохраняю..." : "Добавить"}
            </button>
          </div>
        </div>
      )}

      {!loading && painPoints.length === 0 && !showForm && (
        <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center">
          <Icon name="Flame" size={28} className="text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">Болей пока нет</p>
          <p className="text-xs text-slate-400 mt-1">Добавьте вручную или используйте AI-экстракцию выше</p>
        </div>
      )}

      {/* Пустое состояние — preset ничего не нашёл (Stage 13/14: completion-state для очереди) */}
      {!loading && painPoints.length > 0 && isQueuePreset && displayList.length === 0 && (
        <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center">
          <Icon name="CheckCircle2" size={28} className="text-emerald-500 mx-auto mb-2" />
          <p className="text-slate-700 text-sm font-semibold">
            {preset === "without_solution" ? "Все проблемы привязаны к решению" : "Все проблемы получили гипотезы"}
          </p>
          {onClearPreset && (
            <button onClick={onClearPreset} className="mt-3 text-xs text-slate-600 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50">
              Показать все проблемы
            </button>
          )}
        </div>
      )}

      {!loading && displayList.length > 0 && (
        <div className="space-y-2">
          {displayList.map(p => (
            <div
              key={p.id}
              ref={cardRefs ? (el => { cardRefs.current[p.id] = el; }) : undefined}
              className={`border rounded-xl p-3 group transition-colors duration-700 ${highlightId === p.id ? "border-blue-400 bg-blue-50" : (IMPACT_COLOR[p.impact_level] || "bg-slate-50 border-slate-200")}`}
            >
              <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${IMPACT_BADGE[p.impact_level] || "bg-slate-100 text-slate-600"}`}>
                  {IMPACT_LABEL[p.impact_level] || p.impact_level}
                </span>
                <span className="text-[10px] bg-white/70 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
                  {PAIN_LABELS[p.pain_type] || p.pain_type}
                </span>
                {p.frequency && <span className="text-[10px] text-slate-500">📅 {p.frequency}</span>}
                {/* Stage 13/14: объяснение, почему проблема попала в отфильтрованный список */}
                {preset === "without_hypothesis" && (
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Icon name="LightbulbOff" size={10} /> Нет гипотез
                  </span>
                )}
                {preset === "without_solution" && (
                  <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Icon name="ServerOff" size={10} /> Нет решения
                  </span>
                )}
                <button
                  onClick={() => setConfirmDelete({ id: p.id, description: p.description })}
                  className="ml-auto text-slate-300 hover:text-red-600 transition-colors"
                >
                  <Icon name="Trash2" size={12} />
                </button>
              </div>
              <p className="text-sm text-slate-800 leading-snug">{p.description}</p>
              {p.root_cause && (
                <p className="text-xs text-slate-500 mt-1.5 flex items-start gap-1">
                  <span className="flex-shrink-0">🔍</span>
                  <span className="line-clamp-2">{p.root_cause}</span>
                </p>
              )}

              {/* Привязанные функция/процесс и решение — подробный блок */}
              {(p.linked_process_id || p.linked_solution_id) && (
                <div className="mt-2 space-y-1.5">
                  {p.linked_process_id && (
                    <div className="bg-white/70 border border-blue-200 rounded-lg p-2 flex items-start gap-2">
                      <Icon name="Workflow" size={13} className="text-blue-600 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide">Связанная функция / процесс</p>
                        <p className="text-xs text-slate-800 font-medium truncate">{p.linked_process_title || `#${p.linked_process_id}`}</p>
                        {p.linked_process_department && <p className="text-[10px] text-slate-500">{p.linked_process_department}</p>}
                      </div>
                    </div>
                  )}
                  {p.linked_solution_id && (
                    <div className="bg-white/70 border border-violet-200 rounded-lg p-2 flex items-start gap-2">
                      <Icon name="Server" size={13} className="text-violet-600 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-violet-700 uppercase tracking-wide">Связанное решение / система</p>
                        <p className="text-xs text-slate-800 font-medium truncate">{p.linked_solution_title || `#${p.linked_solution_id}`}</p>
                        {p.linked_solution_type && <p className="text-[10px] text-slate-500">{SOLUTION_TYPE_LABELS[p.linked_solution_type] || p.linked_solution_type}</p>}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Редактор привязки */}
              {editingLinksId === p.id ? (
                <div className="mt-2 bg-white border border-slate-200 rounded-lg p-2.5 space-y-2">
                  {processes.length > 0 && (
                    <select value={linksDraft.linked_process_id} onChange={e => setLinksDraft(d => ({ ...d, linked_process_id: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none bg-white">
                      <option value="">— Функция / процесс не выбраны —</option>
                      {processes.map(pr => <option key={pr.id} value={pr.id}>{pr.title}{pr.department ? ` (${pr.department})` : ""}</option>)}
                    </select>
                  )}
                  {solutions.length > 0 && (
                    <select value={linksDraft.linked_solution_id} onChange={e => setLinksDraft(d => ({ ...d, linked_solution_id: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none bg-white">
                      <option value="">— Решение / система не выбраны —</option>
                      {solutions.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                    </select>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => setEditingLinksId(null)} className="flex-1 border border-slate-200 rounded-lg py-1.5 text-xs hover:bg-slate-50">Отмена</button>
                    <button disabled={savingLinks} onClick={handleSaveLinks} className="flex-1 bg-slate-800 text-white rounded-lg py-1.5 text-xs font-semibold disabled:opacity-50">
                      {savingLinks ? "..." : "Сохранить"}
                    </button>
                  </div>
                </div>
              ) : (
                preset !== "without_solution" && (processes.length > 0 || solutions.length > 0) && (
                  <button
                    onClick={() => startEditLinks(p)}
                    className="mt-2 flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    <Icon name="Link" size={11} />
                    {p.linked_process_id || p.linked_solution_id ? "Изменить привязку" : "Привязать к функции / решению"}
                  </button>
                )
              )}

              {/* Stage 14: контекстное действие в очереди "Проблемы без решения" —
                  если в проекте есть решения, открываем существующий редактор привязки (startEditLinks);
                  если решений нет ни одного — ведём создавать решение (fallback). */}
              {preset === "without_solution" && editingLinksId !== p.id && (
                solutions.length > 0 ? (
                  <button
                    onClick={() => startEditLinks(p)}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 active:bg-red-800"
                  >
                    <Icon name="Link" size={13} />
                    Привязать к решению
                  </button>
                ) : (
                  onGoToSolutions && (
                    <button
                      onClick={onGoToSolutions}
                      className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 active:bg-red-800"
                    >
                      <Icon name="Plus" size={13} />
                      Создать решение
                    </button>
                  )
                )
              )}

              {preset !== "without_solution" && onCreateHypothesis && (
                <button
                  onClick={() => onCreateHypothesis(p)}
                  className={preset === "without_hypothesis"
                    ? "mt-2 w-full flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 active:bg-amber-800"
                    : "mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-violet-600 hover:text-violet-800 transition-colors bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg px-2.5 py-1.5"}
                >
                  <Icon name="Lightbulb" size={preset === "without_hypothesis" ? 13 : 12} />
                  Создать гипотезу
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white border rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center mx-auto mb-3">
              <Icon name="AlertTriangle" size={24} className="text-red-600" />
            </div>
            <h2 className="text-lg font-semibold mb-2 text-center text-slate-800">Удалить запись?</h2>
            <p className="text-sm text-slate-600 mb-1 text-center line-clamp-2">«{confirmDelete.description}»</p>
            <p className="text-xs text-slate-500 mb-5 text-center">Это действие необратимо.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 border border-slate-300 rounded-lg py-2.5 text-sm font-medium hover:bg-slate-50">Отмена</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium">
                {deleting ? "Удаляю..." : "Удалить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}