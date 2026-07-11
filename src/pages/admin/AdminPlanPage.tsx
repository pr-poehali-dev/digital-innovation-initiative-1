import { useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";

type TaskStatus = "done" | "in_progress" | "todo";

type Task = {
  id: string;
  title: string;
  status: TaskStatus;
  note?: string;
};

type Sprint = {
  id: string;
  title: string;
  goal: string;
  status: "done" | "in_progress" | "planned";
  days: string;
  tasks: Task[];
};

// Продуктовые волны (актуализировано 07.2026). Отражают фактическое состояние продукта.
const INITIAL_SPRINTS: Sprint[] = [
  {
    id: "w1",
    title: "Волна 1 — Платформенное ядро",
    goal: "Done · Базовая архитектура, общие сущности, навигация, файлы, AI-инфраструктура",
    status: "done",
    days: "Реализовано",
    tasks: [
      { id: "w1-1", title: "Базовая архитектура платформы и общие сущности", status: "done" },
      { id: "w1-2", title: "Единая навигация (десктоп + мобайл)", status: "done" },
      { id: "w1-3", title: "Работа с файлами и артефактами", status: "done" },
      { id: "w1-4", title: "AI-инфраструктура для ключевых сценариев", status: "done" },
    ],
  },
  {
    id: "w2",
    title: "Волна 2 — Учебный кабинет core",
    goal: "Done / Stabilizing · Цели, AI-план, темы, статусы, weekly check-in, образовательный паспорт",
    status: "done",
    days: "Реализовано",
    tasks: [
      { id: "w2-1", title: "Цели обучения и AI-план развития", status: "done" },
      { id: "w2-2", title: "Темы и статусы (not_started / studying / understood / applied)", status: "done" },
      { id: "w2-3", title: "Weekly check-in + история + AI-резюме", status: "done" },
      { id: "w2-4", title: "Образовательный паспорт и парсинг дипломов/сертификатов", status: "done" },
      { id: "w2-5", title: "Стабилизация прогресса и обзорных экранов", status: "in_progress" },
    ],
  },
  {
    id: "w3",
    title: "Волна 3 — Профессиональный кабинет core",
    goal: "Done / Growing · Профиль, карта компетенций, fit / gap, навигатор развития",
    status: "done",
    days: "Реализовано",
    tasks: [
      { id: "w3-1", title: "Профессиональный паспорт (опыт, образование, цели, роли)", status: "done" },
      { id: "w3-2", title: "Карта компетенций (самооценка + сигналы)", status: "done" },
      { id: "w3-3", title: "Fit / gap логика к целевой роли", status: "done" },
      { id: "w3-4", title: "Навигатор развития и план 30/60/90", status: "done" },
      { id: "w3-5", title: "Развитие доказательности профиля", status: "in_progress" },
    ],
  },
  {
    id: "w4",
    title: "Волна 4 — Суперадминка core",
    goal: "Done · HQ, strategy, roadmap, plans, tickets, users, audit",
    status: "done",
    days: "Реализовано",
    tasks: [
      { id: "w4-1", title: "HQ / штаб — единая память проекта", status: "done" },
      { id: "w4-2", title: "Strategy Intelligence и Roadmap", status: "done" },
      { id: "w4-3", title: "Планы, тикеты, пользователи", status: "done" },
      { id: "w4-4", title: "Аудит и наблюдаемость состояния продукта", status: "done" },
    ],
  },
  {
    id: "w5",
    title: "Волна 5 — Рабочий кабинет / Полигон трансформации",
    goal: "Done / Expanding · Оргструктура, функции, проблемы, гипотезы, инициативы, решения, пилоты",
    status: "done",
    days: "Реализовано, расширяется",
    tasks: [
      { id: "w5-1", title: "Оргструктура (дерево департамента) и функции подразделения", status: "done" },
      { id: "w5-2", title: "AI-распознавание положений и извлечение функций", status: "done" },
      { id: "w5-3", title: "Пересечения, проблемы, гипотезы, альтернативы", status: "done" },
      { id: "w5-4", title: "Инициативы, решения и системы, автоматизация и ИИ", status: "done" },
      { id: "w5-5", title: "Сводка решений, дорожная карта пилотов, AI Copilot", status: "done" },
      { id: "w5-6", title: "Расширение обзорных сценариев и rollup", status: "in_progress" },
    ],
  },
  {
    id: "w6",
    title: "Волна 6 — Сквозная связка кабинетов",
    goal: "Current · Работа → обучение → компетенции → профиль; доказательные сигналы; межкабинетная аналитика",
    status: "in_progress",
    days: "Текущий фокус",
    tasks: [
      { id: "w6-1", title: "Связка «работа → обучение → компетенции → профиль»", status: "in_progress" },
      { id: "w6-2", title: "Доказательные сигналы развития из реальных действий", status: "in_progress" },
      { id: "w6-3", title: "Межкабинетная аналитика", status: "todo" },
      { id: "w6-4", title: "Метрики зрелости и актуализация стратегии", status: "in_progress" },
    ],
  },
  {
    id: "w7",
    title: "Волна 7 — Внешний карьерный контур",
    goal: "Next · Публичный профиль, внешнее представление, карьерные сценарии, verified signals",
    status: "planned",
    days: "Следующий горизонт",
    tasks: [
      { id: "w7-1", title: "Публичный профиль и внешнее профессиональное представление", status: "todo" },
      { id: "w7-2", title: "Карьерные сценарии и работодательский контур", status: "todo" },
      { id: "w7-3", title: "Верифицированные профессиональные сигналы", status: "todo" },
    ],
  },
  {
    id: "w8",
    title: "Волна 8 — Enterprise-слой",
    goal: "Next / Later · Безопасность, роли и доступы, расширенный аудит, интеграции, масштабируемость",
    status: "planned",
    days: "Следующий горизонт",
    tasks: [
      { id: "w8-1", title: "Роли, доступы и безопасность корпоративного уровня", status: "todo" },
      { id: "w8-2", title: "Расширенный аудит и управляемость данных", status: "todo" },
      { id: "w8-3", title: "Интеграции", status: "todo" },
      { id: "w8-4", title: "Организационная масштабируемость", status: "todo" },
    ],
  },
];

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; dot: string }> = {
  done:        { label: "Готово",      color: "bg-emerald-900/50 text-emerald-400 border-emerald-800", dot: "bg-emerald-400" },
  in_progress: { label: "В работе",   color: "bg-blue-900/50 text-blue-400 border-blue-800",          dot: "bg-blue-400" },
  todo:        { label: "Не начато",  color: "bg-gray-800 text-gray-500 border-gray-700",              dot: "bg-gray-600" },
};

