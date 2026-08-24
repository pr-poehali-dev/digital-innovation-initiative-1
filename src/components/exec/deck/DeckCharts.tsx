import Icon from "@/components/ui/icon";
import {
  Checkpoint,
  CoverageRow,
  DashFunction,
  DashInitiative,
  DashRisk,
  DashIssue,
  Participation,
  StaffingCalculation,
  TargetFunction,
  TargetRole,
  StatusQuoRisk,
} from "@/lib/execCenterApi";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PALETTE = ["#7c3aed", "#2563eb", "#059669", "#d97706", "#dc2626", "#0891b2"];
const AXIS = { fontSize: 12, fill: "#64748b" };

/** Текущая (распределённая) vs целевая (штатная) структура — две колонки. */
export function OrgStructureCompare({
  participation,
  roles,
}: {
  participation: Participation[];
  roles: TargetRole[];
}) {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div>
        <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
          <Icon name="GitBranch" size={14} className="text-slate-500" />
          Сейчас — распределённо
        </p>
        {!participation.length ? (
          <p className="text-sm text-slate-400 italic">Участники не описаны</p>
        ) : (
          <div className="space-y-2">
            {participation.map((p) => (
              <div key={p.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <p className="text-sm font-medium text-slate-900">{p.display_name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {p.position_title || "—"}
                  {p.org_name ? ` · ${p.org_name}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
          <Icon name="Building2" size={14} className="text-violet-600" />
          Целевая структура
        </p>
        {!roles.length ? (
          <p className="text-sm text-slate-400 italic">Штатные позиции не описаны</p>
        ) : (
          <div className="space-y-2">
            {roles.map((r) => (
              <div key={r.id} className="rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2.5">
                <p className="text-sm font-medium text-slate-900">{r.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {r.headcount} ст. · {r.person_name || "вакансия"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Распределение доступной Центру ёмкости по источникам ресурса. */
export function ResourceBySourceChart({ participation }: { participation: Participation[] }) {
  const bySource = new Map<string, number>();
  participation.forEach((p) => {
    const k = p.source_title;
    bySource.set(k, (bySource.get(k) || 0) + Number(p.center_hours_per_week || 0));
  });
  const data = Array.from(bySource.entries()).map(([name, value]) => ({ name, value: Math.round(value) }));
  if (!data.length) return null;
  return (
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" outerRadius={80} label={(e) => `${e.name}: ${e.value}ч`}>
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Загрузка сотрудников: доступная ёмкость на Центр vs плановые часы. */
export function TeamLoadChart({ participation }: { participation: Participation[] }) {
  const data = participation.map((p) => ({
    name: p.display_name.split(" ").slice(0, 2).join(" "),
    Доступно: Number(p.center_hours_per_week || 0),
    План: p.center_plan_hours,
  }));
  if (!data.length) return null;
  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis type="number" tick={AXIS} />
          <YAxis type="category" dataKey="name" tick={AXIS} width={120} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Доступно" fill="#94a3b8" radius={[0, 4, 4, 0]} />
          <Bar dataKey="План" fill="#7c3aed" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Распределение трудозатрат по функциям. */
export function HoursByFunctionChart({ functions }: { functions: DashFunction[] }) {
  const data = functions
    .filter((f) => Number(f.hours_per_month || 0) > 0)
    .map((f) => ({ name: f.title.length > 22 ? f.title.slice(0, 22) + "…" : f.title, value: Number(f.hours_per_month) }));
  if (!data.length) return null;
  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis type="number" tick={AXIS} unit=" ч" />
          <YAxis type="category" dataKey="name" tick={AXIS} width={160} />
          <Tooltip />
          <Bar dataKey="value" name="ч/мес" fill="#2563eb" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Расчёт численности по категориям работы. */
export function StaffingChart({ staffing }: { staffing: StaffingCalculation }) {
  const data = staffing.categories.map((c) => ({ name: c.title, ставки: c.fte, часы: c.annual_hours }));
  return (
    <div style={{ width: "100%", height: 240 }}>
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} interval={0} angle={-12} textAnchor="end" height={60} />
          <YAxis tick={AXIS} />
          <Tooltip />
          <Bar dataKey="ставки" fill="#7c3aed" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Матрица функция → роль/владелец, с признаком критичности и покрытия. */
export function FunctionRoleMatrix({ functions }: { functions: TargetFunction[] }) {
  if (!functions.length) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-xs">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Функция</th>
            <th className="text-left px-3 py-2 font-medium">Владелец сейчас</th>
            <th className="text-left px-3 py-2 font-medium">Позиций в целевой модели</th>
            <th className="text-left px-3 py-2 font-medium">Критичность</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {functions.map((f) => (
            <tr key={f.id}>
              <td className="px-3 py-2 font-medium text-slate-900">{f.title}</td>
              <td className="px-3 py-2 text-slate-600">
                {f.current_owner || <span className="text-red-500">не назначен</span>}
              </td>
              <td className="px-3 py-2 text-slate-600">
                {f.target_role_count > 0 ? f.target_role_count : <span className="text-amber-600">нет</span>}
              </td>
              <td className="px-3 py-2">
                {f.criticality === "high" ? (
                  <span className="text-red-600 font-medium">высокая</span>
                ) : f.criticality === "medium" ? (
                  <span className="text-amber-600">средняя</span>
                ) : (
                  <span className="text-slate-400">низкая</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Матрица покрытия компетенций: функция × требуемый/текущий уровень. */
export function CompetencyMatrix({ coverage }: { coverage: CoverageRow[] }) {
  if (!coverage.length) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-xs">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Функция</th>
            <th className="text-left px-3 py-2 font-medium">Компетенция</th>
            <th className="text-left px-3 py-2 font-medium">Требуется</th>
            <th className="text-left px-3 py-2 font-medium">Есть у владельца</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {coverage.map((c, i) => {
            const gap = c.current_level == null || c.current_level < c.required_level;
            return (
              <tr key={i} className={gap ? "bg-amber-50/50" : ""}>
                <td className="px-3 py-2 text-slate-800">{c.function_title}</td>
                <td className="px-3 py-2 text-slate-600">{c.competency_name}</td>
                <td className="px-3 py-2 text-slate-600">{c.required_level}</td>
                <td className="px-3 py-2">
                  {c.current_level != null ? (
                    <span className={gap ? "text-amber-600 font-medium" : "text-emerald-600"}>{c.current_level}</span>
                  ) : (
                    <span className="text-red-500">не подтверждён</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Портфель инициатив. */
export function InitiativePortfolio({ initiatives }: { initiatives: DashInitiative[] }) {
  if (!initiatives.length) return null;
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {initiatives.map((i) => (
        <div key={i.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-sm font-medium text-slate-900">{i.title}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
            <span>задач: {i.open_steps}</span>
            {i.overdue_steps > 0 && <span className="text-red-600">просрочено: {i.overdue_steps}</span>}
            {i.milestone_count > 0 && <span>вех: {i.milestone_count}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** План/факт трудозатрат. */
export function PlanFactChart({ planHours, factHours }: { planHours: number; factHours: number }) {
  const data = [{ name: "Трудозатраты", План: Math.round(planHours), Факт: Math.round(factHours) }];
  return (
    <div style={{ width: "100%", height: 200 }}>
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="name" tick={AXIS} />
          <YAxis tick={AXIS} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="План" fill="#94a3b8" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Факт" fill="#059669" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Дорожная карта: этапы в виде временной шкалы (текстовый список, т.к. дат по этапам нет). */
export function RoadmapTimeline({ text }: { text: string }) {
  const steps = text.split("\n").map((s) => s.trim()).filter(Boolean);
  return (
    <div className="space-y-0">
      {steps.map((s, i) => (
        <div key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className="w-7 h-7 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
              {i + 1}
            </span>
            {i < steps.length - 1 && <span className="w-0.5 flex-1 bg-violet-200 my-1" />}
          </div>
          <p className="text-sm text-slate-700 pb-5 pt-0.5">{s}</p>
        </div>
      ))}
    </div>
  );
}

/** Карта рисков сохранения статус-кво. */
export function RiskMap({ risks }: { risks: StatusQuoRisk[] }) {
  const RISK_COLOR: Record<string, string> = { high: "#dc2626", medium: "#d97706", low: "#94a3b8" };
  const RISK_TITLE: Record<string, string> = { high: "Высокий", medium: "Средний", low: "Низкий" };
  if (!risks.length) return null;
  return (
    <div className="space-y-2">
      {risks.map((r, i) => (
        <div key={i} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
          <span
            className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0"
            style={{ backgroundColor: RISK_COLOR[r.level] }}
          />
          <div>
            <span className="text-xs font-semibold" style={{ color: RISK_COLOR[r.level] }}>
              {RISK_TITLE[r.level]} риск
            </span>
            <p className="text-sm text-slate-700 mt-0.5">{r.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Контрольные точки и результаты — компактный список. */
export function CheckpointsList({ checkpoints }: { checkpoints: Checkpoint[] }) {
  if (!checkpoints.length) return null;
  return (
    <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
      {checkpoints.slice(0, 12).map((c) => (
        <div key={`${c.kind}-${c.id}`} className="flex items-center gap-2 text-sm">
          <Icon
            name={c.status === "done" ? "CheckCircle2" : c.is_overdue ? "AlertCircle" : "Circle"}
            size={14}
            className={c.status === "done" ? "text-emerald-500" : c.is_overdue ? "text-red-500" : "text-slate-300"}
          />
          <span className="text-slate-700">{c.title}</span>
        </div>
      ))}
    </div>
  );
}

export function IssuesRisksCompact({ risks, issues }: { risks: DashRisk[]; issues: DashIssue[] }) {
  const total = risks.length + issues.length;
  if (!total) return null;
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <div className="rounded-lg border border-slate-200 p-3">
        <p className="text-xs font-medium text-slate-500 mb-2">Риски ({risks.length})</p>
        <div className="space-y-1">
          {risks.slice(0, 5).map((r) => (
            <p key={r.id} className="text-xs text-slate-700 truncate">{r.title}</p>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 p-3">
        <p className="text-xs font-medium text-slate-500 mb-2">Проблемы ({issues.length})</p>
        <div className="space-y-1">
          {issues.slice(0, 5).map((i) => (
            <p key={i.id} className="text-xs text-slate-700 truncate">{i.title}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
