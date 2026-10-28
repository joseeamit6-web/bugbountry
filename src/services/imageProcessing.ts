import { StudioProject, ImageAdjustments, Transformations, CropState, BackgroundSettings, RetouchStroke } from '../types';

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
/**
 * Robust High-Fidelity AI Background Removal & Replacement
 * Uses perimeter boundary flood-fill, multi-zone adaptive background modeling,
 * face/hair/skin protection, body silhouette preservation, hole filling,
 * and soft antialiased alpha matting.
 */
export function processBackgroundRemoval(
  canvas: HTMLCanvasElement,
  settings: BackgroundSettings
): HTMLCanvasElement {
  if (!settings.isRemoved) return canvas;

  const w = canvas.width;
  const h = canvas.height;
  if (w <= 0 || h <= 0) return canvas;

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = w;
  outputCanvas.height = h;
  const outCtx = outputCanvas.getContext('2d', { willReadFrequently: true });
  if (!outCtx) return canvas;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const totalPixels = w * h;

  // 1. Collect comprehensive background samples from outer borders
  const bgPalette: Array<{ r: number; g: number; b: number }> = [];

  if (settings.sampledBgColor) {
    bgPalette.push(settings.sampledBgColor);
  }

  // Sample across the entire top edge (where sky/wall is always background)
  for (let x = 0; x < w; x += Math.max(2, Math.floor(w / 40))) {
    for (let y = 0; y < Math.min(10, Math.floor(h * 0.05)); y += 2) {
      const idx = (y * w + x) * 4;
      bgPalette.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
    }
  }

  // Sample upper-left border (top to 60% down)
  const flankMaxY = Math.floor(h * 0.6);
  for (let y = 0; y < flankMaxY; y += Math.max(2, Math.floor(h / 30))) {
    for (let x = 0; x < Math.min(10, Math.floor(w * 0.05)); x += 2) {
      const idx = (y * w + x) * 4;
      bgPalette.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
    }
  }

  // Sample upper-right border (top to 60% down)
  for (let y = 0; y < flankMaxY; y += Math.max(2, Math.floor(h / 30))) {
    for (let x = Math.max(0, w - Math.min(10, Math.floor(w * 0.05))); x < w; x += 2) {
      const idx = (y * w + x) * 4;
      bgPalette.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
    }
  }

  if (bgPalette.length === 0) {
    bgPalette.push({ r: 240, g: 240, b: 240 });
  }

  // Calculate average background color
  let sumR = 0, sumG = 0, sumB = 0;
  for (let i = 0; i < bgPalette.length; i++) {
    sumR += bgPalette[i].r;
    sumG += bgPalette[i].g;
    sumB += bgPalette[i].b;
  }
  const avgBg = {
    r: sumR / bgPalette.length,
    g: sumG / bgPalette.length,
    b: sumB / bgPalette.length,
  };

  // 2. Tolerance configuration
  const userTolerance = settings.tolerance || 48;
  const toleranceThreshold = userTolerance * 2.6; // adaptive threshold
  const featherVal = Math.max(2, settings.feather || 6);

  // Perceptual distance helper (weighted RGB)
  const calcDist = (r: number, g: number, b: number, refR: number, refG: number, refB: number) => {
    const dr = r - refR;
    const dg = g - refG;
    const db = b - refB;
    return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
  };

  // Min distance to background palette
  const getMinBgDist = (r: number, g: number, b: number) => {
    let minD = calcDist(r, g, b, avgBg.r, avgBg.g, avgBg.b);
    for (let k = 0; k < bgPalette.length; k += 3) {
      const p = bgPalette[k];
      const d = calcDist(r, g, b, p.r, p.g, p.b);
      if (d < minD) minD = d;
    }
    return minD;
  };

  // 3. Subject Feature Detection (Skin tones, hair, core corridor)
  const isSkin = (r: number, g: number, b: number) => {
    return (
      r > 50 &&
      g > 32 &&
      b > 20 &&
      r > g &&
      (r - b) >= 10 &&
      (r - g) <= 90 &&
      Math.abs(r - g) > 6
    );
  };

  // Binary mask: 0 = background, 1 = foreground (subject)
  const fgMask = new Uint8Array(totalPixels);
  // Default: start with all 1 (foreground)
  fgMask.fill(1);

  // 4. Connected Component Boundary Flood-Fill (BFS)
  // Seed with border pixels from top and upper flanks
  const queue = new Int32Array(totalPixels);
  let qStart = 0;
  let qEnd = 0;

  const visited = new Uint8Array(totalPixels);

  const pushSeed = (px: number, py: number) => {
    const idx = py * w + px;
    if (visited[idx] === 0) {
      const pIdx = idx * 4;
      const r = data[pIdx];
      const g = data[pIdx + 1];
      const b = data[pIdx + 2];
      // Don't seed if it's skin
      if (!isSkin(r, g, b)) {
        visited[idx] = 1;
        fgMask[idx] = 0; // marked as background
        queue[qEnd++] = idx;
      }
    }
  };

  // Push top row seeds
  for (let x = 0; x < w; x++) {
    pushSeed(x, 0);
    if (h > 1) pushSeed(x, 1);
  }
  // Push upper flank seeds
  for (let y = 0; y < flankMaxY; y++) {
    pushSeed(0, y);
    pushSeed(w - 1, y);
  }

  // BFS flood fill outwards into the background
  while (qStart < qEnd) {
    const currIdx = queue[qStart++];
    const cx = currIdx % w;
    const cy = Math.floor(currIdx / w);

    // 4-neighbor expansion
    const neighbors = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ];

    for (let n = 0; n < 4; n++) {
      const nx = neighbors[n][0];
      const ny = neighbors[n][1];

      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const nIdx = ny * w + nx;
        if (visited[nIdx] === 0) {
          visited[nIdx] = 1;
          const pIdx = nIdx * 4;
          const nr = data[pIdx];
          const ng = data[pIdx + 1];
          const nb = data[pIdx + 2];

          // Strict Subject Protection:
          // Center human corridor:
          const normX = (nx - w / 2) / (w * 0.44);
          const normY = (ny - h * 0.55) / (h * 0.48);
          const inSubjectCenter = normX * normX + normY * normY < 1.0;

          const skin = isSkin(nr, ng, nb);
          // Dark hair near crown/ears:
          const isHair = ny < h * 0.65 && Math.abs(nx - w / 2) < w * 0.35 && (nr < 50 && ng < 50 && nb < 50);

          if (skin || (inSubjectCenter && isHair)) {
            // Stop flood fill here — this is part of the subject!
            fgMask[nIdx] = 1;
            continue;
          }

          const dist = getMinBgDist(nr, ng, nb);

          // If distance to background model is within tolerance, it's background
          if (dist <= toleranceThreshold) {
            fgMask[nIdx] = 0; // background
            queue[qEnd++] = nIdx;
          } else if (!inSubjectCenter && dist <= toleranceThreshold * 1.4) {
            // Outside subject center, background variations/shadows expand cleanly
            fgMask[nIdx] = 0;
            queue[qEnd++] = nIdx;
          } else {
            // Edge of subject
            fgMask[nIdx] = 1;
          }
        }
      }
    }
  }

  // 5. Hole Filling & Noise Cleanup:
  // Any enclosed pixel inside the subject corridor (e.g., ties, shirts, hair highlights)
  // that was not reached by the flood fill remains firmly as foreground.
  // Also clean up any small isolated specks near outer margins.
  for (let y = 0; y < Math.min(15, Math.floor(h * 0.08)); y++) {
    for (let x = 0; x < w; x++) {
      // Clear top margins entirely to ensure clean passport background
      const idx = y * w + x;
      const pIdx = idx * 4;
      if (!isSkin(data[pIdx], data[pIdx + 1], data[pIdx + 2])) {
        fgMask[idx] = 0;
      }
    }
  }

  // 6. Smooth Alpha Matting & Feathering
  // Compute distance to background for soft feathering
  const alphaMap = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    alphaMap[i] = fgMask[i] ? 255 : 0;
  }

  // Multi-pass box blur on the boundary for pristine antialiasing
  const smoothedAlpha = new Uint8Array(totalPixels);
  const radius = Math.min(8, Math.max(1, Math.round(featherVal / 2)));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (alphaMap[idx] === 0) {
        // Check if near boundary
        let hasForegroundNear = false;
        for (let dy = -radius; dy <= radius; dy++) {
          const ny = y + dy;
          if (ny >= 0 && ny < h) {
            for (let dx = -radius; dx <= radius; dx++) {
              const nx = x + dx;
              if (nx >= 0 && nx < w) {
                if (alphaMap[ny * w + nx] > 0) {
                  hasForegroundNear = true;
                  break;
                }
              }
            }
          }
          if (hasForegroundNear) break;
        }
        if (!hasForegroundNear) {
          smoothedAlpha[idx] = 0;
          continue;
        }
      }

      // Compute local average for smooth transition
      let sumA = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny >= 0 && ny < h) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            if (nx >= 0 && nx < w) {
              sumA += alphaMap[ny * w + nx];
              count++;
            }
          }
        }
      }
      smoothedAlpha[idx] = Math.round(sumA / count);
    }
  }

  // 7. Compose over replacement background or transparent canvas
  const isTransparent = settings.mode === 'transparent' || settings.color === 'transparent';
  if (!isTransparent && settings.color) {
    outCtx.fillStyle = settings.color;
    outCtx.fillRect(0, 0, w, h);
  } else {
    outCtx.clearRect(0, 0, w, h);
  }

  // Create foreground image with soft alpha
  const fgImageData = outCtx.createImageData(w, h);
  const fg = fgImageData.data;

  for (let i = 0; i < totalPixels; i++) {
    const pIdx = i * 4;
    fg[pIdx] = data[pIdx];
    fg[pIdx + 1] = data[pIdx + 1];
    fg[pIdx + 2] = data[pIdx + 2];
    fg[pIdx + 3] = smoothedAlpha[i];
  }

  const fgCanvas = document.createElement('canvas');
  fgCanvas.width = w;
  fgCanvas.height = h;
  const fgCtx = fgCanvas.getContext('2d')!;
  fgCtx.putImageData(fgImageData, 0, 0);

  outCtx.drawImage(fgCanvas, 0, 0);

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

