import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { execApi, DecisionRequestRegistryItem } from "@/lib/execCabinetApi";

interface PersonOption { id: number; display_name: string; position_title: string; org_name: string }

/**
 * Преобразование вопроса реестра в поручение (exec_action) — только по
 * явному подтверждению пользователем. Адресат, срок и ожидаемый результат
 * не подставляются автоматически: если адресат не выбран, поручение
 * создаётся без ответственного (пробел остаётся видимым, а не скрывается).
 */
export default function ConvertToActionForm({
  item, onClose, onDone,
}: { item: DecisionRequestRegistryItem; onClose: () => void; onDone: () => void }) {
  const [persons, setPersons] = useState<PersonOption[]>([]);
  const [responsiblePersonId, setResponsiblePersonId] = useState<string>(
    item.addressee_person_id ? String(item.addressee_person_id) : "",
  );
  const [dueAt, setDueAt] = useState("");
  const [expectedResult, setExpectedResult] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    execApi.persons().then((r) => setPersons(r.items)).catch(() => {});
  }, []);

  const save = async () => {
    if (!expectedResult.trim()) {
      setError("Укажите ожидаемый результат поручения");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await execApi.convertDecisionRequestToAction({
        decision_request_id: item.id,
        responsible_person_id: responsiblePersonId ? Number(responsiblePersonId) : undefined,
        due_at: dueAt || undefined,
        expected_result: expectedResult.trim(),
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg my-8" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 p-5 border-b border-slate-200">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
              <Icon name="Send" size={17} className="text-violet-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Преобразовать в поручение</h2>
              <p className="text-xs text-slate-500 mt-0.5">{item.initiative_code} · {item.initiative_title}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 transition-colors">
            <Icon name="X" size={18} />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm text-slate-800">{item.question}</p>
          </div>

          <label className="block">
            <span className="text-xs text-slate-500 mb-1.5 block">Ответственный (адресат)</span>
            <select
              value={responsiblePersonId}
              onChange={(e) => setResponsiblePersonId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 text-sm outline-none focus:border-violet-600 transition-colors"
            >
              <option value="">Не назначен — подтвердить позже</option>
              {persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}{p.position_title ? ` — ${p.position_title}` : ""}{p.org_name ? ` (${p.org_name})` : ""}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Только подтверждённые сотрудники из справочника — фиктивные персоны не создаются.
            </span>
          </label>

          <label className="block">
            <span className="text-xs text-slate-500 mb-1.5 block">Срок исполнения</span>
            <input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 text-sm outline-none focus:border-violet-600 transition-colors"
            />
            <span className="text-[11px] text-slate-400 mt-1 block">
              Оставьте пустым, если срок ещё не согласован — не устанавливайте произвольную дату.
            </span>
          </label>

          <label className="block">
            <span className="text-xs text-slate-500 mb-1.5 block">
              Ожидаемый результат <span className="text-violet-600">*</span>
            </span>
            <textarea
              autoFocus
              value={expectedResult}
              onChange={(e) => setExpectedResult(e.target.value)}
              placeholder="Например: получен подтверждённый ответ владельца по срокам и последовательности вех"
              rows={3}
              className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 text-sm placeholder:text-slate-400 focus:border-violet-600 outline-none transition-colors resize-y"
            />
          </label>

          {error && (
            <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/5">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 p-5 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors">
            Отмена
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm font-medium transition-colors flex items-center gap-2"
          >
            {saving && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {saving ? "Создаю…" : "Создать поручение"}
          </button>
        </footer>
      </div>
    </div>
  );
}
