import { useEffect, useState } from "react";
import { deptFunctionsApi } from "@/lib/api";
import Icon from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "@/components/ui/use-toast";
import { usePersistentSearchState } from "@/hooks/usePersistentSearchState";

type OrgUnit = { id: number; code: string; name: string };

type WaveFn = {
  function_id: number; function_name: string; org_unit_name: string | null;
  preferred_title: string | null; modules_preview: string[]; products_preview: string[];
};
type Variant = { bundle_key: string; modules: { module_id: number; module_name: string }[]; modules_count: number; functions_count: number; sample_functions: { function_id: number; function_name: string }[] };
type Wave = {
  wave_key: string; wave_rank: number; functions_count: number; org_units_count: number;
  products_count: number; vendors_count: number; bundle_variants_count: number;
  products: { product_id: number; product_name: string }[];
  vendors: { vendor_id: number; vendor_name: string }[];
  functions: WaveFn[]; bundle_variants: Variant[];
};
type BacklogRow = {
  function_id: number; function_name: string; org_unit_name: string | null; decision_health: string;
  required_gaps_count: number; has_drift: boolean; has_archived_supply: boolean;
  preferred_title: string | null; preferred_products_preview: string[]; residual_required_gaps_preview: string[]; blockers: string[];
};
type Roadmap = {
  scope: { scope_type: string; functions_total: number; unassigned_functions_count?: number };
  summary: { functions_total: number; preferred_count: number; pilot_ready_count: number; candidate_waves_count: number; preparation_backlog_count: number; largest_wave_size: number };
  waves: Wave[];
  preparation_backlog_summary: { preferred_with_required_gaps_count: number; preferred_with_drift_count: number; preferred_with_archived_supply_count: number };
  preparation_backlog: BacklogRow[];
};

interface Props { projectId: number; }

const BLOCKER_LABEL: Record<string, string> = { required_gaps: "required gaps", drift: "дрейф", archived_supply: "архивный supply" };

