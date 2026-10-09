import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Info, ChevronDown, ChevronUp, Wrench, Scale, X } from 'lucide-react';
import { useAccountStanding } from '../../hooks/useAccountStanding';
import { durationLabel, LEVEL_TITLE } from '../../services/enforcement/standingCore';

const AppealCenter = lazy(() => import('./AppealCenter'));

/**
 * Fair Process banner. Mounted once near the app shell. Calm, non-scary: says what happened, what is
 * limited, until when, and offers "Fix it" + "Appeal". Renders nothing in good standing, except brief
 * explanations when a chat send is limited (pj:standing-notice from services/enforcement/dmGuard.ts)
 * or when another surface asks to open the Appeal Center (pj:open-appeal-center).
 */
const COLLAPSE_KEY = 'pj_standing_banner_collapsed';

const StandingBanner: React.FC = () => {
  const { caps, uid } = useAccountStanding();
  const [collapsed, setCollapsed] = useState(() => { try { return sessionStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } });
  const [center, setCenter] = useState<{ actionId: string | null; mode: 'fix' | 'appeal' | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const onNotice = (e: Event) => {
      const m = (e as CustomEvent).detail?.message;
      if (!m) return;
      setNotice(m);
      if (t) clearTimeout(t);
      t = setTimeout(() => setNotice(null), 8000);
    };
    const onOpen = (e: Event) => setCenter({ actionId: (e as CustomEvent).detail?.actionId ?? null, mode: (e as CustomEvent).detail?.mode ?? null });
    window.addEventListener('pj:standing-notice', onNotice);
    window.addEventListener('pj:open-appeal-center', onOpen);
    return () => { window.removeEventListener('pj:standing-notice', onNotice); window.removeEventListener('pj:open-appeal-center', onOpen); if (t) clearTimeout(t); };
  }, []);

  const setCol = (v: boolean) => { setCollapsed(v); try { sessionStorage.setItem(COLLAPSE_KEY, v ? '1' : '0'); } catch { /* ignore */ } };

  if (!uid) return null;
  const restricted = caps.level !== 'GOOD';
  const primary = caps.reasons.slice().sort((a, b) => (b.expiresAt ?? Infinity) - (a.expiresAt ?? Infinity))[0];
  const fixable = primary && !primary.withheld && primary.actionId !== 'legacy-suspension' && primary.status !== 'CORRECTION_PENDING';

  return (
    <>
      {notice && (
        <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[9997] max-w-md w-[calc(100%-32px)] px-4 py-3 text-xs text-white flex items-start gap-2 shadow-xl"
          style={{ background: '#1a1424', border: '1px solid var(--pj-border, rgba(255,255,255,0.12))', borderRadius: 'var(--pj-radius-lg, 24px)' }}>
          <Info size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--pj-lilac, #D0BCFF)' }} />
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="text-white/50 hover:text-white"><X size={12} /></button>
        </div>
      )}

      {restricted && (
        <div className="fixed top-[max(8px,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-[9996] w-[calc(100%-16px)] max-w-xl pointer-events-auto" role="region" aria-label="Account standing">
          {collapsed ? (
            <button onClick={() => setCol(false)} className="mx-auto flex items-center gap-2 px-3 py-1.5 text-[11px] text-white/85 shadow-lg"
              style={{ background: '#1a1424', border: '1px solid var(--pj-border, rgba(255,255,255,0.12))', borderRadius: 'var(--pj-radius-full, 999px)' }}>
              <Info size={12} style={{ color: 'var(--pj-lilac, #D0BCFF)' }} /> {LEVEL_TITLE[caps.level]} · {durationLabel(caps.expiresAt, Date.now())} <ChevronDown size={12} />
            </button>
          ) : (
            <div className="px-4 py-3 text-white shadow-xl space-y-2" style={{ background: '#1a1424', border: '1px solid var(--pj-border, rgba(255,255,255,0.12))', borderRadius: 'var(--pj-radius-lg, 24px)' }}>
              <div className="flex items-start gap-2">
                <Info size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--pj-lilac, #D0BCFF)' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{LEVEL_TITLE[caps.level]} <span className="font-normal text-white/50">· {durationLabel(caps.expiresAt, Date.now())}</span></p>
                  {primary && (
                    <p className="text-xs text-white/70 mt-0.5 break-words">
                      {primary.withheld ? primary.ruleText : <>
                        {primary.contentRef ? <>About your {primary.contentRef.kind}{primary.contentRef.snapshot ? <> "{primary.contentRef.snapshot.slice(0, 80)}{primary.contentRef.snapshot.length > 80 ? '…' : ''}"</> : null}: </> : null}
                        {primary.ruleText}
                      </>}
                      {caps.reasons.length > 1 ? <span className="text-white/40"> (+{caps.reasons.length - 1} more)</span> : null}
                    </p>
                  )}
                  <p className="text-xs text-white/55 mt-1">{caps.restrictions.slice(1).join(' ') || caps.restrictions[0]} You can still sign in, read and message.</p>
                </div>
                <button onClick={() => setCol(true)} aria-label="Collapse" className="p-1 text-white/40 hover:text-white"><ChevronUp size={14} /></button>
              </div>
              <div className="flex flex-wrap gap-2 pl-6">
                {fixable && (
                  <button onClick={() => setCenter({ actionId: primary!.actionId, mode: 'fix' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white text-black hover:bg-white/90"><Wrench size={12} /> Fix it</button>
                )}
                <button onClick={() => setCenter({ actionId: primary?.actionId ?? null, mode: primary && primary.status !== 'UNDER_REVIEW' && primary.actionId !== 'legacy-suspension' ? 'appeal' : null })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-white/20 hover:bg-white/5"><Scale size={12} /> Appeal</button>
                <button onClick={() => setCenter({ actionId: null, mode: null })} className="px-2 py-1.5 text-xs text-white/50 hover:text-white">Details</button>
              </div>
            </div>
          )}
        </div>
      )}

      {center && (
        <Suspense fallback={null}>
          <AppealCenter onClose={() => setCenter(null)} focusActionId={center.actionId} initialMode={center.mode} />
        </Suspense>
      )}
    </>
  );
};

export default StandingBanner;


export { openAppealCenter } from '../../services/enforcement/standingStore';
