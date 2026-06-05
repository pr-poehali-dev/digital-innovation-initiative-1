UPDATE t_p61016064_digital_innovation_i.passport_modules
SET owner_email = 'platform@project', backup_owner_email = 'product@project', updated_at = NOW(), updated_by = 'normalization'
WHERE slug IN ('admin-dashboard', 'hq', 'project', 'passport');

UPDATE t_p61016064_digital_innovation_i.passport_modules
SET owner_email = 'product@project', updated_at = NOW(), updated_by = 'normalization'
WHERE slug = 'plan';

UPDATE t_p61016064_digital_innovation_i.passport_modules
SET owner_email = 'ops@project', updated_at = NOW(), updated_by = 'normalization'
WHERE slug IN ('errors', 'feature-flags', 'alerts');

UPDATE t_p61016064_digital_innovation_i.passport_modules
SET owner_email = 'support@project', updated_at = NOW(), updated_by = 'normalization'
WHERE slug = 'tickets';

UPDATE t_p61016064_digital_innovation_i.passport_modules
SET owner_email = 'content@project', updated_at = NOW(), updated_by = 'normalization'
WHERE slug IN ('communications', 'content');

UPDATE t_p61016064_digital_innovation_i.passport_modules
SET owner_email = 'analytics@project', updated_at = NOW(), updated_by = 'normalization'
WHERE slug = 'analytics';
