import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Trash2, ExternalLink, RefreshCw, CheckCircle, AlertCircle, X,
  Globe, Bird, Layers, Lock, Unlock,
} from 'lucide-react';
import { useFediverse } from '../contexts/FediverseContext';
import type { FediverseProtocol, FediverseAccount } from '../services/fediverse/types';

// ─── Protocol metadata ─────────────────────────────────────────────────────────

interface ProtocolMeta {
  id: FediverseProtocol;
  label: string;
  color: string;
  bg: string;
  icon: React.ReactNode;
  description: string;
  oauthSupported: boolean;
}

const PROTOCOLS: ProtocolMeta[] = [
  {
    id: 'mastodon',
    label: 'Mastodon',
    color: '#6364FF',
    bg: '#6364FF15',
    icon: <Globe size={16} />,
    description: 'ActivityPub — post, follow, and read your Mastodon home timeline on any instance.',
    oauthSupported: true,
  },
  {
    id: 'bluesky',
    label: 'Bluesky',
    color: '#0085ff',
    bg: '#0085ff15',
    icon: <Bird size={16} />,
    description: 'AT Protocol — cross-post with rich link cards, follow graph, and notifications.',
    oauthSupported: false,
  },
  {
    id: 'threads',
    label: 'Threads',
    color: '#888',
    bg: '#88888815',
    icon: <Layers size={16} />,
    description: 'Meta Threads — share your Plajah posts (photos, video, carousels), reply and repost, and see your Threads posts in Social. Meta’s API has no likes, follows or home feed.',
    oauthSupported: true,
  },
];

// ─── Protocol badge ────────────────────────────────────────────────────────────

