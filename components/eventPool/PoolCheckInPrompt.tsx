// PoolCheckInPrompt — automatic event check-in, with consent first.
//
// usePoolCheckIn(pool) runs while a pool (or event) page is open. During the event window, for a signed-in viewer
// who said yes once on this device, it takes ONE position reading, posts it, and the server answers yes/no and
// keeps only "checked in at <time>". No watchPosition, no background tracking, no trail. If the viewer is not there
// yet it tries again every few minutes while the page stays open and visible.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, Check, LocateFixed, X } from 'lucide-react';
import { Button } from '../ui/Button';
import type { PoolView } from '../../services/eventPool/poolCore';
import {
  poolApi, PoolApiError, readGeoConsent, writeGeoConsent, isCheckInDismissed, dismissCheckIn, currentPosition, geoPermissionState,
} from '../../services/eventPool/poolClient';

export type CheckInState =
  | 'inactive'       // nothing to do (no schedule / no place / not during the event / dismissed)
  | 'signed_out'
  | 'needs_consent'  // ask once, with the explanation
  | 'declined'       // said no on this device
  | 'locating'
  | 'checked_in'
  | 'outside'        // not at the venue yet (retrying while open)
  | 'blocked'        // the browser / OS denied location
  | 'unavailable';   // no fix right now

export interface PoolCheckIn {
  state: CheckInState;
  message?: string;
  checkedInAt?: number;
  /** The viewer agreed: remember it on this device and check in now. Triggers the browser's own permission prompt. */
  allow: () => void;
  /** "Not now" for this pool only. */
  dismiss: () => void;
  /** Never ask on this device (can be turned back on). */
  decline: () => void;
  retry: () => void;
}

const RETRY_MS = 5 * 60 * 1000;

export function usePoolCheckIn(pool: PoolView | null, opts: { onPool?: (p: PoolView) => void; retryMs?: number } = {}): PoolCheckIn {
  const [state, setState] = useState<CheckInState>('inactive');
  const [message, setMessage] = useState<string | undefined>();
  const [checkedInAt, setCheckedInAt] = useState<number | undefined>(pool?.me?.checkedInAt);
  const [nonce, setNonce] = useState(0);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPool = useRef(opts.onPool); onPool.current = opts.onPool;
  const retryMs = opts.retryMs ?? RETRY_MS;

  const poolId = pool?.id;
  const active = !!pool && pool.phase === 'open' && pool.hasFence;
  const already = !!pool?.me?.checkedIn;
  const signedIn = !!pool?.signedIn;

  const attempt = useCallback(async () => {
    if (!poolId || busy.current) return;
    busy.current = true;
    setState('locating'); setMessage(undefined);
    try {
      const pos = await currentPosition();
      const r = await poolApi.checkIn(poolId, { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) });
      setCheckedInAt(r.at); setState('checked_in');
      onPool.current?.(r.pool);
    } catch (e: any) {
      if (e instanceof PoolApiError) {
        const reason = e.data?.reason;
        if (reason === 'outside' || reason === 'inaccurate') { setState('outside'); setMessage(e.message); }
        else if (reason === 'not_open' || reason === 'closed' || reason === 'no_place' || reason === 'no_schedule') setState('inactive');
        else { setState('unavailable'); setMessage(e.message); }
      } else if (e?.code === 1) { setState('blocked'); setMessage('Location is turned off for Plajah in this browser.'); }
      else { setState('unavailable'); setMessage('We couldn’t get a location fix. We’ll try again shortly.'); }
    } finally { busy.current = false; }
  }, [poolId]);

  // Decide what to do whenever the pool, sign-in or consent changes.
  useEffect(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (already) { setState('checked_in'); setCheckedInAt(pool?.me?.checkedInAt); return; }
    if (!active || !poolId) { setState('inactive'); return; }
    if (!signedIn) { setState('signed_out'); return; }
    const consent = readGeoConsent();
    if (consent === 'declined') { setState('declined'); return; }
    if (consent === null) { setState(isCheckInDismissed(poolId) ? 'inactive' : 'needs_consent'); return; }
    let cancelled = false;
    (async () => {
      if ((await geoPermissionState()) === 'denied') { if (!cancelled) { setState('blocked'); setMessage('Location is turned off for Plajah in this browser.'); } return; }
      if (!cancelled) await attempt();
    })();
    return () => { cancelled = true; };
  }, [poolId, active, already, signedIn, nonce, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Not there yet / no fix: retry on a slow timer, and when the page comes back to the foreground.
  useEffect(() => {
    if (state !== 'outside' && state !== 'unavailable') return;
    timer.current = setTimeout(() => { if (document.visibilityState === 'visible') attempt(); }, retryMs);
    let lastWake = Date.now();
    const onVis = () => { if (document.visibilityState === 'visible' && Date.now() - lastWake > 60_000) { lastWake = Date.now(); attempt(); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { if (timer.current) clearTimeout(timer.current); document.removeEventListener('visibilitychange', onVis); };
  }, [state, attempt, retryMs]);

  return {
    state, message, checkedInAt,
    allow: () => { writeGeoConsent('granted'); setNonce(n => n + 1); },
    dismiss: () => { if (poolId) dismissCheckIn(poolId); setState('inactive'); },
    decline: () => { writeGeoConsent('declined'); setState('declined'); },
    retry: () => { if (readGeoConsent() !== 'granted') writeGeoConsent('granted'); setNonce(n => n + 1); },
  };
}

const fmtTime = (t: number, tz?: string) => { try { return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: tz }); } catch { return new Date(t).toLocaleTimeString(); } };

