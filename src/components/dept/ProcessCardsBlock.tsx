import { useEffect, useState } from "react";
import { deptFunctionsApi } from "@/lib/api";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import {
  TRIGGER_TYPES, INPUT_TYPES, OUTPUT_TYPES, SLA, PAIN_POINTS, type Opt,
} from "@/components/dept/operatingProfileOptions";

type ProcessCard = {
  id: number;
  name: string;
  summary: string | null;
  trigger_type: string | null;
  trigger_note: string | null;
  input_types: string[];
  input_note: string | null;
  output_types: string[];
  output_note: string | null;
  systems_used: string[];
  participants: string[];
  sla_criticality: string | null;
  sla_note: string | null;
  pain_points: string[];
  automation_notes: string | null;
  is_archived: boolean;
};

interface Props {
  projectId: number;
  functionId: number;
  onChanged?: () => void;
}

const EMPTY: Partial<ProcessCard> = {
  name: "", summary: "", trigger_type: "", trigger_note: "",
  input_types: [], input_note: "", output_types: [], output_note: "",
  systems_used: [], participants: [], sla_criticality: "", sla_note: "",
  pain_points: [], automation_notes: "",
};

const labelOf = (opts: Opt[], v: string) => opts.find((o) => o.value === v)?.label || v;

export default function ProcessCardsBlock({ projectId, functionId, onChanged }: Props) {
  const [cards, setCards] = useState<ProcessCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<ProcessCard>>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = (withArchived = showArchived) => {
    setLoading(true);
    deptFunctionsApi.getProcessCards(projectId, functionId, withArchived)
      .then((d: { cards: ProcessCard[] }) => setCards(d.cards || []))
      .catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(showArchived); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId, functionId, showArchived]);

  const openCreate = () => { setDraft({ ...EMPTY }); setDialogOpen(true); };
  const openEdit = (c: ProcessCard) => { setDraft({ ...c }); setDialogOpen(true); };

  const set = (k: keyof ProcessCard, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));
  const toggleMulti = (k: keyof ProcessCard, val: string) =>
    setDraft((d) => {
      const arr = (d[k] as string[]) || [];
      return { ...d, [k]: arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val] };
    });
  const setTags = (k: keyof ProcessCard, raw: string) =>
    set(k, raw.split(",").map((s) => s.trim()).filter(Boolean));

  const save = () => {
    if (!(draft.name || "").trim()) {
      toast({ title: "Укажите название карточки", variant: "destructive" });
      return;
    }
    setSaving(true);
    const isEdit = !!draft.id;
    const req = isEdit
      ? deptFunctionsApi.updateProcessCard({ project_id: projectId, card: draft as Record<string, unknown> })
      : deptFunctionsApi.createProcessCard({ project_id: projectId, function_id: functionId, card: draft as Record<string, unknown> });
    req
      .then(() => { toast({ title: isEdit ? "Карточка обновлена" : "Карточка добавлена" }); setDialogOpen(false); load(); onChanged?.(); })
      .catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }))
      .finally(() => setSaving(false));
  };

  const archive = (c: ProcessCard) =>
    deptFunctionsApi.archiveProcessCard({ project_id: projectId, card_id: c.id })
      .then(() => { load(); onChanged?.(); });
  const restore = (c: ProcessCard) =>
    deptFunctionsApi.restoreProcessCard({ project_id: projectId, card_id: c.id })
      .then(() => { load(); onChanged?.(); });

  const active = cards.filter((c) => !c.is_archived);
  const archived = cards.filter((c) => c.is_archived);

  const MultiBtns = ({ field, opts }: { field: keyof ProcessCard; opts: Opt[] }) => {
    const arr = (draft[field] as string[]) || [];
    return (
      <div className="flex flex-wrap gap-1">
        {opts.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => toggleMulti(field, o.value)}
            className={`text-[11px] px-1.5 py-0.5 rounded border ${arr.includes(o.value) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  };

  const CardRow = ({ c }: { c: ProcessCard }) => (
    <div className={`rounded-lg border px-3 py-2 ${c.is_archived ? "border-slate-200 bg-slate-50 opacity-70" : "border-indigo-100 bg-white"}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-800">{c.name}</div>
          {c.summary && <div className="text-xs text-slate-500 mt-0.5">{c.summary}</div>}
          <div className="flex flex-wrap gap-1 mt-1.5">
            {c.trigger_type && <Badge variant="secondary" className="text-[10px]">⚡ {labelOf(TRIGGER_TYPES, c.trigger_type)}</Badge>}
            {c.sla_criticality && <Badge variant="secondary" className="text-[10px]">SLA: {labelOf(SLA, c.sla_criticality)}</Badge>}
            {c.input_types.length > 0 && <Badge variant="secondary" className="text-[10px]">входы: {c.input_types.length}</Badge>}
            {c.output_types.length > 0 && <Badge variant="secondary" className="text-[10px]">выходы: {c.output_types.length}</Badge>}
            {c.systems_used.length > 0 && <Badge variant="secondary" className="text-[10px]">систем: {c.systems_used.length}</Badge>}
            {c.pain_points.length > 0 && <Badge variant="secondary" className="text-[10px] bg-rose-50 text-rose-600">боли: {c.pain_points.length}</Badge>}
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {c.is_archived ? (
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Восстановить" onClick={() => restore(c)}>
              <Icon name="ArchiveRestore" size={13} />
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Редактировать" onClick={() => openEdit(c)}>
                <Icon name="Pencil" size={13} />
              </Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-400" title="Архивировать" onClick={() => archive(c)}>
                <Icon name="Archive" size={13} />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="mt-3 border border-slate-200 rounded-lg p-3 bg-indigo-50/30">
      <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
        <div className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
          <Icon name="Workflow" size={15} /> Процессные карточки (внутри функции)
        </div>
        <div className="flex items-center gap-1.5">
          {archived.length > 0 && (
            <button onClick={() => setShowArchived((v) => !v)} className="text-xs text-slate-500 underline underline-offset-2">
              {showArchived ? "Скрыть архив" : `Архив (${archived.length})`}
            </button>
          )}
          <Button size="sm" className="h-7 text-xs" onClick={openCreate}>
            <Icon name="Plus" size={12} className="mr-1" /> Добавить карточку
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-slate-400 py-2">Загрузка…</div>
      ) : active.length === 0 && archived.length === 0 ? (
        <div className="text-xs text-slate-400 py-2">Пока нет процессных карточек. Добавьте первую, чтобы описать процессы внутри функции.</div>
      ) : (
        <div className="space-y-1.5">
          {active.map((c) => <CardRow key={c.id} c={c} />)}
          {showArchived && archived.map((c) => <CardRow key={c.id} c={c} />)}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Редактирование карточки" : "Новая процессная карточка"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="text-[11px] text-slate-500 mb-0.5">Название *</div>
              <Input value={draft.name || ""} onChange={(e) => set("name", e.target.value)} placeholder="Название процесса" />
            </div>
            <div>
              <div className="text-[11px] text-slate-500 mb-0.5">Краткое описание</div>
              <Textarea value={draft.summary || ""} onChange={(e) => set("summary", e.target.value)} rows={2} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] text-slate-500 mb-0.5">Тип триггера</div>
                <Select value={draft.trigger_type || ""} onValueChange={(v) => set("trigger_type", v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{TRIGGER_TYPES.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-[11px] text-slate-500 mb-0.5">Комментарий к триггеру</div>
                <Input value={draft.trigger_note || ""} onChange={(e) => set("trigger_note", e.target.value)} className="h-8 text-xs" />
              </div>
            </div>

            <div>
              <div className="text-[11px] text-slate-500 mb-1">Типы входов</div>
              <MultiBtns field="input_types" opts={INPUT_TYPES} />
              <Input value={draft.input_note || ""} onChange={(e) => set("input_note", e.target.value)} placeholder="Комментарий к входам" className="h-8 text-xs mt-1.5" />
            </div>
            <div>
              <div className="text-[11px] text-slate-500 mb-1">Типы выходов</div>
              <MultiBtns field="output_types" opts={OUTPUT_TYPES} />
              <Input value={draft.output_note || ""} onChange={(e) => set("output_note", e.target.value)} placeholder="Комментарий к выходам" className="h-8 text-xs mt-1.5" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] text-slate-500 mb-0.5">Системы (через запятую)</div>
                <Input defaultValue={(draft.systems_used || []).join(", ")} onBlur={(e) => setTags("systems_used", e.target.value)} className="h-8 text-xs" />
              </div>
              <div>
                <div className="text-[11px] text-slate-500 mb-0.5">Участники (через запятую)</div>
                <Input defaultValue={(draft.participants || []).join(", ")} onBlur={(e) => setTags("participants", e.target.value)} className="h-8 text-xs" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] text-slate-500 mb-0.5">Критичность SLA</div>
                <Select value={draft.sla_criticality || ""} onValueChange={(v) => set("sla_criticality", v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{SLA.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-[11px] text-slate-500 mb-0.5">Комментарий по сроку / SLA</div>
                <Input value={draft.sla_note || ""} onChange={(e) => set("sla_note", e.target.value)} className="h-8 text-xs" />
              </div>
            </div>

            <div>
              <div className="text-[11px] text-slate-500 mb-1">Боли</div>
              <MultiBtns field="pain_points" opts={PAIN_POINTS} />
            </div>
            <div>
              <div className="text-[11px] text-slate-500 mb-0.5">Заметки по автоматизации</div>
              <Textarea value={draft.automation_notes || ""} onChange={(e) => set("automation_notes", e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Отмена</Button>
            <Button onClick={save} disabled={saving}>{draft.id ? "Сохранить" : "Добавить"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
