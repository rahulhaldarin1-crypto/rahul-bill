import React, { useState } from 'react';
import { User } from 'lucide-react';

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

  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');

  const showImg = Boolean(photoDataUrl && photoDataUrl.trim() && !imgFailed);

  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-full overflow-hidden border border-[#E6D9EE] bg-gradient-to-br from-[#FCE7F3] to-[#EDE9FE] flex items-center justify-center shrink-0 text-[#6D28D9] font-bold select-none ${className}`}
    >
      {showImg ? (
        <img
          src={photoDataUrl}
          alt={name || 'Customer avatar'}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover"
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
