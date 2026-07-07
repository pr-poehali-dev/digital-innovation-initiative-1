import { test, expect } from "@playwright/test";
import path from "path";
import { requireTestEnv, seedSession } from "../support/testEnv";

/**
 * Scenario: confirm after a multi-upload batch actually persists to the backend,
 * verified both through the UI (functions list re-renders) and directly via the
 * dept-functions API (?action=functions) using the same session — the same
 * approach used for manual verification of this feature (see PR history /
 * conversation log for the raw curl-based checks against the live API).
 *
 * NOT EXECUTED in the current sandbox (no headless browser available here).
 */
test.describe("dept-functions multi-upload — confirm persists", () => {
  test.beforeEach(async ({ page }) => {
    const { sessionId, projectId } = requireTestEnv();
    await seedSession(page, sessionId);
    await page.goto(`/projects/${projectId}?tab=dept-functions`);
  });

  test("confirming a multi-file draft persists all functions and they reappear after reload", async ({ page }) => {
    const { sessionId, projectId } = requireTestEnv();
    const uniqueDeptName = `E2E confirm ${Date.now()}`;

    await page.getByPlaceholder("Название подразделения").first().fill(uniqueDeptName);
    const fileInput = page.getByTestId("dept-func-image-input");
    await fileInput.setInputFiles([
      path.join(__dirname, "../fixtures/valid-page-1.png"),
      path.join(__dirname, "../fixtures/valid-page-2.png"),
    ]);
    await page.getByTestId("dept-func-run-queue-btn").click();

    const draft = page.getByTestId("dept-func-draft");
    await expect(draft).toBeVisible({ timeout: 20_000 });
    const draftCountBeforeConfirm = await draft.getByTestId("dept-func-draft-item").count();
    expect(draftCountBeforeConfirm).toBeGreaterThan(0);

    await page.getByTestId("dept-func-confirm-draft-btn").click();
    await expect(page.getByTestId("dept-func-confirm-result")).toBeVisible({ timeout: 15_000 });

    // Reload the page — functions must come back from the backend, not from local state.
    await page.reload();
    await expect(page.getByText(uniqueDeptName)).toBeVisible({ timeout: 15_000 });

    // Cross-check directly against the backend API using the same session,
    // independent of whatever the UI renders.
    const apiResponse = await page.request.get(
      `${process.env.E2E_DEPT_FUNCTIONS_API_URL}/?action=functions&project_id=${projectId}`,
      { headers: { "X-Session-Id": sessionId } }
    );
    expect(apiResponse.ok()).toBeTruthy();
    const body = await apiResponse.json();
    const savedForThisRun = (body.functions || []).filter((f: { dept_name: string }) => f.dept_name === uniqueDeptName);
    expect(savedForThisRun.length).toBe(draftCountBeforeConfirm);
  });
});
