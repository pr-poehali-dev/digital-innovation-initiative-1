import { useEffect, useState } from "react";
import { deptFunctionsApi } from "@/lib/api";
import Icon from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "@/components/ui/use-toast";

type SavedSummary = {
  required_total: number; required_covered: number; required_uncovered: number;
  supporting_total: number; supporting_covered: number; supporting_uncovered: number;
  optional_total: number; optional_covered: number; optional_uncovered: number;
};
type SLModule = { module_id: number; module_name: string; module_status: string; product_name: string; vendor_name: string };
type Shortlist = {
  id: number; bundle_key: string; title: string | null; decision_status: string; decision_note: string | null;
  saved: SavedSummary; current: { required_covered: number; required_uncovered: number; supporting_covered: number; optional_covered: number };
  has_drift: boolean; drift_flags: string[]; modules: SLModule[]; is_archived: boolean;
};

interface Props { projectId: number; functionId: number; onChanged?: () => void; }

const STATUS_LABEL: Record<string, string> = { shortlisted: "В шортлисте", preferred: "Предпочтителен", rejected: "Отклонён" };
const STATUS_COLOR: Record<string, string> = {
  shortlisted: "bg-slate-100 text-slate-600", preferred: "bg-emerald-100 text-emerald-700", rejected: "bg-rose-100 text-rose-600",
};
const DRIFT_LABEL: Record<string, string> = {
  required_coverage_changed: "изменилось required-покрытие",
  supporting_coverage_changed: "изменилось supporting-покрытие",
  optional_coverage_changed: "изменилось optional-покрытие",
  module_archived: "модуль стал архивным",
};

