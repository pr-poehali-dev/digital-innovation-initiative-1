import { useState } from "react";
import Icon from "@/components/ui/icon";
import { controlApi } from "@/lib/execControlApi";

interface Props {
  initiativeId?: number;
  initiatives: { id: number; title: string }[];
  onClose: () => void;
  onDone: () => void;
}

/**
 * Быстрое создание проблемы: инициатива + название + признак блокировки.
 * Категория, критичность, план устранения — дозаполняются в карточке.
 */
export default function QuickIssueForm({ initiativeId, initiatives, onClose, onDone }: Props) {
  const [initId, setInitId] = useState(initiativeId ? String(initiativeId) : "");
  const [title, setTitle] = useState("");
  const [isBlocking, setIsBlocking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canSave = initId && title.trim().length > 0;

  const save = async () => {
    if (!canSave) {
      setError("Укажите инициативу и суть проблемы");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const today = new Date().toISOString().slice(0, 10);
      await controlApi.saveIssue({
        initiative_id: Number(initId),
        title: title.trim(),
        status: "open",
        criticality: isBlocking ? "high" : "medium",
        detected_at: today,
        ...(isBlocking
          ? {
              is_blocking: true,
              block_what: title.trim(),
              block_since: today,
              block_who_can_lift: "уточняется",
              block_requirements: "уточняется",
              block_escalation_level: "manager",
              block_deadline: today,
            }
          : {}),
      });
      onDone();
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
              <h2 className="text-base font-semibold text-white">Быстрая проблема</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Два поля — подробности дозаполните в карточке проблемы
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <Icon name="X" size={18} />
          </button>
        </header>

        <div className="p-5 space-y-5">
          {!initiativeId && (
            <label className="block">
              <span className="text-xs text-gray-400 mb-1.5 block">
                Инициатива <span className="text-orange-500">*</span>
              </span>
              <select
                value={initId}
                onChange={(e) => setInitId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-700 text-white text-sm outline-none focus:border-orange-500 transition-colors"
              >
                <option value="">не выбрано</option>
                {initiatives.map((i) => (
                  <option key={i.id} value={String(i.id)}>
                    {i.title.length > 60 ? i.title.slice(0, 60) + "…" : i.title}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="text-xs text-gray-400 mb-1.5 block">
              Что мешает <span className="text-orange-500">*</span>
            </span>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Не получено заключение ИБ"
              className="w-full px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-700 text-white text-sm placeholder:text-gray-600 focus:border-orange-500 outline-none transition-colors"
            />
          </label>

          <label className="flex items-start gap-2.5 cursor-pointer group">
            <span
              onClick={(e) => {
                e.preventDefault();
                setIsBlocking(!isBlocking);
              }}
              className={`w-[18px] h-[18px] rounded border flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                isBlocking ? "bg-orange-500 border-orange-500" : "border-gray-700 group-hover:border-gray-600"
              }`}
            >
              {isBlocking && <Icon name="Check" size={12} className="text-white" />}
            </span>
            <span className="min-w-0">
              <span className="text-sm text-gray-300 block leading-snug">Прямо сейчас блокирует работу</span>
              <span className="text-[11px] text-gray-600 block mt-0.5">
                Поднимет проблему в «Мой фокус» с высоким приоритетом. Кто снимает и точный срок
                уточните позже в карточке.
              </span>
            </span>
          </label>

          {error && (
            <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/5">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 p-5 border-t border-gray-800">
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
        </footer>
      </div>
    </div>
  );
}
