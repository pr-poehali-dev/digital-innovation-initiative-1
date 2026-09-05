
INSERT INTO biz_presentations (slug, title, subtitle, cover_icon, cover_color, is_published, created_by, updated_by)
VALUES (
  'obosnovanie-tsentra-ccirtkd',
  'Обоснование создания Центра цифровизации и развития технологий контрольной деятельности',
  'ЦЦиРТКД — Блок внутреннего контроля, ДРКНОиПНП',
  'Building2',
  'violet',
  true,
  'kuzmenkoav1982@yandex.ru',
  'kuzmenkoav1982@yandex.ru'
);

INSERT INTO biz_slides (presentation_id, order_index, layout, title, subtitle, blocks_json)
SELECT id, 0, 'cover',
  'Обоснование создания Центра цифровизации и развития технологий контрольной деятельности',
  'ЦЦиРТКД — Блок внутреннего контроля, Департамент по работе с КНО и противодействию недобросовестным практикам',
  '[{"id":"b1","kind":"banner","color":"violet"}]'::jsonb
FROM biz_presentations WHERE slug = 'obosnovanie-tsentra-ccirtkd';

INSERT INTO biz_slides (presentation_id, order_index, layout, title, subtitle, blocks_json)
SELECT id, 1, 'content',
  'Статус и контекст документа',
  'Проектный материал — Центр ещё не создан',
  '[{"id":"b1","kind":"bullets","items":[
    "Владелец документа: Кузьменко А.В., Директор по цифровизации и развитию технологий внутреннего контроля",
    "Организация: ДРКНОиПНП (руководитель — Суханов М.Л.), Блок внутреннего контроля",
    "Материал носит характер проектного предложения — организационное решение о создании Центра ещё не принято",
    "Указанные сотрудники — потенциальные участники будущего Центра, а не действующий штат"
  ]}]'::jsonb
FROM biz_presentations WHERE slug = 'obosnovanie-tsentra-ccirtkd';

INSERT INTO biz_slides (presentation_id, order_index, layout, title, subtitle, blocks_json)
SELECT id, 2, 'content',
  'Перспективная организационная структура ДРКНОиПНП',
  'Три направления департамента, ЦЦиРТКД — проектируемое подразделение',
  '[{"id":"b1","kind":"cards","cards":[
    {"icon":"Sparkles","title":"Кузьменко А.В. — цифровизация и технологии контроля","text":"Предлагается создать ЦЦиРТКД (5 ШЕ): Могилевская Т.Н., Дружинина Ю.А., Беленький М.А., Грибенник Ю.В., Липатов К.Д.","color":"violet","status":"проектируется"},
    {"icon":"Gauge","title":"Игнатов Д.Б. — эффективность контрольно-надзорной деятельности","text":"Управление аналитической поддержки (11 ШЕ, 3 ШЕ передаются в ЦЦиРТКД) и Центр сопровождения проверок (7 ШЕ)","color":"blue"},
    {"icon":"ShieldAlert","title":"Громова З.Е. — взаимодействие с контрольно-надзорными органами","text":"Управление противодействия недобросовестным практикам (16 ШЕ, 2 ШЕ передаются в ЦЦиРТКД) и Центр мониторинга операций на финрынке","color":"amber"}
  ]}]'::jsonb
FROM biz_presentations WHERE slug = 'obosnovanie-tsentra-ccirtkd';

INSERT INTO biz_slides (presentation_id, order_index, layout, title, subtitle, blocks_json)
SELECT id, 3, 'content',
  'Предлагаемое решение',
  'Внутреннее перераспределение без роста штатной численности',
  '[
    {"id":"b1","kind":"bullets","items":[
      "Создать ЦЦиРТКД численностью 5 ШЕ: 3 ШЕ из УАП и 2 ШЕ из УПНП",
      "Включить Центр сопровождения проверок (ЦСП) в состав УАП",
      "Не вводить отдельную руководящую штатную единицу — координацию возложить на Кузьменко А.В."
    ]},
    {"id":"b2","kind":"metrics","metrics":[
      {"value":"16→14","label":"УПНП"},
      {"value":"18→15","label":"УАП (с учётом ЦСП)"},
      {"value":"0→5","label":"ЦЦиРТКД"},
      {"value":"34→34","label":"Всего по Департаменту"}
    ]},
    {"id":"b3","kind":"banner","text":"Общая численность и число руководящих должностей ДРКНОиПНП не увеличиваются","color":"emerald"}
  ]'::jsonb
