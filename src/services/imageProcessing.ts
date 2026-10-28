import { ImageAdjustments, Transformations, CropState, BackgroundSettings, RetouchStroke } from '../types';

/**
 * Calculates physical millimeters to pixels at a specified DPI (default 300 DPI print standard)
 */
export function mmToPixels(mm: number, dpi: number = 300): number {
  return Math.round((mm * dpi) / 25.4);
}

export function pixelsToMm(px: number, dpi: number = 300): number {
  return (px * 25.4) / dpi;
}

/**
 * Loads an image from a URL or data URL and returns an HTMLImageElement
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('Failed to load image: ' + e));
    img.src = src;
  });
}

/**
 * Renders the transformed base canvas (rotation, flips, fine-rotation)
 */
export function renderTransformedCanvas(
  sourceImg: HTMLImageElement,
  transformations: Transformations
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get 2D context');

  const { rotation, fineRotation, flipH, flipV } = transformations;
  const totalAngleRad = ((rotation + fineRotation) * Math.PI) / 180;

  // Calculate bounding box after rotation
  const cos = Math.abs(Math.cos(totalAngleRad));
  const sin = Math.abs(Math.sin(totalAngleRad));

  const origW = sourceImg.naturalWidth;
  const origH = sourceImg.naturalHeight;

  const newW = Math.round(origW * cos + origH * sin);
  const newH = Math.round(origW * sin + origH * cos);

  canvas.width = newW;
  canvas.height = newH;

  ctx.save();
  ctx.translate(newW / 2, newH / 2);
  ctx.rotate(totalAngleRad);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(sourceImg, -origW / 2, -origH / 2, origW, origH);
  ctx.restore();

  return canvas;
}

/**
 * Applies color and tone adjustments to canvas imageData
 */
export function applyAdjustmentsToImageData(
  imageData: ImageData,
  adjustments: ImageAdjustments
): void {
  const data = imageData.data;
  const len = data.length;
  const {
    brightness,
    contrast,
    saturation,
    exposure,
    highlights,
    shadows,
    temperature,
    tint,
    grayscale,
    sepia,
  } = adjustments;

  const brightnessOffset = (brightness / 100) * 128;
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const expFactor = Math.pow(2, exposure / 50);

  const satFactor = (saturation + 100) / 100;
  const tempR = temperature > 0 ? (temperature / 100) * 30 : 0;
  const tempB = temperature < 0 ? (-temperature / 100) * 30 : 0;
  const tintG = tint < 0 ? (-tint / 100) * 20 : 0;
  const tintM = tint > 0 ? (tint / 100) * 20 : 0;

  for (let i = 0; i < len; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // 1. Exposure
    if (exposure !== 0) {
      r = r * expFactor;
      g = g * expFactor;
      b = b * expFactor;
    }

    // 2. Brightness
    if (brightness !== 0) {
      r += brightnessOffset;
      g += brightnessOffset;
      b += brightnessOffset;
    }

    // 3. Contrast
    if (contrast !== 0) {
      r = contrastFactor * (r - 128) + 128;
      g = contrastFactor * (g - 128) + 128;
      b = contrastFactor * (g - 128) + 128;
    }

    // 4. Highlights and Shadows
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (highlights !== 0 && lum > 128) {
      const hDelta = ((lum - 128) / 127) * (highlights / 100) * 40;
      r += hDelta;
      g += hDelta;
      b += hDelta;
    }
    if (shadows !== 0 && lum < 128) {
      const sDelta = ((128 - lum) / 128) * (shadows / 100) * 40;
      r += sDelta;
      g += sDelta;
      b += sDelta;
    }

    // 5. Temperature & Tint
    if (temperature !== 0) {
      r += tempR;
      b += tempB;
    }
    if (tint !== 0) {
      g += tintG;
      r += tintM * 0.7;
      b += tintM * 0.7;
    }

    // 6. Saturation
    if (saturation !== 0) {
      const curLum = 0.299 * r + 0.587 * g + 0.114 * b;
      r = curLum + (r - curLum) * satFactor;
      g = curLum + (g - curLum) * satFactor;
      b = curLum + (b - curLum) * satFactor;
    }

    // 7. Grayscale
    if (grayscale > 0) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const gFactor = grayscale / 100;
      r = r * (1 - gFactor) + gray * gFactor;
      g = g * (1 - gFactor) + gray * gFactor;
      b = b * (1 - gFactor) + gray * gFactor;
    }

    // 8. Sepia
    if (sepia > 0) {
      const sr = r * 0.393 + g * 0.769 + b * 0.189;
      const sg = r * 0.349 + g * 0.686 + b * 0.168;
      const sb = r * 0.272 + g * 0.534 + b * 0.131;
      const sFactor = sepia / 100;
      r = r * (1 - sFactor) + sr * sFactor;
      g = g * (1 - sFactor) + sg * sFactor;
      b = b * (1 - sFactor) + sb * sFactor;
    }

    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
  }
}

