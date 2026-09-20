import html2canvas from "html2canvas";

// Экспорт схемы процесса — визуальный слепок реально отрисованного холста
// (тот же DOM, что видит пользователь), с подписью метаданных снизу.
// Схема формируется из структурированных данных (узлы/рёбра/дорожки),
// а не хранится как картинка — экспорт лишь фиксирует текущий вид.

export interface DiagramExportMeta {
  processName: string;
  variantLabel: string;
  version: number;
  statusLabel: string;
}

async function captureCanvas(canvasEl: HTMLElement, meta: DiagramExportMeta): Promise<HTMLCanvasElement> {
  const rect = canvasEl.getBoundingClientRect();
  const canvas = await html2canvas(canvasEl, {
    backgroundColor: "#ffffff",
    scale: 2,
    logging: false,
    useCORS: true,
    width: canvasEl.scrollWidth,
    height: canvasEl.scrollHeight,
    windowWidth: canvasEl.scrollWidth,
    windowHeight: canvasEl.scrollHeight,
  });

  // Дорисовываем подпись метаданных под схемой на отдельном canvas.
  const footerH = 60;
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height + footerH * 2;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 24px Inter, sans-serif";
  ctx.fillText(meta.processName, 20, canvas.height + 34);
  ctx.fillStyle = "#64748b";
  ctx.font = "18px Inter, sans-serif";
  ctx.fillText(
    `${meta.variantLabel} · версия ${meta.version} · ${meta.statusLabel} · ${new Date().toLocaleDateString("ru-RU")}`,
    20,
    canvas.height + 64,
  );
  void rect;
  return out;
}

export async function exportDiagramPng(canvasEl: HTMLElement, meta: DiagramExportMeta, fileName: string) {
  const canvas = await captureCanvas(canvasEl, meta);
  const link = document.createElement("a");
  link.download = fileName;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

export async function exportDiagramPdf(canvasEl: HTMLElement, meta: DiagramExportMeta, fileName: string) {
  const canvas = await captureCanvas(canvasEl, meta);
  const { jsPDF } = await import("jspdf");
  const orientation = canvas.width >= canvas.height ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "px", format: [canvas.width, canvas.height] });
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height, undefined, "FAST");
  pdf.save(fileName);
}
