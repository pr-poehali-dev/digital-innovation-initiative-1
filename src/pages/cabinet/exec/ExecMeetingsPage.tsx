import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading, fmtDate } from "@/components/exec/ExecUI";
import { MEETING_STATUS_LABEL, Meeting, controlApi } from "@/lib/execControlApi";
import { execApi, RefsData } from "@/lib/execCabinetApi";
import MeetingForm from "@/components/exec/MeetingForm";

export default function ExecMeetingsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Meeting[]>([]);
  const [refs, setRefs] = useState<RefsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([controlApi.meetings(), execApi.refs()])
      .then(([m, r]) => {
        setItems(m.items);
        setRefs(r);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading) {
    return (
      <Layout>
        <Loading />
      </Layout>
    );
  }
  if (error) {
    return (
      <Layout>
        <ErrorBox message={error} onRetry={load} />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6 space-y-5">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Встречи и решения</h1>
            <p className="text-sm text-slate-500 mt-1">
              Протокол встречи можно одним действием превратить в задачу, поручение или решение
            </p>
          </div>
          <button
            onClick={() => setFormOpen(true)}
            className="px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Icon name="Plus" size={15} />
            Новая встреча
          </button>
        </header>

        {!items.length ? (
          <Empty text="Встреч пока нет" icon="CalendarClock" />
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {items.map((m) => (
              <button
                key={m.id}
                onClick={() => navigate(`/cabinet/exec/meetings/${m.id}`)}
                className="text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900 leading-snug">{m.title}</p>
                  <span className="text-[11px] px-2 py-0.5 rounded-md border bg-slate-100 text-slate-600 border-slate-200 flex-shrink-0">
                    {MEETING_STATUS_LABEL[m.status]}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
                  <Icon name="Calendar" size={11} />
                  {fmtDate(m.meeting_at)}
                  {m.location && ` · ${m.location}`}
                </p>
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                  <span>
                    <Icon name="Users" size={11} className="inline mr-1" />
                    {m.participants?.length || 0}
                  </span>
                  <span>
                    <Icon name="Rocket" size={11} className="inline mr-1" />
                    {m.initiatives?.length || 0}
                  </span>
                  <span>
                    <Icon name="FileText" size={11} className="inline mr-1" />
                    {m.outcomes_count || 0} записей
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {formOpen && refs && (
        <MeetingForm
          persons={refs.persons}
          initiatives={refs.initiatives}
          onClose={() => setFormOpen(false)}
          onSaved={(id) => {
            setFormOpen(false);
            navigate(`/cabinet/exec/meetings/${id}`);
          }}
        />
      )}
    </Layout>
  );
}