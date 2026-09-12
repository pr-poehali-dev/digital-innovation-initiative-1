import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Empty, ErrorBox, Loading, fmtDate } from "@/components/exec/ExecUI";
import { execPortfolioApi, ExecResult, ExecEffect } from "@/lib/execPortfolioApi";
import { goalsApi } from "@/lib/execGoalsApi";

const CONFIRM_LABEL: Record<string, string> = {
  not_confirmed: "Не подтверждён", pending_review: "На проверке",
  confirmed: "Подтверждён", disputed: "Оспаривается",
};
const CONFIRM_CLS: Record<string, string> = {
  not_confirmed: "bg-slate-100 text-slate-600", pending_review: "bg-amber-50 text-amber-700",
  confirmed: "bg-emerald-100 text-emerald-700", disputed: "bg-red-100 text-red-700",
};

/** Результаты и эффекты — переиспользует существующие exec_result/exec_effect
 * через execPortfolioApi, дубликатов не создаёт. Здесь только просмотр и
 * подтверждение эффекта (полный набор: факт, дата, методика, источник). */
export default function ResultsEffectsTab({ mode }: { mode: "results" | "effects" }) {
  const [results, setResults] = useState<ExecResult[]>([]);
  const [effects, setEffects] = useState<ExecEffect[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = () => {
    setLoading(true);
    setError("");
    if (mode === "results") {
      execPortfolioApi.results().then((d) => setResults(d.items)).catch((e) => setError(e.message)).finally(() => setLoading(false));
    } else {
      execPortfolioApi.effects().then((d) => setEffects(d.items)).catch((e) => setError(e.message)).finally(() => setLoading(false));
    }
  };

  useEffect(reload, [mode]);

  const confirm = async (id: number) => {
    try {
      await goalsApi.confirmEffect(id);
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;

  if (mode === "results") {
    return !results.length ? <Empty text="Результатов пока нет" icon="FileCheck" /> : (
      <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
        {results.map((r) => (
          <div key={r.id} className="p-3 flex items-center justify-between text-sm">
            <div>
              <p className="text-slate-900">{r.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {r.result_kind} · {r.project_title || "без проекта"}{r.achieved_at ? ` · ${fmtDate(r.achieved_at)}` : ""}
              </p>
            </div>
            <span className="text-xs text-slate-400">{r.effect_count} эффект(ов)</span>
          </div>
        ))}
      </div>
    );
  }

  return !effects.length ? <Empty text="Эффектов пока нет" icon="Sparkles" /> : (
    <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
      {effects.map((e) => (
        <div key={e.id} className="p-3 flex items-center justify-between text-sm gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${CONFIRM_CLS[e.confirmation_status]}`}>
                {CONFIRM_LABEL[e.confirmation_status]}
              </span>
            </div>
            <p className="text-slate-900 mt-1">{e.title}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {e.metric || "без показателя"} · база {e.baseline_value ?? "—"} · план {e.plan_value ?? "—"} · факт {e.actual_value ?? "—"}
            </p>
            {e.confirmation_status !== "confirmed" && (!e.actual_value || !e.measured_at || !e.calculation_method || !e.data_source) && (
              <p className="text-xs text-amber-700 mt-0.5">
                Для подтверждения не хватает: {[
                  !e.actual_value && "фактическое значение", !e.measured_at && "дата измерения",
                  !e.calculation_method && "методика", !e.data_source && "источник",
                ].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
          {e.confirmation_status !== "confirmed" && (
            <Button size="sm" variant="outline" onClick={() => confirm(e.id)}>Подтвердить</Button>
          )}
        </div>
      ))}
    </div>
  );
}
