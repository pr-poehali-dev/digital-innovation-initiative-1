import { useState } from "react";
import Icon from "@/components/ui/icon";
import { aiContextApi, type AiCtxScope } from "@/lib/admin-api";
import { useToast } from "@/hooks/use-toast";

type Variant = "button" | "card";

interface Props {
  defaultScope?: AiCtxScope;
  variant?: Variant;
}

const SCOPE_LABELS: Record<AiCtxScope, string> = {
  full:     "Full (HQ + Project + Passport)",
  hq:       "Only HQ",
  project:  "Only Project",
  passport: "Only Passport",
};

export default function AiContextExporter({ defaultScope = "full", variant = "button" }: Props) {
  const { toast } = useToast();
  const [loading, setLoading]   = useState(false);
  const [copied,  setCopied]    = useState(false);
  const [scope,   setScope]     = useState<AiCtxScope>(defaultScope);
  const [showMenu, setShowMenu] = useState(false);
  const [meta, setMeta]         = useState<{ generated_at?: string; source_hash?: string } | null>(null);

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

    if (downloadJson) {
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `ai-context-${new Date().toISOString().slice(0,10)}.json`;
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

  if (variant === "card") {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-violet-900/60 flex items-center justify-center">
              <Icon name="BrainCircuit" size={14} className="text-violet-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Unified AI Context</p>
              <p className="text-[11px] text-gray-500">HQ · Project · Passport</p>
            </div>
          </div>
          {meta && (
            <p className="text-[10px] text-gray-600">
              {new Date(meta.generated_at!).toLocaleString("ru-RU", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" })}
              {" · "}
              <span className="font-mono">{meta.source_hash}</span>
            </p>
          )}
        </div>
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
                  : "bg-violet-700 hover:bg-violet-600 text-white disabled:opacity-50"
              }`}>
              {loading
                ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Icon name={copied ? "Check" : "Clipboard"} size={13} />
              }
              {copied ? "Скопировано!" : "Copy Markdown"}
            </button>
            <button onClick={() => doExport(true)} disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-all disabled:opacity-50">
              <Icon name="Download" size={13} />
              JSON
            </button>
          </div>
          <p className="text-[10px] text-gray-700 leading-relaxed">
            Собирается из БД в реальном времени. Не редактируется вручную.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <button
          onClick={() => doExport(false)}
          disabled={loading}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
            copied
              ? "bg-emerald-700 text-white border-emerald-700"
              : "bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-700 disabled:opacity-50"
          }`}
        >
          {loading
            ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            : <Icon name={copied ? "Check" : "BrainCircuit"} size={12} />
          }
          {copied ? "Скопировано!" : "AI Context"}
        </button>
        <button
          onClick={() => setShowMenu(v => !v)}
          className="px-1.5 py-1.5 rounded-lg text-xs bg-gray-800 hover:bg-gray-700 text-gray-500 border border-gray-700 transition-all"
        >
          <Icon name="ChevronDown" size={11} />
        </button>
      </div>

      {showMenu && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-gray-800 border border-gray-700 rounded-xl shadow-xl w-52 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-700">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Scope</p>
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
