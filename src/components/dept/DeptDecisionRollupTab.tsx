import { useEffect, useMemo, useState } from "react";
import { deptFunctionsApi } from "@/lib/api";
import Icon from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";

type FnRow = {
  function_id: number; function_name: string; org_unit_id: number | null; org_unit_name: string | null;
  selection_state: string; decision_health: string; has_preferred: boolean; pilot_ready: boolean;
  has_required_gaps: boolean; required_gaps_count: number; has_drift: boolean; has_archived_supply: boolean;
  preferred_title: string | null; required_total: number; required_covered: number; required_uncovered: number;
  supporting_total: number; supporting_covered: number; modules_count: number; products_count: number;
  vendors_count: number; preferred_products_preview: string[]; residual_required_gaps_preview: string[];
};
type GapAgg = {
  capability_id: number; capability_name: string; category: string; functions_count: number;
  preferred_gap_functions_count: number; no_preferred_functions_count: number; no_shortlist_functions_count: number;
};
type ProdAgg = { product_id: number; product_name: string; functions_count: number; pilot_ready_functions_count: number; attention_functions_count: number };
type ModAgg = { module_id: number; module_name: string; functions_count: number; pilot_ready_functions_count: number; attention_functions_count: number };
type Rollup = {
  scope: { scope_type: string; scope_name: string | null; functions_total: number; unassigned_functions_count?: number };
  summary: { functions_total: number; preferred_count: number; pilot_ready_count: number; attention_required_count: number; no_preferred_count: number; no_shortlist_count: number };
  functions: FnRow[];
  top_required_gaps: GapAgg[];
  top_preferred_products: ProdAgg[];
  top_preferred_modules: ModAgg[];
};

interface Props { projectId: number; }

const STATE_LABEL: Record<string, string> = { no_shortlist: "Нет шортлиста", no_preferred: "Нет preferred", preferred_selected: "Preferred выбран" };
const STATE_COLOR: Record<string, string> = {
  no_shortlist: "bg-slate-100 text-slate-500", no_preferred: "bg-amber-100 text-amber-700", preferred_selected: "bg-emerald-100 text-emerald-700",
};

