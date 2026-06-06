import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "@/components/ui/icon";
import { analytics } from "@/lib/analytics";

// ── Analytics ────────────────────────────────────────────────────────────

function trackCta(ctaId: string) {
  analytics.guideCtaClicked(ctaId, "guide_page");
}

// ── Data ─────────────────────────────────────────────────────────────────

const PLATFORM_FLOW = [
  {
    icon: "ClipboardCheck",
    color: "bg-emerald-100 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    title: "Самооценка",
    desc: "Оцениваете текущий уровень по компетенциям",
    out: "Стартовая точка",
  },
  {
    icon: "Map",
    color: "bg-violet-100 text-violet-700 border-violet-200",
    dot: "bg-violet-500",
    title: "Карта компетенций",
    desc: "Видите сильные стороны и зоны роста",
    out: "Понятная картина",
  },
  {
    icon: "IdCard",
    color: "bg-blue-100 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
    title: "Профессиональный профиль",
    desc: "Фиксируете опыт, роли и цели",
    out: "Контекст развития",
  },
  {
    icon: "TrendingUp",
    color: "bg-amber-100 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
    title: "Рекомендации",
    desc: "Получаете приоритеты: что развивать первым",
    out: "Фокус действий",
  },
  {
    icon: "GraduationCap",
    color: "bg-sky-100 text-sky-700 border-sky-200",
    dot: "bg-sky-500",
    title: "Обучение",
    desc: "Закрываете gaps курсами и материалами",
    out: "Подтверждённый рост",
  },
  {
    icon: "FolderOpen",
    color: "bg-orange-100 text-orange-700 border-orange-200",
    dot: "bg-orange-500",
    title: "Проекты и задачи",
    desc: "Закрепляете развитие через практику",
    out: "Реальный опыт",
  },
  {
    icon: "BarChart2",
    color: "bg-green-100 text-green-700 border-green-200",
    dot: "bg-green-500",
    title: "План развития",
    desc: "Всё собирается в рабочую траекторию",
    out: "Системный рост",
  },
];

const STEPS = [
  {
    num: "01",
    title: "Откройте карту компетенций",
    desc: "Перейдите в раздел «Карта компетенций». Вы увидите домены — области профессиональных навыков.",
    tip: "Не пытайтесь сразу оценить всё. Начните с 1–2 доменов, которые ближе к вашей работе.",
    icon: "Map",
    link: "/cabinet/competency-map",
    linkLabel: "Открыть карту →",
    color: "border-emerald-400",
    numColor: "bg-emerald-500",
  },
  {
    num: "02",
    title: "Пройдите самооценку",
    desc: "Раскройте домен, выберите компетенцию и нажмите на уровень от 1 до 5. Карта формируется сразу — без тестов и анкет.",
    tip: "Уровень 1 — базовое знакомство. Уровень 5 — экспертный уровень. Будьте честны с собой: это только для вас.",
    icon: "ClipboardCheck",
    link: "/cabinet/competency-map",
    linkLabel: "Начать самооценку →",
    color: "border-violet-400",
    numColor: "bg-violet-500",
  },
  {
    num: "03",
    title: "Посмотрите картину целиком",
    desc: "После самооценки карта покажет ваши сильные зоны и места с низкой уверенностью. Именно там — точки роста.",
    tip: "Обратите внимание на домены с confidence «низкая» — это не плохо, а честная отправная точка.",
    icon: "LayoutGrid",
    link: "/cabinet/competency-map",
    linkLabel: "Посмотреть карту →",
    color: "border-blue-400",
    numColor: "bg-blue-500",
  },
  {
    num: "04",
    title: "Заполните профессиональный профиль",
    desc: "Добавьте опыт работы, образование и ваши цели. Профиль усиливает карту и помогает формировать план развития.",
    tip: "Достаточно основного: текущая роль, ключевой опыт и направление, в котором хотите развиваться.",
    icon: "IdCard",
    link: "/cabinet/profile",
    linkLabel: "Заполнить профиль →",
    color: "border-amber-400",
    numColor: "bg-amber-500",
  },
  {
    num: "05",
    title: "Изучите рекомендации",
    desc: "Прямо в карте система подсказывает что делать дальше: пройти обучение, добавить проект или усилить конкретную компетенцию.",
    tip: "Начните с одной рекомендации. Не нужно всё сразу — лучше одно действие, чем ноль.",
    icon: "Sparkles",
    link: "/cabinet/competency-map",
    linkLabel: "Посмотреть рекомендации →",
    color: "border-sky-400",
    numColor: "bg-sky-500",
  },
  {
    num: "06",
    title: "Добавьте обучение",
    desc: "В учебном кабинете фиксируйте курсы, которые вы проходите или завершили. Они автоматически становятся подтверждёнными источниками в карте.",
    tip: "Завершённый курс — самый весомый сигнал для карты. Он виден как «Verified» источник.",
    icon: "GraduationCap",
    link: "/cabinet/learning",
    linkLabel: "Учебный кабинет →",
    color: "border-orange-400",
    numColor: "bg-orange-500",
  },
  {
    num: "07",
    title: "Возвращайтесь и обновляйте",
    desc: "Развитие — это не разовое действие. Возвращайтесь раз в 2–4 недели: обновляйте самооценку, добавляйте новое обучение, фиксируйте прогресс.",
    tip: "Даже маленькое обновление раз в месяц лучше, чем попытка сделать всё идеально сразу.",
    icon: "RefreshCcw",
    link: "/cabinet",
    linkLabel: "Перейти в кабинет →",
    color: "border-green-400",
    numColor: "bg-green-500",
  },
];

