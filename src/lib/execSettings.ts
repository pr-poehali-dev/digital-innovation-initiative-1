import { useEffect, useState } from "react";

const KEY = "exec_cabinet_settings";

export interface ExecSettings {
  showHistory: boolean;
}

const DEFAULTS: ExecSettings = {
  showHistory: false,
};

export function readSettings(): ExecSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export function writeSettings(next: Partial<ExecSettings>) {
  const merged = { ...readSettings(), ...next };
  localStorage.setItem(KEY, JSON.stringify(merged));
  window.dispatchEvent(new CustomEvent("exec-settings-changed", { detail: merged }));
  return merged;
}

export function useExecSettings(): [ExecSettings, (n: Partial<ExecSettings>) => void] {
  const [settings, setSettings] = useState<ExecSettings>(readSettings);

  useEffect(() => {
    const onChange = (e: Event) => {
      setSettings((e as CustomEvent<ExecSettings>).detail);
    };
    window.addEventListener("exec-settings-changed", onChange);
    return () => window.removeEventListener("exec-settings-changed", onChange);
  }, []);

  return [settings, (n) => setSettings(writeSettings(n))];
}
