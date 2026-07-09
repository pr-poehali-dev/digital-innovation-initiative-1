import { useEffect, useMemo, useState } from "react";
import { deptFunctionsApi } from "@/lib/api";
import Icon from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "@/components/ui/use-toast";
import { RELEVANCE, RELEVANCE_COLOR, REASON_TAGS, labelOf } from "@/components/dept/functionPracticeOptions";

type SourcePractice = {
  practice_id: number; practice_name: string; practice_slug: string; practice_category: string;
  practice_relevance: string; relation_type: string; reason_tags: string[]; rationale_note: string | null;
};
type Capability = {
  capability_id: number; slug: string; name: string; category: string; description: string | null;
  status: string; need_level: string; priority_level: string;
  source_practices_count: number; source_practices: SourcePractice[];
};
type Summary = {
  required_count: number; supporting_count: number; optional_count: number;
  active_count: number; archived_count: number;
};

interface Props {
  projectId: number;
  functionId: number;
  refreshKey?: number; // меняется при изменении практик, чтобы derived-view пересчитался
}

const NEED_LABEL: Record<string, string> = { required: "обязательна", supporting: "поддерживает", optional: "опционально" };
const NEED_COLOR: Record<string, string> = {
  required: "bg-rose-100 text-rose-700", supporting: "bg-blue-100 text-blue-700", optional: "bg-slate-100 text-slate-500",
};
const REL_LABEL: Record<string, string> = { required: "обязательная", supporting: "поддерживающая", optional: "опциональная" };

export default function FunctionCapabilitiesBlock({ projectId, functionId, refreshKey }: Props) {
  const [items, setItems] = useState<Capability[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [needFilter, setNeedFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [detail, setDetail] = useState<Capability | null>(null);

  const load = () => {
    setLoading(true);
    deptFunctionsApi.getFunctionCapabilities(projectId, functionId, showArchived)
      .then((d: { items: Capability[]; summary: Summary }) => { setItems(d.items || []); setSummary(d.summary || null); })
      .catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId, functionId, showArchived, refreshKey]);

  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category).filter(Boolean))).sort(), [items]);
  const filtered = useMemo(() => items.filter((c) => {
    if (category !== "all" && c.category !== category) return false;
    if (needFilter !== "all" && c.need_level !== needFilter) return false;
    if (priorityFilter !== "all" && c.priority_level !== priorityFilter) return false;
    if (q && !(`${c.name} ${c.description || ""}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  }), [items, category, needFilter, priorityFilter, q]);

  const hasAnySource = items.length > 0 || (summary && summary.archived_count > 0);

  return (
    <div className="mt-3 border border-slate-200 rounded-lg p-3 bg-sky-50/30">
      <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
        <div className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
          <Icon name="Puzzle" size={15} /> Необходимые capability
          {summary && (
            <span className="flex items-center gap-1 ml-1">
              {summary.required_count > 0 && <Badge className="text-[10px] border-0 bg-rose-100 text-rose-700">{summary.required_count} обяз.</Badge>}
              {summary.supporting_count > 0 && <Badge className="text-[10px] border-0 bg-blue-100 text-blue-700">{summary.supporting_count} подд.</Badge>}
              {summary.optional_count > 0 && <Badge className="text-[10px] border-0 bg-slate-100 text-slate-500">{summary.optional_count} опц.</Badge>}
            </span>
          )}
        </div>
        {summary && summary.archived_count > 0 && (
          <button onClick={() => setShowArchived((v) => !v)} className="text-xs text-slate-500 underline underline-offset-2">
            {showArchived ? "Скрыть архивные" : `Архивные capability (${summary.archived_count})`}
          </button>
        )}
      </div>

      <div className="text-[11px] text-slate-400 mb-2">
        Вычисляется из привязанных практик. Только просмотр.
      </div>

      {loading ? (
        <div className="text-xs text-slate-400 py-2">Загрузка…</div>
      ) : !hasAnySource ? (
        <div className="text-xs text-slate-400 py-2">Нет capability: сначала привяжите практики улучшения к функции.</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="relative flex-1 min-w-[160px]">
              <Icon name="Search" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск capability…" className="h-8 pl-8 text-xs" />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все категории</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={needFilter} onValueChange={setNeedFilter}>
              <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Любая нужда</SelectItem>
                <SelectItem value="required">Обязательна</SelectItem>
                <SelectItem value="supporting">Поддерживает</SelectItem>
                <SelectItem value="optional">Опционально</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Любой приоритет</SelectItem>
                <SelectItem value="primary">Ключевой</SelectItem>
                <SelectItem value="supporting">Поддерживающий</SelectItem>
                <SelectItem value="explore">Рассмотреть</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <div className="text-xs text-slate-400 py-2">По фильтрам ничего не найдено.</div>
          ) : (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {filtered.map((c) => (
                <button
                  key={c.capability_id}
                  onClick={() => setDetail(c)}
                  className={`text-left rounded-lg border p-2.5 transition hover:shadow-sm ${c.status === "active" ? "border-sky-100 bg-white hover:border-sky-300" : "border-slate-200 bg-slate-50"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-slate-800">{c.name}</span>
                    <Badge className={`text-[10px] border-0 flex-shrink-0 ${NEED_COLOR[c.need_level] || ""}`}>{NEED_LABEL[c.need_level]}</Badge>
                  </div>
                  {c.description && <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{c.description}</div>}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {c.category && <Badge variant="outline" className="text-[10px]">{c.category}</Badge>}
                    <Badge className={`text-[10px] border-0 ${RELEVANCE_COLOR[c.priority_level] || ""}`}>{labelOf(RELEVANCE, c.priority_level)}</Badge>
                    <Badge variant="secondary" className="text-[10px]">из {c.source_practices_count} практик</Badge>
                    {c.status !== "active" && <Badge variant="outline" className="text-[10px] text-slate-400">архивная</Badge>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle className="text-left">{detail.name}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  {detail.category && <Badge variant="outline" className="text-xs">{detail.category}</Badge>}
                  <Badge className={`text-xs border-0 ${NEED_COLOR[detail.need_level] || ""}`}>{NEED_LABEL[detail.need_level]}</Badge>
                  <Badge className={`text-xs border-0 ${RELEVANCE_COLOR[detail.priority_level] || ""}`}>{labelOf(RELEVANCE, detail.priority_level)}</Badge>
                  {detail.status !== "active" && <Badge variant="outline" className="text-xs text-slate-400">архивная</Badge>}
                </div>
                {detail.description && <p className="text-sm text-slate-700 leading-relaxed">{detail.description}</p>}

                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Почему эта capability показана</div>
                  <div className="space-y-2">
                    {detail.source_practices.map((sp) => (
                      <div key={sp.practice_id + sp.relation_type} className="rounded-md border border-slate-100 px-2.5 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-slate-800">{sp.practice_name}</span>
                          <div className="flex gap-1 flex-shrink-0">
                            <Badge className={`text-[10px] border-0 ${RELEVANCE_COLOR[sp.practice_relevance] || ""}`}>{labelOf(RELEVANCE, sp.practice_relevance)}</Badge>
                            <Badge variant="secondary" className="text-[10px]">{REL_LABEL[sp.relation_type] || sp.relation_type}</Badge>
                          </div>
                        </div>
                        {sp.reason_tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {sp.reason_tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px] bg-emerald-50 text-emerald-700">{labelOf(REASON_TAGS, t)}</Badge>)}
                          </div>
                        )}
                        {sp.rationale_note && <div className="text-xs text-slate-500 mt-1 italic">«{sp.rationale_note}»</div>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
