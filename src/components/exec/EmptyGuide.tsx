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
      <div className="w-12 h-12 rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center mx-auto mb-4">
        <Icon name={icon} size={22} className="text-gray-600" />
      </div>
      <p className="text-sm text-white font-medium mb-2">{what}</p>
      <p className="text-sm text-gray-500 leading-relaxed mb-4">{why}</p>

      <div className="p-3 rounded-lg bg-gray-900/60 border border-gray-800 text-left mb-5">
        <p className="text-xs text-gray-600 mb-1">Например</p>
        <p className="text-sm text-gray-400 leading-relaxed">{example}</p>
      </div>

      {disabled ? (
        <p className="text-xs text-amber-300 flex items-center justify-center gap-1.5">
          <Icon name="Info" size={13} />
          {disabledHint}
        </p>
      ) : (
        <button
          onClick={onAction}
          className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors inline-flex items-center gap-2"
        >
          <Icon name="Plus" size={15} />
          {actionLabel}
        </button>
      )}
    </div>
  );
}
