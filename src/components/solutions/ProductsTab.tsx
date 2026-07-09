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

type Product = {
  id: number; slug: string; name: string; category: string; summary: string | null;
  deployment_types: string[]; status: string; website_url: string | null; source_url: string | null;
  vendor_name: string; modules_count: number; capabilities_count: number;
};
type ProductModule = { slug: string; name: string; category: string; status: string; capabilities_count: number };
type DerivedCap = { slug: string; name: string; category: string; coverage_level: string };
type ProductDetail = Product & {
  source_note: string | null;
  vendor: { slug: string; name: string; website_url: string | null };
  modules: ProductModule[];
  capabilities: DerivedCap[];
};

const DEPL_LABEL: Record<string, string> = { cloud: "Cloud", on_prem: "On-prem", hybrid: "Hybrid" };
const COV_LABEL: Record<string, string> = { core: "базовая", supporting: "поддержка", limited: "частично" };
const COV_COLOR: Record<string, string> = {
  core: "bg-emerald-100 text-emerald-700", supporting: "bg-blue-100 text-blue-700", limited: "bg-slate-100 text-slate-500",
};

export default function ProductsTab() {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [vendor, setVendor] = useState("all");
  const [category, setCategory] = useState("all");
  const [deployment, setDeployment] = useState("all");
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    solutionsRegistryApi.getProducts()
      .then((d: { items: Product[] }) => setItems(d.items || []))
      .catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const vendors = useMemo(() => Array.from(new Set(items.map((i) => i.vendor_name).filter(Boolean))).sort(), [items]);
  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category).filter(Boolean))).sort(), [items]);

  const filtered = useMemo(() => items.filter((i) => {
    if (vendor !== "all" && i.vendor_name !== vendor) return false;
    if (category !== "all" && i.category !== category) return false;
    if (deployment !== "all" && !i.deployment_types.includes(deployment)) return false;
    if (q && !(`${i.name} ${i.summary || ""}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  }), [items, vendor, category, deployment, q]);

  const openDetail = (slug: string) => {
    setDetailLoading(true);
    setDetail({} as ProductDetail);
    solutionsRegistryApi.getProductDetail(slug)
      .then((d: { product: ProductDetail }) => setDetail(d.product))
      .catch((e: Error) => { toast({ title: "Ошибка", description: e.message, variant: "destructive" }); setDetail(null); })
      .finally(() => setDetailLoading(false));
  };

  if (loading) return <div className="text-sm text-slate-400 py-8 text-center">Загрузка продуктов…</div>;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Icon name="Search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск продуктов…" className="h-9 pl-8 text-sm" />
        </div>
        <Select value={vendor} onValueChange={setVendor}>
          <SelectTrigger className="h-9 w-[150px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все вендоры</SelectItem>
            {vendors.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 w-[150px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все категории</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={deployment} onValueChange={setDeployment}>
          <SelectTrigger className="h-9 w-[130px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Любой хостинг</SelectItem>
            <SelectItem value="cloud">Cloud</SelectItem>
            <SelectItem value="on_prem">On-prem</SelectItem>
            <SelectItem value="hybrid">Hybrid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="text-xs text-slate-400 mb-2">Найдено: {filtered.length}</div>

      <div className="grid gap-2 sm:grid-cols-2">
        {filtered.map((p) => (
          <button
            key={p.id}
            onClick={() => openDetail(p.slug)}
            className="text-left rounded-lg border border-slate-200 bg-white hover:border-violet-300 hover:shadow-sm transition p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium text-sm text-slate-800">{p.name}</div>
              <Badge variant="secondary" className="text-[10px] flex-shrink-0">{p.capabilities_count} cap.</Badge>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">{p.vendor_name}</div>
            {p.summary && <div className="text-xs text-slate-500 mt-1 line-clamp-2">{p.summary}</div>}
            <div className="flex flex-wrap gap-1 mt-2">
              {p.category && <Badge variant="outline" className="text-[10px]">{p.category}</Badge>}
              {p.deployment_types.map((d) => <Badge key={d} variant="outline" className="text-[10px] text-violet-600">{DEPL_LABEL[d] || d}</Badge>)}
              <Badge variant="secondary" className="text-[10px]">{p.modules_count} модулей</Badge>
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
                <div className="text-xs text-slate-500">{detail.vendor.name}</div>
                <div className="flex flex-wrap gap-1.5">
                  {detail.category && <Badge variant="outline" className="text-xs">{detail.category}</Badge>}
                  {detail.deployment_types.map((d) => <Badge key={d} variant="outline" className="text-xs text-violet-600">{DEPL_LABEL[d] || d}</Badge>)}
                  <Badge variant="outline" className="text-xs">{detail.status}</Badge>
                </div>
                {detail.summary && <p className="text-sm text-slate-700 leading-relaxed">{detail.summary}</p>}

                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Модули ({detail.modules.length})</div>
                  <div className="space-y-1">
                    {detail.modules.map((m) => (
                      <div key={m.slug} className="flex items-center justify-between rounded-md border border-slate-100 px-2.5 py-1.5">
                        <span className="text-sm text-slate-800">{m.name}</span>
                        <Badge variant="secondary" className="text-[10px]">{m.capabilities_count} cap.</Badge>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Capability продукта (из модулей)</div>
                  {detail.capabilities.length === 0 ? (
                    <div className="text-xs text-slate-400">Нет связанных capability.</div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {detail.capabilities.map((c) => (
                        <Badge key={c.slug} className={`text-[10px] border-0 ${COV_COLOR[c.coverage_level] || ""}`} title={COV_LABEL[c.coverage_level]}>
                          {c.name} · {COV_LABEL[c.coverage_level]}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {detail.website_url && (
                  <a href={detail.website_url} target="_blank" rel="noreferrer" className="text-xs text-violet-600 underline break-all">{detail.website_url}</a>
                )}
                {detail.source_note && <div className="text-xs text-slate-400">Источник: {detail.source_note}</div>}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
