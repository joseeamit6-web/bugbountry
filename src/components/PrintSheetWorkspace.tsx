import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  ArrowLeft, Download, Printer, RotateCw, Copy, Trash2, 
  Lock, Unlock, RefreshCw, ZoomIn, ZoomOut, CheckCircle2,
  Plus, ImageIcon, Maximize2, Users, User, ExternalLink
} from 'lucide-react';
import { PrintPaperFormat, PrintPhotoItem, PrintSheetConfig, SheetPhotoEntry, StudioPerson } from '../types';
import { PRINT_PAPERS } from '../constants/passportPresets';
import { 
  calculateAutoGridItems, 
  calculateMultiPersonGrid,
  MultiPersonGridEntry,
  renderPrintSheetCanvas, 
  executeDirectPrint 
} from '../services/printSheet';
import { loadImage } from '../services/imageProcessing';
import { AddSheetPhotoModal } from './AddSheetPhotoModal';

interface PrintSheetWorkspaceProps {
  croppedCanvas: HTMLCanvasElement;
  photoWidthMm: number;
  photoHeightMm: number;
  initialConfig: PrintSheetConfig;
  onUpdateConfig: (cfg: PrintSheetConfig) => void;
  onBackToEditor: () => void;
  sheetPhotos?: SheetPhotoEntry[];
  onAddSheetPhoto?: (photo: SheetPhotoEntry) => void;
  onRemoveSheetPhoto?: (photoId: string) => void;
  people?: StudioPerson[];
  activePersonId?: string;
  onSelectPersonToEdit?: (personId: string) => void;
  personCanvasesMap?: Record<string, HTMLCanvasElement>;
}

