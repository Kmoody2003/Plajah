// The inspector, about the shader that is selected.
//
// The mockup's right rail is not a set of docked tabs — it is the properties of whatever is
// selected. With a shader look on the canvas that is: what it is (name, series, the one line),
// the controls it actually reads, and which band drives which part of the picture.
//
// Every control here is wired to something real. The sliders set iParam0..3, which ShaderLayer
// reads; the reactivity map is the work's own declared band mapping. Nothing here is decorative —
// a slider that moved nothing would be exactly the fault this whole pass has been removing.

import React from 'react';
import { ChevronRight, Power } from 'lucide-react';
import { ReactivityMap } from './index';
import { InspectorGroup } from './shell';
import type { ShaderLibraryEntry } from '../components/ShaderPanel';

interface Props {
  work: ShaderLibraryEntry;
  /** Current iParam0..3, owned by the studio and read by the main ShaderLayer. */
  params: number[];
  onParam: (index: number, value: number) => void;
  /** Open the GLSL editor / full controls — the "Full" footer of the mockup. */
  onOpenSource?: () => void;
  /** Take the look off the canvas. */
  onOff?: () => void;
}

export const ShaderInspector: React.FC<Props> = ({ work, params, onParam, onOpenSource, onOff }) => {
  const controls = work.params ?? [];

  return (
    <div>
      {/* What is selected. The header the mockup leads with. */}
      <div className="px-3 py-2.5 border-b border-white/[0.08]">
        <p className="type-label-sm uppercase tracking-[0.14em]" style={{ color: 'var(--pj-orange)' }}>
          Selected · Shader layer
        </p>
        <p className="type-title-md font-bold text-white truncate mt-0.5">{work.name}</p>
        {(work.series || work.setTitle) && (
          <p className="type-label-sm uppercase tracking-[0.12em] text-white/30 mt-0.5">
            {work.series ? `Series ${work.series}` : ''}{work.series && work.setTitle ? ' · ' : ''}{work.setTitle ?? ''}
          </p>
        )}
        {work.line && <p className="type-body-sm text-white/45 leading-snug mt-1.5">{work.line}</p>}
      </div>

      {/* Controls — named per work, wired to iParam0..3. */}
      {controls.length > 0 && (
        <InspectorGroup label="Controls" aside={String(controls.length)}>
          <div className="flex flex-col gap-2">
            {controls.map((c, i) => (
              <label key={c.name} className="flex items-center gap-2.5">
                <span className="type-body-sm text-white/60 flex-1 truncate">{c.name}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.001}
                  value={params[i] ?? c.def}
                  onChange={e => onParam(i, parseFloat(e.target.value))}
                  className="pj-range pj-range--dense w-[92px]"
                  aria-label={c.name}
                />
              </label>
            ))}
          </div>
        </InspectorGroup>
      )}

      {/* Reacts to — the work's declared band mapping. The one thing that makes these shaders
          different, so if it is never shown it may as well not be true. */}
      {work.reacts && work.reacts.length > 0 && (
        <InspectorGroup label="Reacts to" aside="live">
          <ReactivityMap rows={work.reacts} />
        </InspectorGroup>
      )}

      {work.license && (
        <div className="px-3 py-2 border-b border-white/[0.08]">
          <p className="type-body-sm text-white/30 truncate">
            {work.license}{work.credit ? ` · ${work.credit}` : ''}
          </p>
        </div>
      )}

      {/* The Full footer: deeper controls, one disclosure away rather than in your face. */}
      <div className="flex items-center">
        {onOpenSource && (
          <button
            onClick={onOpenSource}
            className="flex-1 flex items-center gap-1.5 px-3 py-2 text-left hover:bg-white/[0.04] transition-colors"
          >
            <ChevronRight className="w-3 h-3 text-white/30" />
            <span className="type-label-sm uppercase tracking-[0.14em] text-white/40">Automation · MIDI · GLSL</span>
          </button>
        )}
        {onOff && (
          <button
            onClick={onOff}
            title="Take the look off"
            aria-label="Take the look off"
            className="px-3 py-2 text-white/30 hover:text-white transition-colors"
          >
            <Power className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

export default ShaderInspector;
