import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { AuditData, AuditEntry, execApi } from "@/lib/execCabinetApi";
import { Card, Empty, ErrorBox, Loading, Metric } from "@/components/exec/ExecUI";
import { useExecSettings } from "@/lib/execSettings";

const ENTITY_LABELS: Record<string, { title: string; icon: string; path?: string }> = {
  initiative: { title: "Инициатива", icon: "Rocket", path: "/admin/exec/initiatives" },
  stakeholder: { title: "Стейкхолдер", icon: "Users", path: "/admin/exec/stakeholders" },
  decision: { title: "Решение", icon: "GitPullRequest", path: "/admin/exec/decisions" },
  role_assignment: { title: "Назначение роли", icon: "Shield" },
  person: { title: "Участник", icon: "Contact", path: "/admin/exec/persons" },
};

const ACTION_LABELS: Record<string, { title: string; cls: string }> = {
  create: { title: "Создано", cls: "bg-green-500/15 text-green-300 border-green-500/30" },
  update: { title: "Изменено", cls: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  set_verification: {
    title: "Смена статуса",
    cls: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  },
};

const FIELD_LABELS: Record<string, string> = {
  title: "Наименование",
  summary: "Краткое описание",
  problem: "Проблема",
  goal: "Цель",
  expected_result: "Ожидаемый результат",
  status: "Статус",
  stage: "Этап",
  priority: "Приоритет",
  scale: "Масштаб",
  realization_form: "Форма реализации",
  plan_start: "Плановое начало",
  plan_end: "Плановое окончание",
  solution_title: "Наименование решения",
  solution_type: "Тип решения",
  effect_description: "Описание эффекта",
  effect_metric: "Показатель эффекта",
  effect_baseline: "Базовое значение",
  effect_target: "Целевое значение",
  effect_actual: "Фактическое значение",
  budget_need: "Бюджетная потребность",
  budget_source: "Источник финансирования",
  escalation_level: "Уровень эскалации",
  owner_person_id: "Владелец",
  manager_person_id: "Руководитель",
  curator_person_id: "Куратор",
  effect_owner_person_id: "Владелец эффекта",
  question: "Вопрос",
  basis: "Основание",
  due_at: "Срок решения",
  final_decision: "Принятое решение",
  execution_status: "Статус исполнения",
  next_action: "Ближайшее действие",
  next_action_due: "Срок действия",
  engagement_status: "Статус взаимодействия",
  participation_state: "Состояние участия",
  engagement_goal: "Цель взаимодействия",
  verification_status: "Статус достоверности",
  display_name: "Обозначение",
  position_title: "Должность",
  org_name: "Организация",
};

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const now = Date.now();
  const diffMin = Math.floor((now - d.getTime()) / 60000);
  if (diffMin < 1) return "только что";
  if (diffMin < 60) return `${diffMin} мин назад`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)} ч назад`;
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function changedFields(entry: AuditEntry): string[] {
  if (!entry.after_json) return [];
  return Object.keys(entry.after_json)
    .filter((k) => k !== "id" && FIELD_LABELS[k])
    .map((k) => FIELD_LABELS[k]);
}

export default function ExecHistoryPage() {
  const [settings, setSettings] = useExecSettings();
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [entity, setEntity] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = () => {
    if (!settings.showHistory) return;
    setLoading(true);
    setError("");
    execApi
      .auditLog(entity)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [entity, settings.showHistory]);

  if (!settings.showHistory)
    return (
      <AdminShell>
        <div className="max-w-[900px] space-y-5">
          <header>
            <h1 className="text-xl font-semibold text-white">Журнал изменений</h1>
            <p className="text-sm text-gray-500 mt-1">
              Кто и что менял в кабинете руководителя
            </p>
          </header>

          <Card title="Журнал отключён" icon="EyeOff">
            <div className="py-8 text-center">
              <Icon name="History" size={34} className="text-gray-700 mx-auto mb-3" />
              <p className="text-sm text-white font-medium">Журнал сейчас не отображается</p>
              <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto leading-relaxed">
                Изменения всё равно записываются в фоне. Включите журнал, когда понадобится
                посмотреть историю — и выключите обратно, чтобы он не отвлекал.
              </p>
              <button
                onClick={() => setSettings({ showHistory: true })}
                className="mt-5 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors inline-flex items-center gap-2"
              >
                <Icon name="Eye" size={15} />
                Включить журнал
              </button>
            </div>
          </Card>
        </div>
      </AdminShell>
    );

  return (
    <AdminShell>
      <div className="max-w-[1100px] space-y-5">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-white">Журнал изменений</h1>
            <p className="text-sm text-gray-500 mt-1">Кто и что менял в кабинете руководителя</p>
          </div>
          <button
            onClick={() => setSettings({ showHistory: false })}
            className="px-3.5 py-2 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-600 hover:text-white text-sm transition-colors flex items-center gap-2"
          >
            <Icon name="EyeOff" size={15} />
            Скрыть журнал
          </button>
        </header>

        {data && (
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Всего записей" value={data.metrics.total} icon="History" />
            <Metric label="Сегодня" value={data.metrics.today} icon="CalendarDays" />
            <Metric label="Авторов изменений" value={data.metrics.actors} icon="Users" />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setEntity("")}
            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
              !entity
                ? "border-orange-500/40 bg-orange-500/10 text-orange-300"
                : "border-gray-800 text-gray-500 hover:text-gray-300"
            }`}
          >
            Все разделы
          </button>
          {Object.entries(ENTITY_LABELS).map(([code, meta]) => {
            const cnt = data?.by_entity.find((b) => b.entity_type === code)?.cnt;
            return (
              <button
                key={code}
                onClick={() => setEntity(code)}
                className={`px-3 py-1.5 rounded-lg text-xs border transition-colors flex items-center gap-1.5 ${
                  entity === code
                    ? "border-orange-500/40 bg-orange-500/10 text-orange-300"
                    : "border-gray-800 text-gray-500 hover:text-gray-300"
                }`}
              >
                <Icon name={meta.icon} size={12} />
                {meta.title}
                {cnt ? <span className="text-gray-600">{cnt}</span> : null}
              </button>
            );
          })}
        </div>

        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : !data || data.items.length === 0 ? (
          <Card title="История" icon="History">
            <Empty
              text={
                entity
                  ? "В этом разделе изменений пока не было"
                  : "Изменений пока не было — журнал заполнится по мере работы"
              }
              icon="History"
            />
          </Card>
        ) : (
          <Card title="История изменений" subtitle={`${data.items.length} записей`} icon="History">
            <div className="space-y-2">
              {data.items.map((e) => {
                const meta = ENTITY_LABELS[e.entity_type] || {
                  title: e.entity_type,
                  icon: "FileText",
                };
                const act = ACTION_LABELS[e.action] || {
                  title: e.action,
                  cls: "bg-gray-500/15 text-gray-400 border-gray-600/30",
                };
                const fields = changedFields(e);
                const isOpen = expanded === e.id;
                const newStatus = e.after_json?.verification_status as string | undefined;

                return (
                  <div
                    key={e.id}
                    className="rounded-lg border border-gray-800 bg-gray-900/40 overflow-hidden"
                  >
                    <button
                      onClick={() => setExpanded(isOpen ? null : e.id)}
                      className="w-full text-left p-3.5 hover:bg-gray-900/60 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">
                          <Icon name={meta.icon} size={15} className="text-gray-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${act.cls}`}
                            >
                              {act.title}
                            </span>
                            <span className="text-xs text-gray-500">{meta.title}</span>
                          </div>
                          <p className="text-sm text-white mt-1 leading-snug">
                            {e.subject_title || `Запись №${e.entity_id}`}
                          </p>
                          {e.subject_detail && e.subject_detail !== e.subject_title && (
                            <p className="text-xs text-gray-500 mt-0.5 truncate">
                              {e.subject_detail}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-600 flex-wrap">
                            <span>
                              <Icon name="User" size={11} className="inline mr-1" />
                              {e.actor || "система"}
                            </span>
                            <span>
                              <Icon name="Clock" size={11} className="inline mr-1" />
                              {fmtWhen(e.created_at)}
                            </span>
                            {fields.length > 0 && (
                              <span className="text-gray-600">
                                {fields.length} {fields.length === 1 ? "поле" : "полей"}
                              </span>
                            )}
                          </div>
                        </div>
                        <Icon
                          name={isOpen ? "ChevronUp" : "ChevronDown"}
                          size={15}
                          className="text-gray-700 flex-shrink-0 mt-1"
                        />
                      </div>
                    </button>

                    {isOpen && (
                      <div className="px-3.5 pb-3.5 pt-3 border-t border-gray-800 space-y-3">
                        {newStatus && (
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Новый статус достоверности</p>
                            <p className="text-sm text-gray-200">{newStatus}</p>
                          </div>
                        )}
                        {fields.length > 0 && (
                          <div>
                            <p className="text-xs text-gray-500 mb-1.5">Затронутые поля</p>
                            <div className="flex flex-wrap gap-1.5">
                              {fields.map((f) => (
                                <span
                                  key={f}
                                  className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-300"
                                >
                                  {f}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {e.reason && (
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Основание</p>
                            <p className="text-sm text-gray-300">{e.reason}</p>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <p className="text-xs text-gray-600">
                            {new Date(e.created_at).toLocaleString("ru-RU")}
                          </p>
                          {meta.path && (
                            <Link
                              to={
                                e.entity_type === "initiative"
                                  ? `/admin/exec/initiatives/${e.entity_id}`
                                  : meta.path
                              }
                              className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1"
                            >
                              Открыть раздел
                              <Icon name="ArrowRight" size={12} />
                            </Link>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </AdminShell>
  );
}
