import { useEffect, useMemo, useState } from "react";
import { workspaceApi } from "@/lib/api";
import Icon from "@/components/ui/icon";

type Criterion = {
  id: number;
  order_no: number;
  code: string;
  title: string;
  criterion_type: string;
  result: "pending" | "passed" | "failed" | "waived";
  waived_reason: string | null;
  waived_by_name: string | null;
  waived_at: string | null;
};

type StageTask = {
  id: number;
  code: string;
  title: string;
  status: "not_started" | "in_progress" | "done";
  expected_result: string | null;
  responsible_name: string | null;
};

type Stage = {
  id: number;
  order_no: number;
  code: string;
  title: string;
  status: "locked" | "active" | "completed";
  gate_confirmed_at: string | null;
  gate_confirmed_by_name: string | null;
  criteria: Criterion[];
  tasks: StageTask[];
};

const TASK_STATUS_LABEL: Record<string, string> = {
  not_started: "Не начато",
  in_progress: "В работе",
  done: "Готово",
};
const TASK_STATUS_COLOR: Record<string, string> = {
  not_started: "bg-slate-100 text-slate-600",
  in_progress: "bg-blue-100 text-blue-700",
  done: "bg-emerald-100 text-emerald-700",
};

function stageChipClass(stage: Stage): string {
  if (stage.status === "completed") return "bg-emerald-500 text-white border-emerald-500";
  if (stage.status === "locked") return "bg-slate-100 text-slate-400 border-slate-200";
  // active
  const hasFailed = stage.criteria.some((c) => c.result === "failed");
  const hasWaived = stage.criteria.some((c) => c.result === "waived");
  if (hasWaived) return "bg-amber-100 text-amber-700 border-amber-400";
  if (hasFailed) return "bg-red-50 text-red-600 border-red-300";
  return "bg-blue-100 text-blue-700 border-blue-400";
}

function stageIcon(stage: Stage): string {
  if (stage.status === "completed") return "CheckCircle2";
  if (stage.status === "locked") return "Lock";
  return "CircleDot";
}

interface Props {
  projectId: number;
}

