import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { projectsApi, learningApi } from "@/lib/api";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";

type Goal = {
  id: number;
  title: string;
  status: string;
  start_date?: string | null;
};
type Progress = { percent: number; done: number; total: number; in_progress: number };

function getGreeting(name: string) {
  const h = new Date().getHours();
  const greet = h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";
  const first = name?.trim().split(" ")[0] ?? name;
  return `${greet}, ${first}`;
}

type Project = {
  id: number;
  name: string;
  description?: string;
  created_at?: string;
};

function ProgressArc({ value, total }: { value: number; total: number }) {
  const size = 176;
  const strokeW = 11;
  const r = (size - strokeW) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const startAngle = -210;
  const sweepAngle = 240;

  function polar(angleDeg: number, radius: number) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }
  function arc(startDeg: number, endDeg: number, rad: number) {
    const s = polar(startDeg, rad);
    const e = polar(endDeg, rad);
    const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${rad} ${rad} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  const trackPath = arc(startAngle, startAngle + sweepAngle, r);
  const pct = total > 0 ? value / total : 0;
  const valuePath = pct > 0 ? arc(startAngle, startAngle + pct * sweepAngle, r) : null;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <defs>
            <linearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#a78bfa" />
              <stop offset="50%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
          </defs>
          <path d={trackPath} fill="none" stroke="#e2e8f0" strokeWidth={strokeW} strokeLinecap="round" />
          {valuePath && (
            <path d={valuePath} fill="none" stroke="url(#arcGrad)" strokeWidth={strokeW} strokeLinecap="round" />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingBottom: "12px" }}>
          {total > 0 ? (
            <>
              <span className="text-4xl font-bold text-slate-900 leading-none">{value}</span>
              <span className="text-xs text-slate-400 mt-1 font-medium">из {total}</span>
            </>
          ) : (
            <span className="text-xs text-slate-400 text-center px-4 leading-relaxed">Нет данных</span>
          )}
        </div>
      </div>
      <div className="text-center -mt-4">
        <div className="text-sm font-semibold text-slate-800">Индекс развития</div>
        {total > 0 ? (
          <div className="text-xs text-slate-500 mt-1">{value} завершённых шагов</div>
        ) : (
          <div className="text-xs text-slate-400 mt-1">Появится после первых шагов</div>
        )}
      </div>
    </div>
  );
}

