import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading, fmtDate } from "@/components/exec/ExecUI";
import {
  CRITICALITY,
  CoverageRow,
  ModelData,
  PARTICIPATION_FORMAT,
  StaffingCategory,
  WORK_CATEGORY,
  centerApi,
} from "@/lib/execCenterApi";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PIE = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b"];
const RISK_COLOR: Record<string, string> = { high: "#ef4444", medium: "#f59e0b", low: "#94a3b8" };

/** Материалы для защиты создания Центра перед руководством.
 * Каждая цифра раскрывается до исходных функций, задач, сотрудников. */
export default function ExecCenterCasePage() {
  const nav = useNavigate();
  const [data, setData] = useState<ModelData | null>(null);
  const [gaps, setGaps] = useState<CoverageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openSection, setOpenSection] = useState<string | null>("problem");

  const reload = () => {
    setLoading(true);
    setError("");
    Promise.all([centerApi.model(), centerApi.dashboard()])
      .then(([m, d]) => {
        setData(m);
        setGaps(d.gaps || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(reload, []);

  if (loading) {
    return (
      <Layout>
        <Loading />
      </Layout>
    );
  }
  if (error) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-10">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      </Layout>
    );
  }
  if (!data?.center) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <Icon name="FileText" size={32} className="text-slate-300 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-slate-900">Центр ещё не создан</h1>
          <button
            onClick={() => nav("/cabinet/exec/center")}
            className="mt-4 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700 transition-colors"
          >
            Создать Центр
          </button>
        </div>
      </Layout>
    );
  }

  const c = data.center;
  const functions = data.target.functions;
  const roles = data.target.roles;
  const participation = data.current_team.participation;
  const staffing = data.staffing;
  const risks = data.status_quo_risks;

  const totalPlanHours = participation.reduce((s, p) => s + p.center_plan_hours, 0);
  const totalFactHours = participation.reduce((s, p) => s + p.center_fact_hours, 0);
  const critical = functions.filter((f) => f.criticality === "high");
  const notCovered = functions.filter((f) => f.needs_new_position);
  const byFormat = Object.keys(PARTICIPATION_FORMAT).map((k) => ({
    name: PARTICIPATION_FORMAT[k].title,
    value: participation.filter((p) => p.participation_format === k).length,
  })).filter((x) => x.value > 0);

  const toggle = (id: string) => setOpenSection((s) => (s === id ? null : id));

  return (
    <Layout>
      <div className="max-w-[1100px] mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-3 mb-2">
          <button
            onClick={() => nav("/cabinet/exec/model")}
            className="text-sm text-slate-500 hover:text-slate-900 transition-colors inline-flex items-center gap-1.5"
          >
            <Icon name="ArrowLeft" size={14} />
            Назад к модели
          </button>
          <button
            onClick={() => nav("/cabinet/exec/model/wizard")}
            className="text-sm text-violet-600 hover:text-violet-700 transition-colors inline-flex items-center gap-1.5"
          >
            <Icon name="Wand2" size={14} />
            Дозаполнить в мастере
          </button>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mt-3">Обоснование создания Центра</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6">
          {c.title} · материалы для защиты перед руководством, построены на фактических данных
          кабинета
        </p>

        <Section
          id="problem"
          open={openSection === "problem"}
          onToggle={toggle}
          icon="Target"
          title="Проблема и предпосылки создания"
        >
          <TextBlock label="Какую проблему решаем" value={c.problem_statement} />
          <TextBlock label="Почему нужен отдельный центр" value={c.rationale} />
          <TextBlock label="Миссия центра" value={c.mission} />
        </Section>

        <Section
          id="portfolio"
          open={openSection === "portfolio"}
          onToggle={toggle}
          icon="Rocket"
          title="Текущий портфель инициатив"
        >
          {!data.center.initiative_title && !functions.length ? (
            <Empty text="Инициативы пока не привязаны" icon="Rocket" />
          ) : (
            <div className="grid sm:grid-cols-3 gap-3">
              <StatCard label="Функций описано" value={functions.length} />
              <StatCard label="Критичных функций" value={critical.length} />
              <StatCard label="Штатных позиций в модели" value={roles.length} />
            </div>
          )}
        </Section>

        <Section
          id="volume"
          open={openSection === "volume"}
          onToggle={toggle}
          icon="Layers"
          title="Объём функций и задач"
        >
          {!functions.length ? (
            <Empty text="Функции ещё не описаны" icon="Layers" />
          ) : (
            <>
              <div className="grid sm:grid-cols-4 gap-3 mb-4">
                <StatCard label="Всего функций" value={functions.length} />
                <StatCard label="Критичных" value={critical.length} tone="warning" />
                <StatCard
                  label="Не покрыто сейчас"
                  value={functions.filter((f) => !f.covered_now).length}
                  tone="danger"
                />
                <StatCard label="Нужна новая позиция" value={notCovered.length} tone="warning" />
              </div>
              <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                {functions.map((f) => {
                  const cr = CRITICALITY[f.criticality] || CRITICALITY.medium;
                  const wc = WORK_CATEGORY[f.work_category] || WORK_CATEGORY.operational;
                  return (
                    <div key={f.id} className="p-3 flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${cr.cls}`}>
                        {cr.title}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${wc.cls}`}>
                        {wc.title}
                      </span>
                      <span className="text-sm text-slate-800 flex-1 min-w-[160px]">{f.title}</span>
                      <span className="text-xs text-slate-500">
                        {f.current_owner || "не покрыта"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Section>

        <Section
          id="labor"
          open={openSection === "labor"}
          onToggle={toggle}
          icon="Timer"
          title="Фактические трудозатраты"
        >
          <div className="grid sm:grid-cols-3 gap-3 mb-4">
            <StatCard label="Плановые часы Центра" value={Math.round(totalPlanHours)} />
            <StatCard label="Фактические часы Центра" value={Math.round(totalFactHours)} />
            <StatCard
              label="Исполнение плана"
              value={totalPlanHours ? `${Math.round((totalFactHours / totalPlanHours) * 100)}%` : "—"}
            />
          </div>
          {participation.length > 0 && (
            <div style={{ width: "100%", height: 200 }}>
              <ResponsiveContainer>
                <BarChart
                  data={participation.map((p) => ({
                    name: p.display_name.split(" ")[0],
                    План: p.center_plan_hours,
                    Факт: p.center_fact_hours,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="План" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Факт" fill="#10b981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>

        <Section
          id="team"
          open={openSection === "team"}
          onToggle={toggle}
          icon="UsersRound"
          title="Загрузка распределённой команды"
        >
          {!participation.length ? (
            <Empty text="Участие сотрудников ещё не описано" icon="UsersRound" />
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                {participation.map((p) => (
                  <div key={p.id} className="p-2.5 flex items-center justify-between text-xs">
                    <span className="text-slate-800">{p.display_name}</span>
                    <span className="text-slate-500">
                      {p.center_hours_per_week != null ? `${p.center_hours_per_week} ч/нед` : "—"}
                    </span>
                  </div>
                ))}
              </div>
              {byFormat.length > 0 && (
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={byFormat} dataKey="value" nameKey="name" outerRadius={75} label>
                        {byFormat.map((_, i) => (
                          <Cell key={i} fill={PIE[i % PIE.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </Section>

        <Section
          id="gap"
          open={openSection === "gap"}
          onToggle={toggle}
          icon="TrendingDown"
          title="Дефицит ресурсов и компетенций"
        >
          <div className="grid sm:grid-cols-3 gap-3 mb-4">
            <StatCard label="Требуется ставок" value={staffing.required_fte} tone="highlight" />
            <StatCard label="Доступно от команды" value={staffing.available_fte} />
            <StatCard label="Дефицит" value={staffing.deficit_fte} tone={staffing.deficit_fte > 0 ? "danger" : "default"} />
          </div>
          {gaps.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-800 mb-2">
                Разрывы компетенций у владельцев функций:
              </p>
              <div className="space-y-1.5">
                {gaps.map((g, i) => (
                  <p key={i} className="text-xs text-amber-700">
                    {g.display_name}: {g.competency_name} — уровень {g.current_level ?? "не подтверждён"}{" "}
                    при требуемом {g.required_level}
                  </p>
                ))}
              </div>
            </div>
          )}
        </Section>

        <Section
          id="structure"
          open={openSection === "structure"}
          onToggle={toggle}
          icon="Building2"
          title="Текущая и целевая организационная структура"
        >
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">Сейчас (распределённо)</p>
              {!participation.length ? (
                <Empty text="Нет данных" icon="Users" />
              ) : (
                <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                  {participation.map((p) => (
                    <div key={p.id} className="p-2 text-xs text-slate-700">
                      {p.display_name} — {p.position_title || "—"}
                      {p.org_name ? ` (${p.org_name})` : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">Целевая структура</p>
              {!roles.length ? (
                <Empty text="Штатные позиции не описаны" icon="Building2" />
              ) : (
                <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                  {roles.map((r) => (
                    <div key={r.id} className="p-2 text-xs text-slate-700">
                      {r.title} — {r.headcount} ст.{r.person_name ? ` (${r.person_name})` : " (вакансия)"}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Section>

        <Section
          id="staffing"
          open={openSection === "staffing"}
          onToggle={toggle}
          icon="Calculator"
          title="Расчёт необходимой численности"
        >
          <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 mb-3">
            <p className="text-sm text-violet-900">
              {staffing.base_total_hours} ч базовых функций + {staffing.reserve_hours} ч резерва
              ({staffing.reserve_pct}%) + {staffing.backup_hours} ч замещения (
              {staffing.backup_coverage_pct}%) = {staffing.total_hours} ч ÷{" "}
              {staffing.annual_fund_hours} ч фонда = <b>{staffing.required_fte} ставки</b>
            </p>
          </div>
          <div className="space-y-2">
            {staffing.categories.map((cat: StaffingCategory) => (
              <div key={cat.code} className="flex items-center justify-between text-xs">
                <span className="text-slate-600">{cat.title}</span>
                <span className="font-medium text-slate-800">{cat.fte} ст.</span>
              </div>
            ))}
          </div>
        </Section>

        <Section
          id="effects"
          open={openSection === "effects"}
          onToggle={toggle}
          icon="Sparkles"
          title="Ожидаемые эффекты"
        >
          <TextBlock label="Что изменится после создания Центра" value={c.expected_effects} />
          <TextBlock label="Критерии успеха" value={c.success_criteria} />
        </Section>

        <Section
          id="risks"
          open={openSection === "risks"}
          onToggle={toggle}
          icon="ShieldAlert"
          title="Риски, если Центр не будет создан"
        >
          {!risks.length ? (
            <Empty text="Существенных рисков не выявлено" icon="ShieldCheck" />
          ) : (
            <div className="space-y-2">
              {risks.map((r, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span
                    className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{ backgroundColor: RISK_COLOR[r.level] }}
                  />
                  <p className="text-sm text-slate-700">{r.text}</p>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          id="roadmap"
          open={openSection === "roadmap"}
          onToggle={toggle}
          icon="Route"
          title="Дорожная карта создания"
        >
          <TextBlock label="Этапы перехода" value={c.roadmap_text} multiline />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mt-2">
            {c.start_date && <span>Запуск: {fmtDate(c.start_date)}</span>}
            {c.review_date && <span>Пересмотр: {fmtDate(c.review_date)}</span>}
          </div>
        </Section>
      </div>
    </Layout>
  );
}

function Section({
  id,
  open,
  onToggle,
  icon,
  title,
  children,
}: {
  id: string;
  open: boolean;
  onToggle: (id: string) => void;
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white mb-3 overflow-hidden">
      <button
        onClick={() => onToggle(id)}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <Icon name={icon} size={16} className="text-violet-600 flex-shrink-0" />
        <span className="text-sm font-semibold text-slate-900 flex-1 text-left">{title}</span>
        <Icon
          name="ChevronDown"
          size={16}
          className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function TextBlock({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string | null;
  multiline?: boolean;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      {value ? (
        <p className={`text-sm text-slate-700 ${multiline ? "whitespace-pre-line" : ""}`}>
          {value}
        </p>
      ) : (
        <p className="text-sm text-amber-600">не заполнено</p>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "warning" | "danger" | "highlight";
}) {
  const cls =
    tone === "warning"
      ? "border-amber-200 bg-amber-50"
      : tone === "danger"
        ? "border-red-200 bg-red-50"
        : tone === "highlight"
          ? "border-violet-200 bg-violet-50"
          : "border-slate-200 bg-slate-50";
  const valCls =
    tone === "warning"
      ? "text-amber-700"
      : tone === "danger"
        ? "text-red-700"
        : tone === "highlight"
          ? "text-violet-700"
          : "text-slate-900";
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-semibold mt-0.5 ${valCls}`}>{value}</p>
    </div>
  );
}