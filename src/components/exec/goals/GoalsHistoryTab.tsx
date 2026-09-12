import { useEffect, useState } from "react";
import { Empty, ErrorBox, Loading, fmtDate } from "@/components/exec/ExecUI";
import { execApi, AuditEntry } from "@/lib/execCabinetApi";

const ENTITY_LABEL: Record<string, string> = {
  goal: "Цель", indicator: "Показатель", indicator_methodology: "Методика",
  indicator_value: "Значение показателя", goal_indicator: "Связь цели с показателем",
  effect: "Эффект", goals_report_snapshot: "Снимок отчёта по целям",
};
const GOALS_ENTITIES = new Set(Object.keys(ENTITY_LABEL));

/** История значимых действий по целям/показателям — переиспользует общий
 * exec_audit_log (та же таблица, что и остальной кабинет), без отдельного
 * журнала. Чувствительные тексты не хранятся — только entity/action/actor. */
export default function GoalsHistoryTab() {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = () => {
    setLoading(true);
    setError("");
    execApi.auditLog("", 300).then((d) => setItems(d.items.filter((i) => GOALS_ENTITIES.has(i.entity_type))))
      .catch((e) => setError(e.message)).finally(() => setLoading(false));
  };

  useEffect(reload, []);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!items.length) return <Empty text="Действий по целям и показателям пока не зафиксировано" icon="History" />;

  return (
    <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
      {items.map((it) => (
        <div key={it.id} className="p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-900">
              {ENTITY_LABEL[it.entity_type] || it.entity_type} #{it.entity_id} — {it.action}
            </span>
            <span className="text-xs text-slate-400">{fmtDate(it.created_at)}</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{it.actor}</p>
        </div>
      ))}
    </div>
  );
}
