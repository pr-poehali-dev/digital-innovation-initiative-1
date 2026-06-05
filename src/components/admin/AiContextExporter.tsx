import { useState, useEffect, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { aiContextApi, type AiCtxScope, type AiFreshness } from "@/lib/admin-api";
import { useToast } from "@/hooks/use-toast";

type Variant = "button" | "card";

interface Props {
  defaultScope?: AiCtxScope;
  variant?: Variant;
}

const SCOPE_LABELS: Record<AiCtxScope, string> = {
  full:    "Full (HQ + Project + Passport)",
  hq:      "Only HQ",
  project: "Only Project",
  passport:"Only Passport",
};

const FRESHNESS_CFG: Record<string, { label: string; dot: string; badge: string }> = {
  fresh:          { label: "Fresh",         dot: "bg-emerald-400", badge: "bg-emerald-900/40 text-emerald-400 border-emerald-800" },
  changed:        { label: "Changed",       dot: "bg-amber-400 animate-pulse", badge: "bg-amber-900/40 text-amber-400 border-amber-800" },
  never_exported: { label: "Never exported",dot: "bg-gray-600",    badge: "bg-gray-800 text-gray-500 border-gray-700" },
};

function FreshnessBadge({ status }: { status: string }) {
  const cfg = FRESHNESS_CFG[status] ?? FRESHNESS_CFG.never_exported;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function fmtDate(iso?: string | null) {
  if (!iso || iso.startsWith("0001")) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function AiContextExporter({ defaultScope = "full", variant = "button" }: Props) {
  const { toast } = useToast();
  const [loading,      setLoading]      = useState(false);
  const [copied,       setCopied]       = useState(false);
  const [scope,        setScope]        = useState<AiCtxScope>(defaultScope);
  const [showMenu,     setShowMenu]     = useState(false);
  const [meta,         setMeta]         = useState<{ generated_at?: string; source_hash?: string } | null>(null);
  const [freshness,    setFreshness]    = useState<AiFreshness | null>(null);
  const [freshLoading, setFreshLoading] = useState(false);

  const loadStatus = useCallback(async (sc: AiCtxScope) => {
    setFreshLoading(true);
    const res = await aiContextApi.status(sc);
    setFreshLoading(false);
    if (res.ok) setFreshness(res.data.freshness ?? null);
  }, []);

  useEffect(() => { loadStatus(scope); }, [scope, loadStatus]);

  async function doExport(downloadJson = false) {
    setLoading(true);
    setShowMenu(false);
    const res = await aiContextApi.export(scope);
    setLoading(false);
    if (!res.ok) {
      toast({ title: "Ошибка экспорта", variant: "destructive" });
      return;
    }
    const md: string = res.data.rendered_markdown || "";
    setMeta(res.data.meta || null);
    setFreshness(prev => prev ? { ...prev, status: "fresh", changed_sections: [] } : null);
    setTimeout(() => loadStatus(scope), 1200);

    if (downloadJson) {
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url;
      a.download = `ai-context-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "JSON скачан" });
    } else {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast({ title: "Markdown скопирован" });
    }
  }

  const freshStatus = freshness?.status ?? "never_exported";

  // ── CARD ──────────────────────────────────────────────────────────────────
  if (variant === "card") {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-violet-900/60 flex items-center justify-center">
              <Icon name="BrainCircuit" size={14} className="text-violet-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Unified AI Context</p>
              <p className="text-[11px] text-gray-500">HQ · Project · Passport</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {freshLoading
              ? <span className="w-3 h-3 border border-gray-600 border-t-transparent rounded-full animate-spin" />
              : <FreshnessBadge status={freshStatus} />
            }
          </div>
        </div>

        {freshStatus === "changed" && freshness?.changed_sections && freshness.changed_sections.length > 0 && (
          <div className="px-5 pt-3 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-gray-600 uppercase tracking-wide">Changed:</span>
            {freshness.changed_sections.map(s => (
              <span key={s} className="text-[10px] font-mono px-1.5 py-0.5 bg-amber-900/30 text-amber-400 rounded border border-amber-800/50">{s}</span>
            ))}
          </div>
        )}

        {freshness?.last_exported_at && (
          <div className="px-5 pt-2 flex items-center gap-1 text-[10px] text-gray-700">
            <Icon name="Clock" size={9} />
            {fmtDate(freshness.last_exported_at)}
            {freshness.last_exported_by && (
              <><span className="mx-0.5">·</span>{freshness.last_exported_by}</>
            )}
          </div>
        )}

        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 flex-shrink-0">Scope:</label>
            <select value={scope} onChange={e => setScope(e.target.value as AiCtxScope)}
              className="bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-violet-600">
              {(Object.keys(SCOPE_LABELS) as AiCtxScope[]).map(s => (
                <option key={s} value={s}>{SCOPE_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => doExport(false)} disabled={loading}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all flex-1 justify-center ${
                copied
                  ? "bg-emerald-700 text-white"
                  : freshStatus === "changed"
                    ? "bg-amber-700 hover:bg-amber-600 text-white disabled:opacity-50"
                    : "bg-violet-700 hover:bg-violet-600 text-white disabled:opacity-50"
              }`}>
              {loading
                ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Icon name={copied ? "Check" : freshStatus === "changed" ? "RefreshCw" : "Clipboard"} size={13} />
              }
              {copied ? "Скопировано!" : freshStatus === "changed" ? "Regenerate & Copy" : "Copy Markdown"}
            </button>
            <button onClick={() => doExport(true)} disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-all disabled:opacity-50">
              <Icon name="Download" size={13} />
              JSON
            </button>
          </div>

          {meta?.source_hash && (
            <p className="text-[10px] text-gray-700 font-mono">
              hash: {meta.source_hash.slice(0, 12)}…
            </p>
          )}
          <p className="text-[10px] text-gray-700 leading-relaxed">
            Собирается из БД в реальном времени. Экспорт фиксируется в лог.
          </p>
        </div>
      </div>
    );
  }

  // ── BUTTON ────────────────────────────────────────────────────────────────
  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <button
          onClick={() => doExport(false)}
          disabled={loading}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
            copied
              ? "bg-emerald-700 text-white border-emerald-700"
              : freshStatus === "changed"
                ? "bg-amber-900/40 hover:bg-amber-900/60 text-amber-300 border-amber-800 disabled:opacity-50"
                : "bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-700 disabled:opacity-50"
          }`}
        >
          {loading
            ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            : <Icon name={copied ? "Check" : "BrainCircuit"} size={12} />
          }
          {copied ? "Скопировано!" : "AI Context"}
          {!copied && !loading && (
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              freshLoading        ? "bg-gray-600" :
              freshStatus === "fresh"   ? "bg-emerald-400" :
              freshStatus === "changed" ? "bg-amber-400 animate-pulse" :
              "bg-gray-600"
            }`} />
          )}
        </button>
        <button
          onClick={() => setShowMenu(v => !v)}
          className="px-1.5 py-1.5 rounded-lg text-xs bg-gray-800 hover:bg-gray-700 text-gray-500 border border-gray-700 transition-all"
        >
          <Icon name="ChevronDown" size={11} />
        </button>
      </div>

      {showMenu && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-gray-800 border border-gray-700 rounded-xl shadow-xl w-56 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-700 space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Статус</p>
              <FreshnessBadge status={freshStatus} />
            </div>
            {freshness?.changed_sections && freshness.changed_sections.length > 0 && (
              <p className="text-[10px] text-amber-500">
                Изменились: {freshness.changed_sections.join(", ")}
              </p>
            )}
            {freshness?.last_exported_at && (
              <p className="text-[10px] text-gray-600">
                Последний: {fmtDate(freshness.last_exported_at)}
              </p>
            )}
          </div>
          <div className="px-3 py-2 border-b border-gray-700">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Scope</p>
            {(Object.keys(SCOPE_LABELS) as AiCtxScope[]).map(s => (
              <button key={s} onClick={() => { setScope(s); setShowMenu(false); doExport(false); }}
                className={`w-full text-left text-xs py-1.5 px-1 rounded mt-0.5 transition-colors ${
                  scope === s ? "text-violet-300" : "text-gray-400 hover:text-white"
                }`}>
                {SCOPE_LABELS[s]}
              </button>
            ))}
          </div>
          <div className="px-3 py-2">
            <button onClick={() => { setShowMenu(false); doExport(true); }}
              className="w-full text-left text-xs text-gray-400 hover:text-white flex items-center gap-1.5 py-1">
              <Icon name="Download" size={11} /> Скачать JSON
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
