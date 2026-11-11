// NostrPanel — opt-in Nostr for a Plajah account, plus <ZapButton/> for posts and tracks.
//
// • OFF by default; renders nothing for accounts that cannot use Nostr (under-18, managed employee).
// • Connect with the person's OWN signer: a NIP-07 browser extension (Alby, nos2x, Keys.band…) via window.nostr,
//   or paste an npub plus a challenge they signed elsewhere (e.g. `nak event`, Amethyst, a NIP-46 bunker app).
// • Optional, explicit: let Plajah generate + hold an encrypted key (exportable, deletable) for auto-publish.
// • Zaps: the invoice comes from the creator's own Lightning address; the fan's wallet pays the creator directly.

import React, { useCallback, useEffect, useState } from 'react';
import { Zap, Link2, Unlink, Loader2, Copy, KeyRound, CheckCircle2, AlertCircle, Send, Trash2 } from 'lucide-react';
import { auth } from '../../services/firebase';

// ── NIP-07 ────────────────────────────────────────────────────────────────────
interface UnsignedEvent { kind: number; created_at: number; tags: string[][]; content: string; pubkey?: string }
interface SignedEvent extends UnsignedEvent { id: string; pubkey: string; sig: string }
interface Nip07 { getPublicKey(): Promise<string>; signEvent(e: UnsignedEvent): Promise<SignedEvent> }
interface WebLN { enable(): Promise<void>; sendPayment(pr: string): Promise<{ preimage: string }> }
const nip07 = (): Nip07 | null => (typeof window !== 'undefined' && (window as any).nostr) || null;
const webln = (): WebLN | null => (typeof window !== 'undefined' && (window as any).webln) || null;

