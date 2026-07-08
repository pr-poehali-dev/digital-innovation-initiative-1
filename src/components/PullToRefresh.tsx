import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/icon";

const THRESHOLD = 65;
const MAX_PULL = 100;
const RESISTANCE = 0.5;

/**
 * Оборачивает контент страницы: жест "потянуть вниз" в самом верху скролла
 * перезагружает страницу — как pull-to-refresh в нативных приложениях.
 * Работает только когда скролл окна находится в самом верху (scrollY === 0),
 * чтобы не мешать обычной прокрутке контента.
 */
export default function PullToRefresh({ children }: { children: React.ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const startYRef = useRef<number | null>(null);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const getScrollTop = () => window.scrollY || document.documentElement.scrollTop || 0;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing) return;
      if (getScrollTop() > 0) { startYRef.current = null; return; }
      startYRef.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (refreshing || startYRef.current === null) return;
      const delta = e.touches[0].clientY - startYRef.current;
      if (delta <= 0) { setDistance(0); return; }
      // Если за время жеста страницу успели прокрутить — отменяем
      if (getScrollTop() > 0) { startYRef.current = null; setDistance(0); return; }
      e.preventDefault();
      setDistance(Math.min(delta * RESISTANCE, MAX_PULL));
    };

    const onTouchEnd = () => {
      if (startYRef.current === null) return;
      startYRef.current = null;
      if (distance >= THRESHOLD) {
        setRefreshing(true);
        setDistance(THRESHOLD);
        window.location.reload();
      } else {
        setDistance(0);
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distance, refreshing]);

  const progress = Math.min(distance / THRESHOLD, 1);

  return (
    <div ref={wrapperRef} className="relative">
      <div
        className="pointer-events-none absolute left-0 right-0 flex justify-center overflow-hidden transition-[height] duration-150"
        style={{ height: distance, top: 0 }}
      >
        <div
          className="flex items-center justify-center w-8 h-8 rounded-full bg-white shadow-md border border-slate-200 mt-2"
          style={{
            opacity: progress,
            transform: `scale(${0.6 + progress * 0.4})`,
          }}
        >
          <Icon
            name={refreshing ? "Loader2" : "ArrowDown"}
            size={16}
            className={`text-slate-500 ${refreshing ? "animate-spin" : ""}`}
            style={!refreshing ? { transform: `rotate(${progress * 180}deg)` } : undefined}
          />
        </div>
      </div>
      <div
        style={{
          transform: distance ? `translateY(${distance}px)` : undefined,
          transition: distance ? undefined : "transform 150ms ease-out",
        }}
      >
        {children}
      </div>
    </div>
  );
}
