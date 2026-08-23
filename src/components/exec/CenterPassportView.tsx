import { useState } from "react";
import Icon from "@/components/ui/icon";
import { Card, Empty, Metric } from "@/components/exec/ExecUI";
import {
  CENTER_STATUS,
  CRITICALITY,
  Center,
  CenterFunction,
  CenterGoal,
  CenterRole,
  CenterStats,
  FUNC_STATUS,
  GOAL_STATUS,
  ROLE_STATUS,
} from "@/lib/execCenterApi";

const fmtDate = (d: string | null) =>
  d ? new Date(d.slice(0, 10)).toLocaleDateString("ru-RU") : "—";

function Block({ label, text }: { label: string; text: string | null }) {
  if (!text) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
        {label}
      </h4>
      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{text}</p>
    </div>
  );
}

function RowActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      <button
        onClick={onEdit}
        className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
        title="Изменить"
      >
        <Icon name="Pencil" size={13} />
      </button>
      <button
        onClick={onDelete}
        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
        title="Удалить"
      >
        <Icon name="Trash2" size={13} />
      </button>
    </div>
  );
}

export default function CenterPassportView({
  center,
  stats,
  onEditCenter,
  onAddGoal,
  onEditGoal,
  onDeleteGoal,
  onAddFunction,
  onEditFunction,
  onDeleteFunction,
  onAddRole,
  onEditRole,
  onDeleteRole,
}: {
  center: Center;
  stats: CenterStats | null;
  onEditCenter: () => void;
  onAddGoal: (kind: string, parentId?: number | null) => void;
  onEditGoal: (g: CenterGoal) => void;
  onDeleteGoal: (g: CenterGoal) => void;
  onAddFunction: () => void;
  onEditFunction: (f: CenterFunction) => void;
  onDeleteFunction: (f: CenterFunction) => void;
  onAddRole: () => void;
  onEditRole: (r: CenterRole) => void;
  onDeleteRole: (r: CenterRole) => void;
}) {
  const [tab, setTab] = useState<"passport" | "goals" | "functions" | "staff">("passport");

  const st = CENTER_STATUS[center.status] || CENTER_STATUS.draft;
  const goals = (center.goals || []).filter((g) => g.kind === "goal");
  const tasks = (center.goals || []).filter((g) => g.kind === "task");
  const functions = center.functions || [];
  const roles = center.roles || [];

  const tabs = [
    { id: "passport", label: "Паспорт", icon: "FileText" },
    { id: "goals", label: "Цели и задачи", icon: "Target", count: goals.length + tasks.length },
    { id: "functions", label: "Функции", icon: "Layers", count: functions.length },
    { id: "staff", label: "Штат", icon: "Users", count: roles.length },
  ] as const;

  return (
    <div className="space-y-5">
      {/* Шапка */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold text-slate-900">{center.title}</h1>
            <span className={`text-[11px] px-2 py-0.5 rounded border font-medium ${st.cls}`}>
              {st.title}
            </span>
          </div>
          {center.parent_org && (
            <p className="text-sm text-slate-500 mt-1">В составе: {center.parent_org}</p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
            {center.head_name && <span>Руководитель: {center.head_name}</span>}
            {center.start_date && <span>Запуск: {fmtDate(center.start_date)}</span>}
            {center.plan_title && <span>План: {center.plan_title}</span>}
          </div>
        </div>
        <button
          onClick={onEditCenter}
          className="px-3.5 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:border-slate-300 transition-colors flex items-center gap-2"
        >
          <Icon name="Pencil" size={14} />
          Изменить
        </button>
      </div>

      {/* Метрики обоснования */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Metric label="Целей центра" value={stats.goals || 0} icon="Target" />
          <Metric label="Функций" value={stats.functions || 0} icon="Layers" />
          <Metric
            label="Требуется ставок"
            value={Number(stats.headcount || 0)}
            icon="Users"
            tone={Number(stats.vacant_roles || 0) > 0 ? "warning" : "default"}
          />
          <Metric
            label="Часов в месяц"
            value={Number(stats.hours_per_month || 0)}
            icon="Clock"
          />
        </div>
      )}

      {/* Предупреждения */}
      {stats && (
        <div className="space-y-2">
          {stats.functions_no_owner > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2.5 text-sm text-amber-800">
              <Icon name="TriangleAlert" size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <span>
                <b>{stats.functions_no_owner}</b> функций без ответственного — непонятно, кто
                будет их выполнять.
              </span>
            </div>
          )}
          {stats.critical_no_backup > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 flex items-start gap-2.5 text-sm text-red-800">
              <Icon name="ShieldAlert" size={15} className="text-red-600 flex-shrink-0 mt-0.5" />
              <span>
                <b>{stats.critical_no_backup}</b> критичных функций держатся на одном человеке
                без замещающего — риск остановки работы.
              </span>
            </div>
          )}
          {stats.goals_no_metric > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-start gap-2.5 text-sm text-slate-600">
              <Icon name="Info" size={15} className="text-slate-400 flex-shrink-0 mt-0.5" />
              <span>
                У <b>{stats.goals_no_metric}</b> целей не задан показатель — их достижение
                нельзя будет доказать.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Вкладки */}
      <div
        className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto overflow-y-hidden no-scrollbar overscroll-x-contain"
        style={{ touchAction: "pan-x" }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap flex-shrink-0 ${
              tab === t.id
                ? "border-violet-600 text-slate-900 font-medium"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon name={t.icon} size={14} />
            {t.label}
            {"count" in t && t.count > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Паспорт */}
      {tab === "passport" && (
        <Card
          title="Обоснование создания"
          subtitle="Материал для защиты перед руководством"
          icon="FileText"
        >
          {!center.problem_statement &&
          !center.rationale &&
          !center.mission &&
          !center.scope_included ? (
            <div className="py-6 text-center">
              <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                Заполните обоснование: какую проблему решает центр, почему нужно отдельное
                подразделение, где границы его ответственности и по каким признакам поймём,
                что он себя оправдал.
              </p>
              <button
                onClick={onEditCenter}
                className="mt-4 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors"
              >
                Заполнить
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <Block label="Проблема" text={center.problem_statement} />
              <Block label="Почему нужен центр" text={center.rationale} />
              <Block label="Миссия" text={center.mission} />
              <div className="grid md:grid-cols-2 gap-5">
                <Block label="Входит в зону ответственности" text={center.scope_included} />
                <Block label="Не входит" text={center.scope_excluded} />
              </div>
              <Block label="Критерии успеха" text={center.success_criteria} />
              <Block label="Заметки" text={center.note} />

              <div className="pt-3 border-t border-slate-100 grid sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block mb-0.5">Планируемая численность</span>
                  <span className="text-slate-700 font-medium">
                    {center.planned_headcount ? `${center.planned_headcount} чел.` : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Дата запуска</span>
                  <span className="text-slate-700 font-medium">
                    {fmtDate(center.start_date)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Пересмотр</span>
                  <span className="text-slate-700 font-medium">
                    {fmtDate(center.review_date)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Цели и задачи */}
      {tab === "goals" && (
        <Card
          title="Цели и задачи"
          subtitle="Чего центр достигает и как это измеряется"
          icon="Target"
          action={
            <button
              onClick={() => onAddGoal("goal")}
              className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <Icon name="Plus" size={13} />
              Цель
            </button>
          }
        >
          {goals.length === 0 && tasks.length === 0 ? (
            <Empty text="Целей пока нет. Начните с 3–5 ключевых." icon="Target" />
          ) : (
            <div className="space-y-3">
              {goals.map((g) => {
                const gst = GOAL_STATUS[g.status] || GOAL_STATUS.planned;
                const sub = tasks.filter((t) => t.parent_goal_id === g.id);
                return (
                  <div key={g.id} className="rounded-xl border border-slate-200 bg-white">
                    <div className="p-3.5">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-medium text-slate-900">{g.title}</h4>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${gst.cls}`}
                            >
                              {gst.title}
                            </span>
                          </div>
                          {g.description && (
                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                              {g.description}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-500">
                            {g.metric ? (
                              <span>
                                {g.metric}:{" "}
                                <b className="text-slate-700">
                                  {g.baseline_value || "—"} → {g.target_value || "—"}
                                </b>
                              </span>
                            ) : (
                              <span className="text-amber-600">показатель не задан</span>
                            )}
                            {g.owner_name && <span>Ответственный: {g.owner_name}</span>}
                            {g.horizon && <span>{g.horizon}</span>}
                            {g.due_date && <span>до {fmtDate(g.due_date)}</span>}
                          </div>
                        </div>
                        <RowActions
                          onEdit={() => onEditGoal(g)}
                          onDelete={() => onDeleteGoal(g)}
                        />
                      </div>
                    </div>

                    {sub.length > 0 && (
                      <div className="border-t border-slate-100 px-3.5 py-2.5 space-y-1.5">
                        {sub.map((t) => (
                          <div key={t.id} className="flex items-center gap-2 text-xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
                            <span className="text-slate-700 truncate flex-1">{t.title}</span>
                            {t.owner_name && (
                              <span className="text-slate-400 flex-shrink-0">
                                {t.owner_name}
                              </span>
                            )}
                            <RowActions
                              onEdit={() => onEditGoal(t)}
                              onDelete={() => onDeleteGoal(t)}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="border-t border-slate-100 px-3.5 py-2">
                      <button
                        onClick={() => onAddGoal("task", g.id)}
                        className="text-xs text-violet-600 hover:text-violet-700 flex items-center gap-1.5 transition-colors"
                      >
                        <Icon name="Plus" size={12} />
                        Задача к этой цели
                      </button>
                    </div>
                  </div>
                );
              })}

              {tasks.filter((t) => !t.parent_goal_id).length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                    Задачи вне целей
                  </h4>
                  <div className="space-y-1.5">
                    {tasks
                      .filter((t) => !t.parent_goal_id)
                      .map((t) => (
                        <div key={t.id} className="flex items-center gap-2 text-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
                          <span className="text-slate-700 truncate flex-1">{t.title}</span>
                          <RowActions
                            onEdit={() => onEditGoal(t)}
                            onDelete={() => onDeleteGoal(t)}
                          />
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Функции */}
      {tab === "functions" && (
        <Card
          title="Функции центра"
          subtitle="Что центр делает постоянно и кто за это отвечает"
          icon="Layers"
          action={
            <button
              onClick={onAddFunction}
              className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <Icon name="Plus" size={13} />
              Функция
            </button>
          }
        >
          {functions.length === 0 ? (
            <Empty
              text="Функций пока нет. Это основа для обоснования штата."
              icon="Layers"
            />
          ) : (
            <div className="space-y-2">
              {functions.map((f) => {
                const cr = CRITICALITY[f.criticality] || CRITICALITY.medium;
                const fs = FUNC_STATUS[f.status] || FUNC_STATUS.planned;
                const total = f.steps_total || 0;
                const done = f.steps_done || 0;
                return (
                  <div
                    key={f.id}
                    className="rounded-xl border border-slate-200 bg-white p-3.5"
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {f.code && (
                            <span className="text-[11px] font-mono text-slate-400">
                              {f.code}
                            </span>
                          )}
                          <h4 className="text-sm font-medium text-slate-900">{f.title}</h4>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${cr.cls}`}
                          >
                            {cr.title}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${fs.cls}`}
                          >
                            {fs.title}
                          </span>
                        </div>
                        {f.description && (
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                            {f.description}
                          </p>
                        )}

                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-500">
                          <span>
                            Ответственный:{" "}
                            {f.owner_name ? (
                              <b className="text-slate-700">{f.owner_name}</b>
                            ) : (
                              <span className="text-amber-600">не назначен</span>
                            )}
                          </span>
                          {f.backup_name ? (
                            <span>Замещает: {f.backup_name}</span>
                          ) : f.criticality === "high" ? (
                            <span className="text-red-600">без замещающего</span>
                          ) : null}
                          {f.hours_per_month != null && <span>{f.hours_per_month} ч/мес</span>}
                          {f.fte_estimate != null && <span>{f.fte_estimate} ставки</span>}
                          {f.regularity && <span>{f.regularity}</span>}
                        </div>

                        {total > 0 && (
                          <div className="flex items-center gap-2 mt-2">
                            <div className="h-1.5 w-32 rounded-full bg-slate-200 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-emerald-500"
                                style={{ width: `${(done / total) * 100}%` }}
                              />
                            </div>
                            <span className="text-[11px] text-slate-400">
                              {done}/{total} шагов
                              {(f.steps_overdue || 0) > 0 && (
                                <span className="text-red-600">
                                  {" "}
                                  · {f.steps_overdue} просрочено
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                      <RowActions
                        onEdit={() => onEditFunction(f)}
                        onDelete={() => onDeleteFunction(f)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Штат */}
      {tab === "staff" && (
        <Card
          title="Штатная потребность"
          subtitle="Какие роли нужны центру и чем они обоснованы"
          icon="Users"
          action={
            <button
              onClick={onAddRole}
              className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <Icon name="Plus" size={13} />
              Роль
            </button>
          }
        >
          {roles.length === 0 ? (
            <Empty text="Ролей пока нет. Добавьте нужные должности." icon="Users" />
          ) : (
            <div className="space-y-2">
              {roles.map((r) => {
                const rs = ROLE_STATUS[r.status] || ROLE_STATUS.needed;
                const linked = functions.filter((x) => (r.function_ids || []).includes(x.id));
                const linkedHours = linked.reduce(
                  (s, x) => s + Number(x.hours_per_month || 0),
                  0,
                );
                return (
                  <div
                    key={r.id}
                    className="rounded-xl border border-slate-200 bg-white p-3.5"
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-medium text-slate-900">{r.title}</h4>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${rs.cls}`}
                          >
                            {rs.title}
                          </span>
                          {!r.person_id && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
                              вакансия
                            </span>
                          )}
                        </div>
                        {r.purpose && (
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                            {r.purpose}
                          </p>
                        )}

                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-500">
                          <span>
                            Ставок: <b className="text-slate-700">{r.headcount}</b>
                          </span>
                          {r.hours_per_week != null && <span>{r.hours_per_week} ч/нед</span>}
                          {r.grade && <span>{r.grade}</span>}
                          {r.person_name && (
                            <span>
                              Занимает: <b className="text-slate-700">{r.person_name}</b>
                            </span>
                          )}
                        </div>

                        {linked.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-slate-100">
                            <div className="text-[11px] text-slate-400 mb-1">
                              Закреплено функций: {linked.length}
                              {linkedHours > 0 && ` · ${linkedHours} ч/мес`}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {linked.map((x) => (
                                <span
                                  key={x.id}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
                                >
                                  {x.code || x.title.slice(0, 24)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {r.justification && (
                          <p className="text-[11px] text-slate-500 mt-2 leading-relaxed italic">
                            {r.justification}
                          </p>
                        )}
                      </div>
                      <RowActions
                        onEdit={() => onEditRole(r)}
                        onDelete={() => onDeleteRole(r)}
                      />
                    </div>
                  </div>
                );
              })}

              {stats && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 text-xs text-slate-600">
                  Итого запрашивается <b className="text-slate-900">{stats.headcount}</b> ставок,
                  из них закрыто <b className="text-slate-900">{stats.headcount_filled}</b>.
                  Объём работы по функциям —{" "}
                  <b className="text-slate-900">{stats.hours_per_month} ч/мес</b>
                  {Number(stats.fte_total) > 0 && (
                    <>
                      {" "}
                      (оценка <b className="text-slate-900">{stats.fte_total}</b> ставки)
                    </>
                  )}
                  .
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
