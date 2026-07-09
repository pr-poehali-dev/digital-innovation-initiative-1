import { useEffect, useMemo, useState } from "react";
import { deptFunctionsApi } from "@/lib/api";
import Icon from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
type Candidate = {
  module_id: number; module_slug: string; module_name: string; module_category: string;
  module_summary: string | null; module_status: string;
  coverage_level: string; coverage_note: string | null; source_note: string | null; source_url: string | null;
  product_name: string; product_status: string; deployment_types: string[];
  vendor_name: string; vendor_status: string;
};
type CapGroup = {
  capability_id: number; slug: string; name: string; category: string; description: string | null;
  status: string; need_level: string; priority_level: string;
  source_practices_count: number; source_practices: SourcePractice[];
  candidates_count: number; candidates: Candidate[];
};
type Summary = {
  capabilities_total: number; capabilities_with_candidates: number; capabilities_without_candidates: number;
  required_total: number; required_without_candidates: number;
  distinct_modules_count: number; distinct_products_count: number; distinct_vendors_count: number;
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
const DEPL_LABEL: Record<string, string> = { cloud: "Cloud", on_prem: "On-prem", hybrid: "Hybrid" };

export default function FunctionModuleCandidatesBlock({ projectId, functionId, refreshKey }: Props) {
  const [groups, setGroups] = useState<CapGroup[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showArchivedModules, setShowArchivedModules] = useState(false);

  const [q, setQ] = useState("");
  const [needFilter, setNeedFilter] = useState("all");
  const [coverageFilter, setCoverageFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [deploymentFilter, setDeploymentFilter] = useState("all");
  const [onlyGaps, setOnlyGaps] = useState(false);

  const [detail, setDetail] = useState<{ cap: CapGroup; cand: Candidate } | null>(null);

  const load = () => {
    setLoading(true);
    deptFunctionsApi.getFunctionModuleCandidates(projectId, functionId, { includeArchivedModules: showArchivedModules })
      .then((d: { capability_groups: CapGroup[]; summary: Summary }) => { setGroups(d.capability_groups || []); setSummary(d.summary || null); })
      .catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId, functionId, showArchivedModules, refreshKey]);

  const vendors = useMemo(() => {
    const s = new Set<string>();
    groups.forEach((g) => g.candidates.forEach((c) => s.add(c.vendor_name)));
    return Array.from(s).sort();
  }, [groups]);

  // Фильтрация: сначала фильтруем кандидатов, потом группы
  const filtered = useMemo(() => groups.map((g) => {
    const cands = g.candidates.filter((c) => {
      if (coverageFilter !== "all" && c.coverage_level !== coverageFilter) return false;
      if (vendorFilter !== "all" && c.vendor_name !== vendorFilter) return false;
      if (deploymentFilter !== "all" && !c.deployment_types.includes(deploymentFilter)) return false;
      return true;
    });
    return { ...g, _filteredCandidates: cands };
  }).filter((g) => {
    if (needFilter !== "all" && g.need_level !== needFilter) return false;
    if (q && !(`${g.name} ${g.description || ""}`.toLowerCase().includes(q.toLowerCase()))) return false;
    if (onlyGaps) return g._filteredCandidates.length === 0;
    // если активны supply-фильтры и кандидатов не осталось — скрываем, кроме реальных gap
    const supplyFilterActive = coverageFilter !== "all" || vendorFilter !== "all" || deploymentFilter !== "all";
    if (supplyFilterActive && g.candidates_count > 0 && g._filteredCandidates.length === 0) return false;
    return true;
  }), [groups, q, needFilter, coverageFilter, vendorFilter, deploymentFilter, onlyGaps]);

  return (
    <div className="mt-3 border border-slate-200 rounded-lg p-3 bg-violet-50/30">
      <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
        <div className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
          <Icon name="Boxes" size={15} /> Кандидатные модули
          {summary && summary.distinct_modules_count > 0 && (
            <Badge variant="secondary" className="text-[10px]">{summary.distinct_modules_count} модулей</Badge>
          )}
          {summary && summary.required_without_candidates > 0 && (
            <Badge className="text-[10px] border-0 bg-rose-100 text-rose-700" title="Обязательные capability без покрытия">
              Required gaps: {summary.required_without_candidates}
            </Badge>
          )}
          {summary && summary.capabilities_without_candidates > 0 && (
            <Badge className="text-[10px] border-0 bg-amber-100 text-amber-700" title="Capability без модулей в реестре">
              Без покрытия: {summary.capabilities_without_candidates}
            </Badge>
          )}
        </div>
        <button onClick={() => setShowArchivedModules((v) => !v)} className="text-xs text-slate-500 underline underline-offset-2">
          {showArchivedModules ? "Скрыть архивные" : "Архивные модули"}
        </button>
      </div>

      <div className="text-[11px] text-slate-400 mb-2">
        Кандидаты из реестра модулей под capability функции. Не рейтинг и не рекомендация — только просмотр.
      </div>

      {loading ? (
        <div className="text-xs text-slate-400 py-2">Загрузка…</div>
      ) : groups.length === 0 ? (
        <div className="text-xs text-slate-400 py-2">Нет capability: сначала привяжите практики улучшения к функции.</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="relative flex-1 min-w-[150px]">
              <Icon name="Search" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск capability…" className="h-8 pl-8 text-xs" />
            </div>
            <Select value={needFilter} onValueChange={setNeedFilter}>
              <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Любая нужда</SelectItem>
                <SelectItem value="required">Обязательна</SelectItem>
                <SelectItem value="supporting">Поддерживает</SelectItem>
                <SelectItem value="optional">Опционально</SelectItem>
              </SelectContent>
            </Select>
            <Select value={coverageFilter} onValueChange={setCoverageFilter}>
              <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Любое покрытие</SelectItem>
                <SelectItem value="core">Базовое</SelectItem>
                <SelectItem value="supporting">Поддержка</SelectItem>
                <SelectItem value="limited">Частичное</SelectItem>
              </SelectContent>
            </Select>
            <Select value={vendorFilter} onValueChange={setVendorFilter}>
              <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все вендоры</SelectItem>
                {vendors.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={deploymentFilter} onValueChange={setDeploymentFilter}>
              <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Любой хостинг</SelectItem>
                <SelectItem value="cloud">Cloud</SelectItem>
                <SelectItem value="on_prem">On-prem</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
              </SelectContent>
            </Select>
            <button
              onClick={() => setOnlyGaps((v) => !v)}
              className={`text-xs px-2 py-1 rounded border ${onlyGaps ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-600 border-slate-200"}`}
            >
              Только без покрытия
            </button>
          </div>

          {filtered.length === 0 ? (
            <div className="text-xs text-slate-400 py-2">По фильтрам ничего не найдено.</div>
          ) : (
            <div className="space-y-2">
              {filtered.map((g) => (
                <div key={g.capability_id} className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium text-slate-800">{g.name}</span>
                    <Badge className={`text-[10px] border-0 ${NEED_COLOR[g.need_level] || ""}`}>{NEED_LABEL[g.need_level]}</Badge>
                    <Badge className={`text-[10px] border-0 ${RELEVANCE_COLOR[g.priority_level] || ""}`}>{labelOf(RELEVANCE, g.priority_level)}</Badge>
                    {g.category && <Badge variant="outline" className="text-[10px]">{g.category}</Badge>}
                    <Badge variant="secondary" className="text-[10px]">из {g.source_practices_count} практик</Badge>
                  </div>

                  {g._filteredCandidates.length === 0 ? (
                    <div className={`mt-2 text-xs rounded-md px-2.5 py-1.5 ${g.candidates_count === 0 ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-400"}`}>
                      {g.candidates_count === 0
                        ? "В реестре нет модулей, покрывающих эту capability"
                        : "Нет модулей под текущие фильтры"}
                    </div>
                  ) : (
                    <div className="mt-2 space-y-1">
                      {g._filteredCandidates.map((c) => (
                        <button
                          key={c.module_id}
                          onClick={() => setDetail({ cap: g, cand: c })}
                          className="w-full text-left rounded-md border border-slate-100 hover:border-violet-300 px-2.5 py-1.5 transition"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-slate-800">{c.module_name}</span>
                            <Badge className={`text-[10px] border-0 flex-shrink-0 ${COV_COLOR[c.coverage_level] || ""}`}>{COV_LABEL[c.coverage_level]}</Badge>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                            <span className="text-[11px] text-slate-400">{c.product_name} · {c.vendor_name}</span>
                            {c.deployment_types.map((d) => <Badge key={d} variant="outline" className="text-[9px] text-violet-600">{DEPL_LABEL[d] || d}</Badge>)}
                            {c.module_status !== "active" && <Badge variant="outline" className="text-[9px] text-slate-400">архивный модуль</Badge>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle className="text-left">{detail.cand.module_name}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="text-xs text-slate-500">{detail.cand.product_name} · {detail.cand.vendor_name}</div>
                <div className="flex flex-wrap gap-1.5">
                  {detail.cand.module_category && <Badge variant="outline" className="text-xs">{detail.cand.module_category}</Badge>}
                  {detail.cand.deployment_types.map((d) => <Badge key={d} variant="outline" className="text-xs text-violet-600">{DEPL_LABEL[d] || d}</Badge>)}
                  <Badge variant="outline" className="text-xs">{detail.cand.module_status}</Badge>
                </div>
                {detail.cand.module_summary && <p className="text-sm text-slate-700 leading-relaxed">{detail.cand.module_summary}</p>}

                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Почему этот модуль показан</div>
                  <div className="rounded-md border border-slate-100 px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-slate-800">{detail.cap.name}</span>
                      <Badge className={`text-[10px] border-0 ${COV_COLOR[detail.cand.coverage_level] || ""}`}>{COV_LABEL[detail.cand.coverage_level]}</Badge>
                    </div>
                    <div className="flex gap-1 mt-1">
                      <Badge className={`text-[10px] border-0 ${NEED_COLOR[detail.cap.need_level] || ""}`}>{NEED_LABEL[detail.cap.need_level]}</Badge>
                    </div>
                    {detail.cand.coverage_note && <div className="text-xs text-slate-400 mt-1">{detail.cand.coverage_note}</div>}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Почему эта capability нужна функции</div>
                  <div className="space-y-2">
                    {detail.cap.source_practices.map((sp) => (
                      <div key={sp.practice_id + sp.relation_type} className="rounded-md border border-slate-100 px-2.5 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-slate-800">{sp.practice_name}</span>
                          <div className="flex gap-1 flex-shrink-0">
                            <Badge className={`text-[10px] border-0 ${RELEVANCE_COLOR[sp.practice_relevance] || ""}`}>{labelOf(RELEVANCE, sp.practice_relevance)}</Badge>
                          </div>
                        </div>
                        {sp.reason_tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {sp.reason_tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px] bg-emerald-50 text-emerald-700">{labelOf(REASON_TAGS, t)}</Badge>)}
                          </div>
                        )}
                        {sp.rationale_note && <div className="text-xs text-slate-500 mt-1 italic">«{sp.rationale_note}»</div>}
                      </div>
                    ))}
                  </div>
                </div>

                {detail.cand.source_note && <div className="text-xs text-slate-400">Источник связи: {detail.cand.source_note}</div>}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
