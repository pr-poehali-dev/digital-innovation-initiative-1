import { useMemo, useState } from "react";
import Icon from "@/components/ui/icon";
import { Dictionaries, Initiative } from "@/lib/execCabinetApi";

type NodeState = "done" | "risk" | "in_progress" | "paused" | "idea";

const STATE_COLOR: Record<NodeState, { line: string; fill: string; text: string; label: string }> = {
  done:        { line: "#16a34a", fill: "#16a34a", text: "#15803d", label: "Завершена" },
  in_progress: { line: "#7c3aed", fill: "#7c3aed", text: "#6d28d9", label: "В работе" },
  risk:        { line: "#dc2626", fill: "#dc2626", text: "#b91c1c", label: "Риск / просрочка" },
  paused:      { line: "#f59e0b", fill: "#f59e0b", text: "#b45309", label: "Пауза" },
  idea:        { line: "#cbd5e1", fill: "#ffffff", text: "#64748b", label: "Идея / рассмотрение" },
};

/** Порядок этапов жизненного цикла — ветви дерева */
const STAGES: { code: string; title: string }[] = [
  { code: "problem",  title: "Подтверждение проблемы" },
  { code: "concept",  title: "Концепция" },
  { code: "approval", title: "Согласование" },
  { code: "pilot",    title: "Пилот" },
  { code: "rollout",  title: "Внедрение" },
  { code: "effect",   title: "Подтверждение эффекта" },
  { code: "__none",   title: "Этап не указан" },
];

