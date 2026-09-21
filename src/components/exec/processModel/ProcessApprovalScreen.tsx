import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { Loading, ErrorBox, Empty } from "@/components/exec/ExecUI";
import { TextArea, TextField } from "@/components/exec/ExecForm";
import {
  processModelApi,
  ProcessDetail,
  ReviewDecision,
  Remark,
  Refs,
  ModelStatus,
  ConflictError,
  PublicationValidationError,
  STATUS_STYLE,
} from "@/lib/execProcessModelApi";
import PublicationChecklistPanel from "./PublicationChecklistPanel";
import ConflictDialog from "./ConflictDialog";

const DECISION_ICON: Record<string, string> = {
  submitted: "Send",
  taken_in_work: "Hand",
  commented: "MessageSquare",
  needs_revision: "Undo2",
  confirmed: "BadgeCheck",
  published: "Rocket",
};
const DECISION_LABEL: Record<string, string> = {
  submitted: "Отправлено на проверку",
  taken_in_work: "Принято в работу",
  commented: "Оставлено замечание",
  needs_revision: "Возвращено на доработку",
  confirmed: "Подтверждено",
  published: "Опубликовано",
};
const DECISION_COLOR: Record<string, string> = {
  submitted: "text-blue-600 bg-blue-50 border-blue-200",
  taken_in_work: "text-violet-600 bg-violet-50 border-violet-200",
  commented: "text-amber-600 bg-amber-50 border-amber-200",
  needs_revision: "text-orange-600 bg-orange-50 border-orange-200",
  confirmed: "text-green-600 bg-green-50 border-green-200",
  published: "text-emerald-600 bg-emerald-50 border-emerald-200",
};

