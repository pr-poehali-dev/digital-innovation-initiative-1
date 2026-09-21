import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { Loading, ErrorBox } from "@/components/exec/ExecUI";
import {
  processModelApi,
  ChecklistItem,
  PublicationChecklist,
  PublicationValidationError,
} from "@/lib/execProcessModelApi";

/**
 * Итерация 4, раздел 3: публикационный чек-лист процесса. Блокирующие ошибки
 * (красные) не пропускают до кнопки «Опубликовать» — она блокируется на
 * фронте, а сервер всё равно проверит их же ещё раз при самом переходе
 * статуса (422 PublicationValidationError). Предупреждения (жёлтые) можно
 * принять только явным решением уполномоченного пользователя с обязательным
 * комментарием-обоснованием — «Игнорировать всё» намеренно нет.
 */
function refLabel(item: ChecklistItem): string | null {
  if (!item.ref_type) return null;
  const typeLabel: Record<string, string> = {
    process_node: "процесс",
    passport: "паспорт",
    diagram: "схема",
    diagram_node: "элемент схемы",
    process_participant: "участник",
    document: "документ",
    risk: "риск",
    control: "контроль",
    metric: "показатель",
    issue: "проблема",
    improvement: "улучшение",
  };
  const label = typeLabel[item.ref_type] || item.ref_type;
  return item.ref_id ? `${label} #${item.ref_id}` : label;
}

