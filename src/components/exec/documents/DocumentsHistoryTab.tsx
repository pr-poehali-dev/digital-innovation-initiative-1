import { useEffect, useState } from "react";
import { Empty, ErrorBox, Loading, fmtDate } from "@/components/exec/ExecUI";
import { execApi, AuditEntry } from "@/lib/execCabinetApi";

const ENTITY_LABEL: Record<string, string> = {
  doc_template: "Шаблон", doc_version: "Версия документа", package: "Пакет руководителя",
  meeting_agenda: "Повестка совещания", meeting_protocol: "Протокол совещания",
};
const DOC_ENTITIES = new Set(Object.keys(ENTITY_LABEL));

/** История значимых действий по управленческим документам — переиспользует
 * общий exec_audit_log, без отдельного журнала. Полный текст документа
 * в аудите не хранится — только entity/action/actor. */
export default function DocumentsHistoryTab() {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = () => {
    setLoading(true);
    setError("");
    execApi.auditLog("", 300).then((d) => setItems(d.items.filter((i) => DOC_ENTITIES.has(i.entity_type))))
      .catch((e) => setError(e.message)).finally(() => setLoading(false));
  };

  useEffect(reload, []);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!items.length) return <Empty text="Действий по документам пока не зафиксировано" icon="History" />;

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
