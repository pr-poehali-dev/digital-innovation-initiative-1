import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Icon from '@/components/ui/icon';
import { DECK_BG } from './theme';
import { getSlides } from './slides-data';
import Slide from './Slide';
import { exportPdf, exportPptx } from './export';
import { toast } from 'sonner';

export default function Deck({ internal = false }: { internal?: boolean }) {
  const slides = getSlides(internal);
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [expDone, setExpDone] = useState(0);
  const total = slides.length;

  const go = useCallback((n: number) => setIdx((c) => Math.min(Math.max(c + n, 0), total - 1)), [total]);
  const goTo = useCallback((n: number) => setIdx(Math.min(Math.max(n, 0), total - 1)), [total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
      if (e.key === 'Home') goTo(0);
      if (e.key === 'End') goTo(total - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, goTo, total]);

  const handleExport = async (kind: 'pdf' | 'pptx') => {
    if (busy) return;
    try {
      setBusy(kind);
      setExpDone(0);
      const name = internal ? 'Траектория-презентация-внутренняя' : 'Траектория-презентация';
      const onProgress = (done: number) => setExpDone(done);
      if (kind === 'pdf') await exportPdf(slides, `${name}.pdf`, onProgress);
      else await exportPptx(slides, `${name}.pptx`, onProgress);
      toast.success(kind === 'pdf' ? 'PDF готов' : 'PowerPoint готов');
    } catch (e) {
      toast.error('Не удалось собрать файл');
      console.error(e);
    } finally {
      setBusy(null);
      setExpDone(0);
    }
  };

  const cur = slides[idx];
  const progress = ((idx + 1) / total) * 100;

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ background: DECK_BG }}>
      {/* фоновое свечение */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl" />
        <div className="absolute -right-40 top-1/3 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-teal-500/10 blur-3xl" />
      </div>

      {/* верхняя панель */}
      <div className="relative z-20 flex items-center justify-between px-4 py-3 md:px-6">
        <div className="flex items-center gap-2 text-white/70">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-blue-500 to-violet-500 text-xs font-black text-white">Т</div>
          <span className="text-sm font-semibold">Траектория</span>
          {internal && <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">ВНУТРЕННЯЯ ВЕРСИЯ</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => handleExport('pdf')} disabled={!!busy}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/20 disabled:opacity-50">
            <Icon name={busy === 'pdf' ? 'Loader' : 'FileText'} size={14} className={busy === 'pdf' ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">PDF</span>
          </button>
          <button onClick={() => handleExport('pptx')} disabled={!!busy}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/20 disabled:opacity-50">
            <Icon name={busy === 'pptx' ? 'Loader' : 'Presentation'} size={14} className={busy === 'pptx' ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">PowerPoint</span>
          </button>
        </div>
      </div>

      {/* прогресс-полоса */}
      <div className="relative z-20 h-0.5 w-full bg-white/5">
        <motion.div className="h-full bg-gradient-to-r from-blue-400 to-teal-300" animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
      </div>

      {/* слайд */}
      <div className="relative z-10 flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div key={cur.id} className="absolute inset-0 overflow-y-auto"
            initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}>
            <Slide data={cur} />
          </motion.div>
        </AnimatePresence>

        {/* стрелки */}
        <button onClick={() => go(-1)} disabled={idx === 0}
          className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white/70 transition hover:bg-white/20 disabled:opacity-0 md:left-4">
          <Icon name="ChevronLeft" size={24} />
        </button>
        <button onClick={() => go(1)} disabled={idx === total - 1}
          className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white/70 transition hover:bg-white/20 disabled:opacity-0 md:right-4">
          <Icon name="ChevronRight" size={24} />
        </button>
      </div>

      {/* нижняя навигация */}
      <div className="relative z-20 flex items-center justify-between gap-4 px-4 py-3 md:px-6">
        <span className="text-xs font-medium text-white/40">{cur.section}</span>
        <div className="flex flex-1 items-center justify-center gap-1 overflow-x-auto">
          {slides.map((s, i) => (
            <button key={s.id} onClick={() => goTo(i)} title={s.title}
              className="shrink-0 rounded-full transition-all"
              style={{
                width: i === idx ? 20 : 6, height: 6,
                background: i === idx ? '#60A5FA' : s.internalOnly ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.2)',
              }} />
          ))}
        </div>
        <span className="text-xs font-semibold tabular-nums text-white/60">{idx + 1} / {total}</span>
      </div>

      {/* оверлей прогресса экспорта */}
      {busy && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-72 rounded-2xl border border-white/10 bg-slate-900/90 p-6 text-center">
            <Icon name="Loader" size={28} className="mx-auto animate-spin text-blue-400" />
            <div className="mt-3 text-sm font-semibold text-white">
              Собираю {busy === 'pdf' ? 'PDF' : 'PowerPoint'}
            </div>
            <div className="mt-1 text-xs text-white/50">Рендерю слайды в изображения…</div>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-gradient-to-r from-blue-400 to-teal-300 transition-all"
                style={{ width: `${Math.round((expDone / total) * 100)}%` }} />
            </div>
            <div className="mt-2 text-xs font-medium tabular-nums text-white/60">{expDone} / {total}</div>
          </div>
        </div>
      )}
    </div>
  );
}