import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { projectsApi } from "@/lib/api";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";

function getGreeting(name: string) {
  const h = new Date().getHours();
  const greet = h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";
  const first = name?.split(" ")[0] ?? name;
  return `${greet}, ${first}`;
}

const SKILLS = [
  { label: "Soft Skills", pct: 0.85, color: "#8b5cf6" },
  { label: "Tech Skills", pct: 0.72, color: "#0ea5e9" },
  { label: "Аналитика", pct: 0.60, color: "#10b981" },
  { label: "Лидерство", pct: 0.68, color: "#f59e0b" },
  { label: "Коммуникация", pct: 0.78, color: "#ec4899" },
];

const QUICK_ACTIONS = [
  { label: "Загрузить материалы", icon: "Upload", href: "/cabinet/projects", color: "bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-100", active: true },
  { label: "Создать проект", icon: "Plus", href: "/cabinet/projects", color: "bg-violet-50 text-violet-600 hover:bg-violet-100 border-violet-100", active: true },
  { label: "Пройти тест", icon: "ClipboardCheck", href: "#", color: "bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-100", active: false },
  { label: "План развития", icon: "Target", href: "#", color: "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border-emerald-100", active: false },
];

const UPCOMING = [
  { label: "Дипломы и сертификаты", icon: "Award", color: "text-amber-500 bg-amber-50" },
  { label: "Тесты и повторение", icon: "ClipboardCheck", color: "text-blue-500 bg-blue-50" },
  { label: "Карта компетенций", icon: "Map", color: "text-violet-500 bg-violet-50" },
  { label: "План развития", icon: "Target", color: "text-emerald-500 bg-emerald-50" },
  { label: "Карьерная траектория", icon: "TrendingUp", color: "text-indigo-500 bg-indigo-50" },
  { label: "Профессиональный профиль", icon: "UserCircle", color: "text-pink-500 bg-pink-50" },
];

function ProgressArc({ value = 68 }: { value?: number }) {
  const size = 180;
  const strokeW = 12;
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
  const valueSweep = (value / 100) * sweepAngle;
  const valuePath = arc(startAngle, startAngle + valueSweep, r);

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
          <path d={valuePath} fill="none" stroke="url(#arcGrad)" strokeWidth={strokeW} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingBottom: "14px" }}>
          <span className="text-4xl font-bold text-slate-900 leading-none">{value}</span>
          <span className="text-xs text-slate-400 mt-1 font-medium">из 100</span>
        </div>
      </div>
      <div className="text-center -mt-4">
        <div className="text-sm font-semibold text-slate-800">Индекс развития</div>
        <div className="flex items-center justify-center gap-1 mt-1">
          <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Icon name="TrendingUp" size={11} /> +4 за месяц
          </span>
        </div>
      </div>
    </div>
  );
}

function RadarChart({ size = 164 }: { size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * 0.72;
  const n = SKILLS.length;

  function pt(i: number, pct: number) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return { x: cx + r * pct * Math.cos(angle), y: cy + r * pct * Math.sin(angle) };
  }

  const polygon = SKILLS.map((s, i) => pt(i, s.pct));
  const grid = [0.25, 0.5, 0.75, 1.0];

  return (
    <svg width={size} height={size} className="mx-auto">
      {grid.map(g => (
        <polygon
          key={g}
          points={Array.from({ length: n }, (_, i) => {
            const p = pt(i, g);
            return `${p.x},${p.y}`;
          }).join(" ")}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="1"
        />
      ))}
      {Array.from({ length: n }, (_, i) => {
        const p = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#e2e8f0" strokeWidth="1" />;
      })}
      <polygon
        points={polygon.map(p => `${p.x},${p.y}`).join(" ")}
        fill="rgba(99,102,241,0.12)"
        stroke="#6366f1"
        strokeWidth="1.5"
      />
      {polygon.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill={SKILLS[i].color} />
      ))}
    </svg>
  );
}

