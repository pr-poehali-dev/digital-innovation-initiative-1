import { useState } from "react";
import Icon from "@/components/ui/icon";

export interface GuideFlowStep {
  icon: string;
  title: string;
  desc: string;
}

export interface GuideCapability {
  icon: string;
  title: string;
  desc: string;
}

interface PageGuideProps {
  title: string;
  intro: string;
  flow: GuideFlowStep[];
  capabilities: GuideCapability[];
  tip?: string;
}

/**
 * Сворачиваемая мини-инструкция для страницы раздела кабинета руководителя.
 * По умолчанию свёрнута. Визуал — схема работы (шаги слева направо со
 * стрелками), ниже — список возможностей раздела.
 */
export default function PageGuide({ title, intro, flow, capabilities, tip }: PageGuideProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-violet-600/20 bg-gradient-to-br from-violet-50 to-white overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-violet-50/60 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
            <Icon name="BookOpenText" fallback="BookOpen" size={16} className="text-violet-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">Как пользоваться разделом «{title}»</p>
            {!open && <p className="text-xs text-slate-500 mt-0.5 truncate">{intro}</p>}
          </div>
        </div>
        <Icon name={open ? "ChevronUp" : "ChevronDown"} size={16} className="text-slate-500 flex-shrink-0" />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-violet-600/10 pt-3">
          <p className="text-sm text-slate-600 leading-relaxed">{intro}</p>

          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2.5">Схема работы</p>
            <div className="flex flex-wrap items-stretch gap-1.5">
              {flow.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 w-[150px] flex-shrink-0">
                    <div className="w-7 h-7 rounded-md bg-violet-100 flex items-center justify-center mb-1.5">
                      <Icon name={s.icon} size={14} className="text-violet-600" />
                    </div>
                    <p className="text-xs font-medium text-slate-900 leading-tight">{s.title}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{s.desc}</p>
                  </div>
                  {i < flow.length - 1 && (
                    <Icon name="ArrowRight" size={16} className="text-violet-300 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2.5">Возможности раздела</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {capabilities.map((c, i) => (
                <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-slate-200">
                  <Icon name={c.icon} size={15} className="text-violet-600 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-900">{c.title}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{c.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {tip && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <Icon name="Lightbulb" size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">{tip}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}