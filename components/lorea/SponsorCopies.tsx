// Sponsored + gift copies UI (server: routes/sponsorCopies.ts, rules: services/sponsorCopies/model.ts).
//   SponsorCopiesHost — mounted once in App. Opens the right screen from events and deep links:
//     ?claim=<CODE> / ?gift=<poolId>   → claim screen
//     ?copies_purchased=<poolId>      → "your gift is live" (the sponsor's codes/links)
//     OPEN_SPONSOR_COPIES {book}      → sponsor dialog
//     OPEN_COPY_CLAIM {code|poolId}   → claim screen
//     OPEN_MY_GIFTS                   → gifts I sponsored
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { BookOpen, Building2, Check, Copy, Download, Gift, Heart, Loader2, Mail, Plus, Search, Ticket, Users, X } from 'lucide-react';
import { auth, loginWithGoogle, fetchProjectFromCloud } from '../../services/backendService';
import { MAX_COPIES, MAX_DIRECT, normalizeCode, type PoolMode, type PoolRecipient } from '../../services/sponsorCopies/model';
import {
  cancelPool, claimCopy, fetchMyPools, fetchPool, previewCode, sponsorCopies,
  OPEN_CLAIM_EVENT, OPEN_MY_GIFTS_EVENT, OPEN_SPONSOR_EVENT, type PublicPool,
} from '../../services/sponsorCopies/client';

type SponsorBook = { id: string; title: string; price?: number; ownerId?: string; coverImage?: string; artist?: string };

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const input = 'w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30';
const primary = 'h-11 px-5 rounded-full bg-small-orange hover:bg-orange-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest inline-flex items-center justify-center gap-2 transition-colors';
const ghost = 'h-11 px-5 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest inline-flex items-center justify-center gap-2 transition-colors';

