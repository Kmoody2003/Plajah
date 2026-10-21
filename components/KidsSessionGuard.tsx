// KidsSessionGuard — enforces a guardian's parental controls & screen-time limits on a CHILD
// account, and records real-time activity + category screen time for the parent's Activity History.
//
// Enforces:
//  1. Allowed hours window (bedtime / wake hours)
//  2. School-Hours Focus Mode (Mon–Fri 8 AM – 3 PM learning-only)
//  3. Blocked platform sections (blockedSurfaces)
//  4. Overall daily screen-time allowance (dailyTimeLimitMins)
//  5. Per-category daily time allowances (categoryLimitsMins: games, videos, movies, social, music, learning)
//
// Unlocking with the guardian passcode grants +20 minutes of bonus time or allows temporary access.

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Lock, Clock, ShieldAlert, Home } from 'lucide-react';
import type { UserProfile, ChildActivityCategory } from '../types';
import {
  resolveControls,
  isChildAccount,
  categoryForView,
  isSurfaceAllowedForChild,
} from '../services/contentSafety';
import {
  getLocalScreenTimeSummary,
  recordChildScreenTimeTick,
  recordChildActivityEvent,
  todayDateKey,
} from '../services/childActivityService';

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const graceKey = (uid: string) => `kids_grace_${uid}_${todayDateKey()}`;
const catGraceKey = (uid: string, cat: string) => `kids_cat_grace_${uid}_${cat}_${todayDateKey()}`;
const surfaceBypassKey = (uid: string, view: string) => `kids_surface_bypass_${uid}_${view}_${todayDateKey()}`;

const CATEGORY_LABELS: Record<ChildActivityCategory, string> = {
  games: 'Games & Arcade',
  videos: 'Videos & Reello',
  movies: 'Movies & TV',
  social: 'Social & Chat',
  music: 'Music & Audio',
  learning: 'Learning & Reading',
  other: 'Platform',
};

type LockReason = 'time' | 'hours' | 'category_time' | 'blocked_surface' | 'school_hours';

