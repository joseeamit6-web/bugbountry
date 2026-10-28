import React, { useRef, useState } from 'react';
import { Upload, Sparkles, Printer, ShieldCheck, CheckCircle2, Trash2, ArrowRight, MessageSquare } from 'lucide-react';
import { StudioProject } from '../types';
import { Logo } from './Logo';

interface UploadHeroProps {
  onImageSelected: (file: File) => void;
  onLoadDemoImage: (url: string, name: string) => void;
  savedDraft: StudioProject | null;
  onResumeDraft: () => void;
  onDiscardDraft: () => void;
  onOpenModal: (modal: 'privacy' | 'terms' | 'faq' | 'contact') => void;
}

export const UploadHero: React.FC<UploadHeroProps> = ({
  onImageSelected,
  onLoadDemoImage,
  savedDraft,
  onResumeDraft,
  onDiscardDraft,
  onOpenModal,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const sampleManPath = '/src/assets/images/sample_portrait_man_1793180916362.jpg';
  const sampleWomanPath = '/src/assets/images/sample_portrait_woman_1793180916339.jpg';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndUpload(file);
  };

  const validateAndUpload = (file: File) => {
    setUploadError(null);
    if (!file.type.startsWith('image/')) {
      setUploadError('Please select a valid image file (JPEG, PNG, WebP).');
      return;
    }
    // Limit to 25MB for safety
    if (file.size > 25 * 1024 * 1024) {
      setUploadError('Image size exceeds 25MB limit. Please select a smaller photo.');
      return;
    }
    onImageSelected(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndUpload(file);
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-8 lg:py-12 space-y-10">
      {/* Draft Recovery Notification Banner if draft exists */}
      {savedDraft && (
        <div className="bg-slate-900/90 border border-cyan-500/30 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg shadow-black/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center text-cyan-400 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Unfinished Local Project Found</h2>
              <p className="text-xs text-slate-400">
                You have a saved draft &ldquo;{savedDraft.name || 'Portrait'}&rdquo; from{' '}
                {new Date(savedDraft.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })},{' '}
                {new Date(savedDraft.updatedAt).toLocaleDateString()}.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <button
              onClick={onDiscardDraft}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Discard</span>
            </button>
            <button
              onClick={onResumeDraft}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-[#0B1020] bg-cyan-300 hover:bg-cyan-200 rounded-lg transition-all shadow-sm cursor-pointer"
            >
              <span>Resume Project</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Hero Header */}
      <div className="text-center space-y-3 max-w-2xl mx-auto">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-tight">
          Your Complete Online Photo Studio.
        </h1>
        <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
          Create passport photos with exact country specifications, edit portraits, replace backgrounds, and prepare high-resolution 300 DPI print sheets.
        </p>
      </div>

      {/* Main Drag & Drop Upload Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all ${
          isDragging
            ? 'border-cyan-400 bg-cyan-950/20 scale-[1.01]'
            : 'border-slate-700/80 bg-slate-900/60 hover:border-slate-600'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="hidden"
          id="photo-upload-input"
        />

        <div className="max-w-md mx-auto space-y-5">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center text-cyan-400">
            <Upload className="w-8 h-8" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold text-white">
              Drag and drop your photo here
            </h2>
            <p className="text-xs text-slate-400">
              Supports high-resolution JPG, PNG, and WebP files up to 25MB.
            </p>
          </div>

          {uploadError && (
            <div className="p-3 bg-rose-950/50 border border-rose-500/40 rounded-lg text-xs text-rose-300">
              {uploadError}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-2.5 text-sm font-semibold text-[#0B1020] bg-cyan-300 hover:bg-cyan-200 active:scale-95 rounded-lg transition-all shadow-md shadow-black/40 cursor-pointer"
            >
              Select Photo from Device
            </button>
          </div>
        </div>
      </div>

      {/* Instant Demo Samples to Test Immediately */}
      <div className="space-y-3">
        <div className="text-center">
          <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
            Or test immediately with demo studio portraits
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <button
            onClick={() => onLoadDemoImage(sampleManPath, 'Demo Studio Portrait (Male)')}
            className="flex items-center gap-3 px-4 py-2.5 bg-slate-900 border border-slate-800 hover:border-cyan-500/40 rounded-xl transition-all text-left group cursor-pointer"
          >
            <img
              src={sampleManPath}
              alt="Male sample portrait"
              referrerPolicy="no-referrer"
              className="w-11 h-11 rounded-lg object-cover border border-slate-700"
            />
            <div>
              <p className="text-xs font-semibold text-white group-hover:text-cyan-300 transition-colors">
                Male Studio Portrait
              </p>
              <p className="text-[11px] text-slate-400">Nepal / Schengen / US standard</p>
            </div>
          </button>

          <button
            onClick={() => onLoadDemoImage(sampleWomanPath, 'Demo Studio Portrait (Female)')}
            className="flex items-center gap-3 px-4 py-2.5 bg-slate-900 border border-slate-800 hover:border-cyan-500/40 rounded-xl transition-all text-left group cursor-pointer"
          >
            <img
              src={sampleWomanPath}
              alt="Female sample portrait"
              referrerPolicy="no-referrer"
              className="w-11 h-11 rounded-lg object-cover border border-slate-700"
            />
            <div>
              <p className="text-xs font-semibold text-white group-hover:text-cyan-300 transition-colors">
                Female Executive Portrait
              </p>
              <p className="text-[11px] text-slate-400">Passport & ID card test</p>
            </div>
          </button>
        </div>
      </div>

      {/* Concise Tips for Passport & Portrait Perfection */}
      <div className="border border-slate-800 bg-slate-900/40 rounded-2xl p-6 sm:p-8 space-y-6">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-cyan-400" />
          <span>Tips for Best Passport & Official ID Results</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-slate-300">
          <div className="space-y-1.5">
            <h3 className="font-semibold text-white">1. Direct Frontal Pose</h3>
            <p className="text-slate-400 leading-relaxed">
              Face the camera directly with a neutral expression, mouth closed, and both ears visible. Avoid tilting head.
            </p>
          </div>
          <div className="space-y-1.5">
            <h3 className="font-semibold text-white">2. Even Lighting & No Shadows</h3>
            <p className="text-slate-400 leading-relaxed">
              Ensure even illumination across both sides of the face. Avoid harsh overhead shadows under the nose or chin.
            </p>
          </div>
          <div className="space-y-1.5">
            <h3 className="font-semibold text-white">3. Clear Eye & Head Guides</h3>
            <p className="text-slate-400 leading-relaxed">
              Our editor displays biometric eye-line and head height guides (70%–80% for Nepal & EU, 50%–69% for US).
            </p>
          </div>
        </div>
      </div>

      {/* Feature Highlights Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-slate-900/30 border border-slate-800 space-y-2">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-semibold text-white">Global Passport Presets</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Nepal MRP/e-Passport (35×45mm), US Visa 2×2&quot;, Schengen, UK, India, Canada, and custom dimensions.
          </p>
        </div>

        <div className="p-5 rounded-xl bg-slate-900/30 border border-slate-800 space-y-2">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-semibold text-white">AI Clarity & Retouching</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Natural face smoothing, blemish healing, lighting balance, and sharpness enhancement.
          </p>
        </div>

        <div className="p-5 rounded-xl bg-slate-900/30 border border-slate-800 space-y-2">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
            <Upload className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-semibold text-white">Background Replacement</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Swap to Nepal light blue, pure white, off-white, soft gray, or export transparent PNG cutouts.
          </p>
        </div>

        <div className="p-5 rounded-xl bg-slate-900/30 border border-slate-800 space-y-2">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
            <Printer className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-semibold text-white">300 DPI Print Sheets</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Arrange copies on 4×6&quot;, A4, or US Letter with drag-and-drop snapping and cutting lines.
          </p>
        </div>
      </div>

      {/* Unobtrusive Ad Container (Remains hidden when unconfigured) */}
      <div id="ad-hero-slot" className="hidden border border-slate-800/60 rounded-xl p-4 text-center text-xs text-slate-500">
        Advertisement
      </div>

      {/* Privacy & Trust Footnote */}
      <div className="text-center text-xs text-slate-500 space-y-1">
        <p>100% Client-Side Privacy: Your photos are processed securely in your browser and are never uploaded to any remote server.</p>
        <div className="flex items-center justify-center gap-4 text-slate-400 pt-1">
          <button onClick={() => onOpenModal('privacy')} className="hover:underline cursor-pointer">Privacy Policy</button>
          <span>·</span>
          <button onClick={() => onOpenModal('terms')} className="hover:underline cursor-pointer">Terms & Conditions</button>
          <span>·</span>
          <button onClick={() => onOpenModal('contact')} className="hover:underline cursor-pointer">Technical Support</button>
        </div>
      </div>
    </div>
  );
};
