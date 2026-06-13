import { useState, useEffect } from "react";
import Icon from "@/components/ui/icon";
import { STRATEGY_URL, strategyHdr as hdrFn } from "@/lib/strategyApi";
import {
  Profile, RoadmapItem,
  PILLAR_ICONS, PILLAR_COLORS, GUARDRAIL_ICONS,
  IMPACT_COLOR, EFFORT_COLOR, RM_STATUS_CFG, SOURCE_ICON,
} from "./StrategyTypes";

function hdr() { return hdrFn(); }

// ── Primitives ──────────────────────────────────────────────────────

export function DeltaBadge({ delta }: { delta?: number | null }) {
  if (delta === null || delta === undefined) return null;
  const up = delta >= 0;
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
      up ? "bg-emerald-900/40 text-emerald-400" : "bg-red-900/40 text-red-400"
    }`}>
      {up ? "▲" : "▼"} {Math.abs(delta)}%
    </span>
  );
}

export function ConfBadge({ conf }: { conf: string }) {
  const cfg: Record<string, string> = {
    high:   "bg-emerald-900/40 text-emerald-400 border-emerald-800",
    medium: "bg-amber-900/30 text-amber-400 border-amber-800",
    low:    "bg-gray-800 text-gray-500 border-gray-700",
  };
  return <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${cfg[conf] ?? cfg.low}`}>{conf}</span>;
}

