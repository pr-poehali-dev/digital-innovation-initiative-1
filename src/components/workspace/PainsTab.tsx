import { useState } from "react";
import { workspaceApi } from "@/lib/api";
import Icon from "@/components/ui/icon";

type PainPoint = {
  id: number;
  pain_type: string;
  description: string;
  impact_level: string;
  frequency: string;
  root_cause: string;
};

const EMPTY_PAIN = { description: "", pain_type: "manual_work", impact_level: "medium", frequency: "", root_cause: "" };

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

interface Props {
  projectId: number;
  painPoints: PainPoint[];
  loading?: boolean;
  onReload: () => void;
}

export default function PainsTab({ projectId, painPoints, loading = false, onReload }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(EMPTY_PAIN);
  const [saving, setSaving] = useState(false);
  const [aiExtractText, setAiExtractText] = useState("");
  const [aiExtractLoading, setAiExtractLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; description: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleCreate = async () => {
    if (!draft.description.trim()) return;
    setSaving(true);
    try {
      await workspaceApi.createPainPoint({ project_id: projectId, ...draft });
      setDraft(EMPTY_PAIN);
      setShowForm(false);
      onReload();
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
      await workspaceApi.deletePainPoint(confirmDelete.id);
      setConfirmDelete(null);
      onReload();
    } finally { setDeleting(false); }
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

      {!loading && painPoints.length > 0 && (
        <div className="space-y-2">
          {painPoints.map(p => (
            <div key={p.id} className={`border rounded-xl p-3 group ${IMPACT_COLOR[p.impact_level] || "bg-slate-50 border-slate-200"}`}>
              <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${IMPACT_BADGE[p.impact_level] || "bg-slate-100 text-slate-600"}`}>
                  {IMPACT_LABEL[p.impact_level] || p.impact_level}
                </span>
                <span className="text-[10px] bg-white/70 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
                  {PAIN_LABELS[p.pain_type] || p.pain_type}
                </span>
                {p.frequency && <span className="text-[10px] text-slate-500">📅 {p.frequency}</span>}
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