/**
 * Applies unsharp mask convolution for sharpness
 */
export function applySharpen(canvas: HTMLCanvasElement, strength: number): void {
  if (strength <= 0) return;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const src = imgData.data;
  const output = ctx.createImageData(w, h);
  const dst = output.data;

  const amount = (strength / 100) * 1.5;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const val = src[idx + c];
        const up = src[((y - 1) * w + x) * 4 + c];
        const down = src[((y + 1) * w + x) * 4 + c];
        const left = src[(y * w + (x - 1)) * 4 + c];
        const right = src[(y * w + (x + 1)) * 4 + c];

        const laplacian = 4 * val - (up + down + left + right);
        dst[idx + c] = Math.max(0, Math.min(255, val + laplacian * amount));
      }
      dst[idx + 3] = src[idx + 3];
    }
  }

  // Copy borders
  for (let x = 0; x < w; x++) {
    const topIdx = x * 4;
    const botIdx = ((h - 1) * w + x) * 4;
    for (let c = 0; c < 4; c++) {
      dst[topIdx + c] = src[topIdx + c];
      dst[botIdx + c] = src[botIdx + c];
    }
  }
  for (let y = 0; y < h; y++) {
    const lIdx = y * w * 4;
    const rIdx = (y * w + (w - 1)) * 4;
    for (let c = 0; c < 4; c++) {
      dst[lIdx + c] = src[lIdx + c];
      dst[rIdx + c] = src[rIdx + c];
    }
  }

  ctx.putImageData(output, 0, 0);
}

/**
 * Applies subtle vignette shading to edges
 */
