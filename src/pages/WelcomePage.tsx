import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import Icon from "@/components/ui/icon";
import { passportApi } from "@/lib/passportApi";
import { competencyMapApi } from "@/lib/competencyMapApi";
import { growthApi } from "@/lib/growthApi";
import { analytics } from "@/lib/analytics";
import SeoMeta from "@/components/SeoMeta";

// ── State resolver ────────────────────────────────────────────────────

type WelcomeStateKey = "no_profile" | "no_assessment" | "no_role" | "no_plan" | "ready";

type WelcomeStateData = {
  key: WelcomeStateKey;
  hasProfile: boolean;
  hasAssessment: boolean;
  hasRole: boolean;
  hasPlan: boolean;
};

async function resolveWelcomeState(): Promise<WelcomeStateData> {
  const [passport, map, plan] = await Promise.allSettled([
    passportApi.completionMe(),
    competencyMapApi.getMe(),
    growthApi.planGet(),
  ]);

  const hasProfile = passport.status === "fulfilled"
    ? !!(passport.value?.completion?.total_pct > 0)
    : false;
  const hasAssessment = map.status === "fulfilled"
    ? !!(map.value?.summary?.has_data)
    : false;
  const hasRole = plan.status === "fulfilled"
    ? !!(plan.value?.plan?.target_role_profile_id)
    : false;
  const hasPlan = plan.status === "fulfilled"
    ? !!(plan.value?.plan)
    : false;

  let key: WelcomeStateKey;
  if (!hasProfile)         key = "no_profile";
  else if (!hasAssessment) key = "no_assessment";
  else if (!hasRole)       key = "no_role";
  else if (!hasPlan)       key = "no_plan";
  else                     key = "ready";

  return { key, hasProfile, hasAssessment, hasRole, hasPlan };
}

// ── State config ─────────────────────────────────────────────────────

type StateConfig = {
  badge?: string;
  badgeColor?: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  hint: string;
  description: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
};

const STATE_CONFIG: Record<WelcomeStateKey, StateConfig> = {
  no_profile: {
    icon: "UserCircle",
    iconBg: "bg-violet-50",
    iconColor: "text-violet-500",
    title: "Начнём с вашего профиля",
    hint: "Шаг 1 из 4",
    description: "Заполните основную информацию о себе — это займёт пару минут и поможет платформе точнее показать сильные стороны и следующий шаг.",
    primaryLabel: "Заполнить профиль",
    primaryHref: "/cabinet/profile",
    secondaryLabel: "Открыть инструкцию",
    secondaryHref: "/guide",
  },
  no_assessment: {
    icon: "ClipboardList",
    iconBg: "bg-blue-50",
    iconColor: "text-blue-500",
    title: "Пройдите самооценку",
    hint: "Шаг 2 из 4",
    description: "Оцените себя по нужным компетенциям — это быстро и без тестов. После этого платформа покажет зоны роста и персональные рекомендации.",
    primaryLabel: "Пройти самооценку",
    primaryHref: "/cabinet/competency-map",
    secondaryLabel: "Открыть инструкцию",
    secondaryHref: "/guide",
  },
  no_role: {
    icon: "Target",
    iconBg: "bg-amber-50",
    iconColor: "text-amber-500",
    title: "Выберите целевую роль",
    hint: "Шаг 3 из 4",
    description: "Определите роль, к которой хотите двигаться. Это даст платформе ориентир для приоритетов и плана.",
    primaryLabel: "Выбрать роль",
    primaryHref: "/cabinet/growth",
    secondaryLabel: "Открыть инструкцию",
    secondaryHref: "/guide",
  },
  no_plan: {
    badge: "Данные готовы",
    badgeColor: "bg-emerald-100 text-emerald-700",
    icon: "Map",
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-500",
    title: "Можно собрать первый план",
    hint: "Шаг 4 из 4",
    description: "У нас уже достаточно данных, чтобы показать приоритеты, сильные стороны и следующий шаг. Это займёт несколько секунд.",
    primaryLabel: "Сформировать план",
    primaryHref: "/cabinet/growth",
    secondaryLabel: "Посмотреть карту компетенций",
    secondaryHref: "/cabinet/competency-map",
  },
  ready: {
    badge: "Всё готово",
    badgeColor: "bg-emerald-100 text-emerald-700",
    icon: "TrendingUp",
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-500",
    title: "План развития готов",
    hint: "Откройте и посмотрите следующий шаг",
    description: "Посмотрите приоритеты, сильные стороны и рекомендации. Если данные изменились — план можно обновить.",
    primaryLabel: "Открыть план",
    primaryHref: "/cabinet/growth",
    secondaryLabel: "Обновить данные профиля",
    secondaryHref: "/cabinet/profile",
  },
};

