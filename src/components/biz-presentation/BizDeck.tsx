import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Icon from "@/components/ui/icon";
import type { Presentation, Slide } from "@/lib/bizPresentationsApi";
import BizSlide from "./BizSlide";

export default function BizDeck({
  presentation,
  slides,
  onExit,
}: {
  presentation: Presentation;
  slides: Slide[];
  onExit?: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const total = slides.length;

  const go = useCallback((n: number) => setIdx((c) => Math.min(Math.max(c + n, 0), total - 1)), [total]);
  const goTo = useCallback((n: number) => setIdx(Math.min(Math.max(n, 0), total - 1)), [total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); go(1); }
      if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(-1); }
      if (e.key === "Home") goTo(0);
      if (e.key === "End") goTo(total - 1);
      if (e.key === "Escape" && onExit) onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, goTo, total, onExit]);

  if (total === 0) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white text-gray-400">
        В этой презентации пока нет слайдов
      </div>
    );
  }

  const cur = slides[idx];
  const progress = ((idx + 1) / total) * 100;

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-white">
      <div className="relative z-20 flex items-center justify-between px-4 py-2.5 md:px-6 border-b border-gray-100">
        <div className="flex items-center gap-2 text-gray-700">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-fuchsia-600 flex items-center justify-center text-xs font-black text-white">
            Т
          </div>
          <span className="text-sm font-semibold" style={{ fontFamily: "'Montserrat',sans-serif" }}>
            {presentation.title}
          </span>
        </div>
        {onExit && (
          <button
            onClick={onExit}
            className="flex items-center gap-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition"
          >
            <Icon name="X" size={14} />
            Закрыть
          </button>
        )}
      </div>

      <div className="relative z-20 h-1 w-full bg-gray-100">
        <motion.div
          className="h-full bg-gradient-to-r from-orange-500 to-fuchsia-600"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      <div className="relative z-10 flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={cur.id}
            className="absolute inset-0"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <BizSlide slide={cur} presTitle={presentation.title} />
          </motion.div>
        </AnimatePresence>

        <button
          onClick={() => go(-1)}
          disabled={idx === 0}
          className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white shadow-md border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50 disabled:opacity-0 md:left-4"
        >
          <Icon name="ChevronLeft" size={22} />
        </button>
        <button
          onClick={() => go(1)}
          disabled={idx === total - 1}
          className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white shadow-md border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50 disabled:opacity-0 md:right-4"
        >
          <Icon name="ChevronRight" size={22} />
        </button>
      </div>

      <div className="relative z-20 flex items-center justify-between gap-4 px-4 py-2.5 md:px-6 border-t border-gray-100">
        <span className="text-xs font-medium text-gray-400 truncate max-w-[120px]">{cur.title}</span>
        <div className="flex flex-1 items-center justify-center gap-1 overflow-x-auto">
          {slides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => goTo(i)}
              title={s.title}
              className="shrink-0 rounded-full transition-all"
              style={{
                width: i === idx ? 20 : 6,
                height: 6,
                background: i === idx ? "#f97316" : "#e5e7eb",
              }}
            />
          ))}
        </div>
        <span className="text-xs font-semibold tabular-nums text-gray-500">
          {idx + 1} / {total}
        </span>
      </div>
    </div>
  );
}
