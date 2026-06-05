import { useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";

type EditableBlockProps = {
  title: string;
  icon: string;
  iconColor: string;
  content: string;
  placeholder: string;
  onChange: (v: string) => void;
};

function EditableBlock({ title, icon, iconColor, content, placeholder, onChange }: EditableBlockProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);

  function save() {
    onChange(draft);
    setEditing(false);
  }

  function cancel() {
    setDraft(content);
    setEditing(false);
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-800">
        <div className="flex items-center gap-2.5">
          <Icon name={icon} size={15} className={iconColor} />
          <span className="text-sm font-semibold text-white">{title}</span>
        </div>
        {!editing && (
          <button
            onClick={() => { setDraft(content); setEditing(true); }}
            className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
          >
            <Icon name="Pencil" size={12} />
            Редактировать
          </button>
        )}
      </div>
      <div className="px-5 py-4">
        {editing ? (
          <>
            <textarea
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder={placeholder}
              rows={5}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 resize-y focus:outline-none focus:border-violet-600 transition-colors"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={save}
                className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Сохранить
              </button>
              <button
                onClick={cancel}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs font-semibold rounded-lg transition-colors"
              >
                Отмена
              </button>
            </div>
          </>
        ) : (
          <p className={`text-sm leading-relaxed whitespace-pre-wrap ${content ? "text-gray-300" : "text-gray-600 italic"}`}>
            {content || placeholder}
          </p>
        )}
      </div>
    </div>
  );
}

type GoalStatus = "on_track" | "at_risk" | "done" | "planned";
type Goal = { id: string; title: string; horizon: string; status: GoalStatus; };

const STATUS_CFG: Record<GoalStatus, { label: string; color: string }> = {
  on_track: { label: "В плане",      color: "bg-emerald-900/50 text-emerald-400 border-emerald-800" },
  at_risk:  { label: "Под угрозой",  color: "bg-amber-900/50 text-amber-400 border-amber-800" },
  done:     { label: "Достигнута",   color: "bg-blue-900/50 text-blue-400 border-blue-800" },
  planned:  { label: "Планируется",  color: "bg-gray-800 text-gray-500 border-gray-700" },
};

type Decision = { id: string; what: string; why: string; date: string; };
type Risk = { id: string; title: string; impact: "high" | "medium" | "low"; mitigation: string; };

const IMPACT_CFG = {
  high:   { label: "Высокий",  color: "text-red-400 bg-red-900/40 border-red-800" },
  medium: { label: "Средний",  color: "text-amber-400 bg-amber-900/40 border-amber-800" },
  low:    { label: "Низкий",   color: "text-emerald-400 bg-emerald-900/40 border-emerald-800" },
};

const INIT_GOALS: Goal[] = [
  { id: "g1", title: "Сделать «Обучение» ежедневным рабочим инструментом", horizon: "Июль 2026", status: "on_track" },
  { id: "g2", title: "Запустить Штаб как единую точку ясности по проекту",  horizon: "Июль 2026", status: "on_track" },
  { id: "g3", title: "Подготовить шаблоны для новой роли CDO",              horizon: "Август 2026", status: "planned" },
  { id: "g4", title: "Запустить Навигатор развития (карта компетенций)",     horizon: "Сентябрь 2026", status: "planned" },
];

const INIT_DECISIONS: Decision[] = [
  { id: "d1", what: "Начать с дисциплины, а не с новых фич", why: "Было слишком много «сделали, но не видно». Сначала стабилизация — потом расширение.", date: "05.06.2026" },
  { id: "d2", what: "Единый источник роутов (routes.ts)",     why: "Мобильное и десктопное меню расходились. Одна точка правды устраняет класс ошибок.", date: "05.06.2026" },
  { id: "d3", what: "Спринты фиксируем в /admin/plan",        why: "Чтобы не было ситуации «сделали — а пользователь не видит». Прозрачность прогресса.", date: "05.06.2026" },
];

const INIT_RISKS: Risk[] = [
  { id: "r1", title: "Фичи выкатываются, но не видны пользователю", impact: "high",   mitigation: "Smoke-checklist после каждого деплоя, фиксация в /admin/plan" },
  { id: "r2", title: "Прогресс на разных экранах расходится",        impact: "medium", mitigation: "Единый helper для расчёта прогресса — один endpoint, один результат" },
  { id: "r3", title: "Объём спринта расползается",                   impact: "medium", mitigation: "Явный backlog с «не берём в этот спринт» — дисциплина скоупа" },
];

