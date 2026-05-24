import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { searchApi } from "@/lib/api";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";

interface SearchResult {
  chunk_id: number;
  document_id: number;
  document_name: string;
  file_type: string;
  category: string;
  chunk_index: number;
  page_number: number | null;
  snippet: string;
  score: number;
}

export default function SearchPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setSearched(true);
    try {
      const data = await searchApi.searchKnowledge(projectId, query.trim());
      setResults(data.results);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка поиска");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link to="/cabinet" className="hover:text-foreground">Проекты</Link>
          <Icon name="ChevronRight" size={14} />
          <Link to={`/cabinet/project/${projectId}`} className="hover:text-foreground">Проект</Link>
          <Icon name="ChevronRight" size={14} />
          <span className="text-foreground font-medium">Поиск по базе знаний</span>
        </div>

        <h1 className="text-2xl font-bold mb-1">Поиск по базе знаний</h1>
        <p className="text-sm text-muted-foreground mb-6">Найди что угодно в загруженных конспектах, статьях и материалах</p>

        <form onSubmit={search} className="flex gap-2 mb-8">
          <div className="flex-1 relative">
            <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Например: что такое Agile-методология, требования IPMO к структуре..."
              className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {loading ? "Ищу..." : "Найти"}
          </button>
        </form>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {searched && !loading && (
          <div className="mb-4 text-sm text-muted-foreground">
            {results.length > 0 ? `Найдено фрагментов: ${results.length}` : "Ничего не найдено — попробуйте другие слова"}
          </div>
        )}

        <div className="space-y-3">
          {results.map((r) => (
            <Link
              key={r.chunk_id}
              to={`/cabinet/project/${projectId}/document/${r.document_id}`}
              className="block border border-slate-200 rounded-xl p-4 bg-card hover:border-slate-400 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon name="FileText" size={14} className="text-slate-500" />
                <span className="text-sm font-medium truncate">{r.document_name}</span>
                <span className="text-xs text-slate-400 uppercase">{r.file_type}</span>
                {r.page_number && (
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                    стр. {r.page_number}
                  </span>
                )}
                <span className="ml-auto text-xs text-slate-400">
                  релевантность: {r.score}
                </span>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{r.snippet}</p>
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  );
}
