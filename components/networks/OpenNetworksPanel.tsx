// OpenNetworksPanel — connect/disconnect cards for Mobilizon, Lemmy, BookWyrm, Owncast and Matrix, plus a small status
// readout. Talks to /api/open-networks (routes/openNetworks.ts). Passwords go to the server once to mint a token and
// are never stored; BookWyrm is read-only (it has no public write API), so its card just previews a public shelf.

import React, { useCallback, useEffect, useState } from 'react';
import { auth } from '../../services/firebase';

type NetworkId = 'mobilizon' | 'lemmy' | 'bookwyrm' | 'owncast' | 'matrix';
interface Account { id: string; network: NetworkId; server: string; handle: string; displayName?: string; meta?: Record<string, any>; createdAt: number }

const API = '/api/open-networks';

async function call<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await auth.currentUser?.getIdToken().catch(() => undefined);
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
  return j as T;
}

interface Field { key: string; label: string; type?: 'text' | 'password'; placeholder?: string; optional?: boolean }
interface NetSpec { id: NetworkId; name: string; blurb: string; fields: Field[]; note?: string }

const SPECS: NetSpec[] = [
  { id: 'mobilizon', name: 'Mobilizon', blurb: 'Federated events. Share your public events to a Mobilizon instance.',
    fields: [{ key: 'server', label: 'Instance', placeholder: 'mobilizon.example' }, { key: 'email', label: 'Email' }, { key: 'password', label: 'Password', type: 'password' }],
    note: 'Only published, public events go out. Members-only and private org events stay on Plajah.' },
  { id: 'lemmy', name: 'Lemmy', blurb: 'Federated forums. Post to communities and show a community as a board.',
    fields: [{ key: 'server', label: 'Instance', placeholder: 'lemmy.world' }, { key: 'username', label: 'Username or email' }, { key: 'password', label: 'Password', type: 'password' }, { key: 'totp', label: '2FA code', optional: true }] },
  { id: 'owncast', name: 'Owncast', blurb: 'Your self-hosted live server: live status, viewers, chat, and the RTMP settings for Go Live.',
    fields: [{ key: 'server', label: 'Server', placeholder: 'live.example.com' }, { key: 'accessToken', label: 'Integration access token (chat)', type: 'password', optional: true },
      { key: 'streamKey', label: 'Stream key', type: 'password', optional: true }, { key: 'rtmpHost', label: 'RTMP host (if different)', optional: true }, { key: 'rtmpPort', label: 'RTMP port', optional: true, placeholder: '1935' }] },
  { id: 'matrix', name: 'Matrix', blurb: 'Chat bridge. Read and send in your joined rooms.',
    fields: [{ key: 'homeserver', label: 'Homeserver', placeholder: 'matrix.org' }, { key: 'accessToken', label: 'Access token', type: 'password', optional: true },
      { key: 'user', label: 'or user', optional: true, placeholder: '@you:matrix.org' }, { key: 'password', label: 'and password', type: 'password', optional: true }],
    note: 'No end-to-end encryption here: encrypted rooms show placeholders.' },
];

const card = 'rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3';
const input = 'w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30';
const btn = 'rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider disabled:opacity-40';

function ConnectForm({ spec, onDone }: { spec: NetSpec; onDone: () => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      await call(`/${spec.id}/connect`, { method: 'POST', body: JSON.stringify(vals) });
      setVals({}); onDone();
    } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      {spec.fields.map(f => (
        <label key={f.key} className="block">
          <span className="text-[11px] text-white/50">{f.label}{f.optional ? ' (optional)' : ''}</span>
          <input className={input} type={f.type || 'text'} autoComplete={f.type === 'password' ? 'off' : undefined} placeholder={f.placeholder}
            value={vals[f.key] || ''} onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))} />
        </label>
      ))}
      {err && <p className="text-xs text-red-400">{err}</p>}
      <button className={`${btn} bg-white text-black`} disabled={busy}>{busy ? 'Connecting…' : 'Connect'}</button>
    </form>
  );
}

