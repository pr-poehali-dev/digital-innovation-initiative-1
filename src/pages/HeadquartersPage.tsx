import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";

const BUILD_COMMIT = (import.meta.env.VITE_COMMIT_SHA as string | undefined) ?? "8870789";
const BUILD_DATE = (import.meta.env.VITE_BUILD_DATE as string | undefined) ?? "2026-06-05";

type Phase = {
  id: string;
  label: string;
  status: "done" | "in_progress" | "planned";
  items: string[];
};

type Module = {
  title: string;
  icon: string;
  status: "live" | "soon" | "planned";
  items: string[];
};

const PHASES: Phase[] = [
  {
    id: "1",
    label: "Фаза 1 — Рабочий кабинет",
    status: "done",
    items: [
      "Регистрация и вход (Argon2id, сессии)",
      "Проекты и документы (PDF, DOCX, PPTX)",
      "AI-задачи: анализ, структура, текст",
      "Экспорт в PPTX и DOCX",
      "Чат с документом + поиск по материалам",
      "Веб-поиск через AI",
    ],
  },
  {
    id: "2",
    label: "Фаза 2 — Образование и проверка",
    status: "done",
    items: [
      "Паспорт образования (дипломы, сертификаты, AI-анализ)",
      "Аудит презентаций (20+ критериев)",
      "Визуальные элементы (схемы, таймлайны)",
      "Глобальный поиск (Ctrl+K)",
      "Семантический поиск по документам",
    ],
  },
  {
    id: "3",
    label: "Фаза 3 — Монетизация и операции",
    status: "done",
    items: [
      "Кошелёк и платежи ЮКасса",
      "Вебхук и начисление баланса",
      "Админ-панель (пользователи, проекты, логи)",
      "Rate limiting и защита от брутфорса",
      "Аудит-лог действий",
    ],
  },
  {
    id: "4",
    label: "Фаза 4 — Учебный кабинет",
    status: "in_progress",
    items: [
      "Создание учебных целей",
      "AI строит план обучения по теме",
      "Дерево тем и подтем с прогрессом",
      "Дневник находок (заметки, ссылки, инсайты)",
      "AI-наставник: отвечает на вопросы по теме",
      "Трекер прогресса (% освоения)",
    ],
  },
  {
    id: "5",
    label: "Фаза 5 — Навигатор развития",
    status: "planned",
    items: [
      "Профиль компетенций (из образования + проектов)",
      "Визуальная карта навыков",
      "Gap analysis — чего не хватает для цели",
      "AI строит резюме и карьерный профиль",
      "Рекомендованный путь на 30/60/90 дней",
    ],
  },
  {
    id: "6",
    label: "Фаза 6 — Полировка и рост",
    status: "planned",
    items: [
      "Мобильное приложение (PWA)",
      "Еженедельные AI-обзоры прогресса",
      "Командная работа над траекториями",
      "Интеграции (Notion, Google Drive)",
      "Публичные профили и шаринг",
    ],
  },
];

const MODULES: Module[] = [
  {
    title: "Рабочий кабинет",
    icon: "Briefcase",
    status: "live",
    items: ["Проекты", "Документы", "AI-задачи", "Экспорт", "Поиск", "Презентации"],
  },
  {
    title: "Учебный кабинет",
    icon: "GraduationCap",
    status: "live",
    items: ["Цели обучения", "AI-план", "Дерево тем", "Находки", "Прогресс", "AI-наставник"],
  },
  {
    title: "Паспорт образования",
    icon: "Award",
    status: "live",
    items: ["Дипломы", "Сертификаты", "Курсы", "AI-анализ трека"],
  },
  {
    title: "Навигатор развития",
    icon: "TrendingUp",
    status: "soon",
    items: ["Карта навыков", "Gap analysis", "Резюме", "Путь 30/60/90"],
  },
  {
    title: "Аудит и проверка",
    icon: "ShieldCheck",
    status: "live",
    items: ["Аудит PPTX", "20+ критериев", "Рекомендации", "Экспорт отчёта"],
  },
  {
    title: "Системный слой",
    icon: "Settings",
    status: "live",
    items: ["Аккаунты", "Поиск", "Платежи", "Админка", "Безопасность"],
  },
];

const STATUS_BADGE = {
  done: { label: "Готово", cls: "bg-emerald-100 text-emerald-700" },
  in_progress: { label: "В работе", cls: "bg-blue-100 text-blue-700" },
  planned: { label: "Планируется", cls: "bg-slate-100 text-slate-500" },
  live: { label: "Работает", cls: "bg-emerald-100 text-emerald-700" },
  soon: { label: "Скоро", cls: "bg-amber-100 text-amber-700" },
};

const PHASE_ICONS = { done: "CheckCircle2", in_progress: "Loader2", planned: "Circle" };
const PHASE_COLORS = {
  done: "text-emerald-500",
  in_progress: "text-blue-500",
  planned: "text-slate-300",
};

