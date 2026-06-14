-- Workspace context для проекта 5
INSERT INTO t_p61016064_digital_innovation_i.workspace_context
  (project_id, goals_text, constraints_text, key_facts_text, stakeholders_text, updated_by)
VALUES (
  5,
  'Сократить время первичного разбора замечаний на 30–50%. Снизить долю ручной маршрутизации. Повысить полноту и единообразие классификации. Создать прозрачный реестр отклонений и статусов исполнения.',
  'Чувствительные данные — требования к ИБ и compl. Необходима объяснимость AI-решений. Human review обязателен. Существующие системы (почта, Excel) сложно заменить быстро.',
  'Замечания поступают из разных источников: почта, Excel, Word, внутренние формы. Формат описания не стандартизирован. Первичный triage занимает значительное ручное время. Маршрутизация зависит от опыта конкретного сотрудника.',
  'Внутренний контроль, аудит, владельцы процессов, руководители направлений, исполнители корректирующих мероприятий',
  1
)
ON CONFLICT (project_id) DO UPDATE SET
  goals_text = EXCLUDED.goals_text,
  constraints_text = EXCLUDED.constraints_text,
  key_facts_text = EXCLUDED.key_facts_text,
  stakeholders_text = EXCLUDED.stakeholders_text;
