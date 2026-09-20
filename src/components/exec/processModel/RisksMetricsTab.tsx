import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { Empty, Loading } from "@/components/exec/ExecUI";
import {
  processModelApi,
  ProcessRisk,
  ProcessControl,
  ProcessMetric,
  ProcessIssue,
  RiskControlCheckItem,
  MetricCheckItem,
  Refs,
  PersonRef,
  OrgUnitRef,
  InfoSystem,
  QUALITATIVE_LEVEL_STYLE,
  ISSUE_STATUS_STYLE,
} from "@/lib/execProcessModelApi";
import { RiskModal, ControlModal } from "./RiskControlModals";
import { MetricModal, IssueModal } from "./MetricIssueModals";

type SubTab = "risks" | "metrics" | "issues";

function RiskCard({
  risk,
  refs,
  canEdit,
  canConfirm,
  diagramNodeOptions,
  people,
  orgUnits,
  systems,
  onChanged,
}: {
  risk: ProcessRisk;
  refs: Refs | null;
  canEdit: boolean;
  canConfirm: boolean;
  diagramNodeOptions: { id: number; label: string }[];
  people: PersonRef[];
  orgUnits: OrgUnitRef[];
  systems: InfoSystem[];
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [controls, setControls] = useState<ProcessControl[] | null>(null);
  const [loadingControls, setLoadingControls] = useState(false);
  const [editingRisk, setEditingRisk] = useState(false);
  const [controlModal, setControlModal] = useState<{ control: ProcessControl | null } | null>(null);

  const loadControls = () => {
    setLoadingControls(true);
    processModelApi.processControls(risk.id).then((r) => setControls(r.items)).finally(() => setLoadingControls(false));
  };

  useEffect(() => {
    if (expanded && controls === null) loadControls();
  }, [expanded]);

  const level = risk.qualitative_level ? QUALITATIVE_LEVEL_STYLE[risk.qualitative_level] : null;

  const deleteRisk = async () => {
    if (!confirm("Удалить риск?")) return;
    try {
      await processModelApi.deleteRisk(risk.id);
      onChanged();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const deleteControl = async (id: number) => {
    if (!confirm("Удалить контроль?")) return;
    await processModelApi.deleteControl(id);
    loadControls();
    onChanged();
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="p-3.5 flex items-start justify-between gap-3">
        <button onClick={() => setExpanded((v) => !v)} className="flex items-start gap-2 text-left flex-1 min-w-0">
          <Icon name={expanded ? "ChevronDown" : "ChevronRight"} size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {level && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${level.cls}`}>{level.title}</span>
              )}
              {risk.verification_status === "confirmed" ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded border border-green-200 bg-green-50 text-green-700">Подтверждён</span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-500">Черновик</span>
              )}
              {risk.diagram_node_label && (
                <span className="text-[10px] text-slate-400">операция: {risk.diagram_node_label}</span>
              )}
            </div>
            <p className="text-sm font-medium text-slate-900">{risk.title}</p>
            {risk.event_description && <p className="text-xs text-slate-500 mt-0.5">{risk.event_description}</p>}
          </div>
        </button>
        <div className="flex items-center gap-1 flex-shrink-0">
          {canConfirm && (
            <button
              onClick={() => processModelApi.confirmRisk(risk.id, risk.verification_status !== "confirmed").then(onChanged)}
              className={`text-[10px] px-2 py-1 rounded-md border ${risk.verification_status === "confirmed" ? "border-slate-200 text-slate-500 hover:bg-slate-50" : "border-green-300 text-green-700 hover:bg-green-50"}`}
            >
              {risk.verification_status === "confirmed" ? "Снять подтверждение" : "Подтвердить"}
            </button>
          )}
          {canEdit && (
            <>
              <button onClick={() => setEditingRisk(true)} className="text-slate-400 hover:text-violet-600 p-1"><Icon name="Pencil" size={13} /></button>
              <button onClick={deleteRisk} className="text-slate-300 hover:text-red-600 p-1"><Icon name="Trash2" size={13} /></button>
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/60 p-3.5 space-y-3">
          {(risk.cause || risk.consequence || risk.owner_name || risk.owner_role || risk.source_note || risk.comment) && (
            <div className="grid sm:grid-cols-2 gap-2 text-xs text-slate-600">
              {risk.cause && <p><span className="text-slate-400">Причина:</span> {risk.cause}</p>}
              {risk.consequence && <p><span className="text-slate-400">Последствие:</span> {risk.consequence}</p>}
              {(risk.owner_name || risk.owner_role) && <p><span className="text-slate-400">Владелец:</span> {risk.owner_name || risk.owner_role}</p>}
              {risk.source_note && <p><span className="text-slate-400">Источник:</span> {risk.source_note}</p>}
              {risk.comment && <p className="sm:col-span-2"><span className="text-slate-400">Комментарий:</span> {risk.comment}</p>}
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Контрольные процедуры</p>
            {canEdit && (
              <button onClick={() => setControlModal({ control: null })}
                className="text-xs text-violet-600 hover:text-violet-700 flex items-center gap-1">
                <Icon name="Plus" size={12} /> Добавить контроль
              </button>
            )}
          </div>

          {loadingControls ? (
            <Loading />
          ) : !controls || controls.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-3 text-center">
              <p className="text-xs text-slate-500 mb-2">Контроль не определён — требует уточнения.</p>
              {canEdit && (
                <button onClick={() => setControlModal({ control: null })}
                  className="text-xs px-2.5 py-1 rounded-md border border-violet-300 text-violet-700 hover:bg-violet-50">
                  Описать контроль
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {controls.map((c) => (
                <div key={c.id} className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <p className="text-sm text-slate-900 font-medium">{c.title}</p>
                        {c.verification_status === "confirmed" && (
                          <Icon name="BadgeCheck" size={12} className="text-green-600" />
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                        {c.control_type && <span>{refs?.control_types[c.control_type]}</span>}
                        {c.method && <span>{refs?.control_methods[c.method]}</span>}
                        {(c.responsible_name || c.responsible_role) && <span>исполнитель: {c.responsible_name || c.responsible_role}</span>}
                        {c.periodicity && <span>{refs?.control_periodicities[c.periodicity]}</span>}
                      </div>
                      {c.evidence_note ? (
                        <p className="text-[11px] text-slate-400 mt-1">доказательство: {c.evidence_note}</p>
                      ) : (
                        <p className="text-[11px] text-amber-600 mt-1">без доказательства выполнения</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {canConfirm && (
                        <button
                          onClick={() => processModelApi.confirmControl(c.id, c.verification_status !== "confirmed").then(loadControls).then(onChanged)}
                          className={`text-[10px] px-1.5 py-0.5 rounded-md border ${c.verification_status === "confirmed" ? "border-slate-200 text-slate-500" : "border-green-300 text-green-700"}`}
                        >
                          {c.verification_status === "confirmed" ? "Снять" : "Подтвердить"}
                        </button>
                      )}
                      {canEdit && (
                        <>
                          <button onClick={() => setControlModal({ control: c })} className="text-slate-400 hover:text-violet-600 p-1"><Icon name="Pencil" size={12} /></button>
                          <button onClick={() => deleteControl(c.id)} className="text-slate-300 hover:text-red-600 p-1"><Icon name="Trash2" size={12} /></button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editingRisk && (
        <RiskModal processNodeId={risk.process_node_id} risk={risk} refs={refs} people={people}
          diagramNodeOptions={diagramNodeOptions}
          onClose={() => setEditingRisk(false)} onSaved={onChanged} />
      )}
      {controlModal && (
        <ControlModal riskId={risk.id} control={controlModal.control} refs={refs} people={people}
          orgUnits={orgUnits} systems={systems} diagramNodeOptions={diagramNodeOptions}
          onClose={() => setControlModal(null)}
          onSaved={() => { loadControls(); onChanged(); }} />
      )}
    </div>
  );
}

export default function RisksMetricsTab({
  processNodeId,
  refs,
  canEdit,
  canConfirm,
  people,
  orgUnits,
  systems,
  diagramNodeOptions,
}: {
  processNodeId: number;
  refs: Refs | null;
  canEdit: boolean;
  canConfirm: boolean;
  people: PersonRef[];
  orgUnits: OrgUnitRef[];
  systems: InfoSystem[];
  diagramNodeOptions: { id: number; label: string }[];
}) {
  const [subTab, setSubTab] = useState<SubTab>("risks");
  const [risks, setRisks] = useState<ProcessRisk[]>([]);
  const [metrics, setMetrics] = useState<ProcessMetric[]>([]);
  const [issues, setIssues] = useState<ProcessIssue[]>([]);
  const [riskChecks, setRiskChecks] = useState<RiskControlCheckItem[]>([]);
  const [metricWarnings, setMetricWarnings] = useState<MetricCheckItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [riskModal, setRiskModal] = useState<{ risk: ProcessRisk | null } | null>(null);
  const [metricModal, setMetricModal] = useState<{ metric: ProcessMetric | null } | null>(null);
  const [issueModal, setIssueModal] = useState<{ issue: ProcessIssue | null } | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      processModelApi.processRisks(processNodeId),
      processModelApi.processMetrics(processNodeId),
      processModelApi.processIssues(processNodeId),
      processModelApi.riskControlChecks(processNodeId),
      processModelApi.metricChecks(processNodeId),
    ])
      .then(([r, m, i, rc, mc]) => {
        setRisks(r.items);
        setMetrics(m.items);
        setIssues(i.items);
        setRiskChecks(rc.items);
        setMetricWarnings(mc.items);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, [processNodeId]);

  const deleteMetric = async (id: number) => {
    if (!confirm("Удалить показатель?")) return;
    await processModelApi.deleteMetric(id);
    load();
  };
  const deleteIssue = async (id: number) => {
    if (!confirm("Удалить проблему?")) return;
    try {
      await processModelApi.deleteIssue(id);
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  if (loading) return <Loading />;

  const SUB_TABS: { id: SubTab; label: string; icon: string; count: number }[] = [
    { id: "risks", label: "Риски и контроли", icon: "ShieldAlert", count: risks.length },
    { id: "metrics", label: "Показатели", icon: "Gauge", count: metrics.length },
    { id: "issues", label: "Проблемы AS-IS", icon: "AlertTriangle", count: issues.length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 flex-wrap">
        {SUB_TABS.map((t) => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors ${
              subTab === t.id ? "border-violet-300 bg-violet-50 text-violet-700 font-medium" : "border-slate-200 text-slate-500 hover:bg-slate-50"
            }`}>
            <Icon name={t.icon} size={12} /> {t.label}
            {t.count > 0 && <span className="text-[10px] bg-white/70 rounded-full px-1.5">{t.count}</span>}
          </button>
        ))}
      </div>

      {subTab === "risks" && (
        <div className="space-y-3">
          {riskChecks.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
              <p className="text-xs font-medium text-amber-800 flex items-center gap-1.5"><Icon name="AlertTriangle" size={12} /> Предупреждения ({riskChecks.length})</p>
              {riskChecks.map((c, i) => (
                <p key={i} className="text-[11px] text-amber-700">{c.message}</p>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            {canEdit && (
              <button onClick={() => setRiskModal({ risk: null })}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 flex items-center gap-1.5">
                <Icon name="Plus" size={12} /> Добавить риск
              </button>
            )}
          </div>
          {risks.length === 0 ? (
            <Empty text="Риски пока не добавлены" icon="ShieldAlert" />
          ) : (
            <div className="space-y-2">
              {risks.map((r) => (
                <RiskCard key={r.id} risk={r} refs={refs} canEdit={canEdit} canConfirm={canConfirm}
                  diagramNodeOptions={diagramNodeOptions} people={people} orgUnits={orgUnits} systems={systems}
                  onChanged={load} />
              ))}
            </div>
          )}
        </div>
      )}

      {subTab === "metrics" && (
        <div className="space-y-3">
          {metricWarnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
              <p className="text-xs font-medium text-amber-800 flex items-center gap-1.5"><Icon name="AlertTriangle" size={12} /> Предупреждения ({metricWarnings.length})</p>
              {metricWarnings.map((c, i) => (
                <p key={i} className="text-[11px] text-amber-700">{c.message}</p>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            {canEdit && (
              <button onClick={() => setMetricModal({ metric: null })}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 flex items-center gap-1.5">
                <Icon name="Plus" size={12} /> Добавить показатель
              </button>
            )}
          </div>
          {metrics.length === 0 ? (
            <Empty text="Показатели пока не добавлены" icon="Gauge" />
          ) : (
            <div className="space-y-2">
              {metrics.map((m) => (
                <div key={m.id} className="rounded-lg border border-slate-200 bg-white p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600">{refs?.metric_kinds[m.metric_kind]}</span>
                      {m.diagram_node_label && <span className="text-[10px] text-slate-400">операция: {m.diagram_node_label}</span>}
                    </div>
                    <p className="text-sm font-medium text-slate-900">{m.title}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500 mt-1">
                      {m.unit && <span>ед.: {m.unit}</span>}
                      {m.plan_value && <span>план: {m.plan_value}</span>}
                      {m.fact_value && <span>факт: {m.fact_value}</span>}
                      {m.periodicity && <span>{refs?.metric_periodicities[m.periodicity]}</span>}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => setMetricModal({ metric: m })} className="text-slate-400 hover:text-violet-600 p-1"><Icon name="Pencil" size={13} /></button>
                      <button onClick={() => deleteMetric(m.id)} className="text-slate-300 hover:text-red-600 p-1"><Icon name="Trash2" size={13} /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {subTab === "issues" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            {canEdit && (
              <button onClick={() => setIssueModal({ issue: null })}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 flex items-center gap-1.5">
                <Icon name="Plus" size={12} /> Добавить проблему
              </button>
            )}
          </div>
          {issues.length === 0 ? (
            <Empty text="Проблемы пока не зафиксированы" icon="AlertTriangle" />
          ) : (
            <div className="space-y-2">
              {issues.map((i) => (
                <div key={i.id} className="rounded-lg border border-slate-200 bg-white p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${ISSUE_STATUS_STYLE[i.status].cls}`}>{ISSUE_STATUS_STYLE[i.status].title}</span>
                      {i.problem_type && <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600">{refs?.problem_types[i.problem_type]}</span>}
                      {i.diagram_node_label && <span className="text-[10px] text-slate-400">операция: {i.diagram_node_label}</span>}
                    </div>
                    <p className="text-sm font-medium text-slate-900">{i.title}</p>
                    {i.description && <p className="text-xs text-slate-500 mt-0.5">{i.description}</p>}
                    {i.improvement_direction && (
                      <p className="text-[11px] text-violet-600 mt-1"><Icon name="Sparkles" size={10} className="inline mr-1" />{i.improvement_direction}</p>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => setIssueModal({ issue: i })} className="text-slate-400 hover:text-violet-600 p-1"><Icon name="Pencil" size={13} /></button>
                      <button onClick={() => deleteIssue(i.id)} className="text-slate-300 hover:text-red-600 p-1"><Icon name="Trash2" size={13} /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {riskModal && (
        <RiskModal processNodeId={processNodeId} risk={riskModal.risk} refs={refs} people={people}
          diagramNodeOptions={diagramNodeOptions}
          onClose={() => setRiskModal(null)} onSaved={load} />
      )}
      {metricModal && (
        <MetricModal processNodeId={processNodeId} metric={metricModal.metric} refs={refs} people={people}
          diagramNodeOptions={diagramNodeOptions}
          onClose={() => setMetricModal(null)} onSaved={load} />
      )}
      {issueModal && (
        <IssueModal processNodeId={processNodeId} issue={issueModal.issue} refs={refs}
          diagramNodeOptions={diagramNodeOptions}
          onClose={() => setIssueModal(null)} onSaved={load} />
      )}
    </div>
  );
}