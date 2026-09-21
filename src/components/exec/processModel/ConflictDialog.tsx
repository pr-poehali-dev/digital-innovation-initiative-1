import Icon from "@/components/ui/icon";
import { ConflictError } from "@/lib/execProcessModelApi";

/**
 * Итерация 4, раздел 1: единый диалог конфликта конкурентного редактирования.
 * Показывается, когда backend отклонил устаревшее сохранение (HTTP 409,
 * ConflictError). НЕ перезаписывает молча — только три явных варианта:
 * перечитать актуальную версию (теряя черновик формы), закрыть диалог и
 * вручную сравнить/повторить изменения, либо отменить.
 */
export default function ConflictDialog({
  error,
  onReload,
  onDismiss,
}: {
  error: ConflictError;
  onReload: () => void;
  onDismiss: () => void;
}) {
  const when = error.currentUpdatedAt
    ? new Date(error.currentUpdatedAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border-b border-amber-200">
          <Icon name="AlertTriangle" size={18} className="text-amber-600 flex-shrink-0" />
          <h3 className="text-sm font-semibold text-amber-800">Конфликт редактирования</h3>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-slate-700">
            Пока вы редактировали, запись уже изменил{" "}
            <span className="font-medium">{error.changedBy || "другой пользователь"}</span>
            {when && <> — {when}</>}. Ваши локальные изменения <span className="font-medium">не сохранены</span>.
          </p>
          <p className="text-xs text-slate-500">
            Перечитайте актуальную версию, сравните с вашими правками и повторите нужные изменения вручную —
            система не перезаписывает чужую работу молча.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-100 bg-slate-50">
          <button
            onClick={onDismiss}
            className="text-xs px-3 py-1.5 rounded-md text-slate-600 hover:bg-slate-100"
          >
            Закрыть и сравнить вручную
          </button>
          <button
            onClick={onReload}
            className="text-xs px-3 py-1.5 rounded-md bg-amber-600 text-white hover:bg-amber-700 flex items-center gap-1.5"
          >
            <Icon name="RefreshCw" size={12} />
            Перечитать актуальную версию
          </button>
        </div>
      </div>
    </div>
  );
}