function WarningAcceptForm({
  item,
  entityId,
  onDone,
}: {
  item: ChecklistItem;
  entityId: number;
  onDone: () => void;
}) {
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!comment.trim()) {
      setError("Комментарий обязателен — обоснуйте, почему предупреждение можно принять");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await processModelApi.saveWarningDecision({
        entity_type: "process_node",
        entity_id: entityId,
        warning_code: item.code,
        warning_ref_id: item.ref_id,
        comment: comment.trim(),
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-amber-300 bg-white p-2.5">
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        placeholder="Обоснование принятия предупреждения (обязательно)"
        className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 text-xs outline-none focus:border-amber-500"
      />
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={submit} disabled={saving || !comment.trim()}
          className="text-xs px-2.5 py-1 rounded-md bg-amber-600 text-white disabled:opacity-40 hover:bg-amber-700">
          {saving ? "Сохраняю…" : "Принять предупреждение"}
        </button>
      </div>
    </div>
  );
}

export default function PublicationChecklistPanel({
  processNodeId,
  canConfirm,
  onPublish,
  publishLabel = "Опубликовать",
  externalError,
  onExternalErrorHandled,
}: {
  processNodeId: number;
  canConfirm: boolean;
  onPublish?: () => Promise<void> | void;
  publishLabel?: string;
  // Позволяет показать ошибку 422, пойманную снаружи (например, если статус
  // всё равно попытались перевести в обход этой панели), в том же виде.
  externalError?: PublicationValidationError | null;
  onExternalErrorHandled?: () => void;
}) {
  const [checklist, setChecklist] = useState<PublicationChecklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acceptingCode, setAcceptingCode] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<PublicationValidationError | null>(null);

  const load = () => {
    setLoading(true);
    setError("");
    processModelApi.publicationChecklist(processNodeId)
      .then(setChecklist)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [processNodeId]);

  useEffect(() => {
    if (externalError) setPublishError(externalError);
  }, [externalError]);

  const itemKey = (item: ChecklistItem) => `${item.code}:${item.ref_id ?? ""}`;

  const doPublish = async () => {
    if (!onPublish || !checklist || !checklist.can_publish) return;
    setPublishing(true);
    setPublishError(null);
    try {
      await onPublish();
    } catch (e) {
      if (e instanceof PublicationValidationError) setPublishError(e);
      else setError((e as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!checklist) return null;

  const shownError = publishError;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Icon name="ClipboardCheck" size={16} className="text-violet-600" />
          <p className="text-sm font-semibold text-slate-900">Публикационный чек-лист</p>
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
            checklist.can_publish ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"
          }`}>
            {checklist.can_publish ? "Готово к публикации" : "Не готово"}
          </span>
        </div>

        {checklist.blocking_errors.length === 0 && checklist.warnings.length === 0 && (
          <p className="text-xs text-slate-400">Замечаний нет — все проверки пройдены.</p>
        )}

        {checklist.blocking_errors.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-red-700 uppercase tracking-wide">
              Блокирующие ошибки ({checklist.blocking_errors.length})
            </p>
            <div className="space-y-1.5">
              {checklist.blocking_errors.map((item, i) => (
                <div key={`${itemKey(item)}-${i}`} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <div className="flex items-start gap-2">
                    <Icon name="XCircle" size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs text-red-800">{item.message}</p>
                      {refLabel(item) && (
                        <p className="text-[11px] text-red-500 mt-0.5">где исправить: {refLabel(item)}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {checklist.warnings.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">
              Предупреждения ({checklist.warnings.length})
            </p>
            <div className="space-y-1.5">
              {checklist.warnings.map((item, i) => {
                const key = itemKey(item);
                const stillRequired = checklist.overrides_required.some((o) => itemKey(o) === key);
                return (
                  <div key={`${key}-${i}`} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <div className="flex items-start gap-2 justify-between">
                      <div className="flex items-start gap-2 min-w-0">
                        <Icon name="AlertTriangle" size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-xs text-amber-800">{item.message}</p>
                          {refLabel(item) && (
                            <p className="text-[11px] text-amber-600 mt-0.5">где исправить: {refLabel(item)}</p>
                          )}
                          {!stillRequired && (
                            <p className="text-[11px] text-green-700 mt-1 flex items-center gap-1">
                              <Icon name="CheckCircle2" size={11} /> Принято уполномоченным
                            </p>
                          )}
                        </div>
                      </div>
                      {stillRequired && canConfirm && acceptingCode !== key && (
                        <button onClick={() => setAcceptingCode(key)}
                          className="text-[11px] px-2 py-1 rounded-md border border-amber-400 text-amber-800 hover:bg-amber-100 flex-shrink-0">
                          Принять предупреждение
                        </button>
                      )}
                    </div>
                    {stillRequired && acceptingCode === key && (
                      <WarningAcceptForm
                        item={item}
                        entityId={processNodeId}
                        onDone={() => { setAcceptingCode(null); load(); }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {checklist.overrides_required.length > 0 && (
          <p className="text-[11px] text-slate-500">
            Публикация не блокируется предупреждениями, но {checklist.overrides_required.length} из них ещё требуют
            явного решения уполномоченного пользователя (сейчас это не мешает публикации, только фиксируется).
          </p>
        )}
      </div>

      {shownError && (
        <div className="rounded-xl border border-red-300 bg-white overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border-b border-red-200">
            <Icon name="ShieldAlert" size={16} className="text-red-600" />
            <p className="text-sm font-semibold text-red-800">Публикация отклонена сервером</p>
          </div>
          <div className="p-4 space-y-2">
            <p className="text-xs text-slate-600">
              Сервер повторно проверил чек-лист непосредственно при публикации и нашёл нерешённые пункты:
            </p>
            {shownError.blockingErrors.map((item, i) => (
              <div key={i} className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-md px-2.5 py-1.5">
                {item.message}{refLabel(item) && <span className="text-red-500"> — {refLabel(item)}</span>}
              </div>
            ))}
            <div className="flex justify-end">
              <button
                onClick={() => { setPublishError(null); onExternalErrorHandled?.(); load(); }}
                className="text-xs px-2.5 py-1 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {onPublish && (
        <button
          onClick={doPublish}
          disabled={!checklist.can_publish || publishing}
          title={!checklist.can_publish ? "Устраните блокирующие ошибки, чтобы опубликовать" : undefined}
          className="w-full px-3 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          {publishing && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
          <Icon name="Rocket" size={14} />
          {publishLabel}
        </button>
      )}
    </div>
  );
}
