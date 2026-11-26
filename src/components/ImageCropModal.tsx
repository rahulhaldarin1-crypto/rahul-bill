import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Crop,
  Loader2,
  Move,
  RotateCcw,
  Scissors,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { CloudinaryMediaRecord } from '../types/business';
import { resolveApiUrl } from '../utils/appMode';
import { resizeImageFileToDataUrl } from '../utils/calculations';
import { uploadMediaToCloudinary } from '../utils/cloudinary';

type AspectMode = '1:1' | '4:5' | 'original';

interface ImageCropModalProps {
  open: boolean;
  imageSrc: string;
  imageIndex: number;
  uploadRole: 'admin' | 'seller';
  uploadAppSource: 'ggadminpanel' | 'glamour-galleria';
  uploadFolder: string;
  uploadedByUid: string;
  relatedEntityId?: string;
  onClose: () => void;
  onSaved: (record: CloudinaryMediaRecord, index: number) => void;
}

const PREVIEW_MAX_W = 540;
const PREVIEW_MAX_H = 540;

function dataUrlToFile(dataUrl: string, fileName: string): File {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = /data:([^;]+);base64/i.exec(header || '');
  const mime = mimeMatch?.[1] || 'image/jpeg';
  const binary = atob(base64 || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], fileName, { type: mime });
}

