import { useState } from "react";
import Icon from "@/components/ui/icon";
import { controlApi } from "@/lib/execControlApi";

interface Props {
  initiativeId?: number;
  initiatives: { id: number; title: string }[];
  onClose: () => void;
  onDone: () => void;
}

const SCALE_HINTS: Record<number, string> = {
  1: "маловероятно",
  2: "низкая",
  3: "средняя",
  4: "высокая",
  5: "почти наверняка",
};

/**
 * Быстрое создание риска: инициатива + описание + вероятность/влияние.
 * Причины, меры, план реагирования — дозаполняются в карточке.
 */
export default function QuickRiskForm({ initiativeId, initiatives, onClose, onDone }: Props) {
  const [initId, setInitId] = useState(initiativeId ? String(initiativeId) : "");
  const [description, setDescription] = useState("");
  const [probability, setProbability] = useState(3);
  const [impact, setImpact] = useState(3);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canSave = initId && description.trim().length > 0;
  const score = probability * impact;
  const scoreLevel =
    score >= 16 ? "критический" : score >= 10 ? "высокий" : score >= 5 ? "средний" : "низкий";
  const scoreCls =
    score >= 16
      ? "text-red-300"
      : score >= 10
        ? "text-orange-300"
        : score >= 5
          ? "text-amber-300"
          : "text-gray-400";

  const save = async () => {
    if (!canSave) {
      setError("Укажите инициативу и описание риска");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const today = new Date().toISOString().slice(0, 10);
      await controlApi.saveRisk({
        initiative_id: Number(initId),
        description: description.trim(),
        probability,
        impact,
        status: "active",
        detected_at: today,
        last_assessed_at: today,
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
              <h2 className="text-base font-semibold text-white">Быстрый риск</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Опишите риск — причины и меры дозаполните в карточке
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
              Что может случиться <span className="text-orange-500">*</span>
            </span>
            <textarea
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Например: Ключевой исполнитель уйдёт в отпуск в период внедрения"
              rows={2}
              className="w-full px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-700 text-white text-sm placeholder:text-gray-600 focus:border-orange-500 outline-none transition-colors resize-y"
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-gray-400 mb-1.5 block">
                Вероятность — {SCALE_HINTS[probability]}
              </span>
              <input
                type="range"
                min={1}
                max={5}
                value={probability}
                onChange={(e) => setProbability(Number(e.target.value))}
                className="w-full accent-orange-500"
              />
            </div>
            <div>
              <span className="text-xs text-gray-400 mb-1.5 block">
                Влияние — {SCALE_HINTS[impact]}
              </span>
              <input
                type="range"
                min={1}
                max={5}
                value={impact}
                onChange={(e) => setImpact(Number(e.target.value))}
                className="w-full accent-orange-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-900/60 border border-gray-800">
            <Icon name="Gauge" size={14} className="text-gray-500 flex-shrink-0" />
            <p className="text-xs text-gray-400">
              Расчётный уровень: <span className={`font-medium ${scoreCls}`}>{scoreLevel}</span>{" "}
              ({score} из 25)
            </p>
          </div>

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
