import { useEffect, useMemo, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { PersonRef, RefsData, execApi } from "@/lib/execCabinetApi";
import {
  ACTION_STATUS_LABEL,
  CRITICALITY_LABEL,
  ControlAction,
  ESCALATION_LEVELS,
  ESCALATION_STATUS_LABEL,
  Escalation,
  ISSUE_STATUS_LABEL,
  Issue,
  MILESTONE_STATUS_LABEL,
  MILESTONE_TYPES,
  Milestone,
  RISK_LEVEL_LABEL,
  RISK_STATUS_LABEL,
  Risk,
  controlApi,
  takeWarning,
} from "@/lib/execControlApi";
import { ACCESS_ROLE_LABEL, CabinetAccess } from "@/lib/execAccess";
import { Card, Empty, ErrorBox, Loading, Metric, fmtDate } from "@/components/exec/ExecUI";
import MilestoneForm from "@/components/exec/MilestoneForm";
import IssueForm from "@/components/exec/IssueForm";
import RiskForm from "@/components/exec/RiskForm";
import {
  ActionForm,
  EscalationForm,
  LiftBlockForm,
} from "@/components/exec/ActionEscalationForms";

type Tab = "milestones" | "issues" | "risks" | "escalations";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "milestones", label: "Контрольные точки", icon: "Flag" },
  { id: "issues", label: "Проблемы", icon: "TriangleAlert" },
  { id: "risks", label: "Риски", icon: "ShieldAlert" },
  { id: "escalations", label: "Эскалации", icon: "ArrowUpCircle" },
];

