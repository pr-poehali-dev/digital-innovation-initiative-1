import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Icon from "@/components/ui/icon";
import { execPortfolioApi, ExecProject, ExecTask, ExecResult, ExecEffect } from "@/lib/execPortfolioApi";

const PROJECT_KINDS = [
  { value: "project", label: "Проект" },
  { value: "event", label: "Мероприятие" },
  { value: "analysis", label: "Аналитическая работа" },
  { value: "org_change", label: "Организационное изменение" },
  { value: "regular_activity", label: "Регулярная активность" },
];

const PROJECT_STATUSES = [
  { value: "idea", label: "Идея" },
  { value: "planned", label: "Запланирован" },
  { value: "in_progress", label: "В работе" },
  { value: "on_hold", label: "Приостановлен" },
  { value: "completed", label: "Завершён" },
  { value: "cancelled", label: "Отменён" },
];

const TASK_STATUSES = [
  { value: "not_started", label: "Не начата" },
  { value: "in_progress", label: "В работе" },
  { value: "blocked", label: "Заблокирована" },
  { value: "review", label: "На проверке" },
  { value: "done", label: "Выполнена" },
  { value: "cancelled", label: "Отменена" },
];

const RESULT_KINDS = [
  { value: "regulation", label: "Регламент" },
  { value: "report", label: "Отчёт" },
  { value: "model", label: "Модель" },
  { value: "service", label: "Сервис" },
  { value: "methodology", label: "Методика" },
  { value: "implemented_solution", label: "Внедрённое решение" },
  { value: "org_change", label: "Организационное изменение" },
  { value: "other", label: "Иное" },
];

const CONFIRMATION_STATUSES = [
  { value: "not_confirmed", label: "Не подтверждён" },
  { value: "pending_review", label: "На проверке" },
  { value: "confirmed", label: "Подтверждён" },
  { value: "disputed", label: "Оспаривается" },
];

