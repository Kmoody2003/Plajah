// OrgSwitcher — the dropdown for people in more than one Elevate org. Lists every org across the accounts
// saved on this device; an org owned by another account switches the signed-in account to it, then opens it.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check, ArrowLeftRight } from 'lucide-react';
import { useMyElevateOrgs, switchableOrgs, openSwitchableOrg, rememberRosterOrgs, type SwitchableOrg } from '../../services/elevateHome';
import { EV } from './vellum';

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

const Logo: React.FC<{ name: string; url?: string; size?: number }> = ({ name, url, size = 28 }) => (
  <span className="shrink-0 rounded-lg flex items-center justify-center overflow-hidden text-white font-black"
    style={{ width: size, height: size, fontSize: size * 0.4, background: EV.violet }}>
    {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : initials(name)}
  </span>
);

export const OrgSwitcher: React.FC<{
  uid: string | undefined;
  currentOrgId: string;
  currentOrgName: string;
  currentLogoUrl?: string;
  /** 'card': the pillar's full-width org card. 'chip': compact, for the org page's top bar. */
  variant?: 'card' | 'chip';
  /** Sub line under the name on the card. */
  sub?: string;
  /** Clicking the card itself (only one org). */
  onOpenCurrent?: () => void;
}> = ({ uid, currentOrgId, currentOrgName, currentLogoUrl, variant = 'card', sub, onOpenCurrent }) => {
  const { orgs: mine, loaded } = useMyElevateOrgs(uid);
  useEffect(() => { if (uid && loaded) rememberRosterOrgs(uid, mine); }, [uid, loaded, mine]);
  const all = useMemo(() => switchableOrgs(uid, mine), [uid, mine]);
  const others = all.filter(o => o.orgId !== currentOrgId || !o.current);
  const multi = others.length > 0;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  if (variant === 'chip' && !multi) return null;

  const pick = async (o: SwitchableOrg) => {
    setBusy(o.orgId);
    try { await openSwitchableOrg(o); setOpen(false); } catch { /* sign-in cancelled */ } finally { setBusy(null); }
  };

  const trigger = variant === 'card' ? (
    <button type="button" onClick={() => (multi ? setOpen(v => !v) : onOpenCurrent?.())} aria-haspopup={multi ? 'listbox' : undefined} aria-expanded={multi ? open : undefined}
      className="w-full flex items-center gap-2.5 p-2 rounded-2xl bg-white/[0.04] border border-white/10 hover:bg-white/[0.07] text-left transition-colors">
      <Logo name={currentOrgName} url={currentLogoUrl} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-bold text-white truncate">{currentOrgName}</span>
        {sub && <span className="block text-[11px] text-white/50 truncate">{sub}</span>}
      </span>
      {multi ? <ChevronDown size={15} className={`text-white/50 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} /> : null}
    </button>
  ) : (
    <button type="button" onClick={() => setOpen(v => !v)} aria-haspopup="listbox" aria-expanded={open} title="Switch organization"
      className="ev-btn ev-btn-ghost" style={{ minHeight: 36, padding: '0 12px', fontSize: 13 }}>
      <ArrowLeftRight size={13} /> Switch org
    </button>
  );

  return (
    <div ref={ref} className="relative" data-testid={`org-switcher-${variant}`}>
      {trigger}
      {open && (
        <div role="listbox" aria-label="Your organizations"
          className={`absolute z-[80] mt-2 rounded-2xl border shadow-2xl p-1.5 ${variant === 'card' ? 'left-0 right-0' : 'right-0 w-72'}`}
          style={{ background: EV.panel, borderColor: EV.line }}>
          <p className="px-2.5 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">Your organizations</p>
          {all.map(o => {
            const here = o.orgId === currentOrgId && o.current;
            return (
              <button key={`${o.uid}:${o.orgId}`} role="option" aria-selected={here} disabled={here || busy !== null} onClick={() => pick(o)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors ${here ? 'bg-white/[0.06]' : 'hover:bg-white/[0.06]'} disabled:cursor-default`}>
                <Logo name={o.name} url={o.logoUrl} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-white truncate">{o.name}</span>
                  <span className="block text-[11px] truncate" style={{ color: o.current ? EV.muted : EV.violetText }}>
                    {o.current ? (o.email || 'This account') : `Switches to ${o.email}`}
                  </span>
                </span>
                {here ? <Check size={14} className="text-white/70 shrink-0" /> : busy === o.orgId ? <span className="w-3.5 h-3.5 rounded-full border-2 border-white/20 border-t-white animate-spin shrink-0" /> : null}
              </button>
            );
          })}
          <button onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('plajah:elevate-browse')); }}
            className="w-full mt-1 px-2.5 py-2 rounded-xl text-left text-[12px] font-semibold hover:bg-white/[0.06]" style={{ color: EV.violetText }}>
            Browse all organizations →
          </button>
        </div>
      )}
    </div>
  );
};

export default OrgSwitcher;
