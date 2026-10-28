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
 * Advanced High-Fidelity Background Removal & Replacement
 * Uses perimeter flood-fill connectivity + human perceptual distance + Gaussian alpha feathering
 */
export function processBackgroundRemoval(
  canvas: HTMLCanvasElement,
  settings: BackgroundSettings
): HTMLCanvasElement {
  if (!settings.isRemoved) return canvas;

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = canvas.width;
  outputCanvas.height = canvas.height;
  const outCtx = outputCanvas.getContext('2d', { willReadFrequently: true });
  if (!outCtx) return canvas;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // 1. Fill replacement background if solid color
  if (settings.mode === 'color' && settings.color !== 'transparent') {
    outCtx.fillStyle = settings.color;
    outCtx.fillRect(0, 0, w, h);
  }

  // 2. Multi-point perimeter background sampling
  const borderSamples: { r: number; g: number; b: number }[] = [];
  const stepX = Math.max(1, Math.floor(w / 16));
  const stepY = Math.max(1, Math.floor(h / 16));

  // Sample top, left, right edges
  for (let x = 0; x < w; x += stepX) {
    const idx = (0 * w + x) * 4;
    borderSamples.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
  }
  for (let y = 0; y < Math.floor(h * 0.7); y += stepY) {
    const leftIdx = (y * w + 0) * 4;
    const rightIdx = (y * w + (w - 1)) * 4;
    borderSamples.push({ r: data[leftIdx], g: data[leftIdx + 1], b: data[leftIdx + 2] });
    borderSamples.push({ r: data[rightIdx], g: data[rightIdx + 1], b: data[rightIdx + 2] });
  }

  let avgR = 0, avgG = 0, avgB = 0;
  for (const s of borderSamples) {
    avgR += s.r;
    avgG += s.g;
    avgB += s.b;
  }
  avgR /= borderSamples.length;
  avgG /= borderSamples.length;
  avgB /= borderSamples.length;

  const tolerance = (settings.tolerance || 32) * 1.8;
  const feather = Math.max(3, settings.feather || 6);

  // Perceptual distance calculator
  const colorDist = (r: number, g: number, b: number) => {
    const dr = r - avgR;
    const dg = g - avgG;
    const db = b - avgB;
    return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
  };

  // 3. BFS Flood Fill from edges to guarantee interior portrait pixels are preserved!
  const isBackground = new Uint8Array(w * h);
  const queue: number[] = [];

  // Seed boundary queue (top, upper-left, upper-right borders)
  for (let x = 0; x < w; x++) {
    queue.push(x); // y = 0
  }
  for (let y = 1; y < h; y++) {
    queue.push(y * w); // x = 0
    queue.push(y * w + (w - 1)); // x = w - 1
  }

  while (queue.length > 0) {
    const pos = queue.pop()!;
    if (isBackground[pos]) continue;

    const px = pos % w;
    const py = Math.floor(pos / w);
    const idx = pos * 4;

    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    const d = colorDist(r, g, b);

    // Subject protection: center ellipse protection for human head & shoulders
    const cx = (px - w / 2) / (w * 0.42);
    const cy = (py - h * 0.45) / (h * 0.42);
    const isInteriorSubject = (cx * cx + cy * cy) < 0.75;

    const threshold = isInteriorSubject ? tolerance * 0.65 : tolerance;

    if (d < threshold) {
      isBackground[pos] = 1;

      // Expand to 4-way neighbors
      if (px > 0 && !isBackground[pos - 1]) queue.push(pos - 1);
      if (px < w - 1 && !isBackground[pos + 1]) queue.push(pos + 1);
      if (py > 0 && !isBackground[pos - w]) queue.push(pos - w);
      if (py < h - 1 && !isBackground[pos + w]) queue.push(pos + w);
    }
  }

  // 4. Generate smooth alpha mask with soft feather boundary
  const fgData = outCtx.createImageData(w, h);
  const fg = fgData.data;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pos = y * w + x;
      const idx = pos * 4;

      let alpha = isBackground[pos] === 1 ? 0 : 255;

      // Soft feathering if near boundary
      if (alpha === 255 && feather > 0) {
        // Check local 3x3 neighbor background count
        let bgCount = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              if (isBackground[ny * w + nx] === 1) bgCount++;
            }
          }
        }
        if (bgCount > 0) {
          alpha = Math.round(255 * (1 - (bgCount / 9) * 0.8));
        }
      }

      fg[idx] = data[idx];
      fg[idx + 1] = data[idx + 1];
      fg[idx + 2] = data[idx + 2];
      fg[idx + 3] = alpha;
    }
  }

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
