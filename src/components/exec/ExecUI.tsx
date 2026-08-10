import Icon from "@/components/ui/icon";
import { Dictionaries, dictColor, dictTitle } from "@/lib/execCabinetApi";

export function Badge({
  dicts,
  type,
  code,
  className = "",
}: {
  dicts: Dictionaries;
  type: string;
  code: string | null;
  className?: string;
}) {
  if (!code) return <span className="text-gray-600 text-xs">—</span>;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${dictColor(
        dicts,
        type,
        code,
      )} ${className}`}
    >
      {dictTitle(dicts, type, code)}
    </span>
  );
}

export function Metric({
  label,
  value,
  tone = "default",
  icon,
  onClick,
}: {
  label: string;
  value: number | string;
  tone?: "default" | "danger" | "warning" | "success";
  icon?: string;
  onClick?: () => void;
}) {
  const tones = {
    default: "border-gray-800 bg-gray-900/60",
    danger: "border-red-500/30 bg-red-500/5",
    warning: "border-amber-500/30 bg-amber-500/5",
    success: "border-green-500/30 bg-green-500/5",
  };
  const valueTones = {
    default: "text-white",
    danger: "text-red-400",
    warning: "text-amber-400",
    success: "text-green-400",
  };
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-4 ${tones[tone]} ${
        onClick ? "cursor-pointer hover:border-gray-700 transition-colors" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-gray-500 leading-snug">{label}</p>
        {icon && <Icon name={icon} size={15} className="text-gray-600 flex-shrink-0" />}
      </div>
      <p className={`text-2xl font-semibold mt-2 ${valueTones[tone]}`}>{value}</p>
    </div>
  );
}

export function Card({
  title,
  subtitle,
  icon,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-gray-800 bg-gray-900/40 ${className}`}>
      <header className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-800">
        {icon && <Icon name={icon} size={16} className="text-orange-500 flex-shrink-0" />}
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-white truncate">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Empty({ text, icon = "Inbox" }: { text: string; icon?: string }) {
  return (
    <div className="py-8 text-center">
      <Icon name={icon} size={28} className="text-gray-700 mx-auto mb-2" />
      <p className="text-sm text-gray-600">{text}</p>
    </div>
  );
}

export function Loading() {
  return (
    <div className="py-20 flex justify-center">
      <div className="w-7 h-7 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5 text-center">
      <Icon name="TriangleAlert" size={22} className="text-red-400 mx-auto mb-2" />
      <p className="text-sm text-red-300">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 px-3 py-1.5 rounded-lg bg-red-500/15 text-red-300 text-xs hover:bg-red-500/25 transition-colors"
        >
          Повторить
        </button>
      )}
    </div>
  );
}

export function VerificationTag({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    ai_draft: { label: "AI-черновик", cls: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
    user_draft: { label: "Черновик", cls: "bg-gray-500/15 text-gray-400 border-gray-600/30" },
    in_review: { label: "На проверке", cls: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
    confirmed: { label: "Подтверждено", cls: "bg-green-500/15 text-green-300 border-green-500/30" },
    approved: { label: "Утверждено", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
    accepted_by_exception: {
      label: "По исключению",
      cls: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    },
    needs_update: { label: "Требует актуализации", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
    archived: { label: "Архив", cls: "bg-gray-500/15 text-gray-500 border-gray-700/30" },
  };
  const v = map[status] || map.user_draft;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${v.cls}`}>
      {v.label}
    </span>
  );
}

export function fmtDate(d: string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}

export function daysLeft(d: string | null): number | null {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}
