import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ZoomIn, ZoomOut, Maximize2, Minimize2, RotateCcw, RotateCw,
  FlipHorizontal, FlipVertical, Undo2, Redo2, Eye, EyeOff,
  Sparkles, Sliders, Image as ImageIcon, Paintbrush, Compass,
  Shirt, Grid, Printer, Download, Check, AlertCircle, RefreshCw,
  ArrowRight, ArrowLeft, CheckCircle2, MessageSquare, Pipette
} from 'lucide-react';
import {
  StudioProject, ImageAdjustments, Transformations, CropState,
  BackgroundSettings, RetouchStroke, OutfitOverlay, PassportPreset
} from '../types';
import { PASSPORT_PRESETS, BACKGROUND_PRESET_COLORS } from '../constants/passportPresets';
import { OUTFIT_CATALOG } from '../constants/outfits';
import {
  loadImage, renderTransformedCanvas, applyAdjustmentsToImageData,
  applySharpen, applyVignette, processBackgroundRemoval,
  applyLocalAIEnhancement, applyRetouchStrokes, getCroppedCanvas, mmToPixels,
  samplePixelColor
} from '../services/imageProcessing';
import { PrintSheetWorkspace } from './PrintSheetWorkspace';

interface EditorWorkspaceProps {
  project: StudioProject;
  onUpdateProject: (updater: (prev: StudioProject) => StudioProject) => void;
  onOpenModal: (modal: 'privacy' | 'terms' | 'faq' | 'contact') => void;
}

export type WizardStep = 1 | 2 | 3 | 4 | 5;

const WIZARD_STEPS = [
  { step: 1, id: 'crop', title: 'Passport & Crop', desc: 'Select standard & frame' },
  { step: 2, id: 'enhance', title: 'AI Enhance', desc: 'Clarity & portrait lighting' },
  { step: 3, id: 'background', title: 'Background', desc: 'Color & edge replacement' },
  { step: 4, id: 'retouch', title: 'Retouch & Outfits', desc: 'Blemish heal & formal suit' },
  { step: 5, id: 'print', title: 'Print Sheet', desc: '300 DPI layout & download' },
] as const;

