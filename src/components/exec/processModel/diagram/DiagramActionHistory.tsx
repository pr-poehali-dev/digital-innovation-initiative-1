import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { processModelApi, DiagramActionLogEntry } from "@/lib/execProcessModelApi";

const ENTITY_LABEL: Record<DiagramActionLogEntry["entity_type"], string> = {
  process_diagram_lane: "Дорожка",
  process_diagram_node: "Элемент",
  process_diagram_edge: "Связь",
};
const ACTION_LABEL: Record<string, string> = {
  create: "создан(а)",
  update: "изменён(а)",
  delete: "удалён(а)",
  undo: "отменено",
};

/**
 * Итерация 4, раздел 8: журнал последних действий текущего сеанса на этой
 * схеме + отмена последнего действия / восстановление удалённого элемента.
 * Это НЕ полноценный undo/redo — ограниченная история, честно показанная
 * как есть (последние действия, без разворачиваемого стека вперёд/назад).
 */
export default function DiagramActionHistory({
  diagramId,
  readOnly,
  onClose,
  onChanged,
}: {
  diagramId: number;
  readOnly: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<DiagramActionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [undoingId, setUndoingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    processModelApi.diagramActionLog(diagramId)
      .then((r) => setItems(r.items))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [diagramId]);

  const undo = async (logId?: number) => {
    setError("");
    setUndoingId(logId ?? -1);
    try {
      await processModelApi.diagramUndo(diagramId, logId);
      load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUndoingId(null);
    }
  };

  const lastUndoable = items.find((i) => !i.undone_at && i.action !== "undo");

  return (
    <div className="w-[280px] flex-shrink-0 border-l border-slate-200 bg-white h-full overflow-y-auto">
      <div className="flex items-center justify-between gap-2 p-3.5 border-b border-slate-200 sticky top-0 bg-white z-10">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="History" size={15} className="text-violet-600 flex-shrink-0" />
          <p className="text-sm font-semibold text-slate-900">Журнал действий</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><Icon name="X" size={16} /></button>
      </div>

      <div className="p-3.5 space-y-3">
        <p className="text-[11px] text-slate-400">
          Последние действия текущего сеанса на этой схеме. Не полноценный undo/redo — можно отменить
          последнее действие или конкретную запись, повтор действия не поддерживается.
        </p>

        {!readOnly && lastUndoable && (
          <button
            onClick={() => undo()}
            disabled={undoingId !== null}
            className="w-full text-xs px-3 py-2 rounded-lg border border-violet-300 text-violet-700 hover:bg-violet-50 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Icon name="Undo2" size={13} />
            Отменить последнее действие
          </button>
        )}

        {error && <div className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">{error}</div>}

        {loading ? (
          <p className="text-xs text-slate-400">Загрузка…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-slate-400">Действий пока не было</p>
        ) : (
          <div className="space-y-1.5">
            {items.map((it) => (
              <div key={it.id} className={`text-[11px] rounded-md px-2.5 py-2 border ${it.undone_at ? "border-slate-100 bg-slate-50 text-slate-400" : "border-slate-200 bg-white"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={it.undone_at ? "line-through" : "text-slate-700"}>
                    {ENTITY_LABEL[it.entity_type] || it.entity_type} #{it.entity_id} — {ACTION_LABEL[it.action] || it.action}
                  </span>
                  {!readOnly && !it.undone_at && it.action !== "undo" && (
                    <button
                      onClick={() => undo(it.id)}
                      disabled={undoingId !== null}
                      className="text-violet-600 hover:text-violet-800 flex-shrink-0 disabled:opacity-40"
                      title="Отменить это действие"
                    >
                      <Icon name="Undo2" size={12} />
                    </button>
                  )}
                </div>
                <div className="text-slate-400 mt-0.5">
                  {it.actor} · {new Date(it.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  {it.undone_at && <> · отменено {it.undone_by}</>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
