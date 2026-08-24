import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading } from "@/components/exec/ExecUI";
import { Modal, SelectField } from "@/components/exec/ExecForm";
import {
  CenterForm,
  CenterFunctionForm,
  CenterGoalForm,
  CenterRoleForm,
} from "@/components/exec/CenterForms";
import FunctionRaciEditor from "@/components/exec/FunctionRaciEditor";
import { ParticipationForm } from "@/components/exec/team/ParticipationTab";
import {
  Center,
  CenterFunction,
  CenterGoal,
  CenterRefs,
  CenterRole,
  CRITICALITY,
  ModelData,
  PARTICIPATION_FORMAT,
  WORK_CATEGORY,
  centerApi,
} from "@/lib/execCenterApi";
import { PeopleRefs, peopleApi } from "@/lib/execPeopleApi";

const STEPS = [
  { id: 1, title: "Назначение и проблема", icon: "Target" },
  { id: 2, title: "Цели и эффекты", icon: "Flag" },
  { id: 3, title: "Функции", icon: "Layers" },
  { id: 4, title: "Распределённая команда", icon: "UsersRound" },
  { id: 5, title: "Функции и задачи по людям", icon: "GitBranch" },
  { id: 6, title: "Трудозатраты и доступность", icon: "Clock" },
  { id: 7, title: "Целевая структура", icon: "Building2" },
  { id: 8, title: "Штат и компетенции", icon: "GraduationCap" },
  { id: 9, title: "Расчёт численности", icon: "Calculator" },
  { id: 10, title: "Текущее и целевое", icon: "GitCompare" },
  { id: 11, title: "Риски статус-кво", icon: "ShieldAlert" },
  { id: 12, title: "Дорожная карта", icon: "Route" },
  { id: 13, title: "Предпросмотр обоснования", icon: "FileCheck" },
];

/** Мастер заполняет существующие сущности через тот же API, что и обычные
 * экраны — никаких отдельных копий данных не создаётся. */
