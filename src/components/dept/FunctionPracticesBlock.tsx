import { useEffect, useMemo, useState } from "react";
import { deptFunctionsApi, solutionsRegistryApi } from "@/lib/api";
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
  RELEVANCE, RELEVANCE_COLOR, SOURCE_KIND, REASON_TAGS, labelOf,
} from "@/components/dept/functionPracticeOptions";

type Mapping = {
  id: number;
  relevance_level: string;
  reason_tags: string[];
  rationale_note: string | null;
  source_kind: string;
  is_archived: boolean;
  practice_id: number;
  practice_slug: string;
  practice_name: string;
  practice_category: string;
  practice_summary: string | null;
  practice_is_digital: boolean;
  practice_status: string;
  capability_count: number;
};

type RegistryPractice = {
  id: number; slug: string; name: string; category: string; summary: string | null;
  is_digital: boolean; status: string; capability_count: number;
};

interface Props {
  projectId: number;
  functionId: number;
  onChanged?: () => void;
}

const emptyForm = () => ({
  relevance_level: "primary",
  reason_tags: [] as string[],
  rationale_note: "",
  source_kind: "manual",
});

export default function FunctionPracticesBlock({ projectId, functionId, onChanged }: Props) {
  const [items, setItems] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  // диалог: режим picker (выбор практики) -> форма explainability, либо режим edit
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editMapping, setEditMapping] = useState<Mapping | null>(null);
  const [pickedPractice, setPickedPractice] = useState<RegistryPractice | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  // picker
  const [registry, setRegistry] = useState<RegistryPractice[]>([]);
  const [registryLoaded, setRegistryLoaded] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerCategory, setPickerCategory] = useState("all");

  const load = () => {
    setLoading(true);
    deptFunctionsApi.getFunctionPractices(projectId, functionId, true)
      .then((d: { items: Mapping[] }) => setItems(d.items || []))
      .catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId, functionId]);

  const active = items.filter((m) => !m.is_archived);
  const archived = items.filter((m) => m.is_archived);
  const activePracticeIds = useMemo(() => new Set(active.map((m) => m.practice_id)), [active]);

  const openPicker = () => {
    setEditMapping(null);
    setPickedPractice(null);
    setForm(emptyForm());
    setDialogOpen(true);
    if (!registryLoaded) {
      solutionsRegistryApi.getPractices()
        .then((d: { items: RegistryPractice[] }) => { setRegistry(d.items || []); setRegistryLoaded(true); })
        .catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }));
    }
  };

  const openEdit = (m: Mapping) => {
    setEditMapping(m);
    setPickedPractice(null);
    setForm({
      relevance_level: m.relevance_level,
      reason_tags: m.reason_tags || [],
      rationale_note: m.rationale_note || "",
      source_kind: m.source_kind,
    });
    setDialogOpen(true);
  };

  const toggleTag = (v: string) =>
    setForm((f) => ({ ...f, reason_tags: f.reason_tags.includes(v) ? f.reason_tags.filter((x) => x !== v) : [...f.reason_tags, v] }));

  const canSave = form.reason_tags.length > 0 || form.rationale_note.trim().length > 0;

  const save = () => {
    if (!canSave) {
      toast({ title: "Нужна причина", description: "Отметьте теги или напишите обоснование", variant: "destructive" });
      return;
    }
    setSaving(true);
    const mappingPayload = {
      relevance_level: form.relevance_level,
      reason_tags: form.reason_tags,
      rationale_note: form.rationale_note,
      source_kind: form.source_kind,
    };
    const req = editMapping
      ? deptFunctionsApi.updateFunctionPractice({ project_id: projectId, mapping: { ...mappingPayload, id: editMapping.id } })
      : deptFunctionsApi.addFunctionPractice({ project_id: projectId, function_id: functionId, mapping: { ...mappingPayload, practice_id: pickedPractice!.id } });
    req
      .then(() => { toast({ title: editMapping ? "Привязка обновлена" : "Практика привязана" }); setDialogOpen(false); load(); onChanged?.(); })
      .catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }))
      .finally(() => setSaving(false));
  };

  const archive = (m: Mapping) =>
    deptFunctionsApi.archiveFunctionPractice({ project_id: projectId, mapping_id: m.id })
      .then(() => { load(); onChanged?.(); })
      .catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }));
  const restore = (m: Mapping) =>
    deptFunctionsApi.restoreFunctionPractice({ project_id: projectId, mapping_id: m.id })
      .then(() => { load(); onChanged?.(); })
      .catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }));

  const registryCategories = useMemo(
    () => Array.from(new Set(registry.map((p) => p.category).filter(Boolean))).sort(), [registry]);
  const pickerList = useMemo(() => registry.filter((p) => {
    if (p.status !== "active") return false;
    if (activePracticeIds.has(p.id)) return false;
    if (pickerCategory !== "all" && p.category !== pickerCategory) return false;
    if (pickerQuery && !(`${p.name} ${p.summary || ""}`.toLowerCase().includes(pickerQuery.toLowerCase()))) return false;
    return true;
  }), [registry, activePracticeIds, pickerCategory, pickerQuery]);

  const MappingRow = ({ m }: { m: Mapping }) => (
    <div className={`rounded-lg border px-3 py-2 ${m.is_archived ? "border-slate-200 bg-slate-50 opacity-70" : "border-emerald-100 bg-white"}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium text-slate-800">{m.practice_name}</span>
            <Badge className={`text-[10px] border-0 ${RELEVANCE_COLOR[m.relevance_level] || ""}`}>{labelOf(RELEVANCE, m.relevance_level)}</Badge>
            {m.practice_status !== "active" && <Badge variant="outline" className="text-[10px] text-slate-400">архивная практика</Badge>}
          </div>
          {m.practice_summary && <div className="text-xs text-slate-500 mt-0.5">{m.practice_summary}</div>}
          <div className="flex flex-wrap gap-1 mt-1.5">
            {m.practice_category && <Badge variant="outline" className="text-[10px]">{m.practice_category}</Badge>}
            <Badge variant="outline" className={`text-[10px] ${m.practice_is_digital ? "text-indigo-600" : "text-slate-500"}`}>
              {m.practice_is_digital ? "цифровая" : "организационная"}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">{m.capability_count} cap.</Badge>
          </div>
          {m.reason_tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {m.reason_tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px] bg-emerald-50 text-emerald-700">{labelOf(REASON_TAGS, t)}</Badge>)}
            </div>
          )}
          {m.rationale_note && <div className="text-xs text-slate-500 mt-1 italic">«{m.rationale_note}»</div>}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {m.is_archived ? (
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Восстановить" onClick={() => restore(m)}>
              <Icon name="ArchiveRestore" size={13} />
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Редактировать" onClick={() => openEdit(m)}>
                <Icon name="Pencil" size={13} />
              </Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-400" title="Снять привязку" onClick={() => archive(m)}>
                <Icon name="Archive" size={13} />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  const showForm = !!editMapping || !!pickedPractice;

  return (
    <div className="mt-3 border border-slate-200 rounded-lg p-3 bg-emerald-50/30">
      <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
        <div className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
          <Icon name="Sparkles" size={15} /> Практики улучшения
          {active.length > 0 && <Badge variant="secondary" className="text-[10px]">{active.length}</Badge>}
        </div>
        <div className="flex items-center gap-1.5">
          {archived.length > 0 && (
            <button onClick={() => setShowArchived((v) => !v)} className="text-xs text-slate-500 underline underline-offset-2">
              {showArchived ? "Скрыть снятые" : `Снятые (${archived.length})`}
            </button>
          )}
          <Button size="sm" className="h-7 text-xs" onClick={openPicker}>
            <Icon name="Plus" size={12} className="mr-1" /> Добавить практику
          </Button>
        </div>
      </div>

      <div className="text-[11px] text-slate-400 mb-2">
        Начните отсюда: именно из практик выводится потребность в capability. Если практики неточны — кандидаты, наборы и шортлист тоже будут неточными.
      </div>

      {loading ? (
        <div className="text-xs text-slate-400 py-2">Загрузка…</div>
      ) : active.length === 0 && archived.length === 0 ? (
        <div className="text-xs text-slate-400 py-2">Практики ещё не привязаны. Выберите подходящие из справочника и укажите причину — это первый шаг к решению по функции.</div>
      ) : (
        <div className="space-y-1.5">
          {active.map((m) => <MappingRow key={m.id} m={m} />)}
          {showArchived && archived.map((m) => <MappingRow key={m.id} m={m} />)}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editMapping ? `Практика: ${editMapping.practice_name}`
                : pickedPractice ? `Практика: ${pickedPractice.name}`
                : "Выбор практики"}
            </DialogTitle>
          </DialogHeader>

          {!showForm ? (
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="relative flex-1 min-w-[180px]">
                  <Icon name="Search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input value={pickerQuery} onChange={(e) => setPickerQuery(e.target.value)} placeholder="Поиск практик…" className="h-9 pl-8 text-sm" />
                </div>
                <Select value={pickerCategory} onValueChange={setPickerCategory}>
                  <SelectTrigger className="h-9 w-[160px] text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все категории</SelectItem>
                    {registryCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {!registryLoaded ? (
                <div className="text-sm text-slate-400 py-6 text-center">Загрузка справочника…</div>
              ) : pickerList.length === 0 ? (
                <div className="text-sm text-slate-400 py-6 text-center">Нет доступных практик (возможно, уже все привязаны).</div>
              ) : (
                <div className="grid gap-1.5 max-h-[50vh] overflow-y-auto pr-1">
                  {pickerList.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPickedPractice(p)}
                      className="text-left rounded-lg border border-slate-200 bg-white hover:border-emerald-300 hover:shadow-sm transition p-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium text-slate-800">{p.name}</span>
                        <Badge variant="secondary" className="text-[10px] flex-shrink-0">{p.capability_count} cap.</Badge>
                      </div>
                      {p.summary && <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{p.summary}</div>}
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {p.category && <Badge variant="outline" className="text-[10px]">{p.category}</Badge>}
                        <Badge variant="outline" className={`text-[10px] ${p.is_digital ? "text-indigo-600" : "text-slate-500"}`}>
                          {p.is_digital ? "цифровая" : "организационная"}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {!editMapping && (
                <button onClick={() => setPickedPractice(null)} className="text-xs text-slate-500 flex items-center gap-1">
                  <Icon name="ChevronLeft" size={13} /> Назад к выбору
                </button>
              )}
              <div>
                <div className="text-[11px] text-slate-500 mb-0.5">Уровень релевантности</div>
                <Select value={form.relevance_level} onValueChange={(v) => setForm((f) => ({ ...f, relevance_level: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{RELEVANCE.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div>
                <div className="text-[11px] text-slate-500 mb-1">Причины (теги)</div>
                <div className="flex flex-wrap gap-1">
                  {REASON_TAGS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => toggleTag(o.value)}
                      className={`text-[11px] px-1.5 py-0.5 rounded border ${form.reason_tags.includes(o.value) ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-200"}`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[11px] text-slate-500 mb-0.5">Обоснование</div>
                <Textarea value={form.rationale_note} onChange={(e) => setForm((f) => ({ ...f, rationale_note: e.target.value }))} rows={2} placeholder="Чем практика поможет этой функции" />
              </div>

              <div>
                <div className="text-[11px] text-slate-500 mb-0.5">Источник</div>
                <Select value={form.source_kind} onValueChange={(v) => setForm((f) => ({ ...f, source_kind: v }))}>
                  <SelectTrigger className="h-8 text-xs w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{SOURCE_KIND.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              {!canSave && <div className="text-[11px] text-amber-600">Нужна хотя бы одна причина: тег или текст обоснования.</div>}
            </div>
          )}

          {showForm && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Отмена</Button>
              <Button onClick={save} disabled={saving || !canSave}>{editMapping ? "Сохранить" : "Привязать"}</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}