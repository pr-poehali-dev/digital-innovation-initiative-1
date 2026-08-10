import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { execApi, FocusData } from "@/lib/execCabinetApi";
import { Badge, Card, Empty, ErrorBox, Loading, Metric, fmtDate, daysLeft } from "@/components/exec/ExecUI";

export default function ExecFocusPage() {
  const [data, setData] = useState<FocusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    execApi
      .focus()
      .then(setData)
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
          <Link
            to="/admin/exec/initiatives"
            className="px-3.5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Icon name="Plus" size={15} />
            Инициативы
          </Link>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          <Metric label="Инициатив в работе" value={data.metrics.initiatives_total} icon="Rocket" />
          <Metric
            label="Решений ожидают"
            value={data.metrics.decisions_open}
            icon="GitPullRequest"
            tone={data.metrics.decisions_open > 0 ? "warning" : "default"}
          />
          <Metric
            label="Решений просрочено"
            value={data.metrics.decisions_overdue}
            icon="Clock"
            tone={data.metrics.decisions_overdue > 0 ? "danger" : "success"}
          />
          <Metric
            label="Действий просрочено"
            value={data.metrics.actions_overdue}
            icon="CalendarX"
            tone={data.metrics.actions_overdue > 0 ? "danger" : "success"}
          />
          <Metric
            label="Без владельца"
            value={data.metrics.initiatives_no_owner}
            icon="UserX"
            tone={data.metrics.initiatives_no_owner > 0 ? "danger" : "success"}
          />
          <Metric
            label="Без владельца эффекта"
            value={data.metrics.initiatives_no_effect_owner}
            icon="TargetIcon"
            tone={data.metrics.initiatives_no_effect_owner > 0 ? "warning" : "success"}
          />
          <Metric label="Стейкхолдеров" value={data.metrics.stakeholders_total} icon="Users" />
        </div>

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
            subtitle="Готовятся или на согласовании"
            icon="ClipboardList"
          >
            {data.group_agenda.length === 0 ? (
              <Empty text="Повестка пуста" />
            ) : (
              <ol className="space-y-2">
                {data.group_agenda.map((g, i) => (
                  <li key={g.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-gray-900/50">
                    <span className="w-5 h-5 rounded-md bg-orange-500/15 text-orange-400 text-xs font-medium flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-white leading-snug">{g.question}</p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{g.initiative_title}</p>
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
