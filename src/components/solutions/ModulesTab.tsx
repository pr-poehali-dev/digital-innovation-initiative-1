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

type Module = {
  id: number; slug: string; name: string; category: string; summary: string | null;
  status: string; product_name: string; vendor_name: string; capabilities_count: number;
};
type MappedCap = { slug: string; name: string; category: string; coverage_level: string; note: string | null };
type ModuleDetail = Module & {
  source_note: string | null;
  product: { slug: string; name: string };
  vendor: { slug: string; name: string };
  capabilities: MappedCap[];
};

const COV_LABEL: Record<string, string> = { core: "базовая", supporting: "поддержка", limited: "частично" };
const COV_COLOR: Record<string, string> = {
  core: "bg-emerald-100 text-emerald-700", supporting: "bg-blue-100 text-blue-700", limited: "bg-slate-100 text-slate-500",
};

export default function ModulesTab() {
  const [items, setItems] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [vendor, setVendor] = useState("all");
  const [product, setProduct] = useState("all");
  const [category, setCategory] = useState("all");
  const [detail, setDetail] = useState<ModuleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    solutionsRegistryApi.getModules()
      .then((d: { items: Module[] }) => setItems(d.items || []))
      .catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const vendors = useMemo(() => Array.from(new Set(items.map((i) => i.vendor_name).filter(Boolean))).sort(), [items]);
  const products = useMemo(() => Array.from(new Set(items.map((i) => i.product_name).filter(Boolean))).sort(), [items]);
  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category).filter(Boolean))).sort(), [items]);

  const filtered = useMemo(() => items.filter((i) => {
    if (vendor !== "all" && i.vendor_name !== vendor) return false;
    if (product !== "all" && i.product_name !== product) return false;
    if (category !== "all" && i.category !== category) return false;
    if (q && !(`${i.name} ${i.summary || ""}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  }), [items, vendor, product, category, q]);

  const openDetail = (slug: string) => {
    setDetailLoading(true);
    setDetail({} as ModuleDetail);
    solutionsRegistryApi.getModuleDetail(slug)
      .then((d: { module: ModuleDetail }) => setDetail(d.module))
      .catch((e: Error) => { toast({ title: "Ошибка", description: e.message, variant: "destructive" }); setDetail(null); })
      .finally(() => setDetailLoading(false));
  };

  if (loading) return <div className="text-sm text-slate-400 py-8 text-center">Загрузка модулей…</div>;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Icon name="Search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск модулей…" className="h-9 pl-8 text-sm" />
        </div>
        <Select value={vendor} onValueChange={setVendor}>
          <SelectTrigger className="h-9 w-[140px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все вендоры</SelectItem>
            {vendors.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={product} onValueChange={setProduct}>
          <SelectTrigger className="h-9 w-[150px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все продукты</SelectItem>
            {products.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 w-[140px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все категории</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="text-xs text-slate-400 mb-2">Найдено: {filtered.length}</div>

      <div className="grid gap-2 sm:grid-cols-2">
        {filtered.map((m) => (
          <button
            key={m.id}
            onClick={() => openDetail(m.slug)}
            className="text-left rounded-lg border border-slate-200 bg-white hover:border-violet-300 hover:shadow-sm transition p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium text-sm text-slate-800">{m.name}</div>
              <Badge variant="secondary" className="text-[10px] flex-shrink-0">{m.capabilities_count} cap.</Badge>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">{m.product_name} · {m.vendor_name}</div>
            {m.summary && <div className="text-xs text-slate-500 mt-1 line-clamp-2">{m.summary}</div>}
            <div className="flex flex-wrap gap-1 mt-2">
              {m.category && <Badge variant="outline" className="text-[10px]">{m.category}</Badge>}
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
                <div className="text-xs text-slate-500">{detail.product.name} · {detail.vendor.name}</div>
                <div className="flex flex-wrap gap-1.5">
                  {detail.category && <Badge variant="outline" className="text-xs">{detail.category}</Badge>}
                  <Badge variant="outline" className="text-xs">{detail.status}</Badge>
                </div>
                {detail.summary && <p className="text-sm text-slate-700 leading-relaxed">{detail.summary}</p>}

                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Покрываемые capability</div>
                  {detail.capabilities.length === 0 ? (
                    <div className="text-xs text-slate-400">Нет связанных capability.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {detail.capabilities.map((c) => (
                        <div key={c.slug} className="rounded-md border border-slate-100 px-2.5 py-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-slate-800">{c.name}</span>
                            <Badge className={`text-[10px] border-0 ${COV_COLOR[c.coverage_level] || ""}`}>{COV_LABEL[c.coverage_level] || c.coverage_level}</Badge>
                          </div>
                          {c.note && <div className="text-xs text-slate-400 mt-0.5">{c.note}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {detail.source_note && <div className="text-xs text-slate-400">Источник: {detail.source_note}</div>}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
