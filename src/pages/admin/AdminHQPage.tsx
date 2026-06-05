import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { hqApi, type HQGoalStatus, type HQIdeaStatus, type HQRiskImpact, type HQRiskStatus, type HQSummary } from "@/lib/admin-api";
import { useToast } from "@/hooks/use-toast";
import AiContextExporter from "@/components/admin/AiContextExporter";

// ── Types ─────────────────────────────────────────────────────────────────────
type Block = { title: string; content: string; updated_at: string; updated_by: string };
type Goal = { id: number; title: string; horizon: string; status: HQGoalStatus; criterion: string; updated_at: string; updated_by: string };
type Decision = { id: number; what: string; why: string; changed: string; decided_at: string; created_at: string; created_by: string };
type Risk = { id: number; title: string; impact: HQRiskImpact; mitigation: string; status: HQRiskStatus; updated_at: string; updated_by: string };
type Rule = { id: number; category: string; rule_text: string; order_index: number; created_at: string; created_by: string };
type Idea = { id: number; title: string; why: string; priority: string; status: HQIdeaStatus; source: string; created_at: string; updated_at: string; updated_by: string };

// ── Config ────────────────────────────────────────────────────────────────────
const GOAL_STATUS: Record<HQGoalStatus, { label: string; color: string }> = {
  planned:  { label: "Планируется", color: "bg-slate-700 text-slate-300 border-slate-600" },
  on_track: { label: "В плане",     color: "bg-emerald-900/50 text-emerald-400 border-emerald-800" },
  at_risk:  { label: "Под угрозой", color: "bg-amber-900/50 text-amber-400 border-amber-800" },
  done:     { label: "Достигнута",  color: "bg-blue-900/50 text-blue-400 border-blue-800" },
};
const IDEA_STATUS: Record<HQIdeaStatus, { label: string; color: string }> = {
  new:         { label: "Новая",         color: "bg-violet-900/50 text-violet-400 border-violet-800" },
  considering: { label: "Рассматриваем", color: "bg-blue-900/50 text-blue-400 border-blue-800" },
  in_plan:     { label: "В план",        color: "bg-emerald-900/50 text-emerald-400 border-emerald-800" },
  rejected:    { label: "Отклонена",     color: "bg-slate-700 text-slate-400 border-slate-600" },
  done:        { label: "Реализована",   color: "bg-slate-700 text-slate-300 border-slate-600" },
};
const IMPACT: Record<HQRiskImpact, { label: string; color: string }> = {
  high:   { label: "Высокий", color: "text-red-400 bg-red-900/40 border-red-800" },
  medium: { label: "Средний", color: "text-amber-400 bg-amber-900/40 border-amber-800" },
  low:    { label: "Низкий",  color: "text-emerald-400 bg-emerald-900/40 border-emerald-800" },
};
const RULE_CATEGORIES = ["general", "ux", "architecture", "data", "release", "ai"];
const RULE_CAT_LABELS: Record<string, string> = {
  general: "Общие", ux: "UX", architecture: "Архитектура",
  data: "Данные", release: "Релизы", ai: "AI и память",
};
const IDEA_PRIORITIES = ["high", "medium", "low"] as const;
const GOAL_STATUSES: HQGoalStatus[] = ["planned", "on_track", "at_risk", "done"];
const IDEA_STATUSES: HQIdeaStatus[] = ["new", "considering", "in_plan", "rejected", "done"];
const RISK_IMPACTS: HQRiskImpact[] = ["high", "medium", "low"];

// ── Last updated helper ───────────────────────────────────────────────────────
function LastUpdated({ at, by, className = "" }: { at?: string; by?: string; className?: string }) {
  if (!at || at.startsWith("0001")) return null;
  const date = new Date(at);
  if (isNaN(date.getTime())) return null;
  const fmt = date.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <p className={`text-[10px] text-gray-700 flex items-center gap-1 ${className}`}>
      <Icon name="Clock" size={9} />
      {fmt}
      {by ? <><span className="mx-0.5">·</span>{by}</> : null}
    </p>
  );
}

