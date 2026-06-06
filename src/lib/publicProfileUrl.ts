// Единый источник для построения публичных URL профиля.
// Использует VITE_PUBLIC_BASE_URL из env, иначе window.location.origin.

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getPublicBaseUrl(): string {
  const envValue = (import.meta.env.VITE_PUBLIC_BASE_URL as string | undefined)?.trim();
  if (envValue) return trimSlash(envValue);
  if (typeof window !== "undefined" && window.location?.origin) {
    return trimSlash(window.location.origin);
  }
  return "";
}

export function buildPublicProfileUrl(slug?: string | null): string {
  if (!slug) return "";
  const base = getPublicBaseUrl();
  if (!base) return "";
  return `${base}/p/${encodeURIComponent(slug)}`;
}

export function buildPublicProfilePath(slug?: string | null): string {
  if (!slug) return "";
  return `/p/${encodeURIComponent(slug)}`;
}