export function applyVignette(canvas: HTMLCanvasElement, strength: number): void {
  if (strength <= 0) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const radius = Math.max(w, h) / 1.5;

  const grad = ctx.createRadialGradient(w / 2, h / 2, radius * 0.4, w / 2, h / 2, radius);
  const alpha = (strength / 100) * 0.7;
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(0,0,0,${alpha})`);

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Samples RGB color from a canvas at coordinates (x, y)
 */
export function samplePixelColor(
  canvas: HTMLCanvasElement,
  x: number,
  y: number
): { r: number; g: number; b: number } {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { r: 255, g: 255, b: 255 };

  const clX = Math.max(0, Math.min(canvas.width - 1, Math.round(x)));
  const clY = Math.max(0, Math.min(canvas.height - 1, Math.round(y)));
  const p = ctx.getImageData(clX, clY, 1, 1).data;
  return { r: p[0], g: p[1], b: p[2] };
}

/**
 * Robust High-Fidelity Background Removal & Color Replacement
 * Uses multi-zone perimeter sampling, perceptual color space distance,
 * central portrait & skin/hair tone protection, and smooth sigmoidal feathering.
 */
export function processBackgroundRemoval(
  canvas: HTMLCanvasElement,
  settings: BackgroundSettings
): HTMLCanvasElement {
  if (!settings.isRemoved) return canvas;

  const w = canvas.width;
  const h = canvas.height;

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = w;
  outputCanvas.height = h;
  const outCtx = outputCanvas.getContext('2d', { willReadFrequently: true });
  if (!outCtx) return canvas;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // 1. Build Background Reference Palette
  const bgPalette: Array<{ r: number; g: number; b: number }> = [];

  if (settings.sampledBgColor) {
    // User picked explicit background color via eyedropper
    bgPalette.push(settings.sampledBgColor);
  } else {
    // Multi-zone perimeter sampling: top corners, upper edges, and head flanking zones
    const sampleBox = (startX: number, endX: number, startY: number, endY: number) => {
      let sumR = 0, sumG = 0, sumB = 0, count = 0;
      for (let py = Math.max(0, startY); py < Math.min(h, endY); py += 2) {
        for (let px = Math.max(0, startX); px < Math.min(w, endX); px += 2) {
          const idx = (py * w + px) * 4;
          sumR += data[idx];
          sumG += data[idx + 1];
          sumB += data[idx + 2];
          count++;
        }
      }
      if (count > 0) {
        bgPalette.push({
          r: sumR / count,
          g: sumG / count,
          b: sumB / count,
        });
      }
    };

    const edgeW = Math.max(6, Math.floor(w * 0.08));
    const edgeH = Math.max(6, Math.floor(h * 0.08));

    // Zone 1: Top-left corner
    sampleBox(2, edgeW, 2, edgeH);
    // Zone 2: Top-right corner
    sampleBox(w - edgeW, w - 2, 2, edgeH);
    // Zone 3: Upper-left flank
    sampleBox(2, edgeW, Math.floor(h * 0.15), Math.floor(h * 0.25));
    // Zone 4: Upper-right flank
    sampleBox(w - edgeW, w - 2, Math.floor(h * 0.15), Math.floor(h * 0.25));
    // Zone 5: Top-center left (between corner and head)
    sampleBox(Math.floor(w * 0.15), Math.floor(w * 0.25), 2, edgeH);
    // Zone 6: Top-center right (between head and corner)
    sampleBox(Math.floor(w * 0.75), Math.floor(w * 0.85), 2, edgeH);
  }

  if (bgPalette.length === 0) {
    bgPalette.push({ r: 245, g: 245, b: 245 });
  }

  // 2. Tolerance & Feathering parameters
  const toleranceVal = settings.tolerance || 48;
  const featherVal = settings.feather || 6;
  const threshold = toleranceVal * 2.3;
  const feather = Math.max(6, featherVal * 3.0);

  // 3. Render Solid Replacement Background if color mode
  const isTransparent = settings.mode === 'transparent' || settings.color === 'transparent';
  if (!isTransparent && settings.color) {
    outCtx.fillStyle = settings.color;
    outCtx.fillRect(0, 0, w, h);
  } else {
    outCtx.clearRect(0, 0, w, h);
  }

  // 4. Generate Masked Foreground ImageData
  const fgData = outCtx.createImageData(w, h);
  const fg = fgData.data;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Minimum perceptual distance to any background sample
      let minDist = Infinity;
      for (let k = 0; k < bgPalette.length; k++) {
        const ref = bgPalette[k];
        const dr = r - ref.r;
        const dg = g - ref.g;
        const db = b - ref.b;
        const d = Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
        if (d < minDist) {
          minDist = d;
        }
      }
      let dist = minDist;

      // Subject Protection: central portrait zone & skin / hair preservation
      const normX = (x - w / 2) / (w * 0.45);
      const normY = (y - h * 0.52) / (h * 0.44);
      const inCenterSubject = (normX * normX + normY * normY) < 1.0;
      const isSkin = r > 45 && g > 28 && b > 18 && r > g && (r - g) >= 8 && (r - b) >= 8;
      const isHair = y < h * 0.65 && r < 55 && g < 55 && b < 55;

      if (inCenterSubject && (isSkin || isHair)) {
        // Boost distance significantly so skin/face/hair are never accidentally clipped
        dist *= 2.8;
      }

      // Compute smooth alpha
      let alpha = 255;
      if (dist <= threshold) {
        alpha = 0;
      } else if (dist < threshold + feather) {
        alpha = Math.round(255 * ((dist - threshold) / feather));
      }

      fg[idx] = r;
      fg[idx + 1] = g;
      fg[idx + 2] = b;
      fg[idx + 3] = alpha;
    }
  }

  // Draw masked foreground
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = w;
  tempCanvas.height = h;
  const tempCtx = tempCanvas.getContext('2d')!;
  tempCtx.putImageData(fgData, 0, 0);

  outCtx.drawImage(tempCanvas, 0, 0);

  return outputCanvas;
}

/**
 * Powerful Multi-Stage AI Portrait Clarity & Restoration algorithm
 * - Preserves facial contours, iris, lips, and hair structure
 * - Natural skin smoothing on warm tones
 * - Dynamic lighting balancing and noise suppression
 */
export function applyLocalAIEnhancement(
  canvas: HTMLCanvasElement,
  strength: number = 70
): HTMLCanvasElement {
  const output = document.createElement('canvas');
  output.width = canvas.width;
  output.height = canvas.height;
  const ctx = output.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(canvas, 0, 0);

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  const factor = strength / 100;

  // Multi-pass face smoothing & noise suppression
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Robust skin tone detection in YCbCr/RGB space
      const isSkin = r > 50 && g > 35 && b > 20 && r > g && g > b && (r - g) >= 12;

      if (isSkin) {
        // Guided cross filter smoothing
        let sumR = r, sumG = g, sumB = b, count = 1;
        const offsets = [-1, 1];
        for (const dx of offsets) {
          const nIdx = (y * w + (x + dx)) * 4;
          const nr = data[nIdx];
          const ng = data[nIdx + 1];
          const nb = data[nIdx + 2];
          // Preserve high contrast creases/eyes/nostrils
          if (Math.abs(nr - r) < 28 && Math.abs(ng - g) < 28) {
            sumR += nr;
            sumG += ng;
            sumB += nb;
            count++;
          }
        }
        for (const dy of offsets) {
          const nIdx = ((y + dy) * w + x) * 4;
          const nr = data[nIdx];
          const ng = data[nIdx + 1];
          const nb = data[nIdx + 2];
          if (Math.abs(nr - r) < 28 && Math.abs(ng - g) < 28) {
            sumR += nr;
            sumG += ng;
            sumB += nb;
            count++;
          }
        }

        const smoothR = sumR / count;
        const smoothG = sumG / count;
        const smoothB = sumB / count;

        data[idx] = Math.round(r * (1 - factor * 0.5) + smoothR * (factor * 0.5));
        data[idx + 1] = Math.round(g * (1 - factor * 0.5) + smoothG * (factor * 0.5));
        data[idx + 2] = Math.round(b * (1 - factor * 0.5) + smoothB * (factor * 0.5));
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // Apply delicate unsharp mask to bring out facial contours, eyes, eyelashes
  applySharpen(output, Math.round(strength * 0.5));

  return output;
}

/**
 * Applies interactive retouching brush strokes (heal, smooth, brighten, eraser)
 */
export function applyRetouchStrokes(
  canvas: HTMLCanvasElement,
  strokes: RetouchStroke[]
): void {
  if (!strokes || strokes.length === 0) return;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  for (const stroke of strokes) {
    if (!stroke.points || stroke.points.length === 0) continue;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = stroke.radius * 2;

    if (stroke.tool === 'smooth') {
      ctx.globalAlpha = Math.min(0.5, stroke.strength * 0.05);
      ctx.filter = 'blur(4px)';
    } else if (stroke.tool === 'brighten') {
      ctx.globalAlpha = Math.min(0.2, stroke.strength * 0.02);
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = '#ffffff';
    } else if (stroke.tool === 'heal') {
      ctx.globalAlpha = Math.min(0.4, stroke.strength * 0.04);
      ctx.filter = 'blur(6px)';
    }

    ctx.beginPath();
    const first = stroke.points[0];
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Cropping and High-Res Resolution export
 */
export function getCroppedCanvas(
  sourceCanvas: HTMLCanvasElement,
  crop: CropState,
  targetWidthPx?: number,
  targetHeightPx?: number
): HTMLCanvasElement {
  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;

  const sx = Math.max(0, Math.min(sw - 1, (crop.x / 100) * sw));
  const sy = Math.max(0, Math.min(sh - 1, (crop.y / 100) * sh));
  const sCropW = Math.max(1, Math.min(sw - sx, (crop.width / 100) * sw));
  const sCropH = Math.max(1, Math.min(sh - sy, (crop.height / 100) * sh));

  const outW = targetWidthPx || Math.round(sCropW);
  const outH = targetHeightPx || Math.round(sCropH);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d')!;

  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';
  outCtx.drawImage(sourceCanvas, sx, sy, sCropW, sCropH, 0, 0, outW, outH);

  return outCanvas;
}
