import { useState, useEffect, useCallback } from "react";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { api } from "@/lib/strategyApi";

// ── Types ────────────────────────────────────────────────────────────

type BenchmarkProduct = {
  id: number; slug: string; name: string; category: string;
  target_audience: string; best_at: string; main_jtbd: string;
  ux_strengths: string[]; ux_weaknesses: string[];
  ideas_to_borrow: string[]; anti_patterns: string[];
  relevance: string; recommendation: string; notes: string;
  reviewed_at: string | null; updated_at: string;
};

type BenchmarkPattern = {
  id: number; slug: string; title: string; area: string;
  source_products: string[]; pattern_description: string; why_it_works: string;
  recommendation: string; impact: string; effort: string; priority: string;
  notes: string; updated_at: string;
};

type StrategyDecision = {
  id: number; slug: string; title: string; problem_statement: string;
  source_patterns: string[]; decision: string; module: string;
  expected_user_value: string; expected_biz_value: string;
  effort: string; impact: string; priority: string;
  status: string; owner: string; notes: string; updated_at: string;
};

type Summary = {
  products_count: number; patterns_count: number;
  top_decisions: StrategyDecision[];
  products_by_recommendation: { recommendation: string; count: number }[];
};

// ── Visual system ─────────────────────────────────────────────────────

function Spinner() {
  return <div className="w-4 h-4 border-2 border-gray-600 border-t-orange-500 rounded-full animate-spin" />;
}

// Единые badge-цвета по смыслу, не по статусу
const PRIORITY_BADGE: Record<string, string> = {
  p0: "bg-red-500/20 text-red-300 border border-red-500/30",
  p1: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
  p2: "bg-gray-700 text-gray-400 border border-gray-600",
};
const PRIORITY_LABEL: Record<string, string> = { p0: "P0", p1: "P1", p2: "P2" };

const STATUS_BADGE: Record<string, string> = {
  idea:        "bg-gray-700/60 text-gray-400",
  validated:   "bg-blue-500/20 text-blue-300",
  planned:     "bg-violet-500/20 text-violet-300",
  in_progress: "bg-amber-500/20 text-amber-300",
  shipped:     "bg-emerald-500/20 text-emerald-300",
  rejected:    "bg-red-500/10 text-red-400 line-through",
};
const STATUS_LABEL: Record<string, string> = {
  idea:        "Идея",
  validated:   "Подтверждено",
  planned:     "В плане",
  in_progress: "В работе",
  shipped:     "Готово",
  rejected:    "Отклонено",
};

const REC_BADGE: Record<string, string> = {
  borrow: "bg-emerald-500/20 text-emerald-300",
  adapt:  "bg-blue-500/20 text-blue-300",
  avoid:  "bg-red-500/10 text-red-400",
};
const REC_LABEL: Record<string, string> = {
  borrow: "Взять",
  adapt:  "Адаптировать",
  avoid:  "Избегать",
};

const IMPACT_DOT: Record<string, string> = {
  high: "bg-red-400", medium: "bg-amber-400", low: "bg-gray-500",
};

const STATUS_OPTIONS = ["idea","validated","planned","in_progress","shipped","rejected"];

type Tab = "summary" | "products" | "patterns" | "decisions";

// ── Filter pill bar ───────────────────────────────────────────────────

