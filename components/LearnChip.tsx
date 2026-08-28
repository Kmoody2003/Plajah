// LearnChip — "Go deeper" affordance. Drop it on any content that has tags; it renders only
// when the content actually maps to a discipline, so it never becomes noise.

import React, { useMemo } from 'react';
import { GraduationCap, ChevronRight } from 'lucide-react';
import { findLearnTarget, openLearnTarget } from '../services/learnChips';

interface Props {
  tags?: string[];
  text?: string;
  className?: string;
  compact?: boolean;
}

const LearnChip: React.FC<Props> = ({ tags, text, className, compact }) => {
  const target = useMemo(() => findLearnTarget(tags, text), [tags, text]);
  if (!target) return null;
  return (
    <button
      onClick={e => { e.stopPropagation(); openLearnTarget(target); }}
      title={`Learn about ${target.label} in Museion`}
      className={`inline-flex items-center gap-1.5 rounded-full border transition-all hover:brightness-125 ${compact ? 'px-2.5 py-1' : 'px-3 py-1.5'} ${className || ''}`}
      style={{ background: `${target.accent}1c`, borderColor: `${target.accent}44`, color: target.accent }}
    >
      <GraduationCap size={compact ? 11 : 12} />
      <span className={`font-black uppercase tracking-widest ${compact ? 'text-[8.5px]' : 'text-[9.5px]'}`}>
        Go deeper · {target.label}
      </span>
      <ChevronRight size={compact ? 10 : 11} />
    </button>
  );
};

export default LearnChip;
