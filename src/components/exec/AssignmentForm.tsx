import { useState } from "react";
import Icon from "@/components/ui/icon";
import { ControlAction, PRIORITY_LABEL, controlApi } from "@/lib/execControlApi";
import { PersonRef } from "@/lib/execCabinetApi";

interface Props {
  action?: ControlAction;
  persons: PersonRef[];
  initiatives: { id: number; code: string | null; title: string }[];
  onClose: () => void;
  onSaved: () => void;
}

/** Карточка поручения: формулировка, автор/исполнитель/соисполнители, срок,
 * приоритет, связь с инициативой, признак «на контроле». */
export default function AssignmentForm({ action, persons, initiatives, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(action?.title || action?.description || "");
  const [responsibleId, setResponsibleId] = useState(
    action?.responsible_person_id ? String(action.responsible_person_id) : "",
  );
  const [coexecutors, setCoexecutors] = useState<number[]>(
    action?.coexecutors?.map((c) => c.id) || [],
  );
  const [dueAt, setDueAt] = useState(action?.due_at || "");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">(
    action?.priority || "normal",
  );
  const [initiativeId, setInitiativeId] = useState(
    action?.initiative_id ? String(action.initiative_id) : "",
  );
  const [expectedResult, setExpectedResult] = useState(action?.expected_result || "");
  const [isOnControl, setIsOnControl] = useState(action?.is_on_control || false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canSave = title.trim().length > 0 && responsibleId;

  const save = async () => {
    if (!canSave) {
      setError("Укажите формулировку и ответственного");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await controlApi.saveAction({
        ...(action ? { id: action.id } : {}),
        title: title.trim(),
        responsible_person_id: Number(responsibleId),
        coexecutor_ids: coexecutors,
        due_at: dueAt || null,
        priority,
        initiative_id: initiativeId ? Number(initiativeId) : null,
        expected_result: expectedResult || null,
        is_on_control: isOnControl,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const toggleCoexecutor = (id: number) => {
    setCoexecutors((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div
      className="fixed inset-0 bg-black/75 z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-xl w-full max-w-lg my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 p-5 border-b border-slate-200">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
              <Icon name="ClipboardCheck" size={17} className="text-violet-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {action ? "Изменить поручение" : "Новое поручение"}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Формулировка, ответственный и срок — остальное можно дозаполнить позже
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 transition-colors">
            <Icon name="X" size={18} />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <label className="block">
            <span className="text-xs text-slate-500 mb-1.5 block">
              Формулировка <span className="text-violet-600">*</span>
            </span>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Что нужно сделать"
              className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 text-sm placeholder:text-slate-400 focus:border-violet-600 outline-none transition-colors"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-slate-500 mb-1.5 block">
                Ответственный <span className="text-violet-600">*</span>
              </span>
              <select
                value={responsibleId}
                onChange={(e) => setResponsibleId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 text-sm outline-none focus:border-violet-600 transition-colors"
              >
                <option value="">не выбрано</option>
                {persons.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-500 mb-1.5 block">Срок</span>
              <input
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 text-sm outline-none focus:border-violet-600 transition-colors"
              />
            </label>
          </div>

          <div>
            <span className="text-xs text-slate-500 mb-1.5 block">Соисполнители</span>
            <div className="flex flex-wrap gap-1.5">
              {persons
                .filter((p) => String(p.id) !== responsibleId)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleCoexecutor(p.id)}
                    className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                      coexecutors.includes(p.id)
                        ? "bg-violet-100 border-violet-300 text-violet-700"
                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {p.display_name}
                  </button>
                ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-slate-500 mb-1.5 block">Приоритет</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as typeof priority)}
                className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 text-sm outline-none focus:border-violet-600 transition-colors"
              >
                {Object.entries(PRIORITY_LABEL).map(([code, l]) => (
                  <option key={code} value={code}>
                    {l.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-500 mb-1.5 block">Инициатива</span>
              <select
                value={initiativeId}
                onChange={(e) => setInitiativeId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 text-sm outline-none focus:border-violet-600 transition-colors"
              >
                <option value="">не связано</option>
                {initiatives.map((i) => (
                  <option key={i.id} value={String(i.id)}>
                    {i.title.length > 50 ? i.title.slice(0, 50) + "…" : i.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-xs text-slate-500 mb-1.5 block">Ожидаемый результат</span>
            <textarea
              value={expectedResult}
              onChange={(e) => setExpectedResult(e.target.value)}
              rows={2}
              placeholder="Как поймём, что поручение выполнено"
              className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 text-sm placeholder:text-slate-400 focus:border-violet-600 outline-none transition-colors resize-none"
            />
          </label>

          <label className="flex items-start gap-2.5 cursor-pointer group">
            <span
              onClick={(e) => {
                e.preventDefault();
                setIsOnControl(!isOnControl);
              }}
              className={`w-[18px] h-[18px] rounded border flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                isOnControl ? "bg-violet-600 border-violet-600" : "border-slate-200 group-hover:border-slate-400"
              }`}
            >
              {isOnControl && <Icon name="Check" size={12} className="text-slate-900" />}
            </span>
            <span className="text-sm text-slate-700">Держать на личном контроле</span>
          </label>

          {error && (
            <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/5">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 p-5 border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={save}
            disabled={saving || !canSave}
            className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center gap-2"
          >
            {saving && (
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {saving ? "Сохраняю…" : "Сохранить"}
          </button>
        </footer>
      </div>
    </div>
  );
}