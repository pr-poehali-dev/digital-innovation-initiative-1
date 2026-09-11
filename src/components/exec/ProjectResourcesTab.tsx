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
import { Empty, Loading } from "@/components/exec/ExecUI";
import {
  execResourcesApi, ResourceAssignment, CostCategory, BudgetVersion, BudgetLine,
  FinancialSummary,
} from "@/lib/execResourcesApi";

const PROJECT_ROLE_LABEL: Record<string, string> = {
  leader: "Руководитель", result_owner: "Владелец результата", coordinator: "Координатор",
  member: "Участник", expert: "Эксперт", vacancy: "Вакансия",
};

const BUDGET_STATUS_LABEL: Record<string, string> = {
  draft: "Черновик", review: "На рассмотрении", approved: "Утверждён", revised: "Уточнён", forecast: "Прогноз",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// ============ ФОРМА УЧАСТНИКА ============

function AssignmentFormDialog({
  open, onOpenChange, kind, parentId, onSaved,
}: { open: boolean; onOpenChange: (v: boolean) => void; kind: "project" | "initiative"; parentId: number; onSaved: () => void }) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  useEffect(() => {
    if (open) {
      setForm({ role_title: "", project_role: "member", plan_load_pct: "100", is_vacant: "false", is_external: "false" });
      setError(""); setWarning("");
    }
  }, [open]);

  const save = async () => {
    if (!form.role_title?.trim()) {
      setError("Укажите название роли");
      return;
    }
    setBusy(true); setError("");
    try {
      const payload: Record<string, unknown> = {
        ...form, [`${kind}_id`]: parentId,
        is_vacant: form.is_vacant === "true", is_external: form.is_external === "true",
      };
      const r = await execResourcesApi.saveAssignment(payload);
      if (r.overload_warning) setWarning(r.overload_warning);
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
        <DialogHeader><DialogTitle>Добавить участника</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
          {warning && <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{warning}</div>}
          <Field label="Роль / должность">
            <Input value={form.role_title || ""} onChange={(e) => setForm({ ...form, role_title: e.target.value })} placeholder="Например: Бизнес-аналитик" />
          </Field>
          <Field label="Роль в проекте">
            <Select value={form.project_role} onValueChange={(v) => setForm({ ...form, project_role: v })}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PROJECT_ROLE_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Плановая загрузка, %">
              <Input type="number" min={0} max={100} value={form.plan_load_pct} onChange={(e) => setForm({ ...form, plan_load_pct: e.target.value })} />
            </Field>
            <Field label="Тип">
              <Select value={form.is_vacant} onValueChange={(v) => setForm({ ...form, is_vacant: v })}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">Назначен</SelectItem>
                  <SelectItem value="true">Вакансия (не назначен)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Комментарий">
            <Textarea rows={2} value={form.comment || ""} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Сохранение..." : "Добавить"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ ВКЛАДКА КОМАНДА ============

export function TeamTab({ kind, parentId }: { kind: "project" | "initiative"; parentId: number }) {
  const [items, setItems] = useState<ResourceAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    execResourcesApi.assignments(kind, parentId).then((d) => setItems(d.items)).finally(() => setLoading(false));
  }, [kind, parentId]);

  useEffect(load, [load]);

  return (
    <div className="space-y-3">
      <Button size="sm" onClick={() => setDialogOpen(true)}>
        <Icon name="UserPlus" size={14} className="mr-1.5" /> Добавить участника
      </Button>
      {loading ? <Loading /> : items.length === 0 ? (
        <Empty text="Команда пока не сформирована" icon="Users" />
      ) : (
        <div className="space-y-1.5">
          {items.map((a) => (
            <div key={a.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">
                  {a.person_name || a.role_title_ref || a.role_title || "Без названия"}
                  {a.is_vacant && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">вакансия</span>}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {PROJECT_ROLE_LABEL[a.project_role] || a.project_role} · загрузка {a.plan_load_pct}%
                  {a.is_external && " · внешний"}
                </div>
              </div>
              <button onClick={() => execResourcesApi.archiveAssignment(a.id).then(load)}>
                <Icon name="X" size={13} className="text-muted-foreground" />
              </button>
            </div>
          ))}
        </div>
      )}
      <AssignmentFormDialog open={dialogOpen} onOpenChange={setDialogOpen} kind={kind} parentId={parentId} onSaved={load} />
    </div>
  );
}

// ============ ВКЛАДКА БЮДЖЕТ ============

export function BudgetTab({ kind, parentId }: { kind: "project" | "initiative"; parentId: number }) {
  const [versions, setVersions] = useState<BudgetVersion[]>([]);
  const [categories, setCategories] = useState<CostCategory[]>([]);
  const [activeVersion, setActiveVersion] = useState<BudgetVersion | null>(null);
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [summary, setSummary] = useState<{ total_by_month: Record<string, number>; total_year: number } | null>(null);
  const [financial, setFinancial] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [newVersionYear, setNewVersionYear] = useState(String(new Date().getFullYear()));
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [lineForm, setLineForm] = useState<{ category_id: string; month: string; amount_plan: string }>({
    category_id: "", month: "", amount_plan: "",
  });
  const [snapMsg, setSnapMsg] = useState("");

  const loadVersions = useCallback(() => {
    execResourcesApi.budgetVersions(kind, parentId).then((d) => {
      setVersions(d.items);
      if (d.items.length > 0 && !activeVersion) setActiveVersion(d.items[0]);
    });
  }, [kind, parentId, activeVersion]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      execResourcesApi.costCategories().then((d) => setCategories(d.items)),
      execResourcesApi.budgetVersions(kind, parentId).then((d) => { setVersions(d.items); if (d.items.length > 0) setActiveVersion(d.items[0]); }),
      execResourcesApi.financialSummary(kind, parentId).then(setFinancial),
    ]).finally(() => setLoading(false));
  }, [kind, parentId]);

  useEffect(() => {
    if (activeVersion) {
      execResourcesApi.budgetLines(activeVersion.id).then((d) => { setLines(d.items); setSummary(d.summary); });
    }
  }, [activeVersion]);

  const createVersion = async () => {
    setCreatingVersion(true);
    try {
      await execResourcesApi.createBudgetVersion({ [`${kind}_id`]: parentId, year: Number(newVersionYear) });
      loadVersions();
    } finally {
      setCreatingVersion(false);
    }
  };

  const approveVersion = async () => {
    if (!activeVersion) return;
    await execResourcesApi.setBudgetVersionStatus(activeVersion.id, "approved");
    loadVersions();
    setActiveVersion({ ...activeVersion, version_status: "approved", is_locked: true });
  };

  const addLine = async () => {
    if (!activeVersion || !lineForm.category_id || !lineForm.month || !lineForm.amount_plan) return;
    await execResourcesApi.saveBudgetLine({
      version_id: activeVersion.id, category_id: Number(lineForm.category_id),
      month: `${lineForm.month}-01`, amount_plan: Number(lineForm.amount_plan),
    });
    setLineForm({ category_id: "", month: "", amount_plan: "" });
    execResourcesApi.budgetLines(activeVersion.id).then((d) => { setLines(d.items); setSummary(d.summary); });
  };

  const publishSnapshot = async () => {
    if (!activeVersion) return;
    const r = await execResourcesApi.createFinancialSnapshot({ budget_version_id: activeVersion.id });
    setSnapMsg(`Финансовый снимок №${r.id} опубликован (версия ${r.version_number})`);
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      {financial && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {"approved_budget" in financial && (
            <>
              <MiniMetric label="Утверждено" value={financial.approved_budget} />
              <MiniMetric label="Факт" value={financial.fact} />
              <MiniMetric label="Обязательства" value={financial.commitments} />
              <MiniMetric label="Прогноз" value={financial.forecast} />
              <MiniMetric label="Остаток" value={financial.remaining} tone={((financial.remaining ?? 0) < 0) ? "danger" : "default"} />
              {financial.deviation_pct !== null && financial.deviation_pct !== undefined && (
                <MiniMetric label="Отклонение" value={`${financial.deviation_pct}%`} tone={financial.deviation_pct > 0 ? "danger" : "default"} isText />
              )}
            </>
          )}
          {"total_budget" in financial && (
            <>
              <MiniMetric label="Бюджет всего" value={financial.total_budget} />
              <MiniMetric label="Из проектов" value={financial.projects_budget} />
              <MiniMetric label="Собственные" value={financial.own_budget} />
              <MiniMetric label="Факт" value={financial.total_fact} />
            </>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={activeVersion ? String(activeVersion.id) : ""} onValueChange={(v) => setActiveVersion(versions.find((x) => String(x.id) === v) || null)}>
          <SelectTrigger className="text-sm w-56"><SelectValue placeholder="Выберите версию" /></SelectTrigger>
          <SelectContent>
            {versions.map((v) => (
              <SelectItem key={v.id} value={String(v.id)}>
                {v.year} — {v.version_label} ({BUDGET_STATUS_LABEL[v.version_status]})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="number" className="w-24 text-sm" value={newVersionYear} onChange={(e) => setNewVersionYear(e.target.value)} />
        <Button size="sm" variant="outline" onClick={createVersion} disabled={creatingVersion}>
          <Icon name="Plus" size={13} className="mr-1" /> Новая версия
        </Button>
        {activeVersion && !activeVersion.is_locked && (
          <Button size="sm" variant="outline" className="text-emerald-700" onClick={approveVersion}>
            <Icon name="CheckCircle2" size={13} className="mr-1" /> Утвердить
          </Button>
        )}
        {activeVersion && (
          <Button size="sm" variant="outline" onClick={publishSnapshot}>
            <Icon name="Camera" size={13} className="mr-1" /> Снимок
          </Button>
        )}
      </div>

      {snapMsg && <div className="text-xs bg-emerald-50 text-emerald-800 rounded-lg px-3 py-2">{snapMsg}</div>}

      {activeVersion?.is_locked && (
        <div className="text-xs bg-slate-100 text-slate-600 rounded-lg px-3 py-2 flex items-center gap-1.5">
          <Icon name="Lock" size={12} /> Версия утверждена и заблокирована. Для изменений создайте новую версию.
        </div>
      )}

      {activeVersion && !activeVersion.is_locked && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">Добавить строку бюджета</div>
          <div className="grid grid-cols-3 gap-2">
            <Select value={lineForm.category_id} onValueChange={(v) => setLineForm({ ...lineForm, category_id: v })}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="Статья" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="month" value={lineForm.month} onChange={(e) => setLineForm({ ...lineForm, month: e.target.value })} />
            <Input type="number" placeholder="Сумма" value={lineForm.amount_plan} onChange={(e) => setLineForm({ ...lineForm, amount_plan: e.target.value })} />
          </div>
          <Button size="sm" onClick={addLine}>Добавить</Button>
        </div>
      )}

      {summary && (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold text-muted-foreground mb-2">Итого за год: {summary.total_year.toLocaleString("ru-RU")} ₽</div>
          <div className="grid grid-cols-4 gap-1.5 text-[11px]">
            {Object.entries(summary.total_by_month).sort().map(([m, v]) => (
              <div key={m} className="rounded bg-slate-50 px-2 py-1">
                <div className="text-muted-foreground">{m}</div>
                <div className="font-medium">{v.toLocaleString("ru-RU")}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {lines.length === 0 ? <Empty text="Строк бюджета пока нет" icon="Table" /> : (
        <div className="space-y-1">
          {lines.map((l) => (
            <div key={l.id} className="text-xs flex justify-between border-b border-slate-100 py-1.5">
              <span>{l.category_title} · {l.month}</span>
              <span className="font-medium">{Number(l.amount_plan).toLocaleString("ru-RU")} ₽</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniMetric({ label, value, tone = "default", isText = false }: { label: string; value?: number | string; tone?: "default" | "danger"; isText?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold mt-0.5 ${tone === "danger" ? "text-red-600" : "text-slate-900"}`}>
        {isText ? value : `${Number(value || 0).toLocaleString("ru-RU")} ₽`}
      </div>
    </div>
  );
}