export default function AdminStrategyPage() {
  const [vision,   setVision]   = useState("Траектория — персональная платформа для осознанного профессионального роста.\n\nМы строим инструмент, который помогает конкретному человеку войти в новую роль, освоить сложную область и двигаться вперёд каждый день — не теряя фокус и не тратя время на поиск того, «что делать дальше».");
  const [mission,  setMission]  = useState("Сделать так, чтобы каждый день в новой роли был осмысленным: есть фокус, есть прогресс, есть понимание — где я и куда иду.");
  const [scratch,  setScratch]  = useState("");
  const [goals,    setGoals]    = useState<Goal[]>(INIT_GOALS);
  const [decisions]             = useState<Decision[]>(INIT_DECISIONS);
  const [risks]                 = useState<Risk[]>(INIT_RISKS);

  function cycleGoalStatus(id: string) {
    const order: GoalStatus[] = ["planned", "on_track", "at_risk", "done"];
    setGoals(prev => prev.map(g =>
      g.id !== id ? g : { ...g, status: order[(order.indexOf(g.status) + 1) % order.length] }
    ));
  }

  return (
    <AdminShell>
      <div className="p-6 max-w-4xl space-y-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-violet-900 flex items-center justify-center">
              <Icon name="Compass" size={16} className="text-violet-400" />
            </div>
            <h1 className="text-xl font-bold text-white">Стратегия</h1>
          </div>
          <p className="text-gray-500 text-sm ml-11">Видение, цели, решения, риски и место для размышлений</p>
        </div>

        {/* Видение + Миссия */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EditableBlock
            title="Видение"
            icon="Eye"
            iconColor="text-violet-400"
            content={vision}
            placeholder="Зачем мы это строим? Какой результат через год?"
            onChange={setVision}
          />
          <EditableBlock
            title="Миссия"
            icon="Target"
            iconColor="text-blue-400"
            content={mission}
            placeholder="Что мы делаем каждый день и для кого?"
            onChange={setMission}
          />
        </div>

        {/* Стратегические цели */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-800">
            <Icon name="Flag" size={15} className="text-amber-400" />
            <span className="text-sm font-semibold text-white">Стратегические цели</span>
            <span className="ml-auto text-xs text-gray-600">кликни на статус для смены</span>
          </div>
          <div className="divide-y divide-gray-800">
            {goals.map(g => {
              const cfg = STATUS_CFG[g.status];
              return (
                <div key={g.id} className="flex items-center gap-3 px-5 py-3.5">
                  <Icon name="ChevronRight" size={14} className="text-gray-700 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200">{g.title}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{g.horizon}</p>
                  </div>
                  <button
                    onClick={() => cycleGoalStatus(g.id)}
                    className={`flex-shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all ${cfg.color}`}
                  >
                    {cfg.label}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Журнал решений */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-800">
            <Icon name="BookOpen" size={15} className="text-emerald-400" />
            <span className="text-sm font-semibold text-white">Журнал решений</span>
          </div>
          <div className="divide-y divide-gray-800">
            {decisions.map(d => (
              <div key={d.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <p className="text-sm font-semibold text-gray-200">{d.what}</p>
                  <span className="flex-shrink-0 text-[11px] text-gray-600 font-mono">{d.date}</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{d.why}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Риски */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-800">
            <Icon name="AlertTriangle" size={15} className="text-red-400" />
            <span className="text-sm font-semibold text-white">Риски и ограничения</span>
          </div>
          <div className="divide-y divide-gray-800">
            {risks.map(r => {
              const ic = IMPACT_CFG[r.impact];
              return (
                <div key={r.id} className="px-5 py-4 flex items-start gap-3">
                  <span className={`flex-shrink-0 mt-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${ic.color}`}>
                    {ic.label}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-200">{r.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Митигация: {r.mitigation}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Черновик / место для размышлений */}
        <EditableBlock
          title="Место для размышлений"
          icon="PenLine"
          iconColor="text-gray-400"
          content={scratch}
          placeholder="Свободные заметки, гипотезы, идеи, вопросы без ответа..."
          onChange={setScratch}
        />

      </div>
    </AdminShell>
  );
}
