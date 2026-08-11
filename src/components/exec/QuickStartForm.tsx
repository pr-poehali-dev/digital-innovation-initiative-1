import { useState } from "react";
import Icon from "@/components/ui/icon";
import { execApi } from "@/lib/execCabinetApi";
import { controlApi } from "@/lib/execControlApi";

interface Props {
  onClose: () => void;
  onDone: (initiativeId: number) => void;
}

/**
 * Быстрое создание: инициатива + первая контрольная точка за одну форму.
 * Остальные поля (проблемы, риски, роли) дозаполняются позже в карточке.
 */
export default function QuickStartForm({ onClose, onDone }: Props) {
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [planDate, setPlanDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canSave = title.trim().length > 0;

  const save = async () => {
    if (!canSave) {
      setError("Укажите название инициативы — остальное можно дозаполнить позже");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { id } = await execApi.saveInitiative({
        title: title.trim(),
        goal: goal.trim() || null,
        status: "idea",
      });

      if (milestoneTitle.trim()) {
        await controlApi.saveMilestone({
          initiative_id: id,
          title: milestoneTitle.trim(),
          plan_date: planDate || null,
          status: "not_started",
        });
      }

      onDone(id);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/75 z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-gray-950 border border-gray-800 rounded-xl w-full max-w-lg my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 p-5 border-b border-gray-800">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-orange-500/15 flex items-center justify-center flex-shrink-0">
              <Icon name="Zap" size={17} className="text-orange-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Быстрый старт</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Три поля — остальное дозаполните в карточке инициативы
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <Icon name="X" size={18} />
          </button>
        </header>

        <div className="p-5 space-y-5">
          <label className="block">
            <span className="text-xs text-gray-400 mb-1.5 block">
              Что продвигаем <span className="text-orange-500">*</span>
            </span>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Автоматизация приёма обращений"
              className="w-full px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-700 text-white text-sm placeholder:text-gray-600 focus:border-orange-500 outline-none transition-colors"
            />
          </label>

          <label className="block">
            <span className="text-xs text-gray-400 mb-1.5 block">Зачем — цель одной фразой</span>
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Например: Сократить срок обработки обращения с 5 до 1 дня"
              className="w-full px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-700 text-white text-sm placeholder:text-gray-600 focus:border-orange-500 outline-none transition-colors"
            />
          </label>

          <div className="pt-1 border-t border-gray-800">
            <p className="text-xs text-gray-500 mb-3 pt-4">
              Первая контрольная точка — необязательно, но с ней сразу видно движение
            </p>
            <div className="grid grid-cols-[1fr,140px] gap-3">
              <label className="block">
                <span className="text-xs text-gray-400 mb-1.5 block">Ближайший результат</span>
                <input
                  value={milestoneTitle}
                  onChange={(e) => setMilestoneTitle(e.target.value)}
                  placeholder="Например: Согласована концепция"
                  className="w-full px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-700 text-white text-sm placeholder:text-gray-600 focus:border-orange-500 outline-none transition-colors"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-400 mb-1.5 block">К какой дате</span>
                <input
                  type="date"
                  value={planDate}
                  onChange={(e) => setPlanDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-700 text-white text-sm [color-scheme:dark] focus:border-orange-500 outline-none transition-colors"
                />
              </label>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/5">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 p-5 border-t border-gray-800">
          <p className="text-xs text-gray-600">
            Подробности — роли, сроки, бюджет — заполните позже
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-900 transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={save}
              disabled={saving || !canSave}
              className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center gap-2"
            >
              {saving && (
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              )}
              {saving ? "Создаю…" : "Создать"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