FROM biz_presentations WHERE slug = 'obosnovanie-tsentra-ccirtkd';

INSERT INTO biz_slides (presentation_id, order_index, layout, title, subtitle, blocks_json)
SELECT id, 4, 'content',
  'Обоснование и преимущества',
  'Устраняем разрыв между ответственностью и полномочиями',
  '[
    {"id":"b1","kind":"text","text":"В распределённой модели Кузьменко А.В. отвечает за результат, но сотрудники формально подчинены другим руководителям — это создаёт конкуренцию приоритетов, зависимость от чужих решений и размывание ответственности."},
    {"id":"b2","kind":"cards","cards":[
      {"icon":"Target","title":"Единое управление ресурсами","text":"Задачи и загрузка распределяются без согласований с другими руководителями","color":"violet"},
      {"icon":"ListOrdered","title":"Единая приоритизация","text":"Единый портфель задач и инициатив снижает риск срыва сроков","color":"blue"},
      {"icon":"Gauge","title":"Прозрачные КПЭ","text":"Цели соответствуют фактически выполняемой работе","color":"emerald"},
      {"icon":"ShieldCheck","title":"Персональная ответственность","text":"Полномочия и ответственность — в одном контуре управления","color":"amber"},
      {"icon":"Layers","title":"Концентрация компетенций","text":"Команда полного цикла — от анализа до внедрения и оценки результата","color":"pink"},
      {"icon":"Handshake","title":"Бюджетная нейтральность","text":"Эффект достигается за счёт перераспределения ресурсов, без роста численности","color":"gray"}
    ]}
  ]'::jsonb
FROM biz_presentations WHERE slug = 'obosnovanie-tsentra-ccirtkd';

INSERT INTO biz_slides (presentation_id, order_index, layout, title, subtitle, blocks_json)
SELECT id, 5, 'content',
  'SWOT-анализ',
  'Преимущества реорганизации превышают возможные ограничения',
  '[{"id":"b1","kind":"cards","cards":[
    {"icon":"ShieldCheck","title":"Сильные стороны","text":"Численность и число руководящих должностей не растут; нормативы соблюдаются; полномочия соответствуют ответственности; компетенции собраны в одной команде","color":"emerald"},
    {"icon":"TriangleAlert","title":"Слабые стороны","text":"Минимальная стартовая численность; ограниченный резерв; зависимость от ключевых специалистов; нужен переходный период","color":"amber"},
    {"icon":"Sparkles","title":"Возможности","text":"Единый портфель инициатив Блока ВК; переиспользование решений; накопление экспертизы; команда для внедрения ИИ","color":"blue"},
    {"icon":"CloudRain","title":"Угрозы","text":"Рост задач без проектного ресурса; перегрузка; сопротивление изменениям; нестабильность проектного финансирования","color":"red"}
  ]}]'::jsonb
FROM biz_presentations WHERE slug = 'obosnovanie-tsentra-ccirtkd';

INSERT INTO biz_slides (presentation_id, order_index, layout, title, subtitle, blocks_json)
SELECT id, 6, 'content',
  'Постоянный и проектный ресурс',
  'Два контура ресурсов ЦЦиРТКД',
  '[{"id":"b1","kind":"roles","roles":[
    {"icon":"Building2","title":"Постоянное ядро — 5 ШЕ","text":"Внутренний перевод, без роста численности ДРКНОиПНП. Постоянные функции, координация портфеля, матричное взаимодействие, внедрение ИИ","color":"violet"},
    {"icon":"Rocket","title":"Проектный ресурс","text":"Привлекается под утверждённые инициативы, финансируется из проектного ФОТ, закрепляется на период реализации","color":"orange"}
  ]}]'::jsonb
FROM biz_presentations WHERE slug = 'obosnovanie-tsentra-ccirtkd';

