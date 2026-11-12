import React from 'react';
import { ShieldCheck, Heart } from 'lucide-react';

interface PublicFooterProps {
  onOpenSignIn: () => void;
  onOpenSignUp: () => void;
}

export const PublicFooter: React.FC<PublicFooterProps> = ({
  onOpenSignIn,
  onOpenSignUp,
}) => {
  return (
    <footer className="bg-[#07090d] text-slate-400 text-xs border-t border-white/5 py-12 sm:py-16">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          {/* Col 1 */}
          <div className="md:col-span-1 space-y-3">
            <button
              type="button"
              onClick={() => {
                if (window.location.hash) {
                  window.history.replaceState(null, '', window.location.pathname + window.location.search);
                }
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              aria-label="Publora — back to top"
              className="flex items-center gap-2.5 rounded-lg hover:opacity-80 transition-opacity"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00D6B2] to-indigo-600 flex items-center justify-center font-mono font-black text-black text-xs">
                SRA
              </div>
              <span className="font-bold text-white text-base">Publora</span>
            </button>
            <p className="text-slate-400 text-xs leading-relaxed">
              Autonomous multi-platform social media publishing, audience retention intelligence, and algorithmic timing optimizer.
            </p>
            <div className="pt-2 flex items-center gap-1.5 text-[11px] text-[#00D6B2]">
              <span className="w-2 h-2 rounded-full bg-[#00D6B2]" />
              <span>Multi-Tenant Architecture</span>
            </div>
          </div>

          {/* Col 2 */}
          <div>
            <h4 className="font-semibold text-white uppercase tracking-wider text-xs mb-3">Product</h4>
            <ul className="space-y-2">
              <li><a href="#features" className="hover:text-white transition-colors">Retention Intelligence</a></li>
              <li><a href="#features" className="hover:text-white transition-colors">Publishing Autopilot</a></li>
              <li><a href="#platforms" className="hover:text-white transition-colors">Official OAuth Hub</a></li>
              <li><a href="#pricing" className="hover:text-white transition-colors">SaaS Pricing</a></li>
            </ul>
          </div>

          {/* Col 3 */}
          <div>
            <h4 className="font-semibold text-white uppercase tracking-wider text-xs mb-3">Integrations</h4>
            <ul className="space-y-2">
              <li><a href="#platforms" className="hover:text-white transition-colors">YouTube Studio API</a></li>
              <li><a href="#platforms" className="hover:text-white transition-colors">Instagram Graph API</a></li>
              <li><a href="#platforms" className="hover:text-white transition-colors">TikTok Content API</a></li>
              <li><a href="#platforms" className="hover:text-white transition-colors">Facebook Pages API</a></li>
            </ul>
          </div>

          {/* Col 4 */}
          <div>
            <h4 className="font-semibold text-white uppercase tracking-wider text-xs mb-3">Legal & Security</h4>
            <ul className="space-y-2">
              <li>
                <a href="#terms" className="hover:text-white transition-colors">
                  Terms of Service
                </a>
              </li>
              <li>
                <a href="#privacy" className="hover:text-white transition-colors">
                  Privacy Policy & Data Security
                </a>
              </li>
              <li>
                <span className="text-slate-400">Strict Tenant Isolation</span>
              </li>
              <li>
                <span className="text-slate-400">Encrypted Credentials</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left text-[11px]">
          <div>
            © {new Date().getFullYear()} Publora. All rights reserved.
          </div>
          <div className="flex items-center gap-4">
            <a href="#terms" className="hover:text-white">Terms</a>
            <span>•</span>
            <a href="#privacy" className="hover:text-white">Privacy</a>
            <span>•</span>
            <button type="button" onClick={onOpenSignIn} className="hover:text-white">Sign In</button>
            <span>•</span>
            <button type="button" onClick={onOpenSignUp} className="text-[#00D6B2] font-semibold hover:underline">Get Started</button>
          </div>
        </div>
      </div>
    </footer>
  );
};