export default function FunctionShortlistBlock({ projectId, functionId, onChanged }: Props) {
  const [items, setItems] = useState<Shortlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const [edit, setEdit] = useState<Shortlist | null>(null);
  const [form, setForm] = useState({ title: "", decision_status: "shortlisted", decision_note: "" });
  const [saving, setSaving] = useState(false);

  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareData, setCompareData] = useState<ShortlistDetail[]>([]);
  const [detail, setDetail] = useState<ShortlistDetail | null>(null);

  const load = () => {
    setLoading(true);
    deptFunctionsApi.getFunctionShortlists(projectId, functionId, showArchived)
      .then((d: { items: Shortlist[] }) => setItems(d.items || []))
      .catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId, functionId, showArchived]);

  const active = items.filter((i) => !i.is_archived);
  const archived = items.filter((i) => i.is_archived);

  const openEdit = (s: Shortlist) => {
    setEdit(s);
    setForm({ title: s.title || "", decision_status: s.decision_status, decision_note: s.decision_note || "" });
  };
  const saveEdit = () => {
    if (!edit) return;
    if ((form.decision_status === "preferred" || form.decision_status === "rejected") && !form.decision_note.trim()) {
      toast({ title: "Нужно обоснование", description: "Для «Предпочтителен» и «Отклонён» укажите причину", variant: "destructive" });
      return;
    }
    setSaving(true);
    deptFunctionsApi.updateFunctionShortlist({
      project_id: projectId, shortlist_id: edit.id, title: form.title.trim() || undefined,
      decision_status: form.decision_status, decision_note: form.decision_note.trim() || undefined,
    })
      .then(() => { toast({ title: "Обновлено" }); setEdit(null); load(); onChanged?.(); })
      .catch((e: Error) => toast({ title: "Не удалось", description: e.message, variant: "destructive" }))
      .finally(() => setSaving(false));
  };

  const setStatus = (s: Shortlist, status: string) => {
    if ((status === "preferred" || status === "rejected") && !(s.decision_note || "").trim()) {
      openEdit({ ...s, decision_status: status });
      return;
    }
    deptFunctionsApi.updateFunctionShortlist({ project_id: projectId, shortlist_id: s.id, title: s.title || undefined, decision_status: status, decision_note: s.decision_note || undefined })
      .then(() => { load(); onChanged?.(); })
      .catch((e: Error) => toast({ title: "Не удалось", description: e.message, variant: "destructive" }));
  };
  const archive = (s: Shortlist) =>
    deptFunctionsApi.archiveFunctionShortlist({ project_id: projectId, shortlist_id: s.id })
      .then(() => { load(); onChanged?.(); }).catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }));
  const restore = (s: Shortlist) =>
    deptFunctionsApi.restoreFunctionShortlist({ project_id: projectId, shortlist_id: s.id })
      .then(() => { load(); onChanged?.(); }).catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }));

  const toggleCompare = (id: number) =>
    setCompareIds((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : ids.length >= 3 ? ids : [...ids, id]);

  const openDetail = (id: number) => {
    deptFunctionsApi.getFunctionShortlistDetail(projectId, id)
      .then((d: { shortlist: ShortlistDetail }) => setDetail(d.shortlist))
      .catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }));
  };

  const runCompare = () => {
    Promise.all(compareIds.map((id) => deptFunctionsApi.getFunctionShortlistDetail(projectId, id) as Promise<{ shortlist: ShortlistDetail }>))
      .then((res) => { setCompareData(res.map((r) => r.shortlist)); setCompareOpen(true); })
      .catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }));
  };

  const Row = ({ s }: { s: Shortlist }) => (
    <div className={`rounded-lg border px-3 py-2 ${s.is_archived ? "border-slate-200 bg-slate-50 opacity-70" : "border-amber-100 bg-white"}`}>
      <div className="flex items-start gap-2">
        {!s.is_archived && (
          <input type="checkbox" checked={compareIds.includes(s.id)} onChange={() => toggleCompare(s.id)} className="mt-1 flex-shrink-0" title="Сравнить" />
        )}
        <button onClick={() => openDetail(s.id)} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium text-slate-800">{s.title || `Набор из ${s.modules.length} модулей`}</span>
            <Badge className={`text-[10px] border-0 ${STATUS_COLOR[s.decision_status] || ""}`}>{STATUS_LABEL[s.decision_status]}</Badge>
            {s.has_drift && <Badge className="text-[10px] border-0 bg-amber-100 text-amber-700" title={s.drift_flags.map((f) => DRIFT_LABEL[f] || f).join(", ")}>дрейф</Badge>}
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {s.modules.map((m) => <Badge key={m.module_id} variant="secondary" className="text-[10px]">{m.module_name}{m.module_status !== "active" ? " (арх.)" : ""}</Badge>)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            required {s.current.required_covered}/{s.saved.required_total}
            {s.current.required_covered !== s.saved.required_covered && <span className="text-amber-600"> (было {s.saved.required_covered})</span>}
            {" · "}supporting {s.current.supporting_covered}/{s.saved.supporting_total}
          </div>
          {s.decision_note && <div className="text-[11px] text-slate-400 mt-0.5 italic">«{s.decision_note}»</div>}
        </button>
        <div className="flex flex-col gap-1 flex-shrink-0">
          {s.is_archived ? (
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Восстановить" onClick={() => restore(s)}><Icon name="ArchiveRestore" size={13} /></Button>
          ) : (
            <>
              {s.decision_status !== "preferred" && <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-emerald-600" title="Сделать предпочтительным" onClick={() => setStatus(s, "preferred")}><Icon name="Star" size={13} /></Button>}
              {s.decision_status !== "rejected" && <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-rose-500" title="Отклонить" onClick={() => setStatus(s, "rejected")}><Icon name="X" size={13} /></Button>}
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Редактировать" onClick={() => openEdit(s)}><Icon name="Pencil" size={13} /></Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-400" title="Архивировать" onClick={() => archive(s)}><Icon name="Archive" size={13} /></Button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="mt-3 border border-slate-200 rounded-lg p-3 bg-amber-50/30">
      <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
        <div className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
          <Icon name="ListChecks" size={15} /> Шортлист решений
          {active.length > 0 && <Badge variant="secondary" className="text-[10px]">{active.length}</Badge>}
        </div>
        <div className="flex items-center gap-1.5">
          {compareIds.length >= 2 && (
            <Button size="sm" className="h-7 text-xs" onClick={runCompare}>
              <Icon name="Columns3" size={12} className="mr-1" /> Сравнить ({compareIds.length})
            </Button>
          )}
          {archived.length > 0 && (
            <button onClick={() => setShowArchived((v) => !v)} className="text-xs text-slate-500 underline underline-offset-2">
              {showArchived ? "Скрыть архив" : `Архив (${archived.length})`}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-slate-400 py-2">Загрузка…</div>
      ) : active.length === 0 && archived.length === 0 ? (
        <div className="text-xs text-slate-400 py-2">Пока нет сохранённых наборов. Сохраните кандидатный набор кнопкой «В шортлист».</div>
      ) : (
        <div className="space-y-1.5">
          {active.map((s) => <Row key={s.id} s={s} />)}
          {showArchived && archived.map((s) => <Row key={s.id} s={s} />)}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Решение по набору</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1">
                {edit.modules.map((m) => <Badge key={m.module_id} variant="secondary" className="text-[10px]">{m.module_name}</Badge>)}
              </div>
              <div className="text-[11px] text-slate-400">Состав неизменяем — редактируется только решение.</div>
              <div>
                <div className="text-[11px] text-slate-500 mb-0.5">Название</div>
                <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div>
                <div className="text-[11px] text-slate-500 mb-0.5">Статус</div>
                <Select value={form.decision_status} onValueChange={(v) => setForm((f) => ({ ...f, decision_status: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shortlisted" className="text-xs">В шортлисте</SelectItem>
                    <SelectItem value="preferred" className="text-xs">Предпочтителен</SelectItem>
                    <SelectItem value="rejected" className="text-xs">Отклонён</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-[11px] text-slate-500 mb-0.5">Обоснование {(form.decision_status === "preferred" || form.decision_status === "rejected") && <span className="text-rose-500">*</span>}</div>
                <Textarea value={form.decision_note} onChange={(e) => setForm((f) => ({ ...f, decision_note: e.target.value }))} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)} disabled={saving}>Отмена</Button>
            <Button onClick={saveEdit} disabled={saving}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail sheet */}
      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          {detail && <ShortlistDetailView s={detail} />}
        </SheetContent>
      </Sheet>

      {/* Compare dialog */}
      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Сравнение наборов</DialogTitle></DialogHeader>
          <CompareView data={compareData} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Detail types & views ──────────────────────────────────────────────
type CapResult = {
  capability_id: number; capability_name: string; need_level: string; priority_level: string;
  covered: boolean; best_coverage_level: string | null;
};
type ShortlistDetail = {
  id: number; title: string | null; decision_status: string; decision_note: string | null; bundle_key: string;
  modules: { module_id: number; module_name: string; module_status: string; product_name: string; vendor_name: string; deployment_types: string[] }[];
  saved: SavedSummary;
  current: {
    required_total: number; required_covered: number; required_uncovered: number;
    supporting_total: number; supporting_covered: number; optional_total: number; optional_covered: number;
    capability_results: CapResult[];
    uncovered_capabilities: { capability_id: number; capability_name: string; need_level: string }[];
    module_contributions: { module_id: number; module_name: string; unique_required_coverage_count: number; unique_supporting_coverage_count: number; best_covered_capabilities: string[] }[];
    non_contributing_module_ids: number[];
  };
  has_drift: boolean; drift_flags: string[];
};

const NEED_COLOR: Record<string, string> = { required: "bg-rose-100 text-rose-700", supporting: "bg-blue-100 text-blue-700", optional: "bg-slate-100 text-slate-500" };
const COV_LABEL: Record<string, string> = { core: "базовая", supporting: "поддержка", limited: "частично" };

function ShortlistDetailView({ s }: { s: ShortlistDetail }) {
  const c = s.current;
  return (
    <>
      <SheetHeader><SheetTitle className="text-left">{s.title || "Набор модулей"}</SheetTitle></SheetHeader>
      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap gap-1">
          {s.modules.map((m) => <Badge key={m.module_id} variant="secondary" className="text-[10px]">{m.module_name}{m.module_status !== "active" ? " (арх.)" : ""}</Badge>)}
        </div>
        {s.has_drift && (
          <div className="text-xs rounded-md bg-amber-50 text-amber-700 px-2.5 py-1.5">
            Дрейф с момента сохранения: {s.drift_flags.map((f) => DRIFT_LABEL[f] || f).join(", ")}
          </div>
        )}
        <div className="text-xs text-slate-600">
          <div className="font-semibold text-slate-500 uppercase mb-1">Покрытие (текущее vs сохранённое)</div>
          <div>required: {c.required_covered}/{c.required_total} <span className="text-slate-400">(было {s.saved.required_covered}/{s.saved.required_total})</span></div>
          <div>supporting: {c.supporting_covered}/{c.supporting_total} <span className="text-slate-400">(было {s.saved.supporting_covered})</span></div>
          <div>optional: {c.optional_covered}/{c.optional_total}</div>
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Что покрывает</div>
          <div className="space-y-1">
            {c.capability_results.map((cr) => (
              <div key={cr.capability_id} className="flex items-center gap-1.5 flex-wrap rounded-md border border-slate-100 px-2.5 py-1.5">
                <span className="text-sm text-slate-800 flex-1 min-w-0">{cr.capability_name}</span>
                <Badge className={`text-[10px] border-0 ${NEED_COLOR[cr.need_level] || ""}`}>{cr.need_level}</Badge>
                {cr.covered && cr.best_coverage_level
                  ? <Badge variant="secondary" className="text-[10px]">{COV_LABEL[cr.best_coverage_level]}</Badge>
                  : <Badge className="text-[10px] border-0 bg-amber-100 text-amber-700">нет</Badge>}
              </div>
            ))}
          </div>
        </div>

        {c.module_contributions.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Вклад модулей</div>
            <div className="space-y-1">
              {c.module_contributions.map((mc) => (
                <div key={mc.module_id} className="rounded-md border border-slate-100 px-2.5 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-800">{mc.module_name}</span>
                    <span className="text-[10px] text-slate-400">R{mc.unique_required_coverage_count} · S{mc.unique_supporting_coverage_count}</span>
                  </div>
                  {mc.best_covered_capabilities.length > 0 && <div className="text-[11px] text-slate-500 mt-0.5">{mc.best_covered_capabilities.join(", ")}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {s.decision_note && (
          <div className="text-xs text-slate-500 italic border-t border-slate-100 pt-2">«{s.decision_note}»</div>
        )}
      </div>
    </>
  );
}

function CompareView({ data }: { data: ShortlistDetail[] }) {
  if (data.length === 0) return null;
  const rows: { label: string; get: (s: ShortlistDetail) => string }[] = [
    { label: "Статус", get: (s) => STATUS_LABEL[s.decision_status] },
    { label: "Модули", get: (s) => s.modules.map((m) => m.module_name).join(", ") },
    { label: "Продукты", get: (s) => Array.from(new Set(s.modules.map((m) => m.product_name))).join(", ") },
    { label: "Вендоры", get: (s) => Array.from(new Set(s.modules.map((m) => m.vendor_name))).join(", ") },
    { label: "required", get: (s) => `${s.current.required_covered}/${s.current.required_total}` },
    { label: "supporting", get: (s) => `${s.current.supporting_covered}/${s.current.supporting_total}` },
    { label: "optional", get: (s) => `${s.current.optional_covered}/${s.current.optional_total}` },
    { label: "required gaps", get: (s) => String(s.current.required_uncovered) },
    { label: "Дрейф", get: (s) => s.has_drift ? "да" : "нет" },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="text-left p-2 text-slate-400 font-medium"></th>
            {data.map((s) => <th key={s.id} className="text-left p-2 font-semibold text-slate-700 min-w-[140px]">{s.title || `#${s.id}`}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-slate-100">
              <td className="p-2 text-slate-500 whitespace-nowrap">{r.label}</td>
              {data.map((s) => <td key={s.id} className="p-2 text-slate-700 align-top">{r.get(s)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
