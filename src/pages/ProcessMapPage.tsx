import { useState, useEffect, useCallback } from "react";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { processMapApi, projectsApi, type MacroProcess, type ProcessMapSummary, type UncoveredFunction } from "@/lib/api";

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  ai_draft: { label: "AI-черновик", className: "bg-amber-100 text-amber-800" },
  user_draft: { label: "Черновик пользователя", className: "bg-slate-100 text-slate-700" },
  in_review: { label: "На проверке", className: "bg-blue-100 text-blue-700" },
  confirmed: { label: "Подтверждено владельцем", className: "bg-emerald-100 text-emerald-700" },
  approved: { label: "Утверждено", className: "bg-emerald-600 text-white" },
  needs_update: { label: "Требует актуализации", className: "bg-rose-100 text-rose-700" },
  archived: { label: "Архив", className: "bg-slate-200 text-slate-500" },
};

const CONFIDENCE_LABEL: Record<string, string> = {
  low: "низкая",
  medium: "средняя",
  high: "высокая",
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.ai_draft;
  return <Badge className={`text-[10px] h-5 border-0 ${s.className}`}>{s.label}</Badge>;
}

function GroupCard({ proc, onOpen }: { proc: MacroProcess; onOpen: (p: MacroProcess) => void }) {
  const owner = proc.units.find((u) => u.role === "owner");

  return (
    <button
      onClick={() => onOpen(proc)}
      className="text-left border border-slate-200 rounded-xl p-4 bg-white transition-all hover:shadow-md hover:border-slate-300 w-full"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-[10px] font-mono font-bold text-slate-400">{proc.code}</span>
        <StatusBadge status={proc.verification_status} />
      </div>

      <p className="font-semibold text-slate-900 text-sm leading-snug mb-1.5">{proc.name}</p>

      {proc.purpose && (
        <p className="text-xs text-slate-500 leading-relaxed mb-3 line-clamp-2">{proc.purpose}</p>
      )}

      <div className="flex items-center gap-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <Icon name="FileText" size={11} />
          {proc.function_count} функц. из документов
        </span>
        {owner && (
          <span className="flex items-center gap-1 truncate">
            <Icon name="Building2" size={11} />
            {owner.code}
          </span>
        )}
      </div>
    </button>
  );
}

