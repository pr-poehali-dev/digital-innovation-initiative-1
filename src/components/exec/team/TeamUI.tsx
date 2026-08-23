import Icon from "@/components/ui/icon";
import { LOAD_STATE, RACI_ROLE, TeamMember } from "@/lib/execPeopleApi";

export function RaciTag({ role, backup = false }: { role: string; backup?: boolean }) {
  const r = RACI_ROLE[role] || RACI_ROLE.R;
  return (
    <span
      title={r.title + (backup ? " (замещающий)" : "")}
      className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold border ${r.cls} ${
        backup ? "opacity-70" : ""
      }`}
    >
      {r.short}
    </span>
  );
}

export function LoadBadge({
  pct,
  state,
  size = "sm",
}: {
  pct: number | null;
  state: string;
  size?: "sm" | "lg";
}) {
  const s = LOAD_STATE[state] || LOAD_STATE.unknown;
  return (
    <span
      className={`inline-flex items-center rounded-md border font-medium ${s.cls} ${
        size === "lg" ? "px-2.5 py-1 text-sm" : "px-1.5 py-0.5 text-[11px]"
      }`}
    >
      {pct === null ? "—" : `${pct}%`}
    </span>
  );
}

export function LevelBar({ level, target }: { level: number; target?: number | null }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`Уровень ${level} из 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`w-1.5 h-4 rounded-sm ${
            n <= level
              ? "bg-violet-500"
              : target && n <= target
                ? "bg-violet-200"
                : "bg-slate-200"
          }`}
        />
      ))}
      <span className="ml-1 text-xs text-slate-500 tabular-nums">
        {level}
        {target && target > level ? `→${target}` : ""}
      </span>
    </span>
  );
}

export function PersonWarnings({ p }: { p: TeamMember }) {
  const w: { text: string; cls: string; icon: string }[] = [];
  if (!p.hours_per_week) w.push({ text: "Нет ёмкости", cls: "text-amber-600", icon: "Clock" });
  if (!p.competency_count) w.push({ text: "Нет компетенций", cls: "text-amber-600", icon: "Award" });
  if (!p.open_steps && !p.owned_functions)
    w.push({ text: "Нет назначений", cls: "text-slate-500", icon: "CircleDashed" });
  if (p.overdue_steps > 0)
    w.push({ text: `Просрочено: ${p.overdue_steps}`, cls: "text-red-600", icon: "TriangleAlert" });
  if (!w.length) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
      {w.map((x) => (
        <span key={x.text} className={`inline-flex items-center gap-1 text-[11px] ${x.cls}`}>
          <Icon name={x.icon} size={11} />
          {x.text}
        </span>
      ))}
    </div>
  );
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const parts = name.replace(/^\[[^\]]*\]\s*/, "").trim().split(/\s+/);
  const initials = (parts[0]?.[0] || "") + (parts[1]?.[0] || "");
  const palette = [
    "bg-violet-100 text-violet-700",
    "bg-blue-100 text-blue-700",
    "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
    "bg-cyan-100 text-cyan-700",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const cls = palette[Math.abs(hash) % palette.length];
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-semibold flex-shrink-0 ${cls}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials.toUpperCase() || "?"}
    </span>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-xs text-slate-600 hover:text-slate-900 transition-colors"
    >
      <span
        className={`relative w-8 h-[18px] rounded-full transition-colors ${
          checked ? "bg-violet-600" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all ${
            checked ? "left-[17px]" : "left-0.5"
          }`}
        />
      </span>
      {label}
    </button>
  );
}

export function StatChip({
  icon,
  value,
  label,
  tone = "default",
  onClick,
}: {
  icon: string;
  value: number | string;
  label: string;
  tone?: "default" | "danger" | "success" | "warning";
  onClick?: () => void;
}) {
  const tones = {
    default: "text-slate-600",
    danger: "text-red-600",
    success: "text-green-600",
    warning: "text-amber-600",
  };
  return (
    <span
      onClick={onClick}
      title={label}
      className={`inline-flex items-center gap-1 text-xs ${tones[tone]} ${
        onClick ? "cursor-pointer hover:underline" : ""
      }`}
    >
      <Icon name={icon} size={12} />
      <span className="tabular-nums font-medium">{value}</span>
    </span>
  );
}
