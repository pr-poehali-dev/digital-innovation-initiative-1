import { useState } from "react";
import Icon from "@/components/ui/icon";
import {
  AiStep,
  PersonRef,
  Plan,
  plannerApi,
} from "@/lib/execPlannerApi";
import { fmtDate } from "./ExecUI";

export default function AiPlanDialog({
  plan,
  persons,
  onClose,
  onApplied,
}: {
  plan: Plan;
  persons: PersonRef[];
  onClose: () => void;
  onApplied: () => void;
}) {
  const [steps, setSteps] = useState<AiStep[] | null>(null);
  const [usedDocs, setUsedDocs] = useState<string[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");

  const generate = async () => {
    setLoading(true);
    setError("");
    try {
      const r = await plannerApi.aiSuggest({
        title: plan.title,
        goal: plan.goal || "",
        start_date: plan.start_date,
        due_date: plan.due_date,
      });
      setSteps(r.steps);
      setUsedDocs(r.used_knowledge || []);
      setPicked(new Set(r.steps.map((_, i) => i)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (i: number) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  const setResponsible = (i: number, personId: string) =>
    setSteps((p) =>
      p
        ? p.map((s, idx) =>
            idx === i
              ? { ...s, responsible_person_id: personId ? Number(personId) : null }
              : s,
          )
        : p,
    );

  const apply = async () => {
    if (!steps) return;
    const chosen = steps.filter((_, i) => picked.has(i));
    if (!chosen.length) {
      setError("Отметьте хотя бы один шаг");
      return;
    }
    setApplying(true);
    setError("");
    try {
      await plannerApi.aiApply(plan.id, chosen);
      onApplied();
    } catch (e) {
      setError((e as Error).message);
      setApplying(false);
    }
  };

  const totalPicked = steps ? steps.filter((_, i) => picked.has(i)).length : 0;
  const totalSub = steps
    ? steps.reduce((a, s, i) => a + (picked.has(i) ? s.substeps.length : 0), 0)
    : 0;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 p-5 border-b border-slate-200">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
              <Icon name="Sparkles" size={17} className="text-violet-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900">
                AI составит план по шагам
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate">{plan.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <Icon name="X" size={18} />
          </button>
        </header>

        <div className="p-5 space-y-4">
          {!steps && !loading && (
            <div className="text-center py-6">
              <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                AI разложит вашу задачу на последовательные шаги, предложит сроки внутри
                общего периода и отметит ключевые вехи. Перед сохранением всё можно
                отредактировать.
              </p>
              <p className="text-xs text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
                Регламенты и матрицы из вашей базы знаний будут учтены автоматически.
              </p>
              {(plan.start_date || plan.due_date) && (
                <p className="text-xs text-slate-400 mt-2">
                  Период: {plan.start_date ? fmtDate(plan.start_date) : "сегодня"} —{" "}
                  {plan.due_date ? fmtDate(plan.due_date) : "не задан"}
                </p>
              )}
              <button
                onClick={generate}
                className="mt-5 px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors inline-flex items-center gap-2"
              >
                <Icon name="Sparkles" size={15} />
                Построить план
              </button>
            </div>
          )}

          {loading && (
            <div className="py-12 text-center">
              <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-slate-700 font-medium">AI составляет план…</p>
              <p className="text-xs text-slate-400 mt-1">Это занимает 15–40 секунд</p>
            </div>
          )}

          {steps && !loading && (
            <>
              {usedDocs.length > 0 && (
                <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 flex items-start gap-2.5">
                  <Icon
                    name="Library"
                    size={14}
                    className="text-violet-600 flex-shrink-0 mt-0.5"
                  />
                  <p className="text-xs text-violet-800 leading-relaxed">
                    План построен с учётом базы знаний:{" "}
                    <span className="font-medium">{usedDocs.join(", ")}</span>
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-slate-500">
                  Отмечено {totalPicked} из {steps.length} шагов
                  {totalSub > 0 && ` · ${totalSub} действий`}
                </p>
                <button
                  onClick={generate}
                  className="text-xs text-violet-600 hover:text-violet-700 flex items-center gap-1.5"
                >
                  <Icon name="RefreshCw" size={12} />
                  Предложить заново
                </button>
              </div>

              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {steps.map((s, i) => {
                  const on = picked.has(i);
                  return (
                    <div
                      key={i}
                      className={`rounded-lg border p-3 transition-colors ${
                        on ? "border-violet-200 bg-violet-50/40" : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <button
                          onClick={() => toggle(i)}
                          className={`mt-0.5 w-[17px] h-[17px] rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                            on
                              ? "bg-violet-600 border-violet-600"
                              : "border-slate-300 hover:border-violet-400 bg-white"
                          }`}
                        >
                          {on && <Icon name="Check" size={11} className="text-white" />}
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {s.is_milestone && (
                              <Icon name="Diamond" size={11} className="text-violet-600" />
                            )}
                            <p className="text-sm text-slate-900 font-medium leading-snug">
                              {s.title}
                            </p>
                            {s.is_milestone && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded border bg-violet-100 text-violet-700 border-violet-200">
                                веха
                              </span>
                            )}
                          </div>

                          {s.description && (
                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                              {s.description}
                            </p>
                          )}
                          {s.result_criteria && (
                            <p className="text-xs text-slate-500 mt-1 flex items-start gap-1.5">
                              <Icon
                                name="Target"
                                size={11}
                                className="text-slate-400 flex-shrink-0 mt-0.5"
                              />
                              {s.result_criteria}
                            </p>
                          )}

                          <div className="flex items-center gap-3 flex-wrap mt-2 text-[11px] text-slate-500">
                            {s.due_date && (
                              <span className="flex items-center gap-1">
                                <Icon name="Calendar" size={10} />
                                {s.start_date ? `${fmtDate(s.start_date)} — ` : "до "}
                                {fmtDate(s.due_date)}
                              </span>
                            )}
                            {s.substeps.length > 0 && (
                              <span className="flex items-center gap-1">
                                <Icon name="ListTree" size={10} />
                                {s.substeps.length} действий
                              </span>
                            )}
                            {s.role_hint && (
                              <span className="flex items-center gap-1 text-slate-400">
                                <Icon name="UserCog" size={10} />
                                {s.role_hint}
                              </span>
                            )}
                          </div>

                          {on && persons.length > 0 && (
                            <select
                              value={
                                s.responsible_person_id ? String(s.responsible_person_id) : ""
                              }
                              onChange={(e) => setResponsible(i, e.target.value)}
                              className="mt-2 w-full max-w-xs border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:border-violet-500"
                            >
                              <option value="">Ответственный не назначен</option>
                              {persons.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.position_title
                                    ? `${p.display_name} — ${p.position_title}`
                                    : p.display_name}
                                </option>
                              ))}
                            </select>
                          )}

                          {on && s.substeps.length > 0 && (
                            <div className="mt-2 pl-3 border-l-2 border-slate-200 space-y-1">
                              {s.substeps.map((sub, j) => (
                                <div key={j} className="flex items-center gap-2 flex-wrap">
                                  <span className="w-1 h-1 rounded-full bg-slate-300 flex-shrink-0" />
                                  <span className="text-xs text-slate-600">{sub.title}</span>
                                  {sub.due_date && (
                                    <span className="text-[10px] text-slate-400">
                                      до {fmtDate(sub.due_date)}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {error && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 p-5 border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            Отмена
          </button>
          {steps && (
            <button
              onClick={apply}
              disabled={applying || totalPicked === 0}
              className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center gap-2"
            >
              {applying && (
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              )}
              {applying ? "Добавляю…" : `Добавить в план (${totalPicked})`}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}