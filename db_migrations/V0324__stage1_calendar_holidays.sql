-- Производственный календарь: продление до 2030 и российские праздники

INSERT INTO t_p61016064_digital_innovation_i.exec_work_calendar
    (calendar_date, day_type, work_hours, region, is_generated)
SELECT d::date,
       CASE WHEN EXTRACT(ISODOW FROM d) >= 6 THEN 'weekend' ELSE 'work' END,
       CASE WHEN EXTRACT(ISODOW FROM d) >= 6 THEN 0 ELSE 8 END,
       'RU', true
FROM generate_series('2028-01-01'::date, '2030-12-31'::date, '1 day'::interval) d
ON CONFLICT (calendar_date) DO NOTHING;

-- Нерабочие праздничные дни (статья 112 ТК РФ)
UPDATE t_p61016064_digital_innovation_i.exec_work_calendar
SET day_type = 'holiday', work_hours = 0, note = 'Нерабочий праздничный день'
WHERE day_type = 'work'
  AND (
      (EXTRACT(MONTH FROM calendar_date) = 1 AND EXTRACT(DAY FROM calendar_date) BETWEEN 1 AND 8)
   OR (EXTRACT(MONTH FROM calendar_date) = 2 AND EXTRACT(DAY FROM calendar_date) = 23)
   OR (EXTRACT(MONTH FROM calendar_date) = 3 AND EXTRACT(DAY FROM calendar_date) = 8)
   OR (EXTRACT(MONTH FROM calendar_date) = 5 AND EXTRACT(DAY FROM calendar_date) IN (1, 9))
   OR (EXTRACT(MONTH FROM calendar_date) = 6 AND EXTRACT(DAY FROM calendar_date) = 12)
   OR (EXTRACT(MONTH FROM calendar_date) = 11 AND EXTRACT(DAY FROM calendar_date) = 4)
  );

-- Сокращённые предпраздничные дни: рабочий день накануне праздника короче на час
UPDATE t_p61016064_digital_innovation_i.exec_work_calendar w
SET day_type = 'short', work_hours = 7, note = 'Предпраздничный день'
WHERE w.day_type = 'work'
  AND EXISTS (
      SELECT 1 FROM t_p61016064_digital_innovation_i.exec_work_calendar h
      WHERE h.calendar_date = w.calendar_date + 1 AND h.day_type = 'holiday'
  );