import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, Empty, fmtDate } from "@/components/exec/ExecUI";
import ReminderQuickButton from "@/components/exec/ReminderQuickButton";
import {
  weeklyCycleApi, MyDayItem, Reminder, WeeklyPlan, EntityType,
} from "@/lib/execWeeklyCycleApi";

const ENTITY_LABEL: Record<EntityType, string> = {
  action: "Поручение", task: "Задача", project: "Проект", initiative: "Инициатива",
  milestone: "Контрольная точка", decision: "Решение", risk: "Риск", issue: "Проблема",
  requirement: "Потребность", document: "Документ",
};

function itemLabel(it: MyDayItem): string {
  return it.title || it.question || it.description || "Без названия";
}

function itemDue(it: MyDayItem): string | null {
  return it.due_at || it.plan_date || it.need_by_date || it.plan_end || null;
}

/** Компактная строка объекта с быстрыми действиями «Открыть» / «В план недели». */
function ItemRow({
  item, entityType, reasonLabel, onAddToWeek, danger,
}: {
  item: MyDayItem; entityType: EntityType; reasonLabel: string;
  onAddToWeek?: (item: MyDayItem, entityType: EntityType) => void; danger?: boolean;
}) {
  const navigate = useNavigate();
  const due = itemDue(item);
  const openTarget = () => {
    if (item.project_id) navigate(`/cabinet/exec/portfolio/projects/${item.project_id}`);
    else if (item.initiative_id) navigate(`/cabinet/exec/initiatives/${item.initiative_id}`);
    else if (entityType === "decision") navigate("/cabinet/exec/decisions");
    else if (entityType === "risk" || entityType === "issue") navigate("/cabinet/exec/control");
    else navigate("/cabinet/exec/portfolio");
  };
  return (
    <div className={`rounded-lg border p-2.5 ${danger ? "border-red-200 bg-red-50/50" : "border-slate-200 bg-white"}`}>
      <p className="text-sm text-slate-900 leading-snug">{itemLabel(item)}</p>
      <p className="text-xs text-slate-500 mt-0.5">
        {reasonLabel}
        {due && ` · срок ${fmtDate(due)}`}
        {item.days_overdue ? ` · просрочка ${item.days_overdue} дн.` : ""}
        {item.priority && ` · приоритет ${item.priority}`}
        {(item.project_title || item.initiative_title) && ` · ${item.project_title || item.initiative_title}`}
      </p>
      <div className="flex flex-wrap gap-2 mt-1.5">
        <button
          onClick={openTarget}
          className="text-xs px-2 py-1 rounded-md border border-slate-200 bg-white hover:border-violet-300 hover:text-violet-700 transition-colors flex items-center gap-1"
        >
          <Icon name="ArrowRight" size={11} /> Открыть
        </button>
        {onAddToWeek && (
          <button
            onClick={() => onAddToWeek(item, entityType)}
            className="text-xs px-2 py-1 rounded-md border border-slate-200 bg-white hover:border-violet-300 hover:text-violet-700 transition-colors flex items-center gap-1"
          >
            <Icon name="CalendarPlus" size={11} /> В план недели
          </button>
        )}
        <ReminderQuickButton entityType={entityType} entityId={item.id} title={itemLabel(item)} variant="button" />
      </div>
    </div>
  );
}

/** Блок «Три главных приоритета дня» — выбор пользователя, хранится только
 * в текущей сессии браузера (не персональные/чувствительные данные, поэтому
 * localStorage допустим и не требует backend). */
