import { useState } from "react";
import { workspaceApi } from "@/lib/api";
import Icon from "@/components/ui/icon";

type ProcessStep = {
  id: number;
  step_order: number;
  title: string;
  role_name: string;
  description: string;
  system_name: string;
  is_manual: boolean;
  pain_point: string;
  control_point: string;
  automation_potential: string;
  ai_potential: string;
  duration_minutes: number | null;
};

type Process = {
  id: number;
  title: string;
  description: string;
  owner_name: string;
  department: string;
  maturity_level: string;
  digital_maturity: string;
  ai_potential: string;
  step_count: number;
  steps: ProcessStep[];
};

const EMPTY_PROCESS = { title: "", description: "", owner_name: "", department: "" };
const EMPTY_STEP = { title: "", role_name: "", system_name: "", is_manual: true, pain_point: "", ai_potential: "none" };

interface Props {
  projectId: number;
  processes: Process[];
  loading?: boolean;
  onReload: () => void;
}

export default function ProcessesTab({ projectId, processes, loading = false, onReload }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(EMPTY_PROCESS);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showStepForm, setShowStepForm] = useState<number | null>(null);
  const [stepDraft, setStepDraft] = useState<Record<number, typeof EMPTY_STEP>>({});
  const [confirmDeleteProcess, setConfirmDeleteProcess] = useState<{ id: number; title: string } | null>(null);
  const [confirmDeleteStep, setConfirmDeleteStep] = useState<{ id: number; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleCreate = async () => {
    if (!draft.title.trim()) return;
    setSaving(true);
    try {
      await workspaceApi.createProcess({ project_id: projectId, ...draft });
      setDraft(EMPTY_PROCESS);
      setShowForm(false);
      onReload();
    } finally { setSaving(false); }
  };

  const handleCreateStep = async (procId: number) => {
    const s = stepDraft[procId] || EMPTY_STEP;
    if (!s.title?.trim()) return;
    setSaving(true);
    try {
      await workspaceApi.createProcessStep({ process_id: procId, project_id: projectId, ...s });
      setShowStepForm(null);
      onReload();
    } finally { setSaving(false); }
  };

  const handleDeleteProcess = async () => {
    if (!confirmDeleteProcess) return;
    setDeleting(true);
    try {
      await workspaceApi.deleteProcess(confirmDeleteProcess.id, projectId);
      setConfirmDeleteProcess(null);
      setExpandedId(null);
      onReload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Не удалось удалить процесс");
    } finally { setDeleting(false); }
  };

  const handleDeleteStep = async () => {
    if (!confirmDeleteStep) return;
    setDeleting(true);
    try {
      await workspaceApi.deleteProcessStep(confirmDeleteStep.id, projectId);
      setConfirmDeleteStep(null);
      onReload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Не удалось удалить шаг");
    } finally { setDeleting(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs sm:text-sm text-slate-500 leading-snug">Опишите процессы as-is: шаги, роли, системы, контроли</p>
        <button
          onClick={() => setShowForm(true)}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none flex-shrink-0"
        >
          <Icon name="Plus" size={13} /> <span className="hidden xs:inline">Добавить</span> процесс
        </button>
      </div>

      {loading && (
        <div className="space-y-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4 h-16 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && showForm && (
        <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 space-y-2.5">
          <p className="text-sm font-semibold text-slate-800">Новый процесс</p>
          <input placeholder="Название процесса *" value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
          <input placeholder="Подразделение-владелец" value={draft.department} onChange={e => setDraft(d => ({ ...d, department: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
          <textarea placeholder="Краткое описание / цель" rows={2} value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none" />
          <div className="flex gap-2 pt-1">
            <button onClick={() => { setShowForm(false); setDraft(EMPTY_PROCESS); }} className="flex-1 border border-slate-200 rounded-lg py-2.5 text-sm hover:bg-slate-50">Отмена</button>
            <button disabled={!draft.title.trim() || saving} onClick={handleCreate} className="flex-1 bg-slate-800 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50">
              {saving ? "Создаю..." : "Создать"}
            </button>
          </div>
        </div>
      )}

      {!loading && processes.length === 0 && !showForm && (
        <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center">
          <Icon name="Workflow" size={28} className="text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm mb-1">Процессов пока нет</p>
          <p className="text-xs text-slate-400">Добавьте as-is описание — шаги, роли, системы, боли</p>
          <button onClick={() => setShowForm(true)} className="mt-3 text-xs text-slate-600 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50">
            + Добавить первый процесс
          </button>
        </div>
      )}

      {!loading && processes.map(proc => (
        <div key={proc.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div
            className="flex items-center justify-between p-3 sm:p-4 cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition-colors"
            onClick={() => setExpandedId(expandedId === proc.id ? null : proc.id)}
          >
            <div className="flex-1 min-w-0 pr-2">
              <p className="font-semibold text-slate-900 text-sm leading-snug truncate">{proc.title}</p>
              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                {proc.department && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{proc.department}</span>}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${proc.ai_potential === 'high' ? 'bg-violet-100 text-violet-700' : proc.ai_potential === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                  AI: {proc.ai_potential === 'high' ? 'высокий' : proc.ai_potential === 'medium' ? 'средний' : proc.ai_potential === 'low' ? 'низкий' : 'не оценён'}
                </span>
                <span className="text-[10px] text-slate-400">{proc.step_count} шагов</span>
              </div>
              {proc.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{proc.description}</p>}
            </div>
            <Icon name={expandedId === proc.id ? "ChevronUp" : "ChevronDown"} size={18} className="text-slate-400 flex-shrink-0" />
          </div>

          {expandedId === proc.id && (
            <div className="border-t border-slate-100 px-3 sm:px-4 pb-3 pt-2 space-y-2">
              {proc.steps.map((step, idx) => (
                <div key={step.id} className="flex gap-2 group">
                  <div className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 mt-0.5">{idx + 1}</div>
                  <div className="flex-1 bg-slate-50 rounded-xl p-2.5 min-w-0">
                    <div className="flex items-start gap-1.5 flex-wrap">
                      <p className="text-xs sm:text-sm font-medium text-slate-800 flex-1 min-w-0">{step.title}</p>
                      <div className="flex gap-1 flex-shrink-0 items-center">
                        {step.is_manual && <span className="text-[9px] sm:text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-semibold whitespace-nowrap">ручной</span>}
                        {step.ai_potential !== 'none' && <span className="text-[9px] sm:text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-semibold whitespace-nowrap">AI: {step.ai_potential}</span>}
                        <button
                          onClick={() => setConfirmDeleteStep({ id: step.id, title: step.title })}
                          className="text-slate-300 hover:text-red-600 transition-colors"
                        >
                          <Icon name="Trash2" size={12} />
                        </button>
                      </div>
                    </div>
                    {(step.role_name || step.system_name || step.duration_minutes) && (
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
                        {step.role_name && <span className="text-[10px] text-slate-500">👤 {step.role_name}</span>}
                        {step.system_name && <span className="text-[10px] text-slate-500">🖥 {step.system_name}</span>}
                        {step.duration_minutes && <span className="text-[10px] text-slate-500">⏱ {step.duration_minutes} мин</span>}
                      </div>
                    )}
                    {step.pain_point && <p className="text-[10px] sm:text-xs text-red-600 mt-1 line-clamp-2">🔥 {step.pain_point}</p>}
                    {step.control_point && <p className="text-[10px] sm:text-xs text-blue-600 mt-0.5 line-clamp-1">🔒 {step.control_point}</p>}
                  </div>
                </div>
              ))}

              {showStepForm === proc.id ? (
                <div className="bg-slate-50 rounded-xl p-3 space-y-2 border border-slate-200 ml-7">
                  <p className="text-xs font-semibold text-slate-700">Новый шаг</p>
                  <input placeholder="Название шага *" value={stepDraft[proc.id]?.title || ""} onChange={e => setStepDraft(d => ({ ...d, [proc.id]: { ...(d[proc.id] || EMPTY_STEP), title: e.target.value } }))} className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400" />
                  <input placeholder="Роль / исполнитель" value={stepDraft[proc.id]?.role_name || ""} onChange={e => setStepDraft(d => ({ ...d, [proc.id]: { ...(d[proc.id] || EMPTY_STEP), role_name: e.target.value } }))} className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none" />
                  <input placeholder="Система / инструмент" value={stepDraft[proc.id]?.system_name || ""} onChange={e => setStepDraft(d => ({ ...d, [proc.id]: { ...(d[proc.id] || EMPTY_STEP), system_name: e.target.value } }))} className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none" />
                  <input placeholder="Боль / проблема на этом шаге" value={stepDraft[proc.id]?.pain_point || ""} onChange={e => setStepDraft(d => ({ ...d, [proc.id]: { ...(d[proc.id] || EMPTY_STEP), pain_point: e.target.value } }))} className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none text-red-700 placeholder:text-red-300" />
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                      <input type="checkbox" checked={stepDraft[proc.id]?.is_manual ?? true} onChange={e => setStepDraft(d => ({ ...d, [proc.id]: { ...(d[proc.id] || EMPTY_STEP), is_manual: e.target.checked } }))} className="w-4 h-4" />
                      Ручной
                    </label>
                    <select value={stepDraft[proc.id]?.ai_potential || "none"} onChange={e => setStepDraft(d => ({ ...d, [proc.id]: { ...(d[proc.id] || EMPTY_STEP), ai_potential: e.target.value } }))} className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm">
                      <option value="none">AI: нет</option>
                      <option value="low">AI: низкий</option>
                      <option value="medium">AI: средний</option>
                      <option value="high">AI: высокий</option>
                    </select>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setShowStepForm(null)} className="flex-1 border border-slate-200 rounded-lg py-2 text-sm hover:bg-slate-100">Отмена</button>
                    <button disabled={!stepDraft[proc.id]?.title?.trim() || saving} onClick={() => handleCreateStep(proc.id)} className="flex-1 bg-slate-800 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50">
                      {saving ? "..." : "Добавить"}
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowStepForm(proc.id)} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors ml-7 py-1.5 px-2 rounded-lg hover:bg-slate-100">
                  <Icon name="Plus" size={13} /> Добавить шаг
                </button>
              )}

              <div className="pt-1 ml-7">
                <button
                  onClick={() => setConfirmDeleteProcess({ id: proc.id, title: proc.title })}
                  className="text-xs text-red-600 hover:text-red-800 font-medium flex items-center gap-1"
                >
                  <Icon name="Trash2" size={11} />
                  Удалить процесс
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {confirmDeleteProcess && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white border rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center mx-auto mb-3">
              <Icon name="AlertTriangle" size={24} className="text-red-600" />
            </div>
            <h2 className="text-lg font-semibold mb-2 text-center text-slate-800">Удалить процесс?</h2>
            <p className="text-sm text-slate-600 mb-1 text-center">«{confirmDeleteProcess.title}»</p>
            <p className="text-xs text-slate-500 mb-5 text-center">Все шаги процесса также будут удалены. Это действие необратимо.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteProcess(null)} className="flex-1 border border-slate-300 rounded-lg py-2.5 text-sm font-medium hover:bg-slate-50">Отмена</button>
              <button onClick={handleDeleteProcess} disabled={deleting} className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium">
                {deleting ? "Удаляю..." : "Удалить"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteStep && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white border rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center mx-auto mb-3">
              <Icon name="AlertTriangle" size={24} className="text-red-600" />
            </div>
            <h2 className="text-lg font-semibold mb-2 text-center text-slate-800">Удалить шаг?</h2>
            <p className="text-sm text-slate-600 mb-1 text-center">«{confirmDeleteStep.title}»</p>
            <p className="text-xs text-slate-500 mb-5 text-center">Это действие необратимо.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteStep(null)} className="flex-1 border border-slate-300 rounded-lg py-2.5 text-sm font-medium hover:bg-slate-50">Отмена</button>
              <button onClick={handleDeleteStep} disabled={deleting} className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium">
                {deleting ? "Удаляю..." : "Удалить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}