function fmtDateTime(d: string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function RemarkCard({
  remark,
  canConfirm,
  canEdit,
  onChanged,
}: {
  remark: Remark;
  canConfirm: boolean;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [noteOpen, setNoteOpen] = useState<"resolve" | "except" | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const statusStyle: Record<string, { title: string; cls: string }> = {
    open: { title: "Открыто", cls: "border-amber-200 bg-amber-50 text-amber-700" },
    resolved: { title: "Устранено", cls: "border-green-200 bg-green-50 text-green-700" },
    accepted_exception: { title: "Принято как исключение", cls: "border-violet-200 bg-violet-50 text-violet-700" },
  };
  const st = statusStyle[remark.status];

  const submitResolve = async (kind: "resolve" | "except") => {
    setSaving(true);
    try {
      if (kind === "resolve") await processModelApi.resolveRemark(remark.id, note.trim() || undefined);
      else await processModelApi.acceptRemarkException(remark.id, note.trim() || undefined);
      setNoteOpen(null);
      setNote("");
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const reopen = async () => {
    await processModelApi.reopenRemark(remark.id);
    onChanged();
  };

  const confirmByReviewer = async () => {
    await processModelApi.confirmRemark(remark.id);
    onChanged();
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-slate-800">{remark.text}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400 mt-1">
            <span>{remark.author} · {fmtDateTime(remark.created_at)}</span>
            {remark.diagram_node_id && <span>элемент схемы #{remark.diagram_node_id}</span>}
            {remark.risk_id && <span>риск #{remark.risk_id}</span>}
            {remark.field_ref && <span>поле: {remark.field_ref}</span>}
          </div>
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${st.cls}`}>{st.title}</span>
      </div>

      {remark.status !== "open" && (
        <div className="text-[11px] text-slate-500 bg-slate-50 rounded-md px-2 py-1.5">
          {remark.status === "resolved" ? "Устранено" : "Принято как исключение"} — {remark.resolved_by}, {fmtDateTime(remark.resolved_at)}
          {remark.resolution_note && <> · {remark.resolution_note}</>}
          {remark.reviewer_confirmed_by && (
            <span className="block text-green-700 mt-0.5">
              Подтверждено проверяющим {remark.reviewer_confirmed_by}, {fmtDateTime(remark.reviewer_confirmed_at)}
            </span>
          )}
        </div>
      )}

      {remark.status === "open" && (canEdit || canConfirm) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {canEdit && noteOpen !== "resolve" && (
            <button onClick={() => setNoteOpen("resolve")}
              className="text-[11px] px-2 py-1 rounded-md border border-green-300 text-green-700 hover:bg-green-50">
              Устранено
            </button>
          )}
          {canConfirm && noteOpen !== "except" && (
            <button onClick={() => setNoteOpen("except")}
              className="text-[11px] px-2 py-1 rounded-md border border-violet-300 text-violet-700 hover:bg-violet-50">
              Принять как исключение
            </button>
          )}
        </div>
      )}

      {remark.status === "resolved" && canConfirm && !remark.reviewer_confirmed_by && (
        <button onClick={confirmByReviewer}
          className="text-[11px] px-2 py-1 rounded-md border border-green-300 text-green-700 hover:bg-green-50">
          Подтвердить устранение (проверяющий)
        </button>
      )}

      {(remark.status === "resolved" || remark.status === "accepted_exception") && canConfirm && (
        <button onClick={reopen}
          className="text-[11px] px-2 py-1 rounded-md border border-slate-300 text-slate-500 hover:bg-slate-50">
          Открыть заново
        </button>
      )}

      {noteOpen && (
        <div className="space-y-1.5">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Комментарий (необязательно)"
            className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 text-xs outline-none focus:border-violet-500"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => { setNoteOpen(null); setNote(""); }} className="text-[11px] text-slate-500 px-2 py-1">Отмена</button>
            <button onClick={() => submitResolve(noteOpen)} disabled={saving}
              className="text-[11px] px-2.5 py-1 rounded-md bg-violet-600 text-white disabled:opacity-40">
              {saving ? "Сохраняю…" : "Подтвердить"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NewRemarkForm({ processNodeId, onSaved }: { processNodeId: number; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [diagramNodeId, setDiagramNodeId] = useState("");
  const [riskId, setRiskId] = useState("");
  const [alsoComment, setAlsoComment] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!text.trim()) {
      setError("Укажите текст замечания");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await processModelApi.saveRemark({
        process_node_id: processNodeId,
        text: text.trim(),
        diagram_node_id: diagramNodeId ? Number(diagramNodeId) : undefined,
        risk_id: riskId ? Number(riskId) : undefined,
      });
      if (alsoComment) {
        await processModelApi.reviewComment("process_node", processNodeId, { comment: text.trim() });
      }
      setText(""); setDiagramNodeId(""); setRiskId(""); setOpen(false);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="text-xs text-violet-600 hover:text-violet-700 flex items-center gap-1">
        <Icon name="Plus" size={12} /> Оставить замечание
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2">
      <TextArea label="Текст замечания" value={text} onChange={setText} rows={2}
        placeholder="Что нужно исправить" />
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Элемент схемы (ID, необязательно)" value={diagramNodeId} onChange={setDiagramNodeId} placeholder="например 128" />
        <TextField label="Риск (ID, необязательно)" value={riskId} onChange={setRiskId} placeholder="например 12" />
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={alsoComment} onChange={(e) => setAlsoComment(e.target.checked)} />
        Также зафиксировать как решение «Оставлено замечание» в истории согласования
      </label>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={() => setOpen(false)} className="text-xs text-slate-500 px-2 py-1">Отмена</button>
        <button onClick={submit} disabled={saving || !text.trim()}
          className="text-xs px-2.5 py-1 rounded-md bg-violet-600 text-white disabled:opacity-40">
          {saving ? "Сохраняю…" : "Сохранить замечание"}
        </button>
      </div>
    </div>
  );
}

/**
 * Итерация 4, разделы 3-4: экран согласования процесса — паспорт маршрута
 * (кто отправил, кому назначено, текущий статус), замечания, публикационный
 * чек-лист и кнопки действий строго по status_transitions из refs(). Если ни
 * одно решение согласования не содержит назначенного проверяющего —
 * показываем «Адресат не назначен», никогда не подставляем случайного
 * сотрудника (раздел 4 ТЗ).
 */
export default function ProcessApprovalScreen({
  processNodeId,
  refs,
  canEdit,
  canConfirm,
  onChanged,
}: {
  processNodeId: number;
  refs: Refs | null;
  canEdit: boolean;
  canConfirm: boolean;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<ProcessDetail | null>(null);
  const [decisions, setDecisions] = useState<ReviewDecision[]>([]);
  const [remarks, setRemarks] = useState<Remark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [conflict, setConflict] = useState<ConflictError | null>(null);
  const [publicationError, setPublicationError] = useState<PublicationValidationError | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviewerRole, setReviewerRole] = useState("");
  const [showTakeInWork, setShowTakeInWork] = useState(false);

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([
      processModelApi.processDetail(processNodeId),
      processModelApi.reviewDecisions("process_node", processNodeId),
      processModelApi.remarks(processNodeId),
    ])
      .then(([d, rd, rm]) => {
        setDetail(d);
        setDecisions(rd.items);
        setRemarks(rm.items);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [processNodeId]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!detail) return null;

  const status = detail.node.model_status;
  const allowedNext = refs?.status_transitions[status] || [];

  const submitted = decisions.find((d) => d.decision === "submitted");
  const lastAssigned = decisions.find((d) => d.reviewer_assigned);

  const setStatus = async (newStatus: ModelStatus) => {
    setActionError("");
    setBusy(true);
    try {
      await processModelApi.setProcessStatus(processNodeId, newStatus, undefined, detail.node.updated_at);
      load();
      onChanged();
    } catch (e) {
      if (e instanceof ConflictError) setConflict(e);
      else if (e instanceof PublicationValidationError) setPublicationError(e);
      else setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const takeInWork = async () => {
    setBusy(true);
    setActionError("");
    try {
      await processModelApi.reviewTakeInWork("process_node", processNodeId, { reviewer_role: reviewerRole.trim() || undefined });
      setShowTakeInWork(false);
      load();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {conflict && (
        <ConflictDialog error={conflict} onReload={() => { setConflict(null); load(); }} onDismiss={() => setConflict(null)} />
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{detail.node.name}</h3>
            <p className="text-xs text-slate-500 mt-0.5">версия {detail.node.version}</p>
          </div>
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLE[status].cls}`}>
            {STATUS_STYLE[status].title}
          </span>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-slate-400">Автор</p>
            <p className="text-slate-800 mt-0.5">{detail.node.owner_name || "—"}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-slate-400">Дата отправки на проверку</p>
            <p className="text-slate-800 mt-0.5">{submitted ? fmtDateTime(submitted.created_at) : "не отправлялось"}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-slate-400">Проверяющий / адресат</p>
            {lastAssigned ? (
              <p className="text-slate-800 mt-0.5">
                {lastAssigned.reviewer_role || "без указания роли"}
                {lastAssigned.reviewer_org_unit_id && ` · подразделение #${lastAssigned.reviewer_org_unit_id}`}
              </p>
            ) : (
              <p className="text-amber-700 mt-0.5 flex items-center gap-1">
                <Icon name="AlertTriangle" size={12} /> Адресат не назначен
              </p>
            )}
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-slate-400">Текущий статус</p>
            <p className="text-slate-800 mt-0.5">{STATUS_STYLE[status].title}</p>
          </div>
        </div>

        {actionError && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{actionError}</div>}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {canEdit && allowedNext.includes("in_review") && status !== "in_review" && (
            <button onClick={() => setStatus("in_review")} disabled={busy}
              className="text-xs px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-40">
              {status === "needs_revision" ? "Повторно отправить" : "Отправить на проверку"}
            </button>
          )}
          {canEdit && status === "in_review" && !showTakeInWork && (
            <button onClick={() => setShowTakeInWork(true)}
              className="text-xs px-3 py-1.5 rounded-lg border border-violet-300 text-violet-700 hover:bg-violet-50">
              Принять в работу
            </button>
          )}
          {status === "in_review" && (
            <NewRemarkForm processNodeId={processNodeId} onSaved={load} />
          )}
          {canConfirm && allowedNext.includes("needs_revision") && (
            <button onClick={() => setStatus("needs_revision")} disabled={busy}
              className="text-xs px-3 py-1.5 rounded-lg border border-orange-300 text-orange-700 hover:bg-orange-50 disabled:opacity-40">
              Вернуть на доработку
            </button>
          )}
          {canConfirm && allowedNext.includes("confirmed") && (
            <button onClick={() => setStatus("confirmed")} disabled={busy}
              className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-40">
              Подтвердить
            </button>
          )}
          {canConfirm && allowedNext.includes("archived") && (
            <button onClick={() => setStatus("archived")} disabled={busy}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40">
              Архивировать
            </button>
          )}
        </div>

        {showTakeInWork && (
          <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2">
            <TextField label="Роль проверяющего (необязательно)" value={reviewerRole} onChange={setReviewerRole}
              placeholder="например «Куратор направления»" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowTakeInWork(false)} className="text-xs text-slate-500 px-2 py-1">Отмена</button>
              <button onClick={takeInWork} disabled={busy}
                className="text-xs px-2.5 py-1 rounded-md bg-violet-600 text-white disabled:opacity-40">
                Подтвердить принятие в работу
              </button>
            </div>
          </div>
        )}
      </div>

      {status === "confirmed" && canConfirm && (
        <PublicationChecklistPanel
          processNodeId={processNodeId}
          canConfirm={canConfirm}
          onPublish={() => setStatus("published")}
          externalError={publicationError}
          onExternalErrorHandled={() => setPublicationError(null)}
        />
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-900">Замечания</p>
          {status !== "in_review" && <NewRemarkForm processNodeId={processNodeId} onSaved={load} />}
        </div>
        {remarks.length === 0 ? (
          <Empty text="Замечаний пока нет" icon="MessageSquare" />
        ) : (
          <div className="space-y-2">
            {remarks.map((r) => (
              <RemarkCard key={r.id} remark={r} canConfirm={canConfirm} canEdit={canEdit} onChanged={load} />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-900">История решений</p>
        {decisions.length === 0 ? (
          <Empty text="Маршрут согласования ещё не начат" icon="History" />
        ) : (
          <div className="space-y-2">
            {[...decisions].reverse().map((d) => (
              <div key={d.id} className="flex items-start gap-2.5 text-xs">
                <div className={`w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 ${DECISION_COLOR[d.decision]}`}>
                  <Icon name={DECISION_ICON[d.decision] || "Circle"} size={12} />
                </div>
                <div className="min-w-0 flex-1 pb-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-800">{DECISION_LABEL[d.decision] || d.decision}</span>
                    <span className="text-slate-400">{d.actor} · {fmtDateTime(d.created_at)}</span>
                    {!d.actor_authorized && (
                      <span className="text-[10px] px-1 py-0.5 rounded border border-red-200 bg-red-50 text-red-600">без прав уполномоченного</span>
                    )}
                  </div>
                  {d.comment && <p className="text-slate-600 mt-0.5">{d.comment}</p>}
                  {d.found_issues && <p className="text-slate-500 mt-0.5">Найденные проблемы: {d.found_issues}</p>}
                  {d.open_questions && <p className="text-slate-500 mt-0.5">Открытые вопросы: {d.open_questions}</p>}
                  {!d.reviewer_assigned && d.decision !== "submitted" && (
                    <p className="text-amber-600 mt-0.5">Адресат не был назначен на момент решения</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}