import React from 'react';
import type { Article } from '../../types';

/** Small trust labels for list cards: retracted / corrected / sponsored / AI-assisted. Reads only fields already on the card. */
export const ArticleBadges: React.FC<{ article: Pick<Article, 'notices' | 'disclosures' | 'status'> }> = ({ article }) => {
  const n = article.notices || [];
  const retracted = n.some(x => x.label === 'RETRACTION') || article.status === 'RETRACTED';
  const corrected = n.some(x => x.label === 'CORRECTION' || x.label === 'CLARIFICATION');
  const d = article.disclosures;
  const chips: Array<{ k: string; text: string; color: string }> = [];
  if (retracted) chips.push({ k: 'r', text: 'Retracted', color: '#FF5C6C' });
  else if (corrected) chips.push({ k: 'c', text: 'Corrected', color: '#FF8C00' });
  else if (n.some(x => x.label === 'UPDATE')) chips.push({ k: 'u', text: 'Updated', color: '#00DAF3' });
  if (d?.sponsored) chips.push({ k: 's', text: 'Sponsored', color: '#D0BCFF' });
  if (d?.aiAssisted) chips.push({ k: 'a', text: 'AI-assisted', color: '#9C96B4' });
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-3" aria-label="Article labels">
      {chips.map(c => <span key={c.k} className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest" style={{ color: c.color, border: `1px solid ${c.color}55` }}>{c.text}</span>)}
    </div>
  );
};

export default ArticleBadges;
