// DiscoverySettings — privacy controls for people discovery. Everything here is OPT-IN/OUT by the
// user; location is OFF by default, typed by the user (coarse, e.g. "Detroit, MI") and only ever
// matched when BOTH people opted in. We never read weatherCity / lat / lon / GPS for this.
//
// Usage: <DiscoverySettings viewer={userProfile} onSaved={(patch) => setUserProfile(p => ({ ...p, ...patch }))} />

import React, { useState } from 'react';
import type { UserProfile } from '../../types';
import { updateUserProfile } from '../../services/backendService';
import { clearDiscoveryCache, normRegion } from '../../services/discoveryService';

type Patch = Partial<Pick<UserProfile, 'hideFromSuggestions' | 'discoverByRegion' | 'discoveryRegion' | 'discoveryRegionKey' | 'sayHiOptOut'>>;

export interface DiscoverySettingsProps {
  viewer: UserProfile;
  /** Called with the fields just saved so the parent can merge them into its profile state. */
  onSaved?: (patch: Patch) => void;
  className?: string;
}

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }> = ({ on, onChange, label, hint, disabled }) => (
  <label className={`flex items-start gap-3 py-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
    <span className="mr-auto min-w-0">
      <span className="block text-[14px] font-bold text-white">{label}</span>
      {hint && <span className="block text-[12px] text-white/50 leading-snug mt-0.5">{hint}</span>}
    </span>
    <button
      type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${on ? 'bg-gradient-to-r from-[#D40055] to-[#FF8C00]' : 'bg-white/15'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  </label>
);

const DiscoverySettings: React.FC<DiscoverySettingsProps> = ({ viewer, onSaved, className = '' }) => {
  const [state, setState] = useState({
    suggestMe: !viewer.hideFromSuggestions,
    byRegion: !!viewer.discoverByRegion,
    region: viewer.discoveryRegion || '',
    sayHi: !viewer.sayHiOptOut,
  });
  const [status, setStatus] = useState<string | null>(null);

  const save = async (patch: Patch) => {
    setStatus('Saving…');
    try {
      await updateUserProfile(viewer.uid, patch as Partial<UserProfile>);
      clearDiscoveryCache(viewer.uid);
      onSaved?.(patch);
      setStatus('Saved');
    } catch {
      setStatus("Couldn't save — try again.");
    }
    setTimeout(() => setStatus(null), 2000);
  };

  const saveRegion = (text: string) => {
    const clean = text.trim().slice(0, 60);
    setState(s => ({ ...s, region: clean }));
    return save({ discoveryRegion: clean, discoveryRegionKey: normRegion(clean) });
  };

  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.03] px-4 divide-y divide-white/10 ${className}`}>
      <div className="py-3">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/45">Discovery &amp; privacy</p>
      </div>
      <Toggle
        on={state.suggestMe} label="Suggest me to others"
        hint="Show your profile in 'people to follow' and Find people. People can still find you by searching your name."
        onChange={v => { setState(s => ({ ...s, suggestMe: v })); save({ hideFromSuggestions: !v }); }}
      />
      <Toggle
        on={state.byRegion} label="Use my region to find people near me"
        hint="Off by default. Uses only the region you type below — never your device location. You only match people who also turned this on."
        onChange={v => { setState(s => ({ ...s, byRegion: v })); save({ discoverByRegion: v, discoveryRegion: state.region.trim(), discoveryRegionKey: normRegion(state.region) }); }}
      />
      {state.byRegion && (
        <div className="py-3">
          <label className="block text-[12px] text-white/60 mb-1.5" htmlFor="discovery-region">Your region (keep it coarse, e.g. “Detroit, MI”)</label>
          <input
            id="discovery-region" value={state.region} maxLength={60} placeholder="City, State or region"
            onChange={e => setState(s => ({ ...s, region: e.target.value }))}
            onBlur={e => { if (e.target.value.trim() !== (viewer.discoveryRegion || '')) saveRegion(e.target.value); }}
            className="w-full rounded-xl bg-white/[0.06] border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-white/30"
          />
        </div>
      )}
      <Toggle
        on={state.sayHi} label="Allow 'Say hi'"
        hint="Let people send you a friendly one-way hello. Turn off to stop receiving them."
        onChange={v => { setState(s => ({ ...s, sayHi: v })); save({ sayHiOptOut: !v }); }}
      />
      <div className="py-2 h-7 text-[11px] text-white/50" aria-live="polite">{status}</div>
    </div>
  );
};

export default DiscoverySettings;
export { DiscoverySettings };
