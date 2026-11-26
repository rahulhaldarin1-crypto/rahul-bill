import React, { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import { getOptimizedMediaUrl } from '../utils/cloudinary';

interface CustomerAvatarProps {
  photoDataUrl?: string;
  name?: string;
  size?: number;
  className?: string;
}

export const CustomerAvatar: React.FC<CustomerAvatarProps> = ({
  photoDataUrl,
  name = '',
  size = 44,
  className = '',
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  const resolvedUrl = getOptimizedMediaUrl(photoDataUrl, 'image');

  useEffect(() => {
    setImgFailed(false);
  }, [resolvedUrl]);

  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');

  const showImg = Boolean(resolvedUrl && !imgFailed);

  return (
    <div
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
      className={`rounded-full overflow-hidden max-w-full border border-[#E6D9EE] bg-gradient-to-br from-[#FCE7F3] to-[#EDE9FE] flex items-center justify-center shrink-0 text-[#6D28D9] font-bold select-none ${className}`}
    >
      {showImg ? (
        <img
          src={resolvedUrl}
          alt={name || 'Customer avatar'}
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="w-full h-full max-w-full object-cover block"
        />
      ) : initials ? (
        <span style={{ fontSize: Math.max(11, Math.round(size * 0.36)) }}>
          {initials}
        </span>
      ) : (
        <User style={{ width: Math.round(size * 0.48), height: Math.round(size * 0.48) }} />
      )}
    </div>
  );
};
