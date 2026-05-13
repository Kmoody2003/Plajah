import React from 'react';
import Logo from './Logo';

interface PageHeaderProps {
  children: React.ReactNode;
  wrapperClassName?: string;
  textClassName?: string;
}

const DEFAULT_TEXT = "text-5xl sm:text-7xl md:text-9xl lg:text-[12rem] break-words font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none";

const PageHeader: React.FC<PageHeaderProps> = ({ children, wrapperClassName, textClassName }) => (
  <div className={`flex items-end gap-3 lg:gap-5 ${wrapperClassName || ''}`}>
    {/* Logo: left on mobile, right on desktop */}
    <div className="lg:order-last h-10 sm:h-14 md:h-20 lg:h-40 aspect-square shrink-0 mb-1">
      <Logo fluid />
    </div>
    <h1 className={`lg:order-first ${textClassName || DEFAULT_TEXT}`}>{children}</h1>
  </div>
);

export default PageHeader;
