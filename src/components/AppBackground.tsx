import React from 'react';

const BACKGROUND_IMAGE_PATH =
  '/assets/aistudio/Messenger_creation_4C61AB5A-9F69-46BA-B060-FC045AA43C6F_480eb216.jpeg';

export const AppBackground: React.FC = () => {
  return (
    <div
      aria-hidden="true"
      className="no-print fixed inset-0 z-0 pointer-events-none overflow-hidden select-none"
    >
      <img
        src={BACKGROUND_IMAGE_PATH}
        alt=""
        className="w-full h-full object-cover object-top"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#FDF9FC]/45 via-[#FDF9FC]/55 to-[#F4ECFF]/65" />
    </div>
  );
};
