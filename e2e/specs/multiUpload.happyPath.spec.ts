import { test, expect } from "@playwright/test";
import path from "path";
import { requireTestEnv, seedSession } from "../support/testEnv";

/**
 * Scenario: multi-upload happy path.
 * - select several valid PNG/JPG files via the file input
 * - run the queue
 * - verify draft order matches selection order and confirm persists it
 *
 * NOT EXECUTED in the current sandbox (no headless browser available here).
 * See e2e/README.md for how to actually run this.
 */
test.describe("dept-functions multi-upload — happy path", () => {
  test.beforeEach(async ({ page }) => {
    const { sessionId, projectId } = requireTestEnv();
    await seedSession(page, sessionId);
    await page.goto(`/projects/${projectId}?tab=dept-functions`);
  });

  test("selecting 3 valid images processes them in order and produces a combined draft", async ({ page }) => {
    const dropzone = page.getByTestId("dept-func-dropzone");
    await expect(dropzone).toBeVisible();

    const fileInput = page.getByTestId("dept-func-image-input");
    await fileInput.setInputFiles([
      path.join(__dirname, "../fixtures/valid-page-1.png"),
      path.join(__dirname, "../fixtures/valid-page-2.png"),
      path.join(__dirname, "../fixtures/valid-page-3.jpg"),
    ]);

    const queue = page.getByTestId("dept-func-queue");
    await expect(queue).toBeVisible();
    const items = queue.getByTestId("dept-func-queue-item");
    await expect(items).toHaveCount(3);

    // Order must match selection order.
    await expect(items.nth(0)).toHaveAttribute("data-file-name", "valid-page-1.png");
    await expect(items.nth(1)).toHaveAttribute("data-file-name", "valid-page-2.png");
    await expect(items.nth(2)).toHaveAttribute("data-file-name", "valid-page-3.jpg");

    await page.getByTestId("dept-func-run-queue-btn").click();

    // Wait until all items report a terminal status.
    await expect(items.nth(0)).toHaveAttribute("data-status", "done", { timeout: 20_000 });
    await expect(items.nth(1)).toHaveAttribute("data-status", "done", { timeout: 20_000 });
    await expect(items.nth(2)).toHaveAttribute("data-status", "done", { timeout: 20_000 });

    const draft = page.getByTestId("dept-func-draft");
    await expect(draft).toBeVisible();
    const draftItems = draft.getByTestId("dept-func-draft-item");
    const count = await draftItems.count();
    expect(count).toBeGreaterThan(0);

    // source_file order should follow queue order: all page-1 items before page-2, etc.
    const sourceFiles = await draftItems.evaluateAll((els) => els.map((el) => el.getAttribute("data-source-file")));
    const firstIdxByFile = (name: string) => sourceFiles.indexOf(name);
    expect(firstIdxByFile("valid-page-1.png")).toBeLessThan(firstIdxByFile("valid-page-2.png"));
    expect(firstIdxByFile("valid-page-2.png")).toBeLessThan(firstIdxByFile("valid-page-3.jpg"));

    await page.getByTestId("dept-func-confirm-draft-btn").click();
    await expect(page.getByTestId("dept-func-confirm-result")).toBeVisible({ timeout: 15_000 });
    await expect(draft).not.toBeVisible();
  });
});
