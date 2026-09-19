import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading, fmtDate } from "@/components/exec/ExecUI";
import {
  execRoadmapApi, DependencyGraphData, DependencyGraphNode, DependencyGraphEdge,
  CriticalPathData, CriticalPathNode, DependencyKind,
} from "@/lib/execRoadmapApi";

const KIND_ICON: Record<DependencyKind, string> = { stage: "FolderTree", task: "ListTodo", milestone: "Diamond", project: "Folder" };
const KIND_LABEL: Record<DependencyKind, string> = { stage: "Этап", task: "Задача", milestone: "Веха", project: "Проект" };
const DEP_TYPE_LABEL: Record<string, string> = { FS: "оконч. → начало", SS: "начало → начало", FF: "оконч. → оконч.", SF: "начало → оконч." };

const NODE_W = 190;
const NODE_H = 64;
const LAYER_GAP_X = 260;
const NODE_GAP_Y = 84;

interface LaidOutNode extends DependencyGraphNode {
  layer: number;
  x: number;
  y: number;
}

/** Простая слоистая раскладка (упрощённый Sugiyama): слой узла = длина
 * самого длинного пути от источника (узла без входящих рёбер) до него.
 * Для проекта с десятками объектов этого достаточно — сложный алгоритм
 * минимизации пересечений рёбер не требуется в первой версии. */
function layoutGraph(nodes: DependencyGraphNode[], edges: DependencyGraphEdge[]): LaidOutNode[] {
  const key = (k: string, id: number) => `${k}:${id}`;
  const byKey = new Map(nodes.map((n) => [key(n.kind, n.id), n]));
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  nodes.forEach((n) => { indegree.set(key(n.kind, n.id), 0); adjacency.set(key(n.kind, n.id), []); });
  edges.forEach((e) => {
    const s = key(e.src_kind, e.src_id), t = key(e.tgt_kind, e.tgt_id);
    if (!byKey.has(s) || !byKey.has(t)) return;
    adjacency.get(s)!.push(t);
    indegree.set(t, (indegree.get(t) || 0) + 1);
  });

  const layer = new Map<string, number>();
  const queue: string[] = [];
  nodes.forEach((n) => { const k = key(n.kind, n.id); if ((indegree.get(k) || 0) === 0) { layer.set(k, 0); queue.push(k); } });
  const indegreeWork = new Map(indegree);
  let guard = 0;
  while (queue.length && guard < 10000) {
    guard++;
    const cur = queue.shift()!;
    const curLayer = layer.get(cur) || 0;
    for (const nxt of adjacency.get(cur) || []) {
      layer.set(nxt, Math.max(layer.get(nxt) ?? 0, curLayer + 1));
      indegreeWork.set(nxt, (indegreeWork.get(nxt) || 0) - 1);
      if ((indegreeWork.get(nxt) || 0) <= 0) queue.push(nxt);
    }
  }
  // Узлы, не затронутые обходом (изолированный цикл) — кладём в отдельный слой 0.
  nodes.forEach((n) => { const k = key(n.kind, n.id); if (!layer.has(k)) layer.set(k, 0); });

  const byLayer = new Map<number, DependencyGraphNode[]>();
  nodes.forEach((n) => {
    const l = layer.get(key(n.kind, n.id)) || 0;
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l)!.push(n);
  });

  const out: LaidOutNode[] = [];
  Array.from(byLayer.entries()).sort((a, b) => a[0] - b[0]).forEach(([l, layerNodes]) => {
    layerNodes.forEach((n, i) => {
      out.push({ ...n, layer: l, x: l * LAYER_GAP_X + 40, y: i * NODE_GAP_Y + 40 });
    });
  });
  return out;
}

/** Карта зависимостей проекта: узлы (этап/задача/веха) и рёбра между ними,
 * включая межпроектные связи (внешний узел на границе холста). Первый
 * выпуск — только просмотр: масштабирование, перемещение холста, фокус на
 * узле с подсветкой предшественников/последователей, переход в карточку.
 * Редактирование графа мышью не реализовано. */