// ── Reusable: editable text block ─────────────────────────────────────────────
function TextBlock({ blockKey, title, icon, iconColor, value, placeholder, updatedAt, updatedBy, onSave }: {
  blockKey: string; title: string; icon: string; iconColor: string;
  value: string; placeholder: string; updatedAt?: string; updatedBy?: string;
  onSave: (key: string, v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  async function save() {
    setSaving(true);
    await onSave(blockKey, draft);
    setSaving(false);
    setEditing(false);
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-800">
        <div className="flex items-center gap-2.5">
          <Icon name={icon} size={14} className={iconColor} />
          <span className="text-sm font-semibold text-white">{title}</span>
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)}
            className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors">
            <Icon name="Pencil" size={11} /> Редактировать
          </button>
        )}
      </div>
      <div className="px-5 py-4">
        {editing ? (
          <>
            <textarea autoFocus value={draft} onChange={e => setDraft(e.target.value)}
              placeholder={placeholder} rows={5}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 resize-y focus:outline-none focus:border-violet-600 transition-colors" />
            <div className="flex gap-2 mt-2">
              <button onClick={save} disabled={saving}
                className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors">
                {saving ? "Сохраняю..." : "Сохранить"}
              </button>
              <button onClick={() => setEditing(false)}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs font-semibold rounded-lg transition-colors">
                Отмена
              </button>
            </div>
          </>
        ) : (
          <>
            <p className={`text-sm leading-relaxed whitespace-pre-wrap ${value ? "text-gray-300" : "text-gray-600 italic"}`}>
              {value || placeholder}
            </p>
            <LastUpdated at={updatedAt} by={updatedBy} className="mt-3" />
          </>
        )}
      </div>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ icon, iconColor, title, action }: {
  icon: string; iconColor: string; title: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <div className="flex items-center gap-2">
        <Icon name={icon} size={16} className={iconColor} />
        <h2 className="text-base font-bold text-white">{title}</h2>
      </div>
      {action}
    </div>
  );
}

