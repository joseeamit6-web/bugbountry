import React from 'react';
import { X, ShieldCheck, FileText, HelpCircle, Mail, MessageSquare } from 'lucide-react';

interface InfoModalsProps {
  activeModal: 'privacy' | 'terms' | 'faq' | 'contact' | null;
  onClose: () => void;
}

export const InfoModals: React.FC<InfoModalsProps> = ({ activeModal, onClose }) => {
  if (!activeModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-[#0E1528] border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            {activeModal === 'privacy' && <ShieldCheck className="w-5 h-5 text-cyan-400" />}
            {activeModal === 'terms' && <FileText className="w-5 h-5 text-cyan-400" />}
            {activeModal === 'faq' && <HelpCircle className="w-5 h-5 text-cyan-400" />}
            {activeModal === 'contact' && <Mail className="w-5 h-5 text-cyan-400" />}
            <h2 className="text-base font-semibold text-white">
              {activeModal === 'privacy' && 'Privacy Policy'}
              {activeModal === 'terms' && 'Terms and Conditions'}
              {activeModal === 'faq' && 'Passport Standards & FAQ'}
              {activeModal === 'contact' && 'Contact & Support'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs sm:text-sm leading-relaxed text-slate-300">
          {activeModal === 'privacy' && (
            <>
              <div>
                <h3 className="font-semibold text-white text-sm mb-1">1. Local Device Processing</h3>
                <p>
                  Photo Studio operates predominantly through client-side HTML5 Canvas and WebAssembly algorithms. Your photographs and biometric facial data remain on your personal device and are not uploaded to remote databases or stored on company servers.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white text-sm mb-1">2. Browser Storage (IndexedDB)</h3>
                <p>
                  To prevent data loss in the event of accidental page reloads or tab closures, your active editing draft is stored locally in your browser&apos;s isolated IndexedDB database. You can clear or discard your saved drafts at any time using the &ldquo;Discard&rdquo; control.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white text-sm mb-1">3. Third-Party Scripts & Advertising</h3>
                <p>
                  Photo Studio may host standard privacy-compliant advertising placements (such as Google AdSense). These third-party vendors may use cookies to serve ads based on prior visits. No photographic data or image uploads are shared with advertising networks.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white text-sm mb-1">4. Data Deletion & Inquiries</h3>
                <p>
                  For any privacy inquiries or assistance regarding client storage cleanup, you may contact the administrator at{' '}
                  <a href="mailto:admin@amitjoshi.info.np" className="text-cyan-400 underline">
                    admin@amitjoshi.info.np
                  </a>.
                </p>
              </div>
            </>
          )}

          {activeModal === 'terms' && (
            <>
              <div>
                <h3 className="font-semibold text-white text-sm mb-1">1. Disclaimer of Official Affiliation</h3>
                <p>
                  Photo Studio is an independent utility software. It is not affiliated with, endorsed by, or representing any government embassy, passport authority, immigration agency, or department of foreign affairs.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white text-sm mb-1">2. User Responsibility for Compliance</h3>
                <p>
                  While our preset templates correspond to officially published biometric guidelines (e.g. Nepal Department of Passports 35×45mm, US State Dept 2×2&quot;, ICAO 9303 standards), immigration criteria and photo requirements are subject to periodic change by authorities. Users must verify their photographs against current official guidelines before submission.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white text-sm mb-1">3. AI & Outfit Replacement Advisory</h3>
                <p>
                  The Portrait & Outfit Studio and extreme retouching features are provided for creative and general portfolio use. Altered clothing, heavy facial modification, or artificial enhancements may invalidate an image for official identification or visa purposes. Photo Studio does not warrant embassy acceptance of modified portraits.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white text-sm mb-1">4. Limitation of Liability</h3>
                <p>
                  Photo Studio is provided &ldquo;as is&rdquo; without warranty of any kind. Under no circumstances shall the developer be liable for application rejection, travel delays, re-photograph costs, or other consequential damages.
                </p>
              </div>
            </>
          )}

          {activeModal === 'faq' && (
            <>
              <div>
                <h3 className="font-semibold text-white text-sm mb-1">What are the photo requirements for Nepal e-Passport?</h3>
                <p>
                  The Nepal Department of Passports requires 35 × 45 mm format with a plain light blue (#A5C9EB) or off-white background. The face must be centered and occupy between 70% and 80% of the vertical frame (chin to crown measuring 32–36 mm). Both ears must be clearly visible, and eyeglasses should ideally be removed to prevent glare.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white text-sm mb-1">What are the requirements for US Visa (DS-160) and Passport?</h3>
                <p>
                  US requirements mandate a square 2 × 2 inches (51 × 51 mm) photograph with a solid white background. The head must measure between 1 inch and 1 3/8 inches (25 mm to 35 mm) from the bottom of the chin to the top of the head. Eyeglasses are strictly prohibited unless accompanied by a signed medical statement.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white text-sm mb-1">How do I print the print-sheet at exact physical dimensions?</h3>
                <p>
                  When printing on 4 × 6&quot; photo paper or A4 sheets, ensure your printer dialog is set to <strong className="text-white">Scale: 100% (Actual Size)</strong>. Do not select &ldquo;Fit to Printable Area&rdquo; or &ldquo;Shrink to Fit&rdquo;, as that can shrink your photos by 3–5%. Use glossy photo paper for professional lab-grade results.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white text-sm mb-1">What does 300 DPI mean for photo printing?</h3>
                <p>
                  DPI (dots per inch) dictates print density. At 300 DPI, a 35 × 45 mm passport photo contains 413 × 531 physical pixels, providing the sharpness and clarity expected by biometric scanners.
                </p>
              </div>
            </>
          )}

          {activeModal === 'contact' && (
            <div className="space-y-4">
              <p>
                Have feedback, questions, or encountered a technical issue with image export or printing? Reach out directly:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <a
                  href="mailto:admin@amitjoshi.info.np"
                  className="flex items-center gap-3 p-4 bg-slate-900 border border-slate-800 hover:border-cyan-400/40 rounded-xl transition-all group"
                >
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center text-cyan-400">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Direct Email</span>
                    <span className="text-xs font-semibold text-white group-hover:text-cyan-300 transition-colors">
                      admin@amitjoshi.info.np
                    </span>
                  </div>
                </a>

                <a
                  href="https://wa.me/9779746241860"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-4 bg-slate-900 border border-slate-800 hover:border-emerald-400/40 rounded-xl transition-all group"
                >
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center text-emerald-400">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">WhatsApp Support</span>
                    <span className="text-xs font-semibold text-white group-hover:text-emerald-300 transition-colors">
                      +977 9746241860
                    </span>
                  </div>
                </a>
              </div>

              <p className="text-[11px] text-slate-500 pt-2">
                Note: Technical support is provided for web software and printing assistance. Support staff cannot provide legal advice on embassy acceptance.
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-900/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
