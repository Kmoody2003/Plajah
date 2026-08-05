// FilmDistributionStep — the film/TV distribution + release options, folded into the main
// project uploader (AlbumCreator) so "Distribute New Film" no longer needs a separate
// wizard. Collects the monetization model, pricing, rental window, release strategy, FAST
// channel, watch party, and content rating — the core the old FilmOnboardingWizard had.
// The deep tools (territories, rights docs, aggregator export) stay in the Film
// Distribution Hub; this is the create-time essentials. Controlled via value + onChange.

import React, { useState } from 'react';
import { Tv, DollarSign, Calendar, Users, Radio, Lock, Zap, Clapperboard, ChevronDown, Globe, FileCheck, Send, Award } from 'lucide-react';
import type { FilmDistribution } from '../types';

// Deep distribution tools that live in the Film Distribution Hub (available after publish).
const ADVANCED = [
  { icon: Globe,     label: 'Territories & windows', desc: 'Region availability, rental/sale windows, promo pricing' },
  { icon: FileCheck, label: 'Rights & docs',         desc: 'E&O insurance, chain-of-title, music licenses, captions' },
  { icon: Send,      label: 'Aggregator export',     desc: 'Metadata for Apple TV, Amazon, Tubi, FilmHub…' },
  { icon: Award,     label: 'Festival & premieres',  desc: 'Screenings, ticketed premieres, watch parties' },
];

export const DEFAULT_FILM_DISTRIBUTION: FilmDistribution = {
  model: 'FREE_FAST', release: 'NOW', rentalPrice: 3.99, purchasePrice: 12.99,
  rentalWindowHrs: 48, fastChannel: true, watchParty: false, contentRating: 'NR',
};

const MODELS: { id: FilmDistribution['model']; label: string; desc: string; icon: any }[] = [
  { id: 'FREE_FAST', label: 'Free · FAST', desc: 'Ad-supported, free to watch', icon: Radio },
  { id: 'RENTAL',    label: 'Rental',      desc: 'Time-limited paid view', icon: Calendar },
  { id: 'PURCHASE',  label: 'Buy',         desc: 'Own it forever', icon: DollarSign },
  { id: 'HYBRID',    label: 'Rent + Buy',  desc: 'Both options', icon: Clapperboard },
  { id: 'PPV',       label: 'PPV Premiere',desc: 'Ticketed event', icon: Zap },
];

const RELEASES: { id: FilmDistribution['release']; label: string; desc: string; icon: any }[] = [
  { id: 'NOW',          label: 'Release now',  desc: 'Live on Taleo immediately', icon: Tv },
  { id: 'SCHEDULED',    label: 'Schedule',     desc: 'Pick a premiere date', icon: Calendar },
  { id: 'EARLY_ACCESS', label: 'Early access', desc: 'Press/festival codes first', icon: Lock },
  { id: 'PRIVATE',      label: 'Private',      desc: 'Members / unlisted only', icon: Lock },
];

const RATINGS = ['NR', 'G', 'PG', 'PG-13', 'R', 'NC-17', 'TV-G', 'TV-PG', 'TV-14', 'TV-MA'];