export default function DependencyGraphView({ projectId, embedded = false }: { projectId: number; embedded?: boolean }) {
  const navigate = useNavigate();
  const [data, setData] = useState<DependencyGraphData | null>(null);
  const [cpm, setCpm] = useState<CriticalPathData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [showCritical, setShowCritical] = useState(true);
  const [stageFilter, setStageFilter] = useState<number | "all">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  const reload = () => {
    setLoading(true);
    setError("");
    Promise.all([execRoadmapApi.dependencyGraph(projectId), execRoadmapApi.criticalPath(projectId)])
      .then(([g, c]) => { setData(g); setCpm(c); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(reload, [projectId]);

  const criticalSet = useMemo(() => {
    const s = new Set<string>();
    if (cpm?.computable) cpm.nodes.filter((n) => n.is_critical).forEach((n) => s.add(`${n.kind}:${n.id}`));
    return s;
  }, [cpm]);

  const cpmByKey = useMemo(() => {
    const m = new Map<string, CriticalPathNode>();
    if (cpm?.computable) cpm.nodes.forEach((n) => m.set(`${n.kind}:${n.id}`, n));
    return m;
  }, [cpm]);

  const filteredEdges = useMemo(() => {
    if (!data) return [];
    return data.edges.filter((e) => typeFilter === "all" || e.dependency_type === typeFilter);
  }, [data, typeFilter]);

  const filteredNodes = useMemo(() => {
    if (!data) return [];
    if (stageFilter === "all") return data.nodes;
    return data.nodes.filter((n) => n.stage_id === stageFilter || n.kind === "stage");
  }, [data, stageFilter]);

  const laidOut = useMemo(() => layoutGraph(filteredNodes, filteredEdges), [filteredNodes, filteredEdges]);
  const nodeByKey = useMemo(() => new Map(laidOut.map((n) => [`${n.kind}:${n.id}`, n])), [laidOut]);

  const { predecessors, successors } = useMemo(() => {
    const pred = new Set<string>(), succ = new Set<string>();
    if (focusKey) {
      filteredEdges.forEach((e) => {
        const s = `${e.src_kind}:${e.src_id}`, t = `${e.tgt_kind}:${e.tgt_id}`;
        if (t === focusKey) pred.add(s);
        if (s === focusKey) succ.add(t);
      });
    }
    return { predecessors: pred, successors: succ };
  }, [focusKey, filteredEdges]);

  const stages = useMemo(() => (data?.nodes || []).filter((n) => n.kind === "stage"), [data]);
  const width = Math.max(800, (Math.max(0, ...laidOut.map((n) => n.layer)) + 1) * LAYER_GAP_X + 200);
  const height = Math.max(400, (Math.max(0, ...Object.values(
    laidOut.reduce((acc, n) => { acc[n.layer] = (acc[n.layer] || 0) + 1; return acc; }, {} as Record<number, number>)
  )) + 1) * NODE_GAP_Y + 80);

  const openNode = (n: DependencyGraphNode) => {
    const pid = n.external ? n.external_project_id : projectId;
    if (!pid) return;
    const tab = n.kind === "milestone" ? "milestones" : n.kind === "task" ? "tasks" : "gantt";
    navigate(`/cabinet/exec/portfolio/projects/${pid}?tab=${tab}`);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => Math.min(2, Math.max(0.4, z + delta)));
  };
  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX, dy = e.clientY - dragRef.current.startY;
    setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
  };
  const onMouseUp = () => { dragRef.current = null; };

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;
  if (!data.nodes.length) return <Empty text="В проекте пока нет объектов для карты зависимостей" icon="Network" />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={stageFilter === "all" ? "all" : String(stageFilter)}
            onChange={(e) => setStageFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="h-8 text-xs rounded-md border border-slate-200 px-2 text-slate-600"
          >
            <option value="all">Все этапы</option>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-8 text-xs rounded-md border border-slate-200 px-2 text-slate-600"
          >
            <option value="all">Все типы связи</option>
            {Object.entries(DEP_TYPE_LABEL).map(([k, label]) => <option key={k} value={k}>{k} · {label}</option>)}
          </select>
          <button
            onClick={() => setShowCritical(!showCritical)}
            className={`h-8 px-2.5 text-xs rounded-md border flex items-center gap-1.5 transition-colors ${
              showCritical ? "border-red-300 bg-red-50 text-red-700" : "border-slate-200 text-slate-500"
            }`}
          >
            <Icon name="Zap" size={12} /> Критический путь
          </button>
          {focusKey && (
            <button onClick={() => setFocusKey(null)} className="h-8 px-2.5 text-xs rounded-md border border-violet-300 bg-violet-50 text-violet-700 flex items-center gap-1.5">
              <Icon name="X" size={12} /> Снять фокус
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))} className="w-7 h-7 rounded-md border border-slate-200 flex items-center justify-center text-slate-500 hover:border-slate-300">
            <Icon name="Minus" size={13} />
          </button>
          <span className="text-xs text-slate-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(2, z + 0.15))} className="w-7 h-7 rounded-md border border-slate-200 flex items-center justify-center text-slate-500 hover:border-slate-300">
            <Icon name="Plus" size={13} />
          </button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="h-7 px-2 text-xs rounded-md border border-slate-200 text-slate-500 hover:border-slate-300">
            Сбросить вид
          </button>
        </div>
      </div>

      {cpm && !cpm.computable && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
          {cpm.cycle ? (
            <p className="flex items-center gap-1.5"><Icon name="RefreshCcw" size={13} /> Обнаружен цикл зависимостей: {cpm.cycle.chain.map((c) => c.title).join(" → ")}. Критический путь не может быть рассчитан, пока цикл не устранён.</p>
          ) : (
            cpm.warnings.map((w, i) => <p key={i} className="flex items-center gap-1.5"><Icon name="TriangleAlert" size={13} /> {w}</p>)
          )}
        </div>
      )}
      {cpm?.computable && cpm.warnings.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
          {cpm.warnings.map((w, i) => <p key={i} className="flex items-center gap-1.5"><Icon name="Info" size={13} /> {w}</p>)}
        </div>
      )}

      <div
        className="rounded-xl border border-slate-200 bg-white overflow-hidden relative"
        style={{ height: 520 }}
        onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
      >
        <svg width="100%" height="100%" style={{ cursor: dragRef.current ? "grabbing" : "grab" }}>
          <g transform={`translate(${pan.x + 20}, ${pan.y + 20}) scale(${zoom})`}>
            <svg width={width} height={height} overflow="visible">
              {filteredEdges.map((e) => {
                const s = nodeByKey.get(`${e.src_kind}:${e.src_id}`);
                const t = nodeByKey.get(`${e.tgt_kind}:${e.tgt_id}`);
                if (!s || !t) return null;
                const isCritical = showCritical && criticalSet.has(`${e.src_kind}:${e.src_id}`) && criticalSet.has(`${e.tgt_kind}:${e.tgt_id}`);
                const dimmed = focusKey && !(predecessors.has(`${e.src_kind}:${e.src_id}`) || successors.has(`${e.tgt_kind}:${e.tgt_id}`) || `${e.src_kind}:${e.src_id}` === focusKey || `${e.tgt_kind}:${e.tgt_id}` === focusKey);
                const x1 = s.x + NODE_W, y1 = s.y + NODE_H / 2, x2 = t.x, y2 = t.y + NODE_H / 2;
                const midX = (x1 + x2) / 2;
                return (
                  <g key={e.id} opacity={dimmed ? 0.15 : 1}>
                    <path
                      d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke={e.violated ? "#ef4444" : isCritical ? "#dc2626" : "#cbd5e1"}
                      strokeWidth={isCritical ? 2.5 : 1.5}
                      strokeDasharray={e.is_cross_project ? "5,4" : undefined}
                      markerEnd="url(#arrow)"
                    />
                    <text x={midX} y={(y1 + y2) / 2 - 4} fontSize={9} fill={e.violated ? "#dc2626" : "#94a3b8"} textAnchor="middle">
                      {e.dependency_type}{e.lag_days !== 0 ? ` ${e.lag_days > 0 ? "+" : ""}${e.lag_days}д` : ""}
                    </text>
                  </g>
                );
              })}
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
                </marker>
              </defs>
              {laidOut.map((n) => {
                const key = `${n.kind}:${n.id}`;
                const isCritical = showCritical && criticalSet.has(key);
                const isFocused = focusKey === key;
                const isRelated = predecessors.has(key) || successors.has(key);
                const dimmed = focusKey && !isFocused && !isRelated;
                const cpmNode = cpmByKey.get(key);
                return (
                  <g
                    key={key}
                    transform={`translate(${n.x}, ${n.y})`}
                    opacity={dimmed ? 0.3 : 1}
                    className="cursor-pointer"
                    onClick={() => setFocusKey(isFocused ? null : key)}
                  >
                    <rect
                      width={NODE_W} height={NODE_H} rx={8}
                      fill={n.external ? "#f8fafc" : isFocused ? "#ede9fe" : "#ffffff"}
                      stroke={isCritical ? "#dc2626" : n.is_overdue ? "#f87171" : isFocused ? "#7c3aed" : "#e2e8f0"}
                      strokeWidth={isCritical || isFocused ? 2 : 1}
                      strokeDasharray={n.external ? "4,3" : undefined}
                    />
                    <foreignObject x={6} y={4} width={NODE_W - 12} height={NODE_H - 8}>
                      <div className="text-[10px] leading-tight h-full flex flex-col justify-between">
                        <div className="flex items-center gap-1 min-w-0">
                          <Icon name={KIND_ICON[n.kind]} size={11} className={n.external ? "text-slate-400" : "text-violet-600"} />
                          <span className="truncate font-medium text-slate-800" title={n.title}>{n.title}</span>
                        </div>
                        <div className="flex items-center gap-1 flex-wrap text-slate-500">
                          {n.external && <span className="px-1 rounded bg-slate-200 text-slate-600">внешний</span>}
                          {n.is_overdue && <span className="px-1 rounded bg-red-100 text-red-700">просрочен</span>}
                          {isCritical && <span className="px-1 rounded bg-red-100 text-red-700 flex items-center gap-0.5"><Icon name="Zap" size={8} />критич.</span>}
                          {n.progress_pct != null && <span>{n.progress_pct}%</span>}
                        </div>
                        {cpmNode && showCritical && (
                          <div className="text-slate-400">резерв {cpmNode.total_float_days} дн.</div>
                        )}
                      </div>
                    </foreignObject>
                    <title>
                      {`${KIND_LABEL[n.kind]}: ${n.title}\n${n.responsible_name ? "Ответственный: " + n.responsible_name + "\n" : ""}Входящих связей: ${n.in_count}, исходящих: ${n.out_count}${n.plan_end ? "\nСрок: " + fmtDate(n.plan_end) : ""}`}
                    </title>
                    {!embedded && (
                      <g transform={`translate(${NODE_W - 18}, ${NODE_H - 16})`} onClick={(ev) => { ev.stopPropagation(); openNode(n); }}>
                        <circle r={9} fill="#f1f5f9" />
                        <text x={0} y={3} textAnchor="middle" fontSize={9} fill="#64748b">→</text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </g>
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-red-600" /> критический путь</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-red-400" style={{ borderTop: "1px dashed" }} /> нарушенная зависимость</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-0.5 border-t border-dashed border-slate-400" /> межпроектная связь</span>
        <span>Клик по узлу — фокус на предшественниках/последователях. Стрелка в узле — переход в карточку.</span>
      </div>
    </div>
  );
}