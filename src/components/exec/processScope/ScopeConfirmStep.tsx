import { useState } from "react";
import Icon from "@/components/ui/icon";
import { CompletenessResult, ProcessModelScope, ScopeDocument, ScopeUnit, processScopeApi } from "@/lib/execProcessScopeApi";

export default function ScopeConfirmStep({
  scope,
  units,
  documents,
  completeness,
  onConfirmed,
  onUnconfirmed,
  canConfirmRole,
}: {
  scope: ProcessModelScope;
  units: ScopeUnit[];
  documents: ScopeDocument[];
  completeness: CompletenessResult | null;
  onConfirmed: () => void;
  onUnconfirmed: () => void;
  canConfirmRole: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const included = units.filter((u) => u.decision === "included");
  const excluded = units.filter((u) => u.decision === "excluded");
  const isConfirmed = scope.model_status === "confirmed";
  const canConfirm = !!completeness?.can_confirm && canConfirmRole;

  const doConfirm = async () => {
    setBusy(true);
    setError("");
    try {
      await processScopeApi.confirmStage(scope.id);
      onConfirmed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doUnconfirm = async () => {
    setBusy(true);
    setError("");
    try {
      await processScopeApi.unconfirmStage(scope.id);
      onUnconfirmed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Подтверждение результата</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Подтверждение фиксирует паспорт границ. Это отдельное действие от публикации всей процессной модели в будущем.
        </p>
      </div>

      {isConfirmed && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 flex items-center gap-2">
          <Icon name="BadgeCheck" size={16} className="text-green-600" />
          <p className="text-xs text-green-800">
            Этап подтверждён {scope.confirmed_by ? `пользователем ${scope.confirmed_by}` : ""}{" "}
            {scope.confirmed_at ? new Date(scope.confirmed_at).toLocaleString("ru-RU") : ""}
          </p>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
        <div className="p-4">
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Название модели</p>
          <p className="text-sm text-slate-900 mt-1">{scope.title}</p>
        </div>
        <div className="p-4">
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Назначение</p>
          <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{scope.purpose || "—"}</p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-slate-100">
          <div className="p-4">
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Входит в границы</p>
            <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{scope.scope_in || "—"}</p>
          </div>
          <div className="p-4">
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Не входит</p>
            <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{scope.scope_out || "—"}</p>
          </div>
        </div>
        <div className="p-4">
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1.5">
            Подразделения ({included.length} включено{excluded.length ? `, ${excluded.length} исключено` : ""})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {included.map((u) => (
              <span key={u.id} className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700">{u.name}</span>
            ))}
          </div>
        </div>
        <div className="p-4">
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Документы</p>
          <p className="text-sm text-slate-700 mt-1">{documents.length} загружено / зарегистрировано</p>
        </div>
        <div className="p-4">
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Автор / изменено</p>
          <p className="text-sm text-slate-700 mt-1">
            {scope.created_by || "—"} · обновлено {new Date(scope.updated_at).toLocaleString("ru-RU")}
          </p>
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        {isConfirmed ? (
          canConfirmRole && (
            <button
              onClick={doUnconfirm}
              disabled={busy}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Снять подтверждение
            </button>
          )
        ) : (
          <button
            onClick={doConfirm}
            disabled={busy || !canConfirm}
            className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={!canConfirmRole ? "Недостаточно прав для подтверждения" : !completeness?.can_confirm ? "Сначала закройте пробелы на шаге «Проверка полноты»" : ""}
          >
            {busy ? "Подтверждаю…" : "Подтвердить этап"}
          </button>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex items-start gap-2">
        <Icon name="Lock" size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500">
          Следующий этап «Функции подразделений» запланирован, но пока недоступен — появится после
          завершения проверки удобства этого мастера.
        </p>
      </div>
    </div>
  );
}
