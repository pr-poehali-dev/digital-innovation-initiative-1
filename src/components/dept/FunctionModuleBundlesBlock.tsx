import { useEffect, useState } from "react";
import { deptFunctionsApi } from "@/lib/api";
import Icon from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "@/components/ui/use-toast";
import { RELEVANCE, RELEVANCE_COLOR, REASON_TAGS, labelOf } from "@/components/dept/functionPracticeOptions";

type SourcePractice = {
  practice_id: number; practice_name: string; practice_relevance: string;
  relation_type: string; reason_tags: string[]; rationale_note: string | null;
};
type BundleModule = {
  module_id: number; module_slug: string; module_name: string; module_category: string; module_status: string;
  product_name: string; deployment_types: string[]; vendor_name: string;
};
type CapResult = {
  capability_id: number; capability_name: string; capability_category: string;
  need_level: string; priority_level: string; covered: boolean; best_coverage_level: string | null;
  best_modules: { module_id: number; module_name: string }[]; source_practices: SourcePractice[];
};
type Uncovered = { capability_id: number; capability_name: string; need_level: string; priority_level: string; source_practices: SourcePractice[] };
type Contribution = {
  module_id: number; module_name: string;
  unique_required_coverage_count: number; unique_supporting_coverage_count: number; unique_optional_coverage_count: number;
  best_covered_capabilities: string[];
};
type Bundle = {
  bundle_key: string; modules_count: number; products_count: number; vendors_count: number;
  required_total: number; required_covered: number; required_uncovered: number;
  supporting_total: number; supporting_covered: number; supporting_uncovered: number;
  optional_total: number; optional_covered: number; optional_uncovered: number;
  modules: BundleModule[]; capability_results: CapResult[];
  uncovered_capabilities: Uncovered[]; module_contributions: Contribution[];
};
type Summary = {
  candidate_modules_count: number; evaluated_bundles_count: number; returned_bundles_count: number;
  required_total: number; supporting_total: number; optional_total: number;
  best_required_uncovered: number; best_required_covered: number; best_supporting_covered: number;
  full_required_bundle_exists: boolean;
};

interface Props { projectId: number; functionId: number; refreshKey?: number; }

const NEED_LABEL: Record<string, string> = { required: "обязательна", supporting: "поддерживает", optional: "опционально" };
const NEED_COLOR: Record<string, string> = {
  required: "bg-rose-100 text-rose-700", supporting: "bg-blue-100 text-blue-700", optional: "bg-slate-100 text-slate-500",
};
const COV_LABEL: Record<string, string> = { core: "базовая", supporting: "поддержка", limited: "частично" };
const COV_COLOR: Record<string, string> = {
  core: "bg-emerald-100 text-emerald-700", supporting: "bg-blue-100 text-blue-700", limited: "bg-slate-100 text-slate-500",
};

function CoverageBar({ label, covered, total, tone }: { label: string; covered: number; total: number; tone: string }) {
  if (total === 0) return null;
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className="text-slate-500 w-16">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={tone} style={{ width: `${(covered / total) * 100}%` }} />
      </div>
      <span className="text-slate-600 tabular-nums w-9 text-right">{covered}/{total}</span>
    </div>
  );
}

