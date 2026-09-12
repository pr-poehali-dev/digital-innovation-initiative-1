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
import PageGuide from "@/components/exec/PageGuide";
import { execPageGuides } from "@/config/execPageGuides";
import {
  execResourcesApi, ResourceAssignment, CostCategory, BudgetVersion, BudgetLine,
  FinancialSummary, CapacityAssignmentRow, FotRow, FinancialActual, FinancialCommitment,
  FinancialExpected,
} from "@/lib/execResourcesApi";

const MONTHS_SHORT = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

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

  const pickDefaultVersion = (items: BudgetVersion[]) => items.find((v) => v.is_active) || items[0] || null;

  const loadVersions = useCallback(() => {
    execResourcesApi.budgetVersions(kind, parentId).then((d) => {
      setVersions(d.items);
      if (d.items.length > 0 && !activeVersion) setActiveVersion(pickDefaultVersion(d.items));
    });
  }, [kind, parentId, activeVersion]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      execResourcesApi.costCategories().then((d) => setCategories(d.items)),
      execResourcesApi.budgetVersions(kind, parentId).then((d) => { setVersions(d.items); setActiveVersion(pickDefaultVersion(d.items)); }),
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

  const [lastSnapshotId, setLastSnapshotId] = useState<number | null>(null);

  const approveVersion = async () => {
    if (!activeVersion) return;
    await execResourcesApi.setBudgetVersionStatus(activeVersion.id, "approved");
    const d = await execResourcesApi.budgetVersions(kind, parentId);
    setVersions(d.items);
    setActiveVersion(d.items.find((v) => v.id === activeVersion.id) || null);
    execResourcesApi.financialSummary(kind, parentId).then(setFinancial);
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
    setLastSnapshotId(r.id);
    setSnapMsg(`Финансовый снимок №${r.id} опубликован (версия ${r.version_number})`);
  };

  const exportSnapshotXlsx = async () => {
    if (!lastSnapshotId) return;
    const r = await execResourcesApi.exportFinancialXlsx(lastSnapshotId);
    const link = document.createElement("a");
    link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${r.content_base64}`;
    link.download = r.filename;
    link.click();
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <PageGuide {...execPageGuides.budget} />

      {financial && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {"approved_budget" in financial && (
            <>
              <MiniMetric label="Утверждено" value={financial.approved_budget} />
              <MiniMetric label="Факт" value={financial.fact} />
              <MiniMetric label="Обязательства (открыто)" value={financial.commitments_open} />
              <MiniMetric label="Ожидаемые расходы" value={financial.expected} />
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
              <MiniMetric label="Собственные (нераспределённые)" value={financial.own_budget} />
              <MiniMetric label="Факт" value={financial.total_fact} />
            </>
          )}
        </div>
      )}

      {financial?.by_project && financial.by_project.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold text-muted-foreground mb-2">Расшифровка по проектам (без двойного счёта)</div>
          <div className="space-y-1">
            {financial.by_project.map((p) => (
              <a key={p.id} href={`/cabinet/exec/portfolio/projects/${p.id}`} className="text-xs flex justify-between border-b border-slate-100 py-1.5 hover:text-violet-700">
                <span>{p.title}</span>
                <span>{p.budget.toLocaleString("ru-RU")} ₽ (факт {p.fact.toLocaleString("ru-RU")} ₽)</span>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={activeVersion ? String(activeVersion.id) : ""} onValueChange={(v) => setActiveVersion(versions.find((x) => String(x.id) === v) || null)}>
          <SelectTrigger className="text-sm w-64"><SelectValue placeholder="Выберите версию" /></SelectTrigger>
          <SelectContent>
            {versions.map((v) => (
              <SelectItem key={v.id} value={String(v.id)}>
                {v.year} — {v.version_label} ({BUDGET_STATUS_LABEL[v.version_status]}){v.is_active ? " · действующая" : ""}
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
            <Icon name="CheckCircle2" size={13} className="mr-1" /> Утвердить (станет действующей)
          </Button>
        )}
        {activeVersion && (
          <Button size="sm" variant="outline" onClick={publishSnapshot}>
            <Icon name="Camera" size={13} className="mr-1" /> Снимок
          </Button>
        )}
        {lastSnapshotId && (
          <Button size="sm" variant="outline" onClick={exportSnapshotXlsx}>
            <Icon name="Table" size={13} className="mr-1" /> XLSX снимка
          </Button>
        )}
      </div>

      {activeVersion?.is_active && (
        <div className="text-xs bg-emerald-50 text-emerald-800 rounded-lg px-3 py-2 flex items-center gap-1.5">
          <Icon name="CheckCircle2" size={12} /> Это действующая версия бюджета
          {activeVersion.effective_date && ` с ${activeVersion.effective_date}`}
        </div>
      )}

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

// ============ ВКЛАДКА ЗАГРУЗКА (помесячный план/факт) ============

export function CapacityTab({ kind, parentId }: { kind: "project" | "initiative"; parentId: number }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<CapacityAssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editCell, setEditCell] = useState<{ assignmentId: number; month: number; plan: string; fact: string; days: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    execResourcesApi.capacityPlan(kind, parentId, year).then((d) => setRows(d.items)).finally(() => setLoading(false));
  }, [kind, parentId, year]);

  useEffect(load, [load]);

  const saveCell = async () => {
    if (!editCell) return;
    await execResourcesApi.saveCapacityCell({
      assignment_id: editCell.assignmentId, year, month: editCell.month,
      plan_load_pct: editCell.plan || undefined, fact_load_pct: editCell.fact || undefined,
      plan_days: editCell.days || undefined,
    });
    setEditCell(null);
    load();
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setYear(year - 1)}><Icon name="ChevronLeft" size={14} /></Button>
        <div className="text-sm font-semibold w-16 text-center">{year}</div>
        <Button size="sm" variant="outline" onClick={() => setYear(year + 1)}><Icon name="ChevronRight" size={14} /></Button>
      </div>

      {rows.length === 0 ? <Empty text="Команда пока не сформирована" icon="CalendarRange" /> : (
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-1.5 pr-2 sticky left-0 bg-white">Участник</th>
                {MONTHS_SHORT.map((m) => <th key={m} className="px-1 py-1.5 text-center font-medium">{m}</th>)}
                <th className="px-1 py-1.5 text-center font-medium">Год, ср.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.assignment_id} className="border-b border-slate-100">
                  <td className="py-1.5 pr-2 sticky left-0 bg-white whitespace-nowrap">
                    {r.person_name || r.role_title_ref || r.role_title || "—"}
                    {r.is_vacant && <span className="ml-1 text-amber-600">(вак.)</span>}
                  </td>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                    const cell = r.months[String(m)] || r.months[m];
                    const overload = (r.overload_by_month[String(m)] || r.overload_by_month[m] || 0) > 100;
                    return (
                      <td key={m} className="px-1 py-1.5 text-center">
                        <button
                          onClick={() => setEditCell({
                            assignmentId: r.assignment_id, month: m,
                            plan: String(cell?.plan_load_pct ?? ""), fact: String(cell?.fact_load_pct ?? ""), days: String(cell?.plan_days ?? ""),
                          })}
                          className={`w-full rounded px-1 py-0.5 ${overload ? "bg-red-100 text-red-700" : "bg-slate-50 hover:bg-slate-100"}`}
                          title={overload ? "Перегрузка по всем проектам в этом месяце" : ""}
                        >
                          {cell?.plan_load_pct ?? 0}%
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-1 py-1.5 text-center font-medium">{r.year_avg_plan_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!editCell} onOpenChange={(v) => !v && setEditCell(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Загрузка за {editCell ? MONTHS_SHORT[editCell.month - 1] : ""}</DialogTitle></DialogHeader>
          {editCell && (
            <div className="space-y-3">
              <Field label="Плановая загрузка, %">
                <Input type="number" value={editCell.plan} onChange={(e) => setEditCell({ ...editCell, plan: e.target.value })} />
              </Field>
              <Field label="Фактическая загрузка, %">
                <Input type="number" value={editCell.fact} onChange={(e) => setEditCell({ ...editCell, fact: e.target.value })} />
              </Field>
              <Field label="Человеко-дни (план)">
                <Input type="number" value={editCell.days} onChange={(e) => setEditCell({ ...editCell, days: e.target.value })} />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCell(null)}>Отмена</Button>
            <Button onClick={saveCell}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ ВКЛАДКА ФОТ ============

export function FotTab({ kind, parentId }: { kind: "project" | "initiative"; parentId: number }) {
  const [items, setItems] = useState<FotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Record<string, string>>({ cost_basis: "role_average" });
  const [assignments, setAssignments] = useState<ResourceAssignment[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      execResourcesApi.fot(kind, parentId).then((d) => setItems(d.items)),
      execResourcesApi.assignments(kind, parentId).then((d) => setAssignments(d.items)),
    ]).finally(() => setLoading(false));
  }, [kind, parentId]);

  useEffect(load, [load]);

  const add = async () => {
    if (!form.month) return;
    await execResourcesApi.saveFot({
      ...form, [`${kind}_id`]: parentId,
      assignment_id: form.assignment_id ? Number(form.assignment_id) : undefined,
    });
    setForm({ cost_basis: "role_average" });
    load();
  };

  const totalPlan = items.reduce((s, f) => s + Number(f.plan_total), 0);
  const totalFact = items.reduce((s, f) => s + Number(f.fact_total || 0), 0);

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <MiniMetric label="ФОТ план (год)" value={totalPlan} />
        <MiniMetric label="ФОТ факт (год)" value={totalFact} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
        <div className="text-xs font-semibold text-muted-foreground">Добавить строку ФОТ</div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={form.assignment_id || "none"} onValueChange={(v) => setForm({ ...form, assignment_id: v === "none" ? "" : v })}>
            <SelectTrigger className="text-sm"><SelectValue placeholder="Участник (необязательно)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Без привязки к участнику</SelectItem>
              {assignments.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>{a.person_name || a.role_title || a.role_title_ref}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="month" value={form.month || ""} onChange={(e) => setForm({ ...form, month: e.target.value ? `${e.target.value}-01` : "" })} />
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Input type="number" placeholder="Базовая ставка" value={form.base_cost || ""} onChange={(e) => setForm({ ...form, base_cost: e.target.value })} />
          <Input type="number" placeholder="Премии" value={form.bonus || ""} onChange={(e) => setForm({ ...form, bonus: e.target.value })} />
          <Input type="number" placeholder="Начисления" value={form.accruals || ""} onChange={(e) => setForm({ ...form, accruals: e.target.value })} />
          <Input type="number" placeholder="Прочее" value={form.other_payments || ""} onChange={(e) => setForm({ ...form, other_payments: e.target.value })} />
        </div>
        <div className="text-[11px] text-muted-foreground">
          По умолчанию используется обезличенная стоимость роли, а не индивидуальный оклад
        </div>
        <Button size="sm" onClick={add}>Добавить</Button>
      </div>

      {items.length === 0 ? <Empty text="Строк ФОТ пока нет" icon="Wallet" /> : (
        <div className="space-y-1">
          {items.map((f) => (
            <div key={f.id} className="text-xs flex justify-between border-b border-slate-100 py-1.5">
              <span>{f.person_name || f.role_title || "Роль"} · {f.month}</span>
              <span className="font-medium">{Number(f.plan_total).toLocaleString("ru-RU")} ₽</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ ВКЛАДКА ПЛАН-ФАКТ ============

export function PlanFactTab({ kind, parentId }: { kind: "project" | "initiative"; parentId: number }) {
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [actuals, setActuals] = useState<FinancialActual[]>([]);
  const [commitments, setCommitments] = useState<FinancialCommitment[]>([]);
  const [expected, setExpected] = useState<FinancialExpected[]>([]);
  const [categories, setCategories] = useState<CostCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const [actualForm, setActualForm] = useState<Record<string, string>>({});
  const [commitmentForm, setCommitmentForm] = useState<Record<string, string>>({});
  const [expectedForm, setExpectedForm] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      execResourcesApi.financialSummary(kind, parentId).then(setSummary),
      execResourcesApi.actuals(kind, parentId).then((d) => setActuals(d.items)),
      execResourcesApi.commitments(kind, parentId).then((d) => setCommitments(d.items)),
      execResourcesApi.expected(kind, parentId).then((d) => setExpected(d.items)),
      execResourcesApi.costCategories().then((d) => setCategories(d.items)),
    ]).finally(() => setLoading(false));
  }, [kind, parentId]);

  useEffect(load, [load]);

  const addActual = async () => {
    if (!actualForm.category_id || !actualForm.month || !actualForm.amount) return;
    await execResourcesApi.saveActual({ ...actualForm, [`${kind}_id`]: parentId, month: `${actualForm.month}-01` });
    setActualForm({});
    load();
  };

  const addCommitment = async () => {
    if (!commitmentForm.category_id || !commitmentForm.amount) return;
    await execResourcesApi.saveCommitment({ ...commitmentForm, [`${kind}_id`]: parentId });
    setCommitmentForm({});
    load();
  };

  const addExpected = async () => {
    if (!expectedForm.category_id || !expectedForm.month || !expectedForm.amount) return;
    await execResourcesApi.saveExpected({ ...expectedForm, [`${kind}_id`]: parentId, month: `${expectedForm.month}-01` });
    setExpectedForm({});
    load();
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-5">
      {summary && "approved_budget" in summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <MiniMetric label="Утверждённый бюджет" value={summary.approved_budget} />
          <MiniMetric label="Факт" value={summary.fact} />
          <MiniMetric label="Обязательства всего" value={summary.commitments_total} />
          <MiniMetric label="Обязательства оплачено" value={summary.commitments_paid} />
          <MiniMetric label="Обязательства открыто" value={summary.commitments_open} />
          <MiniMetric label="Ожидаемые расходы" value={summary.expected} />
          <MiniMetric label="Прогноз" value={summary.forecast} />
          <MiniMetric label="Остаток" value={summary.remaining} tone={(summary.remaining ?? 0) < 0 ? "danger" : "default"} />
          {summary.deviation_pct !== null && summary.deviation_pct !== undefined && (
            <MiniMetric label="Отклонение" value={`${summary.deviation_pct}%`} tone={summary.deviation_pct > 0 ? "danger" : "default"} isText />
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
        <div className="text-xs font-semibold">Фактические расходы</div>
        <div className="grid grid-cols-3 gap-2">
          <Select value={actualForm.category_id || ""} onValueChange={(v) => setActualForm({ ...actualForm, category_id: v })}>
            <SelectTrigger className="text-sm"><SelectValue placeholder="Статья" /></SelectTrigger>
            <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="month" value={actualForm.month || ""} onChange={(e) => setActualForm({ ...actualForm, month: e.target.value })} />
          <Input type="number" placeholder="Сумма" value={actualForm.amount || ""} onChange={(e) => setActualForm({ ...actualForm, amount: e.target.value })} />
        </div>
        <Button size="sm" onClick={addActual}>Добавить</Button>
        {actuals.length > 0 && (
          <div className="space-y-1 pt-2">
            {actuals.map((a) => (
              <div key={a.id} className="text-xs flex justify-between border-b border-slate-100 py-1">
                <span>{a.category_title} · {a.month}</span><span>{Number(a.amount).toLocaleString("ru-RU")} ₽</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
        <div className="text-xs font-semibold">Обязательства (договоры)</div>
        <div className="text-[11px] text-muted-foreground">
          Указывайте отдельно общую сумму и уже оплаченную часть — оплаченное не задваивается с фактом
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={commitmentForm.category_id || ""} onValueChange={(v) => setCommitmentForm({ ...commitmentForm, category_id: v })}>
            <SelectTrigger className="text-sm"><SelectValue placeholder="Статья" /></SelectTrigger>
            <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="Номер договора" value={commitmentForm.contract_ref || ""} onChange={(e) => setCommitmentForm({ ...commitmentForm, contract_ref: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input type="number" placeholder="Общая сумма" value={commitmentForm.amount || ""} onChange={(e) => setCommitmentForm({ ...commitmentForm, amount: e.target.value })} />
          <Input type="number" placeholder="Оплачено" value={commitmentForm.paid_amount || ""} onChange={(e) => setCommitmentForm({ ...commitmentForm, paid_amount: e.target.value })} />
        </div>
        <Button size="sm" onClick={addCommitment}>Добавить</Button>
        {commitments.length > 0 && (
          <div className="space-y-1 pt-2">
            {commitments.map((c) => (
              <div key={c.id} className="text-xs flex justify-between border-b border-slate-100 py-1">
                <span>{c.category_title} · {c.contract_ref || "без номера"}</span>
                <span>{Number(c.amount).toLocaleString("ru-RU")} ₽ (оплачено {Number(c.paid_amount).toLocaleString("ru-RU")})</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
        <div className="text-xs font-semibold">Ожидаемые расходы без оформленного обязательства</div>
        <div className="grid grid-cols-3 gap-2">
          <Select value={expectedForm.category_id || ""} onValueChange={(v) => setExpectedForm({ ...expectedForm, category_id: v })}>
            <SelectTrigger className="text-sm"><SelectValue placeholder="Статья" /></SelectTrigger>
            <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="month" value={expectedForm.month || ""} onChange={(e) => setExpectedForm({ ...expectedForm, month: e.target.value })} />
          <Input type="number" placeholder="Сумма" value={expectedForm.amount || ""} onChange={(e) => setExpectedForm({ ...expectedForm, amount: e.target.value })} />
        </div>
        <Button size="sm" onClick={addExpected}>Добавить</Button>
        {expected.length > 0 && (
          <div className="space-y-1 pt-2">
            {expected.map((e) => (
              <div key={e.id} className="text-xs flex justify-between border-b border-slate-100 py-1">
                <span>{e.category_title} · {e.month}</span><span>{Number(e.amount).toLocaleString("ru-RU")} ₽</span>
              </div>
            ))}
          </div>
        )}
      </div>
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