function Tag({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium border ${cls}`}>
      {label}
    </span>
  );
}

export default function ExecControlPage() {
  const [tab, setTab] = useState<Tab>("milestones");
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [actions, setActions] = useState<ControlAction[]>([]);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [refs, setRefs] = useState<RefsData | null>(null);
  const [decisions, setDecisions] = useState<{ id: number; question: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [initFilter, setInitFilter] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [access, setAccess] = useState<CabinetAccess | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const [msForm, setMsForm] = useState<{ open: boolean; item: Milestone | null }>({ open: false, item: null });
  const [issueForm, setIssueForm] = useState<{ open: boolean; item: Issue | null }>({ open: false, item: null });
  const [riskForm, setRiskForm] = useState<{ open: boolean; item: Risk | null }>({ open: false, item: null });
  const [actForm, setActForm] = useState<{
    open: boolean;
    item: ControlAction | null;
    target: { kind: "issue" | "risk"; id: number; title: string } | null;
  }>({ open: false, item: null, target: null });
  const [escForm, setEscForm] = useState<{
    open: boolean;
    item: Escalation | null;
    target: { kind: "issue" | "risk"; id: number; title: string } | null;
  }>({ open: false, item: null, target: null });
  const [liftForm, setLiftForm] = useState<{
    open: boolean;
    target: { kind: "issue" | "risk"; id: number; title: string; blockWhat: string } | null;
  }>({ open: false, target: null });

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([controlApi.all(), execApi.refs(), execApi.decisions()])
      .then(([c, rf, d]) => {
        setMilestones(c.milestones);
        setIssues(c.issues);
        setRisks(c.risks);
        setActions(c.actions);
        setEscalations(c.escalations);
        setAccess(c.access);
        setRefs(rf);
        setDecisions(d.items.map((x) => ({ id: x.id, question: x.question })));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const persons: PersonRef[] = refs?.persons || [];
  const initiatives = refs?.initiatives || [];
  const byInit = <T extends { initiative_id: number }>(list: T[]) =>
    initFilter ? list.filter((x) => String(x.initiative_id) === initFilter) : list;

  const fMilestones = useMemo(
    () =>
      byInit(milestones).filter(
        (m) => showClosed || !["achieved", "cancelled"].includes(m.status),
      ),
    [milestones, initFilter, showClosed],
  );
  const fIssues = useMemo(
    () =>
      byInit(issues).filter(
        (i) => showClosed || !["resolved", "closed", "irrelevant"].includes(i.status),
      ),
    [issues, initFilter, showClosed],
  );
  const fRisks = useMemo(
    () =>
      byInit(risks).filter((r) => showClosed || !["closed", "irrelevant"].includes(r.status)),
    [risks, initFilter, showClosed],
  );
  const fEscalations = useMemo(
    () => escalations.filter((e) => showClosed || !["closed", "decided"].includes(e.status)),
    [escalations, showClosed],
  );

  const hiddenCount =
    byInit(milestones).length -
    fMilestones.length +
    (byInit(issues).length - fIssues.length) +
    (byInit(risks).length - fRisks.length);

  const metrics = useMemo(
    () => ({
      overdueMs: fMilestones.filter((m) => m.is_overdue).length,
      upcomingMs: fMilestones.filter((m) => (m.days_left ?? 99) >= 0 && (m.days_left ?? 99) <= 14 && m.status !== "achieved").length,
      critIssues: fIssues.filter((i) => ["critical", "high"].includes(i.criticality) && !["resolved", "closed", "irrelevant"].includes(i.status)).length,
      blockers: fIssues.filter((i) => i.block_active).length + fRisks.filter((r) => r.block_active).length,
      highRisks: fRisks.filter((r) => r.risk_score >= 10 && ["active", "accepted"].includes(r.status)).length,
      openEsc: escalations.filter((e) => ["sent", "in_review"].includes(e.status)).length,
    }),
    [fMilestones, fIssues, fRisks, escalations],
  );

  const actionsFor = (kind: "issue" | "risk", id: number) =>
    actions.filter((a) => (kind === "issue" ? a.issue_id === id : a.risk_id === id));
  const escFor = (kind: "issue" | "risk", id: number) =>
    escalations.filter((e) => (kind === "issue" ? e.issue_id === id : e.risk_id === id));

  const riskMatrix = useMemo(() => {
    const grid: Record<string, Risk[]> = {};
    fRisks.forEach((r) => {
      const key = `${r.probability}-${r.impact}`;
      (grid[key] ||= []).push(r);
    });
    return grid;
  }, [fRisks]);

  return (
    <AdminShell>
      <div className="max-w-[1500px] space-y-5">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-white">Контроль и продвижение</h1>
            <p className="text-sm text-gray-500 mt-1">
              Контрольные точки, проблемы, риски, действия и эскалации по инициативам
            </p>
          </div>
          <div className="flex gap-2">
            {tab === "milestones" && (
              <button
                onClick={() => setMsForm({ open: true, item: null })}
                className="px-3.5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Icon name="Plus" size={15} />
                Контрольная точка
              </button>
            )}
            {tab === "issues" && (
              <button
                onClick={() => setIssueForm({ open: true, item: null })}
                className="px-3.5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Icon name="Plus" size={15} />
                Проблема
              </button>
            )}
            {tab === "risks" && (
              <button
                onClick={() => setRiskForm({ open: true, item: null })}
                className="px-3.5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Icon name="Plus" size={15} />
                Риск
              </button>
            )}
          </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Metric label="Критичных и высоких проблем" value={metrics.critIssues} icon="TriangleAlert" tone={metrics.critIssues > 0 ? "danger" : "success"} />
          <Metric label="Блокирующих факторов" value={metrics.blockers} icon="Ban" tone={metrics.blockers > 0 ? "danger" : "success"} />
          <Metric label="Просроченных точек" value={metrics.overdueMs} icon="CalendarX" tone={metrics.overdueMs > 0 ? "danger" : "success"} />
          <Metric label="Точек на 14 дней" value={metrics.upcomingMs} icon="CalendarClock" tone={metrics.upcomingMs > 0 ? "warning" : "default"} />
          <Metric label="Высоких рисков" value={metrics.highRisks} icon="ShieldAlert" tone={metrics.highRisks > 0 ? "warning" : "success"} />
          <Metric label="Открытых эскалаций" value={metrics.openEsc} icon="ArrowUpCircle" tone={metrics.openEsc > 0 ? "warning" : "default"} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <nav className="flex gap-1 border-b border-gray-800 flex-1 overflow-x-auto">
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
              </button>
            ))}
          </nav>
          <button
            onClick={() => setShowClosed(!showClosed)}
            className={`px-3 py-2 rounded-lg border text-sm transition-colors flex items-center gap-2 whitespace-nowrap ${
              showClosed
                ? "bg-gray-800 border-gray-700 text-white"
                : "bg-gray-900 border-gray-800 text-gray-400 hover:text-gray-200"
            }`}
            title="Показать устранённые, достигнутые и закрытые записи"
          >
            <Icon name={showClosed ? "Eye" : "EyeOff"} size={14} />
            Завершённые
            {!showClosed && hiddenCount > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-gray-800 text-xs">{hiddenCount}</span>
            )}
          </button>
          <select
            value={initFilter}
            onChange={(e) => setInitFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-white text-sm outline-none focus:border-gray-700"
          >
            <option value="">Все инициативы</option>
            {initiatives.map((i) => (
              <option key={i.id} value={String(i.id)}>
                {i.title.length > 50 ? i.title.slice(0, 50) + "…" : i.title}
              </option>
            ))}
          </select>
        </div>

        {warning && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <Icon name="TriangleAlert" size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-200 flex-1">{warning}</p>
            <button onClick={() => setWarning(null)} className="text-amber-400 hover:text-amber-300">
              <Icon name="X" size={14} />
            </button>
          </div>
        )}

        {access && access.role !== "head" && (
          <div className="flex items-center gap-2.5 p-3 rounded-lg bg-gray-900 border border-gray-800">
            <Icon name="Info" size={14} className="text-gray-500 flex-shrink-0" />
            <p className="text-xs text-gray-400">
              Ваша роль: {ACCESS_ROLE_LABEL[access.role]}.{" "}
              {access.can_confirm
                ? "Вы можете подтверждать достижение точек и устранение проблем."
                : "Подтверждение достижений и устранений выполняет уполномоченное лицо."}
            </p>
          </div>
        )}

        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : tab === "milestones" ? (
          <Card title="Контрольные точки" subtitle={`${fMilestones.length} точек`} icon="Flag">
            {fMilestones.length === 0 ? (
              <Empty text="Контрольные точки не заведены" icon="Flag" />
            ) : (
              <div className="space-y-2">
                {fMilestones.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-lg border p-4 ${
                      m.is_overdue
                        ? "border-red-500/30 bg-red-500/5"
                        : m.status === "achieved"
                          ? "border-green-500/25 bg-green-500/5"
                          : "border-gray-800 bg-gray-900/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Tag
                            label={MILESTONE_STATUS_LABEL[m.status] || m.status}
                            cls={
                              m.status === "achieved"
                                ? "bg-green-500/15 text-green-300 border-green-500/30"
                                : "bg-gray-500/15 text-gray-400 border-gray-600/30"
                            }
                          />
                          {m.is_overdue && (
                            <Tag label="Просрочено" cls="bg-red-500/15 text-red-300 border-red-500/30" />
                          )}
                          {m.reschedule_count > 0 && (
                            <Tag
                              label={`переносов: ${m.reschedule_count}`}
                              cls="bg-amber-500/15 text-amber-300 border-amber-500/30"
                            />
                          )}
                          {m.milestone_type && (
                            <span className="text-xs text-gray-500">
                              {MILESTONE_TYPES.find((t) => t.code === m.milestone_type)?.title}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-white leading-snug">{m.title}</p>
                        <p className="text-xs text-gray-600 mt-1 truncate">{m.initiative_title}</p>
                      </div>
                      <button
                        onClick={() => setMsForm({ open: true, item: m })}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-orange-400 hover:bg-gray-800 transition-colors"
                      >
                        <Icon name="Pencil" size={14} />
                      </button>
                    </div>

                    <div className="grid sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-gray-800 text-xs">
                      <div>
                        <p className="text-gray-500">План</p>
                        <p className={m.is_overdue ? "text-red-400" : "text-gray-300"}>
                          {fmtDate(m.plan_date)}
                        </p>
                      </div>
                      {m.plan_date_original && m.plan_date_original !== m.plan_date && (
                        <div>
                          <p className="text-gray-500">Первоначально</p>
                          <p className="text-gray-500 line-through">{fmtDate(m.plan_date_original)}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-gray-500">Факт</p>
                        <p className="text-gray-300">{fmtDate(m.fact_date)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Ответственный</p>
                        <p className="text-gray-300">{m.responsible_name || "—"}</p>
                      </div>
                    </div>

                    {m.depends_on_title && (
                      <p className="text-xs text-gray-500 mt-2">
                        <Icon name="Link" size={11} className="inline mr-1" />
                        Зависит от: {m.depends_on_title}
                      </p>
                    )}
                    {m.achievement_criteria && (
                      <p className="text-xs text-gray-500 mt-1.5">
                        <span className="text-gray-600">Критерий:</span> {m.achievement_criteria}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        ) : tab === "issues" ? (
          <Card title="Проблемы" subtitle={`${fIssues.length} записей`} icon="TriangleAlert">
            {fIssues.length === 0 ? (
              <Empty text="Проблемы не заведены" icon="CircleCheck" />
            ) : (
              <div className="space-y-2">
                {fIssues.map((s) => {
                  const key = `issue-${s.id}`;
                  const isOpen = expanded === key;
                  const crit = CRITICALITY_LABEL[s.criticality];
                  const acts = actionsFor("issue", s.id);
                  const escs = escFor("issue", s.id);
                  return (
                    <div
                      key={s.id}
                      className={`rounded-lg border overflow-hidden ${
                        s.block_active
                          ? "border-red-500/40 bg-red-500/5"
                          : "border-gray-800 bg-gray-900/40"
                      }`}
                    >
                      <button
                        onClick={() => setExpanded(isOpen ? null : key)}
                        className="w-full text-left p-4 hover:bg-gray-900/60 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <Tag label={crit.title} cls={crit.cls} />
                              <span className="text-xs text-gray-500">
                                {ISSUE_STATUS_LABEL[s.status]}
                              </span>
                              {s.block_active && (
                                <Tag label="Блокирует" cls="bg-red-500/20 text-red-300 border-red-500/40" />
                              )}
                              {s.criticality_auto_raised && (
                                <span className="text-[10px] text-gray-600">повышено системой</span>
                              )}
                              {s.is_overdue && (
                                <Tag label="Просрочено" cls="bg-red-500/15 text-red-300 border-red-500/30" />
                              )}
                            </div>
                            <p className="text-sm text-white leading-snug">{s.title}</p>
                            <p className="text-xs text-gray-600 mt-1 truncate">{s.initiative_title}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {acts.length > 0 && (
                              <span className="text-xs text-gray-600">{acts.length} действий</span>
                            )}
                            {escs.length > 0 && (
                              <span className="text-xs text-amber-500">{escs.length} эскал.</span>
                            )}
                            <Icon name={isOpen ? "ChevronUp" : "ChevronDown"} size={16} className="text-gray-600" />
                          </div>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="px-4 pb-4 pt-3 border-t border-gray-800 space-y-4">
                          {s.description && <p className="text-sm text-gray-300">{s.description}</p>}

                          <div className="grid sm:grid-cols-4 gap-3 text-xs">
                            <div>
                              <p className="text-gray-500">Выявлена</p>
                              <p className="text-gray-300">{fmtDate(s.detected_at)}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Срок</p>
                              <p className={s.is_overdue ? "text-red-400" : "text-gray-300"}>
                                {fmtDate(s.due_at)}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-500">Владелец</p>
                              <p className="text-gray-300">{s.owner_name || "—"}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Ответственный</p>
                              <p className="text-gray-300">{s.responsible_name || "—"}</p>
                            </div>
                          </div>

                          {s.block_active && (
                            <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 space-y-2">
                              <div className="flex items-center justify-between gap-3 flex-wrap">
                                <p className="text-xs text-red-300 font-medium">
                                  <Icon name="Ban" size={12} className="inline mr-1" />
                                  Блокировка активна с {fmtDate(s.block_since)}
                                </p>
                                <button
                                  onClick={() =>
                                    setLiftForm({
                                      open: true,
                                      target: {
                                        kind: "issue",
                                        id: s.id,
                                        title: s.title,
                                        blockWhat: s.block_what || "",
                                      },
                                    })
                                  }
                                  className="px-2.5 py-1 rounded-lg bg-green-500/15 text-green-300 border border-green-500/30 text-xs hover:bg-green-500/25 transition-colors"
                                >
                                  Снять блокировку
                                </button>
                              </div>
                              <p className="text-sm text-gray-300">{s.block_what}</p>
                              <div className="grid sm:grid-cols-2 gap-2 text-xs">
                                <p className="text-gray-400">
                                  <span className="text-gray-600">Снять может:</span> {s.block_who_can_lift}
                                </p>
                                <p className="text-gray-400">
                                  <span className="text-gray-600">Крайний срок:</span> {fmtDate(s.block_deadline)}
                                </p>
                              </div>
                              <p className="text-xs text-gray-400">
                                <span className="text-gray-600">Требуется:</span> {s.block_requirements}
                              </p>
                            </div>
                          )}

                          {s.block_status === "lifted" && (
                            <div className="p-3 rounded-lg border border-green-500/25 bg-green-500/5">
                              <p className="text-xs text-green-300">
                                Блокировка снята {fmtDate(s.block_lifted_at)} · {s.block_lifted_by}
                              </p>
                              <p className="text-sm text-gray-300 mt-1">{s.block_lift_result}</p>
                            </div>
                          )}

                          {acts.length > 0 && (
                            <div>
                              <p className="text-xs text-gray-500 mb-2">Действия по устранению</p>
                              <div className="space-y-1.5">
                                {acts.map((a) => (
                                  <div
                                    key={a.id}
                                    onClick={() =>
                                      setActForm({
                                        open: true,
                                        item: a,
                                        target: { kind: "issue", id: s.id, title: s.title },
                                      })
                                    }
                                    className={`p-2.5 rounded-lg border cursor-pointer hover:border-gray-700 transition-colors ${
                                      a.is_overdue ? "border-red-500/30 bg-red-500/5" : "border-gray-800 bg-gray-900"
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <p className="text-sm text-gray-300">{a.description}</p>
                                      <span className="text-xs text-gray-500 whitespace-nowrap">
                                        {ACTION_STATUS_LABEL[a.status]}
                                      </span>
                                    </div>
                                    <p className="text-xs text-gray-600 mt-1">
                                      {a.responsible_name || "не назначен"} · {fmtDate(a.due_at)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {escs.length > 0 && (
                            <div>
                              <p className="text-xs text-gray-500 mb-2">История эскалации</p>
                              <div className="space-y-1.5">
                                {escs.map((e) => (
                                  <div key={e.id} className="p-2.5 rounded-lg border border-gray-800 bg-gray-900">
                                    <div className="flex items-center justify-between gap-3 flex-wrap">
                                      <p className="text-sm text-gray-300">
                                        {ESCALATION_LEVELS.find((l) => l.code === e.level_code)?.title ||
                                          e.level_code}
                                      </p>
                                      <span className="text-xs text-gray-500">
                                        {ESCALATION_STATUS_LABEL[e.status]}
                                      </span>
                                    </div>
                                    <p className="text-xs text-gray-600 mt-1">
                                      передано {fmtDate(e.passed_at)}
                                      {e.review_due_at && ` · срок ${fmtDate(e.review_due_at)}`}
                                    </p>
                                    {e.decision_text && (
                                      <p className="text-xs text-green-300 mt-1">{e.decision_text}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2 pt-1">
                            <button
                              onClick={() => setIssueForm({ open: true, item: s })}
                              className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:border-orange-500/50 hover:text-orange-300 text-xs transition-colors flex items-center gap-1.5"
                            >
                              <Icon name="Pencil" size={12} />
                              Редактировать
                            </button>
                            <button
                              onClick={() =>
                                setActForm({
                                  open: true,
                                  item: null,
                                  target: { kind: "issue", id: s.id, title: s.title },
                                })
                              }
                              className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-600 text-xs transition-colors flex items-center gap-1.5"
                            >
                              <Icon name="Plus" size={12} />
                              Действие
                            </button>
                            <button
                              onClick={() =>
                                setEscForm({
                                  open: true,
                                  item: null,
                                  target: { kind: "issue", id: s.id, title: s.title },
                                })
                              }
                              className="px-3 py-1.5 rounded-lg border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 text-xs transition-colors flex items-center gap-1.5"
                            >
                              <Icon name="ArrowUpCircle" size={12} />
                              Эскалировать
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        ) : tab === "risks" ? (
          <div className="space-y-5">
            <Card
              title="Матрица рисков"
              subtitle="Вероятность × влияние — уровень считается автоматически"
              icon="Grid3x3"
            >
              <div className="overflow-x-auto">
                <table className="border-collapse">
                  <tbody>
                    {[5, 4, 3, 2, 1].map((p) => (
                      <tr key={p}>
                        <td className="text-xs text-gray-500 pr-2 text-right whitespace-nowrap">
                          {p === 5 ? "Вероятность 5" : p}
                        </td>
                        {[1, 2, 3, 4, 5].map((i) => {
                          const cell = riskMatrix[`${p}-${i}`] || [];
                          const score = p * i;
                          const lvl =
                            score >= 16 ? "critical" : score >= 10 ? "high" : score >= 5 ? "medium" : "low";
                          const bg = {
                            low: "bg-green-500/10 border-green-500/20",
                            medium: "bg-amber-500/10 border-amber-500/20",
                            high: "bg-orange-500/10 border-orange-500/25",
                            critical: "bg-red-500/10 border-red-500/30",
                          }[lvl];
                          return (
                            <td key={i} className={`border ${bg} p-1.5 align-top w-[110px] h-[70px]`}>
                              <span className="text-[10px] text-gray-600">{score}</span>
                              {cell.map((r) => (
                                <div
                                  key={r.id}
                                  onClick={() => setRiskForm({ open: true, item: r })}
                                  title={r.description}
                                  className="mt-1 px-1.5 py-1 rounded bg-gray-900/80 cursor-pointer hover:bg-gray-800 transition-colors"
                                >
                                  <p className="text-[11px] text-gray-300 truncate">{r.description}</p>
                                </div>
                              ))}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr>
                      <td />
                      {[1, 2, 3, 4, 5].map((i) => (
                        <td key={i} className="text-xs text-gray-500 text-center pt-1">
                          {i === 5 ? "5 Влияние" : i}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Риски" subtitle={`${fRisks.length} записей`} icon="ShieldAlert">
              {fRisks.length === 0 ? (
                <Empty text="Риски не заведены" icon="ShieldCheck" />
              ) : (
                <div className="space-y-2">
                  {fRisks.map((r) => {
                    const key = `risk-${r.id}`;
                    const isOpen = expanded === key;
                    const lvl = RISK_LEVEL_LABEL[r.risk_level];
                    const acts = actionsFor("risk", r.id);
                    return (
                      <div key={r.id} className="rounded-lg border border-gray-800 bg-gray-900/40 overflow-hidden">
                        <button
                          onClick={() => setExpanded(isOpen ? null : key)}
                          className="w-full text-left p-4 hover:bg-gray-900/60 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <Tag label={`${lvl.title} · ${r.risk_score}`} cls={lvl.cls} />
                                <span className="text-xs text-gray-500">
                                  {RISK_STATUS_LABEL[r.status]}
                                </span>
                                {r.review_overdue && (
                                  <Tag
                                    label="Пересмотр просрочен"
                                    cls="bg-amber-500/15 text-amber-300 border-amber-500/30"
                                  />
                                )}
                              </div>
                              <p className="text-sm text-white leading-snug">{r.description}</p>
                              <p className="text-xs text-gray-600 mt-1 truncate">{r.initiative_title}</p>
                            </div>
                            <Icon name={isOpen ? "ChevronUp" : "ChevronDown"} size={16} className="text-gray-600" />
                          </div>
                        </button>

                        {isOpen && (
                          <div className="px-4 pb-4 pt-3 border-t border-gray-800 space-y-3">
                            <div className="grid sm:grid-cols-2 gap-3 text-sm">
                              <div>
                                <p className="text-xs text-gray-500">Причина</p>
                                <p className="text-gray-300">{r.cause || "—"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Возможное последствие</p>
                                <p className="text-gray-300">{r.consequence || "—"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Индикатор наступления</p>
                                <p className="text-gray-300">{r.trigger_indicator || "—"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Владелец риска</p>
                                <p className="text-gray-300">{r.owner_name || "—"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Предупреждающие меры</p>
                                <p className="text-gray-300">{r.preventive_measures || "—"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">План реагирования</p>
                                <p className="text-gray-300">{r.response_plan || "—"}</p>
                              </div>
                            </div>

                            <div className="grid sm:grid-cols-4 gap-3 text-xs pt-2 border-t border-gray-800">
                              <div>
                                <p className="text-gray-500">Выявлен</p>
                                <p className="text-gray-300">{fmtDate(r.detected_at)}</p>
                              </div>
                              <div>
                                <p className="text-gray-500">Последняя оценка</p>
                                <p className="text-gray-300">{fmtDate(r.last_assessed_at)}</p>
                              </div>
                              <div>
                                <p className="text-gray-500">Следующий пересмотр</p>
                                <p className={r.review_overdue ? "text-amber-400" : "text-gray-300"}>
                                  {fmtDate(r.next_review_at)}
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-500">Оценил</p>
                                <p className="text-gray-300">{r.assessed_by_name || "—"}</p>
                              </div>
                            </div>

                            {r.materialized_issue_title && (
                              <div className="p-2.5 rounded-lg border border-red-500/25 bg-red-500/5">
                                <p className="text-xs text-red-300">Риск реализовался — возникла проблема</p>
                                <p className="text-sm text-gray-300 mt-0.5">{r.materialized_issue_title}</p>
                              </div>
                            )}

                            {acts.length > 0 && (
                              <div>
                                <p className="text-xs text-gray-500 mb-2">Действия по снижению</p>
                                <div className="space-y-1.5">
                                  {acts.map((a) => (
                                    <div
                                      key={a.id}
                                      onClick={() =>
                                        setActForm({
                                          open: true,
                                          item: a,
                                          target: { kind: "risk", id: r.id, title: r.description },
                                        })
                                      }
                                      className="p-2.5 rounded-lg border border-gray-800 bg-gray-900 cursor-pointer hover:border-gray-700 transition-colors"
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <p className="text-sm text-gray-300">{a.description}</p>
                                        <span className="text-xs text-gray-500">
                                          {ACTION_STATUS_LABEL[a.status]}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => setRiskForm({ open: true, item: r })}
                                className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:border-orange-500/50 hover:text-orange-300 text-xs transition-colors flex items-center gap-1.5"
                              >
                                <Icon name="Pencil" size={12} />
                                Редактировать
                              </button>
                              <button
                                onClick={() =>
                                  setActForm({
                                    open: true,
                                    item: null,
                                    target: { kind: "risk", id: r.id, title: r.description },
                                  })
                                }
                                className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-600 text-xs transition-colors flex items-center gap-1.5"
                              >
                                <Icon name="Plus" size={12} />
                                Действие
                              </button>
                              <button
                                onClick={() =>
                                  setEscForm({
                                    open: true,
                                    item: null,
                                    target: { kind: "risk", id: r.id, title: r.description },
                                  })
                                }
                                className="px-3 py-1.5 rounded-lg border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 text-xs transition-colors flex items-center gap-1.5"
                              >
                                <Icon name="ArrowUpCircle" size={12} />
                                Эскалировать
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        ) : (
          <Card title="История эскалаций" subtitle={`${fEscalations.length} записей`} icon="ArrowUpCircle">
            {fEscalations.length === 0 ? (
              <Empty text="Эскалаций не было" icon="ArrowUpCircle" />
            ) : (
              <div className="space-y-2">
                {fEscalations.map((e) => (
                  <div
                    key={e.id}
                    onClick={() =>
                      setEscForm({
                        open: true,
                        item: e,
                        target: {
                          kind: e.issue_id ? "issue" : "risk",
                          id: (e.issue_id || e.risk_id) as number,
                          title: e.issue_title || e.risk_description || "",
                        },
                      })
                    }
                    className={`p-4 rounded-lg border cursor-pointer hover:border-gray-700 transition-colors ${
                      e.is_overdue ? "border-red-500/30 bg-red-500/5" : "border-gray-800 bg-gray-900/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Tag
                            label={
                              ESCALATION_LEVELS.find((l) => l.code === e.level_code)?.title || e.level_code
                            }
                            cls="bg-amber-500/15 text-amber-300 border-amber-500/30"
                          />
                          <span className="text-xs text-gray-500">{ESCALATION_STATUS_LABEL[e.status]}</span>
                          {e.is_overdue && (
                            <Tag label="Срок истёк" cls="bg-red-500/15 text-red-300 border-red-500/30" />
                          )}
                        </div>
                        <p className="text-sm text-white">{e.issue_title || e.risk_description}</p>
                        {e.reason && <p className="text-xs text-gray-500 mt-1">{e.reason}</p>}
                      </div>
                      <div className="text-xs text-gray-500 text-right">
                        <p>передано {fmtDate(e.passed_at)}</p>
                        {e.review_due_at && <p>срок {fmtDate(e.review_due_at)}</p>}
                      </div>
                    </div>
                    {e.decision_text && (
                      <div className="mt-2 p-2.5 rounded-lg bg-green-500/5 border border-green-500/20">
                        <p className="text-sm text-green-200">{e.decision_text}</p>
                        <p className="text-xs text-gray-500 mt-1">{fmtDate(e.decided_at)}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {msForm.open && (
          <MilestoneForm
            milestone={msForm.item}
            initiativeId={initFilter ? Number(initFilter) : undefined}
            initiatives={initiatives}
            milestones={milestones}
            decisions={decisions}
            persons={persons}
            onClose={() => setMsForm({ open: false, item: null })}
            onSaved={() => {
              setMsForm({ open: false, item: null });
              setWarning(takeWarning());
              load();
            }}
          />
        )}

        {issueForm.open && (
          <IssueForm
            issue={issueForm.item}
            initiativeId={initFilter ? Number(initFilter) : undefined}
            initiatives={initiatives}
            persons={persons}
            onClose={() => setIssueForm({ open: false, item: null })}
            onSaved={() => {
              setIssueForm({ open: false, item: null });
              setWarning(takeWarning());
              load();
            }}
          />
        )}

        {riskForm.open && (
          <RiskForm
            risk={riskForm.item}
            initiativeId={initFilter ? Number(initFilter) : undefined}
            initiatives={initiatives}
            issues={issues}
            persons={persons}
            onClose={() => setRiskForm({ open: false, item: null })}
            onSaved={() => {
              setRiskForm({ open: false, item: null });
              load();
            }}
          />
        )}

        {actForm.open && actForm.target && (
          <ActionForm
            action={actForm.item}
            target={actForm.target}
            persons={persons}
            decisions={decisions}
            onClose={() => setActForm({ open: false, item: null, target: null })}
            onSaved={() => {
              setActForm({ open: false, item: null, target: null });
              load();
            }}
          />
        )}

        {escForm.open && escForm.target && (
          <EscalationForm
            escalation={escForm.item}
            target={escForm.target}
            persons={persons}
            bodies={refs?.bodies || []}
            decisions={decisions}
            onClose={() => setEscForm({ open: false, item: null, target: null })}
            onSaved={() => {
              setEscForm({ open: false, item: null, target: null });
              load();
            }}
          />
        )}

        {liftForm.open && liftForm.target && (
          <LiftBlockForm
            target={liftForm.target}
            onClose={() => setLiftForm({ open: false, target: null })}
            onSaved={() => {
              setLiftForm({ open: false, target: null });
              setWarning(takeWarning());
              load();
            }}
          />
        )}
      </div>
    </AdminShell>
  );
}