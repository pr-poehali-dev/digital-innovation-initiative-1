/**
 * HelpPanel — универсальный каскадный блок мини-инструкции.
 *
 * Свёрнут по умолчанию. Открывается одним кликом.
 * Структура: summary → steps → sections (раскрываемые) → tips.
 */
import { useState } from "react";
import Icon from "@/components/ui/icon";

// ------------------------------------------------------------------ //
//  Types                                                               //
// ------------------------------------------------------------------ //

export interface HelpStep {
  num: number;
  title: string;
  description: string;
}

export interface HelpSubsection {
  title: string;
  content: string;
}

export interface HelpSection {
  title: string;
  icon?: string;           // lucide icon name
  content?: string;
  subsections?: HelpSubsection[];
}

export interface HelpTip {
  kind: "tip" | "warning" | "example";
  text: string;
}

export interface HelpPanelProps {
  title: string;           // "Как создать презентацию"
  summary: string;         // 1-2 строки: что здесь происходит
  steps?: HelpStep[];      // Шаг 1, 2, 3...
  sections?: HelpSection[]; // Раскрываемые блоки с деталями
  tips?: HelpTip[];        // Советы / частые ошибки
  defaultOpen?: boolean;
}

// ------------------------------------------------------------------ //
//  Component                                                           //
// ------------------------------------------------------------------ //

export default function HelpPanel({
  title, summary, steps, sections, tips, defaultOpen = false,
}: HelpPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [openSections, setOpenSections] = useState<Set<number>>(new Set());

  const toggleSection = (i: number) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(i)) { next.delete(i); } else { next.add(i); }
      return next;
    });
  };

  return (
    <div className={`rounded-2xl border transition-colors mb-6 ${open ? "border-blue-200 bg-blue-50/40" : "border-slate-200 bg-card"}`}>
      {/* ── Шапка (всегда видна) ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${open ? "bg-blue-100" : "bg-slate-100"}`}>
          <Icon name="HelpCircle" size={16} className={open ? "text-blue-600" : "text-slate-500"} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${open ? "text-blue-900" : "text-slate-700"}`}>{title}</p>
          {!open && <p className="text-xs text-muted-foreground truncate">{summary}</p>}
        </div>
        <div className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-medium ${open ? "text-blue-600" : "text-slate-500"}`}>
          {open ? (
            <><Icon name="ChevronUp" size={14} /><span className="hidden sm:block">Свернуть</span></>
          ) : (
            <><Icon name="ChevronDown" size={14} /><span className="hidden sm:block">Как пользоваться</span></>
          )}
        </div>
      </button>

      {/* ── Раскрытое содержимое ── */}
      {open && (
        <div className="px-4 pb-4 space-y-5">
          {/* Summary */}
          <p className="text-sm text-slate-700 border-l-4 border-blue-300 pl-3 py-1 bg-white/60 rounded-r-lg">
            {summary}
          </p>

          {/* Steps */}
          {steps && steps.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Пошагово</p>
              <div className="space-y-2">
                {steps.map((step) => (
                  <div key={step.num} className="flex gap-3 items-start">
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                      {step.num}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{step.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sections */}
          {sections && sections.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Подробнее</p>
              <div className="space-y-2">
                {sections.map((sec, i) => {
                  const isOpen = openSections.has(i);
                  return (
                    <div key={i} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                      <button
                        onClick={() => toggleSection(i)}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
                      >
                        {sec.icon && (
                          <div className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center flex-shrink-0">
                            <Icon name={sec.icon as Parameters<typeof Icon>[0]["name"]} size={13} className="text-slate-600" />
                          </div>
                        )}
                        <span className="text-sm font-medium text-slate-700 flex-1">{sec.title}</span>
                        <Icon name={isOpen ? "ChevronUp" : "ChevronDown"} size={14} className="text-slate-400 flex-shrink-0" />
                      </button>
                      {isOpen && (
                        <div className="px-3 pb-3 border-t border-slate-100">
                          {sec.content && (
                            <p className="text-sm text-slate-600 mt-2">{sec.content}</p>
                          )}
                          {sec.subsections && sec.subsections.length > 0 && (
                            <div className="mt-2 space-y-2">
                              {sec.subsections.map((sub, j) => (
                                <div key={j} className="bg-slate-50 rounded-lg px-3 py-2">
                                  <p className="text-xs font-semibold text-slate-700 mb-0.5">{sub.title}</p>
                                  <p className="text-xs text-slate-500">{sub.content}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tips */}
          {tips && tips.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Советы</p>
              <div className="space-y-2">
                {tips.map((tip, i) => (
                  <div key={i} className={`flex gap-2 text-xs rounded-lg px-3 py-2 ${
                    tip.kind === "warning"
                      ? "bg-amber-50 border border-amber-200 text-amber-800"
                      : tip.kind === "example"
                      ? "bg-green-50 border border-green-200 text-green-800"
                      : "bg-blue-50 border border-blue-200 text-blue-800"
                  }`}>
                    <span className="flex-shrink-0">
                      {tip.kind === "warning" ? "⚠️" : tip.kind === "example" ? "💡" : "✅"}
                    </span>
                    <span>{tip.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
