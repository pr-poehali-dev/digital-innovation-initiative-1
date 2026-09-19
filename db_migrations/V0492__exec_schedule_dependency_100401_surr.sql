-- Зависимости (FS) между вехами инициативы 100401 СУРР — только те, что
-- прямо следуют из содержания слайдов (риск, привязанный к веха 1.1,
-- описывает срыв срока именно вехи 1 из-за незакрытых замечаний). Веха 2
-- (договор с вендором) и веха 6 (прекращение) НЕ связаны зависимостью —
-- в презентации нет явного указания на их очерёдность относительно
-- остальных вех, поэтому связь не выдумывается.
INSERT INTO exec_schedule_dependency (dependency_type, src_kind, src_id, tgt_kind, tgt_id, lag_days, note, created_by)
SELECT 'FS', 'milestone', m11.id, 'milestone', m1.id, 0,
       'Устранение замечаний БИБ/ДСИТ — предпосылка для ввода СУРР в ПЭ. Перенесено на основании слайда 5 презентации (риск «Изменение входных данных, требований»). ТРЕБУЕТ УТОЧНЕНИЯ: плановая дата предшественника (30.10) позже плановой даты веха 1 (30.09) — очерёдность в источнике указана номером пункта, но даты противоречат ей; для корректного расчёта сетевого графика нужна проверка владельцем инициативы.',
       'import:presentation'
FROM exec_milestone m1
JOIN exec_milestone m11 ON m11.initiative_id = m1.initiative_id AND m11.outline_code = '1.1'
WHERE m1.initiative_id = (SELECT id FROM exec_initiative WHERE external_code = '100401')
  AND m1.outline_code = '1'
  AND NOT EXISTS (
      SELECT 1 FROM exec_schedule_dependency d
      WHERE d.src_kind = 'milestone' AND d.src_id = m11.id AND d.tgt_kind = 'milestone' AND d.tgt_id = m1.id
        AND d.archived_at IS NULL
  );

INSERT INTO exec_schedule_dependency (dependency_type, src_kind, src_id, tgt_kind, tgt_id, lag_days, note, created_by)
SELECT 'FS', 'milestone', m12.id, 'milestone', m1.id, 0,
       'Утверждение приказа о переносе срока ОЭ — формальная предпосылка для ввода СУРР в ПЭ. Перенесено по номеру пункта (1.2 — подпункт вехи 1). ТРЕБУЕТ УТОЧНЕНИЯ: даты противоречат номерной очерёдности (см. зависимость 1.1 → 1) — нужна проверка владельцем инициативы.',
       'import:presentation'
FROM exec_milestone m1
JOIN exec_milestone m12 ON m12.initiative_id = m1.initiative_id AND m12.outline_code = '1.2'
WHERE m1.initiative_id = (SELECT id FROM exec_initiative WHERE external_code = '100401')
  AND m1.outline_code = '1'
  AND NOT EXISTS (
      SELECT 1 FROM exec_schedule_dependency d
      WHERE d.src_kind = 'milestone' AND d.src_id = m12.id AND d.tgt_kind = 'milestone' AND d.tgt_id = m1.id
        AND d.archived_at IS NULL
  );
