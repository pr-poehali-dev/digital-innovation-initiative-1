import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { analytics } from "@/lib/analytics";
import { competencyMapApi, type CompetencyMapResult, type CompetencyEntry } from "@/lib/competencyMapApi";

// ── Confidence helpers ────────────────────────────────────────────────

const CONF_CONFIG = {
  high:   { label: "Высокая",   color: "bg-emerald-100 text-emerald-700 border-emerald-200",  dot: "bg-emerald-500" },
  medium: { label: "Средняя",   color: "bg-violet-100 text-violet-700 border-violet-200",     dot: "bg-violet-500" },
  low:    { label: "Низкая",    color: "bg-slate-100 text-slate-600 border-slate-200",         dot: "bg-slate-400" },
  none:   { label: "",          color: "",                                                      dot: "" },
};

const CTA_LINKS = [
  { label: "Учебный кабинет",          desc: "Добавьте обучение — это главный верифицированный сигнал", icon: "GraduationCap", href: "/cabinet/learning",  color: "bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100" },
  { label: "Профессиональный профиль", desc: "Заполните опыт и самооценку компетенций",                 icon: "IdCard",        href: "/cabinet/profile",   color: "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100" },
  { label: "Проекты",                  desc: "Подтвердите практический опыт",                           icon: "FolderOpen",    href: "/cabinet/projects",  color: "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100" },
];

// ── Drilldown panel ───────────────────────────────────────────────────

