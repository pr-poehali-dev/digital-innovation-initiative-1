// Dashboard task model — единый source of truth для "что делать дальше".
// GrowthDashboard.tsx только рендерит, логика живёт здесь.

// ── Types ─────────────────────────────────────────────────────────────

export type DashboardTaskId =
  | "create-account"
  | "create-public-profile"
  | "publish-public-profile"
  | "add-project"
  | "set-learning-goal"
  | "complete-first-topic"
  | "competency-map";

export type DashboardTaskState = "done" | "available" | "blocked" | "coming";

export type DashboardSurface = "nextSteps" | "quickActions";

export interface DashboardTask {
  id: DashboardTaskId;
  title: string;
  description?: string;
  href?: string;
  ctaLabel?: string;
  state: DashboardTaskState;
  priority: number;
  surfaces: DashboardSurface[];
}

export interface DashboardFacts {
  publicProfile: {
    slug: string | null;
    isPublished: boolean;
  };
  projectCount: number;
  hasLearningGoal: boolean;
  learningDone: number;
}

export interface DashboardModel {
  tasks: DashboardTask[];
}

// ── Builder ───────────────────────────────────────────────────────────

export function buildDashboardTasks(facts: DashboardFacts): DashboardTask[] {
  const { publicProfile, projectCount, hasLearningGoal, learningDone } = facts;
  const tasks: DashboardTask[] = [];

  // 1. Создать аккаунт — всегда done
  tasks.push({
    id: "create-account",
    title: "Создать аккаунт",
    state: "done",
    priority: 200,
    surfaces: ["nextSteps"],
  });

  // 2. Создать первый проект
  tasks.push({
    id: "add-project",
    title: "Создать первый проект",
    href: "/cabinet/projects",
    ctaLabel: "Создать",
    state: projectCount > 0 ? "done" : "available",
    priority: 120,
    surfaces: ["nextSteps", "quickActions"],
  });

  // 3. Поставить учебную цель
  tasks.push({
    id: "set-learning-goal",
    title: "Поставить учебную цель",
    href: "/cabinet/learning",
    ctaLabel: "Открыть",
    state: hasLearningGoal ? "done" : "available",
    priority: 110,
    surfaces: ["nextSteps", "quickActions"],
  });

  // 4. Освоить первую тему — blocked пока нет цели
  tasks.push({
    id: "complete-first-topic",
    title: "Освоить первую тему",
    href: "/cabinet/learning",
    ctaLabel: "Открыть",
    state: learningDone > 0 ? "done" : hasLearningGoal ? "available" : "blocked",
    priority: 100,
    surfaces: ["nextSteps"],
  });

  // 5. Public profile — взаимоисключающие задачи
  if (!publicProfile.slug) {
    tasks.push({
      id: "create-public-profile",
      title: "Создать публичный профиль",
      description: "Создайте публичную ссылку и выберите, что показывать другим.",
      href: "/cabinet/public-profile",
      ctaLabel: "Создать",
      state: "available",
      priority: 130,
      surfaces: ["nextSteps"],
    });
  } else if (!publicProfile.isPublished) {
    tasks.push({
      id: "publish-public-profile",
      title: "Опубликовать публичный профиль",
      description: "Сделайте страницу доступной по ссылке.",
      href: "/cabinet/public-profile",
      ctaLabel: "Опубликовать",
      state: "available",
      priority: 125,
      surfaces: ["nextSteps"],
    });
  }
  // Если опубликован — задача не добавляется вообще (пропадает из steps)

  // 6. Карта компетенций — coming soon
  tasks.push({
    id: "competency-map",
    title: "Заполнить карту компетенций",
    href: "#",
    state: "coming",
    priority: 50,
    surfaces: ["nextSteps"],
  });

  return tasks;
}

// ── Selectors ─────────────────────────────────────────────────────────

export function selectNextSteps(tasks: DashboardTask[], limit = 5): DashboardTask[] {
  return tasks
    .filter(t => t.surfaces.includes("nextSteps"))
    .sort((a, b) => {
      // done всегда выше coming, но ниже available и blocked
      const order = (s: DashboardTaskState) =>
        s === "done" ? 1 : s === "available" ? 2 : s === "blocked" ? 3 : 4;
      const diff = order(b.state) - order(a.state);
      if (diff !== 0) return diff;
      return b.priority - a.priority;
    })
    .slice(0, limit);
}

export function selectQuickActions(
  tasks: DashboardTask[],
  usedIds: DashboardTaskId[],
  limit = 4,
): DashboardTask[] {
  return tasks
    .filter(t =>
      t.surfaces.includes("quickActions") &&
      t.state === "available" &&
      !usedIds.includes(t.id),
    )
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit);
}