INSERT INTO biz_slides (presentation_id, order_index, layout, title, subtitle, blocks_json)
SELECT id, 7, 'content',
  'Команда ЦЦиРТКД и распределение ролей',
  'Пять взаимодополняющих компетенций полного цикла',
  '[
    {"id":"b1","kind":"roles","roles":[
      {"icon":"Search","title":"Дружинина Ю.А. — контроль исполнения","text":"Централизованный контроль поручений, отчётность, мониторинг сроков","color":"blue"},
      {"icon":"Layers","title":"Могилевская Т.Н. — аналитик/архитектор","text":"Проработка инициатив, анализ процессов, проектирование решений","color":"violet"},
      {"icon":"Code","title":"Беленький М.А. — разработка автоматизации","text":"Python-решения, прототипирование, техническое сопровождение","color":"emerald"},
      {"icon":"Code","title":"Липатов К.Д. — разработка автоматизации","text":"Программные инструменты, автоматизация операций, работа с данными","color":"emerald"},
      {"icon":"Handshake","title":"Грибенник Ю.В. — координация внедрения","text":"Внутренние коммуникации, доступы и ресурсы, сопровождение внедрения","color":"pink"}
    ]},
    {"id":"b2","kind":"text","text":"Цепочка процесса: выявление потребности → анализ и проектирование → разработка → внедрение и коммуникации → приоритизация и контроль результата (Кузьменко А.В.)"}
  ]'::jsonb
FROM biz_presentations WHERE slug = 'obosnovanie-tsentra-ccirtkd';

INSERT INTO biz_slides (presentation_id, order_index, layout, title, subtitle, blocks_json)
SELECT id, 8, 'content',
  'Планируемая загрузка сотрудников',
  'Предварительное распределение рабочего времени',
  '[{"id":"b1","kind":"table",
    "headers":["Сотрудник","Осн. деятельность","Проекты и развитие","Совместные задачи","Резерв"],
    "rows":[
      ["Могилевская Т.Н.","30%","50%","15%","5%"],
      ["Беленький М.А.","20%","60%","15%","5%"],
      ["Липатов К.Д.","20%","65%","10%","5%"],
      ["Грибенник Ю.В.","40%","25%","30%","5%"],
      ["Дружинина Ю.А.","определяется по факту замера трудозатрат","—","—","—"]
    ]}]'::jsonb
FROM biz_presentations WHERE slug = 'obosnovanie-tsentra-ccirtkd';

INSERT INTO biz_slides (presentation_id, order_index, layout, title, subtitle, blocks_json)
SELECT id, 9, 'content',
  'Как Центр работает в интересах Блока внутреннего контроля',
  'ЦЦиРТКД связывает подразделения Блока ВК в единый контур — как обручи стягивают бочку, как кровоток объединяет организм',
  '[
    {"id":"b1","kind":"orbit",
      "center":{"title":"ЦЦиРТКД","text":"Координация, автоматизация, ИИ","icon":"HeartPulse","color":"violet"},
      "nodes":[
        {"title":"УАП","text":"Аналитическая поддержка","icon":"Gauge","color":"blue"},
        {"title":"ЦСП","text":"Сопровождение проверок","icon":"ClipboardCheck","color":"blue"},
        {"title":"УПНП","text":"Противодействие недобросовестным практикам","icon":"ShieldAlert","color":"amber"},
        {"title":"ЦМОФР","text":"Мониторинг операций на финрынке","icon":"Radar","color":"amber"},
        {"title":"Подразделения Блока ВК","text":"Заказчики инициатив","icon":"Users","color":"emerald"},
        {"title":"ИТ, ИБ, Центр ИИ Банка","text":"Внешние партнёры и платформы","icon":"Cpu","color":"pink"}
      ]
    },
    {"id":"b2","kind":"text","text":"Единый портфель инициатив, сквозная автоматизация процессов, общие стандарты и переиспользование решений, прозрачный контроль исполнения — Центр не подменяет подразделения, а стягивает их работу в единый результат."}
  ]'::jsonb
FROM biz_presentations WHERE slug = 'obosnovanie-tsentra-ccirtkd';

INSERT INTO biz_slides (presentation_id, order_index, layout, title, subtitle, blocks_json)
SELECT id, 10, 'closing',
  'Ключевой вывод',
  '',
  '[{"id":"b1","kind":"quote",
    "text":"Создание ЦЦиРТКД приводит организационную структуру в соответствие с фактически выполняемой деятельностью: профильные работники, задачи, полномочия и ответственность за результат объединяются в одном подразделении — без увеличения общей численности и числа руководящих должностей.",
    "author":"Кузьменко А.В., Директор по цифровизации и развитию технологий внутреннего контроля"}]'::jsonb
FROM biz_presentations WHERE slug = 'obosnovanie-tsentra-ccirtkd';
