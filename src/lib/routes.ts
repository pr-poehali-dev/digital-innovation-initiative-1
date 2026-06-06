// Единый источник правды для роутов и структуры навигации.

export const ROUTES = {
  home:           "/cabinet",
  projects:       "/cabinet/projects",
  learning:       "/cabinet/learning",
  passport:       "/cabinet/passport",
  wallet:         "/cabinet/wallet",
  profile:        "/cabinet/profile",
  publicProfile:  "/cabinet/public-profile",
  growth:         "/cabinet/growth",
  competencyMap:  "/cabinet/competency-map",
} as const;

export type RouteKey = keyof typeof ROUTES;

// ── Секции sidebar ─────────────────────────────────────────────────────────

export type NavSectionKey = "overview" | "profile" | "growth" | "learning" | "practice";

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  href: string;
  exact?: boolean;
  active: boolean;
  badge?: { text: string; tone: "neutral" | "success" | "info" };
}

export interface NavSection {
  key: NavSectionKey;
  label: string;
  icon: string;
  singleItem?: boolean;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    key: "overview",
    label: "Обзор",
    icon: "LayoutDashboard",
    singleItem: true,
    items: [
      { id: "overview", label: "Обзор", icon: "LayoutDashboard", href: ROUTES.home, exact: true, active: true },
    ],
  },
  {
    key: "profile",
    label: "Профиль",
    icon: "UserCircle",
    items: [
      { id: "profile.professional", label: "Профессиональный профиль", icon: "IdCard", href: ROUTES.profile, active: true },
      { id: "profile.public", label: "Публичный профиль", icon: "Globe", href: ROUTES.publicProfile, active: true, badge: { text: "new", tone: "success" } },
    ],
  },
  {
    key: "growth",
    label: "Развитие",
    icon: "TrendingUp",
    items: [
      { id: "growth.navigator", label: "Навигатор развития", icon: "TrendingUp", href: ROUTES.growth, active: true },
      { id: "growth.map", label: "Карта компетенций", icon: "Map", href: ROUTES.competencyMap, active: true, badge: { text: "Бета", tone: "info" } },
    ],
  },
  {
    key: "learning",
    label: "Обучение",
    icon: "GraduationCap",
    items: [
      { id: "learning.main", label: "Учебный кабинет", icon: "GraduationCap", href: ROUTES.learning, active: true },
      { id: "learning.diplomas", label: "Дипломы и сертификаты", icon: "Award", href: ROUTES.passport, active: true },
    ],
  },
  {
    key: "practice",
    label: "Практика",
    icon: "FolderOpen",
    items: [
      { id: "practice.projects", label: "Проекты и презентации", icon: "FolderOpen", href: ROUTES.projects, active: true },
    ],
  },
];

// Кошелёк — secondary area (внизу sidebar)
export const NAV_SECONDARY: NavItem[] = [
  { id: "wallet", label: "Кошелёк", icon: "Wallet", href: ROUTES.wallet, active: true },
];

// Нижнее мобильное меню — только самые важные, max 5
export const MOBILE_NAV = [
  { label: "Обзор",    icon: "LayoutDashboard", href: ROUTES.home     },
  { label: "Профиль",  icon: "UserCircle",      href: ROUTES.profile  },
  { label: "Рост",     icon: "TrendingUp",      href: ROUTES.growth   },
  { label: "Обучение", icon: "GraduationCap",   href: ROUTES.learning },
  { label: "Кошелёк",  icon: "Wallet",          href: ROUTES.wallet   },
] as const;