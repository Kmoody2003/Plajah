// FindYourPeople — "move your conversation here": match the people you follow on Bluesky / Mastodon to Plajah
// users who linked the same account, follow them in one tap (or all at once), and invite everyone else.
// Server: POST /api/social/find-people + /api/social/follow-batch (services/socialMigrationServer.ts).
// Follows go through the same semantics as followUser(): private accounts get a follow REQUEST.
// Mounted in FediverseHub (connected accounts) and the onboarding follow step.
import React, { useState } from 'react';
import { Users, Check, Send, Share2, Loader2, AtSign } from 'lucide-react';
import { auth, followUser } from '../../services/backendService';
import { getMyInvite, shareMyInvite } from '../../services/inviteService';

interface Match {
  uid: string; displayName: string; username: string; photoURL: string; isPrivate: boolean;
  network: 'bluesky' | 'mastodon'; externalHandle: string; state: 'following' | 'requested' | 'none';
}
interface Unmatched { network: 'bluesky' | 'mastodon'; handle: string; displayName: string; avatarUrl: string; profileUrl: string }
interface FindResult {
  accounts: Array<{ network: string; handle: string }>;
  matches: Match[]; unmatched: Unmatched[]; totals: { follows: number; matched: number }; errors: string[];
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in first');
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await u.getIdToken()}` }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as any)?.error || `Request failed (${r.status})`);
  return j as T;
}

const NET: Record<string, { label: string; color: string }> = {
  bluesky: { label: 'Bluesky', color: '#0085ff' },
  mastodon: { label: 'Mastodon', color: '#8c8dff' },
};

export interface FindYourPeopleProps {
  /** Shown when the user has no Bluesky/Mastodon account linked (e.g. open the connect settings). */
  onConnect?: () => void;
  compact?: boolean;
  className?: string;
}

const FindYourPeople: React.FC<FindYourPeopleProps> = ({ onConnect, compact = false, className = '' }) => {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const [res, setRes] = useState<FindResult | null>(null);
  const [rowState, setRowState] = useState<Record<string, Match['state'] | 'busy'>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [inviteNote, setInviteNote] = useState('');

  const search = async () => {
    setState('loading'); setError('');
    try {
      const r = await post<FindResult>('/api/social/find-people', {});
      setRes(r);
      setRowState(Object.fromEntries(r.matches.map(m => [m.uid, m.state])));
      setState('done');
    } catch (e: any) { setError(e?.message || 'Could not search right now'); setState('error'); }
  };

  const followOne = async (m: Match) => {
    setRowState(s => ({ ...s, [m.uid]: 'busy' }));
    const r = await followUser(m.uid);
    setRowState(s => ({ ...s, [m.uid]: r === 'followed' || r === 'already' ? 'following' : r === 'requested' ? 'requested' : 'none' }));
  };

  const followAll = async () => {
    if (!res) return;
    const todo = res.matches.filter(m => (rowState[m.uid] ?? m.state) === 'none').map(m => m.uid);
    if (!todo.length) return;
    setBulkBusy(true);
    try {
      const r = await post<{ followed: string[]; requested: string[]; already: string[] }>('/api/social/follow-batch', { uids: todo });
      setRowState(s => {
        const n = { ...s };
        [...r.followed, ...r.already].forEach(u => { n[u] = 'following'; });
        r.requested.forEach(u => { n[u] = 'requested'; });
        return n;
      });
    } catch (e: any) { setError(e?.message || 'Follow failed'); }
    finally { setBulkBusy(false); }
  };

  // "Invite the rest": a ready-to-post note on each network with the personal invite link.
  const inviteOn = async (network: 'bluesky' | 'mastodon') => {
    const inv = await getMyInvite();
    if (!inv) { setInviteNote('Could not create your invite link'); return; }
    const text = `I'm on Plajah now — music, film, books and live shows from the people who make them. Come find me (we'll follow each other automatically): ${inv.url}`;
    const acct = res?.accounts.find(a => a.network === network);
    const host = network === 'mastodon' ? (acct?.handle.split('@').filter(Boolean)[1] || 'mastodon.social') : '';
    const url = network === 'bluesky'
      ? `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`
      : `https://${host}/share?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  const shareInvite = async () => {
    const r = await shareMyInvite();
    setInviteNote(r === 'copied' ? 'Invite link copied' : r === 'shared' ? 'Shared' : '');
  };

  const pending = res ? res.matches.filter(m => (rowState[m.uid] ?? m.state) === 'none').length : 0;
  const networks = res ? [...new Set(res.accounts.map(a => a.network))] as Array<'bluesky' | 'mastodon'> : [];

  return (
    <section className={`rounded-2xl border border-white/10 bg-white/[0.03] ${compact ? 'p-3' : 'p-4'} ${className}`} aria-label="Find your people from Bluesky and Mastodon">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#0085ff]/15 text-[#5aa9ff] flex items-center justify-center shrink-0"><Users size={17} /></div>
        <div className="min-w-0 mr-auto">
          <p className="text-[12px] font-black uppercase tracking-widest text-white">Find your people</p>
          <p className="text-[11px] text-white/50">People you follow on Bluesky or Mastodon who are already here.</p>
        </div>
        {state !== 'done' && (
          <button onClick={search} disabled={state === 'loading'}
            className="shrink-0 rounded-full bg-white text-black px-4 py-2 text-[10px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center gap-1.5">
            {state === 'loading' ? <><Loader2 size={12} className="animate-spin" /> Searching</> : 'Search'}
          </button>
        )}
      </div>

      {state === 'error' && <p className="text-[11px] text-red-300 mt-3" role="alert">{error}</p>}

      {state === 'done' && res && res.accounts.length === 0 && (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-white/55">
          <AtSign size={13} className="shrink-0" />
          <span className="mr-auto">Link your Bluesky or Mastodon account first — we only match people who linked theirs too.</span>
          {onConnect && <button onClick={onConnect} className="shrink-0 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white" style={{ background: '#0085ff' }}>Connect</button>}
        </div>
      )}

      {state === 'done' && res && res.accounts.length > 0 && (
        <div className="mt-3 space-y-3">
          <p className="text-[11px] text-white/55">
            {res.totals.matched > 0
              ? `${res.totals.matched} of the ${res.totals.follows.toLocaleString()} people you follow ${res.totals.matched === 1 ? 'is' : 'are'} on Plajah.`
              : `None of the ${res.totals.follows.toLocaleString()} people you follow have linked their account yet — invite them below.`}
          </p>
          {res.errors.length > 0 && <p className="text-[10px] text-amber-300/80">{res.errors.join(' · ')}</p>}

          {res.matches.length > 0 && (
            <>
              <ul className="flex flex-col gap-1.5 max-h-[360px] overflow-y-auto pr-1">
                {res.matches.map(m => {
                  const st = rowState[m.uid] ?? m.state;
                  return (
                    <li key={m.uid} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-2">
                      {m.photoURL
                        ? <img src={m.photoURL} alt="" referrerPolicy="no-referrer" className="w-9 h-9 rounded-full object-cover shrink-0" />
                        : <span className="w-9 h-9 rounded-full bg-white/10 shrink-0" />}
                      <span className="min-w-0 mr-auto">
                        <span className="block text-[13px] font-black text-white truncate">{m.displayName}</span>
                        <span className="block text-[11px] truncate" style={{ color: NET[m.network]?.color }}>{m.externalHandle} · {NET[m.network]?.label}</span>
                      </span>
                      <button onClick={() => followOne(m)} disabled={st !== 'none'}
                        className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-widest flex items-center gap-1 ${st === 'none' ? 'bg-white text-black' : 'bg-white/10 text-white/60'}`}>
                        {st === 'busy' ? <Loader2 size={11} className="animate-spin" /> : st === 'following' ? <><Check size={11} /> Following</> : st === 'requested' ? 'Requested' : (m.isPrivate ? 'Request' : 'Follow')}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {pending > 1 && (
                <button onClick={followAll} disabled={bulkBusy}
                  className="w-full rounded-full bg-gradient-to-r from-[#D40055] to-[#FF8C00] text-white py-2.5 text-[10px] font-black uppercase tracking-widest disabled:opacity-50">
                  {bulkBusy ? 'Following…' : `Follow all ${pending}`}
                </button>
              )}
            </>
          )}

          {res.unmatched.length > 0 && (
            <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex -space-x-2">
                  {res.unmatched.filter(u => u.avatarUrl).slice(0, 6).map(u => (
                    <img key={u.handle} src={u.avatarUrl} alt="" referrerPolicy="no-referrer" className="w-6 h-6 rounded-full object-cover border border-black" />
                  ))}
                </div>
                <p className="text-[11px] text-white/60 mr-auto">Invite the rest — {res.unmatched.length.toLocaleString()}{res.unmatched.length >= 300 ? '+' : ''} people aren't here yet.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {networks.map(n => (
                  <button key={n} onClick={() => inviteOn(n)}
                    className="rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white flex items-center gap-1.5" style={{ background: NET[n]?.color }}>
                    <Send size={11} /> Post invite on {NET[n]?.label}
                  </button>
                ))}
                <button onClick={shareInvite} className="rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white bg-white/10 hover:bg-white/15 flex items-center gap-1.5">
                  <Share2 size={11} /> Share my invite link
                </button>
              </div>
              {inviteNote && <p className="text-[10px] text-white/50 mt-2" aria-live="polite">{inviteNote}</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default FindYourPeople;
export { FindYourPeople };
