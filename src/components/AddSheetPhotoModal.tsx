import React, { useState, useRef, useEffect } from 'react';
import {
  X, Upload, Sparkles, Crop as CropIcon, Image as ImageIcon,
  Check, ArrowRight, ArrowLeft, RefreshCw, RotateCw, ZoomIn, ZoomOut, CheckCircle2,
  Shirt, Sliders
} from 'lucide-react';
import { SheetPhotoEntry, PassportPreset, BackgroundSettings, OutfitOverlay, ImageAdjustments } from '../types';
import { PASSPORT_PRESETS, BACKGROUND_PRESET_COLORS } from '../constants/passportPresets';
import { OUTFIT_CATALOG } from '../constants/outfits';
import {
  loadImage, renderTransformedCanvas, applyAdjustmentsToImageData,
  applySharpen, removeBackgroundWithAI, processBackgroundRemoval,
  applyLocalAIEnhancement, mmToPixels
} from '../services/imageProcessing';

import sampleManImg from '../assets/images/sample_portrait_man_1793180916362.jpg';
import sampleWomanImg from '../assets/images/sample_portrait_woman_1793180916339.jpg';

interface AddSheetPhotoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddPhoto: (photoEntry: SheetPhotoEntry) => void;
}

export const AddSheetPhotoModal: React.FC<AddSheetPhotoModalProps> = ({
  isOpen,
  onClose,
  onAddPhoto,
}) => {
  const [sourceDataUrl, setSourceDataUrl] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState('Additional Photo');
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Crop & Preset
  const [selectedPreset, setSelectedPreset] = useState<PassportPreset>(PASSPORT_PRESETS[0]);
  const [cropPercent, setCropPercent] = useState({ x: 10, y: 5, width: 80, height: 80 });
  const [rotation, setRotation] = useState(0);
  const [fineRotation, setFineRotation] = useState(0);

  // Enhance
  const [aiStrength, setAiStrength] = useState(70);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [adjustments, setAdjustments] = useState<ImageAdjustments>({
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
  });

  // Background
  const [background, setBackground] = useState<BackgroundSettings>({
    isRemoved: false,
    mode: 'color',
    color: '#A5C9EB',
    model: 'isnet-neural',
  });
  const [isRemovingBg, setIsRemovingBg] = useState(false);
  const [bgProgress, setBgProgress] = useState<{ text: string; pct: number } | null>(null);
  const [customBgColor, setCustomBgColor] = useState('#A5C9EB');

  // Outfit
  const [selectedOutfit, setSelectedOutfit] = useState<OutfitOverlay | null>(null);

  // Canvas preview
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const cutoutImageRef = useRef<HTMLImageElement | null>(null);
  const outfitImageRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset when closed or opened
  useEffect(() => {
    if (!isOpen) {
      setSourceDataUrl(null);
      setStep(1);
      setBackground({
        isRemoved: false,
        mode: 'color',
        color: '#A5C9EB',
        model: 'isnet-neural',
      });
      setSelectedOutfit(null);
      cutoutImageRef.current = null;
    }
  }, [isOpen]);

  // Load source image
  useEffect(() => {
    if (!sourceDataUrl) return;
    loadImage(sourceDataUrl).then(img => {
      sourceImageRef.current = img;
      renderPreview();
    });
  }, [sourceDataUrl]);

  // Load cutout image if available
  useEffect(() => {
    if (background.cutoutDataUrl) {
      loadImage(background.cutoutDataUrl).then(img => {
        cutoutImageRef.current = img;
        renderPreview();
      });
    } else {
      cutoutImageRef.current = null;
      renderPreview();
    }
  }, [background.cutoutDataUrl]);

  // Load outfit SVG as image
  useEffect(() => {
    if (selectedOutfit) {
      const item = OUTFIT_CATALOG.find(o => o.id === selectedOutfit.id);
      if (item && item.svgPath) {
        const svgBlob = new Blob([item.svgPath], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        loadImage(url).then(img => {
          outfitImageRef.current = img;
          renderPreview();
        });
      }
    } else {
      outfitImageRef.current = null;
      renderPreview();
    }
  }, [selectedOutfit]);

  // Render composite pipeline
  const renderPreview = () => {
    const canvas = canvasRef.current;
    const img = sourceImageRef.current;
    if (!canvas || !img) return;

    // Base transformed
    const transformed = renderTransformedCanvas(img, {
      rotation,
      fineRotation,
      flipH: false,
      flipV: false,
    });

    // Adjustments
    const adjCtx = transformed.getContext('2d', { willReadFrequently: true });
    if (adjCtx) {
      const imgData = adjCtx.getImageData(0, 0, transformed.width, transformed.height);
      applyAdjustmentsToImageData(imgData, adjustments);
      adjCtx.putImageData(imgData, 0, 0);
      if (adjustments.sharpness > 0) {
        applySharpen(transformed, adjustments.sharpness);
      }
    }

    // Background replacement using AI cutout
    let stage = transformed;
    if (background.isRemoved && cutoutImageRef.current) {
      stage = processBackgroundRemoval(transformed, background, cutoutImageRef.current);
    }

    // Outfit overlay
    if (selectedOutfit && outfitImageRef.current) {
      const outCtx = stage.getContext('2d')!;
      const outfit = outfitImageRef.current;
      const aspect = outfit.naturalWidth / outfit.naturalHeight;
      const targetW = stage.width * selectedOutfit.scale;
      const targetH = targetW / aspect;
      const posX = stage.width * 0.5 - targetW * 0.5 + stage.width * (selectedOutfit.offsetX / 100);
      const posY = stage.height * (selectedOutfit.offsetY / 100);

      outCtx.save();
      outCtx.globalAlpha = selectedOutfit.opacity;
      outCtx.drawImage(outfit, posX, posY, targetW, targetH);
      outCtx.restore();
    }

    // Draw to preview canvas
    canvas.width = stage.width;
    canvas.height = stage.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(stage, 0, 0);
    }
  };

  useEffect(() => {
    renderPreview();
  }, [rotation, fineRotation, adjustments, background, selectedOutfit]);

  // Handle image upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = ev => {
        const res = ev.target?.result as string;
        if (res) {
          setPhotoName(file.name.replace(/\.[^/.]+$/, ''));
          setSourceDataUrl(res);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSelectSample = (url: string, name: string) => {
    loadImage(url).then(img => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const dataUrl = c.toDataURL('image/jpeg', 0.95);
      setPhotoName(name);
      setSourceDataUrl(dataUrl);
    });
  };

  // AI Clarity enhancement
  const handleApplyEnhance = () => {
    if (!canvasRef.current) return;
    setIsEnhancing(true);
    setTimeout(() => {
      const enhanced = applyLocalAIEnhancement(canvasRef.current!, aiStrength);
      const enhancedDataUrl = enhanced.toDataURL('image/png');
      loadImage(enhancedDataUrl).then(newImg => {
        sourceImageRef.current = newImg;
        setSourceDataUrl(enhancedDataUrl);
        setAdjustments(prev => ({
          ...prev,
          brightness: 3,
          contrast: 5,
          sharpness: 12,
        }));
        setIsEnhancing(false);
      });
    }, 50);
  };

  // AI Background removal execution
  const handleRunBackgroundRemoval = async () => {
    const img = sourceImageRef.current;
    if (!img) return;

    setIsRemovingBg(true);
    setBgProgress({ text: 'Initializing IS-Net AI neural model...', pct: 15 });

    try {
      // Pass transformed image to neural background remover
      const baseCanvas = renderTransformedCanvas(img, {
        rotation,
        fineRotation,
        flipH: false,
        flipV: false,
      });

      const cutoutDataUrl = await removeBackgroundWithAI(baseCanvas, (status, pct) => {
        setBgProgress({ text: status, pct });
      });

      setBackground({
        isRemoved: true,
        mode: 'color',
        color: customBgColor || '#A5C9EB',
        model: 'isnet-neural',
        cutoutDataUrl,
      });
    } catch (err) {
      console.error('Failed to remove background:', err);
    } finally {
      setIsRemovingBg(false);
      setBgProgress(null);
    }
  };

  // Final confirmation: crop and add photo to sheet
  const handleConfirmAddPhoto = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Render final cropped image at 300 DPI
    const targetAspect = selectedPreset.ratio;
    let cw = canvas.width * (cropPercent.width / 100);
    let ch = cw / targetAspect;
    if (ch > canvas.height * (cropPercent.height / 100)) {
      ch = canvas.height * (cropPercent.height / 100);
      cw = ch * targetAspect;
    }
    const cx = canvas.width * (cropPercent.x / 100);
    const cy = canvas.height * (cropPercent.y / 100);

    const targetPxW = mmToPixels(selectedPreset.widthMm, 300);
    const targetPxH = mmToPixels(selectedPreset.heightMm, 300);

    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = targetPxW;
    croppedCanvas.height = targetPxH;
    const cropCtx = croppedCanvas.getContext('2d')!;
    cropCtx.imageSmoothingQuality = 'high';
    cropCtx.drawImage(canvas, cx, cy, cw, ch, 0, 0, targetPxW, targetPxH);

    const finalDataUrl = croppedCanvas.toDataURL('image/png', 0.98);

    const newEntry: SheetPhotoEntry = {
      id: 'sheet_photo_' + Date.now(),
      name: photoName || `${selectedPreset.name} Photo`,
      presetName: selectedPreset.name,
      widthMm: selectedPreset.widthMm,
      heightMm: selectedPreset.heightMm,
      dataUrl: finalDataUrl,
      sourceImageSrc: sourceDataUrl || undefined,
      backgroundMode: background.mode,
      backgroundColor: background.color,
    };

    onAddPhoto(newEntry);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-[#0B1020] border border-cyan-500/30 rounded-2xl shadow-2xl overflow-hidden text-slate-100">
        {/* Top Header */}
        <div className="px-5 py-3.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                Add Another Photo to Print Sheet
                <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 bg-cyan-950/80 border border-cyan-500/30 text-cyan-300 rounded">
                  Non-printable
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Prepare and add another passport or portrait photo to print alongside on the same sheet.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Wizard Step Tabs (if image loaded) */}
        {sourceDataUrl && (
          <div className="bg-slate-900/60 border-b border-slate-800 px-4 py-2 flex items-center justify-between gap-2 overflow-x-auto shrink-0">
            {[
              { num: 1, label: '1. Crop & Standard', icon: CropIcon },
              { num: 2, label: '2. AI Enhance', icon: Sparkles },
              { num: 3, label: '3. Neural Background', icon: RefreshCw },
              { num: 4, label: '4. Outfits & Finish', icon: Shirt },
            ].map(s => {
              const Icon = s.icon;
              const isActive = step === s.num;
              return (
                <button
                  key={s.num}
                  onClick={() => setStep(s.num as any)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Body content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {!sourceDataUrl ? (
            /* Upload initial photo state */
            <div className="max-w-xl mx-auto py-8 text-center space-y-6">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-8 border-2 border-dashed border-cyan-500/30 hover:border-cyan-400 rounded-2xl bg-cyan-950/10 hover:bg-cyan-950/20 transition-all cursor-pointer flex flex-col items-center justify-center gap-3 group"
              >
                <div className="w-14 h-14 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Select or Drop New Photo</h3>
                  <p className="text-xs text-slate-400 mt-1">JPEG, PNG or WEBP portrait (up to 25MB)</p>
                </div>
                <button className="mt-2 px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold rounded-lg text-xs transition-colors">
                  Browse Files
                </button>
              </div>

              {/* Sample portraits */}
              <div className="space-y-3 pt-4 border-t border-slate-800">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Or load a demo studio portrait:
                </span>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => handleSelectSample(sampleManImg, 'Studio Portrait (Man)')}
                    className="flex items-center gap-2.5 px-3 py-2 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
                  >
                    <img src={sampleManImg} alt="Man" className="w-7 h-7 rounded-full object-cover border border-slate-600" />
                    <span>Sample Portrait A (Man)</span>
                  </button>
                  <button
                    onClick={() => handleSelectSample(sampleWomanImg, 'Studio Portrait (Woman)')}
                    className="flex items-center gap-2.5 px-3 py-2 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
                  >
                    <img src={sampleWomanImg} alt="Woman" className="w-7 h-7 rounded-full object-cover border border-slate-600" />
                    <span>Sample Portrait B (Woman)</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Multi-step preparation view */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Canvas Preview */}
              <div className="lg:col-span-7 flex flex-col items-center justify-center bg-slate-950 border border-slate-800 rounded-2xl p-4 relative min-h-[360px] overflow-hidden">
                <div className="relative max-w-full max-h-[380px] flex items-center justify-center">
                  <canvas
                    ref={canvasRef}
                    className="max-w-full max-h-[360px] object-contain rounded-lg shadow-2xl border border-slate-800/60"
                  />

                  {/* Crop oval guide overlay for Step 1 */}
                  {step === 1 && (
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div className="w-[70%] h-[75%] border-2 border-dashed border-cyan-400/70 rounded-full flex flex-col items-center justify-between p-2">
                        <span className="text-[10px] text-cyan-300 bg-black/60 px-2 py-0.5 rounded font-mono">
                          Top of Head
                        </span>
                        <span className="text-[10px] text-cyan-300 bg-black/60 px-2 py-0.5 rounded font-mono">
                          Eye Level (32-36mm)
                        </span>
                        <span className="text-[10px] text-cyan-300 bg-black/60 px-2 py-0.5 rounded font-mono">
                          Chin Line
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-3 text-center text-slate-400 text-[11px] flex items-center gap-3">
                  <span>Photo: <strong className="text-white">{photoName}</strong></span>
                  <span>•</span>
                  <span>Preset: <strong className="text-cyan-300">{selectedPreset.name}</strong> ({selectedPreset.widthMm}×{selectedPreset.heightMm}mm)</span>
                </div>
              </div>

              {/* Right Step Controls */}
              <div className="lg:col-span-5 bg-slate-900/40 border border-slate-800 rounded-2xl p-4 space-y-4">
                {/* STEP 1: CROP & PRESET */}
                {step === 1 && (
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-bold text-white text-sm">Step 1: Passport Standards & Crop</h4>
                      <p className="text-[11px] text-slate-400">Choose official country specifications.</p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-slate-300 uppercase">Country Standard</label>
                      <select
                        value={selectedPreset.id}
                        onChange={e => {
                          const p = PASSPORT_PRESETS.find(item => item.id === e.target.value);
                          if (p) setSelectedPreset(p);
                        }}
                        className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-xs font-semibold text-white focus:outline-none focus:border-cyan-400"
                      >
                        {PASSPORT_PRESETS.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} — {p.widthMm}×{p.heightMm}mm
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Rotation */}
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-semibold">Fine Alignment:</span>
                        <span className="font-mono text-cyan-300">{fineRotation}°</span>
                      </div>
                      <input
                        type="range"
                        min="-15"
                        max="15"
                        value={fineRotation}
                        onChange={e => setFineRotation(Number(e.target.value))}
                        className="w-full accent-cyan-400 cursor-pointer"
                      />
                      <button
                        onClick={() => setRotation(r => (r + 90) % 360)}
                        className="w-full py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Rotate 90° Clockwise</span>
                      </button>
                    </div>

                    <button
                      onClick={() => setStep(2)}
                      className="w-full py-2.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md mt-4"
                    >
                      <span>Continue to AI Enhance</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* STEP 2: AI ENHANCE */}
                {step === 2 && (
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-bold text-white text-sm">Step 2: AI Portrait Clarity & Lighting</h4>
                      <p className="text-[11px] text-slate-400">Boost sharpness, balance illumination, and smooth skin naturally.</p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-semibold">Enhancement Strength:</span>
                        <span className="font-mono text-cyan-300">{aiStrength}%</span>
                      </div>
                      <input
                        type="range"
                        min="20"
                        max="100"
                        value={aiStrength}
                        onChange={e => setAiStrength(Number(e.target.value))}
                        className="w-full accent-cyan-400 cursor-pointer"
                      />
                    </div>

                    <button
                      onClick={handleApplyEnhance}
                      disabled={isEnhancing}
                      className="w-full py-2.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
                    >
                      {isEnhancing ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Applying Clarity Filters…</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>Enhance Portrait Now</span>
                        </>
                      )}
                    </button>

                    <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800">
                      <button
                        onClick={() => setStep(1)}
                        className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" /> Back
                      </button>
                      <button
                        onClick={() => setStep(3)}
                        className="flex-1 py-2 px-3 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span>Next: Background</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 3: AI NEURAL BACKGROUND REMOVER */}
                {step === 3 && (
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-bold text-white text-sm">Step 3: AI Neural Background Remover</h4>
                      <p className="text-[11px] text-slate-400">
                        Deep-learning IS-Net model removes any background cleanly while keeping 100% of the subject undisturbed.
                      </p>
                    </div>

                    {/* AI Model Trigger Card */}
                    <div className="p-3.5 bg-cyan-950/20 border border-cyan-500/30 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                          <span className="text-xs font-bold text-cyan-300">Model: IS-Net Neural Matting</span>
                        </div>
                        {background.isRemoved && (
                          <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Extracted
                          </span>
                        )}
                      </div>

                      <button
                        onClick={handleRunBackgroundRemoval}
                        disabled={isRemovingBg}
                        className="w-full py-2.5 px-3 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md disabled:opacity-50"
                      >
                        {isRemovingBg ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                            <span>Processing Salient Matting…</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            <span>{background.isRemoved ? 'Re-run AI Background Removal' : 'Remove Background with AI'}</span>
                          </>
                        )}
                      </button>

                      {/* Live progress indicator */}
                      {isRemovingBg && bgProgress && (
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between text-[10px] text-cyan-300 font-mono">
                            <span>{bgProgress.text}</span>
                            <span>{bgProgress.pct}%</span>
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

                    {/* Backdrop Color Options (when removed) */}
                    {background.isRemoved && (
                      <div className="space-y-3 pt-2">
                        <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block">
                          Select Replacement Backdrop:
                        </span>

                        <div className="grid grid-cols-2 gap-2">
                          {BACKGROUND_PRESET_COLORS.map(c => (
                            <button
                              key={c.id}
                              onClick={() => {
                                setCustomBgColor(c.hex);
                                setBackground(prev => ({
                                  ...prev,
                                  mode: c.hex === 'transparent' ? 'transparent' : 'color',
                                  color: c.hex,
                                }));
                              }}
                              className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all cursor-pointer ${
                                (c.hex === 'transparent' && background.mode === 'transparent') ||
                                (background.mode === 'color' && background.color === c.hex)
                                  ? 'border-cyan-400 bg-cyan-950/30 text-white'
                                  : 'border-slate-800 bg-slate-900/80 text-slate-300 hover:border-slate-700'
                              }`}
                            >
                              <div
                                className="w-4 h-4 rounded border border-slate-600 shrink-0"
                                style={{ backgroundColor: c.hex === 'transparent' ? '#334155' : c.hex }}
                              />
                              <span className="text-[11px] font-medium truncate">{c.label}</span>
                            </button>
                          ))}
                        </div>

                        {/* Custom Color Picker */}
                        <div className="flex items-center gap-2 p-2 bg-slate-900 rounded-lg border border-slate-800">
                          <input
                            type="color"
                            value={customBgColor}
                            onChange={e => {
                              setCustomBgColor(e.target.value);
                              setBackground(prev => ({
                                ...prev,
                                mode: 'color',
                                color: e.target.value,
                              }));
                            }}
                            className="w-8 h-8 rounded border border-slate-700 bg-transparent cursor-pointer"
                          />
                          <span className="text-xs text-slate-300">Custom Color:</span>
                          <span className="font-mono text-cyan-300 text-xs">{customBgColor}</span>
                        </div>

                        <button
                          onClick={() => setBackground(prev => ({ ...prev, isRemoved: false, mode: 'original' }))}
                          className="text-[11px] text-slate-400 hover:text-cyan-300 hover:underline cursor-pointer block"
                        >
                          Revert to original background
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800">
                      <button
                        onClick={() => setStep(2)}
                        className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" /> Back
                      </button>
                      <button
                        onClick={() => setStep(4)}
                        className="flex-1 py-2 px-3 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span>Next: Outfits &amp; Finish</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 4: FORMAL OUTFITS & FINISH */}
                {step === 4 && (
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-bold text-white text-sm">Step 4: Formal Outfits &amp; Add to Sheet</h4>
                      <p className="text-[11px] text-slate-400">Optionally add formal business attire or finish adding photo.</p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-300 uppercase">Attire Overlay</span>
                        {selectedOutfit && (
                          <button
                            onClick={() => setSelectedOutfit(null)}
                            className="text-[10px] text-rose-400 hover:underline cursor-pointer"
                          >
                            Remove Outfit
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                        {OUTFIT_CATALOG.slice(0, 6).map(o => (
                          <button
                            key={o.id}
                            onClick={() => {
                              setSelectedOutfit({
                                id: o.id,
                                name: o.name,
                                category: o.gender === 'Women' ? 'formal_women' : (o.category === 'Traditional' ? 'traditional' : 'formal_men'),
                                scale: o.defaultScale || 0.95,
                                offsetX: 0,
                                offsetY: o.defaultOffsetY || 52,
                                opacity: 1,
                              });
                            }}
                            className={`p-2 rounded-lg border text-left flex items-center gap-2 transition-all cursor-pointer ${
                              selectedOutfit?.id === o.id
                                ? 'border-cyan-400 bg-cyan-950/30 text-white'
                                : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            <div
                              className="w-8 h-8 rounded bg-slate-950 p-0.5 overflow-hidden border border-slate-700 shrink-0"
                              dangerouslySetInnerHTML={{ __html: o.svgPath }}
                            />
                            <span className="text-[11px] font-medium truncate">{o.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Primary Confirmation Action */}
                    <div className="pt-4 border-t border-slate-800 space-y-2">
                      <button
                        onClick={handleConfirmAddPhoto}
                        className="w-full py-3 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-cyan-500/20"
                      >
                        <Check className="w-4 h-4" />
                        <span>Add This Photo to Paper Sheet</span>
                      </button>
                      <button
                        onClick={() => setStep(3)}
                        className="w-full py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg text-xs transition-colors cursor-pointer"
                      >
                        Back to Background Step
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
