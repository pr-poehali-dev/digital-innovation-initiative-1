import { useEffect, useState } from "react";

/** Состояние экрана, которое переживает переход на другую страницу и перезагрузку */
export function useStickyState<T>(key: string, initial: T): [T, (v: T) => void] {
  const storageKey = `exec_ui_${key}`;

  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Хранилище недоступно — работаем без сохранения
    }
  }, [storageKey, value]);

  return [value, setValue];
}

/** Сбрасывает сохранённые настройки экрана */
export function clearStickyState(keys: string[]) {
  keys.forEach((k) => {
    try {
      localStorage.removeItem(`exec_ui_${k}`);
    } catch {
      // не критично
    }
  });
}
