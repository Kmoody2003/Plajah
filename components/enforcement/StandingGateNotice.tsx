import React from 'react';
import { Info } from 'lucide-react';
import { useAccountStanding } from '../../hooks/useAccountStanding';
import { allows, durationLabel, CAPABILITY_LABEL, type CapabilityKey } from '../../services/enforcement/standingCore';
import { openAppealCenter } from '../../services/enforcement/standingStore';

/**
 * Inline "disabled, and here's why" note for a gated control. Renders nothing when allowed.
 * Pair it with `useStandingAllows(cap)` to disable the control itself (never hide it).
 */
export function useStandingAllows(cap: CapabilityKey): boolean {
  const { caps } = useAccountStanding();
  return allows(caps, cap);
}

const StandingGateNotice: React.FC<{ cap: CapabilityKey; className?: string }> = ({ cap, className }) => {
  const { caps } = useAccountStanding();
  if (allows(caps, cap)) return null;
  const r = caps.reasons[0];
  return (
    <div role="note" className={`flex items-start gap-2 px-3 py-2 text-[11px] text-white/80 ${className || ''}`}
      style={{ background: 'var(--pj-info-soft, rgba(59,130,246,0.12))', border: '1px solid var(--pj-border, rgba(255,255,255,0.1))', borderRadius: 'var(--pj-radius-md, 16px)' }}>
      <Info size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--pj-lilac, #D0BCFF)' }} />
      <span className="flex-1">
        You can't {CAPABILITY_LABEL[cap]} right now ({durationLabel(caps.expiresAt, Date.now())}){r && !r.withheld ? ` — ${r.ruleText}` : '.'}{' '}
        <button type="button" onClick={() => openAppealCenter(r?.actionId ?? null, null)} className="underline font-semibold hover:text-white">Fix it or appeal</button>
      </span>
    </div>
  );
};

export default StandingGateNotice;

/**
 * Wraps a whole flow (e.g. Go Live). When the capability is paused the flow is replaced by a calm
 * explanation with a route to fix/appeal — the entry point stays visible and tappable.
 */
export const StandingGate: React.FC<{ cap: CapabilityKey; title: string; onClose: () => void; children: React.ReactNode }> = ({ cap, title, onClose, children }) => {
  const { caps } = useAccountStanding();
  if (allows(caps, cap)) return <>{children}</>;
  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-[#100c16] text-white p-5 space-y-3" onClick={e => e.stopPropagation()}
        style={{ border: '1px solid var(--pj-border, rgba(255,255,255,0.12))', borderRadius: 'var(--pj-radius-xl, 28px)' }}>
        <p className="text-base font-bold">{title}</p>
        <StandingGateNotice cap={cap} />
        <p className="text-xs text-white/55">You can still sign in, watch, read and message people while this is in place.</p>
        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-1.5 rounded-full text-xs font-semibold border border-white/20 hover:bg-white/5">Close</button>
        </div>
      </div>
    </div>
  );
};
