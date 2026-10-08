import React from 'react';
import Logo from './Logo';

interface PageHeaderProps {
  children: React.ReactNode;
  wrapperClassName?: string;
  textClassName?: string;
  /** Replaces the plain logo mark (e.g. Chora's kaiju duo flanking the chevron). */
  mark?: React.ReactNode;
  /** Something that peeks from behind the title's letters (e.g. <KaijuLetterPeek/>). It shares a relative box with the
   *  h1 (and manages its own stacking / glyph masking); the h1 gets a little headroom so what peeks over isn't clipped. */
  behind?: React.ReactNode;
}

const DEFAULT_TEXT = "text-5xl sm:text-7xl md:text-9xl lg:text-[12rem] break-words font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none";

const PageHeader: React.FC<PageHeaderProps> = ({ children, wrapperClassName, textClassName, mark, behind }) => (
  <div className={`flex items-end gap-3 lg:gap-5 ${wrapperClassName || ''}`}>
    {behind ? (
      <div className="relative">
        {behind}
        <h1 className={`relative z-[1] ${textClassName || DEFAULT_TEXT}`} style={{ paddingTop: '0.38em' }}>{children}</h1>
      </div>
    ) : (
      <h1 className={textClassName || DEFAULT_TEXT}>{children}</h1>
    )}
    {mark ?? (
      <div className="h-10 sm:h-14 md:h-20 lg:h-40 aspect-square shrink-0 mb-1">
        <Logo fluid />
      </div>
    )}
  </div>
);

export default PageHeader;
