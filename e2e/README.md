# E2E tests — dept-functions multi-upload

## Status: prepared, NOT executed in a real browser

This suite (selectors, fixtures, specs) was written and is ready to run, but
**has not been executed against a real browser** in the sandbox that produced
it — that sandbox has no headless browser binaries installed and no way to
install one (`npx playwright install` requires downloading a browser build,
which this environment does not support). Everything in this folder was
validated logically:

- selectors (`data-testid`) exist in the actual rendered JSX (grep-verified)
- the underlying flows (multi-upload, retry, add-to-queue, drag-and-drop,
  confirm/persistence) were verified via direct API smoke-tests against the
  live backend during development (see project changelog/PR history) —
  the E2E specs assert the same behavior, just driven through the UI instead
  of raw HTTP calls
- `npx tsc --noEmit` passes with no errors introduced by this suite

**Do not report these specs as "passed" until someone actually runs
`npx playwright test` in an environment with a working browser.** The first
run should be treated as the real validation pass, and is likely to need
minor selector/timing tweaks — that's normal and expected for a first run.

## What's covered

| Spec file | Scenario |
|---|---|
| `multiUpload.happyPath.spec.ts` | Select 3 valid PNG/JPG, run queue, verify order, confirm |
| `multiUpload.partialSuccessRetry.spec.ts` | 2 valid + 1 broken file, retry only the broken one, no duplicates |
| `multiUpload.addToQueue.spec.ts` | Process 2 files, add 2 more without reset, only new ones re-processed |
| `multiUpload.manualEditSurvives.spec.ts` | Edit a draft item, add more files, edit survives |
| `multiUpload.dragAndDrop.spec.ts` | Drop valid files, mixed drop, duplicate filenames, blocked during processing |
| `multiUpload.confirmPersists.spec.ts` | Confirm batch, verify persistence via reload + direct API call |

## How to run this suite for real

1. Install a browser binary (not possible in this sandbox, but works in any
   normal dev machine / CI runner):
   ```bash
   npx playwright install chromium
   ```

2. Set up a disposable test session + project (do NOT point this at real
   product data). The project uses a `sessions` table row and a `projects`
   row owned by that session's user — see `db_migrations/` for examples of
   how the smoke-test fixtures for this feature were created/archived
   (search for `smoketest_dept_functions_session` in the migrations history
   for a concrete pattern: create a disposable session + project via a
   migration, run tests, then archive/expire them again — never delete rows
   directly, this project's tooling only allows INSERT/UPDATE via migrations).

3. Export the required env vars:
   ```bash
   export E2E_SESSION_ID="<a valid, non-expired sessions.id>"
   export E2E_PROJECT_ID="<id of the disposable test project>"
   export E2E_DEPT_FUNCTIONS_API_URL="<URL from func2url.json for dept-functions>"
   export E2E_BASE_URL="http://localhost:5173"   # optional, this is the default
   ```

4. Run the suite:
   ```bash
   npx playwright test
   ```

   Run a single spec while iterating:
   ```bash
   npx playwright test e2e/specs/multiUpload.happyPath.spec.ts
   ```

   Playwright's `webServer` config (see `playwright.config.ts`) will start
   `npm run dev` automatically unless `E2E_SKIP_WEBSERVER=1` is set (useful
   if you already have a dev server running).

## Fixtures

All fixtures live in `e2e/fixtures/` and are generated, disposable, non-secret
files (no real user data):

- `valid-page-1.png`, `valid-page-2.png`, `valid-page-3.jpg`, `valid-page-4.png`
  — synthetic "department regulation" screenshots with real OCR-able text,
  each describing a different fake department (sales/logistics/HR/finance)
- `broken.png` — has a `.png` name/extension but garbage bytes inside, used
  to force a real OCR/backend failure for the partial-success/retry specs
- `duplicate-name-source-a.png` / `-source-b.png` — two *different* images
  used by the drag-and-drop duplicate-filename spec, which forces both to be
  dropped under the exact same `File.name` ("same-name.png") to prove the
  app disambiguates by internal `source_id`, not by displayed filename
- `notes.txt`, `document.pdf` — used only for the mixed-drop unsupported-type
  test

Regenerate fixtures at any time with:
```bash
python3 e2e/fixtures/generate.py   # see script below if you need to recreate it
```
(The generation script used during development produced these with PIL/
DejaVuSans — see project changelog for the exact one-off command; fixtures
are checked into the repo so this isn't required for normal runs.)

## Cleanup

These specs create real `dept_functions` rows (with a unique
`dept_name` per run, e.g. `E2E confirm 1720000000000`) in whatever project
`E2E_PROJECT_ID` points to. Since this project's migration tool only allows
INSERT/UPDATE (no DELETE), the recommended pattern — same one used for manual
smoke-testing of this feature — is:

1. Point `E2E_PROJECT_ID` at a dedicated, already-archived-by-default test
   project (reactivate it via a migration only for the duration of the test
   run, then re-archive it afterwards).
2. After a run, mark any leftover rows for easy identification:
   ```sql
   UPDATE <schema>.dept_functions
   SET dept_name = '[E2E ARTIFACT - IGNORE]'
   WHERE dept_name LIKE 'E2E confirm %';
   ```
3. Re-archive the test project and expire the test session again.

Do not run this suite against a real user's project or an active session.

## Update: a real run was attempted during development (2026-07-07)

For transparency, here's exactly what was tried in the sandbox that authored
this suite, so the next person doesn't repeat the same dead end:

1. `npx playwright install chromium` **succeeded** — both the full Chrome
   binary (`chrome-linux64/chrome`, 265.7 MB) and the headless-shell variant
   (180.4 MB) downloaded completely and are valid ELF binaries (verified with
   `xxd`/`file`, correct sizes, not truncated).
2. Running `npx playwright test e2e/specs/multiUpload.happyPath.spec.ts`
   failed at browser launch with `spawn ... ENOENT` / the binary refused to
   run.
3. Root cause confirmed: this sandbox runs **Alpine Linux (musl libc)**, and
   the downloaded Chromium binaries are built against **glibc**. They are
   fundamentally ABI-incompatible — this is the same constraint documented
   elsewhere in this project's tooling (no conda/micromamba on this sandbox,
   for the same glibc-vs-musl reason). Installing a glibc compatibility layer
   (`apk add gcompat`) requires root, which is not available here.

**This is an environment limitation, not a problem with the specs or
selectors.** The suite itself was authored, is syntactically valid
TypeScript (`tsc --noEmit` passes), and the flows it exercises were
independently verified via direct API smoke-tests during development. It
will very likely run correctly as-is (possibly with minor timing/selector
tweaks, which is normal for a first real run) on any standard glibc-based
Linux/macOS/CI machine.

**Honest status: prepared and installable in principle, but still not
actually executed end-to-end in a browser, due to a sandbox libc
incompatibility rather than a lack of trying.**
