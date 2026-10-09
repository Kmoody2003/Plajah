// Notification preferences panel — opened from the gear in the Notification Hub.
// Lets a user turn push off entirely (master) or mute individual categories. In-app
// notifications still appear in the hub; these toggles only govern push delivery.
// Opt-out model: an unset value means enabled, so existing users keep getting everything.

import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, MessageCircle, Heart, Sparkles, Bell, BellOff, Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useLiveAlertsPref } from '../hooks/useLiveAlertsPref';
import { Radio } from 'lucide-react';
import { auth, getNotificationPrefs, updateNotificationPrefs, sendTestPush } from '../services/backendService';
import { sendTestEmail } from '../services/emailNotifyClient';
import { Mail, MailX } from 'lucide-react';

interface NotificationSettingsProps {
  onClose: () => void;
}

type PrefKey = 'push' | 'messages' | 'social' | 'content' | 'system';
type EmailKey = 'emailMessages' | 'emailSocial' | 'emailSystem' | 'emailContent';

// Email is calmer than push by design: messages only if still unread after ~15 min, activity as
// one digest, never one email per like. "New posts" is opt-in (unset = off) — see emailNotifyCore.
const EMAIL_ROWS: { key: EmailKey; label: string; desc: string; optIn?: boolean }[] = [
  { key: 'emailMessages', label: 'Unread messages', desc: 'If a message sits unread for 15 minutes' },
  { key: 'emailSocial', label: 'Activity digest', desc: 'Likes, comments, follows — bundled into one email' },
  { key: 'emailSystem', label: 'Updates from Plajah', desc: 'Account notices & important announcements' },
  { key: 'emailContent', label: 'New posts', desc: 'From people you follow, in your digest', optIn: true },
];

const CATEGORIES: { key: Exclude<PrefKey, 'push'>; label: string; desc: string; icon: React.ReactNode }[] = [
  { key: 'messages', label: 'Messages', desc: 'Direct messages & chat', icon: <MessageCircle size={15} className="text-blue-400" /> },
  { key: 'social', label: 'Social', desc: 'Likes, comments, follows & mentions', icon: <Heart size={15} className="text-red-400" /> },
  { key: 'content', label: 'New content', desc: 'Posts & releases from people you follow', icon: <Sparkles size={15} className="text-purple-400" /> },
  { key: 'system', label: 'Updates', desc: 'Account & system notifications', icon: <Bell size={15} className="text-small-orange" /> },
];

const Toggle: React.FC<{ on: boolean; disabled?: boolean; onChange: () => void }> = ({ on, disabled, onChange }) => (
  <button
    onClick={onChange}
    disabled={disabled}
    aria-pressed={on}
    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 tap ${on && !disabled ? 'bg-small-orange' : 'bg-white/15'} ${disabled ? 'opacity-40' : ''}`}
  >
    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : ''}`} />
  </button>
);

