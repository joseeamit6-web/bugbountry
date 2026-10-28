export interface PassportPreset {
  id: string;
  name: string;
  country: string;
  widthMm: number;
  heightMm: number;
  ratio: number;
  description: string;
  officialNotes?: string;
  headHeightMinPercent: number; // e.g. 70%
  headHeightMaxPercent: number; // e.g. 80%
}

export interface ImageAdjustments {
  brightness: number;     // -100 to 100
  contrast: number;       // -100 to 100
  saturation: number;     // -100 to 100
  exposure: number;       // -100 to 100
  highlights: number;     // -100 to 100
  shadows: number;        // -100 to 100
  temperature: number;    // -100 to 100 (warm/cool)
  tint: number;           // -100 to 100 (magenta/green)
  sharpness: number;      // 0 to 100
  blur: number;           // 0 to 50
  grayscale: number;      // 0 to 100
  sepia: number;          // 0 to 100
  vignette: number;       // 0 to 100
}

export interface Transformations {
  fineRotation: number;   // -15 to +15 degrees
  rotation: number;       // 0, 90, 180, 270
  flipH: boolean;
  flipV: boolean;
}

export interface CropState {
  x: number;      // percentage 0..100
  y: number;      // percentage 0..100
  width: number;  // percentage 0..100
  height: number; // percentage 0..100
  presetId?: string;
  lockAspect: boolean;
  aspectRatio?: number;
}

export interface BackgroundSettings {
  isRemoved: boolean;
  mode: 'original' | 'color' | 'transparent';
  color: string;
  tolerance: number; // 5 to 60
  feather: number;   // 0 to 20
  invertMask: boolean;
}

export interface RetouchPoint {
  x: number;
  y: number;
}

export interface RetouchStroke {
  id: string;
  tool: 'smooth' | 'heal' | 'brighten' | 'eraser';
  radius: number;
  strength: number;
  points: RetouchPoint[];
}

export interface OutfitOverlay {
  id: string;
  name: string;
  category: 'formal_men' | 'formal_women' | 'traditional';
  scale: number;
  offsetX: number;
  offsetY: number;
  opacity: number;
}

export interface PrintPaperFormat {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  description: string;
}

export interface PrintPhotoItem {
  id: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotation: number; // 0, 90, 180, 270
  locked: boolean;
}

export interface PrintSheetConfig {
  paperId: string;
  orientation: 'portrait' | 'landscape';
  customWidthMm?: number;
  customHeightMm?: number;
  marginMm: number;
  gapMm: number;
  copies: number;
  items: PrintPhotoItem[];
  autoGrid: boolean;
}

export interface StudioProject {
  id: string;
  name: string;
  updatedAt: number;
  imageSrc: string;
  naturalWidth: number;
  naturalHeight: number;
  adjustments: ImageAdjustments;
  transformations: Transformations;
  crop: CropState;
  background: BackgroundSettings;
  retouchStrokes: RetouchStroke[];
  outfit: OutfitOverlay | null;
  printSheet: PrintSheetConfig;
}
