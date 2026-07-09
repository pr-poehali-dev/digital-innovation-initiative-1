import { useEffect, useMemo, useState } from "react";
import { solutionsRegistryApi } from "@/lib/api";
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

type Capability = {
  id: number; slug: string; name: string; category: string; description: string | null;
  status: string; source_note: string | null; source_url: string | null; practice_count: number;
};
type LinkedPractice = { slug: string; name: string; category: string; relation_type: string; note: string | null };
type CapabilityDetail = Capability & { practices: LinkedPractice[] };

const REL_LABEL: Record<string, string> = { required: "обязательная", supporting: "поддерживающая", optional: "опциональная" };
const REL_COLOR: Record<string, string> = {
  required: "bg-rose-50 text-rose-600", supporting: "bg-blue-50 text-blue-600", optional: "bg-slate-100 text-slate-500",
};

export default function CapabilitiesTab() {
  const [items, setItems] = useState<Capability[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [detail, setDetail] = useState<CapabilityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    solutionsRegistryApi.getCapabilities()
      .then((d: { items: Capability[] }) => setItems(d.items || []))
      .catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category).filter(Boolean))).sort(), [items]);

  const filtered = useMemo(() => items.filter((i) => {
    if (status !== "all" && i.status !== status) return false;
    if (category !== "all" && i.category !== category) return false;
    if (q && !(`${i.name} ${i.description || ""}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  }), [items, status, category, q]);

  const openDetail = (slug: string) => {
    setDetailLoading(true);
    setDetail({} as CapabilityDetail);
    solutionsRegistryApi.getCapabilityDetail(slug)
      .then((d: { capability: CapabilityDetail }) => setDetail(d.capability))
      .catch((e: Error) => { toast({ title: "Ошибка", description: e.message, variant: "destructive" }); setDetail(null); })
      .finally(() => setDetailLoading(false));
  };

  if (loading) return <div className="text-sm text-slate-400 py-8 text-center">Загрузка capability…</div>;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Icon name="Search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск capability…" className="h-9 pl-8 text-sm" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[130px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="active">Активные</SelectItem>
            <SelectItem value="draft">Черновики</SelectItem>
            <SelectItem value="archived">Архив</SelectItem>
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 w-[150px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все категории</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="text-xs text-slate-400 mb-2">Найдено: {filtered.length}</div>

      <div className="grid gap-2 sm:grid-cols-2">
        {filtered.map((c) => (
          <button
            key={c.id}
            onClick={() => openDetail(c.slug)}
            className="text-left rounded-lg border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-sm transition p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium text-sm text-slate-800">{c.name}</div>
              <Badge variant="secondary" className="text-[10px] flex-shrink-0">{c.practice_count} practices</Badge>
            </div>
            {c.description && <div className="text-xs text-slate-500 mt-1 line-clamp-2">{c.description}</div>}
            <div className="flex flex-wrap gap-1 mt-2">
              {c.category && <Badge variant="outline" className="text-[10px]">{c.category}</Badge>}
            </div>
          </button>
        ))}
      </div>

      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          {detailLoading || !detail?.slug ? (
            <div className="text-sm text-slate-400 py-8">Загрузка…</div>
          ) : (
            <>
              <SheetHeader>
                <SheetTitle className="text-left">{detail.name}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  {detail.category && <Badge variant="outline" className="text-xs">{detail.category}</Badge>}
                  <Badge variant="outline" className="text-xs">{detail.status}</Badge>
                </div>
                {detail.description && <p className="text-sm text-slate-700 leading-relaxed">{detail.description}</p>}

                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Практики, использующие capability</div>
                  {detail.practices.length === 0 ? (
                    <div className="text-xs text-slate-400">Пока нет связей.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {detail.practices.map((p) => (
                        <div key={p.slug + p.relation_type} className="rounded-md border border-slate-100 px-2.5 py-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-slate-800">{p.name}</span>
                            <Badge className={`text-[10px] border-0 ${REL_COLOR[p.relation_type] || ""}`}>{REL_LABEL[p.relation_type] || p.relation_type}</Badge>
                          </div>
                          {p.note && <div className="text-xs text-slate-400 mt-0.5">{p.note}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {(detail.source_note || detail.source_url) && (
                  <div className="pt-2 border-t border-slate-100">
                    <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Источник</div>
                    {detail.source_note && <div className="text-xs text-slate-500">{detail.source_note}</div>}
                    {detail.source_url && <a href={detail.source_url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 underline break-all">{detail.source_url}</a>}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
