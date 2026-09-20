import Icon from "@/components/ui/icon";
import { DiagramNode, NODE_TYPE_ICON, QUALITATIVE_LEVEL_STYLE } from "@/lib/execProcessModelApi";
import { NODE_DEFAULT_SIZE } from "./diagramLayout";

const TYPE_STYLE: Record<string, { bg: string; border: string; text: string; shape: "circle" | "rect" | "diamond" }> = {
  start: { bg: "bg-green-50", border: "border-green-500", text: "text-green-700", shape: "circle" },
  end: { bg: "bg-red-50", border: "border-red-500", text: "text-red-700", shape: "circle" },
  task: { bg: "bg-white", border: "border-slate-300", text: "text-slate-800", shape: "rect" },
  gateway: { bg: "bg-amber-50", border: "border-amber-500", text: "text-amber-700", shape: "diamond" },
  subprocess: { bg: "bg-violet-50", border: "border-violet-400", text: "text-violet-800", shape: "rect" },
  document: { bg: "bg-blue-50", border: "border-blue-300", text: "text-blue-800", shape: "rect" },
  system: { bg: "bg-cyan-50", border: "border-cyan-300", text: "text-cyan-800", shape: "rect" },
  control: { bg: "bg-orange-50", border: "border-orange-400", text: "text-orange-800", shape: "rect" },
  note: { bg: "bg-yellow-50", border: "border-yellow-300", text: "text-yellow-800", shape: "rect" },
};

/**
 * Визуальное представление одного элемента схемы. Форма кодирует тип
 * (круг = событие, ромб = решение, прямоугольник = остальное) — не только
 * цвет, чтобы читаться и на чёрно-белой печати/экспорте.
 */
export default function DiagramNodeShape({
  node,
  selected,
  readOnly,
  showRisks,
  hasIssue,
  onMouseDownNode,
  onStartConnect,
  onFinishConnect,
  connecting,
}: {
  node: DiagramNode;
  selected: boolean;
  readOnly: boolean;
  showRisks?: boolean;
  hasIssue?: boolean;
  onMouseDownNode: (e: React.MouseEvent) => void;
  onStartConnect: (e: React.MouseEvent) => void;
  onFinishConnect: () => void;
  connecting: boolean;
}) {
  const style = TYPE_STYLE[node.node_type] || TYPE_STYLE.task;
  const size = NODE_DEFAULT_SIZE[node.node_type];
  const width = node.width || size.width;
  const height = node.height || size.height;

  const unconfirmed = node.confirmation_status !== "confirmed";

  return (
    <div
      onMouseDown={onMouseDownNode}
      onMouseUp={connecting ? onFinishConnect : undefined}
      className={`absolute select-none group ${readOnly ? "" : "cursor-move"}`}
      style={{ left: node.pos_x, top: node.pos_y, width, height }}
      data-node-id={node.id}
    >
      <div
        className={`w-full h-full border-2 flex items-center justify-center px-2 text-center relative transition-shadow ${style.bg} ${
          selected ? "border-violet-600 shadow-[0_0_0_3px_rgba(124,58,237,0.25)]" : style.border
        } ${style.shape === "circle" ? "rounded-full" : style.shape === "diamond" ? "" : "rounded-lg"}`}
        style={style.shape === "diamond" ? { transform: "rotate(45deg)" } : undefined}
      >
        <div className={style.shape === "diamond" ? "" : "flex flex-col items-center gap-1"} style={style.shape === "diamond" ? { transform: "rotate(-45deg)" } : undefined}>
          {style.shape !== "diamond" && (
            <Icon name={NODE_TYPE_ICON[node.node_type]} size={style.shape === "circle" ? 18 : 14} className={style.text} />
          )}
          <span className={`text-[11px] font-medium leading-tight line-clamp-3 ${style.text}`}>
            {node.label || "Без названия"}
          </span>
        </div>

        {node.is_critical && (
          <span className="absolute -top-2 -left-2 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center" title="Критичная операция">
            <Icon name="Flame" size={10} className="text-white" />
          </span>
        )}
        {showRisks && node.ref_risk_id && (
          <span
            className={`absolute -bottom-2 -left-2 w-4 h-4 rounded-full flex items-center justify-center border border-white ${
              node.ref_risk_level ? QUALITATIVE_LEVEL_STYLE[node.ref_risk_level].dot : "bg-slate-400"
            }`}
            title={`Риск: ${node.ref_risk_title || ""}${node.ref_risk_controls_count ? "" : " (без контроля)"}`}
          >
            <Icon name="ShieldAlert" size={10} className="text-white" />
          </span>
        )}
        {showRisks && node.ref_risk_id && !node.ref_risk_controls_count && (
          <span className="absolute -bottom-2 left-4 w-4 h-4 rounded-full bg-white border border-amber-400 flex items-center justify-center" title="Риск без контроля">
            <Icon name="AlertTriangle" size={9} className="text-amber-600" />
          </span>
        )}
        {showRisks && hasIssue && (
          <span className="absolute -bottom-2 -right-2 w-4 h-4 rounded-full bg-orange-500 flex items-center justify-center border border-white" title="Есть проблема AS-IS">
            <Icon name="AlertCircle" size={9} className="text-white" />
          </span>
        )}
        {unconfirmed && (
          <span className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-amber-400 flex items-center justify-center" title="Не подтверждено">
            <Icon name="Clock" size={9} className="text-white" />
          </span>
        )}

        {!readOnly && selected && (
          <div
            onMouseDown={onStartConnect}
            title="Потяните, чтобы соединить с другим элементом"
            className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-violet-600 border-2 border-white shadow flex items-center justify-center cursor-crosshair opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Icon name="ArrowRight" size={10} className="text-white" />
          </div>
        )}
      </div>
    </div>
  );
}