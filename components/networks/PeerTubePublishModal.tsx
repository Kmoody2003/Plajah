/**
 * PeerTubePublishModal — send a Reello video to the creator's own PeerTube channel, on a server they choose.
 * Plajah stays home: playback, comments and the master copy stay here; PeerTube gets a copy.
 *
 * Server: routes/openPublish.ts (/api/open-publish). Same look as AudiusPublishModal.
 *   <PeerTubePublishModal video={video} onClose={…} onPublished={links => …} />
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, Video as VideoIcon, ExternalLink, Loader2, Check, AlertCircle, LogIn, Upload, Trash2, Eye } from 'lucide-react';
import type { Video } from '../../types';
import { auth } from '../../services/firebase';

const API = () => ((import.meta as any).env?.VITE_APP_URL ?? window.location.origin) + '/api/open-publish';

async function call<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in first.');
  const token = await u.getIdToken();
  const res = await fetch(API() + path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((data as any)?.error || `Request failed (${res.status})`), { code: (data as any)?.code, blockers: (data as any)?.blockers });
  return data as T;
}

interface Account { id: string; network: string; instance: string; username: string; displayName: string }
interface Channel { id: number; name: string; displayName: string }
interface Blocker { code: string; message: string }
interface Link { id: string; network: string; accountId: string; instance: string; url: string; state: string; views?: number | null }
interface Job { status: string; progress?: { pct: number; note: string }; items?: { url?: string; state: string; error?: string }[]; error?: string }

interface Props {
  video: Video;
  onClose: () => void;
  onPublished?: (links: Link[]) => void;
}

type Step = 'loading' | 'connect' | 'ready' | 'publishing' | 'done' | 'error';

export default function PeerTubePublishModal({ video, onClose, onPublished }: Props) {
  const [step, setStep] = useState<Step>('loading');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelId, setChannelId] = useState<number | null>(null);
  const [privacy, setPrivacy] = useState<'public' | 'unlisted'>('public');
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // connect form — the password is sent once to Plajah's server, which trades it for a token and forgets it
  const [instance, setInstance] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [needOtp, setNeedOtp] = useState(false);
  const poll = useRef<number | null>(null);

  const loadLinks = useCallback(async () => {
    try { setLinks((await call<{ links: Link[] }>(`/links?kind=video&id=${encodeURIComponent(video.id)}`)).links.filter(l => l.network === 'peertube')); } catch { /* not critical */ }
  }, [video.id]);

  const loadChannels = useCallback(async (id: string) => {
    setChannels([]); setChannelId(null);
    try {
      const r = await call<{ channels: Channel[] }>(`/accounts/${id}/targets`);
      setChannels(r.channels);
      setChannelId(r.channels[0]?.id ?? null);
    } catch (e: any) { setError(e.message); }
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [acc, chk] = await Promise.all([
          call<{ accounts: Account[] }>('/accounts'),
          call<{ blockers: Blocker[] }>('/check', { method: 'POST', body: JSON.stringify({ kind: 'video', id: video.id }) }),
        ]);
        if (!live) return;
        const pt = acc.accounts.filter(a => a.network === 'peertube');
        setAccounts(pt); setBlockers(chk.blockers || []);
        if (pt[0]) { setAccountId(pt[0].id); void loadChannels(pt[0].id); setStep('ready'); } else setStep('connect');
        void loadLinks();
      } catch (e: any) { if (live) { setError(e.message); setStep('error'); } }
    })();
    return () => { live = false; if (poll.current) window.clearInterval(poll.current); };
  }, [video.id, loadChannels, loadLinks]);

  const connect = async () => {
    setBusy(true); setError('');
    try {
      const r = await call<{ account: Account; channels: Channel[] }>('/peertube/connect', { method: 'POST', body: JSON.stringify({ instance, username, password, otp: otp || undefined }) });
      setPassword(''); setOtp(''); setNeedOtp(false);
      setAccounts(a => [...a.filter(x => x.id !== r.account.id), r.account]);
      setAccountId(r.account.id); setChannels(r.channels); setChannelId(r.channels[0]?.id ?? null);
      setStep('ready');
    } catch (e: any) {
      setPassword('');
      if (e.code === 'otp_required') setNeedOtp(true);
      setError(e.message);
    } finally { setBusy(false); }
  };

  const disconnect = async (id: string) => {
    if (!window.confirm('Disconnect this PeerTube account? Videos already sent stay on that server.')) return;
    try {
      await call(`/accounts/${id}`, { method: 'DELETE' });
      const rest = accounts.filter(a => a.id !== id);
      setAccounts(rest);
      if (rest[0]) { setAccountId(rest[0].id); void loadChannels(rest[0].id); } else { setAccountId(''); setStep('connect'); }
    } catch (e: any) { setError(e.message); }
  };

  const publish = async () => {
    if (!accountId || channelId == null) return;
    setError(''); setStep('publishing'); setJob({ status: 'queued', progress: { pct: 0, note: 'Starting' } });
    try {
      const { jobId } = await call<{ jobId: string }>('/peertube/publish', { method: 'POST', body: JSON.stringify({ accountId, videoId: video.id, channelId, privacy }) });
      poll.current = window.setInterval(async () => {
        try {
          const { job: j } = await call<{ job: Job }>(`/jobs/${jobId}`);
          setJob(j);
          if (j.status === 'done' || j.status === 'failed') {
            if (poll.current) window.clearInterval(poll.current);
            poll.current = null;
            if (j.status === 'failed') { setError(j.error || j.items?.[0]?.error || 'Publish failed'); setStep('error'); return; }
            await loadLinks();
            setStep('done');
          }
        } catch { /* keep polling */ }
      }, 3000);
    } catch (e: any) {
      if (e.blockers) setBlockers(e.blockers);
      setError(e.message); setStep('error');
    }
  };

  useEffect(() => { if (step === 'done') onPublished?.(links); }, [step, links, onPublished]);

  const removeCopy = async (l: Link) => {
    if (!window.confirm('Delete the copy on PeerTube? Servers that already federated it may keep their copy.')) return;
    try {
      await call('/links', { method: 'DELETE', body: JSON.stringify({ kind: 'video', id: video.id, linkId: l.id }) });
      setLinks(ls => ls.filter(x => x.id !== l.id));
    } catch (e: any) { setError(e.message); }
  };

  const account = accounts.find(a => a.id === accountId);
  const pct = job?.progress?.pct ?? 0;
  const firstUrl = job?.items?.find(i => i.url)?.url;
  const field = 'w-full px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-orange-400/50';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6"
      onClick={() => { if (step !== 'publishing') onClose(); }}>
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="bg-[#141414] border border-white/8 rounded-2xl p-7 max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <VideoIcon size={15} className="text-orange-400" />
            </div>
            <div>
              <div className="font-bold text-sm">Publish to PeerTube</div>
              <div className="text-xs text-white/30">Your channel, on the server you choose</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-white/20 hover:text-white transition-colors"><X size={16}/></button>
        </div>

        <div className="flex items-center gap-3 mb-5 p-3 bg-white/[0.03] rounded-xl border border-white/5">
          {video.thumbnailUrl && <img src={video.thumbnailUrl} alt="" className="w-16 h-10 rounded-lg object-cover shrink-0"/>}
          <div className="min-w-0">
            <div className="font-bold text-sm truncate">{video.title}</div>
            <div className="text-xs text-white/40">Stays on Plajah · a copy goes to PeerTube</div>
          </div>
        </div>

        {links.length > 0 && step !== 'publishing' && (
          <div className="mb-4 space-y-1.5">
            {links.map(l => (
              <div key={l.id} className="flex items-center gap-2 text-xs text-white/50">
                {l.url ? <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:underline truncate flex items-center gap-1"><ExternalLink size={11}/>{new URL(l.instance).host}</a> : <span className="truncate">{new URL(l.instance).host}</span>}
                <span className="text-white/30">{l.state === 'published' ? '' : l.state}</span>
                {typeof l.views === 'number' && <span className="flex items-center gap-1 text-white/40"><Eye size={11}/>{l.views}</span>}
                <button onClick={() => removeCopy(l)} title="Delete the PeerTube copy" className="ml-auto text-white/20 hover:text-red-400"><Trash2 size={12}/></button>
              </div>
            ))}
          </div>
        )}

        {step === 'loading' && (
          <div className="flex justify-center py-6"><Loader2 size={20} className="text-orange-400 animate-spin"/></div>
        )}

        {step === 'connect' && (
          <div className="space-y-3">
            <div className="p-3 bg-orange-500/5 border border-orange-500/15 rounded-xl text-xs text-white/50">
              Sign in to your PeerTube account once. Plajah trades your password for a sign-in token and never stores the password.
            </div>
            <input className={field} placeholder="Server, e.g. video.example.org" value={instance} onChange={e => setInstance(e.target.value)} autoComplete="url"/>
            <input className={field} placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username"/>
            <input className={field} placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password"/>
            {needOtp && <input className={field} placeholder="Two-factor code" value={otp} onChange={e => setOtp(e.target.value)} inputMode="numeric" autoComplete="one-time-code"/>}
            {error && <div className="flex items-center gap-2 text-red-400 text-xs"><AlertCircle size={12}/> {error}</div>}
            <button onClick={connect} disabled={busy || !instance || !username || !password}
              className="w-full py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-400 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
              {busy ? <Loader2 size={15} className="animate-spin"/> : <LogIn size={15}/>} Connect PeerTube
            </button>
            {accounts.length > 0 && <button onClick={() => setStep('ready')} className="w-full text-xs text-white/30 hover:text-white underline">Back</button>}
          </div>
        )}

        {step === 'ready' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-orange-400">
              <Check size={12}/>
              {accounts.length > 1 ? (
                <select value={accountId} onChange={e => { setAccountId(e.target.value); void loadChannels(e.target.value); }} className="bg-transparent text-orange-400 text-xs focus:outline-none">
                  {accounts.map(a => <option key={a.id} value={a.id} className="bg-[#141414]">@{a.username} · {new URL(a.instance).host}</option>)}
                </select>
              ) : account && <span>Connected as <strong>@{account.username}</strong> on {new URL(account.instance).host}</span>}
              <button onClick={() => setStep('connect')} className="ml-auto text-white/20 hover:text-white underline">Add</button>
              {account && <button onClick={() => disconnect(account.id)} className="text-white/20 hover:text-white underline">Disconnect</button>}
            </div>

            <label className="block text-xs text-white/40">Channel
              <select className={field + ' mt-1'} value={channelId ?? ''} onChange={e => setChannelId(Number(e.target.value))}>
                {channels.length === 0 && <option value="">Loading channels…</option>}
                {channels.map(c => <option key={c.id} value={c.id} className="bg-[#141414]">{c.displayName}</option>)}
              </select>
            </label>
            <div className="flex gap-2 text-xs">
              {(['public', 'unlisted'] as const).map(p => (
                <button key={p} onClick={() => setPrivacy(p)}
                  className={`flex-1 py-2 rounded-lg border ${privacy === p ? 'border-orange-400/50 bg-orange-500/10 text-orange-300' : 'border-white/10 text-white/40 hover:text-white'}`}>
                  {p === 'public' ? 'Public' : 'Unlisted'}
                </button>
              ))}
            </div>

            {blockers.length > 0 ? (
              <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl text-xs text-red-300 space-y-1">
                {blockers.map(b => <div key={b.code} className="flex gap-2"><AlertCircle size={12} className="shrink-0 mt-0.5"/>{b.message}</div>)}
              </div>
            ) : (
              <div className="p-3 bg-white/[0.03] border border-white/5 rounded-xl text-xs text-white/40 space-y-1">
                <p>PeerTube servers share videos with each other. If you delete it later, copies other servers already made may stay up.</p>
                <p>Comments and views there stay on PeerTube; Plajah shows a link and the view count.</p>
              </div>
            )}
            {error && <div className="flex items-center gap-2 text-red-400 text-xs"><AlertCircle size={12}/> {error}</div>}
            <button onClick={publish} disabled={blockers.length > 0 || channelId == null}
              className="w-full py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-400 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
              <Upload size={15}/> Publish to PeerTube
            </button>
          </div>
        )}

        {step === 'publishing' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Loader2 size={14} className="animate-spin text-orange-400"/> {job?.progress?.note || 'Working…'}
            </div>
            <div className="w-full bg-white/5 rounded-full h-1.5">
              <div className="bg-orange-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }}/>
            </div>
            <p className="text-xs text-white/30">You can close this; the server keeps going and the link appears here when it’s ready.</p>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-400 font-bold text-sm"><Check size={16}/> Published to PeerTube</div>
            {firstUrl && (
              <a href={firstUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 bg-orange-500/10 border border-orange-500/30 rounded-xl text-orange-400 text-sm hover:bg-orange-500/15 transition-colors">
                <ExternalLink size={13}/> Open on PeerTube
              </a>
            )}
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-red-400 text-sm"><AlertCircle size={14}/> {error || 'Something went wrong'}</div>
            <button onClick={() => { setError(''); setStep(accounts.length ? 'ready' : 'connect'); }}
              className="w-full py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white/60 hover:bg-white/10 transition-colors">
              Try again
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
