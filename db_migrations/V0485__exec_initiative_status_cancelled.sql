INSERT INTO ref_dictionary_value (type_code, code, title, sort_order, color, is_system)
VALUES ('initiative_status', 'cancelled', 'Прекращена', 85, 'red', true)
ON CONFLICT (type_code, code) DO NOTHING;