export const EditorWorkspace: React.FC<EditorWorkspaceProps> = ({
  project,
  onUpdateProject,
  onOpenModal,
}) => {
  // Wizard step state
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [visitedSteps, setVisitedSteps] = useState<Set<number>>(() => new Set([1]));

  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [showGuides, setShowGuides] = useState(true);
  const [showRuleOfThirds, setShowRuleOfThirds] = useState(false);
  const [aiStrength, setAiStrength] = useState(70);
  const [isApplyingAI, setIsApplyingAI] = useState(false);
  const [customBgColor, setCustomBgColor] = useState('#A5C9EB');
  const [isSamplingBgColor, setIsSamplingBgColor] = useState(false);
  const [brushMode, setBrushMode] = useState<'smooth' | 'heal' | 'brighten' | 'eraser'>('smooth');
  const [brushRadius, setBrushRadius] = useState(20);
  const [brushStrength, setBrushStrength] = useState(50);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<RetouchStroke | null>(null);

  // History stack
  const historyRef = useRef<StudioProject[]>([project]);
  const historyIndexRef = useRef<number>(0);

  // Canvas elements
  const viewportCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const processedCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Active passport preset
  const [selectedPreset, setSelectedPreset] = useState<PassportPreset>(() => {
    return PASSPORT_PRESETS.find(p => p.id === project.crop.presetId) || PASSPORT_PRESETS[0];
  });

  // Custom sizing & export state
  const [customWidthMm, setCustomWidthMm] = useState(selectedPreset.widthMm);
  const [customHeightMm, setCustomHeightMm] = useState(selectedPreset.heightMm);
  const [exportDpi, setExportDpi] = useState(300);
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg'>('png');
  const [jpegQuality, setJpegQuality] = useState(95);

  // Switch step and track visited
  const goToStep = (step: WizardStep) => {
    setCurrentStep(step);
    setVisitedSteps(prev => new Set([...prev, step]));
  };

  // Load base image on source change
  useEffect(() => {
    let isCancelled = false;
    loadImage(project.imageSrc).then(img => {
      if (!isCancelled) {
        sourceImageRef.current = img;
        renderPipeline();
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [project.imageSrc]);

  // Push to undo history
  const pushHistory = useCallback((newProj: StudioProject) => {
    const curIndex = historyIndexRef.current;
    const newHistory = historyRef.current.slice(0, curIndex + 1);
    newHistory.push(newProj);
    if (newHistory.length > 25) newHistory.shift();
    historyRef.current = newHistory;
    historyIndexRef.current = newHistory.length - 1;
  }, []);

  const handleUndo = () => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      const prev = historyRef.current[historyIndexRef.current];
      onUpdateProject(() => prev);
    }
  };

  const handleRedo = () => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      const next = historyRef.current[historyIndexRef.current];
      onUpdateProject(() => next);
    }
  };

  // Main rendering pipeline
  const renderPipeline = useCallback(() => {
    const img = sourceImageRef.current;
    if (!img) return;

    // 1. Transform base canvas
    const baseCanvas = renderTransformedCanvas(img, project.transformations);

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

    processedCanvasRef.current = stageCanvas;

    // 5. Draw to viewport canvas
    const viewCanvas = viewportCanvasRef.current;
    if (viewCanvas) {
      viewCanvas.width = stageCanvas.width;
      viewCanvas.height = stageCanvas.height;
      const vCtx = viewCanvas.getContext('2d');
      if (vCtx) {
        vCtx.clearRect(0, 0, viewCanvas.width, viewCanvas.height);
        if (showOriginal && sourceImageRef.current) {
          vCtx.drawImage(sourceImageRef.current, 0, 0, viewCanvas.width, viewCanvas.height);
        } else {
          vCtx.drawImage(stageCanvas, 0, 0);
        }
      }
    }
  }, [project.transformations, project.adjustments, project.background, project.retouchStrokes, showOriginal]);

  useEffect(() => {
    renderPipeline();
  }, [renderPipeline]);

  // Adjustments updater
  const updateAdjustment = (key: keyof ImageAdjustments, value: number) => {
    onUpdateProject(prev => {
      const updated = {
        ...prev,
        adjustments: { ...prev.adjustments, [key]: value },
      };
      return updated;
    });
  };

  const resetAdjustments = () => {
    onUpdateProject(prev => {
      const updated = {
        ...prev,
        adjustments: {
          brightness: 0,
          contrast: 0,
          saturation: 0,
          exposure: 0,
          highlights: 0,
          shadows: 0,
          temperature: 0,
          tint: 0,
          sharpness: 0,
          blur: 0,
          grayscale: 0,
          sepia: 0,
          vignette: 0,
        },
      };
      pushHistory(updated);
      return updated;
    });
  };

  // Straighten & Transformations
  const updateTransformation = (updater: (prev: Transformations) => Transformations) => {
    onUpdateProject(prev => {
      const updated = {
        ...prev,
        transformations: updater(prev.transformations),
      };
      pushHistory(updated);
      return updated;
    });
  };

  // Passport Preset change
  const handleSelectPreset = (preset: PassportPreset) => {
    setSelectedPreset(preset);
    setCustomWidthMm(preset.widthMm);
    setCustomHeightMm(preset.heightMm);

    const img = sourceImageRef.current;
    if (!img) return;

    const imgAspect = img.naturalWidth / img.naturalHeight;
    const targetAspect = preset.ratio;

    let cropW = 85;
    let cropH = 85;

    if (targetAspect > imgAspect) {
      cropW = 90;
      cropH = Math.min(95, (cropW / targetAspect) * imgAspect);
    } else {
      cropH = 90;
      cropW = Math.min(95, (cropH * targetAspect) / imgAspect);
    }

    const cropX = (100 - cropW) / 2;
    const cropY = Math.max(3, (100 - cropH) / 3);

    onUpdateProject(prev => {
      const updated = {
        ...prev,
        crop: {
          x: cropX,
          y: cropY,
          width: cropW,
          height: cropH,
          presetId: preset.id,
          lockAspect: true,
          aspectRatio: preset.ratio,
        },
      };
      pushHistory(updated);
      return updated;
    });
  };

  // Background Studio toggles
  const handleToggleBackgroundRemoval = () => {
    onUpdateProject(prev => {
      const newMode: 'color' | 'original' | 'transparent' = !prev.background.isRemoved ? 'color' : 'original';
      const updated: StudioProject = {
        ...prev,
        background: {
          ...prev.background,
          isRemoved: !prev.background.isRemoved,
          mode: newMode,
          color: prev.background.color || '#A5C9EB',
        },
      };
      pushHistory(updated);
      return updated;
    });
  };

  const handleSelectBackgroundColor = (colorHex: string) => {
    setCustomBgColor(colorHex);
    onUpdateProject(prev => {
      const newMode: 'color' | 'original' | 'transparent' = colorHex === 'transparent' ? 'transparent' : 'color';
      const updated: StudioProject = {
        ...prev,
        background: {
          ...prev.background,
          isRemoved: true,
          mode: newMode,
          color: colorHex,
        },
      };
      pushHistory(updated);
      return updated;
    });
  };

  // AI Auto Enhance action
  const handleApplyAIEnhance = () => {
    setIsApplyingAI(true);
    setTimeout(() => {
      if (!processedCanvasRef.current) return;
      const enhanced = applyLocalAIEnhancement(processedCanvasRef.current, aiStrength);
      const enhancedDataUrl = enhanced.toDataURL('image/png');

      loadImage(enhancedDataUrl).then(newImg => {
        sourceImageRef.current = newImg;
        onUpdateProject(prev => {
          const updated = {
            ...prev,
            imageSrc: enhancedDataUrl,
            adjustments: {
              ...prev.adjustments,
              brightness: 4,
              contrast: 6,
              sharpness: 15,
            },
          };
          pushHistory(updated);
          return updated;
        });
        setIsApplyingAI(false);
      });
    }, 100);
  };

  // Pointer interaction handler for Retouching & Eyedropper Sampling
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = viewportCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Eyedropper sampling in Background Studio
    if (currentStep === 3 && isSamplingBgColor) {
      const img = sourceImageRef.current;
      if (img) {
        const baseCanvas = renderTransformedCanvas(img, project.transformations);
        const sampled = samplePixelColor(baseCanvas, x, y);
        onUpdateProject(prev => {
          const updated: StudioProject = {
            ...prev,
            background: {
              ...prev.background,
              isRemoved: true,
              sampledBgColor: sampled,
            },
          };
          pushHistory(updated);
          return updated;
        });
      }
      setIsSamplingBgColor(false);
      return;
    }

    if (currentStep !== 4) return;

    setIsDrawing(true);
    const stroke: RetouchStroke = {
      id: 'stroke_' + Date.now(),
      tool: brushMode,
      radius: brushRadius,
      strength: brushStrength,
      points: [{ x, y }],
    };
    setCurrentStroke(stroke);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentStroke) return;
    const canvas = viewportCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const updatedStroke = {
      ...currentStroke,
      points: [...currentStroke.points, { x, y }],
    };
    setCurrentStroke(updatedStroke);
  };

  const handleCanvasPointerUp = () => {
    if (isDrawing && currentStroke) {
      setIsDrawing(false);
      onUpdateProject(prev => {
        const updated = {
          ...prev,
          retouchStrokes: [...(prev.retouchStrokes || []), currentStroke],
        };
        pushHistory(updated);
        return updated;
      });
      setCurrentStroke(null);
    }
  };

  // High-Resolution Export
  const handleExportSinglePhoto = (format: 'png' | 'jpeg') => {
    if (!processedCanvasRef.current) return;

    const targetW = mmToPixels(customWidthMm, exportDpi);
    const targetH = mmToPixels(customHeightMm, exportDpi);

    const cropped = getCroppedCanvas(
      processedCanvasRef.current,
      project.crop,
      targetW,
      targetH
    );

    const link = document.createElement('a');
    link.download = `photo-studio-${selectedPreset.id}-${customWidthMm}x${customHeightMm}mm-${exportDpi}dpi.${format === 'png' ? 'png' : 'jpg'}`;
    link.href = cropped.toDataURL(
      format === 'png' ? 'image/png' : 'image/jpeg',
      format === 'jpeg' ? jpegQuality / 100 : undefined
    );
    link.click();
  };

  const getPreparedCroppedCanvas = (): HTMLCanvasElement => {
    if (!processedCanvasRef.current) {
      const fallback = document.createElement('canvas');
      fallback.width = 413;
      fallback.height = 531;
      return fallback;
    }
    const targetW = mmToPixels(customWidthMm, 300);
    const targetH = mmToPixels(customHeightMm, 300);
    return getCroppedCanvas(processedCanvasRef.current, project.crop, targetW, targetH);
  };

  // Step 5: Full-screen Print Sheet Workspace
  if (currentStep === 5) {
    return (
      <PrintSheetWorkspace
        croppedCanvas={getPreparedCroppedCanvas()}
        photoWidthMm={customWidthMm}
        photoHeightMm={customHeightMm}
        initialConfig={project.printSheet}
        onUpdateConfig={cfg => {
          onUpdateProject(prev => ({ ...prev, printSheet: cfg }));
        }}
        onBackToEditor={() => goToStep(1)}
      />
    );
  }

  return (
    <div className={`w-full flex-1 flex flex-col bg-[#0B1020] text-slate-100 overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      {/* PROFESSIONAL STEP-BY-STEP STEPPER BAR */}
      <div className="bg-slate-950/90 border-b border-slate-800 px-4 py-2.5 overflow-x-auto scrollbar-none flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-max">
          {WIZARD_STEPS.map(item => {
            const isActive = currentStep === item.step;
            const isVisited = visitedSteps.has(item.step);
            return (
              <button
                key={item.step}
                onClick={() => goToStep(item.step as WizardStep)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-cyan-400 text-[#0B1020] shadow-sm shadow-cyan-950 font-bold'
                    : isVisited
                    ? 'bg-slate-900 border border-emerald-500/30 text-emerald-300 hover:border-emerald-400'
                    : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {/* Checkmark or Step Number */}
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono shrink-0 ${
                  isActive
                    ? 'bg-[#0B1020] text-cyan-300'
                    : isVisited
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-slate-800 text-slate-400'
                }`}>
                  {isVisited && !isActive ? (
                    <Check className="w-3 h-3" strokeWidth={3} />
                  ) : (
                    item.step
                  )}
                </span>
                <span className="whitespace-nowrap">{item.title}</span>
              </button>
            );
          })}
        </div>

        {/* Right Stepper Actions: Undo, Redo, Compare */}
        <div className="flex items-center gap-2 shrink-0">

          <div className="flex items-center gap-1">
            <button
              onClick={handleUndo}
              disabled={historyIndexRef.current <= 0}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-colors cursor-pointer"
              title="Undo"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndexRef.current >= historyRef.current.length - 1}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-colors cursor-pointer"
              title="Redo"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          <button
            onMouseDown={() => setShowOriginal(true)}
            onMouseUp={() => setShowOriginal(false)}
            onTouchStart={() => setShowOriginal(true)}
            onTouchEnd={() => setShowOriginal(false)}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              showOriginal ? 'bg-cyan-400 text-[#0B1020]' : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
            }`}
            title="Press and hold to compare with original photo"
          >
            {showOriginal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Compare</span>
          </button>
        </div>
      </div>

      {/* Main workspace layout: Desktop side-by-side; Mobile canvas on top & controls below */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden w-full">
        {/* Step Tool Sidebar: Order 2 on mobile (scrollable below canvas), Order 1 on desktop (left sidebar) */}
        <div className="order-2 md:order-1 flex-1 md:flex-initial md:w-80 lg:w-96 min-h-0 md:h-full bg-slate-900/80 border-t md:border-t-0 md:border-r border-slate-800 flex flex-col shrink-0 overflow-hidden">
          {/* Step Header */}
          <div className="p-3 sm:p-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between shrink-0">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block">
                Step {currentStep} of 5
              </span>
              <h2 className="text-sm font-bold text-white">
                {WIZARD_STEPS.find(s => s.step === currentStep)?.title}
              </h2>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {selectedPreset.widthMm}×{selectedPreset.heightMm}mm
            </span>
          </div>

          {/* Active Tool Step Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs text-slate-300">
            {/* STEP 1: PASSPORT PRESET, CROP & ROTATE */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="font-semibold text-white text-sm">1. Select Country Standard</h3>
                  <p className="text-[11px] text-slate-400">
                    Aspect ratio and biometric head markers adapt automatically.
                  </p>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {PASSPORT_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      onClick={() => handleSelectPreset(preset)}
                      className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                        selectedPreset.id === preset.id
                          ? 'border-cyan-400 bg-cyan-950/30 text-white'
                          : 'border-slate-800 bg-slate-800/40 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white">{preset.name}</span>
                        <span className="font-mono text-cyan-300 text-[11px]">
                          {preset.widthMm} × {preset.heightMm} mm
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5 truncate">{preset.description}</p>
                    </button>
                  ))}
                </div>

                {/* Straighten & Rotate controls */}
                <div className="pt-2 border-t border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">Fine Angle Alignment:</span>
                    <span className="font-mono text-cyan-300 font-semibold">
                      {project.transformations.fineRotation.toFixed(1)}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-15"
                    max="15"
                    step="0.1"
                    value={project.transformations.fineRotation}
                    onChange={e => {
                      const val = Number(e.target.value);
                      updateTransformation(t => ({ ...t, fineRotation: val }));
                    }}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => updateTransformation(t => ({ ...t, rotation: (t.rotation - 90 + 360) % 360 }))}
                      className="flex items-center justify-center gap-1.5 p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-200 transition-colors cursor-pointer text-[11px]"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Rotate Left</span>
                    </button>
                    <button
                      onClick={() => updateTransformation(t => ({ ...t, rotation: (t.rotation + 90) % 360 }))}
                      className="flex items-center justify-center gap-1.5 p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-200 transition-colors cursor-pointer text-[11px]"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Rotate Right</span>
                    </button>
                    <button
                      onClick={() => updateTransformation(t => ({ ...t, flipH: !t.flipH }))}
                      className={`flex items-center justify-center gap-1.5 p-2 border rounded-lg transition-colors cursor-pointer text-[11px] ${
                        project.transformations.flipH ? 'border-cyan-400 bg-cyan-950/20 text-white' : 'border-slate-700 bg-slate-800 text-slate-200'
                      }`}
                    >
                      <FlipHorizontal className="w-3.5 h-3.5" />
                      <span>Flip H</span>
                    </button>
                    <button
                      onClick={() => updateTransformation(t => ({ ...t, flipV: !t.flipV }))}
                      className={`flex items-center justify-center gap-1.5 p-2 border rounded-lg transition-colors cursor-pointer text-[11px] ${
                        project.transformations.flipV ? 'border-cyan-400 bg-cyan-950/20 text-white' : 'border-slate-700 bg-slate-800 text-slate-200'
                      }`}
                    >
                      <FlipVertical className="w-3.5 h-3.5" />
                      <span>Flip V</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: AI ENHANCE & ADJUSTMENTS */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="font-semibold text-white text-sm">2. AI Portrait Clarity &amp; Lighting</h3>
                  <p className="text-[11px] text-slate-400">
                    Enhance facial clarity, balance skin lighting, and sharpen facial contours.
                  </p>
                </div>

                <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">Clarity Strength:</span>
                    <span className="font-mono text-cyan-300 font-semibold">{aiStrength}%</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    value={aiStrength}
                    onChange={e => setAiStrength(Number(e.target.value))}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />

                  <button
                    onClick={handleApplyAIEnhance}
                    disabled={isApplyingAI}
                    className="w-full py-2.5 px-4 bg-cyan-400 hover:bg-cyan-300 text-[#0B1020] font-bold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    {isApplyingAI ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Applying Clarity Filter…</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Enhance Portrait Now</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Quick Color Sliders */}
                <div className="pt-2 border-t border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white text-xs">Manual Adjustments:</span>
                    <button onClick={resetAdjustments} className="text-[10px] text-cyan-400 hover:underline cursor-pointer">
                      Reset
                    </button>
                  </div>
                  {[
                    { key: 'brightness', label: 'Brightness', min: -80, max: 80 },
                    { key: 'contrast', label: 'Contrast', min: -80, max: 80 },
                    { key: 'saturation', label: 'Saturation', min: -80, max: 80 },
                    { key: 'exposure', label: 'Exposure', min: -80, max: 80 },
                    { key: 'sharpness', label: 'Sharpness', min: 0, max: 100 },
                  ].map(({ key, label, min, max }) => {
                    const val = project.adjustments[key as keyof ImageAdjustments] || 0;
                    return (
                      <div key={key} className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-300">{label}</span>
                          <span className="font-mono text-cyan-300 font-semibold">{val}</span>
                        </div>
                        <input
                          type="range"
                          min={min}
                          max={max}
                          value={val}
                          onChange={e => updateAdjustment(key as keyof ImageAdjustments, Number(e.target.value))}
                          className="w-full accent-cyan-400 cursor-pointer"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* STEP 3: BACKGROUND STUDIO & CUSTOM COLOR */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="font-semibold text-white text-sm">3. Background Replacement &amp; Custom Color</h3>
                  <p className="text-[11px] text-slate-400">
                    Replace background with official passport colors, pick any custom color, or export transparent PNG.
                  </p>
                </div>

                {/* Primary Enable / Disable Toggle */}
                <div className="flex items-center justify-between p-3.5 bg-slate-800/60 border border-slate-700 rounded-xl">
                  <div>
                    <span className="font-semibold text-white block">Auto Background Removal</span>
                    <span className="text-[11px] text-slate-400">Perimeter sampling &amp; subject protection</span>
                  </div>
                  <button
                    onClick={handleToggleBackgroundRemoval}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      project.background.isRemoved
                        ? 'bg-cyan-400 text-[#0B1020]'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {project.background.isRemoved ? 'Enabled' : 'Disabled'}
                  </button>
                </div>

                {project.background.isRemoved && (
                  <div className="space-y-3.5">
                    {/* Eyedropper Color Picker Tool */}
                    <div className="p-3 bg-slate-800/60 border border-slate-700 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-cyan-300 uppercase tracking-wider block">
                          Background Color Sampler
                        </span>
                        {project.background.sampledBgColor && (
                          <button
                            onClick={() => {
                              onUpdateProject(prev => ({
                                ...prev,
                                background: { ...prev.background, sampledBgColor: undefined },
                              }));
                            }}
                            className="text-[10px] text-slate-400 hover:text-cyan-300 hover:underline cursor-pointer"
                          >
                            Reset to Auto
                          </button>
                        )}
                      </div>

                      <button
                        onClick={() => setIsSamplingBgColor(prev => !prev)}
                        className={`w-full py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          isSamplingBgColor
                            ? 'border-cyan-400 bg-cyan-950/40 text-cyan-300 ring-2 ring-cyan-400/50 animate-pulse'
                            : 'border-slate-700 bg-slate-900/80 text-slate-200 hover:border-slate-600'
                        }`}
                      >
                        <Pipette className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{isSamplingBgColor ? 'Click background in photo to sample…' : 'Pick Background Color from Photo'}</span>
                      </button>

                      {project.background.sampledBgColor && (
                        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-900 rounded-lg text-[11px] text-slate-300 border border-slate-750">
                          <div
                            className="w-4 h-4 rounded border border-slate-600 shrink-0"
                            style={{
                              backgroundColor: `rgb(${Math.round(project.background.sampledBgColor.r)}, ${Math.round(
                                project.background.sampledBgColor.g
                              )}, ${Math.round(project.background.sampledBgColor.b)})`,
                            }}
                          />
                          <span className="font-mono text-cyan-300 text-[10px]">
                            Sampled Key: RGB({Math.round(project.background.sampledBgColor.r)},{' '}
                            {Math.round(project.background.sampledBgColor.g)},{' '}
                            {Math.round(project.background.sampledBgColor.b)})
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Mode Selector: Solid Color vs Transparent */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleSelectBackgroundColor(customBgColor || '#A5C9EB')}
                        className={`p-2 rounded-lg border text-center font-semibold text-xs transition-all cursor-pointer ${
                          project.background.mode !== 'transparent'
                            ? 'border-cyan-400 bg-cyan-950/20 text-white'
                            : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        Solid Replacement Color
                      </button>
                      <button
                        onClick={() => handleSelectBackgroundColor('transparent')}
                        className={`p-2 rounded-lg border text-center font-semibold text-xs transition-all cursor-pointer ${
                          project.background.mode === 'transparent'
                            ? 'border-cyan-400 bg-cyan-950/20 text-white'
                            : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        Transparent PNG Cutout
                      </button>
                    </div>

                    {/* Custom Color Input */}
                    {project.background.mode !== 'transparent' && (
                      <div className="p-3 bg-slate-800/60 border border-slate-700 rounded-xl space-y-2">
                        <span className="text-[11px] font-semibold text-cyan-300 uppercase tracking-wider block">
                          Custom Replacement Color
                        </span>
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={customBgColor}
                            onChange={e => handleSelectBackgroundColor(e.target.value)}
                            className="w-10 h-10 rounded-lg border border-slate-600 bg-transparent cursor-pointer shrink-0"
                            title="Pick custom color"
                          />
                          <div className="flex-1">
                            <input
                              type="text"
                              value={customBgColor}
                              onChange={e => handleSelectBackgroundColor(e.target.value)}
                              placeholder="#A5C9EB"
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 font-mono text-white text-xs uppercase"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Official Presets */}
                    <span className="font-semibold text-white block text-[11px] uppercase tracking-wider">
                      Official Standards
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {BACKGROUND_PRESET_COLORS.map(item => (
                        <button
                          key={item.id}
                          onClick={() => handleSelectBackgroundColor(item.hex)}
                          className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all cursor-pointer ${
                            (item.hex === 'transparent' && project.background.mode === 'transparent') ||
                            (project.background.mode !== 'transparent' && project.background.color === item.hex)
                              ? 'border-cyan-400 bg-cyan-950/20 text-white'
                              : 'border-slate-800 bg-slate-800/40 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div
                            className="w-5 h-5 rounded-md border border-slate-600 shrink-0"
                            style={{
                              backgroundColor: item.hex === 'transparent' ? '#334155' : item.hex,
                            }}
                          />
                          <div className="overflow-hidden">
                            <span className="font-semibold block truncate text-xs">{item.label}</span>
                            <span className="text-[10px] text-slate-400 block truncate">{item.desc}</span>
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Edge Tolerance & Feather Sliders */}
                    <div className="pt-2 space-y-3 border-t border-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Edge Tolerance:</span>
                        <span className="font-mono text-cyan-300 font-semibold">
                          {project.background.tolerance || 48}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="15"
                        max="95"
                        value={project.background.tolerance || 48}
                        onChange={e => {
                          const val = Number(e.target.value);
                          onUpdateProject(prev => ({
                            ...prev,
                            background: { ...prev.background, tolerance: val },
                          }));
                        }}
                        className="w-full accent-cyan-400 cursor-pointer"
                      />

                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Feather (Soft Edge):</span>
                        <span className="font-mono text-cyan-300 font-semibold">
                          {project.background.feather || 6}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min="2"
                        max="20"
                        value={project.background.feather || 6}
                        onChange={e => {
                          const val = Number(e.target.value);
                          onUpdateProject(prev => ({
                            ...prev,
                            background: { ...prev.background, feather: val },
                          }));
                        }}
                        className="w-full accent-cyan-400 cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 4: RETOUCH BRUSH & FORMAL OUTFITS */}
            {currentStep === 4 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="font-semibold text-white text-sm">4. Retouch &amp; Formal Outfits</h3>
                  <p className="text-[11px] text-slate-400">
                    Heal blemishes directly or add a formal suit jacket for profile photos.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'smooth', label: 'Skin Smooth' },
                    { id: 'heal', label: 'Blemish Heal' },
                    { id: 'brighten', label: 'Brighten Eye' },
                    { id: 'eraser', label: 'Eraser' },
                  ].map(tool => (
                    <button
                      key={tool.id}
                      onClick={() => setBrushMode(tool.id as any)}
                      className={`p-2 rounded-lg border text-center font-semibold transition-all cursor-pointer text-xs ${
                        brushMode === tool.id
                          ? 'border-cyan-400 bg-cyan-950/30 text-white'
                          : 'border-slate-800 bg-slate-800/40 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      {tool.label}
                    </button>
                  ))}
                </div>

                <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-300">Brush Size:</span>
                    <span className="font-mono text-cyan-300 font-semibold">{brushRadius}px</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="60"
                    value={brushRadius}
                    onChange={e => setBrushRadius(Number(e.target.value))}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>

                {/* Outfits Catalog */}
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <span className="font-semibold text-white block text-xs">Formal Outfits (Optional):</span>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {OUTFIT_CATALOG.map(outfit => {
                      const isSelected = project.outfit?.id === outfit.id;
                      return (
                        <button
                          key={outfit.id}
                          onClick={() => {
                            if (isSelected) {
                              onUpdateProject(prev => ({ ...prev, outfit: null }));
                            } else {
                              onUpdateProject(prev => ({
                                ...prev,
                                outfit: {
                                  id: outfit.id,
                                  name: outfit.name,
                                  category: 'formal_men',
                                  scale: outfit.defaultScale,
                                  offsetX: 0,
                                  offsetY: outfit.defaultOffsetY,
                                  opacity: 1,
                                },
                              }));
                            }
                          }}
                          className={`w-full text-left p-2 rounded-lg border transition-all cursor-pointer ${
                            isSelected
                              ? 'border-cyan-400 bg-cyan-950/20 text-white'
                              : 'border-slate-800 bg-slate-800/40 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-white">{outfit.name}</span>
                            <span className="text-[10px] text-cyan-300 font-mono">{outfit.gender}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* STEPPER NAVIGATION FOOTER: Next / Skip / Back buttons */}
          <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-2 shrink-0">
            {currentStep > 1 ? (
              <button
                onClick={() => goToStep((currentStep - 1) as WizardStep)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              {/* Optional Skip button on intermediate steps */}
              {currentStep > 1 && currentStep < 5 && (
                <button
                  onClick={() => goToStep((currentStep + 1) as WizardStep)}
                  className="px-3 py-2 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Skip
                </button>
              )}

              {/* Next Step Primary Button */}
              {currentStep < 5 && (
                <button
                  onClick={() => goToStep((currentStep + 1) as WizardStep)}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-[#0B1020] bg-cyan-300 hover:bg-cyan-200 active:scale-95 rounded-lg transition-all shadow-md shadow-cyan-950 cursor-pointer"
                >
                  <span>Next: {WIZARD_STEPS.find(s => s.step === currentStep + 1)?.title}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Center Canvas Viewport: Order 1 on mobile (anchored on top), Order 2 on desktop (main right canvas) */}
        <div
          ref={canvasContainerRef}
          className="order-1 md:order-2 h-[38vh] sm:h-[44vh] md:h-full md:flex-1 shrink-0 md:shrink overflow-hidden bg-slate-950 flex flex-col items-center justify-center relative select-none p-2 sm:p-4 border-b md:border-b-0 border-slate-800"
        >
          {/* Zoom controls floating */}
          <div className="absolute top-2 right-2 sm:top-3 sm:right-3 z-20 flex items-center gap-1 bg-slate-900/90 border border-slate-800 p-0.5 sm:p-1 rounded-lg backdrop-blur-md">
            <button
              onClick={() => setZoom(z => Math.max(0.3, z - 0.15))}
              className="p-1 sm:p-1.5 text-slate-400 hover:text-white rounded cursor-pointer"
              title="Zoom out"
            >
              <ZoomOut className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </button>
            <button
              onClick={() => setZoom(1)}
              className="px-1.5 sm:px-2 text-[10px] sm:text-xs font-mono text-slate-300 hover:text-white cursor-pointer"
              title="Reset to 100%"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => setZoom(z => Math.min(3, z + 0.15))}
              className="p-1 sm:p-1.5 text-slate-400 hover:text-white rounded cursor-pointer"
              title="Zoom in"
            >
              <ZoomIn className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </button>
            <div className="h-3 w-px bg-slate-700 mx-0.5 sm:mx-1" />
            <button
              onClick={() => setShowGuides(g => !g)}
              className={`p-1 sm:p-1.5 rounded transition-colors cursor-pointer ${
                showGuides ? 'text-cyan-300' : 'text-slate-400 hover:text-white'
              }`}
              title="Toggle Biometric Guides"
            >
              <Compass className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </button>
          </div>

          {/* Eyedropper Sampling Active Banner */}
          {isSamplingBgColor && (
            <div className="absolute top-2 left-2 z-20 flex items-center gap-2 bg-cyan-950/90 border border-cyan-400 text-cyan-200 px-3 py-1.5 rounded-lg text-xs font-semibold backdrop-blur-md shadow-lg animate-pulse">
              <Pipette className="w-3.5 h-3.5 text-cyan-400" />
              <span>Click anywhere on background to sample color</span>
              <button
                onClick={() => setIsSamplingBgColor(false)}
                className="ml-1 text-[10px] bg-cyan-900/60 hover:bg-cyan-800 px-1.5 py-0.5 rounded text-white cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Main Photo Canvas */}
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'center center',
              transition: isDrawing ? 'none' : 'transform 0.1s ease',
            }}
            className={`relative shadow-2xl rounded-sm max-h-[34vh] sm:max-h-[38vh] md:max-h-[75vh] max-w-[85vw] ${
              project.background.isRemoved ? 'bg-checkerboard' : 'bg-slate-900'
            }`}
          >
            <canvas
              ref={viewportCanvasRef}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              className={`block max-h-[34vh] sm:max-h-[38vh] md:max-h-[75vh] max-w-[85vw] object-contain rounded-sm ${
                currentStep === 4 || isSamplingBgColor ? 'cursor-crosshair' : 'cursor-default'
              }`}
            />

            {/* Selected Outfit SVG Overlay if enabled */}
            {project.outfit && (
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: `${project.outfit.offsetY}%`,
                  transform: `translateX(-50%) scale(${project.outfit.scale})`,
                  width: '100%',
                  pointerEvents: 'none',
                }}
                dangerouslySetInnerHTML={{
                  __html: OUTFIT_CATALOG.find(o => o.id === project.outfit?.id)?.svgPath || '',
                }}
              />
            )}

            {/* Passport Biometric Overlay Guides */}
            {showGuides && (
              <div className="absolute inset-0 pointer-events-none border border-cyan-400/40">
                <div
                  style={{ top: '42%' }}
                  className="absolute left-0 right-0 border-t border-cyan-400/60 flex items-center justify-end px-2"
                >
                  <span className="text-[9px] font-mono text-cyan-300 bg-slate-950/80 px-1 rounded">
                    Eye Level
                  </span>
                </div>
                <div
                  style={{ top: '15%' }}
                  className="absolute left-0 right-0 border-t border-dashed border-cyan-400/40 flex items-center justify-end px-2"
                >
                  <span className="text-[9px] font-mono text-cyan-300 bg-slate-950/80 px-1 rounded">
                    Crown (Top)
                  </span>
                </div>
                <div
                  style={{ bottom: '15%' }}
                  className="absolute left-0 right-0 border-t border-dashed border-cyan-400/40 flex items-center justify-end px-2"
                >
                  <span className="text-[9px] font-mono text-cyan-300 bg-slate-950/80 px-1 rounded">
                    Chin
                  </span>
                </div>
                <div
                  style={{
                    left: '20%',
                    right: '20%',
                    top: '15%',
                    bottom: '15%',
                    borderRadius: '50% 50% 45% 45%',
                    border: '1.5px dashed rgba(103, 232, 249, 0.5)',
                  }}
                  className="absolute"
                />
                <div className="absolute top-0 bottom-0 left-1/2 border-l border-cyan-400/30" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
