import { useEffect } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { analytics } from "@/lib/analytics";

const CTA_LINKS = [
  { label: "Учебный кабинет", desc: "Добавьте обучение и подтверждённые сигналы", icon: "GraduationCap", href: "/cabinet/learning", color: "bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100" },
  { label: "Профессиональный профиль", desc: "Заполните опыт и компетенции", icon: "IdCard", href: "/cabinet/profile", color: "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100" },
  { label: "Проекты", desc: "Подтвердите практический опыт", icon: "FolderOpen", href: "/cabinet/projects", color: "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100" },
];

export default function CompetencyMapPage() {
  useEffect(() => {
    analytics.competencyMapViewed();
  }, []);

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

          {/* Header */}
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <Icon name="Map" size={22} className="text-emerald-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-bold text-slate-900">Карта компетенций</h1>
                <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">Бета</span>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed">
                Здесь будут собраны ваши подтверждённые навыки, пробелы и рекомендации по развитию.
              </p>
            </div>
          </div>

          {/* Empty state */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-12 flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 flex items-center justify-center mb-5">
                <Icon name="Map" size={34} className="text-emerald-300" />
              </div>
              <h2 className="text-base font-bold text-slate-800 mb-2">Карта пока формируется</h2>
              <p className="text-sm text-slate-500 leading-relaxed max-w-sm">
                Добавьте обучение, проекты и подтверждённые сигналы — и мы соберём вашу карту компетенций.
              </p>
            </div>

            {/* What will appear */}
            <div className="border-t border-slate-100 px-6 py-5 bg-slate-50/50">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Что появится на карте</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { icon: "BadgeCheck", label: "Подтверждённые навыки", desc: "Компетенции с evidence из обучения" },
                  { icon: "TrendingUp", label: "Зоны роста", desc: "Где есть потенциал для развития" },
                  { icon: "Lightbulb", label: "Рекомендации", desc: "Следующие шаги на основе данных" },
                ].map(item => (
                  <div key={item.label} className="flex items-start gap-2.5 p-3 bg-white rounded-xl border border-slate-200">
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon name={item.icon} size={14} className="text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-700 leading-tight">{item.label}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CTA section */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-3">Что поможет сформировать карту</p>
            <div className="space-y-2.5">
              {CTA_LINKS.map(cta => (
                <Link
                  key={cta.href}
                  to={cta.href}
                  onClick={() => analytics.competencyMapCtaClicked(cta.href)}
                  className={`flex items-center gap-3 p-4 rounded-xl border transition-all group ${cta.color}`}
                >
                  <div className="w-9 h-9 rounded-xl bg-white/70 flex items-center justify-center flex-shrink-0">
                    <Icon name={cta.icon} size={17} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight">{cta.label}</p>
                    <p className="text-xs opacity-70 mt-0.5">{cta.desc}</p>
                  </div>
                  <Icon name="ChevronRight" size={16} className="flex-shrink-0 opacity-50 group-hover:opacity-80 transition-opacity" />
                </Link>
              ))}
            </div>
          </div>

          {/* Status note */}
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
            <Icon name="Construction" size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-800">Модуль в разработке</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Диагностика компетенций и автоматическое формирование карты готовятся к запуску.
                Данные уже собираются — карта появится автоматически.
              </p>
            </div>
          </div>

        </div>
      </div>
    </Layout>
  );
}
