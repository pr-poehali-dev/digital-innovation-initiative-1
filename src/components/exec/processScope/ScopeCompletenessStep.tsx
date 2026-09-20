import Icon from "@/components/ui/icon";
import { CompletenessResult } from "@/lib/execProcessScopeApi";

export default function ScopeCompletenessStep({
  completeness,
  loading,
  onRefresh,
}: {
  completeness: CompletenessResult | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Проверка полноты</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Детерминированные проверки — без участия ИИ. Переход дальше не блокирует, но нужен перед подтверждением этапа.
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-slate-400 transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading ? (
            <span className="w-3 h-3 border border-slate-300 border-t-violet-600 rounded-full animate-spin" />
          ) : (
            <Icon name="RefreshCw" size={12} />
          )}
          Обновить
        </button>
      </div>

      {!completeness ? (
        <p className="text-sm text-slate-400 py-6 text-center">Нажмите «Обновить», чтобы выполнить проверку</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-green-200 bg-green-50/50 p-3">
            <p className="text-xs font-semibold text-green-800 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Icon name="CheckCircle2" size={14} />
              Готово ({completeness.ready.length})
            </p>
            {completeness.ready.length === 0 && <p className="text-xs text-slate-400">Пока ничего</p>}
            <div className="space-y-2">
              {completeness.ready.map((it) => (
                <div key={it.code} className="text-xs text-green-800 leading-snug">{it.label}</div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
            <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Icon name="AlertTriangle" size={14} />
              Требует уточнения ({completeness.needs_attention.length})
            </p>
            {completeness.needs_attention.length === 0 && (
              <p className="text-xs text-slate-400">Замечаний нет</p>
            )}
            <div className="space-y-2">
              {completeness.needs_attention.map((it) => (
                <div key={it.code} className="text-xs text-amber-800 leading-snug">
                  <p className="font-medium">{it.label}</p>
                  {it.detail && <p className="text-amber-700/80 mt-0.5">{it.detail}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {completeness && (
        <div className={`rounded-lg border p-3 text-xs ${
          completeness.can_confirm
            ? "border-green-200 bg-green-50 text-green-800"
            : "border-slate-200 bg-slate-50 text-slate-600"
        }`}>
          {completeness.can_confirm
            ? "Все обязательные условия выполнены — можно переходить к подтверждению этапа."
            : "Есть незакрытые обязательные пункты — подтверждение этапа пока недоступно."}
        </div>
      )}
    </div>
  );
}
