export type ImportResult = {
  created: number;
  auto_linked: number;
  left_unmatched: number;
  unmatched_function_ids?: number[];
  coverage_status_after?: string;
  at: number;
};

const KEY = (projectId: number) => `dept_import_result_${projectId}`;

export function savePostImportResult(projectId: number, r: Omit<ImportResult, "at">) {
  try {
    sessionStorage.setItem(KEY(projectId), JSON.stringify({ ...r, at: Date.now() }));
  } catch { /* ignore */ }
}

export function readPostImportResult(projectId: number): ImportResult | null {
  try {
    const raw = sessionStorage.getItem(KEY(projectId));
    return raw ? (JSON.parse(raw) as ImportResult) : null;
  } catch {
    return null;
  }
}

export function clearPostImportResult(projectId: number) {
  try {
    sessionStorage.removeItem(KEY(projectId));
  } catch { /* ignore */ }
}