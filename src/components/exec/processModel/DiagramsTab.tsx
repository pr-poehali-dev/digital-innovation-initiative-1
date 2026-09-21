import { useState } from "react";
import Icon from "@/components/ui/icon";
import { Empty } from "@/components/exec/ExecUI";
import { processModelApi, ProcessDetail, STATUS_STYLE, Refs, PersonRef } from "@/lib/execProcessModelApi";
import DiagramEditor from "./diagram/DiagramEditor";
import DiagramCompareView from "./DiagramCompareView";
import ImprovementsPanel from "./ImprovementsPanel";

const VARIANT_LABEL: Record<string, string> = { as_is: "AS-IS (как есть)", to_be: "TO-BE (как должно быть)" };

type View = { kind: "editor"; diagramId: number } | { kind: "compare" } | { kind: "improvements" } | null;

/** Список схем процесса (AS-IS/TO-BE) с переходом в графический редактор,
 * созданием TO-BE копированием AS-IS, сравнением моделей и улучшениями. */
export default function DiagramsTab({
  processNodeId,
  diagrams,
  canEdit,
  canConfirm,
  refs,
  people,
  onChanged,
}: {
  processNodeId: number;
  diagrams: ProcessDetail["diagrams"];
  canEdit: boolean;
  canConfirm: boolean;
  refs?: Refs | null;
  people?: PersonRef[];
  onChanged: () => void;
}) {
  const [view, setView] = useState<View>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const asIs = diagrams.find((d) => d.variant === "as_is");
  const toBe = diagrams.find((d) => d.variant === "to_be");

  const createDiagram = async (variant: "as_is" | "to_be") => {
    setCreating(true);
    setError("");
    try {
      const res = await processModelApi.diagramGetOrCreate(processNodeId, variant);
      onChanged();
      setView({ kind: "editor", diagramId: res.id });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const createToBeFromAsIs = async () => {
    if (!asIs) return;
    setCreating(true);
    setError("");
    try {
      const res = await processModelApi.createToBeFromAsIs(asIs.id);
      if (!res.created) {
        setError("TO-BE для этого процесса уже создана — открываю существующую схему.");
      }
      onChanged();
      setView({ kind: "editor", diagramId: res.id });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  if (view?.kind === "editor") {
    return (
      <DiagramEditor
        diagramId={view.diagramId}
        canEdit={canEdit}
        canConfirm={canConfirm}
        fullscreen={fullscreen}
        onToggleFullscreen={() => setFullscreen((v) => !v)}
        onClose={() => { setView(null); setFullscreen(false); onChanged(); }}
      />
    );
  }

  if (view?.kind === "compare" && asIs && toBe) {
    return <DiagramCompareView asIsId={asIs.id} toBeId={toBe.id} onClose={() => setView(null)} />;
  }

  if (view?.kind === "improvements" && toBe) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => setView(null)} className="text-slate-400 hover:text-slate-700"><Icon name="ArrowLeft" size={15} /></button>
          <p className="text-sm font-semibold text-slate-900">Улучшения TO-BE</p>
        </div>
        <ImprovementsPanel toBeDiagramId={toBe.id} processNodeId={processNodeId} refs={refs || null} people={people || []} canEdit={canEdit} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Схема — структурированная модель узлов, связей и дорожек, совместимая с BPMN-подобной логикой.
        Не картинка: каждый элемент хранит тип и связи с процессными сущностями.
      </p>
      {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}

      <div className="grid sm:grid-cols-2 gap-3">
        {(["as_is", "to_be"] as const).map((variant) => {
          const d = variant === "as_is" ? asIs : toBe;
          return (
            <div key={variant} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon name="GitBranch" size={15} className="text-violet-600" />
                <p className="text-sm font-medium text-slate-900">{VARIANT_LABEL[variant]}</p>
                {variant === "to_be" && d?.model_status && (
                  <span className="text-[10px] text-slate-400">{d.base_diagram_id ? "скопирован из AS-IS" : ""}</span>
                )}
              </div>
              {d ? (
                <div className="space-y-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLE[d.model_status].cls}`}>
                    {STATUS_STYLE[d.model_status].title}
                  </span>
                  <p className="text-xs text-slate-400">версия {d.version}</p>
                  <button onClick={() => setView({ kind: "editor", diagramId: d.id })}
                    className="w-full px-3 py-2 rounded-lg bg-violet-600 text-white text-xs hover:bg-violet-700 flex items-center justify-center gap-1.5">
                    <Icon name="PenLine" size={12} /> Открыть схему
                  </button>
                  {variant === "to_be" && (
                    <button onClick={() => setView({ kind: "improvements" })}
                      className="w-full px-3 py-1.5 rounded-lg border border-violet-300 text-violet-700 text-xs hover:bg-violet-50 flex items-center justify-center gap-1.5">
                      <Icon name="Sparkles" size={12} /> Улучшения и эффект
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Empty text="Схема ещё не создана" icon="GitBranch" />
                  {canEdit && variant === "as_is" && (
                    <button onClick={() => createDiagram(variant)} disabled={creating}
                      className="w-full px-3 py-2 rounded-lg border border-violet-300 text-violet-700 text-xs hover:bg-violet-50 disabled:opacity-40 flex items-center justify-center gap-1.5">
                      <Icon name="Plus" size={12} /> Создать AS-IS
                    </button>
                  )}
                  {canEdit && variant === "to_be" && asIs && (
                    <button onClick={createToBeFromAsIs} disabled={creating}
                      className="w-full px-3 py-2 rounded-lg border border-violet-300 text-violet-700 text-xs hover:bg-violet-50 disabled:opacity-40 flex items-center justify-center gap-1.5">
                      <Icon name="Copy" size={12} /> Создать TO-BE на основе AS-IS
                    </button>
                  )}
                  {variant === "to_be" && !asIs && (
                    <p className="text-[10px] text-slate-400 text-center">Сначала создайте AS-IS</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {asIs && toBe && (
        <button onClick={() => setView({ kind: "compare" })}
          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm hover:bg-slate-50 flex items-center justify-center gap-1.5">
          <Icon name="GitCompare" size={14} /> Сравнить AS-IS и TO-BE
        </button>
      )}
    </div>
  );
}