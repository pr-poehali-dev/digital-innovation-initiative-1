import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Empty, ErrorBox, Loading, fmtDate } from "@/components/exec/ExecUI";
import {
  goalsApi, Goal, GoalLevel, GoalStatus, ProgressMode,
  GOAL_LEVEL_LABEL, GOAL_STATUS_LABEL,
} from "@/lib/execGoalsApi";

const LEVELS: GoalLevel[] = ["strategic", "organization", "center", "org_unit", "initiative", "project"];
const STATUSES: GoalStatus[] = ["draft", "agreed", "active", "achieved", "paused", "cancelled", "archived"];
const MODES: { value: ProgressMode; label: string }[] = [
  { value: "manual", label: "Ручной прогресс" },
  { value: "by_indicators", label: "Расчёт по показателям" },
  { value: "by_children", label: "Расчёт по подцелям" },
  { value: "weighted", label: "Взвешенный расчёт" },
];

/** Плоский реестр целей всех уровней с созданием/редактированием. Дерево —
 * на отдельной вкладке «Дерево целей». */
export default function GoalsRegistryTab({ centerId, onOpenGoal }: { centerId: number; onOpenGoal: (id: number) => void }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);

  const reload = () => {
    setLoading(true);
    setError("");
    goalsApi.tree(centerId).then((d) => setGoals(d.items)).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };

  useEffect(reload, [centerId]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Icon name="Plus" size={14} className="mr-1.5" /> Новая цель
        </Button>
      </div>

      {!goals.length ? <Empty text="Целей пока нет" icon="Target" /> : (
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
          {goals.map((g) => (
            <div key={g.id} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50">
              <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onOpenGoal(g.id)}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{GOAL_LEVEL_LABEL[g.goal_level]}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700">{GOAL_STATUS_LABEL[g.status]}</span>
                  {g.is_overdue && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">Просрочена</span>}
                </div>
                <p className="text-sm text-slate-900 mt-1">{g.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {g.owner_name || "владелец не назначен"}{g.due_date ? ` · срок ${fmtDate(g.due_date)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-sm font-medium text-slate-900 w-12 text-right">
                  {g.progress?.progress_pct != null ? `${g.progress.progress_pct}%` : "—"}
                </span>
                <Button size="sm" variant="outline" onClick={() => { setEditing(g); setFormOpen(true); }}>
                  <Icon name="Pencil" size={13} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <GoalFormDialog
          centerId={centerId}
          goal={editing}
          goals={goals}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); reload(); }}
        />
      )}
    </div>
  );
}

function GoalFormDialog({
  centerId, goal, goals, onClose, onSaved,
}: { centerId: number; goal: Goal | null; goals: Goal[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: goal?.title || "", description: goal?.description || "",
    goal_level: goal?.goal_level || "center", status: goal?.status || "draft",
    parent_goal_id: goal?.parent_goal_id ? String(goal.parent_goal_id) : "",
    due_date: goal?.due_date || "", achievement_criteria: goal?.achievement_criteria || "",
    progress_mode: goal?.progress_mode || "manual", progress_pct: goal?.progress_pct ?? "",
    priority: goal?.priority || "medium",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!form.title.trim()) { setError("Укажите название цели"); return; }
    setSaving(true);
    setError("");
    try {
      await goalsApi.saveGoal({
        id: goal?.id, center_id: centerId, title: form.title, description: form.description || undefined,
        goal_level: form.goal_level as GoalLevel, status: form.status as GoalStatus,
        parent_goal_id: form.parent_goal_id ? Number(form.parent_goal_id) : undefined,
        due_date: form.due_date || undefined, achievement_criteria: form.achievement_criteria || undefined,
        progress_mode: form.progress_mode as ProgressMode,
        progress_pct: form.progress_pct !== "" ? Number(form.progress_pct) : undefined,
        priority: form.priority,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{goal ? "Изменить цель" : "Новая цель"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Название цели" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Textarea placeholder="Описание" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          <div className="grid grid-cols-2 gap-2">
            <Select value={form.goal_level} onValueChange={(v) => setForm({ ...form, goal_level: v as GoalLevel })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEVELS.map((l) => <SelectItem key={l} value={l}>{GOAL_LEVEL_LABEL[l]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as GoalStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{GOAL_STATUS_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Select value={form.parent_goal_id || "none"} onValueChange={(v) => setForm({ ...form, parent_goal_id: v === "none" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="Родительская цель" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Без родителя (верхний уровень)</SelectItem>
              {goals.filter((g) => g.id !== goal?.id).map((g) => (
                <SelectItem key={g.id} value={String(g.id)}>{g.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            <Select value={form.progress_mode} onValueChange={(v) => setForm({ ...form, progress_mode: v as ProgressMode })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {form.progress_mode === "manual" && (
            <Input type="number" min={0} max={100} placeholder="Прогресс, %" value={form.progress_pct}
                   onChange={(e) => setForm({ ...form, progress_pct: e.target.value })} />
          )}
          <Textarea placeholder="Критерий достижения" value={form.achievement_criteria}
                     onChange={(e) => setForm({ ...form, achievement_criteria: e.target.value })} rows={2} />
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={save} disabled={saving}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
