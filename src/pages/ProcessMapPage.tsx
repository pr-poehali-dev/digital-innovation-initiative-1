import { useState, useEffect, useCallback } from "react";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { processMapApi, projectsApi, type MacroProcess, type ProcessMapSummary } from "@/lib/api";

type ViewMode = "current" | "target";

const MATURITY_LABEL: Record<number, string> = {
  1: "Ручной",
  2: "Частично",
  3: "Автоматизирован",
  4: "Интеллектуальный",
};

function maturityColor(level: number) {
  if (level >= 4) return "bg-emerald-500";
  if (level === 3) return "bg-blue-500";
  if (level === 2) return "bg-amber-500";
  return "bg-rose-500";
}

function MaturityBar({ current, target, mode }: { current: number; target: number; mode: ViewMode }) {
  const value = mode === "current" ? current : target;
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4].map((lvl) => (
        <span
          key={lvl}
          className={`h-1.5 flex-1 rounded-full transition-colors ${
            lvl <= value ? maturityColor(value) : "bg-slate-200"
          }`}
        />
      ))}
      <span className="text-[10px] font-semibold text-slate-500 w-24 text-right flex-shrink-0">
        {MATURITY_LABEL[value]}
      </span>
    </div>
  );
}

function ProcessCard({ proc, mode, onOpen }: { proc: MacroProcess; mode: ViewMode; onOpen: (p: MacroProcess) => void }) {
  const owner = proc.units.find((u) => u.role === "owner");
  const isTarget = mode === "target";

  return (
    <button
      onClick={() => onOpen(proc)}
      className={`text-left border rounded-xl p-4 bg-white transition-all hover:shadow-md w-full ${
        isTarget ? "border-emerald-200 hover:border-emerald-300" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-mono font-bold text-slate-400 flex-shrink-0">{proc.code}</span>
          {proc.stage === "enabling" && (
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 text-slate-500 border-slate-200">
              обеспеч.
            </Badge>
          )}
        </div>
        {proc.ai_potential >= 8 && (
          <Badge className="text-[9px] h-4 px-1.5 bg-violet-100 text-violet-700 border-0 flex-shrink-0">
            AI {proc.ai_potential}
          </Badge>
        )}
      </div>

      <p className="font-semibold text-slate-900 text-sm leading-snug mb-2">{proc.name}</p>

      <p className="text-xs text-slate-600 leading-relaxed mb-3 line-clamp-3">
        {isTarget ? proc.target_state : proc.current_state}
      </p>

      <MaturityBar current={proc.maturity_current} target={proc.maturity_target} mode={mode} />

      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <Icon name="Layers" size={11} />
          {proc.function_count} функц.
        </span>
        {owner && (
          <span className="flex items-center gap-1 truncate">
            <Icon name="Building2" size={11} />
            {owner.code}
          </span>
        )}
        {isTarget && proc.gap > 0 && (
          <span className="ml-auto flex items-center gap-1 text-emerald-600 font-semibold flex-shrink-0">
            <Icon name="TrendingUp" size={11} />+{proc.gap}
          </span>
        )}
      </div>
    </button>
  );
}

function DetailPanel({ proc, mode, onClose }: { proc: MacroProcess; mode: ViewMode; onClose: () => void }) {
  const [detail, setDetail] = useState<MacroProcess | null>(null);

  useEffect(() => {
    processMapApi.get(proc.id).then((d) => setDetail(d.process)).catch(() => {});
  }, [proc.id]);

  const p = detail || proc;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={onClose}>
      <div
        className="w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-start justify-between gap-3 z-10">
          <div className="min-w-0">
            <span className="text-[11px] font-mono font-bold text-slate-400">{p.code}</span>
            <h2 className="text-lg font-bold text-slate-900 leading-tight">{p.name}</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center flex-shrink-0">
            <Icon name="X" size={17} className="text-slate-500" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          <div className="bg-slate-50 rounded-xl p-4 space-y-2.5">
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Назначение</p>
              <p className="text-sm text-slate-700 mt-0.5">{p.purpose}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Вход</p>
                <p className="text-xs text-slate-600 mt-0.5">{p.trigger_event}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Результат</p>
                <p className="text-xs text-slate-600 mt-0.5">{p.result_output}</p>
              </div>
            </div>
          </div>

          {/* Как есть */}
          <div className={`border rounded-xl p-4 ${mode === "current" ? "border-slate-300 bg-white" : "border-slate-200 bg-slate-50/50"}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-6 rounded-lg bg-slate-200 flex items-center justify-center">
                <Icon name="Circle" size={12} className="text-slate-600" />
              </span>
              <span className="text-sm font-semibold text-slate-900">Как есть сейчас</span>
              <Badge variant="outline" className="ml-auto text-[10px] h-5">
                {MATURITY_LABEL[p.maturity_current]}
              </Badge>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">{p.current_state}</p>
            {p.pain_points && (
              <div className="mt-3 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2.5">
                <p className="text-[10px] font-semibold text-rose-500 uppercase tracking-wide mb-1">Болевые точки</p>
                <p className="text-xs text-rose-900 leading-relaxed">{p.pain_points}</p>
              </div>
            )}
          </div>

          {/* Целевое */}
          <div className={`border rounded-xl p-4 ${mode === "target" ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200 bg-slate-50/50"}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center">
                <Icon name="Target" size={12} className="text-emerald-600" />
              </span>
              <span className="text-sm font-semibold text-slate-900">Целевое состояние</span>
              <Badge className="ml-auto text-[10px] h-5 bg-emerald-100 text-emerald-700 border-0">
                {MATURITY_LABEL[p.maturity_target]}
              </Badge>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">{p.target_state}</p>
            {p.target_effect && (
              <div className="mt-3 bg-white border border-emerald-100 rounded-lg px-3 py-2.5">
                <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide mb-1">Ожидаемый эффект</p>
                <p className="text-xs text-slate-700 leading-relaxed">{p.target_effect}</p>
              </div>
            )}
          </div>

          {/* AI */}
          {p.ai_opportunity && (
            <div className="border border-violet-200 bg-violet-50/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon name="Sparkles" size={14} className="text-violet-600" />
                <span className="text-sm font-semibold text-slate-900">Где применим ИИ</span>
                <Badge className="ml-auto text-[10px] h-5 bg-violet-100 text-violet-700 border-0">
                  потенциал {p.ai_potential}/10
                </Badge>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{p.ai_opportunity}</p>
            </div>
          )}

          {/* Участники */}
          {p.units && p.units.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Участники процесса</p>
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

          {/* Функции */}
          {p.functions && p.functions.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Функции в процессе ({p.functions.length})
              </p>
              <div className="space-y-1">
                {p.functions.slice(0, 12).map((f) => (
                  <div key={f.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50">
                    <span className="text-xs text-slate-600 flex-1 leading-tight">{f.title}</span>
                    {f.ai_score > 0 && (
                      <span className={`text-[10px] font-bold flex-shrink-0 ${f.ai_score >= 7 ? "text-violet-600" : "text-slate-400"}`}>
                        {f.ai_score}
                      </span>
                    )}
                  </div>
                ))}
                {p.functions.length > 12 && (
                  <p className="text-[11px] text-slate-400 px-3 pt-1">и ещё {p.functions.length - 12}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProcessMapPage() {
  const [mode, setMode] = useState<ViewMode>("current");
  const [processes, setProcesses] = useState<MacroProcess[]>([]);
  const [summary, setSummary] = useState<ProcessMapSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MacroProcess | null>(null);

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
    } catch (e) {
      toast({ title: "Ошибка загрузки карты", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const core = processes.filter((p) => p.stage === "core");
  const enabling = processes.filter((p) => p.stage === "enabling");

  return (
    <Layout>
      <div className="px-4 lg:px-6 py-6 max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center flex-shrink-0">
            <Icon name="Network" size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">Карта процессов</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Верхний уровень: макропроцессы подразделения, их состояние и целевая картина
            </p>
          </div>
        </div>

        {/* Mode switch */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => setMode("current")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                mode === "current" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Как есть
            </button>
            <button
              onClick={() => setMode("target")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                mode === "target" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Целевая
            </button>
          </div>
          {summary && (
            <div className="flex gap-2 flex-wrap text-xs">
              <span className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white">
                <b className="text-slate-800">{summary.total}</b> <span className="text-slate-500">процессов</span>
              </span>
              <span className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white">
                <b className="text-slate-800">{summary.functions_total}</b> <span className="text-slate-500">функций внутри</span>
              </span>
              <span className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white">
                <b className="text-violet-600">{summary.high_ai}</b> <span className="text-slate-500">с высоким AI-потенциалом</span>
              </span>
              <span className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white">
                <span className="text-slate-500">зрелость</span> <b className="text-slate-800">{summary.avg_maturity_current}</b>
                <span className="text-slate-400"> → </span>
                <b className="text-emerald-600">{summary.avg_maturity_target}</b>
              </span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => <div key={i} className="h-44 bg-slate-100 rounded-xl animate-pulse" />)}
          </div>
        ) : processes.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl">
            <Icon name="Network" size={30} className="text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">Карта процессов пока не построена</p>
          </div>
        ) : (
          <>
            {/* Основные процессы */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-1 h-4 bg-blue-500 rounded-full" />
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Основные процессы — цепочка создания результата
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {core.map((p) => (
                  <ProcessCard key={p.id} proc={p} mode={mode} onOpen={setSelected} />
                ))}
              </div>
            </div>

            {/* Обеспечивающие */}
            {enabling.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-1 h-4 bg-slate-400 rounded-full" />
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Обеспечивающие процессы
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {enabling.map((p) => (
                    <ProcessCard key={p.id} proc={p} mode={mode} onOpen={setSelected} />
                  ))}
                </div>
              </div>
            )}

            <p className="text-[11px] text-slate-400 pt-2">
              Нажмите на процесс, чтобы увидеть детали, болевые точки, целевое состояние и функции внутри.
              Данные собраны из положений о подразделении и требуют вашей проверки.
            </p>
          </>
        )}
      </div>

      {selected && <DetailPanel proc={selected} mode={mode} onClose={() => setSelected(null)} />}
    </Layout>
  );
}