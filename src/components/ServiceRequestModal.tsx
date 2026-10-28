import React, { useState } from 'react';
import { X, MessageSquare, Send, CheckCircle2 } from 'lucide-react';

interface ServiceRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ServiceRequestModal: React.FC<ServiceRequestModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [userName, setUserName] = useState('');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [details, setDetails] = useState('');

  if (!isOpen) return null;

  const serviceOptions = [
    'Custom Country Visa / Passport Format',
    'Bulk Passport Photo Batch Processing',
    'High-End Portrait Skin Retouching',
    'Custom Studio Backdrop / Background Replacement',
    'Corporate / Academic ID Card & Badge Design',
    'Print Sheet Custom Paper / Sizing Setup',
    'Other Special Tool / Feature Request',
  ];

  const toggleService = (srv: string) => {
    setSelectedServices(prev =>
      prev.includes(srv) ? prev.filter(s => s !== srv) : [...prev, srv]
    );
  };

  const handleSendWhatsApp = (e: React.FormEvent) => {
    e.preventDefault();

    const recipientPhone = '9779746241860';
    let message = `*Photo Studio - Service & Tool Request*\n`;
    if (userName.trim()) {
      message += `*Name:* ${userName.trim()}\n`;
    }
    if (selectedServices.length > 0) {
      message += `*Requested Services:*\n• ${selectedServices.join('\n• ')}\n`;
    }
    if (details.trim()) {
      message += `*Details:* ${details.trim()}\n`;
    }
    message += `\n_Sent from Photo Studio (pic.amitjoshi.info.np)_`;

    const encoded = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${recipientPhone}?text=${encoded}`;

    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-[#0E1528] border border-cyan-500/30 rounded-2xl shadow-2xl overflow-hidden text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Want More Services or Tools?</h2>
              <p className="text-[11px] text-slate-400">Send your custom requirements directly via WhatsApp</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSendWhatsApp} className="p-6 space-y-4 text-xs">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Your Name (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Amit Joshi"
              value={userName}
              onChange={e => setUserName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-400 rounded-lg p-2.5 text-white placeholder-slate-500 outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Select What You Need:
            </label>
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {serviceOptions.map(srv => {
                const isSelected = selectedServices.includes(srv);
                return (
                  <button
                    type="button"
                    key={srv}
                    onClick={() => toggleService(srv)}
                    className={`w-full flex items-center justify-between p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-950/20 text-emerald-200'
                        : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-xs">{srv}</span>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Describe Your Specific Requirement:
            </label>
            <textarea
              rows={3}
              placeholder="Please describe the size, country requirements, number of photos, or tool feature you would like us to add..."
              value={details}
              onChange={e => setDetails(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-400 rounded-lg p-2.5 text-white placeholder-slate-500 outline-none transition-colors"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-[#07130c] font-bold rounded-xl transition-all shadow-lg shadow-emerald-950 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              <Send className="w-4 h-4" />
              <span>Send Request via WhatsApp (+977 9746241860)</span>
            </button>
          </div>

          <p className="text-[11px] text-center text-slate-500 pt-1">
            We usually respond within a few minutes. You can also email{' '}
            <a href="mailto:admin@amitjoshi.info.np" className="text-cyan-400 underline">
              admin@amitjoshi.info.np
            </a>
          </p>
        </form>
      </div>
    </div>
  );
};
