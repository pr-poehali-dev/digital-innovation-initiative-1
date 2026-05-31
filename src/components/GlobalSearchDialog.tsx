import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";

const GLOBAL_SEARCH_URL = "https://functions.poehali.dev/9a05cfc9-9a18-4ac0-8dfb-02924fe1b7b1";

function getSession(): string {
  return localStorage.getItem("session_id") || "";
}

type SearchResult = {
  entity_type: string;
  entity_id: number;
  title: string;
  snippet: string;
  route: string;
  score: number;
};

type Grouped = Record<string, SearchResult[]>;

const CATEGORY_LABELS: Record<string, string> = {
  project: "Проекты",
  task: "Задачи",
  document: "Документы",
  education: "Образование",
};

const CATEGORY_ICONS: Record<string, string> = {
  project: "FolderOpen",
  task: "Sparkles",
  document: "FileText",
  education: "GraduationCap",
};

const CATEGORY_ORDER = ["project", "task", "document", "education"];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function GlobalSearchDialog({ open, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [grouped, setGrouped] = useState<Grouped>({});
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  // Фокус при открытии
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setGrouped({});
      setActiveIdx(0);
    }
  }, [open]);

  // Escape закрывает
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Поиск с debounce 400мс
  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setGrouped({});
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `${GLOBAL_SEARCH_URL}?q=${encodeURIComponent(q)}`,
        { headers: { "X-Session-Id": getSession() } }
      );
      const data = await res.json();
      setGrouped(data.grouped || {});
      setActiveIdx(0);
    } catch {
      setGrouped({});
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 400);
  };

  // Плоский список для навигации стрелками
  const flatResults: SearchResult[] = CATEGORY_ORDER
    .filter(t => grouped[t]?.length)
    .flatMap(t => grouped[t]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flatResults[activeIdx]) {
      goTo(flatResults[activeIdx]);
    }
  };

  const goTo = (result: SearchResult) => {
    onClose();
    if (result.route) navigate(result.route);
  };

  if (!open) return null;

  const hasResults = CATEGORY_ORDER.some(t => grouped[t]?.length);
  let flatIdx = 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-xl mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100">
          <Icon name="Search" size={18} className="text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Поиск по проектам, задачам, документам..."
            className="flex-1 text-sm text-slate-900 placeholder:text-slate-400 outline-none bg-transparent"
          />
          {loading && (
            <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          )}
          <kbd className="hidden sm:flex items-center gap-0.5 text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {!query || query.trim().length < 2 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              Введите минимум 2 символа для поиска
            </div>
          ) : !loading && !hasResults ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              Ничего не найдено по запросу «{query}»
            </div>
          ) : (
            <div className="py-2">
              {CATEGORY_ORDER.filter(t => grouped[t]?.length).map(entityType => (
                <div key={entityType} className="mb-1">
                  <div className="px-4 py-1.5 flex items-center gap-1.5">
                    <Icon name={CATEGORY_ICONS[entityType]} size={11} className="text-slate-400" />
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                      {CATEGORY_LABELS[entityType]}
                    </span>
                  </div>
                  {grouped[entityType].map(result => {
                    const idx = flatIdx++;
                    const isActive = idx === activeIdx;
                    return (
                      <button
                        key={`${result.entity_type}-${result.entity_id}`}
                        onClick={() => goTo(result)}
                        onMouseEnter={() => setActiveIdx(idx)}
                        className={`w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors ${
                          isActive ? "bg-violet-50" : "hover:bg-slate-50"
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          isActive ? "bg-violet-100" : "bg-slate-100"
                        }`}>
                          <Icon
                            name={CATEGORY_ICONS[result.entity_type]}
                            size={13}
                            className={isActive ? "text-violet-600" : "text-slate-500"}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-medium truncate ${isActive ? "text-violet-700" : "text-slate-800"}`}>
                            {result.title}
                          </div>
                          {result.snippet && (
                            <div className="text-xs text-slate-400 truncate mt-0.5 leading-relaxed">
                              {result.snippet}
                            </div>
                          )}
                        </div>
                        <Icon name="ArrowRight" size={14} className={`flex-shrink-0 mt-1 ${isActive ? "text-violet-400" : "text-slate-300"}`} />
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-slate-100 flex items-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1"><kbd className="bg-slate-100 px-1 rounded font-mono">↑↓</kbd> навигация</span>
          <span className="flex items-center gap-1"><kbd className="bg-slate-100 px-1 rounded font-mono">Enter</kbd> открыть</span>
          <span className="flex items-center gap-1"><kbd className="bg-slate-100 px-1 rounded font-mono">Esc</kbd> закрыть</span>
        </div>
      </div>
    </div>
  );
}
