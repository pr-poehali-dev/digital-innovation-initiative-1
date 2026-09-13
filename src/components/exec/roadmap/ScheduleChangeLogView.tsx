import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading, fmtDate } from "@/components/exec/ExecUI";
import { execRoadmapApi, ScheduleChangeLogEntry } from "@/lib/execRoadmapApi";

const KIND_ICON: Record<string, string> = { project: "Folder", stage: "FolderTree", task: "ListTodo", milestone: "Diamond" };
const KIND_LABEL: Record<string, string> = { project: "Проект", stage: "Этап", task: "Задача", milestone: "Веха" };
const LAYER_LABEL: Record<string, string> = { plan: "План", forecast: "Прогноз", fact: "Факт" };
const LAYER_CLS: Record<string, string> = {
  plan: "bg-violet-100 text-violet-700", forecast: "bg-amber-100 text-amber-700", fact: "bg-emerald-100 text-emerald-700",
};

/** Специализированная история изменений расписания проекта — отдельная от
 * общего журнала действий (вкладок "История" в других разделах). Каждая
 * строка — одно изменение одной даты одного объекта: слой (план/прогноз/
 * факт), старое и новое значение, величина сдвига, причина, автор и
 * признак влияния на зависимости. Секреты и полные комментарии сюда не
 * попадают — только сжатая причина. */
export default function ScheduleChangeLogView({ projectId }: { projectId: number }) {
  const [items, setItems] = useState<ScheduleChangeLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = () => {
    setLoading(true);
    setError("");
    execRoadmapApi.scheduleChangeLog(projectId).then((r) => setItems(r.items)).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };

  useEffect(reload, [projectId]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!items.length) return <Empty text="Изменений расписания пока не зафиксировано" icon="History" />;

  return (
    <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
      {items.map((it) => (
        <div key={it.id} className="p-3 flex items-start gap-3">
          <Icon name={KIND_ICON[it.object_kind]} size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-slate-800">{it.object_title || `#${it.object_id}`}</span>
              <span className="text-[9px] px-1 rounded bg-slate-100 text-slate-500">{KIND_LABEL[it.object_kind]}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded ${LAYER_CLS[it.layer]}`}>{LAYER_LABEL[it.layer]}</span>
              {it.criticality_changed && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 flex items-center gap-0.5">
                  <Icon name="Zap" size={8} /> критичность изменилась
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 mt-1">
              {fmtDate(it.old_value)} → <span className="font-medium text-slate-800">{fmtDate(it.new_value)}</span>
              {it.shift_days != null && it.shift_days !== 0 && (
                <span className={`ml-1.5 font-medium ${it.shift_days > 0 ? "text-red-600" : "text-emerald-600"}`}>
                  ({it.shift_days > 0 ? "+" : ""}{it.shift_days} дн.)
                </span>
              )}
            </p>
            {it.reason && <p className="text-[11px] text-slate-500 mt-1 italic">«{it.reason}»</p>}
            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] text-slate-400">
              <span>{it.actor}</span>
              <span>·</span>
              <span>{fmtDate(it.created_at)}</span>
              {it.affected_dependency_count > 0 && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-0.5"><Icon name="Link2" size={9} /> затронуто связей: {it.affected_dependency_count}</span>
                </>
              )}
              {it.project_end_shift_days != null && it.project_end_shift_days !== 0 && (
                <>
                  <span>·</span>
                  <span className="text-amber-600">срок проекта сместился на {it.project_end_shift_days} дн.</span>
                </>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