export default function GrowthDashboard() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<{ id: number; name: string; description?: string }[]>([]);

  useEffect(() => {
    projectsApi.list().then((d: { projects?: { id: number; name: string; description?: string }[] }) => {
      setProjects(d.projects?.slice(0, 3) ?? []);
    }).catch(() => {});
  }, []);

  return (
    <Layout>
      <div className="px-4 lg:px-6 py-6 max-w-7xl mx-auto space-y-5">

        {/* ── Ряд 1: Приветствие + AI-инсайт + Мои цели ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Приветствие */}
          <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-violet-50 to-transparent rounded-2xl pointer-events-none" />
            <div className="relative">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-xs text-slate-400 font-medium mb-0.5">Траектория · Кабинет развития</p>
                  <h1 className="text-xl font-bold text-slate-900">{getGreeting(user?.name ?? "")}</h1>
                  <p className="text-sm text-slate-500 mt-1">Ваше развитие продолжается. Сегодня хороший день для нового шага.</p>
                </div>
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 ml-4">
                  <span className="text-white font-bold text-base">
                    {user?.name?.charAt(0)?.toUpperCase() ?? "Я"}
                  </span>
                </div>
              </div>

              {/* AI-инсайт дня */}
              <div className="mt-4 p-4 bg-gradient-to-r from-violet-50 to-indigo-50 rounded-xl border border-violet-100">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center flex-shrink-0">
                    <Icon name="Sparkles" size={15} className="text-white" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-violet-700 mb-1 uppercase tracking-wide">AI-инсайт дня</div>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      Фокус на учебных проектах ускоряет ваш рост на 20%. Рекомендую завершить активный проект и загрузить новые материалы.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Мои цели */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800">Мои цели</h3>
              <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-medium">Скоро</span>
            </div>
            <div className="space-y-3.5">
              {[
                { label: "Освоить новые компетенции", value: 25, color: "bg-gradient-to-r from-violet-400 to-indigo-500" },
                { label: "Завершить 3 проекта", value: 67, color: "bg-gradient-to-r from-blue-400 to-cyan-500" },
                { label: "Пройти 5 тестов", value: 20, color: "bg-gradient-to-r from-emerald-400 to-teal-500" },
              ].map(g => (
                <div key={g.label}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-600 font-medium">{g.label}</span>
                    <span className="text-slate-500 font-semibold">{g.value}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-1.5 ${g.color} rounded-full transition-all`} style={{ width: `${g.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100">
              <button className="w-full text-xs text-violet-600 font-semibold hover:text-violet-800 transition-colors flex items-center justify-center gap-1">
                <Icon name="Plus" size={12} /> Добавить цель
              </button>
            </div>
          </div>
        </div>

        {/* ── Ряд 2: Индекс развития + Карта компетенций + Ближайшие шаги ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* Индекс развития */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-800">Прогресс развития</h3>
            </div>
            <div className="flex justify-center">
              <ProgressArc value={68} />
            </div>
            <div className="mt-3 space-y-2">
              {[
                { label: "Обучение", value: 75, color: "from-violet-400 to-indigo-500" },
                { label: "Проекты", value: 50, color: "from-blue-400 to-cyan-500" },
                { label: "Карьера", value: 80, color: "from-emerald-400 to-teal-500" },
              ].map(s => (
                <div key={s.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-500">{s.label}</span>
                    <span className="text-slate-700 font-semibold">{s.value}%</span>
                  </div>
                  <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-1 bg-gradient-to-r ${s.color} rounded-full`} style={{ width: `${s.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Карта компетенций */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800">Карта компетенций</h3>
              <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-medium">Скоро</span>
            </div>
            <RadarChart size={164} />
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
              {SKILLS.map(s => (
                <div key={s.label} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-xs text-slate-600 truncate">{s.label}</span>
                  <span className="text-xs font-semibold text-slate-800 ml-auto">{Math.round(s.pct * 10)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Ближайшие шаги */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800">Ближайшие шаги</h3>
              <span className="text-xs text-slate-400">4 задачи</span>
            </div>
            <div className="space-y-2.5">
              {[
                { done: true,  label: "Загрузить учебные материалы" },
                { done: true,  label: "Создать проект презентации" },
                { done: false, label: "Пройти микро-тест по теме" },
                { done: false, label: "Обновить план развития" },
                { done: false, label: "Заполнить карту компетенций" },
              ].map((s, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className={`w-4 h-4 rounded flex-shrink-0 mt-0.5 flex items-center justify-center border transition-colors ${
                    s.done ? "bg-indigo-600 border-indigo-600" : "border-slate-300 hover:border-indigo-400"
                  }`}>
                    {s.done && <Icon name="Check" size={10} className="text-white" />}
                  </div>
                  <span className={`text-sm leading-tight ${s.done ? "text-slate-400 line-through" : "text-slate-700"}`}>
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
            <button className="mt-4 w-full text-xs font-semibold text-slate-600 hover:text-indigo-700 border border-slate-200 hover:border-indigo-200 rounded-xl py-2.5 transition-all hover:bg-indigo-50">
              Обновить план развития
            </button>
          </div>
        </div>

        {/* ── Ряд 3: Активные проекты + Быстрые действия ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Активные проекты */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800">Проекты и презентации</h3>
              <Link to="/cabinet/projects" className="text-xs text-slate-400 hover:text-indigo-600 flex items-center gap-0.5 transition-colors">
                Все <Icon name="ChevronRight" size={13} />
              </Link>
            </div>
            {projects.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Icon name="FolderOpen" size={22} className="text-slate-300" />
                </div>
                <p className="text-sm text-slate-500 mb-3">Пока нет активных проектов</p>
                <Link to="/cabinet/projects" className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-xl transition-colors">
                  <Icon name="Plus" size={13} /> Создать первый проект
                </Link>
              </div>
            ) : (
              <div className="space-y-2.5">
                {projects.map((p, idx) => (
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
                      <div className="text-xs text-slate-400 mt-0.5">Презентация · В работе</div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className="text-xs font-bold text-slate-700">50%</div>
                      <div className="w-16 h-1 bg-slate-100 rounded-full mt-1">
                        <div className="w-1/2 h-1 bg-indigo-400 rounded-full" />
                      </div>
                    </div>
                  </Link>
                ))}
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
              {QUICK_ACTIONS.map(a => (
                <Link
                  key={a.label}
                  to={a.active ? a.href : "#"}
                  onClick={e => !a.active && e.preventDefault()}
                  className={`flex items-center gap-2.5 p-3.5 rounded-xl border transition-all ${
                    a.active
                      ? `${a.color} hover:shadow-sm cursor-pointer`
                      : "border-slate-100 bg-slate-50 text-slate-400 opacity-60 cursor-default"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${a.active ? "bg-white/70" : "bg-white"}`}>
                    <Icon name={a.icon} size={16} />
                  </div>
                  <span className="text-xs font-semibold leading-tight">{a.label}</span>
                  {!a.active && (
                    <span className="ml-auto text-[9px] font-bold text-slate-400">Скоро</span>
                  )}
                </Link>
              ))}
            </div>

            {/* Напоминание — тест */}
            <div className="mt-3 p-3.5 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Icon name="Clock" size={15} className="text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-amber-800">Напоминание · Тесты и повторение</div>
                <div className="text-xs text-amber-600 mt-0.5">Раздел откроется в ближайшее время</div>
              </div>
              <span className="text-[9px] font-bold text-amber-500 bg-amber-100 px-2 py-0.5 rounded-full flex-shrink-0">Скоро</span>
            </div>
          </div>
        </div>

        {/* ── Ряд 4: Материалы + Карьерный вектор + AI-рекомендации + Кошелёк ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Материалы и документы */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800">Материалы</h3>
              <Link to="/cabinet/projects" className="text-xs text-slate-400 hover:text-indigo-600 transition-colors">
                <Icon name="ChevronRight" size={14} />
              </Link>
            </div>
            <div className="space-y-2">
              {[
                { icon: "FileText", label: "Документы", count: "—", color: "bg-blue-50 text-blue-500" },
                { icon: "Image", label: "Изображения", count: "—", color: "bg-pink-50 text-pink-500" },
                { icon: "Video", label: "Видео", count: "—", color: "bg-orange-50 text-orange-500" },
              ].map(m => (
                <div key={m.label} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${m.color}`}>
                    <Icon name={m.icon} size={14} />
                  </div>
                  <span className="text-xs text-slate-700 font-medium flex-1">{m.label}</span>
                  <span className="text-xs text-slate-400">{m.count}</span>
                </div>
              ))}
            </div>
            <Link to="/cabinet/projects" className="mt-3 block w-full text-center text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 py-2 rounded-xl transition-colors">
              Загрузить материал
            </Link>
          </div>

          {/* Карьерный вектор */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm relative">
            <div className="absolute top-4 right-4">
              <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Скоро</span>
            </div>
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Карьерная траектория</h3>
            <div className="space-y-2.5">
              {[
                { label: "Специалист", done: true, pct: 100 },
                { label: "Старший специалист", done: false, pct: 40 },
                { label: "Руководитель", done: false, pct: 0 },
              ].map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.done ? "bg-indigo-500" : "bg-slate-200"}`} />
                  <div className="flex-1">
                    <div className="text-xs text-slate-600 mb-1">{s.label}</div>
                    <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-1 bg-gradient-to-r from-indigo-400 to-violet-500 rounded-full" style={{ width: `${s.pct}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">Трек формируется на основе ваших компетенций и целей</p>
          </div>

          {/* AI-рекомендации */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center">
                <Icon name="Sparkles" size={12} className="text-white" />
              </div>
              <h3 className="text-sm font-semibold text-slate-800">Рекомендации AI</h3>
            </div>
            <div className="space-y-2.5">
              {[
                { type: "Курс", title: "Эмоциональный интеллект для лидеров", icon: "BookOpen", color: "bg-violet-50 text-violet-600" },
                { type: "Статья", title: "Тренды AI и обучение в 2026", icon: "FileText", color: "bg-blue-50 text-blue-600" },
                { type: "Практика", title: "Завершить проект до конца недели", icon: "Target", color: "bg-emerald-50 text-emerald-600" },
              ].map((r, i) => (
                <div key={i} className="flex items-start gap-2.5 p-2.5 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${r.color}`}>
                    <Icon name={r.icon} size={13} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">{r.type}</div>
                    <div className="text-xs font-medium text-slate-700 leading-snug mt-0.5">{r.title}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Кошелёк */}
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
            <Link
              to="/cabinet/wallet"
              className="block w-full text-center text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 py-2.5 rounded-xl transition-colors"
            >
              Пополнить баланс
            </Link>
          </div>
        </div>

        {/* ── Ряд 5: В разработке (честный план-раздел) ── */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center">
              <Icon name="Layers" size={13} className="text-slate-500" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">Платформа развивается вместе с вами</h3>
            <span className="ml-auto text-xs text-slate-400 font-medium">В разработке</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {UPCOMING.map(m => (
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
