// Утилита масштабирования временной шкалы для дорожной карты и шкалы вех.
// Чистые функции без React — переиспользуются в RoadmapView и MilestonesTimelineView.

export type ScaleKind = "month" | "quarter" | "year";

export interface ScaleTick {
  date: Date;
  label: string;
  isYearStart: boolean;
}

const DAY_MS = 86400000;

export function parseISODate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s + (s.length === 10 ? "T00:00:00" : ""));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** Автоматический подбор масштаба по ширине диапазона в днях. */
export function autoScale(days: number): ScaleKind {
  if (days <= 120) return "month";
  if (days <= 420) return "quarter";
  return "year";
}

export function pxPerDay(scale: ScaleKind): number {
  return { month: 9, quarter: 4, year: 1.3 }[scale];
}

/** Ширина одной "ячейки" заголовка (месяц) в пикселях для данного масштаба. */
export function monthWidth(scale: ScaleKind): number {
  return pxPerDay(scale) * 30.44;
}

const MONTH_LABEL = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

/** Строит тики заголовка по месяцам от rangeStart до rangeEnd включительно. */
export function buildMonthTicks(rangeStart: Date, rangeEnd: Date): ScaleTick[] {
  const ticks: ScaleTick[] = [];
  const cur = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  while (cur <= rangeEnd) {
    ticks.push({
      date: new Date(cur),
      label: `${MONTH_LABEL[cur.getMonth()]} ${cur.getFullYear()}`,
      isYearStart: cur.getMonth() === 0,
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return ticks;
}

/** Позиция даты в пикселях от начала диапазона. */
export function datePx(rangeStart: Date, date: Date, scale: ScaleKind): number {
  return diffDays(rangeStart, date) * pxPerDay(scale);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isoAddMonths(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** Диапазон дат по умолчанию для масштаба, отталкиваясь от сегодняшней даты. */
export function defaultRangeForScale(scale: ScaleKind): { from: string; to: string } {
  const today = todayISO();
  if (scale === "month") return { from: isoAddMonths(today, -1), to: isoAddMonths(today, 2) };
  if (scale === "quarter") return { from: isoAddMonths(today, -1), to: isoAddMonths(today, 5) };
  return { from: isoAddMonths(today, -2), to: isoAddMonths(today, 10) };
}