export default function StagesGatesTab({ projectId }: Props) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<number | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [waiverOpen, setWaiverOpen] = useState(false);
  const [waiverReasons, setWaiverReasons] = useState<Record<number, string>>({});
  const [comment, setComment] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    workspaceApi.getStages(projectId)
      .then((d: { stages: Stage[] }) => {
        setStages(d.stages || []);
        setSelectedCode((prev) => prev || (d.stages || []).find((s) => s.status === "active")?.code || d.stages?.[0]?.code || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId]);

  const selected = useMemo(() => stages.find((s) => s.code === selectedCode) || null, [stages, selectedCode]);
  const activeStage = useMemo(() => stages.find((s) => s.status === "active") || null, [stages]);
  const nextLockedStage = useMemo(() => {
    if (!activeStage) return null;
    return stages.find((s) => s.order_no === activeStage.order_no + 1 && s.status === "locked") || null;
  }, [stages, activeStage]);

  const cycleTaskStatus = async (t: StageTask) => {
    const order: StageTask["status"][] = ["not_started", "in_progress", "done"];
    const next = order[(order.indexOf(t.status) + 1) % order.length];
    setSavingTaskId(t.id);
    try {
      await workspaceApi.updateWorkplanTask(projectId, t.id, { status: next });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Не удалось обновить статус задачи");
    } finally {
      setSavingTaskId(null);
    }
  };

  const unresolvedCriteria = activeStage
    ? activeStage.criteria.filter((c) => c.result !== "passed" && c.result !== "waived")
    : [];
  const gateReady = activeStage ? unresolvedCriteria.length === 0 : false;

  const handleConfirmTransition = async (withWaivers: boolean) => {
    if (!nextLockedStage) return;
    setErrorMsg(null);
    if (withWaivers) {
      const missing = unresolvedCriteria.filter((c) => !waiverReasons[c.id]?.trim());
      if (missing.length > 0) {
        setErrorMsg("Укажите обоснование для каждого критерия, который хотите пропустить как исключение.");
        return;
      }
    }
    setTransitioning(true);
    try {
      const waivers = withWaivers
        ? unresolvedCriteria.map((c) => ({ criterion_id: c.id, reason: waiverReasons[c.id]?.trim() }))
        : undefined;
      await workspaceApi.confirmStageTransition(projectId, nextLockedStage.id, { comment: comment.trim() || undefined, waivers });
      setWaiverOpen(false);
      setWaiverReasons({});
      setComment("");
      setSelectedCode(nextLockedStage.code);
      load();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Не удалось выполнить переход");
    } finally {
      setTransitioning(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-slate-400 py-8 text-center">Загрузка стадий…</div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs sm:text-sm text-slate-500 leading-snug">
        Путь подготовки и проверки решения — от постановки задачи до передачи в реализацию.
        Переход к следующей стадии возможен только после выполнения критериев шлюза и подтверждения владельцем.
      </p>

      {/* ── Горизонтальный степпер стадий ── */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex items-center gap-1.5 min-w-max sm:min-w-0 sm:flex-wrap pb-1">
          {stages.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setSelectedCode(s.code)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap transition-all ${stageChipClass(s)} ${
                selectedCode === s.code ? "ring-2 ring-offset-1 ring-slate-400" : "hover:opacity-80"
              }`}
            >
              <Icon name={stageIcon(s)} size={12} />
              <span className="text-[10px] opacity-70">{i + 1}.</span>
              {s.title}
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* ── Задачи стадии ── */}
          <div className="lg:col-span-2 space-y-1.5">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Задачи стадии «{selected.title}»
            </div>
            {selected.tasks.length === 0 && (
              <p className="text-xs text-slate-400">В этой стадии нет задач.</p>
            )}
            {selected.tasks.map((t) => (
              <div key={t.id} className="border border-slate-200 rounded-xl p-3 bg-white flex items-start gap-3">
                <button
                  onClick={() => cycleTaskStatus(t)}
                  disabled={savingTaskId === t.id || selected.status === "locked"}
                  className={`flex-shrink-0 mt-0.5 text-[10px] font-bold px-2 py-1 rounded-full transition-colors ${TASK_STATUS_COLOR[t.status]} hover:opacity-80 disabled:opacity-50`}
                >
                  {savingTaskId === t.id ? <Icon name="Loader2" size={11} className="animate-spin" /> : TASK_STATUS_LABEL[t.status]}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-mono text-slate-400">{t.code}</span>
                    <p className="text-sm font-medium text-slate-800">{t.title}</p>
                  </div>
                  {t.expected_result && (
                    <p className="text-xs text-slate-500 mt-0.5">→ {t.expected_result}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* ── Готовность к переходу ── */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3 h-fit">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Icon name="DoorOpen" size={15} className="text-slate-500" />
              Готовность к переходу
            </div>

            {selected.status === "completed" && (
              <p className="text-xs text-emerald-700 flex items-center gap-1.5">
                <Icon name="CheckCircle2" size={13} />
                Стадия завершена{selected.gate_confirmed_by_name ? ` · подтвердил ${selected.gate_confirmed_by_name}` : ""}
              </p>
            )}

            {selected.status === "locked" && (
              <p className="text-xs text-slate-400 flex items-center gap-1.5">
                <Icon name="Lock" size={13} /> Стадия заблокирована — завершите предыдущую
              </p>
            )}

            {selected.status === "active" && (
              <>
                <div className="space-y-1.5">
                  {selected.criteria.map((c) => (
                    <div key={c.id} className="flex items-start gap-2 text-xs">
                      <Icon
                        name={c.result === "passed" ? "CheckCircle2" : c.result === "waived" ? "AlertTriangle" : "Circle"}
                        size={13}
                        className={`flex-shrink-0 mt-0.5 ${
                          c.result === "passed" ? "text-emerald-600" : c.result === "waived" ? "text-amber-600" : "text-slate-300"
                        }`}
                      />
                      <div>
                        <span className={c.result === "passed" ? "text-slate-700" : "text-slate-500"}>{c.title}</span>
                        {c.result === "waived" && (
                          <p className="text-[10px] text-amber-700 mt-0.5">
                            Исключение: {c.waived_reason} — {c.waived_by_name}
                          </p>
                        )}
                        {waiverOpen && unresolvedCriteria.some((u) => u.id === c.id) && (
                          <input
                            type="text"
                            placeholder="Обоснование исключения"
                            value={waiverReasons[c.id] || ""}
                            onChange={(e) => setWaiverReasons((m) => ({ ...m, [c.id]: e.target.value }))}
                            className="mt-1 w-full text-[11px] border border-amber-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-400"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {nextLockedStage ? (
                  <>
                    <textarea
                      placeholder="Комментарий к переходу (необязательно)"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={2}
                      className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
                    />
                    {errorMsg && (
                      <p className="text-[11px] text-red-600 flex items-center gap-1"><Icon name="AlertCircle" size={11} /> {errorMsg}</p>
                    )}
                    {gateReady ? (
                      <button
                        onClick={() => handleConfirmTransition(false)}
                        disabled={transitioning}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <Icon name={transitioning ? "Loader2" : "ArrowRight"} size={13} className={transitioning ? "animate-spin" : ""} />
                        Подтвердить переход к «{nextLockedStage.title}»
                      </button>
                    ) : !waiverOpen ? (
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-red-600 flex items-center gap-1">
                          <Icon name="AlertCircle" size={11} /> Не все критерии выполнены ({unresolvedCriteria.length})
                        </p>
                        <button
                          onClick={() => setWaiverOpen(true)}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-amber-300 text-amber-700 rounded-lg text-xs font-semibold hover:bg-amber-50"
                        >
                          <Icon name="AlertTriangle" size={13} /> Перейти с исключением
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <button
                          onClick={() => handleConfirmTransition(true)}
                          disabled={transitioning}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 disabled:opacity-50"
                        >
                          <Icon name={transitioning ? "Loader2" : "AlertTriangle"} size={13} className={transitioning ? "animate-spin" : ""} />
                          Подтвердить переход с исключением
                        </button>
                        <button
                          onClick={() => { setWaiverOpen(false); setErrorMsg(null); }}
                          className="w-full text-[11px] text-slate-400 hover:text-slate-600"
                        >
                          Отменить исключение
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-[11px] text-slate-400">Это последняя стадия.</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