async function api<T = any>(path: string, init: RequestInit & { authed?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.body ? { 'content-type': 'application/json' } : {}) };
  if (init.authed !== false) {
    const tok = await auth.currentUser?.getIdToken();
    if (tok) headers.authorization = `Bearer ${tok}`;
  }
  const r = await fetch(`/api/nostr${path}`, { ...init, headers: { ...headers, ...(init.headers as any) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `Request failed (${r.status})`);
  return j as T;
}

/** For composers: share a post/track/profile to Nostr with the user's signer (or the server key if they made one). */
export async function publishToNostr(body: { type: 'post'; postId: string } | { type: 'track'; albumId: string; trackId: string } | { type: 'profile' } | { type: 'delete'; refType: 'post' | 'track'; refId: string }) {
  const prep = await api<{ blocked?: string; template?: UnsignedEvent; ticket?: string }>('/prepare', { method: 'POST', body: JSON.stringify(body) });
  if (prep.blocked || !prep.template) return { ok: false, blocked: prep.blocked ?? 'Nothing to share.' };
  const signer = nip07();
  if (!signer) {
    // No extension: try the server-held key path (only works if the user explicitly generated one).
    const path = body.type === 'post' ? '/publish/post' : body.type === 'track' ? '/publish/track' : null;
    if (path) {
      const r = await api(path, { method: 'POST', body: JSON.stringify(body) });
      if (!r.needsSigner) return r;
    }
    return { ok: false, blocked: 'Open your Nostr signer extension to sign this post.' };
  }
  const { pubkey: _drop, ...tpl } = prep.template;
  const event = await signer.signEvent(tpl);
  return api('/publish', { method: 'POST', body: JSON.stringify({ event, ticket: prep.ticket }) });
}

interface Account { pubkey: string; npub: string; method: string; relays: string[]; lud16: string | null; nip05: string | null; autoPublish: boolean; hasServerKey: boolean }
interface Me { eligible: boolean; reason: string | null; account: Account | null; defaultRelays: string[]; nip05Domain: string }

const short = (npub: string) => `${npub.slice(0, 12)}…${npub.slice(-6)}`;
const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-50';
const input = 'w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2 text-sm outline-none focus:border-violet-400';

export default function NostrPanel() {
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [manual, setManual] = useState<{ npub: string; challenge?: { template: UnsignedEvent; ticket: string }; signed: string } | null>(null);
  const [lud16, setLud16] = useState('');
  const [nip05, setNip05] = useState('');
  const [relays, setRelays] = useState('');
  const [confirmKey, setConfirmKey] = useState(false);
  const [nsec, setNsec] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const m = await api<Me>('/me');
      setMe(m);
      setLud16(m.account?.lud16 ?? '');
      setNip05(m.account?.nip05?.split('@')[0] ?? '');
      setRelays((m.account?.relays ?? m.defaultRelays).join('\n'));
    } catch { setMe(null); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (label: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(label); setMsg(null);
    try { await fn(); if (ok) setMsg({ ok: true, text: ok }); await load(); }
    catch (e: any) { setMsg({ ok: false, text: e?.message || 'Something went wrong' }); }
    finally { setBusy(null); }
  };

  if (!me || !me.eligible) return null; // hidden for under-18 / ineligible accounts
  const a = me.account;

  const connectExtension = () => run('ext', async () => {
    const s = nip07();
    if (!s) throw new Error('No Nostr extension found. Install Alby, nos2x or Keys.band, or use “paste npub”.');
    const ch = await api<{ template: UnsignedEvent; ticket: string }>('/link/challenge', { method: 'POST' });
    const event = await s.signEvent(ch.template);
    await api('/link', { method: 'POST', body: JSON.stringify({ event, ticket: ch.ticket, method: 'nip07', nip05Name: nip05 || undefined, lud16: lud16 || undefined }) });
  }, 'Nostr connected.');

  const startManual = () => run('manual', async () => {
    const ch = await api<{ template: UnsignedEvent; ticket: string }>('/link/challenge', { method: 'POST' });
    setManual(m => ({ npub: m?.npub ?? '', signed: '', challenge: ch }));
  });
  const finishManual = () => run('manual', async () => {
    if (!manual?.challenge) throw new Error('Get a challenge first.');
    let event: SignedEvent;
    try { event = JSON.parse(manual.signed); } catch { throw new Error('Paste the signed event JSON.'); }
    await api('/link', { method: 'POST', body: JSON.stringify({ event, ticket: manual.challenge.ticket, method: 'manual', npub: manual.npub, nip05Name: nip05 || undefined, lud16: lud16 || undefined }) });
    setManual(null);
  }, 'Nostr connected.');

  const save = () => run('save', () => api('/settings', { method: 'PUT', body: JSON.stringify({ lud16, nip05Name: nip05, relays: relays.split(/\s+/).filter(Boolean) }) }), 'Saved.');
  const toggleAuto = () => run('auto', () => api('/settings', { method: 'PUT', body: JSON.stringify({ autoPublish: !a?.autoPublish }) }));

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black tracking-wide">Nostr</h3>
          <p className="text-xs opacity-70">Optional. Share public posts and music to Nostr and receive Lightning zaps straight to your own wallet.</p>
        </div>
        {a && <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-400"><CheckCircle2 size={12} /> On</span>}
      </header>

      {!a && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button className={`${btn} bg-violet-600 text-white`} disabled={!!busy} onClick={connectExtension}>
              {busy === 'ext' ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Connect signer extension
            </button>
            <button className={`${btn} bg-white/10`} disabled={!!busy} onClick={startManual}>Paste npub + signed challenge</button>
          </div>
          {manual?.challenge && (
            <div className="space-y-2 rounded-xl bg-black/20 p-3">
              <input className={input} placeholder="npub1…" value={manual.npub} onChange={e => setManual({ ...manual, npub: e.target.value })} />
              <p className="text-xs opacity-70">Sign this event with your Nostr app or bunker, then paste the signed JSON below:</p>
              <pre className="text-[10px] whitespace-pre-wrap break-all bg-black/30 rounded p-2">{JSON.stringify(manual.challenge.template)}</pre>
              <textarea className={input} rows={4} placeholder='{"id":"…","sig":"…"}' value={manual.signed} onChange={e => setManual({ ...manual, signed: e.target.value })} />
              <button className={`${btn} bg-violet-600 text-white`} disabled={!!busy} onClick={finishManual}>Verify & link</button>
            </div>
          )}
          <details className="text-xs">
            <summary className="cursor-pointer opacity-80">No Nostr key yet?</summary>
            <div className="mt-2 space-y-2">
              <p className="opacity-70">Best: create one in a signer app you control. Or let Plajah generate one and keep it encrypted for you — you can export it or delete it any time.</p>
              <label className="flex items-center gap-2"><input type="checkbox" checked={confirmKey} onChange={e => setConfirmKey(e.target.checked)} /> I want Plajah to hold an encrypted Nostr key for me.</label>
              <button className={`${btn} bg-white/10`} disabled={!confirmKey || !!busy} onClick={() => run('gen', () => api('/key/generate', { method: 'POST', body: JSON.stringify({ confirm: true }) }), 'Key created.')}>
                <KeyRound size={14} /> Generate key
              </button>
            </div>
          </details>
        </div>
      )}

      {a && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <code className="bg-black/30 rounded px-2 py-1">{short(a.npub)}</code>
            <button className="opacity-70 hover:opacity-100" title="Copy npub" onClick={() => navigator.clipboard?.writeText(a.npub)}><Copy size={12} /></button>
            <span className="opacity-60">{a.method === 'server' ? 'key held by Plajah (encrypted)' : 'your own signer'}</span>
          </div>
          <label className="block text-xs space-y-1"><span className="opacity-70">Lightning address (zaps go straight here)</span>
            <input className={input} placeholder="you@getalby.com" value={lud16} onChange={e => setLud16(e.target.value)} /></label>
          <label className="block text-xs space-y-1"><span className="opacity-70">NIP-05 name</span>
            <div className="flex items-center gap-1"><input className={input} placeholder="name" value={nip05} onChange={e => setNip05(e.target.value)} /><span className="opacity-60">@{me.nip05Domain}</span></div></label>
          <label className="block text-xs space-y-1"><span className="opacity-70">Relays (one per line, wss://)</span>
            <textarea className={input} rows={4} value={relays} onChange={e => setRelays(e.target.value)} /></label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={a.autoPublish} disabled={!!busy} onChange={toggleAuto} />
            Auto-publish my public posts {a.hasServerKey ? '' : '(your extension will ask to sign each one)'}
          </label>
          <div className="flex flex-wrap gap-2">
            <button className={`${btn} bg-violet-600 text-white`} disabled={!!busy} onClick={save}>{busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : null} Save</button>
            <button className={`${btn} bg-white/10`} disabled={!!busy} onClick={() => run('prof', async () => {
              const r: any = await publishToNostr({ type: 'profile' });
              if (!r?.ok) throw new Error(r?.blocked || 'No relay accepted the profile.');
            }, 'Profile published.')}><Send size={14} /> Publish profile</button>
            {a.hasServerKey && <button className={`${btn} bg-white/10`} disabled={!!busy} onClick={() => run('exp', async () => {
              if (!window.confirm('Anyone with this key can post as you. Show it?')) return;
              const r = await api<{ nsec: string }>('/key/export', { method: 'POST', body: JSON.stringify({ confirm: true }) });
              setNsec(r.nsec);
            })}><KeyRound size={14} /> Export key</button>}
            {a.hasServerKey && <button className={`${btn} bg-white/10`} disabled={!!busy} onClick={() => run('delk', async () => {
              if (window.confirm('Delete the key Plajah holds? Export it first if you want to keep this Nostr identity.')) await api('/key', { method: 'DELETE' });
            })}><Trash2 size={14} /> Delete key</button>}
            <button className={`${btn} bg-white/10 text-red-300`} disabled={!!busy} onClick={() => run('unlink', async () => {
              if (window.confirm('Turn off Nostr? Notes already on relays stay there.')) await api('/unlink', { method: 'POST' });
            })}><Unlink size={14} /> Turn off</button>
          </div>
          {nsec && <div className="text-xs space-y-1"><p className="text-amber-300">Store this somewhere safe. It will not be shown again unless you export again.</p><code className="block break-all bg-black/30 rounded p-2">{nsec}</code></div>}
        </div>
      )}

      {msg && <p className={`text-xs flex items-center gap-1 ${msg.ok ? 'text-emerald-400' : 'text-red-300'}`}>{msg.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}{msg.text}</p>}
    </section>
  );
}

// ── ZapButton ─────────────────────────────────────────────────────────────────
export interface ZapButtonProps {
  recipientUid: string;
  postId?: string;
  /** Nostr event id when known (otherwise looked up from postId). */
  eventId?: string;
  amounts?: number[];
  className?: string;
}

export function ZapButton({ recipientUid, postId, eventId, amounts = [21, 100, 500, 1000], className }: ZapButtonProps) {
  const [can, setCan] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sats, setSats] = useState(amounts[0]);
  const [comment, setComment] = useState('');
  const [invoice, setInvoice] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api<{ canZap?: boolean }>(`/public/user/${encodeURIComponent(recipientUid)}`, { authed: false })
      .then(r => { if (live) setCan(!!r.canZap); }).catch(() => {});
    return () => { live = false; };
  }, [recipientUid]);
  if (!can) return null;

  const zap = async () => {
    setBusy(true); setStatus(null); setInvoice(null);
    try {
      const prep = await api<{ zapRequest: UnsignedEvent | null; lud16: string; minSats: number; maxSats: number }>('/zap/prepare', {
        method: 'POST', authed: false, body: JSON.stringify({ recipientUid, amountSats: sats, postId, eventId, comment: comment || undefined }),
      });
      let zapRequest: SignedEvent | undefined;
      const s = nip07();
      if (prep.zapRequest && s) { try { zapRequest = await s.signEvent(prep.zapRequest); } catch { /* declined: plain Lightning tip */ } }
      const inv = await api<{ pr: string }>('/zap/invoice', {
        method: 'POST', authed: false, body: JSON.stringify({ recipientUid, amountSats: sats, zapRequest, comment: comment || undefined }),
      });
      const w = webln();
      if (w) {
        try { await w.enable(); await w.sendPayment(inv.pr); setStatus(`Zapped ${sats} sats ⚡`); setOpen(false); return; }
        catch { /* fall back to showing the invoice */ }
      }
      setInvoice(inv.pr);
      setStatus(`Pay with any Lightning wallet. It goes directly to ${prep.lud16}.`);
    } catch (e: any) { setStatus(e?.message || 'Could not create the invoice.'); }
    finally { setBusy(false); }
  };

  return (
    <span className={`relative inline-flex ${className ?? ''}`}>
      <button className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 hover:text-amber-300" onClick={() => setOpen(o => !o)} title="Zap (Lightning tip, paid directly to the creator)">
        <Zap size={14} /> Zap
      </button>
      {open && (
        <div className="absolute z-50 bottom-full mb-2 left-0 w-64 rounded-xl border border-white/10 bg-neutral-900 p-3 space-y-2 shadow-xl">
          <div className="flex flex-wrap gap-1">
            {amounts.map(n => (
              <button key={n} className={`px-2 py-1 rounded-md text-xs ${n === sats ? 'bg-amber-500 text-black' : 'bg-white/10'}`} onClick={() => setSats(n)}>{n}</button>
            ))}
            <input type="number" min={1} className="w-20 rounded-md bg-black/30 px-2 py-1 text-xs" value={sats} onChange={e => setSats(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
          </div>
          <input className="w-full rounded-md bg-black/30 px-2 py-1 text-xs" maxLength={140} placeholder="Say something (optional)" value={comment} onChange={e => setComment(e.target.value)} />
          <button className="w-full inline-flex justify-center items-center gap-1 rounded-md bg-amber-500 text-black text-xs font-bold py-1.5 disabled:opacity-50" disabled={busy} onClick={zap}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />} Zap {sats} sats
          </button>
          {invoice && (
            <div className="space-y-1">
              <a className="block text-center text-xs underline" href={`lightning:${invoice}`}>Open wallet</a>
              <button className="w-full inline-flex justify-center items-center gap-1 text-[10px] opacity-80" onClick={() => navigator.clipboard?.writeText(invoice)}><Copy size={10} /> Copy invoice</button>
            </div>
          )}
          {status && <p className="text-[11px] opacity-80">{status}</p>}
          <p className="text-[10px] opacity-50">Plajah never holds your sats. The invoice is from the creator's own wallet.</p>
        </div>
      )}
    </span>
  );
}