const MODULES = [
  {
    icon: "Map",
    title: "Карта компетенций",
    purpose: "Оценка текущего уровня",
    result: "Понимание сильных зон и точек роста",
    link: "/cabinet/competency-map",
    color: "bg-emerald-50 border-emerald-200",
    iconColor: "text-emerald-600",
  },
  {
    icon: "ClipboardCheck",
    title: "Самооценка",
    purpose: "Стартовая диагностика",
    result: "База для анализа и дальнейшего роста",
    link: "/cabinet/competency-map",
    color: "bg-violet-50 border-violet-200",
    iconColor: "text-violet-600",
  },
  {
    icon: "IdCard",
    title: "Профессиональный профиль",
    purpose: "Фиксация опыта, ролей и целей",
    result: "Контекст развития, видимый в карте",
    link: "/cabinet/profile",
    color: "bg-blue-50 border-blue-200",
    iconColor: "text-blue-600",
  },
  {
    icon: "GraduationCap",
    title: "Учебный кабинет",
    purpose: "Фиксация и развитие навыков",
    result: "Верифицированные сигналы в карте компетенций",
    link: "/cabinet/learning",
    color: "bg-sky-50 border-sky-200",
    iconColor: "text-sky-600",
  },
  {
    icon: "FolderOpen",
    title: "Проекты и задачи",
    purpose: "Практическое применение",
    result: "Закрепление развития через реальный опыт",
    link: "/cabinet/projects",
    color: "bg-orange-50 border-orange-200",
    iconColor: "text-orange-600",
  },
  {
    icon: "BarChart2",
    title: "План развития",
    purpose: "Сборка всего в систему",
    result: "Пошаговая траектория роста",
    link: "/cabinet/growth",
    color: "bg-green-50 border-green-200",
    iconColor: "text-green-600",
  },
];

