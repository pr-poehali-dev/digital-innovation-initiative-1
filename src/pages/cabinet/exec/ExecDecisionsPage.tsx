import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import {
  Decision,
  Dependency,
  Dictionaries,
  execApi,
  PARTICIPATION_LETTERS,
  Participation,
  RefsData,
} from "@/lib/execCabinetApi";
import { Badge, Card, Empty, ErrorBox, Loading, Metric, fmtDate } from "@/components/exec/ExecUI";
import DecisionForm from "@/components/exec/DecisionForm";

const ROUTE_ORDER = [
  "initiate",
  "prepare",
  "inform_provide",
  "recommend",
  "approve",
  "decide",
  "execute",
  "control",
  "notify",
];

export default function ExecDecisionsPage() {
  const [items, setItems] = useState<Decision[]>([]);
  const [participation, setParticipation] = useState<Participation[]>([]);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [dicts, setDicts] = useState<Dictionaries>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [refs, setRefs] = useState<RefsData | null>(null);
  const [form, setForm] = useState<{ open: boolean; item: Decision | null }>({
    open: false,
    item: null,
  });

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([execApi.decisions(), execApi.refs()])
      .then(([r, rf]) => {
        setItems(r.items);
        setParticipation(r.participation);
        setDependencies(r.dependencies);
        setDicts(r.dictionaries);
        setRefs(rf);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = useMemo(
    () => (statusFilter ? items.filter((d) => d.status === statusFilter) : items),
    [items, statusFilter],
  );

  const metrics = useMemo(
    () => ({
      total: items.length,
      open: items.filter((d) => !["decided", "rejected", "deferred"].includes(d.status)).length,
      overdue: items.filter((d) => d.is_overdue).length,
      decided: items.filter((d) => d.status === "decided").length,
      blocked: dependencies.filter((dd) => dd.is_mandatory && !dd.condition_met).length,
    }),
    [items, dependencies],
  );

  const routeFor = (decisionId: number) =>
    participation
      .filter((p) => p.decision_id === decisionId)
      .sort((a, b) => ROUTE_ORDER.indexOf(a.participation_kind) - ROUTE_ORDER.indexOf(b.participation_kind));

  const depsFor = (decisionId: number) =>
    dependencies.filter((dd) => dd.dependent_id === decisionId);

  return (
    <Layout>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-5">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Управленческие решения</h1>
            <p className="text-sm text-slate-500 mt-1">
              Журнал решений, маршруты принятия и зависимости между решениями
            </p>
          </div>
          <button
            onClick={() => setForm({ open: true, item: null })}
            className="px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Icon name="Plus" size={15} />
            Новое решение
          </button>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Metric label="Всего решений" value={metrics.total} icon="GitPullRequest" />
          <Metric label="Открытых" value={metrics.open} icon="CircleDot" tone={metrics.open > 0 ? "warning" : "default"} />
          <Metric label="Просрочено" value={metrics.overdue} icon="Clock" tone={metrics.overdue > 0 ? "danger" : "success"} />
          <Metric label="Принято" value={metrics.decided} icon="CircleCheck" tone="success" />
          <Metric label="Заблокировано зависимостями" value={metrics.blocked} icon="Link2Off" tone={metrics.blocked > 0 ? "warning" : "success"} />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter("")}
            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
              !statusFilter ? "border-violet-600/40 bg-violet-100 text-violet-700" : "border-slate-200 text-slate-500 hover:text-slate-700"
            }`}
          >
            Все
          </button>
          {(dicts.decision_status || []).map((s) => (
            <button
              key={s.code}
              onClick={() => setStatusFilter(s.code)}
              className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                statusFilter === s.code
                  ? "border-violet-600/40 bg-violet-100 text-violet-700"
                  : "border-slate-200 text-slate-500 hover:text-slate-700"
              }`}
            >
              {s.title}
            </button>
          ))}
        </div>

        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : filtered.length === 0 ? (
          <Card title="Решения" icon="GitPullRequest">
            <Empty text="Нет решений по выбранным условиям" />
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((d) => {
              const isOpen = openId === d.id;
              const route = routeFor(d.id);
              const deps = depsFor(d.id);
              const blockedBy = deps.filter((dd) => dd.is_mandatory && !dd.condition_met);
              return (
                <div
                  key={d.id}
                  className={`rounded-xl border overflow-hidden transition-colors ${
                    d.is_overdue ? "border-red-500/30 bg-red-500/5" : "border-slate-200 bg-white"
                  }`}
                >
                  <button
                    onClick={() => setOpenId(isOpen ? null : d.id)}
                    className="w-full text-left p-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs text-slate-500">{d.type_title}</span>
                          {blockedBy.length > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 border border-violet-600/30">
                              заблокировано
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-900 leading-snug">{d.question}</p>
                        <p className="text-xs text-slate-400 mt-1 truncate">{d.initiative_title}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge dicts={dicts} type="decision_status" code={d.status} />
                        <Icon
                          name={isOpen ? "ChevronUp" : "ChevronDown"}
                          size={16}
                          className="text-slate-400"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs">
                      <span className={d.is_overdue ? "text-red-600" : "text-slate-500"}>
                        <Icon name="Clock" size={11} className="inline mr-1" />
                        {fmtDate(d.due_at)}
                        {d.is_overdue && " · просрочено"}
                      </span>
                      {(d.body_title || d.decided_by_name) && (
                        <span className="text-slate-500 truncate">
                          <Icon name="Gavel" size={11} className="inline mr-1" />
                          {d.body_title || d.decided_by_name}
                        </span>
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 space-y-4 border-t border-slate-200 pt-4">
                      {blockedBy.length > 0 && (
                        <div className="p-3 rounded-lg border border-violet-600/30 bg-violet-50">
                          <p className="text-xs text-violet-700 font-medium mb-2">
                            <Icon name="Link2Off" size={12} className="inline mr-1" />
                            Требуются предшествующие решения
                          </p>
                          {blockedBy.map((dd) => (
                            <p key={dd.id} className="text-xs text-slate-500 leading-relaxed">
                              → {dd.predecessor_question}
                              {dd.condition_text && (
                                <span className="block text-slate-400 mt-0.5">{dd.condition_text}</span>
                              )}
                            </p>
                          ))}
                        </div>
                      )}

                      {route.length > 0 && (
                        <div>
                          <p className="text-xs text-slate-500 mb-2">Маршрут принятия решения</p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {route.map((p, idx) => {
                              const meta = PARTICIPATION_LETTERS[p.participation_kind];
                              const isDecide = p.participation_kind === "decide";
                              return (
                                <div key={p.id} className="flex items-center gap-1.5">
                                  <div
                                    className={`px-2.5 py-1.5 rounded-lg border text-xs ${
                                      isDecide
                                        ? "border-red-500/40 bg-red-500/10"
                                        : "border-slate-200 bg-white"
                                    }`}
                                    title={meta?.title}
                                  >
                                    <span
                                      className={`font-mono font-semibold mr-1.5 ${
                                        isDecide ? "text-red-600" : "text-violet-600"
                                      }`}
                                    >
                                      {meta?.letter}
                                    </span>
                                    <span className="text-slate-700">{p.role_title}</span>
                                    {p.display_name && (
                                      <span className="text-slate-400 ml-1.5">· {p.display_name}</span>
                                    )}
                                  </div>
                                  {idx < route.length - 1 && (
                                    <Icon name="ChevronRight" size={12} className="text-slate-600" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Основание</p>
                          <p className="text-sm text-slate-700">{d.basis || "—"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Предлагаемый вариант</p>
                          <p className="text-sm text-slate-700">{d.proposed_option || "—"}</p>
                        </div>
                      </div>

                      {d.final_decision && (
                        <div className="p-3 rounded-lg border border-green-500/25 bg-green-500/5">
                          <p className="text-xs text-slate-500 mb-1">Принятое решение</p>
                          <p className="text-sm text-green-800">{d.final_decision}</p>
                          {d.result_document && (
                            <p className="text-xs text-slate-500 mt-1.5">
                              <Icon name="FileText" size={11} className="inline mr-1" />
                              {d.result_document} · {fmtDate(d.decided_at)}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-500">Исполнение:</span>
                          <Badge dicts={dicts} type="execution_status" code={d.execution_status} />
                        </div>
                        <button
                          onClick={() => setForm({ open: true, item: d })}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:border-violet-600/50 hover:text-violet-700 text-xs transition-colors flex items-center gap-1.5"
                        >
                          <Icon name="Pencil" size={13} />
                          Редактировать
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <Card title="Обозначения видов участия" icon="Info">
          <div className="flex flex-wrap gap-2">
            {Object.entries(PARTICIPATION_LETTERS).map(([code, m]) => (
              <div key={code} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200">
                <span className="font-mono font-semibold text-violet-600 text-xs">{m.letter}</span>
                <span className="text-xs text-slate-500">— {m.title}</span>
              </div>
            ))}
          </div>
        </Card>

        {form.open && refs && (
          <DecisionForm
            decision={form.item}
            initiatives={refs.initiatives}
            decisionTypes={refs.decision_types}
            bodies={refs.bodies}
            dicts={dicts}
            persons={refs.persons}
            onClose={() => setForm({ open: false, item: null })}
            onSaved={() => {
              setForm({ open: false, item: null });
              load();
            }}
          />
        )}
      </div>
    </Layout>
  );
}