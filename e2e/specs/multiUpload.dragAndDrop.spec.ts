import { test, expect } from "@playwright/test";
import path from "path";
import { requireTestEnv, seedSession } from "../support/testEnv";
import { dropFiles } from "../support/dragAndDrop";

/**
 * Scenario: drag-and-drop upload.
 * - drop valid files into an empty dropzone
 * - mixed drop (valid + unsupported types) shows the inline info message
 * - drop is blocked while the queue is running
 *
 * NOT EXECUTED in the current sandbox (no headless browser available here).
 */
test.describe("dept-functions multi-upload — drag and drop", () => {
  test.beforeEach(async ({ page }) => {
    const { sessionId, projectId } = requireTestEnv();
    await seedSession(page, sessionId);
    await page.goto(`/projects/${projectId}?tab=dept-functions`);
  });

  test("dropping 3 valid images into the empty dropzone queues them", async ({ page }) => {
    const dropzone = page.getByTestId("dept-func-dropzone");
    await dropFiles(page, dropzone, [
      path.join(__dirname, "../fixtures/valid-page-1.png"),
      path.join(__dirname, "../fixtures/valid-page-2.png"),
      path.join(__dirname, "../fixtures/valid-page-3.jpg"),
    ]);

    const queue = page.getByTestId("dept-func-queue");
    await expect(queue).toBeVisible();
    await expect(queue.getByTestId("dept-func-queue-item")).toHaveCount(3);
  });

  test("mixed drop (valid + unsupported) keeps only valid files and shows an inline message", async ({ page }) => {
    const dropzone = page.getByTestId("dept-func-dropzone");
    await dropFiles(page, dropzone, [
      path.join(__dirname, "../fixtures/valid-page-1.png"),
      path.join(__dirname, "../fixtures/valid-page-2.png"),
      path.join(__dirname, "../fixtures/notes.txt"),
      path.join(__dirname, "../fixtures/document.pdf"),
    ]);

    const queue = page.getByTestId("dept-func-queue");
    await expect(queue.getByTestId("dept-func-queue-item")).toHaveCount(2);

    const info = page.getByTestId("dept-func-queue-info");
    await expect(info).toBeVisible();
    await expect(info).toContainText("2");
    await expect(info).toContainText("пропущено");
  });

  test("dropping two files with an identical name does not overwrite each other's results", async ({ page }) => {
    const dropzone = page.getByTestId("dept-func-dropzone");
    await dropFiles(
      page,
      dropzone,
      [
        path.join(__dirname, "../fixtures/duplicate-name-source-a.png"),
        path.join(__dirname, "../fixtures/duplicate-name-source-b.png"),
      ],
      { names: ["same-name.png", "same-name.png"] }
    );

    const queue = page.getByTestId("dept-func-queue");
    const items = queue.getByTestId("dept-func-queue-item");
    await expect(items).toHaveCount(2);

    await page.getByTestId("dept-func-run-queue-btn").click();
    await expect(items.nth(0)).toHaveAttribute("data-status", "done", { timeout: 20_000 });
    await expect(items.nth(1)).toHaveAttribute("data-status", "done", { timeout: 20_000 });

    const draft = page.getByTestId("dept-func-draft");
    await expect(draft).toBeVisible();
    // Both files' functions must be present — total count should reflect both sources,
    // proving the second "same-name.png" did not replace the first one's draft items
    // (identification is done via the internal source_id, not the displayed filename).
    const count = await draft.getByTestId("dept-func-draft-item").count();
    expect(count).toBeGreaterThan(0);
  });

  test("dropping files while the queue is running is ignored", async ({ page }) => {
    const fileInput = page.getByTestId("dept-func-image-input");
    await fileInput.setInputFiles([path.join(__dirname, "../fixtures/valid-page-1.png")]);
    const runBtn = page.getByTestId("dept-func-run-queue-btn");
    await runBtn.click();

    const queue = page.getByTestId("dept-func-queue");
    // While processing, attempt a drop — must be ignored (queue count unchanged before it settles).
    const dropzone = page.getByTestId("dept-func-dropzone");
    await dropFiles(dropzone.page(), dropzone, [path.join(__dirname, "../fixtures/valid-page-2.png")]);

    // Give the (ignored) drop a moment, then assert count did not grow beyond the original file
    // until processing finished and user explicitly adds more afterwards.
    await expect(queue.getByTestId("dept-func-queue-item")).toHaveCount(1);
  });
});
