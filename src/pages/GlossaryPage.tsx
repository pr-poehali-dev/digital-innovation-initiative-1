import { useState, useEffect, useCallback } from "react";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { glossaryApi, type GlossaryTerm, type GlossaryCategory } from "@/lib/api";

const CATEGORY_STYLE: Record<string, { color: string; icon: string }> = {
  org: { color: "bg-indigo-100 text-indigo-700", icon: "Building2" },
  internal_control: { color: "bg-blue-100 text-blue-700", icon: "ShieldCheck" },
  digital: { color: "bg-violet-100 text-violet-700", icon: "Cpu" },
  ai: { color: "bg-emerald-100 text-emerald-700", icon: "Sparkles" },
  budget: { color: "bg-amber-100 text-amber-700", icon: "Wallet" },
  management: { color: "bg-rose-100 text-rose-700", icon: "Users" },
  roles: { color: "bg-cyan-100 text-cyan-700", icon: "IdCard" },
  general: { color: "bg-slate-100 text-slate-700", icon: "BookOpen" },
};

// Единый справочник статусов жизненного цикла — совпадает с картой деятельности
const TERM_STATUS_STYLE: Record<string, string> = {
  ai_draft: "bg-amber-100 text-amber-800",
  user_draft: "bg-slate-100 text-slate-700",
  in_review: "bg-blue-100 text-blue-700",
  confirmed: "bg-emerald-100 text-emerald-700",
  approved: "bg-emerald-600 text-white",
  needs_update: "bg-rose-100 text-rose-700",
  archived: "bg-slate-200 text-slate-500",
};

function TermCard({ term, onToggleFavorite }: { term: GlossaryTerm; onToggleFavorite: (t: GlossaryTerm) => void }) {
  const [open, setOpen] = useState(false);
  const style = CATEGORY_STYLE[term.category] || CATEGORY_STYLE.general;

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden transition-shadow hover:shadow-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-4 py-3.5 flex items-start gap-3"
      >
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${style.color}`}>
          <Icon name={style.icon} size={15} fallback="BookOpen" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900 text-[15px]">{term.term}</span>
            <Badge className={`text-[10px] h-5 border-0 ${TERM_STATUS_STYLE[term.status] || TERM_STATUS_STYLE.ai_draft}`}>
              {term.status_label || "AI-черновик"}
            </Badge>
          </span>
          {term.aliases && <span className="block text-[11px] text-slate-400 mt-0.5">{term.aliases}</span>}
          <span className="block text-sm text-slate-600 mt-1 leading-snug">{term.short_definition}</span>
        </span>
        <span className="flex items-center gap-1 flex-shrink-0">
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(term); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onToggleFavorite(term); } }}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              term.is_favorite ? "text-amber-500" : "text-slate-300 hover:text-slate-500"
            }`}
            title={term.is_favorite ? "Убрать из избранного" : "В избранное"}
          >
            <Icon name="Star" size={15} />
          </span>
          <Icon name={open ? "ChevronUp" : "ChevronDown"} size={16} className="text-slate-400" />
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-4 py-4 bg-slate-50/50 space-y-3">
          {term.plain_explanation && (
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Простыми словами</p>
              <p className="text-sm text-slate-700 leading-relaxed">{term.plain_explanation}</p>
            </div>
          )}
          {term.why_matters && (
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Почему это важно вам</p>
              <p className="text-sm text-slate-700 leading-relaxed">{term.why_matters}</p>
            </div>
          )}
          {term.example && (
            <div className="bg-white border border-slate-200 rounded-lg px-3 py-2.5">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Пример</p>
              <p className="text-sm text-slate-600 leading-relaxed">{term.example}</p>
            </div>
          )}
          <div className="border border-slate-200 rounded-lg px-3 py-2.5 bg-white">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Источник</p>
            {term.source_document ? (
              <>
                <p className="text-xs text-slate-700 leading-relaxed">{term.source_document}</p>
                {term.source_edition && (
                  <p className="text-[11px] text-slate-500 mt-0.5">Редакция: {term.source_edition}</p>
                )}
                {term.actual_date && (
                  <p className="text-[11px] text-slate-500">Актуально на: {term.actual_date}</p>
                )}
              </>
            ) : (
              <p className="text-xs text-amber-700 leading-relaxed">
                Источник не указан. Определение сформировано ИИ и требует проверки перед
                использованием в документах.
              </p>
            )}
          </div>

          <Badge className={`text-[10px] border-0 ${(CATEGORY_STYLE[term.category] || CATEGORY_STYLE.general).color}`}>
            {term.category_label}
          </Badge>
        </div>
      )}
    </div>
  );
}

