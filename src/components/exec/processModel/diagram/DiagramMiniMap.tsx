import { DiagramNode } from "@/lib/execProcessModelApi";

const MINIMAP_W = 160;
const MINIMAP_H = 100;

/** Мини-карта: масштабированная проекция всех узлов холста + прямоугольник
 * текущей видимой области. Клик/перетаскивание внутри мини-карты
 * перемещает viewport. */
export default function DiagramMiniMap({
  nodes,
  canvasWidth,
  canvasHeight,
  viewport,
  onNavigate,
}: {
  nodes: DiagramNode[];
  canvasWidth: number;
  canvasHeight: number;
  viewport: { x: number; y: number; width: number; height: number };
  onNavigate: (x: number, y: number) => void;
}) {
  const scaleX = MINIMAP_W / Math.max(canvasWidth, 1);
  const scaleY = MINIMAP_H / Math.max(canvasHeight, 1);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / scaleX;
    const clickY = (e.clientY - rect.top) / scaleY;
    onNavigate(clickX - viewport.width / 2, clickY - viewport.height / 2);
  };

  return (
    <div
      onClick={handleClick}
      className="absolute bottom-3 right-3 bg-white/95 border border-slate-300 rounded-lg shadow-md overflow-hidden cursor-pointer"
      style={{ width: MINIMAP_W, height: MINIMAP_H }}
      title="Мини-карта — клик перемещает вид"
    >
      <div className="relative w-full h-full bg-slate-50">
        {nodes.map((n) => (
          <div key={n.id} className="absolute bg-violet-400 rounded-sm"
            style={{ left: n.pos_x * scaleX, top: n.pos_y * scaleY, width: Math.max(2, n.width * scaleX), height: Math.max(2, n.height * scaleY) }} />
        ))}
        <div className="absolute border-2 border-violet-600 bg-violet-600/10 pointer-events-none"
          style={{
            left: Math.max(0, viewport.x * scaleX), top: Math.max(0, viewport.y * scaleY),
            width: Math.min(MINIMAP_W, viewport.width * scaleX), height: Math.min(MINIMAP_H, viewport.height * scaleY),
          }} />
      </div>
    </div>
  );
}