const SPRINT_STATUS_CONFIG = {
  done:        { label: "Завершён",    color: "bg-emerald-900/60 text-emerald-400 border border-emerald-800" },
  in_progress: { label: "Идёт сейчас", color: "bg-blue-900/60 text-blue-400 border border-blue-800" },
  planned:     { label: "Планируется", color: "bg-gray-800 text-gray-500 border border-gray-700" },
};

export default function AdminPlanPage() {
  const [sprints, setSprints] = useState<Sprint[]>(INITIAL_SPRINTS);
  const [expanded, setExpanded] = useState<string[]>(["w5", "w6"]);

  function toggleExpand(id: string) {
    setExpanded(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function cycleStatus(sprintId: string, taskId: string) {
    const cycle: TaskStatus[] = ["todo", "in_progress", "done"];
    setSprints(prev => prev.map(s =>
      s.id !== sprintId ? s : {
        ...s,
        tasks: s.tasks.map(t => {
          if (t.id !== taskId) return t;
          const idx = cycle.indexOf(t.status);
          return { ...t, status: cycle[(idx + 1) % cycle.length] };
        }),
      }
    ));
  }

  const totalTasks = sprints.reduce((n, s) => n + s.tasks.length, 0);
  const doneTasks  = sprints.reduce((n, s) => n + s.tasks.filter(t => t.status === "done").length, 0);
  const inProgTasks = sprints.reduce((n, s) => n + s.tasks.filter(t => t.status === "in_progress").length, 0);
  const overallPct = Math.round((doneTasks / totalTasks) * 100);

  return (
    <AdminShell>
      <div className="p-6 max-w-4xl">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-violet-900 flex items-center justify-center">
              <Icon name="ClipboardList" size={16} className="text-violet-400" />
            </div>
            <h1 className="text-xl font-bold text-white">План проекта</h1>
          </div>
          <p className="text-gray-500 text-sm ml-11">Продуктовые волны · фактическое состояние продукта</p>
        </div>

        {/* Общий прогресс */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: "Всего задач",   value: totalTasks,   color: "text-white" },
            { label: "Готово",         value: doneTasks,    color: "text-emerald-400" },
            { label: "В работе",       value: inProgTasks,  color: "text-blue-400" },
            { label: "Прогресс",       value: `${overallPct}%`, color: "text-violet-400" },
          ].map(c => (
            <div key={c.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{c.label}</div>
            </div>
          ))}
        </div>

        {/* Общий прогресс-бар */}
        <div className="mb-6 bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex justify-between text-xs text-gray-500 mb-2">
            <span>Общий прогресс</span>
            <span>{doneTasks} из {totalTasks} задач</span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${overallPct}%` }}
            />
          </div>
        </div>

        {/* Волны */}
        <div className="space-y-3">
          {sprints.map(sprint => {
            const isOpen = expanded.includes(sprint.id);
            const sprintDone = sprint.tasks.filter(t => t.status === "done").length;
            const sprintPct = Math.round((sprintDone / sprint.tasks.length) * 100);
            const cfg = SPRINT_STATUS_CONFIG[sprint.status];

            return (
              <div
                key={sprint.id}
                className={`bg-gray-900 rounded-xl border overflow-hidden transition-all ${
                  sprint.status === "in_progress" ? "border-blue-800" : "border-gray-800"
                }`}
              >
                {/* Sprint header */}
                <button
                  onClick={() => toggleExpand(sprint.id)}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-800/50 transition-colors"
                >
                  <Icon
                    name={isOpen ? "ChevronDown" : "ChevronRight"}
                    size={16}
                    className="text-gray-500 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-sm font-semibold text-white">{sprint.title}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      <span className="text-xs text-gray-500">{sprint.days}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{sprint.goal}</p>
                  </div>
                  <div className="flex-shrink-0 text-right ml-4">
                    <div className="text-sm font-bold text-gray-300">{sprintDone}/{sprint.tasks.length}</div>
                    <div className="text-[10px] text-gray-600">{sprintPct}%</div>
                  </div>
                </button>

                {/* Sprint progress bar */}
                <div className="px-5 pb-0">
                  <div className="h-0.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        sprint.status === "done" ? "bg-emerald-500" :
                        sprint.status === "in_progress" ? "bg-blue-500" : "bg-gray-700"
                      }`}
                      style={{ width: `${sprintPct}%` }}
                    />
                  </div>
                </div>

                {/* Tasks */}
                {isOpen && (
                  <div className="px-5 py-3 space-y-1.5">
                    {sprint.tasks.map(task => {
                      const tc = STATUS_CONFIG[task.status];
                      return (
                        <div
                          key={task.id}
                          className="flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-gray-800/60 transition-colors group"
                        >
                          {/* Status toggle */}
                          <button
                            onClick={() => cycleStatus(sprint.id, task.id)}
                            title="Кликни для смены статуса"
                            className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                              task.status === "done"
                                ? "bg-emerald-500 border-emerald-500"
                                : task.status === "in_progress"
                                ? "bg-blue-500/20 border-blue-500"
                                : "bg-transparent border-gray-700 group-hover:border-gray-500"
                            }`}
                          >
                            {task.status === "done" && (
                              <Icon name="Check" size={10} className="text-white" />
                            )}
                            {task.status === "in_progress" && (
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                            )}
                          </button>

                          {/* Title */}
                          <div className="flex-1 min-w-0">
                            <span className={`text-sm leading-snug ${
                              task.status === "done" ? "text-gray-500 line-through" : "text-gray-200"
                            }`}>
                              {task.title}
                            </span>
                            {task.note && (
                              <span className="ml-2 text-[10px] text-gray-600 font-mono">{task.note}</span>
                            )}
                          </div>

                          {/* Badge */}
                          <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${tc.color}`}>
                            {tc.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <div className="mt-6 p-3 bg-gray-900 border border-gray-800 rounded-xl flex items-center gap-2 text-xs text-gray-500">
          <Icon name="Info" size={13} className="flex-shrink-0" />
          Статус меняется кликом на кружок. Данные хранятся локально в этой сессии — скоро добавим сохранение в БД.
        </div>

      </div>
    </AdminShell>
  );
}