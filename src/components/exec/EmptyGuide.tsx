import Icon from "@/components/ui/icon";

export default function EmptyGuide({
  icon,
  what,
  why,
  example,
  actionLabel,
  onAction,
  disabled,
  disabledHint,
}: {
  icon: string;
  what: string;
  why: string;
  example: string;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
  disabledHint?: string;
}) {
  return (
    <div className="py-8 px-4 text-center max-w-lg mx-auto">
      <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center mx-auto mb-4">
        <Icon name={icon} size={22} className="text-slate-400" />
      </div>
      <p className="text-sm text-slate-900 font-medium mb-2">{what}</p>
      <p className="text-sm text-slate-500 leading-relaxed mb-4">{why}</p>

      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-left mb-5">
        <p className="text-xs text-slate-400 mb-1">Например</p>
        <p className="text-sm text-slate-500 leading-relaxed">{example}</p>
      </div>

      {disabled ? (
        <p className="text-xs text-amber-700 flex items-center justify-center gap-1.5">
          <Icon name="Info" size={13} />
          {disabledHint}
        </p>
      ) : (
        <button
          onClick={onAction}
          className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors inline-flex items-center gap-2"
        >
          <Icon name="Plus" size={15} />
          {actionLabel}
        </button>
      )}
    </div>
  );
}
