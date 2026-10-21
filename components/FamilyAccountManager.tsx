// FamilyAccountManager — the parent's Family & Parental Control Suite:
// - Create & manage CHILD accounts (with visible/resettable username & password)
// - Moderate platform sections, set maturity ratings, and auto-hide mature themes
// - Configure daily & per-category time allowances and school-hours focus mode
// - Filter out custom words, phrases, and profanity
// - Inspect full chronological Child Activity History & screen-time breakdown

import React, { useEffect, useState } from 'react';
import {
  Baby, Plus, ShieldCheck, LogIn, Trash2, X, Loader2, AlertCircle, KeyRound,
  Eye, EyeOff, Copy, Check, Clock, Filter, History, Sparkles, Shield,
} from 'lucide-react';
import type { UserProfile } from '../types';
import { listChildProfiles, deleteChildProfile } from '../services/backendService';
import {
  provisionChild, claimChild, generateKidFriendlyPassword,
} from '../services/learnerAuthService';
import ParentalControlsPanel, { ParentalControlTabId } from './ParentalControlsPanel';
import { db } from '../services/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { DEFAULT_CHILD_CONTROLS } from '../services/contentSafety';

const AVATAR_COLORS = ['#FF8C00', '#36c5f0', '#2bd67a', '#e23b6d', '#7a2bd6', '#f5c542'];
const colorFor = (id: string) =>
  AVATAR_COLORS[Math.abs([...id].reduce((a, c) => a + c.charCodeAt(0), 0)) % AVATAR_COLORS.length];