function ProtocolBadge({ protocol }: { protocol: FediverseProtocol }) {
  const meta = PROTOCOLS.find(p => p.id === protocol)!;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest"
      style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}30` }}>
      {meta.icon} {meta.label}
    </span>
  );
}

// ─── Connected account card ────────────────────────────────────────────────────

function AccountCard({ account, onDisconnect }: { account: FediverseAccount; onDisconnect: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const meta = PROTOCOLS.find(p => p.id === account.protocol)!;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="flex items-center gap-3 p-3 rounded-xl"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {account.avatarUrl ? (
        <img src={account.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-sm font-black"
          style={{ background: meta.bg, color: meta.color }}>
          {account.displayName[0]?.toUpperCase()}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white truncate">{account.displayName}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <ProtocolBadge protocol={account.protocol} />
          <span className="text-[10px] text-white/30 truncate">{account.handle}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <a href={account.profileUrl} target="_blank" rel="noopener noreferrer"
          className="p-1.5 rounded-lg text-white/30 hover:text-white/60 transition-colors">
          <ExternalLink size={12} />
        </a>
        {confirming ? (
          <div className="flex items-center gap-1">
            <button onClick={onDisconnect}
              className="px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest text-red-400 hover:bg-red-400/10 transition-colors">
              Disconnect
            </button>
            <button onClick={() => setConfirming(false)}
              className="p-1.5 rounded-lg text-white/30 hover:text-white/60 transition-colors">
              <X size={12} />
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)}
            className="p-1.5 rounded-lg text-white/20 hover:text-red-400 transition-colors">
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ─── Status button ─────────────────────────────────────────────────────────────

type ConnectStatus = 'idle' | 'loading' | 'success' | 'error';

function StatusButton({ status, color, label, errMsg }: {
  status: ConnectStatus; color: string; label: string; errMsg: string;
}) {
  return (
    <div>
      <button type="submit" disabled={status === 'loading' || status === 'success'}
        className="w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
        style={{
          background: status === 'success' ? '#22c55e20' : `${color}20`,
          color: status === 'success' ? '#22c55e' : color,
          border: `1px solid ${status === 'success' ? '#22c55e40' : `${color}40`}`,
          opacity: status === 'loading' ? 0.6 : 1,
        }}>
        {status === 'loading' && <RefreshCw size={12} className="animate-spin" />}
        {status === 'success' && <CheckCircle size={12} />}
        {status === 'success' ? 'Connected!' : label}
      </button>
      {status === 'error' && errMsg && (
        <p className="mt-2 text-[10px] text-red-400 flex items-center gap-1">
          <AlertCircle size={10} /> {errMsg}
        </p>
      )}
    </div>
  );
}

// ─── Mastodon form — OAuth popup + manual token fallback ──────────────────────

function MastodonForm({ onSuccess }: { onSuccess: () => void }) {
  const { connectMastodonOAuth, connectMastodonToken } = useFediverse();
  const [instanceUrl, setInstanceUrl] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [status, setStatus] = useState<ConnectStatus>('idle');
  const [errMsg, setErrMsg] = useState('');

  const normalizeInstance = (val: string) =>
    val.trim().startsWith('http') ? val.trim() : `https://${val.trim()}`;

  const handleOAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instanceUrl.trim()) return;
    setStatus('loading');
    setErrMsg('');
    try {
      await connectMastodonOAuth(normalizeInstance(instanceUrl));
      setStatus('success');
      setTimeout(onSuccess, 800);
    } catch (err) {
      setStatus('error');
      setErrMsg(err instanceof Error ? err.message : 'OAuth failed');
    }
  };

  const handleManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instanceUrl.trim() || !manualToken.trim()) return;
    setStatus('loading');
    setErrMsg('');
    try {
      await connectMastodonToken(normalizeInstance(instanceUrl), manualToken.trim());
      setStatus('success');
      setTimeout(onSuccess, 800);
    } catch (err) {
      setStatus('error');
      setErrMsg(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  return (
    <div className="flex flex-col gap-3 mt-4">
      <input
        value={instanceUrl}
        onChange={e => { setInstanceUrl(e.target.value); setStatus('idle'); setErrMsg(''); }}
        placeholder="mastodon.social"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#6364FF]/50"
      />

      {!showManual ? (
        <form onSubmit={handleOAuth} className="flex flex-col gap-2">
          <StatusButton status={status} color="#6364FF" label="Sign in with Mastodon" errMsg={errMsg} />
          <button type="button" onClick={() => setShowManual(true)}
            className="text-[10px] text-white/25 hover:text-white/50 transition-colors text-center flex items-center justify-center gap-1">
            <Unlock size={9} /> Use manual access token instead
          </button>
        </form>
      ) : (
        <form onSubmit={handleManual} className="flex flex-col gap-2">
          <input
            value={manualToken}
            onChange={e => { setManualToken(e.target.value); setStatus('idle'); setErrMsg(''); }}
            placeholder="Your access token"
            type="password"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#6364FF]/50"
          />
          <p className="text-[9px] text-white/30 leading-relaxed">
            In your instance: <strong>Preferences → Development → New Application</strong>{' '}
            with <code className="text-purple-300">read write follow</code> scopes → copy access token.
          </p>
          <StatusButton status={status} color="#6364FF" label="Connect Mastodon" errMsg={errMsg} />
          <button type="button" onClick={() => setShowManual(false)}
            className="text-[10px] text-white/25 hover:text-white/50 transition-colors text-center flex items-center justify-center gap-1">
            <Lock size={9} /> Use OAuth sign-in instead
          </button>
        </form>
      )}
    </div>
  );
}

// ─── Bluesky form ──────────────────────────────────────────────────────────────

function BlueskyForm({ onSuccess }: { onSuccess: () => void }) {
  const { connectBlueskyAccount, connectBlueskyOAuth } = useFediverse();
  const [handle, setHandle] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [pdsUrl, setPdsUrl] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [status, setStatus] = useState<ConnectStatus>('idle');
  const [errMsg, setErrMsg] = useState('');

  // Preferred path: Bluesky's own consent screen. No password ever touches Plajah.
  const handleOAuth = async () => {
    setOauthBusy(true); setStatus('idle'); setErrMsg('');
    try {
      await connectBlueskyOAuth(handle.trim());
      setStatus('success');
      setTimeout(onSuccess, 800);
    } catch (err) {
      setStatus('error');
      setErrMsg(err instanceof Error ? err.message : 'Sign-in failed');
    } finally { setOauthBusy(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim() || !appPassword.trim()) return;
    setStatus('loading');
    try {
      await connectBlueskyAccount(handle.trim(), appPassword.trim(), pdsUrl.trim() || undefined);
      setStatus('success');
      setTimeout(onSuccess, 800);
    } catch (err) {
      setStatus('error');
      setErrMsg(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-4">
      <input value={handle} onChange={e => setHandle(e.target.value)}
        placeholder="yourhandle.bsky.social"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0085ff]/50"
        required={showPassword} />
      <button type="button" onClick={handleOAuth} disabled={oauthBusy}
        className="w-full py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
        style={{ background: '#0085ff' }}>
        {oauthBusy ? 'Waiting for Bluesky…' : 'Sign in with Bluesky'}
      </button>
      <p className="text-[9px] text-white/30 leading-relaxed">
        You approve Plajah on Bluesky's own page — your password never reaches us, and you can revoke access from Bluesky any time.
      </p>
      {status === 'error' && !showPassword && <p className="text-[10px] text-red-300/90">{errMsg}</p>}
      {!showPassword ? (
        <button type="button" onClick={() => setShowPassword(true)} className="text-[10px] text-white/35 hover:text-white/60 underline self-start">
          Use an app password instead
        </button>
      ) : (<>
      <input value={pdsUrl} onChange={e => setPdsUrl(e.target.value)}
        placeholder="Own server (optional) — https://pds.example.com"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder-white/25 focus:outline-none focus:border-[#0085ff]/50" />
      <input value={appPassword} onChange={e => setAppPassword(e.target.value)}
        placeholder="App Password  (xxxx-xxxx-xxxx-xxxx)"
        type="password"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0085ff]/50"
        required />
      <p className="text-[9px] text-white/30 leading-relaxed">
        <strong>Settings → Privacy &amp; Security → App Passwords</strong>.
        The password is sent directly to our server and never stored in your browser.
      </p>
      <StatusButton status={status} color="#0085ff" label="Connect with app password" errMsg={errMsg} />
      </>)}
    </form>
  );
}

// ─── Threads form ──────────────────────────────────────────────────────────────

function ThreadsForm({ onSuccess }: { onSuccess: () => void }) {
  const { connectThreadsOAuth } = useFediverse();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  // One click: Threads' own sign-in/consent page in a popup. No tokens, no developer portal.
  const go = async () => {
    setBusy(true); setErrMsg('');
    try {
      await connectThreadsOAuth();
      setDone(true);
      setTimeout(onSuccess, 800);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Sign-in failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-3 mt-4">
      <button type="button" onClick={go} disabled={busy || done}
        className="w-full py-2.5 rounded-xl text-sm font-bold text-black bg-white hover:bg-white/90 disabled:opacity-60 flex items-center justify-center gap-2">
        <span className="text-base leading-none">@</span>
        {done ? 'Connected' : busy ? 'Waiting for Threads…' : 'Continue with Threads'}
      </button>
      <p className="text-[9px] text-white/30 leading-relaxed">
        You approve Plajah on Threads' own page — your password never reaches us. No Threads account yet? You can make one on that same screen with your Instagram login. Remove access any time in Threads → Settings → Account → Website permissions.
      </p>
      {errMsg && <p className="text-[10px] text-red-300/90">{errMsg}</p>}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
// One card per network, always visible: what it does, who is connected, and a big Connect button that opens that
// network's sign-in right in the card. (The old layout hid all three behind small chips under the feed.)

const CARD_ORDER: FediverseProtocol[] = ['bluesky', 'threads', 'mastodon'];
const CARD_COPY: Record<FediverseProtocol, string> = {
  bluesky: 'Your Bluesky timeline in Social, likes, reposts, replies, and share your posts out.',
  threads: 'Share your Plajah posts to Threads with photos and video, reply and repost, and see your Threads posts in Social.',
  mastodon: 'Any Mastodon server: your home timeline, follows and notifications, and share your posts out.',
};

type ConnectPanel = FediverseProtocol | null;

export default function FediverseSettings() {
  const { accounts, feed, isLoadingFeed, isLoadingAccounts, disconnectAccount, refreshFeed } = useFediverse();
  const [connectPanel, setConnectPanel] = useState<ConnectPanel>(null);

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-widest text-white/60">Your networks</h3>
        {accounts.length > 0 && (
          <button onClick={refreshFeed} disabled={isLoadingFeed}
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors">
            <RefreshCw size={10} className={isLoadingFeed ? 'animate-spin' : ''} />
            {isLoadingFeed ? 'Refreshing…' : `${feed.length} posts loaded`}
          </button>
        )}
      </div>

      {CARD_ORDER.map(id => {
        const meta = PROTOCOLS.find(p => p.id === id)!;
        const mine = accounts.filter(a => a.protocol === id);
        const open = connectPanel === id;
        return (
          <section key={id} className="rounded-2xl p-4 sm:p-5"
            style={{ background: mine.length ? meta.bg : 'rgba(255,255,255,0.03)', border: `1px solid ${mine.length ? `${meta.color}40` : 'rgba(255,255,255,0.08)'}` }}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}30` }}>
                {meta.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-black text-white">{meta.label}</p>
                  {isLoadingAccounts ? (
                    <span className="text-[10px] text-white/30">checking…</span>
                  ) : mine.length ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400"><CheckCircle size={11} /> Connected</span>
                  ) : (
                    <span className="text-[10px] font-bold text-white/30">Not connected</span>
                  )}
                </div>
                <p className="text-[11px] text-white/45 mt-0.5 leading-relaxed">{CARD_COPY[id]}</p>
              </div>
              <button type="button" onClick={() => setConnectPanel(open ? null : id)}
                className="shrink-0 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all"
                style={open
                  ? { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.12)' }
                  : mine.length
                    ? { background: 'transparent', color: meta.color, border: `1px solid ${meta.color}50` }
                    : { background: id === 'threads' ? '#ffffff' : meta.color, color: id === 'threads' ? '#000' : '#fff', border: '1px solid transparent' }}>
                {open ? 'Cancel' : mine.length ? 'Add another' : 'Connect'}
              </button>
            </div>

            {mine.length > 0 && (
              <div className="flex flex-col gap-2 mt-3">
                <AnimatePresence>
                  {mine.map(acc => <AccountCard key={acc.id} account={acc} onDisconnect={() => disconnectAccount(acc.id)} />)}
                </AnimatePresence>
              </div>
            )}

            <AnimatePresence>
              {open && (
                <motion.div key="form" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  {id === 'mastodon' && <MastodonForm onSuccess={() => setConnectPanel(null)} />}
                  {id === 'bluesky' && <BlueskyForm onSuccess={() => setConnectPanel(null)} />}
                  {id === 'threads' && <ThreadsForm onSuccess={() => setConnectPanel(null)} />}
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        );
      })}

      {/* Capability matrix — reference, folded away */}
      <details className="group rounded-xl" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
        <summary className="cursor-pointer select-none px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white/60">What each network allows</summary>
        <table className="w-full text-[10px]">
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
              <th className="text-left px-3 py-2 font-black uppercase tracking-widest text-white/40">Feature</th>
              {PROTOCOLS.map(p => (
                <th key={p.id} className="px-3 py-2 font-black uppercase tracking-widest text-center" style={{ color: p.color }}>{p.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {([
              ['Sign in on the network’s own page', ['✅', '✅', '✅']],
              ['Home timeline',     ['✅', '✅', 'Your posts']],
              ['Publish posts',     ['✅', '✅', '✅']],
              ['Photos / video',    ['✅', '✅', '✅']],
              ['Rich link cards',   ['✅', '✅', '✅']],
              ['Reply threading',   ['✅', '✅', '✅']],
              ['Like / unlike',     ['✅', '✅', '❌']],
              ['Repost / boost',    ['✅', '✅', '✅']],
              ['Follow / unfollow', ['✅', '✅', '❌']],
              ['Notifications',     ['✅', '✅', '❌']],
            ] as [string, string[]][]).map(([label, vals], i) => (
              <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <td className="px-3 py-2 text-white/50">{label}</td>
                {vals.map((v, j) => <td key={j} className="px-3 py-2 text-center">{v}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
