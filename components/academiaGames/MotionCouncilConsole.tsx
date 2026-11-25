/**
 * Plajah Motion Council Director Console (Animation Console).
 *
 * Surfaces Plajah's real Motion Graphics & VFX Council + 61-member Studio Roster
 * (services/motion/council/motionCouncilService.ts + motionRoster.ts) directly inside
 * Academia Games so creators and reviewers can inspect the cast animation crew, read
 * their frame-accurate proposals & artistic tensions, and dial live timing (On 2s / On 1s / On 3s),
 * wind-wave travel, Satsuei paper-grain compositing, and Live2D rig guide boxes in real time.
 */

import React, { useMemo } from 'react';
import { Clapperboard, Eye, Sparkles, Wind, X } from 'lucide-react';
import {
  getWorldMotionDirection,
  speakerName,
  type DirectorSettings,
  type SteppingMode,
} from '../../services/academiaGames/motionDirector';
import type { WorldId } from '../../services/academiaGames/contracts';
import { DecklePaperCard } from './craftPrimitives';

interface Props {
  open: boolean;
  world: WorldId | 'ora';
  settings: DirectorSettings;
  onChange: (next: DirectorSettings) => void;
  onClose: () => void;
}

const STEPPING_OPTIONS: Array<{ mode: SteppingMode; label: string; sub: string }> = [
  { mode: 2, label: 'On 2s (12 fps)', sub: 'Hand-drawn feature' },
  { mode: 1, label: 'On 1s (60 fps)', sub: 'Silky continuous' },
  { mode: 3, label: 'On 3s (8 fps)', sub: 'Storybook craft' },
];

export const MotionCouncilConsole: React.FC<Props> = ({ open, world, settings, onChange, onClose }) => {
  const dir = useMemo(() => getWorldMotionDirection(world), [world]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Plajah Animation Council Console"
      className="fixed left-4 bottom-20 z-50 w-[min(430px,calc(100vw-2rem))]"
    >
      <DecklePaperCard copperplate tone="cream" className="p-5 text-[#2E2219] max-h-[76vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#CDB998]">
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-[#7A634C] font-semibold flex items-center gap-1.5">
              <Clapperboard size={12} /> Plajah Motion Council &amp; Studio Roster
            </div>
            <h3 className="text-[18px] font-bold mt-0.5" style={{ fontFamily: 'Georgia, serif' }}>
              Animation Director Console
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Animation Console"
            className="w-7 h-7 rounded-full grid place-items-center text-[#5E4B3B] hover:bg-black/5 cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {/* Cast Studio Roster Crew Pills */}
        <div className="mt-3">
          <div className="text-[11px] uppercase tracking-wider text-[#7A634C] font-semibold mb-1.5">
            Cast Crew for This World
          </div>
          <div className="flex flex-wrap gap-1.5">
            {dir.crew.map(m => (
              <span
                key={m.id}
                title={m.ethos}
                className="px-2.5 py-1 rounded-full text-[11.5px] font-semibold bg-[#EFE5D1] border border-[#C6B08E] text-[#3B2A1E]"
                style={{ fontFamily: 'Georgia, serif' }}
              >
                {m.name}
              </span>
            ))}
          </div>
        </div>

        {/* Live Studio Timing & Compositing Controls */}
        <div className="mt-4 p-3 rounded bg-[#EFE5D1] border border-[#CDB998] space-y-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#6B5642] font-semibold mb-1.5">
              Exposure Cadence (Apply Live)
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {STEPPING_OPTIONS.map(opt => {
                const active = settings.stepping === opt.mode;
                return (
                  <button
                    key={opt.mode}
                    type="button"
                    onClick={() => onChange({ ...settings, stepping: opt.mode })}
                    className="px-2 py-1.5 rounded text-left transition-colors cursor-pointer"
                    style={{
                      background: active ? '#2E2219' : 'rgba(255,250,240,0.75)',
                      color: active ? '#F6EFE2' : '#35261B',
                      border: `1px solid ${active ? '#C6923A' : '#C6B08E'}`,
                    }}
                  >
                    <div className="text-[11.5px] font-bold">{opt.label}</div>
                    <div className="text-[10px] opacity-75">{opt.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block">
            <div className="flex items-center justify-between text-[11.5px] font-semibold text-[#3B2A1E] mb-1">
              <span className="inline-flex items-center gap-1"><Wind size={12} /> Pastoral Wind Travel</span>
              <span className="font-mono">{Math.round(settings.windStrength * 100)}%</span>
            </div>
            <input
              type="range"
              min={30}
              max={170}
              value={Math.round(settings.windStrength * 100)}
              onChange={e => onChange({ ...settings, windStrength: Number(e.target.value) / 100 })}
              className="w-full cursor-pointer accent-[#B98632]"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[12px]">
            <label className="inline-flex items-center gap-1.5 cursor-pointer font-medium">
              <input
                type="checkbox"
                checked={settings.grainAndWrap}
                onChange={e => onChange({ ...settings, grainAndWrap: e.target.checked })}
              />
              <Sparkles size={12} /> Satsuei Paper Grain Match
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer font-medium">
              <input
                type="checkbox"
                checked={settings.showRigGuides}
                onChange={e => onChange({ ...settings, showRigGuides: e.target.checked })}
              />
              <Eye size={12} /> Show Live2D Mesh Guides
            </label>
          </div>
        </div>

        {/* Council Proposals & Standing Tensions (Deterministic localAdvice) */}
        <div className="mt-3.5 space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-[#7A634C] font-semibold">
            Council Direction Notes
          </div>
          {dir.deliberation.proposals.slice(0, 3).map(prop => (
            <div key={`${prop.personaId}-${prop.headline}`} className="p-2.5 rounded bg-[#FAF4E8] border border-[#D8C7AA] text-[12px]">
              <div className="font-bold text-[#35261B]" style={{ fontFamily: 'Georgia, serif' }}>
                {speakerName(prop.personaId)} — <span className="font-normal italic">{prop.headline}</span>
              </div>
              {prop.moves[0] && <p className="mt-1 text-[#4E3B2B] leading-snug">{prop.moves[0].text}</p>}
            </div>
          ))}
          {dir.deliberation.tensions[0] && (
            <div className="p-2 rounded bg-[#EFE5D1]/70 border-l-[3px] border-[#B86246] text-[11.5px] italic text-[#4E3B2B]">
              <strong>Council Tension:</strong> {dir.deliberation.tensions[0]}
            </div>
          )}
        </div>
      </DecklePaperCard>
    </div>
  );
};
