import Icon from "@/components/ui/icon";
import { fmtDate } from "@/components/exec/ExecUI";
import {
  Checkpoint,
  CoverageRow,
  DashFunction,
  DashGoal,
  DashInitiative,
  DashIssue,
  DashRisk,
  DashRole,
  ReadinessItem,
  SEVERITY,
} from "@/lib/execCenterApi";

export function Section({
  title,
  icon,
  count,
  action,
  children,
}: {
  title: string;
  icon: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <header className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-200">
        <Icon name={icon} size={15} className="text-violet-600 flex-shrink-0" />
        <h2 className="text-sm font-semibold text-slate-900 flex-1 min-w-0 truncate">
          {title}
          {count !== undefined && (
            <span className="ml-2 text-xs font-normal text-slate-400">{count}</span>
          )}
        </h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function EmptyHint({
  text,
  actionText,
  onAction,
  icon = "Inbox",
}: {
  text: string;
  actionText?: string;
  onAction?: () => void;
  icon?: string;
}) {
  return (
    <div className="py-6 text-center">
      <Icon name={icon} size={24} className="text-slate-300 mx-auto mb-2" />
      <p className="text-sm text-slate-500">{text}</p>
      {actionText && onAction && (
        <button
          onClick={onAction}
          className="mt-2.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs hover:bg-violet-700 transition-colors"
        >
          {actionText}
        </button>
      )}
    </div>
  );
}

export function TestTag() {
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] border border-slate-200 bg-slate-50 text-slate-500 flex-shrink-0">
      проверочная
    </span>
  );
}

