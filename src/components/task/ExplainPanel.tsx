import Icon from "@/components/ui/icon";

interface Props {
  selectedBlock: string | null;
  explanation: string;
  loadingExplain: boolean;
  refineInstruction: string;
  refining: boolean;
  onClose: () => void;
  onRefineInstructionChange: (v: string) => void;
  onRefine: () => void;
}

export default function ExplainPanel({
  selectedBlock,
  explanation,
  loadingExplain,
  refineInstruction,
  refining,
  onClose,
  onRefineInstructionChange,
  onRefine,
}: Props) {
  if (!selectedBlock) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[420px] bg-white border-l border-slate-200 shadow-2xl z-40 flex flex-col">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="Lightbulb" size={18} className="text-amber-500" />
          <h3 className="font-semibold text-slate-800">Рассуждение AI</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
        >
          <Icon name="X" size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Выбранный фрагмент</p>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700 max-h-32 overflow-y-auto whitespace-pre-wrap">
            {selectedBlock}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Откуда и почему</p>
          {loadingExplain ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-3 bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{explanation}</div>
          )}
        </div>

        <div className="border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Точечная правка</p>
          <p className="text-xs text-slate-500 mb-2">AI переработает ТОЛЬКО этот фрагмент, остальная работа не изменится</p>
          <textarea
            value={refineInstruction}
            onChange={(e) => onRefineInstructionChange(e.target.value)}
            placeholder="Например: сделай конкретнее с примерами из банковской практики"
            rows={3}
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none"
          />
        </div>
      </div>

      <div className="px-5 py-4 border-t border-slate-200 flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 border border-slate-300 rounded-lg py-2 text-sm font-medium hover:bg-slate-50"
        >
          Закрыть
        </button>
        <button
          onClick={onRefine}
          disabled={refining || !refineInstruction.trim()}
          className="flex-[2] flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
        >
          <Icon name="Sparkles" size={14} />
          {refining ? "Переписываю..." : "Переписать фрагмент"}
        </button>
      </div>
    </div>
  );
}
