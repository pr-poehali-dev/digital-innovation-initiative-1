-- To-be процесс для проекта 5
INSERT INTO t_p61016064_digital_innovation_i.wb_processes
  (user_id, title, description, owner_name, department, objective, input_desc, output_desc, systems, maturity_level, digital_maturity, ai_potential)
VALUES (
  1,
  'Обработка контрольных замечаний (to-be)',
  'Целевой процесс: единый цифровой реестр + AI-assisted triage + автоматическая маршрутизация + dashboard контроля',
  'Руководитель внутреннего контроля',
  'Внутренний контроль',
  'Обеспечить автоматизированную регистрацию, AI-assisted классификацию, правила-based маршрутизацию и прозрачный контроль исполнения',
  'Замечание из любого источника в любом формате',
  'Зарегистрированное замечание с категорией, владельцем, SLA и статусом — без ручных операций',
  'Единый реестр, rule engine, AI copilot, BI dashboard',
  'managed',
  'digital',
  'high'
);
