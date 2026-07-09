import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

// Общий хелпер персистентности небольшого набора строковых фильтров/состояний.
// Приоритет источников: URL(query) → localStorage(per storageKey) → defaults.
// Синхронизация: localStorage + URL (replace, без засорения истории браузера).
// Управляет ТОЛЬКО объявленными ключами — прочие query-параметры (tab/preset/…) не трогает.
//
// paramKeys — карта: логическое имя → имя query-параметра в URL.
// validate  — опциональная нормализация значений (недопустимое → default).

type StrMap = Record<string, string>;

interface Options<T extends StrMap> {
  storageKey: string;                 // напр. `cabinet:rollup:${projectId}:state`
  defaults: T;                        // дефолтные значения
  paramKeys: Record<keyof T, string>; // логич.ключ → query-param
  validate?: (raw: Partial<T>) => T;  // нормализация (URL и LS ненадёжны)
}

function readStorage<T extends StrMap>(storageKey: string): Partial<T> | null {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as Partial<T>) : null;
  } catch {
    return null;
  }
}

function writeStorage<T extends StrMap>(storageKey: string, value: T) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    /* localStorage может быть недоступен — не критично */
  }
}

export function usePersistentSearchState<T extends StrMap>(opts: Options<T>) {
  const { storageKey, defaults, paramKeys, validate } = opts;
  const [searchParams, setSearchParams] = useSearchParams();
  const normalize = useRef(validate || ((r: Partial<T>) => ({ ...defaults, ...r } as T)));

  // Начальное разрешение: URL приоритет → localStorage → defaults
  const initial = useRef<T>(
    (() => {
      const fromUrl: Partial<T> = {};
      let hasUrl = false;
      (Object.keys(paramKeys) as (keyof T)[]).forEach((k) => {
        const v = searchParams.get(paramKeys[k]);
        if (v !== null) { fromUrl[k] = v as T[keyof T]; hasUrl = true; }
      });
      const stored = readStorage<T>(storageKey);
      const merged = hasUrl ? { ...(stored || {}), ...fromUrl } : (stored || {});
      return normalize.current(merged);
    })(),
  );

  const [state, setStateRaw] = useState<T>(initial.current);

  // Синхронизация URL + localStorage при изменении state
  useEffect(() => {
    writeStorage(storageKey, state);
    const next = new URLSearchParams(searchParams);
    let changed = false;
    (Object.keys(paramKeys) as (keyof T)[]).forEach((k) => {
      const param = paramKeys[k];
      const val = state[k];
      const isDefault = val === defaults[k] || val === "" || val === undefined;
      if (isDefault) {
        if (next.has(param)) { next.delete(param); changed = true; }
      } else if (next.get(param) !== val) {
        next.set(param, val as string); changed = true;
      }
    });
    if (changed) setSearchParams(next, { replace: true });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [state, storageKey]);

  const setState = useCallback((patch: Partial<T>) => {
    setStateRaw((prev) => normalize.current({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => setStateRaw(defaults), [defaults]);

  return { state, setState, reset };
}
