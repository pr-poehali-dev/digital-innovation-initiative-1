import { useState, useEffect, useCallback } from "react";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { getAdminToken } from "@/lib/admin-api";

const AUTO_URL = "https://functions.poehali.dev/c49fd954-58a9-4b48-a234-97d43698ca63";

// ── Types ─────────────────────────────────────────────────────────

type Condition = { field: string; op: string; value: string };
type RuleAction = { type: string; value: string };

type AutomationRule = {
  id: number;
  name: string;
  description: string;
  enabled: boolean;
  trigger_type: string;
  conditions: Condition[];
  rule_actions: RuleAction[];
  order_index: number;
  run_count: number;
  last_run_at: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
  log?: LogEntry[];
};

type LogEntry = {
  id: number;
  ticket_id: number;
  ticket_no: string;
  triggered_by: string;
  actions_taken: string[];
  created_at: string;
};

// ── Config ────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
  new_ticket:          "Новый тикет",
  status_changed:      "Смена статуса",
  priority_changed:    "Смена приоритета",
  stale:               "Тикет завис",
  unassigned_timeout:  "Без исполнителя",
};

const TRIGGER_TYPES = Object.keys(TRIGGER_LABELS);

const CONDITION_FIELDS = [
  { value: "priority",        label: "Приоритет" },
  { value: "status",          label: "Статус" },
  { value: "source",          label: "Источник" },
  { value: "module_slug",     label: "Модуль" },
  { value: "assignee_email",  label: "Исполнитель" },
  { value: "requester_email", label: "Email заявителя" },
  { value: "subject",         label: "Тема" },
];

const CONDITION_OPS = [
  { value: "eq",           label: "равно" },
  { value: "ne",           label: "не равно" },
  { value: "contains",     label: "содержит" },
  { value: "not_contains", label: "не содержит" },
  { value: "in",           label: "входит в список" },
  { value: "is_empty",     label: "пусто" },
  { value: "is_not_empty", label: "не пусто" },
];

const ACTION_TYPES = [
  { value: "assign",           label: "Назначить исполнителя" },
  { value: "set_status",       label: "Установить статус" },
  { value: "set_priority",     label: "Установить приоритет" },
  { value: "add_tag",          label: "Добавить тег" },
  { value: "add_internal_note", label: "Внутренняя заметка" },
  { value: "add_system_note",  label: "Системное событие" },
];

const TRIGGER_COLOR: Record<string, string> = {
  new_ticket:         "bg-blue-900/40 text-blue-400 border-blue-800",
  status_changed:     "bg-violet-900/40 text-violet-400 border-violet-800",
  priority_changed:   "bg-orange-900/30 text-orange-400 border-orange-800",
  stale:              "bg-amber-900/30 text-amber-400 border-amber-800",
  unassigned_timeout: "bg-red-900/30 text-red-400 border-red-800",
};

// ── API ──────────────────────────────────────────────────────────

function hdr() {
  return { "Content-Type": "application/json", "X-Admin-Token": getAdminToken() };
}

async function apiList(): Promise<AutomationRule[]> {
  const r = await fetch(`${AUTO_URL}/?action=list`, { headers: hdr() });
  const d = await r.json();
  return d.rules ?? [];
}

async function apiGet(id: number): Promise<AutomationRule | null> {
  const r = await fetch(`${AUTO_URL}/?action=get&id=${id}`, { headers: hdr() });
  const d = await r.json();
  return d.rule ?? null;
}

async function apiCreate(body: object) {
  const r = await fetch(`${AUTO_URL}/?action=create`, {
    method: "POST", headers: hdr(), body: JSON.stringify(body),
  });
  return r.json();
}

async function apiUpdate(body: object) {
  const r = await fetch(`${AUTO_URL}/?action=update`, {
    method: "POST", headers: hdr(), body: JSON.stringify(body),
  });
  return r.json();
}

