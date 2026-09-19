import { useState } from "react";
import Icon from "@/components/ui/icon";
import { execApi, DecisionRequest } from "@/lib/execCabinetApi";

interface Props {
  initiativeId: number;
  item: DecisionRequest | null;
  onClose: () => void;
  onDone: () => void;
}

/**
 * Вопрос, требующий управленческого решения по инициативе — лёгкая
 * рабочая запись (не формальное решение коллегиального органа).
 */
export default function DecisionRequestForm({ initiativeId, item, onClose, onDone }: Props) {
  const [question, setQuestion] = useState(item?.question || "");
  const [options, setOptions] = useState(item?.options || "");
  const [recommended, setRecommended] = useState(item?.recommended_option || "");
  const [dueAt, setDueAt] = useState(item?.due_at ? item.due_at.slice(0, 10) : "");
  const [consequence, setConsequence] = useState(item?.consequence_if_not_decided || "");
  const [questionType, setQuestionType] = useState<"decision" | "data_clarification">(item?.question_type || "decision");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canSave = question.trim().length > 0;

  const save = async () => {
    if (!canSave) {
      setError("Опишите вопрос, требующий решения");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await execApi.saveDecisionRequest({
        id: item?.id,
        initiative_id: initiativeId,
        question: question.trim(),
        options: options.trim() || null,
        recommended_option: recommended.trim() || null,
        due_at: dueAt || null,
        consequence_if_not_decided: consequence.trim() || null,
        status: "open",
        question_type: questionType,
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
        className="bg-white border border-slate-200 rounded-xl w-full max-w-lg my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 p-5 border-b border-slate-200">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
              <Icon name="Gavel" size={17} className="text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {item ? "Вопрос на решение" : "Новый вопрос на решение"}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Появится в сводном списке «Мои решения» руководителя
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 transition-colors">
            <Icon name="X" size={18} />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
            <button
              type="button"
              onClick={() => setQuestionType("decision")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                questionType === "decision" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Управленческое решение
            </button>
            <button
              type="button"
              onClick={() => setQuestionType("data_clarification")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                questionType === "data_clarification" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Уточнение данных
            </button>
          </div>
          <p className="text-[11px] text-slate-400 -mt-2">
            {questionType === "decision"
              ? "Стратегический выбор по инициативе (например, продолжать/прекратить)."
              : "Техническая правка исходных данных (противоречивые даты, зависимости) — не решение по существу инициативы."}
          </p>

          <label className="block">
            <span className="text-xs text-slate-500 mb-1.5 block">
              Вопрос <span className="text-violet-600">*</span>
            </span>
            <textarea
              autoFocus
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Например: Подтвердить прекращение инициативы к 31.12.2026"
              rows={2}
              className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 text-sm placeholder:text-slate-400 focus:border-violet-600 outline-none transition-colors resize-y"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-500 mb-1.5 block">Варианты</span>
            <textarea
              value={options}
              onChange={(e) => setOptions(e.target.value)}
              rows={2}
              className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 text-sm placeholder:text-slate-400 focus:border-violet-600 outline-none transition-colors resize-y"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-500 mb-1.5 block">Рекомендуемый вариант</span>
            <input
              value={recommended}
              onChange={(e) => setRecommended(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 text-sm outline-none focus:border-violet-600 transition-colors"
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs text-slate-500 mb-1.5 block">Срок решения</span>
              <input
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 text-sm outline-none focus:border-violet-600 transition-colors"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs text-slate-500 mb-1.5 block">Последствия непринятия</span>
            <textarea
              value={consequence}
              onChange={(e) => setConsequence(e.target.value)}
              rows={2}
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