// ── Add row button ────────────────────────────────────────────────────────────
function AddBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 border border-gray-800 hover:border-gray-700 px-3 py-1.5 rounded-lg transition-all">
      <Icon name="Plus" size={12} /> {label}
    </button>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function Badge({ label, color }: { label: string; color: string }) {
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${color}`}>{label}</span>;
}

// ── Idea status select ────────────────────────────────────────────────────────
function IdeaStatusSelect({ value, onChange }: {
  value: HQIdeaStatus; onChange: (v: HQIdeaStatus) => void;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value as HQIdeaStatus)}
      className="text-[11px] bg-gray-800 border border-gray-700 text-gray-300 rounded px-1.5 py-0.5 focus:outline-none flex-shrink-0">
      {IDEA_STATUSES.map(s => <option key={s} value={s}>{IDEA_STATUS[s].label}</option>)}
    </select>
  );
}

// ── Platform Summary Bar ──────────────────────────────────────────────────────
function PlatformSummaryBar() {
  const navigate = useNavigate();
  const [s, setS] = useState<HQSummary | null>(null);

  useEffect(() => {
    hqApi.summary().then(r => { if (r.ok) setS(r.data.summary); }).catch(() => {});
  }, []);

  if (!s) return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-16 bg-gray-900 border border-gray-800 rounded-xl animate-pulse" />
      ))}
    </div>
  );

  const cards: { label: string; value: string; sub?: string; icon: string; color: string; href?: string }[] = [
    {
      label: "Модули",
      value: `${s.modules_active} из ${s.modules_total}`,
      sub: "активных в Passport",
      icon: "Layers",
      color: "text-emerald-400",
      href: "/admin/passport",
    },
    {
      label: "Волна",
      value: s.current_wave != null ? `W${s.current_wave}` : "—",
      sub: `${s.waves_done} из ${s.waves_total} завершены`,
      icon: "Waves",
      color: "text-violet-400",
      href: "/admin/project",
    },
    {
      label: "Тикеты",
      value: String(s.tickets_active),
      sub: s.tickets_urgent > 0 ? `${s.tickets_urgent} urgent` : "нет urgent",
      icon: "Ticket",
      color: s.tickets_urgent > 0 ? "text-red-400" : "text-sky-400",
      href: "/admin/tickets",
    },
    {
      label: "Таблиц в БД",
      value: String(s.db_tables_total),
      sub: "в схеме проекта",
      icon: "Database",
      color: "text-blue-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map(c => (
        <button
          key={c.label}
          onClick={() => c.href && navigate(c.href)}
          className={`bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-left transition-all ${c.href ? "hover:border-gray-700 cursor-pointer" : "cursor-default"}`}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <Icon name={c.icon} size={12} className={c.color} />
            <span className="text-[10px] text-gray-600 uppercase tracking-wide">{c.label}</span>
          </div>
          <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
          {c.sub && <p className="text-[10px] text-gray-700 mt-0.5">{c.sub}</p>}
        </button>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function AdminHQPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [blocks, setBlocks] = useState<Record<string, Block>>({});
  const [goals, setGoals] = useState<Goal[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  // Forms
  const [addingGoal, setAddingGoal] = useState(false);
  const [newGoal, setNewGoal] = useState({ title: "", horizon: "", status: "planned" as HQGoalStatus, criterion: "" });
  const [addingDecision, setAddingDecision] = useState(false);
  const [newDecision, setNewDecision] = useState({ what: "", why: "", changed: "" });
  const [addingRisk, setAddingRisk] = useState(false);
  const [newRisk, setNewRisk] = useState({ title: "", impact: "medium" as HQRiskImpact, mitigation: "", status: "open" as HQRiskStatus });
  const [addingRule, setAddingRule] = useState(false);
  const [newRule, setNewRule] = useState({ category: "general", rule_text: "" });
  const [addingIdea, setAddingIdea] = useState(false);
  const [newIdea, setNewIdea] = useState({ title: "", why: "", priority: "medium", source: "" });
  const [ideaFilter, setIdeaFilter] = useState<HQIdeaStatus | "all">("all");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await hqApi.all();
    if (res.ok) {
      setBlocks(res.data.blocks || {});
      setGoals(res.data.goals || []);
      setDecisions(res.data.decisions || []);
      setRisks(res.data.risks || []);
      setRules(res.data.rules || []);
      setIdeas(res.data.ideas || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Actions ────────────────────────────────────────────────────────────────
  async function saveBlock(key: string, content: string) {
    const res = await hqApi.saveBlock(key, content);
    if (res.ok) {
      setBlocks(prev => ({ ...prev, [key]: { ...prev[key], content } }));
    } else {
      toast({ title: "Не удалось сохранить", variant: "destructive" });
      throw new Error("save failed");
    }
  }

  async function submitGoal() {
    if (!newGoal.title.trim()) return;
    const res = await hqApi.addGoal(newGoal);
    if (res.ok) {
      setGoals(prev => [...prev, { ...newGoal, id: res.data.id }]);
      setNewGoal({ title: "", horizon: "", status: "planned", criterion: "" });
      setAddingGoal(false);
      toast({ title: "Цель добавлена" });
    } else {
      toast({ title: "Не удалось добавить цель", variant: "destructive" });
    }
  }

  async function cycleGoalStatus(g: Goal) {
    const next = GOAL_STATUSES[(GOAL_STATUSES.indexOf(g.status) + 1) % GOAL_STATUSES.length];
    setGoals(prev => prev.map(x => x.id === g.id ? { ...x, status: next } : x));
    const res = await hqApi.updateGoal({ id: g.id, status: next });
    if (!res.ok) {
      setGoals(prev => prev.map(x => x.id === g.id ? { ...x, status: g.status } : x));
      toast({ title: "Не удалось обновить статус", variant: "destructive" });
    }
  }

  async function submitDecision() {
    if (!newDecision.what.trim()) return;
    const res = await hqApi.addDecision(newDecision);
    if (res.ok) {
      setDecisions(prev => [{
        ...newDecision, id: res.data.id,
        decided_at: new Date().toISOString().slice(0, 10),
        created_at: res.data.created_at,
      }, ...prev]);
      setNewDecision({ what: "", why: "", changed: "" });
      setAddingDecision(false);
      toast({ title: "Решение зафиксировано" });
    } else {
      toast({ title: "Не удалось сохранить решение", variant: "destructive" });
    }
  }

  async function submitRisk() {
    if (!newRisk.title.trim()) return;
    const res = await hqApi.addRisk(newRisk);
    if (res.ok) {
      setRisks(prev => [...prev, { ...newRisk, id: res.data.id }]);
      setNewRisk({ title: "", impact: "medium", mitigation: "", status: "open" });
      setAddingRisk(false);
      toast({ title: "Риск добавлен" });
    } else {
      toast({ title: "Не удалось добавить риск", variant: "destructive" });
    }
  }

  async function cycleRiskStatus(r: Risk) {
    const statuses: HQRiskStatus[] = ["open", "mitigated", "closed"];
    const next = statuses[(statuses.indexOf(r.status) + 1) % statuses.length];
    setRisks(prev => prev.map(x => x.id === r.id ? { ...x, status: next } : x));
    const res = await hqApi.updateRisk({ id: r.id, status: next });
    if (!res.ok) {
      setRisks(prev => prev.map(x => x.id === r.id ? { ...x, status: r.status } : x));
      toast({ title: "Не удалось обновить статус", variant: "destructive" });
    }
  }

  async function submitRule() {
    if (!newRule.rule_text.trim()) return;
    const res = await hqApi.addRule(newRule);
    if (res.ok) {
      setRules(prev => [...prev, { ...newRule, id: res.data.id, order_index: 0 }]);
      setNewRule({ category: "general", rule_text: "" });
      setAddingRule(false);
      toast({ title: "Правило добавлено" });
    } else {
      toast({ title: "Не удалось добавить правило", variant: "destructive" });
    }
  }

  async function submitIdea() {
    if (!newIdea.title.trim()) return;
    const res = await hqApi.addIdea(newIdea);
    if (res.ok) {
      setIdeas(prev => [{ ...newIdea, id: res.data.id, status: "new" as HQIdeaStatus, created_at: new Date().toISOString() }, ...prev]);
      setNewIdea({ title: "", why: "", priority: "medium", source: "" });
      setAddingIdea(false);
      toast({ title: "Идея добавлена" });
    } else {
      toast({ title: "Не удалось добавить идею", variant: "destructive" });
    }
  }

  async function updateIdeaStatus(idea: Idea, status: HQIdeaStatus) {
    setIdeas(prev => prev.map(x => x.id === idea.id ? { ...x, status } : x));
    const res = await hqApi.updateIdea({ id: idea.id, status });
    if (!res.ok) {
      setIdeas(prev => prev.map(x => x.id === idea.id ? { ...x, status: idea.status } : x));
      toast({ title: "Не удалось обновить статус", variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <AdminShell>
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminShell>
    );
  }

  const rulesByCategory = RULE_CATEGORIES.filter(cat => rules.some(r => r.category === cat));
  const filteredIdeas = ideaFilter === "all" ? ideas : ideas.filter(i => i.status === ideaFilter);

  return (
    <AdminShell>
      <div className="p-6 max-w-4xl space-y-8">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-violet-900 flex items-center justify-center">
                <Icon name="Command" size={18} className="text-violet-300" />
              </div>
              <h1 className="text-2xl font-bold text-white">Командный штаб</h1>
            </div>
            <p className="text-gray-500 text-sm ml-12">Живая память проекта — видение, правила, решения, риски, идеи</p>
          </div>
          <AiContextExporter defaultScope="hq" />
        </div>

        {/* ── Platform counters ───────────────────────────────────────────── */}
        <PlatformSummaryBar />

        {/* ── Текущий фокус ───────────────────────────────────────────────── */}
        <div className="bg-gradient-to-r from-violet-900/30 to-blue-900/20 border border-violet-800/40 rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-violet-800/30 flex items-center gap-2.5">
            <Icon name="Zap" size={15} className="text-yellow-400" />
            <span className="text-sm font-bold text-white">Текущий фокус</span>
            <span className="ml-auto text-xs text-gray-500">Что важно прямо сейчас</span>
          </div>
          <div className="px-5 py-4">
            <TextBlock
              blockKey="focus" title="" icon="Zap" iconColor=""
              value={blocks.focus?.content || ""}
              placeholder="3–5 конкретных шагов на эту неделю. Главный блокер. Решение, которое надо принять."
              updatedAt={blocks.focus?.updated_at}
              updatedBy={blocks.focus?.updated_by}
              onSave={saveBlock}
            />
          </div>
        </div>

        {/* ── Видение + Миссия ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextBlock blockKey="vision" title="Видение" icon="Eye" iconColor="text-violet-400"
            value={blocks.vision?.content || ""}
            placeholder="Зачем существует проект? Что получится через 12 месяцев?"
            updatedAt={blocks.vision?.updated_at} updatedBy={blocks.vision?.updated_by}
            onSave={saveBlock} />
          <TextBlock blockKey="mission" title="Миссия" icon="Target" iconColor="text-blue-400"
            value={blocks.mission?.content || ""}
            placeholder="Что мы делаем каждый день и для кого?"
            updatedAt={blocks.mission?.updated_at} updatedBy={blocks.mission?.updated_by}
            onSave={saveBlock} />
        </div>

        {/* ── Стратегические цели ─────────────────────────────────────────── */}
        <div>
          <SectionHeader icon="Flag" iconColor="text-amber-400" title="Стратегические цели"
            action={<AddBtn label="Добавить цель" onClick={() => setAddingGoal(true)} />} />
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {addingGoal && (
              <div className="px-5 py-4 border-b border-gray-800 space-y-2.5 bg-gray-800/30">
                <input value={newGoal.title} onChange={e => setNewGoal(p => ({ ...p, title: e.target.value }))}
                  placeholder="Название цели" autoFocus
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-600" />
                <div className="flex gap-2">
                  <input value={newGoal.horizon} onChange={e => setNewGoal(p => ({ ...p, horizon: e.target.value }))}
                    placeholder="Горизонт (напр. Август 2026)"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-600" />
                  <select value={newGoal.status} onChange={e => setNewGoal(p => ({ ...p, status: e.target.value as HQGoalStatus }))}
                    className="bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-2 text-sm focus:outline-none">
                    {GOAL_STATUSES.map(s => <option key={s} value={s}>{GOAL_STATUS[s].label}</option>)}
                  </select>
                </div>
                <input value={newGoal.criterion} onChange={e => setNewGoal(p => ({ ...p, criterion: e.target.value }))}
                  placeholder="Критерий успеха"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-600" />
                <div className="flex gap-2">
                  <button onClick={submitGoal} className="px-4 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-lg transition-colors">Добавить</button>
                  <button onClick={() => setAddingGoal(false)} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-semibold rounded-lg transition-colors">Отмена</button>
                </div>
              </div>
            )}
            {goals.length === 0 && !addingGoal && (
              <div className="px-5 py-8 text-center text-gray-600 text-sm">Целей пока нет</div>
            )}
            <div className="divide-y divide-gray-800">
              {goals.map(g => (
                <div key={g.id} className="flex items-start gap-3 px-5 py-3.5">
                  <Icon name="ChevronRight" size={13} className="text-gray-700 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200">{g.title}</p>
                    {g.criterion && <p className="text-xs text-gray-500 mt-0.5">✓ {g.criterion}</p>}
                    {g.horizon && <p className="text-xs text-gray-600 mt-0.5">{g.horizon}</p>}
                    <LastUpdated at={g.updated_at} by={g.updated_by} className="mt-1" />
                  </div>
                  <button onClick={() => cycleGoalStatus(g)}
                    className={`flex-shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all ${GOAL_STATUS[g.status].color}`}>
                    {GOAL_STATUS[g.status].label}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Журнал решений ──────────────────────────────────────────────── */}
        <div>
          <SectionHeader icon="BookOpen" iconColor="text-emerald-400" title="Журнал решений"
            action={<AddBtn label="Зафиксировать" onClick={() => setAddingDecision(true)} />} />
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {addingDecision && (
              <div className="px-5 py-4 border-b border-gray-800 space-y-2.5 bg-gray-800/30">
                <input value={newDecision.what} onChange={e => setNewDecision(p => ({ ...p, what: e.target.value }))}
                  placeholder="Решение (что)" autoFocus
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-600" />
                <textarea value={newDecision.why} onChange={e => setNewDecision(p => ({ ...p, why: e.target.value }))}
                  placeholder="Почему приняли это решение?" rows={2}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-violet-600" />
                <textarea value={newDecision.changed} onChange={e => setNewDecision(p => ({ ...p, changed: e.target.value }))}
                  placeholder="Что меняет это решение?" rows={2}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-violet-600" />
                <div className="flex gap-2">
                  <button onClick={submitDecision} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg">Зафиксировать</button>
                  <button onClick={() => setAddingDecision(false)} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-semibold rounded-lg">Отмена</button>
                </div>
              </div>
            )}
            {decisions.length === 0 && !addingDecision && (
              <div className="px-5 py-8 text-center text-gray-600 text-sm">Решений пока не зафиксировано</div>
            )}
            <div className="divide-y divide-gray-800">
              {decisions.map(d => (
                <div key={d.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <p className="text-sm font-semibold text-gray-200">{d.what}</p>
                    <span className="flex-shrink-0 text-[11px] text-gray-600 font-mono">{d.decided_at}</span>
                  </div>
                  {d.why && <p className="text-xs text-gray-500 leading-relaxed">{d.why}</p>}
                  {d.changed && <p className="text-xs text-gray-600 mt-1 italic">{d.changed}</p>}
                  <LastUpdated at={d.created_at} by={d.created_by} className="mt-1.5" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Риски ───────────────────────────────────────────────────────── */}
        <div>
          <SectionHeader icon="AlertTriangle" iconColor="text-red-400" title="Риски и ограничения"
            action={<AddBtn label="Добавить риск" onClick={() => setAddingRisk(true)} />} />
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {addingRisk && (
              <div className="px-5 py-4 border-b border-gray-800 space-y-2.5 bg-gray-800/30">
                <input value={newRisk.title} onChange={e => setNewRisk(p => ({ ...p, title: e.target.value }))}
                  placeholder="Описание риска" autoFocus
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-600" />
                <div className="flex gap-2">
                  <select value={newRisk.impact} onChange={e => setNewRisk(p => ({ ...p, impact: e.target.value as HQRiskImpact }))}
                    className="bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-2 text-sm focus:outline-none">
                    {RISK_IMPACTS.map(i => <option key={i} value={i}>{IMPACT[i].label}</option>)}
                  </select>
                </div>
                <textarea value={newRisk.mitigation} onChange={e => setNewRisk(p => ({ ...p, mitigation: e.target.value }))}
                  placeholder="Как митигировать?" rows={2}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-violet-600" />
                <div className="flex gap-2">
                  <button onClick={submitRisk} className="px-4 py-1.5 bg-red-700 hover:bg-red-600 text-white text-xs font-semibold rounded-lg">Добавить</button>
                  <button onClick={() => setAddingRisk(false)} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-semibold rounded-lg">Отмена</button>
                </div>
              </div>
            )}
            {risks.length === 0 && !addingRisk && (
              <div className="px-5 py-8 text-center text-gray-600 text-sm">Рисков пока не зафиксировано</div>
            )}
            <div className="divide-y divide-gray-800">
              {risks.map(r => (
                <div key={r.id} className="px-5 py-3.5 flex items-start gap-3">
                  <Badge label={IMPACT[r.impact].label} color={IMPACT[r.impact].color} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200">{r.title}</p>
                    {r.mitigation && <p className="text-xs text-gray-500 mt-0.5">→ {r.mitigation}</p>}
                    <LastUpdated at={r.updated_at} by={r.updated_by} className="mt-1" />
                  </div>
                  <button onClick={() => cycleRiskStatus(r)}
                    className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full border font-semibold transition-all ${
                      r.status === "closed" ? "border-gray-700 text-gray-600"
                      : r.status === "mitigated" ? "border-emerald-800 text-emerald-500"
                      : "border-amber-800 text-amber-500"
                    }`}>
                    {r.status === "open" ? "Открыт" : r.status === "mitigated" ? "Снижен" : "Закрыт"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Правила проекта ─────────────────────────────────────────────── */}
        <div>
          <SectionHeader icon="Shield" iconColor="text-blue-400" title="Правила проекта"
            action={<AddBtn label="Добавить правило" onClick={() => setAddingRule(true)} />} />
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {addingRule && (
              <div className="px-5 py-4 border-b border-gray-800 space-y-2.5 bg-gray-800/30">
                <div className="flex gap-2">
                  <select value={newRule.category} onChange={e => setNewRule(p => ({ ...p, category: e.target.value }))}
                    className="bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-2 text-sm focus:outline-none">
                    {RULE_CATEGORIES.map(c => <option key={c} value={c}>{RULE_CAT_LABELS[c]}</option>)}
                  </select>
                </div>
                <textarea value={newRule.rule_text} onChange={e => setNewRule(p => ({ ...p, rule_text: e.target.value }))}
                  placeholder="Текст правила" autoFocus rows={2}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-violet-600" />
                <div className="flex gap-2">
                  <button onClick={submitRule} className="px-4 py-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg">Добавить</button>
                  <button onClick={() => setAddingRule(false)} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-semibold rounded-lg">Отмена</button>
                </div>
              </div>
            )}
            {rules.length === 0 && !addingRule && (
              <div className="px-5 py-8 text-center text-gray-600 text-sm">Правил пока нет</div>
            )}
            {rulesByCategory.map(cat => (
              <div key={cat} className="border-b border-gray-800 last:border-b-0">
                <div className="px-5 py-2 bg-gray-800/40">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{RULE_CAT_LABELS[cat]}</span>
                </div>
                {rules.filter(r => r.category === cat).map(r => (
                  <div key={r.id} className="flex items-start gap-2.5 px-5 py-3 border-t border-gray-800/50">
                    <Icon name="Minus" size={12} className="text-blue-500 mt-1 flex-shrink-0" />
                    <p className="text-sm text-gray-300 leading-relaxed">{r.rule_text}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ── Идеи / Parking lot ──────────────────────────────────────────── */}
        <div>
          <SectionHeader icon="Lightbulb" iconColor="text-yellow-400" title="Идеи / Parking lot"
            action={<AddBtn label="Добавить идею" onClick={() => setAddingIdea(true)} />} />

          {/* Filter tabs */}
          <div className="flex gap-1.5 mb-3 flex-wrap">
            {(["all", ...IDEA_STATUSES] as const).map(s => (
              <button key={s} onClick={() => setIdeaFilter(s as HQIdeaStatus | "all")}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  ideaFilter === s ? "bg-gray-700 text-white" : "bg-gray-900 text-gray-500 hover:text-gray-300 border border-gray-800"
                }`}>
                {s === "all" ? "Все" : IDEA_STATUS[s as HQIdeaStatus].label}
              </button>
            ))}
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {addingIdea && (
              <div className="px-5 py-4 border-b border-gray-800 space-y-2.5 bg-gray-800/30">
                <input value={newIdea.title} onChange={e => setNewIdea(p => ({ ...p, title: e.target.value }))}
                  placeholder="Идея" autoFocus
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-600" />
                <textarea value={newIdea.why} onChange={e => setNewIdea(p => ({ ...p, why: e.target.value }))}
                  placeholder="Зачем / какую проблему решает?" rows={2}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-violet-600" />
                <div className="flex gap-2">
                  <select value={newIdea.priority} onChange={e => setNewIdea(p => ({ ...p, priority: e.target.value }))}
                    className="bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-2 text-sm focus:outline-none">
                    {IDEA_PRIORITIES.map(p => <option key={p} value={p}>{p === "high" ? "Высокий" : p === "medium" ? "Средний" : "Низкий"}</option>)}
                  </select>
                  <input value={newIdea.source} onChange={e => setNewIdea(p => ({ ...p, source: e.target.value }))}
                    placeholder="Источник (откуда идея)"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-600" />
                </div>
                <div className="flex gap-2">
                  <button onClick={submitIdea} className="px-4 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-semibold rounded-lg">Добавить</button>
                  <button onClick={() => setAddingIdea(false)} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-semibold rounded-lg">Отмена</button>
                </div>
              </div>
            )}
            {filteredIdeas.length === 0 && !addingIdea && (
              <div className="px-5 py-8 text-center text-gray-600 text-sm">Идей пока нет</div>
            )}
            <div className="divide-y divide-gray-800">
              {filteredIdeas.map(idea => (
                <div key={idea.id} className="px-5 py-3.5 flex items-start gap-3">
                  <Icon name="Lightbulb" size={14} className="text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200">{idea.title}</p>
                    {idea.why && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{idea.why}</p>}
                    {idea.source && <p className="text-xs text-gray-700 mt-0.5">→ {idea.source}</p>}
                    <LastUpdated at={idea.updated_at} by={idea.updated_by} className="mt-1" />
                  </div>
                  <IdeaStatusSelect
                    value={idea.status}
                    onChange={status => updateIdeaStatus(idea, status)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Место для размышлений ────────────────────────────────────────── */}
        <div>
          <SectionHeader icon="PenLine" iconColor="text-gray-400" title="Место для размышлений" />
          <TextBlock blockKey="scratch" title="" icon="PenLine" iconColor=""
            value={blocks.scratch?.content || ""}
            placeholder="Свободные заметки, гипотезы, вопросы без ответа, идеи на будущее..."
            updatedAt={blocks.scratch?.updated_at} updatedBy={blocks.scratch?.updated_by}
            onSave={saveBlock} />
        </div>

        {/* ── Контекст для AI ──────────────────────────────────────────────── */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Icon name="Bot" size={14} className="text-violet-400" />
              <span className="text-sm font-semibold text-white">Контекст для AI</span>
            </div>
            <button onClick={copyContext}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                copied ? "bg-emerald-700 text-white" : "bg-violet-700 hover:bg-violet-600 text-white"
              }`}>
              <Icon name={copied ? "Check" : "Clipboard"} size={12} />
              {copied ? "Скопировано!" : "Скопировать"}
            </button>
          </div>
          <div className="px-5 py-4">
            <p className="text-xs text-gray-500 leading-relaxed mb-3">
              Нажми «Скопировать» и вставь в любой AI-чат — контекст включает видение, миссию, цели, решения, риски и правила.
            </p>
            <pre className="text-xs text-gray-600 bg-gray-800 rounded-lg p-3 overflow-auto max-h-40 leading-relaxed whitespace-pre-wrap">
              {buildAIContext()}
            </pre>
          </div>
        </div>

      </div>
    </AdminShell>
  );
}