function getPreviewDimensions(
  aspectMode: AspectMode,
  natW: number,
  natH: number
): { width: number; height: number } {
  if (aspectMode === '1:1') {
    return { width: 460, height: 460 };
  }
  if (aspectMode === '4:5') {
    return { width: 400, height: 500 };
  }
  const safeW = Math.max(1, natW);
  const safeH = Math.max(1, natH);
  const ratio = safeW / safeH;
  if (ratio >= 1) {
    return {
      width: PREVIEW_MAX_W,
      height: Math.max(220, Math.round(PREVIEW_MAX_W / ratio)),
    };
  }
  return {
    width: Math.max(220, Math.round(PREVIEW_MAX_H * ratio)),
    height: PREVIEW_MAX_H,
  };
}

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  open,
  imageSrc,
  imageIndex,
  uploadRole,
  uploadAppSource,
  uploadFolder,
  uploadedByUid,
  relatedEntityId,
  onClose,
  onSaved,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const dragStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });

  const [loadingImage, setLoadingImage] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [natSize, setNatSize] = useState<{ w: number; h: number }>({ w: 1, h: 1 });
  const [aspectMode, setAspectMode] = useState<AspectMode>('1:1');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [saveError, setSaveError] = useState('');

  // Reset editor state whenever modal opens for an image
  useEffect(() => {
    if (!open || !imageSrc) return;
    let cancelled = false;
    loadedImageRef.current = null;
    setLoadingImage(true);
    setLoadError('');
    setSaveError('');
    setUploadProgress(null);
    setAspectMode('1:1');
    setZoom(1);
    setPan({ x: 0, y: 0 });

    const loadImg = (srcToLoad: string, withCors: boolean): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const img = new Image();
        if (withCors) {
          img.crossOrigin = 'anonymous';
        }
        img.referrerPolicy = 'no-referrer';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Image failed to load.'));
        img.src = srcToLoad;
      });

    const bootstrap = async () => {
      const trimmed = imageSrc.trim();
      const isHttp = /^https?:\/\//i.test(trimmed);
      try {
        // Attempt direct CORS load first so Cloudinary / CORS-enabled URLs load fast
        const directImg = await loadImg(trimmed, isHttp);
        if (!cancelled) {
          loadedImageRef.current = directImg;
          setNatSize({
            w: directImg.naturalWidth || directImg.width || 1,
            h: directImg.naturalHeight || directImg.height || 1,
          });
          setLoadingImage(false);
        }
        return;
      } catch {
        // Fallback for external product CDNs (Meesho / Flipkart) that omit CORS headers
        if (!isHttp) {
          if (!cancelled) {
            setLoadError('Unable to open this image for cropping.');
            setLoadingImage(false);
          }
          return;
        }
      }

      try {
        const proxiedSrc = resolveApiUrl(
          `/api/fetch-product?proxyImage=${encodeURIComponent(trimmed)}`
        );
        const proxiedImg = await loadImg(proxiedSrc, false);
        if (!cancelled) {
          loadedImageRef.current = proxiedImg;
          setNatSize({
            w: proxiedImg.naturalWidth || proxiedImg.width || 1,
            h: proxiedImg.naturalHeight || proxiedImg.height || 1,
          });
          setLoadingImage(false);
        }
      } catch {
        if (!cancelled) {
          setLoadError(
            'Could not load this image for editing due to source restrictions.'
          );
          setLoadingImage(false);
        }
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [open, imageSrc]);

  const previewDims = getPreviewDimensions(aspectMode, natSize.w, natSize.h);

  const clampPan = useCallback(
    (rawX: number, rawY: number, currentZoom: number) => {
      const img = loadedImageRef.current;
      if (!img) return { x: 0, y: 0 };
      const { width: cw, height: ch } = getPreviewDimensions(
        aspectMode,
        img.naturalWidth || 1,
        img.naturalHeight || 1
      );
      const iw = img.naturalWidth || 1;
      const ih = img.naturalHeight || 1;
      const baseScale = Math.max(cw / iw, ch / ih);
      const drawW = iw * baseScale * currentZoom;
      const drawH = ih * baseScale * currentZoom;
      const maxPanX = Math.max(0, (drawW - cw) / 2);
      const maxPanY = Math.max(0, (drawH - ch) / 2);
      return {
        x: Math.max(-maxPanX, Math.min(maxPanX, rawX)),
        y: Math.max(-maxPanY, Math.min(maxPanY, rawY)),
      };
    },
    [aspectMode]
  );

  // Render live cropped frame directly onto canvas
  useEffect(() => {
    if (!open || loadingImage || loadError) return;
    const canvas = canvasRef.current;
    const img = loadedImageRef.current;
    if (!canvas || !img) return;

    const { width: cw, height: ch } = previewDims;
    canvas.width = cw;
    canvas.height = ch;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, cw, ch);

    const iw = img.naturalWidth || 1;
    const ih = img.naturalHeight || 1;
    const baseScale = Math.max(cw / iw, ch / ih);
    const drawW = iw * baseScale * zoom;
    const drawH = ih * baseScale * zoom;
    const clamped = clampPan(pan.x, pan.y, zoom);
    const dx = (cw - drawW) / 2 + clamped.x;
    const dy = (ch - drawH) / 2 + clamped.y;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, dx, dy, drawW, drawH);

    // Subtle rule-of-thirds crop guide lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cw / 3, 0);
    ctx.lineTo(cw / 3, ch);
    ctx.moveTo((cw * 2) / 3, 0);
    ctx.lineTo((cw * 2) / 3, ch);
    ctx.moveTo(0, ch / 3);
    ctx.lineTo(cw, ch / 3);
    ctx.moveTo(0, (ch * 2) / 3);
    ctx.lineTo(cw, (ch * 2) / 3);
    ctx.stroke();
  }, [open, loadingImage, loadError, previewDims, zoom, pan, clampPan]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (loadingImage || loadError || saving) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      originX: pan.x,
      originY: pan.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragStateRef.current.active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleRatio = rect.width > 0 ? previewDims.width / rect.width : 1;
    const deltaX = (e.clientX - dragStateRef.current.startX) * scaleRatio;
    const deltaY = (e.clientY - dragStateRef.current.startY) * scaleRatio;
    setPan(
      clampPan(
        dragStateRef.current.originX + deltaX,
        dragStateRef.current.originY + deltaY,
        zoom
      )
    );
  };

  const handlePointerUp = () => {
    dragStateRef.current.active = false;
  };

  const handleZoomChange = (nextZoom: number) => {
    const safeZoom = Math.max(1, Math.min(3, Number(nextZoom.toFixed(2))));
    setZoom(safeZoom);
    setPan((prev) => clampPan(prev.x, prev.y, safeZoom));
  };

  const handleTrimWatermarkZoom = () => {
    const nextZoom = Math.max(1.22, zoom);
    setZoom(nextZoom);
    setPan((prev) => clampPan(prev.x, prev.y, nextZoom));
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleSaveCrop = async () => {
    const img = loadedImageRef.current;
    if (!img || loadingImage || loadError) return;
    setSaving(true);
    setSaveError('');
    setUploadProgress(5);

    try {
      const { width: pw, height: ph } = previewDims;
      const exportMax = 1280;
      const scaleOut = Math.min(
        exportMax / pw,
        exportMax / ph,
        Math.max(1, (img.naturalWidth || pw) / pw)
      );
      const outW = Math.max(200, Math.round(pw * Math.min(2.5, scaleOut)));
      const outH = Math.max(200, Math.round(ph * Math.min(2.5, scaleOut)));

      const outCanvas = document.createElement('canvas');
      outCanvas.width = outW;
      outCanvas.height = outH;
      const outCtx = outCanvas.getContext('2d');
      if (!outCtx) {
        throw new Error('Could not initialize image cropper.');
      }

      outCtx.fillStyle = '#FFFFFF';
      outCtx.fillRect(0, 0, outW, outH);

      const iw = img.naturalWidth || 1;
      const ih = img.naturalHeight || 1;
      const baseScale = Math.max(pw / iw, ph / ih);
      const drawW = iw * baseScale * zoom;
      const drawH = ih * baseScale * zoom;
      const clamped = clampPan(pan.x, pan.y, zoom);
      const dx = (pw - drawW) / 2 + clamped.x;
      const dy = (ph - drawH) / 2 + clamped.y;
      const factor = outW / pw;

      outCtx.imageSmoothingEnabled = true;
      outCtx.imageSmoothingQuality = 'high';
      outCtx.drawImage(img, dx * factor, dy * factor, drawW * factor, drawH * factor);

      const rawBlob = await new Promise<Blob | null>((resolve) =>
        outCanvas.toBlob((b) => resolve(b), 'image/jpeg', 0.94)
      );
      if (!rawBlob) {
        throw new Error('Could not export cropped image.');
      }

      const croppedFile = new File(
        [rawBlob],
        `product-cropped-${imageIndex + 1}.jpg`,
        { type: 'image/jpeg' }
      );

      // Compress cleanly to ~80-100KB using existing product compression helper
      const compressedDataUrl = await resizeImageFileToDataUrl(
        croppedFile,
        1280,
        { quality: 0.86 }
      );
      const compressedFile = dataUrlToFile(
        compressedDataUrl,
        `product-cropped-${imageIndex + 1}.jpg`
      );

      const record = await uploadMediaToCloudinary(compressedFile, {
        role: uploadRole,
        appSource: uploadAppSource,
        folder: uploadFolder,
        relatedEntityType: 'product',
        relatedEntityId,
        uploadedByUid,
        allowedTypes: ['image'],
        onProgress: (pct) => setUploadProgress(pct),
      });

      onSaved(record, imageIndex);
      onClose();
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : 'Could not save cropped image to Cloudinary.'
      );
    } finally {
      setSaving(false);
      setUploadProgress(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-xl rounded-2xl border border-[#E6D9EE] bg-white shadow-2xl overflow-hidden my-auto">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-[#F4ECF8] bg-[#FDF9FE]">
          <div className="flex items-center gap-2">
            <Crop className="w-4 h-4 text-[#DB2777]" />
            <div>
              <h3 className="text-sm font-bold text-[#1F122B]">
                Crop &amp; Edit Photo #{imageIndex + 1}
              </h3>
              <p className="text-[11px] text-[#6B5B7B]">
                Drag photo to position, zoom in to trim edges/watermarks, then save to Cloudinary (~80–100KB).
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label="Close crop modal"
            className="p-1.5 rounded-lg border border-[#E6D9EE] bg-white text-[#6B5B7B] hover:text-[#1F122B] cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {saveError && (
            <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3 py-2 text-xs font-medium text-[#BE123C]">
              {saveError}
            </div>
          )}

          {/* Aspect Ratio & Quick Trim */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] p-1 gap-1">
              {(['1:1', '4:5', 'original'] as AspectMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  disabled={saving || loadingImage}
                  onClick={() => {
                    setAspectMode(mode);
                    setPan({ x: 0, y: 0 });
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors ${
                    aspectMode === mode
                      ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                      : 'text-[#5B4B6B] hover:bg-white'
                  }`}
                >
                  {mode === '1:1'
                    ? 'Square 1:1'
                    : mode === '4:5'
                      ? 'Portrait 4:5'
                      : 'Original Ratio'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={saving || loadingImage}
                onClick={handleTrimWatermarkZoom}
                className="inline-flex items-center gap-1 rounded-lg border border-[#D8B4FE] bg-[#FAF5FF] px-2.5 py-1 text-[11px] font-semibold text-[#7E22CE] hover:bg-[#F3E8FF] cursor-pointer disabled:opacity-50"
              >
                <Scissors className="w-3 h-3" />
                <span>Trim Edges</span>
              </button>
              <button
                type="button"
                disabled={saving || loadingImage}
                onClick={handleReset}
                className="inline-flex items-center gap-1 rounded-lg border border-[#E6D9EE] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#5B4B6B] hover:bg-[#FAF5FC] cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Interactive Canvas Stage */}
          <div className="rounded-2xl border border-[#E6D9EE] bg-[#160D1E] p-3 flex flex-col items-center justify-center min-h-[280px] max-h-[380px] overflow-hidden">
            {loadingImage ? (
              <div className="flex flex-col items-center gap-2 text-xs text-white/80 py-14">
                <Loader2 className="w-6 h-6 animate-spin text-[#F472B6]" />
                <span>Loading image into editor...</span>
              </div>
            ) : loadError ? (
              <div className="text-center text-xs text-[#FDA4AF] px-4 py-12 max-w-sm">
                {loadError}
              </div>
            ) : (
              <canvas
                ref={canvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="max-w-full max-h-[340px] w-auto h-auto rounded-xl border border-white/25 touch-none cursor-grab active:cursor-grabbing shadow-lg"
              />
            )}
          </div>

          {!loadingImage && !loadError && (
            <div className="flex items-center gap-3 rounded-xl border border-[#F2E6F7] bg-[#FDF9FE] px-3.5 py-2.5">
              <ZoomOut className="w-4 h-4 text-[#7E22CE] shrink-0" />
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                disabled={saving}
                onChange={(e) => handleZoomChange(Number(e.target.value))}
                aria-label="Zoom level"
                className="w-full accent-[#DB2777] cursor-pointer"
              />
              <ZoomIn className="w-4 h-4 text-[#7E22CE] shrink-0" />
              <span className="text-xs font-mono-num font-bold text-[#1F122B] w-11 text-right shrink-0">
                {zoom.toFixed(2)}x
              </span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 text-[11px] text-[#6B5B7B]">
            <span className="inline-flex items-center gap-1">
              <Move className="w-3.5 h-3.5 text-[#9333EA]" />
              <span>Drag inside the preview frame to adjust crop area.</span>
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 px-4 sm:px-5 py-3.5 border-t border-[#F4ECF8] bg-[#FDFBFE]">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-[#E6D9EE] bg-white text-xs font-semibold text-[#5B4B6B] hover:bg-[#FAF5FC] cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || loadingImage || Boolean(loadError)}
            onClick={() => void handleSaveCrop()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-xs font-semibold text-white hover:opacity-95 cursor-pointer disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>
                  {uploadProgress !== null
                    ? `Uploading ${uploadProgress}%...`
                    : 'Processing...'}
                </span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Apply Crop &amp; Save</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