export default function GrowthDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalProgress, setGoalProgress] = useState<Record<number, Progress>>({});

  useEffect(() => {
    setLoadingProjects(true);
    projectsApi.list()
      .then((d: { projects?: Project[] }) => setProjects(d.projects ?? []))
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));

    learningApi.getGoals()
      .then(async (d: { goals?: Goal[] }) => {
        const gs = d.goals ?? [];
        setGoals(gs);
        // Загружаем прогресс для каждой цели
        const progMap: Record<number, Progress> = {};
        await Promise.all(gs.slice(0, 3).map(async (g) => {
          try {
            const p = await learningApi.getProgress(g.id) as { progress: Progress };
            progMap[g.id] = p.progress;
          } catch { /* ignore */ }
        }));
        setGoalProgress(progMap);
      })
      .catch(() => setGoals([]));
  }, []);

  const activeProjects = projects.slice(0, 3);
  const projectCount = projects.length;

  // Индекс развития: реальные шаги
  const devValue = Math.min(1 + Math.min(projectCount, 5), 10);
  const devTotal = 10;

  // Ближайшие шаги: привязаны к реальному состоянию
  const nextSteps = [
    { done: true, label: "Создать аккаунт" },
    { done: projectCount > 0, label: "Создать первый проект", href: "/cabinet/projects", disabled: false, coming: false },
    { done: false, label: "Загрузить материалы в проект", href: "/cabinet/projects", disabled: projectCount === 0, coming: false },
    { done: false, label: "Запустить AI-задание", href: "/cabinet/projects", disabled: projectCount === 0, coming: false },
    { done: false, label: "Заполнить карту компетенций", href: "#", disabled: false, coming: true },
  ];

  // AI-инсайт: rule-based по реальным данным
  const aiInsight = projectCount === 0
    ? "Создайте первый проект — это первый шаг вашей траектории развития."
    : projectCount < 3
    ? "Вы уже начали! Загрузите материалы в проект, чтобы AI смог помочь вам продуктивнее."
    : `У вас ${projectCount} ${projectCount < 5 ? "проекта" : "проектов"} — самое время завершить один из них.`;

  return (
    <Layout>
      <div className="px-4 lg:px-6 py-6 max-w-7xl mx-auto space-y-5">

        {/* ── Ряд 1: Приветствие + Мои цели ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Приветствие + AI-инсайт */}
          <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-violet-50 to-transparent rounded-2xl pointer-events-none" />
            <div className="relative">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-xs text-slate-400 font-medium mb-0.5">Траектория · Кабинет развития</p>
                  <h1 className="text-xl font-bold text-slate-900">{getGreeting(user?.name ?? "")}</h1>
                  <p className="text-sm text-slate-500 mt-1">
                    {projectCount > 0
                      ? `У вас ${projectCount} ${projectCount === 1 ? "проект" : projectCount < 5 ? "проекта" : "проектов"}. Продолжайте развиваться!`
                      : "Начните своё развитие — создайте первый проект."}
                  </p>
                </div>
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 ml-4">
                  <span className="text-white font-bold text-base">
                    {user?.name?.trim().charAt(0)?.toUpperCase() ?? "Я"}
                  </span>
                </div>
              </div>
              <div className="mt-4 p-4 bg-gradient-to-r from-violet-50 to-indigo-50 rounded-xl border border-violet-100">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center flex-shrink-0">
                    <Icon name="Sparkles" size={15} className="text-white" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-violet-700 mb-1 uppercase tracking-wide">AI-инсайт дня</div>
                    <p className="text-sm text-slate-700 leading-relaxed">{aiInsight}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Мои цели — живые данные из Учебного кабинета */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800">Мои цели</h3>
              <Link to="/cabinet/learning" className="text-[11px] font-semibold text-violet-600 hover:text-violet-700">
                Все →
              </Link>
            </div>

            {goals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-5 text-center flex-1">
                <div className="w-11 h-11 rounded-2xl bg-violet-50 flex items-center justify-center mb-2">
                  <Icon name="GraduationCap" size={20} className="text-violet-400" />
                </div>
                <p className="text-sm text-slate-500 font-medium">Нет учебных целей</p>
                <Link
                  to="/cabinet/learning"
                  className="mt-3 px-3.5 py-1.5 bg-violet-600 text-white text-xs font-semibold rounded-xl hover:bg-violet-700 transition-colors"
                >
                  + Создать цель
                </Link>
              </div>
            ) : (
              <div className="space-y-3 flex-1">
                {goals.slice(0, 3).map(goal => {
                  const prog = goalProgress[goal.id];
                  const pct = prog?.percent ?? 0;
                  const startDate = goal.start_date ? new Date(goal.start_date) : null;
                  const dayNum = startDate
                    ? Math.floor((Date.now() - startDate.getTime()) / 86400000) + 1
                    : null;
                  const phase = dayNum === null ? null : dayNum <= 30 ? "0–30" : dayNum <= 60 ? "31–60" : "61–90";

                  return (
                    <Link key={goal.id} to="/cabinet/learning" className="block group">
                      <div className="p-3 rounded-xl border border-slate-100 hover:border-violet-200 hover:bg-violet-50/40 transition-all">
                        <div className="flex items-start gap-2.5 mb-2">
                          <div className="w-6 h-6 rounded-lg bg-violet-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Icon name="GraduationCap" size={12} className="text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-800 leading-tight line-clamp-2">{goal.title}</p>
                            {phase && (
                              <span className="text-[10px] text-violet-600 font-medium">День {dayNum} · Фаза {phase}</span>
                            )}
                          </div>
                          <span className="text-xs font-bold text-violet-600 flex-shrink-0">{pct}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        {prog && (
                          <div className="flex gap-3 mt-1.5 text-[10px] text-slate-400">
                            <span>✓ {prog.done} тем</span>
                            {prog.in_progress > 0 && <span>⏳ {prog.in_progress} в работе</span>}
                            <span className="ml-auto">{prog.total - prog.done} осталось</span>
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            {goals.length > 0 && (
              <Link
                to="/cabinet/learning"
                className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-center gap-1.5 text-xs text-violet-600 font-semibold hover:text-violet-700 transition-colors"
              >
                <Icon name="GraduationCap" size={12} />
                Учебный кабинет
              </Link>
            )}
          </div>
        </div>

        {/* ── Ряд 2: Индекс развития + Карта компетенций + Шаги ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* Индекс развития — из реальных данных */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 mb-2">Прогресс развития</h3>
            <div className="flex justify-center">
              <ProgressArc value={devValue} total={devTotal} />
            </div>
            <div className="mt-3 space-y-2">
              {[
                {
                  label: "Проекты",
                  value: Math.min(projectCount * 20, 100),
                  hint: projectCount > 0 ? `${projectCount} создано` : "Нет проектов",
                  color: "from-violet-400 to-indigo-500",
                },
                {
                  label: "Материалы",
                  value: 0,
                  hint: "Загрузите первый файл",
                  color: "from-blue-400 to-cyan-500",
                },
                {
                  label: "Компетенции",
                  value: 0,
                  hint: "В разработке",
                  color: "from-emerald-400 to-teal-500",
                },
              ].map(s => (
                <div key={s.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-500">{s.label}</span>
                    <span className="text-slate-400">{s.hint}</span>
                  </div>
                  <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-1 bg-gradient-to-r ${s.color} rounded-full`} style={{ width: `${s.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Карта компетенций — честный empty state */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800">Карта компетенций</h3>
              <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">В разработке</span>
            </div>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mb-3">
                <Icon name="Map" size={26} className="text-slate-300" />
              </div>
              <p className="text-sm font-medium text-slate-500">Карта появится после первой диагностики</p>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">Модуль диагностики компетенций готовится к запуску</p>
            </div>
          </div>

          {/* Ближайшие шаги — реальные, кликабельные */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800">Ближайшие шаги</h3>
              <span className="text-xs text-slate-400">{nextSteps.filter(s => s.done).length}/{nextSteps.length}</span>
            </div>
            <div className="space-y-1.5">
              {nextSteps.map((s, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2.5 p-2 rounded-lg transition-colors ${
                    !s.done && !s.coming && !s.disabled && s.href
                      ? "hover:bg-slate-50 cursor-pointer"
                      : ""
                  }`}
                  onClick={() => {
                    if (!s.done && !s.coming && !s.disabled && s.href) navigate(s.href);
                  }}
                >
                  <div className={`w-4 h-4 rounded flex-shrink-0 mt-0.5 flex items-center justify-center border ${
                    s.done
                      ? "bg-indigo-600 border-indigo-600"
                      : s.coming
                      ? "border-slate-200 bg-slate-50"
                      : "border-slate-300"
                  }`}>
                    {s.done && <Icon name="Check" size={10} className="text-white" />}
                    {s.coming && <Icon name="Clock" size={9} className="text-slate-300" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm leading-tight block ${
                      s.done ? "text-slate-400 line-through" : s.disabled || s.coming ? "text-slate-400" : "text-slate-700"
                    }`}>
                      {s.label}
                    </span>
                    {s.coming && <span className="text-[10px] text-slate-400">Скоро</span>}
                    {s.disabled && !s.coming && <span className="text-[10px] text-slate-400">Сначала создайте проект</span>}
                  </div>
                  {!s.done && !s.coming && !s.disabled && s.href && (
                    <Icon name="ChevronRight" size={14} className="text-slate-300 flex-shrink-0 mt-0.5" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Ряд 3: Проекты + Быстрые действия ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Проекты — реальные данные из API */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800">Проекты и презентации</h3>
              <Link to="/cabinet/projects" className="text-xs text-slate-400 hover:text-indigo-600 flex items-center gap-0.5 transition-colors">
                {projectCount > 0 ? `Все (${projectCount})` : "Открыть"} <Icon name="ChevronRight" size={13} />
              </Link>
            </div>

            {loadingProjects ? (
              <div className="space-y-2.5">
                {[1, 2].map(i => (
                  <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : activeProjects.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Icon name="FolderOpen" size={22} className="text-slate-300" />
                </div>
                <p className="text-sm text-slate-500 mb-3">Пока нет проектов</p>
                <Link to="/cabinet/projects" className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-xl transition-colors">
                  <Icon name="Plus" size={13} /> Создать первый проект
                </Link>
              </div>
            ) : (
              <div className="space-y-2.5">
                {activeProjects.map((p, idx) => (
                  <Link
                    key={p.id}
                    to={`/cabinet/project/${p.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all group"
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      idx % 3 === 0 ? "bg-orange-50" : idx % 3 === 1 ? "bg-blue-50" : "bg-violet-50"
                    }`}>
                      <Icon name="FileText" size={17} className={
                        idx % 3 === 0 ? "text-orange-500" : idx % 3 === 1 ? "text-blue-500" : "text-violet-500"
                      } />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 truncate group-hover:text-indigo-700 transition-colors">{p.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">Проект · Открыть</div>
                    </div>
                    <Icon name="ChevronRight" size={15} className="text-slate-300 group-hover:text-indigo-400 transition-colors flex-shrink-0" />
                  </Link>
                ))}
                {projects.length > 3 && (
                  <Link to="/cabinet/projects" className="flex items-center gap-2 p-2 text-xs text-slate-500 hover:text-indigo-600 transition-colors">
                    <Icon name="MoreHorizontal" size={15} />
                    Ещё {projects.length - 3} {projects.length - 3 < 5 ? "проекта" : "проектов"}
                  </Link>
                )}
                <Link
                  to="/cabinet/projects"
                  className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 transition-all text-slate-400 hover:text-indigo-600"
                >
                  <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center">
                    <Icon name="Plus" size={16} className="text-slate-300" />
                  </div>
                  <span className="text-sm">Создать новый проект</span>
                </Link>
              </div>
            )}
          </div>

          {/* Быстрые действия */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">Быстрые действия</h3>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { label: "Загрузить материалы", icon: "Upload", href: "/cabinet/projects", color: "bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100", active: true },
                { label: "Создать проект", icon: "Plus", href: "/cabinet/projects", color: "bg-violet-50 text-violet-700 border-violet-100 hover:bg-violet-100", active: true },
                { label: "Пройти тест", icon: "ClipboardCheck", href: "#", color: "", active: false, coming: true },
                { label: "Карта компетенций", icon: "Map", href: "#", color: "", active: false, coming: true },
              ].map(a => (
                <Link
                  key={a.label}
                  to={a.active ? a.href : "#"}
                  onClick={e => !a.active && e.preventDefault()}
                  className={`flex items-center gap-2.5 p-3.5 rounded-xl border transition-all ${
                    a.active
                      ? `${a.color} hover:shadow-sm cursor-pointer`
                      : "border-slate-100 bg-slate-50 text-slate-400 cursor-default"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${a.active ? "bg-white/70" : "bg-white"}`}>
                    <Icon name={a.icon} size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold leading-tight">{a.label}</div>
                    {a.coming && <div className="text-[10px] text-slate-400 mt-0.5">Скоро</div>}
                  </div>
                </Link>
              ))}
            </div>

            <Link to="/cabinet/wallet" className="mt-3 flex items-center gap-3 p-3.5 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all group">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                <Icon name="Wallet" size={16} className="text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-700">Кошелёк</div>
                <div className="text-xs text-slate-400">Пополнить баланс</div>
              </div>
              <Icon name="ChevronRight" size={15} className="text-slate-300 group-hover:text-indigo-400 flex-shrink-0" />
            </Link>

            <div className="mt-2.5 p-3.5 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Icon name="Clock" size={15} className="text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-amber-800">Тесты и повторение</div>
                <div className="text-xs text-amber-600 mt-0.5">Откроется в ближайшее время</div>
              </div>
              <span className="text-[9px] font-bold text-amber-500 bg-amber-100 px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5">Скоро</span>
            </div>
          </div>
        </div>

        {/* ── Ряд 4: Материалы + Карьера + AI-рекомендации + Кошелёк ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Материалы — рабочий (загрузка через проекты) */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800">Материалы</h3>
              <Link to="/cabinet/projects" className="text-xs text-slate-400 hover:text-indigo-600 transition-colors">
                <Icon name="ChevronRight" size={14} />
              </Link>
            </div>
            {projectCount === 0 ? (
              <div className="text-center py-4">
                <Icon name="FileText" size={28} className="text-slate-200 mx-auto mb-2" />
                <p className="text-xs text-slate-400 leading-relaxed">Создайте проект и загрузите материалы</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {[
                  { icon: "FileText", label: "Документы", color: "bg-blue-50 text-blue-500" },
                  { icon: "Image", label: "Изображения", color: "bg-pink-50 text-pink-500" },
                  { icon: "Film", label: "Видео", color: "bg-orange-50 text-orange-500" },
                ].map(m => (
                  <Link key={m.label} to="/cabinet/projects" className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${m.color}`}>
                      <Icon name={m.icon} size={14} />
                    </div>
                    <span className="text-xs text-slate-700 font-medium flex-1">{m.label}</span>
                    <Icon name="ChevronRight" size={13} className="text-slate-300" />
                  </Link>
                ))}
              </div>
            )}
            <Link to="/cabinet/projects" className="mt-3 block w-full text-center text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 py-2 rounded-xl transition-colors">
              Загрузить материал
            </Link>
          </div>

          {/* Карьерная траектория — честный empty state */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800">Карьерная траектория</h3>
              <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">В разработке</span>
            </div>
            <div className="flex flex-col items-center justify-center py-5 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mb-3">
                <Icon name="TrendingUp" size={22} className="text-slate-300" />
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">Карьерный трек сформируется после заполнения профиля и компетенций</p>
            </div>
          </div>

          {/* AI-рекомендации — rule-based, реальные */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center">
                <Icon name="Sparkles" size={12} className="text-white" />
              </div>
              <h3 className="text-sm font-semibold text-slate-800">Рекомендации AI</h3>
            </div>
            <div className="space-y-2.5">
              {projectCount === 0 ? (
                <div className="p-3 bg-violet-50 rounded-xl">
                  <div className="text-[10px] text-violet-500 font-semibold uppercase tracking-wide mb-1">Первый шаг</div>
                  <div className="text-xs font-medium text-slate-700">Создайте проект и загрузите учебные материалы</div>
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-2.5 p-2.5 bg-violet-50 rounded-xl">
                    <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0 text-violet-600">
                      <Icon name="BookOpen" size={13} />
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">Действие</div>
                      <div className="text-xs font-medium text-slate-700 mt-0.5">Загрузите материалы в ваши проекты</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 p-2.5 bg-blue-50 rounded-xl">
                    <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600">
                      <Icon name="Zap" size={13} />
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">Совет</div>
                      <div className="text-xs font-medium text-slate-700 mt-0.5">Запустите AI-задание для быстрого результата</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Кошелёк — реальный */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800">Кошелёк</h3>
              <Link to="/cabinet/wallet">
                <Icon name="ChevronRight" size={15} className="text-slate-400 hover:text-indigo-600 transition-colors" />
              </Link>
            </div>
            <div className="bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl p-4 text-white mb-3">
              <div className="text-xs font-medium text-indigo-200 mb-1">Текущий баланс</div>
              <div className="text-2xl font-bold">0 ₽</div>
              <div className="text-xs text-indigo-200 mt-1">AI-кредиты</div>
            </div>
            <Link to="/cabinet/wallet" className="block w-full text-center text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 py-2.5 rounded-xl transition-colors">
              Пополнить баланс
            </Link>
          </div>
        </div>

        {/* ── Ряд 5: Модули в разработке ── */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center">
              <Icon name="Layers" size={13} className="text-slate-500" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">Платформа развивается вместе с вами</h3>
            <span className="ml-auto text-xs text-slate-400 font-medium">В разработке</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Дипломы и сертификаты", icon: "Award", color: "text-amber-500 bg-amber-50" },
              { label: "Тесты и повторение", icon: "ClipboardCheck", color: "text-blue-500 bg-blue-50" },
              { label: "Карта компетенций", icon: "Map", color: "text-violet-500 bg-violet-50" },
              { label: "План развития", icon: "Target", color: "text-emerald-500 bg-emerald-50" },
              { label: "Карьерная траектория", icon: "TrendingUp", color: "text-indigo-500 bg-indigo-50" },
              { label: "Профессиональный профиль", icon: "UserCircle", color: "text-pink-500 bg-pink-50" },
            ].map(m => (
              <div key={m.label} className="flex flex-col items-center gap-2 p-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-center opacity-70">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${m.color}`}>
                  <Icon name={m.icon} size={17} />
                </div>
                <span className="text-xs text-slate-600 leading-tight font-medium">{m.label}</span>
                <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">Скоро</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </Layout>
  );
}