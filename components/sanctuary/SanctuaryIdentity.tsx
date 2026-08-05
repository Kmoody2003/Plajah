import React from 'react';
import { Gem, Lock, Sparkles } from 'lucide-react';

// ─── Sanctuary visual identity ──────────────────────────────────────────────────
// A Sanctuary must read as unmistakably different from a Club. Clubs live in
// violet/indigo over white-on-black; a Sanctuary is a vault/temple: obsidian
// ground, antique gold, a garnet undertone, and a gem sigil. Import these tokens
// (never hand-copy the hex) so every sanctuary surface stays consistent.

export const SANCTUARY_THEME = {
  gold: '#C9A55C',
  goldSoft: '#E7D6AE',
  goldDeep: '#9C7C3C',
  garnet: '#6E2634',
  obsidian: '#0C0A0D',
  panel: '#171216',
  line: 'rgba(201,165,92,0.22)',
  // Ready-made gradients for hero / banner backgrounds.
  heroGradient: 'linear-gradient(135deg, #1A1216 0%, #0C0A0D 55%, #120E14 100%)',
  goldSheen: 'linear-gradient(120deg, rgba(201,165,92,0.16), rgba(110,38,52,0.10))',
} as const;

/** The wordmark chip that labels a space as a Sanctuary (vs a Club). */
export const SanctuaryBadge: React.FC<{ size?: 'sm' | 'md'; label?: string; className?: string }> = ({
  size = 'md', label = 'Sanctuary', className = '',
}) => {
  const sm = size === 'sm';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-black uppercase tracking-[0.2em] ${
        sm ? 'px-2 py-0.5 text-[8px]' : 'px-2.5 py-1 text-[9px]'
      } ${className}`}
      style={{
        color: SANCTUARY_THEME.goldSoft,
        background: SANCTUARY_THEME.goldSheen,
        border: `1px solid ${SANCTUARY_THEME.line}`,
      }}
    >
      <Gem size={sm ? 9 : 11} style={{ color: SANCTUARY_THEME.gold }} />
      {label}
    </span>
  );
};

/** Small lock indicator for gated content — shows why an item is locked. */
export const SanctuaryLockChip: React.FC<{ text?: string; className?: string }> = ({
  text = 'Members only', className = '',
}) => (
  <span
    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest ${className}`}
    style={{ color: SANCTUARY_THEME.goldSoft, background: 'rgba(0,0,0,0.55)', border: `1px solid ${SANCTUARY_THEME.line}` }}
  >
    <Lock size={8} style={{ color: SANCTUARY_THEME.gold }} />
    {text}
  </span>
);

/** A tier/price marker (à la carte or membership). */
export const SanctuaryPriceTag: React.FC<{ price?: number; tier?: string; className?: string }> = ({
  price, tier, className = '',
}) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${className}`}
    style={{ color: SANCTUARY_THEME.goldSoft, background: 'rgba(201,165,92,0.10)', border: `1px solid ${SANCTUARY_THEME.line}` }}
  >
    <Sparkles size={9} style={{ color: SANCTUARY_THEME.gold }} />
    {tier ? tier : price != null ? `$${price}` : 'Free'}
  </span>
);
