// Дизайн-система презентации «Траектория»
// Цветовая логика по контурам продукта (из согласованного предложения)

export const CABINET_THEME = {
  work: {
    key: 'work',
    name: 'Рабочий кабинет',
    accent: '#3B82F6', // глубокий синий
    accentSoft: 'rgba(59,130,246,0.14)',
    gradient: 'from-blue-500 to-indigo-600',
    text: 'text-blue-300',
  },
  learning: {
    key: 'learning',
    name: 'Учебный кабинет',
    accent: '#8B5CF6', // фиолетовый
    accentSoft: 'rgba(139,92,246,0.14)',
    gradient: 'from-violet-500 to-purple-600',
    text: 'text-violet-300',
  },
  professional: {
    key: 'professional',
    name: 'Профессиональный кабинет',
    accent: '#14B8A6', // бирюзовый
    accentSoft: 'rgba(20,184,166,0.14)',
    gradient: 'from-teal-500 to-emerald-600',
    text: 'text-teal-300',
  },
  admin: {
    key: 'admin',
    name: 'Суперадминка',
    accent: '#64748B', // графит
    accentSoft: 'rgba(100,116,139,0.16)',
    gradient: 'from-slate-500 to-slate-700',
    text: 'text-slate-300',
  },
  ai: {
    key: 'ai',
    name: 'AI',
    accent: '#38BDF8', // яркий акцент
    accentSoft: 'rgba(56,189,248,0.16)',
    gradient: 'from-sky-400 to-cyan-500',
    text: 'text-sky-300',
  },
} as const;

export type CabinetKey = keyof typeof CABINET_THEME;

// Фон презентации — тёмный премиальный
export const DECK_BG = '#0B1120';
export const DECK_BG_SOFT = '#111A2E';

export const STATUS_STYLES: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  done: { label: 'Сделано', bg: 'bg-emerald-500/15', text: 'text-emerald-300', dot: '#34D399' },
  current: { label: 'Сейчас', bg: 'bg-amber-500/15', text: 'text-amber-300', dot: '#FBBF24' },
  next: { label: 'Дальше', bg: 'bg-slate-500/15', text: 'text-slate-300', dot: '#94A3B8' },
};