const FilmDistributionStep: React.FC<{ value: FilmDistribution; onChange: (v: FilmDistribution) => void }> = ({ value, onChange }) => {
  const v = { ...DEFAULT_FILM_DISTRIBUTION, ...value };
  const set = (patch: Partial<FilmDistribution>) => onChange({ ...v, ...patch });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const paid = v.model !== 'FREE_FAST';
  const showRental = v.model === 'RENTAL' || v.model === 'HYBRID';
  const showBuy = v.model === 'PURCHASE' || v.model === 'HYBRID' || v.model === 'PPV';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Clapperboard size={15} className="text-small-orange" />
        <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-small-orange">Distribution &amp; Release</h3>
        <span className="text-[9px] text-white/30">· goes live on Taleo</span>
      </div>
      <p className="text-[10px] text-white/35 -mt-3">All optional — sensible defaults are set. Refine any of this now, or anytime later in the Film Distribution Hub.</p>

      {/* Monetization model */}
      <div className="space-y-3">
        <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">How do fans watch it?</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {MODELS.map(m => {
            const on = v.model === m.id;
            return (
              <button key={m.id} type="button" onClick={() => set({ model: m.id, fastChannel: m.id === 'FREE_FAST' ? true : v.fastChannel })}
                className={`text-left p-3 rounded-2xl border transition-all ${on ? 'bg-white text-black border-white shadow-xl' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'}`}>
                <m.icon size={16} className={on ? 'text-black' : 'text-small-orange'} />
                <div className="text-[11px] font-black mt-1.5">{m.label}</div>
                <div className={`text-[9px] ${on ? 'text-black/60' : 'text-white/35'}`}>{m.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Pricing (when paid) */}
      {paid && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {showRental && (
            <div className="space-y-2">
              <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">Rental price ($)</label>
              <input type="number" step="0.01" value={v.rentalPrice ?? 0} onChange={e => set({ rentalPrice: parseFloat(e.target.value) || 0 })}
                className="w-full bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-3 text-white font-bold focus:outline-none focus:ring-4 focus:ring-white/5" />
            </div>
          )}
          {showRental && (
            <div className="space-y-2">
              <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">Rental window</label>
              <div className="flex gap-1.5">
                {([24, 48, 72] as const).map(h => (
                  <button key={h} type="button" onClick={() => set({ rentalWindowHrs: h })}
                    className={`flex-1 py-3 rounded-xl text-[10px] font-black border transition-all ${v.rentalWindowHrs === h ? 'bg-small-orange text-white border-small-orange' : 'bg-white/5 border-white/10 text-white/40'}`}>{h}h</button>
                ))}
              </div>
            </div>
          )}
          {showBuy && (
            <div className="space-y-2">
              <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">{v.model === 'PPV' ? 'Ticket price ($)' : 'Buy price ($)'}</label>
              <input type="number" step="0.01" value={v.purchasePrice ?? 0} onChange={e => set({ purchasePrice: parseFloat(e.target.value) || 0 })}
                className="w-full bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-3 text-white font-bold focus:outline-none focus:ring-4 focus:ring-white/5" />
            </div>
          )}
        </div>
      )}

      {/* Release strategy */}
      <div className="space-y-3">
        <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">When &amp; to whom?</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {RELEASES.map(r => {
            const on = v.release === r.id;
            return (
              <button key={r.id} type="button" onClick={() => set({ release: r.id })}
                className={`text-left p-3 rounded-2xl border transition-all ${on ? 'bg-white text-black border-white shadow-xl' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'}`}>
                <r.icon size={15} className={on ? 'text-black' : 'text-small-orange'} />
                <div className="text-[11px] font-black mt-1.5">{r.label}</div>
                <div className={`text-[9px] ${on ? 'text-black/60' : 'text-white/35'}`}>{r.desc}</div>
              </button>
            );
          })}
        </div>
        {v.release === 'SCHEDULED' && (
          <input type="datetime-local"
            value={v.releaseAt ? new Date(v.releaseAt).toISOString().slice(0, 16) : ''}
            onChange={e => set({ releaseAt: e.target.value ? new Date(e.target.value).getTime() : undefined })}
            className="w-full bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-3 text-white font-bold focus:outline-none focus:ring-4 focus:ring-white/5" />
        )}
      </div>

      {/* Add-ons + rating */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Toggle label="FAST channel" sub="Also run free on the 24/7 channel" icon={<Radio size={15} />} on={!!v.fastChannel} onToggle={() => set({ fastChannel: !v.fastChannel })} />
        <Toggle label="Premiere watch party" sub="Host a live group premiere" icon={<Users size={15} />} on={!!v.watchParty} onToggle={() => set({ watchParty: !v.watchParty })} />
        <div className="p-4 bg-white/[0.03] border border-white/10 rounded-2xl space-y-2">
          <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">Content rating</label>
          <select value={v.contentRating} onChange={e => set({ contentRating: e.target.value })}
            className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-white font-bold focus:outline-none">
            {RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      {/* Advanced (optional) — the deep tools, refined in the Film Distribution Hub after publish. */}
      <div className="border-t border-white/10 pt-4">
        <button type="button" onClick={() => setShowAdvanced(s => !s)}
          className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/45 hover:text-white transition-colors">
          <ChevronDown size={13} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} /> Advanced distribution <span className="text-white/25">· optional</span>
        </button>
        {showAdvanced && (
          <div className="mt-3 space-y-2">
            <p className="text-[10px] text-white/35">These open in the <b className="text-white/60">Film Distribution Hub</b> once your film is saved or published — none are required to go live.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ADVANCED.map(a => (
                <div key={a.label} className="flex items-start gap-2.5 p-3 bg-white/[0.02] border border-white/10 rounded-xl">
                  <a.icon size={15} className="text-small-orange mt-0.5 shrink-0" />
                  <div>
                    <div className="text-[11px] font-black">{a.label}</div>
                    <div className="text-[9px] text-white/35">{a.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Toggle: React.FC<{ label: string; sub: string; icon: React.ReactNode; on: boolean; onToggle: () => void }> = ({ label, sub, icon, on, onToggle }) => (
  <div className="p-4 bg-white/[0.03] border border-white/10 rounded-2xl flex items-center justify-between gap-3">
    <div className="flex items-center gap-3 min-w-0">
      <span className="text-small-orange shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px] font-black uppercase tracking-widest">{label}</div>
        <div className="text-[9px] text-white/35">{sub}</div>
      </div>
    </div>
    <button type="button" onClick={onToggle} className={`w-11 h-6 rounded-full transition-all relative shrink-0 ${on ? 'bg-small-orange' : 'bg-white/10'}`}>
      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  </div>
);

export default FilmDistributionStep;
