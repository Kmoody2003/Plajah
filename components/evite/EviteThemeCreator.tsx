/**
 * EviteThemeCreator — make your own invitation theme from your own art.
 *
 *   Art → the live card appears at once (EviteCard `art` prop) while the depth map computes in the browser
 *   → pick whose motion + lettering to borrow, foil colour → name + tags → who can use it (free / paid / Sanctuary
 *   members / only me) → "I made this or have the rights to use it" → publish.
 *
 * Mobile-first, Plajah dark glass. Nothing leaves the device except the three images, uploaded to the creator's
 * own storage folder when they save.
 */
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import EviteCard from './EviteCard';
import { PRESETS, ATTESTATION_TEXT, MIN_PRICE_CENTS, MAX_PRICE_CENTS, themeSaleMath, formatCents, brandFlag, type ThemeAccess } from '../../services/evite/eviteThemes';
import { prepareThemeArt, computeDepthMap, uploadThemeBlobs, saveTheme, publishTheme, type PreparedArt, type PublicTheme, type ThemeUploadProgress } from '../../services/evite/eviteThemeClient';
import { recipeFor } from '../../services/evite/motionRecipes';

export interface EviteThemeCreatorProps {
  /** edit an existing theme of mine (art can be replaced) */
  editTheme?: PublicTheme | null;
  onClose(): void;
  /** after a successful publish (or save, when `saveOnly`) */
  onDone?(theme: PublicTheme, link?: string): void;
}

const ACCESS: Array<{ id: ThemeAccess; label: string; hint: string }> = [
  { id: 'free', label: 'Free', hint: 'Anyone can use it for their events.' },
  { id: 'paid', label: 'For sale', hint: 'People buy a licence once. Money goes to your Stripe payouts.' },
  { id: 'sanctuary', label: 'Sanctuary members', hint: 'Only members of your Sanctuary can use it.' },
  { id: 'private', label: 'Only me', hint: 'Just for your own events. You can still gift it to someone.' },
];

