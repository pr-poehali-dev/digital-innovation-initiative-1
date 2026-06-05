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

const INITIAL_SPRINTS: Sprint[] = [
  {
    id: "s1",
    title: "Спринт 1 — Стабилизация",
    goal: "Всё уже обещанное реально видно и работает",
    status: "done",
    days: "3–5 дней",
    tasks: [
      { id: "s1-1", title: "Проверка всех маршрутов — убрать 404", status: "done", note: "commit 9cc266f" },
      { id: "s1-2", title: "Единый источник роутов (routes.ts)", status: "done", note: "commit 9cc266f" },
      { id: "s1-3", title: "Синхронизация мобильного и десктопного меню", status: "done", note: "commit 9cc266f" },
      { id: "s1-4", title: "Виджет «Мои цели» с живыми данными на главной", status: "done", note: "commit 535f208" },
      { id: "s1-5", title: "Индекс развития: проекты + обучение", status: "done", note: "commit 8870789" },
      { id: "s1-6", title: "Версия сборки / commit / дата в Штабе", status: "done", note: "commit 9cc266f" },
      { id: "s1-7", title: "Штаб: блоки Done / In Progress / Next", status: "done", note: "commit 9cc266f" },
      { id: "s1-8", title: "Раздел «План проекта» в админке", status: "in_progress", note: "текущий спринт" },
    ],
  },
  {
    id: "s2",
    title: "Спринт 2 — Обучение MVP",
    goal: "«Обучение» — ежедневный рабочий кабинет, а не витрина",
    status: "in_progress",
    days: "5–7 дней",
    tasks: [
      { id: "s2-1", title: "4 уровня статусов тем: not_started / studying / understood / applied", status: "todo" },
      { id: "s2-2", title: "Миграция старых статусов: done→applied, in_progress→studying, null→not_started", status: "todo" },
      { id: "s2-3", title: "Прогресс % по новым весам (0 / 0.33 / 0.66 / 1.0)", status: "todo" },
      { id: "s2-4", title: "UI: компактный селектор статуса темы (1 клик, без перезагрузки)", status: "todo" },
      { id: "s2-5", title: "Блок «Что делать сейчас» — вычисляемый по фазе и статусам", status: "todo" },
      { id: "s2-6", title: "Блок «Осталось освоить» — сводка + список хвоста", status: "todo" },
      { id: "s2-7", title: "Weekly check-in: форма (4 вопроса) + сохранение", status: "todo" },
      { id: "s2-8", title: "История weekly check-in по цели", status: "todo" },
      { id: "s2-9", title: "AI summary после check-in", status: "todo" },
      { id: "s2-10", title: "QA: прогресс одинаков на главной / в цели / в 30/60/90", status: "todo" },
    ],
  },
  {
    id: "s3",
    title: "Спринт 3 — Штаб ясности",
    goal: "Штаб — единая точка понимания где мы и куда идём",
    status: "planned",
    days: "3–5 дней",
    tasks: [
      { id: "s3-1", title: "Журнал решений: что решили / почему / когда", status: "todo" },
      { id: "s3-2", title: "Риски платформы с описанием и статусом", status: "todo" },
      { id: "s3-3", title: "Roadmap: Done / In Progress / Next / Later", status: "todo" },
      { id: "s3-4", title: "Виджет «Мой вход в новую роль»", status: "todo" },
      { id: "s3-5", title: "Текущий спринт прямо на главной Штаба", status: "todo" },
    ],
  },
  {
    id: "s4",
    title: "Спринт 4 — Шаблоны для новой роли",
    goal: "Прикладная ценность: реальные рабочие документы для CDO",
    status: "planned",
    days: "5–7 дней",
    tasks: [
      { id: "s4-1", title: "Шаблон: Stakeholder map", status: "todo" },
      { id: "s4-2", title: "Шаблон: Current state process map", status: "todo" },
      { id: "s4-3", title: "Шаблон: Pain point register", status: "todo" },
      { id: "s4-4", title: "Шаблон: Data map", status: "todo" },
      { id: "s4-5", title: "Шаблон: Pilot charter", status: "todo" },
      { id: "s4-6", title: "Шаблон: AI governance draft", status: "todo" },
      { id: "s4-7", title: "Шаблон: Management deck outline", status: "todo" },
      { id: "s4-8", title: "Шаблон: Priority matrix", status: "todo" },
    ],
  },
  {
    id: "s5",
    title: "Спринт 5 — Навигатор развития",
    goal: "Профиль компетенций, gap-анализ, AI-резюме",
    status: "planned",
    days: "7–10 дней",
    tasks: [
      { id: "s5-1", title: "Карта навыков на основе тем и проектов", status: "todo" },
      { id: "s5-2", title: "Gap analysis — чего не хватает для цели", status: "todo" },
      { id: "s5-3", title: "AI строит резюме и карьерный профиль", status: "todo" },
      { id: "s5-4", title: "Визуальная карта компетенций (radar или grid)", status: "todo" },
      { id: "s5-5", title: "Рекомендованный путь 30/60/90 на следующий период", status: "todo" },
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
  const [expanded, setExpanded] = useState<string[]>(["s1", "s2"]);

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
          <p className="text-gray-500 text-sm ml-11">Спринты и задачи · фиксируем факт выполнения</p>
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

        {/* Спринты */}
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
