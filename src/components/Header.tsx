import React from 'react';
import { RefreshCw, Upload, Check, CloudOff, MessageSquare } from 'lucide-react';
import { Logo } from './Logo';

interface HeaderProps {
  onNewImage: () => void;
  onOpenModal: (modal: 'privacy' | 'terms' | 'faq' | 'contact') => void;
  onOpenServiceRequest: () => void;
  saveStatus: 'saved' | 'saving' | 'error' | 'idle';
  hasImage: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onNewImage,
  onOpenModal,
  onOpenServiceRequest,
  saveStatus,
  hasImage,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[#0B1020]/95 backdrop-blur-md border-b border-slate-800/80 px-4 lg:px-8 py-3 flex items-center justify-between gap-4 md:gap-8 transition-colors">
      {/* Zone 1: Brand Wordmark with Logo */}
      <div className="flex items-center gap-3 shrink-0">
        <a href="./" className="flex items-center gap-2.5 text-slate-100 hover:text-white transition-colors group">
          <Logo size={32} className="group-hover:scale-105 transition-transform" />
          <span className="text-base font-bold tracking-tight text-white whitespace-nowrap">
            Photo Studio
          </span>
        </a>

        {/* Quiet Draft status indicator */}
        {hasImage && (
          <div className="hidden sm:flex items-center gap-1.5 pl-3 border-l border-slate-800 text-xs text-slate-400">
            {saveStatus === 'saving' && (
              <>
                <RefreshCw className="w-3 h-3 animate-spin text-cyan-400" />
                <span className="whitespace-nowrap">Saving draft…</span>
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="whitespace-nowrap text-slate-400">Saved on device</span>
              </>
            )}
            {saveStatus === 'error' && (
              <>
                <CloudOff className="w-3 h-3 text-amber-400" />
                <span className="whitespace-nowrap text-amber-400">Local draft limit</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Zone 2: Navigation Links */}
      <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
        <button
          onClick={() => onOpenModal('faq')}
          className="hover:text-cyan-300 transition-colors whitespace-nowrap cursor-pointer text-slate-300"
        >
          Passport Standards
        </button>
        <button
          onClick={() => onOpenModal('faq')}
          className="hover:text-cyan-300 transition-colors whitespace-nowrap cursor-pointer text-slate-300"
        >
          Printing Guide
        </button>
        <button
          onClick={() => onOpenModal('privacy')}
          className="hover:text-cyan-300 transition-colors whitespace-nowrap cursor-pointer text-slate-300"
        >
          Privacy
        </button>
        <button
          onClick={() => onOpenModal('contact')}
          className="hover:text-cyan-300 transition-colors whitespace-nowrap cursor-pointer text-slate-300"
        >
          Support
        </button>
      </nav>

      {/* Zone 3: Primary Actions */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Want more services or tools button */}
        <button
          onClick={onOpenServiceRequest}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-300 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/40 rounded-lg transition-all whitespace-nowrap cursor-pointer shadow-sm"
          title="Request a custom tool, visa format, or bulk service"
        >
          <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden sm:inline">Request Tool / Service</span>
          <span className="sm:hidden">Request</span>
        </button>

        <button
          onClick={onNewImage}
          className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-[#0B1020] bg-cyan-300 hover:bg-cyan-200 active:scale-95 rounded-lg transition-all shadow-sm shadow-cyan-950 whitespace-nowrap cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>{hasImage ? 'Change Photo' : 'Add Image'}</span>
        </button>
      </div>
    </header>
  );
};
