import Icon from "@/components/ui/icon";
import type { Block } from "@/lib/bizPresentationsApi";

// Хекс-цвета для SVG (Tailwind-классы внутри <svg> не работают надёжно во всех рендерерах)
const HEX: Record<string, string> = {
  violet: "#8b5cf6",
  blue: "#3b82f6",
  amber: "#f59e0b",
  emerald: "#10b981",
  green: "#10b981",
  red: "#ef4444",
  pink: "#ec4899",
  gray: "#9ca3af",
  orange: "#f97316",
};

function hex(c?: string): string {
  return HEX[c || "violet"] || HEX.violet;
}

const BG_CLS: Record<string, string> = {
  violet: "bg-violet-500",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  green: "bg-emerald-500",
  red: "bg-red-500",
  pink: "bg-pink-500",
  gray: "bg-gray-400",
  orange: "bg-orange-500",
};

/** Центр (хаб) + кольцо узлов вокруг него, стянутых «обручами» и связанных
 * пульсирующими линиями — метафора Центра, который обвязывает подразделения
 * Блока ВК и обеспечивает их слаженную работу, как обручи бочку / кровоток организм. */
export default function OrbitDiagram({ block }: { block: Block }) {
  const center = block.center || { title: "Центр" };
  const nodes = block.nodes || [];
  const n = Math.max(nodes.length, 1);
  const R = 36;
  const positions = nodes.map((_, i) => {
    const angle = ((-90 + (i * 360) / n) * Math.PI) / 180;
    return { x: 50 + R * Math.cos(angle), y: 50 + R * Math.sin(angle) };
  });

  return (
    <div className="relative w-full max-w-[460px] aspect-square mx-auto select-none">
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full overflow-visible">
        <defs>
          <radialGradient id="orbitHubGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={hex(center.color)} stopOpacity="0.35" />
            <stop offset="100%" stopColor={hex(center.color)} stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx={50} cy={50} r={20} fill="url(#orbitHubGlow)" />

        {/* Обручи бочки: два кольца, стягивающие узлы, медленно вращаются в разные стороны */}
        <circle
          cx={50} cy={50} r={27.5}
          fill="none" stroke="#f97316" strokeOpacity={0.35} strokeWidth={0.6}
          strokeDasharray="3 2.5"
        >
          <animateTransform
            attributeName="transform" type="rotate"
            from="0 50 50" to="360 50 50" dur="26s" repeatCount="indefinite"
          />
        </circle>
        <circle
          cx={50} cy={50} r={31.5}
          fill="none" stroke="#8b5cf6" strokeOpacity={0.3} strokeWidth={0.6}
          strokeDasharray="1 3"
        >
          <animateTransform
            attributeName="transform" type="rotate"
            from="360 50 50" to="0 50 50" dur="20s" repeatCount="indefinite"
          />
        </circle>

        {/* Сосуды-связи: от центра к каждому узлу, с «кровотоком» — бегущей точкой */}
        {positions.map((p, i) => {
          const c = hex(nodes[i]?.color);
          const pathD = `M 50 50 L ${p.x} ${p.y}`;
          return (
            <g key={i}>
              <path d={pathD} stroke={c} strokeOpacity={0.28} strokeWidth={0.55} fill="none" />
              <circle r={1.15} fill={c}>
                <animateMotion dur={`${2 + (i % 3) * 0.5}s`} repeatCount="indefinite" path={pathD} />
              </circle>
              <circle r={0.85} fill={c} opacity={0.6}>
                <animateMotion
                  dur={`${2 + (i % 3) * 0.5}s`} repeatCount="indefinite" path={pathD}
                  begin={`${0.6 + i * 0.15}s`}
                />
              </circle>
            </g>
          );
        })}
      </svg>

      {/* Центральный хаб */}
      <div
        className="absolute z-10 flex flex-col items-center justify-center text-center rounded-full shadow-xl"
        style={{
          left: "50%", top: "50%", transform: "translate(-50%,-50%)",
          width: "26%", height: "26%",
          background: `radial-gradient(circle at 35% 30%, ${hex(center.color)}, ${hex(center.color)}dd)`,
        }}
      >
        <span className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ background: hex(center.color) }} />
        <Icon name={center.icon || "HeartPulse"} size={22} className="text-white relative" />
        <p className="text-white font-extrabold text-[11px] md:text-sm leading-tight mt-1 px-2 relative">
          {center.title}
        </p>
        {center.text && (
          <p className="hidden md:block text-white/80 text-[9px] leading-snug mt-0.5 px-3 relative">
            {center.text}
          </p>
        )}
      </div>

      {/* Узлы вокруг — структурные подразделения */}
      {nodes.map((node, i) => {
        const p = positions[i];
        return (
          <div
            key={i}
            className="absolute z-10 flex flex-col items-center text-center"
            style={{ left: `${p.x}%`, top: `${p.y}%`, transform: "translate(-50%,-50%)", width: "30%" }}
          >
            <div className="bg-white rounded-2xl border border-gray-200 shadow-md px-2.5 py-2 w-full">
              <span
                className={`inline-flex w-7 h-7 rounded-lg items-center justify-center mb-1 ${BG_CLS[node.color || "violet"]}`}
              >
                <Icon name={node.icon || "Building2"} size={14} className="text-white" />
              </span>
              <p className="text-[10px] md:text-xs font-bold text-gray-900 leading-tight">{node.title}</p>
              {node.text && (
                <p className="text-[8px] md:text-[10px] text-gray-500 leading-snug mt-0.5">{node.text}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}