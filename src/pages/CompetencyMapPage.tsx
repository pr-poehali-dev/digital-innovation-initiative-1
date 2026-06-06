import { useState, useEffect, useCallback } from "react";
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
  onAssessed,
}: {
  comp: CompetencyEntry;
  onClose: () => void;
  onAssessed: (competencyId: number, level: number) => void;
}) {
  const conf = CONF_CONFIG[comp.confidence] ?? CONF_CONFIG.low;
  const [pendingLevel, setPendingLevel] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    analytics.competencyMapCompetencyClicked(comp.id, comp.name);
  }, [comp.id, comp.name]);

  const handleAssess = useCallback(async () => {
    if (pendingLevel === null) return;
    setSaving(true);
    try {
      await competencyMapApi.selfAssess(comp.id, pendingLevel);
      setSaved(true);
      analytics.competencyMapSelfAssessed(comp.id, comp.name, pendingLevel);
      onAssessed(comp.id, pendingLevel);
      setTimeout(() => { setSaved(false); setPendingLevel(null); }, 1500);
    } finally {
      setSaving(false);
    }
  }, [pendingLevel, comp.id, comp.name, onAssessed]);

  const displayLevel = pendingLevel !== null ? pendingLevel : comp.current_level;
  const levelDesc = comp.level_descriptors[String(displayLevel)];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-0 sm:px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 mb-0.5">{comp.code}</p>
            <h3 className="text-base font-bold text-slate-900 leading-tight break-words">{comp.name}</h3>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${conf.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${conf.dot}`} />
                {conf.label || "Нет оценки"}
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

          {/* Self-assess */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-xs font-semibold text-slate-500 mb-3">
              {comp.current_level > 0 ? "Ваш уровень" : "Оцените свой уровень"}
            </p>

            {/* Level buttons */}
            <div className="flex gap-1.5 mb-3">
              {[1, 2, 3, 4, 5].map(l => (
                <button
                  key={l}
                  onClick={() => setPendingLevel(l === pendingLevel ? null : l)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all border ${
                    displayLevel >= l
                      ? pendingLevel !== null && l <= pendingLevel
                        ? "bg-violet-600 text-white border-violet-600"
                        : "bg-emerald-500 text-white border-emerald-500"
                      : "bg-white text-slate-400 border-slate-200 hover:border-slate-400"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            {/* Level descriptor */}
            {levelDesc && (
              <p className={`text-xs leading-relaxed mb-3 ${pendingLevel !== null ? "text-violet-700" : "text-slate-600"}`}>
                {levelDesc}
              </p>
            )}

            {/* Save button */}
            {pendingLevel !== null && pendingLevel !== comp.current_level && (
              <button
                onClick={handleAssess}
                disabled={saving || saved}
                className="w-full py-2 rounded-lg text-xs font-semibold bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {saved
                  ? <><Icon name="Check" size={13} /> Сохранено</>
                  : saving
                  ? "Сохраняем..."
                  : <><Icon name="Save" size={13} /> Сохранить уровень {pendingLevel}</>
                }
              </button>
            )}
          </div>

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
                        name={src.is_verified ? "BadgeCheck" : src.kind === "assessment" ? "ClipboardCheck" : src.kind === "project" ? "FolderOpen" : src.kind === "education_confirmed" ? "GraduationCap" : "FileText"}
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

          {/* No sources — encourage self-assess */}
          {comp.sources.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-2">
              Оцените уровень выше — это первый шаг к наполнению карты
            </p>
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

// ── Recommendations-lite ──────────────────────────────────────────────

type Rec = {
  icon: string;
  label: string;
  desc: string;
  href: string;
  kind: "learning" | "profile" | "project" | "assess";
};

function buildRecs(
  status: "empty" | "partial" | "ready",
  data: CompetencyMapResult,
): Rec[] {
  if (status === "empty") {
    return [
      { icon: "ClipboardCheck", label: "Оцените компетенции", desc: "Откройте любой домен и выставьте уровень — это самый быстрый старт", href: "", kind: "assess" },
      { icon: "GraduationCap", label: "Добавьте обучение", desc: "Завершённый курс — сильнейший верифицированный сигнал", href: "/cabinet/learning", kind: "learning" },
      { icon: "IdCard", label: "Заполните профиль", desc: "Опыт работы и образование усиливают карту", href: "/cabinet/profile", kind: "profile" },
    ];
  }
  if (status === "partial") {
    const lowConf = data.domains
      .flatMap(d => d.competencies)
      .filter(c => c.confidence === "low")
      .slice(0, 1);
    const recs: Rec[] = [
      { icon: "GraduationCap", label: "Добавьте обучение", desc: "Верифицированные сигналы поднимут уверенность с low до high", href: "/cabinet/learning", kind: "learning" },
    ];
    if (lowConf.length > 0) {
      recs.push({ icon: "TrendingUp", label: `Усильте «${lowConf[0].name}»`, desc: "Эта компетенция есть, но уверенность низкая — добавьте источник", href: "/cabinet/learning", kind: "learning" });
    }
    recs.push({ icon: "FolderOpen", label: "Добавьте проект", desc: "Участие в проекте даёт дополнительный сигнал по доменам карты", href: "/cabinet/projects", kind: "project" });
    return recs;
  }
  // ready
  const lowOrMed = data.domains
    .flatMap(d => d.competencies)
    .filter(c => c.confidence === "low" || c.confidence === "medium")
    .slice(0, 1);
  const recs: Rec[] = [];
  if (lowOrMed.length > 0) {
    recs.push({ icon: "TrendingUp", label: `Развейте «${lowOrMed[0].name}»`, desc: "Добавьте обучение или проект — и уверенность вырастет", href: "/cabinet/learning", kind: "learning" });
  }
  recs.push({ icon: "GraduationCap", label: "Найдите следующий курс", desc: "В учебном кабинете есть рекомендации по вашим компетенциям", href: "/cabinet/learning", kind: "learning" });
  if (data.summary.verified_count < data.summary.total_competencies) {
    recs.push({ icon: "BadgeCheck", label: "Подтвердите оценки", desc: "Часть компетенций без верифицированных источников — пройдите обучение", href: "/cabinet/learning", kind: "learning" });
  }
  return recs.slice(0, 3);
}

function RecommendationsBlock({
  status,
  data,
}: {
  status: "empty" | "partial" | "ready";
  data: CompetencyMapResult;
}) {
  const recs = buildRecs(status, data);

  useEffect(() => {
    if (recs.length > 0) analytics.competencyMapRecommendationShown(status, recs.length);
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (recs.length === 0) return null;

  const ICON_COLOR: Record<string, string> = {
    learning: "bg-violet-50 text-violet-600",
    profile:  "bg-indigo-50 text-indigo-600",
    project:  "bg-blue-50 text-blue-600",
    assess:   "bg-emerald-50 text-emerald-600",
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Что делать дальше</p>
      </div>
      <div className="divide-y divide-slate-100">
        {recs.map((rec, i) => {
          const colorCls = ICON_COLOR[rec.kind] ?? "bg-slate-50 text-slate-500";
          const inner = (
            <div className="flex items-center gap-3 px-5 py-3.5 group">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${colorCls}`}>
                <Icon name={rec.icon} size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 leading-tight">{rec.label}</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{rec.desc}</p>
              </div>
              {rec.href && <Icon name="ChevronRight" size={14} className="text-slate-300 flex-shrink-0 group-hover:text-slate-500 transition-colors" />}
            </div>
          );
          return rec.href
            ? (
              <Link
                key={i}
                to={rec.href}
                className="block hover:bg-slate-50 transition-colors"
                onClick={() => analytics.competencyMapRecommendationClicked(status, rec.kind, rec.href)}
              >
                {inner}
              </Link>
            )
            : (
              <div key={i} className="block">
                {inner}
              </div>
            );
        })}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────

