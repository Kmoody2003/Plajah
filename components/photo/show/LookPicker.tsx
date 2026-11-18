// Grade + lens for a Themed Show — the platform's own pickers (the cinematic LUT strip from
// Go Live / Reello / Cinema and the lens picker from the players), for the whole show or one
// photo. Looks always render under the show's text.

import React from 'react';
import { LutStrip } from '../../live/LiveMediaSheet';
import { LensPicker } from '../../LensVideoOverlay';
import { getLutById } from '../../../services/color/cinematicLutLibrary';
import type { LensId } from '../../../services/lenses/lensEngine';
import type { ShowLook } from '../../../services/slideshow/types';
import { Button } from '../../ui';

interface Props {
  look: ShowLook | undefined;
  onChange: (look: ShowLook | undefined) => void;
  /** Per-photo: offer "Same as the show". */
  inherits?: boolean;
}

export default function LookPicker({ look, onChange, inherits }: Props) {
  const lut = look?.lut;
  const lens = (look?.lens || 'none') as LensId;
  const set = (patch: Partial<ShowLook>) => {
    const next = { ...(look || {}), ...patch };
    const empty = !next.lut && (!next.lens || next.lens === 'none');
    onChange(empty ? undefined : next);
  };
  return (
    <div className="pj-stack-2">
      <div className="flex items-center justify-between gap-2">
        <span className="type-label-md" style={{ color: 'var(--on-surface-variant)' }}>
          {lut ? `${getLutById(lut)?.name ?? lut}` : inherits ? 'Same as the show' : 'No grade'}
          {lens !== 'none' ? ` · lens` : ''}
        </span>
        {(lut || lens !== 'none') && <Button size="xs" variant="ghost" onClick={() => onChange(undefined)}>{inherits ? 'Use show look' : 'Clear'}</Button>}
      </div>
      <LutStrip lookId={lut ? `lut:${lut}` : ''} onPick={(id) => set({ lut: lut === id ? undefined : id })} />
      {lut && (
        <label className="flex items-center gap-2 type-label-md" style={{ color: 'var(--on-surface-variant)' }}>
          Strength {Math.round((look?.lutStrength ?? 1) * 100)}%
          <input type="range" min={0} max={100} value={Math.round((look?.lutStrength ?? 1) * 100)} onChange={(e) => set({ lutStrength: +e.target.value / 100 })} className="flex-1 accent-[var(--pj-orange)]" />
        </label>
      )}
      <div className="pt-1">
        <p className="pj-eyebrow pb-1.5">Lens</p>
        <div className="overflow-x-auto pb-1 [scrollbar-width:none]">
          <LensPicker compact value={lens} onChange={(id) => set({ lens: id })} />
        </div>
      </div>
    </div>
  );
}
