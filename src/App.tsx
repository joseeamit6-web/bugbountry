/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { StudioProject } from './types';
import { Header } from './components/Header';
import { UploadHero } from './components/UploadHero';
import { EditorWorkspace } from './components/EditorWorkspace';
import { InfoModals } from './components/InfoModals';
import { ServiceRequestModal } from './components/ServiceRequestModal';
import {
  saveProjectToStorage,
  loadLatestProjectFromStorage,
  deleteProjectFromStorage,
  clearAllDraftsFromStorage
} from './services/storage';
import { loadImage } from './services/imageProcessing';

export default function App() {
  const [project, setProject] = useState<StudioProject | null>(null);
  const [savedDraft, setSavedDraft] = useState<StudioProject | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | 'idle'>('idle');
  const [activeModal, setActiveModal] = useState<'privacy' | 'terms' | 'faq' | 'contact' | null>(null);
  const [isServiceRequestOpen, setIsServiceRequestOpen] = useState(false);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hiddenFileInputRef = useRef<HTMLInputElement>(null);

  // Check for unfinished local draft on initial load
  useEffect(() => {
    loadLatestProjectFromStorage().then(draft => {
      if (draft && draft.imageSrc) {
        setSavedDraft(draft);
      }
    });
  }, []);

  // Debounced auto-save to IndexedDB whenever project updates
  useEffect(() => {
    if (!project) return;

    setSaveStatus('saving');
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      saveProjectToStorage(project)
        .then(() => {
          setSaveStatus('saved');
        })
        .catch(err => {
          console.warn('Failed to auto-save to IndexedDB:', err);
          setSaveStatus('error');
        });
    }, 800);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [project]);

  // Project factory helper
  const createNewProject = (
    imageSrc: string,
    width: number,
    height: number,
    name: string
  ): StudioProject => {
    const personId = 'person_' + Date.now();
    const initialAdjustments = {
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
    };
    const initialTransformations = {
      fineRotation: 0,
      rotation: 0,
      flipH: false,
      flipV: false,
    };
    const initialCrop = {
      x: 5,
      y: 5,
      width: 90,
      height: 90,
      presetId: 'nepal_epassport',
      lockAspect: true,
      aspectRatio: 35 / 45,
    };
    const initialBg = {
      isRemoved: false,
      mode: 'original' as const,
      color: '#A5C9EB', // Standard Nepal light blue
      model: 'isnet-neural' as const,
    };

    const initialPerson = {
      id: personId,
      name: 'Person 1',
      imageSrc,
      naturalWidth: width,
      naturalHeight: height,
      adjustments: { ...initialAdjustments },
      transformations: { ...initialTransformations },
      crop: { ...initialCrop },
      background: { ...initialBg },
      retouchStrokes: [],
      outfit: null,
      widthMm: 35,
      heightMm: 45,
    };

    return {
      id: 'proj_' + Date.now(),
      name: name || 'Passport Project',
      updatedAt: Date.now(),
      imageSrc,
      naturalWidth: width,
      naturalHeight: height,
      adjustments: initialAdjustments,
      transformations: initialTransformations,
      crop: initialCrop,
      background: initialBg,
      retouchStrokes: [],
      outfit: null,
      printSheet: {
        paperId: 'paper_4x6',
        orientation: 'portrait',
        marginMm: 8,
        gapMm: 3,
        copies: 6,
        items: [],
        autoGrid: true,
      },
      sheetPhotos: [],
      people: [initialPerson],
      activePersonId: personId,
    };
  };

  // Upload handlers
  const handleImageSelected = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const result = e.target?.result as string;
      if (result) {
        loadImage(result).then(img => {
          const newProj = createNewProject(result, img.naturalWidth, img.naturalHeight, file.name);
          setProject(newProj);
          setSavedDraft(null);
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleLoadDemoImage = (url: string, name: string) => {
    loadImage(url).then(img => {
      // Convert to local data URL for offline storage safety
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

      const newProj = createNewProject(dataUrl, img.naturalWidth, img.naturalHeight, name);
      setProject(newProj);
      setSavedDraft(null);
    });
  };

  const handleResumeDraft = () => {
    if (savedDraft) {
      const restored = { ...savedDraft };
      if (!restored.people || restored.people.length === 0) {
        const pId = 'person_1';
        restored.people = [{
          id: pId,
          name: 'Person 1',
          imageSrc: restored.imageSrc,
          naturalWidth: restored.naturalWidth,
          naturalHeight: restored.naturalHeight,
          adjustments: restored.adjustments,
          transformations: restored.transformations,
          crop: restored.crop,
          background: restored.background,
          retouchStrokes: restored.retouchStrokes || [],
          outfit: restored.outfit || null,
        }];
        restored.activePersonId = pId;
      }
      setProject(restored);
      setSavedDraft(null);
    }
  };

  const handleDiscardDraft = () => {
    if (savedDraft) {
      deleteProjectFromStorage(savedDraft.id);
      setSavedDraft(null);
    }
  };

  const handleNewImageTrigger = () => {
    if (hiddenFileInputRef.current) {
      hiddenFileInputRef.current.click();
    }
  };

  return (
    <div className={`w-full max-w-full overflow-x-hidden bg-[#0B1020] text-slate-100 flex flex-col selection:bg-cyan-500/20 selection:text-cyan-300 ${project ? 'h-[100dvh] max-h-[100dvh] overflow-hidden' : 'min-h-screen'}`}>
      <input
        ref={hiddenFileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleImageSelected(file);
        }}
        className="hidden"
      />

      {/* Top Bar Header */}
      <Header
        onNewImage={handleNewImageTrigger}
        onOpenModal={modal => setActiveModal(modal)}
        onOpenServiceRequest={() => setIsServiceRequestOpen(true)}
        saveStatus={saveStatus}
        hasImage={Boolean(project)}
      />

      {/* Main View: Homepage Hero OR Workspace */}
      <main className="flex-1 min-h-0 w-full flex flex-col overflow-hidden">
        {!project ? (
          <UploadHero
            onImageSelected={handleImageSelected}
            onLoadDemoImage={handleLoadDemoImage}
            savedDraft={savedDraft}
            onResumeDraft={handleResumeDraft}
            onDiscardDraft={handleDiscardDraft}
            onOpenModal={modal => setActiveModal(modal)}
          />
        ) : (
          <EditorWorkspace
            project={project}
            onUpdateProject={updater => setProject(prev => prev ? updater(prev) : null)}
            onOpenModal={modal => setActiveModal(modal)}
          />
        )}
      </main>

      {/* Public informational modals: Privacy, Terms, FAQ, Contact */}
      <InfoModals
        activeModal={activeModal}
        onClose={() => setActiveModal(null)}
      />

      {/* Want More Services or Tools Modal */}
      <ServiceRequestModal
        isOpen={isServiceRequestOpen}
        onClose={() => setIsServiceRequestOpen(false)}
      />
    </div>
  );
}
