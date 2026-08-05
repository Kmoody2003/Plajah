import React, { useEffect, useState } from 'react';
import { Lock, Globe, Gem, DollarSign } from 'lucide-react';
import { SanctuaryGate, SanctuaryTier, SanctuaryAccessType } from '../../types';
import { resolveGateAccess } from '../../services/sanctuaryService';
import { purchaseSanctuaryUnlock } from '../../services/stripeService';
import { SANCTUARY_THEME } from './SanctuaryIdentity';

// ─── Access hook ────────────────────────────────────────────────────────────────
// Resolve whether the current viewer can see a gated item. Runs only when a gate
// is present, so ungated content pays nothing.
export function useGateAccess(gate: SanctuaryGate | undefined, itemId: string) {
  const [state, setState] = useState<{ loading: boolean; allowed: boolean }>({ loading: !!gate, allowed: !gate });
  useEffect(() => {
    let live = true;
    if (!gate) { setState({ loading: false, allowed: true }); return; }
    setState({ loading: true, allowed: false });
    resolveGateAccess(gate, itemId).then(allowed => { if (live) setState({ loading: false, allowed }); });
    return () => { live = false; };
  }, [gate?.sanctuaryId, gate?.accessType, itemId]);
  return state;
}

// ─── Lock overlay (players render this when access is denied) ────────────────────
export const SanctuaryGateLock: React.FC<{
  gate: SanctuaryGate;
  itemId: string;
  itemTitle?: string;
  onVisitSanctuary?: (sanctuaryId: string) => void;
  className?: string;
}> = ({ gate, itemId, itemTitle, onVisitSanctuary, className = '' }) => {
  const [busy, setBusy] = useState(false);
  const unlock = async () => {
    setBusy(true);
    try { await purchaseSanctuaryUnlock({ creatorId: gate.sanctuaryId, itemId, itemType: 'CONTENT', itemTitle, price: gate.oneTimePrice || 0 }); }
    catch { setBusy(false); }
  };
  return (
    <div className={`relative rounded-2xl overflow-hidden flex flex-col items-center justify-center text-center p-6 gap-3 min-h-[180px] ${className}`}
      style={{ background: SANCTUARY_THEME.heroGradient, border: `1px solid ${SANCTUARY_THEME.line}` }}>
      {gate.previewUrl && <img src={gate.previewUrl} className="absolute inset-0 w-full h-full object-cover opacity-20" alt="" />}
      <div className="absolute inset-0" style={{ background: SANCTUARY_THEME.goldSheen }} />
      <div className="relative w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${SANCTUARY_THEME.line}` }}>
        <Lock size={20} style={{ color: SANCTUARY_THEME.gold }} />
      </div>
      <div className="relative">
        <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: SANCTUARY_THEME.goldSoft }}>
          {gate.label || (gate.accessType === 'ONE_TIME' ? 'Unlock this' : 'Sanctuary members only')}
        </p>
        {itemTitle && <p className="text-[9px] text-white/40 uppercase tracking-widest mt-1 max-w-[220px] truncate">{itemTitle}</p>}
      </div>
      <div className="relative flex items-center gap-2">
        {gate.accessType === 'ONE_TIME' ? (
          <button onClick={unlock} disabled={busy}
            className="px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest text-black disabled:opacity-40" style={{ background: SANCTUARY_THEME.gold }}>
            {busy ? 'Opening…' : `Unlock · $${gate.oneTimePrice}`}
          </button>
        ) : (
          <button onClick={() => onVisitSanctuary?.(gate.sanctuaryId)}
            className="px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest"
            style={{ color: SANCTUARY_THEME.goldSoft, background: 'rgba(0,0,0,0.4)', border: `1px solid ${SANCTUARY_THEME.line}` }}>
            <Gem size={11} className="inline mr-1" style={{ color: SANCTUARY_THEME.gold }} /> Enter Sanctuary
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Gate picker (publishers attach a gate) ─────────────────────────────────────
export const SanctuaryGatePicker: React.FC<{
  sanctuaryId: string;
  tiers?: SanctuaryTier[];
  value?: SanctuaryGate;
  onChange: (gate: SanctuaryGate | undefined) => void;
}> = ({ sanctuaryId, tiers = [], value, onChange }) => {
  const access: SanctuaryAccessType | 'OFF' = value?.accessType ?? 'OFF';
  const set = (a: SanctuaryAccessType | 'OFF') => {
    if (a === 'OFF') return onChange(undefined);
    if (a === 'ONE_TIME') return onChange({ sanctuaryId, accessType: 'ONE_TIME', oneTimePrice: value?.oneTimePrice || 3 });
    if (a === 'TIER') return onChange({ sanctuaryId, accessType: 'TIER', requiredTierIds: value?.requiredTierIds || [] });
    onChange({ sanctuaryId, accessType: 'FREE' });
  };
  const opts: { a: SanctuaryAccessType | 'OFF'; label: string; icon: React.ReactNode }[] = [
    { a: 'OFF', label: 'Public', icon: <Globe size={11} /> },
    { a: 'TIER', label: 'Members', icon: <Gem size={11} /> },
    { a: 'ONE_TIME', label: 'Paid', icon: <DollarSign size={11} /> },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[8px] font-black uppercase tracking-[0.2em]" style={{ color: SANCTUARY_THEME.gold }}>Gate</span>
      <div className="flex items-center gap-1">
        {opts.map(o => {
          const active = access === o.a;
          return (
            <button key={o.a} type="button" onClick={() => set(o.a)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all"
              style={active ? { color: '#000', background: SANCTUARY_THEME.gold } : { color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.1)' }}>
              {o.icon} {o.label}
            </button>
          );
        })}
      </div>
      {access === 'ONE_TIME' && (
        <div className="flex items-center gap-0.5 px-2 py-1 rounded-lg bg-black/40 border border-white/10">
          <span className="text-white/40 text-xs">$</span>
          <input type="number" min={1} value={value?.oneTimePrice ?? 3}
            onChange={e => onChange({ sanctuaryId, accessType: 'ONE_TIME', oneTimePrice: Number(e.target.value) })}
            className="w-10 bg-transparent text-xs outline-none tabular-nums" />
        </div>
      )}
      {access === 'TIER' && tiers.length > 0 && (
        <select
          value={(value?.requiredTierIds && value.requiredTierIds[0]) || ''}
          onChange={e => onChange({ sanctuaryId, accessType: 'TIER', requiredTierIds: e.target.value ? [e.target.value] : [] })}
          className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-[10px] outline-none">
          <option value="">Any member</option>
          {tiers.map(t => <option key={t.id} value={t.id}>{t.name}+</option>)}
        </select>
      )}
    </div>
  );
};
