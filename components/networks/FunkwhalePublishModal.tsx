/**
 * FunkwhalePublishModal — send a Chora release (or some of its tracks) to the creator's own Funkwhale pod.
 * Chora stays home; the pod gets a copy in a library or a channel the creator picks.
 *
 * Connecting never asks for a Funkwhale password: the creator approves Plajah on their pod and pastes back the code it
 * shows (OAuth out-of-band), or pastes an access token made under Settings → Applications on the pod.
 *
 * Server: routes/openPublish.ts (/api/open-publish). Same look as AudiusPublishModal.
 *   <FunkwhalePublishModal album={album} onClose={…} onPublished={links => …} />
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, Music2, ExternalLink, Loader2, Check, AlertCircle, LogIn, Disc3, Trash2, KeyRound } from 'lucide-react';
import type { Album } from '../../types';
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
interface Library { uuid: string; name: string; privacy: string }
interface Channel { uuid: string; name: string; artistId: number | null }
interface Blocker { code: string; message: string; trackId?: string }
interface Link { id: string; network: string; accountId: string; instance: string; url: string; state: string; trackId?: string }
interface JobItem { trackId?: string; title: string; url?: string; state: string; error?: string }
interface Job { status: string; progress?: { pct: number; note: string }; items?: JobItem[]; error?: string }

interface Props {
  album: Album;
  onClose: () => void;
  onPublished?: (links: Link[]) => void;
}

type Step = 'loading' | 'connect' | 'code' | 'ready' | 'publishing' | 'done' | 'error';
type Target = { type: 'library' | 'channel'; uuid: string; artistId?: number | null };

export default function FunkwhalePublishModal({ album, onClose, onPublished }: Props) {
  const [step, setStep] = useState<Step>('loading');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState('');
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [trackBlockers, setTrackBlockers] = useState<Blocker[]>([]);
  const [eligible, setEligible] = useState<string[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [links, setLinks] = useState<Link[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [instance, setInstance] = useState('');
  const [pendingId, setPendingId] = useState('');
  const [code, setCode] = useState('');
  const [useToken, setUseToken] = useState(false);
  const [appToken, setAppToken] = useState('');
  const poll = useRef<number | null>(null);

  const tracks = album.tracks ?? [];

  const loadLinks = useCallback(async () => {
    try { setLinks((await call<{ links: Link[] }>(`/links?kind=album&id=${encodeURIComponent(album.id)}`)).links.filter(l => l.network === 'funkwhale')); } catch { /* not critical */ }
  }, [album.id]);

  const loadTargets = useCallback(async (id: string) => {
    setLibraries([]); setChannels([]); setTarget(null);
    try {
      const r = await call<{ libraries: Library[]; channels: Channel[] }>(`/accounts/${id}/targets`);
      setLibraries(r.libraries); setChannels(r.channels);
      const first: Target | null = r.channels[0] ? { type: 'channel', uuid: r.channels[0].uuid, artistId: r.channels[0].artistId }
        : r.libraries[0] ? { type: 'library', uuid: r.libraries[0].uuid } : null;
      setTarget(first);
    } catch (e: any) { setError(e.message); }
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [acc, chk] = await Promise.all([
          call<{ accounts: Account[] }>('/accounts'),
          call<{ blockers: Blocker[]; trackBlockers: Blocker[]; eligibleTrackIds: string[] }>('/check', { method: 'POST', body: JSON.stringify({ kind: 'album', id: album.id }) }),
        ]);
        if (!live) return;
        const fw = acc.accounts.filter(a => a.network === 'funkwhale');
        setAccounts(fw);
        setBlockers(chk.blockers || []); setTrackBlockers(chk.trackBlockers || []);
        setEligible(chk.eligibleTrackIds || []); setPicked(new Set(chk.eligibleTrackIds || []));
        if (fw[0]) { setAccountId(fw[0].id); void loadTargets(fw[0].id); setStep('ready'); } else setStep('connect');
        void loadLinks();
      } catch (e: any) { if (live) { setError(e.message); setStep('error'); } }
    })();
    return () => { live = false; if (poll.current) window.clearInterval(poll.current); };
  }, [album.id, loadTargets, loadLinks]);

  const connected = (a: Account) => {
    setAccounts(list => [...list.filter(x => x.id !== a.id), a]);
    setAccountId(a.id); void loadTargets(a.id);
    setCode(''); setAppToken(''); setPendingId('');
    setStep('ready');
  };

  const startConnect = async () => {
    setBusy(true); setError('');
    try {
      if (useToken) {
        const r = await call<{ account: Account }>('/funkwhale/connect/token', { method: 'POST', body: JSON.stringify({ instance, token: appToken }) });
        connected(r.account);
      } else {
        const r = await call<{ accountId: string; authorizeUrl: string }>('/funkwhale/connect/start', { method: 'POST', body: JSON.stringify({ instance }) });
        setPendingId(r.accountId);
        window.open(r.authorizeUrl, '_blank', 'noopener,noreferrer');
        setStep('code');
      }
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const finishConnect = async () => {
    setBusy(true); setError('');
    try {
      const r = await call<{ account: Account }>('/funkwhale/connect/finish', { method: 'POST', body: JSON.stringify({ accountId: pendingId, code }) });
      connected(r.account);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const disconnect = async (id: string) => {
    if (!window.confirm('Disconnect this Funkwhale account? Tracks already sent stay on that pod.')) return;
    try {
      await call(`/accounts/${id}`, { method: 'DELETE' });
      const rest = accounts.filter(a => a.id !== id);
      setAccounts(rest);
      if (rest[0]) { setAccountId(rest[0].id); void loadTargets(rest[0].id); } else { setAccountId(''); setStep('connect'); }
    } catch (e: any) { setError(e.message); }
  };

  const publish = async () => {
    if (!accountId || !target || picked.size === 0) return;
    setError(''); setStep('publishing'); setJob({ status: 'queued', progress: { pct: 0, note: 'Starting' } });
    try {
      const { jobId } = await call<{ jobId: string }>('/funkwhale/publish', { method: 'POST', body: JSON.stringify({ accountId, albumId: album.id, target, trackIds: [...picked] }) });
      poll.current = window.setInterval(async () => {
        try {
          const { job: j } = await call<{ job: Job }>(`/jobs/${jobId}`);
          setJob(j);
          if (j.status === 'done' || j.status === 'failed') {
            if (poll.current) window.clearInterval(poll.current);
            poll.current = null;
            await loadLinks();
            if (j.status === 'failed') { setError(j.error || 'Publish failed'); setStep('error'); return; }
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
    if (!window.confirm('Delete this copy on Funkwhale? Pods that already federated it may keep their copy.')) return;
    try {
      await call('/links', { method: 'DELETE', body: JSON.stringify({ kind: 'album', id: album.id, linkId: l.id }) });
      setLinks(ls => ls.filter(x => x.id !== l.id));
    } catch (e: any) { setError(e.message); }
  };

  const account = accounts.find(a => a.id === accountId);
  const host = (u: string) => { try { return new URL(u).host; } catch { return u; } };
  const blockFor = (id: string) => trackBlockers.find(b => b.trackId === id);
  const linkFor = (id: string) => links.find(l => l.trackId === id && l.accountId === accountId);
  const targetKey = target ? `${target.type}:${target.uuid}` : '';
  const pickedLibrary = target?.type === 'library' ? libraries.find(l => l.uuid === target.uuid) : null;
  const field = 'w-full px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-teal-400/50';

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
            <div className="w-8 h-8 rounded-xl bg-teal-500/10 flex items-center justify-center">
              <Music2 size={15} className="text-teal-400" />
            </div>
            <div>
              <div className="font-bold text-sm">Publish to Funkwhale</div>
              <div className="text-xs text-white/30">Your pod, your library or channel</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-white/20 hover:text-white transition-colors"><X size={16}/></button>
        </div>

        <div className="flex items-center gap-3 mb-5 p-3 bg-white/[0.03] rounded-xl border border-white/5">
          {album.coverImage && <img src={album.coverThumb || album.coverImage} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0"/>}
          <div className="min-w-0">
            <div className="font-bold text-sm truncate">{album.title}</div>
            <div className="text-xs text-white/40">{tracks.length} track{tracks.length !== 1 ? 's' : ''} · {album.artist}</div>
          </div>
        </div>

        {step === 'loading' && <div className="flex justify-center py-6"><Loader2 size={20} className="text-teal-400 animate-spin"/></div>}

        {step === 'connect' && (
          <div className="space-y-3">
            <div className="p-3 bg-teal-500/5 border border-teal-500/15 rounded-xl text-xs text-white/50">
              {useToken
                ? 'On your pod, open Settings → Applications, create an app with read and write access, and paste its access token here.'
                : 'Enter your pod. A tab opens where you approve Plajah; then paste the code it shows. Plajah never sees your Funkwhale password.'}
            </div>
            <input className={field} placeholder="Pod, e.g. music.example.org" value={instance} onChange={e => setInstance(e.target.value)} autoComplete="url"/>
            {useToken && <input className={field} placeholder="Access token" type="password" value={appToken} onChange={e => setAppToken(e.target.value)} autoComplete="off"/>}
            {error && <div className="flex items-center gap-2 text-red-400 text-xs"><AlertCircle size={12}/> {error}</div>}
            <button onClick={startConnect} disabled={busy || !instance || (useToken && !appToken)}
              className="w-full py-3 bg-teal-500 text-white font-bold rounded-xl hover:bg-teal-400 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
              {busy ? <Loader2 size={15} className="animate-spin"/> : useToken ? <KeyRound size={15}/> : <LogIn size={15}/>} {useToken ? 'Connect with token' : 'Approve on my pod'}
            </button>
            <button onClick={() => { setUseToken(t => !t); setError(''); }} className="w-full text-xs text-white/30 hover:text-white underline">
              {useToken ? 'Approve on my pod instead' : 'Use an access token instead'}
            </button>
            {accounts.length > 0 && <button onClick={() => setStep('ready')} className="w-full text-xs text-white/30 hover:text-white underline">Back</button>}
          </div>
        )}

        {step === 'code' && (
          <div className="space-y-3">
            <div className="p-3 bg-teal-500/5 border border-teal-500/15 rounded-xl text-xs text-white/50">
              Approve Plajah in the tab that opened on {host(instance)}, then paste the code here. Codes last five minutes.
            </div>
            <input className={field} placeholder="Code from your pod" value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code"/>
            {error && <div className="flex items-center gap-2 text-red-400 text-xs"><AlertCircle size={12}/> {error}</div>}
            <button onClick={finishConnect} disabled={busy || !code}
              className="w-full py-3 bg-teal-500 text-white font-bold rounded-xl hover:bg-teal-400 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
              {busy ? <Loader2 size={15} className="animate-spin"/> : <Check size={15}/>} Finish connecting
            </button>
            <button onClick={() => setStep('connect')} className="w-full text-xs text-white/30 hover:text-white underline">Start over</button>
          </div>
        )}

        {step === 'ready' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-teal-400">
              <Check size={12}/>
              {accounts.length > 1 ? (
                <select value={accountId} onChange={e => { setAccountId(e.target.value); void loadTargets(e.target.value); }} className="bg-transparent text-teal-400 text-xs focus:outline-none">
                  {accounts.map(a => <option key={a.id} value={a.id} className="bg-[#141414]">@{a.username} · {host(a.instance)}</option>)}
                </select>
              ) : account && <span>Connected as <strong>@{account.username}</strong> on {host(account.instance)}</span>}
              <button onClick={() => setStep('connect')} className="ml-auto text-white/20 hover:text-white underline">Add</button>
              {account && <button onClick={() => disconnect(account.id)} className="text-white/20 hover:text-white underline">Disconnect</button>}
            </div>

            <label className="block text-xs text-white/40">Send to
              <select className={field + ' mt-1'} value={targetKey} onChange={e => {
                const [type, uuid] = e.target.value.split(':');
                const ch = channels.find(c => c.uuid === uuid);
                setTarget(type === 'channel' ? { type: 'channel', uuid, artistId: ch?.artistId ?? null } : { type: 'library', uuid });
              }}>
                {!libraries.length && !channels.length && <option value="">No libraries or channels yet — make one on your pod</option>}
                {channels.length > 0 && <optgroup label="Channels (public, followable)">{channels.map(c => <option key={c.uuid} value={`channel:${c.uuid}`} className="bg-[#141414]">{c.name}</option>)}</optgroup>}
                {libraries.length > 0 && <optgroup label="Libraries">{libraries.map(l => <option key={l.uuid} value={`library:${l.uuid}`} className="bg-[#141414]">{l.name}{l.privacy ? ` · ${l.privacy}` : ''}</option>)}</optgroup>}
              </select>
            </label>
            {pickedLibrary?.privacy === 'me' && <p className="text-[11px] text-white/30">This library is private on your pod, so only you will hear it there.</p>}

            <div className="max-h-44 overflow-y-auto space-y-1.5 py-1">
              {tracks.map((t, i) => {
                const blk = blockFor(t.id); const done = linkFor(t.id); const can = eligible.includes(t.id) && !done;
                return (
                  <label key={t.id} className={`flex items-center gap-2 text-xs ${can ? 'text-white/60' : 'text-white/25'}`}>
                    <input type="checkbox" disabled={!can} checked={can && picked.has(t.id)}
                      onChange={e => setPicked(p => { const n = new Set(p); e.target.checked ? n.add(t.id) : n.delete(t.id); return n; })}/>
                    <span className="truncate">{i + 1}. {t.title}</span>
                    {done && (done.url
                      ? <a href={done.url} target="_blank" rel="noopener noreferrer" className="ml-auto text-teal-400 hover:underline shrink-0">On Funkwhale ↗</a>
                      : <span className="ml-auto shrink-0">{done.state}</span>)}
                    {done && <button onClick={() => removeCopy(done)} title="Delete the Funkwhale copy" className="text-white/20 hover:text-red-400 shrink-0"><Trash2 size={11}/></button>}
                    {!done && blk && <span className="ml-auto shrink-0 text-amber-400/70" title={blk.message}>{blk.code === 'rights_held' ? 'rights' : blk.code.replace('_', ' ')}</span>}
                  </label>
                );
              })}
            </div>

            {blockers.length > 0 ? (
              <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl text-xs text-red-300 space-y-1">
                {blockers.map(b => <div key={b.code} className="flex gap-2"><AlertCircle size={12} className="shrink-0 mt-0.5"/>{b.message}</div>)}
              </div>
            ) : (
              <div className="p-3 bg-white/[0.03] border border-white/5 rounded-xl text-xs text-white/40 space-y-1">
                <p>Funkwhale pods share music with each other. If you delete a track later, copies other pods already made may stay.</p>
                <p>Paid, exclusive and rights-held songs stay on Chora. Plays and comments there stay on Funkwhale.</p>
              </div>
            )}
            {error && <div className="flex items-center gap-2 text-red-400 text-xs"><AlertCircle size={12}/> {error}</div>}
            <button onClick={publish} disabled={blockers.length > 0 || !target || picked.size === 0}
              className="w-full py-3 bg-teal-500 text-white font-bold rounded-xl hover:bg-teal-400 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
              <Disc3 size={15}/> Publish {picked.size} track{picked.size !== 1 ? 's' : ''} to Funkwhale
            </button>
          </div>
        )}

        {step === 'publishing' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Loader2 size={14} className="animate-spin text-teal-400"/> {job?.progress?.note || 'Working…'}
            </div>
            <div className="w-full bg-white/5 rounded-full h-1.5">
              <div className="bg-teal-500 h-1.5 rounded-full transition-all" style={{ width: `${job?.progress?.pct ?? 0}%` }}/>
            </div>
            {(job?.items || []).map((it, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-white/40">
                {it.state === 'published' ? <Check size={11} className="text-green-400"/> : it.state === 'failed' ? <AlertCircle size={11} className="text-red-400"/> : <Loader2 size={11} className="animate-spin"/>}
                <span className="truncate">{it.title}</span>
                {it.error && <span className="ml-auto text-red-400/70 truncate" title={it.error}>{it.error}</span>}
              </div>
            ))}
            <p className="text-xs text-white/30">You can close this; uploads continue and links appear when the pod finishes importing.</p>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-400 font-bold text-sm"><Check size={16}/> Published to Funkwhale</div>
            <div className="max-h-36 overflow-y-auto space-y-1.5">
              {(job?.items || []).map((it, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-white/50">
                  <span className="truncate">{it.title}</span>
                  {it.url ? <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:underline shrink-0 ml-2 flex items-center gap-1"><ExternalLink size={11}/>Track</a>
                    : <span className="text-red-400/70 shrink-0 ml-2">{it.error || it.state}</span>}
                </div>
              ))}
            </div>
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
