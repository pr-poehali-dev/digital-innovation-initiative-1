import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { Card, Empty, ErrorBox, Loading, fmtDate } from "@/components/exec/ExecUI";
import {
  MEETING_STATUS_LABEL,
  MeetingOutcome,
  OUTCOME_TYPE_LABEL,
  controlApi,
} from "@/lib/execControlApi";
import { execApi, RefsData } from "@/lib/execCabinetApi";

interface MeetingDetail {
  meeting: {
    id: number;
    title: string;
    meeting_at: string;
    location: string | null;
    agenda: string | null;
    materials: string | null;
    notes: string | null;
    next_meeting_at: string | null;
    status: string;
  };
  participants: { id: number; display_name: string; position_title: string | null }[];
  initiatives: { id: number; title: string }[];
  functions: { id: number; title: string }[];
  outcomes: MeetingOutcome[];
}

const OUTCOME_TYPES: MeetingOutcome["outcome_type"][] = [
  "note",
  "action",
  "milestone",
  "issue",
  "risk",
  "decision",
];

export default function ExecMeetingDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState<MeetingDetail | null>(null);
  const [refs, setRefs] = useState<RefsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [outcomeForm, setOutcomeForm] = useState(false);

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([controlApi.meeting(Number(id)), execApi.refs()])
      .then(([m, r]) => {
        setData(m as MeetingDetail);
        setNotes(m.meeting.notes || "");
        setRefs(r);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const saveNotes = async () => {
    if (!data) return;
    setSavingNotes(true);
    try {
      await controlApi.saveMeeting({ id: data.meeting.id, notes });
      load();
    } finally {
      setSavingNotes(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <Loading />
      </Layout>
    );
  }
  if (error || !data) {
    return (
      <Layout>
        <ErrorBox message={error || "Встреча не найдена"} onRetry={load} />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-[1000px] mx-auto px-4 sm:px-6 py-6 space-y-5">
        <Link
          to="/cabinet/exec/meetings"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <Icon name="ArrowLeft" size={14} />
          Все встречи
        </Link>

        <header className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">{data.meeting.title}</h1>
              <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
                <Icon name="Calendar" size={13} />
                {fmtDate(data.meeting.meeting_at)}
                {data.meeting.location && ` · ${data.meeting.location}`}
              </p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-md border bg-slate-100 text-slate-600 border-slate-200">
              {MEETING_STATUS_LABEL[data.meeting.status]}
            </span>
          </div>

          {data.participants.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {data.participants.map((p) => (
                <span
                  key={p.id}
                  className="text-xs px-2 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200"
                >
                  {p.display_name}
                </span>
              ))}
            </div>
          )}

          {data.meeting.agenda && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-500 mb-1">Повестка</p>
              <p className="text-sm text-slate-700 whitespace-pre-line">{data.meeting.agenda}</p>
            </div>
          )}
        </header>

        <Card title="Заметки" icon="StickyNote">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Свободные заметки по ходу встречи"
            className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 text-sm outline-none focus:border-violet-600 transition-colors resize-none"
          />
          <button
            onClick={saveNotes}
            disabled={savingNotes}
            className="mt-2 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors"
          >
            {savingNotes ? "Сохраняю…" : "Сохранить заметки"}
          </button>
        </Card>

        <Card
          title="Протокол"
          subtitle={`${data.outcomes.length} записей`}
          icon="FileText"
          action={
            <button
              onClick={() => setOutcomeForm(true)}
              className="px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <Icon name="Plus" size={13} />
              Добавить запись
            </button>
          }
        >
          {!data.outcomes.length ? (
            <Empty text="Записей протокола пока нет" />
          ) : (
            <div className="space-y-2">
              {data.outcomes.map((o) => {
                const meta = OUTCOME_TYPE_LABEL[o.outcome_type];
                const linkTo = o.action_id
                  ? "/cabinet/exec/assignments"
                  : o.milestone_id || o.issue_id || o.risk_id || o.decision_id
                    ? "/cabinet/exec/control"
                    : null;
                return (
                  <div key={o.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start gap-2">
                      <Icon name={meta.icon} size={14} className="text-violet-600 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-slate-500">{meta.title}</p>
                        <p className="text-sm text-slate-800">{o.text}</p>
                      </div>
                      {linkTo && (
                        <Link
                          to={linkTo}
                          className="text-xs text-violet-600 hover:text-violet-700 flex-shrink-0"
                        >
                          Открыть →
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {outcomeForm && refs && (
        <OutcomeForm
          meetingId={data.meeting.id}
          persons={refs.persons}
          initiatives={refs.initiatives}
          decisionTypes={refs.decision_types}
          onClose={() => setOutcomeForm(false)}
          onSaved={() => {
            setOutcomeForm(false);
            load();
          }}
        />
      )}
    </Layout>
  );
}

function OutcomeForm({
  meetingId,
  persons,
  initiatives,
  decisionTypes,
  onClose,
  onSaved,
}: {
  meetingId: number;
  persons: { id: number; display_name: string }[];
  initiatives: { id: number; code: string | null; title: string }[];
  decisionTypes: { code: string; title: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<MeetingOutcome["outcome_type"]>("note");
  const [text, setText] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [initiativeId, setInitiativeId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [decisionType, setDecisionType] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const needsInitiative = type === "milestone" || type === "issue" || type === "risk" || type === "decision";
  const needsResponsible = type === "action";
  const canSave =
    text.trim().length > 0 &&
    (!needsInitiative || initiativeId) &&
    (!needsResponsible || responsibleId) &&
    (type !== "decision" || decisionType);

  const save = async () => {
    if (!canSave) {
      setError("Заполните обязательные поля для этого типа записи");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await controlApi.addMeetingOutcome({
        meeting_id: meetingId,
        outcome_type: type,
        text: text.trim(),
        responsible_person_id: responsibleId ? Number(responsibleId) : undefined,
        initiative_id: initiativeId ? Number(initiativeId) : undefined,
        due_at: dueAt || undefined,
        plan_date: dueAt || undefined,
        decision_type_code: decisionType || undefined,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/75 z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-xl w-full max-w-lg my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 p-5 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">Запись протокола</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 transition-colors">
            <Icon name="X" size={18} />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <div>
            <span className="text-xs text-slate-500 mb-1.5 block">Тип записи</span>
            <div className="flex flex-wrap gap-1.5">
              {OUTCOME_TYPES.map((t) => {
                const meta = OUTCOME_TYPE_LABEL[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`px-2.5 py-1.5 rounded-md text-xs border transition-colors flex items-center gap-1.5 ${
                      type === t
                        ? "bg-violet-100 border-violet-300 text-violet-700"
                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    <Icon name={meta.icon} size={12} />
                    {meta.title}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="text-xs text-slate-500 mb-1.5 block">
              Текст <span className="text-violet-600">*</span>
            </span>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 text-sm outline-none focus:border-violet-600 transition-colors resize-none"
            />
          </label>

          {needsResponsible && (
            <label className="block">
              <span className="text-xs text-slate-500 mb-1.5 block">
                Ответственный <span className="text-violet-600">*</span>
              </span>
              <select
                value={responsibleId}
                onChange={(e) => setResponsibleId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 text-sm outline-none focus:border-violet-600 transition-colors"
              >
                <option value="">не выбрано</option>
                {persons.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {needsInitiative && (
            <label className="block">
              <span className="text-xs text-slate-500 mb-1.5 block">
                Инициатива <span className="text-violet-600">*</span>
              </span>
              <select
                value={initiativeId}
                onChange={(e) => setInitiativeId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 text-sm outline-none focus:border-violet-600 transition-colors"
              >
                <option value="">не выбрано</option>
                {initiatives.map((i) => (
                  <option key={i.id} value={String(i.id)}>
                    {i.title}
                  </option>
                ))}
              </select>
            </label>
          )}

          {type === "decision" && (
            <label className="block">
              <span className="text-xs text-slate-500 mb-1.5 block">
                Тип решения <span className="text-violet-600">*</span>
              </span>
              <select
                value={decisionType}
                onChange={(e) => setDecisionType(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 text-sm outline-none focus:border-violet-600 transition-colors"
              >
                <option value="">не выбрано</option>
                {decisionTypes.map((dt) => (
                  <option key={dt.code} value={dt.code}>
                    {dt.title}
                  </option>
                ))}
              </select>
            </label>
          )}

          {(type === "action" || type === "milestone") && (
            <label className="block">
              <span className="text-xs text-slate-500 mb-1.5 block">Срок</span>
              <input
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 text-sm outline-none focus:border-violet-600 transition-colors"
              />
            </label>
          )}

          {error && (
            <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/5">
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
          <button
            onClick={save}
            disabled={saving || !canSave}
            className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center gap-2"
          >
            {saving && (
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {saving ? "Сохраняю…" : "Создать"}
          </button>
        </footer>
      </div>
    </div>
  );
}