export default function GlossaryPage() {
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [categories, setCategories] = useState<GlossaryCategory[]>([]);
  const [total, setTotal] = useState(0);
  const [favCount, setFavCount] = useState(0);
  const [activeCat, setActiveCat] = useState("all");
  const [onlyFav, setOnlyFav] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [askTerm, setAskTerm] = useState("");
  const [asking, setAsking] = useState(false);

  const loadCategories = useCallback(() => {
    glossaryApi.categories()
      .then((d) => {
        setCategories(d.categories || []);
        setTotal(d.total || 0);
        setFavCount(d.favorites || 0);
      })
      .catch(() => {});
  }, []);

  const loadTerms = useCallback(() => {
    setLoading(true);
    glossaryApi.list({
      category: activeCat,
      search: search.trim() || undefined,
      only_favorites: onlyFav || undefined,
    })
      .then((d) => setTerms(d.items || []))
      .catch((e: Error) => toast({ title: "Ошибка загрузки", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [activeCat, search, onlyFav]);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  useEffect(() => {
    const timer = setTimeout(loadTerms, search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [loadTerms, search]);

  const handleToggleFavorite = (term: GlossaryTerm) => {
    const next = !term.is_favorite;
    setTerms((prev) => prev.map((t) => (t.id === term.id ? { ...t, is_favorite: next } : t)));
    setFavCount((c) => (next ? c + 1 : Math.max(0, c - 1)));
    glossaryApi.mark(term.id, { is_favorite: next }).catch(() => {
      setTerms((prev) => prev.map((t) => (t.id === term.id ? { ...t, is_favorite: !next } : t)));
    });
  };

  const handleAsk = async () => {
    const q = askTerm.trim();
    if (!q || asking) return;
    setAsking(true);
    try {
      const d = await glossaryApi.explain(q);
      setAskTerm("");
      if (d.was_existing) {
        toast({ title: "Этот термин уже есть в глоссарии", description: d.term.term });
      } else {
        toast({
          title: "Добавлен как AI-черновик",
          description: `${d.term.term} — требует проверки и указания источника`,
        });
      }
      setActiveCat("all");
      setOnlyFav(false);
      setSearch(d.term.term);
      loadCategories();
    } catch (e) {
      toast({ title: "Не удалось объяснить термин", description: (e as Error).message, variant: "destructive" });
    } finally {
      setAsking(false);
    }
  };

  return (
    <Layout>
      <div className="px-4 lg:px-6 py-6 max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
            <Icon name="BookOpen" size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Глоссарий</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Термины, аббревиатуры и профессиональный сленг — с объяснением простыми словами
            </p>
          </div>
        </div>

        {/* AI ask box */}
        <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 rounded-xl px-4 py-4">
          <div className="flex items-center gap-2 mb-2.5">
            <Icon name="Sparkles" size={15} className="text-violet-600" />
            <span className="text-sm font-semibold text-slate-900">Встретили незнакомый термин?</span>
          </div>
          <div className="flex gap-2 flex-wrap sm:flex-nowrap">
            <Input
              value={askTerm}
              onChange={(e) => setAskTerm(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAsk(); }}
              placeholder="Например: SLA, продуктовая гипотеза, скоринг..."
              className="flex-1 bg-white"
              disabled={asking}
            />
            <Button onClick={handleAsk} disabled={asking || !askTerm.trim()} className="flex-shrink-0">
              {asking ? (
                <><Icon name="Loader2" size={14} className="mr-1.5 animate-spin" />Объясняю...</>
              ) : (
                <><Icon name="Wand2" size={14} className="mr-1.5" />Объяснить</>
              )}
            </Button>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            AI объяснит термин с учётом вашей роли и сохранит его как <b>AI-черновик</b>. Такое определение
            нельзя использовать в документах без проверки и указания источника.
          </p>
        </div>

        {/* Search + filters */}
        <div className="space-y-3">
          <div className="relative">
            <Icon name="Search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по глоссарию..."
              className="pl-9"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <Icon name="X" size={14} />
              </button>
            )}
          </div>

          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => { setActiveCat("all"); setOnlyFav(false); }}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeCat === "all" && !onlyFav
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300"
              }`}
            >
              Все <span className="opacity-60">{total}</span>
            </button>
            <button
              onClick={() => { setOnlyFav(true); setActiveCat("all"); }}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 ${
                onlyFav
                  ? "bg-amber-500 text-white"
                  : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300"
              }`}
            >
              <Icon name="Star" size={11} /> Избранное <span className="opacity-60">{favCount}</span>
            </button>
            {categories.map((c) => (
              <button
                key={c.key}
                onClick={() => { setActiveCat(c.key); setOnlyFav(false); }}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  activeCat === c.key && !onlyFav
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300"
                }`}
              >
                {c.label} <span className="opacity-60">{c.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Terms list */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : terms.length === 0 ? (
          <div className="text-center py-14 border border-dashed border-slate-200 rounded-xl">
            <Icon name="SearchX" size={28} className="text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">
              {search ? "Ничего не нашлось" : onlyFav ? "В избранном пока пусто" : "Терминов пока нет"}
            </p>
            {search && (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => { setAskTerm(search); setSearch(""); }}>
                <Icon name="Sparkles" size={13} className="mr-1.5" />
                Спросить у AI про «{search}»
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {terms.map((t) => (
              <TermCard key={t.id} term={t} onToggleFavorite={handleToggleFavorite} />
            ))}
          </div>
        )}

      </div>
    </Layout>
  );
}