const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, wide }) => createPortal(
  <div className="fixed inset-0 z-[9400] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4" onClick={onClose}>
    <div role="dialog" aria-label={title} onClick={e => e.stopPropagation()}
      className={`w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#0e0b14] border border-white/10 shadow-2xl p-5 sm:p-7 text-white`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <h2 className="text-lg font-black leading-tight">{title}</h2>
        <button type="button" onClick={onClose} className="p-2 -m-2 rounded-full hover:bg-white/10" aria-label="Close"><X size={18} /></button>
      </div>
      {children}
    </div>
  </div>, document.body);

const useUid = () => {
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  useEffect(() => onAuthStateChanged(auth, u => setUid(u?.uid ?? null)), []);
  return uid;
};

// ── Sponsor dialog ───────────────────────────────────────────────────────────

const MODES: Array<{ id: PoolMode; icon: React.ReactNode; title: string; hint: string }> = [
  { id: 'OPEN', icon: <Heart size={16} />, title: 'For fans', hint: 'Anyone can claim one from a link (and the book’s page) until they run out.' },
  { id: 'DIRECT', icon: <Users size={16} />, title: 'For people I choose', hint: 'Pick Plajah users or type email addresses. Each gets their own copy.' },
  { id: 'CODES', icon: <Ticket size={16} />, title: 'Claim codes', hint: 'A one-use code per copy to hand out: classes, staff, events, giveaways.' },
];

const SponsorDialog: React.FC<{ book: SponsorBook; onClose: () => void }> = ({ book, onClose }) => {
  const uid = useUid();
  const isAuthor = !!uid && uid === book.ownerId;
  const [mode, setMode] = useState<PoolMode>('OPEN');
  const [qty, setQty] = useState(10);
  const [recipients, setRecipients] = useState<Array<PoolRecipient & { label: string }>>([]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Array<{ uid: string; name: string; photo?: string }>>([]);
  const [message, setMessage] = useState('');
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
  const [asOrg, setAsOrg] = useState('');
  const [listed, setListed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    import('../../services/organizationService').then(m => m.fetchUserOrganizations(uid)).then(list => setOrgs(list.map(o => ({ id: o.id, name: o.name })))).catch(() => {});
  }, [uid]);

  // People search (block/mute aware). An "@"-containing entry is treated as an email address.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || q.includes('@')) { setHits([]); return; }
    let alive = true;
    const t = setTimeout(() => {
      import('../../services/searchUsersSafe').then(m => m.searchUserProfilesSafe(q, 6)).then(users => {
        if (alive) setHits(users.map((u: any) => ({ uid: u.uid || u.id, name: u.displayName || u.name || 'Plajah user', photo: u.photoURL || u.avatar })).filter(u => u.uid && u.uid !== uid));
      }).catch(() => {});
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [query, uid]);

  const addEmail = () => {
    const parts = query.split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s));
    if (!parts.length) return;
    setRecipients(rs => [...rs, ...parts.filter(e => !rs.some(r => r.email === e)).map(e => ({ email: e, label: e }))].slice(0, MAX_DIRECT));
    setQuery('');
  };
  const addUser = (h: { uid: string; name: string }) => {
    setRecipients(rs => rs.some(r => r.uid === h.uid) ? rs : [...rs, { uid: h.uid, name: h.name, label: h.name }].slice(0, MAX_DIRECT));
    setQuery(''); setHits([]);
  };

  const count = mode === 'DIRECT' ? recipients.length : qty;
  const unit = isAuthor ? 0 : Math.round((book.price || 0) * 100);
  const total = unit * count;

  const submit = async () => {
    if (!uid) { loginWithGoogle(); return; }
    setBusy(true); setErr('');
    try {
      const r = await sponsorCopies({
        bookId: book.id, mode, quantity: count, message: message.trim() || undefined,
        recipients: mode === 'DIRECT' ? recipients.map(({ label: _l, ...r }) => r) : undefined,
        as: asOrg ? { kind: 'org', id: asOrg } : { kind: 'self' }, showOnBookPage: mode === 'OPEN' ? listed : undefined,
      });
      if (r.activated) setDone(r.poolId);   // the author's own giveaway: live now, no checkout
    } catch (e: any) {
      setErr(e?.message || 'Could not start the gift'); setBusy(false);
    }
  };

  if (done) return <PoolDetail poolId={done} onClose={onClose} justCreated />;

  return (
    <Sheet title={isAuthor ? `Give away copies of “${book.title}”` : `Gift “${book.title}”`} onClose={onClose}>
      <div className="grid gap-2 mb-4">
        {MODES.map(m => (
          <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}
            className={`text-left rounded-2xl border p-3 flex gap-3 ${mode === m.id ? 'border-small-orange bg-small-orange/10' : 'border-white/10 hover:border-white/25'}`}>
            <span className="mt-0.5 text-small-orange">{m.icon}</span>
            <span><span className="block text-sm font-bold">{m.title}</span><span className="block text-[11px] text-white/55 leading-snug">{m.hint}</span></span>
          </button>
        ))}
      </div>

      {mode === 'DIRECT' ? (
        <div className="mb-4">
          <label className="text-[11px] font-bold text-white/60" htmlFor="gift-to">Send to</label>
          <div className="relative mt-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input id="gift-to" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
              className={`${input} pl-9`} placeholder="Search Plajah people, or type emails" />
          </div>
          {query.includes('@') && <button type="button" onClick={addEmail} className="mt-2 text-xs font-bold text-small-orange inline-flex items-center gap-1"><Mail size={12} /> Add {query.trim()}</button>}
          {hits.length > 0 && (
            <ul className="mt-2 rounded-xl border border-white/10 divide-y divide-white/5">
              {hits.map(h => (
                <li key={h.uid}><button type="button" onClick={() => addUser(h)} className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 flex items-center gap-2">
                  {h.photo ? <img src={h.photo} alt="" className="w-6 h-6 rounded-full object-cover" /> : <span className="w-6 h-6 rounded-full bg-white/10" />}{h.name}<Plus size={14} className="ml-auto text-white/40" />
                </button></li>
              ))}
            </ul>
          )}
          {recipients.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {recipients.map(r => (
                <span key={r.uid || r.email} className="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full bg-white/10 text-xs">
                  {r.email ? <Mail size={11} className="text-white/50" /> : null}{r.label}
                  <button type="button" onClick={() => setRecipients(rs => rs.filter(x => x !== r))} className="p-1 rounded-full hover:bg-white/10" aria-label={`Remove ${r.label}`}><X size={11} /></button>
                </span>
              ))}
            </div>
          )}
          <p className="mt-2 text-[11px] text-white/40">Plajah users get a notification. Email addresses get a link{isAuthor ? '' : ' once payment goes through'}.</p>
        </div>
      ) : (
        <div className="mb-4">
          <label className="text-[11px] font-bold text-white/60" htmlFor="gift-qty">How many copies</label>
          <div className="mt-1 flex items-center gap-2">
            {[5, 10, 25, 100].map(n => (
              <button key={n} type="button" onClick={() => setQty(n)} className={`h-9 px-3 rounded-full text-xs font-bold border ${qty === n ? 'border-small-orange text-white' : 'border-white/10 text-white/60'}`}>{n}</button>
            ))}
            <input id="gift-qty" type="number" min={1} max={MAX_COPIES} value={qty} onChange={e => setQty(Math.max(1, Math.min(MAX_COPIES, parseInt(e.target.value) || 1)))} className={`${input} !w-24`} />
          </div>
          {mode === 'OPEN' && (
            <label className="mt-3 flex items-center gap-2 text-xs text-white/70">
              <input type="checkbox" checked={listed} onChange={e => setListed(e.target.checked)} /> Show this giveaway on the book’s page
            </label>
          )}
        </div>
      )}

      <label className="block mb-4">
        <span className="text-[11px] font-bold text-white/60">A note with the gift (optional)</span>
        <textarea rows={2} maxLength={500} value={message} onChange={e => setMessage(e.target.value)} className={`${input} mt-1`} placeholder="Enjoy this one — it changed how I think about…" />
      </label>

      {orgs.length > 0 && (
        <label className="block mb-4">
          <span className="text-[11px] font-bold text-white/60 inline-flex items-center gap-1"><Building2 size={12} /> From</span>
          <select value={asOrg} onChange={e => setAsOrg(e.target.value)} className={`${input} mt-1`}>
            <option value="">Me</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      )}

      <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-4 py-3 mb-4">
        <span className="text-sm text-white/70">{count} {count === 1 ? 'copy' : 'copies'}{unit ? ` × ${money(unit)}` : ''}</span>
        <span className="text-base font-black">{isAuthor ? 'Free — it’s your book' : money(total)}</span>
      </div>
      {!isAuthor && <p className="text-[11px] text-white/40 mb-4">The author is paid for every copy. Copies nobody claims can be cancelled for a refund at any time.</p>}
      {err && <p role="alert" className="text-sm text-red-300 mb-3">{err}</p>}
      <button type="button" className={`${primary} w-full`} disabled={busy || count < 1} onClick={submit}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Gift size={14} />}
        {!uid ? 'Sign in to gift' : isAuthor ? 'Create giveaway' : `Pay ${money(total)}`}
      </button>
    </Sheet>
  );
};

