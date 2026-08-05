import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
  fluid?: boolean;
  /** Mirror the mark to point left — used for the branded "Back" control. */
  flip?: boolean;
}

const Logo: React.FC<LogoProps> = ({ className = "", size = 40, fluid = false, flip = false }) => {
  // A UNIQUE gradient id per instance. Every Logo previously defined `id="logo-gradient"`, and SVG
  // ids are document-global: with several Logos on a page (the TV top bar is one), `url(#logo-
  // gradient)` resolves to whichever def the browser picks — and when that owning SVG is offscreen
  // or unmounts, the stroke renders as nothing, i.e. an invisible chevron. useId() keeps each
  // instance pointing at its own gradient.
  const gid = `logo-gradient-${React.useId().replace(/[:]/g, '')}`;
  return (
    <div className={fluid ? `relative flex flex-col items-center justify-center w-full h-full ${className}` : `relative flex flex-col items-center justify-center ${className}`}>
      <svg
        width={fluid ? "100%" : size}
        height={fluid ? "100%" : size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-2xl"
        style={flip ? { transform: 'scaleX(-1)' } : undefined}
      >
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6B0099" />
            <stop offset="50%" stopColor="#D40055" />
            <stop offset="100%" stopColor="#FF8C00" />
          </linearGradient>
        </defs>
        <path
          d={`M30 20 L70 50 L30 80`}
          stroke={`url(#${gid})`}
          strokeWidth="18"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

export default Logo;
