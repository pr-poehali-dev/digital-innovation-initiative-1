import { useState, useEffect, useCallback } from "react";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import AiContextExporter from "@/components/admin/AiContextExporter";
import {
  projectApi,
  type ProjectGapType,
  type ProjectGapStatus,
  type ProjectWaveStatus,
  type ProjectItemStatus,
} from "@/lib/admin-api";

// ── Types ─────────────────────────────────────────────────────────────────────
type Section  = { title: string; content: string; updated_at: string; updated_by: string };
type Gap      = { id: number; title: string; description: string; gap_type: ProjectGapType; status: ProjectGapStatus; created_at: string; created_by: string };
type Decision = { id: number; what: string; why: string; changed: string; decided_at: string; created_at: string; created_by: string };
type WaveItem = { id: number; title: string; status: ProjectItemStatus };
type Wave     = { id: number; wave_num: number; title: string; goal: string; status: ProjectWaveStatus; items: WaveItem[] };

// ── Config ────────────────────────────────────────────────────────────────────
const GAP_TYPE: Record<ProjectGapType, { label: string; color: string }> = {
  gap:       { label: "Разрыв",    color: "bg-amber-900/40 text-amber-400 border-amber-800" },
  conflict:  { label: "Конфликт",  color: "bg-red-900/40 text-red-400 border-red-800" },
  duplicate: { label: "Дубль",     color: "bg-violet-900/40 text-violet-400 border-violet-800" },
  unclear:   { label: "Неясность", color: "bg-slate-700 text-slate-300 border-slate-600" },
};
const WAVE_STATUS: Record<ProjectWaveStatus, { label: string; icon: string; color: string }> = {
  planned:     { label: "Запланирована", icon: "Circle",       color: "text-gray-500" },
  in_progress: { label: "В работе",      icon: "PlayCircle",   color: "text-blue-400" },
  done:        { label: "Завершена",      icon: "CheckCircle2", color: "text-emerald-400" },
};
const ITEM_STATUS: Record<ProjectItemStatus, { label: string; color: string }> = {
  todo:        { label: "Не начато", color: "text-gray-600" },
  in_progress: { label: "В работе",  color: "text-blue-400" },
  done:        { label: "Готово",    color: "text-emerald-400" },
};
const WAVE_STATUSES: ProjectWaveStatus[] = ["planned", "in_progress", "done"];
const ITEM_STATUSES: ProjectItemStatus[] = ["todo", "in_progress", "done"];
const GAP_TYPES: ProjectGapType[] = ["gap", "conflict", "duplicate", "unclear"];

// ── LastUpdated ───────────────────────────────────────────────────────────────
function LastUpdated({ at, by, className = "" }: { at?: string; by?: string; className?: string }) {
  if (!at || at.startsWith("0001")) return null;
  const d = new Date(at);
  if (isNaN(d.getTime())) return null;
  const fmt = d.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <p className={`text-[10px] text-gray-700 flex items-center gap-1 ${className}`}>
      <Icon name="Clock" size={9} />{fmt}
      {by ? <><span className="mx-0.5">·</span>{by}</> : null}
    </p>
  );
}