const FamilyAccountManager: React.FC<{ guardianUid: string }> = ({ guardianUid }) => {
  const [children, setChildren] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [voice, setVoice] = useState<'yes' | 'no' | ''>('yes');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Selected child + active tab for the full Parental Controls & Activity History suite
  const [controlsFor, setControlsFor] = useState<UserProfile | null>(null);
  const [activeTabForChild, setActiveTabForChild] = useState<ParentalControlTabId>('content');

  // Track which child cards currently have their password revealed inline
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Claim a teacher-provisioned child with an offline code.
  const [claiming, setClaiming] = useState(false);
  const [claimCode, setClaimCode] = useState('');
  const [claimMsg, setClaimMsg] = useState('');

  const load = async () => {
    setLoading(true);
    const list = await listChildProfiles(guardianUid);
    setChildren(list);
    if (controlsFor) {
      const updated = list.find(c => c.uid === controlsFor.uid);
      if (updated) setControlsFor(updated);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (guardianUid) load();
    /* eslint-disable-next-line */
  }, [guardianUid]);

  const addChild = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      const cleanPassword = password.trim();
      const res = await provisionChild({
        role: 'parent',
        displayName: name.trim(),
        username: cleanUsername,
        password: cleanPassword,
        birthYear: birthYear ? parseInt(birthYear, 10) : undefined,
        speechRecognition: voice === 'yes',
      });
      // Ensure savedChildPassword is stored on the child's parentalControls in Firestore so parent can always see it
      if (db && res?.childUid) {
        await setDoc(
          doc(db, 'users', res.childUid),
          {
            username: res.username || cleanUsername,
            parentalControls: {
              ...DEFAULT_CHILD_CONTROLS,
              speechRecognition: voice === 'yes',
              savedChildPassword: cleanPassword,
              passwordUpdatedAt: Date.now(),
              updatedAt: Date.now(),
              updatedBy: guardianUid,
            },
          },
          { merge: true }
        ).catch(() => {});
      }
      setName('');
      setUsername('');
      setPassword('');
      setBirthYear('');
      setVoice('yes');
      setAdding(false);
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not create the account.');
    } finally {
      setBusy(false);
    }
  };

  const doClaim = async () => {
    if (!claimCode.trim()) return;
    setBusy(true);
    setClaimMsg('');
    try {
      await claimChild(claimCode.trim());
      setClaimCode('');
      setClaiming(false);
      setClaimMsg('');
      await load();
    } catch (e: any) {
      setClaimMsg(e.message || 'Could not claim this account.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (uid: string) => {
    if (!confirm('Remove this child account? This deletes their profile.')) return;
    await deleteChildProfile(guardianUid, uid);
    if (controlsFor?.uid === uid) setControlsFor(null);
    await load();
  };

  const enterKids = (child: UserProfile) =>
    window.dispatchEvent(new CustomEvent('plajah:enter-kids', { detail: { child } }));

  const openChildSuite = (child: UserProfile, tab: ParentalControlTabId) => {
    setControlsFor(child);
    setActiveTabForChild(tab);
  };

  const toggleRevealPassword = (uid: string) => {
    setRevealedPasswords(prev => ({ ...prev, [uid]: !prev[uid] }));
  };

  const copyText = (text: string, id: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-small-orange/15 border border-small-orange/30 flex items-center justify-center">
            <Baby size={22} className="text-small-orange" />
          </div>
          <div>
            <h2 className="text-lg font-black">Family &amp; Parental Controls</h2>
            <p className="text-xs text-white/50">
              Manage child passwords, moderate sections, set maturity ratings &amp; time allowances, filter words, and view activity history.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setClaiming(c => !c);
              setAdding(false);
              setClaimMsg('');
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/80 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
          >
            <KeyRound size={14} /> Claim with code
          </button>
          <button
            onClick={() => {
              setAdding(a => !a);
              setClaiming(false);
              setError('');
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-small-orange text-white text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all"
          >
            <Plus size={14} /> Add child
          </button>
        </div>
      </div>

      {/* Claim Teacher Code Drawer */}
      {claiming && (
        <div className="p-4 bg-white/[0.03] border border-white/10 rounded-2xl space-y-2.5">
          <p className="text-[11px] text-white/60 font-bold leading-relaxed">
            Got a claim code from your child&apos;s teacher? Enter it to link their school account to your family so you can manage their password, controls, and activity history.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[180px] space-y-1.5">
              <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">
                Claim code
              </label>
              <input
                value={claimCode}
                onChange={e => setClaimCode(e.target.value.toUpperCase())}
                placeholder="QK7-M4PD-RJ9"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white font-bold tracking-widest outline-none placeholder:text-white/20"
              />
            </div>
            <button
              onClick={doClaim}
              disabled={busy || !claimCode.trim()}
              className="px-5 py-2.5 rounded-xl bg-white text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-30"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : 'Claim'}
            </button>
          </div>
          {claimMsg && (
            <div className="flex items-center gap-2 text-[10px] text-red-400">
              <AlertCircle size={12} /> {claimMsg}
            </div>
          )}
        </div>
      )}

      {/* Add Child Drawer */}
      {adding && (
        <div className="p-5 bg-white/[0.03] border border-white/10 rounded-2xl space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[160px] space-y-1.5">
              <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">
                Child&apos;s name
              </label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Maya"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white font-bold outline-none placeholder:text-white/20"
              />
            </div>
            <div className="w-28 space-y-1.5">
              <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">
                Birth year
              </label>
              <input
                value={birthYear}
                onChange={e => setBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="2016"
                inputMode="numeric"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white font-bold outline-none placeholder:text-white/20"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[160px] space-y-1.5">
              <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">
                Username (how they sign in)
              </label>
              <input
                value={username}
                onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                autoCapitalize="none"
                placeholder="maya_star"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white font-mono font-bold outline-none placeholder:text-white/20"
              />
            </div>
            <div className="flex-1 min-w-[200px] space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">
                  Password you set for them
                </label>
                <button
                  type="button"
                  onClick={() => setPassword(generateKidFriendlyPassword())}
                  className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                >
                  <Sparkles size={11} /> Generate password
                </button>
              </div>
              <input
                value={password}
                onChange={e => setPassword(e.target.value)}
                type="text"
                placeholder="at least 6 characters"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white font-mono font-bold outline-none placeholder:text-white/20"
              />
            </div>
            <button
              onClick={addChild}
              disabled={busy || !name.trim() || !username.trim() || !password || !voice}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-30"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : 'Create Child Account'}
            </button>
          </div>

          <div
            className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-2"
            role="radiogroup"
            aria-label="Reading voice"
          >
            <div className="text-[11px] font-black text-white">
              Let Chora listen while they read aloud?{' '}
              <span className="text-white/40 font-bold">(Voca reading coach)</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                role="radio"
                aria-checked={voice === 'yes'}
                onClick={() => setVoice('yes')}
                className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border ${
                  voice === 'yes'
                    ? 'bg-white text-black border-white'
                    : 'bg-white/5 text-white/70 border-white/10'
                }`}
              >
                Yes, let Chora listen
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={voice === 'no'}
                onClick={() => setVoice('no')}
                className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border ${
                  voice === 'no'
                    ? 'bg-white text-black border-white'
                    : 'bg-white/5 text-white/70 border-white/10'
                }`}
              >
                Not now
              </button>
            </div>
          </div>

          <p className="text-[10px] text-white/40 leading-relaxed">
            No email needed — your child signs in on the <b className="text-white/70">Student</b> tab with this username and password. You can view or reset their password anytime from your Family cards below.
          </p>
          {error && (
            <div className="flex items-center gap-2 text-[10px] text-red-400">
              <AlertCircle size={12} /> {error}
            </div>
          )}
        </div>
      )}

      {/* Child Cards List */}
      {loading ? (
        <div className="text-center text-white/30 py-10 text-sm">Loading family accounts…</div>
      ) : children.length === 0 ? (
        <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/10 text-center space-y-2">
          <div className="text-sm font-bold text-white/70">No child accounts linked yet</div>
          <p className="text-xs text-white/40 max-w-md mx-auto">
            Click <b>Add child</b> above to create a kid-safe account with its own username &amp; password, maturity rating, time allowances, word filters, and activity log.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {children.map(c => {
            const savedPw = c.parentalControls?.savedChildPassword;
            const isPwShown = Boolean(revealedPasswords[c.uid]);
            const blockedCount = (c.parentalControls?.blockedSurfaces || []).length;
            const wordCount = (c.parentalControls?.blockedWords || []).length;
            const isSelected = controlsFor?.uid === c.uid;

            return (
              <div
                key={c.uid}
                className={`p-4 rounded-2xl border transition-all space-y-3.5 ${
                  isSelected
                    ? 'bg-emerald-500/[0.07] border-emerald-500/50 shadow-lg'
                    : 'bg-white/[0.03] border-white/10 hover:border-white/20'
                }`}
              >
                {/* Top row: Avatar, Name, Username, Kids Mode + Remove */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg shrink-0 text-white shadow"
                      style={{ background: colorFor(c.uid) }}
                    >
                      {(c.displayName || 'C').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-black text-base text-white truncate">
                          {c.displayName}
                        </span>
                        {c.username ? (
                          <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-white/10 text-emerald-300 font-bold">
                            @{c.username}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openChildSuite(c, 'credentials')}
                            className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          >
                            + Set Username &amp; Password
                          </button>
                        )}
                      </div>

                      <div className="text-[11px] text-white/50 flex flex-wrap items-center gap-2 mt-1">
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                          <ShieldCheck size={12} />
                          Rated {c.parentalControls?.maxMaturity || 'PG'}
                        </span>
                        <span>·</span>
                        <span>
                          {c.parentalControls?.dailyTimeLimitMins
                            ? `${c.parentalControls.dailyTimeLimitMins}m/day cap`
                            : 'Unlimited daily time'}
                        </span>
                        {blockedCount > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-amber-300">{blockedCount} sections hidden</span>
                          </>
                        )}
                        {wordCount > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-amber-300">{wordCount} filtered words</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => enterKids(c)}
                      title="Switch into Kids Mode as this child"
                      className="px-2.5 py-1.5 rounded-xl bg-small-orange/15 text-small-orange hover:bg-small-orange/25 text-[11px] font-bold flex items-center gap-1 transition-all"
                    >
                      <LogIn size={13} /> Kids Mode
                    </button>
                    <button
                      onClick={() => remove(c.uid)}
                      title="Delete child account"
                      className="p-2 rounded-xl bg-white/5 text-white/40 hover:text-red-400 transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Inline Credentials Bar: Username + Show/Hide/Reset Password */}
                <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-3">
                    <div>
                      <span className="text-white/40 text-[10px] uppercase tracking-wider font-bold mr-1.5">
                        Login:
                      </span>
                      <span className="font-mono font-bold text-white">
                        {c.username ? `@${c.username}` : 'Not set'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-white/40 text-[10px] uppercase tracking-wider font-bold">
                        Password:
                      </span>
                      {savedPw ? (
                        <span className="font-mono font-bold text-emerald-300">
                          {isPwShown ? savedPw : '••••••••'}
                        </span>
                      ) : (
                        <span className="text-white/40 italic text-[11px]">Click Reset to set &amp; view</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {savedPw && (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleRevealPassword(c.uid)}
                          className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 text-[11px] flex items-center gap-1"
                        >
                          {isPwShown ? <EyeOff size={12} /> : <Eye size={12} />}
                          {isPwShown ? 'Hide' : 'Show'}
                        </button>
                        <button
                          type="button"
                          onClick={() => copyText(savedPw, c.uid)}
                          className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 text-[11px] flex items-center gap-1"
                        >
                          {copiedId === c.uid ? (
                            <Check size={12} className="text-emerald-400" />
                          ) : (
                            <Copy size={12} />
                          )}
                          {copiedId === c.uid ? 'Copied' : 'Copy'}
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => openChildSuite(c, 'credentials')}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-bold text-[11px] flex items-center gap-1"
                    >
                      <KeyRound size={11} />
                      {savedPw ? 'Reset Password' : 'Set Password'}
                    </button>
                  </div>
                </div>

                {/* Quick Action Suite Buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => openChildSuite(c, 'content')}
                    className={`px-2.5 py-2 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                      isSelected && activeTabForChild === 'content'
                        ? 'bg-emerald-500 text-black border-emerald-400'
                        : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/80'
                    }`}
                  >
                    <Shield size={13} /> Content &amp; Maturity
                  </button>

                  <button
                    type="button"
                    onClick={() => openChildSuite(c, 'time')}
                    className={`px-2.5 py-2 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                      isSelected && activeTabForChild === 'time'
                        ? 'bg-emerald-500 text-black border-emerald-400'
                        : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/80'
                    }`}
                  >
                    <Clock size={13} /> Time Limits
                  </button>

                  <button
                    type="button"
                    onClick={() => openChildSuite(c, 'words')}
                    className={`px-2.5 py-2 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                      isSelected && activeTabForChild === 'words'
                        ? 'bg-emerald-500 text-black border-emerald-400'
                        : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/80'
                    }`}
                  >
                    <Filter size={13} /> Word Filters
                  </button>

                  <button
                    type="button"
                    onClick={() => openChildSuite(c, 'activity')}
                    className={`px-2.5 py-2 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                      isSelected && activeTabForChild === 'activity'
                        ? 'bg-emerald-500 text-black border-emerald-400'
                        : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/80'
                    }`}
                  >
                    <History size={13} /> Activity History
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Expanded Full Parental Control & Activity Suite for the Selected Child */}
      {controlsFor && (
        <div className="pt-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Managing {controlsFor.displayName}&apos;s Account
            </span>
            <button
              type="button"
              onClick={() => setControlsFor(null)}
              className="text-xs text-white/50 hover:text-white flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10"
            >
              <X size={13} /> Close Panel
            </button>
          </div>
          <ParentalControlsPanel
            target={controlsFor}
            actor={{ uid: guardianUid } as UserProfile}
            initialTab={activeTabForChild}
            onSaved={() => load()}
            onTargetUpdated={() => load()}
          />
        </div>
      )}
    </div>
  );
};

export default FamilyAccountManager;
