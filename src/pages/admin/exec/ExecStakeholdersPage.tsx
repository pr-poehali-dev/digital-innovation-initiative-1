import { useEffect, useMemo, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { Dictionaries, execApi, Stakeholder } from "@/lib/execCabinetApi";
import { Badge, Card, Empty, ErrorBox, Loading, Metric, fmtDate } from "@/components/exec/ExecUI";

type View = "table" | "matrix1" | "matrix2" | "plan";

const VIEWS: { id: View; label: string; icon: string }[] = [
  { id: "table", label: "Таблица", icon: "Table" },
  { id: "matrix1", label: "Участие × вовлечённость", icon: "Grid3x3" },
  { id: "matrix2", label: "Участие × нерешённые вопросы", icon: "Grid2x2" },
  { id: "plan", label: "План взаимодействия", icon: "CalendarDays" },
];

const ENGAGED_STATES = ["confirmed", "materials_provided", "decision_pending", "remarks_received"];

export default function ExecStakeholdersPage() {
  const [items, setItems] = useState<Stakeholder[]>([]);
  const [dicts, setDicts] = useState<Dictionaries>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("table");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [selected, setSelected] = useState<Stakeholder | null>(null);

  const load = () => {
    setLoading(true);
    setError("");
    execApi
      .stakeholders()
      .then((r) => {
        setItems(r.items);
        setDicts(r.dictionaries);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = useMemo(
    () => (onlyOverdue ? items.filter((s) => s.is_overdue) : items),
    [items, onlyOverdue],
  );

  const metrics = useMemo(
    () => ({
      total: items.length,
      key: items.filter((s) => s.formal_participation >= 4).length,
      blockers: items.filter((s) => s.can_block).length,
      noStrategy: items.filter((s) => s.formal_participation >= 4 && !s.engagement_goal).length,
      overdue: items.filter((s) => s.is_overdue).length,
      notEngaged: items.filter((s) => !ENGAGED_STATES.includes(s.participation_state)).length,
    }),
    [items],
  );

  const matrixCell = (participation: number, axis2: boolean) =>
    filtered.filter((s) => {
      const high = s.formal_participation >= 4;
      return high === (participation >= 4) && axis2 === axisValue(s);
    });

  function axisValue(s: Stakeholder) {
    return view === "matrix1"
      ? ENGAGED_STATES.includes(s.participation_state)
      : !!s.open_questions;
  }

  const axisLabels =
    view === "matrix1"
      ? { yes: "Вовлечён", no: "Не вовлечён" }
      : { yes: "Есть нерешённые вопросы", no: "Вопросов нет" };

  return (
    <AdminShell>
      <div className="max-w-[1400px] space-y-5">
        <header>
          <h1 className="text-xl font-semibold text-white">Карта стейкхолдеров</h1>
          <p className="text-sm text-gray-500 mt-1">
            Участие определяется формальными полномочиями, а не субъективной оценкой
          </p>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Metric label="Всего стейкхолдеров" value={metrics.total} icon="Users" />
          <Metric label="Ключевых участников" value={metrics.key} icon="Star" />
          <Metric label="С правом блокирования" value={metrics.blockers} icon="Ban" tone={metrics.blockers > 0 ? "warning" : "default"} />
          <Metric label="Без стратегии" value={metrics.noStrategy} icon="HelpCircle" tone={metrics.noStrategy > 0 ? "warning" : "success"} />
          <Metric label="Не вовлечены" value={metrics.notEngaged} icon="UserMinus" tone={metrics.notEngaged > 0 ? "warning" : "success"} />
          <Metric label="Просрочено действий" value={metrics.overdue} icon="CalendarX" tone={metrics.overdue > 0 ? "danger" : "success"} onClick={() => setOnlyOverdue((v) => !v)} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 p-1 rounded-lg bg-gray-900 border border-gray-800">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${
                  view === v.id ? "bg-gray-800 text-white" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                <Icon name={v.icon} size={13} />
                {v.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setOnlyOverdue((v) => !v)}
            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
              onlyOverdue
                ? "border-red-500/40 bg-red-500/10 text-red-300"
                : "border-gray-800 text-gray-500 hover:text-gray-300"
            }`}
          >
            Только просроченные
          </button>
        </div>

        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : filtered.length === 0 ? (
          <Card title="Стейкхолдеры" icon="Users">
            <Empty text="Нет данных по выбранным условиям" />
          </Card>
        ) : view === "table" ? (
          <Card title="Реестр стейкхолдеров" subtitle={`${filtered.length} записей`} icon="Table">
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                    <th className="pb-2 font-medium">Участник</th>
                    <th className="pb-2 font-medium">Инициатива</th>
                    <th className="pb-2 font-medium">Полномочия</th>
                    <th className="pb-2 font-medium">Состояние участия</th>
                    <th className="pb-2 font-medium">Ближайшее действие</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {filtered.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => setSelected(s)}
                      className="cursor-pointer hover:bg-gray-900/50 transition-colors"
                    >
                      <td className="py-3">
                        <p className="text-gray-200">{s.display_name}</p>
                        <p className="text-xs text-gray-600 mt-0.5">{s.position_title}</p>
                      </td>
                      <td className="py-3 text-xs text-gray-500 max-w-[220px] truncate">
                        {s.initiative_title}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-1">
                          {s.can_decide && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-300">решает</span>
                          )}
                          {s.must_approve && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300">согл.</span>
                          )}
                          {s.can_block && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-300">блок.</span>
                          )}
                          {s.controls_resource && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300">ресурс</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3">
                        <Badge dicts={dicts} type="participation_state" code={s.participation_state} />
                      </td>
                      <td className="py-3">
                        <p className="text-xs text-gray-400 max-w-[240px] truncate">{s.next_action || "—"}</p>
                        {s.next_action_due && (
                          <p className={`text-[11px] mt-0.5 ${s.is_overdue ? "text-red-400" : "text-gray-600"}`}>
                            {fmtDate(s.next_action_due)}
                            {s.is_overdue && " · просрочено"}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : view === "plan" ? (
          <Card title="План взаимодействия" subtitle="По срокам ближайших действий" icon="CalendarDays">
            <div className="space-y-2">
              {[...filtered]
                .filter((s) => s.next_action)
                .sort((a, b) => (a.next_action_due || "").localeCompare(b.next_action_due || ""))
                .map((s) => (
                  <div
                    key={s.id}
                    onClick={() => setSelected(s)}
                    className={`cursor-pointer p-3 rounded-lg border transition-colors hover:border-gray-700 ${
                      s.is_overdue ? "border-red-500/30 bg-red-500/5" : "border-gray-800 bg-gray-900/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm text-white">{s.display_name}</p>
                        <p className="text-xs text-gray-500">{s.initiative_title}</p>
                      </div>
                      <Badge dicts={dicts} type="engagement_status" code={s.engagement_status} />
                    </div>
                    <p className="text-sm text-gray-300 mt-2">{s.next_action}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs">
                      <span className={s.is_overdue ? "text-red-400" : "text-gray-500"}>
                        <Icon name="Calendar" size={11} className="inline mr-1" />
                        {fmtDate(s.next_action_due)}
                      </span>
                      {s.responsible_name && (
                        <span className="text-gray-500">
                          <Icon name="User" size={11} className="inline mr-1" />
                          {s.responsible_name}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </Card>
        ) : (
          <Card
            title={view === "matrix1" ? "Формальное участие × вовлечённость" : "Формальное участие × нерешённые вопросы"}
            subtitle="Обе оси основаны на проверяемых фактах, а не на оценке личности"
            icon="Grid3x3"
          >
            <div className="grid grid-cols-2 gap-3">
              {[
                { p: 5, a: false, tone: "border-red-500/40 bg-red-500/5", label: `Ключевые · ${axisLabels.no}` },
                { p: 5, a: true, tone: "border-green-500/40 bg-green-500/5", label: `Ключевые · ${axisLabels.yes}` },
                { p: 1, a: false, tone: "border-gray-800 bg-gray-900/40", label: `Прочие · ${axisLabels.no}` },
                { p: 1, a: true, tone: "border-blue-500/30 bg-blue-500/5", label: `Прочие · ${axisLabels.yes}` },
              ].map((q, idx) => {
                const cell = matrixCell(q.p, q.a);
                return (
                  <div key={idx} className={`rounded-xl border p-4 min-h-[160px] ${q.tone}`}>
                    <p className="text-xs text-gray-400 mb-3 font-medium">{q.label}</p>
                    {cell.length === 0 ? (
                      <p className="text-xs text-gray-700">пусто</p>
                    ) : (
                      <div className="space-y-1.5">
                        {cell.map((s) => (
                          <div
                            key={s.id}
                            onClick={() => setSelected(s)}
                            className="cursor-pointer p-2 rounded-lg bg-gray-900/70 hover:bg-gray-800 transition-colors"
                          >
                            <p className="text-xs text-white truncate">{s.display_name}</p>
                            <p className="text-[11px] text-gray-500 truncate">{s.position_title}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {selected && (
          <div
            className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 overflow-y-auto"
            onClick={() => setSelected(null)}
          >
            <div
              className="bg-gray-950 border border-gray-800 rounded-xl max-w-2xl w-full my-8"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="flex items-start justify-between gap-4 p-5 border-b border-gray-800">
                <div>
                  <h2 className="text-lg font-semibold text-white">{selected.display_name}</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{selected.position_title}</p>
                  <p className="text-xs text-gray-600 mt-1">{selected.initiative_title}</p>
                </div>
                <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-white">
                  <Icon name="X" size={18} />
                </button>
              </header>
              <div className="p-5 space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  <Badge dicts={dicts} type="participation_state" code={selected.participation_state} />
                  <Badge dicts={dicts} type="engagement_status" code={selected.engagement_status} />
                  <Badge dicts={dicts} type="noninvolvement_risk" code={selected.noninvolvement_risk} />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  {[
                    ["Позиция по вопросу", selected.position_on_topic],
                    ["Подтверждённые требования", selected.confirmed_requirements],
                    ["Выраженные замечания", selected.stated_remarks],
                    ["Условия поддержки", selected.support_conditions],
                    ["Нерешённые вопросы", selected.open_questions],
                    ["Цель взаимодействия", selected.engagement_goal],
                  ].map(([label, val]) => (
                    <div key={label as string}>
                      <p className="text-xs text-gray-500 mb-1">{label}</p>
                      <p className="text-sm text-gray-200">{(val as string) || <span className="text-gray-600">не заполнено</span>}</p>
                    </div>
                  ))}
                </div>

                {selected.next_action && (
                  <div
                    className={`p-3 rounded-lg border ${
                      selected.is_overdue ? "border-red-500/30 bg-red-500/5" : "border-gray-800 bg-gray-900"
                    }`}
                  >
                    <p className="text-xs text-gray-500 mb-1">Ближайшее действие</p>
                    <p className="text-sm text-gray-200">{selected.next_action}</p>
                    <p className={`text-xs mt-1 ${selected.is_overdue ? "text-red-400" : "text-gray-500"}`}>
                      {fmtDate(selected.next_action_due)}
                      {selected.responsible_name && ` · ${selected.responsible_name}`}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