const SCENARIOS = [
  {
    icon: "UserPlus",
    title: "Я новый пользователь",
    desc: "Только начинаю и не знаю с чего начать",
    steps: [
      "Откройте карту компетенций",
      "Оцените 5–10 компетенций в знакомых доменах",
      "Посмотрите что система рекомендует",
      "Заполните профиль: роль и опыт",
      "Вернитесь через неделю и добавьте обучение",
    ],
    cta: { label: "Начать самооценку", link: "/cabinet/competency-map" },
    color: "border-emerald-300 bg-emerald-50",
  },
  {
    icon: "TrendingUp",
    title: "Хочу понять, что развивать",
    desc: "Уже что-то использовал, но нет чёткого вектора",
    steps: [
      "Откройте карту компетенций",
      "Найдите домены с низкой уверенностью",
      "Сравните их с вашими текущими задачами",
      "Выберите 1–2 компетенции для фокуса",
      "Найдите подходящее обучение",
    ],
    cta: { label: "Открыть карту", link: "/cabinet/competency-map" },
    color: "border-violet-300 bg-violet-50",
  },
  {
    icon: "Briefcase",
    title: "Хочу связать рост с реальной работой",
    desc: "Хочу не просто «учиться», а видеть практическое применение",
    steps: [
      "Добавьте текущие проекты в кабинет",
      "Пройдите самооценку в релевантных доменах",
      "Посмотрите, как проекты влияют на карту",
      "Добавьте обучение, связанное с проектной работой",
      "Отслеживайте рост через карту",
    ],
    cta: { label: "Мои проекты", link: "/cabinet/projects" },
    color: "border-orange-300 bg-orange-50",
  },
  {
    icon: "Compass",
    title: "Меняю направление",
    desc: "Хочу перейти в другую область или роль",
    steps: [
      "Обновите профиль: целевая роль и направление",
      "Пройдите самооценку в интересующих доменах",
      "Посмотрите какие компетенции нужно развить",
      "Сфокусируйтесь на 2–3 ключевых областях",
      "Добавьте обучение под целевые компетенции",
    ],
    cta: { label: "Обновить профиль", link: "/cabinet/profile" },
    color: "border-sky-300 bg-sky-50",
  },
];

const FAQ = [
  {
    q: "С чего начать?",
    a: "Откройте карту компетенций и пройдите самооценку в 1–2 знакомых доменах. Это занимает 5–10 минут и сразу даёт стартовую картину.",
  },
  {
    q: "Нужно ли проходить всё сразу?",
    a: "Нет. Начните с самооценки — это главный первый шаг. Остальные модули можно подключать постепенно по мере работы.",
  },
  {
    q: "Можно ли вернуться и изменить самооценку?",
    a: "Да, в любой момент. Карта живая — вы обновляете оценки когда угодно. Рекомендуем делать это раз в 2–4 недели.",
  },
  {
    q: "Как понять, что развивать в первую очередь?",
    a: "Смотрите на домены с низкой уверенностью, которые важны для вашей текущей работы или целевой роли. Система показывает рекомендации прямо в карте.",
  },
  {
    q: "Чем профиль отличается от карты компетенций?",
    a: "Карта — это ваш текущий профессиональный уровень, построенный из оценок и обучения. Профиль — это контекст: опыт, роли, цели. Они усиливают друг друга.",
  },
  {
    q: "Как обучение связано с картой?",
    a: "Когда вы фиксируете завершённый курс в учебном кабинете, он автоматически становится подтверждённым источником в карте. Это самый весомый сигнал.",
  },
  {
    q: "Как отслеживать прогресс?",
    a: "Возвращайтесь на карту раз в несколько недель. Вы увидите как растут оценки, появляются новые verified-источники и расширяется покрытие доменов.",
  },
];

