import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

const Logo: React.FC<LogoProps> = ({ className = "", size = 40 }) => {
  return (
    <div className={`relative flex flex-col items-center justify-center ${className}`}>
      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 100 100" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-2xl"
      >
        <defs>
          <linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6B0099" />
            <stop offset="50%" stopColor="#D40055" />
            <stop offset="100%" stopColor="#FF8C00" />
          </linearGradient>
        </defs>
        <path 
          d="M30 20 L70 50 L30 80" 
          stroke="url(#logo-gradient)" 
          strokeWidth="18" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

export default Logo;