function DrilldownPanel({
  comp,
  onClose,
}: {
  comp: CompetencyEntry;
  onClose: () => void;
}) {
  const conf = CONF_CONFIG[comp.confidence] ?? CONF_CONFIG.low;
  const levelDesc = comp.level_descriptors[String(comp.current_level)];

  useEffect(() => {
    analytics.competencyMapCompetencyClicked(comp.id, comp.name);
  }, [comp.id, comp.name]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-0 sm:px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[80vh] overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 mb-0.5">{comp.code}</p>
            <h3 className="text-base font-bold text-slate-900 leading-tight break-words">{comp.name}</h3>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${conf.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${conf.dot}`} />
                {conf.label} уверенность
              </span>
              {comp.is_verified && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                  <Icon name="BadgeCheck" size={12} />
                  Verified
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors flex-shrink-0">
            <Icon name="X" size={16} className="text-slate-500" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">

          {/* Level */}
          {comp.current_level > 0 && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-xs font-semibold text-slate-500 mb-1">Текущий уровень</p>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="flex gap-1">
                  {[1,2,3,4,5].map(l => (
                    <div key={l} className={`w-5 h-2 rounded-full ${l <= comp.current_level ? "bg-emerald-500" : "bg-slate-200"}`} />
                  ))}
                </div>
                <span className="text-xs font-bold text-slate-700">{comp.current_level} / 5</span>
              </div>
              {levelDesc && <p className="text-xs text-slate-600 leading-relaxed">{levelDesc}</p>}
            </div>
          )}

          {/* Sources */}
          {comp.sources.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Источники</p>
              <div className="space-y-2">
                {comp.sources.map((src, i) => (
                  <div key={i}
                    className="flex gap-2.5 p-3 rounded-xl border border-slate-100 bg-white"
                    onClick={() => src.evidence_id && analytics.competencyMapEvidenceClicked(src.evidence_id)}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${src.is_verified ? "bg-emerald-100" : "bg-slate-100"}`}>
                      <Icon
                        name={src.is_verified ? "BadgeCheck" : src.kind === "assessment" ? "ClipboardCheck" : src.kind === "project" ? "FolderOpen" : "FileText"}
                        size={13}
                        className={src.is_verified ? "text-emerald-600" : "text-slate-500"}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-800 leading-tight break-words">{src.label}</p>
                      {src.description && (
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed break-words line-clamp-2">{src.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {src.is_verified && (
                          <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">verified</span>
                        )}
                        {src.date && (
                          <span className="text-[10px] text-slate-400">{src.date.slice(0, 10)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No sources */}
          {comp.sources.length === 0 && (
            <div className="text-center py-4">
              <p className="text-sm text-slate-500">Источники не найдены</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Competency chip ───────────────────────────────────────────────────

function CompetencyChip({
  comp,
  onClick,
}: {
  comp: CompetencyEntry;
  onClick: () => void;
}) {
  const conf = CONF_CONFIG[comp.confidence] ?? CONF_CONFIG.low;
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 rounded-xl border bg-white hover:bg-slate-50 transition-colors text-left w-full group"
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${conf.dot}`} />
      <span className="text-sm text-slate-800 font-medium flex-1 min-w-0 truncate">{comp.name}</span>
      {comp.is_verified && (
        <Icon name="BadgeCheck" size={13} className="text-emerald-500 flex-shrink-0" />
      )}
      <Icon name="ChevronRight" size={13} className="text-slate-300 flex-shrink-0 group-hover:text-slate-500 transition-colors" />
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────

export default function CompetencyMapPage() {
  const [data, setData] = useState<CompetencyMapResult | null>(null);
  const [status, setStatus] = useState<"loading" | "empty" | "partial" | "ready" | "error">("loading");
  const [selected, setSelected] = useState<CompetencyEntry | null>(null);
  const [expandedDomains, setExpandedDomains] = useState<Set<number>>(new Set());

  useEffect(() => {
    analytics.competencyMapViewed();
    competencyMapApi.getMe()
      .then(result => {
        setData(result);
        const total = result.summary.total_competencies;
        const mapStatus: "empty" | "partial" | "ready" =
          total === 0 ? "empty" : total < 3 ? "partial" : "ready";
        setStatus(mapStatus);
        analytics.competencyMapLoaded(mapStatus, result.summary);
        // раскрываем первые 2 домена сразу
        const firstTwo = result.domains.slice(0, 2).map(d => d.id);
        setExpandedDomains(new Set(firstTwo));
      })
      .catch(() => setStatus("error"));
  }, []);

  function toggleDomain(id: number) {
    setExpandedDomains(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        analytics.competencyMapDomainExpanded(id, false);
      } else {
        next.add(id);
        analytics.competencyMapDomainExpanded(id, true);
      }
      return next;
    });
  }

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">

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
                {status === "ready"
                  ? "Ваши компетенции, собранные из обучения, оценок и проектов."
                  : "Здесь собираются ваши подтверждённые навыки и сигналы развития."}
              </p>
            </div>
          </div>

          {/* Loading */}
          {status === "loading" && (
            <div className="bg-white rounded-2xl border border-slate-200 px-6 py-12 flex flex-col items-center">
              <div className="w-8 h-8 border-2 border-slate-300 border-t-emerald-600 rounded-full animate-spin mb-4" />
              <p className="text-sm text-slate-500">Собираем вашу карту...</p>
            </div>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="bg-white rounded-2xl border border-slate-200 px-6 py-10 text-center">
              <Icon name="AlertCircle" size={28} className="text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-700">Не удалось загрузить карту</p>
              <p className="text-xs text-slate-400 mt-1">Попробуйте обновить страницу</p>
            </div>
          )}

          {/* Empty state */}
          {status === "empty" && (
            <>
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-10 flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 flex items-center justify-center mb-4">
                    <Icon name="Map" size={28} className="text-emerald-300" />
                  </div>
                  <h2 className="text-base font-bold text-slate-800 mb-2">Карта пока пустая</h2>
                  <p className="text-sm text-slate-500 leading-relaxed max-w-sm">
                    Завершите обучение, заполните профиль или добавьте проекты — и карта сформируется автоматически.
                  </p>
                </div>
                <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Что нужно сделать</p>
                  <div className="space-y-2">
                    {CTA_LINKS.map(cta => (
                      <Link key={cta.href} to={cta.href}
                        onClick={() => analytics.competencyMapEmptyCtaClicked(cta.href)}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all group ${cta.color}`}
                      >
                        <Icon name={cta.icon} size={16} className="flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold leading-tight">{cta.label}</p>
                          <p className="text-[11px] opacity-70 mt-0.5">{cta.desc}</p>
                        </div>
                        <Icon name="ChevronRight" size={14} className="flex-shrink-0 opacity-40 group-hover:opacity-70 transition-opacity" />
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Partial / Ready */}
          {(status === "partial" || status === "ready") && data && (
            <>
              {/* Partial notice */}
              {status === "partial" && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                  <Icon name="Info" size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 leading-relaxed">
                    Карта формируется — данных пока немного. Добавьте обучение или заполните профиль, чтобы она стала полнее.
                  </p>
                </div>
              )}

              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Компетенций",  value: data.summary.total_competencies, icon: "LayoutGrid", color: "text-slate-700" },
                  { label: "Verified",     value: data.summary.verified_count,     icon: "BadgeCheck",  color: "text-emerald-600" },
                  { label: "Доменов",      value: data.summary.domains_covered,    icon: "Layers",      color: "text-violet-600" },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-2xl border border-slate-200 px-4 py-4 text-center">
                    <Icon name={s.icon} size={18} className={`${s.color} mx-auto mb-1.5`} />
                    <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Top competencies */}
              {data.summary.top_competencies.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Топ компетенций</p>
                  </div>
                  <div className="p-3 space-y-1">
                    {data.summary.top_competencies.map(tc => {
                      const conf = CONF_CONFIG[tc.confidence as keyof typeof CONF_CONFIG] ?? CONF_CONFIG.low;
                      return (
                        <div key={tc.id}
                          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
                          onClick={() => {
                            const found = data.domains.flatMap(d => d.competencies).find(c => c.id === tc.id);
                            if (found) setSelected(found);
                          }}
                        >
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${conf.dot}`} />
                          <span className="text-sm text-slate-800 font-medium flex-1">{tc.name}</span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${conf.color}`}>{conf.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Domains */}
              <div className="space-y-2.5">
                {data.domains.map(domain => {
                  const isOpen = expandedDomains.has(domain.id);
                  const verifiedInDomain = domain.competencies.filter(c => c.is_verified).length;
                  return (
                    <div key={domain.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                      <button
                        onClick={() => toggleDomain(domain.id)}
                        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-slate-800 leading-tight">{domain.name}</p>
                            {verifiedInDomain > 0 && (
                              <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                {verifiedInDomain} verified
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">{domain.competencies.length} компетенций</p>
                        </div>
                        <Icon
                          name={isOpen ? "ChevronUp" : "ChevronDown"}
                          size={16}
                          className="text-slate-400 flex-shrink-0"
                        />
                      </button>

                      {isOpen && (
                        <div className="border-t border-slate-100 px-3 py-3 space-y-1">
                          {domain.competencies.map(comp => (
                            <CompetencyChip
                              key={comp.id}
                              comp={comp}
                              onClick={() => setSelected(comp)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Уверенность</p>
                <div className="flex flex-wrap gap-3">
                  {(["high", "medium", "low"] as const).map(key => {
                    const c = CONF_CONFIG[key];
                    return (
                      <div key={key} className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                        <span className="text-xs text-slate-600">{c.label}</span>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-1.5">
                    <Icon name="BadgeCheck" size={13} className="text-emerald-500" />
                    <span className="text-xs text-slate-600">Verified — есть обучение</span>
                  </div>
                </div>
              </div>
            </>
          )}

        </div>
      </div>

      {/* Drilldown */}
      {selected && (
        <DrilldownPanel comp={selected} onClose={() => setSelected(null)} />
      )}
    </Layout>
  );
}