// ── Components ────────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="text-sm font-semibold text-slate-800 pr-4">{q}</span>
        <Icon name={open ? "ChevronUp" : "ChevronDown"} size={16} className="text-slate-400 flex-shrink-0" />
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
          {a}
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function GuidePage() {
  useEffect(() => {
    analytics.guideOpened("direct");
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Nav */}
      <nav className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm leading-none">Т</span>
            </div>
            <span className="font-bold text-slate-800">Траектория</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm text-slate-500 hover:text-slate-800 transition-colors">Войти</Link>
            <Link
              to="/cabinet/competency-map"
              onClick={() => trackCta("nav_cta")}
              className="px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-xl hover:bg-slate-700 transition-colors"
            >
              Начать
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-12 space-y-20">

        {/* Hero */}
        <section className="text-center space-y-5">
          <div className="inline-flex items-center gap-2 bg-violet-100 text-violet-700 text-xs font-semibold px-3 py-1.5 rounded-full">
            <Icon name="BookOpen" size={12} />
            Как работать с платформой
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 leading-tight">
            Всё понятно с первых минут
          </h1>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto leading-relaxed">
            Платформа помогает оценить компетенции, собрать профессиональный профиль, определить зоны роста и связать развитие с обучением и реальной работой.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link
              to="/cabinet/competency-map"
              onClick={() => trackCta("hero_primary")}
              className="px-6 py-3 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
            >
              <Icon name="Map" size={16} />
              Начать с самооценки
            </Link>
            <a
              href="#steps"
              className="px-6 py-3 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors"
            >
              Посмотреть шаги
            </a>
          </div>
        </section>

        {/* What is it */}
        <section>
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-900">Платформа помогает</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: "Eye",          text: "Понять текущий уровень компетенций честно и наглядно" },
              { icon: "Target",       text: "Увидеть сильные стороны и конкретные зоны роста" },
              { icon: "IdCard",       text: "Собрать структурированный профессиональный профиль" },
              { icon: "Link",         text: "Связать развитие с реальным обучением и проектами" },
              { icon: "BarChart2",    text: "Выстроить понятный план развития, а не просто список целей" },
              { icon: "RefreshCcw",   text: "Регулярно отслеживать прогресс и корректировать курс" },
            ].map((item, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Icon name={item.icon} size={15} className="text-slate-600" />
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Platform flow */}
        <section>
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Как устроен процесс</h2>
            <p className="text-slate-500 text-sm">Каждый шаг строится на предыдущем — это не набор отдельных инструментов, а связанная система</p>
          </div>

          {/* Flow diagram */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8">
            <div className="grid grid-cols-1 md:grid-cols-7 gap-2 items-start">
              {PLATFORM_FLOW.map((step, i) => (
                <div key={i} className="flex md:flex-col items-center md:items-center gap-3 md:gap-2">
                  {/* Node */}
                  <div className={`flex-shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-2xl border-2 flex items-center justify-center ${step.color}`}>
                    <Icon name={step.icon} size={22} />
                  </div>
                  {/* Labels */}
                  <div className="flex-1 md:text-center min-w-0">
                    <p className="text-xs font-bold text-slate-800 leading-tight">{step.title}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug hidden md:block">{step.desc}</p>
                    <div className="flex md:justify-center mt-1">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${step.dot} mr-1`} />
                      <span className="text-[10px] font-semibold text-slate-500">{step.out}</span>
                    </div>
                  </div>
                  {/* Arrow */}
                  {i < PLATFORM_FLOW.length - 1 && (
                    <div className="flex-shrink-0 text-slate-300">
                      <Icon name="ChevronRight" size={16} className="md:hidden" />
                      <Icon name="ChevronRight" size={14} className="hidden md:block rotate-0" />
                    </div>
                  )}
                </div>
              ))}
            </div>
            {/* Feedback loop */}
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-center gap-2 text-xs text-slate-400">
              <Icon name="RefreshCcw" size={12} />
              <span>Возвращайтесь и обновляйте карту — развитие это цикл, а не разовое действие</span>
            </div>
          </div>
        </section>

        {/* Steps */}
        <section id="steps">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">С чего начать — пошагово</h2>
            <p className="text-slate-500 text-sm">Первые шаги в правильном порядке. Каждый занимает 5–15 минут.</p>
          </div>

          <div className="space-y-4">
            {STEPS.map((step, i) => (
              <div key={i} className={`bg-white border-l-4 ${step.color} border border-slate-200 rounded-xl p-5 flex gap-4`}>
                <div className="flex-shrink-0">
                  <div className={`w-9 h-9 ${step.numColor} rounded-xl flex items-center justify-center`}>
                    <span className="text-white text-xs font-bold">{step.num}</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <h3 className="font-bold text-slate-800">{step.title}</h3>
                    <Link
                      to={step.link}
                      onClick={() => trackCta(`step_${i + 1}`)}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors whitespace-nowrap flex items-center gap-1"
                    >
                      {step.linkLabel}
                    </Link>
                  </div>
                  <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{step.desc}</p>
                  <div className="mt-2.5 flex items-start gap-2 bg-slate-50 rounded-lg px-3 py-2">
                    <Icon name="Lightbulb" size={13} className="text-amber-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-slate-500 leading-relaxed">{step.tip}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Modules table */}
        <section>
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Как связаны модули</h2>
            <p className="text-slate-500 text-sm">Каждый модуль решает конкретную задачу и усиливает остальные</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {MODULES.map((mod, i) => (
              <Link
                key={i}
                to={mod.link}
                onClick={() => trackCta(`module_${mod.title.toLowerCase().replace(/ /g, "_")}`)}
                className={`group border-2 rounded-2xl p-5 transition-all hover:shadow-md ${mod.color}`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-sm">
                    <Icon name={mod.icon} size={16} className={mod.iconColor} />
                  </div>
                  <h3 className="font-bold text-slate-800 text-sm">{mod.title}</h3>
                </div>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5 flex-shrink-0">Для чего</span>
                    <p className="text-xs text-slate-600 leading-relaxed">{mod.purpose}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5 flex-shrink-0">Получаете</span>
                    <p className="text-xs text-slate-700 font-medium leading-relaxed">{mod.result}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Scenarios */}
        <section>
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Типовые сценарии</h2>
            <p className="text-slate-500 text-sm">Найдите свою ситуацию — и начните с правильного шага</p>
          </div>

          <div className="grid sm:grid-cols-2 gap-5">
            {SCENARIOS.map((sc, i) => (
              <div key={i} className={`border-2 rounded-2xl p-5 bg-white ${sc.color}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-white rounded-xl border border-slate-200 flex items-center justify-center shadow-sm">
                    <Icon name={sc.icon} size={18} className="text-slate-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm">{sc.title}</h3>
                    <p className="text-xs text-slate-500">{sc.desc}</p>
                  </div>
                </div>
                <ol className="space-y-1.5 mb-4">
                  {sc.steps.map((s, j) => (
                    <li key={j} className="flex items-start gap-2 text-xs text-slate-600">
                      <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                        {j + 1}
                      </span>
                      {s}
                    </li>
                  ))}
                </ol>
                <Link
                  to={sc.cta.link}
                  onClick={() => trackCta(`scenario_${i + 1}`)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 transition-colors bg-white border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50"
                >
                  {sc.cta.label}
                  <Icon name="ArrowRight" size={12} />
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* Results */}
        <section className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">Что вы получите в итоге</h2>
          <p className="text-slate-400 text-sm mb-8 max-w-xl mx-auto">
            Не разрозненные инструменты, а связанную картину вашего профессионального развития
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-left mb-8">
            {[
              { icon: "Map",         text: "Честную и наглядную карту текущих компетенций" },
              { icon: "IdCard",      text: "Структурированный профессиональный профиль" },
              { icon: "Target",      text: "Конкретные приоритеты: что развивать в первую очередь" },
              { icon: "Link",        text: "Связку «оценка → обучение → практика → рост»" },
              { icon: "BarChart2",   text: "Рабочий план развития, который реально работает" },
              { icon: "TrendingUp",  text: "Понимание прогресса в динамике" },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 bg-white/5 rounded-xl p-3.5">
                <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <Icon name={item.icon} size={14} className="text-white" />
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/cabinet/competency-map"
              onClick={() => trackCta("results_cta_primary")}
              className="px-6 py-3 bg-white text-slate-800 font-semibold rounded-xl hover:bg-slate-100 transition-colors flex items-center justify-center gap-2"
            >
              <Icon name="Map" size={16} />
              Открыть карту компетенций
            </Link>
            <Link
              to="/cabinet"
              onClick={() => trackCta("results_cta_secondary")}
              className="px-6 py-3 bg-white/10 text-white font-semibold rounded-xl hover:bg-white/20 transition-colors border border-white/20"
            >
              Перейти в кабинет
            </Link>
          </div>
        </section>

        {/* FAQ */}
        <section>
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Частые вопросы</h2>
          </div>
          <div className="space-y-2 max-w-2xl mx-auto">
            {FAQ.map((item, i) => (
              <FaqItem key={i} q={item.q} a={item.a} />
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="text-center py-4">
          <p className="text-slate-500 text-sm mb-5">Готовы начать? Это займёт 5 минут.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/cabinet/competency-map"
              onClick={() => trackCta("final_primary")}
              className="px-8 py-3.5 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
            >
              <Icon name="Map" size={16} />
              Начать с самооценки
            </Link>
            <Link
              to="/cabinet"
              onClick={() => trackCta("final_secondary")}
              className="px-8 py-3.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors"
            >
              Перейти в кабинет
            </Link>
          </div>
        </section>

      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 mt-8 py-6">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <span>© 2026 Траектория</span>
          <div className="flex gap-4">
            <Link to="/" className="hover:text-slate-600 transition-colors">На главную</Link>
            <Link to="/login" className="hover:text-slate-600 transition-colors">Войти</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}