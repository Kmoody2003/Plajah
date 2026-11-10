// NetworkInvites — "Bring your networks": optional Bluesky + Audius connections, offered to new members.
//
// Bluesky and Audius are ON by default for everyone (Social shows their public feeds and Chora streams Audius with no
// account). This card only adds the personal layer: your own timeline, likes, reposts, posting out. Plajah cannot open
// accounts on those networks on someone's behalf (each network owns its own sign-up, terms and keys), so the card hands
// off to each network's own screen in a popup, and comes back connected:
//   • Bluesky — "Create account" opens bsky.social's sign-up (ATProto OAuth prompt=create); "I have one" signs in.
//   • Audius — its consent screen has its own sign-up, so one button covers new and existing members.
// Fully skippable; nothing here blocks onboarding.

import React, { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useFediverse } from '../../contexts/FediverseContext';
import { getAudiusSession, startAudiusAuth, AUDIUS_SESSION_EVENT } from '../../services/audiusAuth';

const ROW = 'flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3';
const BTN = 'rounded-full px-3.5 py-2 text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-40';

export default function NetworkInvites({ className = '' }: { className?: string }) {
  const { accounts, connectBlueskyOAuth, connectThreadsOAuth } = useFediverse();
  const bsky = accounts.find(a => a.protocol === 'bluesky');
  const threads = accounts.find(a => a.protocol === 'threads');
  const [audius, setAudius] = useState(() => getAudiusSession());
  const [busy, setBusy] = useState<'bsky-new' | 'bsky' | 'audius' | 'threads' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const on = () => setAudius(getAudiusSession());
    window.addEventListener(AUDIUS_SESSION_EVENT, on);
    return () => window.removeEventListener(AUDIUS_SESSION_EVENT, on);
  }, []);

  const run = async (k: 'bsky-new' | 'bsky' | 'audius' | 'threads') => {
    setBusy(k); setErr(null);
    try {
      if (k === 'audius') setAudius(await startAudiusAuth({ scope: 'write' }));
      else if (k === 'threads') await connectThreadsOAuth();
      else await connectBlueskyOAuth(undefined, { create: k === 'bsky-new' });
    } catch (e: any) {
      setErr(e?.message || 'That didn’t connect. You can try again from Settings › Social networks.');
    } finally { setBusy(null); }
  };

  return (
    <div className={className}>
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 mb-2">Bring your networks · optional</p>
      <div className="flex flex-col gap-2">
        <div className={ROW}>
          <span className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0" style={{ background: '#1185fe22' }}>🦋</span>
          <span className="min-w-0 mr-auto">
            <span className="block text-[14px] font-black text-white">Bluesky</span>
            <span className="block text-[12px] text-white/55">{bsky ? `Connected as ${bsky.handle || 'your account'}` : 'Your timeline in Social, and share your posts out.'}</span>
          </span>
          {bsky ? <Check size={18} className="text-[#1185fe] shrink-0" /> : (
            <span className="flex gap-1.5 shrink-0">
              <button type="button" disabled={!!busy} onClick={() => run('bsky')} className={`${BTN} border border-white/15 text-white/75 hover:bg-white/5`}>
                {busy === 'bsky' ? <Loader2 size={12} className="animate-spin" /> : 'I have one'}
              </button>
              <button type="button" disabled={!!busy} onClick={() => run('bsky-new')} className={`${BTN} text-white`} style={{ background: '#1185fe' }}>
                {busy === 'bsky-new' ? <Loader2 size={12} className="animate-spin" /> : 'Create free'}
              </button>
            </span>
          )}
        </div>
        <div className={ROW}>
          <span className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0" style={{ background: '#a855f722' }}>🎧</span>
          <span className="min-w-0 mr-auto">
            <span className="block text-[14px] font-black text-white">Audius</span>
            <span className="block text-[12px] text-white/55">{audius ? `Connected as @${audius.handle}` : 'Your likes, follows and feed in Chora + Social.'}</span>
          </span>
          {audius ? <Check size={18} className="text-[#a855f7] shrink-0" /> : (
            <button type="button" disabled={!!busy} onClick={() => run('audius')} className={`${BTN} text-white shrink-0`} style={{ background: '#a855f7' }}>
              {busy === 'audius' ? <Loader2 size={12} className="animate-spin" /> : 'Connect or join'}
            </button>
          )}
        </div>
        <div className={ROW}>
          <span className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-black shrink-0 bg-white/10 text-white">@</span>
          <span className="min-w-0 mr-auto">
            <span className="block text-[14px] font-black text-white">Threads</span>
            <span className="block text-[12px] text-white/55">{threads ? `Connected as ${threads.handle || 'your account'}` : 'Share your posts to Threads, and see yours in Social.'}</span>
          </span>
          {threads ? <Check size={18} className="text-white shrink-0" /> : (
            <button type="button" disabled={!!busy} onClick={() => run('threads')} className={`${BTN} text-black bg-white hover:bg-white/90 shrink-0`}>
              {busy === 'threads' ? <Loader2 size={12} className="animate-spin" /> : 'Continue'}
            </button>
          )}
        </div>
      </div>
      <p className="text-[11px] text-white/35 mt-2">Bluesky and Audius already show up in Social and Chora without an account. Connecting just makes them yours.</p>
      {err && <p className="text-[11px] text-red-300/80 mt-1">{err}</p>}
    </div>
  );
}

export { NetworkInvites };
