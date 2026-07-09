// Admin push broadcast — send a notification to a single user (by UID) or to every
// user. Calls the admin-gated /api/push/admin endpoint (server verifies the caller's
// Firebase ID token + admin role, gathers tokens, and fans out via FCM). Deep-link is
// an in-app view name (e.g. FEED, MESSAGES) or a path/URL, same routing as any push.

import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Send, Loader2, CheckCircle2, AlertTriangle, Users, User as UserIcon, Radio, X } from 'lucide-react';
import { sendAdminBroadcast } from '../services/backendService';
import { UserProfile } from '../types';

const LINK_PRESETS = ['FEED', 'MESSAGES', 'LIVE_HUB', 'CHORA', 'REELLO', 'ACADEMIA', '/'];

interface AdminPushBroadcastProps {
  users?: UserProfile[];
}

const AdminPushBroadcast: React.FC<AdminPushBroadcastProps> = ({ users = [] }) => {
  const [mode, setMode] = useState<'user' | 'all'>('user');
  const [uid, setUid] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<UserProfile | null>(null);
  const [showList, setShowList] = useState(false);

  // Typeahead: match by display name, email, or exact uid. Cap the dropdown.
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return users
      .filter(u => (u.displayName || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || (u.uid || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, users]);

  // Resolved target uid: the picked user, or a pasted raw UID (Firebase UIDs are ~28 chars).
  const effectiveUid = selected?.uid || (search.trim().length >= 20 ? search.trim() : '');

  const pick = (u: UserProfile) => {
    setSelected(u);
    setUid(u.uid);
    setSearch(u.displayName || u.email || u.uid);
    setShowList(false);
    setResult(null);
  };
  const clearPick = () => { setSelected(null); setUid(''); setSearch(''); setShowList(false); };
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('FEED');
  const [sending, setSending] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const canSend = title.trim() && body.trim() && (mode === 'all' || !!effectiveUid);

  const send = async () => {
    if (!canSend) return;
    if (mode === 'all' && !confirmAll) { setConfirmAll(true); return; }
    setSending(true); setResult(null); setConfirmAll(false);
    const res = await sendAdminBroadcast({ mode, uid: effectiveUid || undefined, title: title.trim(), body: body.trim(), link: link.trim() || 'FEED' });
    setSending(false);
    if ('error' in res) {
      setResult({ ok: false, msg: res.error });
    } else if (res.recipients === 0) {
      setResult({ ok: false, msg: mode === 'all' ? 'No users have registered a device token yet.' : 'That user has no registered device (they need to open the app and allow notifications).' });
    } else if (res.sent === 0) {
      setResult({ ok: false, msg: `Reached ${res.recipients} recipient(s)/${res.devices} device(s) but FCM accepted none — check GOOGLE_SERVICE_ACCOUNT_JSON or that tokens are current.` });
    } else {
      setResult({ ok: true, msg: `Sent to ${res.sent}/${res.devices} device(s) across ${res.recipients} recipient(s).` });
    }
  };

  const field = 'w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/30 focus:border-small-orange/50 focus:outline-none';

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-small-orange/15 flex items-center justify-center">
          <Radio size={22} className="text-small-orange" />
        </div>
        <div>
          <h3 className="text-lg font-black uppercase tracking-tight">Push Broadcast</h3>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Send a notification to one user or everyone</p>
        </div>
      </div>

      {/* Target mode */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {([['user', 'Single user', UserIcon], ['all', 'All users', Users]] as const).map(([m, label, Icon]) => (
          <button
            key={m}
            onClick={() => { setMode(m); setConfirmAll(false); setResult(null); }}
            className={`flex items-center gap-3 px-5 py-4 rounded-2xl border transition-all ${mode === m ? 'bg-white text-black border-white' : 'bg-white/5 text-white/60 border-white/10 hover:text-white'}`}
          >
            <Icon size={18} />
            <span className="text-xs font-black uppercase tracking-wider">{label}</span>
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {mode === 'user' && (
          <div className="relative">
            <label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 block">Recipient — search name, email or paste UID</label>
            <div className="relative">
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setSelected(null); setUid(''); setShowList(true); setResult(null); }}
                onFocus={() => setShowList(true)}
                placeholder="Start typing a name or email…"
                className={field}
              />
              {(selected || search) && (
                <button onClick={clearPick} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"><X size={15} /></button>
              )}
            </div>

            {/* Live typeahead dropdown */}
            {showList && matches.length > 0 && (
              <div className="absolute z-30 mt-2 w-full max-h-64 overflow-y-auto custom-scrollbar bg-[#12121a] border border-white/10 rounded-2xl shadow-2xl">
                {matches.map(u => (
                  <button
                    key={u.uid}
                    onClick={() => pick(u)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-left transition-colors"
                  >
                    <img src={u.photoURL || `https://picsum.photos/seed/${u.uid}/60/60`} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full object-cover border border-white/10 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-white truncate">{u.displayName || 'Unnamed'}</p>
                      <p className="text-[10px] text-white/40 truncate">{u.email || u.uid}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {showList && search.trim() && matches.length === 0 && search.trim().length < 20 && (
              <p className="mt-2 text-[10px] text-white/30 px-1">No match. Keep typing, or paste the full Firebase UID.</p>
            )}

            {/* Resolved target */}
            {selected ? (
              <p className="mt-2 text-[10px] text-green-400 px-1 flex items-center gap-1"><CheckCircle2 size={11} /> {selected.displayName || selected.email} · <span className="text-white/40 font-mono">{selected.uid.slice(0, 10)}…</span></p>
            ) : effectiveUid ? (
              <p className="mt-2 text-[10px] text-green-400/80 px-1 font-mono">Using raw UID: {effectiveUid.slice(0, 14)}…</p>
            ) : null}
          </div>
        )}

        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 block">Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={80} placeholder="Notification title" className={field} />
        </div>

        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 block">Message</label>
          <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={240} rows={3} placeholder="Notification body" className={`${field} resize-none`} />
        </div>

        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 block">Opens (deep link)</label>
          <input value={link} onChange={e => setLink(e.target.value)} placeholder="FEED, MESSAGES, /path or https://…" className={field} />
          <div className="flex flex-wrap gap-2 mt-2">
            {LINK_PRESETS.map(p => (
              <button key={p} onClick={() => setLink(p)} className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-colors ${link === p ? 'bg-small-orange/20 border-small-orange/40 text-small-orange' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}>{p}</button>
            ))}
          </div>
        </div>

        {/* Confirm-all guard */}
        {mode === 'all' && confirmAll && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/30">
            <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-red-300 leading-relaxed">This pushes to <b>every user with a registered device</b>. Tap “Send to everyone” again to confirm.</p>
          </motion.div>
        )}

        <button
          onClick={send}
          disabled={!canSend || sending}
          className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-40 ${mode === 'all' && confirmAll ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-small-orange hover:bg-small-orange/90 text-black'}`}
        >
          {sending
            ? <><Loader2 size={16} className="animate-spin" /> Sending…</>
            : mode === 'all'
              ? <><Users size={16} /> {confirmAll ? 'Send to everyone — confirm' : 'Send to everyone'}</>
              : <><Send size={16} /> Send push</>}
        </button>

        {result && (
          <div className={`flex items-start gap-2 p-4 rounded-2xl text-[11px] leading-relaxed ${result.ok ? 'bg-green-500/10 border border-green-500/30 text-green-300' : 'bg-red-500/10 border border-red-500/30 text-red-300'}`}>
            {result.ok ? <CheckCircle2 size={15} className="shrink-0 mt-0.5" /> : <AlertTriangle size={15} className="shrink-0 mt-0.5" />}
            <span>{result.msg}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPushBroadcast;
