import type { SlideData } from './slides-data';

// Экспорт презентации в PDF и PowerPoint.
// В файлах схемы становятся статичными: экспортируется аккуратный текстовый слепок каждого слайда.

const BG = '0B1120';
const CARD = '162138';

function slideLines(s: SlideData): { heading: string; sub?: string; blocks: string[] } {
  const blocks: string[] = [];
  if (s.lead) blocks.push(s.lead);
  if (s.steps) blocks.push(s.steps.join('  →  '));
  if (s.bullets) s.bullets.forEach((b) => blocks.push('•  ' + b));
  if (s.groups) s.groups.forEach((g) => blocks.push(g.title + ': ' + g.items.join(', ')));
  if (s.columns) s.columns.forEach((c) => blocks.push(c.title + ': ' + c.items.join(', ')));
  return { heading: s.title || '', sub: s.subtitle, blocks };
}

export async function exportPptx(slides: SlideData[], fileName: string) {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
  pptx.layout = 'WIDE';

  slides.forEach((s) => {
    const slide = pptx.addSlide();
    slide.background = { color: BG };
    const { heading, sub, blocks } = slideLines(s);

    if (s.kind === 'title' || s.kind === 'final') {
      slide.addText(heading, { x: 0.5, y: 2.4, w: 12.33, h: 1.6, align: 'center', fontSize: 48, bold: true, color: '60A5FA' });
      if (sub) slide.addText(sub, { x: 1, y: 4.1, w: 11.33, h: 1, align: 'center', fontSize: 22, color: 'FFFFFF' });
      if (s.lead) slide.addText(s.lead, { x: 1, y: 5.1, w: 11.33, h: 0.8, align: 'center', fontSize: 16, color: 'B0BAD0' });
      return;
    }

    slide.addText((s.section || '').toUpperCase(), { x: 0.6, y: 0.35, w: 12, h: 0.4, fontSize: 11, color: '7C8AA8', charSpacing: 2 });
    slide.addText(heading, { x: 0.6, y: 0.75, w: 12.13, h: 0.9, fontSize: 28, bold: true, color: 'FFFFFF' });

    if (sub) slide.addText(sub, { x: 0.6, y: 1.7, w: 12.13, h: 0.6, fontSize: 18, color: 'B0BAD0' });

    const textBlocks = blocks.map((b) => ({ text: b, options: { fontSize: 15, color: 'D6DDEC', breakLine: true, paraSpaceAfter: 8 } }));
    if (textBlocks.length) {
      slide.addText(textBlocks as never, { x: 0.8, y: sub ? 2.5 : 2.1, w: 11.7, h: 4.6, valign: 'top', fill: { color: CARD }, rectRadius: 0.12 });
    }
    if (s.speaker) {
      slide.addNotes(s.speaker);
    }
  });

  await pptx.writeFile({ fileName });
}

export async function exportPdf(slides: SlideData[], fileName: string) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [960, 540] });
  const W = 960;
  const H = 540;

  slides.forEach((s, idx) => {
    if (idx > 0) pdf.addPage([960, 540], 'landscape');
    pdf.setFillColor(11, 17, 32);
    pdf.rect(0, 0, W, H, 'F');
    const { heading, sub, blocks } = slideLines(s);

    if (s.kind === 'title' || s.kind === 'final') {
      pdf.setTextColor(96, 165, 250);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(46);
      pdf.text(heading, W / 2, 230, { align: 'center', maxWidth: W - 120 });
      if (sub) { pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(20); pdf.text(sub, W / 2, 300, { align: 'center', maxWidth: W - 160 }); }
      if (s.lead) { pdf.setTextColor(160, 172, 200); pdf.setFontSize(15); pdf.text(s.lead, W / 2, 340, { align: 'center', maxWidth: W - 200 }); }
      return;
    }

    pdf.setTextColor(124, 138, 168);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.text((s.section || '').toUpperCase(), 50, 55);

    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(26);
    pdf.text(heading, 50, 95, { maxWidth: W - 100 });

    let y = 150;
    if (sub) { pdf.setTextColor(176, 186, 208); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(16); pdf.text(sub, 50, y, { maxWidth: W - 100 }); y += 34; }

    pdf.setTextColor(214, 221, 236);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(14);
    blocks.forEach((b) => {
      const lines = pdf.splitTextToSize(b, W - 120) as string[];
      lines.forEach((ln) => { if (y < H - 40) { pdf.text(ln, 55, y); y += 22; } });
      y += 6;
    });

    pdf.setTextColor(90, 100, 124);
    pdf.setFontSize(10);
    pdf.text(`${idx + 1} / ${slides.length}`, W - 60, H - 24);
  });

  pdf.save(fileName);
}