export default function ExecCenterWizardPage() {
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [center, setCenter] = useState<Center | null>(null);
  const [model, setModel] = useState<ModelData | null>(null);
  const [refs, setRefs] = useState<CenterRefs | null>(null);
  const [peopleRefs, setPeopleRefs] = useState<PeopleRefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [centerForm, setCenterForm] = useState(false);
  const [goalForm, setGoalForm] = useState<{ open: boolean; goal?: CenterGoal; kind?: string }>({
    open: false,
  });
  const [fnForm, setFnForm] = useState<{ open: boolean; fn?: CenterFunction }>({ open: false });
  const [raciForm, setRaciForm] = useState<{ open: boolean; fn?: CenterFunction }>({ open: false });
  const [roleForm, setRoleForm] = useState<{ open: boolean; role?: CenterRole }>({ open: false });
  const [partForm, setPartForm] = useState<{ open: boolean; personId?: number }>({ open: false });

  const reload = () => {
    setLoading(true);
    setError("");
    Promise.all([centerApi.model(), centerApi.refs(), peopleApi.refs()])
      .then(([m, r, pr]) => {
        setModel(m);
        setCenter(m.center);
        setRefs(r);
        setPeopleRefs(pr);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(reload, []);

  const goals = (center?.goals || []).filter((g) => g.kind === "goal");
  const functions = center?.functions || [];
  const roles = center?.roles || [];
  const participation = model?.current_team.participation || [];
  const undocumented = model?.current_team.undocumented || [];
  const staffing = model?.staffing;
  const risks = model?.status_quo_risks || [];

  const progress = useMemo(() => Math.round((step / STEPS.length) * 100), [step]);

  if (loading && !center) {
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

  const goNext = () => setStep((s) => Math.min(STEPS.length, s + 1));
  const goPrev = () => setStep((s) => Math.max(1, s - 1));

  return (
    <Layout>
      <div className="max-w-[1100px] mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              Сформировать модель и обоснование Центра
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Шаг {step} из {STEPS.length} · {STEPS[step - 1].title}
            </p>
          </div>
          <button
            onClick={() => nav("/cabinet/exec/model")}
            className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
          >
            Выйти из мастера
          </button>
        </div>

        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-5">
          <div
            className="h-full rounded-full bg-violet-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex gap-1 overflow-x-auto mb-6 pb-1">
          {STEPS.map((s) => (
            <button
              key={s.id}
              onClick={() => setStep(s.id)}
              title={s.title}
              className={`flex-shrink-0 w-8 h-8 rounded-full text-xs font-medium flex items-center justify-center border transition-colors ${
                s.id === step
                  ? "bg-violet-600 text-white border-violet-600"
                  : s.id < step
                    ? "bg-violet-100 text-violet-700 border-violet-200"
                    : "bg-white text-slate-400 border-slate-200"
              }`}
            >
              {s.id < step ? <Icon name="Check" size={13} /> : s.id}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 min-h-[380px]">
          {!center ? (
            <div className="text-center py-10">
              <Icon name="Building2" size={30} className="text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-600 mb-4">
                Паспорт Центра ещё не создан — начнём с назначения и проблемы.
              </p>
              <button
                onClick={() => setCenterForm(true)}
                className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700 transition-colors"
              >
                Создать паспорт Центра
              </button>
            </div>
          ) : (
            <>
              {step === 1 && (
                <StepBlock
                  title="Назначение Центра и решаемые проблемы"
                  desc="Зачем создаём Центр и какую проблему он закрывает."
                  onEdit={() => setCenterForm(true)}
                  editLabel="Изменить паспорт"
                >
                  <Field label="Какую проблему решаем" value={center.problem_statement} />
                  <Field label="Почему нужен отдельный центр" value={center.rationale} />
                  <Field label="Миссия центра" value={center.mission} />
                </StepBlock>
              )}

              {step === 2 && (
                <StepBlock
                  title="Цели, задачи и ожидаемые эффекты"
                  desc="Чего центр должен достичь и как это измерить."
                  onEdit={() => setGoalForm({ open: true, kind: "goal" })}
                  editLabel="Добавить цель"
                >
                  {!goals.length ? (
                    <Empty text="Целей пока нет" icon="Target" />
                  ) : (
                    <div className="space-y-2 mb-3">
                      {goals.map((g) => (
                        <button
                          key={g.id}
                          onClick={() => setGoalForm({ open: true, goal: g })}
                          className="w-full text-left rounded-lg border border-slate-200 p-3 hover:border-violet-300 transition-colors"
                        >
                          <p className="text-sm font-medium text-slate-900">{g.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {g.metric ? `${g.metric}: ${g.baseline_value || "—"} → ${g.target_value || "—"}` : "показатель не задан"}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                  <Field label="Ожидаемые эффекты от создания" value={center.expected_effects} />
                  {!center.expected_effects && (
                    <button
                      onClick={() => setCenterForm(true)}
                      className="text-xs text-violet-600 hover:text-violet-700 transition-colors mt-2"
                    >
                      Заполнить ожидаемые эффекты
                    </button>
                  )}
                </StepBlock>
              )}

              {step === 3 && (
                <StepBlock
                  title="Функции"
                  desc="Что Центр делает — основа для расчёта численности."
                  onEdit={() => setFnForm({ open: true })}
                  editLabel="Добавить функцию"
                >
                  {!functions.length ? (
                    <Empty text="Функций пока нет" icon="Layers" />
                  ) : (
                    <div className="space-y-2">
                      {functions.map((f) => (
                        <div
                          key={f.id}
                          className="rounded-lg border border-slate-200 p-3 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900">{f.title}</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {WORK_CATEGORY[f.work_category]?.title} ·{" "}
                              {CRITICALITY[f.criticality]?.title}
                              {f.owner_name ? ` · владелец: ${f.owner_name}` : " · без владельца"}
                            </p>
                          </div>
                          <button
                            onClick={() => setFnForm({ open: true, fn: f })}
                            className="text-slate-400 hover:text-violet-600 transition-colors flex-shrink-0"
                          >
                            <Icon name="Pencil" size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </StepBlock>
              )}

              {step === 4 && (
                <StepBlock
                  title="Текущая распределённая команда"
                  desc="Кто фактически сейчас выполняет функции и задачи Центра, из каких подразделений."
                  onEdit={() => setPartForm({ open: true })}
                  editLabel="Добавить участника"
                >
                  {!participation.length ? (
                    <Empty text="Участие сотрудников пока не описано" icon="UsersRound" />
                  ) : (
                    <div className="space-y-2">
                      {participation.map((p) => (
                        <div
                          key={p.id}
                          className="rounded-lg border border-slate-200 p-3 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900">{p.display_name}</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {PARTICIPATION_FORMAT[p.participation_format]?.title} ·{" "}
                              {p.source_title}
                              {p.center_hours_per_week != null &&
                                ` · ${p.center_hours_per_week} ч/нед на Центр`}
                            </p>
                          </div>
                          <button
                            onClick={() => setPartForm({ open: true, personId: p.person_id })}
                            className="text-slate-400 hover:text-violet-600 transition-colors flex-shrink-0"
                          >
                            <Icon name="Pencil" size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {undocumented.length > 0 && (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="text-xs text-amber-800 font-medium mb-1.5">
                        Владельцы функций без описанного участия:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {undocumented.map((u) => (
                          <button
                            key={u.person_id}
                            onClick={() => setPartForm({ open: true, personId: u.person_id })}
                            className="text-xs px-2 py-1 rounded border border-amber-300 bg-white text-amber-800 hover:bg-amber-100 transition-colors"
                          >
                            {u.display_name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </StepBlock>
              )}

              {step === 5 && (
                <StepBlock
                  title="Фактическое распределение функций и задач"
                  desc="Кто отвечает за каждую функцию по матрице RACI."
                >
                  {!functions.length ? (
                    <Empty text="Сначала опишите функции на шаге 3" icon="GitBranch" />
                  ) : (
                    <div className="space-y-2">
                      {functions.map((f) => (
                        <div
                          key={f.id}
                          className="rounded-lg border border-slate-200 p-3 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900">{f.title}</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {f.owner_name ? (
                                <>Владелец: <b className="text-slate-700">{f.owner_name}</b></>
                              ) : (
                                <span className="text-red-600">владелец не назначен</span>
                              )}
                              {f.backup_name && ` · замещает: ${f.backup_name}`}
                            </p>
                          </div>
                          <button
                            onClick={() => setRaciForm({ open: true, fn: f })}
                            className="text-xs px-2 py-1 rounded-lg border border-slate-200 hover:border-violet-300 transition-colors flex-shrink-0"
                          >
                            Назначить
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mt-3">
                    Плановые и фактические часы по задачам смотрите в разделе «Планировщик» и
                    «Загрузка команды» — это те же данные, что использует расчёт численности.
                  </p>
                </StepBlock>
              )}

              {step === 6 && (
                <StepBlock
                  title="Трудозатраты и доступность сотрудников"
                  desc="Сколько времени сотрудники реально выделяют на задачи Центра."
                >
                  {!participation.length ? (
                    <Empty text="Опишите участие сотрудников на шаге 4" icon="Clock" />
                  ) : (
                    <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                      {participation.map((p) => (
                        <div key={p.id} className="p-3 flex items-center justify-between gap-2 text-sm">
                          <span className="text-slate-800">{p.display_name}</span>
                          <span className="text-xs text-slate-500">
                            план {p.center_plan_hours} ч · факт {p.center_fact_hours} ч
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mt-3">
                    Изменить долю времени на Центр можно на шаге 4 в карточке участника.
                  </p>
                </StepBlock>
              )}

              {step === 7 && (
                <StepBlock
                  title="Целевая организационная структура"
                  desc="Какие должности и штатные единицы потребуются после официального создания."
                  onEdit={() => setRoleForm({ open: true })}
                  editLabel="Добавить позицию"
                >
                  {!roles.length ? (
                    <Empty text="Штатные позиции ещё не описаны" icon="Building2" />
                  ) : (
                    <div className="space-y-2">
                      {roles.map((r) => (
                        <div
                          key={r.id}
                          className="rounded-lg border border-slate-200 p-3 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900">{r.title}</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {r.headcount} ст. · {r.person_name || "вакансия"}
                            </p>
                          </div>
                          <button
                            onClick={() => setRoleForm({ open: true, role: r })}
                            className="text-slate-400 hover:text-violet-600 transition-colors flex-shrink-0"
                          >
                            <Icon name="Pencil" size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </StepBlock>
              )}

              {step === 8 && (
                <StepBlock
                  title="Штатные позиции и необходимые компетенции"
                  desc="Требования к компетенциям задаются на карточке функции."
                >
                  {!model?.target.functions.length ? (
                    <Empty text="Сначала опишите функции" icon="GraduationCap" />
                  ) : (
                    <div className="space-y-2">
                      {model.target.functions.map((f) => (
                        <div key={f.id} className="rounded-lg border border-slate-200 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-slate-900">{f.title}</p>
                            <span className="text-xs text-slate-500">
                              {f.req_competencies
                                ? `компетенций: ${f.req_competencies}`
                                : "требования не заданы"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mt-3">
                    Добавить требуемые компетенции можно на странице Центра, карточка функции →
                    «Ответственность» → компетенции (раздел «Покрытие компетенциями» в Сводке
                    Центра показывает разрывы).
                  </p>
                </StepBlock>
              )}

              {step === 9 && (
                <StepBlock
                  title="Расчёт численности"
                  desc="Потребность в ставках = годовая трудоёмкость / полезный годовой фонд времени."
                  onEdit={() => setCenterForm(true)}
                  editLabel="Изменить параметры расчёта"
                >
                  {staffing && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <MiniStat label="Требуется ставок" value={staffing.required_fte} />
                        <MiniStat label="Доступно от команды" value={staffing.available_fte} />
                        <MiniStat label="Занято" value={staffing.staffed_fte} />
                        <MiniStat label="Дефицit" value={staffing.deficit_fte} />
                      </div>
                      <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                        {staffing.categories.map((c) => (
                          <div key={c.code} className="p-2.5 flex items-center justify-between text-xs">
                            <span className="text-slate-600">{c.title}</span>
                            <span className="text-slate-800 font-medium">
                              {c.annual_hours} ч/год · {c.fte} ст.
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </StepBlock>
              )}

              {step === 10 && (
                <StepBlock
                  title="Сравнение текущей и целевой моделей"
                  desc="Что покрыто сейчас и что потребует новой позиции."
                >
                  {!functions.length ? (
                    <Empty text="Сначала опишите функции" icon="GitCompare" />
                  ) : (
                    <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                      {model?.target.functions.map((f) => (
                        <div key={f.id} className="p-3 flex items-center justify-between gap-2 text-xs">
                          <span className="text-slate-800 text-sm font-medium">{f.title}</span>
                          <span className="flex gap-2">
                            <span className={f.covered_now ? "text-green-700" : "text-red-600"}>
                              {f.covered_now ? "покрыта сейчас" : "не покрыта"}
                            </span>
                            <span className={f.covered_in_target ? "text-green-700" : "text-amber-600"}>
                              {f.covered_in_target ? "есть в целевой модели" : "нужна позиция"}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </StepBlock>
              )}

              {step === 11 && (
                <StepBlock
                  title="Риски сохранения действующего формата"
                  desc="Рассчитываются автоматически по данным модели."
                >
                  {!risks.length ? (
                    <Empty text="Существенных рисков не выявлено" icon="ShieldCheck" />
                  ) : (
                    <div className="space-y-2">
                      {risks.map((r, i) => (
                        <div key={i} className="rounded-lg border border-slate-200 p-3 flex gap-2">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded border font-medium flex-shrink-0 h-fit ${
                              r.level === "high"
                                ? "bg-red-50 text-red-700 border-red-200"
                                : r.level === "medium"
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : "bg-slate-100 text-slate-600 border-slate-200"
                            }`}
                          >
                            {r.level === "high" ? "Высокий" : r.level === "medium" ? "Средний" : "Низкий"}
                          </span>
                          <p className="text-sm text-slate-700">{r.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </StepBlock>
              )}

              {step === 12 && (
                <StepBlock
                  title="Дорожная карта создания Центра"
                  desc="Этапы перехода от модели к штатной единице."
                  onEdit={() => setCenterForm(true)}
                  editLabel="Заполнить дорожную карту"
                >
                  <Field label="Дорожная карта" value={center.roadmap_text} multiline />
                </StepBlock>
              )}

              {step === 13 && (
                <StepBlock
                  title="Предварительный просмотр обоснования"
                  desc="Так это будет выглядеть в готовом отчёте."
                >
                  <div className="space-y-3">
                    <SummaryRow label="Цели" value={goals.length} />
                    <SummaryRow label="Функции" value={functions.length} />
                    <SummaryRow label="Участников распределённой команды" value={participation.length} />
                    <SummaryRow label="Штатных позиций в целевой модели" value={roles.length} />
                    <SummaryRow
                      label="Требуется ставок"
                      value={staffing?.required_fte ?? "—"}
                    />
                    <SummaryRow label="Рисков сохранения статус-кво" value={risks.length} />
                  </div>
                  <button
                    onClick={() => nav("/cabinet/exec/center-case")}
                    className="mt-5 w-full px-4 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
                  >
                    Открыть полное обоснование
                  </button>
                </StepBlock>
              )}
            </>
          )}
        </div>

        {center && (
          <div className="flex items-center justify-between mt-5">
            <button
              onClick={goPrev}
              disabled={step === 1}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Назад
            </button>
            {step < STEPS.length ? (
              <button
                onClick={goNext}
                className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700 transition-colors"
              >
                Далее
              </button>
            ) : (
              <button
                onClick={() => nav("/cabinet/exec/model")}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 transition-colors"
              >
                Завершить
              </button>
            )}
          </div>
        )}
      </div>

      {centerForm && refs && (
        <CenterForm
          center={center || undefined}
          refs={refs}
          onClose={() => setCenterForm(false)}
          onSaved={() => {
            setCenterForm(false);
            reload();
          }}
        />
      )}
      {goalForm.open && center && (
        <CenterGoalForm
          goal={goalForm.goal}
          centerId={center.id}
          kind={goalForm.kind}
          goals={center.goals || []}
          refs={refs || { persons: [], initiatives: [], plans: [] }}
          onClose={() => setGoalForm({ open: false })}
          onSaved={() => {
            setGoalForm({ open: false });
            reload();
          }}
        />
      )}
      {fnForm.open && center && (
        <CenterFunctionForm
          fn={fnForm.fn}
          centerId={center.id}
          goals={center.goals || []}
          refs={refs || { persons: [], initiatives: [], plans: [] }}
          onClose={() => setFnForm({ open: false })}
          onSaved={() => {
            setFnForm({ open: false });
            reload();
          }}
        />
      )}
      {raciForm.open && raciForm.fn && refs && (
        <FunctionRaciEditor
          fn={raciForm.fn}
          refs={refs}
          onClose={() => setRaciForm({ open: false })}
          onSaved={() => {
            setRaciForm({ open: false });
            reload();
          }}
        />
      )}
      {roleForm.open && center && (
        <CenterRoleForm
          role={roleForm.role}
          centerId={center.id}
          functions={center.functions || []}
          refs={refs || { persons: [], initiatives: [], plans: [] }}
          onClose={() => setRoleForm({ open: false })}
          onSaved={() => {
            setRoleForm({ open: false });
            reload();
          }}
        />
      )}
      {partForm.open && center && (
        <ParticipationPicker
          centerId={center.id}
          personId={partForm.personId}
          peopleRefs={peopleRefs}
          participation={participation}
          onClose={() => setPartForm({ open: false })}
          onSaved={() => {
            setPartForm({ open: false });
            reload();
          }}
        />
      )}
    </Layout>
  );
}

function ParticipationPicker({
  centerId,
  personId,
  peopleRefs,
  participation,
  onClose,
  onSaved,
}: {
  centerId: number;
  personId?: number;
  peopleRefs: PeopleRefs | null;
  participation: ModelData["current_team"]["participation"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<number | undefined>(personId);

  if (!selected) {
    return (
      <Modal title="Кого добавить" onClose={onClose} onSave={onClose} canSave={false}>
        <SelectField
          label="Сотрудник"
          value=""
          onChange={(v) => setSelected(Number(v))}
          options={(peopleRefs?.persons || []).map((p) => ({
            value: String(p.id),
            label: p.display_name,
          }))}
        />
      </Modal>
    );
  }

  const existing = participation.find((p) => p.person_id === selected) || null;

  return (
    <ParticipationForm
      personId={selected}
      centerId={centerId}
      participation={existing}
      refs={{ persons: [], initiatives: [], plans: [] }}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function StepBlock({
  title,
  desc,
  onEdit,
  editLabel,
  children,
}: {
  title: string;
  desc: string;
  onEdit?: () => void;
  editLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
        </div>
        {onEdit && (
          <button
            onClick={onEdit}
            className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs hover:bg-violet-700 transition-colors flex-shrink-0 inline-flex items-center gap-1.5"
          >
            <Icon name="Plus" size={12} />
            {editLabel}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string | null;
  multiline?: boolean;
}) {
  return (
    <div className="mb-3">
      <p className="text-xs text-slate-400">{label}</p>
      {value ? (
        <p
          className={`text-sm text-slate-800 mt-0.5 ${multiline ? "whitespace-pre-line" : ""}`}
        >
          {value}
        </p>
      ) : (
        <p className="text-sm text-amber-600 mt-0.5">не заполнено</p>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="text-base font-semibold text-slate-800 mt-0.5">{value}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}