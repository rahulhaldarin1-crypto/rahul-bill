import React from 'react';
import { getMediaCrossOrigin, getOptimizedMediaUrl } from '../utils/cloudinary';

interface GoldCrestLogoProps {
  customLogoDataUrl?: string;
  storeName?: string;
  size?: number;
}

export const GoldCrestLogo: React.FC<GoldCrestLogoProps> = ({
  customLogoDataUrl,
  storeName = 'Glamour Galleria',
  size = 94,
}) => {
  if (customLogoDataUrl) {
    const resolvedSrc = getOptimizedMediaUrl(customLogoDataUrl, 'image');
    return (
      <div
        style={{ width: size, height: size }}
        className="flex items-center justify-center overflow-hidden rounded-full border border-[#C9A449]/60 bg-[#1B1712]"
      >
        <img
          src={resolvedSrc}
          alt={`${storeName} logo`}
          crossOrigin={getMediaCrossOrigin(resolvedSrc)}
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <img
      src="/assets/aistudio/1794650211385_79a09583.png"
      alt={`${storeName} logo`}
      referrerPolicy="no-referrer"
      style={{ width: size, height: size, objectFit: 'contain', display: 'block' }}
    />
  );
};
