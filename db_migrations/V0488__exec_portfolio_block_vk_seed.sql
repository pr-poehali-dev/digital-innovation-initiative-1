INSERT INTO exec_portfolio (code, title, description, owner_org_unit_id, status)
SELECT 'BLOCK-VK-2026', 'Инициативы Блока внутреннего контроля', 
       'Портфель инициатив по направлению 8.10 «Контроль и аудит» Блока ВК, импортирован из презентации функциональных заказчиков (2026).',
       (SELECT id FROM org_units WHERE code = 'БВК'), 'active'
WHERE NOT EXISTS (SELECT 1 FROM exec_portfolio WHERE code = 'BLOCK-VK-2026');
