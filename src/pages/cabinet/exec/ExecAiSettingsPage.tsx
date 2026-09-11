import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { Empty, ErrorBox, Loading, fmtDate } from "@/components/exec/ExecUI";
import { aiSettingsApi, AiModuleSetting, AiLogItem } from "@/lib/aiSettingsApi";

const SERVICE_LABEL: Record<string, string> = {
  YandexGPT: "YandexGPT",
  "Vision/SpeechKit": "Yandex Vision / SpeechKit",
};

const RESULT_STYLE: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700",
  disabled: "bg-slate-100 text-slate-500",
  error: "bg-red-100 text-red-700",
};

const RESULT_LABEL: Record<string, string> = {
  success: "Выполнено",
  disabled: "Отклонено (модуль выключен)",
  error: "Ошибка",
};

export default function ExecAiSettingsPage() {
  const [globalEnabled, setGlobalEnabled] = useState(false);
  const [modules, setModules] = useState<AiModuleSetting[]>([]);
  const [log, setLog] = useState<AiLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);

  const load = () => {
    setLoading(true);
    setError("");
    aiSettingsApi
      .list()
      .then((d) => {
        setGlobalEnabled(d.global_enabled);
        setModules(d.modules);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const loadLog = () => {
    aiSettingsApi
      .log(100)
      .then((d) => setLog(d.items))
      .catch((e) => setError((e as Error).message));
  };

  useEffect(() => {
    if (showLog) loadLog();
  }, [showLog]);

  const toggleGlobal = async () => {
    setBusy("__global__");
    try {
      const next = !globalEnabled;
      await aiSettingsApi.setGlobal(next);
      setGlobalEnabled(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const toggleModule = async (m: AiModuleSetting) => {
    setBusy(m.module_code);
    try {
      const next = !m.is_enabled;
      await aiSettingsApi.setModule(m.module_code, next);
      setModules((prev) =>
        prev.map((x) => (x.module_code === m.module_code ? { ...x, is_enabled: next } : x)),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Icon name="ShieldCheck" size={22} className="text-violet-600" />
            Настройки AI
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Управление передачей данных во внешние AI-сервисы (YandexGPT, Vision, SpeechKit).
            По умолчанию всё выключено — включайте только те модули, которыми пользуетесь.
          </p>
        </div>

        {error && <ErrorBox message={error} onRetry={load} />}

        {loading ? (
          <Loading />
        ) : (
          <>
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between p-4">
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    Внешняя AI-обработка
                    {!globalEnabled && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                        отключена
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Общий выключатель. Пока он выключен — ни один модуль не может обратиться к внешнему AI,
                    даже если включён отдельно.
                  </div>
                </div>
                <Switch
                  checked={globalEnabled}
                  disabled={busy === "__global__"}
                  onCheckedChange={toggleGlobal}
                />
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold mb-2 text-muted-foreground">
                Модули ({modules.filter((m) => m.effective_enabled).length} из {modules.length} фактически активно)
              </div>
              <div className="space-y-2">
                {modules.map((m) => (
                  <div key={m.module_code} className="rounded-xl border border-slate-200 bg-white">
                    <div className="flex items-center justify-between p-3.5">
                      <div className="min-w-0 flex-1 pr-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{m.module_label}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {SERVICE_LABEL[m.service] || m.service}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-200">
                            {m.trigger_type === "manual" ? "по действию" : "автоматически"}
                          </span>
                        </div>
                        {m.data_description && (
                          <div className="text-xs text-muted-foreground mt-1">{m.data_description}</div>
                        )}
                        {m.emergency_env_state === "unverified" && (
                          <div className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2 py-1.5">
                            <Icon name="ShieldAlert" size={13} className="text-amber-600 mt-0.5 flex-shrink-0" />
                            <span className="text-[11px] text-amber-800 leading-snug">
                              Дополнительно защищён аварийным серверным переключателем
                              {m.emergency_env_flag ? ` ${m.emergency_env_flag}` : ""}. Его состояние
                              задаётся в окружении самой функции и отсюда не проверяется — считаем
                              блокировку действующей до её официального снятия.
                            </span>
                          </div>
                        )}
                        <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-3">
                          {m.last_used_at ? (
                            <span>Последний вызов: {fmtDate(m.last_used_at)}</span>
                          ) : (
                            <span>Ещё не использовался</span>
                          )}
                          {m.last_result && (
                            <span className={`px-1.5 py-0.5 rounded ${RESULT_STYLE[m.last_result] || ""}`}>
                              {RESULT_LABEL[m.last_result] || m.last_result}
                            </span>
                          )}
                        </div>
                      </div>
                      <Switch
                        checked={m.is_enabled}
                        disabled={busy === m.module_code}
                        onCheckedChange={() => toggleModule(m)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <button
                onClick={() => setShowLog((v) => !v)}
                className="text-sm font-medium text-violet-600 flex items-center gap-1.5 hover:text-violet-700"
              >
                <Icon name={showLog ? "ChevronDown" : "ChevronRight"} size={16} />
                Журнал AI-операций
              </button>
              {showLog && (
                <div className="mt-3">
                  {log.length === 0 ? (
                    <Empty text="Вызовов ещё не было" icon="ScrollText" />
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-white">
                      <div className="divide-y divide-slate-100">
                        {log.map((item) => (
                          <div key={item.id} className="p-3 text-xs flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{item.module_code}</span>
                                <span className="text-muted-foreground">{item.service}</span>
                                <span className="text-muted-foreground">{item.action}</span>
                                {item.data_kind && (
                                  <span className="text-muted-foreground">· {item.data_kind}</span>
                                )}
                              </div>
                              {item.error_message && (
                                <div className="text-red-600 mt-0.5 truncate">{item.error_message}</div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={`px-1.5 py-0.5 rounded ${RESULT_STYLE[item.result] || "bg-slate-100"}`}>
                                {RESULT_LABEL[item.result] || item.result}
                              </span>
                              <span className="text-muted-foreground">{fmtDate(item.created_at)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}