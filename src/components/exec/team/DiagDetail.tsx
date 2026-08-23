import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";
import { Modal } from "@/components/exec/ExecForm";
import { fmtDate } from "@/components/exec/ExecUI";
import {
  DIAG_CODE,
  DiagItem,
  OBJECT_KIND,
  StepInfo,
  peopleApi,
} from "@/lib/execPeopleApi";

/** Показывает объекты, из которых собран показатель диагностики */
export default function DiagDetail({
  code,
  items,
  onClose,
}: {
  code: string;
  items?: DiagItem[];
  onClose: () => void;
}) {
  const nav = useNavigate();
  const [steps, setSteps] = useState<StepInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const meta = DIAG_CODE[code] || { title: code, hint: "" };
  const isStepCode = code.startsWith("S");

  useEffect(() => {
    if (!isStepCode) return;
    setLoading(true);
    peopleApi
      .diagDetail(code)
      .then(setSteps)
      .catch(() => setSteps([]))
      .finally(() => setLoading(false));
  }, [code, isStepCode]);

  const reason = (s: StepInfo) => {
    if (code === "S01") return `${s.object_kind_title} без роли A`;
    if (code === "S02") return "Дата завершения не указана";
    if (code === "S03") return "У задачи не задана трудоёмкость";
    if (code === "S04")
      return `Сумма по людям ${s.assigned_hours} ч, трудоёмкость ${s.estimate_hours} ч`;
    return "";
  };

  const total = isStepCode ? (steps?.length ?? 0) : (items?.length ?? 0);

  return (
    <Modal
      title={meta.title}
      subtitle={`${meta.hint} · найдено: ${total}`}
      onClose={onClose}
      onSave={onClose}
      saveLabel="Закрыть"
      wide
    >
      {loading ? (
        <p className="py-6 text-center text-sm text-slate-400">Собираю список…</p>
      ) : isStepCode ? (
        !steps?.length ? (
          <p className="py-6 text-center text-sm text-slate-400">Ничего не найдено</p>
        ) : (
          <>
            <KindSummary steps={steps} />
            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
              {steps.map((s) => (
                <button
                  key={s.id}
                  onClick={() => nav(`/cabinet/exec/planner${s.plan_id ? `?plan=${s.plan_id}` : ""}`)}
                  className="w-full text-left rounded-lg border border-slate-200 p-2.5 hover:border-violet-300 transition-colors"
                >
                  <div className="flex flex-wrap items-start gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border flex-shrink-0 ${
                        OBJECT_KIND[s.object_kind].cls
                      }`}
                    >
                      <Icon name={OBJECT_KIND[s.object_kind].icon} size={9} />
                      {s.object_kind_title}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-slate-900">{s.title}</span>
                      <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-1 text-[11px] text-slate-500">
                        {s.parent_title && <span>в «{s.parent_title}»</span>}
                        {s.plan_title && <span>· {s.plan_title}</span>}
                        {s.initiative_title && (
                          <span className="text-violet-600">· {s.initiative_title}</span>
                        )}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-0.5 text-[11px]">
                        <span className={s.has_owner ? "text-slate-500" : "text-red-600"}>
                          {s.owner_name || "ответственный не назначен"}
                        </span>
                        <span className={s.due_date ? "text-slate-500" : "text-amber-600"}>
                          · {s.due_date ? `срок ${fmtDate(s.due_date)}` : "срок не задан"}
                        </span>
                        <span className="text-slate-500">
                          ·{" "}
                          {s.estimate_hours != null
                            ? `${s.estimate_hours} ч`
                            : OBJECT_KIND[s.object_kind].needsHours
                              ? "часы не заданы"
                              : "часы не требуются"}
                        </span>
                      </span>
                      <span className="block mt-1 text-[11px] text-amber-700">
                        {reason(s)}
                      </span>
                    </span>
                    <Icon name="ChevronRight" size={14} className="text-slate-300 mt-1" />
                  </div>
                </button>
              ))}
            </div>
          </>
        )
      ) : !items?.length ? (
        <p className="py-6 text-center text-sm text-slate-400">Ничего не найдено</p>
      ) : (
        <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
          {items.map((d, i) => (
            <button
              key={i}
              onClick={() => {
                if (d.entity === "person" && d.entity_id) nav(`/cabinet/exec/team/${d.entity_id}`);
                else if (d.entity === "function") nav("/cabinet/exec/center");
              }}
              className="w-full text-left rounded-lg border border-slate-200 p-2.5 hover:border-violet-300 transition-colors"
            >
              <p className="text-sm text-slate-900">{d.title}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{d.message}</p>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

function KindSummary({ steps }: { steps: StepInfo[] }) {
  const counts = steps.reduce<Record<string, number>>((a, s) => {
    a[s.object_kind] = (a[s.object_kind] || 0) + 1;
    return a;
  }, {});
  const keys = Object.keys(counts);
  if (keys.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-2 pb-2 mb-1 border-b border-slate-100">
      {keys.map((k) => (
        <span
          key={k}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border ${
            OBJECT_KIND[k as keyof typeof OBJECT_KIND].cls
          }`}
        >
          <Icon name={OBJECT_KIND[k as keyof typeof OBJECT_KIND].icon} size={10} />
          {OBJECT_KIND[k as keyof typeof OBJECT_KIND].title}: {counts[k]}
        </span>
      ))}
    </div>
  );
}
