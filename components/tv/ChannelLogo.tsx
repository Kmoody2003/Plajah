import React, { useState, useEffect } from 'react';
import Logo from '../Logo';

/**
 * A channel's logo tile. Custom logo → account logo → the owner's profile photo (all resolved by the
 * caller into `src`); with none of those — or if the image fails to load — the Plajah chevron in
 * the brand gradient.
 *
 * ONE image, drawn once. This used to stack a blurred, enlarged copy of the logo behind the sharp
 * one to fill the letterbox; behind a transparent or non-square logo (and any profile photo) that
 * blur read as a second, ghost copy of the icon. A plain dark tile with the logo contained inside
 * it can't do that, and it needs nothing from the saved logo — nobody has to re-upload.
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
        <img src={src} alt={name ? `${name} logo` : ''} onError={() => setFailed(true)} className="block w-full h-full object-contain" draggable={false} />
      ) : (
        <Logo size={Math.round(size * 0.72)} />
      )}
    </span>
  );
};

export default ChannelLogo;