const sampleFields = (title: string) => {
  const d = new Date(); d.setDate(d.getDate() + 30); d.setHours(18, 0, 0, 0);
  return { headline: title || 'Your headline here', subline: '', startsAt: d.getTime(), endsAt: undefined, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', venueName: 'The Garden Room' };
};

export default function EviteThemeCreator({ editTheme, onClose, onDone }: EviteThemeCreatorProps) {
  const uid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [prep, setPrep] = useState<PreparedArt | null>(null);
  const [depthBlob, setDepthBlob] = useState<Blob | null>(null);
  const [depthUrl, setDepthUrl] = useState<string | null>(null);
  const [depthState, setDepthState] = useState<'idle' | 'working' | 'done' | 'failed'>('idle');
  const [progress, setProgress] = useState<ThemeUploadProgress | null>(null);
  const [preset, setPreset] = useState(editTheme?.preset || 'general');
  const [foil, setFoil] = useState<string | null>(editTheme?.foil || null);
  const [voice, setVoice] = useState<string>(editTheme?.voice || '');
  const [light, setLight] = useState<boolean>(editTheme?.light ?? false);
  const [title, setTitle] = useState(editTheme?.title || '');
  const [description, setDescription] = useState(editTheme?.description || '');
  const [tags, setTags] = useState((editTheme?.tags || []).join(', '));
  const [access, setAccess] = useState<ThemeAccess>(editTheme?.access || 'free');
  const [price, setPrice] = useState(editTheme?.priceCents ? (editTheme.priceCents / 100).toFixed(2) : '4.00');
  const [attest, setAttest] = useState(false);
  const [busy, setBusy] = useState<'' | 'save' | 'publish'>('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ theme: PublicTheme; link?: string } | null>(null);

  // revoke object URLs when replaced / unmounted
  useEffect(() => () => { if (prep) URL.revokeObjectURL(prep.previewUrl); }, [prep]);
  useEffect(() => () => { if (depthUrl) URL.revokeObjectURL(depthUrl); }, [depthUrl]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setErr(''); setDepthBlob(null); setDepthUrl(null); setDepthState('idle'); setProgress({ stage: 'prepare', message: 'Sizing your art…' });
    try {
      const p = await prepareThemeArt(f);
      setPrep(p); setLight(p.light); setProgress(null);
      setDepthState('working');
      computeDepthMap(p.plateCanvas, setProgress)
        .then(b => { setDepthBlob(b); setDepthUrl(URL.createObjectURL(b)); setDepthState('done'); setProgress(null); })
        .catch(e => { setDepthState('failed'); setProgress({ stage: 'depth', message: `No depth map (${e?.message || 'this device couldn’t run the model'}). The card still works, just without the 3D tilt.` }); });
    } catch (e: any) { setErr(e?.message || 'That image could not be read.'); setProgress(null); }
  };

  const art = useMemo(() => {
    const plate = prep?.previewUrl || editTheme?.assets.plate;
    if (!plate) return null;
    const depth = prep ? depthUrl || undefined : editTheme?.assets.depth;
    return { plate, depth, preset, foil: foil || undefined, voice: voice || undefined, light };
  }, [prep, depthUrl, editTheme, preset, foil, voice, light]);

  const presetFoil = recipeFor(preset, 'custom').foil.color;
  const priceCents = Math.round(Number(price) * 100);
  const math = themeSaleMath(Number.isFinite(priceCents) ? priceCents : 0);
  const priceOk = access !== 'paid' || (Number.isFinite(priceCents) && priceCents >= MIN_PRICE_CENTS && priceCents <= MAX_PRICE_CENTS);
  const brand = brandFlag(title, description, tags);
  const hasArt = !!(prep || editTheme);
  const canSave = hasArt && title.trim().length >= 2 && priceOk && !brand && depthState !== 'working';

  const persist = async (): Promise<PublicTheme> => {
    let assets: { plate: string; thumb: string; depth?: string } | undefined;
    if (prep) assets = await uploadThemeBlobs({ plate: prep.plate, thumb: prep.thumb, depth: depthBlob }, setProgress);
    setProgress(null);
    return saveTheme({
      ...(editTheme ? { id: editTheme.id } : {}), title, description, tags: tags.split(',').map(s => s.trim()).filter(Boolean),
      preset, foil: foil || undefined, voice: voice || undefined, light, access, priceCents: access === 'paid' ? priceCents : 0,
      ...(assets ? { assets } : {}), ...(prep ? { dhash: prep.dhash } : {}),
    });
  };

  const save = async (publish: boolean) => {
    setErr('');
    if (publish && !attest) { setErr(`Please confirm: “${ATTESTATION_TEXT}”`); return; }
    setBusy(publish ? 'publish' : 'save');
    try {
      const saved = await persist();
      if (!publish) { setDone({ theme: saved }); onDone?.(saved); return; }
      const r = await publishTheme(saved.id, true);
      setDone(r); onDone?.(r.theme, r.link);
    } catch (e: any) {
      setErr(e?.code === 'NO_PAYOUTS' ? 'To sell a theme, finish setting up payouts (Stripe) in your creator dashboard first. You can publish it as free or members-only meanwhile.' : e?.message || 'Something went wrong.');
    } finally { setBusy(''); setProgress(null); }
  };

  if (done) return (
    <Panel title={done.theme.status === 'published' ? 'Your theme is live' : 'Saved as a draft'} onClose={onClose}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[220px_1fr] items-start">
        {art && <div className="w-full max-w-[220px] mx-auto"><EviteCard plateId={`theme:${done.theme.id}`} art={{ ...art, plate: done.theme.assets.plate, depth: done.theme.assets.depth }} fields={sampleFields(done.theme.title)} compact /></div>}
        <div className="grid gap-3">
          <p className="text-white/80 text-sm">{done.theme.status === 'published'
            ? done.theme.access === 'private' ? 'Only you can use it. You can gift it to someone from My themes.' : 'People can find it in the theme market now.'
            : 'Publish it whenever you’re ready from My themes.'}</p>
          {done.link && <CopyLink link={done.link} />}
          <button className="pj-cta" onClick={onClose}>Done</button>
        </div>
      </div>
    </Panel>
  );

  return (
    <Panel title={editTheme ? 'Edit theme' : 'Make a theme'} onClose={onClose}>
      <style>{THEME_CSS}</style>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
        <div className="grid gap-5 min-w-0 order-2 lg:order-1">
          {/* 1. Art */}
          <section className="pj-glass grid gap-3" aria-labelledby={`${uid}-art`}>
            <h3 id={`${uid}-art`} className="pj-h3">1 · Your art</h3>
            <p className="text-xs text-white/60">Upload art you made (painting, photo, generative art you created). It’s cropped to a 2:3 card. Tall images work best.</p>
            <input ref={fileRef} id={`${uid}-file`} type="file" accept="image/*" className="sr-only" onChange={e => onFile(e.target.files?.[0])} />
            <label htmlFor={`${uid}-file`} className="pj-cta justify-self-start inline-flex items-center cursor-pointer" role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}>
              {hasArt ? 'Replace art' : 'Choose an image'}
            </label>
            {progress && <Progress p={progress} />}
            {depthState === 'working' && <p className="text-xs text-white/50">First time only: the depth model downloads (up to about 100 MB) and your browser keeps it, so next time is instant. Your image never leaves this device for this step.</p>}
            {depthState === 'done' && <p className="text-xs text-emerald-300">Depth map ready: tilt or move your mouse over the card.</p>}
          </section>

          {/* 2. Style */}
          <section className="pj-glass grid gap-3" aria-labelledby={`${uid}-style`}>
            <h3 id={`${uid}-style`} className="pj-h3">2 · Motion and lettering</h3>
            <p className="text-xs text-white/60">Your theme moves and letters like one of our collections. Pick the one that fits.</p>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Motion style">
              {PRESETS.map(p => <button key={p.id} type="button" role="radio" aria-checked={preset === p.id} onClick={() => setPreset(p.id)} className={`pj-chip ${preset === p.id ? 'pj-chip-on' : ''}`}>{p.label}</button>)}
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="grid gap-1"><span className="text-sm font-bold text-white/85">Foil colour</span>
                <span className="flex items-center gap-2">
                  <input type="color" value={foil || presetFoil} onChange={e => setFoil(e.target.value)} className="h-11 w-14 rounded-xl border border-white/15 bg-transparent" aria-label="Foil colour" />
                  {foil && <button type="button" className="pj-ghost" onClick={() => setFoil(null)}>Use the style’s</button>}
                </span>
              </label>
              <label className="grid gap-1"><span className="text-sm font-bold text-white/85">Lettering</span>
                <select className="pj-input" value={voice} onChange={e => setVoice(e.target.value)}>
                  <option value="">Same as the motion style</option>
                  <option value="wedding">Elegant serif</option>
                  <option value="kids_everyone">Rounded and playful</option>
                  <option value="adult">Bold party italic</option>
                  {voice && !['wedding', 'kids_everyone', 'adult'].includes(voice) && <option value={voice}>{PRESETS.find(p => p.id === voice)?.label || voice}</option>}
                </select>
              </label>
            </div>
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-0.5 w-5 h-5 accent-orange-500" checked={light} onChange={e => setLight(e.target.checked)} />
              <span><b>Light art at the bottom</b><span className="block text-xs text-white/55">Dark text on a soft paper wash. We guessed this from your image.</span></span></label>
          </section>

          {/* 3. Details */}
          <section className="pj-glass grid gap-3" aria-labelledby={`${uid}-details`}>
            <h3 id={`${uid}-details`} className="pj-h3">3 · Name it</h3>
            <label className="grid gap-1"><span className="text-sm font-bold text-white/85">Theme name</span><input className="pj-input" value={title} onChange={e => setTitle(e.target.value)} maxLength={60} placeholder="Moonlit Garden" required /></label>
            <label className="grid gap-1"><span className="text-sm font-bold text-white/85">Description (optional)</span><textarea className="pj-input" rows={2} value={description} onChange={e => setDescription(e.target.value)} maxLength={280} placeholder="Hand-painted florals for evening weddings." /></label>
            <label className="grid gap-1"><span className="text-sm font-bold text-white/85">Tags</span><input className="pj-input" value={tags} onChange={e => setTags(e.target.value)} placeholder="garden, night, watercolor" /><span className="text-xs text-white/50">Up to 8, separated by commas. Helps people find it.</span></label>
            {brand && <p className="text-sm font-bold text-amber-300" role="alert">Themes can’t use other brands’ names or characters (“{brand}”).</p>}
          </section>

          {/* 4. Access */}
          <fieldset className="pj-glass grid gap-2">
            <legend className="pj-h3 mb-2">4 · Who can use it</legend>
            {ACCESS.map(a => (
              <label key={a.id} className={`flex items-start gap-3 rounded-2xl border p-3 cursor-pointer ${access === a.id ? 'border-orange-400/70 bg-white/[0.06]' : 'border-white/10'}`}>
                <input type="radio" name={`${uid}-access`} className="mt-1 w-4 h-4 accent-orange-500" checked={access === a.id} onChange={() => setAccess(a.id)} />
                <span><b className="text-sm">{a.label}</b><span className="block text-xs text-white/55">{a.hint}</span></span>
              </label>
            ))}
            {access === 'paid' && (
              <div className="grid gap-1 pl-1">
                <label className="grid gap-1 max-w-[200px]"><span className="text-sm font-bold text-white/85">Price (USD)</span>
                  <input className="pj-input" type="number" inputMode="decimal" min={MIN_PRICE_CENTS / 100} max={MAX_PRICE_CENTS / 100} step="0.01" value={price} onChange={e => setPrice(e.target.value)} aria-invalid={!priceOk} /></label>
                {priceOk ? <p className="text-xs text-white/60">Buyers pay {formatCents(math.priceCents)}. You receive {formatCents(math.creatorCents)} (Plajah keeps 5%).</p>
                  : <p className="text-xs text-amber-300" role="alert">Choose a price between {formatCents(MIN_PRICE_CENTS)} and {formatCents(MAX_PRICE_CENTS)}.</p>}
              </div>
            )}
            {access === 'sanctuary' && <p className="text-xs text-white/60 pl-1">Members with an active membership of your Sanctuary can use it. If someone’s membership ends, they can’t start new invitations with it.</p>}
          </fieldset>

          {/* 5. Attest + publish */}
          <section className="pj-glass grid gap-3">
            <label className="flex items-start gap-3 text-sm cursor-pointer">
              <input type="checkbox" className="mt-0.5 w-5 h-5 accent-orange-500 shrink-0" checked={attest} onChange={e => setAttest(e.target.checked)} aria-describedby={`${uid}-attest-hint`} />
              <span><b>{ATTESTATION_TEXT}</b><span id={`${uid}-attest-hint`} className="block text-xs text-white/55">No other brands’ characters, logos or artwork. Themes that break this are removed.</span></span>
            </label>
            {err && <p className="text-sm font-bold text-amber-300" role="alert">{err}</p>}
            <div className="flex flex-wrap gap-3">
              <button className="pj-cta" disabled={!canSave || !attest || !!busy} onClick={() => save(true)}>{busy === 'publish' ? 'Publishing…' : editTheme?.status === 'published' ? 'Save changes' : 'Publish'}</button>
              {editTheme?.status !== 'published' && <button className="pj-ghost" disabled={!canSave || !!busy} onClick={() => save(false)}>{busy === 'save' ? 'Saving…' : 'Save draft'}</button>}
              <button className="pj-ghost" onClick={onClose} disabled={!!busy}>Cancel</button>
            </div>
            {!hasArt && <p className="text-xs text-white/45">Add your art to continue.</p>}
            {depthState === 'working' && <p className="text-xs text-white/45">Publishing unlocks when the depth map is ready.</p>}
          </section>
        </div>

        <aside className="order-1 lg:order-2 lg:sticky lg:top-4" aria-label="Live preview">
          {art ? <div className="w-full max-w-[320px] mx-auto"><EviteCard key={`${art.plate}|${art.depth || ''}`} plateId="theme:preview" art={art} fields={sampleFields(title)} ctaLabel="RSVP" /></div>
            : <div className="aspect-[2/3] w-full max-w-[320px] mx-auto rounded-[28px] border border-dashed border-white/20 grid place-items-center text-white/40 text-sm p-6 text-center">Your living card appears here</div>}
          <p className="text-center text-xs text-white/40 mt-2">Live preview · tilt or move your mouse</p>
        </aside>
      </div>
    </Panel>
  );
}

// ── shared bits (also used by EviteThemeMarket + ThemePickerSection) ─────────

export function Panel({ title, onClose, children }: { title: string; onClose(): void; children: React.ReactNode }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm overflow-y-auto" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{THEME_CSS}</style>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id}
        className="relative mx-auto my-0 sm:my-8 w-full max-w-5xl min-h-full sm:min-h-0 sm:rounded-[28px] border border-white/10 text-white p-4 sm:p-6 outline-none"
        style={{ background: 'linear-gradient(160deg,rgba(107,0,153,.35),rgba(10,6,18,.96) 40%,rgba(212,0,85,.18))', boxShadow: '0 40px 120px -40px rgba(0,0,0,.9)' }}>
        <div className="flex items-center gap-3 mb-4">
          <h2 id={id} className="text-xl sm:text-2xl font-black italic uppercase tracking-tight min-w-0 truncate" style={{ fontFamily: 'Outfit, Inter, sans-serif' }}>{title}</h2>
          <button onClick={onClose} className="ml-auto h-10 w-10 shrink-0 rounded-full border border-white/15 grid place-items-center" aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Progress({ p }: { p: ThemeUploadProgress }) {
  return (
    <div className="grid gap-1" role="status" aria-live="polite">
      <span className="text-xs text-white/75">{p.message}</span>
      {p.progress !== undefined
        ? <progress className="pj-progress" max={1} value={p.progress} aria-label={p.message} />
        : <span className="block h-1.5 rounded-full bg-white/10 overflow-hidden"><span className="block h-full w-1/3 rounded-full pj-indeterminate" /></span>}
    </div>
  );
}

export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-full border border-white/15 bg-black/30 pl-4 pr-1.5 py-1.5">
      <span className="truncate font-semibold text-sm">{link.replace(/^https?:\/\//, '')}</span>
      <button className="pj-chip" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard blocked */ } }}>{copied ? 'Copied' : 'Copy link'}</button>
    </div>
  );
}

