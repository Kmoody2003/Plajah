import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, ExternalLink, RefreshCw, CheckCircle, AlertCircle, X, Globe, Bird, Layers } from 'lucide-react';
import { useFediverse } from '../contexts/FediverseContext';
import type { FediverseProtocol, FediverseAccount } from '../services/fediverse/types';

// ─── Protocol meta ────────────────────────────────────────────────────────────

const PROTOCOLS: {
  id: FediverseProtocol;
  label: string;
  color: string;
  bg: string;
  icon: React.ReactNode;
  connectGuide: React.ReactNode;
}[] = [
  {
    id: 'mastodon',
    label: 'Mastodon',
    color: '#6364FF',
    bg: '#6364FF15',
    icon: <Globe size={16} />,
    connectGuide: (
      <p className="text-[10px] text-white/40 leading-relaxed">
        In your Mastodon instance: <strong className="text-white/60">Preferences → Development → New Application</strong>.
        Give it <code className="text-purple-300">read write follow</code> scopes, then copy the <strong className="text-white/60">Your access token</strong>.
      </p>
    ),
  },
  {
    id: 'bluesky',
    label: 'Bluesky',
    color: '#0085ff',
    bg: '#0085ff15',
    icon: <Bird size={16} />,
    connectGuide: (
      <p className="text-[10px] text-white/40 leading-relaxed">
        In Bluesky: <strong className="text-white/60">Settings → Privacy and Security → App Passwords → Add App Password</strong>.
        Enter your handle and the generated password below.
      </p>
    ),
  },
  {
    id: 'threads',
    label: 'Threads',
    color: '#1C1C1E',
    bg: '#ffffff10',
    icon: <Layers size={16} />,
    connectGuide: (
      <p className="text-[10px] text-white/40 leading-relaxed">
        Obtain a long-lived Threads access token from the{' '}
        <strong className="text-white/60">Meta Developer Portal → Threads API</strong>.
        Note: Threads only supports publishing — no follow graph or notifications.
      </p>
    ),
  },
];

// ─── Protocol badge ───────────────────────────────────────────────────────────

function ProtocolBadge({ protocol }: { protocol: FediverseProtocol }) {
  const meta = PROTOCOLS.find(p => p.id === protocol)!;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest"
      style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}30` }}>
      {meta.icon}
      {meta.label}
    </span>
  );
}

// ─── Connected account card ───────────────────────────────────────────────────

function AccountCard({ account, onDisconnect }: { account: FediverseAccount; onDisconnect: () => void }) {
  const [confirming, setConfirming] = useState(false);

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
          style={{ background: PROTOCOLS.find(p => p.id === account.protocol)?.bg }}>
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
              Confirm
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

// ─── Connect form ─────────────────────────────────────────────────────────────

type ConnectStatus = 'idle' | 'loading' | 'success' | 'error';

function MastodonForm({ onSuccess }: { onSuccess: () => void }) {
  const { connectMastodonAccount } = useFediverse();
  const [instanceUrl, setInstanceUrl] = useState('');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<ConnectStatus>('idle');
  const [errMsg, setErrMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instanceUrl.trim() || !token.trim()) return;
    setStatus('loading');
    try {
      const url = instanceUrl.trim().startsWith('http')
        ? instanceUrl.trim()
        : `https://${instanceUrl.trim()}`;
      await connectMastodonAccount(url, token.trim());
      setStatus('success');
      setTimeout(onSuccess, 800);
    } catch (err) {
      setStatus('error');
      setErrMsg(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-4">
      <input
        value={instanceUrl} onChange={e => setInstanceUrl(e.target.value)}
        placeholder="mastodon.social"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#6364FF]/50"
        required
      />
      <input
        value={token} onChange={e => setToken(e.target.value)}
        placeholder="Access token"
        type="password"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#6364FF]/50"
        required
      />
      <StatusButton status={status} color="#6364FF" label="Connect Mastodon" errMsg={errMsg} />
    </form>
  );
}

function BlueskyForm({ onSuccess }: { onSuccess: () => void }) {
  const { connectBlueskyAccount } = useFediverse();
  const [handle, setHandle] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [status, setStatus] = useState<ConnectStatus>('idle');
  const [errMsg, setErrMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim() || !appPassword.trim()) return;
    setStatus('loading');
    try {
      await connectBlueskyAccount(handle.trim(), appPassword.trim());
      setStatus('success');
      setTimeout(onSuccess, 800);
    } catch (err) {
      setStatus('error');
      setErrMsg(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-4">
      <input
        value={handle} onChange={e => setHandle(e.target.value)}
        placeholder="yourhandle.bsky.social"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0085ff]/50"
        required
      />
      <input
        value={appPassword} onChange={e => setAppPassword(e.target.value)}
        placeholder="App password (xxxx-xxxx-xxxx-xxxx)"
        type="password"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0085ff]/50"
        required
      />
      <StatusButton status={status} color="#0085ff" label="Connect Bluesky" errMsg={errMsg} />
    </form>
  );
}