export default function PoolCheckInPrompt({ pool, checkIn, onSignIn }: { pool: PoolView; checkIn: PoolCheckIn; onSignIn?: () => void }) {
  const { state, message } = checkIn;
  const place = pool.placeLabel || 'the event';
  if (state === 'inactive') return null;

  if (state === 'checked_in') {
    return (
      <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300" role="status">
        <Check size={14} aria-hidden /> Checked in{checkIn.checkedInAt ? ` · ${fmtTime(checkIn.checkedInAt, pool.timezone)}` : ''}
      </div>
    );
  }

  if (state === 'declined') {
    return (
      <button type="button" onClick={checkIn.retry} className="tap text-xs text-white/50 underline underline-offset-2 hover:text-white/80">
        Turn on automatic check-in
      </button>
    );
  }

  const card = (body: React.ReactNode, actions?: React.ReactNode, onClose?: () => void) => (
    <div className="relative rounded-[24px] border border-white/10 bg-white/[0.04] p-4 text-sm text-white/80" role="region" aria-label="Event check-in">
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Not now" className="tap absolute right-2 top-2 rounded-full p-1.5 text-white/40 hover:bg-white/10 hover:text-white">
          <X size={16} />
        </button>
      )}
      <div className="flex gap-3 pr-6">
        <MapPin size={20} className="mt-0.5 shrink-0 text-[var(--pj-orange,#FF8C00)]" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">{body}{actions && <div className="flex flex-wrap gap-2 pt-1">{actions}</div>}</div>
      </div>
    </div>
  );

  if (state === 'signed_out') {
    return card(<p>Sign in to check in at {place} and add your photos to the pool.</p>, onSignIn ? <Button size="sm" variant="primary" onClick={onSignIn}>Sign in</Button> : undefined);
  }

  if (state === 'needs_consent') {
    return card(
      <>
        <p className="font-semibold text-white">Check in automatically at {place}?</p>
        <p className="text-white/60">
          While this page is open during the event, Plajah checks your location once to confirm you’re there.
          We keep only that you checked in and when, never where you were, and we don’t track you in the background.
        </p>
      </>,
      <>
        <Button size="sm" variant="primary" icon={<LocateFixed />} onClick={checkIn.allow}>Check me in</Button>
        <Button size="sm" variant="ghost" onClick={checkIn.dismiss}>Not now</Button>
        <Button size="sm" variant="ghost" onClick={checkIn.decline}>Don’t ask again</Button>
      </>,
      checkIn.dismiss,
    );
  }

  if (state === 'locating') return card(<p>Checking you in…</p>);

  if (state === 'outside') {
    return card(
      <>
        <p>{message || 'You don’t seem to be at the event yet.'}</p>
        <p className="text-white/50">We’ll try again every few minutes while this page is open.</p>
      </>,
      <>
        <Button size="sm" variant="secondary" onClick={checkIn.retry}>Try again</Button>
        <Button size="sm" variant="ghost" onClick={checkIn.decline}>Stop automatic check-in</Button>
      </>,
      checkIn.dismiss,
    );
  }

  if (state === 'blocked') {
    return card(
      <>
        <p>{message}</p>
        <p className="text-white/50">To check in, allow location for this site in your browser settings, then tap Try again. You can still add photos without checking in unless the host requires it.</p>
      </>,
      <Button size="sm" variant="secondary" onClick={checkIn.retry}>Try again</Button>,
      checkIn.dismiss,
    );
  }

  // unavailable
  return card(<p>{message || 'Location isn’t available right now.'}</p>, <Button size="sm" variant="secondary" onClick={checkIn.retry}>Try again</Button>, checkIn.dismiss);
}
