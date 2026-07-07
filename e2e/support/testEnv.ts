/**
 * Test environment configuration for dept-functions multi-upload E2E specs.
 *
 * These specs need an authenticated session pointing at a disposable test
 * project (so runs never touch real product data). Provide the following
 * env vars when running the suite:
 *
 *   E2E_SESSION_ID    - a valid sessions.id for a test user (see e2e/README.md
 *                        for how the smoke-test session was created via
 *                        migrations during manual verification of this feature)
 *   E2E_PROJECT_ID    - id of a disposable/test project owned by that user
 *   E2E_BASE_URL       - defaults to http://localhost:5173
 *
 * If these are not set, specs that need them will be skipped with a clear
 * message rather than failing noisily or fabricating a session.
 */
export const E2E_SESSION_ID = process.env.E2E_SESSION_ID || "";
export const E2E_PROJECT_ID = process.env.E2E_PROJECT_ID || "";

export function requireTestEnv(): { sessionId: string; projectId: string } {
  if (!E2E_SESSION_ID || !E2E_PROJECT_ID) {
    throw new Error(
      "E2E_SESSION_ID and E2E_PROJECT_ID must be set to run dept-functions E2E specs. " +
        "See e2e/README.md for setup instructions."
    );
  }
  return { sessionId: E2E_SESSION_ID, projectId: E2E_PROJECT_ID };
}

/** Injects the session into localStorage the same way the app's login flow does (see src/lib/api.ts getSession()). */
export async function seedSession(page: import("@playwright/test").Page, sessionId: string) {
  await page.addInitScript((sid) => {
    window.localStorage.setItem("session_id", sid);
  }, sessionId);
}
