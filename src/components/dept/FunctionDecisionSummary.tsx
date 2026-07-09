import { useEffect, useState } from "react";
import { deptFunctionsApi } from "@/lib/api";
import Icon from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { functionNextStep, TONE_STYLES } from "@/components/dept/decisionNextStep";

type Gap = {
  capability_id: number; name: string; category: string; need_level: string;
  priority_level: string; source_practices_count: number;
};
type Summary = {
  function: { id: number; name: string };
  selection_state: "no_shortlist" | "no_preferred" | "preferred_selected";
  decision_health: string;
  shortlists_summary: { active_count: number; preferred_count: number; rejected_count: number; shortlisted_count: number };
  decision_flags: {
    has_preferred: boolean; has_required_gaps: boolean; required_gaps_count: number;
    has_supporting_gaps: boolean; supporting_gaps_count: number; has_drift: boolean;
    has_archived_supply: boolean; full_required_coverage: boolean;
  };
  preferred_summary: null | {
    shortlist_id: number; title: string | null; decision_note: string | null;
    modules_count: number; products_count: number; vendors_count: number;
    modules: { module_id: number; module_name: string; module_status: string }[];
    products: { product_id: number; product_name: string }[];
    vendors: { vendor_id: number; vendor_name: string }[];
    coverage: {
      required_total: number; required_covered: number; required_uncovered: number;
      supporting_total: number; supporting_covered: number; supporting_uncovered: number;
      optional_total: number; optional_covered: number; optional_uncovered: number;
    };
    drift: { has_drift: boolean; drift_reasons: string[] };
    archived_supply: { archived_modules_count: number; archived_products_count: number; archived_vendors_count: number };
  };
  residual_gaps: { required: Gap[]; supporting: Gap[] };
};

interface Props { projectId: number; functionId: number; refreshKey?: number; onNavigate?: (target: string) => void; }

const DRIFT_LABEL: Record<string, string> = {
  required_coverage_changed: "изменилось required-покрытие",
  supporting_coverage_changed: "изменилось supporting-покрытие",
  optional_coverage_changed: "изменилось optional-покрытие",
  archived_supply: "архивный supply",
};

function Cov({ label, c, u, tone }: { label: string; c: number; u: number; tone: string }) {
  const total = c + u;
  if (total === 0) return null;
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className="text-slate-500 w-16">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={tone} style={{ width: `${(c / total) * 100}%` }} />
      </div>
      <span className="text-slate-600 tabular-nums w-9 text-right">{c}/{total}</span>
    </div>
  );
}

export default function FunctionDecisionSummary({ projectId, functionId, refreshKey, onNavigate }: Props) {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    deptFunctionsApi.getFunctionDecisionSummary(projectId, functionId)
      .then((d: Summary & { ok: boolean }) => setData(d))
      .catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [projectId, functionId, refreshKey]);

  if (loading) return <div className="mt-3 border border-slate-200 rounded-lg p-3 bg-slate-50/40 text-xs text-slate-400">Загрузка сводки…</div>;
  if (!data) return null;

  const { selection_state: state, decision_flags: flags, preferred_summary: pref } = data;

  const pilotReady = state === "preferred_selected" && !flags.has_required_gaps && !flags.has_drift && !flags.has_archived_supply;
  const next = functionNextStep({
    selection_state: state,
    has_required_gaps: flags.has_required_gaps,
    required_gaps_count: flags.required_gaps_count,
    has_drift: flags.has_drift,
    has_archived_supply: flags.has_archived_supply,
    pilot_ready: pilotReady,
  });
  const ts = TONE_STYLES[next.tone];

  return (
    <div className="mt-3 border border-slate-300 rounded-lg p-3 bg-white">
      <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5 mb-2">
        <Icon name="Gavel" size={15} /> Сводка решения
      </div>

      {/* Что делать дальше — derived next step */}
      <div className={`rounded-lg border p-2.5 mb-2.5 ${ts.box}`}>
        <div className="flex items-start gap-2">
          <Icon name={ts.iconName} size={15} className={`mt-0.5 flex-shrink-0 ${ts.icon}`} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-slate-800">Что делать дальше: {next.title}</div>
            <div className="text-[11px] text-slate-600 mt-0.5">{next.description}</div>
            {onNavigate && next.ctas.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {next.ctas.map((c, i) => (
                  <Button key={c.target} size="sm" variant={i === 0 ? "default" : "outline"} className="h-6 text-[11px]" onClick={() => onNavigate(c.target)}>
                    {c.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {state === "preferred_selected" && pref && (
        <div className="space-y-2.5">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-800">{pref.title || `Набор из ${pref.modules_count} модулей`}</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {pref.modules.map((m) => (
                  <Badge key={m.module_id} variant="secondary" className="text-[10px]">
                    {m.module_name}{m.module_status !== "active" ? " (арх.)" : ""}
                  </Badge>
                ))}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {pref.products_count} прод. · {pref.vendors_count} вендор
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <Badge className="text-[10px] border-0 bg-emerald-100 text-emerald-700"><Icon name="Star" size={10} className="mr-0.5" />Предпочтителен</Badge>
              {flags.full_required_coverage && <Badge className="text-[10px] border-0 bg-emerald-50 text-emerald-600">required закрыт</Badge>}
              {flags.has_required_gaps && <Badge className="text-[10px] border-0 bg-rose-100 text-rose-700">Required gaps: {flags.required_gaps_count}</Badge>}
              {flags.has_drift && <Badge className="text-[10px] border-0 bg-amber-100 text-amber-700" title={pref.drift.drift_reasons.map((r) => DRIFT_LABEL[r] || r).join(", ")}>Дрейф</Badge>}
              {flags.has_archived_supply && <Badge className="text-[10px] border-0 bg-orange-100 text-orange-700">Архивный supply</Badge>}
            </div>
          </div>

          <div className="space-y-1">
            <Cov label="required" c={pref.coverage.required_covered} u={pref.coverage.required_uncovered} tone="h-full bg-rose-400" />
            <Cov label="supporting" c={pref.coverage.supporting_covered} u={pref.coverage.supporting_uncovered} tone="h-full bg-blue-400" />
            <Cov label="optional" c={pref.coverage.optional_covered} u={pref.coverage.optional_uncovered} tone="h-full bg-slate-400" />
          </div>

          {(data.residual_gaps.required.length > 0 || data.residual_gaps.supporting.length > 0) && (
            <div className="pt-1">
              <div className="text-[11px] font-semibold text-slate-500 uppercase mb-1">Не закрыто выбранным решением</div>
              <div className="flex flex-wrap gap-1">
                {data.residual_gaps.required.map((g) => (
                  <Badge key={g.capability_id} className="text-[10px] border-0 bg-rose-50 text-rose-600" title={`из ${g.source_practices_count} практик`}>{g.name}</Badge>
                ))}
                {data.residual_gaps.supporting.map((g) => (
                  <Badge key={g.capability_id} className="text-[10px] border-0 bg-blue-50 text-blue-600">{g.name}</Badge>
                ))}
              </div>
            </div>
          )}

          {pref.decision_note && (
            <div className="text-[11px] text-slate-500 italic border-t border-slate-100 pt-1.5">«{pref.decision_note}»</div>
          )}
        </div>
      )}
    </div>
  );
}