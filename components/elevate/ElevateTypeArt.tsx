// components/elevate/ElevateTypeArt.tsx
// Illustrated plates for the Elevate organization types: a silhouette scene per type, lit in the
// type's accent with the Plajah glow. Drawn as SVG so they stay sharp, tint per accent and need
// no photo licensing. The scene keeps its proportions (bottom-centred); callers paint the sky behind
// it with typeSky() and fade it into their surface with a CSS mask.
import React, { useId } from 'react';
import type { ElevateTabKey } from './ElevateTypeTabs';

const INK = '#0c0716';

/** Sky wash behind a plate: the accent at the top, Plajah violet, then nothing. */
export const typeSky = (accent: string) => `linear-gradient(to bottom, ${accent}66, rgba(107,0,153,0.22) 55%, transparent)`;

interface ArtProps { kind: ElevateTabKey; accent: string; className?: string }

export const ElevateTypeArt: React.FC<ArtProps> = ({ kind, accent, className }) => {
  const uid = useId().replace(/:/g, '');
  const glow = `glow-${uid}`, fillG = `fill-${uid}`, ray = `ray-${uid}`;
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMax meet" className={className} aria-hidden="true">
      <defs>
        <radialGradient id={glow} cx="0.5" cy="0.42" r="0.5">
          <stop offset="0" stopColor={accent} stopOpacity="0.75" />
          <stop offset="0.45" stopColor="#D40055" stopOpacity="0.22" />
          <stop offset="1" stopColor="#D40055" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={fillG} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={accent} />
          <stop offset="0.6" stopColor="#D40055" />
          <stop offset="1" stopColor="#FF8C00" />
        </linearGradient>
        <linearGradient id={ray} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <ellipse cx="200" cy="105" rx="210" ry="150" fill={`url(#${glow})`} />
      {kind === 'church' && <ChurchScene accent={accent} fill={fillG} ray={ray} />}
      {kind === 'faith' && <FaithScene accent={accent} fill={fillG} />}
      {kind === 'nonprofit' && <CommunityScene accent={accent} fill={fillG} />}
      {kind === 'charity' && <CharityScene accent={accent} fill={fillG} />}
      {kind === 'cultural' && <MuseumScene accent={accent} fill={fillG} ray={ray} />}
      {kind === 'overview' && <OverviewScene accent={accent} fill={fillG} />}
    </svg>
  );
};

type SceneProps = { accent: string; fill: string; ray?: string };
const rim = (accent: string) => ({ fill: INK, stroke: accent, strokeOpacity: 0.55, strokeWidth: 1.5 });

/** Lancet arch, opening at (x, top) with the given width, down to the floor. */
const arch = (x: number, top: number, w: number) => `M${x} 240 V${top + w * 0.75} Q${x} ${top + w * 0.2} ${x + w / 2} ${top} Q${x + w} ${top + w * 0.2} ${x + w} ${top + w * 0.75} V240 Z`;

const ChurchScene: React.FC<SceneProps> = ({ accent, fill, ray }) => (
  <g>
    {[[-70, -20], [-25, 25], [20, 70]].map(([a, b], i) => (
      <polygon key={i} points={`200,40 ${200 + a * 1.6},240 ${200 + b * 1.6},240`} fill={`url(#${ray})`} opacity={0.7} />
    ))}
    <path d={arch(70, 120, 40)} {...rim(accent)} />
    <path d={arch(290, 120, 40)} {...rim(accent)} />
    <path d={arch(76, 128, 28)} fill={`url(#${fill})`} opacity={0.35} />
    <path d={arch(296, 128, 28)} fill={`url(#${fill})`} opacity={0.35} />
    <path d={arch(135, 28, 130)} {...rim(accent)} strokeWidth={2} />
    <path d={arch(147, 44, 106)} fill={`url(#${fill})`} opacity={0.55} />
    <circle cx="200" cy="100" r="24" fill={INK} stroke={accent} strokeOpacity={0.8} strokeWidth={2} />
    {Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4;
      return <line key={i} x1="200" y1="100" x2={200 + Math.cos(a) * 24} y2={100 + Math.sin(a) * 24} stroke={accent} strokeOpacity={0.7} strokeWidth={1.4} />;
    })}
    <circle cx="200" cy="100" r="7" fill={`url(#${fill})`} />
    {[176, 200, 224].map(x => <line key={x} x1={x} y1="130" x2={x} y2="240" stroke={INK} strokeWidth={3} />)}
    <line x1="150" y1="168" x2="250" y2="168" stroke={INK} strokeWidth={3} />
  </g>
);

