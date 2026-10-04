UPDATE t_p61016064_digital_innovation_i.exec_cabinet_access
SET access_role = 'curator',
    can_confirm = true,
    note = 'Могилевская Т.Н., управляющий эксперт ДРКНОиПНП — ответственная за направление процессного управления: редактирование, подтверждение и публикация моделей'
WHERE LOWER(email) = 't.mogilevskaya@mail.ru';