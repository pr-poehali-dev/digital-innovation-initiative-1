import { useMemo, useState } from "react";
import Icon from "@/components/ui/icon";
import { Plan, PlanStep } from "@/lib/execPlannerApi";

/** Статус узла с учётом просрочки */
type NodeState = "done" | "overdue" | "in_progress" | "blocked" | "not_started";

const STATE_COLOR: Record<NodeState, { line: string; fill: string; text: string; label: string }> = {
  done:        { line: "#16a34a", fill: "#16a34a", text: "#15803d", label: "Готово" },
  in_progress: { line: "#7c3aed", fill: "#7c3aed", text: "#6d28d9", label: "В работе" },
  overdue:     { line: "#dc2626", fill: "#dc2626", text: "#b91c1c", label: "Просрочено" },
  blocked:     { line: "#dc2626", fill: "#dc2626", text: "#b91c1c", label: "Блок" },
  not_started: { line: "#cbd5e1", fill: "#ffffff", text: "#64748b", label: "Не начато" },
};

function stateOf(s: PlanStep): NodeState {
  if (s.status === "done") return "done";
  if (s.status === "blocked") return "blocked";
  const due = s.due_date ? new Date(s.due_date.slice(0, 10)).getTime() : null;
  const today = new Date(new Date().toDateString()).getTime();
  if (due !== null && due < today) return "overdue";
  if (s.status === "in_progress") return "in_progress";
  return "not_started";
}

interface TNode {
  step: PlanStep;
  children: TNode[];
  depth: number;
  leaves: number;
}

function build(steps: PlanStep[], parent: number | null, depth: number): TNode[] {
  return steps
    .filter((s) => (s.parent_step_id ?? null) === parent)
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    .map((step) => {
      const children = build(steps, step.id, depth + 1);
      const leaves = children.length ? children.reduce((a, c) => a + c.leaves, 0) : 1;
      return { step, children, depth, leaves };
    });
}

interface Placed {
  node: TNode;
  x: number;
  y: number;
  parentX: number;
  parentY: number;
  isRoot: boolean;
}

/** Дорожка в стиле печатной платы: горизонталь → скос 45° → горизонталь */
function tracePath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (Math.abs(dy) < 0.5) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const diag = Math.min(Math.abs(dy) / 2, Math.abs(dx) * 0.35, 14);
  const sy = Math.sign(dy);
  const midX = x1 + Math.min(dx * 0.5, 46);
  return `M ${x1} ${y1} L ${midX - diag} ${y1} L ${midX} ${y1 + sy * diag} L ${midX} ${y2 - sy * diag} L ${midX + diag} ${y2} L ${x2} ${y2}`;
}