const FaithScene: React.FC<SceneProps> = ({ accent, fill }) => (
  <g>
    {[[40, 40], [92, 22], [150, 48], [262, 30], [330, 54], [372, 24], [60, 88], [352, 96]].map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.8 : 1.2} fill="#fff" opacity={0.7} />
    ))}
    {/* hall with a round window and arched door */}
    <rect x="22" y="150" width="78" height="90" {...rim(accent)} />
    <polygon points="16,150 61,124 106,150" {...rim(accent)} />
    <circle cx="61" cy="174" r="11" fill={`url(#${fill})`} opacity={0.6} />
    <path d={arch(49, 200, 24)} fill={`url(#${fill})`} opacity={0.4} />
    {/* domed hall */}
    <rect x="110" y="160" width="86" height="80" {...rim(accent)} />
    <path d="M110 160 Q153 78 196 160 Z" {...rim(accent)} />
    <line x1="153" y1="104" x2="153" y2="90" stroke={accent} strokeWidth={2} />
    <circle cx="153" cy="88" r="3" fill={accent} />
    {[124, 146, 168].map(x => <path key={x} d={arch(x, 182, 14)} fill={`url(#${fill})`} opacity={0.45} />)}
    {/* slender tower */}
    <rect x="206" y="92" width="14" height="148" {...rim(accent)} />
    <polygon points="203,92 213,66 223,92" {...rim(accent)} />
    <rect x="201" y="128" width="24" height="4" fill={accent} opacity={0.7} />
    {/* tiered temple */}
    <rect x="268" y="190" width="58" height="50" {...rim(accent)} />
    <polygon points="252,190 342,190 328,176 266,176" {...rim(accent)} />
    <rect x="276" y="150" width="42" height="26" {...rim(accent)} />
    <polygon points="262,150 332,150 320,138 274,138" {...rim(accent)} />
    <rect x="284" y="116" width="26" height="22" {...rim(accent)} />
    <polygon points="272,116 322,116 312,105 282,105" {...rim(accent)} />
    <line x1="297" y1="105" x2="297" y2="86" stroke={accent} strokeWidth={2} />
    <rect x="290" y="206" width="14" height="34" fill={`url(#${fill})`} opacity={0.5} />
    <rect x="0" y="236" width="400" height="4" fill={INK} />
  </g>
);

const CommunityScene: React.FC<SceneProps> = ({ accent, fill }) => {
  const people: [number, number][] = [[52, 0.8], [104, 0.95], [158, 0.85], [204, 1.12], [252, 0.9], [302, 1], [352, 0.82]];
  const heads = people.map(([x, s]) => [x, 240 - 70 * s] as const);
  return (
    <g>
      {heads.slice(0, -1).map(([x, y], i) => {
        const [nx, ny] = heads[i + 1];
        return <path key={i} d={`M${x} ${y - 16} Q${(x + nx) / 2} ${Math.min(y, ny) - 52} ${nx} ${ny - 16}`} fill="none" stroke={accent} strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="3 5" />;
      })}
      {[[90, 56], [200, 34], [312, 52], [148, 80], [258, 76]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i < 3 ? 4 : 2.5} fill={i === 1 ? `url(#${fill})` : accent} opacity={0.85} />
      ))}
      <path d="M90 56 L200 34 L312 52 M148 80 L200 34 L258 76" stroke={accent} strokeOpacity={0.35} strokeWidth={1} fill="none" />
      {people.map(([x, s], i) => {
        const hy = 240 - 70 * s, w = 24 * s, hr = 12 * s;
        const center = i === 3;
        return (
          <g key={x}>
            <path d={`M${x - w} 240 Q${x - w} ${hy + hr + 8} ${x} ${hy + hr + 6} Q${x + w} ${hy + hr + 8} ${x + w} 240 Z`} {...(center ? { fill: `url(#${fill})` } : rim(accent))} />
            <circle cx={x} cy={hy} r={hr} {...(center ? { fill: `url(#${fill})` } : rim(accent))} />
          </g>
        );
      })}
    </g>
  );
};

