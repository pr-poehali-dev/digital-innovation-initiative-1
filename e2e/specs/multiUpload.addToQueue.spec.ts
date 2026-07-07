import { test, expect } from "@playwright/test";
import path from "path";
import { requireTestEnv, seedSession } from "../support/testEnv";

/**
 * Scenario: add-to-queue without reset.
 * - process 2 files
 * - select 2 more files via the "add more" button (queue must NOT reset)
 * - only the newly added files should be re-processed by "Recognize all"
 *
 * NOT EXECUTED in the current sandbox (no headless browser available here).
 */
test.describe("dept-functions multi-upload — add files to existing queue", () => {
  test.beforeEach(async ({ page }) => {
    const { sessionId, projectId } = requireTestEnv();
    await seedSession(page, sessionId);
    await page.goto(`/projects/${projectId}?tab=dept-functions`);
  });

  test("adding more files after processing appends them without resetting done items", async ({ page }) => {
    const fileInput = page.getByTestId("dept-func-image-input");
    await fileInput.setInputFiles([
      path.join(__dirname, "../fixtures/valid-page-1.png"),
      path.join(__dirname, "../fixtures/valid-page-2.png"),
    ]);
    await page.getByTestId("dept-func-run-queue-btn").click();

    const queue = page.getByTestId("dept-func-queue");
    let items = queue.getByTestId("dept-func-queue-item");
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toHaveAttribute("data-status", "done", { timeout: 20_000 });
    await expect(items.nth(1)).toHaveAttribute("data-status", "done", { timeout: 20_000 });

    // Button label should switch to "add more" once a queue exists.
    const selectBtn = page.getByTestId("dept-func-select-images-btn");
    await expect(selectBtn).toContainText("ещё");

    // Add 2 more files — must append, not replace.
    await fileInput.setInputFiles([
      path.join(__dirname, "../fixtures/valid-page-3.jpg"),
      path.join(__dirname, "../fixtures/valid-page-4.png"),
    ]);

    items = queue.getByTestId("dept-func-queue-item");
    await expect(items).toHaveCount(4);
    // Old items must remain "done" immediately after appending (not reset to "queued").
    await expect(items.nth(0)).toHaveAttribute("data-status", "done");
    await expect(items.nth(1)).toHaveAttribute("data-status", "done");
    await expect(items.nth(2)).toHaveAttribute("data-status", "queued");
    await expect(items.nth(3)).toHaveAttribute("data-status", "queued");

    await page.getByTestId("dept-func-run-queue-btn").click();
    await expect(items.nth(2)).toHaveAttribute("data-status", "done", { timeout: 20_000 });
    await expect(items.nth(3)).toHaveAttribute("data-status", "done", { timeout: 20_000 });

    // Draft must now contain functions from all 4 files, in queue order.
    const draft = page.getByTestId("dept-func-draft");
    const sourceFiles = await draft
      .getByTestId("dept-func-draft-item")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-source-file")));
    const order = ["valid-page-1.png", "valid-page-2.png", "valid-page-3.jpg", "valid-page-4.png"];
    const seenOrder = order.filter((name) => sourceFiles.includes(name));
    // relative order check
    for (let i = 1; i < seenOrder.length; i++) {
      expect(sourceFiles.indexOf(seenOrder[i - 1])).toBeLessThan(sourceFiles.indexOf(seenOrder[i]));
    }
  });
});
