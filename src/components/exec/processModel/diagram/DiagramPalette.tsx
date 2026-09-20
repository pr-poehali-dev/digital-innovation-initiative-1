import Icon from "@/components/ui/icon";
import { NodeType, NODE_TYPE_ICON } from "@/lib/execProcessModelApi";

const PALETTE_ITEMS: { type: NodeType; label: string }[] = [
  { type: "start", label: "Начало" },
  { type: "end", label: "Завершение" },
  { type: "task", label: "Операция" },
  { type: "gateway", label: "Решение" },
  { type: "subprocess", label: "Подпроцесс" },
  { type: "control", label: "Контроль" },
  { type: "document", label: "Документ" },
  { type: "system", label: "Система" },
  { type: "note", label: "Примечание" },
];

/** Палитра элементов слева — источник drag&drop на холст. */
export default function DiagramPalette({ readOnly }: { readOnly: boolean }) {
  if (readOnly) return null;
  return (
    <div className="w-[92px] flex-shrink-0 border-r border-slate-200 bg-slate-50 p-2 space-y-1.5 overflow-y-auto">
      {PALETTE_ITEMS.map((item) => (
        <div
          key={item.type}
          draggable
          onDragStart={(e) => e.dataTransfer.setData("application/x-node-type", item.type)}
          className="flex flex-col items-center gap-1 p-2 rounded-lg border border-slate-200 bg-white hover:border-violet-300 hover:shadow-sm cursor-grab active:cursor-grabbing transition-colors"
          title={`Перетащите «${item.label}» на холст`}
        >
          <Icon name={NODE_TYPE_ICON[item.type]} size={16} className="text-violet-600" />
          <span className="text-[10px] text-slate-600 text-center leading-tight">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