const CharityScene: React.FC<SceneProps> = ({ accent, fill }) => (
  <g>
    {[54, 84, 116].map((r, i) => <circle key={r} cx="200" cy="112" r={r} fill="none" stroke={accent} strokeOpacity={0.45 - i * 0.12} strokeWidth={1.5} />)}
    {[[132, 64], [276, 58], [118, 128], [290, 132], [168, 28], [238, 24]].map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r={i % 2 ? 3 : 2} fill={accent} opacity={0.75} />
    ))}
    <path d="M200 160 C140 120 138 66 176 64 C192 63 200 76 200 84 C200 76 208 63 224 64 C262 66 260 120 200 160 Z" fill={`url(#${fill})`} />
    <path d="M186 80 C178 80 172 88 174 98" fill="none" stroke="#fff" strokeOpacity={0.5} strokeWidth={3} strokeLinecap="round" />
    {/* open hand holding it up */}
    <path d="M96 240 C110 210 128 196 150 190 L250 190 C266 190 272 176 288 170 C302 166 310 178 300 190 C286 206 268 222 240 228 L170 232 C150 234 138 240 132 240 Z" {...rim(accent)} strokeWidth={2} />
    <path d="M150 190 C170 182 196 186 214 192" fill="none" stroke={accent} strokeOpacity={0.6} strokeWidth={1.5} />
  </g>
);

const MuseumScene: React.FC<SceneProps> = ({ accent, fill, ray }) => (
  <g>
    <polygon points="118,0 154,0 196,240 70,240" fill={`url(#${ray})`} opacity={0.75} />
    <polygon points="246,0 282,0 330,240 204,240" fill={`url(#${ray})`} opacity={0.5} />
    <polygon points="62,110 200,58 338,110" {...rim(accent)} strokeWidth={2} />
    <circle cx="200" cy="92" r="9" fill={`url(#${fill})`} opacity={0.8} />
    <rect x="62" y="110" width="276" height="12" {...rim(accent)} />
    {Array.from({ length: 6 }, (_, i) => 82 + i * 46).map(x => (
      <g key={x}>
        <rect x={x} y="122" width="18" height="96" {...rim(accent)} />
        <line x1={x + 6} y1="126" x2={x + 6} y2="214" stroke={accent} strokeOpacity={0.25} />
        <line x1={x + 12} y1="126" x2={x + 12} y2="214" stroke={accent} strokeOpacity={0.25} />
      </g>
    ))}
    {/* the work on view between the columns */}
    <rect x="178" y="146" width="44" height="54" fill={INK} stroke={accent} strokeWidth={2} />
    <rect x="184" y="152" width="32" height="42" fill={`url(#${fill})`} opacity={0.75} />
    <rect x="52" y="218" width="296" height="8" {...rim(accent)} />
    <rect x="40" y="226" width="320" height="14" {...rim(accent)} />
  </g>
);

const OverviewScene: React.FC<SceneProps> = ({ accent, fill }) => (
  <g>
    {[60, 100, 140].map((r, i) => <circle key={r} cx="200" cy="140" r={r} fill="none" stroke={accent} strokeOpacity={0.4 - i * 0.1} />)}
    <circle cx="200" cy="140" r="26" fill={`url(#${fill})`} />
  </g>
);

export default ElevateTypeArt;
