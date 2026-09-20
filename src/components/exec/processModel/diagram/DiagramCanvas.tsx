import { useRef, useState, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { DiagramLane, DiagramNode, DiagramEdge } from "@/lib/execProcessModelApi";
import DiagramNodeShape from "./DiagramNodeShape";
import { LANE_HEADER_WIDTH, LANE_HEIGHT, UNASSIGNED_LANE_HEIGHT, CANVAS_MIN_WIDTH, snap } from "./diagramLayout";

/** Строит SVG-путь стрелки между двумя узлами (прямая линия с изломом,
 * как в существующем InitiativeTreeMap — единый визуальный язык проекта). */
function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  if (Math.abs(y2 - y1) < 2) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const midX = x1 + dx / 2;
  return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
}

export default function DiagramCanvas({
  lanes,
  nodes,
  edges,
  selectedNodeId,
  readOnly,
  scale,
  onSelectNode,
  onMoveNode,
  onDropNewNode,
  onConnect,
  onDeleteEdge,
  onAddLane,
  onEditLane,
  canvasRef,
}: {
  lanes: DiagramLane[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  selectedNodeId: number | null;
  readOnly: boolean;
  scale: number;
  onSelectNode: (id: number | null) => void;
  onMoveNode: (id: number, x: number, y: number) => void;
  onDropNewNode: (nodeType: string, x: number, y: number, laneId: number | null) => void;
  onConnect: (sourceId: number, targetId: number) => void;
  onDeleteEdge: (id: number) => void;
  onAddLane: () => void;
  onEditLane: (lane: DiagramLane) => void;
  canvasRef: React.RefObject<HTMLDivElement>;
}) {
  const dragState = useRef<{ nodeId: number; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<number | null>(null);
  const [dragPreview, setDragPreview] = useState<{ nodeId: number; x: number; y: number } | null>(null);

  const laneHeightFor = (_l: DiagramLane) => LANE_HEIGHT;
  const totalHeight = lanes.reduce((s, l) => s + laneHeightFor(l), 0) + UNASSIGNED_LANE_HEIGHT;
  const laneTop = (laneId: number | null): number => {
    if (laneId === null) return lanes.reduce((s, l) => s + laneHeightFor(l), 0);
    let y = 0;
    for (const l of lanes) {
      if (l.id === laneId) return y;
      y += laneHeightFor(l);
    }
    return y;
  };

  const handleNodeMouseDown = (node: DiagramNode) => (e: React.MouseEvent) => {
    if (readOnly) return;
    e.stopPropagation();
    onSelectNode(node.id);
    dragState.current = { nodeId: node.id, startX: e.clientX, startY: e.clientY, origX: node.pos_x, origY: node.pos_y };

    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      const dx = (ev.clientX - dragState.current.startX) / scale;
      const dy = (ev.clientY - dragState.current.startY) / scale;
      setDragPreview({ nodeId: node.id, x: snap(dragState.current.origX + dx), y: snap(dragState.current.origY + dy) });
    };
    const onUp = () => {
      if (dragState.current && dragPreview) {
        onMoveNode(dragState.current.nodeId, dragPreview.x, dragPreview.y);
      }
      dragState.current = null;
      setDragPreview(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleStartConnect = (node: DiagramNode) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setConnectingFrom(node.id);
  };
  const handleFinishConnect = (node: DiagramNode) => () => {
    if (connectingFrom !== null && connectingFrom !== node.id) {
      onConnect(connectingFrom, node.id);
    }
    setConnectingFrom(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
  };
  const handleDrop = useCallback((e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    const nodeType = e.dataTransfer.getData("application/x-node-type");
    if (!nodeType || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = snap((e.clientX - rect.left) / scale);
    const y = snap((e.clientY - rect.top) / scale);
    // Определяем дорожку по Y-координате
    let laneId: number | null = null;
    let acc = 0;
    for (const l of lanes) {
      if (y >= acc && y < acc + laneHeightFor(l)) { laneId = l.id; break; }
      acc += laneHeightFor(l);
    }
    onDropNewNode(nodeType, x, laneId !== null ? y - laneTop(laneId) : y, laneId);
  }, [lanes, scale, readOnly, canvasRef, onDropNewNode]);

  const nodePos = (n: DiagramNode) => {
    if (dragPreview?.nodeId === n.id) return { x: dragPreview.x, y: dragPreview.y };
    return { x: n.pos_x, y: n.pos_y };
  };
  const nodeAbsY = (n: DiagramNode) => laneTop(n.lane_id) + nodePos(n).y;
  const nodeCenter = (n: DiagramNode) => ({ x: nodePos(n).x + n.width / 2, y: nodeAbsY(n) + n.height / 2 });

  return (
    <div
      ref={canvasRef}
      onClick={() => onSelectNode(null)}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative bg-white"
      style={{
        width: CANVAS_MIN_WIDTH,
        height: totalHeight,
        backgroundImage: "radial-gradient(circle, #e2e8f0 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
    >
      {/* Дорожки */}
      {lanes.map((lane, i) => (
        <div key={lane.id}
          className={`absolute left-0 right-0 border-b border-slate-200 flex ${i % 2 === 0 ? "bg-slate-50/40" : "bg-white"}`}
          style={{ top: laneTop(lane.id), height: laneHeightFor(lane) }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); onEditLane(lane); }}
            className="flex-shrink-0 flex flex-col items-center justify-center gap-1 border-r border-slate-200 bg-white hover:bg-slate-50 transition-colors px-2 sticky left-0 z-10"
            style={{ width: LANE_HEADER_WIDTH }}
          >
            <Icon name={lane.lane_type === "org_unit" ? "Building2" : lane.lane_type === "role" ? "UserCog" : "HelpCircle"}
              size={14} className={lane.needs_clarification ? "text-amber-500" : "text-violet-500"} />
            <span className="text-xs font-medium text-slate-700 text-center leading-tight line-clamp-3">{lane.title}</span>
            {lane.needs_clarification && <span className="text-[9px] text-amber-600">требует уточнения</span>}
          </button>
        </div>
      ))}
      {/* Нераспределённая зона (для start/end/document/system/note, которые вне дорожек) */}
      <div className="absolute left-0 right-0 flex bg-slate-100/50"
        style={{ top: laneTop(null), height: UNASSIGNED_LANE_HEIGHT }}>
        <div className="flex-shrink-0 flex items-center justify-center border-r border-slate-200 bg-slate-50 px-2 sticky left-0 z-10"
          style={{ width: LANE_HEADER_WIDTH }}>
          <span className="text-[11px] text-slate-400 text-center">Без дорожки</span>
        </div>
      </div>

      {/* Стрелки — SVG-оверлей поверх всего холста */}
      <svg className="absolute inset-0 pointer-events-none" width={CANVAS_MIN_WIDTH} height={totalHeight}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
          </marker>
        </defs>
        {edges.map((edge) => {
          const source = nodes.find((n) => n.id === edge.source_node_id);
          const target = nodes.find((n) => n.id === edge.target_node_id);
          if (!source || !target) return null;
          const c1 = nodeCenter(source);
          const c2 = nodeCenter(target);
          const x1 = c1.x + LANE_HEADER_WIDTH + (source.width / 2);
          const y1 = c1.y;
          const x2 = c2.x + LANE_HEADER_WIDTH - (target.width / 2);
          const y2 = c2.y;
          return (
            <g key={edge.id} className="pointer-events-auto cursor-pointer" onClick={(e) => { e.stopPropagation(); if (!readOnly && confirm("Удалить связь?")) onDeleteEdge(edge.id); }}>
              <path d={edgePath(x1, y1, x2, y2)} stroke="#94a3b8" strokeWidth={2} fill="none" markerEnd="url(#arrow)"
                strokeDasharray={edge.edge_type === "conditional" ? "5,4" : undefined} />
              {edge.label && (
                <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} fontSize={10} fill="#475569" textAnchor="middle">{edge.label}</text>
              )}
            </g>
          );
        })}
        {connectingFrom !== null && (
          <text x={20} y={20} fontSize={11} fill="#7c3aed">Выберите элемент, с которым соединить…</text>
        )}
      </svg>

      {/* Узлы — позиционируем с учётом смещения на ширину заголовка дорожки */}
      <div className="absolute inset-0" style={{ left: LANE_HEADER_WIDTH }}>
        {nodes.map((node) => (
          <DiagramNodeShape
            key={node.id}
            node={{ ...node, pos_x: nodePos(node).x, pos_y: nodeAbsY(node) }}
            selected={selectedNodeId === node.id}
            readOnly={readOnly}
            onMouseDownNode={handleNodeMouseDown(node)}
            onStartConnect={handleStartConnect(node)}
            onFinishConnect={handleFinishConnect(node)}
            connecting={connectingFrom !== null}
          />
        ))}
      </div>

      {!readOnly && (
        <button
          onClick={(e) => { e.stopPropagation(); onAddLane(); }}
          className="absolute text-xs px-2 py-1 rounded-md border border-dashed border-violet-300 text-violet-600 hover:bg-violet-50 flex items-center gap-1"
          style={{ top: totalHeight - UNASSIGNED_LANE_HEIGHT - 28, left: 4 }}
        >
          <Icon name="Plus" size={11} /> Дорожка
        </button>
      )}
    </div>
  );
}