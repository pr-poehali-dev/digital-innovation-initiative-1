import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import {
  BUDGET_KIND_LABEL,
  BUDGET_STATUS_LABEL,
  Decision,
  Dictionaries,
  InitiativeFunctionRef,
  InitiativeLabor,
  InitiativeMilestoneRef,
  execApi,
  Initiative,
  RefsData,
  RoleAssignment,
  Stakeholder,
} from "@/lib/execCabinetApi";
import { Badge, Card, Empty, ErrorBox, Loading, VerificationTag, fmtDate } from "@/components/exec/ExecUI";
import { VerificationSelect } from "@/components/exec/ExecForm";
import InitiativeForm from "@/components/exec/InitiativeForm";
import StakeholderForm from "@/components/exec/StakeholderForm";
import DecisionForm from "@/components/exec/DecisionForm";
import QuickIssueForm from "@/components/exec/QuickIssueForm";
import QuickRiskForm from "@/components/exec/QuickRiskForm";

type Tab = "overview" | "stakeholders" | "decisions" | "roles" | "effect" | "budget";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Основное", icon: "FileText" },
  { id: "stakeholders", label: "Стейкхолдеры", icon: "Users" },
  { id: "decisions", label: "Решения", icon: "GitPullRequest" },
  { id: "roles", label: "Роли", icon: "Shield" },
  { id: "effect", label: "Эффект", icon: "TrendingUp" },
  { id: "budget", label: "Бюджет", icon: "Wallet" },
];

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <div className="text-sm text-slate-800">{value || <span className="text-slate-400">не заполнено</span>}</div>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "warning" | "danger";
  hint?: string;
}) {
  const cls =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-slate-200 bg-white text-slate-900";
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="text-base font-semibold mt-0.5">{value}</p>
      {hint && <p className="text-[10px] mt-0.5 opacity-80 truncate">{hint}</p>}
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
  const [refs, setRefs] = useState<RefsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [editInit, setEditInit] = useState(false);
  const [shForm, setShForm] = useState<{ open: boolean; item: Stakeholder | null }>({
    open: false,
    item: null,
  });
  const [decForm, setDecForm] = useState<{ open: boolean; item: Decision | null }>({
    open: false,
    item: null,
  });
  const [statusSaving, setStatusSaving] = useState(false);
  const [quickIssue, setQuickIssue] = useState(false);
  const [quickRisk, setQuickRisk] = useState(false);
  const [nextMilestone, setNextMilestone] = useState<InitiativeMilestoneRef | null>(null);
  const [issueStats, setIssueStats] = useState({ open_issues: 0, blocking_issues: 0 });
  const [riskStats, setRiskStats] = useState({ open_risks: 0, high_risks: 0 });
  const [labor, setLabor] = useState<InitiativeLabor>({
    plan_hours: 0,
    fact_hours: 0,
    open_steps: 0,
    overdue_steps: 0,
  });
  const [functions, setFunctions] = useState<InitiativeFunctionRef[]>([]);
  const [actionStats, setActionStats] = useState({ open_actions: 0, overdue_actions: 0 });

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([execApi.initiative(Number(id)), execApi.refs()])
      .then(([r, rf]) => {
        setInitiative(r.initiative);
        setStakeholders(r.stakeholders);
        setDecisions(r.decisions);
        setAssignments(r.assignments);
        setDicts(r.dictionaries);
        setRefs(rf);
        setNextMilestone(r.next_milestone);
        setIssueStats(r.issue_stats);
        setRiskStats(r.risk_stats);
        setLabor(r.labor);
        setFunctions(r.functions);
        setActionStats(r.action_stats);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const changeStatus = async (
    entity: "initiative" | "stakeholder" | "decision",
    entityId: number,
    status: string,
  ) => {
    setStatusSaving(true);
    try {
      await execApi.setVerification({ entity, id: entityId, verification_status: status });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStatusSaving(false);
    }
  };

  if (loading)
    return (
      <Layout>
        <Loading />
      </Layout>
    );
  if (error || !initiative)
    return (
      <Layout>
        <ErrorBox message={error || "Инициатива не найдена"} onRetry={load} />
      </Layout>
    );

  const i = initiative;

  return (
    <Layout>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-5">
        <Link
          to="/cabinet/exec/initiatives"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <Icon name="ArrowLeft" size={14} />
          Портфель инициатив
        </Link>

        <header className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono text-slate-400">{i.code || `#${i.id}`}</span>
                <VerificationTag status={i.verification_status} />
                {i.is_test_data && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-700 border border-purple-500/30">
                    тестовые данные
                  </span>
                )}
              </div>
              <h1 className="text-xl font-semibold text-slate-900 leading-snug">{i.title}</h1>
              {i.summary && <p className="text-sm text-slate-500 mt-2 max-w-3xl">{i.summary}</p>}
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <VerificationSelect
                  value={i.verification_status}
                  saving={statusSaving}
                  onChange={(v) => changeStatus("initiative", i.id, v)}
                />
                <button
                  onClick={() => setEditInit(true)}
                  className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium transition-colors flex items-center gap-1.5"
                >
                  <Icon name="Pencil" size={13} />
                  Редактировать
                </button>
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                <Badge dicts={dicts} type="priority" code={i.priority} />
                <Badge dicts={dicts} type="initiative_status" code={i.status} />
                <Badge dicts={dicts} type="initiative_stage" code={i.stage} />
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5 pt-5 border-t border-slate-200">
            <Field
              label="Владелец"
              value={i.owner_name || <span className="text-red-600">не назначен</span>}
            />
            <Field label="Руководитель" value={i.manager_name} />
            <Field label="Куратор" value={i.curator_name} />
            <Field
              label="Срок"
              value={`${fmtDate(i.plan_start)} — ${fmtDate(i.plan_end)}`}
            />
          </div>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <MiniMetric
            label="Ближайшая точка"
            value={nextMilestone ? fmtDate(nextMilestone.plan_date) : "—"}
            tone={
              nextMilestone?.days_left != null && nextMilestone.days_left < 0 ? "danger" : "default"
            }
            hint={nextMilestone?.title}
          />
          <MiniMetric
            label="Открытых задач"
            value={labor.open_steps}
            tone={labor.overdue_steps > 0 ? "warning" : "default"}
            hint={labor.overdue_steps > 0 ? `просрочено: ${labor.overdue_steps}` : undefined}
          />
          <MiniMetric
            label="План/факт часов"
            value={`${Math.round(Number(labor.plan_hours))}/${Math.round(Number(labor.fact_hours))}`}
          />
          <MiniMetric
            label="Проблемы"
            value={issueStats.open_issues}
            tone={issueStats.blocking_issues > 0 ? "danger" : "default"}
            hint={issueStats.blocking_issues > 0 ? `блокирующих: ${issueStats.blocking_issues}` : undefined}
          />
          <MiniMetric
            label="Риски"
            value={riskStats.open_risks}
            tone={riskStats.high_risks > 0 ? "warning" : "default"}
            hint={riskStats.high_risks > 0 ? `высоких: ${riskStats.high_risks}` : undefined}
          />
          <MiniMetric
            label="Поручения"
            value={actionStats.open_actions}
            tone={actionStats.overdue_actions > 0 ? "danger" : "default"}
            hint={actionStats.overdue_actions > 0 ? `просрочено: ${actionStats.overdue_actions}` : undefined}
          />
        </div>

        {functions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Функции Центра:</span>
            {functions.map((f) => (
              <Link
                key={f.id}
                to="/cabinet/exec/center"
                className="text-xs px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
              >
                {f.code ? `${f.code}. ` : ""}
                {f.title}
              </Link>
            ))}
          </div>
        )}

        <nav className="flex gap-1 border-b border-slate-200 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 -mb-px whitespace-nowrap transition-colors ${
                tab === t.id
                  ? "border-violet-600 text-slate-900 font-medium"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon name={t.icon} size={14} />
              {t.label}
              {t.id === "stakeholders" && stakeholders.length > 0 && (
                <span className="text-xs text-slate-400">{stakeholders.length}</span>
              )}
              {t.id === "decisions" && decisions.length > 0 && (
                <span className="text-xs text-slate-400">{decisions.length}</span>
              )}
            </button>
          ))}
        </nav>

        {tab === "overview" && (
          <div className="grid lg:grid-cols-2 gap-5">
            <div className="lg:col-span-2 flex flex-wrap gap-2">
              <button
                onClick={() => setQuickIssue(true)}
                className="px-3.5 py-2 rounded-lg border border-violet-600/30 bg-violet-100 hover:bg-violet-100 text-violet-700 text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Icon name="TriangleAlert" size={15} />
                Завести проблему
              </button>
              <button
                onClick={() => setQuickRisk(true)}
                className="px-3.5 py-2 rounded-lg border border-violet-600/30 bg-violet-100 hover:bg-violet-100 text-violet-700 text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Icon name="ShieldAlert" size={15} />
                Завести риск
              </button>
              <Link
                to={`/cabinet/exec/control?initiative=${i.id}`}
                className="px-3.5 py-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300 text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Icon name="ExternalLink" size={14} />
                Все точки, проблемы и риски
              </Link>
            </div>
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
          <Card
            title="Стейкхолдеры инициативы"
            subtitle={`${stakeholders.length} участников`}
            icon="Users"
            action={
              <button
                onClick={() => setShForm({ open: true, item: null })}
                className="px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <Icon name="Plus" size={13} />
                Добавить
              </button>
            }
          >
            {stakeholders.length === 0 ? (
              <Empty text="Стейкхолдеры не заведены" />
            ) : (
              <div className="space-y-3">
                {stakeholders.map((s) => (
                  <div key={s.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">{s.display_name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {s.position_title}
                          {s.org_name && ` · ${s.org_name}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex flex-wrap gap-1.5">
                          <Badge dicts={dicts} type="participation_state" code={s.participation_state} />
                          <Badge dicts={dicts} type="engagement_status" code={s.engagement_status} />
                        </div>
                        <button
                          onClick={() => setShForm({ open: true, item: s })}
                          title="Редактировать"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-violet-600 hover:bg-slate-100 transition-colors"
                        >
                          <Icon name="Pencil" size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {s.can_decide && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-red-500/15 text-red-700 border border-red-500/30">
                          принимает решение
                        </span>
                      )}
                      {s.must_approve && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-blue-500/15 text-blue-700 border border-blue-500/30">
                          согласовывает
                        </span>
                      )}
                      {s.can_block && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-violet-100 text-violet-700 border border-violet-600/30">
                          может блокировать
                        </span>
                      )}
                      {s.controls_resource && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-purple-500/15 text-purple-700 border border-purple-500/30">
                          контролирует ресурс
                        </span>
                      )}
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-200">
                      <Field label="Позиция по вопросу" value={s.position_on_topic} />
                      <Field label="Подтверждённые требования" value={s.confirmed_requirements} />
                      <Field label="Нерешённые вопросы" value={s.open_questions} />
                      <Field label="Цель взаимодействия" value={s.engagement_goal} />
                    </div>

                    {s.next_action && (
                      <div
                        className={`mt-3 p-2.5 rounded-lg border ${
                          s.is_overdue ? "border-red-500/30 bg-red-500/5" : "border-slate-200 bg-white"
                        }`}
                      >
                        <p className="text-xs text-slate-500 mb-1">Ближайшее действие</p>
                        <p className="text-sm text-slate-800">{s.next_action}</p>
                        <p className={`text-xs mt-1 ${s.is_overdue ? "text-red-600" : "text-slate-500"}`}>
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
          <Card
            title="Управленческие решения"
            subtitle={`${decisions.length} по инициативе`}
            icon="GitPullRequest"
            action={
              <button
                onClick={() => setDecForm({ open: true, item: null })}
                className="px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <Icon name="Plus" size={13} />
                Добавить
              </button>
            }
          >
            {decisions.length === 0 ? (
              <Empty text="Решения не заведены" />
            ) : (
              <div className="space-y-2">
                {decisions.map((dec) => (
                  <div
                    key={dec.id}
                    className={`rounded-lg border p-4 ${
                      dec.is_overdue ? "border-red-500/30 bg-red-500/5" : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500 mb-1">{dec.type_title}</p>
                        <p className="text-sm text-slate-900 leading-snug">{dec.question}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge dicts={dicts} type="decision_status" code={dec.status} />
                        <button
                          onClick={() => setDecForm({ open: true, item: dec })}
                          title="Редактировать"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-violet-600 hover:bg-slate-100 transition-colors"
                        >
                          <Icon name="Pencil" size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-4 mt-3 pt-3 border-t border-slate-200">
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
                        <p className="text-xs text-slate-500 mb-1">Принятое решение</p>
                        <p className="text-sm text-green-800">{dec.final_decision}</p>
                        {dec.result_document && (
                          <p className="text-xs text-slate-500 mt-1">
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
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                      <th className="pb-2 font-medium">Роль</th>
                      <th className="pb-2 font-medium">Лицо</th>
                      <th className="pb-2 font-medium">Период</th>
                      <th className="pb-2 font-medium">Статус</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {assignments.map((a) => (
                      <tr key={a.id}>
                        <td className="py-2.5 text-slate-800">{a.role_title}</td>
                        <td className="py-2.5 text-slate-700">
                          {a.display_name || <span className="text-red-600">не назначено</span>}
                        </td>
                        <td className="py-2.5 text-slate-500 text-xs">
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
          <Card title="Ожидаемый эффект" icon="TrendingUp">
            <div className="space-y-4">
              <Field label="Описание эффекта" value={i.effect_description} />
              <Field label="Владелец эффекта" value={i.effect_owner_name} />
              <Field label="Показатель" value={i.effect_metric} />
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Базовое</p>
                  <p className="text-sm text-slate-800 mt-1">{i.effect_baseline || "—"}</p>
                </div>
                <div className="rounded-lg border border-violet-600/30 bg-violet-50 p-3">
                  <p className="text-xs text-slate-500">Целевое</p>
                  <p className="text-sm text-violet-700 mt-1">{i.effect_target || "—"}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Фактическое</p>
                  <p className="text-sm text-slate-800 mt-1">{i.effect_actual || "—"}</p>
                </div>
              </div>
            </div>
          </Card>
        )}

        {tab === "budget" && (
          <div className="grid lg:grid-cols-2 gap-5">
            <Card title="Бюджетная заявка" icon="Wallet">
              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-md border ${BUDGET_STATUS_LABEL[i.budget_status]?.cls || BUDGET_STATUS_LABEL.not_started.cls}`}
                  >
                    {BUDGET_STATUS_LABEL[i.budget_status]?.title || "Не начата"}
                  </span>
                  {i.budget_kind && (
                    <span className="text-xs px-2 py-0.5 rounded-md border bg-slate-100 text-slate-600 border-slate-200">
                      {BUDGET_KIND_LABEL[i.budget_kind]}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Бюджетный год" value={i.budget_year ? String(i.budget_year) : null} />
                  <Field
                    label="Сумма"
                    value={
                      i.budget_amount != null
                        ? `${Number(i.budget_amount).toLocaleString("ru-RU")} ₽`
                        : null
                    }
                  />
                  <Field label="Прежний источник" value={i.budget_source_prev} />
                  <Field label="Новый источник" value={i.budget_source_new} />
                  <Field label="Ответственный за проработку" value={i.budget_owner_name} />
                  <Field label="Срок представления" value={i.budget_due_date ? fmtDate(i.budget_due_date) : null} />
                </div>
                <Field label="Необходимые материалы" value={i.budget_materials_note} />
                <Field label="Комментарий финансового подразделения" value={i.budget_finance_comment} />
              </div>
            </Card>
            <Card title="Историческая потребность" icon="FileText">
              <div className="space-y-4">
                <Field label="Бюджетная потребность (общая)" value={i.budget_need} />
                <Field label="Источник финансирования (общий)" value={i.budget_source} />
              </div>
            </Card>
          </div>
        )}

        {editInit && refs && (
          <InitiativeForm
            initiative={i}
            dicts={dicts}
            persons={refs.persons}
            onClose={() => setEditInit(false)}
            onSaved={() => {
              setEditInit(false);
              load();
            }}
          />
        )}

        {shForm.open && refs && (
          <StakeholderForm
            stakeholder={shForm.item}
            initiativeId={i.id}
            initiatives={refs.initiatives}
            dicts={dicts}
            persons={refs.persons}
            onClose={() => setShForm({ open: false, item: null })}
            onSaved={() => {
              setShForm({ open: false, item: null });
              load();
            }}
          />
        )}

        {decForm.open && refs && (
          <DecisionForm
            decision={decForm.item}
            initiativeId={i.id}
            initiatives={refs.initiatives}
            decisionTypes={refs.decision_types}
            bodies={refs.bodies}
            dicts={dicts}
            persons={refs.persons}
            onClose={() => setDecForm({ open: false, item: null })}
            onSaved={() => {
              setDecForm({ open: false, item: null });
              load();
            }}
          />
        )}

        {quickIssue && (
          <QuickIssueForm
            initiativeId={i.id}
            initiatives={refs?.initiatives || []}
            onClose={() => setQuickIssue(false)}
            onDone={() => setQuickIssue(false)}
          />
        )}

        {quickRisk && (
          <QuickRiskForm
            initiativeId={i.id}
            initiatives={refs?.initiatives || []}
            onClose={() => setQuickRisk(false)}
            onDone={() => setQuickRisk(false)}
          />
        )}
      </div>
    </Layout>
  );
}