export function TopPrioritiesPanel() {
  const [priorities, setPriorities] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("exec_top_priorities_" + new Date().toISOString().slice(0, 10));
      return raw ? JSON.parse(raw) : ["", "", ""];
    } catch {
      return ["", "", ""];
    }
  });

  const update = (i: number, value: string) => {
    const next = [...priorities];
    next[i] = value;
    setPriorities(next);
    try {
      localStorage.setItem("exec_top_priorities_" + new Date().toISOString().slice(0, 10), JSON.stringify(next));
    } catch {
      // хранилище недоступно — не критично
    }
  };

  return (
    <Card title="Три главных приоритета дня" icon="Target">
      <div className="space-y-2">
        {priorities.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-xs font-medium flex items-center justify-center flex-shrink-0">
              {i + 1}
            </span>
            <Input
              value={p}
              onChange={(e) => update(i, e.target.value)}
              placeholder={`Приоритет ${i + 1}`}
              className="text-sm h-8"
            />
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Блок напоминаний: наступившие и на 7 дней вперёд, с быстрыми действиями. */
export function RemindersPanel({ reminders, onChanged }: { reminders: Reminder[]; onChanged: () => void }) {
  const due = reminders.filter((r) => r.is_due);
  const upcoming = reminders.filter((r) => !r.is_due);

  const complete = async (id: number) => {
    await weeklyCycleApi.updateReminderStatus({ id, status: "done" });
    onChanged();
  };
  const snooze = async (id: number, days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    await weeklyCycleApi.updateReminderStatus({ id, status: "snoozed", snooze_until: d.toISOString() });
    onChanged();
  };

  return (
    <Card title="Напоминания" subtitle={`${due.length} наступило · ${upcoming.length} предстоит`} icon="Bell">
      {reminders.length === 0 ? (
        <Empty text="Напоминаний нет" icon="BellOff" />
      ) : (
        <div className="space-y-2">
          {[...due, ...upcoming].slice(0, 8).map((r) => (
            <div key={r.id} className={`rounded-lg border p-2.5 ${r.is_due ? "border-amber-200 bg-amber-50/50" : "border-slate-200 bg-white"}`}>
              <p className="text-sm text-slate-900 leading-snug">{r.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {fmtDate(r.remind_at)}
                {r.entity_type && ` · ${ENTITY_LABEL[r.entity_type]}`}
                {r.repeat_rule !== "none" && ` · повтор: ${r.repeat_rule === "daily" ? "ежедневно" : r.repeat_rule === "weekly" ? "еженедельно" : "ежемесячно"}`}
              </p>
              <div className="flex flex-wrap gap-2 mt-1.5">
                <button onClick={() => complete(r.id)} className="text-xs px-2 py-1 rounded-md border border-slate-200 bg-white hover:border-emerald-300 hover:text-emerald-700 transition-colors">
                  Выполнено
                </button>
                <button onClick={() => snooze(r.id, 1)} className="text-xs px-2 py-1 rounded-md border border-slate-200 bg-white hover:border-violet-300 hover:text-violet-700 transition-colors">
                  Отложить на день
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Блок плана недели: список пунктов, отметка выполнения, перенос,
 * закрытие недели с публикацией неизменяемого итогового снимка. */
export function WeeklyPlanPanel({ plan, onChanged }: { plan: WeeklyPlan | null; onChanged: () => void }) {
  const [closing, setClosing] = useState(false);
  const [summaryText, setSummaryText] = useState("");
  const [closedMsg, setClosedMsg] = useState("");

  if (!plan) return null;

  const toggleDone = async (itemId: number, isDone: boolean) => {
    await weeklyCycleApi.setWeeklyItemDone(itemId, !isDone);
    onChanged();
  };

  const carryOver = async (itemId: number) => {
    const reasonPrompt = window.prompt("Причина переноса (обязательно при повторном переносе):") || undefined;
    const nextPlan = await weeklyCycleApi.weeklyPlanCurrent(1);
    await weeklyCycleApi.carryOverItem({ item_id: itemId, target_weekly_plan_id: nextPlan.id, reason: reasonPrompt });
    onChanged();
  };

  const close = async () => {
    const r = await weeklyCycleApi.closeWeeklyPlan({ id: plan.id, summary_text: summaryText });
    setClosedMsg(`Итог недели опубликован: выполнено ${r.stats.done} из ${r.stats.planned}, перенесено ${r.stats.carried_over}. Снимок №${r.id} версия ${r.version_number}.`);
    setClosing(false);
    onChanged();
  };

  return (
    <Card
      title={`План недели ${fmtDate(plan.week_start)} — ${fmtDate(plan.week_end)}`}
      subtitle={plan.status === "closed" ? "Закрыт" : `${plan.items.length} пунктов · черновик`}
      icon="CalendarRange"
    >
      {closedMsg && (
        <div className="mb-3 text-xs bg-emerald-50 text-emerald-800 rounded-lg px-3 py-2">{closedMsg}</div>
      )}
      {plan.items.length === 0 ? (
        <Empty text="В план недели пока ничего не добавлено" icon="CalendarPlus" />
      ) : (
        <div className="space-y-2">
          {plan.items.map((it) => (
            <div key={it.id} className={`rounded-lg border p-2.5 ${it.is_done ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white"}`}>
              <div className="flex items-start gap-2">
                <button
                  onClick={() => toggleDone(it.id, it.is_done)}
                  disabled={plan.status === "closed"}
                  className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    it.is_done ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300"
                  }`}
                >
                  {it.is_done && <Icon name="Check" size={12} />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm leading-snug ${it.is_done ? "text-slate-400 line-through" : "text-slate-900"}`}>
                    {it.entity_title || `${ENTITY_LABEL[it.entity_type]} #${it.entity_id}`}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {ENTITY_LABEL[it.entity_type]}
                    {it.week_priority !== "normal" && ` · приоритет ${it.week_priority}`}
                    {it.carried_over_from_item_id && ` · перенесено (${it.carry_over_count}×)`}
                  </p>
                  {it.expected_result && <p className="text-xs text-slate-400 mt-0.5">Ожидается: {it.expected_result}</p>}
                </div>
                {!it.is_done && plan.status !== "closed" && (
                  <button
                    onClick={() => carryOver(it.id)}
                    className="text-xs px-2 py-1 rounded-md border border-slate-200 hover:border-violet-300 hover:text-violet-700 flex-shrink-0"
                  >
                    Перенести
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {plan.status !== "closed" && plan.items.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          {!closing ? (
            <Button size="sm" variant="outline" onClick={() => setClosing(true)}>
              <Icon name="FlagOff" fallback="Flag" size={13} className="mr-1.5" /> Закрыть неделю
            </Button>
          ) : (
            <div className="space-y-2">
              <Input
                value={summaryText}
                onChange={(e) => setSummaryText(e.target.value)}
                placeholder="Краткий итог недели (необязательно)"
                className="text-sm h-8"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={close}>Опубликовать итог</Button>
                <Button size="sm" variant="outline" onClick={() => setClosing(false)}>Отмена</Button>
              </div>
              <p className="text-[11px] text-slate-400">
                Публикация фиксирует неизменяемый снимок итогов. Статусы задач и поручений не меняются.
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/** Универсальная кнопка «В план недели» для списков объектов на «Моём дне». */
export function useAddToWeek(activePlanId: number | null, onDone: () => void) {
  const [entitySelect, setEntitySelect] = useState<{ item: MyDayItem; entityType: EntityType } | null>(null);
  const [priority, setPriority] = useState("normal");
  const [busy, setBusy] = useState(false);

  const open = (item: MyDayItem, entityType: EntityType) => setEntitySelect({ item, entityType });

  const confirm = async () => {
    if (!entitySelect || !activePlanId) return;
    setBusy(true);
    try {
      await weeklyCycleApi.addWeeklyItem({
        weekly_plan_id: activePlanId, entity_type: entitySelect.entityType,
        entity_id: entitySelect.item.id, week_priority: priority,
      });
      setEntitySelect(null);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const dialog = entitySelect ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setEntitySelect(null)}>
      <div className="bg-white rounded-xl p-4 max-w-sm w-full space-y-3" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-medium text-slate-900">Добавить в план недели</p>
        <p className="text-xs text-slate-500">{itemLabel(entitySelect.item)}</p>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="text-sm h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Низкий приоритет</SelectItem>
            <SelectItem value="normal">Обычный приоритет</SelectItem>
            <SelectItem value="high">Высокий приоритет</SelectItem>
            <SelectItem value="urgent">Срочно</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button size="sm" onClick={confirm} disabled={busy}>Добавить</Button>
          <Button size="sm" variant="outline" onClick={() => setEntitySelect(null)}>Отмена</Button>
        </div>
      </div>
    </div>
  ) : null;

  return { open, dialog };
}

export { ItemRow };