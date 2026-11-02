// Brand marks and model drawings for smart lights. Hue and Razer use the Simple Icons (CC0) marks,
// shown only to say which brand a light belongs to. Govee and Nanoleaf aren't in that set, so they
// get their name as text until there's an approved file to use.

import React from 'react';
import type { LightPlatform } from '../../services/smartLightingService';
import type { SmartForm } from '../../services/lighting/smartCatalog';
import hueLogo from './logos/philipshue.svg?url';
import razerLogo from './logos/razer.svg?url';

const MARK: Partial<Record<LightPlatform, string>> = { hue: hueLogo, razer: razerLogo };
const WORD: Record<LightPlatform, string> = { hue: 'Philips Hue', razer: 'Razer', govee: 'Govee', nanoleaf: 'Nanoleaf' };

export const BrandMark: React.FC<{ platform: LightPlatform; size?: number; withName?: boolean }> = ({ platform, size = 16, withName = true }) => (
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
    {MARK[platform] && <img src={MARK[platform]} alt={withName ? '' : WORD[platform]} width={size} height={size} className="invert" style={{ width: size, height: size }} />}
    {(withName || !MARK[platform]) && <span className={MARK[platform] ? '' : 'font-bold tracking-tight'}>{WORD[platform]}</span>}
  </span>
);

const BODY = '#2b2933', EDGE = '#4a4755';
const C = ['#ff4a7a', '#ffb030', '#4aff9a', '#4aa8ff', '#b04aff'];

const ART: Record<SmartForm, React.ReactNode> = {
  bulb: (
    <>
      <path d="M50 10 a24 24 0 0 1 14 44 q-3 3 -3 10 h-22 q0 -7 -3 -10 a24 24 0 0 1 14 -44 z" fill="#ffd9a0" stroke={EDGE} />
      <rect x="39" y="64" width="22" height="16" rx="2" fill={BODY} stroke={EDGE} />
      <path d="M39 70 h22 M39 75 h22" stroke={EDGE} />
    </>
  ),
  strip: (
    <>
      <path d="M6 66 C 28 30, 40 76, 60 44 S 88 26, 94 30" stroke={BODY} strokeWidth="9" fill="none" strokeLinecap="round" />
      <path d="M6 66 C 28 30, 40 76, 60 44 S 88 26, 94 30" stroke="url(#smartStrip)" strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray="1 5" />
      <defs><linearGradient id="smartStrip">{C.map((c, i) => <stop key={c} offset={i / 4} stopColor={c} />)}</linearGradient></defs>
    </>
  ),
  panels: (
    <>
      {[[36, 32], [64, 32], [50, 56], [22, 56], [78, 56]].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y - 15} l13 7.5 v15 l-13 7.5 l-13 -7.5 v-15 z`} fill={C[i]} stroke={EDGE} opacity="0.9" />
      ))}
    </>
  ),
  lamp: (
    <>
      <ellipse cx="50" cy="38" rx="22" ry="26" fill="#ffd9a0" stroke={EDGE} />
      <path d="M38 62 L32 82 H68 L62 62 Z" fill={BODY} stroke={EDGE} />
    </>
  ),
  lightbar: (
    <>
      <rect x="10" y="20" width="10" height="60" rx="3" fill={C[0]} stroke={EDGE} />
      <rect x="35" y="30" width="10" height="50" rx="3" fill={C[1]} stroke={EDGE} />
      <rect x="55" y="14" width="10" height="66" rx="3" fill={C[3]} stroke={EDGE} />
      <rect x="80" y="26" width="10" height="54" rx="3" fill={C[4]} stroke={EDGE} />
    </>
  ),
  peripheral: (
    <>
      <rect x="8" y="30" width="84" height="40" rx="5" fill={BODY} stroke={EDGE} />
      {Array.from({ length: 21 }, (_, i) => <rect key={i} x={13 + (i % 7) * 11} y={35 + Math.floor(i / 7) * 10} width="8" height="7" rx="1" fill={C[i % 5]} />)}
    </>
  ),
  string: (
    <>
      <path d="M4 24 Q28 52 50 28 T96 26" stroke={EDGE} strokeWidth="2" fill="none" />
      {[[14, 34], [28, 41], [42, 35], [56, 26], [72, 25], [86, 28]].map(([x, y], i) => <ellipse key={x} cx={x} cy={y + 7} rx="4" ry="7" fill={C[i % 5]} />)}
    </>
  ),
};

export const SmartArt: React.FC<{ form: SmartForm; className?: string }> = ({ form, className }) => (
  <svg viewBox="0 0 100 92" className={className} role="img" aria-hidden="true">{ART[form]}</svg>
);