function FilterPills<T extends string>({
  options, active, onSelect, count,
}: {
  options: { value: T; label: string }[];
  active: T;
  onSelect: (v: T) => void;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {options.map(o => (
        <button key={o.value} onClick={() => onSelect(o.value)}
          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
            active === o.value
              ? "bg-orange-600 text-white"
              : "bg-gray-800/80 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
          }`}>
          {o.label}
        </button>
      ))}
      {count !== undefined && (
        <span className="ml-auto text-[10px] text-gray-600">{count} записей</span>
      )}
    </div>
  );
}

// ── Summary tab ───────────────────────────────────────────────────────

function SummaryTab({ summary, onSeed, seeding }: {
  summary: Summary | null; onSeed: () => void; seeding: boolean;
}) {
  if (!summary) return <div className="flex justify-center py-16"><Spinner /></div>;

  const p0Count = summary.top_decisions.filter(d => d.priority === "p0").length;
  const plannedCount = summary.top_decisions.filter(d => ["planned","in_progress"].includes(d.status)).length;

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Продуктов",   v: summary.products_count, icon: "Globe",        color: "text-blue-400" },
          { label: "Паттернов",   v: summary.patterns_count, icon: "Layers",       color: "text-violet-400" },
          { label: "Решений",     v: summary.top_decisions.length, icon: "CheckSquare", color: "text-emerald-400" },
          { label: "P0 решений",  v: p0Count,                icon: "Flame",        color: "text-red-400" },
        ].map(({ label, v, icon, color }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-3.5 flex items-center gap-3">
            <Icon name={icon} size={16} className={color} />
            <div>
              <p className="text-xl font-bold text-white tabular-nums">{v}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* By recommendation */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Распределение продуктов</p>
        <div className="flex gap-2 flex-wrap">
          {summary.products_by_recommendation.map(r => (
            <div key={r.recommendation} className="flex items-center gap-2 bg-gray-800 rounded-lg px-2.5 py-1.5">
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${REC_BADGE[r.recommendation] ?? "bg-gray-700 text-gray-400"}`}>
                {REC_LABEL[r.recommendation] ?? r.recommendation}
              </span>
              <span className="text-sm font-bold text-white tabular-nums">{r.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top decisions */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Приоритетные решения</p>
          {plannedCount > 0 && (
            <span className="text-[10px] text-amber-400">{plannedCount} в работе / плане</span>
          )}
        </div>
        <div className="space-y-1.5">
          {summary.top_decisions.map(d => (
            <div key={d.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-800/60 transition-colors">
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${IMPACT_DOT[d.impact] ?? "bg-gray-600"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-100 font-medium truncate">{d.title}</p>
                <p className="text-[10px] text-gray-600 mt-0.5">{d.module}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${PRIORITY_BADGE[d.priority] ?? "bg-gray-800 text-gray-400 border border-gray-700"}`}>
                  {PRIORITY_LABEL[d.priority] ?? d.priority}
                </span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${STATUS_BADGE[d.status] ?? "bg-gray-800 text-gray-400"}`}>
                  {STATUS_LABEL[d.status] ?? d.status}
                </span>
              </div>
            </div>
          ))}
          {summary.top_decisions.length === 0 && (
            <p className="text-sm text-gray-600 text-center py-6">Нет записей — нажмите «Загрузить данные»</p>
          )}
        </div>
      </div>

      {/* Seed */}
      <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl p-4 flex items-start gap-4">
        <Icon name="Database" size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-amber-300 font-semibold mb-0.5">Загрузить стартовые данные</p>
          <p className="text-xs text-gray-500 mb-3">8 продуктов · 10 паттернов · 8 решений. Безопасно — повторный запуск не дублирует.</p>
          <button onClick={onSeed} disabled={seeding}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors">
            {seeding ? <Spinner /> : <Icon name="Download" size={13} />}
            {seeding ? "Загружаю..." : "Загрузить данные"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Products tab ──────────────────────────────────────────────────────

function ProductsTab({ products, loading }: { products: BenchmarkProduct[]; loading: boolean }) {
  const [filter, setFilter] = useState<"all" | "borrow" | "adapt" | "avoid">("all");
  const shown = filter === "all" ? products : products.filter(p => p.recommendation === filter);

  return (
    <div className="space-y-4">
      <FilterPills
        options={[
          { value: "all" as const, label: "Все" },
          { value: "borrow" as const, label: "Взять" },
          { value: "adapt" as const, label: "Адаптировать" },
          { value: "avoid" as const, label: "Избегать" },
        ]}
        active={filter}
        onSelect={setFilter}
        count={shown.length}
      />

      {loading && <div className="flex justify-center py-10"><Spinner /></div>}
      {!loading && shown.length === 0 && (
        <p className="text-sm text-gray-600 text-center py-10">Нет данных — загрузите seed на вкладке «Сводка»</p>
      )}

      <div className="space-y-2.5">
        {shown.map(p => (
          <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{p.name}</p>
                <p className="text-[10px] text-gray-600 mt-0.5 truncate">{p.category} · {p.target_audience}</p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${REC_BADGE[p.recommendation] ?? "bg-gray-800 text-gray-400"}`}>
                  {REC_LABEL[p.recommendation] ?? p.recommendation}
                </span>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
              <span className="text-gray-600">Главное: </span>{p.best_at}
            </p>
            <div className="grid sm:grid-cols-2 gap-3 border-t border-gray-800 pt-3">
              {p.ideas_to_borrow.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider mb-1.5">Что взять</p>
                  <div className="space-y-1">
                    {p.ideas_to_borrow.map((idea, i) => (
                      <p key={i} className="text-[11px] text-gray-400 flex items-start gap-1.5">
                        <span className="w-1 h-1 bg-emerald-500 rounded-full flex-shrink-0 mt-1.5" />{idea}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              {p.anti_patterns.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold text-red-400 uppercase tracking-wider mb-1.5">Избегать</p>
                  <div className="space-y-1">
                    {p.anti_patterns.map((a, i) => (
                      <p key={i} className="text-[11px] text-gray-400 flex items-start gap-1.5">
                        <span className="w-1 h-1 bg-red-500 rounded-full flex-shrink-0 mt-1.5" />{a}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Patterns tab ──────────────────────────────────────────────────────

function PatternsTab({ patterns, loading }: { patterns: BenchmarkPattern[]; loading: boolean }) {
  const [priority, setPriority] = useState<"all" | "p0" | "p1" | "p2">("all");
  const shown = priority === "all" ? patterns : patterns.filter(p => p.priority === priority);

  return (
    <div className="space-y-4">
      <FilterPills
        options={[
          { value: "all" as const, label: "Все" },
          { value: "p0" as const, label: "P0" },
          { value: "p1" as const, label: "P1" },
          { value: "p2" as const, label: "P2" },
        ]}
        active={priority}
        onSelect={setPriority}
        count={shown.length}
      />

      {loading && <div className="flex justify-center py-10"><Spinner /></div>}
      {!loading && shown.length === 0 && (
        <p className="text-sm text-gray-600 text-center py-10">Нет данных — загрузите seed на вкладке «Сводка»</p>
      )}

      <div className="space-y-2">
        {shown.map(p => (
          <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
            <div className="flex items-start justify-between gap-3 mb-2.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <p className="text-sm font-semibold text-white">{p.title}</p>
                  <span className="text-[10px] text-gray-600">{p.area}</span>
                </div>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${PRIORITY_BADGE[p.priority] ?? "bg-gray-800 text-gray-400 border border-gray-700"}`}>
                  {PRIORITY_LABEL[p.priority] ?? p.priority}
                </span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${REC_BADGE[p.recommendation] ?? "bg-gray-800 text-gray-400"}`}>
                  {REC_LABEL[p.recommendation] ?? p.recommendation}
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed mb-1.5">{p.pattern_description}</p>
            <p className="text-[11px] text-emerald-400/80 italic leading-relaxed">{p.why_it_works}</p>
            {p.source_products.length > 0 && (
              <div className="flex gap-1.5 mt-2.5 flex-wrap">
                {p.source_products.map(s => (
                  <span key={s} className="text-[9px] px-1.5 py-0.5 bg-gray-800 text-gray-500 rounded-md">{s}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Decisions tab ─────────────────────────────────────────────────────

function DecisionsTab({ decisions, loading, onStatusChange }: {
  decisions: StrategyDecision[]; loading: boolean;
  onStatusChange: (id: number, status: string) => void;
}) {
  const [priority, setPriority] = useState<"all" | "p0" | "p1" | "p2">("all");
  const [status, setStatus] = useState<string>("all");
  const [expanded, setExpanded] = useState<number | null>(null);

  let shown = decisions;
  if (priority !== "all") shown = shown.filter(d => d.priority === priority);
  if (status !== "all") shown = shown.filter(d => d.status === status);

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap bg-gray-900/60 border border-gray-800 rounded-xl px-3 py-2">
        <FilterPills
          options={[
            { value: "all" as const, label: "Все" },
            { value: "p0" as const, label: "P0" },
            { value: "p1" as const, label: "P1" },
            { value: "p2" as const, label: "P2" },
          ]}
          active={priority}
          onSelect={setPriority}
        />
        <div className="w-px h-4 bg-gray-700 mx-1" />
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="text-[11px] bg-transparent text-gray-400 border-0 focus:outline-none cursor-pointer">
          <option value="all">Все статусы</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
        </select>
        <span className="ml-auto text-[10px] text-gray-600">{shown.length}</span>
      </div>

      {loading && <div className="flex justify-center py-10"><Spinner /></div>}
      {!loading && shown.length === 0 && (
        <p className="text-sm text-gray-600 text-center py-10">Нет данных — загрузите seed на вкладке «Сводка»</p>
      )}

      <div className="space-y-1.5">
        {shown.map(d => {
          const isOpen = expanded === d.id;
          return (
            <div key={d.id} className={`bg-gray-900 border rounded-xl transition-all ${isOpen ? "border-gray-700" : "border-gray-800 hover:border-gray-700"}`}>
              {/* Row — кликабельная */}
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
                onClick={() => setExpanded(isOpen ? null : d.id)}
              >
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${IMPACT_DOT[d.impact] ?? "bg-gray-600"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-100 leading-snug truncate">{d.title}</p>
                  <p className="text-[10px] text-gray-600 mt-0.5">{d.module}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${PRIORITY_BADGE[d.priority] ?? "bg-gray-800 text-gray-400 border border-gray-700"}`}>
                    {PRIORITY_LABEL[d.priority] ?? d.priority}
                  </span>
                  <select value={d.status}
                    onChange={e => { e.stopPropagation(); onStatusChange(d.id, e.target.value); }}
                    onClick={e => e.stopPropagation()}
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border-0 focus:outline-none cursor-pointer appearance-none ${STATUS_BADGE[d.status] ?? "bg-gray-800 text-gray-400"}`}>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
                  </select>
                  <Icon name={isOpen ? "ChevronUp" : "ChevronDown"} size={12} className="text-gray-600 flex-shrink-0" />
                </div>
              </button>

              {/* Expandable details */}
              {isOpen && (
                <div className="px-4 pb-4 border-t border-gray-800/60 pt-3 space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Проблема</p>
                      <p className="text-[11px] text-gray-400 leading-relaxed">{d.problem_statement}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Решение</p>
                      <p className="text-[11px] text-gray-300 leading-relaxed">{d.decision}</p>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-gray-800/60">
                    <div>
                      <p className="text-[9px] font-bold text-emerald-500/60 uppercase tracking-wider mb-1">Ценность для пользователя</p>
                      <p className="text-[11px] text-emerald-400/80 leading-relaxed">{d.expected_user_value}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-blue-500/60 uppercase tracking-wider mb-1">Бизнес-ценность</p>
                      <p className="text-[11px] text-blue-400/70 leading-relaxed">{d.expected_biz_value}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[9px] px-2 py-1 bg-gray-800 text-gray-500 rounded-lg">effort: {d.effort}</span>
                    <span className={`text-[9px] px-2 py-1 rounded-lg ${d.impact === "high" ? "bg-red-900/40 text-red-400" : "bg-gray-800 text-gray-500"}`}>
                      impact: {d.impact}
                    </span>
                    {d.source_patterns.length > 0 && (
                      <div className="flex gap-1.5 flex-wrap ml-2">
                        {d.source_patterns.map(p => (
                          <span key={p} className="text-[9px] px-1.5 py-0.5 bg-violet-900/30 text-violet-400 rounded">{p}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────

export default function AdminBenchmarkPage() {
  const [tab, setTab] = useState<Tab>("summary");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [products, setProducts] = useState<BenchmarkProduct[]>([]);
  const [patterns, setPatterns] = useState<BenchmarkPattern[]>([]);
  const [decisions, setDecisions] = useState<StrategyDecision[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingPatterns, setLoadingPatterns] = useState(false);
  const [loadingDecisions, setLoadingDecisions] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2500); }

  const loadSummary = useCallback(async () => {
    const d = await api.benchmarkSummary();
    setSummary(d);
  }, []);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    const d = await api.benchmarkProductsList();
    setProducts(d.products ?? []);
    setLoadingProducts(false);
  }, []);

  const loadPatterns = useCallback(async () => {
    setLoadingPatterns(true);
    const d = await api.benchmarkPatternsList();
    setPatterns(d.patterns ?? []);
    setLoadingPatterns(false);
  }, []);

  const loadDecisions = useCallback(async () => {
    setLoadingDecisions(true);
    const d = await api.bmDecisionsList();
    setDecisions(d.decisions ?? []);
    setLoadingDecisions(false);
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { if (tab === "products") loadProducts(); }, [tab, loadProducts]);
  useEffect(() => { if (tab === "patterns") loadPatterns(); }, [tab, loadPatterns]);
  useEffect(() => { if (tab === "decisions") loadDecisions(); }, [tab, loadDecisions]);

  async function handleSeed() {
    setSeeding(true);
    const d = await api.benchmarkSeed();
    setSeeding(false);
    if (d.ok) {
      showToast(`Загружено: ${d.products} продуктов, ${d.patterns} паттернов, ${d.decisions} решений`);
      await loadSummary();
    }
  }

  async function handleStatusChange(id: number, status: string) {
    await api.bmDecisionUpsert({ id, status });
    setDecisions(prev => prev.map(d => d.id === id ? { ...d, status } : d));
    showToast("Статус обновлён");
    await loadSummary();
  }

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: "summary",   label: "Сводка",    icon: "LayoutDashboard" },
    { key: "products",  label: "Продукты",  icon: "Globe" },
    { key: "patterns",  label: "Паттерны",  icon: "Layers" },
    { key: "decisions", label: "Решения",   icon: "CheckSquare" },
  ];

  return (
    <AdminShell>
      <div className="p-6 max-w-4xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-lg font-bold text-white">Benchmark & Стратегические решения</h1>
          <p className="text-xs text-gray-500 mt-0.5">Анализ рынка · Паттерны UX · Product backlog</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-900/80 p-1 rounded-xl w-fit border border-gray-800">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                tab === t.key
                  ? "bg-orange-600 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-300"
              }`}>
              <Icon name={t.icon} size={12} />{t.label}
            </button>
          ))}
        </div>

        {tab === "summary"   && <SummaryTab summary={summary} onSeed={handleSeed} seeding={seeding} />}
        {tab === "products"  && <ProductsTab products={products} loading={loadingProducts} />}
        {tab === "patterns"  && <PatternsTab patterns={patterns} loading={loadingPatterns} />}
        {tab === "decisions" && <DecisionsTab decisions={decisions} loading={loadingDecisions} onStatusChange={handleStatusChange} />}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-2.5 bg-emerald-700 text-white text-xs font-medium rounded-xl shadow-lg z-50 flex items-center gap-2">
          <Icon name="Check" size={13} />
          {toast}
        </div>
      )}
    </AdminShell>
  );
}