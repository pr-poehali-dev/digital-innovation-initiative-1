export type Opt = { value: string; label: string };

export const RELEVANCE: Opt[] = [
  { value: "primary", label: "Ключевая" },
  { value: "supporting", label: "Поддерживающая" },
  { value: "explore", label: "Рассмотреть" },
];

export const RELEVANCE_COLOR: Record<string, string> = {
  primary: "bg-emerald-100 text-emerald-700",
  supporting: "bg-blue-100 text-blue-700",
  explore: "bg-amber-100 text-amber-700",
};

export const SOURCE_KIND: Opt[] = [
  { value: "manual", label: "Вручную" },
  { value: "interview", label: "Интервью" },
  { value: "workshop", label: "Воркшоп" },
  { value: "analysis", label: "Анализ" },
];

export const REASON_TAGS: Opt[] = [
  { value: "reduce_manual_work", label: "Меньше ручного труда" },
  { value: "reduce_cycle_time", label: "Короче цикл" },
  { value: "reduce_errors", label: "Меньше ошибок" },
  { value: "reduce_approvals", label: "Меньше согласований" },
  { value: "improve_visibility", label: "Больше прозрачности" },
  { value: "improve_compliance", label: "Лучше комплаенс" },
  { value: "reduce_knowledge_dependency", label: "Меньше зависимости от эксперта" },
  { value: "improve_service_quality", label: "Выше качество сервиса" },
  { value: "scale_volume", label: "Масштаб объёма" },
  { value: "standardize_execution", label: "Стандартизация" },
];

export const labelOf = (opts: Opt[], v: string) => opts.find((o) => o.value === v)?.label || v;
