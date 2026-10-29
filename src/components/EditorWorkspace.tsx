import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ZoomIn, ZoomOut, Maximize2, Minimize2, RotateCcw, RotateCw,
  FlipHorizontal, FlipVertical, Undo2, Redo2, Eye, EyeOff,
  Sparkles, Sliders, Image as ImageIcon, Paintbrush, Compass,
  Shirt, Grid, Printer, Download, Check, AlertCircle, RefreshCw,
  ArrowRight, ArrowLeft, CheckCircle2, MessageSquare, Pipette,
  Plus, User, Users, Pencil, Trash2, X, Upload
} from 'lucide-react';
import {
  StudioProject, ImageAdjustments, Transformations, CropState,
  BackgroundSettings, RetouchStroke, OutfitOverlay, PassportPreset,
  StudioPerson
} from '../types';
import { PASSPORT_PRESETS, BACKGROUND_PRESET_COLORS } from '../constants/passportPresets';
import { OUTFIT_CATALOG } from '../constants/outfits';
import {
  loadImage, renderTransformedCanvas, applyAdjustmentsToImageData,
  applySharpen, applyVignette, processBackgroundRemoval,
  applyLocalAIEnhancement, applyRetouchStrokes, getCroppedCanvas, mmToPixels,
  removeBackgroundWithAI
} from '../services/imageProcessing';
import { PrintSheetWorkspace } from './PrintSheetWorkspace';
import sampleManImg from '../assets/images/sample_portrait_man_1793180916362.jpg';
import sampleWomanImg from '../assets/images/sample_portrait_woman_1793180916339.jpg';

interface EditorWorkspaceProps {
  project: StudioProject;
  onUpdateProject: (updater: (prev: StudioProject) => StudioProject) => void;
  onOpenModal: (modal: 'privacy' | 'terms' | 'faq' | 'contact') => void;
}

export type WizardStep = 1 | 2 | 3 | 4 | 5;