export const THEME_CSS = `
.pj-glass{border-radius:22px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);padding:16px;backdrop-filter:blur(14px)}
.pj-h3{font:800 12px Inter,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#FF8C00;margin:0}
.pj-input{width:100%;min-height:44px;border-radius:14px;border:1px solid rgba(255,255,255,.15);background:rgba(0,0,0,.3);color:#fff;padding:10px 12px;font:15px Inter,sans-serif}
.pj-input:focus-visible,.pj-cta:focus-visible,.pj-ghost:focus-visible,.pj-chip:focus-visible{outline:2px solid #00DAF3;outline-offset:2px}
.pj-cta{min-height:48px;padding:0 26px;border-radius:999px;border:0;background:linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00);color:#fff;font:800 13px Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.pj-cta:disabled{opacity:.45;cursor:not-allowed}
.pj-ghost{min-height:44px;padding:0 18px;border-radius:999px;border:1px solid rgba(255,255,255,.2);background:transparent;color:#fff;font:700 13px Inter,sans-serif;cursor:pointer;display:inline-flex;align-items:center;text-decoration:none}
.pj-ghost:disabled{opacity:.45}
.pj-chip{min-height:36px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.04);color:#fff;font:700 12px Inter,sans-serif;display:inline-flex;align-items:center;gap:4px;text-decoration:none;cursor:pointer;white-space:nowrap}
.pj-chip-on{background:#fff;color:#000}
.pj-progress{width:100%;height:6px;border-radius:999px;overflow:hidden;appearance:none;background:rgba(255,255,255,.1)}
.pj-progress::-webkit-progress-bar{background:rgba(255,255,255,.1)}
.pj-progress::-webkit-progress-value{background:linear-gradient(90deg,#6B0099,#D40055,#FF8C00)}
.pj-progress::-moz-progress-bar{background:linear-gradient(90deg,#6B0099,#D40055,#FF8C00)}
.pj-indeterminate{background:linear-gradient(90deg,#6B0099,#D40055,#FF8C00);animation:pjInd 1.2s ease-in-out infinite}
@keyframes pjInd{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}
@media (prefers-reduced-motion: reduce){.pj-indeterminate{animation:none;width:100%!important;opacity:.6}}
`;