function DetailPanel({ proc, onClose }: { proc: MacroProcess; onClose: () => void }) {
  const [detail, setDetail] = useState<MacroProcess | null>(null);

  useEffect(() => {
    processMapApi.get(proc.id).then((d) => setDetail(d.process)).catch(() => {});
  }, [proc.id]);

  const p = detail || proc;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={onClose}>
      <div className="w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-start justify-between gap-3 z-10">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[11px] font-mono font-bold text-slate-400">{p.code}</span>
              <StatusBadge status={p.verification_status} />
            </div>
            <h2 className="text-lg font-bold text-slate-900 leading-tight">{p.name}</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center flex-shrink-0">
            <Icon name="X" size={17} className="text-slate-500" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          {p.grouping_basis && (
            <div className="border border-amber-200 bg-amber-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon name="TriangleAlert" size={14} className="text-amber-600" />
                <span className="text-sm font-semibold text-slate-900">Основание группировки</span>
                <Badge variant="outline" className="ml-auto text-[10px] h-5 border-amber-300 text-amber-700">
                  уверенность: {CONFIDENCE_LABEL[p.confidence] || p.confidence}
                </Badge>
              </div>
              <p className="text-xs text-amber-900 leading-relaxed">{p.grouping_basis}</p>
            </div>
          )}

          {p.purpose && (
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Предполагаемое назначение</p>
              <p className="text-sm text-slate-700 mt-1">{p.purpose}</p>
              <p className="text-[10px] text-slate-400 mt-2">Формулировка ИИ. Не подтверждена документом.</p>
            </div>
          )}

          {p.archive_reason && (
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
              <div className="flex items-center gap-2 mb-1.5">
                <Icon name="EyeOff" size={13} className="text-slate-500" />
                <span className="text-xs font-semibold text-slate-700">Скрытые сведения</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">{p.archive_reason}</p>
            </div>
          )}

          {p.units && p.units.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Организационные единицы — источник: положение о подразделении
              </p>
              <div className="space-y-1.5">
                {p.units.map((u) => (
                  <div key={u.code} className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">
                    <span className="text-[10px] font-mono text-slate-400 w-10 flex-shrink-0">{u.code}</span>
                    <span className="text-xs text-slate-700 flex-1 leading-tight">{u.name}</span>
                    {u.role === "owner" && (
                      <Badge className="text-[9px] h-4 px-1.5 bg-blue-100 text-blue-700 border-0 flex-shrink-0">владелец</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {p.functions && p.functions.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Функции из документов ({p.functions.length})
              </p>
              <div className="space-y-1.5">
                {p.functions.map((f) => (
                  <div key={f.id} className="border border-slate-200 rounded-lg px-3 py-2">
                    <p className="text-xs text-slate-700 leading-snug">{f.title}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {f.source_section && (
                        <span className="text-[9px] font-mono text-slate-400">п. {f.source_section}</span>
                      )}
                      <span className="text-[9px] text-slate-400">
                        связь: {f.link_basis === "org_unit_inference" ? "по оргединице (гипотеза)" : f.link_basis}
                      </span>
                      {!f.is_confirmed && (
                        <span className="text-[9px] text-amber-600">не подтверждена</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProcessMapPage() {
  const [processes, setProcesses] = useState<MacroProcess[]>([]);
  const [summary, setSummary] = useState<ProcessMapSummary | null>(null);
  const [uncovered, setUncovered] = useState<UncoveredFunction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MacroProcess | null>(null);
  const [showUncovered, setShowUncovered] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const projects = await projectsApi.list();
      const list = (projects as { projects?: { id: number; workspace_mode?: string }[] })?.projects || [];
      const polygon = list.find((p) => p.workspace_mode === "polygon") || list[0];
      if (!polygon) {
        setLoading(false);
        return;
      }
      const d = await processMapApi.list(polygon.id);
      setProcesses(d.processes || []);
      setSummary(d.summary || null);
      setUncovered(d.uncovered_functions || []);
    } catch (e) {
      toast({ title: "Ошибка загрузки", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const core = processes.filter((p) => p.stage === "core");
  const enabling = processes.filter((p) => p.stage === "enabling");

  return (
    <Layout>
      <div className="px-4 lg:px-6 py-6 max-w-6xl mx-auto space-y-5">

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center flex-shrink-0">
            <Icon name="FileSearch" size={20} className="text-slate-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">
              Черновая карта деятельности Департамента финансового мониторинга
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Функции из положения о подразделении с неподтверждённой группировкой
            </p>
          </div>
        </div>

        <div className="border-2 border-amber-300 bg-amber-50 rounded-xl px-4 py-3.5">
          <div className="flex items-start gap-2.5">
            <Icon name="TriangleAlert" size={17} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900 leading-relaxed">
              <p className="font-semibold mb-1">Это не карта процессов, а черновая AI-гипотеза</p>
              <p className="text-xs">
                Функции извлечены из положения о подразделении. Группировка выполнена механически
                по владеющей организационной единице. Реальные последовательности действий,
                инициирующие события, контрольные точки и потребители результата не восстанавливались.
                Требуется проверка владельцами деятельности.
              </p>
              <p className="text-xs mt-1.5">
                Ранее показанные описания текущего состояния были сформированы из типовой банковской
                практики и убраны из представления — они не отражают фактическое положение дел
                в организации.
              </p>
            </div>
          </div>
        </div>

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <div className="border border-slate-200 rounded-xl px-3 py-2.5 bg-white">
              <p className="text-lg font-bold text-slate-900">{summary.functions_total}</p>
              <p className="text-[11px] text-slate-500 leading-tight">функций из документов</p>
            </div>
            <div className="border border-slate-200 rounded-xl px-3 py-2.5 bg-white">
              <p className="text-lg font-bold text-slate-900">{summary.functions_covered}</p>
              <p className="text-[11px] text-slate-500 leading-tight">попало в группировку</p>
            </div>
            <button
              onClick={() => setShowUncovered((v) => !v)}
              className={`border rounded-xl px-3 py-2.5 text-left transition-colors ${
                summary.functions_uncovered > 0
                  ? "border-rose-200 bg-rose-50 hover:bg-rose-100"
                  : "border-slate-200 bg-white"
              }`}
            >
              <p className={`text-lg font-bold ${summary.functions_uncovered > 0 ? "text-rose-600" : "text-slate-900"}`}>
                {summary.functions_uncovered}
              </p>
              <p className="text-[11px] text-slate-500 leading-tight">не вошло никуда</p>
            </button>
            <div className="border border-slate-200 rounded-xl px-3 py-2.5 bg-white">
              <p className="text-lg font-bold text-emerald-600">{summary.confirmed_groups}</p>
              <p className="text-[11px] text-slate-500 leading-tight">
                подтверждено из {summary.total}
              </p>
            </div>
          </div>
        )}

        {summary && summary.multi_assigned > 0 && (
          <p className="text-[11px] text-slate-500">
            <Icon name="Info" size={11} className="inline mr-1" />
            {summary.multi_assigned} связей приходится на функции, отнесённые более чем к одной группе —
            это следствие механической группировки и требует разбора.
          </p>
        )}

        {showUncovered && uncovered.length > 0 && (
          <div className="border border-rose-200 rounded-xl bg-rose-50/50 p-4">
            <p className="text-xs font-semibold text-rose-700 mb-2.5">
              Функции, не вошедшие ни в одну группу ({uncovered.length})
            </p>
            <div className="space-y-1.5">
              {uncovered.map((f) => (
                <div key={f.id} className="text-xs text-slate-700 bg-white rounded-lg px-3 py-2 leading-snug">
                  {f.title}
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => <div key={i} className="h-32 bg-slate-100 rounded-xl animate-pulse" />)}
          </div>
        ) : processes.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl">
            <Icon name="FileSearch" size={30} className="text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">Данные пока не загружены</p>
          </div>
        ) : (
          <>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                Предполагаемые группы функций — основная деятельность
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {core.map((p) => <GroupCard key={p.id} proc={p} onOpen={setSelected} />)}
              </div>
            </div>

            {enabling.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  Предполагаемые группы функций — обеспечивающая деятельность
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {enabling.map((p) => <GroupCard key={p.id} proc={p} onOpen={setSelected} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {selected && <DetailPanel proc={selected} onClose={() => setSelected(null)} />}
    </Layout>
  );
}
