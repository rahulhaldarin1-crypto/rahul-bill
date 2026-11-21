import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';

interface BrandLogoProps {
  logoDataUrl?: string;
  businessName?: string;
  size?: number;
  className?: string;
}

export const DEFAULT_CREST_PATH = '/assets/aistudio/1794650211385_79a09583.png';

export const BrandLogo: React.FC<BrandLogoProps> = ({
  logoDataUrl,
  businessName = 'Glamour Galleria',
  size = 64,
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);
  const src = logoDataUrl && logoDataUrl.trim() ? logoDataUrl : DEFAULT_CREST_PATH;

  if (imgError) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`rounded-2xl bg-gradient-to-br from-[#EC4899] to-[#7E22CE] flex items-center justify-center text-white shadow-sm shrink-0 ${className}`}
      >
        <Sparkles className="w-1/2 h-1/2" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={businessName}
      referrerPolicy="no-referrer"
      onError={() => setImgError(true)}
      style={{ width: size, height: size }}
      className={`object-contain rounded-full shrink-0 ${className}`}
    />
  );
};
