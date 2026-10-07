import React, { useState, useEffect } from 'react';
import Logo from '../Logo';

/**
 * A channel's logo tile. Custom logo → account logo → the owner's profile photo (all resolved by the
 * caller into `src`); with none of those — or if the image fails to load — the Plajah chevron in
 * the brand gradient. Object-contain over a blurred self-fill so a wide logo is never cropped.
 */
const ChannelLogo: React.FC<{ src?: string; name?: string; size?: number; className?: string }> = ({ src, name, size = 32, className = '' }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  const show = !!src && !failed;
  return (
    <span
      className={`relative inline-grid place-items-center shrink-0 overflow-hidden rounded-lg bg-[#0b0c14] border border-white/10 ${className}`}
      style={{ width: size, height: size }}
      title={name}
    >
      {show ? (
        <>
          <img src={src} aria-hidden="true" alt="" className="absolute inset-0 w-full h-full object-cover scale-110 blur-md opacity-40" />
          <img src={src} alt={name ? `${name} logo` : ''} onError={() => setFailed(true)} className="relative w-full h-full object-contain" draggable={false} />
        </>
      ) : (
        <Logo size={Math.round(size * 0.72)} />
      )}
    </span>
  );
};

export default ChannelLogo;