export const PrintSheetWorkspace: React.FC<PrintSheetWorkspaceProps> = ({
  croppedCanvas,
  photoWidthMm,
  photoHeightMm,
  initialConfig,
  onUpdateConfig,
  onBackToEditor,
  sheetPhotos = [],
  onAddSheetPhoto,
  onRemoveSheetPhoto,
  people = [],
  activePersonId,
  onSelectPersonToEdit,
  personCanvasesMap = {},
}) => {
  const [config, setConfig] = useState<PrintSheetConfig>(initialConfig);
  const [selectedPaper, setSelectedPaper] = useState<PrintPaperFormat>(() => {
    return PRINT_PAPERS.find(p => p.id === initialConfig.paperId) || PRINT_PAPERS[0];
  });
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.8);
  const [isExporting, setIsExporting] = useState(false);
  const [showCutLines, setShowCutLines] = useState(true);
  const [isAddPhotoModalOpen, setIsAddPhotoModalOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const photoImagesMapRef = useRef<Record<string, HTMLImageElement | HTMLCanvasElement>>({});

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

  // Main photo data URL for primary fallback
  const mainPhotoDataUrl = useMemo(() => {
    try {
      return croppedCanvas.toDataURL();
    } catch {
      return '';
    }
  }, [croppedCanvas]);

  // Synchronize personCanvasesMap into photoImagesMapRef
  useEffect(() => {
    Object.entries(personCanvasesMap).forEach(([id, canvas]) => {
      photoImagesMapRef.current[id] = canvas;
    });
  }, [personCanvasesMap]);

  // Preload additional photo image elements for high-res canvas rendering
  useEffect(() => {
    sheetPhotos.forEach(p => {
      if (!photoImagesMapRef.current[p.id]) {
        loadImage(p.dataUrl).then(img => {
          photoImagesMapRef.current[p.id] = img;
        });
      }
    });
  }, [sheetPhotos]);

  // Unified list of people & additional photos
  const unifiedEntries = useMemo(() => {
    const list: Array<{
      id: string;
      name: string;
      widthMm: number;
      heightMm: number;
      dataUrl?: string;
      isProjectPerson: boolean;
    }> = [];

    if (people && people.length > 0) {
      people.forEach(p => {
        const customCanvas = personCanvasesMap[p.id];
        const dataUrl = customCanvas ? customCanvas.toDataURL() : (p.id === activePersonId ? mainPhotoDataUrl : p.imageSrc);
        list.push({
          id: p.id,
          name: p.name || 'Person',
          widthMm: p.widthMm || photoWidthMm,
          heightMm: p.heightMm || photoHeightMm,
          dataUrl,
          isProjectPerson: true,
        });
      });
    } else {
      list.push({
        id: 'primary',
        name: 'Primary Photo',
        widthMm: photoWidthMm,
        heightMm: photoHeightMm,
        dataUrl: mainPhotoDataUrl,
        isProjectPerson: true,
      });
    }

    sheetPhotos.forEach(sp => {
      list.push({
        id: sp.id,
        name: sp.name,
        widthMm: sp.widthMm,
        heightMm: sp.heightMm,
        dataUrl: sp.dataUrl,
        isProjectPerson: false,
      });
    });

    return list;
  }, [people, activePersonId, personCanvasesMap, mainPhotoDataUrl, photoWidthMm, photoHeightMm, sheetPhotos]);

  // Dynamic automatic fit-to-screen calculator
  const computeFitZoom = useCallback(() => {
    if (!containerRef.current) return;
    const paddingX = 48;
    const paddingY = 48;
    const availW = Math.max(120, containerRef.current.clientWidth - paddingX);
    const availH = Math.max(120, containerRef.current.clientHeight - paddingY);

    const basePaperW = paperWidthMm * 3.78;
    const basePaperH = paperHeightMm * 3.78;

    const scale = Math.min(availW / basePaperW, availH / basePaperH);
    const safeFit = Math.max(0.15, Math.min(1.2, Number(scale.toFixed(2))));
    setZoom(safeFit);
  }, [paperWidthMm, paperHeightMm]);

  // Auto-fit on initial mount, paper change, orientation change, or container resize
  useEffect(() => {
    computeFitZoom();
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      computeFitZoom();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [computeFitZoom]);

  // Pack all unified entries into the print sheet
  const autoPackMultiPersonGrid = (updatedCopiesMap?: Record<string, number>) => {
    const currentCounts = { ...copiesPerEntry, ...(updatedCopiesMap || {}) };

    const gridEntries: MultiPersonGridEntry[] = unifiedEntries.map(entry => ({
      id: entry.id,
      name: entry.name,
      widthMm: entry.widthMm,
      heightMm: entry.heightMm,
      copies: currentCounts[entry.id] ?? 2,
    }));

    const items = calculateMultiPersonGrid(
      selectedPaper,
      config.orientation,
      gridEntries,
      config.marginMm,
      config.gapMm
    );

    const newCfg = {
      ...config,
      items,
      copies: items.length,
      autoGrid: true,
    };
    setConfig(newCfg);
    onUpdateConfig(newCfg);
  };

  // Keep track of copies per entry
  const [copiesPerEntry, setCopiesPerEntry] = useState<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    if (unifiedEntries.length === 1) {
      counts[unifiedEntries[0].id] = config.copies || 6;
    } else {
      unifiedEntries.forEach((e, idx) => {
        counts[e.id] = idx === 0 ? 4 : 2;
      });
    }
    return counts;
  });

  // Initialize auto grid if items are empty
  useEffect(() => {
    if (config.items.length === 0) {
      if (unifiedEntries.length > 1) {
        autoPackMultiPersonGrid();
      } else {
        const items = calculateAutoGridItems(
          selectedPaper,
          config.orientation,
          photoWidthMm,
          photoHeightMm,
          config.copies || 6,
          config.marginMm,
          config.gapMm
        );
        const newConfig = { ...config, items };
        setConfig(newConfig);
        onUpdateConfig(newConfig);
      }
    }
  }, [selectedPaper.id, config.orientation]);

  const handlePaperChange = (paperId: string) => {
    const p = PRINT_PAPERS.find(item => item.id === paperId) || PRINT_PAPERS[0];
    setSelectedPaper(p);
    const newCfg = { ...config, paperId: p.id };
    setConfig(newCfg);
    onUpdateConfig(newCfg);
    setTimeout(computeFitZoom, 50);
  };

  const handleOrientationToggle = () => {
    const newOri = config.orientation === 'portrait' ? 'landscape' : 'portrait';
    const newCfg = { ...config, orientation: newOri as 'portrait' | 'landscape' };
    setConfig(newCfg);
    onUpdateConfig(newCfg);
    setTimeout(computeFitZoom, 50);
  };

  const handleCopiesChangeForEntry = (entryId: string, count: number) => {
    const safeCount = Math.max(0, Math.min(36, count));
    const nextMap = { ...copiesPerEntry, [entryId]: safeCount };
    setCopiesPerEntry(nextMap);
    autoPackMultiPersonGrid(nextMap);
  };

  const handleTotalCopiesChange = (val: number) => {
    const count = Math.max(1, Math.min(48, val));
    const items = calculateAutoGridItems(
      selectedPaper,
      config.orientation,
      photoWidthMm,
      photoHeightMm,
      count,
      config.marginMm,
      config.gapMm
    );
    const newCfg = { ...config, copies: count, items, autoGrid: true };
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
      xMm: Math.min(paperWidthMm - target.widthMm - 5, target.xMm + 6),
      yMm: Math.min(paperHeightMm - target.heightMm - 5, target.yMm + 6),
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
    if (unifiedEntries.length > 1) {
      autoPackMultiPersonGrid();
    } else {
      const items = calculateAutoGridItems(
        selectedPaper,
        config.orientation,
        photoWidthMm,
        photoHeightMm,
        config.copies || 6,
        config.marginMm,
        config.gapMm
      );
      const newCfg = { ...config, items, autoGrid: true };
      setConfig(newCfg);
      onUpdateConfig(newCfg);
    }
  };

  // Add sheet photo handler
  const handleAddPhotoFromModal = (photoEntry: SheetPhotoEntry) => {
    onAddSheetPhoto?.(photoEntry);
    setIsAddPhotoModalOpen(false);

    // Preload into map
    loadImage(photoEntry.dataUrl).then(img => {
      photoImagesMapRef.current[photoEntry.id] = img;
    });

    const nextCounts = { ...copiesPerEntry, [photoEntry.id]: 2 };
    setCopiesPerEntry(nextCounts);
    autoPackMultiPersonGrid(nextCounts);
  };

  // Pointer drag for manual rearrangement on sheet
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

    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.isDragging || !dragRef.current.itemId) return;

    const { itemId, startX, startY, startItemX, startItemY } = dragRef.current;
    const sheetElement = document.getElementById('print-sheet-paper-preview');
    if (!sheetElement) return;

    const currentItem = config.items.find(i => i.id === itemId);
    const itemW = currentItem ? currentItem.widthMm : photoWidthMm;
    const itemH = currentItem ? currentItem.heightMm : photoHeightMm;

    const rect = sheetElement.getBoundingClientRect();
    const mmPerPixelX = paperWidthMm / rect.width;
    const mmPerPixelY = paperHeightMm / rect.height;

    const deltaMmX = (e.clientX - startX) * mmPerPixelX;
    const deltaMmY = (e.clientY - startY) * mmPerPixelY;

    let nextX = startItemX + deltaMmX;
    let nextY = startItemY + deltaMmY;

    // Keep within paper boundaries
    nextX = Math.max(0, Math.min(paperWidthMm - itemW, nextX));
    nextY = Math.max(0, Math.min(paperHeightMm - itemH, nextY));

    // Snap to 2mm grid
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
        const canvas = renderPrintSheetCanvas(
          config,
          selectedPaper,
          croppedCanvas,
          300,
          showCutLines,
          photoImagesMapRef.current
        );
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
    executeDirectPrint(config, selectedPaper, croppedCanvas, photoImagesMapRef.current);
  };

  return (
    <div className="w-full flex-1 flex flex-col bg-[#0B1020] text-slate-100 overflow-hidden">
      {/* Top action toolbar */}
      <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToEditor}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Editor</span>
          </button>
          <div className="h-4 w-px bg-slate-700 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white">
              Print Sheet Generator
            </span>
            <span className="text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded font-mono">
              300 DPI
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Add Image/Person Button (Non-printable) */}
          <button
            type="button"
            data-non-printable="true"
            onClick={() => setIsAddPhotoModalOpen(true)}
            className="print:hidden flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 active:scale-95 rounded-lg transition-all shadow-md cursor-pointer"
            title="Add another person's photo onto this sheet (Non-printable button)"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Person / Photo</span>
            <span className="text-[9px] uppercase px-1.5 py-0.2 bg-slate-950/20 text-slate-950 rounded font-mono font-normal">
              Non-printable
            </span>
          </button>

          <button
            onClick={() => handleDownloadSheet('png')}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Download</span> PNG
          </button>

          <button
            onClick={() => handleDownloadSheet('jpeg')}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Download</span> JPG
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-[#0B1020] bg-cyan-300 hover:bg-cyan-200 active:scale-95 rounded-lg transition-all shadow-md cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Sheet</span>
          </button>
        </div>
      </div>

      {/* Main split: Left controls panel & Right print sheet preview */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden w-full">
        {/* Controls Sidebar */}
        <div className="order-2 lg:order-1 flex-1 lg:flex-initial lg:w-88 min-h-0 lg:h-full bg-slate-900/70 border-t lg:border-t-0 lg:border-r border-slate-800 p-4 overflow-y-auto space-y-4 text-xs shrink-0">
          
          {/* Multiple People & Photos Manager on Sheet */}
          <div className="p-3 bg-cyan-950/20 border border-cyan-500/30 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                People on this Sheet ({unifiedEntries.length})
              </span>
              <button
                type="button"
                data-non-printable="true"
                onClick={() => setIsAddPhotoModalOpen(true)}
                className="print:hidden text-[11px] text-cyan-300 hover:text-white font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Add Person
              </button>
            </div>

            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {unifiedEntries.map(entry => {
                const count = config.items.filter(i => (i.photoId || 'primary') === entry.id || (!i.photoId && entry.id === (activePersonId || 'primary'))).length;
                return (
                  <div key={entry.id} className="p-2 bg-slate-900/90 border border-slate-800 rounded-lg flex items-center justify-between gap-2 hover:border-slate-700 transition-colors">
                    <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
                      {entry.dataUrl ? (
                        <img 
                          src={entry.dataUrl} 
                          alt={entry.name} 
                          className="w-8 h-8 rounded object-cover border border-slate-700 shrink-0" 
                        />
                      ) : (
                        <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                          <User className="w-4 h-4" />
                        </div>
                      )}
                      <div className="overflow-hidden min-w-0">
                        <span className="font-semibold text-white text-[11px] block truncate">{entry.name}</span>
                        <span className="text-[10px] text-slate-400 block font-mono">{entry.widthMm}×{entry.heightMm}mm</span>
                      </div>
                    </div>

                    {/* Copies counter controls for each person */}
                    <div className="flex items-center gap-1 shrink-0">
                      {entry.isProjectPerson && onSelectPersonToEdit && (
                        <button
                          onClick={() => onSelectPersonToEdit(entry.id)}
                          className="p-1 text-slate-400 hover:text-cyan-300 rounded cursor-pointer"
                          title="Fine-tune crop, background, or retouch in editor"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <div className="flex items-center bg-slate-800 border border-slate-700 rounded overflow-hidden">
                        <button
                          onClick={() => handleCopiesChangeForEntry(entry.id, count - 1)}
                          className="px-2 py-0.5 text-slate-300 hover:text-white hover:bg-slate-700 cursor-pointer"
                          title="Decrease copies"
                        >
                          -
                        </button>
                        <span className="px-2 font-mono font-bold text-white text-[11px]">
                          {count}
                        </span>
                        <button
                          onClick={() => handleCopiesChangeForEntry(entry.id, count + 1)}
                          className="px-2 py-0.5 text-slate-300 hover:text-white hover:bg-slate-700 cursor-pointer"
                          title="Increase copies"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-cyan-500/20">
              <span>Total Photos on Sheet:</span>
              <span className="font-mono text-cyan-300 font-bold">{config.items.length} copies</span>
            </div>
          </div>

          {/* Paper Format Selection */}
          <div className="space-y-2">
            <span className="font-semibold uppercase tracking-wider text-slate-400 text-[11px] block">
              Paper Format
            </span>
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

          {/* Orientation & Total copies */}
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
                  onClick={() => handleTotalCopiesChange(config.copies - 1)}
                  className="px-2.5 py-1.5 text-slate-300 hover:text-white hover:bg-slate-700 cursor-pointer"
                >
                  -
                </button>
                <span className="flex-1 text-center font-mono font-semibold text-white">
                  {config.items.length}
                </span>
                <button
                  onClick={() => handleTotalCopiesChange(config.copies + 1)}
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
              <span className="text-slate-400">Photo Gap:</span>
              <span className="font-mono text-cyan-300 font-semibold">{config.gapMm} mm</span>
            </div>
            <input
              type="range"
              min="0"
              max="20"
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

          {/* Cut lines & Reset */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <label className="flex items-center gap-2 cursor-pointer text-slate-300 select-none">
              <input
                type="checkbox"
                checked={showCutLines}
                onChange={e => setShowCutLines(e.target.checked)}
                className="rounded accent-cyan-400"
              />
              <span>Show hairline cutting borders</span>
            </label>

            <button
              onClick={handleResetAutoGrid}
              className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg font-medium text-slate-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
              <span>Pack Grid (Auto Arrange)</span>
            </button>
          </div>

          {/* Selected Item Editor Box */}
          {selectedItemId && (
            <div className="p-3 bg-cyan-950/30 border border-cyan-500/40 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-cyan-300 font-semibold text-[11px] uppercase tracking-wider">
                  Selected Photo Copy
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {config.items.find(i => i.id === selectedItemId)?.widthMm}×
                  {config.items.find(i => i.id === selectedItemId)?.heightMm}mm
                </span>
              </div>
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
                    <Unlock className="w-3.5 h-3.5 text-slate-400" />
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
        </div>

        {/* Right Side: Interactive Print Sheet Preview Canvas (Full Visibility with Auto-Fit) */}
        <div
          ref={containerRef}
          className="order-1 lg:order-2 flex-1 min-h-[460px] lg:min-h-0 w-full bg-slate-950 p-4 sm:p-8 flex items-center justify-center overflow-auto relative select-none border-b lg:border-b-0 border-slate-800"
        >
          {/* Zoom & Fit controls floating */}
          <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 p-1.5 rounded-xl backdrop-blur-md shadow-xl">
            <button
              onClick={() => setZoom(z => Math.max(0.2, Number((z - 0.1).toFixed(2))))}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded cursor-pointer"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 text-xs font-mono text-cyan-300 font-semibold">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(z => Math.min(2.5, Number((z + 0.1).toFixed(2))))}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded cursor-pointer"
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <div className="h-4 w-px bg-slate-700" />
            <button
              onClick={computeFitZoom}
              className="px-2 py-1 text-xs font-semibold text-cyan-300 hover:text-white hover:bg-slate-800 rounded flex items-center gap-1 cursor-pointer"
              title="Fit entire paper preview into window"
            >
              <Maximize2 className="w-3 h-3" />
              <span>Fit</span>
            </button>
            <button
              onClick={() => setZoom(1.0)}
              className="px-2 py-1 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 rounded cursor-pointer"
              title="Actual 100% scale"
            >
              100%
            </button>
          </div>

          {/* Paper Sheet Representation */}
          <div
            id="print-sheet-paper-preview"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{
              width: `${paperWidthMm * 3.78 * zoom}px`,
              height: `${paperHeightMm * 3.78 * zoom}px`,
              backgroundColor: '#FFFFFF',
              position: 'relative',
              boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.1)',
              transition: 'width 0.12s ease-out, height 0.12s ease-out',
            }}
            className="rounded-sm overflow-hidden touch-none shrink-0"
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

            {/* Non-Printable Floating "Add Person / Image to Paper" Button */}
            <div className="print:hidden absolute top-2 right-2 z-30">
              <button
                type="button"
                data-non-printable="true"
                onClick={e => {
                  e.stopPropagation();
                  setIsAddPhotoModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/90 hover:bg-slate-900 text-cyan-300 hover:text-white border border-cyan-400/50 rounded-lg text-xs font-bold shadow-lg backdrop-blur-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
                title="Add another photo/person to this sheet (Non-printable button)"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Person to Paper</span>
                <span className="text-[9px] uppercase px-1 py-0.2 bg-cyan-500/20 text-cyan-300 rounded font-mono font-normal">
                  Non-printable
                </span>
              </button>
            </div>

            {/* Rendered Photos on Sheet */}
            {config.items.map(item => {
              const leftPct = (item.xMm / paperWidthMm) * 100;
              const topPct = (item.yMm / paperHeightMm) * 100;
              const widthPct = (item.widthMm / paperWidthMm) * 100;
              const heightPct = (item.heightMm / paperHeightMm) * 100;
              const isSelected = selectedItemId === item.id;

              // Find specific photo source if item has photoId
              const matchedEntry = item.photoId ? unifiedEntries.find(e => e.id === item.photoId) : unifiedEntries[0];
              const imgSrc = matchedEntry?.dataUrl || mainPhotoDataUrl;

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
                    isSelected ? 'ring-2 ring-cyan-500 shadow-md' : 'hover:ring-1 hover:ring-cyan-300'
                  }`}
                >
                  <img
                    src={imgSrc}
                    alt={matchedEntry ? matchedEntry.name : 'Passport copy'}
                    draggable={false}
                    className="w-full h-full object-cover block pointer-events-none"
                    style={{
                      border: showCutLines ? '1px solid #D1D5DB' : 'none',
                    }}
                  />

                  {/* Corner indicator badge when selected or hovered */}
                  {isSelected && (
                    <div className="absolute top-1 right-1 bg-cyan-500 text-[#0B1020] text-[9px] font-bold px-1 rounded shadow">
                      {item.widthMm}×{item.heightMm}mm
                    </div>
                  )}
                </div>
              );
            })}

            {/* Empty state prompt if no items */}
            {config.items.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                <p className="text-slate-600 text-sm font-semibold">No photos on this sheet yet</p>
                <button
                  onClick={() => autoPackMultiPersonGrid()}
                  className="mt-3 px-4 py-2 bg-cyan-400 text-slate-950 font-bold rounded-lg text-xs"
                >
                  Auto-Arrange Photos
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Sheet Photo Modal (Non-printable) */}
      <AddSheetPhotoModal
        isOpen={isAddPhotoModalOpen}
        onClose={() => setIsAddPhotoModalOpen(false)}
        onAddPhoto={handleAddPhotoFromModal}
      />
    </div>
  );
};
