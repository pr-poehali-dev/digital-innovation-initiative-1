// Персистентность фильтров списка функций: URL(query) приоритет → localStorage(per project) → дефолт.
// Короткие коды в URL для стабильности ссылок.

import type { DecisionFilterGroup } from "@/components/dept/decisionNextStep";

export type ProfileFilter = "all" | "empty" | "partial" | "full";

const DF_TO_CODE: Record<DecisionFilterGroup, string> = {
  all: "all", no_shortlist: "shortlist", no_preferred: "preferred", problems: "issues", pilot_ready: "ready",
};
const CODE_TO_DF: Record<string, DecisionFilterGroup> = {
  all: "all", shortlist: "no_shortlist", preferred: "no_preferred", issues: "problems", ready: "pilot_ready",
};
const PF_VALUES: ProfileFilter[] = ["all", "empty", "partial", "full"];

export const dfToCode = (v: DecisionFilterGroup) => DF_TO_CODE[v];
export const codeToDf = (c: string | null): DecisionFilterGroup | null => (c && CODE_TO_DF[c]) || null;
export const pfFromCode = (c: string | null): ProfileFilter | null => (c && PF_VALUES.includes(c as ProfileFilter) ? (c as ProfileFilter) : null);

const lsKey = (projectId: number) => `cabinet:functions:${projectId}:filters`;

export function readStored(projectId: number): { df: DecisionFilterGroup; pf: ProfileFilter } | null {
  try {
    const raw = localStorage.getItem(lsKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const df = codeToDf(parsed.df) || "all";
    const pf = pfFromCode(parsed.pf) || "all";
    return { df, pf };
  } catch {
    return null;
  }
}

export function writeStored(projectId: number, df: DecisionFilterGroup, pf: ProfileFilter) {
  try {
    localStorage.setItem(lsKey(projectId), JSON.stringify({ df: dfToCode(df), pf }));
  } catch {
    /* localStorage может быть недоступен — не критично */
  }
}

// Разрешение начального состояния: URL приоритет → localStorage → дефолт all.
export function resolveInitialFilters(
  projectId: number,
  urlDf: string | null,
  urlPf: string | null,
): { df: DecisionFilterGroup; pf: ProfileFilter } {
  const fromUrlDf = codeToDf(urlDf);
  const fromUrlPf = pfFromCode(urlPf);
  if (fromUrlDf || fromUrlPf) {
    const stored = readStored(projectId);
    return {
      df: fromUrlDf || stored?.df || "all",
      pf: fromUrlPf || stored?.pf || "all",
    };
  }
  const stored = readStored(projectId);
  return stored || { df: "all", pf: "all" };
}