function StatusLine({ acct }: { acct: Account }) {
  const [text, setText] = useState('');
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (acct.network === 'owncast') {
          const s = await call<{ online: boolean; viewerCount: number; streamTitle?: string }>(`/owncast/status?server=${encodeURIComponent(acct.server)}`);
          if (live) setText(s.online ? `LIVE · ${s.viewerCount} watching${s.streamTitle ? ` · ${s.streamTitle}` : ''}` : 'Offline');
        } else if (acct.network === 'matrix') {
          const r = await call<{ rooms: unknown[] }>(`/matrix/rooms?accountId=${encodeURIComponent(acct.id)}`);
          if (live) setText(`${r.rooms.length} joined room${r.rooms.length === 1 ? '' : 's'}`);
        } else if (acct.network === 'mobilizon') {
          const n = Object.keys(acct.meta?.published || {}).length;
          if (live) setText(`${n} event${n === 1 ? '' : 's'} shared`);
        } else if (live) setText('Connected');
      } catch (e: any) { if (live) setText(`Status unavailable: ${e.message}`); }
    })();
    return () => { live = false; };
  }, [acct.id, acct.network, acct.server]);
  return <p className="text-xs text-white/60">{text || '…'}</p>;
}

function BookwyrmCard() {
  const [handle, setHandle] = useState('');
  const [shelf, setShelf] = useState('read');
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState('');
  const load = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setRes(null);
    try { setRes(await call(`/bookwyrm/shelf?handle=${encodeURIComponent(handle)}&shelf=${encodeURIComponent(shelf)}`)); } catch (x: any) { setErr(x.message); }
  };
  return (
    <div className={card}>
      <h3 className="font-bold text-white">BookWyrm</h3>
      <p className="text-xs text-white/50">Federated reading. Show a public shelf on your Lorea/Lectio profile. Read-only: BookWyrm has no public write API, so shelving and reviews happen on BookWyrm.</p>
      <form onSubmit={load} className="flex gap-2">
        <input className={input} placeholder="reader@bookwyrm.social" value={handle} onChange={e => setHandle(e.target.value)} />
        <select className={`${input} w-40`} value={shelf} onChange={e => setShelf(e.target.value)}>
          {['to-read', 'reading', 'read', 'stopped-reading'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className={`${btn} bg-white text-black`}>Preview</button>
      </form>
      {err && <p className="text-xs text-red-400">{err}</p>}
      {res && (
        <div className="space-y-1">
          <p className="text-xs text-white/60">{res.total ?? res.books.length} books on {res.shelf} · <a className="underline" href={res.profileUrl} target="_blank" rel="noopener noreferrer">Open on BookWyrm</a></p>
          <ul className="grid grid-cols-2 gap-2">
            {res.books.slice(0, 8).map((b: any, i: number) => (
              <li key={i} className="flex gap-2 items-start text-xs text-white/80">
                {b.cover && <img src={b.cover} alt="" className="w-8 h-12 object-cover rounded" loading="lazy" referrerPolicy="no-referrer" />}
                <span><b>{b.title}</b>{b.authors?.length ? <><br /><span className="text-white/50">{b.authors.join(', ')}</span></> : null}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function OpenNetworksPanel() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [open, setOpen] = useState<NetworkId | null>(null);
  const [err, setErr] = useState('');
  const refresh = useCallback(async () => {
    try { setAccounts((await call<{ accounts: Account[] }>('/accounts')).accounts); setErr(''); } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const disconnect = async (id: string) => {
    if (!window.confirm('Disconnect this account? Plajah will forget its token.')) return;
    try { await call(`/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' }); refresh(); } catch (e: any) { setErr(e.message); }
  };

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-black text-white">Open networks</h2>
        <p className="text-xs text-white/50">Only public content leaves Plajah. Child accounts can't connect. Churches, schools and nonprofits turn each network on in org settings.</p>
        {err && <p className="text-xs text-red-400 mt-1">{err}</p>}
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {SPECS.map(spec => {
          const mine = accounts.filter(a => a.network === spec.id);
          return (
            <div key={spec.id} className={card}>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white">{spec.name}</h3>
                <button className={`${btn} bg-white/10 text-white`} onClick={() => setOpen(o => (o === spec.id ? null : spec.id))}>{open === spec.id ? 'Cancel' : mine.length ? 'Add another' : 'Connect'}</button>
              </div>
              <p className="text-xs text-white/50">{spec.blurb}</p>
              {mine.map(a => (
                <div key={a.id} className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{a.displayName || a.handle}</p>
                    <p className="text-[11px] text-white/40 truncate">{a.server.replace(/^https:\/\//, '')}</p>
                    <StatusLine acct={a} />
                  </div>
                  <button className={`${btn} text-red-300 hover:bg-red-500/10`} onClick={() => disconnect(a.id)}>Disconnect</button>
                </div>
              ))}
              {open === spec.id && <ConnectForm spec={spec} onDone={() => { setOpen(null); refresh(); }} />}
              {spec.note && <p className="text-[11px] text-white/40">{spec.note}</p>}
            </div>
          );
        })}
        <BookwyrmCard />
      </div>
    </section>
  );
}
