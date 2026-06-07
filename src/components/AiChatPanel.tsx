import { useState, useRef, useEffect } from "react";
import Icon from "@/components/ui/icon";
import { sendChatMessage, type ChatMessage } from "@/lib/aiChatApi";

const SUGGESTIONS = [
  "С чего начать развитие?",
  "Как выбрать целевую роль?",
  "Что такое карта компетенций?",
  "Как подтвердить навык?",
];

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function AiChatPanel({ open, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: "assistant",
        text: "Привет! Я AI-помощник Траектории. Могу помочь разобраться с развитием компетенций, выбором роли или использованием платформы. Что тебя интересует?",
      }]);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { role: "user", text: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const answer = await sendChatMessage(next);
      setMessages(prev => [...prev, { role: "assistant", text: answer }]);
    } catch {
      setError("Не удалось получить ответ. Попробуй ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-sm z-50 flex flex-col bg-white shadow-2xl border-l border-slate-200">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <Icon name="Sparkles" size={14} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">AI-помощник</p>
              <p className="text-[10px] text-slate-400">YandexGPT · Траектория</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <Icon name="X" size={14} className="text-slate-500" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && (
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5 mr-2">
                  <Icon name="Sparkles" size={11} className="text-white" />
                </div>
              )}
              <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-slate-900 text-white rounded-tr-sm"
                  : "bg-slate-50 text-slate-700 border border-slate-200 rounded-tl-sm"
              }`}>
                {m.text.split("\n").map((line, j) => (
                  <span key={j}>
                    {line}
                    {j < m.text.split("\n").length - 1 && <br />}
                  </span>
                ))}
              </div>
            </div>
          ))}

          {/* Loading */}
          {loading && (
            <div className="flex justify-start">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5 mr-2">
                <Icon name="Sparkles" size={11} className="text-white" />
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
              <Icon name="AlertCircle" size={13} />
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Suggestions — показываем только в начале */}
        {messages.length <= 1 && !loading && (
          <div className="px-4 pb-2 flex flex-wrap gap-1.5 flex-shrink-0">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => send(s)}
                className="text-xs px-2.5 py-1.5 bg-slate-50 hover:bg-violet-50 hover:text-violet-700 border border-slate-200 hover:border-violet-200 text-slate-600 rounded-lg transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="px-3 pb-3 pt-2 border-t border-slate-100 flex-shrink-0">
          <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2 focus-within:border-violet-400 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Спроси что-нибудь..."
              rows={1}
              className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 resize-none focus:outline-none min-h-[24px] max-h-[120px]"
              style={{ height: "auto" }}
              onInput={e => {
                const t = e.currentTarget;
                t.style.height = "auto";
                t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
              }}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || loading}
              className="w-7 h-7 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-30 flex items-center justify-center flex-shrink-0 transition-all"
            >
              <Icon name="ArrowUp" size={14} className="text-white" />
            </button>
          </div>
          <p className="text-[10px] text-slate-400 text-center mt-1.5">
            Enter — отправить · Shift+Enter — перенос строки
          </p>
        </div>

      </div>
    </>
  );
}
