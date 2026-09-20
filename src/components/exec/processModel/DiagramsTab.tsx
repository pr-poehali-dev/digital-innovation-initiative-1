import { useState } from "react";
import Icon from "@/components/ui/icon";
import { Empty } from "@/components/exec/ExecUI";
import { processModelApi, ProcessDetail, STATUS_STYLE } from "@/lib/execProcessModelApi";
import DiagramEditor from "./diagram/DiagramEditor";

const VARIANT_LABEL: Record<string, string> = { as_is: "AS-IS (как есть)", to_be: "TO-BE (как должно быть)" };

/** Список схем процесса (AS-IS/TO-BE) с переходом в графический редактор.
 * TO-BE на этой итерации создаётся так же вручную, как AS-IS — копирование
 * AS-IS в TO-BE появится в следующей итерации вместе со сравнением версий. */
export default function DiagramsTab({
  processNodeId,
  diagrams,
  canEdit,
  canConfirm,
  onChanged,
}: {
  processNodeId: number;
  diagrams: ProcessDetail["diagrams"];
  canEdit: boolean;
  canConfirm: boolean;
  onChanged: () => void;
}) {
  const [openDiagramId, setOpenDiagramId] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [creating, setCreating] = useState(false);

  const createDiagram = async (variant: "as_is" | "to_be") => {
    setCreating(true);
    try {
      const res = await processModelApi.diagramGetOrCreate(processNodeId, variant);
      onChanged();
      setOpenDiagramId(res.id);
    } finally {
      setCreating(false);
    }
  };

  if (openDiagramId) {
    return (
      <DiagramEditor
        diagramId={openDiagramId}
        canEdit={canEdit}
        canConfirm={canConfirm}
        fullscreen={fullscreen}
        onToggleFullscreen={() => setFullscreen((v) => !v)}
        onClose={() => { setOpenDiagramId(null); setFullscreen(false); onChanged(); }}
      />
    );
  }

  const asIs = diagrams.find((d) => d.variant === "as_is");
  const toBe = diagrams.find((d) => d.variant === "to_be");

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Схема — структурированная модель узлов, связей и дорожек, совместимая с BPMN-подобной логикой.
        Не картинка: каждый элемент хранит тип и связи с процессными сущностями.
      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        {(["as_is", "to_be"] as const).map((variant) => {
          const d = variant === "as_is" ? asIs : toBe;
          return (
            <div key={variant} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon name="GitBranch" size={15} className="text-violet-600" />
                <p className="text-sm font-medium text-slate-900">{VARIANT_LABEL[variant]}</p>
              </div>
              {d ? (
                <div className="space-y-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLE[d.model_status].cls}`}>
                    {STATUS_STYLE[d.model_status].title}
                  </span>
                  <p className="text-xs text-slate-400">версия {d.version}</p>
                  <button onClick={() => setOpenDiagramId(d.id)}
                    className="w-full px-3 py-2 rounded-lg bg-violet-600 text-white text-xs hover:bg-violet-700 flex items-center justify-center gap-1.5">
                    <Icon name="PenLine" size={12} /> Открыть схему
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Empty text="Схема ещё не создана" icon="GitBranch" />
                  {canEdit && (
                    <button onClick={() => createDiagram(variant)} disabled={creating || (variant === "to_be" && !asIs)}
                      className="w-full px-3 py-2 rounded-lg border border-violet-300 text-violet-700 text-xs hover:bg-violet-50 disabled:opacity-40 flex items-center justify-center gap-1.5">
                      <Icon name="Plus" size={12} /> Создать {variant === "as_is" ? "AS-IS" : "TO-BE"}
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
    </div>
  );
}
