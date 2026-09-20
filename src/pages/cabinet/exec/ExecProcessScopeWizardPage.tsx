import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { Loading, ErrorBox } from "@/components/exec/ExecUI";
import {
  ScopePayload,
  CompletenessResult,
  processScopeApi,
} from "@/lib/execProcessScopeApi";
import { peopleApi, TeamMember } from "@/lib/execPeopleApi";
import { getStepGuide } from "@/config/processScopeWizardGuide";
import AssistantPanel from "@/components/exec/processScope/AssistantPanel";
import ScopeIntroStep from "@/components/exec/processScope/ScopeIntroStep";
import ScopeUnitsStep from "@/components/exec/processScope/ScopeUnitsStep";
import ScopePurposeStep from "@/components/exec/processScope/ScopePurposeStep";
import ScopeDocumentsStep from "@/components/exec/processScope/ScopeDocumentsStep";
import ScopeCompletenessStep from "@/components/exec/processScope/ScopeCompletenessStep";
import ScopeConfirmStep from "@/components/exec/processScope/ScopeConfirmStep";

const STEPS = [
  { id: 1, title: "Введение", icon: "BookOpen" },
  { id: 2, title: "Состав Блока ВК", icon: "Building2" },
  { id: 3, title: "Назначение и границы", icon: "Target" },
  { id: 4, title: "Нормативные документы", icon: "FileText" },
  { id: 5, title: "Проверка полноты", icon: "ListChecks" },
  { id: 6, title: "Подтверждение", icon: "BadgeCheck" },
];

export default function ExecProcessScopeWizardPage() {
  const nav = useNavigate();
  const [payload, setPayload] = useState<ScopePayload | null>(null);
  const [refs, setRefs] = useState<Awaited<ReturnType<typeof processScopeApi.refs>> | null>(null);
  const [people, setPeople] = useState<TeamMember[]>([]);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [completeness, setCompleteness] = useState<CompletenessResult | null>(null);
  const [checking, setChecking] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([processScopeApi.getOrCreate(), processScopeApi.refs(), peopleApi.people()])
      .then(([p, r, ppl]) => {
        setPayload(p);
        setRefs(r);
        setPeople(ppl);
        setStep((s) => (s === 1 && p.scope.current_step > 1 ? p.scope.current_step : s));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(reload, [reload]);

  const runCheck = useCallback(() => {
    if (!payload) return;
    setChecking(true);
    processScopeApi
      .completeness(payload.scope.id)
      .then(setCompleteness)
      .catch((e) => setError(e.message))
      .finally(() => setChecking(false));
  }, [payload]);

  useEffect(() => {
    if (step === 5 || step === 6) runCheck();
  }, [step, runCheck]);

  const readOnly = payload?.scope.model_status === "confirmed";
  const guide = getStepGuide(step);
  const progress = useMemo(() => Math.round((step / STEPS.length) * 100), [step]);

  const goStep = (n: number) => {
    setStep(n);
    if (payload && !readOnly) {
      const wizardStatus = n >= STEPS.length ? "in_progress" : "in_progress";
      processScopeApi
        .setStep({ scope_id: payload.scope.id, current_step: n, wizard_status: wizardStatus, progress_pct: Math.round((n / STEPS.length) * 100) })
        .catch(() => {});
    }
  };

  const goNext = () => goStep(Math.min(STEPS.length, step + 1));

  if (loading && !payload) {
    return (
      <Layout>
        <Loading />
      </Layout>
    );
  }
  if (error && !payload) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-10">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      </Layout>
    );
  }
  if (!payload || !refs) return null;

  const { scope, units, documents, candidates } = payload;

  return (
    <Layout>
      <div className="max-w-[1300px] mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Процессная модель Блока ВК — обучающий мастер</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Этап 1 «Границы Блока ВК» · шаг {step} из {STEPS.length} · {STEPS[step - 1].title}
              {readOnly && <span className="ml-2 text-violet-600 font-medium">этап подтверждён</span>}
            </p>
          </div>
          <button
            onClick={() => nav("/cabinet/exec/process-model")}
            className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
          >
            К обзору «Процессное управление»
          </button>
        </div>

        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-5">
          <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${progress}%` }} />
        </div>

        {error && (
          <div className="mb-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        )}

        <div className="grid grid-cols-[200px_1fr_280px] gap-5 items-start">
          {/* Левая колонка: маршрут */}
          <div className="space-y-1 sticky top-4">
            {STEPS.map((s) => (
              <button
                key={s.id}
                onClick={() => goStep(s.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                  s.id === step
                    ? "bg-violet-100 text-violet-700 font-medium"
                    : s.id < step
                      ? "text-slate-600 hover:bg-slate-50"
                      : "text-slate-400 hover:bg-slate-50"
                }`}
              >
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] border ${
                    s.id === step
                      ? "bg-violet-600 text-white border-violet-600"
                      : s.id < step
                        ? "bg-violet-100 text-violet-700 border-violet-200"
                        : "bg-white text-slate-400 border-slate-200"
                  }`}
                >
                  {s.id < step ? <Icon name="Check" size={11} /> : s.id}
                </span>
                {s.title}
              </button>
            ))}

            <div className="pt-3 mt-3 border-t border-slate-100">
              <button
                onClick={() => nav("/cabinet/exec/process-model?tab=wizard&stage=functions")}
                className="w-full text-left rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2.5 hover:bg-violet-50 transition-colors"
              >
                <p className="text-xs text-violet-700 font-medium flex items-center gap-1.5">
                  Функции подразделений <Icon name="ArrowRight" size={11} />
                </p>
                <p className="text-[10px] text-violet-500 mt-0.5">Следующий этап общего маршрута</p>
              </button>
            </div>
          </div>

          {/* Центр: рабочая форма */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 min-h-[420px]">
            {step === 1 && <ScopeIntroStep scope={scope} onStart={goNext} />}
            {step === 2 && (
              <ScopeUnitsStep
                scopeId={scope.id}
                units={units}
                candidates={candidates}
                readOnly={!!readOnly}
                onChanged={reload}
                onOpenOrgModel={() => window.open("/cabinet/exec/org-model", "_blank")}
              />
            )}
            {step === 3 && (
              <ScopePurposeStep scope={scope} people={people} readOnly={!!readOnly} onSaved={reload} />
            )}
            {step === 4 && (
              <ScopeDocumentsStep
                scopeId={scope.id}
                documents={documents}
                units={units}
                refs={refs}
                blockRegulationMissing={scope.block_regulation_declared_missing}
                missingReason={scope.block_regulation_missing_reason}
                readOnly={!!readOnly}
                onChanged={reload}
              />
            )}
            {step === 5 && (
              <ScopeCompletenessStep completeness={completeness} loading={checking} onRefresh={runCheck} />
            )}
            {step === 6 && (
              <ScopeConfirmStep
                scope={scope}
                units={units}
                documents={documents}
                completeness={completeness}
                canConfirmRole={refs.can_confirm}
                onConfirmed={reload}
                onUnconfirmed={reload}
              />
            )}
          </div>

          {/* Правая колонка: помощник */}
          <AssistantPanel
            guide={guide}
            completeness={step === 5 || step === 6 ? completeness : null}
            checking={checking}
            onCheck={runCheck}
            onNext={step < STEPS.length ? goNext : undefined}
            canGoNext={step !== 1 || true}
            nextLabel={step === 5 ? "К подтверждению" : "Следующий шаг"}
          />
        </div>
      </div>
    </Layout>
  );
}