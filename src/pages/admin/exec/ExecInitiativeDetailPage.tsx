import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import {
  Decision,
  Dictionaries,
  execApi,
  Initiative,
  RoleAssignment,
  Stakeholder,
} from "@/lib/execCabinetApi";
import { Badge, Card, Empty, ErrorBox, Loading, VerificationTag, fmtDate } from "@/components/exec/ExecUI";

type Tab = "overview" | "stakeholders" | "decisions" | "roles" | "effect";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Основное", icon: "FileText" },
  { id: "stakeholders", label: "Стейкхолдеры", icon: "Users" },
  { id: "decisions", label: "Решения", icon: "GitPullRequest" },
  { id: "roles", label: "Роли", icon: "Shield" },
  { id: "effect", label: "Эффект и бюджет", icon: "TrendingUp" },
];

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="text-sm text-gray-200">{value || <span className="text-gray-600">не заполнено</span>}</div>
    </div>
  );
}

export default function ExecInitiativeDetailPage() {
  const { id } = useParams();
  const [initiative, setInitiative] = useState<Initiative | null>(null);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [assignments, setAssignments] = useState<RoleAssignment[]>([]);
  const [dicts, setDicts] = useState<Dictionaries>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");

  const load = () => {
    setLoading(true);
    setError("");
    execApi
      .initiative(Number(id))
      .then((r) => {
        setInitiative(r.initiative);
        setStakeholders(r.stakeholders);
        setDecisions(r.decisions);
        setAssignments(r.assignments);
        setDicts(r.dictionaries);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  if (loading)
    return (
      <AdminShell>
        <Loading />
      </AdminShell>
    );
  if (error || !initiative)
    return (
      <AdminShell>
        <ErrorBox message={error || "Инициатива не найдена"} onRetry={load} />
      </AdminShell>
    );

  const i = initiative;

  return (
    <AdminShell>
      <div className="max-w-[1400px] space-y-5">
        <Link
          to="/admin/exec/initiatives"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          <Icon name="ArrowLeft" size={14} />
          Портфель инициатив
        </Link>

        <header className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono text-gray-600">{i.code || `#${i.id}`}</span>
                <VerificationTag status={i.verification_status} />
                {i.is_test_data && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                    тестовые данные
                  </span>
                )}
              </div>
              <h1 className="text-xl font-semibold text-white leading-snug">{i.title}</h1>
              {i.summary && <p className="text-sm text-gray-400 mt-2 max-w-3xl">{i.summary}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge dicts={dicts} type="priority" code={i.priority} />
              <Badge dicts={dicts} type="initiative_status" code={i.status} />
              <Badge dicts={dicts} type="initiative_stage" code={i.stage} />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5 pt-5 border-t border-gray-800">
            <Field
              label="Владелец"
              value={i.owner_name || <span className="text-red-400">не назначен</span>}
            />
            <Field label="Руководитель" value={i.manager_name} />
            <Field label="Куратор" value={i.curator_name} />
            <Field
              label="Срок"
              value={`${fmtDate(i.plan_start)} — ${fmtDate(i.plan_end)}`}
            />
          </div>
        </header>

        <nav className="flex gap-1 border-b border-gray-800 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 -mb-px whitespace-nowrap transition-colors ${
                tab === t.id
                  ? "border-orange-500 text-white font-medium"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              <Icon name={t.icon} size={14} />
              {t.label}
              {t.id === "stakeholders" && stakeholders.length > 0 && (
                <span className="text-xs text-gray-600">{stakeholders.length}</span>
              )}
              {t.id === "decisions" && decisions.length > 0 && (
                <span className="text-xs text-gray-600">{decisions.length}</span>
              )}
            </button>
          ))}
        </nav>

        {tab === "overview" && (
          <div className="grid lg:grid-cols-2 gap-5">
            <Card title="Проблема и цель" icon="Target">
              <div className="space-y-4">
                <Field label="Проблема или потребность" value={i.problem} />
                <Field label="Цель" value={i.goal} />
                <Field label="Ожидаемый результат" value={i.expected_result} />
              </div>
            </Card>
            <Card title="Создаваемое решение" icon="Package">
              <div className="space-y-4">
                <Field label="Наименование решения" value={i.solution_title} />
                <Field
                  label="Тип решения"
                  value={i.solution_type ? <Badge dicts={dicts} type="solution_type" code={i.solution_type} /> : null}
                />
                <Field
                  label="Форма реализации"
                  value={
                    i.realization_form ? (
                      <Badge dicts={dicts} type="realization_form" code={i.realization_form} />
                    ) : null
                  }
                />
                <Field label="Масштаб" value={i.scale ? <Badge dicts={dicts} type="scale" code={i.scale} /> : null} />
                <Field
                  label="Уровень эскалации"
                  value={
                    i.escalation_level ? (
                      <Badge dicts={dicts} type="escalation_level" code={i.escalation_level} />
                    ) : null
                  }
                />
              </div>
            </Card>
          </div>
        )}

        {tab === "stakeholders" && (
          <Card title="Стейкхолдеры инициативы" subtitle={`${stakeholders.length} участников`} icon="Users">
            {stakeholders.length === 0 ? (
              <Empty text="Стейкхолдеры не заведены" />
            ) : (
              <div className="space-y-3">
                {stakeholders.map((s) => (
                  <div key={s.id} className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white">{s.display_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {s.position_title}
                          {s.org_name && ` · ${s.org_name}`}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge dicts={dicts} type="participation_state" code={s.participation_state} />
                        <Badge dicts={dicts} type="engagement_status" code={s.engagement_status} />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {s.can_decide && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30">
                          принимает решение
                        </span>
                      )}
                      {s.must_approve && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                          согласовывает
                        </span>
                      )}
                      {s.can_block && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-orange-500/15 text-orange-300 border border-orange-500/30">
                          может блокировать
                        </span>
                      )}
                      {s.controls_resource && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                          контролирует ресурс
                        </span>
                      )}
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-800">
                      <Field label="Позиция по вопросу" value={s.position_on_topic} />
                      <Field label="Подтверждённые требования" value={s.confirmed_requirements} />
                      <Field label="Нерешённые вопросы" value={s.open_questions} />
                      <Field label="Цель взаимодействия" value={s.engagement_goal} />
                    </div>

                    {s.next_action && (
                      <div
                        className={`mt-3 p-2.5 rounded-lg border ${
                          s.is_overdue ? "border-red-500/30 bg-red-500/5" : "border-gray-800 bg-gray-900"
                        }`}
                      >
                        <p className="text-xs text-gray-500 mb-1">Ближайшее действие</p>
                        <p className="text-sm text-gray-200">{s.next_action}</p>
                        <p className={`text-xs mt-1 ${s.is_overdue ? "text-red-400" : "text-gray-500"}`}>
                          {fmtDate(s.next_action_due)}
                          {s.is_overdue && " · просрочено"}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {tab === "decisions" && (
          <Card title="Управленческие решения" subtitle={`${decisions.length} по инициативе`} icon="GitPullRequest">
            {decisions.length === 0 ? (
              <Empty text="Решения не заведены" />
            ) : (
              <div className="space-y-2">
                {decisions.map((dec) => (
                  <div
                    key={dec.id}
                    className={`rounded-lg border p-4 ${
                      dec.is_overdue ? "border-red-500/30 bg-red-500/5" : "border-gray-800 bg-gray-900/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-xs text-gray-500 mb-1">{dec.type_title}</p>
                        <p className="text-sm text-white leading-snug">{dec.question}</p>
                      </div>
                      <Badge dicts={dicts} type="decision_status" code={dec.status} />
                    </div>

                    <div className="grid sm:grid-cols-3 gap-4 mt-3 pt-3 border-t border-gray-800">
                      <Field label="Срок" value={fmtDate(dec.due_at)} />
                      <Field
                        label="Кто принял"
                        value={dec.body_title || dec.decided_by_name}
                      />
                      <Field
                        label="Исполнение"
                        value={<Badge dicts={dicts} type="execution_status" code={dec.execution_status} />}
                      />
                    </div>

                    {dec.final_decision && (
                      <div className="mt-3 p-2.5 rounded-lg bg-green-500/5 border border-green-500/20">
                        <p className="text-xs text-gray-500 mb-1">Принятое решение</p>
                        <p className="text-sm text-green-200">{dec.final_decision}</p>
                        {dec.result_document && (
                          <p className="text-xs text-gray-500 mt-1">
                            <Icon name="FileText" size={11} className="inline mr-1" />
                            {dec.result_document} · {fmtDate(dec.decided_at)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {tab === "roles" && (
          <Card title="Назначения ролей" subtitle={`${assignments.length} назначений`} icon="Shield">
            {assignments.length === 0 ? (
              <Empty text="Роли не назначены" />
            ) : (
              <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full text-sm min-w-[600px]">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                      <th className="pb-2 font-medium">Роль</th>
                      <th className="pb-2 font-medium">Лицо</th>
                      <th className="pb-2 font-medium">Период</th>
                      <th className="pb-2 font-medium">Статус</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60">
                    {assignments.map((a) => (
                      <tr key={a.id}>
                        <td className="py-2.5 text-gray-200">{a.role_title}</td>
                        <td className="py-2.5 text-gray-300">
                          {a.display_name || <span className="text-red-400">не назначено</span>}
                        </td>
                        <td className="py-2.5 text-gray-500 text-xs">
                          {fmtDate(a.date_from)}
                          {a.date_to && ` — ${fmtDate(a.date_to)}`}
                        </td>
                        <td className="py-2.5">
                          <VerificationTag status={a.verification_status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {tab === "effect" && (
          <div className="grid lg:grid-cols-2 gap-5">
            <Card title="Ожидаемый эффект" icon="TrendingUp">
              <div className="space-y-4">
                <Field label="Описание эффекта" value={i.effect_description} />
                <Field label="Владелец эффекта" value={i.effect_owner_name} />
                <Field label="Показатель" value={i.effect_metric} />
                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="rounded-lg border border-gray-800 p-3">
                    <p className="text-xs text-gray-500">Базовое</p>
                    <p className="text-sm text-gray-200 mt-1">{i.effect_baseline || "—"}</p>
                  </div>
                  <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
                    <p className="text-xs text-gray-500">Целевое</p>
                    <p className="text-sm text-orange-300 mt-1">{i.effect_target || "—"}</p>
                  </div>
                  <div className="rounded-lg border border-gray-800 p-3">
                    <p className="text-xs text-gray-500">Фактическое</p>
                    <p className="text-sm text-gray-200 mt-1">{i.effect_actual || "—"}</p>
                  </div>
                </div>
              </div>
            </Card>
            <Card title="Бюджет" icon="Wallet">
              <div className="space-y-4">
                <Field label="Бюджетная потребность" value={i.budget_need} />
                <Field label="Источник финансирования" value={i.budget_source} />
              </div>
            </Card>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