export default function HeadquartersPage() {
  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">

        {/* Header */}
        <div>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center">
                  <Icon name="MapPin" size={18} className="text-white" />
                </div>
                <h1 className="text-2xl font-bold text-slate-900">Штаб Траектории</h1>
              </div>
              <p className="text-sm text-slate-500 ml-12">Карта продукта, роадмап и текущий статус платформы</p>
            </div>
            <div className="flex-shrink-0 text-right">
              <div className="inline-flex items-center gap-1.5 bg-slate-100 rounded-xl px-3 py-1.5">
                <Icon name="GitCommit" size={12} className="text-slate-400" />
                <span className="text-[11px] font-mono text-slate-500">{BUILD_COMMIT.slice(0, 7)}</span>
                <span className="text-slate-300">·</span>
                <span className="text-[11px] text-slate-400">{BUILD_DATE}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Текущий статус — карточки */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Готовых модулей", value: "5", icon: "CheckCircle2", color: "text-emerald-600 bg-emerald-50" },
            { label: "Backend функций", value: "22", icon: "Zap", color: "text-blue-600 bg-blue-50" },
            { label: "Фаза сейчас", value: "4 из 6", icon: "Target", color: "text-violet-600 bg-violet-50" },
            { label: "DB миграций", value: "37", icon: "Database", color: "text-slate-600 bg-slate-100" },
          ].map(card => (
            <div key={card.label} className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${card.color}`}>
                <Icon name={card.icon} size={18} />
              </div>
              <div className="text-2xl font-bold text-slate-900">{card.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{card.label}</div>
            </div>
          ))}
        </div>

        {/* Карта модулей */}
        <div>
          <h2 className="text-base font-bold text-slate-800 mb-3">Карта платформы</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {MODULES.map(mod => {
              const badge = STATUS_BADGE[mod.status];
              return (
                <div key={mod.title} className="bg-white border border-slate-200 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                        <Icon name={mod.icon} size={16} className="text-slate-600" />
                      </div>
                      <span className="text-sm font-semibold text-slate-800">{mod.title}</span>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {mod.items.map(item => (
                      <div key={item} className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="w-1 h-1 rounded-full bg-slate-300 flex-shrink-0" />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Роадмап */}
        <div>
          <h2 className="text-base font-bold text-slate-800 mb-3">Роадмап по фазам</h2>
          <div className="space-y-3">
            {PHASES.map((phase) => {
              const badge = STATUS_BADGE[phase.status];
              return (
                <div
                  key={phase.id}
                  className={`bg-white border rounded-2xl overflow-hidden transition-all ${
                    phase.status === "in_progress"
                      ? "border-blue-200 shadow-sm shadow-blue-50"
                      : "border-slate-200"
                  }`}
                >
                  <div className="px-5 py-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Icon
                        name={PHASE_ICONS[phase.status]}
                        size={18}
                        className={`${PHASE_COLORS[phase.status]} ${phase.status === "in_progress" ? "animate-spin" : ""}`}
                      />
                      <span className={`text-sm font-semibold ${
                        phase.status === "planned" ? "text-slate-400" : "text-slate-800"
                      }`}>
                        {phase.label}
                      </span>
                    </div>
                    <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="px-5 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                    {phase.items.map(item => (
                      <div key={item} className="flex items-start gap-2 text-xs">
                        <Icon
                          name={phase.status === "done" ? "Check" : "Minus"}
                          size={12}
                          className={`mt-0.5 flex-shrink-0 ${
                            phase.status === "done" ? "text-emerald-500"
                            : phase.status === "in_progress" ? "text-blue-400"
                            : "text-slate-300"
                          }`}
                        />
                        <span className={phase.status === "planned" ? "text-slate-400" : "text-slate-600"}>
                          {item}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Текущий спринт — Done / In Progress / Next */}
        <div>
          <h2 className="text-base font-bold text-slate-800 mb-3">Текущий спринт</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

            {/* Done */}
            <div className="bg-white border border-emerald-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <Icon name="CheckCheck" size={14} className="text-emerald-600" />
                </div>
                <span className="text-sm font-bold text-emerald-700">Done</span>
              </div>
              <div className="space-y-2">
                {[
                  "Стабилизация маршрутов (убраны 404)",
                  "Единый источник роутов (routes.ts)",
                  "Синхронизация мобильного и десктопного меню",
                  "Виджет «Мои цели» с живыми данными",
                  "Индекс развития: проекты + обучение",
                  "Версия сборки / commit в Штабе",
                ].map(item => (
                  <div key={item} className="flex items-start gap-2 text-xs text-slate-600">
                    <Icon name="Check" size={12} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            {/* In Progress */}
            <div className="bg-white border border-blue-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Icon name="Loader2" size={14} className="text-blue-600" />
                </div>
                <span className="text-sm font-bold text-blue-700">In Progress</span>
              </div>
              <div className="space-y-2">
                {[
                  "4 уровня статусов тем в обучении",
                  "Блок «Что делать сейчас»",
                  "Блок «Осталось освоить»",
                  "Артефакты по фазам 30/60/90",
                  "Weekly check-in",
                ].map(item => (
                  <div key={item} className="flex items-start gap-2 text-xs text-slate-600">
                    <Icon name="Minus" size={12} className="text-blue-400 mt-0.5 flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            {/* Next */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
                  <Icon name="ArrowRight" size={14} className="text-slate-500" />
                </div>
                <span className="text-sm font-bold text-slate-600">Next</span>
              </div>
              <div className="space-y-2">
                {[
                  "Штаб: журнал решений",
                  "Штаб: риски платформы",
                  "Шаблоны: stakeholder map",
                  "Шаблоны: pain point register",
                  "Навигатор развития (карта навыков)",
                ].map(item => (
                  <div key={item} className="flex items-start gap-2 text-xs text-slate-500">
                    <Icon name="Circle" size={10} className="text-slate-300 mt-0.5 flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

      </div>
    </Layout>
  );
}