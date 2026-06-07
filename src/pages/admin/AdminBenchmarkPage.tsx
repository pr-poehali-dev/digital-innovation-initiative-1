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

// ── Visual helpers ────────────────────────────────────────────────────

function Spinner() {
  return <div className="w-4 h-4 border-2 border-gray-600 border-t-orange-500 rounded-full animate-spin" />;
}

const PRIORITY_COLORS: Record<string, string> = {
  p0: "bg-red-900 text-red-200 border-red-700",
  p1: "bg-amber-900 text-amber-200 border-amber-700",
  p2: "bg-gray-800 text-gray-400 border-gray-700",
};
const STATUS_COLORS: Record<string, string> = {
  validated:   "bg-emerald-900 text-emerald-300",
  planned:     "bg-blue-900 text-blue-300",
  in_progress: "bg-violet-900 text-violet-300",
  shipped:     "bg-emerald-800 text-emerald-200",
  idea:        "bg-gray-800 text-gray-400",
  rejected:    "bg-red-900 text-red-400",
};
const REC_COLORS: Record<string, string> = {
  borrow: "bg-emerald-900 text-emerald-300",
  adapt:  "bg-blue-900 text-blue-300",
  avoid:  "bg-red-900 text-red-400",
};
const IMPACT_DOT: Record<string, string> = {
  high: "bg-red-400", medium: "bg-amber-400", low: "bg-slate-500",
};