export default function FunctionModuleBundlesBlock({ projectId, functionId, refreshKey }: Props) {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [maxSize, setMaxSize] = useState("3");
  const [onlyFull, setOnlyFull] = useState(false);
  const [detail, setDetail] = useState<Bundle | null>(null);

  const load = () => {
    setLoading(true);
    deptFunctionsApi.getFunctionModuleBundles(projectId, functionId, { maxBundleSize: Number(maxSize), onlyFullRequired: onlyFull })
      .then((d: { bundles: Bundle[]; summary: Summary }) => { setBundles(d.bundles || []); setSummary(d.summary || null); })
      .catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId, functionId, maxSize, onlyFull, refreshKey]);

  return (
    <div className="mt-3 border border-slate-200 rounded-lg p-3 bg-fuchsia-50/30">
      <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
        <div className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
          <Icon name="Layers" size={15} /> Кандидатные наборы модулей
          {summary && summary.returned_bundles_count > 0 && (
            <Badge variant="secondary" className="text-[10px]">Top {summary.returned_bundles_count}</Badge>
          )}
          {summary && (summary.full_required_bundle_exists ? (
            <Badge className="text-[10px] border-0 bg-emerald-100 text-emerald-700">Полное required-покрытие: есть</Badge>
          ) : summary.required_total > 0 ? (
            <Badge className="text-[10px] border-0 bg-rose-100 text-rose-700">Best required gaps: {summary.best_required_uncovered}</Badge>
          ) : null)}
        </div>
        <div className="flex items-center gap-1.5">
          <Select value={maxSize} onValueChange={setMaxSize}>
            <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">До 1 модуля</SelectItem>
              <SelectItem value="2">До 2 модулей</SelectItem>
              <SelectItem value="3">До 3 модулей</SelectItem>
            </SelectContent>
          </Select>
          <button
            onClick={() => setOnlyFull((v) => !v)}
            className={`text-xs px-2 py-1 rounded border ${onlyFull ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-600 border-slate-200"}`}
          >
            Только полное required
          </button>
        </div>
      </div>

      <div className="text-[11px] text-slate-400 mb-2">
        Наборы модулей, вместе покрывающие больше нужных capability. Кандидаты, не рекомендация. Без общего рейтинга.
      </div>

      {loading ? (
        <div className="text-xs text-slate-400 py-2">Загрузка…</div>
      ) : !summary || summary.candidate_modules_count === 0 ? (
        <div className="text-xs text-slate-400 py-2">Нет кандидатных модулей: сначала привяжите практики и убедитесь, что для их capability есть модули в реестре.</div>
      ) : bundles.length === 0 ? (
        <div className="text-xs text-slate-400 py-2">Нет наборов под текущие условия.</div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {bundles.map((b) => (
            <button
              key={b.bundle_key}
              onClick={() => setDetail(b)}
              className="text-left rounded-lg border border-slate-200 bg-white hover:border-fuchsia-300 hover:shadow-sm transition p-3"
            >
              <div className="flex flex-wrap gap-1 mb-2">
                {b.modules.map((m) => <Badge key={m.module_id} variant="secondary" className="text-[10px]">{m.module_name}</Badge>)}
              </div>
              <div className="space-y-1">
                <CoverageBar label="required" covered={b.required_covered} total={b.required_total} tone="h-full bg-rose-400" />
                <CoverageBar label="supporting" covered={b.supporting_covered} total={b.supporting_total} tone="h-full bg-blue-400" />
                <CoverageBar label="optional" covered={b.optional_covered} total={b.optional_total} tone="h-full bg-slate-400" />
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                <Badge variant="outline" className="text-[10px]">{b.modules_count} модуля</Badge>
                <Badge variant="outline" className="text-[10px]">{b.products_count} прод.</Badge>
                <Badge variant="outline" className="text-[10px]">{b.vendors_count} вендор</Badge>
                {b.required_uncovered > 0 && <Badge className="text-[10px] border-0 bg-rose-50 text-rose-600">−{b.required_uncovered} required</Badge>}
              </div>
            </button>
          ))}
        </div>
      )}

      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle className="text-left">Набор из {detail.modules_count} модулей</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                {/* Состав */}
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Состав набора</div>
                  <div className="space-y-1">
                    {detail.modules.map((m) => (
                      <div key={m.module_id} className="rounded-md border border-slate-100 px-2.5 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-slate-800">{m.module_name}</span>
                          <div className="flex gap-1">
                            {m.deployment_types.map((d) => <Badge key={d} variant="outline" className="text-[9px] text-violet-600">{d}</Badge>)}
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-400">{m.product_name} · {m.vendor_name}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Покрытие */}
                <div className="space-y-1">
                  <CoverageBar label="required" covered={detail.required_covered} total={detail.required_total} tone="h-full bg-rose-400" />
                  <CoverageBar label="supporting" covered={detail.supporting_covered} total={detail.supporting_total} tone="h-full bg-blue-400" />
                  <CoverageBar label="optional" covered={detail.optional_covered} total={detail.optional_total} tone="h-full bg-slate-400" />
                </div>

                {/* Вклад модулей */}
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Вклад каждого модуля</div>
                  <div className="space-y-1.5">
                    {detail.module_contributions.map((c) => (
                      <div key={c.module_id} className="rounded-md border border-slate-100 px-2.5 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-slate-800">{c.module_name}</span>
                          <span className="text-[10px] text-slate-400">
                            R{c.unique_required_coverage_count} · S{c.unique_supporting_coverage_count} · O{c.unique_optional_coverage_count}
                          </span>
                        </div>
                        {c.best_covered_capabilities.length > 0 && (
                          <div className="text-[11px] text-slate-500 mt-0.5">{c.best_covered_capabilities.join(", ")}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Coverage matrix */}
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Что покрывает</div>
                  <div className="space-y-1">
                    {detail.capability_results.map((cr) => (
                      <div key={cr.capability_id} className="flex items-center gap-1.5 flex-wrap rounded-md border border-slate-100 px-2.5 py-1.5">
                        <span className="text-sm text-slate-800 flex-1 min-w-0">{cr.capability_name}</span>
                        <Badge className={`text-[10px] border-0 ${NEED_COLOR[cr.need_level] || ""}`}>{NEED_LABEL[cr.need_level]}</Badge>
                        {cr.covered && cr.best_coverage_level ? (
                          <Badge className={`text-[10px] border-0 ${COV_COLOR[cr.best_coverage_level] || ""}`}>{COV_LABEL[cr.best_coverage_level]}</Badge>
                        ) : (
                          <Badge className="text-[10px] border-0 bg-amber-100 text-amber-700">нет</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Gaps */}
                {detail.uncovered_capabilities.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Что не покрывает</div>
                    <div className="space-y-1.5">
                      {detail.uncovered_capabilities.map((u) => (
                        <div key={u.capability_id} className="rounded-md border border-amber-100 bg-amber-50/50 px-2.5 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm text-slate-800">{u.capability_name}</span>
                            <Badge className={`text-[10px] border-0 ${NEED_COLOR[u.need_level] || ""}`}>{NEED_LABEL[u.need_level]}</Badge>
                          </div>
                          {u.source_practices.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {u.source_practices.slice(0, 3).map((sp) => (
                                <Badge key={sp.practice_id + sp.relation_type} className={`text-[10px] border-0 ${RELEVANCE_COLOR[sp.practice_relevance] || ""}`}>
                                  {sp.practice_name}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Explainability chain — первая покрытая required capability */}
                {(() => {
                  const first = detail.capability_results.find((c) => c.covered && c.source_practices.length > 0);
                  if (!first) return null;
                  return (
                    <div>
                      <div className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Почему это нужно ({first.capability_name})</div>
                      <div className="space-y-1.5">
                        {first.source_practices.map((sp) => (
                          <div key={sp.practice_id + sp.relation_type} className="rounded-md border border-slate-100 px-2.5 py-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm text-slate-800">{sp.practice_name}</span>
                              <Badge className={`text-[10px] border-0 ${RELEVANCE_COLOR[sp.practice_relevance] || ""}`}>{labelOf(RELEVANCE, sp.practice_relevance)}</Badge>
                            </div>
                            {sp.reason_tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {sp.reason_tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px] bg-emerald-50 text-emerald-700">{labelOf(REASON_TAGS, t)}</Badge>)}
                              </div>
                            )}
                            {sp.rationale_note && <div className="text-xs text-slate-500 mt-1 italic">«{sp.rationale_note}»</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
