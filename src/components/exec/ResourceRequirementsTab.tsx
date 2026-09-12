import { useEffect, useState, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Empty, Loading, fmtDate } from "@/components/exec/ExecUI";
import PageGuide from "@/components/exec/PageGuide";
import { execPageGuides } from "@/config/execPageGuides";
import { execResourcesApi, ResourceRequirement } from "@/lib/execResourcesApi";

const CRITICALITY_LABEL: Record<string, string> = {
  low: "Низкая", medium: "Средняя", high: "Высокая", critical: "Критическая",
};
const CRITICALITY_CLS: Record<string, string> = {
  low: "bg-slate-100 text-slate-600", medium: "bg-amber-50 text-amber-700",
  high: "bg-orange-100 text-orange-700", critical: "bg-red-100 text-red-700",
};

const CLOSING_METHOD_LABEL: Record<string, string> = {
  internal_employee: "Внутренний сотрудник", load_reallocation: "Перераспределение загрузки",
  new_hire: "Новый найм", contractor: "Подрядчик", temporary_expert: "Временный эксперт",
  cancelled: "Отменена",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Черновик", confirmed: "Подтверждена", searching: "Поиск ресурса",
  candidate_identified: "Кандидат определён", assigned: "Ресурс назначен",
  closed: "Закрыта", paused: "Приостановлена", cancelled: "Отменена",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function RequirementFormDialog({
  open, onOpenChange, kind, parentId, taskId, milestoneId, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; kind: "project" | "initiative"; parentId: number;
  taskId?: number; milestoneId?: number; onSaved: () => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setForm({
        role_title: "", criticality: "medium", required_load_pct: "100", headcount: "1",
        closing_method: "internal_employee", funding_confirmed: "false",
        task_id: taskId ? String(taskId) : "", milestone_id: milestoneId ? String(milestoneId) : "",
      });
      setError("");
    }
  }, [open, taskId, milestoneId]);

  const save = async () => {
    if (!form.role_title?.trim()) {
      setError("Укажите роль");
      return;
    }
    setBusy(true); setError("");
    try {
      await execResourcesApi.saveRequirement({
        ...form, [`${kind}_id`]: parentId,
        funding_confirmed: form.funding_confirmed === "true",
        task_id: form.task_id || undefined, milestone_id: form.milestone_id || undefined,
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
        <DialogHeader><DialogTitle>Новая ресурсная потребность</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
          <Field label="Роль / компетенция">
            <Input value={form.role_title || ""} onChange={(e) => setForm({ ...form, role_title: e.target.value })} placeholder="Например: системный аналитик" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Требуется, FTE / чел.">
              <Input type="number" step="0.1" value={form.headcount} onChange={(e) => setForm({ ...form, headcount: e.target.value })} />
            </Field>
            <Field label="Загрузка, %">
              <Input type="number" min={0} max={100} value={form.required_load_pct} onChange={(e) => setForm({ ...form, required_load_pct: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Начало периода">
              <Input type="date" value={form.period_start || ""} onChange={(e) => setForm({ ...form, period_start: e.target.value })} />
            </Field>
            <Field label="Окончание периода">
              <Input type="date" value={form.period_end || ""} onChange={(e) => setForm({ ...form, period_end: e.target.value })} />
            </Field>
          </div>
          <Field label="Найти до (дата)">
            <Input type="date" value={form.need_by_date || ""} onChange={(e) => setForm({ ...form, need_by_date: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Критичность">
              <Select value={form.criticality} onValueChange={(v) => setForm({ ...form, criticality: v })}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CRITICALITY_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Способ закрытия">
              <Select value={form.closing_method} onValueChange={(v) => setForm({ ...form, closing_method: v })}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CLOSING_METHOD_LABEL).filter(([k]) => k !== "cancelled").map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="text-[11px] text-muted-foreground -mt-1">
            Дата начала поиска рассчитывается автоматически по нормативному сроку привлечения для выбранного способа
          </div>
          <Field label="Требуемые компетенции">
            <Textarea rows={2} value={form.required_competencies || ""} onChange={(e) => setForm({ ...form, required_competencies: e.target.value })} />
          </Field>
          <Field label="Причина потребности">
            <Textarea rows={2} value={form.reason || ""} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Расчётная стоимость в месяц">
              <Input type="number" value={form.estimated_monthly_cost || ""} onChange={(e) => setForm({ ...form, estimated_monthly_cost: e.target.value })} />
            </Field>
            <Field label="Финансирование">
              <Select value={form.funding_confirmed} onValueChange={(v) => setForm({ ...form, funding_confirmed: v })}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">Не подтверждено</SelectItem>
                  <SelectItem value="true">Подтверждено</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Сохранение..." : "Создать потребность"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResolveDialog({
  open, onOpenChange, requirement, onResolved,
}: { open: boolean; onOpenChange: (v: boolean) => void; requirement: ResourceRequirement | null; onResolved: () => void }) {
  const [personId, setPersonId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const resolve = async () => {
    if (!requirement || !personId) {
      setError("Укажите ID сотрудника (exec_person)");
      return;
    }
    setBusy(true); setError("");
    try {
      const r = await execResourcesApi.resolveRequirement({ requirement_id: requirement.id, person_id: Number(personId) });
      if (r.was_overdue) setError("Назначено с задержкой относительно плановой даты");
      onOpenChange(false);
      onResolved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Назначить ресурс</DialogTitle></DialogHeader>
        {error && <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-2">{error}</div>}
        <Field label="ID сотрудника">
          <Input type="number" value={personId} onChange={(e) => setPersonId(e.target.value)} placeholder="ID из справочника людей" />
        </Field>
        <div className="text-[11px] text-muted-foreground">
          Создаст назначение с плановой загрузкой и периодом из потребности, потребность будет закрыта с сохранением истории
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={resolve} disabled={busy}>{busy ? "Назначение..." : "Назначить и закрыть потребность"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RequirementsTab({
  kind, parentId, taskId, milestoneId,
}: { kind: "project" | "initiative"; parentId: number; taskId?: number; milestoneId?: number }) {
  const [items, setItems] = useState<ResourceRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<ResourceRequirement | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    execResourcesApi.requirements(kind, parentId).then((d) => {
      const filtered = taskId ? d.items.filter((r) => r.task_id === taskId)
        : milestoneId ? d.items.filter((r) => r.milestone_id === milestoneId)
        : d.items;
      setItems(filtered);
    }).finally(() => setLoading(false));
  }, [kind, parentId, taskId, milestoneId]);

  useEffect(load, [load]);

  if (loading) return <Loading />;

  return (
    <div className="space-y-3">
      {!taskId && !milestoneId && <PageGuide {...execPageGuides.requirements} />}

      <Button size="sm" onClick={() => setDialogOpen(true)}>
        <Icon name="UserSearch" size={14} className="mr-1.5" /> Новая потребность
      </Button>

      {items.length === 0 ? <Empty text="Ресурсных потребностей пока нет" icon="UserSearch" /> : (
        <div className="space-y-1.5">
          {items.map((r) => (
            <div key={r.id} className={`rounded-xl border p-3 ${r.is_overdue ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{r.role_title_ref || r.role_title}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {r.headcount} чел. · {r.required_load_pct}% загрузки
                    {r.task_title && ` · задача: ${r.task_title}`}
                    {r.milestone_title && ` · веха: ${r.milestone_title}`}
                  </div>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${CRITICALITY_CLS[r.criticality]}`}>
                  {CRITICALITY_LABEL[r.criticality]}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground mt-1.5">
                <span>Статус: {STATUS_LABEL[r.status] || r.status}</span>
                {r.closing_method && <span>Способ: {CLOSING_METHOD_LABEL[r.closing_method]}</span>}
                {r.need_by_date && <span className={r.is_overdue ? "text-red-600 font-medium" : ""}>Найти до: {fmtDate(r.need_by_date)}</span>}
                {r.search_start_date && <span>Начать поиск: {fmtDate(r.search_start_date)}</span>}
                {r.estimated_total_cost != null && (
                  <span>Оценка: {Number(r.estimated_total_cost).toLocaleString("ru-RU")} ₽ {!r.funding_confirmed && "(без финансирования)"}</span>
                )}
              </div>
              {r.status !== "closed" && r.status !== "cancelled" && (
                <div className="flex gap-2 mt-2">
                  <Button size="sm" variant="outline" onClick={() => setResolveTarget(r)}>
                    <Icon name="UserCheck" size={12} className="mr-1" /> Назначить ресурс
                  </Button>
                  <button onClick={() => execResourcesApi.archiveRequirement(r.id).then(load)} className="text-[11px] text-muted-foreground">
                    Архивировать
                  </button>
                </div>
              )}
              {r.status === "closed" && r.resolved_assignment_id && (
                <div className="text-[11px] text-emerald-700 mt-1.5">
                  Закрыта {r.closed_at ? fmtDate(r.closed_at) : ""} — назначение #{r.resolved_assignment_id}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <RequirementFormDialog open={dialogOpen} onOpenChange={setDialogOpen} kind={kind} parentId={parentId} taskId={taskId} milestoneId={milestoneId} onSaved={load} />
      <ResolveDialog open={!!resolveTarget} onOpenChange={(v) => !v && setResolveTarget(null)} requirement={resolveTarget} onResolved={load} />
    </div>
  );
}