const PRIORITIES = [
  { value: "low", label: "Низкий" },
  { value: "normal", label: "Обычный" },
  { value: "high", label: "Высокий" },
  { value: "urgent", label: "Срочный" },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function PickSelect({
  value,
  onChange,
  options,
  placeholder = "Выберите",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="text-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ============ ФОРМА ПРОЕКТА ============

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
  initiatives,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: ExecProject | null;
  initiatives: Array<{ id: number; title: string }>;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm({
      id: project ? String(project.id) : "",
      title: project?.title || "",
      project_kind: project?.project_kind || "project",
      description: project?.description || "",
      goal: "",
      status: project?.status || "idea",
      priority: project?.priority || "normal",
      progress_pct: String(project?.progress_pct ?? 0),
      initiative_id: project?.initiative_id ? String(project.initiative_id) : "",
      plan_start: project?.plan_start || "",
      plan_end: project?.plan_end || "",
      fact_start: project?.fact_start || "",
      fact_end: project?.fact_end || "",
    });
  }, [open, project]);

  const save = async () => {
    if (!form.title?.trim()) {
      setError("Укажите название");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await execPortfolioApi.saveProject({
        ...form,
        id: form.id || undefined,
        initiative_id: form.initiative_id || undefined,
        progress_pct: Number(form.progress_pct) || 0,
      });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{project ? "Редактировать проект" : "Новый проект / мероприятие"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
          <Field label="Название">
            <Input value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Тип">
              <PickSelect value={form.project_kind} onChange={(v) => setForm({ ...form, project_kind: v })} options={PROJECT_KINDS} />
            </Field>
            <Field label="Статус">
              <PickSelect value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={PROJECT_STATUSES} />
            </Field>
          </div>
          <Field label="Описание">
            <Textarea rows={3} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="Цель">
            <Textarea rows={2} value={form.goal || ""} onChange={(e) => setForm({ ...form, goal: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Приоритет">
              <PickSelect value={form.priority} onChange={(v) => setForm({ ...form, priority: v })} options={PRIORITIES} />
            </Field>
            <Field label="Готовность, %">
              <Input type="number" min={0} max={100} value={form.progress_pct}
                onChange={(e) => setForm({ ...form, progress_pct: e.target.value })} />
            </Field>
          </div>
          <Field label="Связанная инициатива">
            <PickSelect
              value={form.initiative_id || "none"}
              onChange={(v) => setForm({ ...form, initiative_id: v === "none" ? "" : v })}
              options={[{ value: "none", label: "Без инициативы" }, ...initiatives.map((i) => ({ value: String(i.id), label: i.title }))]}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Начало (план)">
              <Input type="date" value={form.plan_start || ""} onChange={(e) => setForm({ ...form, plan_start: e.target.value })} />
            </Field>
            <Field label="Завершение (план)">
              <Input type="date" value={form.plan_end || ""} onChange={(e) => setForm({ ...form, plan_end: e.target.value })} />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Сохранение..." : "Сохранить"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ ФОРМА ЗАДАЧИ ============

export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  projects,
  actions,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task: ExecTask | null;
  projects: Array<{ id: number; title: string }>;
  actions: Array<{ id: number; title: string }>;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm({
      id: task ? String(task.id) : "",
      title: task?.title || "",
      description: task?.description || "",
      project_id: task?.project_id ? String(task.project_id) : "",
      action_id: task?.action_id ? String(task.action_id) : "",
      due_at: task?.due_at || "",
      priority: task?.priority || "normal",
      status: task?.status || "not_started",
      progress_pct: String(task?.progress_pct ?? 0),
      expected_result: task?.expected_result || "",
      actual_result: task?.actual_result || "",
      delay_reason: "",
      blocker: "",
    });
  }, [open, task]);

  const save = async () => {
    if (!form.title?.trim()) {
      setError("Укажите название");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await execPortfolioApi.saveTask({
        ...form,
        id: form.id || undefined,
        project_id: form.project_id || undefined,
        action_id: form.action_id || undefined,
        progress_pct: Number(form.progress_pct) || 0,
      });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? "Редактировать задачу" : "Новая задача"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
          <Field label="Название">
            <Input value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Описание">
            <Textarea rows={2} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="Проект (необязательно — задача может быть самостоятельной)">
            <PickSelect
              value={form.project_id || "none"}
              onChange={(v) => setForm({ ...form, project_id: v === "none" ? "" : v })}
              options={[{ value: "none", label: "Без проекта" }, ...projects.map((p) => ({ value: String(p.id), label: p.title }))]}
            />
          </Field>
          <Field label="Связанное поручение (необязательно)">
            <PickSelect
              value={form.action_id || "none"}
              onChange={(v) => setForm({ ...form, action_id: v === "none" ? "" : v })}
              options={[{ value: "none", label: "Без поручения" }, ...actions.map((a) => ({ value: String(a.id), label: a.title }))]}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Срок">
              <Input type="date" value={form.due_at || ""} onChange={(e) => setForm({ ...form, due_at: e.target.value })} />
            </Field>
            <Field label="Приоритет">
              <PickSelect value={form.priority} onChange={(v) => setForm({ ...form, priority: v })} options={PRIORITIES} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Статус">
              <PickSelect value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={TASK_STATUSES} />
            </Field>
            <Field label="Прогресс, %">
              <Input type="number" min={0} max={100} value={form.progress_pct}
                onChange={(e) => setForm({ ...form, progress_pct: e.target.value })} />
            </Field>
          </div>
          <Field label="Ожидаемый результат">
            <Textarea rows={2} value={form.expected_result || ""} onChange={(e) => setForm({ ...form, expected_result: e.target.value })} />
          </Field>
          {form.status === "done" && (
            <Field label="Фактический результат">
              <Textarea rows={2} value={form.actual_result || ""} onChange={(e) => setForm({ ...form, actual_result: e.target.value })} />
            </Field>
          )}
          {form.status === "blocked" && (
            <Field label="Блокирующий фактор">
              <Textarea rows={2} value={form.blocker || ""} onChange={(e) => setForm({ ...form, blocker: e.target.value })} />
            </Field>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Сохранение..." : "Сохранить"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ ФОРМА РЕЗУЛЬТАТА ============

export function ResultFormDialog({
  open,
  onOpenChange,
  result,
  projects,
  defaultProjectId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  result: ExecResult | null;
  projects: Array<{ id: number; title: string }>;
  defaultProjectId?: number;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm({
      id: result ? String(result.id) : "",
      title: result?.title || "",
      result_kind: result?.result_kind || "other",
      description: result?.description || "",
      project_id: result?.project_id ? String(result.project_id) : (defaultProjectId ? String(defaultProjectId) : ""),
      achieved_at: result?.achieved_at || "",
    });
  }, [open, result, defaultProjectId]);

  const save = async () => {
    if (!form.title?.trim()) {
      setError("Укажите название");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await execPortfolioApi.saveResult({
        ...form,
        id: form.id || undefined,
        project_id: form.project_id || undefined,
      });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{result ? "Редактировать результат" : "Новый результат"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
          <Field label="Что создано">
            <Input value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Тип результата">
            <PickSelect value={form.result_kind} onChange={(v) => setForm({ ...form, result_kind: v })} options={RESULT_KINDS} />
          </Field>
          <Field label="Проект">
            <PickSelect
              value={form.project_id || "none"}
              onChange={(v) => setForm({ ...form, project_id: v === "none" ? "" : v })}
              options={[{ value: "none", label: "Без проекта" }, ...projects.map((p) => ({ value: String(p.id), label: p.title }))]}
            />
          </Field>
          <Field label="Комментарий">
            <Textarea rows={2} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="Дата достижения">
            <Input type="date" value={form.achieved_at || ""} onChange={(e) => setForm({ ...form, achieved_at: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Сохранение..." : "Сохранить"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ ФОРМА ЭФФЕКТА ============

export function EffectFormDialog({
  open,
  onOpenChange,
  effect,
  resultId,
  resultTitle,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  effect: ExecEffect | null;
  resultId: number;
  resultTitle: string;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm({
      id: effect ? String(effect.id) : "",
      title: effect?.title || "",
      result_id: String(resultId),
      metric: effect?.metric || "",
      unit: effect?.unit || "",
      baseline_value: effect?.baseline_value || "",
      plan_value: effect?.plan_value || "",
      actual_value: effect?.actual_value || "",
      measured_at: effect?.measured_at || "",
      calculation_method: effect?.calculation_method || "",
      data_source: effect?.data_source || "",
      confirmation_status: effect?.confirmation_status || "not_confirmed",
    });
  }, [open, effect, resultId]);

  const save = async () => {
    if (!form.title?.trim()) {
      setError("Укажите название эффекта");
      return;
    }
    if (form.actual_value && !form.calculation_method?.trim()) {
      setError("Перед фиксацией фактического значения укажите методику расчёта");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await execPortfolioApi.saveEffect({ ...form, id: form.id || undefined });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{effect ? "Редактировать эффект" : "Новый эффект"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">Результат: {resultTitle}</div>
          {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
          <Field label="Название эффекта">
            <Input value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Показатель">
              <Input value={form.metric || ""} onChange={(e) => setForm({ ...form, metric: e.target.value })} />
            </Field>
            <Field label="Единица измерения">
              <Input value={form.unit || ""} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Базовое">
              <Input value={form.baseline_value || ""} onChange={(e) => setForm({ ...form, baseline_value: e.target.value })} />
            </Field>
            <Field label="Плановое">
              <Input value={form.plan_value || ""} onChange={(e) => setForm({ ...form, plan_value: e.target.value })} />
            </Field>
            <Field label="Фактическое">
              <Input value={form.actual_value || ""} onChange={(e) => setForm({ ...form, actual_value: e.target.value })} />
            </Field>
          </div>
          <Field label="Методика расчёта (обязательна для фиксации факта)">
            <Textarea rows={2} value={form.calculation_method || ""} onChange={(e) => setForm({ ...form, calculation_method: e.target.value })} />
          </Field>
          <Field label="Источник данных">
            <Input value={form.data_source || ""} onChange={(e) => setForm({ ...form, data_source: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Дата измерения">
              <Input type="date" value={form.measured_at || ""} onChange={(e) => setForm({ ...form, measured_at: e.target.value })} />
            </Field>
            <Field label="Статус подтверждения">
              <PickSelect value={form.confirmation_status} onChange={(v) => setForm({ ...form, confirmation_status: v })} options={CONFIRMATION_STATUSES} />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Сохранение..." : "Сохранить"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ ФОРМА СВЯЗИ ============

const LINKABLE_KINDS = [
  { value: "action", label: "Поручение" },
  { value: "initiative", label: "Инициатива" },
  { value: "project", label: "Проект" },
  { value: "task", label: "Задача" },
  { value: "milestone", label: "Контрольная точка" },
  { value: "result", label: "Результат" },
  { value: "effect", label: "Эффект" },
  { value: "risk", label: "Риск" },
  { value: "issue", label: "Проблема" },
  { value: "decision", label: "Решение" },
  { value: "doc_source", label: "Документ" },
];

const LINK_TYPES = [
  { value: "related", label: "связано с" },
  { value: "implements", label: "реализует" },
  { value: "blocks", label: "блокирует" },
  { value: "depends_on", label: "зависит от" },
  { value: "supports", label: "подтверждает" },
];

export function LinkFormDialog({
  open,
  onOpenChange,
  srcKind,
  srcId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  srcKind: string;
  srcId: number;
  onSaved: () => void;
}) {
  const [tgtKind, setTgtKind] = useState("project");
  const [tgtId, setTgtId] = useState("");
  const [linkType, setLinkType] = useState("related");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setTgtId("");
      setNote("");
      setError("");
    }
  }, [open]);

  const save = async () => {
    if (!tgtId.trim() || !Number(tgtId)) {
      setError("Укажите ID целевого объекта");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await execPortfolioApi.saveLink({
        link_type: linkType, src_kind: srcKind, src_id: srcId,
        tgt_kind: tgtKind, tgt_id: Number(tgtId), note,
      });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Добавить связь</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
          <Field label="Тип связи">
            <PickSelect value={linkType} onChange={setLinkType} options={LINK_TYPES} />
          </Field>
          <Field label="Тип объекта">
            <PickSelect value={tgtKind} onChange={setTgtKind} options={LINKABLE_KINDS} />
          </Field>
          <Field label="ID объекта">
            <Input type="number" value={tgtId} onChange={(e) => setTgtId(e.target.value)} placeholder="Например, 3" />
          </Field>
          <Field label="Комментарий (необязательно)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={save} disabled={busy}>
            <Icon name="Link" size={14} className="mr-1.5" />
            {busy ? "Сохранение..." : "Связать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { PROJECT_KINDS, PROJECT_STATUSES, TASK_STATUSES, RESULT_KINDS, CONFIRMATION_STATUSES, PRIORITIES, LINKABLE_KINDS };
