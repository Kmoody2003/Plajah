// EventPoolView — the /pool/:id page (Photo Pool v2).
//
//  Public pool  everyone's public photos/videos from the event; hosts can hide any of them.
//  My photos    what I added — private and public — with a Private/Public switch and delete.
//  Live now     active streams attached to the pool, watched in the one LiveViewer (streams/{id} engine).
//  Check-in     automatic, consent-first (PoolCheckInPrompt / usePoolCheckIn).
//  Host tools   attendance, who can add, link visibility, venue pin + radius, attach a live stream.
//
// Works signed out for anyone with the link (read-only public pool).
import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { ChevronLeft, ChevronRight, ImagePlus, Lock, Globe, EyeOff, Eye, Trash2, Radio, Share2, Users, Settings2, X, Play, Download, MapPin, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { auth } from '../../services/firebase';
import { poolApi, deletePoolItem, currentPosition, type PoolItemView, type Attendee } from '../../services/eventPool/poolClient';
import { RADIUS_MAX_M, RADIUS_MIN_M, type PoolView, type PoolStreamView } from '../../services/eventPool/poolCore';
import PoolCheckInPrompt, { usePoolCheckIn } from './PoolCheckInPrompt';
import PoolSyncSheet from './PoolSyncSheet';

const LiveViewer = React.lazy(() => import('../MobileLiveStreamer').then(m => ({ default: m.LiveViewer })));

export interface EventPoolViewProps {
  poolId: string;
  onBack?: () => void;
  /** Opens the app's sign-in flow. Without it, signed-out viewers just see a hint. */
  onRequestSignIn?: () => void;
}

type Tab = 'public' | 'mine';

const fmt = (t: number, tz: string | undefined, o: Intl.DateTimeFormatOptions) => { try { return new Date(t).toLocaleString([], { ...o, timeZone: tz }); } catch { return new Date(t).toLocaleString([], o); } };

function phaseLabel(p: PoolView): string {
  const w = p.window;
  if (!w) return 'Shared album';
  if (p.phase === 'open') return 'Happening now';
  if (p.phase === 'upcoming') return `Starts ${fmt(w.eventStart, p.timezone, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  return `Ended ${fmt(w.eventEnd, p.timezone, { month: 'short', day: 'numeric' })}`;
}

export default function EventPoolView({ poolId, onBack, onRequestSignIn }: EventPoolViewProps) {
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [pool, setPool] = useState<PoolView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('public');
  const [items, setItems] = useState<Record<Tab, PoolItemView[] | null>>({ public: null, mine: null });
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [watching, setWatching] = useState<PoolStreamView | null>(null);
  const [hostOpen, setHostOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, u => setUid(u?.uid ?? null)), []);

  const loadPool = useCallback(async () => {
    try { setPool(await poolApi.get(poolId)); setLoadError(null); } catch (e: any) { setLoadError(e?.message || 'This photo pool isn’t available.'); }
  }, [poolId]);
  useEffect(() => { loadPool(); }, [loadPool, uid]);
  // (Re)load the open tab whenever it, the pool or the signed-in person changes. A different person never sees the
  // previous person's "My photos", so the cache is dropped on sign-in changes.
  useEffect(() => { setItems({ public: null, mine: null }); }, [uid, poolId]);
  useEffect(() => {
    if (tab === 'mine' && !uid) return;
    let stale = false;
    poolApi.items(poolId, tab)
      .then(list => { if (!stale) { setItems(s => ({ ...s, [tab]: list })); setItemsError(null); } })
      .catch((e: any) => { if (!stale) { setItems(s => ({ ...s, [tab]: [] })); setItemsError(e?.message || 'Could not load photos.'); } });
    return () => { stale = true; };
  }, [tab, uid, poolId]);
  // Keep the live strip and counts fresh while the event is on.
  useEffect(() => {
    if (pool?.phase !== 'open') return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') loadPool(); }, 60_000);
    return () => clearInterval(t);
  }, [pool?.phase, loadPool]);

  const checkIn = usePoolCheckIn(pool, { onPool: setPool });
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(t => (t === m ? null : t)), 3500); };

  const list = items[tab] || [];
  const live = (pool?.streams || []).filter(s => s.isLive);

  const replaceItem = (it: PoolItemView) => setItems(s => ({
    public: s.public === null ? null : it.visibility === 'public' && (!it.hiddenByHost || pool?.isHost)
      ? (s.public.some(x => x.id === it.id) ? s.public.map(x => (x.id === it.id ? { ...x, ...it } : x)) : [...s.public, it])
      : s.public.filter(x => x.id !== it.id),
    mine: s.mine === null ? null : it.mine ? (s.mine.some(x => x.id === it.id) ? s.mine.map(x => (x.id === it.id ? { ...x, ...it } : x)) : [...s.mine, it]) : s.mine,
  }));

  const act = async (fn: () => Promise<void>) => { try { await fn(); } catch (e: any) { say(e?.message || 'That didn’t work. Try again.'); } };
  const flip = (it: PoolItemView) => act(async () => { replaceItem(await poolApi.setVisibility(poolId, it.id, it.visibility === 'public' ? 'private' : 'public')); });
  const hide = (it: PoolItemView, hidden: boolean) => act(async () => { replaceItem(await poolApi.hide(poolId, it.id, hidden)); say(hidden ? 'Hidden from the pool.' : 'Back in the pool.'); });
  const remove = (it: PoolItemView) => act(async () => {
    if (!window.confirm('Delete this from the pool? This also deletes the file.')) return;
    await deletePoolItem(poolId, it.id);
    setItems(s => ({ public: s.public?.filter(x => x.id !== it.id) ?? null, mine: s.mine?.filter(x => x.id !== it.id) ?? null }));
    setLightbox(null);
  });
  const share = async () => {
    const url = `${window.location.origin}/pool/${encodeURIComponent(poolId)}`;
    try { if (navigator.share) await navigator.share({ title: pool?.title, url }); else { await navigator.clipboard.writeText(url); say('Link copied.'); } } catch { /* cancelled */ }
  };

  if (loadError && !pool) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-4 bg-[#08070c] p-6 text-center text-white">
        <p className="text-white/70">{loadError}</p>
        {onBack && <Button variant="secondary" onClick={onBack}>Go back</Button>}
      </div>
    );
  }
  if (!pool) return <div className="flex h-full flex-1 items-center justify-center bg-[#08070c] text-white/40" role="status"><Loader2 className="animate-spin" aria-label="Loading" /></div>;

  const signedOutHint = !uid ? (onRequestSignIn ? <Button size="sm" variant="primary" onClick={onRequestSignIn}>Sign in to add yours</Button> : <span className="text-xs text-white/50">Sign in to add your photos.</span>) : null;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-[#08070c] text-white">
      <header className="flex items-start gap-3 border-b border-white/5 px-4 pb-3 pt-4 sm:px-6">
        {onBack && <button type="button" onClick={onBack} className="tap mt-0.5 rounded-full p-2 hover:bg-white/10" aria-label="Back"><ChevronLeft size={22} /></button>}
        <div className="min-w-0 flex-1">
          <p className={`text-[11px] font-bold uppercase tracking-[0.2em] ${pool.phase === 'open' ? 'text-[var(--pj-orange,#FF8C00)]' : 'text-white/45'}`}>{phaseLabel(pool)}</p>
          <h1 className="truncate text-xl font-black sm:text-2xl">{pool.title}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-white/50">
            {pool.placeLabel && <span className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden />{pool.placeLabel}</span>}
            <span>{pool.counts.publicItems} shared</span>
            {pool.hasFence && <span>{pool.counts.attendees} checked in</span>}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="ghost" iconOnly aria-label="Share link" icon={<Share2 />} onClick={share} />
          {pool.isHost && <Button size="sm" variant="ghost" iconOnly aria-label="Host tools" icon={<Settings2 />} onClick={() => setHostOpen(true)} />}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-4 sm:px-6">
          <PoolCheckInPrompt pool={pool} checkIn={checkIn} onSignIn={onRequestSignIn} />

          {live.length > 0 && (
            <section aria-label="Live now">
              <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-red-300"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden />Live now</h2>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {live.map(s => (
                  <button key={s.id} type="button" onClick={() => setWatching(s)} className="tap flex w-56 shrink-0 items-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-left hover:bg-red-500/20">
                    <Radio size={20} className="shrink-0 text-red-300" aria-hidden />
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold">{s.title}</span>{s.ownerName && <span className="block truncate text-xs text-white/50">{s.ownerName}</span>}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="flex items-center gap-2">
            <div className="flex rounded-full bg-white/5 p-1" role="tablist" aria-label="Photo pool">
              {(['public', 'mine'] as Tab[]).map(t => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setLightbox(null); }}
                  className={`tap rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${tab === t ? 'bg-white text-black' : 'text-white/60 hover:text-white'}`}>
                  {t === 'public' ? 'Public pool' : 'My photos'}
                </button>
              ))}
            </div>
            <span className="flex-1" />
            {uid && pool.canContribute
              ? <Button size="sm" variant="primary" icon={<ImagePlus />} onClick={() => setSyncOpen(true)}>Add photos from the event</Button>
              : signedOutHint || (!pool.canContribute && <span className="text-right text-xs text-white/45">{pool.uploadPolicy === 'checked_in' && !pool.me?.checkedIn ? 'Check in at the event to add photos.' : pool.uploadsOpen ? '' : 'This pool is closed to new photos.'}</span>)}
          </div>

          {tab === 'mine' && !uid ? (
            <p className="py-12 text-center text-sm text-white/50">Sign in to see the photos you added.</p>
          ) : items[tab] === null ? (
            <div className="flex justify-center py-12 text-white/40" role="status"><Loader2 className="animate-spin" aria-label="Loading" /></div>
          ) : list.length === 0 ? (
            <p className="py-12 text-center text-sm text-white/50">
              {itemsError || (tab === 'public' ? 'Nothing shared yet. Photos people make public show up here.' : 'You haven’t added anything yet. Everything you add starts private.')}
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
              {list.map((it, i) => (
                <li key={it.id} className="relative aspect-square overflow-hidden rounded-xl bg-white/5">
                  <button type="button" className="tap block h-full w-full" onClick={() => setLightbox(i)} aria-label={`Open ${it.kind === 'video' ? 'video' : 'photo'}${it.ownerName ? ` by ${it.ownerName}` : ''}`}>
                    {(it.thumbUrl || it.posterUrl || (it.kind === 'photo' && it.url))
                      ? <img src={it.thumbUrl || it.posterUrl || it.url} alt="" loading="lazy" decoding="async" className={`h-full w-full object-cover ${it.hiddenByHost ? 'opacity-40' : ''}`} referrerPolicy="no-referrer" />
                      : <span className="flex h-full w-full items-center justify-center"><Play size={22} className="text-white/50" aria-hidden /></span>}
                    {it.kind === 'video' && <Play size={18} className="absolute bottom-1.5 left-1.5 text-white drop-shadow" fill="currentColor" aria-hidden />}
                  </button>
                  {tab === 'mine' && (
                    <button type="button" onClick={() => flip(it)} disabled={it.locationScrubbed === false && it.visibility === 'private'}
                      className={`tap absolute right-1 top-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold backdrop-blur disabled:opacity-60 ${it.visibility === 'public' ? 'bg-[#D40055]/70 text-white' : 'bg-black/60 text-white/80'}`}
                      aria-label={it.visibility === 'public' ? 'Public. Make private' : 'Private. Make public'}
                      title={it.locationScrubbed === false ? 'This file still has its location, so it stays private.' : undefined}>
                      {it.visibility === 'public' ? <Globe size={10} aria-hidden /> : <Lock size={10} aria-hidden />}{it.visibility === 'public' ? 'Public' : 'Private'}
                    </button>
                  )}
                  {it.hiddenByHost && <span className="pointer-events-none absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-amber-200"><EyeOff size={10} aria-hidden />Hidden by host</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {lightbox !== null && list[lightbox] && (
        <Lightbox items={list} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} isHost={pool.isHost} timezone={pool.timezone}
          onHide={hide} onFlip={flip} onDelete={remove} />
      )}

      {syncOpen && (
        <PoolSyncSheet pool={pool} onClose={() => { setSyncOpen(false); loadPool(); }} onUploaded={replaceItem} />
      )}

      {hostOpen && pool.isHost && <HostPanel pool={pool} onPool={setPool} onClose={() => setHostOpen(false)} say={say} onWatch={setWatching} />}

      {watching && (
        <div className="fixed inset-0 z-[230] bg-black">
          <Suspense fallback={<div className="flex h-full items-center justify-center text-white/40"><Loader2 className="animate-spin" aria-label="Loading" /></div>}>
            <LiveViewer streamId={watching.id} title={watching.title} ownerName={watching.ownerName} onClose={() => setWatching(null)} />
          </Suspense>
        </div>
      )}

      {toast && <div className="pointer-events-none fixed bottom-6 left-1/2 z-[240] -translate-x-1/2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black shadow-xl" role="status">{toast}</div>}
    </div>
  );
}

function Lightbox({ items, index, onIndex, onClose, isHost, timezone, onHide, onFlip, onDelete }: {
  items: PoolItemView[]; index: number; onIndex: (i: number) => void; onClose: () => void; isHost: boolean; timezone?: string;
  onHide: (it: PoolItemView, hidden: boolean) => void; onFlip: (it: PoolItemView) => void; onDelete: (it: PoolItemView) => void;
}) {
  const it = items[index];
  const go = useCallback((d: number) => onIndex((index + d + items.length) % items.length), [index, items.length, onIndex]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); else if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [go, onClose]);
  const when = it.takenAt ? fmt(it.takenAt, timezone, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : null;
  return (
    <div className="fixed inset-0 z-[225] flex flex-col bg-black/95 text-white" role="dialog" aria-modal="true" aria-label="Photo viewer">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1 text-sm">
          <p className="truncate font-semibold">{it.mine ? 'You' : it.ownerName || 'A guest'}</p>
          {when && <p className="truncate text-xs text-white/50">{when}</p>}
        </div>
        {it.mine && <Button size="sm" variant="ghost" icon={it.visibility === 'public' ? <Globe /> : <Lock />} onClick={() => onFlip(it)} disabled={it.locationScrubbed === false && it.visibility === 'private'}>{it.visibility === 'public' ? 'Public' : 'Private'}</Button>}
        {isHost && it.visibility === 'public' && <Button size="sm" variant="ghost" icon={it.hiddenByHost ? <Eye /> : <EyeOff />} onClick={() => onHide(it, !it.hiddenByHost)}>{it.hiddenByHost ? 'Unhide' : 'Hide'}</Button>}
        {(it.originalUrl || it.url) && <Button as="a" size="sm" variant="ghost" iconOnly aria-label="Download" icon={<Download />} href={it.originalUrl || it.url} target="_blank" rel="noopener noreferrer" />}
        {it.mine && <Button size="sm" variant="ghost" iconOnly aria-label="Delete" icon={<Trash2 />} onClick={() => onDelete(it)} />}
        <Button size="sm" variant="ghost" iconOnly aria-label="Close" icon={<X />} onClick={onClose} />
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-2">
        {it.kind === 'video'
          ? <video key={it.id} src={it.url} poster={it.posterUrl} controls playsInline autoPlay className="max-h-full max-w-full rounded-xl" />
          : <img key={it.id} src={it.url} alt="" className="max-h-full max-w-full rounded-xl object-contain" referrerPolicy="no-referrer" />}
        {items.length > 1 && <>
          <button type="button" onClick={() => go(-1)} className="tap absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="Previous"><ChevronLeft /></button>
          <button type="button" onClick={() => go(1)} className="tap absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="Next"><ChevronRight /></button>
        </>}
      </div>
    </div>
  );
}

function HostPanel({ pool, onPool, onClose, say, onWatch }: { pool: PoolView; onPool: (p: PoolView) => void; onClose: () => void; say: (m: string) => void; onWatch: (s: PoolStreamView) => void }) {
  const [attendees, setAttendees] = useState<Attendee[] | null>(null);
  const [radius, setRadius] = useState(pool.fenceRadiusM ?? 250);
  const [streamId, setStreamId] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { poolApi.attendance(pool.id).then(r => setAttendees(r.attendees)).catch(() => setAttendees([])); }, [pool.id]);
  const run = async (fn: () => Promise<PoolView>, done?: string) => {
    setBusy(true);
    try { onPool(await fn()); if (done) say(done); } catch (e: any) { say(e?.message || 'That didn’t work.'); } finally { setBusy(false); }
  };
  const pinHere = () => run(async () => {
    const pos = await currentPosition();
    return poolApi.settings(pool.id, { overrides: { lat: pos.coords.latitude, lng: pos.coords.longitude, radiusM: radius } });
  }, 'Venue pin set to where you are.');
  const sourceNote = useMemo(() => ({ event: 'from the event listing', geocode: 'from the invitation address', host: 'set by you' } as Record<string, string>)[pool.fenceSource || ''] || '', [pool.fenceSource]);

  return (
    <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/70 sm:items-center" role="dialog" aria-modal="true" aria-label="Host tools">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] border border-white/10 bg-[#0d0b12] p-5 text-white sm:rounded-[28px]">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-base font-bold">Host tools</h2><Button size="sm" variant="ghost" iconOnly aria-label="Close" icon={<X />} onClick={onClose} /></div>

        <section className="mb-5 space-y-2">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-white/50"><Users size={14} aria-hidden />Checked in ({attendees?.length ?? '…'})</h3>
          {attendees === null ? <p className="text-sm text-white/40">Loading…</p> : attendees.length === 0 ? <p className="text-sm text-white/40">No one yet.</p> : (
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {attendees.map(a => (
                <li key={a.uid} className="flex items-center gap-2 text-sm">
                  {a.photoURL ? <img src={a.photoURL} alt="" className="h-6 w-6 rounded-full object-cover" referrerPolicy="no-referrer" /> : <span className="h-6 w-6 rounded-full bg-white/10" aria-hidden />}
                  <span className="min-w-0 flex-1 truncate">{a.name || 'Guest'}</span>
                  <span className="text-xs text-white/40">{fmt(a.at, pool.timezone, { hour: 'numeric', minute: '2-digit' })}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-5 space-y-2 text-sm">
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">Who can add photos</h3>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={pool.uploadPolicy === 'link' ? 'primary' : 'secondary'} disabled={busy} onClick={() => run(() => poolApi.settings(pool.id, { uploadPolicy: 'link' }))}>Anyone signed in with the link</Button>
            <Button size="sm" variant={pool.uploadPolicy === 'checked_in' ? 'primary' : 'secondary'} disabled={busy} onClick={() => run(() => poolApi.settings(pool.id, { uploadPolicy: 'checked_in' }))}>Only people checked in</Button>
          </div>
          <h3 className="pt-2 text-xs font-bold uppercase tracking-[0.2em] text-white/50">Who can see the public pool</h3>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={pool.visibility === 'guests' ? 'primary' : 'secondary'} disabled={busy} onClick={() => run(() => poolApi.settings(pool.id, { visibility: 'guests' }))}>Anyone with the link</Button>
            <Button size="sm" variant={pool.visibility === 'public' ? 'primary' : 'secondary'} disabled={busy} onClick={() => run(() => poolApi.settings(pool.id, { visibility: 'public' }))}>Public (can be listed)</Button>
          </div>
        </section>

        <section className="mb-5 space-y-2 text-sm">
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">Check-in area</h3>
          <p className="text-white/60">{pool.fence ? `Pin ${sourceNote}. Guests within ${pool.fence.radiusM} m are checked in automatically.` : 'No venue pin yet, so automatic check-in is off. Stand at the venue and set the pin.'}</p>
          <label className="flex items-center gap-3">
            <span className="w-16 text-white/50">{radius} m</span>
            <input type="range" min={RADIUS_MIN_M} max={RADIUS_MAX_M} step={25} value={radius} onChange={e => setRadius(Number(e.target.value))} className="flex-1 accent-[#D40055]" aria-label="Check-in radius in metres" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={busy || !pool.fence} onClick={() => run(() => poolApi.settings(pool.id, { overrides: { radiusM: radius } }), 'Radius saved.')}>Save radius</Button>
            <Button size="sm" variant="secondary" icon={<MapPin />} disabled={busy} onClick={pinHere}>Set pin to my location</Button>
            {pool.fenceSource === 'host' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => poolApi.settings(pool.id, { overrides: { clearPlace: true } }))}>Use the event address</Button>}
          </div>
        </section>

        <section className="space-y-2 text-sm">
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">Live streams</h3>
          {pool.streams.length > 0 && (
            <ul className="space-y-1">
              {pool.streams.map(s => (
                <li key={s.id} className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${s.isLive ? 'bg-red-500' : 'bg-white/20'}`} aria-hidden />
                  <button type="button" className="tap min-w-0 flex-1 truncate text-left hover:underline disabled:no-underline" disabled={!s.isLive} onClick={() => onWatch(s)}>{s.title}{s.isLive ? '' : ' (ended)'}</button>
                  <Button size="xs" variant="ghost" disabled={busy} onClick={() => run(() => poolApi.attachStream(pool.id, s.id, false))}>Remove</Button>
                </li>
              ))}
            </ul>
          )}
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); const id = streamId.trim(); if (id) run(() => poolApi.attachStream(pool.id, id, true), 'Stream added.').then(() => setStreamId('')); }}>
            <input value={streamId} onChange={e => setStreamId(e.target.value)} placeholder="Live stream id" aria-label="Live stream id"
              className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm outline-none focus:border-white/30" />
            <Button size="sm" variant="secondary" type="submit" disabled={busy || !streamId.trim()}>Add</Button>
          </form>
          <p className="text-xs text-white/40">Go live from Plajah Live, then paste the stream id here. Live streams show at the top of the pool while they’re on.</p>
        </section>
      </div>
    </div>
  );
}