export default function PlanTreeMap({
  plan,
  onStepClick,
}: {
  plan: Plan;
  onStepClick?: (s: PlanStep) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const steps = useMemo(
    () => (plan.steps || []).filter((s) => s.status !== "cancelled"),
    [plan.steps],
  );

  const { placed, width, height, trunkX, trunkTop, trunkBottom } = useMemo(() => {
    const roots = build(steps, null, 0);

    const ROW = 40;           // высота строки на лист
    const COL = 250;          // ширина уровня вложенности
    const LEFT = 96;          // отступ под ствол
    const TOP = 34;

    const maxDepth = (function d(ns: TNode[]): number {
      return ns.length ? 1 + Math.max(...ns.map((n) => d(n.children))) : 0;
    })(roots);

    const out: Placed[] = [];
    let leafCursor = TOP;

    // Ствол слева, ветви растут вправо: уровень вложенности → X, лист → Y
    const place = (n: TNode) => {
      const x = LEFT + n.depth * COL;
      let y: number;
      if (!n.children.length) {
        y = leafCursor + ROW / 2;
        leafCursor += ROW;
      } else {
        const before = leafCursor;
        n.children.forEach(place);
        const kids = out.filter((p) => n.children.includes(p.node));
        y = kids.length
          ? (Math.min(...kids.map((p) => p.y)) + Math.max(...kids.map((p) => p.y))) / 2
          : before + ROW / 2;
      }
      out.push({ node: n, x, y, parentX: 0, parentY: 0, isRoot: n.depth === 0 });
    };

    roots.forEach(place);

    const h = Math.max(leafCursor + TOP, 240);
    const trunkTopY = TOP;
    const trunkBottomY = h - TOP / 2;
    const trunkXPos = LEFT - 52;

    // координаты родителей — после размещения всех узлов
    const byId = new Map(out.map((p) => [p.node.step.id, p]));
    out.forEach((p) => {
      const pid = p.node.step.parent_step_id ?? null;
      const par = pid === null ? null : byId.get(pid);
      if (par) {
        p.parentX = par.x;
        p.parentY = par.y;
      } else {
        p.parentX = trunkXPos;
        p.parentY = p.y;
        p.isRoot = true;
      }
    });

    return {
      placed: out,
      width: Math.max(LEFT + maxDepth * COL + 60, 760),
      height: h,
      trunkX: trunkXPos,
      trunkTop: trunkTopY,
      trunkBottom: trunkBottomY,
    };
  }, [steps]);

  if (!steps.length) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <Icon name="Network" size={40} className="mx-auto text-slate-300 mb-3" />
        <div className="text-slate-500 text-sm">Добавьте шаги — и здесь вырастет дерево плана</div>
      </div>
    );
  }

  const total = steps.length;
  const doneCount = steps.filter((s) => s.status === "done").length;
  const overdueCount = steps.filter((s) => stateOf(s) === "overdue").length;
  const msCount = steps.filter((s) => s.is_milestone).length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Шапка */}
      <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2 mr-auto">
          <Icon name="Network" size={16} className="text-slate-400" />
          <div>
            <div className="font-semibold text-slate-900 text-sm">Дерево плана</div>
            <div className="text-xs text-slate-400">
              Ствол — план, ветви — разделы, узлы — шаги. Крупные с ободком — вехи
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          {(["done", "in_progress", "overdue", "not_started"] as NodeState[]).map((st) => (
            <span key={st} className="flex items-center gap-1.5 text-slate-500">
              <span
                className="w-2.5 h-2.5 rounded-full border"
                style={{
                  background: STATE_COLOR[st].fill,
                  borderColor: STATE_COLOR[st].line,
                }}
              />
              {STATE_COLOR[st].label}
            </span>
          ))}
        </div>
      </div>

      {/* Сводка */}
      <div className="px-5 py-2.5 bg-slate-50/70 border-b border-slate-100 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
        <span>Шагов: <b className="text-slate-700">{total}</b></span>
        <span>Готово: <b className="text-emerald-600">{doneCount}</b></span>
        {overdueCount > 0 && <span>Просрочено: <b className="text-red-600">{overdueCount}</b></span>}
        <span>Вех: <b className="text-slate-700">{msCount}</b></span>
      </div>

      {/* Схема */}
      <div className="overflow-auto max-h-[70vh]">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="block"
          style={{ minWidth: "100%" }}
        >
          {/* Ствол */}
          <line
            x1={trunkX}
            y1={trunkBottom}
            x2={trunkX}
            y2={trunkTop}
            stroke="#94a3b8"
            strokeWidth={3}
            strokeLinecap="round"
            opacity={0.35}
          />

          {/* Дорожки */}
          {placed.map((p) => {
            const st = stateOf(p.node.step);
            const c = STATE_COLOR[st];
            const dim = hover !== null && hover !== p.node.step.id;
            return (
              <path
                key={`e-${p.node.step.id}`}
                d={tracePath(p.parentX, p.parentY, p.x, p.y)}
                fill="none"
                stroke={c.line}
                strokeWidth={p.node.depth === 0 ? 2.4 : 1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={dim ? 0.18 : st === "not_started" ? 0.5 : 0.75}
                style={{ transition: "opacity .15s" }}
              />
            );
          })}

          {/* Узлы */}
          {placed.map((p) => {
            const s = p.node.step;
            const st = stateOf(s);
            const c = STATE_COLOR[st];
            const dim = hover !== null && hover !== s.id;
            const isMs = s.is_milestone;
            const kids = p.node.children.length;
            const r = isMs ? 13 : kids ? 9 : 6.5;
            const filled = st !== "not_started";

            return (
              <g
                key={`n-${s.id}`}
                onMouseEnter={() => setHover(s.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onStepClick?.(s)}
                style={{
                  cursor: onStepClick ? "pointer" : "default",
                  opacity: dim ? 0.3 : 1,
                  transition: "opacity .15s",
                }}
              >
                {isMs && (
                  <circle cx={p.x} cy={p.y} r={r + 5} fill="none" stroke={c.line} strokeWidth={1.6} opacity={0.45} />
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  fill={filled ? c.fill : "#ffffff"}
                  stroke={c.line}
                  strokeWidth={filled ? 1.5 : 2}
                />
                {st === "done" && (
                  <path
                    d={`M ${p.x - r * 0.45} ${p.y} l ${r * 0.35} ${r * 0.38} l ${r * 0.6} ${-r * 0.75}`}
                    fill="none"
                    stroke="#fff"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Подпись: у родителей — над узлом (справа уходят ветви), у листьев — справа */}
                <text
                  x={kids ? p.x - r - 2 : p.x + r + 8}
                  y={kids ? p.y - r - 7 : p.y - 1}
                  textAnchor={kids ? "end" : "start"}
                  fontSize={isMs ? 11.5 : 10.5}
                  fontWeight={isMs ? 700 : kids ? 600 : 400}
                  fill={c.text}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  strokeLinejoin="round"
                >
                  {s.title.length > 30 ? s.title.slice(0, 29) + "…" : s.title}
                </text>
                {s.due_date && (
                  <text
                    x={kids ? p.x - r - 2 : p.x + r + 8}
                    y={kids ? p.y + r + 14 : p.y + 11}
                    textAnchor={kids ? "end" : "start"}
                    fontSize={9}
                    fill={st === "overdue" ? "#dc2626" : "#94a3b8"}
                    stroke="#ffffff"
                    strokeWidth={3}
                    paintOrder="stroke"
                    strokeLinejoin="round"
                  >
                    {new Date(s.due_date.slice(0, 10)).toLocaleDateString("ru-RU", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </text>
                )}

                <title>
                  {`${s.title}\n${STATE_COLOR[st].label}${s.due_date ? ` · до ${new Date(s.due_date.slice(0, 10)).toLocaleDateString("ru-RU")}` : ""}${kids ? `\nПодшагов: ${kids}` : ""}`}
                </title>
              </g>
            );
          })}

          {/* Основание — плата */}
          <g>
            <rect
              x={trunkX - 30}
              y={trunkTop - 26}
              width={60}
              height={20}
              rx={6}
              fill="#475569"
              opacity={0.9}
            />
            <text
              x={trunkX}
              y={trunkTop - 12}
              textAnchor="middle"
              fontSize={9.5}
              fontWeight={700}
              fill="#fff"
            >
              ПЛАН
            </text>
            {[0.25, 0.5, 0.75].map((k, i) => (
              <line
                key={i}
                x1={trunkX}
                y1={trunkTop + (trunkBottom - trunkTop) * k}
                x2={trunkX - (i % 2 ? 22 : 34)}
                y2={trunkTop + (trunkBottom - trunkTop) * k}
                stroke="#94a3b8"
                strokeWidth={1.4}
                opacity={0.45}
              />
            ))}
          </g>
        </svg>
      </div>

      <div className="px-5 py-2.5 border-t border-slate-100 text-[11px] text-slate-400">
        Нажмите на узел, чтобы открыть шаг. Схему можно прокручивать вбок
      </div>
    </div>
  );
}