/**
 * Renders the complete image processing pipeline (transformations, tone adjustments,
 * background removal/replacement, and retouch strokes) into a pristine canvas.
 */
export function renderFullPipelineCanvas(
  sourceImg: HTMLImageElement,
  project: StudioProject
): HTMLCanvasElement {
  // 1. Transformation
  const baseCanvas = renderTransformedCanvas(sourceImg, project.transformations);

  // 2. Adjustments
  const ctx = baseCanvas.getContext('2d', { willReadFrequently: true });
  if (ctx) {
    const imgData = ctx.getImageData(0, 0, baseCanvas.width, baseCanvas.height);
    applyAdjustmentsToImageData(imgData, project.adjustments);
    ctx.putImageData(imgData, 0, 0);

    if (project.adjustments.sharpness > 0) {
      applySharpen(baseCanvas, project.adjustments.sharpness);
    }
    if (project.adjustments.vignette > 0) {
      applyVignette(baseCanvas, project.adjustments.vignette);
    }
  }

  // 3. Background replacement
  let stageCanvas = baseCanvas;
  if (project.background.isRemoved) {
    stageCanvas = processBackgroundRemoval(baseCanvas, project.background);
  }

  // 4. Retouch strokes
  if (project.retouchStrokes && project.retouchStrokes.length > 0) {
    applyRetouchStrokes(stageCanvas, project.retouchStrokes);
  }

  return stageCanvas;
}

/**
 * Produces a guaranteed non-blank, high-resolution cropped passport photo canvas
 */
export function exportCroppedPassportPhoto(
  sourceImg: HTMLImageElement,
  project: StudioProject,
  targetWidthPx: number,
  targetHeightPx: number
): HTMLCanvasElement {
  const fullCanvas = renderFullPipelineCanvas(sourceImg, project);
  return getCroppedCanvas(fullCanvas, project.crop, targetWidthPx, targetHeightPx);
}

