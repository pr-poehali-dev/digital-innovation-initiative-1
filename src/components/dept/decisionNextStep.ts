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

// Компактный статус для заголовка функции в списке (одна строка, один приоритетный шаг).
export type CompactStatus = { tone: NextStepTone; label: string; dot: string; text: string; icon: string };

export function functionCompactStatus(d: FnDecisionInput): CompactStatus {
  if (d.selection_state === "no_shortlist")
    return { tone: "info", label: "Собрать шортлист", dot: "bg-slate-300", text: "text-slate-500", icon: "Circle" };
  if (d.selection_state === "no_preferred")
    return { tone: "action", label: "Выбрать preferred", dot: "bg-amber-400", text: "text-amber-600", icon: "CircleDot" };
  if (d.has_required_gaps)
    return { tone: "warn", label: "Закрыть required-gaps", dot: "bg-rose-500", text: "text-rose-600", icon: "TriangleAlert" };
  if (d.has_archived_supply)
    return { tone: "warn", label: "Заменить архивный supply", dot: "bg-orange-500", text: "text-orange-600", icon: "TriangleAlert" };
  if (d.has_drift)
    return { tone: "warn", label: "Обновить решение", dot: "bg-amber-500", text: "text-amber-600", icon: "TriangleAlert" };
  return { tone: "ready", label: "Готово к пилоту", dot: "bg-emerald-500", text: "text-emerald-600", icon: "CircleCheck" };
}

// Детальный status key (точный) + приоритет для сортировки очереди работы.
export type DecisionStatusKey = "no_shortlist" | "no_preferred" | "required_gaps" | "archived_supply" | "drift" | "pilot_ready";

export function functionStatusKey(d: FnDecisionInput): DecisionStatusKey {
  if (d.selection_state === "no_shortlist") return "no_shortlist";
  if (d.selection_state === "no_preferred") return "no_preferred";
  if (d.has_required_gaps) return "required_gaps";
  if (d.has_archived_supply) return "archived_supply";
  if (d.has_drift) return "drift";
  return "pilot_ready";
}

// Приоритет действия — чем меньше, тем выше в очереди (сортировка списка функций).
export const STATUS_PRIORITY: Record<DecisionStatusKey, number> = {
  no_shortlist: 0, no_preferred: 1, required_gaps: 2, archived_supply: 3, drift: 4, pilot_ready: 5,
};

// Пользовательские фильтры (5 групп) поверх детальных ключей.
export type DecisionFilterGroup = "all" | "no_shortlist" | "no_preferred" | "problems" | "pilot_ready";

export function statusToFilterGroup(k: DecisionStatusKey): Exclude<DecisionFilterGroup, "all"> {
  if (k === "no_shortlist") return "no_shortlist";
  if (k === "no_preferred") return "no_preferred";
  if (k === "pilot_ready") return "pilot_ready";
  return "problems"; // required_gaps | archived_supply | drift
}

export const TONE_STYLES: Record<NextStepTone, { box: string; icon: string; iconName: string }> = {
  info: { box: "border-slate-200 bg-slate-50", icon: "text-slate-500", iconName: "Info" },
  action: { box: "border-blue-200 bg-blue-50", icon: "text-blue-600", iconName: "ArrowRight" },
  warn: { box: "border-amber-200 bg-amber-50", icon: "text-amber-600", iconName: "TriangleAlert" },
  ready: { box: "border-emerald-200 bg-emerald-50", icon: "text-emerald-600", iconName: "CircleCheck" },
};