function ThreadsForm({ onSuccess }: { onSuccess: () => void }) {
  const { connectThreadsAccount } = useFediverse();
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<ConnectStatus>('idle');
  const [errMsg, setErrMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setStatus('loading');
    try {
      await connectThreadsAccount(token.trim());
      setStatus('success');
      setTimeout(onSuccess, 800);
    } catch (err) {
      setStatus('error');
      setErrMsg(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-4">
      <input
        value={token} onChange={e => setToken(e.target.value)}
        placeholder="Long-lived access token"
        type="password"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/20"
        required
      />
      <StatusButton status={status} color="#ffffff" label="Connect Threads" errMsg={errMsg} />
    </form>
  );
}

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
      {status === 'error' && (
        <p className="mt-2 text-[10px] text-red-400 flex items-center gap-1">
          <AlertCircle size={10} /> {errMsg}
        </p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type ConnectPanel = FediverseProtocol | null;

export default function FediverseSettings() {
  const { accounts, feed, isLoadingFeed, isLoadingAccounts, disconnectAccount, refreshFeed } = useFediverse();
  const [connectPanel, setConnectPanel] = useState<ConnectPanel>(null);

  const totalPosts = feed.length;
  const byProtocol = (p: FediverseProtocol) => accounts.filter(a => a.protocol === p).length;

  return (
    <div className="flex flex-col gap-6 max-w-xl">

      {/* Header stats */}
      <div className="grid grid-cols-3 gap-3">
        {PROTOCOLS.map(p => (
          <div key={p.id} className="flex flex-col gap-1 p-3 rounded-xl"
            style={{ background: p.bg, border: `1px solid ${p.color}20` }}>
            <div className="flex items-center gap-1.5" style={{ color: p.color }}>
              {p.icon}
              <span className="text-[10px] font-black uppercase tracking-widest">{p.label}</span>
            </div>
            <p className="text-2xl font-black text-white">{byProtocol(p.id)}</p>
            <p className="text-[9px] text-white/30">{byProtocol(p.id) === 1 ? 'account' : 'accounts'}</p>
          </div>
        ))}
      </div>

      {/* Connected accounts */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-white/60">Connected accounts</h3>
          <button onClick={refreshFeed} disabled={isLoadingFeed}
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors">
            <RefreshCw size={10} className={isLoadingFeed ? 'animate-spin' : ''} />
            {isLoadingFeed ? 'Refreshing…' : `${totalPosts} posts`}
          </button>
        </div>

        {isLoadingAccounts ? (
          <div className="flex items-center gap-2 text-white/30 py-4">
            <RefreshCw size={12} className="animate-spin" />
            <span className="text-xs">Loading accounts…</span>
          </div>
        ) : accounts.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-white/20 text-sm">No accounts connected yet.</p>
            <p className="text-white/15 text-xs mt-1">Connect a Mastodon, Bluesky, or Threads account below.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <AnimatePresence>
              {accounts.map(acc => (
                <AccountCard
                  key={acc.id}
                  account={acc}
                  onDisconnect={() => disconnectAccount(acc.id)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Add account section */}
      <div>
        <h3 className="text-xs font-black uppercase tracking-widest text-white/60 mb-3">Add account</h3>
        <div className="flex gap-2 flex-wrap">
          {PROTOCOLS.map(p => (
            <button key={p.id} onClick={() => setConnectPanel(connectPanel === p.id ? null : p.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
              style={{
                background: connectPanel === p.id ? p.color : p.bg,
                color: connectPanel === p.id ? '#fff' : p.color,
                border: `1px solid ${p.color}40`,
              }}>
              {p.icon} {p.label}
            </button>
          ))}
        </div>

        <AnimatePresence>
          {connectPanel && (() => {
            const meta = PROTOCOLS.find(p => p.id === connectPanel)!;
            return (
              <motion.div
                key={connectPanel}
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 rounded-xl" style={{ background: meta.bg, border: `1px solid ${meta.color}20` }}>
                  <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: meta.color }}>
                    Connect {meta.label}
                  </p>
                  {meta.connectGuide}
                  {connectPanel === 'mastodon' && (
                    <MastodonForm onSuccess={() => setConnectPanel(null)} />
                  )}
                  {connectPanel === 'bluesky' && (
                    <BlueskyForm onSuccess={() => setConnectPanel(null)} />
                  )}
                  {connectPanel === 'threads' && (
                    <ThreadsForm onSuccess={() => setConnectPanel(null)} />
                  )}
                </div>
              </motion.div>
            );
          })()}
        </AnimatePresence>
      </div>

      {/* Capability matrix */}
      <div>
        <h3 className="text-xs font-black uppercase tracking-widest text-white/60 mb-3">Platform capabilities</h3>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          <table className="w-full text-[10px]">
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                <th className="text-left px-3 py-2 font-black uppercase tracking-widest text-white/40">Feature</th>
                {PROTOCOLS.map(p => (
                  <th key={p.id} className="px-3 py-2 font-black uppercase tracking-widest" style={{ color: p.color }}>
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Home timeline', vals: ['✅', '✅', '❌'] },
                { label: 'Publish posts', vals: ['✅', '✅', '✅'] },
                { label: 'Reply to posts', vals: ['✅', '✅', '✅'] },
                { label: 'Like / unlike', vals: ['✅', '✅', '❌'] },
                { label: 'Repost / boost', vals: ['✅', '✅', '❌'] },
                { label: 'Follow / unfollow', vals: ['✅', '✅', '❌'] },
                { label: 'Notifications', vals: ['✅', '✅', '❌'] },
                { label: 'Cross-post', vals: ['✅', '✅', '✅'] },
              ].map((row, i) => (
                <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <td className="px-3 py-2 text-white/50">{row.label}</td>
                  {row.vals.map((v, j) => (
                    <td key={j} className="px-3 py-2 text-center">{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
