// Светлая дизайн-система бизнес-презентаций (хаб «Траектория»)
// Стиль: белые карточки, крупные скругления, оранжево-фиолетовые градиенты,
// Montserrat для заголовков, Rubik для текста. Смысловая палитра по контенту.

export const BIZ_FONTS = "'Montserrat','Rubik',-apple-system,sans-serif";
export const BIZ_BODY_FONT = "'Rubik','Montserrat',-apple-system,sans-serif";

export const COVER_GRADIENTS: Record<string, string> = {
  violet: "from-violet-600 via-purple-600 to-fuchsia-600",
  blue: "from-blue-600 via-indigo-600 to-purple-600",
  orange: "from-orange-500 via-amber-500 to-orange-600",
  emerald: "from-emerald-500 via-teal-600 to-cyan-600",
  pink: "from-pink-500 via-rose-500 to-fuchsia-600",
};

export type SemColor = "green" | "amber" | "red" | "blue" | "violet" | "pink" | "gray" | "orange";

export const SEM_COLOR: Record<SemColor, { bg: string; border: string; text: string; solid: string; iconBg: string }> = {
  green: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", solid: "bg-emerald-500", iconBg: "bg-emerald-500" },
  amber: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", solid: "bg-amber-500", iconBg: "bg-amber-500" },
  red: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", solid: "bg-red-500", iconBg: "bg-red-500" },
  blue: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", solid: "bg-blue-500", iconBg: "bg-blue-500" },
  violet: { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-700", solid: "bg-violet-500", iconBg: "bg-violet-500" },
  pink: { bg: "bg-pink-50", border: "border-pink-200", text: "text-pink-700", solid: "bg-pink-500", iconBg: "bg-pink-500" },
  gray: { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-700", solid: "bg-gray-400", iconBg: "bg-gray-400" },
  orange: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", solid: "bg-orange-500", iconBg: "bg-orange-500" },
};

export function semColor(c?: string): typeof SEM_COLOR[SemColor] {
  return SEM_COLOR[(c as SemColor) || "violet"] || SEM_COLOR.violet;
}
