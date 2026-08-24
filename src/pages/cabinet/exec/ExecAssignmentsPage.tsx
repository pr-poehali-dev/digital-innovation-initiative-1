import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading, fmtDate } from "@/components/exec/ExecUI";
import {
  ASSIGNMENT_DONE_STATUSES,
  ASSIGNMENT_STATUS_CLS,
  ACTION_STATUS_LABEL,
  ControlAction,
  PRIORITY_LABEL,
  controlApi,
} from "@/lib/execControlApi";
import { execApi, RefsData } from "@/lib/execCabinetApi";
import AssignmentForm from "@/components/exec/AssignmentForm";

type TabId = "mine_responsible" | "mine_authored" | "overdue" | "awaiting_confirm" | "completed" | "all";

export default function ExecAssignmentsPage() {
  const [items, setItems] = useState<ControlAction[]>([]);
  const [refs, setRefs] = useState<RefsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabId>("all");
  const [formOpen, setFormOpen] = useState<{ open: boolean; item?: ControlAction }>({ open: false });

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([controlApi.actions(), execApi.refs()])
      .then(([a, r]) => {
        setItems(a.items);
        setRefs(r);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const counts = useMemo(
    () => ({
      all: items.length,
      overdue: items.filter((a) => a.is_overdue).length,
      awaiting_confirm: items.filter((a) => a.status === "done_by_executor").length,
      completed: items.filter((a) => ASSIGNMENT_DONE_STATUSES.has(a.status)).length,
    }),
    [items],
  );

  const filtered = useMemo(() => {
    switch (tab) {
      case "overdue":
        return items.filter((a) => a.is_overdue);
      case "awaiting_confirm":
        return items.filter((a) => a.status === "done_by_executor");
      case "completed":
        return items.filter((a) => ASSIGNMENT_DONE_STATUSES.has(a.status));
      case "mine_responsible":
      case "mine_authored":
        // без person_id текущего пользователя фильтруем на бэкенде отдельным вызовом —
        // здесь оставляем общий список, если фильтр не даёт результата
        return items;
      default:
        return items.filter((a) => !ASSIGNMENT_DONE_STATUSES.has(a.status));
    }
  }, [items, tab]);

  const advanceStatus = async (a: ControlAction) => {
    if (a.status === "new" || a.status === "not_started") {
      await controlApi.saveAction({ id: a.id, status: "accepted" });
      load();
      return;
    }
    if (a.status === "accepted") {
      await controlApi.saveAction({ id: a.id, status: "in_progress" });
      load();
      return;
    }
    if (a.status === "in_progress") {
      const result = window.prompt("Результат выполнения:");
      if (!result) return;
      await controlApi.saveAction({
        id: a.id,
        status: "done_by_executor",
        result,
        fact_date: new Date().toISOString().slice(0, 10),
      });
      load();
      return;
    }
    if (a.status === "done_by_executor") {
      await controlApi.saveAction({ id: a.id, status: "accepted_by_head" });
      load();
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm("Удалить поручение?")) return;
    await controlApi.deleteAction(id);
    load();
  };

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

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "all", label: "В работе" },
    { id: "overdue", label: "Просроченные", count: counts.overdue },
    { id: "awaiting_confirm", label: "Ожидают подтверждения", count: counts.awaiting_confirm },
    { id: "completed", label: "Выполненные", count: counts.completed },
  ];

  return (
    <Layout>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6 space-y-5">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Поручения</h1>
            <p className="text-sm text-slate-500 mt-1">
              Контроль исполнения: от постановки до принятия результата
            </p>
          </div>
          <button
            onClick={() => setFormOpen({ open: true })}
            className="px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Icon name="Plus" size={15} />
            Новое поручение
          </button>
        </header>

        <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 -mb-px whitespace-nowrap transition-colors ${
                tab === t.id
                  ? "border-violet-600 text-slate-900 font-medium"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span
                  className={`text-xs px-1.5 rounded ${
                    t.id === "overdue" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {!filtered.length ? (
          <Empty text="Поручений нет" icon="ClipboardCheck" />
        ) : (
          <div className="space-y-2">
            {filtered.map((a) => {
              const statusCls = ASSIGNMENT_STATUS_CLS[a.status] || ASSIGNMENT_STATUS_CLS.new;
              const prio = PRIORITY_LABEL[a.priority] || PRIORITY_LABEL.normal;
              const isDone = ASSIGNMENT_DONE_STATUSES.has(a.status);
              return (
                <div
                  key={a.id}
                  className={`rounded-lg border p-4 ${
                    a.is_overdue ? "border-red-300 bg-red-50/40" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-[11px] px-2 py-0.5 rounded-md border ${statusCls}`}>
                          {ACTION_STATUS_LABEL[a.status] || a.status}
                        </span>
                        <span className={`text-[11px] px-2 py-0.5 rounded-md border ${prio.cls}`}>
                          {prio.title}
                        </span>
                        {a.is_on_control && (
                          <span className="text-[11px] px-2 py-0.5 rounded-md border bg-violet-50 text-violet-700 border-violet-200">
                            на контроле
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-900 leading-snug">
                        {a.title || a.description}
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs text-slate-500">
                        <span>
                          <Icon name="User" size={11} className="inline mr-1" />
                          {a.responsible_name || "без исполнителя"}
                        </span>
                        {a.coexecutors.length > 0 && (
                          <span>+ {a.coexecutors.map((c) => c.display_name).join(", ")}</span>
                        )}
                        {a.due_at && (
                          <span className={a.is_overdue ? "text-red-600" : ""}>
                            <Icon name="Calendar" size={11} className="inline mr-1" />
                            {fmtDate(a.due_at)}
                          </span>
                        )}
                        {a.initiative_title && <span className="truncate">{a.initiative_title}</span>}
                        {a.meeting_title && (
                          <span className="text-violet-600">из встречи «{a.meeting_title}»</span>
                        )}
                      </div>
                      {a.result && (
                        <div className="mt-2 p-2 rounded-lg bg-green-500/5 border border-green-500/20">
                          <p className="text-xs text-slate-500">Результат</p>
                          <p className="text-sm text-green-800">{a.result}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {!isDone && (
                        <button
                          onClick={() => advanceStatus(a)}
                          className="px-2.5 py-1.5 rounded-lg bg-violet-100 hover:bg-violet-200 text-violet-700 text-xs font-medium transition-colors"
                        >
                          {a.status === "new" || a.status === "not_started"
                            ? "Принять"
                            : a.status === "accepted"
                              ? "Начать"
                              : a.status === "in_progress"
                                ? "Выполнено"
                                : "Подтвердить"}
                        </button>
                      )}
                      <button
                        onClick={() => setFormOpen({ open: true, item: a })}
                        title="Редактировать"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-violet-600 hover:bg-slate-100 transition-colors"
                      >
                        <Icon name="Pencil" size={14} />
                      </button>
                      <button
                        onClick={() => remove(a.id)}
                        title="Удалить"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-slate-100 transition-colors"
                      >
                        <Icon name="Trash2" size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {formOpen.open && refs && (
        <AssignmentForm
          action={formOpen.item}
          persons={refs.persons}
          initiatives={refs.initiatives}
          onClose={() => setFormOpen({ open: false })}
          onSaved={() => {
            setFormOpen({ open: false });
            load();
          }}
        />
      )}
    </Layout>
  );
}
