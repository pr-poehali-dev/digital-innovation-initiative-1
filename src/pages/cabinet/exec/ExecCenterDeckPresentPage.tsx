import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";
import { DashboardData, ModelData, centerApi } from "@/lib/execCenterApi";
import { DeckSlide, deckApi } from "@/lib/execCenterDeckApi";
import SlideRenderer, { SlideContext } from "@/components/exec/deck/SlideRenderer";
import { exportDeckPdf } from "@/components/exec/deck/deckExport";

/** Полноэкранный показ + печать + PDF-экспорт презентации обоснования Центра. */
export default function ExecCenterDeckPresentPage() {
  const nav = useNavigate();
  const [slides, setSlides] = useState<DeckSlide[]>([]);
  const [model, setModel] = useState<ModelData | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    Promise.all([deckApi.deck(), centerApi.model(), centerApi.dashboard()])
      .then(([d, m, db]) => {
        setSlides(d.slides.filter((s) => s.is_included));
        setModel(m);
        setDashboard(db);
      })
      .finally(() => setLoading(false));
  }, []);

  const ctx: SlideContext | null = model && dashboard ? { model, dashboard, expertValues: [] } : null;
  const total = slides.length;

  const go = useCallback((n: number) => setIdx((c) => Math.min(Math.max(c + n, 0), total - 1)), [total]);
  const goTo = useCallback((n: number) => setIdx(Math.min(Math.max(n, 0), total - 1)), [total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        go(1);
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(-1);
      }
      if (e.key === "Home") goTo(0);
      if (e.key === "End") goTo(total - 1);
      if (e.key === "Escape") nav("/cabinet/exec/deck");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, goTo, total, nav]);

  const notReadyCount = useMemo(() => slides.filter((s) => !s.is_ready).length, [slides]);

  const doExportPdf = async () => {
    if (!ctx) return;
    setExporting({ done: 0, total: slides.length });
    try {
      await exportDeckPdf(
        slides,
        ctx,
        `Обоснование_Центра_${new Date().toISOString().slice(0, 10)}.pdf`,
        (done, tot) => setExporting({ done, total: tot }),
      );
    } finally {
      setExporting(null);
    }
  };

  if (loading || !ctx) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="w-7 h-7 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!total) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-white text-slate-400 gap-3">
        <p>Нет включённых слайдов для показа</p>
        <button
          onClick={() => nav("/cabinet/exec/deck")}
          className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700 transition-colors"
        >
          Вернуться к конструктору
        </button>
      </div>
    );
  }

  const cur = slides[idx];
  const progress = ((idx + 1) / total) * 100;

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-white print:static">
      <div className="relative z-20 flex items-center justify-between px-4 py-2.5 md:px-6 border-b border-slate-100 print:hidden">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">
            {model?.center?.title}
          </span>
          {notReadyCount > 0 && (
            <span className="text-[11px] text-amber-600 flex items-center gap-1">
              <Icon name="TriangleAlert" size={11} />
              {notReadyCount} слайдов без данных
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors"
          >
            <Icon name="Printer" size={13} />
            Печать
          </button>
          <button
            onClick={doExportPdf}
            disabled={!!exporting}
            className="flex items-center gap-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors disabled:opacity-50"
          >
            <Icon name="FileDown" size={13} />
            {exporting ? `${exporting.done}/${exporting.total}…` : "PDF"}
          </button>
          <button
            onClick={() => nav("/cabinet/exec/deck")}
            className="flex items-center gap-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors"
          >
            <Icon name="X" size={13} />
            Закрыть
          </button>
        </div>
      </div>
      <div className="h-0.5 bg-slate-100 print:hidden">
        <div className="h-full bg-violet-500 transition-all" style={{ width: `${progress}%` }} />
      </div>

      <div className="flex-1 relative overflow-hidden print:hidden">
        <div className="absolute inset-0 flex items-center justify-center p-4 md:p-8">
          <div className="w-full h-full max-w-[1400px] mx-auto shadow-xl rounded-xl overflow-hidden border border-slate-200" style={{ aspectRatio: "16/9" }}>
            <SlideRenderer slide={cur} ctx={ctx} />
          </div>
        </div>
      </div>

      <div className="relative z-20 flex items-center justify-center gap-4 px-4 py-3 border-t border-slate-100 print:hidden">
        <button
          onClick={() => go(-1)}
          disabled={idx === 0}
          className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors"
        >
          <Icon name="ChevronLeft" size={18} className="text-slate-600" />
        </button>
        <span className="text-xs text-slate-400 tabular-nums w-16 text-center">
          {idx + 1} / {total}
        </span>
        <button
          onClick={() => go(1)}
          disabled={idx === total - 1}
          className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors"
        >
          <Icon name="ChevronRight" size={18} className="text-slate-600" />
        </button>
      </div>

      {/* Печатная версия: все слайды подряд, каждый на отдельной странице */}
      <div className="hidden print:block">
        {slides.map((s) => (
          <div key={s.key} style={{ width: "1280px", height: "720px", pageBreakAfter: "always" }}>
            <SlideRenderer slide={s} ctx={ctx} />
          </div>
        ))}
      </div>
    </div>
  );
}
