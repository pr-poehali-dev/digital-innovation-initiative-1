import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { Loading, ErrorBox, Empty } from "@/components/exec/ExecUI";
import { processModelApi, DiagramCompareResult, DiagramDiffEntry } from "@/lib/execProcessModelApi";

const DIFF_COLOR: Record<string, string> = {
  added: "border-green-200 bg-green-50 text-green-800",
  removed: "border-red-200 bg-red-50 text-red-800 line-through",
  changed: "border-amber-200 bg-amber-50 text-amber-800",
  unchanged: "border-slate-200 bg-slate-50 text-slate-500",
};
const DIFF_LABEL: Record<string, string> = { added: "Добавлено", removed: "Удалено", changed: "Изменено", unchanged: "Без изменений" };

function DiffGroupList({ title, group }: { title: string; group: { added: DiagramDiffEntry[]; removed: DiagramDiffEntry[]; changed: DiagramDiffEntry[]; unchanged: DiagramDiffEntry[] } }) {
  const kinds: (keyof typeof group)[] = ["added", "removed", "changed", "unchanged"];
  const total = kinds.reduce((s, k) => s + group[k].length, 0);
  if (total === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">{title}</p>
      <div className="space-y-1.5">
        {kinds.filter((k) => k !== "unchanged").map((k) =>
          group[k].map((e, i) => (
            <div key={`${k}-${i}`} className={`text-xs rounded-md border px-2.5 py-1.5 flex items-center justify-between gap-2 ${DIFF_COLOR[k]}`}>
              <span>{e.label || e.title || `#${e.id ?? e.to_be_id ?? e.as_is_id}`}</span>
              <span className="text-[10px] opacity-70 flex-shrink-0">
                {DIFF_LABEL[k]}
                {e.changed_fields && e.changed_fields.length > 0 ? `: ${e.changed_fields.join(", ")}` : ""}
              </span>
            </div>
          ))
        )}
        {group.unchanged.length > 0 && (
          <details className="text-[11px] text-slate-400">
            <summary className="cursor-pointer">Без изменений ({group.unchanged.length})</summary>
            <div className="mt-1.5 space-y-1">
              {group.unchanged.map((e, i) => (
                <div key={i} className="px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50">{e.label || e.title}</div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

export default function DiagramCompareView({
  asIsId,
  toBeId,
  onClose,
}: {
  asIsId: number;
  toBeId: number;
  onClose: () => void;
}) {
  const [result, setResult] = useState<DiagramCompareResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"summary" | "visual">("summary");

  const load = () => {
    setLoading(true);
    setError("");
    processModelApi.compareDiagrams(asIsId, toBeId).then(setResult).catch((e) => setError((e as Error).message)).finally(() => setLoading(false));
  };
  useEffect(load, [asIsId, toBeId]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><Icon name="ArrowLeft" size={15} /></button>
          <p className="text-sm font-semibold text-slate-900">Сравнение AS-IS и TO-BE</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setMode("summary")}
            className={`text-xs px-2.5 py-1 rounded-md border ${mode === "summary" ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-500"}`}>
            Сводный список
          </button>
          <button onClick={() => setMode("visual")}
            className={`text-xs px-2.5 py-1 rounded-md border ${mode === "visual" ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-500"}`}>
            Визуальное сравнение
          </button>
        </div>
      </div>

      <div className="p-4">
        {loading && <Loading />}
        {error && <ErrorBox message={error} onRetry={load} />}
        {result && mode === "summary" && (
          <div className="space-y-5">
            <div className="flex gap-2 flex-wrap">
              <span className="text-xs px-2.5 py-1 rounded-lg border border-green-200 bg-green-50 text-green-700">Добавлено: {result.summary.added}</span>
              <span className="text-xs px-2.5 py-1 rounded-lg border border-red-200 bg-red-50 text-red-700">Удалено: {result.summary.removed}</span>
              <span className="text-xs px-2.5 py-1 rounded-lg border border-amber-200 bg-amber-50 text-amber-700">Изменено: {result.summary.changed}</span>
            </div>
            <DiffGroupList title="Узлы схемы" group={result.nodes} />
            <DiffGroupList title="Связи" group={result.edges} />
            <DiffGroupList title="Дорожки" group={result.lanes} />
            {(result.risks.removed_on_operations.length > 0 || result.risks.still_present_on_operations.length > 0) && (
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Риски на операциях</p>
                {result.risks.removed_on_operations.length > 0 && (
                  <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-2.5 py-1.5 mb-1.5">
                    Риск устранён на {result.risks.removed_on_operations.length} операции(ях) — в TO-BE больше не привязан
                  </p>
                )}
                {result.risks.still_present_on_operations.length > 0 && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                    Риск сохраняется на {result.risks.still_present_on_operations.length} операции(ях) в TO-BE
                  </p>
                )}
              </div>
            )}
            {result.summary.added === 0 && result.summary.removed === 0 && result.summary.changed === 0 && (
              <Empty text="Изменений между AS-IS и TO-BE пока нет" icon="GitCompare" />
            )}
          </div>
        )}
        {result && mode === "visual" && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Зелёный — добавлено, красный — удалено, жёлтый — изменено, серый — без изменений.
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {result.nodes.added.map((n, i) => (
                <div key={`a${i}`} className="rounded-lg border-2 border-green-400 bg-green-50 px-3 py-2 text-xs text-green-800">{n.label}</div>
              ))}
              {result.nodes.removed.map((n, i) => (
                <div key={`r${i}`} className="rounded-lg border-2 border-red-400 bg-red-50 px-3 py-2 text-xs text-red-800 line-through">{n.label}</div>
              ))}
              {result.nodes.changed.map((n, i) => (
                <div key={`c${i}`} className="rounded-lg border-2 border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {n.label}
                  <span className="block text-[10px] opacity-70">{n.changed_fields?.join(", ")}</span>
                </div>
              ))}
              {result.nodes.unchanged.map((n, i) => (
                <div key={`u${i}`} className="rounded-lg border-2 border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">{n.label}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
