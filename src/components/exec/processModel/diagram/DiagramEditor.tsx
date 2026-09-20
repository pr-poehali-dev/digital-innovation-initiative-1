import { useEffect, useRef, useState, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { Loading, ErrorBox } from "@/components/exec/ExecUI";
import {
  processModelApi,
  DiagramFull,
  DiagramLane,
  DiagramNode,
  DiagramValidation,
  OrgUnitRef,
  PersonRef,
  InfoSystem,
  STATUS_STYLE,
  DiagramVariant,
} from "@/lib/execProcessModelApi";
import DiagramCanvas from "./DiagramCanvas";
import DiagramPalette from "./DiagramPalette";
import DiagramPropertiesPanel from "./DiagramPropertiesPanel";
import DiagramAssistant from "./DiagramAssistant";
import DiagramMiniMap from "./DiagramMiniMap";
import DiagramLaneModal from "./DiagramLanePanel";
import { NODE_DEFAULT_SIZE, CANVAS_MIN_WIDTH } from "./diagramLayout";
import { exportDiagramPng, exportDiagramPdf } from "./diagramExport";

const VARIANT_LABEL: Record<DiagramVariant, string> = { as_is: "AS-IS (как есть)", to_be: "TO-BE (как должно быть)" };

/**
 * Графический редактор схем процессов. Режим просмотра/редактирования строго
 * разделён (readOnly вычисляется из статуса схемы + прав пользователя).
 * Данные хранятся структурированно на backend — этот компонент только
 * отображает и редактирует их, экспорт формируется из того же DOM.
 */
export default function DiagramEditor({
  diagramId,
  canEdit,
  canConfirm,
  onClose,
  fullscreen,
  onToggleFullscreen,
}: {
  diagramId: number;
  canEdit: boolean;
  canConfirm: boolean;
  onClose: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  const [full, setFull] = useState<DiagramFull | null>(null);
  const [orgUnits, setOrgUnits] = useState<OrgUnitRef[]>([]);
  const [people, setPeople] = useState<PersonRef[]>([]);
  const [systems, setSystems] = useState<InfoSystem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [laneModal, setLaneModal] = useState<{ lane: DiagramLane | null } | null>(null);
  const [validation, setValidation] = useState<DiagramValidation | null>(null);
  const [validating, setValidating] = useState(false);
  const [showAssistant, setShowAssistant] = useState(true);
  const [scale, setScale] = useState(1);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([
      processModelApi.diagramFull(diagramId),
      processModelApi.orgUnits(),
      processModelApi.people(),
      processModelApi.systems(),
    ])
      .then(([f, u, p, s]) => {
        setFull(f);
        setOrgUnits(u.items);
        setPeople(p.items);
        setSystems(s.items);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [diagramId]);

  useEffect(load, [load]);

  const readOnly = !canEdit || (full ? full.diagram.model_status === "confirmed" || full.diagram.model_status === "published" : true);

  const runValidate = useCallback(() => {
    setValidating(true);
    processModelApi.diagramValidate(diagramId).then(setValidation).finally(() => setValidating(false));
  }, [diagramId]);

  const flash = (msg: string) => { setStatusMsg(msg); setTimeout(() => setStatusMsg(""), 2000); };

  const handleDropNewNode = async (nodeType: string, x: number, y: number, laneId: number | null) => {
    if (!full) return;
    setSaving(true);
    try {
      const size = NODE_DEFAULT_SIZE[nodeType as keyof typeof NODE_DEFAULT_SIZE];
      await processModelApi.saveDiagramNode({
        diagram_id: diagramId, node_type: nodeType, label: "",
        pos_x: x, pos_y: y, lane_id: laneId, width: size.width, height: size.height,
      });
      load();
      flash("Элемент добавлен");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleMoveNode = async (id: number, x: number, y: number) => {
    await processModelApi.saveDiagramNode({ id, pos_x: x, pos_y: y });
    load();
  };

  const handleConnect = async (sourceId: number, targetId: number) => {
    try {
      await processModelApi.saveDiagramEdge({ diagram_id: diagramId, source_node_id: sourceId, target_node_id: targetId });
      load();
      flash("Связь создана");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleDeleteEdge = async (id: number) => {
    await processModelApi.deleteDiagramEdge(id);
    load();
  };

  const handleDeleteSelectedNode = async () => {
    if (!selectedNodeId) return;
    if (!confirm("Удалить элемент? Связанные с ним стрелки тоже будут удалены.")) return;
    await processModelApi.deleteDiagramNode(selectedNodeId);
    setSelectedNodeId(null);
    load();
  };

  const autoLayout = async () => {
    if (!full) return;
    setSaving(true);
    try {
      // Простое детерминированное выравнивание: сортируем по текущему pos_x,
      // расставляем равномерно по сетке 220px внутри своей дорожки.
      const byLane = new Map<number | null, DiagramNode[]>();
      for (const n of full.nodes) {
        const arr = byLane.get(n.lane_id) || [];
        arr.push(n);
        byLane.set(n.lane_id, arr);
      }
      for (const [, arr] of byLane) {
        arr.sort((a, b) => a.pos_x - b.pos_x);
        for (let i = 0; i < arr.length; i++) {
          await processModelApi.saveDiagramNode({ id: arr[i].id, pos_x: 40 + i * 220, pos_y: 40 });
        }
      }
      load();
      flash("Схема выровнена");
    } finally {
      setSaving(false);
    }
  };

  const handleExportPng = async () => {
    if (!canvasRef.current || !full) return;
    await exportDiagramPng(canvasRef.current, {
      processName: full.diagram.title || "Процесс",
      variantLabel: VARIANT_LABEL[full.diagram.variant],
      version: full.diagram.version,
      statusLabel: STATUS_STYLE[full.diagram.model_status].title,
    }, `${full.diagram.title || "schema"}.png`);
  };
  const handleExportPdf = async () => {
    if (!canvasRef.current || !full) return;
    await exportDiagramPdf(canvasRef.current, {
      processName: full.diagram.title || "Процесс",
      variantLabel: VARIANT_LABEL[full.diagram.variant],
      version: full.diagram.version,
      statusLabel: STATUS_STYLE[full.diagram.model_status].title,
    }, `${full.diagram.title || "schema"}.pdf`);
  };

  const createClarification = async (question: string) => {
    if (!full) return;
    const scope = await processModelApi.defaultScope();
    if (!scope.scope_id) return;
    await processModelApi.saveClarificationNote({ scope_id: scope.scope_id, entity_type: "diagram", entity_id: diagramId, question });
    flash("Вопрос сохранён");
  };

  const setStatus = async (status: string) => {
    try {
      await processModelApi.diagramSetStatus(diagramId, status as never);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (loading) return <div className="p-10"><Loading /></div>;
  if (error && !full) return <div className="p-6"><ErrorBox message={error} onRetry={load} /></div>;
  if (!full) return null;

  const selectedNode = full.nodes.find((n) => n.id === selectedNodeId) || null;

  const viewport = scrollRef.current
    ? { x: scrollRef.current.scrollLeft / scale, y: scrollRef.current.scrollTop / scale, width: scrollRef.current.clientWidth / scale, height: scrollRef.current.clientHeight / scale }
    : { x: 0, y: 0, width: CANVAS_MIN_WIDTH, height: 600 };

  return (
    <div className={`flex flex-col bg-white ${fullscreen ? "fixed inset-0 z-[70]" : "border border-slate-200 rounded-xl overflow-hidden"}`} style={fullscreen ? undefined : { height: 640 }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-slate-200 bg-white flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 flex-shrink-0"><Icon name="ArrowLeft" size={16} /></button>
          <p className="text-sm font-semibold text-slate-900 truncate">{full.diagram.title}</p>
          <span className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${STATUS_STYLE[full.diagram.model_status].cls}`}>
            {STATUS_STYLE[full.diagram.model_status].title}
          </span>
          {readOnly && <span className="text-[10px] text-slate-400 flex-shrink-0">режим просмотра</span>}
          {saving && <span className="w-3 h-3 border border-slate-300 border-t-violet-600 rounded-full animate-spin flex-shrink-0" />}
          {statusMsg && <span className="text-[11px] text-green-600 flex-shrink-0">{statusMsg}</span>}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={() => setScale((s) => Math.max(0.4, s - 0.1))} className="w-7 h-7 rounded-md border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50"><Icon name="ZoomOut" size={13} /></button>
          <span className="text-xs text-slate-500 w-10 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale((s) => Math.min(2, s + 0.1))} className="w-7 h-7 rounded-md border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50"><Icon name="ZoomIn" size={13} /></button>
          <button onClick={() => setScale(1)} className="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50">100%</button>
          {!readOnly && (
            <button onClick={autoLayout} className="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center gap-1">
              <Icon name="AlignHorizontalDistributeCenter" size={12} /> Выровнять
            </button>
          )}
          <button onClick={() => setShowAssistant((v) => !v)} className={`text-xs px-2 py-1 rounded-md border flex items-center gap-1 ${showAssistant ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
            <Icon name="Compass" size={12} /> Помощник
          </button>
          <button onClick={handleExportPng} className="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center gap-1"><Icon name="Image" size={12} /> PNG</button>
          <button onClick={handleExportPdf} className="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center gap-1"><Icon name="FileDown" size={12} /> PDF</button>
          <button onClick={onToggleFullscreen} className="w-7 h-7 rounded-md border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50">
            <Icon name={fullscreen ? "Minimize2" : "Maximize2"} size={13} />
          </button>
          {canEdit && full.diagram.model_status === "draft" && (
            <button onClick={() => setStatus("in_review")} className="text-xs px-2.5 py-1 rounded-md border border-blue-300 text-blue-700 hover:bg-blue-50">На проверку</button>
          )}
          {canConfirm && full.diagram.model_status === "in_review" && (
            <button onClick={() => setStatus("confirmed")} className="text-xs px-2.5 py-1 rounded-md bg-green-600 text-white hover:bg-green-700">Подтвердить</button>
          )}
          {canConfirm && full.diagram.model_status === "confirmed" && (
            <button onClick={() => setStatus("draft")} className="text-xs px-2.5 py-1 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50">В черновик</button>
          )}
        </div>
      </div>

      {error && <div className="px-3.5 pt-2"><ErrorBox message={error} onRetry={load} /></div>}

      {/* Рабочая область */}
      <div className="flex-1 flex min-h-0">
        <DiagramPalette readOnly={readOnly} />

        <div ref={scrollRef} className="flex-1 relative overflow-auto bg-slate-100">
          <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <DiagramCanvas
              lanes={full.lanes}
              nodes={full.nodes}
              edges={full.edges}
              selectedNodeId={selectedNodeId}
              readOnly={readOnly}
              scale={scale}
              onSelectNode={setSelectedNodeId}
              onMoveNode={handleMoveNode}
              onDropNewNode={handleDropNewNode}
              onConnect={handleConnect}
              onDeleteEdge={handleDeleteEdge}
              onAddLane={() => setLaneModal({ lane: null })}
              onEditLane={(lane) => setLaneModal({ lane })}
              canvasRef={canvasRef}
            />
          </div>
          <DiagramMiniMap
            nodes={full.nodes}
            canvasWidth={CANVAS_MIN_WIDTH}
            canvasHeight={640}
            viewport={viewport}
            onNavigate={(x, y) => { if (scrollRef.current) { scrollRef.current.scrollLeft = x * scale; scrollRef.current.scrollTop = y * scale; } }}
          />
        </div>

        {selectedNode && (
          <DiagramPropertiesPanel
            node={selectedNode}
            lanes={full.lanes}
            people={people}
            orgUnits={orgUnits}
            systems={systems}
            readOnly={readOnly}
            onChanged={load}
            onDelete={handleDeleteSelectedNode}
            onClose={() => setSelectedNodeId(null)}
          />
        )}

        {showAssistant && !selectedNode && (
          <DiagramAssistant
            diagramId={diagramId}
            validation={validation}
            onValidate={runValidate}
            validating={validating}
            onCreateClarification={createClarification}
            onClose={() => setShowAssistant(false)}
          />
        )}
      </div>

      {laneModal && (
        <DiagramLaneModal diagramId={diagramId} lane={laneModal.lane} orgUnits={orgUnits}
          onClose={() => setLaneModal(null)} onSaved={load} />
      )}
    </div>
  );
}