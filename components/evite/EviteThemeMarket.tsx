/**
 * EviteThemeMarket — the creator theme marketplace for Plajah Evites.
 *
 *   Browse     search + filter public themes; tap a thumb for the living preview; use free ones, buy paid ones,
 *              members' themes for Sanctuary members. Report a theme that uses someone else's art.
 *   My themes  what I made: stats (uses, holders, sales, earnings), edit, publish / unlist, share link, gift a copy,
 *              sell in my shop, remove.
 *   Licences   themes I own or claimed: use for an event, pass a paid/gifted licence on to someone ("trade").
 *
 * A theme bought or claimed is a licence to use it for your own events; the art stays the creator's.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import EviteCard from './EviteCard';
import EviteThemeCreator, { Panel, CopyLink, THEME_CSS } from './EviteThemeCreator';
import { PRESETS, formatCents, themeSharePath } from '../../services/evite/eviteThemes';
import {
  marketThemes, getTheme, myThemes, themeStats, claimTheme, checkoutTheme, confirmThemePurchase, giftTheme, setThemeListed, removeTheme,
  reportTheme, listThemeInShop, checkoutReturn, type PublicTheme, type MyLicense, type ThemeStats, type ThemeArt,
} from '../../services/evite/eviteThemeClient';

export interface EviteThemeMarketProps {
  currentUser: { uid: string; displayName?: string } | null;
  onUseTheme(templateId: string, art: ThemeArt): void;
  onSignIn(): void;
}

type Tab = 'browse' | 'mine' | 'licences';
const artOf = (t: PublicTheme): ThemeArt => ({ plate: t.assets.plate, depth: t.assets.depth, thumb: t.assets.thumb, preset: t.preset, foil: t.foil, voice: t.voice, light: t.light });
const sample = (t: PublicTheme) => { const d = new Date(); d.setDate(d.getDate() + 30); d.setHours(18, 0, 0, 0); return { headline: t.title, subline: '', startsAt: d.getTime(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', venueName: '' }; };
const accessLabel = (t: PublicTheme) => t.access === 'paid' ? formatCents(t.priceCents) : t.access === 'free' ? 'Free' : t.access === 'sanctuary' ? 'Members' : 'Only you';

export default function EviteThemeMarket({ currentUser, onUseTheme, onSignIn }: EviteThemeMarketProps) {
  const [tab, setTab] = useState<Tab>('browse');
  const [open, setOpen] = useState<PublicTheme | null>(null);
  const [creator, setCreator] = useState<{ edit: PublicTheme | null } | null>(null);
  const [notice, setNotice] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey(k => k + 1);

  // Deep links: ?evite_theme=<id> opens it; &theme_session=cs_… is the return from Checkout.
  useEffect(() => {
    const { themeId, sessionId } = checkoutReturn();
    if (themeId) getTheme(themeId).then(setOpen).catch(() => setNotice('That theme isn’t available any more.'));
    if (sessionId && currentUser) {
      setNotice('Confirming your purchase…');
      const tryConfirm = async (n: number): Promise<void> => {
        try {
          const r = await confirmThemePurchase(sessionId);
          if (r.licensed) { setNotice('It’s yours. Find it under Licences, or use it now.'); reload(); return; }
          if (n > 0) { await new Promise(res => setTimeout(res, 2000)); return tryConfirm(n - 1); }
          setNotice('Payment is still processing. It will appear under Licences shortly.');
        } catch (e: any) { setNotice(e?.message || 'We couldn’t confirm the purchase yet.'); }
      };
      tryConfirm(4);
    }
  }, [currentUser?.uid]);   // eslint-disable-line react-hooks/exhaustive-deps

  const needSignIn = !currentUser && tab !== 'browse';
  return (
    <div className="min-h-full text-white px-4 py-5 sm:px-6 max-w-6xl mx-auto">
      <style>{THEME_CSS}</style>
      <header className="flex flex-wrap items-end gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-black italic uppercase tracking-tight" style={{ fontFamily: 'Outfit, Inter, sans-serif' }}>Invitation themes</h1>
          <p className="text-sm text-white/60">Made by creators. Living, tilting cards for your events.</p>
        </div>
        <button className="pj-cta ml-auto" onClick={() => currentUser ? setCreator({ edit: null }) : onSignIn()}>Make a theme</button>
      </header>
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4" role="tablist" aria-label="Theme sections">
        {([['browse', 'Browse'], ['mine', 'My themes'], ['licences', 'Licences']] as const).map(([id, label]) =>
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`h-10 px-4 rounded-full text-xs font-black uppercase tracking-widest whitespace-nowrap border ${tab === id ? 'bg-white text-black border-white' : 'border-white/15 text-white/70'}`}>{label}</button>)}
      </div>
      {notice && <p className="mb-4 text-sm font-bold text-orange-300" role="status">{notice}</p>}

      {needSignIn
        ? <div className="pj-glass text-center max-w-md mx-auto"><p className="text-white/80 mb-4">Sign in to see your themes and licences.</p><button className="pj-cta" onClick={onSignIn}>Sign in</button></div>
        : tab === 'browse' ? <Browse key={reloadKey} onOpen={setOpen} />
        : tab === 'mine' ? <MyThemes key={reloadKey} onEdit={t => setCreator({ edit: t })} onOpen={setOpen} onMake={() => setCreator({ edit: null })} notify={setNotice} />
        : <Licences key={reloadKey} onUse={onUseTheme} notify={setNotice} onChanged={reload} />}

      {open && <ThemeSheet theme={open} currentUser={currentUser} onClose={() => setOpen(null)} onSignIn={onSignIn} onUse={(id, art) => { setOpen(null); onUseTheme(id, art); }} />}
      {creator && <EviteThemeCreator editTheme={creator.edit} onClose={() => { setCreator(null); reload(); }} onDone={() => reload()} />}
    </div>
  );
}

// ── Browse ──────────────────────────────────────────────────────────────────
function Browse({ onOpen }: { onOpen(t: PublicTheme): void }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'popular' | 'new' | 'price'>('popular');
  const [access, setAccess] = useState<'any' | 'free' | 'paid' | 'sanctuary'>('any');
  const [preset, setPreset] = useState('');
  const [tag, setTag] = useState('');
  const [data, setData] = useState<{ items: PublicTheme[]; total: number; tags: string[] } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => marketThemes({ q, sort, access, preset: preset || undefined, tag: tag || undefined, limit: 60 }).then(d => live && setData(d)).catch(e => live && setErr(e.message)), q ? 250 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [q, sort, access, preset, tag]);
  return (
    <section aria-label="Browse themes">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] mb-3">
        <input className="pj-input" type="search" placeholder="Search: garden, neon, watercolor, birthday…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search themes" />
        <select className="pj-input sm:w-40" value={sort} onChange={e => setSort(e.target.value as any)} aria-label="Sort"><option value="popular">Most used</option><option value="new">Newest</option><option value="price">Price</option></select>
        <select className="pj-input sm:w-48" value={preset} onChange={e => setPreset(e.target.value)} aria-label="Style"><option value="">All styles</option>{PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3" role="group" aria-label="Filter">
        {([['any', 'All'], ['free', 'Free'], ['paid', 'For sale'], ['sanctuary', 'Members']] as const).map(([id, l]) => <button key={id} aria-pressed={access === id} onClick={() => setAccess(id)} className={`pj-chip ${access === id ? 'pj-chip-on' : ''}`}>{l}</button>)}
        {(data?.tags || []).map(t => <button key={t} aria-pressed={tag === t} onClick={() => setTag(tag === t ? '' : t)} className={`pj-chip ${tag === t ? 'pj-chip-on' : ''}`}>#{t}</button>)}
      </div>
      {err && <p className="text-amber-300 text-sm" role="alert">{err}</p>}
      {!data && !err && <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">{Array.from({ length: 12 }, (_, i) => <div key={i} className="aspect-[2/3] rounded-2xl bg-white/5 animate-pulse" />)}</div>}
      {data && data.items.length === 0 && <p className="text-white/50 text-sm py-10 text-center">No themes match yet. Make the first one.</p>}
      {data && <ThumbGrid items={data.items} onOpen={onOpen} />}
    </section>
  );
}

function ThumbGrid({ items, onOpen, badge }: { items: PublicTheme[]; onOpen(t: PublicTheme): void; badge?: (t: PublicTheme) => string }) {
  return (
    <ul className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
      {items.map(t => (
        <li key={t.id}>
          <button onClick={() => onOpen(t)} className="relative w-full rounded-2xl overflow-hidden border border-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 text-left" aria-label={`${t.title}, ${accessLabel(t)}${t.ownerName ? `, by ${t.ownerName}` : ''}. Open preview.`}>
            <img src={t.assets.thumb} alt="" loading="lazy" width={240} height={362} className="w-full h-auto block aspect-[2/3] object-cover" />
            <span className="absolute right-1.5 top-1.5 text-[10px] font-black uppercase tracking-wider bg-black/65 rounded-full px-2 py-0.5">{badge ? badge(t) : accessLabel(t)}</span>
            <span className="absolute left-0 right-0 bottom-0 p-2 bg-gradient-to-t from-black/85 to-transparent">
              <span className="block text-[11px] font-bold truncate">{t.title}</span>
              {t.ownerName && <span className="block text-[10px] text-white/60 truncate">{t.ownerName}</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── Detail sheet: living preview + the right action ─────────────────────────
function ThemeSheet({ theme, currentUser, onClose, onSignIn, onUse }: { theme: PublicTheme; currentUser: EviteThemeMarketProps['currentUser']; onClose(): void; onSignIn(): void; onUse(templateId: string, art: ThemeArt): void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const mine = currentUser?.uid === theme.ownerUid;
  const link = `${location.origin}${themeSharePath(theme.id)}`;

  const act = async () => {
    if (!currentUser) return onSignIn();
    setBusy(true); setMsg('');
    try {
      if (mine) return onUse(theme.templateId, artOf(theme));
      if (theme.access === 'paid') { location.href = await checkoutTheme(theme.id); return; }
      const r = await claimTheme(theme.id);
      onUse(r.templateId, r.art);
    } catch (e: any) {
      if (e?.code === 'OWNED') { onUse(theme.templateId, artOf(theme)); return; }
      setMsg(e?.code === 'MEMBERS' ? 'This theme is for members of the creator’s Sanctuary. Join their Sanctuary to use it.' : e?.message || 'Something went wrong.');
    } finally { setBusy(false); }
  };
  const label = mine ? 'Use for an event' : theme.access === 'paid' ? `Buy · ${formatCents(theme.priceCents)}` : theme.access === 'sanctuary' ? 'Use (members)' : 'Use for free';

  return (
    <Panel title={theme.title} onClose={onClose}>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,320px)_1fr] items-start">
        <div className="w-full max-w-[320px] mx-auto"><EviteCard plateId={theme.templateId} art={artOf(theme)} fields={sample(theme)} ctaLabel="RSVP" /></div>
        <div className="grid gap-3 min-w-0">
          {theme.ownerName && <p className="text-sm text-white/70">By <b className="text-white">{theme.ownerName}</b></p>}
          {theme.description && <p className="text-white/85">{theme.description}</p>}
          <div className="flex flex-wrap gap-1.5">{theme.tags.map(t => <span key={t} className="pj-chip">#{t}</span>)}<span className="pj-chip">{PRESETS.find(p => p.id === theme.preset)?.label || theme.preset} motion</span></div>
          <p className="text-xs text-white/55">{theme.uses ? `Used by ${theme.uses} ${theme.uses === 1 ? 'host' : 'hosts'}. ` : ''}A theme is a licence to use it for your own events; the art stays the creator’s.{theme.access === 'paid' ? ' Bought themes can be passed on to someone else.' : ''}</p>
          {msg && <p className="text-sm font-bold text-amber-300" role="alert">{msg}</p>}
          <div className="flex flex-wrap gap-2">
            <button className="pj-cta" onClick={act} disabled={busy}>{busy ? 'One moment…' : currentUser ? label : 'Sign in to use'}</button>
          </div>
          <CopyLink link={link} />
          {!mine && currentUser && (reporting
            ? <form className="grid gap-2" onSubmit={async e => { e.preventDefault(); try { await reportTheme(theme.id, reason); setMsg('Thanks. We’ll take a look.'); setReporting(false); } catch (er: any) { setMsg(er.message); } }}>
                <label className="grid gap-1"><span className="text-sm font-bold">What’s wrong?</span><textarea className="pj-input" rows={2} value={reason} onChange={e => setReason(e.target.value)} maxLength={500} placeholder="This uses a character from…" required /></label>
                <div className="flex gap-2"><button className="pj-ghost">Send report</button><button type="button" className="pj-ghost" onClick={() => setReporting(false)}>Cancel</button></div>
              </form>
            : <button className="text-xs text-white/45 underline justify-self-start" onClick={() => setReporting(true)}>Report this theme</button>)}
        </div>
      </div>
    </Panel>
  );
}

// ── My themes ───────────────────────────────────────────────────────────────
function MyThemes({ onEdit, onOpen, onMake, notify }: { onEdit(t: PublicTheme): void; onOpen(t: PublicTheme): void; onMake(): void; notify(m: string): void }) {
  const [themes, setThemes] = useState<PublicTheme[] | null>(null);
  const [stats, setStats] = useState<ThemeStats | null>(null);
  const [err, setErr] = useState('');
  const [giftFor, setGiftFor] = useState<string | null>(null);
  const load = useCallback(() => { myThemes().then(r => setThemes(r.themes)).catch(e => setErr(e.message)); themeStats().then(setStats).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  const statOf = useMemo(() => new Map((stats?.items || []).map(s => [s.id, s])), [stats]);
  const run = async (f: () => Promise<any>, ok?: string) => { try { await f(); if (ok) notify(ok); load(); } catch (e: any) { notify(e?.message || 'Something went wrong.'); } };

  if (err) return <p className="text-amber-300 text-sm" role="alert">{err}</p>;
  if (!themes) return <div className="h-40 rounded-3xl bg-white/5 animate-pulse" />;
  return (
    <section aria-label="My themes" className="grid gap-4">
      {stats && <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" aria-label="Totals">
        {([['Hosts using', String(stats.totals.uses)], ['Licences out', String(stats.totals.holders)], ['Sales', String(stats.totals.sales)], ['You earned', formatCents(stats.totals.creatorCents)]] as const).map(([l, v]) =>
          <div key={l} className="pj-glass !p-3"><div className="text-2xl font-black italic">{v}</div><div className="text-[10px] font-black uppercase tracking-widest text-white/50">{l}</div></div>)}
      </div>}
      {themes.length === 0 && <div className="pj-glass text-center"><p className="text-white/70 mb-3">You haven’t made a theme yet. Upload your own art and it becomes a living invitation.</p><button className="pj-cta" onClick={onMake}>Make a theme</button></div>}
      <ul className="grid gap-3">
        {themes.map(t => { const s = statOf.get(t.id); const link = `${location.origin}${themeSharePath(t.id)}`; return (
          <li key={t.id} className="pj-glass !p-3 grid grid-cols-[72px_1fr] gap-3 items-start">
            <button onClick={() => onOpen(t)} aria-label={`Preview ${t.title}`} className="rounded-xl overflow-hidden"><img src={t.assets.thumb} alt="" width={72} height={108} className="w-[72px] h-[108px] object-cover block" /></button>
            <div className="min-w-0 grid gap-1.5">
              <div className="flex flex-wrap items-center gap-2"><b className="truncate">{t.title}</b>
                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/10">{t.status === 'draft' ? 'Draft' : !t.listed ? 'Unlisted' : 'Live'}</span>
                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/10">{accessLabel(t)}</span></div>
              <p className="text-xs text-white/60">{s ? `${s.uses} hosts · ${s.holders} licences · ${s.sales} sold · ${formatCents(s.creatorCents)} earned` : `${t.uses} hosts`}</p>
              <div className="flex flex-wrap gap-1.5">
                <button className="pj-chip" onClick={() => onEdit(t)}>Edit</button>
                {t.status === 'draft' && <button className="pj-chip" onClick={() => onEdit(t)}>Publish…</button>}
                {t.status === 'published' && t.access !== 'private' && <button className="pj-chip" onClick={() => run(() => setThemeListed(t.id, !t.listed), t.listed ? 'Unlisted. People who have it keep it.' : 'Back in the market.')}>{t.listed ? 'Unlist' : 'List in market'}</button>}
                {t.status === 'published' && <button className="pj-chip" onClick={async () => { try { await navigator.clipboard.writeText(link); notify('Link copied.'); } catch { notify(link); } }}>Share link</button>}
                {t.status === 'published' && <button className="pj-chip" onClick={() => setGiftFor(giftFor === t.id ? null : t.id)}>Gift a copy</button>}
                {t.status === 'published' && t.access === 'paid' && <button className="pj-chip" onClick={() => run(async () => { try { const r = await listThemeInShop(t.id); notify(r.existed ? 'It’s already in your shop.' : 'Added to your shop as a digital product.'); } catch (e: any) { notify(e?.code === 'SHOP_OFF' ? 'Selling themes in your shop is coming soon. Share the theme link for now.' : e.message); } })}>Sell in your shop</button>}
                <button className="pj-chip" onClick={() => run(async () => {
                  try { await removeTheme(t.id); }
                  catch (e: any) { if (e?.code === 'HAS_BUYERS' && confirm(`${e.message}`)) await removeTheme(t.id, true); else throw e; }
                }, 'Theme removed.')}>Remove</button>
              </div>
              {giftFor === t.id && <GiftForm onSend={to => giftTheme(t.id, to)} onDone={m => { notify(m); setGiftFor(null); }} hint="They get their own licence. Yours is unaffected." />}
              {t.status === 'draft' && <p className="text-[11px] text-white/45">Drafts can’t be used on invitations yet. Publish it (choose “Only me” to keep it private).</p>}
            </div>
          </li>
        ); })}
      </ul>
    </section>
  );
}

// ── Licences ────────────────────────────────────────────────────────────────
function Licences({ onUse, notify, onChanged }: { onUse(templateId: string, art: ThemeArt): void; notify(m: string): void; onChanged(): void }) {
  const [items, setItems] = useState<MyLicense[] | null>(null);
  const [err, setErr] = useState('');
  const [giftFor, setGiftFor] = useState<string | null>(null);
  useEffect(() => { myThemes().then(r => setItems(r.licenses)).catch(e => setErr(e.message)); }, []);
  if (err) return <p className="text-amber-300 text-sm" role="alert">{err}</p>;
  if (!items) return <div className="h-40 rounded-3xl bg-white/5 animate-pulse" />;
  if (!items.length) return <p className="text-white/50 text-sm py-10 text-center">Themes you buy or claim show up here.</p>;
  return (
    <ul className="grid gap-3" aria-label="My licences">
      {items.map(({ license: l, theme: t }) => (
        <li key={l.id} className="pj-glass !p-3 grid grid-cols-[72px_1fr] gap-3 items-start">
          <img src={t.assets.thumb} alt="" width={72} height={108} className="w-[72px] h-[108px] object-cover rounded-xl block" />
          <div className="min-w-0 grid gap-1.5">
            <b className="truncate">{t.title}</b>
            <p className="text-xs text-white/60">{t.ownerName ? `By ${t.ownerName} · ` : ''}{l.source === 'purchase' ? 'Bought' : l.source === 'gift' ? 'Gift from the creator' : l.source === 'transfer' ? 'Passed on to you' : l.source === 'member' ? 'Sanctuary members' : 'Free'}</p>
            <div className="flex flex-wrap gap-1.5">
              <button className="pj-chip pj-chip-on" onClick={() => onUse(t.templateId, artOf(t))}>Use for an event</button>
              {l.transferable && <button className="pj-chip" onClick={() => setGiftFor(giftFor === l.id ? null : l.id)}>Give to someone</button>}
            </div>
            {giftFor === l.id && <GiftForm onSend={to => giftTheme(t.id, to)} onDone={m => { notify(m); setGiftFor(null); onChanged(); }} hint="Your licence moves to them: you won’t be able to start new invitations with it." />}
          </div>
        </li>
      ))}
    </ul>
  );
}

function GiftForm({ onSend, onDone, hint }: { onSend(to: string): Promise<any>; onDone(msg: string): void; hint: string }) {
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <form className="grid gap-1.5" onSubmit={async e => { e.preventDefault(); setBusy(true); setErr(''); try { await onSend(to); onDone(`Sent to ${to}.`); } catch (er: any) { setErr(er?.message || 'Could not send.'); } finally { setBusy(false); } }}>
      <div className="flex gap-2">
        <input className="pj-input" value={to} onChange={e => setTo(e.target.value)} placeholder="@username" aria-label="Their Plajah username" required autoCapitalize="none" autoCorrect="off" />
        <button className="pj-ghost" disabled={busy || !to.trim()}>{busy ? 'Sending…' : 'Send'}</button>
      </div>
      <span className="text-[11px] text-white/50">{hint}</span>
      {err && <span className="text-xs text-amber-300" role="alert">{err}</span>}
    </form>
  );
}
