import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'menu-card' | 'header-chip';
  onActionComplete?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'menu-card',
  onActionComplete,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (variant === 'header-chip') {
    if (!isInstallable) return null;
    return (
      <button
        type="button"
        onClick={() => {
          void install().then((ok) => {
            if (ok) onActionComplete?.();
          });
        }}
        title="Install Glamour Galleria App"
        className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[#D8B4FE] bg-[#FAF5FF] px-3 py-1.5 text-xs font-bold text-[#6D28D9] hover:border-[#9333EA] hover:bg-[#F3E8FF] transition-colors cursor-pointer"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install App</span>
      </button>
    );
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => {
          void install().then((ok) => {
            if (ok) onActionComplete?.();
          });
        }}
        className="w-full min-h-[52px] flex items-center justify-between gap-3 rounded-2xl border border-[#E9D5FF] bg-[#FAF5FF] px-3.5 py-3 text-left text-[#6D28D9] hover:border-[#9333EA] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#DB2777] to-[#7E22CE] text-white flex items-center justify-center shrink-0">
            <Download className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-[#1F122B]">
              Install Glamour Galleria App
            </div>
            <div className="text-[11px] text-[#6B5B7B]">
              Add to home screen for fast full-screen shopping
            </div>
          </div>
        </div>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="w-full min-h-[52px] flex items-center justify-between gap-3 rounded-2xl border border-[#E9D5FF] bg-[#FAF5FF] px-3.5 py-3 text-left text-[#6D28D9] hover:border-[#9333EA] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#DB2777] to-[#7E22CE] text-white flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-[#1F122B]">
                Install on iPhone / iPad
              </div>
              <div className="text-[11px] text-[#6B5B7B]">
                Tap for Safari Add to Home Screen instructions
              </div>
            </div>
          </div>
        </button>

        {showIOSGuide && (
          <div
            className="no-print fixed inset-0 z-[60] flex items-center justify-center bg-black/55 backdrop-blur-xs p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Install on iPhone or iPad"
            onClick={() => setShowIOSGuide(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl border border-[#EFE2F5] bg-white p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display-serif text-lg font-bold text-[#1F122B]">
                  Install on iPhone / iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close"
                  className="p-1.5 rounded-full text-[#6B5B7B] hover:bg-[#FAF5FF] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="space-y-2 text-xs text-[#4A3B59] list-decimal list-inside leading-relaxed">
                <li>
                  Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.
                </li>
                <li>
                  Scroll down and tap <strong>Add to Home Screen</strong>.
                </li>
                <li>
                  Tap <strong>Add</strong> to install Glamour Galleria.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] py-2.5 text-xs font-bold text-white cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="no-print fixed bottom-20 left-4 z-[55] flex items-center gap-2 rounded-xl bg-[#B45309] px-3.5 py-2 text-xs font-semibold text-white shadow-lg">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>Offline Mode — Reconnect for live catalog &amp; orders</span>
    </div>
  );
};