// ── Progress stepper ──────────────────────────────────────────────────

function ProgressStepper({ state }: { state: WelcomeStateData }) {
  const steps = [
    { label: "Профиль",    done: state.hasProfile,    active: !state.hasProfile },
    { label: "Самооценка", done: state.hasAssessment,  active: state.hasProfile && !state.hasAssessment },
    { label: "Роль",       done: state.hasRole,        active: state.hasAssessment && !state.hasRole },
    { label: "План",       done: state.hasPlan,        active: state.hasRole && !state.hasPlan },
  ];

  return (
    <div className="flex items-start gap-0 w-full">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center flex-1">
          <div className="flex flex-col items-center flex-shrink-0 gap-1.5">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all ${
              s.done   ? "bg-emerald-500 border-emerald-500" :
              s.active ? "bg-white border-slate-800 shadow-sm" :
                         "bg-white border-slate-200"
            }`}>
              {s.done
                ? <Icon name="Check" size={13} className="text-white" />
                : <span className={`text-[10px] font-bold ${s.active ? "text-slate-800" : "text-slate-300"}`}>{i + 1}</span>
              }
            </div>
            <span className={`text-[10px] font-medium text-center leading-tight max-w-[56px] ${
              s.active ? "text-slate-700" : s.done ? "text-slate-400" : "text-slate-300"
            }`}>{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`h-0.5 flex-1 mx-1 mb-5 transition-colors ${
              steps[i + 1].done || s.done ? "bg-emerald-200" : "bg-slate-100"
            }`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Quick links ────────────────────────────────────────────────────────

const QUICK_LINKS = [
  { icon: "User",         label: "Профиль",          href: "/cabinet/profile" },
  { icon: "BrainCircuit", label: "Карта компетенций", href: "/cabinet/competency-map" },
  { icon: "TrendingUp",   label: "Навигатор роста",   href: "/cabinet/growth" },
  { icon: "BookOpen",     label: "Инструкция",        href: "/guide" },
];

// ── Loading skeleton ──────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50">
      <SeoMeta noindex />
      <div className="h-14 bg-white border-b border-slate-200" />
      <div className="max-w-lg mx-auto px-4 py-12">
        <div className="h-8 bg-slate-100 rounded-full w-64 mx-auto mb-10 animate-pulse" />
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div className="flex gap-4">
            <div className="w-11 h-11 rounded-xl bg-slate-100 animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-2.5 pt-0.5">
              <div className="h-4 bg-slate-100 rounded animate-pulse w-3/4" />
              <div className="h-3 bg-slate-100 rounded animate-pulse" />
              <div className="h-3 bg-slate-100 rounded animate-pulse w-5/6" />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <div className="h-11 bg-slate-800/10 rounded-xl flex-1 animate-pulse" />
            <div className="h-11 bg-slate-100 rounded-xl flex-1 animate-pulse" />
          </div>
        </div>
        <p className="text-center text-xs text-slate-400 mt-6 animate-pulse">Подбираем ваш следующий шаг…</p>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────

export default function WelcomePage() {
  const { user } = useAuth();
  const [stateData, setStateData] = useState<WelcomeStateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const viewFired = useRef(false);

  useEffect(() => {
    resolveWelcomeState()
      .then(s => {
        setStateData(s);
        setLoading(false);
        if (!viewFired.current) {
          viewFired.current = true;
          analytics.welcomeView(s.key);
        }
      })
      .catch(() => {
        setLoading(false);
        setError(true);
      });
  }, []);

  if (loading) return <LoadingSkeleton />;

  if (error || !stateData) {
    return (
      <div className="min-h-screen bg-slate-50">
        <SeoMeta noindex />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center max-w-sm px-4 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
              <Icon name="AlertCircle" size={20} className="text-slate-400" />
            </div>
            <p className="text-slate-600 text-sm leading-relaxed">Не удалось загрузить данные.<br />Попробуйте обновить страницу.</p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-colors">
                Обновить страницу
              </button>
              <Link to="/cabinet"
                className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-200 transition-colors">
                Перейти в кабинет
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const cfg = STATE_CONFIG[stateData.key];

  return (
    <div className="min-h-screen bg-slate-50">
      <SeoMeta noindex />

      {/* Header */}
      <header className="bg-white border-b border-slate-100">
        <div className="max-w-lg mx-auto px-4 py-3.5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-violet-600 to-indigo-700 rounded-lg flex items-center justify-center">
              <Icon name="TrendingUp" size={13} className="text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-800">Траектория</span>
          </Link>
          <div className="flex items-center gap-3">
            {user?.name && <span className="text-xs text-slate-400 hidden sm:block">{user.name}</span>}
            <Link to="/cabinet"
              className="text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1">
              <Icon name="LayoutDashboard" size={12} />
              Кабинет
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-10 pb-20">

        {/* Stepper — compact, above the card */}
        <div className="mb-8 px-2">
          <ProgressStepper state={stateData} />
        </div>

        {/* Main action card — focal point of the screen */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">

          {/* Card header with badge */}
          <div className="px-6 pt-6 pb-0 flex items-start justify-between gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.iconBg}`}>
              <Icon name={cfg.icon} size={20} className={cfg.iconColor} />
            </div>
            <div className="flex items-center gap-2">
              {cfg.badge && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.badgeColor}`}>
                  {cfg.badge}
                </span>
              )}
              <span className="text-[10px] text-slate-400">{cfg.hint}</span>
            </div>
          </div>

          {/* Card body */}
          <div className="px-6 pt-4 pb-6">
            <h1 className="text-xl font-bold text-slate-900 mb-2 leading-tight">{cfg.title}</h1>
            <p className="text-sm text-slate-500 leading-relaxed mb-6">{cfg.description}</p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-2.5">
              <Link
                to={cfg.primaryHref}
                onClick={() => analytics.welcomePrimaryCtaClicked(stateData.key, cfg.primaryLabel)}
                className="flex items-center justify-center gap-2 px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl transition-colors flex-1 sm:flex-initial">
                {cfg.primaryLabel}
                <Icon name="ArrowRight" size={14} />
              </Link>
              <Link
                to={cfg.secondaryHref}
                onClick={() => analytics.welcomeSecondaryCtaClicked(stateData.key, cfg.secondaryLabel)}
                className="flex items-center justify-center gap-2 px-4 py-3 text-slate-500 hover:text-slate-800 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors border border-slate-200">
                {cfg.secondaryLabel}
              </Link>
            </div>
          </div>
        </div>

        {/* Quick navigation — tertiary, muted */}
        <div className="mt-10">
          <p className="text-[10px] font-semibold text-slate-300 uppercase tracking-widest mb-3 px-1">
            Быстрый переход
          </p>
          <div className="flex flex-wrap gap-2">
            {QUICK_LINKS.map(l => (
              <Link key={l.href} to={l.href}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-400 hover:text-slate-600 text-xs font-medium rounded-lg transition-colors">
                <Icon name={l.icon} size={12} />
                {l.label}
              </Link>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}