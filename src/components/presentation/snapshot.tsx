import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import html2canvas from 'html2canvas';
import Slide from './Slide';
import { DECK_BG } from './theme';
import type { SlideData } from './slides-data';

// Снимает визуально идентичный слепок слайда: рендерит слайд в offscreen-контейнер
// фиксированного размера 1280×720, отключает анимации (финальный кадр), снимает в PNG.
export async function renderSlideToPng(slide: SlideData, scale = 2): Promise<string> {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.width = '1280px';
  host.style.height = '720px';
  host.style.overflow = 'hidden';
  host.style.background = DECK_BG;
  document.body.appendChild(host);

  const inner = document.createElement('div');
  inner.style.width = '1280px';
  inner.style.height = '720px';
  inner.style.position = 'relative';
  inner.style.background = DECK_BG;
  host.appendChild(inner);

  const root = createRoot(inner);
  // MotionConfig reducedMotion="always" => элементы сразу в финальном (видимом) состоянии
  root.render(
    <MotionConfig reducedMotion="always">
      <div style={{ width: 1280, height: 720, position: 'relative', background: DECK_BG }}>
        {/* фоновое свечение как в деке */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: -120, top: -120, width: 384, height: 384, borderRadius: '9999px', background: 'rgba(37,99,235,0.10)', filter: 'blur(80px)' }} />
          <div style={{ position: 'absolute', right: -140, top: 240, width: 384, height: 384, borderRadius: '9999px', background: 'rgba(124,58,237,0.10)', filter: 'blur(80px)' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 420, width: 384, height: 384, borderRadius: '9999px', background: 'rgba(20,184,166,0.10)', filter: 'blur(80px)' }} />
        </div>
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <Slide data={slide} />
        </div>
      </div>
    </MotionConfig>
  );

  // ждём монтирования и шрифтов
  await new Promise((r) => setTimeout(r, 350));
  try { await (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready; } catch { /* noop */ }

  try {
    const canvas = await html2canvas(inner, {
      backgroundColor: DECK_BG,
      scale,
      width: 1280,
      height: 720,
      windowWidth: 1280,
      windowHeight: 720,
      logging: false,
      useCORS: true,
    });
    return canvas.toDataURL('image/png');
  } finally {
    // гарантированно убираем offscreen-узел, даже если снимок упал
    try { root.unmount(); } catch { /* noop */ }
    if (host.parentNode) document.body.removeChild(host);
  }
}