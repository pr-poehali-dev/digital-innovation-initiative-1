import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { searchApi } from "@/lib/api";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";

interface ChatItem {
  id: number;
  question: string;
  answer: string;
  sources: { chunk_id: number; page_number: number | null; chunk_index: number; snippet: string }[];
  created_at: string;
  user_name: string;
}

export default function DocumentChatPage() {
  const { id, docId } = useParams<{ id: string; docId: string }>();
  const projectId = Number(id);
  const documentId = Number(docId);

  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<ChatItem[]>([]);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const loadHistory = () => {
    searchApi.getChatHistory(documentId)
      .then((d) => setHistory(d.history))
      .catch(() => {});
  };

  useEffect(() => { loadHistory(); }, [documentId]);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setAsking(true);
    setError("");
    try {
      await searchApi.chatWithDocument(documentId, question.trim());
      setQuestion("");
      loadHistory();
      setTimeout(() => listRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 100);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setAsking(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link to="/cabinet" className="hover:text-foreground">Проекты</Link>
          <Icon name="ChevronRight" size={14} />
          <Link to={`/cabinet/project/${projectId}`} className="hover:text-foreground">Проект</Link>
          <Icon name="ChevronRight" size={14} />
          <span className="text-foreground font-medium">Чат с документом</span>
        </div>

        <h1 className="text-2xl font-bold mb-1">Чат с документом</h1>
        <p className="text-sm text-muted-foreground mb-6">Задай вопрос — AI ответит со ссылками на конкретные фрагменты</p>

        <form onSubmit={ask} className="mb-6">
          <div className="flex gap-2">
            <input
              autoFocus
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="О чём вторая глава? Какие требования у IPMO к...?"
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500"
            />
            <button
              type="submit"
              disabled={asking || !question.trim()}
              className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {asking ? "Думаю..." : "Спросить"}
            </button>
          </div>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </form>

        <div ref={listRef} className="space-y-4">
          {history.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                <Icon name="MessageCircle" size={22} />
              </div>
              <p className="text-sm">Истории вопросов пока нет</p>
            </div>
          ) : (
            history.map((item) => (
              <div key={item.id} className="space-y-2">
                <div className="bg-slate-100 rounded-2xl rounded-tr-md px-4 py-3 ml-auto max-w-[85%]">
                  <p className="text-sm font-medium">{item.question}</p>
                  <p className="text-xs text-slate-500 mt-1">{item.user_name} · {new Date(item.created_at).toLocaleString("ru-RU")}</p>
                </div>
                <div className="bg-card border border-slate-200 rounded-2xl rounded-tl-md px-4 py-3 max-w-[90%]">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon name="Sparkles" size={14} className="text-slate-600" />
                    <span className="text-xs font-medium text-slate-600">AI</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{item.answer}</p>
                  {item.sources.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <p className="text-xs font-medium text-slate-500 mb-2">Источники:</p>
                      <div className="space-y-1.5">
                        {item.sources.map((s, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-slate-600">
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] flex-shrink-0">
                              {s.page_number ? `стр. ${s.page_number}` : `фрагмент ${s.chunk_index + 1}`}
                            </span>
                            <span className="italic">{s.snippet}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}