const WIZARD_STEPS = [
  { step: 1, id: 'crop', title: 'Passport & Crop', desc: 'Select standard & frame' },
  { step: 2, id: 'enhance', title: 'AI Enhance', desc: 'Clarity & portrait lighting' },
  { step: 3, id: 'background', title: 'AI Background', desc: 'Neural boundary isolation' },
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
  const [customBgColor, setCustomBgColor] = useState(project.background.color || '#A5C9EB');
  const [isRemovingBg, setIsRemovingBg] = useState(false);
  const [bgProgress, setBgProgress] = useState<{ text: string; pct: number } | null>(null);
  const cutoutImageRef = useRef<HTMLImageElement | null>(null);
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

  // Multi-Person State
  const [isAddPersonModalOpen, setIsAddPersonModalOpen] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [editingPersonNameId, setEditingPersonNameId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [personCanvasesMap, setPersonCanvasesMap] = useState<Record<string, HTMLCanvasElement>>({});
  const newPersonFileInputRef = useRef<HTMLInputElement>(null);

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

  // Load neural cutout image whenever available
  useEffect(() => {
    if (project.background.cutoutDataUrl) {
      loadImage(project.background.cutoutDataUrl).then(img => {
        cutoutImageRef.current = img;
        renderPipeline();
      });
    } else {
      cutoutImageRef.current = null;
      renderPipeline();
    }
  }, [project.background.cutoutDataUrl]);

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

    // 3. Background replacement using AI Neural Cutout
    let stageCanvas = baseCanvas;
    if (project.background.isRemoved && cutoutImageRef.current) {
      stageCanvas = processBackgroundRemoval(baseCanvas, project.background, cutoutImageRef.current);
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

  // Multi-Person handlers
  const handleSwitchPerson = (targetPersonId: string) => {
    const currentPersonId = project.activePersonId || project.people?.[0]?.id;
    if (currentPersonId === targetPersonId) return;

    const targetPerson = project.people?.find(p => p.id === targetPersonId);
    if (!targetPerson) return;

    onUpdateProject(prev => {
      // Save current person state into people array
      const updatedPeople = (prev.people || []).map(p => {
        if (p.id === currentPersonId) {
          return {
            ...p,
            imageSrc: prev.imageSrc,
            naturalWidth: prev.naturalWidth,
            naturalHeight: prev.naturalHeight,
            adjustments: { ...prev.adjustments },
            transformations: { ...prev.transformations },
            crop: { ...prev.crop },
            background: { ...prev.background },
            retouchStrokes: [...prev.retouchStrokes],
            outfit: prev.outfit ? { ...prev.outfit } : null,
          };
        }
        return p;
      });

      return {
        ...prev,
        activePersonId: targetPerson.id,
        imageSrc: targetPerson.imageSrc,
        naturalWidth: targetPerson.naturalWidth,
        naturalHeight: targetPerson.naturalHeight,
        adjustments: { ...targetPerson.adjustments },
        transformations: { ...targetPerson.transformations },
        crop: { ...targetPerson.crop },
        background: { ...targetPerson.background },
        retouchStrokes: [...targetPerson.retouchStrokes],
        outfit: targetPerson.outfit ? { ...targetPerson.outfit } : null,
        people: updatedPeople,
      };
    });

    const preset = PASSPORT_PRESETS.find(p => p.id === targetPerson.crop.presetId) || PASSPORT_PRESETS[0];
    setSelectedPreset(preset);
    setCustomWidthMm(targetPerson.widthMm || preset.widthMm);
    setCustomHeightMm(targetPerson.heightMm || preset.heightMm);
    setCustomBgColor(targetPerson.background.color || '#A5C9EB');
  };

  const handleAddPerson = (imageSrc: string, name?: string) => {
    loadImage(imageSrc).then(img => {
      const newPersonId = 'person_' + Date.now();
      const defaultPreset = PASSPORT_PRESETS[0];
      const newName = name || `Person ${(project.people?.length || 0) + 1}`;

      const newPerson: StudioPerson = {
        id: newPersonId,
        name: newName,
        imageSrc,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
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
        transformations: {
          fineRotation: 0,
          rotation: 0,
          flipH: false,
          flipV: false,
        },
        crop: {
          x: 5,
          y: 5,
          width: 90,
          height: 90,
          presetId: defaultPreset.id,
          lockAspect: true,
          aspectRatio: defaultPreset.ratio,
        },
        background: {
          isRemoved: false,
          mode: 'original',
          color: '#A5C9EB',
          model: 'isnet-neural',
        },
        retouchStrokes: [],
        outfit: null,
        widthMm: defaultPreset.widthMm,
        heightMm: defaultPreset.heightMm,
      };

      const currentPersonId = project.activePersonId || project.people?.[0]?.id;

      onUpdateProject(prev => {
        const updatedPeople = (prev.people || []).map(p => {
          if (p.id === currentPersonId) {
            return {
              ...p,
              imageSrc: prev.imageSrc,
              naturalWidth: prev.naturalWidth,
              naturalHeight: prev.naturalHeight,
              adjustments: { ...prev.adjustments },
              transformations: { ...prev.transformations },
              crop: { ...prev.crop },
              background: { ...prev.background },
              retouchStrokes: [...prev.retouchStrokes],
              outfit: prev.outfit ? { ...prev.outfit } : null,
            };
          }
          return p;
        });

        const allPeople = [...updatedPeople, newPerson];

        return {
          ...prev,
          activePersonId: newPerson.id,
          imageSrc: newPerson.imageSrc,
          naturalWidth: newPerson.naturalWidth,
          naturalHeight: newPerson.naturalHeight,
          adjustments: { ...newPerson.adjustments },
          transformations: { ...newPerson.transformations },
          crop: { ...newPerson.crop },
          background: { ...newPerson.background },
          retouchStrokes: [],
          outfit: null,
          people: allPeople,
        };
      });

      setSelectedPreset(defaultPreset);
      setCustomWidthMm(defaultPreset.widthMm);
      setCustomHeightMm(defaultPreset.heightMm);
      setCustomBgColor('#A5C9EB');
      setIsAddPersonModalOpen(false);
      goToStep(1);
    });
  };

  const handleDeletePerson = (personId: string) => {
    if ((project.people?.length || 0) <= 1) return;

    onUpdateProject(prev => {
      const remaining = (prev.people || []).filter(p => p.id !== personId);
      const nextActive = remaining[0];
      return {
        ...prev,
        people: remaining,
        activePersonId: nextActive.id,
        imageSrc: nextActive.imageSrc,
        naturalWidth: nextActive.naturalWidth,
        naturalHeight: nextActive.naturalHeight,
        adjustments: { ...nextActive.adjustments },
        transformations: { ...nextActive.transformations },
        crop: { ...nextActive.crop },
        background: { ...nextActive.background },
        retouchStrokes: [...nextActive.retouchStrokes],
        outfit: nextActive.outfit ? { ...nextActive.outfit } : null,
      };
    });
  };

  const handleRenamePerson = (personId: string, newName: string) => {
    if (!newName.trim()) return;
    onUpdateProject(prev => ({
      ...prev,
      people: (prev.people || []).map(p => p.id === personId ? { ...p, name: newName.trim() } : p),
    }));
  };

  // Background Studio AI execution
  const handleRunBackgroundRemoval = async (overrideColor?: string) => {
    const img = sourceImageRef.current;
    if (!img) return;

    setIsRemovingBg(true);
    setBgProgress({ text: 'Initializing IS-Net AI neural model...', pct: 15 });

    try {
      const baseCanvas = renderTransformedCanvas(img, project.transformations);
      const cutoutDataUrl = await removeBackgroundWithAI(baseCanvas, (status, pct) => {
        setBgProgress({ text: status, pct });
      });

      // Crucial: Load cutout into image ref first before state update
      const loadedCutout = await loadImage(cutoutDataUrl);
      cutoutImageRef.current = loadedCutout;

      const chosenColor = overrideColor || project.background.color || customBgColor || '#A5C9EB';
      const chosenMode = chosenColor === 'transparent' ? 'transparent' : 'color';

      onUpdateProject(prev => {
        const activeId = prev.activePersonId || prev.people?.[0]?.id;
        const newBg: BackgroundSettings = {
          ...prev.background,
          isRemoved: true,
          mode: chosenMode,
          color: chosenColor,
          model: 'isnet-neural',
          cutoutDataUrl,
        };

        const updated: StudioProject = {
          ...prev,
          background: newBg,
          people: prev.people?.map(p => p.id === activeId ? { ...p, background: newBg } : p),
        };
        pushHistory(updated);
        return updated;
      });
    } catch (err) {
      console.error('Failed to run AI background removal:', err);
    } finally {
      setIsRemovingBg(false);
      setBgProgress(null);
    }
  };

  const handleToggleBackgroundRemoval = () => {
    onUpdateProject(prev => {
      const newRemoved = !prev.background.isRemoved;
      const activeId = prev.activePersonId || prev.people?.[0]?.id;
      const newBg: BackgroundSettings = {
        ...prev.background,
        isRemoved: newRemoved,
        mode: newRemoved ? (prev.background.mode === 'original' ? 'color' : prev.background.mode) : 'original',
        color: prev.background.color || '#A5C9EB',
      };
      const updated: StudioProject = {
        ...prev,
        background: newBg,
        people: prev.people?.map(p => p.id === activeId ? { ...p, background: newBg } : p),
      };
      pushHistory(updated);
      return updated;
    });
  };

  const handleSelectBackgroundColor = async (colorHex: string) => {
    setCustomBgColor(colorHex);

    // If cutout hasn't been extracted yet, automatically run AI background extraction with chosen color
    if (!project.background.cutoutDataUrl) {
      await handleRunBackgroundRemoval(colorHex);
      return;
    }

    const newMode: 'color' | 'original' | 'transparent' = colorHex === 'transparent' ? 'transparent' : 'color';
    onUpdateProject(prev => {
      const activeId = prev.activePersonId || prev.people?.[0]?.id;
      const newBg: BackgroundSettings = {
        ...prev.background,
        isRemoved: true,
        mode: newMode,
        color: colorHex,
      };
      const updated: StudioProject = {
        ...prev,
        background: newBg,
        people: prev.people?.map(p => p.id === activeId ? { ...p, background: newBg } : p),
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

  // Pointer interaction handler for Retouching Brush
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = viewportCanvasRef.current;
    if (!canvas) return;

    if (currentStep !== 4) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

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

  // Pre-render cropped canvases for all people in project when entering Step 5
  useEffect(() => {
    if (currentStep === 5 && project.people && project.people.length > 0) {
      project.people.forEach(async person => {
        if (person.id === (project.activePersonId || project.people?.[0]?.id) && processedCanvasRef.current) {
          const targetW = mmToPixels(customWidthMm, 300);
          const targetH = mmToPixels(customHeightMm, 300);
          const cropped = getCroppedCanvas(processedCanvasRef.current, project.crop, targetW, targetH);
          setPersonCanvasesMap(prev => ({ ...prev, [person.id]: cropped }));
        } else {
          try {
            const img = await loadImage(person.imageSrc);
            let canvas = renderTransformedCanvas(img, person.transformations);
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              applyAdjustmentsToImageData(imgData, person.adjustments);
              ctx.putImageData(imgData, 0, 0);
              if (person.adjustments.sharpness > 0) applySharpen(canvas, person.adjustments.sharpness);
              if (person.adjustments.vignette > 0) applyVignette(canvas, person.adjustments.vignette);
            }
            if (person.background.isRemoved && person.background.cutoutDataUrl) {
              const cutoutImg = await loadImage(person.background.cutoutDataUrl);
              canvas = processBackgroundRemoval(canvas, person.background, cutoutImg);
            }
            if (person.retouchStrokes && person.retouchStrokes.length > 0) {
              applyRetouchStrokes(canvas, person.retouchStrokes);
            }
            const preset = PASSPORT_PRESETS.find(p => p.id === person.crop.presetId) || PASSPORT_PRESETS[0];
            const wMm = person.widthMm || preset.widthMm;
            const hMm = person.heightMm || preset.heightMm;
            const targetW = mmToPixels(wMm, 300);
            const targetH = mmToPixels(hMm, 300);
            const cropped = getCroppedCanvas(canvas, person.crop, targetW, targetH);
            setPersonCanvasesMap(prev => ({ ...prev, [person.id]: cropped }));
          } catch (err) {
            console.warn('Could not pre-render canvas for person:', person.name, err);
          }
        }
      });
    }
  }, [currentStep, project.people, project.activePersonId, customWidthMm, customHeightMm]);

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
        sheetPhotos={project.sheetPhotos || []}
        onAddSheetPhoto={photo => {
          onUpdateProject(prev => ({
            ...prev,
            sheetPhotos: [...(prev.sheetPhotos || []), photo],
          }));
        }}
        onRemoveSheetPhoto={photoId => {
          onUpdateProject(prev => ({
            ...prev,
            sheetPhotos: (prev.sheetPhotos || []).filter(p => p.id !== photoId),
            printSheet: {
              ...prev.printSheet,
              items: prev.printSheet.items.filter(i => i.photoId !== photoId),
            },
          }));
        }}
        people={project.people || []}
        activePersonId={project.activePersonId}
        personCanvasesMap={personCanvasesMap}
        onSelectPersonToEdit={personId => {
          handleSwitchPerson(personId);
          goToStep(1);
        }}
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

      {/* MULTI-PERSON STUDIO BAR */}
      <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-2 flex items-center justify-between gap-3 overflow-x-auto scrollbar-none shrink-0">
        <div className="flex items-center gap-2 min-w-max">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider pr-1">
            <Users className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">People in Project:</span>
          </div>

          {(project.people || []).map((person, idx) => {
            const isActive = (project.activePersonId || project.people?.[0]?.id) === person.id;
            const isEditingName = editingPersonNameId === person.id;

            return (
              <div
                key={person.id}
                onClick={() => !isEditingName && handleSwitchPerson(person.id)}
                className={`group flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                  isActive
                    ? 'bg-cyan-950/50 border-cyan-400 text-white shadow-sm ring-1 ring-cyan-400/30'
                    : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                {/* Person Mini Avatar */}
                <div className="w-5 h-5 rounded-full overflow-hidden border border-slate-700 shrink-0 bg-slate-800">
                  <img src={person.imageSrc} alt={person.name} className="w-full h-full object-cover" />
                </div>

                {/* Name / Rename Input */}
                {isEditingName ? (
                  <input
                    type="text"
                    value={editNameValue}
                    autoFocus
                    onChange={e => setEditNameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        handleRenamePerson(person.id, editNameValue);
                        setEditingPersonNameId(null);
                      } else if (e.key === 'Escape') {
                        setEditingPersonNameId(null);
                      }
                    }}
                    onBlur={() => {
                      handleRenamePerson(person.id, editNameValue);
                      setEditingPersonNameId(null);
                    }}
                    onClick={e => e.stopPropagation()}
                    className="w-24 px-1.5 py-0.5 bg-slate-950 border border-cyan-400 text-xs text-white rounded outline-none font-semibold"
                  />
                ) : (
                  <span className="text-xs font-semibold whitespace-nowrap">
                    {person.name || `Person ${idx + 1}`}
                  </span>
                )}

                {/* Edit Pencil */}
                {!isEditingName && (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setEditingPersonNameId(person.id);
                      setEditNameValue(person.name || `Person ${idx + 1}`);
                    }}
                    className="p-0.5 text-slate-500 hover:text-cyan-300 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Rename this person"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                )}

                {/* Delete button if more than 1 person */}
                {(project.people?.length || 0) > 1 && (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      handleDeletePerson(person.id);
                    }}
                    className="p-0.5 text-slate-500 hover:text-rose-400 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Delete person"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}

          {/* Add Person Button */}
          <button
            type="button"
            onClick={() => {
              setNewPersonName(`Person ${(project.people?.length || 0) + 1}`);
              setIsAddPersonModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-cyan-400/50 hover:border-cyan-400 bg-cyan-950/20 hover:bg-cyan-950/40 text-cyan-300 hover:text-white text-xs font-semibold transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Add Person</span>
          </button>
        </div>

        {/* Info label on current person */}
        <div className="hidden lg:flex items-center gap-2 text-[11px] text-slate-400 shrink-0 font-mono">
          <span>Active Person:</span>
          <span className="text-cyan-300 font-semibold">
            {project.people?.find(p => p.id === (project.activePersonId || project.people?.[0]?.id))?.name || 'Person 1'}
          </span>
          <span className="text-slate-600">•</span>
          <span>{selectedPreset.name}</span>
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

            {/* STEP 3: STATE-OF-THE-ART AI NEURAL BACKGROUND REMOVER */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-cyan-950 border border-cyan-500/40 text-cyan-300">
                      Highest-End Neural Model
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">IS-Net Matting</span>
                  </div>
                  <h3 className="font-semibold text-white text-sm">3. AI Neural Background Removal &amp; Backdrop</h3>
                  <p className="text-[11px] text-slate-400">
                    Deep-learning salient object segmentation isolates subjects cleanly from any kind of background (indoor, outdoor, complex, shadows) with 100% subject preservation.
                  </p>
                </div>

                {/* AI Model Trigger Card */}
                <div className="p-4 bg-gradient-to-b from-slate-900 to-cyan-950/20 border border-cyan-500/30 rounded-xl space-y-3 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${project.background.isRemoved ? 'bg-emerald-400 ring-2 ring-emerald-400/30' : 'bg-cyan-400 animate-pulse'}`}></span>
                      <span className="text-xs font-bold text-white">
                        {project.background.isRemoved ? 'Subject Isolated (Zero Distortion)' : 'AI Salient Matting Model'}
                      </span>
                    </div>
                    {project.background.isRemoved && (
                      <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                        <CheckCircle2 className="w-3.5 h-3.5" /> High-End Cutout Ready
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Preserves natural hair strands, facial features, clothes contours, and skin tones with zero pixel alteration.
                  </p>

                  <button
                    onClick={() => handleRunBackgroundRemoval()}
                    disabled={isRemovingBg}
                    className="w-full py-2.5 px-4 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md disabled:opacity-50 active:scale-98"
                  >
                    {isRemovingBg ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                        <span>Processing AI Salient Matting…</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>{project.background.cutoutDataUrl ? 'Re-run AI Background Extraction' : 'Remove Background with AI Model'}</span>
                      </>
                    )}
                  </button>

                  {/* Real-time progress bar */}
                  {isRemovingBg && bgProgress && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-[11px] text-cyan-300 font-mono">
                        <span className="truncate">{bgProgress.text}</span>
                        <span className="font-bold">{bgProgress.pct}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-cyan-400 transition-all duration-300"
                          style={{ width: `${bgProgress.pct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Backdrop Color Options (when background is removed or cutout ready) */}
                {project.background.isRemoved && (
                  <div className="space-y-3.5 pt-1 animate-in fade-in duration-200">
                    {/* Mode Selector: Solid Color vs Transparent */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleSelectBackgroundColor(customBgColor || '#A5C9EB')}
                        className={`p-2.5 rounded-lg border text-center font-semibold text-xs transition-all cursor-pointer ${
                          project.background.mode !== 'transparent'
                            ? 'border-cyan-400 bg-cyan-950/30 text-white shadow-sm'
                            : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        Solid Passport Backdrop
                      </button>
                      <button
                        onClick={() => handleSelectBackgroundColor('transparent')}
                        className={`p-2.5 rounded-lg border text-center font-semibold text-xs transition-all cursor-pointer ${
                          project.background.mode === 'transparent'
                            ? 'border-cyan-400 bg-cyan-950/30 text-white shadow-sm'
                            : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        Transparent Cutout (PNG)
                      </button>
                    </div>

                    {/* Official Presets */}
                    {project.background.mode !== 'transparent' && (
                      <div className="space-y-2">
                        <span className="font-semibold text-white block text-[11px] uppercase tracking-wider">
                          Official Passport Standard Colors
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          {BACKGROUND_PRESET_COLORS.map(item => (
                            <button
                              key={item.id}
                              onClick={() => handleSelectBackgroundColor(item.hex)}
                              className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all cursor-pointer ${
                                (item.hex === 'transparent' && project.background.mode === 'transparent') ||
                                (project.background.mode !== 'transparent' && project.background.color === item.hex)
                                  ? 'border-cyan-400 bg-cyan-950/30 text-white'
                                  : 'border-slate-800 bg-slate-900/80 text-slate-300 hover:border-slate-700'
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

                        {/* Custom Color Input */}
                        <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2">
                          <span className="text-[11px] font-semibold text-cyan-300 uppercase tracking-wider block">
                            Custom Backdrop Color
                          </span>
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={customBgColor}
                              onChange={e => handleSelectBackgroundColor(e.target.value)}
                              className="w-9 h-9 rounded-lg border border-slate-600 bg-transparent cursor-pointer shrink-0"
                              title="Pick custom color"
                            />
                            <div className="flex-1">
                              <input
                                type="text"
                                value={customBgColor}
                                onChange={e => handleSelectBackgroundColor(e.target.value)}
                                placeholder="#A5C9EB"
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 font-mono text-white text-xs uppercase"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                      <button
                        onClick={() => {
                          onUpdateProject(prev => ({
                            ...prev,
                            background: { ...prev.background, isRemoved: false, mode: 'original' },
                          }));
                        }}
                        className="text-xs text-slate-400 hover:text-cyan-300 hover:underline cursor-pointer"
                      >
                        Revert to original background
                      </button>
                      <button
                        onClick={() => goToStep(4)}
                        className="text-xs font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
                      >
                        Next: Retouch &amp; Outfits →
                      </button>
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
                currentStep === 4 ? 'cursor-crosshair' : 'cursor-default'
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

      {/* ADD PERSON MODAL */}
      {isAddPersonModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-400" />
                <h3 className="font-bold text-white text-sm">Add Person to Studio</h3>
              </div>
              <button
                onClick={() => setIsAddPersonModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Person Label / Name</label>
              <input
                type="text"
                value={newPersonName}
                onChange={e => setNewPersonName(e.target.value)}
                placeholder="e.g. Mom, Dad, Child, Jane"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs focus:border-cyan-400 outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">Select Photo</label>

              {/* Upload file */}
              <input
                ref={newPersonFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = ev => {
                      const dataUrl = ev.target?.result as string;
                      if (dataUrl) {
                        handleAddPerson(dataUrl, newPersonName);
                      }
                    };
                    reader.readAsDataURL(file);
                  }
                }}
              />

              <button
                type="button"
                onClick={() => newPersonFileInputRef.current?.click()}
                className="w-full p-3 bg-cyan-950/30 hover:bg-cyan-950/60 border border-cyan-500/40 rounded-xl flex items-center justify-center gap-2 text-cyan-300 hover:text-white text-xs font-bold transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Upload Photo from Device</span>
              </button>

              <div className="text-center text-[10px] uppercase font-mono text-slate-500 py-0.5">— OR CHOOSE SAMPLE PORTRAIT —</div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleAddPerson(sampleManImg, newPersonName || 'Man Portrait')}
                  className="p-2 bg-slate-950 border border-slate-800 hover:border-cyan-400 rounded-xl flex items-center gap-2 text-left transition-colors cursor-pointer group"
                >
                  <img src={sampleManImg} alt="Sample Man" className="w-9 h-9 rounded-lg object-cover" />
                  <div>
                    <span className="font-semibold text-white text-xs block group-hover:text-cyan-300">Sample Man</span>
                    <span className="text-[10px] text-slate-400 block">Demo Portrait</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddPerson(sampleWomanImg, newPersonName || 'Woman Portrait')}
                  className="p-2 bg-slate-950 border border-slate-800 hover:border-cyan-400 rounded-xl flex items-center gap-2 text-left transition-colors cursor-pointer group"
                >
                  <img src={sampleWomanImg} alt="Sample Woman" className="w-9 h-9 rounded-lg object-cover" />
                  <div>
                    <span className="font-semibold text-white text-xs block group-hover:text-cyan-300">Sample Woman</span>
                    <span className="text-[10px] text-slate-400 block">Demo Portrait</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
