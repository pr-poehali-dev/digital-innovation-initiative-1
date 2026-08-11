import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { execApi, FocusData } from "@/lib/execCabinetApi";
import { CRITICALITY_LABEL, ControlFocus, RISK_LEVEL_LABEL, controlApi } from "@/lib/execControlApi";
import { Badge, Card, Empty, ErrorBox, Loading, Metric, fmtDate, daysLeft } from "@/components/exec/ExecUI";
import GettingStarted from "@/components/exec/GettingStarted";
import QuickStartForm from "@/components/exec/QuickStartForm";

export default function ExecFocusPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<FocusData | null>(null);
  const [ctrl, setCtrl] = useState<ControlFocus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quickStart, setQuickStart] = useState(false);

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([execApi.focus(), controlApi.focus()])
      .then(([f, c]) => {
        setData(f);
        setCtrl(c);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading)
    return (
      <AdminShell>
        <Loading />
      </AdminShell>
    );

  if (error || !data)
    return (
      <AdminShell>
        <ErrorBox message={error || "Нет данных"} onRetry={load} />
      </AdminShell>
    );

  const d = data.dictionaries;
  const blocking = data.issues.filter((i) => i.level === "blocking");
  const warnings = data.issues.filter((i) => i.level === "warning");

  const startCounts = {
    initiatives: data.metrics.initiatives_total,
    milestones:
      (ctrl?.upcoming_milestones.length ?? 0) + (ctrl?.overdue_milestones.length ?? 0),
    issues: ctrl?.metrics.critical_issues ?? 0,
    risks: ctrl?.metrics.high_risks ?? 0,
    decisions: data.metrics.decisions_open,
  };
  const isEmpty =
    startCounts.initiatives === 0 ||
    (startCounts.milestones === 0 && startCounts.issues === 0 && startCounts.risks === 0);

  return (
    <AdminShell>
      <div className="max-w-[1400px] space-y-5">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-white">Мой фокус</h1>
            <p className="text-sm text-gray-500 mt-1">
              Что требует вашего внимания в управленческом контуре сегодня
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setQuickStart(true)}
              className="px-3.5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Icon name="Zap" size={15} />
              Быстрый старт
            </button>
            <Link
              to="/admin/exec/initiatives"
              className="px-3.5 py-2 rounded-lg border border-gray-800 text-gray-300 hover:border-gray-700 text-sm font-medium transition-colors flex items-center gap-2"
            >
              Все инициативы
            </Link>
          </div>
        </header>

        {isEmpty && <GettingStarted counts={startCounts} />}

        {quickStart && (
          <QuickStartForm
            onClose={() => setQuickStart(false)}
            onDone={(id) => navigate(`/admin/exec/initiatives/${id}`)}
          />
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          <Metric label="Инициатив в работе" value={data.metrics.initiatives_total} icon="Rocket" />
          <Metric
            label="Критичных и высоких проблем"
            value={ctrl?.metrics.critical_issues ?? 0}
            icon="TriangleAlert"
            tone={(ctrl?.metrics.critical_issues ?? 0) > 0 ? "danger" : "success"}
          />
          <Metric
            label="Блокирующих факторов"
            value={ctrl?.metrics.blockers ?? 0}
            icon="Ban"
            tone={(ctrl?.metrics.blockers ?? 0) > 0 ? "danger" : "success"}
          />
          <Metric
            label="Просроченных точек"
            value={ctrl?.metrics.overdue_milestones ?? 0}
            icon="CalendarX"
            tone={(ctrl?.metrics.overdue_milestones ?? 0) > 0 ? "danger" : "success"}
          />
          <Metric
            label="Высоких рисков"
            value={ctrl?.metrics.high_risks ?? 0}
            icon="ShieldAlert"
            tone={(ctrl?.metrics.high_risks ?? 0) > 0 ? "warning" : "success"}
          />
          <Metric
            label="Решений ожидают"
            value={data.metrics.decisions_open}
            icon="GitPullRequest"
            tone={data.metrics.decisions_open > 0 ? "warning" : "default"}
          />
          <Metric
            label="Открытых эскалаций"
            value={ctrl?.metrics.open_escalations ?? 0}
            icon="ArrowUpCircle"
            tone={(ctrl?.metrics.open_escalations ?? 0) > 0 ? "warning" : "default"}
          />
        </div>

        {ctrl && ctrl.blockers.length > 0 && (
          <Card
            title="Блокирующие факторы"
            subtitle="Продвижение остановлено — требуется снятие блокировки"
            icon="Ban"
            className="border-red-500/30"
            action={
              <Link to="/admin/exec/control" className="text-xs text-orange-400 hover:text-orange-300">
                Все блокировки
              </Link>
            }
          >
            <div className="space-y-2">
              {ctrl.blockers.map((b) => (
                <Link
                  key={`${b.kind}-${b.id}`}
                  to="/admin/exec/control"
                  className="block p-3 rounded-lg border border-red-500/30 bg-red-500/10 hover:border-red-500/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm text-white leading-snug">{b.subject}</p>
                      <p className="text-xs text-gray-400 mt-1">{b.block_what}</p>
                      <p className="text-xs text-gray-600 mt-1 truncate">{b.initiative_title}</p>
                    </div>
                    <span className={`text-xs ${b.is_overdue ? "text-red-400" : "text-gray-500"}`}>
                      до {fmtDate(b.block_deadline)}
                      {b.is_overdue && " · просрочено"}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        )}

        {ctrl && ctrl.critical_issues.length > 0 && (
          <Card
            title="Критичные и высокие проблемы"
            subtitle={`${ctrl.critical_issues.length} требуют внимания`}
            icon="TriangleAlert"
            action={
              <Link to="/admin/exec/control" className="text-xs text-orange-400 hover:text-orange-300">
                Все проблемы
              </Link>
            }
          >
            <div className="space-y-2">
              {ctrl.critical_issues.slice(0, 6).map((p) => {
                const crit = CRITICALITY_LABEL[p.criticality];
                return (
                  <Link
                    key={p.id}
                    to="/admin/exec/control"
                    className="block p-3 rounded-lg border border-gray-800 bg-gray-900/40 hover:border-gray-700 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm text-white leading-snug">{p.title}</p>
                        <p className="text-xs text-gray-600 mt-1 truncate">{p.initiative_title}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-md border ${crit.cls}`}>
                          {crit.title}
                        </span>
                        <span className={`text-xs ${p.is_overdue ? "text-red-400" : "text-gray-500"}`}>
                          {fmtDate(p.due_at)}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>
        )}

        {ctrl && (ctrl.overdue_milestones.length > 0 || ctrl.upcoming_milestones.length > 0) && (
          <div className="grid lg:grid-cols-2 gap-5">
            <Card
              title="Просроченные контрольные точки"
              subtitle={`${ctrl.overdue_milestones.length} точек`}
              icon="CalendarX"
              className={ctrl.overdue_milestones.length ? "border-red-500/25" : ""}
            >
              {ctrl.overdue_milestones.length === 0 ? (
                <Empty text="Просрочек нет" icon="CircleCheck" />
              ) : (
                <div className="space-y-2">
                  {ctrl.overdue_milestones.map((m) => (
                    <Link
                      key={m.id}
                      to="/admin/exec/control"
                      className="block p-3 rounded-lg border border-red-500/25 bg-red-500/5 hover:border-red-500/40 transition-colors"
                    >
                      <p className="text-sm text-white leading-snug">{m.title}</p>
                      <p className="text-xs text-gray-600 mt-1 truncate">{m.initiative_title}</p>
                      <p className="text-xs text-red-400 mt-1">
                        просрочено на {m.days_overdue} дн. · план {fmtDate(m.plan_date)}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </Card>

            <Card
              title="Контрольные точки на 14 дней"
              subtitle={`${ctrl.upcoming_milestones.length} точек`}
              icon="CalendarClock"
            >
              {ctrl.upcoming_milestones.length === 0 ? (
                <Empty text="Ближайших точек нет" />
              ) : (
                <div className="space-y-2">
                  {ctrl.upcoming_milestones.map((m) => (
                    <Link
                      key={m.id}
                      to="/admin/exec/control"
                      className="block p-3 rounded-lg border border-gray-800 bg-gray-900/40 hover:border-gray-700 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm text-white leading-snug">{m.title}</p>
                          <p className="text-xs text-gray-600 mt-1 truncate">{m.initiative_title}</p>
                        </div>
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          через {m.days_left} дн.
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {ctrl && (ctrl.high_risks.length > 0 || ctrl.my_escalations.length > 0) && (
          <div className="grid lg:grid-cols-2 gap-5">
            <Card
              title="Риски высокого уровня"
              subtitle={`${ctrl.high_risks.length} рисков`}
              icon="ShieldAlert"
            >
              {ctrl.high_risks.length === 0 ? (
                <Empty text="Высоких рисков нет" icon="ShieldCheck" />
              ) : (
                <div className="space-y-2">
                  {ctrl.high_risks.map((r) => {
                    const lvl = RISK_LEVEL_LABEL[r.risk_level];
                    return (
                      <Link
                        key={r.id}
                        to="/admin/exec/control"
                        className="block p-3 rounded-lg border border-gray-800 bg-gray-900/40 hover:border-gray-700 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm text-white leading-snug">{r.description}</p>
                            <p className="text-xs text-gray-600 mt-1 truncate">{r.initiative_title}</p>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-md border ${lvl.cls}`}>
                            {lvl.title} · {r.risk_score}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card
              title="Требуют вашей эскалации"
              subtitle={`${ctrl.my_escalations.length} вопросов`}
              icon="ArrowUpCircle"
            >
              {ctrl.my_escalations.length === 0 ? (
                <Empty text="Эскалаций на вашем уровне нет" icon="CircleCheck" />
              ) : (
                <div className="space-y-2">
                  {ctrl.my_escalations.map((e) => (
                    <Link
                      key={e.id}
                      to="/admin/exec/control"
                      className={`block p-3 rounded-lg border transition-colors ${
                        e.is_overdue
                          ? "border-red-500/30 bg-red-500/5 hover:border-red-500/50"
                          : "border-gray-800 bg-gray-900/40 hover:border-gray-700"
                      }`}
                    >
                      <p className="text-sm text-white leading-snug">{e.subject}</p>
                      <p className="text-xs text-gray-600 mt-1 truncate">{e.initiative_title}</p>
                      <p className={`text-xs mt-1 ${e.is_overdue ? "text-red-400" : "text-gray-500"}`}>
                        передано {fmtDate(e.passed_at)}
                        {e.review_due_at && ` · срок ${fmtDate(e.review_due_at)}`}
                        {e.is_overdue && " · просрочено"}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {ctrl && ctrl.stalled_initiatives.length > 0 && (
          <Card
            title="Инициативы без движения"
            subtitle="Нет владельца, срока или ближайшего действия"
            icon="PauseCircle"
          >
            <div className="space-y-2">
              {ctrl.stalled_initiatives.map((s) => (
                <Link
                  key={s.id}
                  to={`/admin/exec/initiatives/${s.id}`}
                  className="block p-3 rounded-lg border border-amber-500/25 bg-amber-500/5 hover:border-amber-500/40 transition-colors"
                >
                  <p className="text-sm text-white leading-snug">{s.title}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {s.reasons.map((r) => (
                      <span
                        key={r}
                        className="text-xs px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                  {s.computed_next && (
                    <p className="text-xs text-gray-500 mt-2">
                      Ближайшее по данным системы: {s.computed_next.text} · {fmtDate(s.computed_next.due)}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </Card>
        )}

        {blocking.length > 0 && (
          <Card
            title="Блокирующие проблемы полномочий"
            subtitle="Требуют решения до продолжения работы"
            icon="OctagonAlert"
            action={
              <Link to="/admin/exec/diagnostics" className="text-xs text-orange-400 hover:text-orange-300">
                Вся диагностика
              </Link>
            }
          >
            <div className="space-y-2">
              {blocking.slice(0, 5).map((iss, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-3 rounded-lg border border-red-500/25 bg-red-500/5"
                >
                  <span className="text-[10px] font-mono text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5">
                    {iss.code}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-red-200 font-medium">{iss.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{iss.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="grid lg:grid-cols-2 gap-5">
          <Card
            title="Решения, ожидающие принятия"
            subtitle={`${data.pending_decisions.length} в работе`}
            icon="GitPullRequest"
            action={
              <Link to="/admin/exec/decisions" className="text-xs text-orange-400 hover:text-orange-300">
                Все решения
              </Link>
            }
          >
            {data.pending_decisions.length === 0 ? (
              <Empty text="Нет решений, ожидающих принятия" icon="CircleCheck" />
            ) : (
              <div className="space-y-2">
                {data.pending_decisions.slice(0, 6).map((dec) => {
                  const left = daysLeft(dec.due_at);
                  return (
                    <Link
                      key={dec.id}
                      to={`/admin/exec/initiatives/${dec.initiative_id}`}
                      className="block p-3 rounded-lg border border-gray-800 hover:border-gray-700 bg-gray-900/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm text-white leading-snug">{dec.question}</p>
                          <p className="text-xs text-gray-500 mt-1 truncate">{dec.initiative_title}</p>
                        </div>
                        <Badge dicts={d} type="decision_status" code={dec.status} />
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-xs">
                        <span className={dec.is_overdue ? "text-red-400" : "text-gray-500"}>
                          <Icon name="Clock" size={11} className="inline mr-1" />
                          {fmtDate(dec.due_at)}
                          {left !== null && !dec.is_overdue && ` · через ${left} дн.`}
                          {dec.is_overdue && " · просрочено"}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>

          <Card
            title="Действия по стейкхолдерам"
            subtitle="Ближайшие и просроченные"
            icon="Users"
            action={
              <Link to="/admin/exec/stakeholders" className="text-xs text-orange-400 hover:text-orange-300">
                Карта
              </Link>
            }
          >
            {data.stakeholder_actions.length === 0 ? (
              <Empty text="Нет запланированных действий" icon="CircleCheck" />
            ) : (
              <div className="space-y-2">
                {data.stakeholder_actions.slice(0, 6).map((s) => (
                  <div
                    key={s.id}
                    className={`p-3 rounded-lg border bg-gray-900/40 ${
                      s.is_overdue ? "border-red-500/30" : "border-gray-800"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-white">{s.display_name}</p>
                        <p className="text-xs text-gray-500 truncate">{s.position_title}</p>
                      </div>
                      <Badge dicts={d} type="engagement_status" code={s.engagement_status} />
                    </div>
                    <p className="text-xs text-gray-400 mt-2 leading-snug">{s.next_action}</p>
                    <p className={`text-xs mt-1 ${s.is_overdue ? "text-red-400" : "text-gray-500"}`}>
                      <Icon name="Calendar" size={11} className="inline mr-1" />
                      {fmtDate(s.next_action_due)}
                      {s.is_overdue && " · просрочено"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-5">
          <Card
            title="Вопросы к заседанию Группы"
            subtitle="Отмечены признаком «рассмотрение Группой»"
            icon="ClipboardList"
          >
            {!ctrl || ctrl.group_agenda.length === 0 ? (
              <Empty text="Вопросов на рассмотрение Группой не отмечено" />
            ) : (
              <ol className="space-y-2">
                {ctrl.group_agenda.map((g, i) => (
                  <li key={g.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-gray-900/50">
                    <span className="w-5 h-5 rounded-md bg-orange-500/15 text-orange-400 text-xs font-medium flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white leading-snug">{g.question}</p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{g.initiative_title}</p>
                      {g.review_target_date && (
                        <p className="text-xs text-gray-600 mt-0.5">
                          рассмотрение {fmtDate(g.review_target_date)}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card title="Предупреждения" subtitle={`${warnings.length} требуют внимания`} icon="TriangleAlert">
            {warnings.length === 0 ? (
              <Empty text="Предупреждений нет" icon="CircleCheck" />
            ) : (
              <div className="space-y-2">
                {warnings.slice(0, 6).map((w, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5"
                  >
                    <span className="text-[10px] font-mono text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5">
                      {w.code}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-amber-200/90">{w.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{w.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card
          title="Портфель инициатив"
          subtitle={`${data.initiatives.length} активных`}
          icon="Rocket"
          action={
            <Link to="/admin/exec/initiatives" className="text-xs text-orange-400 hover:text-orange-300">
              Весь портфель
            </Link>
          }
        >
          {data.initiatives.length === 0 ? (
            <Empty text="Инициатив пока нет" />
          ) : (
            <div className="space-y-2">
              {data.initiatives.map((i) => (
                <Link
                  key={i.id}
                  to={`/admin/exec/initiatives/${i.id}`}
                  className="flex items-center gap-4 p-3 rounded-lg border border-gray-800 hover:border-gray-700 bg-gray-900/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white leading-snug">{i.title}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {i.owner_name ? `Владелец: ${i.owner_name}` : "Владелец не назначен"}
                      {i.plan_end && ` · до ${fmtDate(i.plan_end)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge dicts={d} type="priority" code={i.priority} />
                    <Badge dicts={d} type="initiative_status" code={i.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}