import { useState } from "react";
import { workspaceApi } from "@/lib/api";
import Icon from "@/components/ui/icon";

type Solution = {
  id: number;
  title: string;
  solution_type: string;
  covers_text: string;
  status: string;
  limitations: string;
  alternatives: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  keep:    { label: "Оставить",   color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  improve: { label: "Доработать", color: "bg-amber-100 text-amber-700",     dot: "bg-amber-500"   },
  replace: { label: "Заменить",   color: "bg-red-100 text-red-700",         dot: "bg-red-500"     },
  retire:  { label: "Вывести",    color: "bg-slate-100 text-slate-500",     dot: "bg-slate-400"   },
};

const SOLUTION_TYPES = [
  { value: "",         label: "— Тип не указан —" },
  { value: "erp",      label: "ERP / учётная система" },
  { value: "bi",       label: "BI / аналитика" },
  { value: "rpa",      label: "RPA / автоматизация" },
  { value: "ocr",      label: "OCR / распознавание" },
  { value: "workflow", label: "Workflow / согласования" },
  { value: "crm",      label: "CRM" },
  { value: "custom",   label: "Самописное решение" },
  { value: "saas",     label: "SaaS-сервис" },
  { value: "other",    label: "Другое" },
];

const EMPTY_FORM = {
  title: "",
  solution_type: "",
  covers_text: "",
  status: "keep",
  limitations: "",
  alternatives: "",
  notes: "",
};

interface Props {
  projectId: number;
  solutions: Solution[];
  loading?: boolean;
  onReload: () => void;
}

export default function SolutionsTab({ projectId, solutions, loading = false, onReload }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleCreate = async () => {
    if (!form.title.trim()) { setError("Введите название решения"); return; }
    setSaving(true); setError("");
    try {
      await workspaceApi.createSolution({ project_id: projectId, ...form });
      setForm(EMPTY_FORM);
      setShowForm(false);
      onReload();
    } catch { setError("Ошибка сохранения"); }
    finally { setSaving(false); }
  };

  const startEdit = (s: Solution) => {
    setEditingId(s.id);
    setEditForm({
      title: s.title,
      solution_type: s.solution_type || "",
      covers_text: s.covers_text || "",
      status: s.status || "keep",
      limitations: s.limitations || "",
      alternatives: s.alternatives || "",
      notes: s.notes || "",
    });
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    setSaving(true); setError("");
    try {
      await workspaceApi.updateSolution({ id: editingId, ...editForm });
      setEditingId(null);
      onReload();
    } catch { setError("Ошибка сохранения"); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await workspaceApi.deleteSolution(confirmDelete.id);
      setConfirmDelete(null);
      setExpandedId(null);
      onReload();
    } catch { setError("Ошибка удаления"); }
    finally { setDeleting(false); }
  };

  const statusCounts = Object.fromEntries(
    Object.keys(STATUS_CONFIG).map(k => [k, solutions.filter(s => s.status === k).length])
  );

  return (
    <div className="space-y-4">

      {/* Заголовок + кнопка */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Решения и системы</h2>
          <p className="text-xs text-slate-500 mt-0.5">Реестр текущих инструментов и их оценка</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setError(""); }}
          disabled={loading}
          className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
        >
          <Icon name="Plus" size={14} />
          Добавить
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="bg-white border border-slate-200 rounded-xl p-3 h-14 animate-pulse" />
            ))}
          </div>
          {[0, 1, 2].map(i => (
            <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4 h-16 animate-pulse" />
          ))}
        </div>
      )}

      {/* Сводка по статусам */}
      {!loading && solutions.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {Object.entries(STATUS_CONFIG).map(([k, cfg]) => (
            <div key={k} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
              <div className={`text-lg font-bold ${statusCounts[k] ? "text-slate-900" : "text-slate-300"}`}>
                {statusCounts[k] || 0}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">{cfg.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Форма добавления */}
      {!loading && showForm && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-800">Новое решение / система</p>

          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Название *</label>
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Например: SAP, Power BI, самописный портал..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Тип решения</label>
              <select
                value={form.solution_type}
                onChange={e => setForm(f => ({ ...f, solution_type: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none bg-white"
              >
                {SOLUTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Статус</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none bg-white"
              >
                {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Что покрывает</label>
            <textarea
              value={form.covers_text}
              onChange={e => setForm(f => ({ ...f, covers_text: e.target.value }))}
              placeholder="Какие функции и процессы поддерживает это решение..."
              rows={2}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none resize-none"
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Ограничения и проблемы</label>
            <textarea
              value={form.limitations}
              onChange={e => setForm(f => ({ ...f, limitations: e.target.value }))}
              placeholder="Что не устраивает, где узкие места..."
              rows={2}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none resize-none"
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Альтернативы</label>
            <textarea
              value={form.alternatives}
              onChange={e => setForm(f => ({ ...f, alternatives: e.target.value }))}
              placeholder="Возможные замены или улучшения..."
              rows={2}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none resize-none"
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Заметки</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Дополнительный контекст, планы, идеи..."
              rows={2}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none resize-none"
            />
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setError(""); }}
              className="flex-1 border border-slate-200 rounded-lg py-2.5 text-sm hover:bg-slate-50 transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={handleCreate}
              disabled={saving}
              className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
            >
              {saving ? "Сохраняю..." : "Сохранить"}
            </button>
          </div>
        </div>
      )}

      {/* Пустое состояние */}
      {!loading && solutions.length === 0 && !showForm && (
        <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-8 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Icon name="Server" size={20} className="text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-700 mb-1">Решений пока нет</p>
          <p className="text-xs text-slate-400 mb-4">Добавьте системы и инструменты, которые сейчас используются в подразделении</p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Icon name="Plus" size={14} />
            Добавить первое решение
          </button>
        </div>
      )}

      {/* Список решений */}
      {!loading && solutions.length > 0 && (
        <div className="space-y-2">
          {solutions.map(s => {
            const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.keep;
            const isExpanded = expandedId === s.id;
            const isEditing = editingId === s.id;
            const typeLabel = SOLUTION_TYPES.find(t => t.value === s.solution_type)?.label || s.solution_type;

            return (
              <div key={s.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                {/* Заголовок карточки */}
                <div
                  className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : s.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${cfg.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900">{s.title}</span>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                        {s.solution_type && (
                          <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{typeLabel}</span>
                        )}
                      </div>
                      {s.covers_text && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-1">{s.covers_text}</p>
                      )}
                    </div>
                    <Icon name={isExpanded ? "ChevronUp" : "ChevronDown"} size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
                  </div>
                </div>

                {/* Раскрытая карточка */}
                {isExpanded && !isEditing && (
                  <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
                    {s.covers_text && (
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Что покрывает</p>
                        <p className="text-sm text-slate-700">{s.covers_text}</p>
                      </div>
                    )}
                    {s.limitations && (
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Ограничения и проблемы</p>
                        <p className="text-sm text-slate-700">{s.limitations}</p>
                      </div>
                    )}
                    {s.alternatives && (
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Альтернативы</p>
                        <p className="text-sm text-slate-700">{s.alternatives}</p>
                      </div>
                    )}
                    {s.notes && (
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Заметки</p>
                        <p className="text-sm text-slate-700">{s.notes}</p>
                      </div>
                    )}
                    <div className="pt-1 flex items-center gap-4">
                      <button
                        onClick={() => startEdit(s)}
                        className="text-xs text-violet-600 hover:text-violet-800 font-medium flex items-center gap-1"
                      >
                        <Icon name="Pencil" size={11} />
                        Редактировать
                      </button>
                      <button
                        onClick={() => setConfirmDelete({ id: s.id, title: s.title })}
                        className="text-xs text-red-600 hover:text-red-800 font-medium flex items-center gap-1"
                      >
                        <Icon name="Trash2" size={11} />
                        Удалить
                      </button>
                    </div>
                  </div>
                )}

                {/* Форма редактирования */}
                {isEditing && (
                  <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Название</label>
                      <input
                        value={editForm.title}
                        onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Тип</label>
                        <select
                          value={editForm.solution_type}
                          onChange={e => setEditForm(f => ({ ...f, solution_type: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
                        >
                          {SOLUTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Статус</label>
                        <select
                          value={editForm.status}
                          onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
                        >
                          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </div>
                    </div>
                    {[
                      { key: "covers_text", label: "Что покрывает" },
                      { key: "limitations", label: "Ограничения и проблемы" },
                      { key: "alternatives", label: "Альтернативы" },
                      { key: "notes", label: "Заметки" },
                    ].map(field => (
                      <div key={field.key}>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">{field.label}</label>
                        <textarea
                          value={editForm[field.key as keyof typeof editForm]}
                          onChange={e => setEditForm(f => ({ ...f, [field.key]: e.target.value }))}
                          rows={2}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                        />
                      </div>
                    ))}
                    {error && <p className="text-red-500 text-xs">{error}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEditingId(null); setError(""); }}
                        className="flex-1 border border-slate-200 rounded-lg py-2 text-sm hover:bg-slate-50 transition-colors"
                      >
                        Отмена
                      </button>
                      <button
                        onClick={handleUpdate}
                        disabled={saving}
                        className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition-colors"
                      >
                        {saving ? "Сохраняю..." : "Сохранить"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Модалка подтверждения удаления */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white border rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center mx-auto mb-3">
              <Icon name="AlertTriangle" size={24} className="text-red-600" />
            </div>
            <h2 className="text-lg font-semibold mb-2 text-center text-slate-800">Удалить решение?</h2>
            <p className="text-sm text-slate-600 mb-1 text-center">«{confirmDelete.title}»</p>
            <p className="text-xs text-slate-500 mb-5 text-center">Это действие необратимо.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 border border-slate-300 rounded-lg py-2.5 text-sm font-medium hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium"
              >
                {deleting ? "Удаляю..." : "Удалить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}