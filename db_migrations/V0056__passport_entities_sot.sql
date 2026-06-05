UPDATE t_p61016064_digital_innovation_i.passport_entities e
SET source_of_truth_module_id = m.id, source_of_truth_details = 'Таблица hq_blocks', owner_email = 'platform@project', updated_at = NOW(), updated_by = 'normalization'
FROM t_p61016064_digital_innovation_i.passport_modules m WHERE m.slug = 'hq' AND e.name = 'hq_block';

UPDATE t_p61016064_digital_innovation_i.passport_entities e
SET source_of_truth_module_id = m.id, source_of_truth_details = 'Таблица hq_goals', owner_email = 'platform@project', updated_at = NOW(), updated_by = 'normalization'
FROM t_p61016064_digital_innovation_i.passport_modules m WHERE m.slug = 'hq' AND e.name = 'strategic_goal';

UPDATE t_p61016064_digital_innovation_i.passport_entities e
SET source_of_truth_module_id = m.id, source_of_truth_details = 'Таблица hq_rules', owner_email = 'platform@project', updated_at = NOW(), updated_by = 'normalization'
FROM t_p61016064_digital_innovation_i.passport_modules m WHERE m.slug = 'hq' AND e.name = 'project_rule';

UPDATE t_p61016064_digital_innovation_i.passport_entities e
SET source_of_truth_module_id = m.id, source_of_truth_details = 'hq_decisions (стратегические) + project_decisions (архитектурные)', owner_email = 'platform@project', updated_at = NOW(), updated_by = 'normalization'
FROM t_p61016064_digital_innovation_i.passport_modules m WHERE m.slug = 'hq' AND e.name = 'project_decision';

UPDATE t_p61016064_digital_innovation_i.passport_entities e
SET source_of_truth_module_id = m.id, source_of_truth_details = 'Таблица hq_risks', owner_email = 'platform@project', updated_at = NOW(), updated_by = 'normalization'
FROM t_p61016064_digital_innovation_i.passport_modules m WHERE m.slug = 'hq' AND e.name = 'project_risk';

UPDATE t_p61016064_digital_innovation_i.passport_entities e
SET source_of_truth_module_id = m.id, source_of_truth_details = 'Таблица hq_ideas', owner_email = 'platform@project', updated_at = NOW(), updated_by = 'normalization'
FROM t_p61016064_digital_innovation_i.passport_modules m WHERE m.slug = 'hq' AND e.name = 'project_idea';

UPDATE t_p61016064_digital_innovation_i.passport_entities e
SET source_of_truth_module_id = m.id, source_of_truth_details = 'project_waves + project_wave_items', owner_email = 'platform@project', updated_at = NOW(), updated_by = 'normalization'
FROM t_p61016064_digital_innovation_i.passport_modules m WHERE m.slug = 'project' AND e.name = 'project_wave';

UPDATE t_p61016064_digital_innovation_i.passport_entities e
SET source_of_truth_module_id = m.id, source_of_truth_details = 'Таблица project_gaps', owner_email = 'platform@project', updated_at = NOW(), updated_by = 'normalization'
FROM t_p61016064_digital_innovation_i.passport_modules m WHERE m.slug = 'project' AND e.name = 'project_gap';

UPDATE t_p61016064_digital_innovation_i.passport_entities e
SET source_of_truth_module_id = m.id, source_of_truth_details = 'Таблица passport_modules', owner_email = 'platform@project', updated_at = NOW(), updated_by = 'normalization'
FROM t_p61016064_digital_innovation_i.passport_modules m WHERE m.slug = 'passport' AND e.name = 'passport_module';

UPDATE t_p61016064_digital_innovation_i.passport_entities e
SET source_of_truth_module_id = m.id, source_of_truth_details = 'Таблица passport_entities', owner_email = 'platform@project', updated_at = NOW(), updated_by = 'normalization'
FROM t_p61016064_digital_innovation_i.passport_modules m WHERE m.slug = 'passport' AND e.name = 'passport_entity';

UPDATE t_p61016064_digital_innovation_i.passport_entities e
SET source_of_truth_module_id = m.id, source_of_truth_details = 'Таблица admin_sessions, auth через /backend/admin-auth', owner_email = 'platform@project', updated_at = NOW(), updated_by = 'normalization'
FROM t_p61016064_digital_innovation_i.passport_modules m WHERE m.slug = 'admin-dashboard' AND e.name = 'admin_session';

UPDATE t_p61016064_digital_innovation_i.passport_entities e
SET source_of_truth_module_id = m.id, source_of_truth_details = 'Будет в feature_flags (W3)', owner_email = 'ops@project', updated_at = NOW(), updated_by = 'normalization'
FROM t_p61016064_digital_innovation_i.passport_modules m WHERE m.slug = 'feature-flags' AND e.name = 'feature_flag';

UPDATE t_p61016064_digital_innovation_i.passport_entities e
SET source_of_truth_module_id = m.id, source_of_truth_details = 'Будет в support_tickets (W3)', owner_email = 'support@project', updated_at = NOW(), updated_by = 'normalization'
FROM t_p61016064_digital_innovation_i.passport_modules m WHERE m.slug = 'tickets' AND e.name = 'support_ticket';

UPDATE t_p61016064_digital_innovation_i.passport_entities e
SET source_of_truth_module_id = m.id, source_of_truth_details = 'Будет в funnel_events (W3)', owner_email = 'analytics@project', updated_at = NOW(), updated_by = 'normalization'
FROM t_p61016064_digital_innovation_i.passport_modules m WHERE m.slug = 'analytics' AND e.name = 'funnel_event';
