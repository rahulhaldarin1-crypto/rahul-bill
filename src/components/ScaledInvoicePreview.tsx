import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { BusinessSettings, Invoice } from '../types/business';
import { InvoiceSheet } from './InvoiceSheet';

interface ScaledInvoicePreviewProps {
  invoice: Invoice;
  settings: BusinessSettings;
  sheetRef: React.RefObject<HTMLDivElement | null>;
}

const SHEET_WIDTH = 794;
const DEFAULT_SHEET_HEIGHT = 1123;

export const ScaledInvoicePreview: React.FC<ScaledInvoicePreviewProps> = ({
  invoice,
  settings,
  sheetRef,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);

  const [containerWidth, setContainerWidth] = useState<number>(SHEET_WIDTH);
  const [sheetHeight, setSheetHeight] = useState<number>(DEFAULT_SHEET_HEIGHT);
  const [fullSizeMode, setFullSizeMode] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => {
      const w = container.clientWidth;
      if (w > 0) setContainerWidth(w);
    };

    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(container);
    window.addEventListener('resize', updateWidth);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, []);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;

    const updateHeight = () => {
      const h = inner.offsetHeight;
      if (h > 0) setSheetHeight(h);
    };

    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [invoice, settings]);

  const fitScale = Math.min(1, Math.max(0.28, containerWidth / SHEET_WIDTH));
  const activeScale = fullSizeMode ? 1 : fitScale;
  const isScaledDown = fitScale < 0.99;

  return (
    <div className="w-full space-y-2.5">
      {isScaledDown && (
        <div className="no-print flex items-center justify-between gap-2 text-xs text-[#5B4B6B] px-1">
          <span>
            {fullSizeMode
              ? 'Full 100% view (scroll sideways to inspect)'
              : 'Fitted to your mobile screen'}
          </span>
          <button
            type="button"
            onClick={() => setFullSizeMode((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-[#E6D9EE] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#7E22CE] hover:border-[#9333EA] whitespace-nowrap shrink-0 cursor-pointer"
          >
            {fullSizeMode ? (
              <>
                <Minimize2 className="w-3 h-3" />
                <span>Fit Screen</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3 h-3" />
                <span>100% Zoom</span>
              </>
            )}
          </button>
        </div>
      )}

      <div
        ref={containerRef}
        className={`w-full ${fullSizeMode ? 'overflow-x-auto' : 'overflow-hidden flex justify-center'}`}
      >
        <div
          style={{
            width: `${Math.round(SHEET_WIDTH * activeScale)}px`,
            height: `${Math.round(sheetHeight * activeScale)}px`,
          }}
          className="relative shrink-0 shadow-lg rounded-sm overflow-hidden print-sheet-wrapper"
        >
          <div
            ref={innerRef}
            style={{
              width: `${SHEET_WIDTH}px`,
              transform: `scale(${activeScale})`,
              transformOrigin: 'top left',
            }}
          >
            <InvoiceSheet invoice={invoice} settings={settings} />
          </div>
        </div>
      </div>

      {/* Dedicated unscaled 794px A4 capture node for crisp PDF export on all screen sizes */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: '-10000px',
          top: 0,
          width: `${SHEET_WIDTH}px`,
          pointerEvents: 'none',
          zIndex: -1,
        }}
      >
        <InvoiceSheet invoice={invoice} settings={settings} sheetRef={sheetRef} />
      </div>
    </div>
  );
};