async function apiToggle(id: number, enabled: boolean) {
  const r = await fetch(`${AUTO_URL}/?action=toggle`, {
    method: "POST", headers: hdr(), body: JSON.stringify({ id, enabled }),
  });
  return r.json();
}

async function apiDelete(id: number) {
  const r = await fetch(`${AUTO_URL}/?action=delete`, {
    method: "POST", headers: hdr(), body: JSON.stringify({ id }),
  });
  return r.json();
}

async function apiRun(ruleId: number) {
  const r = await fetch(`${AUTO_URL}/?action=run`, {
    method: "POST", headers: hdr(), body: JSON.stringify({ rule_id: ruleId }),
  });
  return r.json();
}

// ── Helpers ──────────────────────────────────────────────────────

function fmtDate(iso?: string | null) {
  if (!iso || iso.startsWith("0001")) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

// ── Rule Editor ──────────────────────────────────────────────────

type EditorProps = {
  initial?: AutomationRule | null;
  onSave: (rule: AutomationRule) => void;
  onCancel: () => void;
};

function RuleEditor({ initial, onSave, onCancel }: EditorProps) {
  const isNew = !initial;
  const [name, setName]               = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [triggerType, setTriggerType] = useState(initial?.trigger_type ?? "new_ticket");
  const [enabled, setEnabled]         = useState(initial?.enabled ?? true);
  const [conditions, setConditions]   = useState<Condition[]>(initial?.conditions ?? []);
  const [actions, setActions]         = useState<RuleAction[]>(initial?.rule_actions ?? []);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");

  function addCondition() {
    setConditions(cs => [...cs, { field: "priority", op: "eq", value: "" }]);
  }
  function removeCondition(i: number) {
    setConditions(cs => cs.filter((_, idx) => idx !== i));
  }
  function updateCondition(i: number, key: keyof Condition, val: string) {
    setConditions(cs => cs.map((c, idx) => idx === i ? { ...c, [key]: val } : c));
  }

  function addAction() {
    setActions(as => [...as, { type: "assign", value: "" }]);
  }
  function removeAction(i: number) {
    setActions(as => as.filter((_, idx) => idx !== i));
  }
  function updateAction(i: number, key: keyof RuleAction, val: string) {
    setActions(as => as.map((a, idx) => idx === i ? { ...a, [key]: val } : a));
  }

  async function handleSave() {
    if (!name.trim()) { setError("Укажите название правила"); return; }
    if (actions.length === 0) { setError("Добавьте хотя бы одно действие"); return; }
    setError("");
    setSaving(true);

    const payload = {
      ...(initial ? { id: initial.id } : {}),
      name: name.trim(),
      description: description.trim(),
      trigger_type: triggerType,
      enabled,
      conditions,
      rule_actions: actions,
    };

    const res = isNew ? await apiCreate(payload) : await apiUpdate(payload);
    setSaving(false);

    if (res.ok) {
      const updated = await apiGet(isNew ? res.id : initial!.id);
      if (updated) onSave(updated);
    } else {
      setError(res.error || "Ошибка сохранения");
    }
  }

  const inputCls = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600 transition-colors";
  const selectCls = `${inputCls} cursor-pointer`;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-100">
          {isNew ? "Новое правило" : `Редактировать: ${initial!.name}`}
        </h3>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-gray-500">Активно</span>
          <button
            onClick={() => setEnabled(e => !e)}
            className={`relative w-8 h-4 rounded-full transition-colors ${enabled ? "bg-violet-600" : "bg-gray-700"}`}
          >
            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${enabled ? "left-4.5 translate-x-0.5" : "left-0.5"}`} />
          </button>
        </label>
      </div>

      {/* Name + description */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] text-gray-500 mb-1">Название *</label>
          <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="Название правила" />
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-1">Описание</label>
          <input className={inputCls} value={description} onChange={e => setDescription(e.target.value)} placeholder="Необязательно" />
        </div>
      </div>

      {/* Trigger */}
      <div>
        <label className="block text-[10px] text-gray-500 mb-1">Триггер</label>
        <select className={selectCls} value={triggerType} onChange={e => setTriggerType(e.target.value)}>
          {TRIGGER_TYPES.map(t => (
            <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>
          ))}
        </select>
      </div>

      {/* Conditions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">
            Условия {conditions.length > 0 && <span className="ml-1 text-gray-600">(все должны совпасть)</span>}
          </label>
          <button onClick={addCondition} className="text-[10px] text-violet-400 hover:text-violet-300 font-medium">+ Добавить</button>
        </div>
        {conditions.length === 0 && (
          <p className="text-[10px] text-gray-600 italic">Без условий — правило применяется ко всем подходящим тикетам</p>
        )}
        <div className="space-y-2">
          {conditions.map((c, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-800/60 border border-gray-700/60 rounded-lg px-3 py-2">
              <select value={c.field} onChange={e => updateCondition(i, "field", e.target.value)}
                className="bg-transparent text-xs text-gray-300 focus:outline-none">
                {CONDITION_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <select value={c.op} onChange={e => updateCondition(i, "op", e.target.value)}
                className="bg-transparent text-xs text-gray-400 focus:outline-none">
                {CONDITION_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {!["is_empty", "is_not_empty"].includes(c.op) && (
                <input value={c.value} onChange={e => updateCondition(i, "value", e.target.value)}
                  placeholder="значение"
                  className="flex-1 bg-transparent text-xs text-gray-200 placeholder-gray-700 focus:outline-none min-w-0" />
              )}
              <button onClick={() => removeCondition(i)} className="text-gray-700 hover:text-red-500 transition-colors">
                <Icon name="X" size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">Действия *</label>
          <button onClick={addAction} className="text-[10px] text-violet-400 hover:text-violet-300 font-medium">+ Добавить</button>
        </div>
        {actions.length === 0 && (
          <p className="text-[10px] text-red-500 italic">Добавьте хотя бы одно действие</p>
        )}
        <div className="space-y-2">
          {actions.map((a, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-800/60 border border-gray-700/60 rounded-lg px-3 py-2">
              <select value={a.type} onChange={e => updateAction(i, "type", e.target.value)}
                className="bg-transparent text-xs text-gray-300 focus:outline-none shrink-0">
                {ACTION_TYPES.map(at => <option key={at.value} value={at.value}>{at.label}</option>)}
              </select>
              <input value={a.value} onChange={e => updateAction(i, "value", e.target.value)}
                placeholder="значение"
                className="flex-1 bg-transparent text-xs text-gray-200 placeholder-gray-700 focus:outline-none min-w-0" />
              <button onClick={() => removeAction(i)} className="text-gray-700 hover:text-red-500 transition-colors">
                <Icon name="X" size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors">
          {saving ? "Сохраняю..." : isNew ? "Создать правило" : "Сохранить"}
        </button>
        <button onClick={onCancel}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs rounded-lg transition-colors">
          Отмена
        </button>
      </div>
    </div>
  );
}

// ── Rule Card ────────────────────────────────────────────────────

function RuleCard({
  rule, selected, onSelect, onToggle, onDelete, onRun,
}: {
  rule: AutomationRule;
  selected: boolean;
  onSelect: () => void;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
  onRun: () => void;
}) {
  const [running, setRunning] = useState(false);

  async function handleRun(e: React.MouseEvent) {
    e.stopPropagation();
    setRunning(true);
    await onRun();
    setRunning(false);
  }

  return (
    <div
      onClick={onSelect}
      className={`border rounded-xl p-4 cursor-pointer transition-colors ${
        selected
          ? "bg-violet-900/20 border-violet-700"
          : "bg-gray-900 border-gray-800 hover:border-gray-700"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
              TRIGGER_COLOR[rule.trigger_type] ?? "bg-gray-800 text-gray-400 border-gray-700"
            }`}>
              {TRIGGER_LABELS[rule.trigger_type] ?? rule.trigger_type}
            </span>
            {!rule.enabled && (
              <span className="text-[10px] text-gray-600 bg-gray-800 px-2 py-0.5 rounded-full border border-gray-700">
                выключено
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-gray-100 truncate">{rule.name}</p>
          {rule.description && (
            <p className="text-xs text-gray-500 truncate mt-0.5">{rule.description}</p>
          )}
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button
            onClick={handleRun}
            disabled={running}
            title="Запустить вручную"
            className="p-1.5 rounded-lg text-gray-600 hover:text-emerald-400 hover:bg-emerald-900/20 transition-colors disabled:opacity-40"
          >
            <Icon name={running ? "Loader" : "Play"} size={13} />
          </button>
          <button
            onClick={() => onToggle(!rule.enabled)}
            title={rule.enabled ? "Выключить" : "Включить"}
            className={`p-1.5 rounded-lg transition-colors ${
              rule.enabled
                ? "text-violet-400 hover:text-gray-400 hover:bg-gray-800"
                : "text-gray-600 hover:text-violet-400 hover:bg-violet-900/20"
            }`}
          >
            <Icon name={rule.enabled ? "ToggleRight" : "ToggleLeft"} size={13} />
          </button>
          <button
            onClick={() => onDelete()}
            title="Удалить"
            className="p-1.5 rounded-lg text-gray-700 hover:text-red-400 hover:bg-red-900/20 transition-colors"
          >
            <Icon name="Trash2" size={13} />
          </button>
        </div>
      </div>

      {/* Conditions + actions summary */}
      <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-600">
        <span>{rule.conditions.length} условий</span>
        <span>·</span>
        <span>{rule.rule_actions.length} действий</span>
        <span>·</span>
        <span>запусков: {rule.run_count}</span>
        {rule.last_run_at && (
          <>
            <span>·</span>
            <span>последний: {fmtDate(rule.last_run_at)}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Log Panel ────────────────────────────────────────────────────

function LogPanel({ rule }: { rule: AutomationRule }) {
  if (!rule.log || rule.log.length === 0) {
    return (
      <div className="text-center py-8 text-gray-600 text-sm">
        Запусков ещё не было
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {rule.log.map(e => (
        <div key={e.id} className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[10px] text-violet-400">{e.ticket_no}</span>
            <span className="text-[10px] text-gray-600">{fmtDate(e.created_at)}</span>
          </div>
          <div className="space-y-0.5">
            {e.actions_taken.map((a, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Icon name="CheckCircle" size={10} className="text-emerald-500 flex-shrink-0" />
                <span className="text-xs text-gray-400">{a}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────

export default function AdminAutomationsPage() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AutomationRule | null>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [rightTab, setRightTab] = useState<"detail" | "log">("detail");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await apiList();
    setRules(list);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleToggle(rule: AutomationRule, enabled: boolean) {
    await apiToggle(rule.id, enabled);
    setRules(rs => rs.map(r => r.id === rule.id ? { ...r, enabled } : r));
    if (selected?.id === rule.id) setSelected(r => r ? { ...r, enabled } : r);
    showToast(enabled ? "Правило включено" : "Правило выключено");
  }

  async function handleDelete(rule: AutomationRule) {
    if (!confirm(`Удалить правило «${rule.name}»?`)) return;
    await apiDelete(rule.id);
    setRules(rs => rs.filter(r => r.id !== rule.id));
    if (selected?.id === rule.id) setSelected(null);
    showToast("Правило удалено");
  }

  async function handleRun(rule: AutomationRule) {
    const res = await apiRun(rule.id);
    if (res.ok) {
      showToast(`Запущено. Применено к ${res.executed} тикетам`);
      // Обновляем run_count
      const fresh = await apiGet(rule.id);
      if (fresh) {
        setRules(rs => rs.map(r => r.id === rule.id ? fresh : r));
        if (selected?.id === rule.id) setSelected(fresh);
      }
    } else {
      showToast(res.error || "Ошибка запуска", false);
    }
  }

  async function handleSelect(rule: AutomationRule) {
    setEditing(false);
    setCreating(false);
    const fresh = await apiGet(rule.id);
    setSelected(fresh ?? rule);
    setRightTab("detail");
  }

  function handleSaved(rule: AutomationRule) {
    setRules(rs => {
      const exists = rs.find(r => r.id === rule.id);
      return exists ? rs.map(r => r.id === rule.id ? rule : r) : [rule, ...rs];
    });
    setSelected(rule);
    setEditing(false);
    setCreating(false);
    showToast(creating ? "Правило создано" : "Правило сохранено");
  }

  const enabledCount  = rules.filter(r => r.enabled).length;
  const disabledCount = rules.length - enabledCount;

  return (
    <AdminShell>
      <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">

        {/* ── LEFT PANEL ────────────────────────────────────────────── */}
        <div className="w-96 flex-shrink-0 border-r border-gray-800 flex flex-col bg-gray-950">

          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2 flex-shrink-0">
            <Icon name="Zap" size={16} className="text-violet-400" />
            <span className="text-sm font-semibold text-gray-200">Автоматизации</span>
            <span className="ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">
              {rules.length}
            </span>
            <button
              onClick={() => { setCreating(true); setEditing(false); setSelected(null); }}
              className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 text-white transition-colors"
            >
              + Новое
            </button>
          </div>

          {/* Stats */}
          <div className="px-4 py-2 flex gap-4 border-b border-gray-800/60 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[10px] text-gray-500">{enabledCount} активных</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-gray-700" />
              <span className="text-[10px] text-gray-600">{disabledCount} выключено</span>
            </div>
          </div>

          {/* Rule list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {loading ? (
              <div className="flex justify-center py-10">
                <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : rules.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                <Icon name="Zap" size={32} className="text-gray-800" />
                <p className="text-sm text-gray-600">Правил пока нет</p>
                <p className="text-xs text-gray-700">Создайте первое правило автоматизации</p>
              </div>
            ) : (
              rules.map(rule => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  selected={selected?.id === rule.id}
                  onSelect={() => handleSelect(rule)}
                  onToggle={en => handleToggle(rule, en)}
                  onDelete={() => handleDelete(rule)}
                  onRun={() => handleRun(rule)}
                />
              ))
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto bg-gray-950">

          {/* Create form */}
          {creating && (
            <div className="p-6">
              <RuleEditor
                onSave={handleSaved}
                onCancel={() => setCreating(false)}
              />
            </div>
          )}

          {/* Edit form */}
          {editing && selected && !creating && (
            <div className="p-6">
              <RuleEditor
                initial={selected}
                onSave={handleSaved}
                onCancel={() => setEditing(false)}
              />
            </div>
          )}

          {/* Detail view */}
          {!creating && !editing && selected && (
            <div className="p-6 space-y-5">

              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      TRIGGER_COLOR[selected.trigger_type] ?? "bg-gray-800 text-gray-400 border-gray-700"
                    }`}>
                      {TRIGGER_LABELS[selected.trigger_type] ?? selected.trigger_type}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${
                      selected.enabled
                        ? "bg-emerald-900/30 text-emerald-400 border-emerald-800"
                        : "bg-gray-800 text-gray-600 border-gray-700"
                    }`}>
                      {selected.enabled ? "Активно" : "Выключено"}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-gray-100">{selected.name}</h2>
                  {selected.description && (
                    <p className="text-sm text-gray-500 mt-1">{selected.description}</p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => setEditing(true)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors flex items-center gap-1.5">
                    <Icon name="Pencil" size={12} /> Редактировать
                  </button>
                  <button onClick={() => handleRun(selected)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-400 border border-emerald-800 transition-colors flex items-center gap-1.5">
                    <Icon name="Play" size={12} /> Запустить
                  </button>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Условий", value: selected.conditions.length },
                  { label: "Действий", value: selected.rule_actions.length },
                  { label: "Запусков", value: selected.run_count },
                ].map(s => (
                  <div key={s.label} className="bg-gray-800/60 border border-gray-700/60 rounded-xl px-4 py-3 text-center">
                    <p className="text-xl font-bold text-violet-400">{s.value}</p>
                    <p className="text-[10px] text-gray-600 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Tabs */}
              <div className="flex border-b border-gray-800">
                {(["detail", "log"] as const).map(t => (
                  <button key={t} onClick={() => setRightTab(t)}
                    className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                      rightTab === t
                        ? "border-violet-500 text-violet-400"
                        : "border-transparent text-gray-600 hover:text-gray-400"
                    }`}>
                    {t === "detail" ? "Правило" : "Лог выполнений"}
                  </button>
                ))}
              </div>

              {/* Tab: detail */}
              {rightTab === "detail" && (
                <div className="space-y-4">
                  {/* Conditions */}
                  <div>
                    <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-2">
                      Условия {selected.conditions.length === 0 && <span className="font-normal text-gray-700">(без ограничений)</span>}
                    </p>
                    {selected.conditions.length === 0 ? (
                      <p className="text-xs text-gray-700 italic">Применяется ко всем тикетам</p>
                    ) : (
                      <div className="space-y-1.5">
                        {selected.conditions.map((c, i) => (
                          <div key={i} className="flex items-center gap-2 bg-gray-800/40 border border-gray-700/40 rounded-lg px-3 py-2 text-xs">
                            <span className="text-gray-400 font-medium">
                              {CONDITION_FIELDS.find(f => f.value === c.field)?.label ?? c.field}
                            </span>
                            <span className="text-gray-600">
                              {CONDITION_OPS.find(o => o.value === c.op)?.label ?? c.op}
                            </span>
                            {c.value && <span className="text-violet-400 font-mono">{c.value}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div>
                    <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-2">Действия</p>
                    <div className="space-y-1.5">
                      {selected.rule_actions.map((a, i) => (
                        <div key={i} className="flex items-center gap-2 bg-gray-800/40 border border-emerald-900/40 rounded-lg px-3 py-2 text-xs">
                          <Icon name="ArrowRight" size={11} className="text-emerald-600 flex-shrink-0" />
                          <span className="text-gray-300 font-medium">
                            {ACTION_TYPES.find(at => at.value === a.type)?.label ?? a.type}
                          </span>
                          {a.value && <span className="text-emerald-400 font-mono ml-auto">{a.value}</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="pt-2 border-t border-gray-800 text-[10px] text-gray-700 space-y-1">
                    <p>Создано: {fmtDate(selected.created_at)} · {selected.created_by}</p>
                    <p>Изменено: {fmtDate(selected.updated_at)} · {selected.updated_by}</p>
                    {selected.last_run_at && <p>Последний запуск: {fmtDate(selected.last_run_at)}</p>}
                  </div>
                </div>
              )}

              {/* Tab: log */}
              {rightTab === "log" && <LogPanel rule={selected} />}
            </div>
          )}

          {/* Empty state */}
          {!creating && !editing && !selected && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center">
                <Icon name="Zap" size={28} className="text-gray-700" />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">Выберите правило</p>
                <p className="text-xs text-gray-700 mt-1">или создайте новое автоматическое правило для тикетов</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium z-50 transition-all ${
          toast.ok ? "bg-emerald-900 text-emerald-300 border border-emerald-700" : "bg-red-900 text-red-300 border border-red-700"
        }`}>
          {toast.msg}
        </div>
      )}
    </AdminShell>
  );
}
