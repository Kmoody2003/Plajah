import React, { useState } from 'react';
import { Lock, Globe, Info, ChevronDown, ExternalLink, Check, ShieldAlert } from 'lucide-react';
import {
  ContentLicenseId, LICENSES, ALL_LICENSE_IDS, DEFAULT_LICENSE,
  MonetizationContext, licenseConflict, getLicense,
} from '../services/licensingService';

/**
 * LicensePicker — optional, background license selector for the uploader.
 * Collapsed by default (creators who don't care never have to think about it);
 * defaults to All Rights Reserved. The platform gatekeeps which licenses are
 * valid given how the work is monetized (paywall / exclusivity), so a creator
 * can't pick a contradictory combination.
 *
 * Rendered only when the CONTENT_LICENSING flag is on — this component carries no
 * behavior of its own beyond surfacing the choice.
 */
const LicensePicker: React.FC<{
  value?: string;
  onChange: (id: ContentLicenseId) => void;
  context: MonetizationContext;
}> = ({ value, onChange, context }) => {
  const [open, setOpen] = useState(false);
  const current = getLicense((value as ContentLicenseId) || DEFAULT_LICENSE);

  return (
    <div className="rounded-3xl border border-white/10 overflow-hidden"
      style={{ background: 'linear-gradient(135deg, rgba(107,0,153,0.07), rgba(212,0,85,0.05) 60%, rgba(255,140,0,0.04))' }}>
      {/* Header / collapsed summary */}
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-4 p-5 text-left">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center border shrink-0"
            style={{ background: 'rgba(168,85,247,0.12)', borderColor: 'rgba(168,85,247,0.25)' }}>
            {current.isOpen ? <Globe size={18} className="text-purple-300" /> : <Lock size={18} className="text-white/60" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-xs font-black uppercase tracking-widest">Licensing</h4>
              <span className="text-[7px] font-black uppercase tracking-[0.2em] px-1.5 py-0.5 rounded-full bg-white/8 border border-white/12 text-white/55">Optional · Advanced</span>
            </div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/40 truncate mt-1">{current.label}</p>
          </div>
        </div>
        <ChevronDown size={18} className={`text-white/40 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-3">
          <p className="text-[10px] leading-relaxed text-white/45">
            Choose how others may use your work. Leave it <span className="font-black text-white/70">All Rights Reserved</span> (the default) to keep
            full control. Open licenses can grow your reach — but a Creative Commons grant is <span className="font-black text-white/70">permanent and cannot be undone</span>.
          </p>

          <div className="grid grid-cols-1 gap-2">
            {ALL_LICENSE_IDS.map(id => {
              const lic = LICENSES[id];
              const conflict = licenseConflict(id, context);
              const disabled = !!conflict;
              const selected = (value || DEFAULT_LICENSE) === id;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(id)}
                  title={conflict || lic.human}
                  className={`w-full text-left rounded-2xl border p-4 transition-all ${
                    selected ? 'border-purple-400/50 bg-purple-500/10'
                    : disabled ? 'border-white/5 bg-white/[0.02] opacity-45 cursor-not-allowed'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {lic.isOpen ? <Globe size={13} className="text-purple-300 shrink-0" /> : <Lock size={13} className="text-white/50 shrink-0" />}
                      <span className="text-[11px] font-black uppercase tracking-widest truncate">{lic.label}</span>
                      {id === 'ALL_RIGHTS_RESERVED' && <span className="text-[7px] font-black uppercase tracking-[0.2em] px-1.5 py-0.5 rounded-full bg-white/8 text-white/50">Default</span>}
                    </div>
                    {selected && <Check size={15} className="text-purple-300 shrink-0" />}
                  </div>
                  <p className="text-[9px] leading-relaxed text-white/45 mt-1.5">{lic.human}</p>
                  {disabled && (
                    <p className="text-[8px] leading-relaxed text-amber-400/80 mt-1.5 flex items-start gap-1.5">
                      <ShieldAlert size={10} className="shrink-0 mt-0.5" /> {conflict}
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          {/* Irrevocability acknowledgment for open licenses */}
          {current.isOpen && (
            <div className="flex items-start gap-2.5 px-3 py-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
              <ShieldAlert size={13} className="shrink-0 mt-0.5 text-amber-400" />
              <p className="text-[9px] leading-relaxed text-white/55">
                <span className="font-black text-amber-400/90">Permanent: </span>
                a Creative Commons grant can’t be revoked for copies already shared. You confirm you own these rights and
                accept this is irrevocable.
                <a href={current.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-black text-purple-300 underline ml-1 whitespace-nowrap">
                  License terms <ExternalLink size={9} />
                </a>
              </p>
            </div>
          )}

          <div className="flex items-center gap-1.5 px-1">
            <Info size={11} className="text-white/30 shrink-0" />
            <a href="https://creativecommons.org/share-your-work/" target="_blank" rel="noopener noreferrer"
              className="text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white/70 underline">
              Learn about Creative Commons
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export default LicensePicker;
