import type { Page, Locator } from "@playwright/test";

/**
 * Simulates a real OS drag-and-drop of files onto a drop target inside the
 * browser, using DataTransfer + synthetic dragenter/dragover/drop events.
 * Playwright has no native "drop files" API, so this is the standard
 * workaround: read the files as buffers in Node, then construct File objects
 * and a DataTransfer inside the page context via page.evaluate, dispatched
 * on the target element.
 *
 * mixedNames: optional map to force a specific `.name` on a given fixture
 * path (used by the duplicate-filename test, where two different fixture
 * files need to be dropped under the exact same File.name).
 */
export async function dropFiles(
  page: Page,
  target: Locator,
  filePaths: string[],
  opts?: { names?: string[] }
) {
  const fs = await import("fs");
  const path = await import("path");

  const files = filePaths.map((filePath, i) => {
    const buffer = fs.readFileSync(filePath);
    const name = opts?.names?.[i] || path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime =
      ext === ".png" ? "image/png" :
      ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
      ext === ".pdf" ? "application/pdf" :
      ext === ".txt" ? "text/plain" : "application/octet-stream";
    return { name, mime, base64: buffer.toString("base64") };
  });

  const handle = await target.elementHandle();
  if (!handle) throw new Error("dropFiles: target element not found");

  await page.evaluate(
    ({ files, el }) => {
      const dt = new DataTransfer();
      for (const f of files) {
        const byteChars = atob(f.base64);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
        const byteArray = new Uint8Array(byteNumbers);
        const file = new File([byteArray], f.name, { type: f.mime });
        dt.items.add(file);
      }
      const target = el as HTMLElement;
      const fire = (type: string) => {
        const evt = new Event(type, { bubbles: true, cancelable: true }) as DragEvent & { dataTransfer?: DataTransfer };
        Object.defineProperty(evt, "dataTransfer", { value: dt });
        target.dispatchEvent(evt);
      };
      fire("dragenter");
      fire("dragover");
      fire("drop");
    },
    { files, el: handle }
  );
}