export function ImpactBadge({ impact }: { impact: string }) {
  const cfg: Record<string, string> = {
    high:   "bg-red-900/30 text-red-400",
    medium: "bg-orange-900/30 text-orange-400",
    low:    "bg-gray-800 text-gray-500",
  };
  return <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${cfg[impact] ?? cfg.low}`}>{impact} impact</span>;
}

export function Spinner() {
  return <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />;
}

// ── RoadmapCard ────────────────────────────────────────────────────

export function RoadmapCard({ item, onMoveLane, onDelete, onStatusChange, onStartInitiative }: {
  item: RoadmapItem;
  onMoveLane: (lane: string) => void;
  onDelete: () => void;
  onStatusChange: (status: string) => void;
  onStartInitiative?: () => void;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2 group">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-gray-200 flex-1 leading-snug">{item.title}</p>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {item.lane !== "now" && (
            <button onClick={() => onMoveLane(item.lane === "later" ? "next" : "now")}
              className="p-1 text-gray-700 hover:text-gray-400 transition-colors" title="Вперёд">
              <Icon name="ChevronLeft" size={11} />
            </button>
          )}
          {item.lane !== "later" && (
            <button onClick={() => onMoveLane(item.lane === "now" ? "next" : "later")}
              className="p-1 text-gray-700 hover:text-gray-400 transition-colors" title="Назад">
              <Icon name="ChevronRight" size={11} />
            </button>
          )}
          <button onClick={onDelete} className="p-1 text-gray-700 hover:text-red-500 transition-colors">
            <Icon name="Trash2" size={11} />
          </button>
        </div>
      </div>
      {item.description && <p className="text-[10px] text-gray-500 line-clamp-2">{item.description}</p>}
      <div className="flex items-center gap-1.5 flex-wrap">
        <select value={item.status} onChange={e => { e.stopPropagation(); onStatusChange(e.target.value); }}
          onClick={e => e.stopPropagation()}
          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border-0 focus:outline-none cursor-pointer ${RM_STATUS_CFG[item.status] ?? RM_STATUS_CFG.idea}`}>
          {[["idea","Идея"],["planned","Запланировано"],["in_progress","В работе"],["done","Готово"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span className={`text-[9px] font-semibold ${IMPACT_COLOR[item.impact] ?? "text-gray-500"}`}>↑{item.impact}</span>
        <span className={`text-[9px] px-1 py-0.5 rounded ${EFFORT_COLOR[item.effort] ?? ""}`}>{item.effort} eff.</span>
        {item.source_type && item.source_type !== "manual" && (
          <Icon name={SOURCE_ICON[item.source_type] ?? "Circle"} size={10} className="text-gray-700 ml-auto" />
        )}
      </div>
      {(item.target_metric || item.target_segment) && (
        <div className="text-[9px] text-gray-700 space-y-0.5">
          {item.target_metric && <div>📊 {item.target_metric}</div>}
          {item.target_segment && <div>👥 {item.target_segment}</div>}
        </div>
      )}
      {onStartInitiative && (
        <button onClick={e => { e.stopPropagation(); onStartInitiative(); }}
          className="w-full text-[9px] font-semibold px-2 py-1 rounded-lg bg-violet-900/20 text-violet-400 hover:bg-violet-800/30 border border-violet-800/40 transition-colors flex items-center justify-center gap-1">
          <Icon name="Rocket" size={9} /> Начать инициативу
        </button>
      )}
    </div>
  );
}

// ── ProfileEditor ──────────────────────────────────────────────────

export function ProfileEditor({ profile, onSave }: { profile: Profile; onSave: (p: Profile) => void }) {
  const [form, setForm] = useState<Profile>(profile);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<"vision" | "core" | "pillars" | "guardrails" | "roadmap">("vision");

  useEffect(() => { setForm(profile); }, [profile]);

  async function save() {
    setSaving(true);
    const res = await fetch(`${STRATEGY_URL}/?action=strategy_profile_update`, {
      method: "POST", headers: hdr(),
      body: JSON.stringify({
        vision_text: form.vision_text, product_thesis: form.product_thesis,
        mission_text: form.mission_text, north_star_name: form.north_star_name,
        north_star_definition: form.north_star_definition,
        target_segments: form.target_segments, quarter_goals: form.quarter_goals,
        priority_themes: form.priority_themes, non_goals: form.non_goals,
        strategic_pillars: form.strategic_pillars,
        guardrails: form.guardrails,
      }),
    });
    setSaving(false);
    if ((await res.json()).ok) onSave(form);
  }

  const inp = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600 transition-colors";
  const lbl = "block text-[10px] text-gray-500 mb-1 font-semibold uppercase tracking-wide";

  function listField(label: string, items: string[], key: keyof Profile) {
    return (
      <div>
        <label className={lbl}>{label}</label>
        {items.map((v, i) => (
          <div key={i} className="flex gap-2 mb-1.5">
            <input className={`${inp} flex-1`} value={v}
              onChange={e => setForm(f => ({ ...f, [key]: (f[key] as string[]).map((x, j) => j === i ? e.target.value : x) }))} />
            <button onClick={() => setForm(f => ({ ...f, [key]: (f[key] as string[]).filter((_, j) => j !== i) }))}
              className="text-gray-700 hover:text-red-400 transition-colors">
              <Icon name="X" size={14} />
            </button>
          </div>
        ))}
        <button onClick={() => setForm(f => ({ ...f, [key]: [...(f[key] as string[]), ""] }))}
          className="text-[10px] text-violet-400 hover:text-violet-300 font-medium">
          + Добавить
        </button>
      </div>
    );
  }

  const SECTIONS = [
    { key: "vision",     label: "Видение", icon: "Telescope" },
    { key: "core",       label: "Миссия / North Star", icon: "Star" },
    { key: "pillars",    label: "Стратегические столпы", icon: "Columns3" },
    { key: "guardrails", label: "Принципы", icon: "ShieldCheck" },
    { key: "roadmap",    label: "Цели и приоритеты", icon: "ListTodo" },
  ] as const;

  return (
    <div className="space-y-5">
      {/* Section nav */}
      <div className="flex gap-1.5 flex-wrap border-b border-gray-800 pb-3">
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${section === s.key ? "bg-violet-700 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700"}`}>
            <Icon name={s.icon} size={11} />{s.label}
          </button>
        ))}
      </div>

      {/* Vision */}
      {section === "vision" && (
        <div className="space-y-4">
          <div className="bg-violet-900/20 border border-violet-800/40 rounded-xl p-4">
            <p className="text-[10px] text-violet-400 font-semibold uppercase mb-3">Видение платформы</p>
            <textarea className={`${inp} resize-none`} rows={4} value={form.vision_text}
              onChange={e => setForm(f => ({ ...f, vision_text: e.target.value }))}
              placeholder="Глобальная платформа раскрытия профессионального потенциала..." />
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-[10px] text-gray-400 font-semibold uppercase mb-3">Продуктовый тезис</p>
            <p className="text-[10px] text-gray-600 mb-2">Что мы строим? Чем это НЕ является?</p>
            <textarea className={`${inp} resize-none`} rows={5} value={form.product_thesis}
              onChange={e => setForm(f => ({ ...f, product_thesis: e.target.value }))}
              placeholder="Мы строим Professional Operating System — профессиональную операционную систему человека. Не просто LMS, не просто job board..." />
          </div>
        </div>
      )}

      {/* Core */}
      {section === "core" && (
        <div className="space-y-4">
          <div>
            <label className={lbl}>Миссия продукта</label>
            <textarea className={`${inp} resize-none`} rows={3} value={form.mission_text}
              onChange={e => setForm(f => ({ ...f, mission_text: e.target.value }))}
              placeholder="Зачем существует этот продукт..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>North Star метрика</label>
              <input className={inp} value={form.north_star_name}
                onChange={e => setForm(f => ({ ...f, north_star_name: e.target.value }))}
                placeholder="Professionals with Verified Growth" />
            </div>
            <div>
              <label className={lbl}>Определение North Star</label>
              <input className={inp} value={form.north_star_definition}
                onChange={e => setForm(f => ({ ...f, north_star_definition: e.target.value }))}
                placeholder="Пользователи с подтверждённой картой компетенций и карьерным результатом за 90 дней" />
            </div>
          </div>
          {listField("Целевые сегменты", form.target_segments, "target_segments")}
        </div>
      )}

      {/* Pillars */}
      {section === "pillars" && (
        <div className="space-y-3">
          <p className="text-[10px] text-gray-500">6 стратегических столпов платформы</p>
          <div className="grid grid-cols-2 gap-3">
            {form.strategic_pillars.map((p, i) => (
              <div key={i} className={`border rounded-xl p-4 space-y-2 ${PILLAR_COLORS[p.id] ?? "border-gray-800 bg-gray-900"}`}>
                <div className="flex items-center gap-2">
                  <Icon name={PILLAR_ICONS[p.id] ?? "Circle"} size={14} className="text-gray-400 flex-shrink-0" />
                  <input className="bg-transparent border-none text-sm font-semibold text-gray-200 focus:outline-none w-full"
                    value={p.title}
                    onChange={e => setForm(f => ({ ...f, strategic_pillars: f.strategic_pillars.map((x, j) => j === i ? { ...x, title: e.target.value } : x) }))} />
                </div>
                <textarea className="w-full bg-transparent text-xs text-gray-500 resize-none focus:outline-none focus:text-gray-300 transition-colors" rows={3}
                  value={p.description}
                  onChange={e => setForm(f => ({ ...f, strategic_pillars: f.strategic_pillars.map((x, j) => j === i ? { ...x, description: e.target.value } : x) }))} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Guardrails */}
      {section === "guardrails" && (
        <div className="space-y-3">
          <p className="text-[10px] text-gray-500">Принципы, которые не нарушаем</p>
          {form.guardrails.map((g, i) => (
            <div key={i} className="flex gap-4 bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center">
                <Icon name={GUARDRAIL_ICONS[g.title] ?? "Shield"} size={14} className="text-violet-400" />
              </div>
              <div className="flex-1 space-y-2">
                <input className={inp} value={g.title}
                  onChange={e => setForm(f => ({ ...f, guardrails: f.guardrails.map((x, j) => j === i ? { ...x, title: e.target.value } : x) }))} />
                <textarea className={`${inp} resize-none text-xs`} rows={2} value={g.description}
                  onChange={e => setForm(f => ({ ...f, guardrails: f.guardrails.map((x, j) => j === i ? { ...x, description: e.target.value } : x) }))} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Roadmap goals */}
      {section === "roadmap" && (
        <div className="space-y-4">
          {listField("Цели квартала", form.quarter_goals, "quarter_goals")}
          {listField("Приоритетные темы", form.priority_themes, "priority_themes")}
          {listField("Не делаем (Non-goals)", form.non_goals, "non_goals")}
        </div>
      )}

      <button onClick={save} disabled={saving}
        className="px-5 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors">
        {saving ? "Сохраняю..." : "Сохранить"}
      </button>
    </div>
  );
}
