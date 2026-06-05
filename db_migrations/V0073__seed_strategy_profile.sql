UPDATE t_p61016064_digital_innovation_i.admin_strategy_profiles
SET
  mission_text          = 'Помогать пользователю проходить понятную и измеримую траекторию развития: быстро достигать first value, регулярно прогрессировать и не выпадать из процесса.',
  north_star_name       = 'Engaged Learners — пользователи с активной целью и прогрессом',
  north_star_definition = 'Доля активных пользователей с ≥1 активной learning goal, ≥1 check-in за последние 14 дней и наблюдаемым прогрессом по траектории.',
  target_segments_json  = '["Новые пользователи (первые 14 дней)", "Stalled users (цель есть, check-in >7 дней назад)", "Support-heavy users (2+ тикета за период)", "Ungrouped users (без группы/сегмента)", "Users с паттерном reopen/archive"]',
  quarter_goals_json    = '["Повысить activation rate", "Сократить median days to first check-in на 20%", "Снизить stalled goals rate на 15-20%", "Повысить goal completion rate на 10%", "Снизить repeat ticket rate на 15%"]',
  priority_themes_json  = '["Переход first goal → first check-in (главный drop-off)", "Снижение зависания в learning flow", "Персонализация по сегментам и группам", "Снижение нагрузки на support через продуктовые улучшения", "Улучшение completion по слабым сегментам"]',
  non_goals_json        = '["Не строим тяжёлый social layer", "Не делаем heavy gamification без данных", "Не расширяем функциональность без подтверждения метриками", "Не оптимизируем второстепенные метрики в ущерб активации и completion"]',
  updated_by            = 'system_seed',
  updated_at            = NOW()
WHERE workspace_key = 'default';
