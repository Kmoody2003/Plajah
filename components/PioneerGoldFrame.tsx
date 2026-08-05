import React from 'react';

interface PioneerGoldFrameProps {
  children: React.ReactNode;
  active: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Wraps any avatar element with an animated gold gradient border when the user
 * has seen the welcome package (isPioneer / hasSeenWelcomePackage).
 */
const PioneerGoldFrame: React.FC<PioneerGoldFrameProps> = ({
  children,
  active,
  size = 'md',
  className = '',
}) => {
  if (!active) return <>{children}</>;

  const padding = size === 'sm' ? 'p-[2px]' : size === 'lg' ? 'p-[4px]' : 'p-[3px]';
  const radius = size === 'sm' ? 'rounded-full' : size === 'lg' ? 'rounded-[2.8rem]' : 'rounded-full';

  return (
    <div
      className={`${radius} ${padding} ${className}`}
      style={{
        background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 25%, #FFE066 50%, #B8860B 75%, #FFD700 100%)',
        backgroundSize: '200% 200%',
        animation: 'pioneerGoldSpin 4s linear infinite',
        boxShadow: '0 0 16px rgba(255, 180, 0, 0.45), 0 0 6px rgba(255, 180, 0, 0.3)',
      }}
    >
      <div className={`${radius} overflow-hidden w-full h-full`}>
        {children}
      </div>

      <style>{`
        @keyframes pioneerGoldSpin {
          0%   { background-position: 0%   50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0%   50%; }
        }
      `}</style>
    </div>
  );
};

export default PioneerGoldFrame;