// ── Pool detail (sponsor view) ───────────────────────────────────────────────

const copyText = async (t: string) => { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } };

function downloadCsv(pool: PublicPool) {
  const rows = [['code', 'link', 'recipient', 'claimed'], ...(pool.sponsor?.codes || []).map(c => [c.code, c.link, c.recipient?.name || c.recipient?.email || '', c.claimed ? 'yes' : 'no'])];
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `${pool.title.replace(/[^\w-]+/g, '_').slice(0, 40)}-codes.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const PoolDetail: React.FC<{ poolId: string; onClose: () => void; justCreated?: boolean }> = ({ poolId, onClose, justCreated }) => {
  const [pool, setPool] = useState<PublicPool | null>(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState(false);
  const uid = useUid();
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    // Right after Stripe the webhook may still be activating the pool: poll briefly.
    (async () => {
      for (let i = 0; i < 12 && alive; i++) {
        try {
          const p = await fetchPool(poolId);
          if (!alive) return;
          setPool(p);
          if (p.status !== 'PENDING_PAYMENT') return;
        } catch (e: any) { if (alive) setErr(e?.message || 'Could not load this gift'); return; }
        await new Promise(r => setTimeout(r, 1500));
      }
    })();
    return () => { alive = false; };
  }, [poolId, uid]);

  const flash = async (key: string, text: string) => { if (await copyText(text)) { setCopied(key); setTimeout(() => setCopied(''), 1500); } };
  const cancel = async () => {
    if (!pool || !confirm(`Stop this gift? ${pool.left} unclaimed ${pool.left === 1 ? 'copy' : 'copies'} will be cancelled${pool.sponsor?.refundableCents ? ` and ${money(pool.sponsor.refundableCents)} refunded to your card` : ''}. Copies already claimed stay with their readers.`)) return;
    setBusy(true);
    try { await cancelPool(pool.poolId); setPool(await fetchPool(pool.poolId)); }
    catch (e: any) { setErr(e?.message || 'Could not cancel'); }
    finally { setBusy(false); }
  };

  return (
    <Sheet title={justCreated ? 'Your gift is live' : pool?.title || 'Gift'} onClose={onClose} wide>
      {!pool ? (err ? <p className="text-sm text-red-300">{err}</p> : <div className="py-10 grid place-items-center"><Loader2 className="animate-spin text-white/50" /></div>) : pool.status === 'PENDING_PAYMENT' ? (
        <p className="text-sm text-white/70">Payment received — setting up your copies. This takes a few seconds; you can close this and find it later under My gifts.</p>
      ) : (
        <>
          <div className="flex gap-4 mb-5">
            {pool.cover && <img src={pool.cover} alt="" className="w-16 h-24 rounded-xl object-cover" />}
            <div className="min-w-0">
              <p className="font-black leading-tight">{pool.title}</p>
              <p className="text-xs text-white/50">{pool.mode === 'OPEN' ? 'For fans' : pool.mode === 'DIRECT' ? 'Sent to people you chose' : 'Claim codes'} · from {pool.sponsorName}</p>
              <p className="mt-2 text-sm"><b>{pool.claimed}</b> of {pool.quantity} claimed{pool.status === 'CLOSED' ? ' · gift ended' : pool.left === 0 ? ' · all claimed' : ''}</p>
              <div className="mt-1 h-1.5 w-48 max-w-full rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-small-orange" style={{ width: `${(pool.claimed / pool.quantity) * 100}%` }} /></div>
            </div>
          </div>

          {pool.mode === 'OPEN' && pool.sponsor && (
            <div className="mb-5">
              <p className="text-[11px] font-bold text-white/60 mb-1">Share this link with fans</p>
              <div className="flex gap-2"><input readOnly value={pool.sponsor.shareLink} className={input} onFocus={e => e.currentTarget.select()} />
                <button type="button" className={ghost} onClick={() => flash('share', pool.sponsor!.shareLink)}>{copied === 'share' ? <Check size={14} /> : <Copy size={14} />}</button></div>
            </div>
          )}

          {!!pool.sponsor?.codes.length && (
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-bold text-white/60">{pool.mode === 'DIRECT' ? 'Who has claimed' : 'Codes'} — each works once</p>
                <div className="flex gap-2">
                  <button type="button" className="text-xs font-bold text-small-orange inline-flex items-center gap-1" onClick={() => flash('all', pool.sponsor!.codes.filter(c => !c.claimed).map(c => `${c.code}  ${c.link}`).join('\n'))}>{copied === 'all' ? <Check size={12} /> : <Copy size={12} />} Copy unused</button>
                  <button type="button" className="text-xs font-bold text-small-orange inline-flex items-center gap-1" onClick={() => downloadCsv(pool)}><Download size={12} /> CSV</button>
                </div>
              </div>
              <ul className="max-h-72 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5">
                {pool.sponsor.codes.map(c => (
                  <li key={c.code} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="font-mono tracking-wider">{c.code}</span>
                    {c.recipient && <span className="truncate text-white/60 text-xs">{c.recipient.name || c.recipient.email}</span>}
                    <span className={`ml-auto text-[11px] font-bold ${c.claimed ? 'text-emerald-300' : 'text-white/40'}`}>{c.claimed ? 'Claimed' : 'Waiting'}</span>
                    {!c.claimed && <button type="button" className="p-1.5 rounded-full hover:bg-white/10" aria-label={`Copy link for ${c.code}`} onClick={() => flash(c.code, c.link)}>{copied === c.code ? <Check size={13} /> : <Copy size={13} />}</button>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {err && <p role="alert" className="text-sm text-red-300 mb-3">{err}</p>}
          {pool.status === 'ACTIVE' && pool.left > 0 && (
            <button type="button" className={ghost} disabled={busy} onClick={cancel}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
              Stop gift{pool.sponsor?.refundableCents ? ` · refund ${money(pool.sponsor.refundableCents)}` : ''}
            </button>
          )}
        </>
      )}
    </Sheet>
  );
};

const MyGifts: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [pools, setPools] = useState<PublicPool[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { fetchMyPools().then(setPools).catch(e => setErr(e?.message || 'Could not load your gifts')); }, []);
  if (open) return <PoolDetail poolId={open} onClose={() => setOpen(null)} />;
  return (
    <Sheet title="My gifts" onClose={onClose}>
      {err ? <p className="text-sm text-red-300">{err}</p> : !pools ? <div className="py-10 grid place-items-center"><Loader2 className="animate-spin text-white/50" /></div> : !pools.length ? (
        <p className="text-sm text-white/60">You haven’t gifted any books yet. Open a book and choose “Gift this book”.</p>
      ) : (
        <ul className="space-y-2">
          {pools.map(p => (
            <li key={p.poolId}>
              <button type="button" onClick={() => setOpen(p.poolId)} className="w-full text-left flex items-center gap-3 rounded-2xl border border-white/10 hover:border-white/25 p-3">
                {p.cover ? <img src={p.cover} alt="" className="w-10 h-14 rounded-lg object-cover" /> : <span className="w-10 h-14 rounded-lg bg-white/10" />}
                <span className="min-w-0">
                  <span className="block text-sm font-bold truncate">{p.title}</span>
                  <span className="block text-[11px] text-white/50">{p.claimed}/{p.quantity} claimed · {p.status === 'ACTIVE' ? 'active' : p.status === 'EXHAUSTED' ? 'all claimed' : 'ended'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
};

// ── Claim screen ─────────────────────────────────────────────────────────────

const ClaimScreen: React.FC<{ code?: string; poolId?: string; onClose: () => void }> = ({ code: initialCode, poolId, onClose }) => {
  const uid = useUid();
  const [code, setCode] = useState(initialCode || '');
  const [pool, setPool] = useState<PublicPool | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState<{ bookId: string } | null>(null);
  const canonical = useMemo(() => normalizeCode(code), [code]);
  const needsCode = !poolId || pool?.mode === 'CODES';

  useEffect(() => {
    let alive = true;
    setErr('');
    const load = poolId ? fetchPool(poolId) : canonical ? previewCode(canonical) : null;
    if (!load) { setPool(null); return; }
    load.then(p => { if (alive) setPool(p); }).catch(e => { if (alive) { setPool(null); setErr(e?.message || 'Gift not found'); } });
    return () => { alive = false; };
  }, [poolId, canonical, uid]);

  const read = async (bookId: string) => {
    const album = await fetchProjectFromCloud(bookId).catch(() => null);
    if (album) window.dispatchEvent(new CustomEvent('OPEN_LOREA_BOOK', { detail: { album } }));
    onClose();
  };
  const claim = async () => {
    if (!uid) { loginWithGoogle(); return; }
    setBusy(true); setErr('');
    try {
      const r = await claimCopy(needsCode ? { code: canonical || code } : { poolId });
      setClaimed({ bookId: r.bookId });
    } catch (e: any) {
      if (e?.data?.alreadyOwned && e.data.bookId) { setClaimed({ bookId: e.data.bookId }); setErr(e.message); }
      else setErr(e?.message || 'Could not claim this copy');
    } finally { setBusy(false); }
  };

  const ended = pool && (pool.status === 'CLOSED' || pool.status === 'EXHAUSTED' || (pool.mode === 'OPEN' && pool.left <= 0));
  return (
    <Sheet title={claimed ? 'It’s on your shelf' : 'A book for you'} onClose={onClose}>
      {pool && (
        <div className="flex gap-4 mb-5">
          {pool.cover ? <img src={pool.cover} alt="" className="w-20 h-28 rounded-xl object-cover shadow-xl" /> : <span className="w-20 h-28 rounded-xl bg-white/10 grid place-items-center"><BookOpen className="text-white/30" /></span>}
          <div className="min-w-0">
            <p className="text-lg font-black leading-tight">{pool.title}</p>
            {pool.author && <p className="text-xs text-white/50">by {pool.author}</p>}
            <p className="mt-2 text-sm text-white/80 inline-flex items-center gap-1"><Gift size={14} className="text-small-orange" /> {pool.line}</p>
            {pool.message && <p className="mt-2 text-sm italic text-white/60">“{pool.message}”</p>}
          </div>
        </div>
      )}
      {claimed ? (
        <>
          <p className="text-sm text-white/70 mb-5">{err || 'The whole book is yours to keep, on any device you sign in to. It updates when the author publishes corrections.'}</p>
          <button type="button" className={`${primary} w-full`} onClick={() => read(claimed.bookId)}><BookOpen size={14} /> Start reading</button>
        </>
      ) : ended ? (
        <p className="text-sm text-white/70">{pool!.status === 'CLOSED' ? 'This gift has ended.' : 'All the copies in this gift have been claimed.'} You can still buy the book from its page.</p>
      ) : (
        <>
          {needsCode && (
            <label className="block mb-4">
              <span className="text-[11px] font-bold text-white/60">Claim code</span>
              <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} className={`${input} mt-1 font-mono tracking-widest`} placeholder="XXXXX-XXXXX" autoComplete="off" autoCapitalize="characters" />
              {pool?.codeUsed && <span className="mt-1 block text-xs text-amber-300">This code has already been used.</span>}
            </label>
          )}
          {pool?.mode === 'DIRECT' && !needsCode && pool.forYou === false && uid && <p className="text-xs text-amber-300 mb-3">This gift was sent to someone else. If it was meant for you, sign in with the account or email it was sent to.</p>}
          {err && <p role="alert" className="text-sm text-red-300 mb-3">{err}</p>}
          <button type="button" className={`${primary} w-full`} disabled={busy || (needsCode && !canonical) || !!pool?.codeUsed} onClick={claim}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Gift size={14} />}
            {uid ? 'Claim my copy' : 'Sign in to claim'}
          </button>
          {!uid && <p className="mt-2 text-[11px] text-white/40 text-center">A free Plajah account keeps the book on all your devices.</p>}
        </>
      )}
    </Sheet>
  );
};

// ── Host ─────────────────────────────────────────────────────────────────────

type Screen = { kind: 'sponsor'; book: SponsorBook } | { kind: 'claim'; code?: string; poolId?: string } | { kind: 'pool'; poolId: string; justCreated?: boolean } | { kind: 'mine' };

const SponsorCopiesHost: React.FC = () => {
  const [screen, setScreen] = useState<Screen | null>(null);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const strip = (...keys: string[]) => { keys.forEach(k => sp.delete(k)); const q = sp.toString(); window.history.replaceState({}, '', window.location.pathname + (q ? `?${q}` : '')); };
    const claim = sp.get('claim'), gift = sp.get('gift'), bought = sp.get('copies_purchased');
    if (claim) { setScreen({ kind: 'claim', code: claim }); strip('claim'); }
    else if (gift) { setScreen({ kind: 'claim', poolId: gift }); strip('gift'); }
    else if (bought) { setScreen({ kind: 'pool', poolId: bought, justCreated: true }); strip('copies_purchased', 'session_id'); }
    if (sp.get('copies_cancelled')) strip('copies_cancelled');
    const onClaim = (e: Event) => { const d = (e as CustomEvent).detail || {}; setScreen({ kind: 'claim', code: d.code, poolId: d.poolId }); };
    const onSponsor = (e: Event) => { const b = (e as CustomEvent).detail?.book; if (b?.id) setScreen({ kind: 'sponsor', book: b }); };
    const onMine = () => setScreen({ kind: 'mine' });
    window.addEventListener(OPEN_CLAIM_EVENT, onClaim);
    window.addEventListener(OPEN_SPONSOR_EVENT, onSponsor);
    window.addEventListener(OPEN_MY_GIFTS_EVENT, onMine);
    return () => {
      window.removeEventListener(OPEN_CLAIM_EVENT, onClaim);
      window.removeEventListener(OPEN_SPONSOR_EVENT, onSponsor);
      window.removeEventListener(OPEN_MY_GIFTS_EVENT, onMine);
    };
  }, []);
  if (!screen) return null;
  const close = () => setScreen(null);
  if (screen.kind === 'sponsor') return <SponsorDialog book={screen.book} onClose={close} />;
  if (screen.kind === 'claim') return <ClaimScreen code={screen.code} poolId={screen.poolId} onClose={close} />;
  if (screen.kind === 'pool') return <PoolDetail poolId={screen.poolId} justCreated={screen.justCreated} onClose={close} />;
  return <MyGifts onClose={close} />;
};

export default SponsorCopiesHost;