export default function CompetencyMapPage() {
  const [data, setData] = useState<CompetencyMapResult | null>(null);
  const [status, setStatus] = useState<"loading" | "empty" | "partial" | "ready" | "error">("loading");
  const [selected, setSelected] = useState<CompetencyEntry | null>(null);
  const [expandedDomains, setExpandedDomains] = useState<Set<number>>(new Set());

  const loadMap = useCallback((quiet = false) => {
    if (!quiet) setStatus("loading");
    competencyMapApi.getMe()
      .then(result => {
        setData(result);
        const total = result.summary.total_competencies;
        const mapStatus: "empty" | "partial" | "ready" =
          total === 0 ? "empty" : total < 3 ? "partial" : "ready";
        setStatus(mapStatus);
        analytics.competencyMapLoaded(mapStatus, result.summary);
        const firstTwo = result.domains.slice(0, 2).map(d => d.id);
        setExpandedDomains(prev => prev.size > 0 ? prev : new Set(firstTwo));
      })
      .catch(() => setStatus("error"));
  }, []);

  const handleAssessed = useCallback((_competencyId: number, _level: number) => {
    // Перезагружаем карту тихо (без spinner) — scoring пересчитывается на сервере
    setTimeout(() => loadMap(true), 300);
  }, [loadMap]);

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
          {status === "empty" && data && (
            <>
              <div className="bg-white rounded-2xl border border-slate-200 px-6 py-10 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 flex items-center justify-center mb-4">
                  <Icon name="Map" size={28} className="text-emerald-300" />
                </div>
                <h2 className="text-base font-bold text-slate-800 mb-2">Карта пока пустая</h2>
                <p className="text-sm text-slate-500 leading-relaxed max-w-sm">
                  Оцените свои компетенции или добавьте обучение — и карта сформируется автоматически.
                </p>
              </div>
              <RecommendationsBlock status="empty" data={data} />
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

              {/* Recommendations */}
              <RecommendationsBlock status={status as "partial" | "ready"} data={data} />

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
        <DrilldownPanel
          comp={selected}
          onClose={() => setSelected(null)}
          onAssessed={handleAssessed}
        />
      )}
    </Layout>
  );
}