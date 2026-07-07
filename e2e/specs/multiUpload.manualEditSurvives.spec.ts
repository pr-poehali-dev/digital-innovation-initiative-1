import { test, expect } from "@playwright/test";
import path from "path";
import { requireTestEnv, seedSession } from "../support/testEnv";

/**
 * Scenario: manual edits in the draft survive add-to-queue and retry.
 * - process files, edit a draft item's title and uncheck another
 * - add more files / retry a failed file
 * - previous edits must still be there afterwards
 *
 * NOT EXECUTED in the current sandbox (no headless browser available here).
 */
test.describe("dept-functions multi-upload — manual edits are preserved", () => {
  test.beforeEach(async ({ page }) => {
    const { sessionId, projectId } = requireTestEnv();
    await seedSession(page, sessionId);
    await page.goto(`/projects/${projectId}?tab=dept-functions`);
  });

  test("editing a draft item's title/checkbox survives a later add-to-queue run", async ({ page }) => {
    const fileInput = page.getByTestId("dept-func-image-input");
    await fileInput.setInputFiles([path.join(__dirname, "../fixtures/valid-page-1.png")]);
    await page.getByTestId("dept-func-run-queue-btn").click();

    const draft = page.getByTestId("dept-func-draft");
    await expect(draft).toBeVisible({ timeout: 20_000 });
    const draftItems = draft.getByTestId("dept-func-draft-item");
    await expect(draftItems.first()).toBeVisible();

    const titleInput = draftItems.first().getByTestId("dept-func-draft-item-title");
    await titleInput.fill("MANUALLY EDITED TITLE");
    const checkbox = draftItems.nth(1).getByTestId("dept-func-draft-item-checkbox");
    if (await draftItems.count() > 1) {
      await checkbox.uncheck();
    }

    // Add another file and run the queue — must not clobber the edits above.
    await fileInput.setInputFiles([path.join(__dirname, "../fixtures/valid-page-2.png")]);
    await page.getByTestId("dept-func-run-queue-btn").click();
    await page.waitForTimeout(500); // allow the new file's processing to start

    await expect(draftItems.first().getByTestId("dept-func-draft-item-title")).toHaveValue(
      "MANUALLY EDITED TITLE",
      { timeout: 20_000 }
    );
    if (await draftItems.count() > 1) {
      await expect(checkbox).not.toBeChecked();
    }
  });
});
