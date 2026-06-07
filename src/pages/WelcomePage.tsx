import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import Icon from "@/components/ui/icon";
import { passportApi } from "@/lib/passportApi";
import { competencyMapApi } from "@/lib/competencyMapApi";
import { growthApi } from "@/lib/growthApi";
import { analytics } from "@/lib/analytics";

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
  if (!hasProfile)    key = "no_profile";
  else if (!hasAssessment) key = "no_assessment";
  else if (!hasRole)  key = "no_role";
  else if (!hasPlan)  key = "no_plan";
  else                key = "ready";

  return { key, hasProfile, hasAssessment, hasRole, hasPlan };
}

// ── State config ─────────────────────────────────────────────────────

type StateConfig = {
  icon: string;
  iconColor: string;
  title: string;
  description: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
};

const STATE_CONFIG: Record<WelcomeStateKey, StateConfig> = {
  no_profile: {
    icon: "UserCircle",
    iconColor: "text-violet-500",
    title: "Начнём с вашего профиля",
    description: "Заполните основную информацию о себе, чтобы платформа могла точнее показать сильные стороны, зоны роста и следующий шаг.",
    primaryLabel: "Заполнить профиль",
    primaryHref: "/cabinet/profile",
    secondaryLabel: "Открыть инструкцию",
    secondaryHref: "/guide",
  },
  no_assessment: {
    icon: "ClipboardList",
    iconColor: "text-blue-500",
    title: "Пройдите самооценку",
    description: "Чтобы собрать персональный план развития, нужно немного больше данных о вашем текущем уровне.",
    primaryLabel: "Пройти самооценку",
    primaryHref: "/cabinet/competency-map",
    secondaryLabel: "Открыть инструкцию",
    secondaryHref: "/guide",
  },
  no_role: {
    icon: "Target",
    iconColor: "text-amber-500",
    title: "Выберите целевую роль",
    description: "Чтобы показать приоритеты развития и собрать план, сначала выберите роль, к которой хотите двигаться.",
    primaryLabel: "Выбрать роль",
    primaryHref: "/cabinet/growth",
    secondaryLabel: "Открыть инструкцию",
    secondaryHref: "/guide",
  },
  no_plan: {
    icon: "Map",
    iconColor: "text-emerald-500",
    title: "Можно собрать первый план развития",
    description: "У нас уже достаточно данных, чтобы показать приоритеты, сильные стороны и следующий шаг.",
    primaryLabel: "Сформировать план",
    primaryHref: "/cabinet/growth",
    secondaryLabel: "Посмотреть карту компетенций",
    secondaryHref: "/cabinet/competency-map",
  },
  ready: {
    icon: "TrendingUp",
    iconColor: "text-emerald-500",
    title: "План развития готов",
    description: "Откройте план, чтобы посмотреть приоритеты, сильные стороны и следующие шаги. Если данные изменились, план можно обновить.",
    primaryLabel: "Открыть план",
    primaryHref: "/cabinet/growth",
    secondaryLabel: "Обновить данные профиля",
    secondaryHref: "/cabinet/profile",
  },
};

// ── Progress steps ────────────────────────────────────────────────────

function ProgressSteps({ state }: { state: WelcomeStateData }) {
  const steps = [
    { label: "Профиль", done: state.hasProfile },
    { label: "Самооценка", done: state.hasAssessment },
    { label: "Целевая роль", done: state.hasRole },
    { label: "План", done: state.hasPlan },
  ];
  return (
    <div className="flex items-center gap-0 w-full max-w-sm">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center flex-1">
          <div className="flex flex-col items-center flex-shrink-0">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors ${
              s.done
                ? "bg-emerald-500 border-emerald-500"
                : "bg-white border-slate-200"
            }`}>
              {s.done
                ? <Icon name="Check" size={12} className="text-white" />
                : <span className="text-[10px] text-slate-400 font-semibold">{i + 1}</span>}
            </div>
            <span className="text-[10px] text-slate-500 mt-1 whitespace-nowrap">{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`h-0.5 flex-1 mx-1 mb-3 transition-colors ${
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

// ── Main ──────────────────────────────────────────────────────────────

export default function WelcomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stateData, setStateData] = useState<WelcomeStateData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    resolveWelcomeState().then(s => {
      setStateData(s);
      setLoading(false);
      analytics.welcomeView(s.key);
    });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!stateData) return null;

  const cfg = STATE_CONFIG[stateData.key];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-violet-600 to-indigo-700 rounded-lg flex items-center justify-center">
              <Icon name="TrendingUp" size={14} className="text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-800">Траектория</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">{user?.name}</span>
            <Link to="/cabinet"
              className="text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors">
              Кабинет
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-10 pb-24">

        {/* Progress stepper */}
        <div className="flex justify-center mb-8">
          <ProgressSteps state={stateData} />
        </div>

        {/* Main state card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0">
              <Icon name={cfg.icon} size={22} className={cfg.iconColor} />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-slate-900 mb-1">{cfg.title}</h1>
              <p className="text-sm text-slate-500 leading-relaxed">{cfg.description}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mt-5">
            <Link
              to={cfg.primaryHref}
              onClick={() => analytics.welcomePrimaryCtaClicked(stateData.key, cfg.primaryLabel)}
              className="flex items-center justify-center gap-2 px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl transition-colors">
              {cfg.primaryLabel}
              <Icon name="ArrowRight" size={14} />
            </Link>
            <Link
              to={cfg.secondaryHref}
              onClick={() => analytics.welcomeSecondaryCtaClicked(stateData.key, cfg.secondaryLabel)}
              className="flex items-center justify-center gap-2 px-5 py-3 bg-slate-50 hover:bg-slate-100 text-slate-600 text-sm font-medium rounded-xl transition-colors border border-slate-200">
              {cfg.secondaryLabel}
            </Link>
          </div>
        </div>

        {/* Quick navigation */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {QUICK_LINKS.map(l => (
            <Link key={l.href} to={l.href}
              className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col items-center gap-2 hover:border-slate-300 hover:shadow-sm transition-all">
              <Icon name={l.icon} size={18} className="text-slate-500" />
              <span className="text-[11px] font-medium text-slate-600 text-center leading-tight">{l.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
