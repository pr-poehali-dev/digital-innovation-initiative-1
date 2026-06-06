// Единый источник правды для роутов приложения.
// Используется в Layout (меню десктоп + мобиль) и App.tsx.

export const ROUTES = {
  home: "/cabinet",
  projects: "/cabinet/projects",
  learning: "/cabinet/learning",
  passport: "/cabinet/passport",
  wallet: "/cabinet/wallet",
  headquarters: "/cabinet/headquarters",
  // Будущие маршруты (пока не существуют, не добавлять в меню):
  // competencies: "/cabinet/competencies",
  // development: "/cabinet/development",
  // profile: "/cabinet/profile",
  // settings: "/cabinet/settings",
} as const;

export type RouteKey = keyof typeof ROUTES;

// Навигационные пункты — десктопное боковое меню
export const NAV_ITEMS = [
  { label: "Главная",                  icon: "LayoutDashboard", href: ROUTES.home,         exact: true, active: true  },
  { label: "Проекты и презентации",    icon: "FolderOpen",      href: ROUTES.projects,     exact: false, active: true  },
  { label: "Учебный кабинет",          icon: "GraduationCap",   href: ROUTES.learning,     exact: false, active: true  },
  { label: "Дипломы и сертификаты",    icon: "Award",           href: ROUTES.passport,     exact: false, active: true  },
  { label: "Кошелёк",                  icon: "Wallet",          href: ROUTES.wallet,       exact: false, active: true  },
  // Штаб Траектории — платформенный раздел, живёт в /admin/hq, не в пользовательском меню
  { label: "Профессиональный профиль",  icon: "UserCircle",      href: "/cabinet/profile", exact: false, active: true  },
  { label: "Навигатор развития",        icon: "TrendingUp",      href: "/cabinet/growth",  exact: false, active: true  },
  // Неактивные (скоро):
  { label: "Карта компетенций",        icon: "Map",             href: "#", exact: false, active: false },
] as const;

// Нижнее мобильное меню — только активные маршруты, max 5
export const MOBILE_NAV = [
  { label: "Главная",   icon: "LayoutDashboard", href: ROUTES.home         },
  { label: "Проекты",  icon: "FolderOpen",      href: ROUTES.projects     },
  { label: "Обучение", icon: "GraduationCap",   href: ROUTES.learning     },
  { label: "Кошелёк",  icon: "Wallet",          href: ROUTES.wallet       },
] as const;