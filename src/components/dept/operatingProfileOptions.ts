// Controlled values для операционного профиля функции.
// Пустое значение = "ещё не заполнено"; "unknown" = "оценивали, данных нет".

export type Opt = { value: string; label: string };

export const FREQUENCY: Opt[] = [
  { value: "ad_hoc", label: "По запросу" },
  { value: "daily", label: "Ежедневно" },
  { value: "weekly", label: "Еженедельно" },
  { value: "monthly", label: "Ежемесячно" },
  { value: "quarterly", label: "Ежеквартально" },
  { value: "continuous", label: "Непрерывно" },
  { value: "unknown", label: "Неизвестно" },
];

export const VOLUME: Opt[] = [
  { value: "1_10", label: "1–10" },
  { value: "11_100", label: "11–100" },
  { value: "101_1000", label: "101–1000" },
  { value: "1000_plus", label: "1000+" },
  { value: "unknown", label: "Неизвестно" },
];

export const SHARE: Opt[] = [
  { value: "low", label: "Низкая" },
  { value: "medium", label: "Средняя" },
  { value: "high", label: "Высокая" },
  { value: "unknown", label: "Неизвестно" },
];

export const SLA: Opt[] = [
  { value: "none", label: "Нет" },
  { value: "soft", label: "Мягкий" },
  { value: "hard", label: "Жёсткий" },
  { value: "regulatory", label: "Регуляторный" },
  { value: "unknown", label: "Неизвестно" },
];

export const PARTICIPANTS: Opt[] = [
  { value: "1", label: "1" },
  { value: "2_3", label: "2–3" },
  { value: "4_7", label: "4–7" },
  { value: "8_plus", label: "8+" },
  { value: "unknown", label: "Неизвестно" },
];

export const SENSITIVITY: Opt[] = [
  { value: "none", label: "Нет" },
  { value: "internal", label: "Внутренние" },
  { value: "personal", label: "Персональные" },
  { value: "financial", label: "Финансовые" },
  { value: "regulated", label: "Регулируемые" },
  { value: "unknown", label: "Неизвестно" },
];

export const AI_POLICY: Opt[] = [
  { value: "allowed", label: "Разрешён" },
  { value: "restricted", label: "Ограничен" },
  { value: "forbidden", label: "Запрещён" },
  { value: "unknown", label: "Неизвестно" },
];

export const DEPLOYMENT: Opt[] = [
  { value: "on_prem", label: "On-prem" },
  { value: "cloud", label: "Cloud" },
  { value: "hybrid", label: "Hybrid" },
  { value: "unknown", label: "Неизвестно" },
];

export const SOURCE_KIND: Opt[] = [
  { value: "interview", label: "Интервью" },
  { value: "document", label: "Документ" },
  { value: "estimate", label: "Оценка" },
  { value: "observed", label: "Наблюдение" },
];

export const INPUT_TYPES: Opt[] = [
  { value: "structured_data", label: "Структурированные данные" },
  { value: "semi_structured", label: "Полуструктурированные" },
  { value: "documents", label: "Документы" },
  { value: "email", label: "Email" },
  { value: "scans", label: "Сканы" },
  { value: "external_sources", label: "Внешние источники" },
];

export const OUTPUT_TYPES: Opt[] = [
  { value: "decision", label: "Решение" },
  { value: "document", label: "Документ" },
  { value: "approval", label: "Согласование" },
  { value: "report", label: "Отчёт" },
  { value: "notification", label: "Уведомление" },
  { value: "data_update", label: "Обновление данных" },
];

export const PAIN_POINTS: Opt[] = [
  { value: "manual_reentry", label: "Ручной перенос данных" },
  { value: "long_cycle_time", label: "Долгий цикл" },
  { value: "many_approvals", label: "Много согласований" },
  { value: "low_visibility", label: "Низкая прозрачность" },
  { value: "high_error_rate", label: "Высокий % ошибок" },
  { value: "knowledge_dependency", label: "Зависимость от эксперта" },
  { value: "document_heaviness", label: "Много документов" },
  { value: "bottlenecks", label: "Узкие места" },
  { value: "compliance_risk", label: "Комплаенс-риск" },
];

export type OperatingProfile = {
  frequency_band?: string | null;
  volume_band?: string | null;
  manual_share_band?: string | null;
  rule_based_share_band?: string | null;
  expert_judgment_share_band?: string | null;
  exception_rate_band?: string | null;
  sla_criticality?: string | null;
  audit_required?: boolean | null;
  input_types?: string[];
  output_types?: string[];
  participants_band?: string | null;
  systems_involved?: string | null;
  sensitive_data_level?: string | null;
  ai_policy?: string | null;
  deployment_constraint?: string | null;
  pain_points?: string[];
  source_kind?: string | null;
  source_note?: string | null;
  updated_at?: string;
};
