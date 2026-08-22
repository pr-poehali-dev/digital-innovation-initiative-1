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
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [byDate, setByDate] = useState(false);

  const steps = useMemo(
    () => (plan.steps || []).filter((s) => s.status !== "cancelled"),
    [plan.steps],
  );

  const toggleNode = (id: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const LEFT = 96;
  const COL = 250;
  const TOP = 34;
  const ROW = 40;
  const TIME_W = 1180;      // ширина полотна в режиме дат

  const {
    placed, width, height, trunkX, trunkTop, trunkBottom, ticks, todayX,
  } = useMemo(() => {
    const roots = build(steps, null, 0);

    const maxDepth = (function d(ns: TNode[]): number {
      return ns.length ? 1 + Math.max(...ns.map((n) => d(n.children))) : 0;
    })(roots);

    // ── шкала времени ─────────────────────────────────────────────
    const times: number[] = [];
    steps.forEach((s) => {
      const a = s.start_date ? new Date(s.start_date.slice(0, 10)).getTime() : NaN;
      const b = s.due_date ? new Date(s.due_date.slice(0, 10)).getTime() : NaN;
      if (!Number.isNaN(a)) times.push(a);
      if (!Number.isNaN(b)) times.push(b);
    });
    times.push(Date.now());
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    const spanT = Math.max(maxT - minT, 14 * 86400000);
    const xOfDate = (t: number) => LEFT + ((t - minT) / spanT) * TIME_W;

    const out: Placed[] = [];
    let leafCursor = TOP;

    // Ствол слева, ветви растут вправо. Свёрнутые узлы не раскрывают детей.
    const place = (n: TNode) => {
      const hidden = collapsed.has(n.step.id);
      const kidsList = hidden ? [] : n.children;

      let y: number;
      if (!kidsList.length) {
        y = leafCursor + ROW / 2;
        leafCursor += ROW;
      } else {
        const before = leafCursor;
        kidsList.forEach(place);
        const kids = out.filter((p) => kidsList.includes(p.node));
        y = kids.length
          ? (Math.min(...kids.map((p) => p.y)) + Math.max(...kids.map((p) => p.y))) / 2
          : before + ROW / 2;
      }

      const due = n.step.due_date ? new Date(n.step.due_date.slice(0, 10)).getTime() : null;
      const x = byDate
        ? due !== null ? xOfDate(due) : LEFT + n.depth * 40
        : LEFT + n.depth * COL;

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

    // деления шкалы — по месяцам
    const tk: { x: number; label: string }[] = [];
    if (byDate) {
      const d = new Date(minT);
      d.setDate(1);
      while (d.getTime() <= maxT) {
        const t = d.getTime();
        if (t >= minT) {
          tk.push({
            x: xOfDate(t),
            label: d.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" }),
          });
        }
        d.setMonth(d.getMonth() + 1);
      }
    }

    return {
      placed: out,
      width: byDate
        ? LEFT + TIME_W + 260
        : Math.max(LEFT + maxDepth * COL + 60, 760),
      height: h,
      trunkX: trunkXPos,
      trunkTop: trunkTopY,
      trunkBottom: trunkBottomY,
      ticks: tk,
      todayX: byDate ? xOfDate(Date.now()) : null,
    };
  }, [steps, collapsed, byDate]);

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
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setByDate((v) => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              byDate
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
            }`}
            title="Расставить узлы по срокам на шкале времени"
          >
            <Icon name="CalendarRange" size={13} />
            По датам
          </button>
          <button
            onClick={() => {
              const parents = steps.filter((s) =>
                steps.some((c) => c.parent_step_id === s.id),
              );
              setCollapsed((prev) =>
                prev.size ? new Set() : new Set(parents.map((s) => s.id)),
              );
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border bg-white text-slate-600 border-slate-200 hover:border-slate-300 transition-colors"
          >
            <Icon name={collapsed.size ? "Maximize2" : "Minimize2"} size={13} />
            {collapsed.size ? "Развернуть всё" : "Свернуть всё"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] w-full lg:w-auto">
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
          {/* Шкала времени — вертикальные деления по месяцам */}
          {ticks.map((t, i) => (
            <g key={`t-${i}`}>
              <line
                x1={t.x}
                y1={trunkTop - 4}
                x2={t.x}
                y2={trunkBottom}
                stroke="#e2e8f0"
                strokeWidth={1}
                strokeDasharray="3 4"
              />
              <text x={t.x + 3} y={trunkTop - 10} fontSize={9.5} fill="#94a3b8" fontWeight={600}>
                {t.label}
              </text>
            </g>
          ))}

          {/* Сегодня */}
          {todayX !== null && (
            <g>
              <line
                x1={todayX}
                y1={trunkTop - 4}
                x2={todayX}
                y2={trunkBottom}
                stroke="#dc2626"
                strokeWidth={1.5}
                opacity={0.5}
              />
              <text x={todayX + 4} y={trunkBottom + 12} fontSize={9.5} fill="#dc2626" fontWeight={700}>
                сегодня
              </text>
            </g>
          )}

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
                  x={kids ? p.x - r - 3 : p.x + r + 8}
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
                  {(() => {
                    const lim = byDate ? 20 : 30;
                    return s.title.length > lim ? s.title.slice(0, lim - 1) + "…" : s.title;
                  })()}
                </text>
                {s.due_date && !byDate && (
                  <text
                    x={kids ? p.x - r - 3 : p.x + r + 8}
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

          {/* Переключатели сворачивания ветвей */}
          {placed.map((p) => {
            const s = p.node.step;
            const kids = p.node.children.length;
            if (!kids) return null;
            const isCollapsed = collapsed.has(s.id);
            const r = s.is_milestone ? 13 : 9;
            const bx = p.x + r + 9;
            const dim = hover !== null && hover !== s.id;

            return (
              <g
                key={`c-${s.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleNode(s.id);
                }}
                onMouseEnter={() => setHover(s.id)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: "pointer", opacity: dim ? 0.35 : 1, transition: "opacity .15s" }}
              >
                <circle cx={bx} cy={p.y} r={7.5} fill="#ffffff" stroke="#cbd5e1" strokeWidth={1.3} />
                <line x1={bx - 3.5} y1={p.y} x2={bx + 3.5} y2={p.y} stroke="#475569" strokeWidth={1.6} strokeLinecap="round" />
                {isCollapsed && (
                  <line x1={bx} y1={p.y - 3.5} x2={bx} y2={p.y + 3.5} stroke="#475569" strokeWidth={1.6} strokeLinecap="round" />
                )}
                {isCollapsed && (
                  <text x={bx + 12} y={p.y + 3.5} fontSize={9.5} fontWeight={600} fill="#94a3b8">
                    +{kids}
                  </text>
                )}
                <title>{isCollapsed ? `Развернуть (${kids})` : "Свернуть ветвь"}</title>
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