function Kpi({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

export default function DeptPilotRoadmapTab({ projectId }: Props) {
  const [data, setData] = useState<Roadmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [wave, setWave] = useState<Wave | null>(null);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);

  // Персистентный scope дорожной карты — ОТДЕЛЬНЫЕ ключи от «Сводки решений» (независимая память вкладок)
  const { state: view, setState: setView, reset: resetView } = usePersistentSearchState<{ ps: string; pou: string }>({
    storageKey: `cabinet:roadmap:${projectId}:state`,
    defaults: { ps: "project", pou: "" },
    paramKeys: { ps: "ps", pou: "pou" },
    validate: (raw) => {
      const ps = raw.ps === "unit" ? "unit" : "project";
      const pou = ps === "unit" && raw.pou && /^\d+$/.test(raw.pou) ? raw.pou : "";
      return { ps, pou };
    },
  });

  useEffect(() => {
    deptFunctionsApi.getOrgTree(projectId)
      .then((d: { nodes?: OrgUnit[] }) => setOrgUnits(d.nodes || []))
      .catch(() => { /* переключатель scope не критичен */ });
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    const orgUnitId = view.ps === "unit" && view.pou ? Number(view.pou) : undefined;
    deptFunctionsApi.getPilotRoadmap(projectId, orgUnitId)
      .then((d: Roadmap & { ok: boolean }) => setData(d))
      .catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [projectId, view.ps, view.pou]);

  if (loading) return <div className="text-sm text-slate-400 py-10 text-center">Загрузка дорожной карты…</div>;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Icon name="Compass" size={18} /> Дорожная карта пилотов
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Кандидатные волны из готовых к пилоту функций, сгруппированных по общим продуктам. Не план по датам — группировка внедрения.
        </p>
      </div>

      {/* Scope: весь проект / конкретная оргединица (независимо от «Сводки решений») */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-slate-400">Область:</span>
        <button
          onClick={() => setView({ ps: "project", pou: "" })}
          className={`px-2.5 py-1 rounded border ${view.ps === "project" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200"}`}
        >
          Весь проект
        </button>
        <button
          onClick={() => setView({ ps: "unit", pou: view.pou || (orgUnits[0] ? String(orgUnits[0].id) : "") })}
          disabled={orgUnits.length === 0}
          className={`px-2.5 py-1 rounded border disabled:opacity-40 ${view.ps === "unit" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200"}`}
        >
          Оргединица
        </button>
        {view.ps === "unit" && orgUnits.length > 0 && (
          <Select value={view.pou} onValueChange={(v) => setView({ pou: v })}>
            <SelectTrigger className="h-8 w-[220px] text-xs"><SelectValue placeholder="Выберите узел…" /></SelectTrigger>
            <SelectContent>
              {orgUnits.map((u) => <SelectItem key={u.id} value={String(u.id)} className="text-xs">{u.code} · {u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {view.ps !== "project" && (
          <button onClick={resetView} className="ml-1 text-slate-400 hover:text-slate-600 underline underline-offset-2 inline-flex items-center gap-0.5">
            <Icon name="X" size={11} /> Сбросить
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Kpi label="Готовы к пилоту" value={data.summary.pilot_ready_count} tone="text-emerald-700" />
        <Kpi label="Кандидатных волн" value={data.summary.candidate_waves_count} tone="text-violet-700" />
        <Kpi label="Крупнейшая волна" value={data.summary.largest_wave_size} tone="text-slate-800" />
        <Kpi label="В подготовке" value={data.summary.preparation_backlog_count} tone="text-amber-600" />
      </div>

      {/* Waves */}
      <div>
        <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Кандидатные волны</div>
        {data.waves.length === 0 ? (
          <div className="text-sm text-slate-400 rounded-lg border border-slate-200 bg-white p-4">
            {view.ps === "unit"
              ? "В этой оргединице пока нет готовых к пилоту функций."
              : "Пока нет готовых к пилоту функций. Отметьте preferred-набор и закройте required gaps / дрейф."}
            {view.ps === "unit" && (
              <div>
                <Button variant="outline" size="sm" className="mt-2 h-7 text-[11px]" onClick={() => setView({ ps: "project", pou: "" })}>
                  Показать весь проект
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {data.waves.map((w) => (
              <button
                key={w.wave_key}
                onClick={() => setWave(w)}
                className="text-left rounded-lg border border-slate-200 bg-white hover:border-violet-300 hover:shadow-sm transition p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-800">Волна {w.wave_rank}</div>
                  <Badge className="text-[10px] border-0 bg-violet-100 text-violet-700">{w.functions_count} функц.</Badge>
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {w.products.map((p) => <Badge key={p.product_id} variant="secondary" className="text-[10px]">{p.product_name}</Badge>)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1.5">
                  {w.products_count} прод. · {w.vendors_count} вендор · {w.org_units_count} оргед. · вариантов набора: {w.bundle_variants_count}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 truncate">
                  {w.functions.map((f) => f.function_name).join(", ")}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Preparation backlog */}
      <div>
        <div className="text-xs font-semibold text-slate-500 uppercase mb-2 flex items-center gap-2">
          В подготовке к пилоту
          {data.summary.preparation_backlog_count > 0 && (
            <span className="text-[10px] font-normal text-slate-400">
              gaps: {data.preparation_backlog_summary.preferred_with_required_gaps_count} ·
              дрейф: {data.preparation_backlog_summary.preferred_with_drift_count} ·
              архив: {data.preparation_backlog_summary.preferred_with_archived_supply_count}
            </span>
          )}
        </div>
        {data.preparation_backlog.length === 0 ? (
          <div className="text-sm text-slate-400">Нет функций с preferred, ожидающих доработки.</div>
        ) : (
          <div className="space-y-1.5">
            {data.preparation_backlog.map((b) => (
              <div key={b.function_id} className="rounded-lg border border-amber-100 bg-amber-50/40 p-2.5">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800">{b.function_name}</div>
                    {b.org_unit_name && <div className="text-[11px] text-slate-400">{b.org_unit_name}</div>}
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {b.blockers.map((bl) => <Badge key={bl} className="text-[10px] border-0 bg-rose-100 text-rose-700">{BLOCKER_LABEL[bl] || bl}</Badge>)}
                  </div>
                </div>
                {b.preferred_title && <div className="text-[11px] text-slate-500 mt-0.5">{b.preferred_title} · {b.preferred_products_preview.join(", ")}</div>}
                {b.residual_required_gaps_preview.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {b.residual_required_gaps_preview.map((g) => <Badge key={g} className="text-[10px] border-0 bg-rose-50 text-rose-600">{g}</Badge>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Wave drawer */}
      <Sheet open={!!wave} onOpenChange={(o) => !o && setWave(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          {wave && (
            <>
              <SheetHeader><SheetTitle className="text-left">Волна {wave.wave_rank} · {wave.functions_count} функций</SheetTitle></SheetHeader>
              <div className="mt-4 space-y-4">
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Продукты и вендоры</div>
                  <div className="flex flex-wrap gap-1">
                    {wave.products.map((p) => <Badge key={p.product_id} variant="secondary" className="text-[10px]">{p.product_name}</Badge>)}
                    {wave.vendors.map((v) => <Badge key={v.vendor_id} variant="outline" className="text-[10px]">{v.vendor_name}</Badge>)}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Варианты набора модулей ({wave.bundle_variants_count})</div>
                  <div className="space-y-1.5">
                    {wave.bundle_variants.map((v) => (
                      <div key={v.bundle_key} className="rounded-md border border-slate-100 px-2.5 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-wrap gap-1">
                            {v.modules.map((m) => <Badge key={m.module_id} variant="secondary" className="text-[10px]">{m.module_name}</Badge>)}
                          </div>
                          <Badge variant="outline" className="text-[10px] flex-shrink-0">{v.functions_count} функц.</Badge>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{v.sample_functions.map((f) => f.function_name).join(", ")}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Функции волны</div>
                  <div className="space-y-1">
                    {wave.functions.map((f) => (
                      <div key={f.function_id} className="rounded-md border border-slate-100 px-2.5 py-1.5">
                        <div className="text-sm text-slate-800">{f.function_name}</div>
                        <div className="text-[11px] text-slate-400">
                          {f.org_unit_name ? `${f.org_unit_name} · ` : ""}{f.preferred_title || ""}
                        </div>
                        {f.modules_preview.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {f.modules_preview.map((m) => <Badge key={m} variant="outline" className="text-[9px]">{m}</Badge>)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}