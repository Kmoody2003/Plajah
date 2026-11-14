// The three per-song rights questions, shared by the Creator and the Mastering Desk.

import React from 'react';
import { CLEARANCE_COPY, clearanceOf, type TrackRights } from '../../services/rights/trackClearance';

type Option<V extends string> = { value: V; label: string };

const TONE: Record<string, string> = { ok: '#06D6A0', warn: '#F59E0B', stop: '#EF4444', idle: 'rgba(255,255,255,0.55)' };

function Question<V extends string>({ label, name, value, options, onPick }: {
  label: string; name: string; value?: V; options: Option<V>[]; onPick: (v: V) => void;
}) {
  return (
    <fieldset className="min-w-0 border-0 p-0 m-0">
      <legend className="text-[11px] text-white/70 mb-1.5 p-0">{label}</legend>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            data-question={name}
            onClick={() => onPick(o.value)}
            className="min-h-8 px-2.5 py-1 rounded-lg text-[11px] border transition-colors"
            style={value === o.value
              ? { color: '#fff', borderColor: '#FF8C00', background: 'rgba(255,140,0,0.18)' }
              : { color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.12)', background: 'transparent' }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export const TrackRightsQuestions: React.FC<{ rights?: TrackRights; onChange: (next: TrackRights) => void }> = ({ rights, onChange }) => {
  const r = rights ?? {};
  const status = clearanceOf(r);
  const copy = CLEARANCE_COPY[status];
  const needsProof = r.writing === 'cowriters' || r.deal === 'publisher' || (!!r.source && r.source !== 'original');
  const proofLabel = r.source && r.source !== 'original'
    ? 'Who licensed it to you, and the licence number or date'
    : 'Who signed off, and when';

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-3" data-rights-status={status}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold text-white/85">Rights for this song</span>
        <span className="text-[11px] font-semibold shrink-0" style={{ color: TONE[copy.tone] }}>{copy.label}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Question label="Who wrote it?" name="writing" value={r.writing} onPick={(writing) => onChange({ ...r, writing })}
          options={[{ value: 'sole', label: 'Only me' }, { value: 'cowriters', label: 'Co-writers' }]} />
        <Question label="Is it a cover or does it use a sample?" name="source" value={r.source} onPick={(source) => onChange({ ...r, source })}
          options={[{ value: 'original', label: 'All original' }, { value: 'cover', label: 'Cover' }, { value: 'sample', label: 'Has a sample' }]} />
        <Question label="Publisher or exclusive deal?" name="deal" value={r.deal} onPick={(deal) => onChange({ ...r, deal })}
          options={[{ value: 'none', label: 'None' }, { value: 'publisher', label: 'Yes' }]} />
      </div>
      {needsProof && (
        <label className="block">
          <span className="block text-[11px] text-white/70 mb-1.5">{proofLabel}</span>
          <input
            value={r.proof ?? ''}
            onChange={(e) => onChange({ ...r, proof: e.target.value })}
            className="w-full h-9 px-2.5 rounded-lg bg-black/35 border border-white/10 text-[12px] text-white placeholder-white/25 outline-none focus:border-[#FF8C00]/60"
          />
        </label>
      )}
      <p className="text-[11px] leading-snug text-white/50 m-0">{copy.detail}</p>
    </div>
  );
};
