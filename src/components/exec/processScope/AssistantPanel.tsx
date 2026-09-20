import Icon from "@/components/ui/icon";
import { WizardStepGuide } from "@/config/processScopeWizardGuide";
import { CompletenessResult } from "@/lib/execProcessScopeApi";

/**
 * Правая колонка мастера — методический помощник. НЕ генеративный: весь текст
 * зашит в конфиг (processScopeWizardGuide.ts), проверки — детерминированный
 * SQL-агрегат с backend (completeness). Никаких обращений к YandexGPT.
 */
export default function AssistantPanel({
  guide,
  completeness,
  checking,
  onCheck,
  onNext,
  canGoNext,
  nextLabel,
}: {
  guide: WizardStepGuide;
  completeness: CompletenessResult | null;
  checking: boolean;
  onCheck: () => void;
  onNext?: () => void;
  canGoNext?: boolean;
  nextLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 space-y-4 sticky top-4 h-fit">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
          <Icon name="Compass" size={14} className="text-violet-600" />
        </div>
        <p className="text-sm font-semibold text-slate-900">Помощник шага</p>
      </div>

      <div>
        <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">Зачем этот шаг</p>
        <p className="text-xs text-slate-600 leading-relaxed">{guide.why}</p>
      </div>

      <div>
        <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1.5">Что сделать сейчас</p>
        <ul className="space-y-1.5">
          {guide.whatToDoNow.map((t, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700">
              <Icon name="ArrowRight" size={12} className="text-violet-500 flex-shrink-0 mt-0.5" />
              <span className="leading-snug">{t}</span>
            </li>
          ))}
        </ul>
      </div>

      {guide.example && (
        <div className="rounded-lg bg-white border border-slate-200 p-2.5">
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1">Пример</p>
          <p className="text-xs text-slate-600 leading-relaxed italic">{guide.example}</p>
        </div>
      )}

      {completeness && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Что уже готово</p>
          {completeness.ready.length === 0 && (
            <p className="text-xs text-slate-400">Пока ничего не отмечено готовым</p>
          )}
          {completeness.ready.map((it) => (
            <div key={it.code} className="flex items-start gap-1.5 text-xs text-green-700">
              <Icon name="CheckCircle2" size={13} className="flex-shrink-0 mt-0.5" />
              <span className="leading-snug">{it.label}</span>
            </div>
          ))}
          {completeness.needs_attention.length > 0 && (
            <>
              <p className="text-[11px] font-medium text-amber-600 uppercase tracking-wide pt-1.5">
                Чего не хватает
              </p>
              {completeness.needs_attention.map((it) => (
                <div key={it.code} className="flex items-start gap-1.5 text-xs text-amber-700">
                  <Icon name="AlertTriangle" size={13} className="flex-shrink-0 mt-0.5" />
                  <div className="leading-snug">
                    <p>{it.label}</p>
                    {it.detail && <p className="text-[11px] text-amber-600/80 mt-0.5">{it.detail}</p>}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 pt-1">
        <button
          onClick={onCheck}
          disabled={checking}
          className="w-full px-3 py-2 rounded-lg border border-violet-300 bg-white text-violet-700 text-xs font-medium hover:bg-violet-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {checking ? (
            <span className="w-3 h-3 border border-violet-300 border-t-violet-600 rounded-full animate-spin" />
          ) : (
            <Icon name="ListChecks" size={13} />
          )}
          Проверить
        </button>
        {onNext && (
          <button
            onClick={onNext}
            disabled={!canGoNext}
            className="w-full px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            {nextLabel || "Следующий шаг"}
            <Icon name="ArrowRight" size={13} />
          </button>
        )}
      </div>

      {guide.tip && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
          <Icon name="Lightbulb" size={13} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800 leading-relaxed">{guide.tip}</p>
        </div>
      )}
    </div>
  );
}
