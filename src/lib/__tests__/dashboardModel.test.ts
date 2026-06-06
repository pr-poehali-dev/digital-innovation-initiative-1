// Тесты для dashboardModel.ts
// Запуск: npx vite-node src/lib/__tests__/dashboardModel.test.ts
// Не требует внешних зависимостей — чистый TypeScript.

import {
  buildDashboardTasks,
  selectNextSteps,
  selectQuickActions,
  type DashboardFacts,
  type DashboardTaskId,
} from "../dashboardModel";

// ── Mini test runner ──────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${(e as Error).message}`);
    failed++;
  }
}

function expect<T>(actual: T) {
  return {
    toBe(expected: T) {
      if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toContain(expected: T) {
      if (!Array.isArray(actual)) throw new Error("toContain requires array");
      if (!(actual as T[]).includes(expected)) throw new Error(`Expected array to contain ${JSON.stringify(expected)}`);
    },
    notToContain(expected: T) {
      if (!Array.isArray(actual)) throw new Error("notToContain requires array");
      if ((actual as T[]).includes(expected)) throw new Error(`Expected array NOT to contain ${JSON.stringify(expected)}`);
    },
    toBeGreaterThan(expected: number) {
      if (typeof actual !== "number" || actual <= (expected as number))
        throw new Error(`Expected ${actual} > ${expected}`);
    },
    toBeLessThanOrEqual(expected: number) {
      if (typeof actual !== "number" || actual > (expected as number))
        throw new Error(`Expected ${actual} <= ${expected}`);
    },
  };
}

// ── Fixtures ─────────────────────────────────────────────────────────

const newUser: DashboardFacts = {
  publicProfile: { slug: null, isPublished: false },
  projectCount: 0,
  hasLearningGoal: false,
  learningDone: 0,
};

const withSlugUnpublished: DashboardFacts = {
  publicProfile: { slug: "john-doe", isPublished: false },
  projectCount: 1,
  hasLearningGoal: true,
  learningDone: 3,
};

const published: DashboardFacts = {
  publicProfile: { slug: "john-doe", isPublished: true },
  projectCount: 2,
  hasLearningGoal: true,
  learningDone: 5,
};

const withGoalNoProgress: DashboardFacts = {
  publicProfile: { slug: null, isPublished: false },
  projectCount: 1,
  hasLearningGoal: true,
  learningDone: 0,
};

// ── Tests: buildDashboardTasks ────────────────────────────────────────

console.log("\nbuildDashboardTasks()");

test("новый пользователь → create-public-profile присутствует", () => {
  const tasks = buildDashboardTasks(newUser);
  const ids = tasks.map(t => t.id);
  expect(ids).toContain("create-public-profile" as DashboardTaskId);
});

test("новый пользователь → publish-public-profile ОТСУТСТВУЕТ", () => {
  const tasks = buildDashboardTasks(newUser);
  const ids = tasks.map(t => t.id);
  expect(ids).notToContain("publish-public-profile" as DashboardTaskId);
});

test("есть slug, не опубликован → publish-public-profile присутствует", () => {
  const tasks = buildDashboardTasks(withSlugUnpublished);
  const ids = tasks.map(t => t.id);
  expect(ids).toContain("publish-public-profile" as DashboardTaskId);
});

test("есть slug, не опубликован → create-public-profile ОТСУТСТВУЕТ", () => {
  const tasks = buildDashboardTasks(withSlugUnpublished);
  const ids = tasks.map(t => t.id);
  expect(ids).notToContain("create-public-profile" as DashboardTaskId);
});

test("профиль опубликован → НИ ОДНОЙ public profile задачи", () => {
  const tasks = buildDashboardTasks(published);
  const ids = tasks.map(t => t.id);
  expect(ids).notToContain("create-public-profile" as DashboardTaskId);
  expect(ids).notToContain("publish-public-profile" as DashboardTaskId);
});

test("create-account всегда done", () => {
  const tasks = buildDashboardTasks(newUser);
  const task = tasks.find(t => t.id === "create-account");
  if (!task) throw new Error("create-account не найден");
  expect(task.state).toBe("done");
});

test("add-project done когда projectCount > 0", () => {
  const tasks = buildDashboardTasks({ ...newUser, projectCount: 1 });
  const task = tasks.find(t => t.id === "add-project");
  if (!task) throw new Error("add-project не найден");
  expect(task.state).toBe("done");
});

test("add-project available когда projectCount === 0", () => {
  const tasks = buildDashboardTasks(newUser);
  const task = tasks.find(t => t.id === "add-project");
  if (!task) throw new Error("add-project не найден");
  expect(task.state).toBe("available");
});

test("complete-first-topic blocked без учебной цели", () => {
  const tasks = buildDashboardTasks(newUser);
  const task = tasks.find(t => t.id === "complete-first-topic");
  if (!task) throw new Error("complete-first-topic не найден");
  expect(task.state).toBe("blocked");
});

test("complete-first-topic available когда есть цель, нет прогресса", () => {
  const tasks = buildDashboardTasks(withGoalNoProgress);
  const task = tasks.find(t => t.id === "complete-first-topic");
  if (!task) throw new Error("complete-first-topic не найден");
  expect(task.state).toBe("available");
});

test("complete-first-topic done когда learningDone > 0", () => {
  const tasks = buildDashboardTasks(withSlugUnpublished);
  const task = tasks.find(t => t.id === "complete-first-topic");
  if (!task) throw new Error("complete-first-topic не найден");
  expect(task.state).toBe("done");
});

test("competency-map всегда coming", () => {
  const tasks = buildDashboardTasks(published);
  const task = tasks.find(t => t.id === "competency-map");
  if (!task) throw new Error("competency-map не найден");
  expect(task.state).toBe("coming");
});

// ── Tests: selectNextSteps ────────────────────────────────────────────

console.log("\nselectNextSteps()");

test("уважает limit", () => {
  const tasks = buildDashboardTasks(newUser);
  const steps = selectNextSteps(tasks, 3);
  expect(steps.length).toBeLessThanOrEqual(3);
});

test("не включает задачи без surfaces nextSteps", () => {
  const tasks = buildDashboardTasks(newUser);
  const steps = selectNextSteps(tasks);
  const allHaveNextSteps = steps.every(t => t.surfaces.includes("nextSteps"));
  if (!allHaveNextSteps) throw new Error("Задача без surface nextSteps попала в список");
});

test("done идут первыми (выше coming)", () => {
  const tasks = buildDashboardTasks(newUser);
  const steps = selectNextSteps(tasks);
  const doneIdx = steps.findIndex(t => t.state === "done");
  const comingIdx = steps.findIndex(t => t.state === "coming");
  if (doneIdx === -1 || comingIdx === -1) return;
  expect(doneIdx).toBeLessThanOrEqual(comingIdx - 1);
});

test("create-public-profile попадает в шаги для нового пользователя", () => {
  const tasks = buildDashboardTasks(newUser);
  const steps = selectNextSteps(tasks);
  const ids = steps.map(t => t.id);
  expect(ids).toContain("create-public-profile" as DashboardTaskId);
});

test("publish-public-profile попадает в шаги при наличии slug", () => {
  const tasks = buildDashboardTasks(withSlugUnpublished);
  const steps = selectNextSteps(tasks);
  const ids = steps.map(t => t.id);
  expect(ids).toContain("publish-public-profile" as DashboardTaskId);
});

test("ни одной public profile задачи в шагах если опубликован", () => {
  const tasks = buildDashboardTasks(published);
  const steps = selectNextSteps(tasks);
  const ids = steps.map(t => t.id);
  expect(ids).notToContain("create-public-profile" as DashboardTaskId);
  expect(ids).notToContain("publish-public-profile" as DashboardTaskId);
});

// ── Tests: selectQuickActions ─────────────────────────────────────────

console.log("\nselectQuickActions()");

test("не включает задачи из usedIds", () => {
  const tasks = buildDashboardTasks(newUser);
  const usedIds: DashboardTaskId[] = ["add-project", "set-learning-goal"];
  const actions = selectQuickActions(tasks, usedIds);
  const ids = actions.map(t => t.id);
  expect(ids).notToContain("add-project" as DashboardTaskId);
  expect(ids).notToContain("set-learning-goal" as DashboardTaskId);
});

test("включает только available задачи", () => {
  const tasks = buildDashboardTasks(newUser);
  const actions = selectQuickActions(tasks, []);
  const allAvailable = actions.every(t => t.state === "available");
  if (!allAvailable) throw new Error("В quickActions попала не-available задача");
});

test("включает только задачи с surfaces quickActions", () => {
  const tasks = buildDashboardTasks(newUser);
  const actions = selectQuickActions(tasks, []);
  const allHave = actions.every(t => t.surfaces.includes("quickActions"));
  if (!allHave) throw new Error("В quickActions задача без surface quickActions");
});

test("create-public-profile НЕ в quickActions (только nextSteps)", () => {
  const tasks = buildDashboardTasks(newUser);
  const actions = selectQuickActions(tasks, []);
  const ids = actions.map(t => t.id);
  expect(ids).notToContain("create-public-profile" as DashboardTaskId);
});

test("уважает limit в quickActions", () => {
  const tasks = buildDashboardTasks(newUser);
  const actions = selectQuickActions(tasks, [], 2);
  expect(actions.length).toBeLessThanOrEqual(2);
});

test("дедупликация: add-project не дублируется если уже в nextSteps", () => {
  const tasks = buildDashboardTasks(newUser);
  const steps = selectNextSteps(tasks);
  const stepIds = steps.map(t => t.id);
  const actions = selectQuickActions(tasks, stepIds);
  const ids = actions.map(t => t.id);
  // Если add-project был в steps, его не должно быть в actions
  if (stepIds.includes("add-project")) {
    expect(ids).notToContain("add-project" as DashboardTaskId);
  }
});

// ── Summary ───────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(40)}`);
console.log(`Итого: ${passed + failed} тестов — ✓ ${passed} прошло, ${failed > 0 ? `✗ ${failed} упало` : "0 упало"}`);
if (failed > 0) process.exit(1);
