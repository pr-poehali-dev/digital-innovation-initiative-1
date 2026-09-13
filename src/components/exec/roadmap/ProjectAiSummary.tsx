import { useState } from "react";
import Icon from "@/components/ui/icon";
import { plannerApi, ManagementSummary, ManagementSummaryMode } from "@/lib/execPlannerApi";

const MODE_OPTIONS: { mode: ManagementSummaryMode; label: string; icon: string }[] = [
  { mode: "overview", label: "Кратко о проекте", icon: "Eye" },
  { mode: "schedule_deviation", label: "Отклонения сроков", icon: "GitCompare" },
  { mode: "overdue", label: "Просроченные задачи и вехи", icon: "CalendarX" },
  { mode: "critical_path", label: "Критический путь", icon: "Zap" },
  { mode: "risks", label: "Риски и проблемы", icon: "ShieldAlert" },
  { mode: "resource_conflicts", label: "Ресурсные конфликты", icon: "Users" },
  { mode: "goals_kpi", label: "Цели и KPI", icon: "Target" },
  { mode: "management_note", label: "Черновик управленческой справки", icon: "FileEdit" },
];

/** AI-помощник руководителя — только рекомендательный режим: собирает уже
 * существующие данные проекта (сроки, отклонения, риски, ресурсы) и просит
 * модель сформулировать ответ. Ничего не сохраняет, не переносит сроки,
 * не меняет бюджет/KPI/назначения — доступен только владельцу кабинета. */
export default function ProjectAiSummary({ projectId }: { projectId: number }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ManagementSummary | null>(null);
  const [error, setError] = useState("");
  const [disabled, setDisabled] = useState(false);
  const [copied, setCopied] = useState(false);

  const ask = async (mode: ManagementSummaryMode) => {
    setLoading(true);
    setError("");
    setDisabled(false);
    setResult(null);
    try {
      const r = await plannerApi.managementSummary(projectId, mode);
      setResult(r);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("отключена") || msg.includes("не настроен")) setDisabled(true);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-medium text-violet-800"
      >
        <span className="flex items-center gap-2">
          <Icon name="Sparkles" size={15} /> AI-помощник руководителя
        </span>
        <Icon name={open ? "ChevronUp" : "ChevronDown"} size={15} />
      </button>

      {open && (
        <div className="px-3.5 pb-3.5 space-y-3">
          <p className="text-[11px] text-violet-600/80 leading-relaxed">
            Только рекомендательный режим: читает уже существующие данные проекта, ничего не меняет и не сохраняет.
            Ответ формируется YandexGPT — проверяйте перед использованием.
          </p>

          <div className="flex flex-wrap gap-1.5">
            {MODE_OPTIONS.map((o) => (
              <button
                key={o.mode}
                onClick={() => ask(o.mode)}
                disabled={loading}
                className={`text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
                  result?.mode === o.mode
                    ? "border-violet-400 bg-violet-100 text-violet-800"
                    : "border-violet-200 bg-white text-violet-700 hover:bg-violet-50"
                }`}
              >
                <Icon name={o.icon} size={12} /> {o.label}
              </button>
            ))}
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-xs text-violet-600 py-2">
              <div className="w-3.5 h-3.5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              Собираю данные и формирую ответ...
            </div>
          )}

          {disabled && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
              <Icon name="Info" size={14} className="flex-shrink-0 mt-0.5" />
              <span>
                ИИ не настроен или отключён владельцем платформы. Включите модуль «AI-помощник руководителя»
                в разделе «Настройки AI» (/cabinet/exec/ai-settings).
              </span>
            </div>
          )}

          {error && !disabled && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>
          )}

          {result && (
            <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 flex items-center gap-1">
                  <Icon name="Sparkles" size={9} /> Сформировано ИИ ({result.generated_by})
                </span>
                <button onClick={copy} className="text-[11px] text-slate-400 hover:text-violet-700 flex items-center gap-1">
                  <Icon name="Copy" size={11} /> {copied ? "Скопировано" : "Копировать"}
                </button>
              </div>
              <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{result.answer}</div>
              <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-1.5 text-[10px] text-slate-400">
                <span>Использованные данные:</span>
                {Object.entries(result.data_used).map(([k, v]) => (
                  <span key={k} className="px-1.5 py-0.5 rounded bg-slate-50">{k}: {String(v)}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