function stateOf(i: Initiative): NodeState {
  if (i.status === "done" || i.status === "closed") return "done";
  if (i.status === "paused") return "paused";
  const end = i.plan_end ? new Date(i.plan_end.slice(0, 10)).getTime() : null;
  const today = new Date(new Date().toDateString()).getTime();
  const active = ["in_progress", "pilot", "scaling"].includes(i.status);
  if (end !== null && end < today && i.status !== "done") return "risk";
  if (!i.owner_person_id) return "risk";
  if (active) return "in_progress";
  if (i.status === "portfolio") return "in_progress";
  return "idea";
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

interface Placed {
  kind: "stage" | "item";
  key: string;
  title: string;
  x: number;
  y: number;
  parentX: number;
  parentY: number;
  state: NodeState;
  count?: number;
  item?: Initiative;
}

export default function InitiativeTreeMap({
  items,
  dicts,
  onItemClick,
}: {
  items: Initiative[];
  dicts: Dictionaries;
  onItemClick?: (i: Initiative) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);

  const stageTitle = (code: string) => {
    if (code === "__none") return "Этап не указан";
    const found = (dicts.initiative_stage || []).find((v) => v.code === code);
    return found?.title || STAGES.find((s) => s.code === code)?.title || code;
  };

  const { placed, width, height, trunkX, trunkTop, trunkBottom } = useMemo(() => {
    const ROW = 40;
    const STAGE_GAP = 16;
    const LEFT = 96;
    const COL = 300;
    const TOP = 34;

    const groups = STAGES.map((s) => ({
      code: s.code,
      list: items.filter((i) => (i.stage || "__none") === s.code),
    })).filter((g) => g.list.length > 0);

    const out: Placed[] = [];
    let cursor = TOP;

    groups.forEach((g) => {
      const startY = cursor;
      const kids: Placed[] = [];

      g.list.forEach((it) => {
        const y = cursor + ROW / 2;
        cursor += ROW;
        const node: Placed = {
          kind: "item",
          key: `i-${it.id}`,
          title: it.title,
          x: LEFT + COL,
          y,
          parentX: LEFT,
          parentY: y,
          state: stateOf(it),
          item: it,
        };
        kids.push(node);
        out.push(node);
      });

      const stageY = kids.length
        ? (Math.min(...kids.map((k) => k.y)) + Math.max(...kids.map((k) => k.y))) / 2
        : startY + ROW / 2;
      kids.forEach((k) => { k.parentY = stageY; });

      // состояние ветви: красный если есть риск, зелёный если все завершены
      const states = g.list.map(stateOf);
      const branchState: NodeState = states.some((s) => s === "risk")
        ? "risk"
        : states.every((s) => s === "done")
          ? "done"
          : states.some((s) => s === "in_progress")
            ? "in_progress"
            : "idea";

      out.push({
        kind: "stage",
        key: `s-${g.code}`,
        title: stageTitle(g.code),
        x: LEFT,
        y: stageY,
        parentX: LEFT - 52,
        parentY: stageY,
        state: branchState,
        count: g.list.length,
      });

      cursor += STAGE_GAP;
    });

    const h = Math.max(cursor + TOP, 240);
    return {
      placed: out,
      width: Math.max(LEFT + COL + 320, 760),
      height: h,
      trunkX: LEFT - 52,
      trunkTop: TOP,
      trunkBottom: h - TOP / 2,
    };
  }, [items, dicts]);

  if (!items.length) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <Icon name="Network" size={40} className="mx-auto text-slate-300 mb-3" />
        <div className="text-slate-500 text-sm">Добавьте инициативы — и здесь вырастет дерево портфеля</div>
      </div>
    );
  }

  const doneCount = items.filter((i) => stateOf(i) === "done").length;
  const riskCount = items.filter((i) => stateOf(i) === "risk").length;
  const stagesCount = new Set(items.map((i) => i.stage || "__none")).size;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Шапка */}
      <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2 mr-auto">
          <Icon name="Network" size={16} className="text-slate-400" />
          <div>
            <div className="font-semibold text-slate-900 text-sm">Дерево инициатив</div>
            <div className="text-xs text-slate-400">
              Ствол — портфель, ветви — этапы жизненного цикла, узлы — инициативы
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          {(["done", "in_progress", "risk", "paused", "idea"] as NodeState[]).map((st) => (
            <span key={st} className="flex items-center gap-1.5 text-slate-500">
              <span
                className="w-2.5 h-2.5 rounded-full border"
                style={{ background: STATE_COLOR[st].fill, borderColor: STATE_COLOR[st].line }}
              />
              {STATE_COLOR[st].label}
            </span>
          ))}
        </div>
      </div>

      {/* Сводка */}
      <div className="px-5 py-2.5 bg-slate-50/70 border-b border-slate-100 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
        <span>Инициатив: <b className="text-slate-700">{items.length}</b></span>
        <span>Завершено: <b className="text-emerald-600">{doneCount}</b></span>
        {riskCount > 0 && <span>Требуют внимания: <b className="text-red-600">{riskCount}</b></span>}
        <span>Этапов задействовано: <b className="text-slate-700">{stagesCount}</b></span>
      </div>

      {/* Схема */}
      <div className="overflow-auto max-h-[70vh]">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block" style={{ minWidth: "100%" }}>
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
            const c = STATE_COLOR[p.state];
            const dim = hover !== null && hover !== p.key;
            return (
              <path
                key={`e-${p.key}`}
                d={tracePath(p.parentX, p.parentY, p.x, p.y)}
                fill="none"
                stroke={c.line}
                strokeWidth={p.kind === "stage" ? 2.4 : 1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={dim ? 0.18 : p.state === "idea" ? 0.5 : 0.75}
                style={{ transition: "opacity .15s" }}
              />
            );
          })}

          {/* Узлы */}
          {placed.map((p) => {
            const c = STATE_COLOR[p.state];
            const dim = hover !== null && hover !== p.key;
            const isStage = p.kind === "stage";
            const r = isStage ? 10 : 6.5;
            const filled = p.state !== "idea";
            const clickable = !isStage && !!onItemClick;

            return (
              <g
                key={`n-${p.key}`}
                onMouseEnter={() => setHover(p.key)}
                onMouseLeave={() => setHover(null)}
                onClick={() => p.item && onItemClick?.(p.item)}
                style={{
                  cursor: clickable ? "pointer" : "default",
                  opacity: dim ? 0.3 : 1,
                  transition: "opacity .15s",
                }}
              >
                {isStage && (
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
                {p.state === "done" && (
                  <path
                    d={`M ${p.x - r * 0.45} ${p.y} l ${r * 0.35} ${r * 0.38} l ${r * 0.6} ${-r * 0.75}`}
                    fill="none"
                    stroke="#fff"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Подпись: у ветви — над узлом (справа уходят инициативы), у листьев — справа */}
                <text
                  x={isStage ? p.x - r - 2 : p.x + r + 8}
                  y={isStage ? p.y - r - 7 : p.y - 1}
                  textAnchor={isStage ? "end" : "start"}
                  fontSize={isStage ? 11.5 : 10.5}
                  fontWeight={isStage ? 700 : 400}
                  fill={c.text}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  strokeLinejoin="round"
                >
                  {p.title.length > 34 ? p.title.slice(0, 33) + "…" : p.title}
                </text>
                {isStage ? (
                  <text
                    x={p.x - r - 2}
                    y={p.y + r + 14}
                    textAnchor="end"
                    fontSize={9}
                    fill="#94a3b8"
                    stroke="#ffffff"
                    strokeWidth={3}
                    paintOrder="stroke"
                    strokeLinejoin="round"
                  >
                    {p.count} инициатив(ы)
                  </text>
                ) : (
                  p.item?.plan_end && (
                    <text
                      x={p.x + r + 8}
                      y={p.y + 11}
                      fontSize={9}
                      fill={p.state === "risk" ? "#dc2626" : "#94a3b8"}
                      stroke="#ffffff"
                      strokeWidth={3}
                      paintOrder="stroke"
                      strokeLinejoin="round"
                    >
                      {p.item.owner_name ? `${p.item.owner_name} · ` : "владелец не назначен · "}
                      до {new Date(p.item.plan_end.slice(0, 10)).toLocaleDateString("ru-RU", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </text>
                  )
                )}

                <title>
                  {isStage
                    ? `${p.title}\nИнициатив: ${p.count}`
                    : `${p.title}\n${STATE_COLOR[p.state].label}${p.item?.owner_name ? `\nВладелец: ${p.item.owner_name}` : "\nВладелец не назначен"}`}
                </title>
              </g>
            );
          })}

          {/* Основание */}
          <g>
            <rect x={trunkX - 38} y={trunkTop - 26} width={76} height={20} rx={6} fill="#475569" opacity={0.9} />
            <text x={trunkX} y={trunkTop - 12} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#fff">
              ПОРТФЕЛЬ
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
        Нажмите на инициативу, чтобы открыть карточку. Красным — просроченные или без владельца
      </div>
    </div>
  );
}