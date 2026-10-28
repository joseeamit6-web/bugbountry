import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  ArrowLeft, Download, Printer, RotateCw, Copy, Trash2, 
  Lock, Unlock, RefreshCw, ZoomIn, ZoomOut, CheckCircle2 
} from 'lucide-react';
import { PrintPaperFormat, PrintPhotoItem, PrintSheetConfig } from '../types';
import { PRINT_PAPERS } from '../constants/passportPresets';
import { 
  calculateAutoGridItems, 
  renderPrintSheetCanvas, 
  executeDirectPrint 
} from '../services/printSheet';

interface PrintSheetWorkspaceProps {
  croppedCanvas: HTMLCanvasElement;
  photoWidthMm: number;
  photoHeightMm: number;
  initialConfig: PrintSheetConfig;
  onUpdateConfig: (cfg: PrintSheetConfig) => void;
  onBackToEditor: () => void;
}

export const PrintSheetWorkspace: React.FC<PrintSheetWorkspaceProps> = ({
  croppedCanvas,
  photoWidthMm,
  photoHeightMm,
  initialConfig,
  onUpdateConfig,
  onBackToEditor,
}) => {
  const [config, setConfig] = useState<PrintSheetConfig>(initialConfig);
  const [selectedPaper, setSelectedPaper] = useState<PrintPaperFormat>(() => {
    return PRINT_PAPERS.find(p => p.id === initialConfig.paperId) || PRINT_PAPERS[0];
  });
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [showCutLines, setShowCutLines] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    isDragging: boolean;
    itemId: string | null;
    startX: number;
    startY: number;
    startItemX: number;
    startItemY: number;
  }>({
    isDragging: false,
    itemId: null,
    startX: 0,
    startY: 0,
    startItemX: 0,
    startItemY: 0,
  });

  const paperWidthMm = config.orientation === 'portrait' ? selectedPaper.widthMm : selectedPaper.heightMm;
  const paperHeightMm = config.orientation === 'portrait' ? selectedPaper.heightMm : selectedPaper.widthMm;

  // Memoize photo data URL to prevent repeated costly canvas re-encodings on every state update
  const photoDataUrl = useMemo(() => {
    try {
      if (croppedCanvas && croppedCanvas.width > 0 && croppedCanvas.height > 0) {
        return croppedCanvas.toDataURL('image/png');
      }
    } catch (e) {
      console.warn('Failed to encode cropped canvas data URL:', e);
    }
    return '';
  }, [croppedCanvas]);

  // Auto-fit zoom so the sheet is 100% visible inside the container upon loading
  const handleFitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    if (clientWidth > 50 && clientHeight > 50) {
      const paperPxW = paperWidthMm * 3.78;
      const paperPxH = paperHeightMm * 3.78;
      const padding = 64;
      const scaleX = (clientWidth - padding) / paperPxW;
      const scaleY = (clientHeight - padding) / paperPxH;
      const optimalFit = Math.min(scaleX, scaleY, 0.95);
      if (optimalFit > 0) {
        setZoom(Math.max(0.2, Math.min(1.5, Number(optimalFit.toFixed(2)))));
      }
    }
  }, [paperWidthMm, paperHeightMm]);

  // Run auto-fit on initial mount and on paper/orientation change
  useEffect(() => {
    const timer = setTimeout(() => {
      handleFitToScreen();
    }, 50);
    window.addEventListener('resize', handleFitToScreen);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleFitToScreen);
    };
  }, [selectedPaper.id, config.orientation, handleFitToScreen]);

  // Direct print shortcut listener (Ctrl+P / Cmd+P)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        executeDirectPrint(config, selectedPaper, croppedCanvas);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [config, selectedPaper, croppedCanvas]);

  // Initialize or re-calculate auto grid if items are empty or paper/copies changed
  useEffect(() => {
    if (config.autoGrid || config.items.length === 0) {
      const items = calculateAutoGridItems(
        selectedPaper,
        config.orientation,
        photoWidthMm,
        photoHeightMm,
        config.copies,
        config.marginMm,
        config.gapMm
      );
      const newConfig = { ...config, items };
      setConfig(newConfig);
      onUpdateConfig(newConfig);
    }
  }, [selectedPaper.id, config.orientation, config.copies, config.marginMm, config.gapMm, config.autoGrid, photoWidthMm, photoHeightMm]);

  const handlePaperChange = (paperId: string) => {
    const p = PRINT_PAPERS.find(item => item.id === paperId) || PRINT_PAPERS[0];
    setSelectedPaper(p);
    const newCfg = { ...config, paperId: p.id };
    setConfig(newCfg);
    onUpdateConfig(newCfg);
  };

  const handleOrientationToggle = () => {
    const newOri = config.orientation === 'portrait' ? 'landscape' : 'portrait';
    const newCfg = { ...config, orientation: newOri as 'portrait' | 'landscape' };
    setConfig(newCfg);
    onUpdateConfig(newCfg);
  };

  const handleCopiesChange = (val: number) => {
    const count = Math.max(1, Math.min(48, val));
    const newCfg = { ...config, copies: count, autoGrid: true };
    setConfig(newCfg);
    onUpdateConfig(newCfg);
  };

  const handleItemRotate = (id: string) => {
    const newItems = config.items.map(item => {
      if (item.id === id) {
        return { ...item, rotation: (item.rotation + 90) % 360 };
      }
      return item;
    });
    const newCfg = { ...config, items: newItems, autoGrid: false };
    setConfig(newCfg);
    onUpdateConfig(newCfg);
  };

  const handleItemDuplicate = (id: string) => {
    const target = config.items.find(i => i.id === id);
    if (!target) return;
    const newItem: PrintPhotoItem = {
      ...target,
      id: 'photo_copy_' + Date.now(),
      xMm: Math.min(paperWidthMm - photoWidthMm - 5, target.xMm + 6),
      yMm: Math.min(paperHeightMm - photoHeightMm - 5, target.yMm + 6),
      locked: false,
    };
    const newItems = [...config.items, newItem];
    const newCfg = { ...config, items: newItems, copies: newItems.length, autoGrid: false };
    setConfig(newCfg);
    onUpdateConfig(newCfg);
    setSelectedItemId(newItem.id);
  };

  const handleItemDelete = (id: string) => {
    const newItems = config.items.filter(i => i.id !== id);
    const newCfg = { ...config, items: newItems, copies: newItems.length, autoGrid: false };
    setConfig(newCfg);
    onUpdateConfig(newCfg);
    setSelectedItemId(null);
  };

  const handleItemLockToggle = (id: string) => {
    const newItems = config.items.map(i => i.id === id ? { ...i, locked: !i.locked } : i);
    const newCfg = { ...config, items: newItems };
    setConfig(newCfg);
    onUpdateConfig(newCfg);
  };

  const handleResetAutoGrid = () => {
    const items = calculateAutoGridItems(
      selectedPaper,
      config.orientation,
      photoWidthMm,
      photoHeightMm,
      config.copies,
      config.marginMm,
      config.gapMm
    );
    const newCfg = { ...config, items, autoGrid: true };
    setConfig(newCfg);
    onUpdateConfig(newCfg);
  };

  // Mouse / Touch Drag handlers for manual positioning
  const handlePointerDown = (e: React.PointerEvent, item: PrintPhotoItem) => {
    if (item.locked) return;
    e.stopPropagation();
    setSelectedItemId(item.id);
    dragRef.current = {
      isDragging: true,
      itemId: item.id,
      startX: e.clientX,
      startY: e.clientY,
      startItemX: item.xMm,
      startItemY: item.yMm,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.isDragging || !dragRef.current.itemId) return;
    const { itemId, startX, startY, startItemX, startItemY } = dragRef.current;

    // Convert pixel delta to millimeters on sheet preview
    const sheetElement = document.getElementById('print-sheet-paper-preview');
    if (!sheetElement) return;

    const rect = sheetElement.getBoundingClientRect();
    const mmPerPixelX = paperWidthMm / rect.width;
    const mmPerPixelY = paperHeightMm / rect.height;

    const deltaMmX = (e.clientX - startX) * mmPerPixelX;
    const deltaMmY = (e.clientY - startY) * mmPerPixelY;

    let nextX = startItemX + deltaMmX;
    let nextY = startItemY + deltaMmY;

    // Keep within paper boundaries
    nextX = Math.max(0, Math.min(paperWidthMm - photoWidthMm, nextX));
    nextY = Math.max(0, Math.min(paperHeightMm - photoHeightMm, nextY));

    // Optional snap-to-grid (3mm snap)
    const snap = 2;
    nextX = Math.round(nextX / snap) * snap;
    nextY = Math.round(nextY / snap) * snap;

    const newItems = config.items.map(item => {
      if (item.id === itemId) {
        return { ...item, xMm: Number(nextX.toFixed(2)), yMm: Number(nextY.toFixed(2)) };
      }
      return item;
    });

    setConfig(prev => ({ ...prev, items: newItems, autoGrid: false }));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragRef.current.isDragging) {
      dragRef.current.isDragging = false;
      dragRef.current.itemId = null;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      onUpdateConfig(config);
    }
  };

  // High-Res Sheet Download (300 DPI)
  const handleDownloadSheet = (format: 'png' | 'jpeg') => {
    setIsExporting(true);
    setTimeout(() => {
      try {
        const canvas = renderPrintSheetCanvas(config, selectedPaper, croppedCanvas, 300, showCutLines);
        const link = document.createElement('a');
        link.download = `photo-studio-print-sheet-${selectedPaper.id}-${Date.now()}.${format === 'png' ? 'png' : 'jpg'}`;
        link.href = canvas.toDataURL(format === 'png' ? 'image/png' : 'image/jpeg', 0.98);
        link.click();
      } catch (err) {
        console.error('Failed to download sheet:', err);
      } finally {
        setIsExporting(false);
      }
    }, 50);
  };

  const handlePrint = () => {
    executeDirectPrint(config, selectedPaper, croppedCanvas);
  };

  return (
    <div className="w-full flex-1 flex flex-col bg-[#0B1020] text-slate-100 overflow-hidden">
      {/* Top action toolbar */}
      <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToEditor}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Editor</span>
          </button>
          <div className="h-4 w-px bg-slate-700 hidden sm:block" />
          <span className="text-xs font-semibold text-white">
            Print Sheet Generator (300 DPI)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleDownloadSheet('png')}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Download PNG</span>
          </button>

          <button
            onClick={() => handleDownloadSheet('jpeg')}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Download JPG</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-[#0B1020] bg-cyan-300 hover:bg-cyan-200 active:scale-95 rounded-lg transition-all shadow-md cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Sheet</span>
          </button>
        </div>
      </div>

      {/* Main split: Left controls panel & Right print sheet preview */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden w-full">
        {/* Controls Sidebar: Order 2 on mobile, Order 1 on desktop */}
        <div className="order-2 lg:order-1 flex-1 lg:flex-initial lg:w-80 min-h-0 lg:h-full bg-slate-900/70 border-t lg:border-t-0 lg:border-r border-slate-800 p-4 overflow-y-auto space-y-4 text-xs shrink-0">
          {/* Paper Format */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Paper Format
            </label>
            <div className="space-y-1.5">
              {PRINT_PAPERS.map(p => (
                <button
                  key={p.id}
                  onClick={() => handlePaperChange(p.id)}
                  className={`w-full text-left p-2.5 rounded-lg border transition-all cursor-pointer ${
                    selectedPaper.id === p.id
                      ? 'border-cyan-400 bg-cyan-950/20 text-white'
                      : 'border-slate-800 bg-slate-800/40 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{p.name}</span>
                    {selectedPaper.id === p.id && <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />}
                  </div>
                  <span className="text-[11px] text-slate-400 block pt-0.5">{p.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Orientation & Copies */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Orientation
              </label>
              <button
                onClick={handleOrientationToggle}
                className="w-full py-2 px-3 bg-slate-800 border border-slate-700 hover:border-cyan-400 rounded-lg text-slate-200 capitalize font-medium transition-colors cursor-pointer"
              >
                {config.orientation}
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Total Copies
              </label>
              <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => handleCopiesChange(config.copies - 1)}
                  className="px-2.5 py-1.5 text-slate-300 hover:text-white hover:bg-slate-700 cursor-pointer"
                >
                  -
                </button>
                <span className="flex-1 text-center font-mono font-semibold text-white">
                  {config.items.length}
                </span>
                <button
                  onClick={() => handleCopiesChange(config.copies + 1)}
                  className="px-2.5 py-1.5 text-slate-300 hover:text-white hover:bg-slate-700 cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Spacing & Margins */}
          <div className="space-y-3 pt-1 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Sheet Margin:</span>
              <span className="font-mono text-cyan-300 font-semibold">{config.marginMm} mm</span>
            </div>
            <input
              type="range"
              min="0"
              max="25"
              step="1"
              value={config.marginMm}
              onChange={e => {
                const newCfg = { ...config, marginMm: Number(e.target.value) };
                setConfig(newCfg);
                onUpdateConfig(newCfg);
              }}
              className="w-full accent-cyan-400 cursor-pointer"
            />

            <div className="flex items-center justify-between">
              <span className="text-slate-400">Photo Spacing (Gap):</span>
              <span className="font-mono text-cyan-300 font-semibold">{config.gapMm} mm</span>
            </div>
            <input
              type="range"
              min="0"
              max="15"
              step="1"
              value={config.gapMm}
              onChange={e => {
                const newCfg = { ...config, gapMm: Number(e.target.value) };
                setConfig(newCfg);
                onUpdateConfig(newCfg);
              }}
              className="w-full accent-cyan-400 cursor-pointer"
            />
          </div>

          {/* Cutting Guides & Layout mode */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <label className="flex items-center gap-2 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={showCutLines}
                onChange={e => setShowCutLines(e.target.checked)}
                className="rounded border-slate-700 accent-cyan-400"
              />
              <span>Show hairline cutting borders</span>
            </label>

            <button
              onClick={handleResetAutoGrid}
              className="w-full mt-2 flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3 h-3 text-cyan-400" />
              <span>Reset Auto Grid</span>
            </button>
          </div>

          {/* Selected Photo Actions */}
          {selectedItemId && (
            <div className="p-3 bg-slate-800/80 border border-cyan-500/30 rounded-xl space-y-2">
              <span className="text-[11px] font-semibold text-cyan-300 uppercase tracking-wider block">
                Selected Photo Copy
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleItemRotate(selectedItemId)}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-200 cursor-pointer"
                  title="Rotate 90 degrees"
                >
                  <RotateCw className="w-3 h-3" />
                  <span>Rotate</span>
                </button>
                <button
                  onClick={() => handleItemDuplicate(selectedItemId)}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-200 cursor-pointer"
                  title="Duplicate copy"
                >
                  <Copy className="w-3 h-3" />
                  <span>Duplicate</span>
                </button>
                <button
                  onClick={() => handleItemLockToggle(selectedItemId)}
                  className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-200 cursor-pointer"
                  title="Lock position"
                >
                  {config.items.find(i => i.id === selectedItemId)?.locked ? (
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <Unlock className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  onClick={() => handleItemDelete(selectedItemId)}
                  className="p-1.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 rounded text-rose-300 cursor-pointer"
                  title="Delete copy"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg text-[11px] text-slate-400 space-y-1">
            <p className="font-semibold text-slate-300">💡 Drag &amp; Drop Tip</p>
            <p>Click and drag any photo on the sheet to reposition it manually. When printing, select 100% scale in your printer dialog.</p>
          </div>
        </div>

        {/* Right Side: Interactive Print Sheet Preview Canvas: Order 1 on mobile, Order 2 on desktop */}
        <div
          ref={containerRef}
          className="order-1 lg:order-2 h-[48vh] sm:h-[55vh] lg:h-full lg:flex-1 shrink-0 lg:shrink bg-slate-950 p-4 sm:p-8 overflow-auto flex flex-col relative select-none border-b lg:border-b-0 border-slate-800"
        >
          {/* Zoom controls floating */}
          <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1.5 bg-slate-900/95 border border-slate-700/80 p-1.5 rounded-xl backdrop-blur-md shadow-2xl">
            <button
              onClick={handleFitToScreen}
              className="px-2 py-1 text-[11px] font-semibold text-cyan-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Fit entire sheet in view"
            >
              Fit Sheet
            </button>
            <button
              onClick={() => setZoom(1)}
              className="px-1.5 py-1 text-[11px] font-mono text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="100% Print Size"
            >
              100%
            </button>
            <div className="h-3 w-px bg-slate-700 mx-0.5" />
            <button
              onClick={() => setZoom(z => Math.max(0.2, Number((z - 0.1).toFixed(2))))}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 text-xs font-mono text-cyan-300 font-semibold min-w-[42px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(z => Math.min(2.5, Number((z + 0.1).toFixed(2))))}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Centering wrapper with m-auto so photos never lie above screen and can scroll completely */}
          <div className="m-auto shrink-0 flex items-center justify-center py-6">
            <div
              id="print-sheet-paper-preview"
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              style={{
                width: `${paperWidthMm * 3.78 * zoom}px`,
                height: `${paperHeightMm * 3.78 * zoom}px`,
                backgroundColor: '#FFFFFF',
                position: 'relative',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.12)',
                transition: dragRef.current.isDragging ? 'none' : 'width 0.1s ease, height 0.1s ease',
              }}
              className="rounded-sm overflow-hidden touch-none"
            >
              {/* Margin border guide */}
              <div
                style={{
                  position: 'absolute',
                  left: `${(config.marginMm / paperWidthMm) * 100}%`,
                  top: `${(config.marginMm / paperHeightMm) * 100}%`,
                  right: `${(config.marginMm / paperWidthMm) * 100}%`,
                  bottom: `${(config.marginMm / paperHeightMm) * 100}%`,
                  border: '1px dashed #CBD5E1',
                  pointerEvents: 'none',
                }}
              />

              {/* Rendered Photos on Sheet */}
              {config.items.map(item => {
                const leftPct = (item.xMm / paperWidthMm) * 100;
                const topPct = (item.yMm / paperHeightMm) * 100;
                const widthPct = (item.widthMm / paperWidthMm) * 100;
                const heightPct = (item.heightMm / paperHeightMm) * 100;
                const isSelected = selectedItemId === item.id;

                return (
                  <div
                    key={item.id}
                    onPointerDown={e => handlePointerDown(e, item)}
                    style={{
                      position: 'absolute',
                      left: `${leftPct}%`,
                      top: `${topPct}%`,
                      width: `${widthPct}%`,
                      height: `${heightPct}%`,
                      transform: `rotate(${item.rotation}deg)`,
                      cursor: item.locked ? 'default' : 'grab',
                      zIndex: isSelected ? 10 : 1,
                    }}
                    className={`group transition-shadow ${
                      isSelected ? 'ring-2 ring-cyan-500 shadow-lg' : 'hover:ring-1 hover:ring-cyan-300'
                    }`}
                  >
                    {photoDataUrl ? (
                      <img
                        src={photoDataUrl}
                        alt="Passport copy"
                        draggable={false}
                        className="w-full h-full object-cover block pointer-events-none"
                        style={{
                          border: showCutLines ? '1px solid #D1D5DB' : 'none',
                        }}
                      />
                    ) : (
                      <div className="w-full h-full bg-slate-200 flex items-center justify-center text-[10px] text-slate-500">
                        Photo
                      </div>
                    )}

                    {/* Corner indicator badge when selected */}
                    {isSelected && (
                      <div className="absolute top-1 right-1 bg-cyan-500 text-[#0B1020] text-[9px] font-bold px-1 rounded shadow">
                        {item.widthMm}×{item.heightMm}mm
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
