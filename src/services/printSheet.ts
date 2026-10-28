import { PrintPaperFormat, PrintPhotoItem, PrintSheetConfig } from '../types';
import { mmToPixels } from './imageProcessing';

/**
 * Calculates auto-grid placement for photo copies on a paper sheet
 */
export function calculateAutoGridItems(
  paper: PrintPaperFormat,
  orientation: 'portrait' | 'landscape',
  photoWidthMm: number,
  photoHeightMm: number,
  copies: number,
  marginMm: number = 8,
  gapMm: number = 3
): PrintPhotoItem[] {
  const paperWidthMm = orientation === 'portrait' ? paper.widthMm : paper.heightMm;
  const paperHeightMm = orientation === 'portrait' ? paper.heightMm : paper.widthMm;

  const availableWidth = paperWidthMm - marginMm * 2;
  const availableHeight = paperHeightMm - marginMm * 2;

  const cols = Math.max(1, Math.floor((availableWidth + gapMm) / (photoWidthMm + gapMm)));
  const rows = Math.max(1, Math.floor((availableHeight + gapMm) / (photoHeightMm + gapMm)));

  const maxFit = cols * rows;
  const actualCopies = Math.min(copies, maxFit);

  const items: PrintPhotoItem[] = [];

  for (let i = 0; i < actualCopies; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);

    const xMm = marginMm + col * (photoWidthMm + gapMm);
    const yMm = marginMm + row * (photoHeightMm + gapMm);

    items.push({
      id: 'photo_copy_' + i,
      xMm: Number(xMm.toFixed(2)),
      yMm: Number(yMm.toFixed(2)),
      widthMm: photoWidthMm,
      heightMm: photoHeightMm,
      rotation: 0,
      locked: false,
    });
  }

  return items;
}

/**
 * Renders the full print sheet at exact physical 300 DPI resolution
 */
export function renderPrintSheetCanvas(
  sheetConfig: PrintSheetConfig,
  paper: PrintPaperFormat,
  croppedPhotoCanvas: HTMLCanvasElement,
  dpi: number = 300,
  showCutLines: boolean = true
): HTMLCanvasElement {
  const paperWidthMm = sheetConfig.orientation === 'portrait' ? paper.widthMm : paper.heightMm;
  const paperHeightMm = sheetConfig.orientation === 'portrait' ? paper.heightMm : paper.widthMm;

  const canvasWidthPx = mmToPixels(paperWidthMm, dpi);
  const canvasHeightPx = mmToPixels(paperHeightMm, dpi);

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidthPx;
  canvas.height = canvasHeightPx;

  const ctx = canvas.getContext('2d')!;
  // Clean solid white print background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasWidthPx, canvasHeightPx);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  for (const item of sheetConfig.items) {
    const xPx = mmToPixels(item.xMm, dpi);
    const yPx = mmToPixels(item.yMm, dpi);
    const wPx = mmToPixels(item.widthMm, dpi);
    const hPx = mmToPixels(item.heightMm, dpi);

    ctx.save();
    ctx.translate(xPx + wPx / 2, yPx + hPx / 2);
    if (item.rotation !== 0) {
      ctx.rotate((item.rotation * Math.PI) / 180);
    }

    // Draw photo copy
    ctx.drawImage(croppedPhotoCanvas, -wPx / 2, -hPx / 2, wPx, hPx);

    // Optional subtle cutting guideline for scissors
    if (showCutLines) {
      ctx.strokeStyle = '#D1D5DB';
      ctx.lineWidth = Math.max(1, Math.round(dpi / 300));
      ctx.strokeRect(-wPx / 2, -hPx / 2, wPx, hPx);
    }

    ctx.restore();
  }

  return canvas;
}

/**
 * Triggers native browser print with zero top offset
 */
export function executeDirectPrint(
  sheetConfig: PrintSheetConfig,
  paper: PrintPaperFormat,
  croppedPhotoCanvas: HTMLCanvasElement
): void {
  const mount = document.getElementById('print-mount-point');
  if (!mount) {
    window.print();
    return;
  }

  // Clear previous print mount
  mount.innerHTML = '';
  mount.className = 'block';

  // Render 300 DPI sheet
  const printCanvas = renderPrintSheetCanvas(sheetConfig, paper, croppedPhotoCanvas, 300, true);
  const dataUrl = printCanvas.toDataURL('image/png');

  const img = document.createElement('img');
  img.src = dataUrl;
  img.style.width = '100%';
  img.style.height = 'auto';
  img.style.display = 'block';
  img.style.margin = '0';
  img.style.padding = '0';

  mount.appendChild(img);

  // Allow image to render then open print dialog
  setTimeout(() => {
    window.print();
    setTimeout(() => {
      mount.className = 'hidden';
      mount.innerHTML = '';
    }, 1000);
  }, 200);
}
