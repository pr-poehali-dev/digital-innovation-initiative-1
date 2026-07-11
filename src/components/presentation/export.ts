import type { SlideData } from './slides-data';
import { renderSlideToPng } from './snapshot';

// Экспорт презентации как ВИЗУАЛЬНЫЙ слепок: каждый слайд рендерится в картинку 1280×720
// и вставляется как изображение — в PDF на страницу, в PPTX на слайд.
// Так экспорт визуально идентичен веб-версии (схемы, цвета, композиция сохраняются).

const SLIDE_W = 1280;
const SLIDE_H = 720;

type Progress = (done: number, total: number) => void;

export async function exportPdf(slides: SlideData[], fileName: string, onProgress?: Progress) {
  const { jsPDF } = await import('jspdf');
  // PDF в пикселях под размер слайда 16:9
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [SLIDE_W, SLIDE_H] });

  for (let i = 0; i < slides.length; i++) {
    const png = await renderSlideToPng(slides[i], 2);
    if (i > 0) pdf.addPage([SLIDE_W, SLIDE_H], 'landscape');
    pdf.addImage(png, 'PNG', 0, 0, SLIDE_W, SLIDE_H, undefined, 'FAST');
    onProgress?.(i + 1, slides.length);
  }

  pdf.save(fileName);
}

export async function exportPptx(slides: SlideData[], fileName: string, onProgress?: Progress) {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
  pptx.layout = 'WIDE';

  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    const png = await renderSlideToPng(s, 2);
    const slide = pptx.addSlide();
    slide.background = { color: '0B1120' };
    // картинка на весь слайд (16:9 совпадает)
    slide.addImage({ data: png, x: 0, y: 0, w: 13.33, h: 7.5 });
    if (s.speaker) slide.addNotes(s.speaker);
    onProgress?.(i + 1, slides.length);
  }

  await pptx.writeFile({ fileName });
}
