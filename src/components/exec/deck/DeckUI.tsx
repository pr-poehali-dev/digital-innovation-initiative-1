import Icon from "@/components/ui/icon";
import { DATA_KIND_LABEL, DataKind, sourceLabel } from "@/lib/execCenterDeckApi";

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" }) : "";

/** Плашка источника данных: факт / расчёт / экспертная оценка / целевое значение.
 * Обязательна на каждом слайде и показателе — не даёт выдать пустое за фактическое. */
export function SourceTag({ kind, asOf }: { kind: DataKind; asOf?: string }) {
  const l = DATA_KIND_LABEL[kind];
  return (
    <span
      title={sourceLabel(kind)}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${l.cls}`}
    >
      <Icon name={kind === "fact" ? "BadgeCheck" : kind === "calc" ? "Calculator" : kind === "expert" ? "UserPen" : "Target"} size={11} />
      {l.title}
      {asOf && <span className="opacity-70 font-normal">· {fmtDate(asOf)}</span>}
    </span>
  );
}

/** Слайд без достаточных данных: не подставляем нули, честно показываем пробел
 * и даём ссылку, куда идти заполнять. */
export function SlideEmptyState({
  text,
  actionLabel,
  onAction,
}: {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-12">
      <Icon name="FileQuestion" size={36} className="text-slate-300 mb-3" />
      <p className="text-base text-slate-500 max-w-md">{text}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700 transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/** Заголовочный блок слайда: заголовок, подзаголовок-тезис, плашка источника. */
export function SlideHeader({
  title,
  thesis,
  kind,
  asOf,
}: {
  title: string;
  thesis?: string | null;
  kind?: DataKind;
  asOf?: string;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900" style={{ fontFamily: "'Montserrat',sans-serif" }}>
          {title}
        </h2>
        {kind && <SourceTag kind={kind} asOf={asOf} />}
      </div>
      {thesis && <p className="text-base text-slate-600 mt-2 max-w-3xl">{thesis}</p>}
    </div>
  );
}

export function NarrativeBlock({ text }: { text?: string | null }) {
  if (!text) return null;
  return (
    <div className="mt-5 rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
      <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{text}</p>
    </div>
  );
}

export function StatTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "warning" | "danger" | "highlight";
}) {
  const cls =
    tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : tone === "danger"
        ? "border-red-200 bg-red-50 text-red-700"
        : tone === "highlight"
          ? "border-violet-200 bg-violet-50 text-violet-700"
          : "border-slate-200 bg-slate-50 text-slate-900";
  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}
