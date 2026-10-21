import React, { useEffect, useMemo, useState } from 'react';
import {
  Shield, Clock, Lock, Eye, EyeOff, Check, Sparkles, Mic, MessageCircle,
  KeyRound, Copy, RefreshCw, Unlock, Filter, History, Gamepad2, Video,
  Film, Music, BookOpen, MessageSquare, Radio, Palette, GraduationCap,
  AlertTriangle, Plus, X, Trash2, CheckCircle2, Search, ShieldAlert, UserCheck,
} from 'lucide-react';
import {
  UserProfile, ParentalControls, MaturityRating, BlockedMatureTheme,
  ControllableSurfaceGroup, ChildActivityCategory, ChildActivityEntry, ChildScreenTimeSummary,
} from '../types';
import {
  resolveControls, MATURITY_LABELS, hashPasscode,
  MATURE_THEME_META, CONTROLLABLE_SURFACES_META,
} from '../services/contentSafety';
import { db } from '../services/firebase';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import {
  getChildCredentials, resetChildPassword, unlockChildAccount, generateKidFriendlyPassword,
} from '../services/learnerAuthService';
import {
  loadChildActivityReport, clearChildActivityHistory,
} from '../services/childActivityService';

export type ParentalControlTabId = 'credentials' | 'content' | 'time' | 'words' | 'activity';

interface Props {
  /** The child profile being configured (or the current user when configuring self-lock). */
  target?: UserProfile;
  /** Alias for target used by FamilyAccountManager. */
  child?: UserProfile;
  /** Guardian doing the editing. */
  actor?: UserProfile;
  /** Alias for actor.uid used by FamilyAccountManager. */
  guardianUid?: string;
  onSaved?: (next: ParentalControls) => void;
  onClose?: () => void;
  /** Optional callback when child profile fields (like username) are updated. */
  onTargetUpdated?: (patch: Partial<UserProfile>) => void;
  /** Optional initial tab to open directly. */
  initialTab?: ParentalControlTabId;
}

const MATURITY_OPTIONS: MaturityRating[] = ['G', 'PG', 'PG13', 'TEEN'];
const TIME_LIMIT_PRESETS = [0, 30, 45, 60, 90, 120, 180, 240];
const CATEGORY_TIME_PRESETS = [0, 15, 30, 45, 60, 90, 120];

