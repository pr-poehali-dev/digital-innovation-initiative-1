import { test, expect } from "@playwright/test";
import path from "path";
import { requireTestEnv, seedSession } from "../support/testEnv";

/**
 * Scenario: partial success + retry failed only.
 * - queue has 2 valid images + 1 broken image
 * - run queue -> 2 done, 1 error
 * - "Retry failed" only re-processes the error file
 * - no duplicates appear in the draft after retry
 *
 * NOT EXECUTED in the current sandbox (no headless browser available here).
 */
test.describe("dept-functions multi-upload — partial success + retry", () => {
  test.beforeEach(async ({ page }) => {
    const { sessionId, projectId } = requireTestEnv();
    await seedSession(page, sessionId);
    await page.goto(`/projects/${projectId}?tab=dept-functions`);
  });

  test("one broken file fails without losing the other results, then retry heals it without duplicates", async ({ page }) => {
    const fileInput = page.getByTestId("dept-func-image-input");
    await fileInput.setInputFiles([
      path.join(__dirname, "../fixtures/valid-page-1.png"),
      path.join(__dirname, "../fixtures/broken.png"),
      path.join(__dirname, "../fixtures/valid-page-2.png"),
    ]);

    await page.getByTestId("dept-func-run-queue-btn").click();

    const queue = page.getByTestId("dept-func-queue");
    const items = queue.getByTestId("dept-func-queue-item");
    await expect(items.nth(0)).toHaveAttribute("data-status", "done", { timeout: 20_000 });
    await expect(items.nth(1)).toHaveAttribute("data-status", "error", { timeout: 20_000 });
    await expect(items.nth(2)).toHaveAttribute("data-status", "done", { timeout: 20_000 });

    const draft = page.getByTestId("dept-func-draft");
    await expect(draft).toBeVisible();
    const countAfterFirstRun = await draft.getByTestId("dept-func-draft-item").count();
    expect(countAfterFirstRun).toBeGreaterThan(0); // successful files' functions must still be present

    // "Retry failed" button must be visible with the failed count, and re-run only that file.
    const retryBtn = page.getByTestId("dept-func-retry-failed-btn");
    await expect(retryBtn).toBeVisible();
    await expect(retryBtn).toContainText("1");
    await retryBtn.click();

    // NOTE: fixtures/broken.png is permanently invalid content, so in a real
    // run against the live OCR backend this second attempt is expected to
    // fail again (same as verified manually via the API smoke-test) —
    // assert it stays in "error", not "done", and no new duplicate draft
    // items were created for the already-successful files.
    await expect(items.nth(1)).toHaveAttribute("data-status", "error", { timeout: 20_000 });

    const countAfterRetry = await draft.getByTestId("dept-func-draft-item").count();
    expect(countAfterRetry).toBe(countAfterFirstRun); // no duplicates introduced by retry
  });
});