const NotificationSettings: React.FC<NotificationSettingsProps> = ({ onClose }) => {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [testState, setTestState] = useState<'idle' | 'sending' | 'sent' | 'none' | 'error'>('idle');
  const [testMsg, setTestMsg] = useState('');

  const runTest = async () => {
    setTestState('sending'); setTestMsg('');
    try {
      const { sent, total } = await sendTestPush();
      if (total === 0) {
        setTestState('none');
        setTestMsg('No devices registered yet. Open Plajah on the device you want to test and allow notifications, then try again.');
      } else if (sent > 0) {
        setTestState('sent');
        setTestMsg(`Sent to ${sent} device${sent === 1 ? '' : 's'}. If the app is open you’ll see a toast; background it to see the notification in your tray.`);
      } else {
        setTestState('error');
        setTestMsg('Server accepted no devices — the push service may not be configured (GOOGLE_SERVICE_ACCOUNT_JSON) or your token expired.');
      }
    } catch {
      setTestState('error');
      setTestMsg('Could not reach the push service. Check your connection and try again.');
    }
  };

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    getNotificationPrefs(uid).then((p) => { setPrefs(p); setLoading(false); });
  }, []);

  // undefined => enabled (opt-out default)
  const isOn = (k: PrefKey) => prefs[k] !== false;

  const save = (next: Record<string, boolean>) => {
    setPrefs(next);
    const uid = auth.currentUser?.uid;
    if (uid) updateNotificationPrefs(uid, next).catch(() => {});
  };

  const toggle = (k: PrefKey) => save({ ...prefs, [k]: !isOn(k) });

  const masterOn = isOn('push');
  const [liveAlertsOn, setLiveAlertsOn] = useLiveAlertsPref();

  const emailOn = prefs.email !== false;
  const emailRowOn = (r: { key: EmailKey; optIn?: boolean }) => (r.optIn ? prefs[r.key] === true : prefs[r.key] !== false);
  const weekly = prefs.emailWeekly === true;
  const [emailTest, setEmailTest] = useState<{ state: 'idle' | 'sending' | 'ok' | 'err'; msg: string }>({ state: 'idle', msg: '' });
  const runEmailTest = async () => {
    setEmailTest({ state: 'sending', msg: '' });
    const r = await sendTestEmail();
    if (!('reason' in r)) return setEmailTest({ state: 'ok', msg: `Sent to ${r.to}. Check your inbox (and spam, the first time).` });
    const why: Record<string, string> = {
      not_configured: 'Email sending isn’t switched on for Plajah yet.',
      no_email: 'Your account doesn’t have an email address.',
      email_unverified: 'Verify your email address first — we only email verified addresses.',
      rate_limited: 'One test per minute — try again shortly.',
      error: 'Couldn’t reach the email service. Try again.',
    };
    setEmailTest({ state: 'err', msg: why[r.reason] || why.error });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="flex flex-col h-full"
    >
      <div className="p-6 bg-white/5 border-b border-white/5 flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-[0.3em]">Notification Settings</h3>
        <button onClick={onClose} className="text-white/20 hover:text-white tap"><X size={16} /></button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-2">
        {/* Master switch */}
        <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.04] border border-white/10">
          <div className="shrink-0">{masterOn ? <Bell size={18} className="text-small-orange" /> : <BellOff size={18} className="text-white/40" />}</div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-black uppercase tracking-wider text-white">Push notifications</p>
            <p className="text-[10px] text-white/50 leading-snug">{masterOn ? 'On — you’ll be notified on this device' : 'Off — no push on any device'}</p>
          </div>
          <Toggle on={masterOn} onChange={() => toggle('push')} />
        </div>

        {/* Per-category */}
        {CATEGORIES.map((c) => (
          <div key={c.key} className={`flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5 transition-opacity ${masterOn ? '' : 'opacity-40 pointer-events-none'}`}>
            <div className="shrink-0">{c.icon}</div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-black uppercase tracking-wider text-white">{c.label}</p>
              <p className="text-[10px] text-white/50 leading-snug">{c.desc}</p>
            </div>
            <Toggle on={masterOn && isOn(c.key)} disabled={!masterOn} onChange={() => toggle(c.key)} />
          </div>
        ))}

        {/* Live pop-ups are per-device and independent of push. */}
        <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
          <div className="shrink-0"><Radio size={15} className="text-red-400" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-black uppercase tracking-wider text-white">Live pop-ups</p>
            <p className="text-[10px] text-white/50 leading-snug">Banner when someone you follow goes live — this device only</p>
          </div>
          <Toggle on={liveAlertsOn} onChange={() => setLiveAlertsOn(!liveAlertsOn)} />
        </div>

        {/* Email — independent of push; decided server-side so it never spams. */}
        <div className="mt-3 flex items-center gap-4 p-4 rounded-2xl bg-white/[0.04] border border-white/10">
          <div className="shrink-0">{emailOn ? <Mail size={18} className="text-small-orange" /> : <MailX size={18} className="text-white/40" />}</div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-black uppercase tracking-wider text-white">Email</p>
            <p className="text-[10px] text-white/50 leading-snug">{emailOn ? 'On — only what you’d otherwise miss' : 'Off — no notification emails'}</p>
          </div>
          <Toggle on={emailOn} onChange={() => save({ ...prefs, email: !emailOn })} />
        </div>
        {EMAIL_ROWS.map((r) => (
          <div key={r.key} className={`flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5 transition-opacity ${emailOn ? '' : 'opacity-40 pointer-events-none'}`}>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-black uppercase tracking-wider text-white">{r.label}</p>
              <p className="text-[10px] text-white/50 leading-snug">{r.desc}</p>
            </div>
            <Toggle on={emailOn && emailRowOn(r)} disabled={!emailOn} onChange={() => save({ ...prefs, [r.key]: !emailRowOn(r) })} />
          </div>
        ))}
        <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-white/[0.02] border border-white/5 ${emailOn ? '' : 'opacity-40 pointer-events-none'}`}>
          <p className="text-[11px] font-black uppercase tracking-wider text-white">Digest</p>
          <div className="flex rounded-full bg-white/10 p-0.5" role="radiogroup" aria-label="Digest frequency">
            {(['Daily', 'Weekly'] as const).map((f) => {
              const active = (f === 'Weekly') === weekly;
              return (
                <button key={f} role="radio" aria-checked={active} onClick={() => save({ ...prefs, emailWeekly: f === 'Weekly' })}
                  className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider tap transition-colors ${active ? 'bg-small-orange text-white' : 'text-white/60'}`}>{f}</button>
              );
            })}
          </div>
        </div>
        <button
          onClick={runEmailTest}
          disabled={emailTest.state === 'sending'}
          className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-white/80 text-[10px] font-black uppercase tracking-widest transition-colors tap disabled:opacity-60"
        >
          {emailTest.state === 'sending' ? <><Loader2 size={13} className="animate-spin" /> Sending…</> : <><Mail size={13} /> Send test email</>}
        </button>
        {emailTest.msg && (
          <div className={`flex items-start gap-2 px-1 text-[10px] leading-relaxed ${emailTest.state === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
            {emailTest.state === 'ok' ? <CheckCircle2 size={13} className="shrink-0 mt-0.5" /> : <AlertCircle size={13} className="shrink-0 mt-0.5" />}
            <span>{emailTest.msg}</span>
          </div>
        )}

        {loading && <p className="text-center text-[9px] font-black uppercase tracking-widest text-white/20 py-4">Loading…</p>}

        {/* Send a test push to all of the current user's own devices */}
        <div className="mt-2 pt-3 border-t border-white/5">
          <button
            onClick={runTest}
            disabled={testState === 'sending'}
            className="w-full flex items-center justify-center gap-2 p-3.5 rounded-2xl bg-small-orange/15 hover:bg-small-orange/25 border border-small-orange/30 text-small-orange text-[11px] font-black uppercase tracking-widest transition-colors tap disabled:opacity-60"
          >
            {testState === 'sending'
              ? <><Loader2 size={14} className="animate-spin" /> Sending…</>
              : <><Send size={14} /> Send test notification</>}
          </button>
          {testMsg && (
            <div className={`mt-3 flex items-start gap-2 px-1 text-[10px] leading-relaxed ${testState === 'sent' ? 'text-green-400' : testState === 'none' ? 'text-white/50' : 'text-red-400'}`}>
              {testState === 'sent' ? <CheckCircle2 size={13} className="shrink-0 mt-0.5" /> : <AlertCircle size={13} className="shrink-0 mt-0.5" />}
              <span>{testMsg}</span>
            </div>
          )}
        </div>

        <p className="text-center text-[9px] text-white/25 leading-relaxed px-4 pt-2">
          Muted categories still appear in your Notification Hub — you just won’t get a push for them.
        </p>
      </div>
    </motion.div>
  );
};

export default NotificationSettings;
