import { useState } from "react";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";

type DeptFunction = {
  id: number;
  dept_name: string;
  title: string;
  description: string;
  goals: string;
  category: string;
};

type AutomationRecord = {
  function_id: number;
  function_title: string;
  current_status: string;
  ai_potential_score: number;
  ai_recommendation: string;
  implementation_horizon: string;
};

type Props = {
  projectTitle: string;
  functions: DeptFunction[];
  automation: AutomationRecord[];
};

const SLIDES_CONFIG = [
  { id: "title",    label: "Титул" },
  { id: "overview", label: "Обзор" },
  { id: "functions",label: "Функции" },
  { id: "status",   label: "Статус авт." },
  { id: "top",      label: "Приоритеты" },
  { id: "roadmap",  label: "Роадмап" },
];

const STATUS_LABEL: Record<string, string> = {
  manual: "Ручной", partial: "Частично", automated: "Автоматизирован", planned: "Планируется"
};
const HORIZON_LABEL: Record<string, string> = { short: "до 3 мес", medium: "3–12 мес", long: "1–3 года" };

const STATUS_COLOR: Record<string, string> = {
  manual: "#ef4444", partial: "#f59e0b", automated: "#22c55e", planned: "#3b82f6"
};

export default function DeptPresentationTab({ projectTitle, functions, automation }: Props) {
  const [slide, setSlide] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const autoByFuncId = automation.reduce<Record<number, AutomationRecord>>((acc, a) => {
    acc[a.function_id] = a;
    return acc;
  }, {});

  const totalFuncs = functions.length;
  const automatedCount = automation.filter(a => a.current_status === "automated").length;
  const manualCount = automation.filter(a => a.current_status === "manual").length;
  const highPotential = automation.filter(a => a.ai_potential_score >= 7);
  const avgScore = automation.length
    ? (automation.reduce((s, a) => s + a.ai_potential_score, 0) / automation.length).toFixed(1)
    : "—";

  const depts = Array.from(new Set(functions.map(f => f.dept_name).filter(Boolean)));
  const topAuto = [...automation].filter(a => a.ai_potential_score > 0).sort((a, b) => b.ai_potential_score - a.ai_potential_score).slice(0, 5);

  const slides: React.ReactNode[] = [
    // 0 — Титул
    <div key="title" className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mb-6">
        <Icon name="Building2" size={32} className="text-white" />
      </div>
      <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight mb-4">{projectTitle}</h1>
      <p className="text-white/70 text-lg">Цифровая трансформация подразделения</p>
      <div className="mt-8 flex gap-6 text-center">
        <div><p className="text-3xl font-bold text-white">{totalFuncs}</p><p className="text-white/60 text-sm">функций</p></div>
        <div className="w-px bg-white/20" />
        <div><p className="text-3xl font-bold text-white">{depts.length || 1}</p><p className="text-white/60 text-sm">подразделений</p></div>
        <div className="w-px bg-white/20" />
        <div><p className="text-3xl font-bold text-white">{avgScore}</p><p className="text-white/60 text-sm">AI-потенциал</p></div>
      </div>
    </div>,

    // 1 — Обзор
    <div key="overview" className="flex flex-col h-full px-8 py-6">
      <h2 className="text-2xl font-bold text-white mb-6">Ключевые показатели</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Всего функций", value: totalFuncs, color: "bg-white/20" },
          { label: "Автоматизировано", value: automatedCount, color: "bg-green-500/30" },
          { label: "Ручных процессов", value: manualCount, color: "bg-red-500/30" },
          { label: "Высокий AI-потенциал", value: highPotential.length, color: "bg-amber-500/30" },
        ].map(s => (
          <div key={s.label} className={`${s.color} rounded-2xl p-4 text-center`}>
            <p className="text-3xl font-bold text-white">{s.value}</p>
            <p className="text-white/70 text-xs mt-1">{s.label}</p>
          </div>
        ))}
      </div>
      {totalFuncs > 0 && (
        <div className="bg-white/10 rounded-2xl p-4">
          <p className="text-white/70 text-sm mb-3">Уровень автоматизации</p>
          <div className="h-4 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-green-400 rounded-full" style={{ width: `${Math.round(automatedCount / totalFuncs * 100)}%` }} />
          </div>
          <p className="text-white text-sm mt-2 font-medium">{Math.round(automatedCount / totalFuncs * 100)}% процессов автоматизировано</p>
        </div>
      )}
    </div>,

    // 2 — Функции
    <div key="functions" className="flex flex-col h-full px-8 py-6">
      <h2 className="text-2xl font-bold text-white mb-5">Функции подразделения</h2>
      <div className="flex-1 overflow-auto space-y-2 pr-1">
        {functions.slice(0, 10).map(fn => {
          const auto = autoByFuncId[fn.id];
          return (
            <div key={fn.id} className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-2.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: auto ? STATUS_COLOR[auto.current_status] : "#94a3b8" }} />
              <span className="text-white text-sm flex-1">{fn.title}</span>
              {fn.dept_name && <span className="text-white/50 text-xs flex-shrink-0">{fn.dept_name}</span>}
            </div>
          );
        })}
        {functions.length > 10 && <p className="text-white/50 text-sm text-center">...и ещё {functions.length - 10} функций</p>}
      </div>
    </div>,

    // 3 — Статус автоматизации
    <div key="status" className="flex flex-col h-full px-8 py-6">
      <h2 className="text-2xl font-bold text-white mb-6">Текущий статус автоматизации</h2>
      {automation.length === 0 ? (
        <p className="text-white/60">Данные по автоматизации не заполнены</p>
      ) : (
        <div className="space-y-4">
          {Object.entries(STATUS_LABEL).map(([status, label]) => {
            const count = automation.filter(a => a.current_status === status).length;
            const pct = automation.length ? Math.round(count / automation.length * 100) : 0;
            if (count === 0) return null;
            return (
              <div key={status}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-white">{label}</span>
                  <span className="text-white/70">{count} ({pct}%)</span>
                </div>
                <div className="h-3 bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: STATUS_COLOR[status] }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>,

    // 4 — Приоритеты
    <div key="top" className="flex flex-col h-full px-8 py-6">
      <h2 className="text-2xl font-bold text-white mb-5">Приоритеты автоматизации</h2>
      {topAuto.length === 0 ? (
        <p className="text-white/60">Нет данных AI-оценки. Перейди во вкладку «Автоматизация» и нажми «Получить AI-оценку».</p>
      ) : (
        <div className="space-y-3">
          {topAuto.map((a, i) => (
            <div key={a.function_id} className="bg-white/10 rounded-xl px-4 py-3 flex items-center gap-4">
              <span className="text-2xl font-bold text-white/40 w-6">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-sm truncate">{a.function_title}</p>
                <p className="text-white/50 text-xs">{HORIZON_LABEL[a.implementation_horizon]}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xl font-bold text-amber-300">{a.ai_potential_score}/10</p>
                <p className="text-white/50 text-xs">AI-потенциал</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>,

    // 5 — Роадмап
    <div key="roadmap" className="flex flex-col h-full px-8 py-6">
      <h2 className="text-2xl font-bold text-white mb-5">Роадмап внедрения</h2>
      <div className="grid grid-cols-3 gap-4 flex-1">
        {[
          { key: "short", label: "Быстрые победы", sub: "до 3 мес", color: "border-green-400/40 bg-green-500/10" },
          { key: "medium", label: "Среднесрочные", sub: "3–12 мес", color: "border-amber-400/40 bg-amber-500/10" },
          { key: "long", label: "Долгосрочные", sub: "1–3 года", color: "border-blue-400/40 bg-blue-500/10" },
        ].map(col => {
          const items = automation.filter(a => a.implementation_horizon === col.key && a.ai_potential_score > 0);
          return (
            <div key={col.key} className={`border ${col.color} rounded-2xl p-3`}>
              <p className="text-white font-semibold text-sm mb-0.5">{col.label}</p>
              <p className="text-white/50 text-xs mb-3">{col.sub}</p>
              <div className="space-y-2">
                {items.slice(0, 4).map(a => (
                  <div key={a.function_id} className="bg-white/10 rounded-lg px-2 py-1.5">
                    <p className="text-white text-xs leading-tight">{a.function_title}</p>
                  </div>
                ))}
                {items.length === 0 && <p className="text-white/30 text-xs">Нет данных</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>,
  ];

  const SlideWrapper = ({ children }: { children: React.ReactNode }) => (
    <div className="relative w-full rounded-2xl overflow-hidden bg-gradient-to-br from-slate-800 via-slate-900 to-indigo-950"
      style={{ aspectRatio: "16/9", minHeight: 340 }}>
      {children}
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-800 via-slate-900 to-indigo-950 flex flex-col">
        <div className="flex-1 relative">{slides[slide]}</div>
        <div className="flex items-center justify-between px-6 py-3 bg-black/30">
          <div className="flex gap-2">
            {SLIDES_CONFIG.map((s, i) => (
              <button key={s.id} onClick={() => setSlide(i)}
                className={`text-xs px-3 py-1 rounded-full transition-colors ${slide === i ? "bg-white text-slate-900 font-medium" : "text-white/50 hover:text-white"}`}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setSlide(s => Math.max(0, s - 1))} disabled={slide === 0}
              className="text-white/60 hover:text-white disabled:opacity-30">
              <Icon name="ChevronLeft" size={20} />
            </button>
            <span className="text-white/50 text-sm">{slide + 1} / {slides.length}</span>
            <button onClick={() => setSlide(s => Math.min(slides.length - 1, s + 1))} disabled={slide === slides.length - 1}
              className="text-white/60 hover:text-white disabled:opacity-30">
              <Icon name="ChevronRight" size={20} />
            </button>
            <button onClick={() => setFullscreen(false)} className="ml-4 text-white/60 hover:text-white">
              <Icon name="Minimize2" size={18} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-800">Презентация для руководства</h3>
          <p className="text-sm text-muted-foreground">Нажми «На весь экран» для режима показа</p>
        </div>
        <Button onClick={() => setFullscreen(true)} className="gap-2">
          <Icon name="Maximize2" size={14} />
          На весь экран
        </Button>
      </div>

      <SlideWrapper>{slides[slide]}</SlideWrapper>

      <div className="flex items-center justify-between">
        <div className="flex gap-1.5 flex-wrap">
          {SLIDES_CONFIG.map((s, i) => (
            <button key={s.id} onClick={() => setSlide(i)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                slide === i ? "bg-slate-800 text-white border-slate-800" : "border-slate-200 text-muted-foreground hover:border-slate-400"
              }`}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSlide(s => Math.max(0, s - 1))} disabled={slide === 0}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-colors">
            <Icon name="ChevronLeft" size={16} />
          </button>
          <span className="text-sm text-muted-foreground">{slide + 1} / {slides.length}</span>
          <button onClick={() => setSlide(s => Math.min(slides.length - 1, s + 1))} disabled={slide === slides.length - 1}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-colors">
            <Icon name="ChevronRight" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
