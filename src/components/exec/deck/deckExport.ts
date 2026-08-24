import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import { createElement } from "react";
import SlideRenderer, { SlideContext } from "./SlideRenderer";
import { DeckSlide } from "@/lib/execCenterDeckApi";

// Экспорт как визуальный слепок: каждый включённый слайд рендерится офскрином
// в 1280×720 и вставляется в PDF картинкой — так текст, диаграммы и цвета
// остаются такими же, как на экране, без потери качества.

const W = 1280;
const H = 720;

type Progress = (done: number, total: number) => void;

export async function renderDeckSlideToPng(
  slide: DeckSlide,
  ctx: SlideContext,
  scale = 2,
): Promise<string> {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = `${W}px`;
  host.style.height = `${H}px`;
  host.style.overflow = "hidden";
  host.style.background = "#ffffff";
  document.body.appendChild(host);

  const root = createRoot(host);
  root.render(
    createElement(
      "div",
      { style: { width: W, height: H, background: "#fff" } },
      createElement(SlideRenderer, { slide, ctx }),
    ),
  );

  await new Promise((r) => setTimeout(r, 300));
  try {
    await (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
  } catch {
    // шрифты недоступны — снимаем как есть
  }

  try {
    const canvas = await html2canvas(host, {
      backgroundColor: "#ffffff",
      scale,
      width: W,
      height: H,
      windowWidth: W,
      windowHeight: H,
      logging: false,
      useCORS: true,
    });
    return canvas.toDataURL("image/png");
  } finally {
    try {
      root.unmount();
    } catch {
      // уже размонтирован
    }
    if (host.parentNode) document.body.removeChild(host);
  }
}

export async function exportDeckPdf(
  slides: DeckSlide[],
  ctx: SlideContext,
  fileName: string,
  onProgress?: Progress,
) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [W, H] });

  for (let i = 0; i < slides.length; i++) {
    const png = await renderDeckSlideToPng(slides[i], ctx, 2);
    if (i > 0) pdf.addPage([W, H], "landscape");
    pdf.addImage(png, "PNG", 0, 0, W, H, undefined, "FAST");
    onProgress?.(i + 1, slides.length);
  }

  pdf.save(fileName);
}