function Badge({ label, cls }: { label: string; cls: string }) {
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cls}`}>{label}</span>;
}

// ── Tabs ─────────────────────────────────────────────────────────────

type Tab = "summary" | "products" | "patterns" | "decisions";

// ── Summary tab ───────────────────────────────────────────────────────

function SummaryTab({ summary, onSeed, seeding }: {
  summary: Summary | null; onSeed: () => void; seeding: boolean;
}) {
  if (!summary) return <div className="flex justify-center py-16"><Spinner /></div>;
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Продуктов", v: summary.products_count, icon: "Globe" },
          { label: "Паттернов", v: summary.patterns_count, icon: "Layers" },
          { label: "Решений", v: summary.top_decisions.length, icon: "CheckSquare" },
        ].map(({ label, v, icon }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3">
            <Icon name={icon} size={20} className="text-orange-400" />
            <div>
              <p className="text-2xl font-bold text-white">{v}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* By recommendation */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Распределение по рекомендации</p>
        <div className="flex gap-3 flex-wrap">
          {summary.products_by_recommendation.map(r => (
            <div key={r.recommendation} className="flex items-center gap-2">
              <span className={`text-xs font-semibold px-2 py-1 rounded ${REC_COLORS[r.recommendation] ?? "bg-gray-800 text-gray-400"}`}>
                {r.recommendation}
              </span>
              <span className="text-sm font-bold text-white">{r.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top decisions */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Приоритетные решения (P0 / P1)</p>
        <div className="space-y-2">
          {summary.top_decisions.map(d => (
            <div key={d.id} className="flex items-start gap-3 p-2.5 bg-gray-800 rounded-lg">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${IMPACT_DOT[d.impact] ?? "bg-gray-600"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium">{d.title}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{d.module}</p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <Badge label={d.priority} cls={PRIORITY_COLORS[d.priority] ?? "bg-gray-800 text-gray-400 border-gray-700"} />
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_COLORS[d.status] ?? "bg-gray-800 text-gray-400"}`}>
                  {d.status}
                </span>
              </div>
            </div>
          ))}
          {summary.top_decisions.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">Нет записей — нажмите «Загрузить данные»</p>
          )}
        </div>
      </div>

      {/* Seed button */}
      <div className="bg-gray-900 border border-amber-900/40 rounded-xl p-4">
        <p className="text-sm text-amber-300 font-semibold mb-1">Загрузить стартовые данные (benchmark seed)</p>
        <p className="text-xs text-gray-500 mb-3">Заполняет все три коллекции — 8 продуктов, 10 паттернов, 8 решений. Безопасно: повторный запуск не дублирует данные.</p>
        <button onClick={onSeed} disabled={seeding}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors">
          {seeding ? <Spinner /> : <Icon name="Download" size={14} />}
          {seeding ? "Загружаю..." : "Загрузить данные"}
        </button>
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
      <div className="flex gap-2 flex-wrap">
        {(["all","borrow","adapt","avoid"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${filter === f ? "bg-orange-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
            {f === "all" ? "Все" : f}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-500 self-center">{shown.length} продуктов</span>
      </div>

      {loading && <div className="flex justify-center py-10"><Spinner /></div>}
      {!loading && shown.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-10">Нет данных — загрузите seed на вкладке «Сводка»</p>
      )}

      <div className="space-y-3">
        {shown.map(p => (
          <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="text-sm font-semibold text-white">{p.name}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{p.category} · {p.target_audience}</p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${REC_COLORS[p.recommendation] ?? "bg-gray-800 text-gray-400"}`}>
                  {p.recommendation}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">{p.relevance}</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-2"><span className="text-gray-500">Best at: </span>{p.best_at}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {p.ideas_to_borrow.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-emerald-400 mb-1">Взять</p>
                  {p.ideas_to_borrow.map((idea, i) => (
                    <p key={i} className="text-xs text-gray-400 flex items-center gap-1 mb-0.5">
                      <span className="w-1 h-1 bg-emerald-500 rounded-full flex-shrink-0" />{idea}
                    </p>
                  ))}
                </div>
              )}
              {p.anti_patterns.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-red-400 mb-1">Избегать</p>
                  {p.anti_patterns.map((a, i) => (
                    <p key={i} className="text-xs text-gray-400 flex items-center gap-1 mb-0.5">
                      <span className="w-1 h-1 bg-red-500 rounded-full flex-shrink-0" />{a}
                    </p>
                  ))}
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
      <div className="flex gap-2 flex-wrap">
        {(["all","p0","p1","p2"] as const).map(f => (
          <button key={f} onClick={() => setPriority(f)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${priority === f ? "bg-orange-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
            {f === "all" ? "Все" : f.toUpperCase()}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-500 self-center">{shown.length} паттернов</span>
      </div>

      {loading && <div className="flex justify-center py-10"><Spinner /></div>}
      {!loading && shown.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-10">Нет данных — загрузите seed на вкладке «Сводка»</p>
      )}

      <div className="space-y-2">
        {shown.map(p => (
          <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <p className="text-sm font-semibold text-white">{p.title}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{p.area}</p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <Badge label={p.priority.toUpperCase()} cls={PRIORITY_COLORS[p.priority] ?? "bg-gray-800 text-gray-400 border-gray-700"} />
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${REC_COLORS[p.recommendation] ?? "bg-gray-800 text-gray-400"}`}>
                  {p.recommendation}
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-1">{p.pattern_description}</p>
            <p className="text-[11px] text-emerald-400 italic">{p.why_it_works}</p>
            {p.source_products.length > 0 && (
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {p.source_products.map(s => (
                  <span key={s} className="text-[10px] px-1.5 py-0.5 bg-gray-800 text-gray-500 rounded">{s}</span>
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

const STATUS_OPTIONS = ["idea","validated","planned","in_progress","shipped","rejected"];

function DecisionsTab({ decisions, loading, onStatusChange }: {
  decisions: StrategyDecision[]; loading: boolean;
  onStatusChange: (id: number, status: string) => void;
}) {
  const [priority, setPriority] = useState<"all" | "p0" | "p1" | "p2">("all");
  const [status, setStatus] = useState<string>("all");
  let shown = decisions;
  if (priority !== "all") shown = shown.filter(d => d.priority === priority);
  if (status !== "all") shown = shown.filter(d => d.status === status);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {(["all","p0","p1","p2"] as const).map(f => (
          <button key={f} onClick={() => setPriority(f)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${priority === f ? "bg-orange-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
            {f === "all" ? "Все" : f.toUpperCase()}
          </button>
        ))}
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="ml-2 text-xs bg-gray-800 text-gray-400 border border-gray-700 rounded-lg px-2 py-1 focus:outline-none">
          <option value="all">Все статусы</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="ml-auto text-xs text-gray-500 self-center">{shown.length} решений</span>
      </div>

      {loading && <div className="flex justify-center py-10"><Spinner /></div>}
      {!loading && shown.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-10">Нет данных — загрузите seed на вкладке «Сводка»</p>
      )}

      <div className="space-y-2">
        {shown.map(d => (
          <div key={d.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{d.title}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{d.module}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Badge label={d.priority.toUpperCase()} cls={PRIORITY_COLORS[d.priority] ?? "bg-gray-800 text-gray-400 border-gray-700"} />
                <select value={d.status}
                  onChange={e => onStatusChange(d.id, e.target.value)}
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border-0 focus:outline-none cursor-pointer ${STATUS_COLORS[d.status] ?? "bg-gray-800 text-gray-400"}`}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-1.5">
              <span className="text-gray-600">Проблема: </span>{d.problem_statement}
            </p>
            <p className="text-xs text-gray-400 mb-1.5">
              <span className="text-gray-600">Решение: </span>{d.decision}
            </p>
            <div className="flex gap-3 mt-2">
              <p className="text-[10px] text-emerald-400 flex-1">
                <span className="text-gray-600">Ценность: </span>{d.expected_user_value}
              </p>
              <div className="flex gap-1.5 flex-shrink-0">
                <span className="text-[10px] px-1.5 py-0.5 bg-gray-800 text-gray-500 rounded">effort: {d.effort}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${d.impact === "high" ? "bg-red-900 text-red-300" : "bg-gray-800 text-gray-500"}`}>impact: {d.impact}</span>
              </div>
            </div>
          </div>
        ))}
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
          <h1 className="text-xl font-bold text-white">Benchmark & Стратегические решения</h1>
          <p className="text-sm text-gray-500 mt-1">Анализ рынка · Паттерны UX · Product backlog</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-900 p-1 rounded-xl w-fit">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                tab === t.key ? "bg-orange-600 text-white" : "text-gray-400 hover:text-gray-200"
              }`}>
              <Icon name={t.icon} size={13} />{t.label}
            </button>
          ))}
        </div>

        {tab === "summary"   && <SummaryTab summary={summary} onSeed={handleSeed} seeding={seeding} />}
        {tab === "products"  && <ProductsTab products={products} loading={loadingProducts} />}
        {tab === "patterns"  && <PatternsTab patterns={patterns} loading={loadingPatterns} />}
        {tab === "decisions" && <DecisionsTab decisions={decisions} loading={loadingDecisions} onStatusChange={handleStatusChange} />}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-2.5 bg-emerald-700 text-white text-sm rounded-xl shadow-lg z-50">
          {toast}
        </div>
      )}
    </AdminShell>
  );
}