/** Готовность паспорта Центра: что заполнено, что осталось */
export function ReadinessPanel({
  items,
  pct,
  onGoto,
}: {
  items: ReadinessItem[];
  pct: number;
  onGoto: (code: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Готовность Центра</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Заполнено {items.filter((i) => i.done).length} из {items.length} разделов
          </p>
        </div>
        <span
          className={`text-2xl font-semibold tabular-nums ${
            pct >= 80 ? "text-green-600" : pct >= 40 ? "text-amber-600" : "text-slate-400"
          }`}
        >
          {pct}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-all ${
            pct >= 80 ? "bg-green-500" : pct >= 40 ? "bg-amber-500" : "bg-violet-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-1.5">
        {items.map((i) => (
          <button
            key={i.code}
            onClick={() => onGoto(i.code)}
            title={i.hint}
            className={`flex items-start gap-2 text-left rounded-lg px-2 py-1.5 transition-colors ${
              i.done ? "hover:bg-slate-50" : "hover:bg-violet-50"
            }`}
          >
            <Icon
              name={i.done ? "CircleCheck" : "Circle"}
              size={14}
              className={`mt-0.5 flex-shrink-0 ${i.done ? "text-green-500" : "text-slate-300"}`}
            />
            <span className="min-w-0">
              <span
                className={`block text-xs ${i.done ? "text-slate-500" : "text-slate-800 font-medium"}`}
              >
                {i.title}
              </span>
              {!i.done && <span className="block text-[10px] text-slate-400">{i.hint}</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function GoalRow({ g, onClick }: { g: DashGoal; onClick: () => void }) {
  const noMetric = !g.metric || !g.target_value;
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border border-slate-200 p-3 hover:border-violet-300 transition-colors"
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">{g.title}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-500">
            {g.metric ? (
              <span>
                {g.metric}: {g.baseline_value || "—"} → {g.target_value || "—"}
              </span>
            ) : (
              <span className="text-amber-600">показатель не задан</span>
            )}
            {g.owner_name && <span>· {g.owner_name}</span>}
            {g.due_date && <span>· до {fmtDate(g.due_date)}</span>}
            {g.function_count > 0 && <span>· функций: {g.function_count}</span>}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          {g.last_value !== null ? (
            <>
              <p className="text-sm font-semibold text-slate-900 tabular-nums">{g.last_value}</p>
              <p className="text-[10px] text-slate-400">
                {g.last_period ? fmtDate(g.last_period) : "факт"}
              </p>
            </>
          ) : (
            <span className="text-[11px] text-slate-400">нет замеров</span>
          )}
        </div>
      </div>
      {noMetric && (
        <p className="mt-2 text-[11px] text-amber-700 flex items-center gap-1">
          <Icon name="TriangleAlert" size={11} />
          Цель без измеримого показателя
        </p>
      )}
    </button>
  );
}

export function FunctionRow({ f, onClick }: { f: DashFunction; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-3 transition-colors ${
        !f.owner_name ? "border-red-200 hover:border-red-300" : "border-slate-200 hover:border-violet-300"
      }`}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">
            {f.code ? `${f.code}. ` : ""}
            {f.title}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px]">
            <span className={f.owner_name ? "text-slate-600" : "text-red-600 font-medium"}>
              {f.owner_name ? `Владелец: ${f.owner_name}` : "Владелец не назначен"}
            </span>
            {f.backup_name && <span className="text-slate-500">· замещает {f.backup_name}</span>}
            {f.criticality === "high" && !f.backup_name && (
              <span className="text-red-600">· нет замещающего</span>
            )}
            {f.goal_title && <span className="text-slate-500">· цель: {f.goal_title}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-400">
            <span className={f.req_competencies ? "" : "text-amber-600"}>
              {f.req_competencies ? `компетенций: ${f.req_competencies}` : "требования не заданы"}
            </span>
            {f.open_steps > 0 && <span>· задач в работе: {f.open_steps}</span>}
            {f.initiative_count > 0 && <span>· инициатив: {f.initiative_count}</span>}
            {f.hours_per_month && <span>· {f.hours_per_month} ч/мес</span>}
          </div>
        </div>
        {f.criticality === "high" && (
          <span className="px-1.5 py-0.5 rounded text-[10px] border border-red-200 bg-red-50 text-red-700 flex-shrink-0">
            Критичная
          </span>
        )}
      </div>
    </button>
  );
}

export function RoleRow({ r }: { r: DashRole }) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        r.person_id ? "border-slate-200" : "border-amber-200 bg-amber-50/40"
      }`}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">{r.title}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-500">
            <span className={r.person_id ? "" : "text-amber-700 font-medium"}>
              {r.person_name || "вакансия"}
            </span>
            <span>· ставок: {r.headcount}</span>
            {r.hours_per_week && <span>· {r.hours_per_week} ч/нед</span>}
            {r.grade && <span>· {r.grade}</span>}
            {r.function_count > 0 && <span>· функций: {r.function_count}</span>}
          </div>
          {r.justification ? (
            <p className="text-[11px] text-slate-500 mt-1.5">{r.justification}</p>
          ) : (
            <p className="text-[11px] text-amber-700 mt-1.5 flex items-center gap-1">
              <Icon name="TriangleAlert" size={11} />
              Обоснование потребности не заполнено
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function InitiativeRow({ i, onClick }: { i: DashInitiative; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border border-slate-200 p-3 hover:border-violet-300 transition-colors"
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-slate-900">{i.title}</p>
            {i.is_test && <TestTag />}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-500">
            {i.stage && <span>{i.stage}</span>}
            {i.plan_end && <span>· до {fmtDate(i.plan_end)}</span>}
            {i.milestone_count > 0 && <span>· вех: {i.milestone_count}</span>}
            <span>· задач в работе: {i.open_steps}</span>
            {i.overdue_steps > 0 && (
              <span className="text-red-600 font-medium">· просрочено: {i.overdue_steps}</span>
            )}
          </div>
          {i.effect_metric && (
            <p className="text-[11px] text-slate-500 mt-1">
              Эффект: {i.effect_metric} · цель {i.effect_target || "—"} · факт{" "}
              {i.effect_actual || "—"}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

export function CheckpointRow({ c, onClick }: { c: Checkpoint; onClick: () => void }) {
  const done = ["done", "achieved"].includes(c.status || "");
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-2.5 transition-colors ${
        c.is_overdue ? "border-red-200 bg-red-50/40" : "border-slate-200 hover:border-violet-300"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Icon
          name={c.kind === "milestone" ? "Diamond" : "Flag"}
          size={12}
          className={
            done ? "text-green-500" : c.is_overdue ? "text-red-500" : "text-violet-500"
          }
        />
        <span className="text-sm text-slate-900 min-w-0 flex-1 truncate">{c.title}</span>
        {c.is_test && <TestTag />}
        <span
          className={`text-[11px] tabular-nums flex-shrink-0 ${
            c.is_overdue ? "text-red-600 font-medium" : "text-slate-500"
          }`}
        >
          {c.fact_date ? `выполнено ${fmtDate(c.fact_date)}` : fmtDate(c.due_date)}
        </span>
      </div>
      <p className="text-[10px] text-slate-400 mt-0.5 ml-5">
        {c.kind === "milestone" ? "Управленческая веха" : "Контрольная точка плана"}
        {c.initiative_title ? ` · ${c.initiative_title}` : ""}
      </p>
    </button>
  );
}

export function RiskRow({ r }: { r: DashRisk }) {
  const sev = SEVERITY[r.severity] || SEVERITY.low;
  return (
    <div
      className={`rounded-lg border p-2.5 ${
        r.is_blocking ? "border-red-300 bg-red-50/50" : "border-slate-200"
      }`}
    >
      <div className="flex flex-wrap items-start gap-2">
        <span className={`px-1.5 py-0.5 rounded text-[10px] border flex-shrink-0 ${sev.cls}`}>
          {sev.title}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-900">{r.title}</p>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-0.5 text-[11px] text-slate-500">
            {r.risk_score != null && <span>оценка {r.risk_score}</span>}
            {r.function_title && <span>· {r.function_title}</span>}
            {r.initiative_title && <span>· {r.initiative_title}</span>}
          </div>
          {r.is_blocking && (
            <p className="text-[11px] text-red-700 mt-1 flex items-start gap-1">
              <Icon name="Ban" size={11} className="mt-0.5 flex-shrink-0" />
              Блокирует: {r.block_what || "работы"}
            </p>
          )}
        </div>
        {r.is_test && <TestTag />}
      </div>
    </div>
  );
}

export function IssueRow({ i }: { i: DashIssue }) {
  const sev = SEVERITY[i.severity || "low"] || SEVERITY.low;
  return (
    <div
      className={`rounded-lg border p-2.5 ${
        i.is_blocking ? "border-red-300 bg-red-50/50" : "border-slate-200"
      }`}
    >
      <div className="flex flex-wrap items-start gap-2">
        <span className={`px-1.5 py-0.5 rounded text-[10px] border flex-shrink-0 ${sev.cls}`}>
          {sev.title}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-900">{i.title}</p>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-0.5 text-[11px] text-slate-500">
            {i.due_at && <span>срок {fmtDate(i.due_at)}</span>}
            {i.initiative_title && <span>· {i.initiative_title}</span>}
            {i.needs_escalation && <span className="text-amber-700">· нужна эскалация</span>}
          </div>
          {i.is_blocking && (
            <p className="text-[11px] text-red-700 mt-1 flex items-start gap-1">
              <Icon name="Ban" size={11} className="mt-0.5 flex-shrink-0" />
              Блокирует: {i.block_what || "работы"}
            </p>
          )}
        </div>
        {i.is_test && <TestTag />}
      </div>
    </div>
  );
}

/** Покрытие функций компетенциями команды */
export function CoverageBlock({ gaps }: { gaps: CoverageRow[] }) {
  if (!gaps.length) {
    return (
      <p className="text-sm text-slate-500 py-2">
        Разрывов не обнаружено: у владельцев функций уровень не ниже требуемого.
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      {gaps.map((g, i) => (
        <div
          key={i}
          className={`rounded-lg border p-2.5 ${
            g.is_critical ? "border-red-200 bg-red-50/40" : "border-amber-200 bg-amber-50/40"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-900 min-w-0 flex-1">
              {g.function_title}
            </span>
            {g.is_critical && (
              <span className="px-1.5 py-0.5 rounded text-[10px] border border-red-200 bg-red-50 text-red-700">
                критичная
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-600 mt-1">
            {g.display_name}: {g.competency_name} — уровень{" "}
            {g.current_level ?? "не подтверждён"} при требуемом {g.required_level}
          </p>
        </div>
      ))}
    </div>
  );
}
