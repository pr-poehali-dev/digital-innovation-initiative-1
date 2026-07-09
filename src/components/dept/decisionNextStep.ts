// Derived «что делать дальше» — выводится из уже существующей семантики решения,
// без нового бэкенда. Единый источник подсказок для карточки функции и rollup.

export type NextStepTone = "info" | "action" | "warn" | "ready";
export type NextStepCTA = { label: string; target: string };

export type NextStep = {
  tone: NextStepTone;
  title: string;
  description: string;
  ctas: NextStepCTA[];
};

// Возможные target'ы CTA (обрабатываются в UI-компонентах):
//  practices | capabilities | candidates | bundles | shortlist | summary | roadmap | next_function

type FnDecisionInput = {
  selection_state: "no_shortlist" | "no_preferred" | "preferred_selected";
  has_required_gaps?: boolean;
  required_gaps_count?: number;
  has_drift?: boolean;
  has_archived_supply?: boolean;
  pilot_ready?: boolean;
};

export function functionNextStep(d: FnDecisionInput): NextStep {
  if (d.selection_state === "no_shortlist") {
    return {
      tone: "action",
      title: "Соберите шортлист",
      description: "Решение по функции ещё не начато. Откройте кандидатные наборы модулей и добавьте 1–3 рабочих варианта в шортлист.",
      ctas: [{ label: "Открыть наборы", target: "bundles" }],
    };
  }
  if (d.selection_state === "no_preferred") {
    return {
      tone: "action",
      title: "Выберите preferred",
      description: "Шортлист есть, но предпочтительный вариант не выбран — решение по функции ещё не зафиксировано. Отметьте один набор как «Предпочтителен».",
      ctas: [{ label: "Открыть шортлист", target: "shortlist" }],
    };
  }
  // preferred_selected
  if (d.has_required_gaps) {
    return {
      tone: "warn",
      title: `Закройте required-gaps (${d.required_gaps_count || 0})`,
      description: "Решение выбрано, но required-capability закрыты не полностью. Скорректируйте практики, выберите другой вариант из шортлиста или соберите новый набор.",
      ctas: [
        { label: "К наборам", target: "bundles" },
        { label: "Проверить практики", target: "practices" },
      ],
    };
  }
  if (d.has_archived_supply) {
    return {
      tone: "warn",
      title: "Замените архивный supply",
      description: "В выбранном решении есть архивные модули или продукты. Пересмотрите состав preferred и замените их на актуальные (сохраните новый набор).",
      ctas: [{ label: "Открыть шортлист", target: "shortlist" }, { label: "К наборам", target: "bundles" }],
    };
  }
  if (d.has_drift) {
    return {
      tone: "warn",
      title: "Обновите устаревшее решение",
      description: "Preferred расходится с текущим derived-состоянием (дрейф). Сравните выбранный вариант с актуальными наборами и при необходимости обновите решение.",
      ctas: [{ label: "Сравнить с наборами", target: "bundles" }, { label: "Открыть шортлист", target: "shortlist" }],
    };
  }
  // pilot_ready / clean
  return {
    tone: "ready",
    title: "Готово к пилоту",
    description: "Required закрыт, дрейфа и архивного supply нет. Функцию можно включать в дорожную карту пилотов — переходите к следующей.",
    ctas: [{ label: "Открыть дорожную карту", target: "roadmap" }],
  };
}

type RollupSummaryInput = {
  no_shortlist_count: number;
  no_preferred_count: number;
  preferred_with_required_gaps_count: number;
  preferred_with_drift_count: number;
  preferred_with_archived_supply_count: number;
  pilot_ready_count: number;
  functions_total: number;
};

// Приоритетный «с чего начать» на уровне портфеля.
// Возвращает next-step + рекомендуемый фильтр таблицы (health filter key).
export function rollupNextStep(s: RollupSummaryInput): NextStep & { filter: string } {
  if (s.no_shortlist_count > 0) {
    return {
      tone: "action", filter: "no_shortlist",
      title: `Соберите шортлист для ${s.no_shortlist_count} функц.`,
      description: "Сначала соберите варианты решений там, где их пока нет.",
      ctas: [{ label: "Показать эти функции", target: "filter:no_shortlist" }],
    };
  }
  if (s.no_preferred_count > 0) {
    return {
      tone: "action", filter: "no_preferred",
      title: `Зафиксируйте preferred для ${s.no_preferred_count} функц.`,
      description: "Шортлист уже есть — выберите предпочтительный вариант, чтобы зафиксировать решение.",
      ctas: [{ label: "Показать эти функции", target: "filter:no_preferred" }],
    };
  }
  if (s.preferred_with_required_gaps_count > 0) {
    return {
      tone: "warn", filter: "required_gaps",
      title: `Разберите required-gaps в ${s.preferred_with_required_gaps_count} функц.`,
      description: "Решения выбраны, но у части функций не закрыты required-capability.",
      ctas: [{ label: "Показать эти функции", target: "filter:required_gaps" }],
    };
  }
  if (s.preferred_with_drift_count > 0 || s.preferred_with_archived_supply_count > 0) {
    return {
      tone: "warn", filter: "drift",
      title: "Обновите устаревшие решения",
      description: "У части функций preferred устарел (дрейф) или содержит архивный supply.",
      ctas: [{ label: "Показать с дрейфом", target: "filter:drift" }],
    };
  }
  return {
    tone: "ready", filter: "pilot_ready",
    title: "База готова — переходите к пилотам",
    description: `Готовы к пилоту: ${s.pilot_ready_count}. Соберите волны в дорожной карте пилотов.`,
    ctas: [{ label: "Открыть дорожную карту", target: "roadmap" }],
  };
}

export const TONE_STYLES: Record<NextStepTone, { box: string; icon: string; iconName: string }> = {
  info: { box: "border-slate-200 bg-slate-50", icon: "text-slate-500", iconName: "Info" },
  action: { box: "border-blue-200 bg-blue-50", icon: "text-blue-600", iconName: "ArrowRight" },
  warn: { box: "border-amber-200 bg-amber-50", icon: "text-amber-600", iconName: "TriangleAlert" },
  ready: { box: "border-emerald-200 bg-emerald-50", icon: "text-emerald-600", iconName: "CircleCheck" },
};
