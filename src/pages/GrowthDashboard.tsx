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
  return `${greet}, ${first}!`;
}

const COMPETENCIES = [
  { name: "Soft Skills", score: 8.5, color: "#6366f1", max: 10 },
  { name: "Tech Skills", score: 7.2, color: "#0ea5e9", max: 10 },
  { name: "Leadership", score: 6.8, color: "#10b981", max: 10 },
];

const QUICK_ACTIONS = [
  { label: "Загрузить материалы", icon: "Upload", href: "/cabinet", color: "bg-blue-50 text-blue-600 hover:bg-blue-100", active: true },
  { label: "Создать проект", icon: "Plus", href: "/cabinet", color: "bg-orange-50 text-orange-600 hover:bg-orange-100", active: true },
  { label: "Пройти тест", icon: "ClipboardCheck", href: "#", color: "bg-violet-50 text-violet-600 hover:bg-violet-100", active: false },
  { label: "Открыть план развития", icon: "Target", href: "#", color: "bg-green-50 text-green-600 hover:bg-green-100", active: false },
];

const UPCOMING_MODULES = [
  { label: "Дипломы и сертификаты", icon: "Award", desc: "Загрузка и хранение документов об образовании" },
  { label: "Тесты и повторение", icon: "ClipboardCheck", desc: "AI-тесты для поддержания знаний" },
  { label: "Карта компетенций", icon: "Map", desc: "Визуализация ваших навыков и роста" },
  { label: "План развития", icon: "Target", desc: "Персональный трек обучения с AI" },
  { label: "Карьерная траектория", icon: "TrendingUp", desc: "Путь к желаемой профессии" },
  { label: "Профессиональный профиль", icon: "UserCircle", desc: "Ваш публичный профиль для работодателей" },
];

function RadarChart({ size = 160 }: { size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * 0.78;
  const skills = [
    { label: "Leadership", pct: 0.68 },
    { label: "Tech\nskills", pct: 0.72 },
    { label: "Soft\nskills", pct: 0.85 },
    { label: "Soft\nskills", pct: 0.60 },
    { label: "Soft\nskills", pct: 0.75 },
  ];
  const n = skills.length;
  function pt(i: number, pct: number) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return { x: cx + r * pct * Math.cos(angle), y: cy + r * pct * Math.sin(angle) };
  }
  const polygon = skills.map((s, i) => pt(i, s.pct));
  const grid = [0.25, 0.5, 0.75, 1.0];

  return (
    <svg width={size} height={size} className="mx-auto">
      {/* grid */}
      {grid.map(g =>
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
      )}
      {/* axes */}
      {Array.from({ length: n }, (_, i) => {
        const p = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#e2e8f0" strokeWidth="1" />;
      })}
      {/* data */}
      <polygon
        points={polygon.map(p => `${p.x},${p.y}`).join(" ")}
        fill="rgba(99,102,241,0.18)"
        stroke="#6366f1"
        strokeWidth="2"
      />
      {polygon.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#6366f1" />
      ))}
    </svg>
  );
}

function CircleProgress({ value, label, sublabel, color = "#6366f1", size = 88 }: {
  value: number; label: string; sublabel?: string; color?: string; size?: number;
}) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth="8" />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={c} strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-slate-800">{value}%</span>
        </div>
      </div>
      <div>
        <div className="text-sm font-semibold text-slate-800">{label}</div>
        {sublabel && <div className="text-xs text-slate-500 mt-0.5">{sublabel}</div>}
      </div>
    </div>
  );
}

