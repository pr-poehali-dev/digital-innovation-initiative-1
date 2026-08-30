import Icon from "@/components/ui/icon";

export type DataKind = "fact" | "calc" | "expert" | "target";

const LABEL: Record<DataKind, { title: string; cls: string; icon: string }> = {
  fact: { title: "Факт", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "BadgeCheck" },
  calc: { title: "Расчёт", cls: "bg-blue-50 text-blue-700 border-blue-200", icon: "Calculator" },
  expert: { title: "Экспертная оценка", cls: "bg-amber-50 text-amber-700 border-amber-200", icon: "UserPen" },
  target: { title: "Целевое значение", cls: "bg-violet-50 text-violet-700 border-violet-200", icon: "Target" },
};

/** Маркировка происхождения данных: факт / расчёт / экспертная оценка / целевое
 * значение. Используется везде, где цифра может быть спутана с подтверждённым
 * фактом — модель Центра, обоснование, презентация. */
export default function DataKindTag({ kind, className = "" }: { kind: DataKind; className?: string }) {
  const l = LABEL[kind];
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${l.cls} ${className}`}
    >
      <Icon name={l.icon} size={10} />
      {l.title}
    </span>
  );
}