function Kpi({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

export default function DeptDecisionRollupTab({ projectId }: Props) {
  const [data, setData] = useState<Rollup | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [healthFilter, setHealthFilter] = useState("all");
  const [capFilter, setCapFilter] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    deptFunctionsApi.getDecisionRollup(projectId)
      .then((d: Rollup & { ok: boolean }) => setData(d))
      .catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId]);

  const capName = useMemo(() => data?.top_required_gaps.find((g) => g.capability_id === capFilter)?.capability_name, [data, capFilter]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.functions.filter((f) => {
      if (q && !f.function_name.toLowerCase().includes(q.toLowerCase())) return false;
      if (healthFilter === "no_shortlist" && f.selection_state !== "no_shortlist") return false;
      if (healthFilter === "no_preferred" && f.selection_state !== "no_preferred") return false;
      if (healthFilter === "required_gaps" && !(f.selection_state === "preferred_selected" && f.has_required_gaps)) return false;
      if (healthFilter === "drift" && !f.has_drift) return false;
      if (healthFilter === "pilot_ready" && !f.pilot_ready) return false;
      if (capFilter && !f.residual_required_gaps_preview.includes(capName || "___")) return false;
      return true;
    });
  }, [data, q, healthFilter, capFilter, capName]);

  if (loading) return <div className="text-sm text-slate-400 py-10 text-center">Загрузка сводки решений…</div>;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Icon name="Gavel" size={18} /> Сводка решений по функциям
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Агрегат по preferred-решениям. {data.scope.scope_type === "project" && data.scope.unassigned_functions_count !== undefined && (
            <span>Без привязки к оргединице: {data.scope.unassigned_functions_count}.</span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <Kpi label="Функций" value={data.summary.functions_total} tone="text-slate-800" />
        <Kpi label="Preferred" value={data.summary.preferred_count} tone="text-emerald-600" />
        <Kpi label="Готовы к пилоту" value={data.summary.pilot_ready_count} tone="text-emerald-700" />
        <Kpi label="Требуют внимания" value={data.summary.attention_required_count} tone="text-rose-600" />
        <Kpi label="Без preferred" value={data.summary.no_preferred_count + data.summary.no_shortlist_count} tone="text-amber-600" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Таблица функций */}
        <div className="lg:col-span-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <Icon name="Search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск функции…" className="h-9 pl-8 text-sm" />
            </div>
            <Select value={healthFilter} onValueChange={setHealthFilter}>
              <SelectTrigger className="h-9 w-[170px] text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все функции</SelectItem>
                <SelectItem value="no_shortlist">Без шортлиста</SelectItem>
                <SelectItem value="no_preferred">Без preferred</SelectItem>
                <SelectItem value="required_gaps">С required gaps</SelectItem>
                <SelectItem value="drift">С дрейфом</SelectItem>
                <SelectItem value="pilot_ready">Готовы к пилоту</SelectItem>
              </SelectContent>
            </Select>
            {capFilter && (
              <button onClick={() => setCapFilter(null)} className="text-xs text-slate-500 underline underline-offset-2">
                Сброс: {capName}
              </button>
            )}
          </div>

          <div className="text-xs text-slate-400">Показано: {filtered.length}</div>

          <div className="space-y-1.5">
            {filtered.map((f) => (
              <div key={f.function_id} className="rounded-lg border border-slate-200 bg-white p-2.5">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800">{f.function_name}</div>
                    {f.org_unit_name && <div className="text-[11px] text-slate-400">{f.org_unit_name}</div>}
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end">
                    <Badge className={`text-[10px] border-0 ${STATE_COLOR[f.selection_state] || ""}`}>{STATE_LABEL[f.selection_state]}</Badge>
                    {f.pilot_ready && <Badge className="text-[10px] border-0 bg-emerald-100 text-emerald-700">пилот-ready</Badge>}
                    {f.has_required_gaps && <Badge className="text-[10px] border-0 bg-rose-100 text-rose-700">gaps: {f.required_gaps_count}</Badge>}
                    {f.has_drift && <Badge className="text-[10px] border-0 bg-amber-100 text-amber-700">дрейф</Badge>}
                    {f.has_archived_supply && <Badge className="text-[10px] border-0 bg-orange-100 text-orange-700">архив</Badge>}
                  </div>
                </div>
                {f.has_preferred && (
                  <div className="text-[11px] text-slate-500 mt-1">
                    required {f.required_covered}/{f.required_total} · supporting {f.supporting_covered}/{f.supporting_total}
                    {f.preferred_products_preview.length > 0 && <span className="text-slate-400"> · {f.preferred_products_preview.join(", ")}</span>}
                  </div>
                )}
                {f.residual_required_gaps_preview.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {f.residual_required_gaps_preview.map((g) => <Badge key={g} className="text-[10px] border-0 bg-rose-50 text-rose-600">{g}</Badge>)}
                  </div>
                )}
              </div>
            ))}
            {filtered.length === 0 && <div className="text-xs text-slate-400 py-4 text-center">Нет функций под фильтры.</div>}
          </div>
        </div>

        {/* Top блоки */}
        <div className="space-y-4">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Незакрытые required capability</div>
            <div className="space-y-1">
              {data.top_required_gaps.length === 0 ? (
                <div className="text-xs text-slate-400">Все required capability закрыты.</div>
              ) : data.top_required_gaps.map((g) => (
                <button
                  key={g.capability_id}
                  onClick={() => setCapFilter(capFilter === g.capability_id ? null : g.capability_id)}
                  className={`w-full text-left rounded-md border px-2.5 py-1.5 transition ${capFilter === g.capability_id ? "border-rose-300 bg-rose-50" : "border-slate-100 bg-white hover:border-rose-200"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-800">{g.capability_name}</span>
                    <Badge variant="secondary" className="text-[10px]">{g.functions_count} функц.</Badge>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    нет шортлиста: {g.no_shortlist_functions_count} · нет preferred: {g.no_preferred_functions_count} · gap в preferred: {g.preferred_gap_functions_count}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Топ preferred-продуктов</div>
            <div className="space-y-1">
              {data.top_preferred_products.length === 0 ? (
                <div className="text-xs text-slate-400">Пока нет preferred-решений.</div>
              ) : data.top_preferred_products.map((p) => (
                <div key={p.product_id} className="rounded-md border border-slate-100 px-2.5 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-800">{p.product_name}</span>
                    <Badge variant="secondary" className="text-[10px]">{p.functions_count} функц.</Badge>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">пилот-ready: {p.pilot_ready_functions_count} · внимание: {p.attention_functions_count}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Топ preferred-модулей</div>
            <div className="space-y-1">
              {data.top_preferred_modules.length === 0 ? (
                <div className="text-xs text-slate-400">Пока нет preferred-решений.</div>
              ) : data.top_preferred_modules.map((m) => (
                <div key={m.module_id} className="rounded-md border border-slate-100 px-2.5 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-800">{m.module_name}</span>
                    <Badge variant="secondary" className="text-[10px]">{m.functions_count} функц.</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