const CATEGORY_ALLOWANCE_META: {
  id: ChildActivityCategory;
  label: string;
  desc: string;
  color: string;
}[] = [
  { id: 'games', label: 'Games & Arcade', desc: 'Daily cap on arcade & game player sessions', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  { id: 'videos', label: 'Videos & Reello', desc: 'Short clips, Reello reels, and video hub', color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' },
  { id: 'movies', label: 'Movies & Live TV', desc: 'Full-length movies, series, and live TV', color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
  { id: 'social', label: 'Social Feed & Chat', desc: 'Community feed, clubs, and messaging', color: 'text-sky-400 bg-sky-500/10 border-sky-500/30' },
  { id: 'music', label: 'Music & Radio', desc: 'Chora streaming, playlists, and radio', color: 'text-pink-400 bg-pink-500/10 border-pink-500/30' },
  { id: 'learning', label: 'Learning & Quests', desc: 'Optional cap on Academia & Reading (0 = unlimited)', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
];

const QUICK_WORD_PACKS: { label: string; words: string[] }[] = [
  { label: 'Bullying & Insults', words: ['loser', 'ugly', 'shut up', 'hate you', 'dumb', 'noob', 'trash'] },
  { label: 'Scary / Creepypasta', words: ['slenderman', 'momogame', 'jumpscare', 'haunted', 'bloody', 'killer'] },
  { label: 'Weapons & Combat', words: ['gun', 'rifle', 'sniper', 'knife', 'grenade', 'headshot'] },
  { label: 'Mature Slang', words: ['hookup', 'crush', 'sneak out', 'vape', 'drunk', 'wasted'] },
];

const SURFACE_ICONS: Record<ControllableSurfaceGroup, React.FC<{ className?: string }>> = {
  GAMES: Gamepad2,
  VIDEOS: Video,
  MOVIES_TV: Film,
  MUSIC: Music,
  BOOKS: BookOpen,
  FEED: MessageSquare,
  CHAT: MessageCircle,
  LIVE_HUB: Radio,
  CREATOR: Palette,
};

export const ParentalControlsPanel: React.FC<Props> = ({
  target: targetProp,
  child,
  actor: actorProp,
  guardianUid,
  onSaved,
  onTargetUpdated,
  initialTab = 'content',
}) => {
  const target = (targetProp || child)!;
  const actor = actorProp || ({ uid: guardianUid || '' } as UserProfile);
  const initial = resolveControls(target);
  const [activeTab, setActiveTab] = useState<ParentalControlTabId>(initialTab);
  const [controls, setControls] = useState<ParentalControls>(initial);
  const [newPasscode, setNewPasscode] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Login & Password state ──
  const [credLoading, setCredLoading] = useState(false);
  const [childUsername, setChildUsername] = useState(target.username || '');
  const [currentPassword, setCurrentPassword] = useState<string | null>(
    target.parentalControls?.savedChildPassword || null
  );
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(true);
  const [isAccountLocked, setIsAccountLocked] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [passwordStatusMsg, setPasswordStatusMsg] = useState<string | null>(null);
  const [passwordErrMsg, setPasswordErrMsg] = useState<string | null>(null);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<'username' | 'password' | null>(null);

  // ── Word Filter input state ──
  const [wordInput, setWordInput] = useState('');

  // ── Activity History state ──
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityEntries, setActivityEntries] = useState<ChildActivityEntry[]>([]);
  const [screenTimeSummary, setScreenTimeSummary] = useState<ChildScreenTimeSummary>({
    dateKey: '',
    totalMins: 0,
    byCategory: {},
    updatedAt: 0,
  });
  const [activityCategoryFilter, setActivityCategoryFilter] = useState<'all' | ChildActivityCategory | 'blocked'>('all');
  const [activitySearch, setActivitySearch] = useState('');

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const resolved = resolveControls(target);
    setControls(resolved);
    setChildUsername(target.username || '');
    if (target.parentalControls?.savedChildPassword) {
      setCurrentPassword(target.parentalControls.savedChildPassword);
    }
  }, [target.uid]);

  // Fetch child credentials when opening the credentials tab (or on mount for child accounts)
  const refreshCredentials = async () => {
    setCredLoading(true);
    setPasswordErrMsg(null);
    try {
      const info = await getChildCredentials(target.uid);
      if (info.username) setChildUsername(info.username);
      if (info.savedPassword) setCurrentPassword(info.savedPassword);
      setIsAccountLocked(Boolean(info.locked));
      setFailedAttempts(info.failedAttempts || 0);
    } catch {
      // Fallback to local profile fields if backend endpoint isn't reachable
      if (target.parentalControls?.savedChildPassword) {
        setCurrentPassword(target.parentalControls.savedChildPassword);
      }
    } finally {
      setCredLoading(false);
    }
  };

  const refreshActivity = async () => {
    setActivityLoading(true);
    try {
      const report = await loadChildActivityReport(target.uid);
      setActivityEntries(report.entries);
      setScreenTimeSummary(report.screenTime);
      if (report.savedPassword && !currentPassword) {
        setCurrentPassword(report.savedPassword);
      }
      if (report.username && !childUsername) {
        setChildUsername(report.username);
      }
    } catch {
      // ignore
    } finally {
      setActivityLoading(false);
    }
  };

  useEffect(() => {
    refreshCredentials();
    refreshActivity();
  }, [target.uid]);

  const update = <K extends keyof ParentalControls>(key: K, value: ParentalControls[K]) => {
    setControls(prev => ({ ...prev, [key]: value }));
  };

  const toggleBlockedTheme = (theme: BlockedMatureTheme) => {
    const current = new Set(controls.blockedThemes || []);
    if (current.has(theme)) current.delete(theme);
    else current.add(theme);
    update('blockedThemes', Array.from(current));
  };

  const toggleBlockedSurface = (surface: ControllableSurfaceGroup) => {
    const current = new Set(controls.blockedSurfaces || []);
    if (current.has(surface)) current.delete(surface);
    else current.add(surface);
    update('blockedSurfaces', Array.from(current));
  };

  const setCategoryLimit = (cat: ChildActivityCategory, mins: number) => {
    const next = { ...(controls.categoryLimitsMins || {}) };
    if (!mins || mins <= 0) {
      delete next[cat];
    } else {
      next[cat] = mins;
    }
    update('categoryLimitsMins', next);
  };

  const addBlockedWords = (raw: string) => {
    const parts = raw
      .split(/[,;\n]+/)
      .map(w => w.trim().toLowerCase())
      .filter(Boolean);
    if (parts.length === 0) return;
    const merged = Array.from(new Set([...(controls.blockedWords || []), ...parts]));
    update('blockedWords', merged);
    setWordInput('');
  };

  const removeBlockedWord = (word: string) => {
    update(
      'blockedWords',
      (controls.blockedWords || []).filter(w => w.toLowerCase() !== word.toLowerCase())
    );
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const next: ParentalControls = {
        ...controls,
        adultFilter: target.isChild ? true : controls.adultFilter,
        savedChildPassword: currentPassword || controls.savedChildPassword,
        updatedAt: Date.now(),
        updatedBy: actor.uid,
      };
      if (newPasscode.trim().length >= 4) {
        next.guardianPasscodeHash = await hashPasscode(newPasscode.trim());
        setNewPasscode('');
      }
      if (db && target.uid) {
        await updateDoc(doc(db, 'users', target.uid), { parentalControls: next }).catch(async () => {
          await setDoc(doc(db, 'users', target.uid), { parentalControls: next }, { merge: true });
        });
      }
      try {
        localStorage.setItem(`plajah_parental_controls_${target.uid}`, JSON.stringify(next));
      } catch {}
      setControls(next);
      setSavedAt(Date.now());
      onSaved?.(next);
    } catch (e: any) {
      setError(e?.message || 'Could not save controls.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetChildPassword = async () => {
    setPasswordErrMsg(null);
    setPasswordStatusMsg(null);
    const cleanPassword = newPasswordInput.trim();
    const cleanUsername = childUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');

    if (!cleanUsername || cleanUsername.length < 3) {
      setPasswordErrMsg('Please enter a username (at least 3 letters/numbers) for your child.');
      return;
    }
    if (cleanPassword.length < 6) {
      setPasswordErrMsg('New password must be at least 6 characters.');
      return;
    }

    setUpdatingPassword(true);
    try {
      const res = await resetChildPassword({
        childUid: target.uid,
        username: cleanUsername,
        newPassword: cleanPassword,
      });
      setCurrentPassword(res.savedPassword || cleanPassword);
      setChildUsername(res.username || cleanUsername);
      setShowCurrentPassword(true);
      setNewPasswordInput('');
      setIsAccountLocked(false);
      setFailedAttempts(0);

      // Also persist savedChildPassword & username to Firestore / localStorage so parent always sees it immediately
      const nextControls: ParentalControls = {
        ...controls,
        savedChildPassword: cleanPassword,
        passwordUpdatedAt: Date.now(),
        updatedAt: Date.now(),
        updatedBy: actor.uid,
      };
      setControls(nextControls);
      if (db && target.uid) {
        await setDoc(
          doc(db, 'users', target.uid),
          {
            username: cleanUsername,
            parentalControls: nextControls,
          },
          { merge: true }
        ).catch(() => {});
      }
      try {
        localStorage.setItem(`plajah_parental_controls_${target.uid}`, JSON.stringify(nextControls));
      } catch {}

      onSaved?.(nextControls);
      onTargetUpdated?.({ username: cleanUsername, parentalControls: nextControls });
      setPasswordStatusMsg(`Password updated for @${cleanUsername}!`);
    } catch (err: any) {
      // Fallback: if dev server doesn't have Firebase Admin credentials configured locally,
      // still persist the saved password & username on the child's Firestore profile doc so the parent has it.
      const nextControls: ParentalControls = {
        ...controls,
        savedChildPassword: cleanPassword,
        passwordUpdatedAt: Date.now(),
        updatedAt: Date.now(),
        updatedBy: actor.uid,
      };
      if (db && target.uid) {
        try {
          await setDoc(
            doc(db, 'users', target.uid),
            {
              username: cleanUsername,
              parentalControls: nextControls,
            },
            { merge: true }
          );
          setCurrentPassword(cleanPassword);
          setChildUsername(cleanUsername);
          setShowCurrentPassword(true);
          setNewPasswordInput('');
          setControls(nextControls);
          onSaved?.(nextControls);
          onTargetUpdated?.({ username: cleanUsername, parentalControls: nextControls });
          setPasswordStatusMsg(`Saved password for @${cleanUsername}!`);
          setUpdatingPassword(false);
          return;
        } catch {}
      }
      setPasswordErrMsg(err?.message || 'Could not reset password.');
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleUnlockChild = async () => {
    setPasswordErrMsg(null);
    setPasswordStatusMsg(null);
    try {
      await unlockChildAccount({ childUid: target.uid, username: childUsername });
      setIsAccountLocked(false);
      setFailedAttempts(0);
      setPasswordStatusMsg('Account unlocked! Your child can sign in again.');
    } catch (e: any) {
      setPasswordErrMsg(e?.message || 'Could not unlock account.');
    }
  };

  const copyToClipboard = (text: string, field: 'username' | 'password') => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1800);
  };

  const filteredActivities = useMemo(() => {
    return activityEntries.filter(entry => {
      if (activityCategoryFilter === 'blocked') {
        if (entry.action !== 'blocked_attempt' && !entry.flaggedReason) return false;
      } else if (activityCategoryFilter !== 'all') {
        if (entry.category !== activityCategoryFilter) return false;
      }
      if (activitySearch.trim()) {
        const q = activitySearch.trim().toLowerCase();
        const hay = `${entry.title || ''} ${entry.detail || ''} ${entry.flaggedReason || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [activityEntries, activityCategoryFilter, activitySearch]);

  const blockedCount = useMemo(
    () => activityEntries.filter(e => e.action === 'blocked_attempt' || e.flaggedReason).length,
    [activityEntries]
  );

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 md:p-6 space-y-5 text-white shadow-xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <Shield className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base md:text-lg">
                Parental Controls &amp; Safety — {target.displayName || 'Child'}
              </h3>
              {target.username && (
                <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-zinc-800 text-emerald-300 border border-zinc-700">
                  @{target.username}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400">
              Manage login password, maturity ratings, platform sections, time allowances, word filters, and activity history.
            </p>
          </div>
        </div>

        {/* Quick summary badges */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold">
            Rated {controls.maxMaturity}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300">
            {controls.dailyTimeLimitMins ? `${controls.dailyTimeLimitMins}m/day` : 'No daily cap'}
          </span>
          {(controls.blockedWords?.length || 0) > 0 && (
            <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300">
              {controls.blockedWords?.length} blocked words
            </span>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-1.5 bg-zinc-950/80 p-1.5 rounded-xl border border-zinc-800">
        {([
          { id: 'credentials', label: 'Login & Password', icon: KeyRound },
          { id: 'content', label: 'Content & Maturity', icon: Shield },
          { id: 'time', label: 'Time Allowances', icon: Clock },
          { id: 'words', label: 'Word & Topic Filters', icon: Filter, badge: controls.blockedWords?.length || 0 },
          { id: 'activity', label: 'Activity History', icon: History, badge: blockedCount > 0 ? blockedCount : undefined, badgeAlert: true },
        ] as {
          id: ParentalControlTabId;
          label: string;
          icon: React.FC<{ className?: string }>;
          badge?: number;
          badgeAlert?: boolean;
        }[]).map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                active
                  ? 'bg-emerald-500 text-black shadow-sm'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {typeof tab.badge === 'number' && tab.badge > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    active
                      ? 'bg-black/20 text-black'
                      : tab.badgeAlert
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'bg-zinc-800 text-zinc-300'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: LOGIN & PASSWORD                                               */}
      {/* ===================================================================== */}
      {activeTab === 'credentials' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-bold flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-emerald-400" />
                  Child Sign-In Credentials
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Children sign in with their <span className="text-zinc-200 font-semibold">@username</span> and password (no email required). You can view or reset their password anytime.
                </p>
              </div>
              <button
                type="button"
                onClick={refreshCredentials}
                disabled={credLoading}
                className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${credLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {/* Current Username & Current Password Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Username box */}
              <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-1.5">
                <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">
                  Child Username
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-mono text-base font-bold text-white truncate">
                    {childUsername ? `@${childUsername}` : <span className="text-amber-400 text-xs font-sans">No username set yet — set one below</span>}
                  </div>
                  {childUsername && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(childUsername, 'username')}
                      className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 flex items-center gap-1 shrink-0"
                    >
                      {copiedField === 'username' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedField === 'username' ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>
              </div>

              {/* Current Password box */}
              <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-1.5">
                <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">
                  Current Password
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-mono text-base font-bold text-emerald-300 truncate">
                    {currentPassword ? (
                      showCurrentPassword ? currentPassword : '••••••••••'
                    ) : (
                      <span className="text-zinc-400 text-xs font-sans">
                        Not recorded yet — set a new password below to view it anytime
                      </span>
                    )}
                  </div>
                  {currentPassword && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(v => !v)}
                        className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 flex items-center gap-1"
                        title={showCurrentPassword ? 'Hide password' : 'Show password'}
                      >
                        {showCurrentPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        {showCurrentPassword ? 'Hide' : 'Show'}
                      </button>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(currentPassword, 'password')}
                        className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 flex items-center gap-1"
                      >
                        {copiedField === 'password' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedField === 'password' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Lockout alert if child failed login 5+ times */}
            {(isAccountLocked || failedAttempts >= 5) && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="text-xs text-amber-200">
                    This account is temporarily locked after {failedAttempts} failed sign-in attempts.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleUnlockChild}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 shrink-0"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  Unlock Now
                </button>
              </div>
            )}

            {/* Reset / Set Username & Password Form */}
            <div className="pt-3 border-t border-zinc-800/80 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-zinc-200">
                  {currentPassword ? 'Reset or Change Child Password' : 'Set Child Username & Password'}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setNewPasswordInput(generateKidFriendlyPassword());
                    setShowNewPassword(true);
                  }}
                  className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Generate Kid-Friendly Password
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    Child Username (letters, numbers, underscores)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-mono text-sm">@</span>
                    <input
                      type="text"
                      value={childUsername}
                      onChange={e => setChildUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                      placeholder="e.g. leo_star"
                      className="w-full pl-7 pr-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm font-mono text-white focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    New Password (at least 6 characters)
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPasswordInput}
                      onChange={e => setNewPasswordInput(e.target.value)}
                      placeholder="Enter or generate new password"
                      className="w-full pr-9 pl-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm font-mono text-white focus:border-emerald-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(v => !v)}
                      className="absolute right-2.5 text-zinc-400 hover:text-white"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="text-xs">
                  {passwordErrMsg && <span className="text-rose-400 font-medium">{passwordErrMsg}</span>}
                  {passwordStatusMsg && (
                    <span className="text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {passwordStatusMsg}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleResetChildPassword}
                  disabled={updatingPassword || !newPasswordInput.trim()}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black font-bold text-xs flex items-center gap-1.5 transition-all"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  {updatingPassword ? 'Updating Password…' : 'Save New Password'}
                </button>
              </div>
            </div>
          </div>

          {/* Guardian PIN section */}
          <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-2">
            <div className="text-sm font-semibold flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-400" />
              Parent Override PIN {controls.guardianPasscodeHash ? '(Active)' : '(Not set)'}
            </div>
            <p className="text-xs text-zinc-400">
              Set a 4–8 digit Parent PIN required to unlock the screen when daily time runs out or to exit Kids Mode on your child&apos;s device.
            </p>
            <div className="flex items-center gap-2 max-w-sm">
              <input
                type="password"
                inputMode="numeric"
                placeholder={controls.guardianPasscodeHash ? 'Enter new PIN to replace' : 'Set 4–8 digit Parent PIN'}
                value={newPasscode}
                onChange={e => setNewPasscode(e.target.value)}
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: CONTENT & MATURITY                                             */}
      {/* ===================================================================== */}
      {activeTab === 'content' && (
        <div className="space-y-5">
          {/* Maturity Rating Selector */}
          <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-3">
            <div>
              <label className="block text-sm font-bold">Maximum Maturity Rating</label>
              <p className="text-xs text-zinc-400">
                Any video, movie, book, game, music track, or post rated above this level is automatically hidden.
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {MATURITY_OPTIONS.map(r => {
                const active = controls.maxMaturity === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => update('maxMaturity', r)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      active
                        ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-sm'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black text-base text-emerald-400">{r}</span>
                      {active && <Check className="w-4 h-4 text-emerald-400" />}
                    </div>
                    <div className="text-[11px] mt-1 leading-snug text-zinc-300">
                      {MATURITY_LABELS[r]}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Automatic Mature Theme Shield */}
          <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-emerald-400" />
                  Automatically Hide Mature Themes
                </div>
                <p className="text-xs text-zinc-400">
                  Scans titles, descriptions, tags, and posts to automatically hide sensitive topics even if unrated.
                </p>
              </div>
              <input
                type="checkbox"
                checked={controls.autoHideMatureThemes !== false}
                onChange={e => update('autoHideMatureThemes', e.target.checked)}
                className="w-5 h-5 accent-emerald-500"
              />
            </div>

            {controls.autoHideMatureThemes !== false && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2">
                {MATURE_THEME_META.map(theme => {
                  const isBlocked = (controls.blockedThemes || []).includes(theme.id);
                  return (
                    <label
                      key={theme.id}
                      className={`flex items-start justify-between gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        isBlocked
                          ? 'bg-emerald-500/10 border-emerald-500/40 text-white'
                          : 'bg-zinc-900/70 border-zinc-800 text-zinc-400'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold text-zinc-100">{theme.label}</div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">{theme.desc}</div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isBlocked ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800 text-zinc-500'
                        }`}>
                          {isBlocked ? 'Hidden' : 'Allowed'}
                        </span>
                        <input
                          type="checkbox"
                          checked={isBlocked}
                          onChange={() => toggleBlockedTheme(theme.id)}
                          className="w-4 h-4 accent-emerald-500"
                        />
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Moderate Platform Sections */}
          <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-3">
            <div>
              <div className="text-sm font-bold">Moderate Platform Sections</div>
              <p className="text-xs text-zinc-400">
                Choose which areas of Plajah {target.displayName || 'your child'} is allowed to open. Disabled sections are locked immediately.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {CONTROLLABLE_SURFACES_META.map(surface => {
                const Icon = SURFACE_ICONS[surface.id] || Shield;
                const isBlocked = (controls.blockedSurfaces || []).includes(surface.id);
                const isAllowed = !isBlocked;
                return (
                  <button
                    key={surface.id}
                    type="button"
                    onClick={() => toggleBlockedSurface(surface.id)}
                    className={`p-3 rounded-xl border text-left transition-all flex items-start justify-between gap-2 ${
                      isAllowed
                        ? 'bg-zinc-900/90 border-zinc-700 hover:border-emerald-500/50 text-white'
                        : 'bg-rose-950/25 border-rose-500/40 text-zinc-400'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isAllowed ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold">{surface.label}</div>
                        <div className="text-[11px] text-zinc-400 leading-tight mt-0.5">{surface.desc}</div>
                      </div>
                    </div>
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0 ${
                      isAllowed
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}>
                      {isAllowed ? 'Allowed' : 'Blocked'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Core Safety & Classroom Toggles */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800 cursor-pointer">
              <div>
                <div className="text-sm font-medium">Block 18+ / Explicit Content</div>
                <div className="text-xs text-zinc-400">
                  {target.isChild ? 'Always locked ON for child accounts' : 'Hide NSFW, 18+, and age-gated items'}
                </div>
              </div>
              <input
                type="checkbox"
                checked={controls.adultFilter}
                disabled={Boolean(target.isChild)}
                onChange={e => update('adultFilter', e.target.checked)}
                className="w-5 h-5 accent-emerald-500"
              />
            </label>

            <label className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800 cursor-pointer">
              <div>
                <div className="text-sm font-medium flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400" /> Kids Mode Experience
                </div>
                <div className="text-xs text-zinc-400">
                  Simplified navigation focused on Learning, Reading, and Kid-safe Library
                </div>
              </div>
              <input
                type="checkbox"
                checked={controls.kidsMode}
                onChange={e => update('kidsMode', e.target.checked)}
                className="w-5 h-5 accent-emerald-500"
              />
            </label>

            <label className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800 cursor-pointer">
              <div>
                <div className="text-sm font-medium flex items-center gap-1.5">
                  <Mic className="w-4 h-4 text-emerald-400" /> Voca Read-Aloud Speech Recognition
                </div>
                <div className="text-xs text-zinc-400">
                  Allow live word-by-word read-aloud tracking in Voca
                </div>
              </div>
              <input
                type="checkbox"
                checked={Boolean(controls.speechRecognition)}
                onChange={e => update('speechRecognition', e.target.checked)}
                className="w-5 h-5 accent-emerald-500"
              />
            </label>

            <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    <MessageCircle className="w-4 h-4 text-sky-400" /> Homeroom Class Text Chat
                  </div>
                  <div className="text-xs text-zinc-400">
                    Allow typed messages in teacher-moderated homerooms
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(controls.textChat?.enabled)}
                  onChange={e =>
                    update('textChat', {
                      enabled: e.target.checked,
                      scope: controls.textChat?.scope || 'classes',
                      hours: controls.textChat?.hours,
                      expiresAt: controls.textChat?.expiresAt,
                      grantedAt: e.target.checked ? Date.now() : undefined,
                    })
                  }
                  className="w-5 h-5 accent-emerald-500"
                />
              </div>
              {controls.textChat?.enabled && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[
                    { label: 'For 30 min', mins: 30 },
                    { label: 'For 1 hour', mins: 60 },
                    { label: 'For today', mins: 60 * 12 },
                    { label: 'No expiry', mins: 0 },
                  ].map(p => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() =>
                        update('textChat', {
                          ...controls.textChat!,
                          enabled: true,
                          scope: controls.textChat?.scope || 'classes',
                          expiresAt: p.mins ? Date.now() + p.mins * 60_000 : undefined,
                          grantedAt: Date.now(),
                        })
                      }
                      className="px-2 py-1 rounded-md text-[11px] bg-zinc-900 border border-zinc-700 hover:border-sky-500/50 text-zinc-300"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: TIME ALLOWANCES                                                */}
      {/* ===================================================================== */}
      {activeTab === 'time' && (
        <div className="space-y-5">
          {/* Overall Daily Screen-Time Limit */}
          <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-bold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  Overall Daily Screen-Time Allowance
                </label>
                <p className="text-xs text-zinc-400">
                  Total minutes allowed across all of Plajah per day before the Parent PIN lock screen appears.
                </p>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                Used today: {screenTimeSummary.totalMins || 0}m
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {TIME_LIMIT_PRESETS.map(mins => {
                const active = (controls.dailyTimeLimitMins || 0) === mins;
                return (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => update('dailyTimeLimitMins', mins)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                      active
                        ? 'bg-emerald-500 text-black border-emerald-400'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    {mins === 0 ? 'Unlimited' : mins < 60 ? `${mins} min` : `${mins / 60}h`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Allowed Hours + School Hours Focus Mode */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-2.5">
              <div className="text-sm font-bold">Allowed Time-of-Day Window (Bedtime Lock)</div>
              <p className="text-xs text-zinc-400">
                Outside these hours, the platform automatically locks for sleep/family time.
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs pt-1">
                <span className="text-zinc-400">From</span>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={controls.allowedHours?.start ?? 7}
                  onChange={e =>
                    update('allowedHours', {
                      start: Math.max(0, Math.min(23, Number(e.target.value))),
                      end: controls.allowedHours?.end ?? 20,
                    })
                  }
                  className="w-16 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-center font-bold"
                />
                <span className="text-zinc-400">:00 to</span>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={controls.allowedHours?.end ?? 20}
                  onChange={e =>
                    update('allowedHours', {
                      start: controls.allowedHours?.start ?? 7,
                      end: Math.max(0, Math.min(23, Number(e.target.value))),
                    })
                  }
                  className="w-16 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-center font-bold"
                />
                <span className="text-zinc-400">:00</span>
                {controls.allowedHours && (
                  <button
                    type="button"
                    onClick={() => update('allowedHours', undefined)}
                    className="text-zinc-400 hover:text-white underline ml-1"
                  >
                    Any hour
                  </button>
                )}
              </div>
            </div>

            <label className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 flex items-start justify-between gap-3 cursor-pointer">
              <div>
                <div className="text-sm font-bold flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-emerald-400" />
                  School-Hours Focus Mode (Mon–Fri, 8 AM – 3 PM)
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  During weekday school hours, automatically pause Games, Videos, Movies, and Social Feed so only Academia Learning &amp; Books are accessible.
                </p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(controls.schoolHoursLearningOnly)}
                onChange={e => update('schoolHoursLearningOnly', e.target.checked)}
                className="w-5 h-5 accent-emerald-500 mt-1"
              />
            </label>
          </div>

          {/* Per-Category Daily Time Allowances */}
          <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-3">
            <div>
              <div className="text-sm font-bold">Per-Category Time Allowances</div>
              <p className="text-xs text-zinc-400">
                Set individual daily time caps on specific activities (for example: 30m of Games, 45m of Videos, Unlimited Learning).
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {CATEGORY_ALLOWANCE_META.map(cat => {
                const limitMins = controls.categoryLimitsMins?.[cat.id] || 0;
                const usedMins = screenTimeSummary.byCategory?.[cat.id] || 0;
                const pct = limitMins > 0 ? Math.min(100, Math.round((usedMins / limitMins) * 100)) : 0;
                return (
                  <div
                    key={cat.id}
                    className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-white">{cat.label}</div>
                        <div className="text-[11px] text-zinc-400">{cat.desc}</div>
                      </div>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${cat.color}`}>
                        {usedMins}m today {limitMins > 0 ? `/ ${limitMins}m` : ''}
                      </span>
                    </div>

                    {limitMins > 0 && (
                      <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            pct >= 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-400' : 'bg-emerald-400'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1.5">
                      {CATEGORY_TIME_PRESETS.map(mins => {
                        const active = limitMins === mins;
                        return (
                          <button
                            key={mins}
                            type="button"
                            onClick={() => setCategoryLimit(cat.id, mins)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                              active
                                ? 'bg-emerald-500 text-black border-emerald-400 font-bold'
                                : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                            }`}
                          >
                            {mins === 0 ? 'No cap' : `${mins}m`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: WORD & TOPIC FILTERS                                           */}
      {/* ===================================================================== */}
      {activeTab === 'words' && (
        <div className="space-y-4">
          {/* Profanity Filter Master Toggle */}
          <label className="flex items-center justify-between p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 cursor-pointer">
            <div>
              <div className="text-sm font-bold flex items-center gap-2">
                <Filter className="w-4 h-4 text-emerald-400" />
                Automatic Profanity &amp; Slur Shield
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Automatically hides any post, comment, video, or item containing profanity, slurs, or explicit language.
              </p>
            </div>
            <input
              type="checkbox"
              checked={controls.profanityFilter !== false}
              onChange={e => update('profanityFilter', e.target.checked)}
              className="w-5 h-5 accent-emerald-500"
            />
          </label>

          {/* Custom Blocked Words & Phrases */}
          <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-3">
            <div>
              <div className="text-sm font-bold">Custom Blocked Words, Phrases &amp; Topics</div>
              <p className="text-xs text-zinc-400">
                Add specific words, names, slang, or topics you don&apos;t want {target.displayName || 'your child'} to see. Any post, video, book, or game matching these words is hidden automatically.
              </p>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={wordInput}
                onChange={e => setWordInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addBlockedWords(wordInput);
                  }
                }}
                placeholder="Type a word or comma-separated list (e.g. zombie, prank, spoiler) and press Enter"
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => addBlockedWords(wordInput)}
                disabled={!wordInput.trim()}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black font-bold text-xs flex items-center gap-1.5 shrink-0"
              >
                <Plus className="w-4 h-4" />
                Add Word
              </button>
            </div>

            {/* Quick-Add Preset Packs */}
            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] text-zinc-400 font-semibold">
                Quick-Add Filter Packs:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_WORD_PACKS.map(pack => (
                  <button
                    key={pack.label}
                    type="button"
                    onClick={() => addBlockedWords(pack.words.join(','))}
                    className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3 text-emerald-400" />
                    {pack.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Active Blocked Words Chips */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-zinc-300">
                  Blocked Words ({controls.blockedWords?.length || 0})
                </span>
                {(controls.blockedWords?.length || 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => update('blockedWords', [])}
                    className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Clear all
                  </button>
                )}
              </div>

              {(controls.blockedWords?.length || 0) === 0 ? (
                <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80 text-xs text-zinc-500 text-center">
                  No custom blocked words yet. Type a word above or click a Quick-Add Filter Pack.
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {(controls.blockedWords || []).map(word => (
                    <span
                      key={word}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs font-medium"
                    >
                      {word}
                      <button
                        type="button"
                        onClick={() => removeBlockedWord(word)}
                        className="text-amber-300/70 hover:text-white"
                        title={`Remove "${word}"`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 5: ACTIVITY HISTORY                                               */}
      {/* ===================================================================== */}
      {activeTab === 'activity' && (
        <div className="space-y-4">
          {/* Today's Screen Time Summary Bar */}
          <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-bold flex items-center gap-2">
                  <History className="w-4 h-4 text-emerald-400" />
                  {target.displayName || 'Child'}&apos;s Activity &amp; Screen-Time History
                </div>
                <p className="text-xs text-zinc-400">
                  Real-time log of learning sessions, books read, games/videos opened, posts, and blocked-access alerts.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={refreshActivity}
                  disabled={activityLoading}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${activityLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                {activityEntries.length > 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      await clearChildActivityHistory(target.uid);
                      await refreshActivity();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-rose-950/40 border border-zinc-800 hover:border-rose-500/40 text-xs text-zinc-400 hover:text-rose-300 flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear Log
                  </button>
                )}
              </div>
            </div>

            {/* Today's usage tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 pt-1">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                <div className="text-[10px] uppercase tracking-wider text-emerald-300 font-bold">Total Today</div>
                <div className="text-lg font-black text-white mt-0.5">{screenTimeSummary.totalMins || 0}m</div>
              </div>
              {(['learning', 'books', 'games', 'videos', 'movies', 'social'] as ChildActivityCategory[]).map(cat => (
                <div key={cat} className="p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold capitalize">{cat}</div>
                  <div className="text-base font-bold text-zinc-100 mt-0.5">
                    {screenTimeSummary.byCategory?.[cat] || 0}m
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Filter pills + search */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {([
                { id: 'all', label: 'All Activity' },
                { id: 'learning', label: 'Learning & Quests' },
                { id: 'books', label: 'Books & Reading' },
                { id: 'games', label: 'Games' },
                { id: 'videos', label: 'Videos' },
                { id: 'social', label: 'Social & Chat' },
                { id: 'blocked', label: `Blocked Alerts (${blockedCount})` },
              ] as { id: typeof activityCategoryFilter; label: string }[]).map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setActivityCategoryFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    activityCategoryFilter === f.id
                      ? 'bg-emerald-500 text-black border-emerald-400 font-bold'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={activitySearch}
                onChange={e => setActivitySearch(e.target.value)}
                placeholder="Search history…"
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Timeline List */}
          <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
            {activityLoading ? (
              <div className="p-8 text-center text-xs text-zinc-400">
                Loading {target.displayName || 'child'}&apos;s activity history…
              </div>
            ) : filteredActivities.length === 0 ? (
              <div className="p-8 rounded-xl bg-zinc-950/50 border border-zinc-800/80 text-center space-y-1">
                <div className="text-sm font-semibold text-zinc-300">No activity recorded in this filter yet</div>
                <p className="text-xs text-zinc-500">
                  As {target.displayName || 'your child'} opens lessons, reads books, plays games, or watches videos, their timeline will appear here automatically.
                </p>
              </div>
            ) : (
              filteredActivities.map(item => {
                const isBlocked = item.action === 'blocked_attempt' || Boolean(item.flaggedReason);
                return (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 ${
                      isBlocked
                        ? 'bg-rose-950/25 border-rose-500/40'
                        : 'bg-zinc-950/70 border-zinc-800/90'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold ${
                          isBlocked
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : item.category === 'learning' || item.category === 'books'
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : item.category === 'games'
                            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                            : 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                        }`}
                      >
                        {isBlocked ? <AlertTriangle className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-white">{item.title}</span>
                          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-700 text-zinc-300 font-semibold">
                            {item.category}
                          </span>
                          {typeof item.durationMins === 'number' && item.durationMins > 0 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 font-semibold">
                              {item.durationMins} min
                            </span>
                          )}
                        </div>
                        {item.detail && (
                          <p className="text-xs text-zinc-400 mt-0.5 break-words">{item.detail}</p>
                        )}
                        {item.flaggedReason && (
                          <p className="text-[11px] text-rose-300 font-medium mt-1">
                            Blocked reason: {item.flaggedReason}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-[11px] text-zinc-500 whitespace-nowrap shrink-0">
                      {new Date(item.timestamp).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Footer Save Bar (shown on all tabs) */}
      {error && <div className="text-xs text-rose-400 font-medium">{error}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-800">
        <div className="text-xs text-zinc-500">
          {savedAt
            ? `All parental controls saved at ${new Date(savedAt).toLocaleTimeString()}`
            : 'Changes sync immediately to your child’s account across all devices.'}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-extrabold text-xs md:text-sm transition shadow-lg shadow-emerald-500/10"
        >
          {saving ? 'Saving Controls…' : 'Save Parental Controls'}
        </button>
      </div>
    </div>
  );
};

export default ParentalControlsPanel;
