import Icon from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";

type DeptFunction = {
  id: number;
  dept_name: string;
  title: string;
  description: string;
  goals: string;
  category: string;
  priority: number;
};

type AutomationRecord = {
  function_id: number;
  function_title: string;
  dept_name: string;
  category: string;
  current_status: string;
  ai_potential_score: number;
};

const CATEGORY_CONFIG: Record<string, { label: string; bg: string; border: string; icon: string }> = {
  regulatory:    { label: "Нормативная",  bg: "bg-purple-50",  border: "border-purple-200", icon: "Scale" },
  operational:   { label: "Операционная", bg: "bg-blue-50",    border: "border-blue-200",   icon: "Settings2" },
  analytical:    { label: "Аналитическая",bg: "bg-amber-50",   border: "border-amber-200",  icon: "BarChart3" },
  communication: { label: "Коммуникации", bg: "bg-green-50",   border: "border-green-200",  icon: "MessageSquare" },
  control:       { label: "Контроль",     bg: "bg-red-50",     border: "border-red-200",    icon: "ShieldCheck" },
  planning:      { label: "Планирование", bg: "bg-indigo-50",  border: "border-indigo-200", icon: "Calendar" },
};

const STATUS_DOT: Record<string, string> = {
  manual:    "bg-red-400",
  partial:   "bg-amber-400",
  automated: "bg-green-400",
  planned:   "bg-blue-400",
};

type Props = {
  functions: DeptFunction[];
  automation: AutomationRecord[];
};

export default function DeptProcessMapTab({ functions, automation }: Props) {
  const autoByFuncId = automation.reduce<Record<number, AutomationRecord>>((acc, a) => {
    acc[a.function_id] = a;
    return acc;
  }, {});

  const grouped = functions.reduce<Record<string, DeptFunction[]>>((acc, f) => {
    const key = f.category || "operational";
    if (!acc[key]) acc[key] = [];
    acc[key].push(f);
    return acc;
  }, {});

  const depts = Array.from(new Set(functions.map(f => f.dept_name || "Без подразделения")));

  const totalFunctions = functions.length;
  const automatedCount = automation.filter(a => a.current_status === "automated").length;
  const highPotential = automation.filter(a => a.ai_potential_score >= 7).length;

  if (functions.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Icon name="Network" size={48} className="mx-auto mb-3 opacity-25" />
        <p className="font-medium">Карта пуста</p>
        <p className="text-sm mt-1">Добавь функции во вкладке «Функции» — здесь появится визуальная карта</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Легенда и статистика */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-4 border border-slate-200 rounded-xl px-4 py-2.5 bg-white text-sm">
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />Ручной</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />Частично</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" />Автоматизирован</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block" />Планируется</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="border border-slate-200 rounded-xl px-3 py-2 bg-white text-center text-sm">
            <span className="font-bold text-slate-800">{totalFunctions}</span>
            <span className="text-muted-foreground ml-1">функций</span>
          </div>
          <div className="border border-slate-200 rounded-xl px-3 py-2 bg-white text-center text-sm">
            <span className="font-bold text-green-600">{automatedCount}</span>
            <span className="text-muted-foreground ml-1">автоматизировано</span>
          </div>
          <div className="border border-slate-200 rounded-xl px-3 py-2 bg-white text-center text-sm">
            <span className="font-bold text-amber-600">{highPotential}</span>
            <span className="text-muted-foreground ml-1">высокий AI-потенциал</span>
          </div>
        </div>
      </div>

      {/* Карта по подразделениям */}
      {depts.length > 1 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">По подразделениям</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {depts.map(dept => {
              const deptFuncs = functions.filter(f => (f.dept_name || "Без подразделения") === dept);
              const deptAuto = deptFuncs.map(f => autoByFuncId[f.id]).filter(Boolean);
              const autoCount = deptAuto.filter(a => a.current_status === "automated").length;
              const pct = deptFuncs.length ? Math.round(autoCount / deptFuncs.length * 100) : 0;
              return (
                <div key={dept} className="border border-slate-200 rounded-xl p-3 bg-white">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-semibold text-slate-800 leading-tight">{dept}</p>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{deptFuncs.length} функц.</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">{pct}% автоматизировано</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Карта по категориям */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">По категориям функций</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(grouped).map(([category, fns]) => {
            const cfg = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.operational;
            return (
              <div key={category} className={`border ${cfg.border} rounded-xl p-4 ${cfg.bg}`}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon name={cfg.icon as "Scale"} size={15} className="text-slate-600" />
                  <span className="text-sm font-semibold text-slate-700">{cfg.label}</span>
                  <Badge className="text-xs ml-auto border-0 bg-white/60">{fns.length}</Badge>
                </div>
                <div className="space-y-2">
                  {fns.map(fn => {
                    const auto = autoByFuncId[fn.id];
                    const dot = auto ? STATUS_DOT[auto.current_status] || "bg-slate-300" : "bg-slate-200";
                    const score = auto?.ai_potential_score ?? 0;
                    return (
                      <div key={fn.id} className="flex items-center gap-2 bg-white/70 rounded-lg px-3 py-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                        <span className="text-sm text-slate-700 flex-1 leading-tight">{fn.title}</span>
                        {score > 0 && (
                          <span className={`text-xs font-bold flex-shrink-0 ${score >= 7 ? "text-green-600" : score >= 4 ? "text-amber-600" : "text-slate-400"}`}>
                            AI:{score}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* TOP по AI-потенциалу */}
      {automation.some(a => a.ai_potential_score > 0) && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Приоритеты автоматизации (по AI-оценке)</p>
          <div className="space-y-2">
            {[...automation]
              .filter(a => a.ai_potential_score > 0)
              .sort((a, b) => b.ai_potential_score - a.ai_potential_score)
              .slice(0, 5)
              .map((a, i) => (
                <div key={a.function_id} className="flex items-center gap-3 border border-slate-200 rounded-xl px-4 py-2.5 bg-white">
                  <span className="text-sm font-bold text-slate-400 w-4">{i + 1}</span>
                  <span className="text-sm text-slate-700 flex-1">{a.function_title}</span>
                  <div className="flex items-center gap-1.5 w-28">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${a.ai_potential_score >= 7 ? "bg-green-500" : a.ai_potential_score >= 4 ? "bg-amber-500" : "bg-red-400"}`}
                        style={{ width: `${a.ai_potential_score * 10}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-slate-600">{a.ai_potential_score}/10</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
