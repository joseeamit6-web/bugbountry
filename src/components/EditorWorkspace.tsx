import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ZoomIn, ZoomOut, Maximize2, Minimize2, RotateCcw, RotateCw,
  FlipHorizontal, FlipVertical, Undo2, Redo2, Eye, EyeOff,
  Sparkles, Sliders, Image as ImageIcon, Paintbrush, Compass,
  Shirt, Grid, Printer, Download, Check, AlertCircle, RefreshCw,
  ArrowRight, ArrowLeft, CheckCircle2, MessageSquare, Pipette,
  Crop, Lock, Unlock, Move
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
  samplePixelColor, exportCroppedPassportPhoto
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

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      const prev = historyRef.current[historyIndexRef.current];
      onUpdateProject(() => prev);
    }
  }, [onUpdateProject]);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      const next = historyRef.current[historyIndexRef.current];
      onUpdateProject(() => next);
    }
  }, [onUpdateProject]);

  // Global Keyboard Shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z, Ctrl+P)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (modifier && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (modifier && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        goToStep(5);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Crop interactive dragging state
  const cropDragRef = useRef<{
    isDragging: boolean;
    handle: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | null;
    startX: number;
    startY: number;
    startCrop: CropState;
  }>({
    isDragging: false,
    handle: null,
    startX: 0,
    startY: 0,
    startCrop: project.crop,
  });

  const handleCropPointerDown = (
    e: React.PointerEvent,
    handle: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w'
  ) => {
    e.stopPropagation();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    cropDragRef.current = {
      isDragging: true,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: { ...project.crop },
    };
  };

  const handleCropPointerMove = (e: React.PointerEvent) => {
    if (!cropDragRef.current.isDragging || !cropDragRef.current.handle) return;
    const canvas = viewportCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const deltaXPct = ((e.clientX - cropDragRef.current.startX) / rect.width) * 100;
    const deltaYPct = ((e.clientY - cropDragRef.current.startY) / rect.height) * 100;

    const { handle, startCrop } = cropDragRef.current;
    let newCrop = { ...startCrop };

    if (handle === 'move') {
      let nextX = startCrop.x + deltaXPct;
      let nextY = startCrop.y + deltaYPct;
      nextX = Math.max(0, Math.min(100 - startCrop.width, nextX));
      nextY = Math.max(0, Math.min(100 - startCrop.height, nextY));
      newCrop.x = Number(nextX.toFixed(2));
      newCrop.y = Number(nextY.toFixed(2));
    } else {
      let x1 = startCrop.x;
      let y1 = startCrop.y;
      let x2 = startCrop.x + startCrop.width;
      let y2 = startCrop.y + startCrop.height;

      if (handle.includes('w')) x1 = Math.max(0, Math.min(x2 - 10, startCrop.x + deltaXPct));
      if (handle.includes('e')) x2 = Math.min(100, Math.max(x1 + 10, startCrop.x + startCrop.width + deltaXPct));
      if (handle.includes('n')) y1 = Math.max(0, Math.min(y2 - 10, startCrop.y + deltaYPct));
      if (handle.includes('s')) y2 = Math.min(100, Math.max(y1 + 10, startCrop.y + startCrop.height + deltaYPct));

      let width = x2 - x1;
      let height = y2 - y1;

      // Maintain aspect ratio if locked
      if (newCrop.lockAspect) {
        const canvasAspect = canvas.width / canvas.height;
        const targetPhysicalAspect = newCrop.aspectRatio || (selectedPreset.widthMm / selectedPreset.heightMm);
        const pctAspect = targetPhysicalAspect / canvasAspect;

        if (handle === 'e' || handle === 'w') {
          height = width / pctAspect;
          if (y1 + height > 100) {
            height = 100 - y1;
            width = height * pctAspect;
          }
        } else {
          width = height * pctAspect;
          if (x1 + width > 100) {
            width = 100 - x1;
            height = width / pctAspect;
          }
        }
      }

      newCrop = {
        ...newCrop,
        x: Number(Math.max(0, x1).toFixed(2)),
        y: Number(Math.max(0, y1).toFixed(2)),
        width: Number(Math.max(10, Math.min(100 - x1, width)).toFixed(2)),
        height: Number(Math.max(10, Math.min(100 - y1, height)).toFixed(2)),
      };
    }

    onUpdateProject(prev => ({
      ...prev,
      crop: newCrop,
    }));
  };

  const handleCropPointerUp = (e: React.PointerEvent) => {
    if (cropDragRef.current.isDragging) {
      cropDragRef.current.isDragging = false;
      cropDragRef.current.handle = null;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      pushHistory(project);
    }
  };

  const handleAutoCenterCrop = () => {
    const canvas = viewportCanvasRef.current;
    const canvasAspect = canvas && canvas.height > 0 ? canvas.width / canvas.height : 1;
    const targetPhysicalAspect = selectedPreset.widthMm / selectedPreset.heightMm;
    const pctAspect = targetPhysicalAspect / canvasAspect;

    let height = 75;
    let width = height * pctAspect;
    if (width > 85) {
      width = 85;
      height = width / pctAspect;
    }
    const x = Math.max(0, (100 - width) / 2);
    const y = Math.max(0, (100 - height) / 2);

    const newCrop: CropState = {
      ...project.crop,
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      width: Number(width.toFixed(2)),
      height: Number(height.toFixed(2)),
      lockAspect: true,
      aspectRatio: targetPhysicalAspect,
    };

    onUpdateProject(prev => ({ ...prev, crop: newCrop }));
    pushHistory({ ...project, crop: newCrop });
  };

  const handleResetCropToFull = () => {
    const newCrop: CropState = {
      ...project.crop,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      lockAspect: false,
    };
    onUpdateProject(prev => ({ ...prev, crop: newCrop }));
    pushHistory({ ...project, crop: newCrop });
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

  // Background Studio toggles & One-Tap background remove
  const handleOneTapRemoveBackground = (targetColor: string = '#FFFFFF') => {
    setCustomBgColor(targetColor === 'transparent' ? '#FFFFFF' : targetColor);
    onUpdateProject(prev => {
      const isTrans = targetColor === 'transparent';
      const updated: StudioProject = {
        ...prev,
        background: {
          ...prev.background,
          isRemoved: true,
          mode: isTrans ? 'transparent' : 'color',
          color: isTrans ? 'transparent' : targetColor,
          tolerance: prev.background.tolerance || 48,
          feather: prev.background.feather || 6,
        },
      };
      pushHistory(updated);
      return updated;
    });
  };

  const handleRevertToOriginalBackground = () => {
    onUpdateProject(prev => {
      const updated: StudioProject = {
        ...prev,
        background: {
          ...prev.background,
          isRemoved: false,
          mode: 'original',
        },
      };
      pushHistory(updated);
      return updated;
    });
  };

  const handleToggleBackgroundRemoval = () => {
    if (project.background.isRemoved) {
      handleRevertToOriginalBackground();
    } else {
      handleOneTapRemoveBackground(project.background.color || '#FFFFFF');
    }
  };

  const handleSelectBackgroundColor = (colorHex: string) => {
    setCustomBgColor(colorHex === 'transparent' ? '#FFFFFF' : colorHex);
    onUpdateProject(prev => {
      const isTrans = colorHex === 'transparent';
      const updated: StudioProject = {
        ...prev,
        background: {
          ...prev.background,
          isRemoved: true,
          mode: isTrans ? 'transparent' : 'color',
          color: isTrans ? 'transparent' : colorHex,
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
    const targetW = mmToPixels(customWidthMm, 300);
    const targetH = mmToPixels(customHeightMm, 300);

    if (sourceImageRef.current) {
      return exportCroppedPassportPhoto(sourceImageRef.current, project, targetW, targetH);
    }
    if (processedCanvasRef.current) {
      return getCroppedCanvas(processedCanvasRef.current, project.crop, targetW, targetH);
    }
    const fallback = document.createElement('canvas');
    fallback.width = targetW;
    fallback.height = targetH;
    return fallback;
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

        {/* Right Stepper Actions: Undo (Ctrl+Z), Redo (Ctrl+Y), Print (Ctrl+P), Compare */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 p-0.5 rounded-xl">
            <button
              onClick={handleUndo}
              disabled={historyIndexRef.current <= 0}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-colors cursor-pointer text-xs"
              title="Undo (Ctrl+Z / ⌘Z)"
            >
              <Undo2 className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden xl:inline text-[10px] font-mono text-slate-400">Ctrl+Z</span>
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndexRef.current >= historyRef.current.length - 1}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-colors cursor-pointer text-xs"
              title="Redo (Ctrl+Y / ⌘Y)"
            >
              <Redo2 className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden xl:inline text-[10px] font-mono text-slate-400">Ctrl+Y</span>
            </button>
          </div>

          {/* One-Tap Remove Background Button */}
          <button
            onClick={() => {
              handleOneTapRemoveBackground('#FFFFFF');
              goToStep(3);
            }}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer shadow-sm ${
              project.background.isRemoved && project.background.color === '#FFFFFF'
                ? 'bg-emerald-950/60 border border-emerald-500/50 text-emerald-300'
                : 'bg-cyan-300 hover:bg-cyan-200 text-[#0B1020] font-bold active:scale-95 shadow-cyan-950/50'
            }`}
            title="One-Tap Remove Background: Removes background and sets to white"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {project.background.isRemoved ? 'White BG Active' : 'Remove BG (White)'}
            </span>
            <span className="sm:hidden">Remove BG</span>
          </button>

          <button
            onClick={() => goToStep(5)}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-900 border border-slate-800 hover:border-cyan-400 text-slate-200 hover:text-cyan-300 transition-colors cursor-pointer"
            title="Quick Print Sheet (Ctrl+P / ⌘P)"
          >
            <Printer className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden md:inline">Print</span>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1 rounded">Ctrl+P</span>
          </button>

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

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {PASSPORT_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      onClick={() => handleSelectPreset(preset)}
                      className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                        selectedPreset.id === preset.id
                          ? 'border-cyan-400 bg-cyan-950/30 text-white shadow-sm shadow-cyan-950/40'
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

                {/* Manual Crop & Face Matching Box Controls */}
                <div className="pt-2 border-t border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white text-xs flex items-center gap-1.5">
                      <Crop className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Manual Crop &amp; Face Fit</span>
                    </span>
                    <button
                      onClick={() => {
                        const newLock = !project.crop.lockAspect;
                        onUpdateProject(prev => ({
                          ...prev,
                          crop: { ...prev.crop, lockAspect: newLock },
                        }));
                      }}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border cursor-pointer transition-colors ${
                        project.crop.lockAspect
                          ? 'bg-cyan-950/40 border-cyan-500/50 text-cyan-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                      title="Lock aspect ratio to selected country standard"
                    >
                      {project.crop.lockAspect ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                      <span>{project.crop.lockAspect ? 'Ratio Locked' : 'Free Aspect'}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleAutoCenterCrop}
                      className="flex items-center justify-center gap-1.5 py-2 px-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-cyan-400 rounded-lg text-slate-200 transition-all cursor-pointer text-[11px] font-semibold"
                    >
                      <Compass className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Auto-Center Face</span>
                    </button>
                    <button
                      onClick={handleResetCropToFull}
                      className="flex items-center justify-center gap-1.5 py-2 px-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 transition-colors cursor-pointer text-[11px]"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Full Image</span>
                    </button>
                  </div>

                  <div className="p-2.5 bg-cyan-950/20 border border-cyan-500/20 rounded-lg text-[11px] text-cyan-200/90 leading-relaxed">
                    💡 <span className="font-semibold text-cyan-300">Face Matching:</span> Drag the cyan crop box over the face. Align eyes with the solid <span className="font-semibold text-cyan-300">Eye Level</span> line and chin with the <span className="font-semibold text-cyan-300">Chin</span> line.
                  </div>

                  <button
                    onClick={() => {
                      handleOneTapRemoveBackground('#FFFFFF');
                      goToStep(3);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-cyan-300 hover:bg-cyan-200 text-[#0B1020] rounded-xl transition-all cursor-pointer text-xs font-bold shadow-md shadow-cyan-950/40 active:scale-95"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>One-Tap White Background &amp; Colors →</span>
                  </button>
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
                  <h3 className="font-semibold text-white text-sm">3. Background Replacement &amp; Color Studio</h3>
                  <p className="text-[11px] text-slate-400">
                    Remove background with one tap, keep solid white, or pick any official country or custom color.
                  </p>
                </div>

                {/* ONE-TAP BACKGROUND REMOVER HERO CARD */}
                <div className="p-4 bg-gradient-to-br from-cyan-950/40 via-slate-900/90 to-slate-900 border border-cyan-500/40 rounded-2xl shadow-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-cyan-400/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shrink-0">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block">
                          Instant One-Tap Tool
                        </span>
                        <h4 className="text-xs font-bold text-white">One-Tap Remove Background</h4>
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Automatically segments the person and replaces the entire background with clean, professional solid white.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => handleOneTapRemoveBackground('#FFFFFF')}
                      className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md ${
                        project.background.isRemoved && project.background.color === '#FFFFFF' && project.background.mode !== 'transparent'
                          ? 'bg-emerald-400 text-slate-950 ring-2 ring-emerald-300 shadow-emerald-950/50'
                          : 'bg-cyan-300 hover:bg-cyan-200 text-[#0B1020] active:scale-95 shadow-cyan-950/40'
                      }`}
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>
                        {project.background.isRemoved && project.background.color === '#FFFFFF' && project.background.mode !== 'transparent'
                          ? 'White Background Applied ✓'
                          : 'Remove BG (White BG)'}
                      </span>
                    </button>

                    {project.background.isRemoved ? (
                      <button
                        onClick={handleRevertToOriginalBackground}
                        className="w-full py-2.5 px-3 rounded-xl font-medium text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                        <span>Restore Original BG</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleOneTapRemoveBackground('transparent')}
                        className="w-full py-2.5 px-3 rounded-xl font-medium text-xs bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <span>Transparent Cutout</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* BACKGROUND COLOR PICKER & SWATCHES */}
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <span>Change Background Color</span>
                    </span>
                    {project.background.isRemoved && (
                      <span className="text-[10px] text-cyan-300 font-mono font-medium">
                        Active: {project.background.mode === 'transparent' ? 'Transparent PNG' : project.background.color}
                      </span>
                    )}
                  </div>

                  {/* Preset Colors Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    {BACKGROUND_PRESET_COLORS.map(item => {
                      const isSelected =
                        project.background.isRemoved &&
                        ((item.hex === 'transparent' && project.background.mode === 'transparent') ||
                          (project.background.mode !== 'transparent' && project.background.color?.toUpperCase() === item.hex.toUpperCase()));

                      return (
                        <button
                          key={item.id}
                          onClick={() => handleSelectBackgroundColor(item.hex)}
                          className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'border-cyan-400 bg-cyan-950/30 text-white ring-1 ring-cyan-400 shadow-sm'
                              : 'border-slate-800 bg-slate-800/40 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div
                            className="w-6 h-6 rounded-lg border border-slate-600 shrink-0 shadow-sm flex items-center justify-center"
                            style={{
                              backgroundColor: item.hex === 'transparent' ? '#1e293b' : item.hex,
                            }}
                          >
                            {isSelected && (
                              <Check
                                className={`w-3.5 h-3.5 ${
                                  item.hex === '#FFFFFF' || item.hex === '#F8FAFC' || item.hex === '#FDFBF7' || item.hex === '#BAE6FD'
                                    ? 'text-slate-900'
                                    : 'text-white'
                                }`}
                                strokeWidth={3}
                              />
                            )}
                          </div>
                          <div className="overflow-hidden">
                            <span className="font-semibold block truncate text-xs">{item.label}</span>
                            <span className="text-[10px] text-slate-400 block truncate">{item.desc}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Hex & Native Color Picker */}
                  <div className="p-3 bg-slate-800/60 border border-slate-700 rounded-xl space-y-2">
                    <span className="text-[11px] font-semibold text-cyan-300 uppercase tracking-wider block">
                      Custom Color Picker
                    </span>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={customBgColor.startsWith('#') ? customBgColor : '#FFFFFF'}
                        onChange={e => handleSelectBackgroundColor(e.target.value)}
                        className="w-10 h-10 rounded-lg border border-slate-600 bg-transparent cursor-pointer shrink-0"
                        title="Pick custom background color"
                      />
                      <div className="flex-1">
                        <input
                          type="text"
                          value={customBgColor}
                          onChange={e => handleSelectBackgroundColor(e.target.value)}
                          placeholder="#FFFFFF"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 font-mono text-white text-xs uppercase"
                        />
                      </div>
                      <button
                        onClick={() => handleSelectBackgroundColor(customBgColor || '#FFFFFF')}
                        className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Apply
                      </button>
                    </div>
                  </div>

                  {/* Eyedropper Color Picker Tool */}
                  <div className="p-3 bg-slate-800/60 border border-slate-700 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-cyan-300 uppercase tracking-wider block">
                        Eyedropper Sampler
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
                          Reset Sampler
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
                      <span>{isSamplingBgColor ? 'Click anywhere on photo to sample…' : 'Sample Color from Photo'}</span>
                    </button>
                  </div>
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

            {/* Interactive Crop Box Overlay for Manual Cropping & Face Alignment */}
            {currentStep === 1 ? (
              <div
                className="absolute inset-0 select-none overflow-hidden"
                onPointerMove={handleCropPointerMove}
                onPointerUp={handleCropPointerUp}
              >
                {/* 4 Scrim Overlays around the crop box to dim the outside */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: `${project.crop.y}%`,
                  }}
                  className="bg-black/60 pointer-events-none"
                />
                <div
                  style={{
                    position: 'absolute',
                    top: `${project.crop.y + project.crop.height}%`,
                    left: 0,
                    right: 0,
                    bottom: 0,
                  }}
                  className="bg-black/60 pointer-events-none"
                />
                <div
                  style={{
                    position: 'absolute',
                    top: `${project.crop.y}%`,
                    left: 0,
                    width: `${project.crop.x}%`,
                    height: `${project.crop.height}%`,
                  }}
                  className="bg-black/60 pointer-events-none"
                />
                <div
                  style={{
                    position: 'absolute',
                    top: `${project.crop.y}%`,
                    left: `${project.crop.x + project.crop.width}%`,
                    right: 0,
                    height: `${project.crop.height}%`,
                  }}
                  className="bg-black/60 pointer-events-none"
                />

                {/* The Interactive Crop Box */}
                <div
                  style={{
                    position: 'absolute',
                    left: `${project.crop.x}%`,
                    top: `${project.crop.y}%`,
                    width: `${project.crop.width}%`,
                    height: `${project.crop.height}%`,
                  }}
                  className="border-2 border-cyan-400 shadow-[0_0_0_1px_rgba(0,0,0,0.8),0_0_20px_rgba(34,211,238,0.25)] touch-none cursor-move"
                  onPointerDown={e => handleCropPointerDown(e, 'move')}
                >
                  {/* Biometric Passport Face Alignment Guides INSIDE the crop box */}
                  {showGuides && (
                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                      {/* Eye Level Guide line (42% from top of crop) */}
                      <div
                        style={{ top: '42%' }}
                        className="absolute left-0 right-0 border-t border-cyan-400/90 flex items-center justify-end px-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                      >
                        <span className="text-[8px] sm:text-[9px] font-mono font-semibold text-cyan-200 bg-slate-950/90 px-1 py-0.5 rounded border border-cyan-500/40">
                          Eye Level
                        </span>
                      </div>

                      {/* Crown (Hair top) Guide line (14% from top of crop) */}
                      <div
                        style={{ top: '14%' }}
                        className="absolute left-0 right-0 border-t border-dashed border-cyan-400/60 flex items-center justify-end px-1.5"
                      >
                        <span className="text-[8px] sm:text-[9px] font-mono text-cyan-300 bg-slate-950/80 px-1 py-0.2 rounded">
                          Crown
                        </span>
                      </div>

                      {/* Chin Guide line (78% from top of crop) */}
                      <div
                        style={{ top: '78%' }}
                        className="absolute left-0 right-0 border-t border-dashed border-cyan-400/60 flex items-center justify-end px-1.5"
                      >
                        <span className="text-[8px] sm:text-[9px] font-mono text-cyan-300 bg-slate-950/80 px-1 py-0.2 rounded">
                          Chin
                        </span>
                      </div>

                      {/* Vertical Symmetry Center line */}
                      <div className="absolute top-0 bottom-0 left-1/2 border-l border-cyan-400/40" />

                      {/* Biometric Head Oval (70-80% height head silhouette) */}
                      <div
                        style={{
                          left: '18%',
                          right: '18%',
                          top: '14%',
                          bottom: '22%',
                          borderRadius: '50% 50% 45% 45%',
                          border: '1.5px dashed rgba(34, 211, 238, 0.75)',
                          boxShadow: '0 0 10px rgba(34, 211, 238, 0.2)',
                        }}
                        className="absolute pointer-events-none"
                      />

                      {/* Current standard badge */}
                      <div className="absolute top-1 left-1 bg-slate-950/90 text-cyan-300 text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded border border-slate-700 pointer-events-none">
                        {selectedPreset.name} ({customWidthMm}×{customHeightMm}mm)
                      </div>
                    </div>
                  )}

                  {/* 4 Corner Handles */}
                  <div
                    className="absolute -top-2 -left-2 w-4 h-4 bg-cyan-400 border border-slate-950 rounded-sm cursor-nwse-resize shadow-md hover:scale-125 transition-transform"
                    onPointerDown={e => handleCropPointerDown(e, 'nw')}
                    title="Resize crop box"
                  />
                  <div
                    className="absolute -top-2 -right-2 w-4 h-4 bg-cyan-400 border border-slate-950 rounded-sm cursor-nesw-resize shadow-md hover:scale-125 transition-transform"
                    onPointerDown={e => handleCropPointerDown(e, 'ne')}
                    title="Resize crop box"
                  />
                  <div
                    className="absolute -bottom-2 -left-2 w-4 h-4 bg-cyan-400 border border-slate-950 rounded-sm cursor-nesw-resize shadow-md hover:scale-125 transition-transform"
                    onPointerDown={e => handleCropPointerDown(e, 'sw')}
                    title="Resize crop box"
                  />
                  <div
                    className="absolute -bottom-2 -right-2 w-4 h-4 bg-cyan-400 border border-slate-950 rounded-sm cursor-nwse-resize shadow-md hover:scale-125 transition-transform"
                    onPointerDown={e => handleCropPointerDown(e, 'se')}
                    title="Resize crop box"
                  />

                  {/* 4 Edge Handles */}
                  <div
                    className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-6 h-2 bg-cyan-400/90 border border-slate-950 rounded-sm cursor-ns-resize shadow"
                    onPointerDown={e => handleCropPointerDown(e, 'n')}
                  />
                  <div
                    className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-6 h-2 bg-cyan-400/90 border border-slate-950 rounded-sm cursor-ns-resize shadow"
                    onPointerDown={e => handleCropPointerDown(e, 's')}
                  />
                  <div
                    className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-2 h-6 bg-cyan-400/90 border border-slate-950 rounded-sm cursor-ew-resize shadow"
                    onPointerDown={e => handleCropPointerDown(e, 'w')}
                  />
                  <div
                    className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-2 h-6 bg-cyan-400/90 border border-slate-950 rounded-sm cursor-ew-resize shadow"
                    onPointerDown={e => handleCropPointerDown(e, 'e')}
                  />
                </div>
              </div>
            ) : showGuides ? (
              /* In other steps: subtle crop border and guidelines */
              <div
                style={{
                  position: 'absolute',
                  left: `${project.crop.x}%`,
                  top: `${project.crop.y}%`,
                  width: `${project.crop.width}%`,
                  height: `${project.crop.height}%`,
                }}
                className="pointer-events-none border border-cyan-400/50 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
              >
                <div
                  style={{ top: '42%' }}
                  className="absolute left-0 right-0 border-t border-cyan-400/50 flex items-center justify-end px-1.5"
                >
                  <span className="text-[8px] font-mono text-cyan-300 bg-slate-950/80 px-1 rounded">
                    Eye Level
                  </span>
                </div>
                <div
                  style={{
                    left: '18%',
                    right: '18%',
                    top: '14%',
                    bottom: '22%',
                    borderRadius: '50% 50% 45% 45%',
                    border: '1px dashed rgba(34, 211, 238, 0.4)',
                  }}
                  className="absolute"
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