// ── Section block ─────────────────────────────────────────────────────────────
function SectionBlock({ sectionKey, title, icon, iconColor, value, placeholder, updatedAt, updatedBy, onSave }: {
  sectionKey: string; title: string; icon: string; iconColor: string;
  value: string; placeholder: string; updatedAt?: string; updatedBy?: string;
  onSave: (key: string, v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  async function save() {
    setSaving(true);
    await onSave(sectionKey, draft);
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
              placeholder={placeholder} rows={7}
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

function AddBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 border border-gray-800 hover:border-gray-700 px-3 py-1.5 rounded-lg transition-all">
      <Icon name="Plus" size={12} /> {label}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function AdminProjectPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<Record<string, Section>>({});
  const [gaps, setGaps]         = useState<Gap[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [waves, setWaves]       = useState<Wave[]>([]);

  const [gapFilter, setGapFilter] = useState<ProjectGapType | "all">("all");
  const [addingGap, setAddingGap] = useState(false);
  const [newGap, setNewGap] = useState({ title: "", description: "", gap_type: "gap" as ProjectGapType, status: "open" as ProjectGapStatus });
  const [addingDecision, setAddingDecision] = useState(false);
  const [newDecision, setNewDecision] = useState({ what: "", why: "", changed: "" });
  const [addingWave, setAddingWave] = useState(false);
  const [newWave, setNewWave] = useState({ title: "", goal: "", status: "planned" as ProjectWaveStatus });
  const [expandedWave, setExpandedWave] = useState<number | null>(null);
  const [addingItem, setAddingItem] = useState<number | null>(null);
  const [newItemTitle, setNewItemTitle] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await projectApi.all();
    if (res.ok) {
      setSections(res.data.sections || {});
      setGaps(res.data.gaps || []);
      setDecisions(res.data.decisions || []);
      setWaves(res.data.waves || []);
      if (res.data.waves?.length > 0) setExpandedWave(res.data.waves[0].id);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Actions ────────────────────────────────────────────────────────────────
  async function saveSection(key: string, content: string) {
    const res = await projectApi.saveSection(key, content);
    if (res.ok) setSections(prev => ({ ...prev, [key]: { ...prev[key], content } }));
    else toast({ title: "Не удалось сохранить", variant: "destructive" });
  }

  async function submitGap() {
    if (!newGap.title.trim()) return;
    const res = await projectApi.addGap(newGap);
    if (res.ok) {
      setGaps(prev => [...prev, { ...newGap, id: res.data.id, created_at: new Date().toISOString(), created_by: "" }]);
      setNewGap({ title: "", description: "", gap_type: "gap", status: "open" });
      setAddingGap(false);
      toast({ title: "Добавлено" });
    } else toast({ title: "Ошибка", variant: "destructive" });
  }

  async function toggleGapStatus(g: Gap) {
    const next: ProjectGapStatus = g.status === "open" ? "resolved" : "open";
    setGaps(prev => prev.map(x => x.id === g.id ? { ...x, status: next } : x));
    const res = await projectApi.updateGap({ id: g.id, status: next });
    if (!res.ok) {
      setGaps(prev => prev.map(x => x.id === g.id ? { ...x, status: g.status } : x));
      toast({ title: "Не удалось обновить", variant: "destructive" });
    }
  }

  async function submitDecision() {
    if (!newDecision.what.trim()) return;
    const res = await projectApi.addDecision(newDecision);
    if (res.ok) {
      setDecisions(prev => [{ ...newDecision, id: res.data.id, decided_at: new Date().toISOString().slice(0, 10), created_at: res.data.created_at, created_by: res.data.created_by }, ...prev]);
      setNewDecision({ what: "", why: "", changed: "" });
      setAddingDecision(false);
      toast({ title: "Решение зафиксировано" });
    } else toast({ title: "Ошибка", variant: "destructive" });
  }

  async function submitWave() {
    if (!newWave.title.trim()) return;
    const res = await projectApi.addWave(newWave);
    if (res.ok) {
      const w: Wave = { ...newWave, id: res.data.id, wave_num: res.data.wave_num, items: [] };
      setWaves(prev => [...prev, w]);
      setExpandedWave(res.data.id);
      setNewWave({ title: "", goal: "", status: "planned" });
      setAddingWave(false);
      toast({ title: "Волна добавлена" });
    } else toast({ title: "Ошибка", variant: "destructive" });
  }

  async function cycleWaveStatus(w: Wave) {
    const next = WAVE_STATUSES[(WAVE_STATUSES.indexOf(w.status) + 1) % WAVE_STATUSES.length];
    setWaves(prev => prev.map(x => x.id === w.id ? { ...x, status: next } : x));
    const res = await projectApi.updateWave({ id: w.id, status: next });
    if (!res.ok) {
      setWaves(prev => prev.map(x => x.id === w.id ? { ...x, status: w.status } : x));
      toast({ title: "Не удалось обновить", variant: "destructive" });
    }
  }

  async function submitWaveItem(waveId: number) {
    if (!newItemTitle.trim()) return;
    const res = await projectApi.addWaveItem({ wave_id: waveId, title: newItemTitle });
    if (res.ok) {
      setWaves(prev => prev.map(w => w.id === waveId
        ? { ...w, items: [...w.items, { id: res.data.id, title: newItemTitle, status: "todo" }] }
        : w));
      setNewItemTitle("");
      setAddingItem(null);
      toast({ title: "Задача добавлена" });
    } else toast({ title: "Ошибка", variant: "destructive" });
  }

  async function cycleItemStatus(waveId: number, item: WaveItem) {
    const next = ITEM_STATUSES[(ITEM_STATUSES.indexOf(item.status) + 1) % ITEM_STATUSES.length];
    setWaves(prev => prev.map(w => w.id === waveId
      ? { ...w, items: w.items.map(i => i.id === item.id ? { ...i, status: next } : i) }
      : w));
    const res = await projectApi.updateWaveItem({ id: item.id, status: next });
    if (!res.ok) {
      setWaves(prev => prev.map(w => w.id === waveId
        ? { ...w, items: w.items.map(i => i.id === item.id ? { ...i, status: item.status } : i) }
        : w));
      toast({ title: "Не удалось обновить", variant: "destructive" });
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

  const filteredGaps = gapFilter === "all" ? gaps : gaps.filter(g => g.gap_type === gapFilter);
  const openGaps = gaps.filter(g => g.status === "open").length;

  return (
    <AdminShell>
      <div className="p-6 max-w-4xl space-y-8">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="w-9 h-9 rounded-xl bg-blue-900 flex items-center justify-center flex-shrink-0">
              <Icon name="Map" size={18} className="text-blue-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Архитектурная карта</h1>
              <p className="text-gray-500 text-sm mt-0.5">As-is → To-be, разрывы, конфликты, волны изменений</p>
            </div>
          </div>
          <AiContextExporter defaultScope="project" />
        </div>

        {/* ── As-is / To-be ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SectionBlock sectionKey="as_is" title="Как есть сейчас" icon="Layers" iconColor="text-gray-400"
            value={sections.as_is?.content || ""}
            placeholder="Опиши текущую архитектуру: модули, связи, слои, что уже работает..."
            updatedAt={sections.as_is?.updated_at} updatedBy={sections.as_is?.updated_by}
            onSave={saveSection} />
          <SectionBlock sectionKey="to_be" title="Целевое состояние" icon="Compass" iconColor="text-blue-400"
            value={sections.to_be?.content || ""}
            placeholder="Опиши целевую архитектуру: какой должна стать система, какие слои появятся..."
            updatedAt={sections.to_be?.updated_at} updatedBy={sections.to_be?.updated_by}
            onSave={saveSection} />
        </div>

        {/* ── Gaps / Conflicts ─────────────────────────────────────────────── */}
        <div>
          <SectionHeader icon="AlertCircle" iconColor="text-amber-400"
            title={`Разрывы и конфликты${openGaps > 0 ? ` · ${openGaps} открытых` : ""}`}
            action={<AddBtn label="Добавить" onClick={() => setAddingGap(true)} />} />

          <div className="flex gap-1.5 mb-3 flex-wrap">
            {(["all", ...GAP_TYPES] as const).map(t => (
              <button key={t} onClick={() => setGapFilter(t as ProjectGapType | "all")}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  gapFilter === t ? "bg-gray-700 text-white" : "bg-gray-900 text-gray-500 hover:text-gray-300 border border-gray-800"
                }`}>
                {t === "all" ? "Все" : GAP_TYPE[t as ProjectGapType].label}
              </button>
            ))}
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {addingGap && (
              <div className="px-5 py-4 border-b border-gray-800 space-y-2.5 bg-gray-800/30">
                <input value={newGap.title} onChange={e => setNewGap(p => ({ ...p, title: e.target.value }))}
                  placeholder="Название разрыва или конфликта" autoFocus
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-600" />
                <textarea value={newGap.description} onChange={e => setNewGap(p => ({ ...p, description: e.target.value }))}
                  placeholder="Описание" rows={2}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-violet-600" />
                <select value={newGap.gap_type} onChange={e => setNewGap(p => ({ ...p, gap_type: e.target.value as ProjectGapType }))}
                  className="bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none">
                  {GAP_TYPES.map(t => <option key={t} value={t}>{GAP_TYPE[t].label}</option>)}
                </select>
                <div className="flex gap-2">
                  <button onClick={submitGap} className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg">Добавить</button>
                  <button onClick={() => setAddingGap(false)} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-semibold rounded-lg">Отмена</button>
                </div>
              </div>
            )}
            {filteredGaps.length === 0 && !addingGap && (
              <div className="px-5 py-8 text-center text-gray-600 text-sm">Разрывов не зафиксировано</div>
            )}
            <div className="divide-y divide-gray-800">
              {filteredGaps.map(g => (
                <div key={g.id} className="px-5 py-3.5 flex items-start gap-3">
                  <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border mt-0.5 ${GAP_TYPE[g.gap_type].color}`}>
                    {GAP_TYPE[g.gap_type].label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${g.status === "resolved" ? "text-gray-600 line-through" : "text-gray-200"}`}>{g.title}</p>
                    {g.description && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{g.description}</p>}
                    <LastUpdated at={g.created_at} by={g.created_by} className="mt-1" />
                  </div>
                  <button onClick={() => toggleGapStatus(g)}
                    className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full border font-semibold transition-all ${
                      g.status === "resolved" ? "border-gray-700 text-gray-600" : "border-amber-800 text-amber-500"
                    }`}>
                    {g.status === "open" ? "Открыт" : "Закрыт"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Волны изменений ──────────────────────────────────────────────── */}
        <div>
          <SectionHeader icon="Waves" iconColor="text-cyan-400" title="Волны изменений"
            action={<AddBtn label="Новая волна" onClick={() => setAddingWave(true)} />} />

          {addingWave && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl px-5 py-4 mb-3 space-y-2.5">
              <input value={newWave.title} onChange={e => setNewWave(p => ({ ...p, title: e.target.value }))}
                placeholder="Название волны (напр. Wave 3 — Integration Baseline)" autoFocus
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-600" />
              <textarea value={newWave.goal} onChange={e => setNewWave(p => ({ ...p, goal: e.target.value }))}
                placeholder="Цель волны" rows={2}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-violet-600" />
              <div className="flex gap-2">
                <button onClick={submitWave} className="px-4 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-semibold rounded-lg">Создать</button>
                <button onClick={() => setAddingWave(false)} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-semibold rounded-lg">Отмена</button>
              </div>
            </div>
          )}

          {waves.length === 0 && !addingWave && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-8 text-center text-gray-600 text-sm">
              Волн изменений пока нет
            </div>
          )}

          <div className="space-y-3">
            {waves.map(w => {
              const doneCount = w.items.filter(i => i.status === "done").length;
              const progress = w.items.length > 0 ? Math.round((doneCount / w.items.length) * 100) : 0;
              const isExpanded = expandedWave === w.id;
              return (
                <div key={w.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <button onClick={() => setExpandedWave(isExpanded ? null : w.id)}
                    className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-800/30 transition-colors">
                    <div className={`w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0`}>
                      <span className="text-xs font-bold text-gray-400">W{w.wave_num}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-200">{w.title}</p>
                        <button onClick={e => { e.stopPropagation(); cycleWaveStatus(w); }}
                          className="flex-shrink-0">
                          <Icon name={WAVE_STATUS[w.status].icon} size={14} className={WAVE_STATUS[w.status].color} />
                        </button>
                      </div>
                      {w.goal && <p className="text-xs text-gray-500 mt-0.5 truncate">{w.goal}</p>}
                      {w.items.length > 0 && (
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-600 rounded-full transition-all" style={{ width: `${progress}%` }} />
                          </div>
                          <span className="text-[10px] text-gray-600">{doneCount}/{w.items.length}</span>
                        </div>
                      )}
                    </div>
                    <Icon name={isExpanded ? "ChevronUp" : "ChevronDown"} size={14} className="text-gray-600 flex-shrink-0" />
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-800">
                      {w.items.map(item => (
                        <div key={item.id} className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-800/50 last:border-b-0">
                          <button onClick={() => cycleItemStatus(w.id, item)} className="flex-shrink-0">
                            <Icon name={
                              item.status === "done" ? "CheckCircle2" :
                              item.status === "in_progress" ? "PlayCircle" : "Circle"
                            } size={15} className={ITEM_STATUS[item.status].color} />
                          </button>
                          <p className={`text-sm flex-1 ${item.status === "done" ? "text-gray-600 line-through" : "text-gray-300"}`}>
                            {item.title}
                          </p>
                        </div>
                      ))}
                      {addingItem === w.id ? (
                        <div className="flex items-center gap-2 px-5 py-2.5 border-t border-gray-800/50">
                          <input value={newItemTitle} onChange={e => setNewItemTitle(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") submitWaveItem(w.id); if (e.key === "Escape") { setAddingItem(null); setNewItemTitle(""); } }}
                            placeholder="Название задачи" autoFocus
                            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-600" />
                          <button onClick={() => submitWaveItem(w.id)} className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-lg">↵</button>
                          <button onClick={() => { setAddingItem(null); setNewItemTitle(""); }} className="px-3 py-1.5 bg-gray-700 text-gray-400 text-xs rounded-lg">✕</button>
                        </div>
                      ) : (
                        <button onClick={() => setAddingItem(w.id)}
                          className="w-full flex items-center gap-2 px-5 py-2.5 text-xs text-gray-600 hover:text-gray-400 transition-colors border-t border-gray-800/50">
                          <Icon name="Plus" size={12} /> Добавить задачу
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Архитектурные решения ────────────────────────────────────────── */}
        <div>
          <SectionHeader icon="GitBranch" iconColor="text-violet-400" title="Архитектурные решения"
            action={<AddBtn label="Зафиксировать" onClick={() => setAddingDecision(true)} />} />
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {addingDecision && (
              <div className="px-5 py-4 border-b border-gray-800 space-y-2.5 bg-gray-800/30">
                <input value={newDecision.what} onChange={e => setNewDecision(p => ({ ...p, what: e.target.value }))}
                  placeholder="Решение (что)" autoFocus
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-600" />
                <textarea value={newDecision.why} onChange={e => setNewDecision(p => ({ ...p, why: e.target.value }))}
                  placeholder="Почему именно так?" rows={2}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-violet-600" />
                <textarea value={newDecision.changed} onChange={e => setNewDecision(p => ({ ...p, changed: e.target.value }))}
                  placeholder="Что это меняет в архитектуре?" rows={2}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-violet-600" />
                <div className="flex gap-2">
                  <button onClick={submitDecision} className="px-4 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-lg">Зафиксировать</button>
                  <button onClick={() => setAddingDecision(false)} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-semibold rounded-lg">Отмена</button>
                </div>
              </div>
            )}
            {decisions.length === 0 && !addingDecision && (
              <div className="px-5 py-8 text-center text-gray-600 text-sm">Архитектурных решений пока нет</div>
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

        {/* ── Заметки ──────────────────────────────────────────────────────── */}
        <div>
          <SectionHeader icon="PenLine" iconColor="text-gray-400" title="Заметки и размышления" />
          <SectionBlock sectionKey="notes" title="" icon="PenLine" iconColor=""
            value={sections.notes?.content || ""}
            placeholder="Свободные мысли по архитектуре, открытые вопросы, гипотезы..."
            updatedAt={sections.notes?.updated_at} updatedBy={sections.notes?.updated_by}
            onSave={saveSection} />
        </div>

      </div>
    </AdminShell>
  );
}