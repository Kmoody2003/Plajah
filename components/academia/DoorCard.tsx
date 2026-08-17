// DoorCard — the "corridor" primitive shared by the Academia surfaces.
//
// The idea from the entry-point concepts: a door standing ajar, with a sliver of what's behind
// it showing. You don't read a description of the Labs, you see a piece of one. Two surfaces use
// it (the Demos corridor and the portal's discovery row), so it lives here rather than being
// copied — a forked door would drift the moment one of them gained live thumbnails.
//
// The "ajar" light is a bloom from the top-right. It is the whole trick, and it's why a door
// must never be given a flat background: with no light, it's just a coloured rectangle.

import React from 'react';
import { T } from './integrityTheme';

export interface DoorSpec {
  key: string;
  /** Small label above the title — a role, a duration, a count. */
  kicker?: string;
  title: string;
  blurb: string;
  icon: React.ElementType;
  /** Gradient ends. Use brand tokens with alpha, never opaque fills. */
  from: string;
  to: string;
  /** Wider than its siblings — the recommended route through a corridor. */
  wide?: boolean;
}

const DoorCard: React.FC<{
  door: DoorSpec;
  onOpen: () => void;
  /** Shorter doors for a secondary row; the corridor's own doors stay tall. */
  compact?: boolean;
}> = ({ door, onOpen, compact }) => {
  const Icon = door.icon;
  const minHeight = compact ? 132 : door.wide ? 190 : 168;

  return (
    <button
      onClick={onOpen}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        textAlign: 'left',
        minHeight,
        padding: compact ? 13 : 16,
        borderRadius: 18,
        border: '1px solid rgba(255,255,255,0.16)',
        background: `linear-gradient(160deg, ${door.from}, ${door.to})`,
        color: T.ink,
        cursor: 'pointer',
        fontFamily: 'inherit',
        overflow: 'hidden',
        width: '100%',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(160px 100px at 78% 18%, rgba(255,255,255,0.22), transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <Icon size={compact ? 16 : 18} style={{ position: 'absolute', top: compact ? 13 : 16, left: compact ? 13 : 16, opacity: 0.9 }} />
      <div style={{ position: 'relative' }}>
        {door.kicker && (
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
            padding: '3px 8px', borderRadius: 99, background: 'rgba(0,0,0,0.32)',
          }}>{door.kicker}</span>
        )}
        <p style={{
          margin: door.kicker ? '10px 0 0' : 0,
          fontSize: compact ? 14 : 15.5, fontWeight: 800, letterSpacing: '-0.01em',
        }}>{door.title}</p>
        <p style={{
          margin: '4px 0 0', fontSize: compact ? 11.5 : 12, lineHeight: 1.5,
          color: 'rgba(255,255,255,0.78)',
        }}>{door.blurb}</p>
      </div>
    </button>
  );
};

export default DoorCard;