const KidsSessionGuard: React.FC<{
  profile?: UserProfile | null;
  activeView?: string;
  onNavigateHome?: () => void;
}> = ({ profile, activeView = 'STUDENT_HOME', onNavigateHome }) => {
  const controls = resolveControls(profile);
  const isChild = isChildAccount(profile);
  const uid = profile?.uid || '';
  const limit = controls.dailyTimeLimitMins || 0;
  const hours = controls.allowedHours;
  const currentCategory = categoryForView(activeView);
  const catLimit = (controls.categoryLimitsMins as any)?.[currentCategory] || 0;

  const [usedMins, setUsedMins] = useState(0);
  const [catUsedMins, setCatUsedMins] = useState<Record<string, number>>({});
  const [locked, setLocked] = useState(false);
  const [lockReason, setLockReason] = useState<LockReason>('time');
  const [lockDetail, setLockDetail] = useState('');
  const [pin, setPin] = useState('');
  const [pinErr, setPinErr] = useState(false);
  const lastLoggedBlockRef = useRef<string>('');

  const graceMins = useCallback(() => Number(localStorage.getItem(graceKey(uid)) || 0), [uid]);
  const catGraceMins = useCallback(
    (cat: string) => Number(localStorage.getItem(catGraceKey(uid, cat)) || 0),
    [uid]
  );

  // Record view navigation to child's Activity History whenever activeView changes.
  useEffect(() => {
    if (!isChild || !uid || !activeView) return;
    const surfCheck = isSurfaceAllowedForChild(activeView, profile);
    if (!surfCheck.allowed) {
      const blockSig = `${activeView}:${surfCheck.reason}`;
      if (lastLoggedBlockRef.current !== blockSig) {
        lastLoggedBlockRef.current = blockSig;
        void recordChildActivityEvent(uid, {
          view: activeView,
          title: `Blocked from opening ${surfCheck.label || activeView}`,
          detail: surfCheck.reason === 'school_hours'
            ? 'Blocked by School-Hours Focus Mode'
            : 'Section restricted by Parental Controls',
          status: 'blocked',
        });
      }
      return;
    }
    lastLoggedBlockRef.current = '';
    void recordChildActivityEvent(uid, {
      view: activeView,
      status: 'viewed',
    });
  }, [isChild, uid, activeView, profile]);

  // Tick used-minutes every 30s while the tab is visible (tracks both total & per-category).
  useEffect(() => {
    if (!isChild || !uid) return;
    const init = getLocalScreenTimeSummary(uid);
    const legacyTotal = Number(localStorage.getItem(`kids_time_${uid}_${todayDateKey()}`) || 0);
    setUsedMins(Math.max(init.totalMins, legacyTotal));
    setCatUsedMins(init.byCategory || {});

    const id = setInterval(() => {
      if (document.hidden) return;
      void recordChildScreenTimeTick(uid, activeView, 0.5).then(summary => {
        setUsedMins(summary.totalMins);
        setCatUsedMins(summary.byCategory || {});
      });
    }, 30_000);
    return () => clearInterval(id);
  }, [isChild, uid, activeView]);

  // Evaluate lock conditions whenever time, view, or controls change.
  useEffect(() => {
    if (!isChild || !uid) { setLocked(false); return; }

    // 1. Outside allowed hours?
    if (hours) {
      const h = new Date().getHours();
      const inWindow = hours.start <= hours.end ? (h >= hours.start && h < hours.end) : (h >= hours.start || h < hours.end);
      if (!inWindow) {
        setLockReason('hours');
        setLockDetail(`Allowed hours are ${hours.start}:00 – ${hours.end}:00.`);
        setLocked(true);
        return;
      }
    }

    // 2. Surface blocked or School-Hours Focus Mode?
    const surf = isSurfaceAllowedForChild(activeView, profile);
    if (!surf.allowed) {
      const bypassed = localStorage.getItem(surfaceBypassKey(uid, activeView)) === '1';
      if (!bypassed) {
        setLockReason(surf.reason === 'school_hours' ? 'school_hours' : 'blocked_surface');
        setLockDetail(surf.label || activeView);
        setLocked(true);
        return;
      }
    }

    // 3. Over the daily total cap?
    if (limit > 0 && usedMins >= limit + graceMins()) {
      setLockReason('time');
      setLockDetail(`Daily screen-time allowance (${limit} min) reached.`);
      setLocked(true);
      return;
    }

    // 4. Over the current category's time allowance?
    if (catLimit > 0 && currentCategory !== 'other') {
      const usedInCat = catUsedMins[currentCategory] || 0;
      if (usedInCat >= catLimit + catGraceMins(currentCategory)) {
        setLockReason('category_time');
        setLockDetail(`${CATEGORY_LABELS[currentCategory]} allowance (${catLimit} min/day) reached.`);
        setLocked(true);
        return;
      }
    }

    setLocked(false);
  }, [isChild, uid, usedMins, catUsedMins, limit, catLimit, currentCategory, hours, activeView, profile, graceMins, catGraceMins]);

  const tryUnlock = async () => {
    const hash = controls.guardianPasscodeHash;
    if (!hash) { setPinErr(true); return; }
    if ((await sha256(pin)) === hash) {
      if (lockReason === 'blocked_surface' || lockReason === 'school_hours') {
        localStorage.setItem(surfaceBypassKey(uid, activeView), '1');
      } else if (lockReason === 'category_time') {
        localStorage.setItem(catGraceKey(uid, currentCategory), String(catGraceMins(currentCategory) + 20));
        setCatUsedMins(prev => ({ ...prev }));
      } else {
        localStorage.setItem(graceKey(uid), String(graceMins() + 20));
      }
      setPin(''); setPinErr(false); setLocked(false);
    } else {
      setPinErr(true);
    }
  };

  if (!isChild) return null;

  const totalRemaining = limit > 0 ? Math.max(0, Math.round(limit + graceMins() - usedMins)) : null;
  const catRemaining =
    catLimit > 0 && currentCategory !== 'other'
      ? Math.max(0, Math.round(catLimit + catGraceMins(currentCategory) - (catUsedMins[currentCategory] || 0)))
      : null;

  const canSwitchToLearning =
    lockReason === 'category_time' || lockReason === 'blocked_surface' || lockReason === 'school_hours';

  return (
    <>
      {/* Floating remaining-time pill */}
      {(totalRemaining !== null || catRemaining !== null) && !locked && (
        <div style={{ position: 'fixed', bottom: 12, right: 12, zIndex: 9000, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(14,20,48,0.88)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 20, padding: '5px 12px', color: '#cfe', fontSize: 11, fontWeight: 700 }}>
          <Clock size={12} />
          {catRemaining !== null
            ? `${CATEGORY_LABELS[currentCategory]}: ${catRemaining}m left`
            : `${totalRemaining} min left today`}
        </div>
      )}

      {locked && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2147483600, background: 'linear-gradient(160deg,#0e1430,#16204a)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
          <div style={{ textAlign: 'center', maxWidth: 400, padding: 24 }}>
            <div style={{ width: 72, height: 72, borderRadius: 24, background: 'rgba(255,140,0,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
              {lockReason === 'blocked_surface' || lockReason === 'school_hours'
                ? <ShieldAlert size={34} color="#FF8C00" />
                : <Lock size={34} color="#FF8C00" />}
            </div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>
              {lockReason === 'time' && "Time's up for today!"}
              {lockReason === 'hours' && 'Bedtime / Quiet Hours'}
              {lockReason === 'category_time' && `${CATEGORY_LABELS[currentCategory]} time is up!`}
              {lockReason === 'blocked_surface' && 'Section paused by your parent'}
              {lockReason === 'school_hours' && 'School-Hours Focus Mode'}
            </h2>
            <p style={{ color: '#aeb6d8', fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>
              {lockReason === 'time' && 'You hit your daily screen-time allowance. Ask a parent if you need more time today.'}
              {lockReason === 'hours' && `It's outside your allowed hours (${lockDetail}). Come back tomorrow or ask a parent.`}
              {lockReason === 'category_time' && `${lockDetail} You can still head back to Homeroom & Learning, or ask a parent for 20 bonus minutes.`}
              {lockReason === 'blocked_surface' && `${lockDetail} is currently turned off in your family's Parental Controls.`}
              {lockReason === 'school_hours' && 'During school hours (8 AM – 3 PM), only Homeroom, Academia courses, and reading are open.'}
            </p>

            {canSwitchToLearning && onNavigateHome && (
              <button
                onClick={() => { setLocked(false); onNavigateHome(); }}
                style={{ width: '100%', marginTop: 14, padding: '11px 16px', borderRadius: 12, border: '1px solid rgba(59,130,246,0.4)', background: 'rgba(59,130,246,0.2)', color: '#fff', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13 }}
              >
                <Home size={15} /> Return to Homeroom &amp; Learning
              </button>
            )}

            <div style={{ marginTop: 18, background: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 11, color: '#8a93b8', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Parent passcode</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 8)); setPinErr(false); }}
                  type="password" inputMode="numeric" placeholder="••••" autoFocus
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: `1px solid ${pinErr ? '#ff7070' : 'rgba(255,255,255,0.15)'}`, background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: 18, letterSpacing: 4, textAlign: 'center' }} />
                <button onClick={tryUnlock} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(90deg,#FF8C00,#ffa733)', color: '#1a1a1a', fontWeight: 800, cursor: 'pointer' }}>Unlock</button>
              </div>
              {pinErr && <div style={{ color: '#ff9090', fontSize: 12, marginTop: 8 }}>{controls.guardianPasscodeHash ? 'Incorrect passcode.' : 'No parent passcode set — set one in Parental Controls.'}</div>}
              <div style={{ color: '#6b73a0', fontSize: 11, marginTop: 8 }}>Unlocking grants 20 more minutes today.</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default KidsSessionGuard;