export default function GrowthDashboard() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<{ id: number; name: string; description?: string }[]>([]);

  useEffect(() => {
    projectsApi.list().then((d: { projects?: { id: number; name: string; description?: string }[] }) => {
      setProjects(d.projects?.slice(0, 2) ?? []);
    }).catch(() => {});
  }, []);

  return (
    <Layout>
      <div className="px-4 lg:px-6 py-6 max-w-7xl mx-auto space-y-6">

        {/* ── Приветственный блок + AI инсайт ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 text-white relative overflow-hidden">
            <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/5 rounded-full" />
            <div className="absolute -bottom-10 -right-4 w-28 h-28 bg-white/5 rounded-full" />
            <div className="relative">
              <div className="flex items-start justify-between mb-1">
                <h1 className="text-xl font-bold">{getGreeting(user?.name ?? "")}</h1>
                <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  <Icon name="User" size={20} className="text-white/80" />
                </div>
              </div>
              <div className="flex items-center gap-2 mb-4">
                <span className="inline-flex items-center gap-1.5 text-xs bg-violet-500/30 text-violet-200 px-2.5 py-1 rounded-full font-medium">
                  <Icon name="Sparkles" size={11} />
                  AI-инсайт дня
                </span>
              </div>
              <p className="text-sm text-white/80 leading-relaxed max-w-md">
                Фокус на учебных проектах ускоряет ваш рост на 20%. Рекомендую сегодня завершить активный проект и загрузить новые материалы.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800">Мои цели</h3>
              <Link to="/cabinet/development" className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-0.5">
                Все <Icon name="ChevronRight" size={13} />
              </Link>
            </div>
            <div className="space-y-3">
              {[
                { label: "Компетенции", value: 25, delta: "+10%", color: "bg-indigo-500" },
                { label: "Мои цели", value: 15, delta: "15%", color: "bg-emerald-500" },
              ].map(g => (
                <div key={g.label}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-600 font-medium">{g.label}</span>
                    <span className="text-slate-500">{g.delta}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full">
                    <div className={`h-2 ${g.color} rounded-full transition-all`} style={{ width: `${g.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Icon name="TrendingUp" size={13} className="text-emerald-500" />
                <span>Прогресс развития растёт</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Прогресс / Компетенции / Ближайшие шаги ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Прогресс развития */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800">Прогресс развития</h3>
              <span className="text-xs text-slate-400">Всего пройдено</span>
            </div>
            <CircleProgress value={68} label="к целям" sublabel="Обучение: 75% · Проекты: 50%" color="#6366f1" />
            <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" /> Обучение 75%</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Карьера 80%</span>
            </div>
          </div>

          {/* Карта компетенций */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm relative">
            <div className="absolute top-4 right-4 text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">Скоро</div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-800">Карта компетенций</h3>
            </div>
            <RadarChart size={150} />
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {COMPETENCIES.map(c => (
                <div key={c.name} className="text-center">
                  <div className="text-xs font-semibold text-slate-700">{c.score}</div>
                  <div className="text-[10px] text-slate-400">{c.name}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Ближайшие шаги */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800">Ближайшие шаги</h3>
              <Link to="/cabinet/development" className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-0.5">
                <Icon name="ChevronRight" size={13} />
              </Link>
            </div>
            <div className="space-y-2.5">
              {[
                { done: true, label: "Загрузить учебные материалы" },
                { done: true, label: "Создать проект презентации" },
                { done: false, label: "Пройти микро-тест по теме" },
                { done: false, label: "Обновить план развития" },
              ].map((s, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className={`w-4 h-4 rounded flex-shrink-0 mt-0.5 flex items-center justify-center border ${s.done ? "bg-slate-800 border-slate-800" : "border-slate-300"}`}>
                    {s.done && <Icon name="Check" size={10} className="text-white" />}
                  </div>
                  <span className={`text-sm leading-tight ${s.done ? "text-slate-400 line-through" : "text-slate-700"}`}>{s.label}</span>
                </div>
              ))}
            </div>
            <button className="mt-4 w-full text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-xl py-2 transition-colors hover:bg-slate-50">
              Обновить план развития
            </button>
          </div>
        </div>

        {/* ── Активные проекты + Быстрые действия ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Активные проекты */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800">Активные проекты</h3>
              <Link to="/cabinet" className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-0.5">
                Все <Icon name="ChevronRight" size={13} />
              </Link>
            </div>
            {projects.length === 0 ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Icon name="FolderOpen" size={22} className="text-slate-400" />
                </div>
                <p className="text-sm text-slate-500">Нет активных проектов</p>
                <Link to="/cabinet" className="mt-3 inline-block text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-xl transition-colors">
                  Создать первый проект
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {projects.map(p => (
                  <Link
                    key={p.id}
                    to={`/cabinet/project/${p.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-300 transition-all group"
                  >
                    <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
                      <Icon name="FileText" size={17} className="text-orange-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 truncate">{p.name}</div>
                      <div className="text-xs text-slate-400">Презентация</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="w-8 h-8 relative flex-shrink-0">
                        <svg width="32" height="32" className="-rotate-90">
                          <circle cx="16" cy="16" r="12" fill="none" stroke="#f1f5f9" strokeWidth="4" />
                          <circle cx="16" cy="16" r="12" fill="none" stroke="#6366f1" strokeWidth="4" strokeDasharray="75.4" strokeDashoffset="37.7" strokeLinecap="round" />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-slate-700">50%</span>
                      </div>
                    </div>
                  </Link>
                ))}
                <Link
                  to="/cabinet"
                  className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-slate-200 hover:border-slate-400 hover:bg-slate-50 transition-all text-slate-500 hover:text-slate-700"
                >
                  <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
                    <Icon name="Plus" size={16} className="text-slate-400" />
                  </div>
                  <span className="text-sm">Создать новый проект</span>
                </Link>
              </div>
            )}
          </div>

          {/* Быстрые действия */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">Быстрые действия</h3>
            <div className="grid grid-cols-2 gap-3">
              {QUICK_ACTIONS.map(a => (
                <Link
                  key={a.label}
                  to={a.active ? a.href : "#"}
                  onClick={e => !a.active && e.preventDefault()}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border border-slate-100 transition-all ${
                    a.active ? "hover:border-slate-300 hover:shadow-sm cursor-pointer" : "opacity-50 cursor-default"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${a.color}`}>
                    <Icon name={a.icon} size={17} />
                  </div>
                  <span className="text-xs font-medium text-slate-700 leading-tight">{a.label}</span>
                </Link>
              ))}
            </div>

            {/* Ближайший тест */}
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Icon name="Clock" size={16} className="text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-amber-800">Ближайший тест</div>
                <div className="text-xs text-amber-700 mt-0.5">Раздел тестирования откроется в ближайшее время</div>
              </div>
              <span className="text-[10px] font-semibold text-amber-500 bg-amber-100 px-2 py-0.5 rounded-full flex-shrink-0">Скоро</span>
            </div>
          </div>
        </div>

        {/* ── Карьерный вектор + Рекомендации AI + Баланс ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Карьерный вектор */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm relative">
            <div className="absolute top-4 right-4 text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">Скоро</div>
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Карьерный вектор</h3>
            <div className="space-y-3">
              {[
                { label: "Тренер", active: true },
                { label: "Milestones", active: false },
                { label: "Milestone", active: false },
              ].map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${s.active ? "bg-slate-800" : "bg-slate-200"}`} />
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full">
                    <div className={`h-1.5 rounded-full ${s.active ? "bg-slate-800 w-1/3" : "w-0"}`} />
                  </div>
                  <span className="text-xs text-slate-500">{s.label}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-4">Ваш карьерный трек формируется на основе компетенций и целей</p>
          </div>

          {/* Рекомендации AI */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Рекомендации AI</h3>
            <div className="space-y-3">
              {[
                { type: "Курс", title: "Эмоциональный интеллект для лидеров", icon: "BookOpen", color: "bg-violet-50 text-violet-600" },
                { type: "Статья", title: "Тренды AI 2026", icon: "FileText", color: "bg-blue-50 text-blue-600" },
              ].map((r, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${r.color}`}>
                    <Icon name={r.icon} size={15} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">{r.type}</div>
                    <div className="text-xs font-semibold text-slate-700 leading-snug mt-0.5">{r.title}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Баланс */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800">Кошелёк / Баланс</h3>
              <Link to="/cabinet/wallet">
                <Icon name="ChevronRight" size={16} className="text-slate-400 hover:text-slate-700" />
              </Link>
            </div>
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl p-4 text-white">
              <div className="text-xs font-medium text-emerald-100 mb-1">Текущий баланс</div>
              <div className="text-2xl font-bold">0 ₽</div>
              <div className="text-xs text-emerald-200 mt-1">Пополните для работы с AI</div>
            </div>
            <Link
              to="/cabinet/wallet"
              className="mt-3 w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors"
            >
              <Icon name="Plus" size={13} />
              Пополнить баланс
            </Link>
          </div>
        </div>

        {/* ── В разработке / Роадмап ── */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <Icon name="Clock" size={16} className="text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-800">Готовится к запуску</h3>
            <span className="text-xs text-slate-400 ml-1">— расширяем платформу каждый месяц</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {UPCOMING_MODULES.map(m => (
              <div key={m.label} className="flex flex-col items-center text-center p-4 bg-slate-50 rounded-xl border border-slate-100 gap-2">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                  <Icon name={m.icon} size={18} className="text-slate-400" />
                </div>
                <div className="text-xs font-semibold text-slate-500 leading-snug">{m.label}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </Layout>
  );
}