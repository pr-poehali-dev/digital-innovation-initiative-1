import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { Card, Empty, ErrorBox, Loading, fmtDate } from "@/components/exec/ExecUI";
import { execApi, MyDayData } from "@/lib/execCabinetApi";
import { ControlFocus, Meeting, PRIORITY_LABEL, controlApi } from "@/lib/execControlApi";
import { DiagItem, UnassignedStep, peopleApi } from "@/lib/execPeopleApi";

type FilterRange = "today" | "week" | "month" | "critical";

export default function ExecMyDayPage() {
  const navigate = useNavigate();
  const [myDay, setMyDay] = useState<MyDayData | null>(null);
  const [ctrl, setCtrl] = useState<ControlFocus | null>(null);
  const [overloaded, setOverloaded] = useState<DiagItem[]>([]);
  const [unassigned, setUnassigned] = useState<UnassignedStep[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState<FilterRange>("week");

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([
      execApi.myDay(),
      controlApi.focus(),
      peopleApi.diagnostics(),
      peopleApi.unassignedSteps(),
      controlApi.meetings(),
    ])
      .then(([md, cf, diag, un, mt]) => {
        setMyDay(md);
        setCtrl(cf);
        setOverloaded(diag.filter((d) => d.code === "P04"));
        setUnassigned(un);
        setMeetings(mt.items.filter((m) => m.status === "planned"));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const rangeDays = range === "today" ? 1 : range === "week" ? 7 : range === "month" ? 30 : 14;
  const onlyCritical = range === "critical";

  const horizonMilestones = useMemo(() => {
    const list = [...(ctrl?.upcoming_milestones || []), ...(ctrl?.overdue_milestones || [])];
    if (onlyCritical) return list.filter((m) => "days_overdue" in m);
    return list.filter((m) => {
      if ("days_overdue" in m) return true;
      return (m as { days_left: number }).days_left <= rangeDays;
    });
  }, [ctrl, rangeDays, onlyCritical]);

  const myActions = useMemo(() => {
    let list = myDay?.my_actions || [];
    if (onlyCritical) list = list.filter((a) => a.is_overdue || a.priority === "urgent");
    return list;
  }, [myDay, onlyCritical]);

  const overdueActions = myActions.filter((a) => a.is_overdue);
  const upcomingActions = myActions.filter((a) => !a.is_overdue);

  const quickComplete = async (id: number) => {
    const result = window.prompt("Результат выполнения:");
    if (!result) return;
    await controlApi.saveAction({
      id,
      status: "done_by_executor",
      result,
      fact_date: new Date().toISOString().slice(0, 10),
    });
    load();
  };

  const rescheduleAction = async (id: number) => {
    const newDate = window.prompt("Новый срок (ГГГГ-ММ-ДД):");
    if (!newDate) return;
    const comment = window.prompt("Комментарий к переносу (обязательно):");
    if (!comment) {
      alert("Перенос срока требует комментария");
      return;
    }
    await controlApi.saveAction({
      id,
      due_at: newDate,
      status_comment: `Срок перенесён: ${comment}`,
    });
    load();
  };

  if (loading) {
    return (
      <Layout>
        <Loading />
      </Layout>
    );
  }
  if (error || !myDay) {
    return (
      <Layout>
        <ErrorBox message={error || "Нет данных"} onRetry={load} />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-5">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Мой день</h1>
            <p className="text-sm text-slate-500 mt-1">
              Единая точка входа: что произошло, почему важно, что делать сейчас
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-white border border-slate-200">
            {(
              [
                { id: "today", label: "Сегодня" },
                { id: "week", label: "Неделя" },
                { id: "month", label: "Месяц" },
                { id: "critical", label: "Критичное" },
              ] as { id: FilterRange; label: string }[]
            ).map((f) => (
              <button
                key={f.id}
                onClick={() => setRange(f.id)}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  range === f.id ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </header>

        <div className="grid lg:grid-cols-2 gap-4">
          {/* Просроченные поручения */}
          <Card
            title="Просроченные поручения"
            subtitle={`${overdueActions.length} требуют реакции`}
            icon="AlarmClockOff"
            className={overdueActions.length ? "border-red-300" : ""}
            action={
              <Link to="/cabinet/exec/assignments" className="text-xs text-violet-600 hover:text-violet-700">
                Все поручения
              </Link>
            }
          >
            {!overdueActions.length ? (
              <Empty text="Просроченных поручений нет" icon="CircleCheck" />
            ) : (
              <div className="space-y-2">
                {overdueActions.map((a) => (
                  <WhyCard
                    key={a.id}
                    what={a.title || a.description || "Поручение"}
                    why={`Просрочено, срок был ${fmtDate(a.due_at)}${
                      a.initiative_title ? ` · ${a.initiative_title}` : ""
                    }`}
                    tone="danger"
                    actions={[
                      { label: "Выполнено", onClick: () => quickComplete(a.id) },
                      { label: "Перенести срок", onClick: () => rescheduleAction(a.id) },
                    ]}
                  />
                ))}
              </div>
            )}
          </Card>

          {/* Задачи и точки на горизонте */}
          <Card
            title="Контрольные точки на горизонте"
            subtitle={`${horizonMilestones.length} в выбранном периоде`}
            icon="Flag"
          >
            {!horizonMilestones.length ? (
              <Empty text="Ничего не запланировано" icon="Calendar" />
            ) : (
              <div className="space-y-2">
                {horizonMilestones.slice(0, 8).map((m) => (
                  <WhyCard
                    key={m.id}
                    what={m.title}
                    why={
                      "days_overdue" in m
                        ? `Просрочена на ${(m as { days_overdue: number }).days_overdue} дн. · ${m.initiative_title}`
                        : `Через ${(m as { days_left: number }).days_left} дн. · ${m.initiative_title}`
                    }
                    tone={"days_overdue" in m ? "danger" : "default"}
                    actions={[
                      { label: "Открыть инициативу", onClick: () => navigate(`/cabinet/exec/initiatives/${m.initiative_id}`) },
                    ]}
                  />
                ))}
              </div>
            )}
          </Card>

          {/* Поручения без ответственного (задачи) */}
          <Card
            title="Задачи без ответственного"
            subtitle={`${unassigned.length} требуют назначения`}
            icon="UserX"
            className={unassigned.length ? "border-amber-300" : ""}
            action={
              <Link to="/cabinet/exec/assign" className="text-xs text-violet-600 hover:text-violet-700">
                Массовое назначение
              </Link>
            }
          >
            {!unassigned.length ? (
              <Empty text="У всех задач есть ответственный" icon="CircleCheck" />
            ) : (
              <div className="space-y-2">
                {unassigned.slice(0, 6).map((s) => (
                  <WhyCard
                    key={s.id}
                    what={s.title}
                    why={`${s.plan_title || "Без плана"}${s.initiative_title ? ` · ${s.initiative_title}` : ""}${
                      s.due_date ? ` · срок ${fmtDate(s.due_date)}` : ""
                    }`}
                    tone="warning"
                    actions={[{ label: "Назначить", onClick: () => navigate("/cabinet/exec/assign") }]}
                  />
                ))}
              </div>
            )}
          </Card>

          {/* Перегруженные сотрудники */}
          <Card
            title="Перегруженные сотрудники"
            subtitle={`${overloaded.length} превышают порог загрузки`}
            icon="TrendingUp"
            className={overloaded.length ? "border-amber-300" : ""}
            action={
              <Link to="/cabinet/exec/workload" className="text-xs text-violet-600 hover:text-violet-700">
                Загрузка команды
              </Link>
            }
          >
            {!overloaded.length ? (
              <Empty text="Перегруженных сотрудников нет" icon="CircleCheck" />
            ) : (
              <div className="space-y-2">
                {overloaded.map((d, i) => (
                  <WhyCard
                    key={i}
                    what={d.title}
                    why={d.message}
                    tone="warning"
                    actions={[
                      d.entity_id
                        ? { label: "Открыть сотрудника", onClick: () => navigate(`/cabinet/exec/team/${d.entity_id}`) }
                        : { label: "Загрузка команды", onClick: () => navigate("/cabinet/exec/workload") },
                    ]}
                  />
                ))}
              </div>
            )}
          </Card>

          {/* Проблемы и блокировки */}
          <Card
            title="Проблемы и блокировки"
            subtitle={`${(ctrl?.critical_issues.length || 0) + (ctrl?.blockers.length || 0)} требуют внимания`}
            icon="TriangleAlert"
            className={(ctrl?.blockers.length || 0) > 0 ? "border-red-300" : ""}
            action={
              <Link to="/cabinet/exec/control" className="text-xs text-violet-600 hover:text-violet-700">
                Контроль
              </Link>
            }
          >
            {!ctrl?.critical_issues.length && !ctrl?.blockers.length ? (
              <Empty text="Критичных проблем и блокировок нет" icon="CircleCheck" />
            ) : (
              <div className="space-y-2">
                {(ctrl?.blockers || []).slice(0, 3).map((b) => (
                  <WhyCard
                    key={`b-${b.id}`}
                    what={b.subject}
                    why={`Блокировка: ${b.block_what} · ${b.initiative_title}`}
                    tone="danger"
                    actions={[{ label: "Открыть", onClick: () => navigate("/cabinet/exec/control") }]}
                  />
                ))}
                {(ctrl?.critical_issues || []).slice(0, 4).map((p) => (
                  <WhyCard
                    key={`i-${p.id}`}
                    what={p.title}
                    why={`${p.criticality === "critical" ? "Критичная" : "Высокая"} проблема · ${p.initiative_title}`}
                    tone="warning"
                    actions={[{ label: "Открыть", onClick: () => navigate("/cabinet/exec/control") }]}
                  />
                ))}
              </div>
            )}
          </Card>

          {/* Риски, требующие внимания */}
          <Card
            title="Риски, требующие внимания"
            subtitle={`${ctrl?.high_risks.length || 0} с высокой оценкой`}
            icon="ShieldAlert"
          >
            {!ctrl?.high_risks.length ? (
              <Empty text="Высоких рисков нет" icon="CircleCheck" />
            ) : (
              <div className="space-y-2">
                {ctrl.high_risks.slice(0, 5).map((r) => (
                  <WhyCard
                    key={r.id}
                    what={r.description}
                    why={`Оценка риска: ${r.risk_score} · ${r.initiative_title}`}
                    tone="warning"
                    actions={[{ label: "Открыть", onClick: () => navigate("/cabinet/exec/control") }]}
                  />
                ))}
              </div>
            )}
          </Card>

          {/* Решения, которые нужно принять */}
          <Card
            title="Решения, которые нужно принять"
            subtitle={`${ctrl?.group_agenda.length || 0} в повестке`}
            icon="GitPullRequest"
          >
            {!ctrl?.group_agenda.length ? (
              <Empty text="Повестка пуста" icon="CircleCheck" />
            ) : (
              <div className="space-y-2">
                {ctrl.group_agenda.slice(0, 5).map((d) => (
                  <WhyCard
                    key={d.id}
                    what={d.question}
                    why={`${d.body_title || "Требуется решение"} · ${d.initiative_title}`}
                    tone="default"
                    actions={[
                      { label: "Открыть инициативу", onClick: () => navigate(`/cabinet/exec/initiatives/${d.initiative_id}`) },
                    ]}
                  />
                ))}
              </div>
            )}
          </Card>

          {/* Встречи на ближайшее время */}
          <Card
            title="Встречи на ближайшее время"
            subtitle={`${meetings.length} запланировано`}
            icon="CalendarClock"
            action={
              <Link to="/cabinet/exec/meetings" className="text-xs text-violet-600 hover:text-violet-700">
                Все встречи
              </Link>
            }
          >
            {!meetings.length ? (
              <Empty text="Встреч не запланировано" icon="Calendar" />
            ) : (
              <div className="space-y-2">
                {meetings.slice(0, 5).map((m) => (
                  <WhyCard
                    key={m.id}
                    what={m.title}
                    why={`${fmtDate(m.meeting_at)}${m.location ? ` · ${m.location}` : ""}`}
                    tone="default"
                    actions={[{ label: "Открыть", onClick: () => navigate(`/cabinet/exec/meetings/${m.id}`) }]}
                  />
                ))}
              </div>
            )}
          </Card>

          {/* Последние изменения по инициативам */}
          <Card title="Последние изменения по инициативам" icon="History">
            {!myDay.recent_initiatives.length ? (
              <Empty text="Изменений пока нет" icon="Inbox" />
            ) : (
              <div className="space-y-2">
                {myDay.recent_initiatives.map((i) => (
                  <WhyCard
                    key={i.id}
                    what={i.title}
                    why={`${i.owner_name || "владелец не назначен"} · обновлено ${fmtDate(i.updated_at)}`}
                    tone={i.owner_name ? "default" : "warning"}
                    actions={[{ label: "Открыть", onClick: () => navigate(`/cabinet/exec/initiatives/${i.id}`) }]}
                  />
                ))}
              </div>
            )}
          </Card>

          {/* Мои личные задачи и предстоящие поручения */}
          <Card
            title="Мои задачи и поручения"
            subtitle={`${upcomingActions.length} предстоит`}
            icon="ListTodo"
          >
            {!upcomingActions.length ? (
              <Empty text="Задач нет" icon="CircleCheck" />
            ) : (
              <div className="space-y-2">
                {upcomingActions.slice(0, 6).map((a) => {
                  const prio = PRIORITY_LABEL[a.priority];
                  return (
                    <WhyCard
                      key={a.id}
                      what={a.title || a.description || "Поручение"}
                      why={`${a.due_at ? `Срок ${fmtDate(a.due_at)}` : "Без срока"}${
                        a.initiative_title ? ` · ${a.initiative_title}` : ""
                      } · ${prio.title}`}
                      tone="default"
                      actions={[
                        { label: "Выполнено", onClick: () => quickComplete(a.id) },
                        { label: "Перенести", onClick: () => rescheduleAction(a.id) },
                      ]}
                    />
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Ожидают моего подтверждения */}
        {myDay.incoming_actions.length > 0 && (
          <Card
            title="Выполнено исполнителем — ждёт вашего подтверждения"
            subtitle={`${myDay.incoming_actions.length} поручений`}
            icon="ClipboardCheck"
            className="border-emerald-300"
          >
            <div className="space-y-2">
              {myDay.incoming_actions.map((a) => (
                <WhyCard
                  key={a.id}
                  what={a.title || a.description || "Поручение"}
                  why={`Исполнитель: ${a.responsible_name || "—"}`}
                  tone="default"
                  actions={[
                    {
                      label: "Принять",
                      onClick: async () => {
                        await controlApi.saveAction({ id: a.id, status: "accepted_by_head" });
                        load();
                      },
                    },
                    {
                      label: "Вернуть в работу",
                      onClick: async () => {
                        const comment = window.prompt("Комментарий (что нужно доработать):");
                        await controlApi.saveAction({
                          id: a.id,
                          status: "in_progress",
                          status_comment: comment || undefined,
                        });
                        load();
                      },
                    },
                  ]}
                />
              ))}
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}

/** Карточка «что / почему / что делать» — базовый блок Моего дня. */
function WhyCard({
  what,
  why,
  tone = "default",
  actions = [],
}: {
  what: string;
  why: string;
  tone?: "default" | "warning" | "danger";
  actions?: { label: string; onClick: () => void }[];
}) {
  const toneCls =
    tone === "danger"
      ? "border-red-200 bg-red-50/50"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50/50"
        : "border-slate-200 bg-white";
  return (
    <div className={`rounded-lg border p-3 ${toneCls}`}>
      <p className="text-sm text-slate-900 leading-snug">{what}</p>
      <p className="text-xs text-slate-500 mt-1">{why}</p>
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {actions.map((a, i) => (
            <button
              key={i}
              onClick={(e) => {
                e.preventDefault();
                a.onClick();
              }}
              className="text-xs px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:border-violet-300 hover:text-violet-700 transition-colors flex items-center gap-1"
            >
              <Icon name="ArrowRight" size={11} />
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}