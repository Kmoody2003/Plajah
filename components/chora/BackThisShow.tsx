// Sponsor This Show (routes/backShow.ts). BackShowDesk: an organizer lists sponsorship packages for a show. BackShowPage:
// the public page where businesses buy them, and where anyone can check the show's record.

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, ExternalLink, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { auth } from '../../services/firebase';
import { MAX_CONTRACT_BYTES, ORGANIZER_ROLES, ORGANIZER_TERMS, ORGANIZER_TERMS_VERSION, SPONSOR_TERMS, TERMS_VERSION, otsProofFile, verifyRecord, type OrganizerRole, type BackTier, type RecordCheck, type RecordEntry, type TierKind } from '../../services/backShow/backShowCore';

/** The lab swaps this for a stand-in identity. */
export let backShowToken = async (): Promise<string | null> => (auth.currentUser ? auth.currentUser.getIdToken() : null);
export const setBackShowToken = (fn: typeof backShowToken) => { backShowToken = fn; };

async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await backShowToken();
  const res = await fetch(`/api/back-show${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Something went wrong. Try again.');
  return json;
}

async function saveContractFile(path: string, fileName: string) {
  const token = await backShowToken();
  const res = await fetch(`/api/back-show${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error('The contract couldn’t be opened. Try again.');
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url; link.download = fileName; link.click();
  URL.revokeObjectURL(url);
}

const money = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const toCents = (s: string) => Math.round((parseFloat(s.replace(/[$,\s]/g, '')) || 0) * 100);
const dateText = (ms: number) => new Date(ms).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const dateInput = (ms: number) => new Date(ms).toLocaleDateString('en-CA');
const fromDateInput = (s: string) => new Date(`${s}T20:00:00`).getTime();

const card = 'rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 sm:p-5';
const field = 'w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-[#FF8C00]/60';
const primary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF8C00] px-4 py-2 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-40';
const quiet = 'inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-white/70 transition hover:border-white/25 hover:text-white disabled:opacity-40';
const heading = 'text-sm font-bold text-white';
const muted = 'text-sm text-white/50';
const labelText = 'mb-1 block text-xs font-semibold text-white/60';

const Notice: React.FC<{ error?: string; ok?: string }> = ({ error, ok }) => (!error && !ok ? null : (
  <div role={error ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${error ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
    {error ? <AlertCircle size={15} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={15} className="mt-0.5 shrink-0" />}
    <span>{error || ok}</span>
  </div>
));

function useAction(after?: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const run = useCallback(async (fn: () => Promise<unknown>, success = '') => {
    setBusy(true); setError(''); setOk('');
    try { await fn(); setOk(success); after?.(); return true; }
    catch (e: any) { setError(e.message); return false; }
    finally { setBusy(false); }
  }, [after]);
  return { busy, error, ok, run };
}

const STATUS_TEXT: Record<string, string> = {
  draft: 'Draft', live: 'Selling sponsorships', completed: 'Show played', cancelled: 'Cancelled',
};
const KIND_TEXT: Record<TierKind, string> = { sponsor: 'Sponsor', host: 'Host', ad: 'Advertiser' };

// ── Artist desk ──────────────────────────────────────────────────────────────

const inDays = (d: number) => Date.now() + d * 86400000;
const newDraft = () => ({
  title: '', artistName: '', organizerName: '', organizerRole: 'artist' as OrganizerRole, venue: '', city: '', description: '', ticketUrl: '', showDate: dateInput(inDays(60)),
  tiers: [
    { id: 'presenting', kind: 'sponsor' as TierKind, name: 'Presenting sponsor', description: 'Your name on the show, the stage screens and the event page.', cancellationTerms: '', price: '1000', limit: '1' },
  ],
});
type Draft = ReturnType<typeof newDraft>;

const payload = (d: Draft) => ({
  title: d.title, artistName: d.artistName, organizerName: d.organizerName, organizerRole: d.organizerRole, venue: d.venue, city: d.city, description: d.description, ticketUrl: d.ticketUrl,
  showDate: fromDateInput(d.showDate),
  tiers: d.tiers.map(t => ({ id: t.id, kind: t.kind, name: t.name, description: t.description, cancellationTerms: t.cancellationTerms, priceCents: toCents(t.price), ...(t.limit ? { limit: parseInt(t.limit, 10) } : {}) })),
});

const CampaignForm: React.FC<{ onDone: () => void; onCancel: () => void }> = ({ onDone, onCancel }) => {
  const [d, setD] = useState<Draft>(newDraft);
  const [responsible, setResponsible] = useState(false);
  const a = useAction();
  const set = (patch: Partial<Draft>) => setD(x => ({ ...x, ...patch }));
  const text = (key: 'title' | 'artistName' | 'organizerName' | 'venue' | 'city', label: string) => (
    <div>
      <label htmlFor={`bs-${key}`} className={labelText}>{label}</label>
      <input id={`bs-${key}`} className={field} value={d[key]} onChange={e => set({ [key]: e.target.value })} />
    </div>
  );
  const save = (publish: boolean) => a.run(async () => {
    const { id } = await api('POST', '', payload(d));
    if (publish) {
      try { await api('POST', `/${id}/publish`, { acceptedOrganizerTerms: ORGANIZER_TERMS_VERSION }); }
      catch (e: any) { onDone(); throw new Error(`Saved as a draft. ${e.message}`); }
    }
    onDone();
  });
  return (
    <div className="space-y-4">
      <div className={card}>
        <h2 className={`${heading} mb-3`}>The show</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {text('title', 'Show title')}{text('artistName', 'Artist')}{text('organizerName', 'Who is putting on the show (person or company)')}
          <div>
            <label htmlFor="bs-role" className={labelText}>Their role</label>
            <select id="bs-role" className={field} value={d.organizerRole} onChange={e => set({ organizerRole: e.target.value as OrganizerRole })}>
              {Object.entries(ORGANIZER_ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {text('venue', 'Venue')}{text('city', 'City')}
          <div className="sm:col-span-2">
            <label htmlFor="bs-desc" className={labelText}>About the show</label>
            <textarea id="bs-desc" rows={3} className={field} value={d.description} onChange={e => set({ description: e.target.value })} />
          </div>
          <div>
            <label htmlFor="bs-show" className={labelText}>Show date</label>
            <input id="bs-show" type="date" className={field} value={d.showDate} onChange={e => set({ showDate: e.target.value })} />
          </div>
          <div>
            <label htmlFor="bs-tickets" className={labelText}>Ticket link (optional)</label>
            <input id="bs-tickets" type="url" className={field} placeholder="https://" value={d.ticketUrl} onChange={e => set({ ticketUrl: e.target.value })} />
          </div>
        </div>
        <p className="mt-2 text-xs text-white/50">Fans buy tickets separately. Add the link and it appears on your sponsor page.</p>
      </div>
      <div className={card}>
        <h2 className={heading}>Sponsorship packages</h2>
        <p className={`${muted} mt-1 mb-3`}>Sponsors pay when they buy, and the money goes to your Stripe account. Plajah keeps 5%, and Stripe charges its own fee. Sponsorships carry no share of revenue.</p>
        <div className="space-y-3">
          {d.tiers.map((t, i) => {
            const up = (patch: Partial<typeof t>) => set({ tiers: d.tiers.map((x, n) => (n === i ? { ...x, ...patch } : x)) });
            return (
              <div key={t.id} className="rounded-xl bg-black/20 p-3">
                <div className="grid gap-2 sm:grid-cols-[8rem_1fr_6rem_6rem_auto]">
                  <select aria-label="Type" className={field} value={t.kind} onChange={e => up({ kind: e.target.value as TierKind })}>
                    {Object.entries(KIND_TEXT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <input aria-label="Name" className={field} placeholder="Name" value={t.name} onChange={e => up({ name: e.target.value })} />
                  <input aria-label="Price in dollars" className={field} inputMode="decimal" placeholder="$" value={t.price} onChange={e => up({ price: e.target.value })} />
                  <input aria-label="Limit" className={field} inputMode="numeric" placeholder="Limit" value={t.limit} onChange={e => up({ limit: e.target.value })} />
                  <button className={quiet} aria-label={`Remove ${t.name}`} onClick={() => set({ tiers: d.tiers.filter((_, n) => n !== i) })}><Trash2 size={14} /></button>
                </div>
                <input aria-label="What they get" className={`${field} mt-2`} placeholder="What they get" value={t.description} onChange={e => up({ description: e.target.value })} />
                <input aria-label="If the show is cancelled" className={`${field} mt-2`} placeholder="If the show is cancelled (for example: full refund within 14 days)" value={t.cancellationTerms} onChange={e => up({ cancellationTerms: e.target.value })} />
              </div>
            );
          })}
          <button className={quiet} onClick={() => set({ tiers: [...d.tiers, { id: `t${Date.now().toString(36)}`, kind: 'ad', name: '', description: '', cancellationTerms: '', price: '', limit: '' }] })}><Plus size={14} /> Add a package</button>
        </div>
      </div>
      <label className="flex items-start gap-2 text-xs text-white/70">
        <input type="checkbox" className="mt-0.5" checked={responsible} onChange={e => setResponsible(e.target.checked)} />
        <span>{ORGANIZER_TERMS}</span>
      </label>
      <Notice error={a.error} />
      <div className="flex flex-wrap justify-end gap-2">
        <button className={quiet} onClick={onCancel}>Cancel</button>
        <button className={quiet} disabled={a.busy} onClick={() => save(false)}>Save draft</button>
        <button className={primary} disabled={a.busy || !responsible} onClick={() => save(true)}>Publish</button>
      </div>
      <p className="text-right text-xs text-white/50">Publishing locks the terms and adds them to the public record.</p>
    </div>
  );
};

const STEP_TEXT: Record<string, string> = {
  venue: 'Step 1 of 4: add the venue', contract: 'Step 2 of 4: post the signed contract', artist_verify: 'Step 3 of 4: verify the contract',
  venue_verify: 'Step 4 of 4: the venue verifies it', confirmed: 'Contract verified by both sides',
};
const emptyVenue = { name: '', street: '', city: '', region: '', postalCode: '', country: 'United States', contactName: '', email: '', lat: '', lng: '', phones: [{ label: 'Booking', number: '' }] };

const VenueForm: React.FC<{ id: string; b: any; reload: () => void }> = ({ id, b, reload }) => {
  const [v, setV] = useState<typeof emptyVenue>(() => ({ ...emptyVenue, ...(b.venue || {}), lat: String(b.venue?.lat ?? ''), lng: String(b.venue?.lng ?? '') }));
  const a = useAction(reload);
  const text = (key: 'name' | 'street' | 'city' | 'region' | 'postalCode' | 'country' | 'contactName' | 'email' | 'lat' | 'lng', label: string, wide = false) => (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <label htmlFor={`${id}-${key}`} className={labelText}>{label}</label>
      <input id={`${id}-${key}`} className={field} value={v[key]} onChange={e => setV(x => ({ ...x, [key]: e.target.value }))} />
    </div>
  );
  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2">
        {text('name', 'Venue name', true)}{text('street', 'Street address', true)}{text('city', 'City')}{text('region', 'State or region')}{text('postalCode', 'ZIP or postal code')}{text('country', 'Country')}
        {text('lat', 'Latitude (optional)')}{text('lng', 'Longitude (optional)')}{text('contactName', 'Contact person')}{text('email', 'Contact email (optional)')}
      </div>
      <h4 className="mt-3 mb-1 text-xs font-bold text-white/60">Contact numbers</h4>
      <div className="space-y-2">
        {v.phones.map((p, i) => {
          const up = (patch: Partial<typeof p>) => setV(x => ({ ...x, phones: x.phones.map((y, n) => (n === i ? { ...y, ...patch } : y)) }));
          return (
            <div key={i} className="flex gap-2">
              <input aria-label="Number label" className={`${field} w-28`} placeholder="Label" value={p.label} onChange={e => up({ label: e.target.value })} />
              <input aria-label="Phone number" className={`${field} flex-1`} type="tel" placeholder="Phone" value={p.number} onChange={e => up({ number: e.target.value })} />
              {v.phones.length > 1 && <button className={quiet} aria-label="Remove number" onClick={() => setV(x => ({ ...x, phones: x.phones.filter((_, n) => n !== i) }))}><Trash2 size={14} /></button>}
            </div>
          );
        })}
        {v.phones.length < 5 && <button className={quiet} onClick={() => setV(x => ({ ...x, phones: [...x.phones, { label: '', number: '' }] }))}><Plus size={14} /> Add a number</button>}
      </div>
      <p className="mt-2 text-xs text-white/50">Plajah keeps these venue details on record. They aren't shown publicly, except the venue's name and address.</p>
      <button className={`${primary} mt-2`} disabled={a.busy} onClick={() => a.run(() => api('PUT', `/${id}/venue`, v))}>Save venue</button>
      <div className="mt-2"><Notice error={a.error} /></div>
    </div>
  );
};

const VenuePanel: React.FC<{ c: any; reload: () => void }> = ({ c, reload }) => {
  const b = c.booking || { step: 'venue' };
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [link, setLink] = useState('');
  const a = useAction(reload);
  const upload = (file?: File) => {
    if (!file) return;
    a.run(async () => {
      if (file.size > MAX_CONTRACT_BYTES) throw new Error('The contract must be under 15 MB.');
      const token = await backShowToken();
      const res = await fetch(`/api/back-show/${c.id}/contract?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': 'application/pdf', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: file });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'The contract didn’t upload. Try again.');
    });
  };
  const closed = !['draft', 'live'].includes(c.status);
  if (closed && b.step !== 'confirmed') return null;
  const showVenueForm = b.step === 'venue' || editing;
  return (
    <section aria-label="Venue contract" className="mt-3 rounded-xl bg-black/20 p-3">
      <h4 className="text-xs font-bold text-white/70">{STEP_TEXT[b.step]}</h4>
      {b.step !== 'confirmed' && <p className="mt-1 text-xs text-white/50">Sponsorships can’t go on sale until this is done. Plajah only records that your agreement exists: it isn’t a party to it and doesn’t review it.</p>}
      {b.venue && !editing && (
        <p className="mt-2 text-sm text-white/80">{b.venue.name}, {b.venue.street}, {b.venue.city}, {b.venue.region} {b.venue.postalCode}
          {b.step !== 'confirmed' && <button className="ml-2 text-xs font-semibold text-[#FFB866] underline" onClick={() => setEditing(true)}>Change</button>}
        </p>
      )}
      {showVenueForm && <div className="mt-2"><VenueForm id={c.id} b={b} reload={() => { setEditing(false); reload(); }} /></div>}
      {!showVenueForm && b.contract && (
        <p className="mt-1 text-xs text-white/50">
          Contract: <button className="font-semibold text-[#FFB866] underline" onClick={() => a.run(() => saveContractFile(`/${c.id}/contract`, b.contract.fileName))}>{b.contract.fileName}</button>
          {b.artistVerification && <>. You verified it as {b.artistVerification.name}</>}{b.venueVerification && <>. {b.venueVerification.name}, {b.venueVerification.title}, verified it for the venue</>}.
        </p>
      )}
      {!showVenueForm && b.step !== 'confirmed' && (
        <div className="mt-2">
          <label htmlFor={`${c.id}-pdf`} className={labelText}>{b.contract ? 'Replace the contract (PDF). Both sides verify again.' : 'Signed venue contract (PDF)'}</label>
          <input id={`${c.id}-pdf`} type="file" accept="application/pdf" disabled={a.busy} className="block w-full text-xs text-white/70" onChange={e => { upload(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      )}
      {!showVenueForm && b.step === 'artist_verify' && (
        <div className="mt-3 space-y-2">
          <div>
            <label htmlFor={`${c.id}-sig`} className={labelText}>Type your full legal name</label>
            <input id={`${c.id}-sig`} className={field} value={name} onChange={e => setName(e.target.value)} />
          </div>
          <label className="flex items-start gap-2 text-xs text-white/70">
            <input type="checkbox" className="mt-0.5" checked={agree} onChange={e => setAgree(e.target.checked)} />
            <span>This is the signed agreement between me and this venue for this show.</span>
          </label>
          <button className={primary} disabled={a.busy || !name.trim() || !agree} onClick={() => a.run(() => api('POST', `/${c.id}/contract/verify`, { name, agree, contractHash: b.contract.hash }))}>Verify contract</button>
        </div>
      )}
      {!showVenueForm && b.step === 'venue_verify' && (
        <div className="mt-3 space-y-2">
          <button className={primary} disabled={a.busy} onClick={() => a.run(async () => setLink((await api('POST', `/${c.id}/contract/verify-link`)).url))}>{b.hasVerifyLink ? 'Make a new link for the venue' : 'Make a link for the venue'}</button>
          {b.hasVerifyLink && !link && <p className="text-xs text-white/50">A new link replaces the one you already sent.</p>}
          {link && (
            <div>
              <label htmlFor={`${c.id}-link`} className={labelText}>Send this private link to the venue. It works for 30 days and won’t be shown again.</label>
              <input id={`${c.id}-link`} readOnly className={field} value={link} onFocus={e => e.target.select()} />
            </div>
          )}
        </div>
      )}
      <div className="mt-2"><Notice error={a.error} /></div>
    </section>
  );
};

const SponsorTable: React.FC<{ showId: string; rows: any[]; reload: () => void }> = ({ showId, rows, reload }) => {
  const a = useAction(reload);
  if (!rows.length) return <p className={`${muted} mt-3`}>No sponsors yet.</p>;
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[30rem] text-sm">
        <thead><tr className="text-left text-xs text-white/50"><th scope="col" className="py-1 pr-2 font-semibold">Name</th><th scope="col" className="py-1 pr-2 font-semibold">Package</th><th scope="col" className="py-1 pr-2 text-right font-semibold">Amount</th><th scope="col" className="py-1 pr-2 font-semibold">Status</th><th scope="col" className="py-1 font-semibold"><span className="sr-only">Refund</span></th></tr></thead>
        <tbody>{rows.map(b => (
          <tr key={b.id} className="border-t border-white/[0.06] text-white/80">
            <td className="py-1.5 pr-2">{b.publicName}</td><td className="py-1.5 pr-2">{b.tier}</td><td className="py-1.5 pr-2 text-right tabular-nums">{money(b.amountCents)}</td><td className="py-1.5 pr-2 capitalize">{b.status}</td>
            <td className="py-1.5 text-right">{b.status === 'paid' && <button className="text-xs font-semibold text-[#FFB866] underline disabled:opacity-40" disabled={a.busy} onClick={() => { if (window.confirm(`Refund ${money(b.amountCents)} to ${b.publicName} from your Stripe balance?`)) a.run(() => api('POST', `/${showId}/sponsorships/${b.id}/refund`, {})); }}>Refund</button>}</td>
          </tr>
        ))}</tbody>
      </table>
      <div className="mt-2"><Notice error={a.error} /></div>
    </div>
  );
};

const CampaignRow: React.FC<{ c: any; reload: () => void }> = ({ c, reload }) => {
  const [sponsors, setSponsors] = useState<any[] | null>(null);
  const a = useAction(reload);
  const canCancel = ['draft', 'live'].includes(c.status);
  const loadSponsors = () => a.run(async () => setSponsors((await api('GET', `/${c.id}/sponsors`)).sponsors));
  return (
    <article className={card}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-white">{c.title || 'Untitled show'}</h3>
          <p className="text-xs text-white/50">{STATUS_TEXT[c.status]}{c.showDate ? `, show on ${dateText(c.showDate)}` : ''}</p>
        </div>
        {c.status !== 'draft' && <a className={quiet} href={`/back/${c.id}`}><ExternalLink size={14} /> Public page</a>}
      </div>
      {c.status !== 'draft' && <p className="mt-3 text-sm text-white/80"><b className="text-white">{money(c.sponsoredCents || 0)}</b> in sponsorships</p>}
      <VenuePanel c={c} reload={reload} />
      <div className="mt-3 flex flex-wrap gap-2">
        {c.status === 'draft' && <button className={primary} disabled={a.busy} onClick={() => { if (window.confirm(ORGANIZER_TERMS)) a.run(() => api('POST', `/${c.id}/publish`, { acceptedOrganizerTerms: ORGANIZER_TERMS_VERSION }), 'Published.'); }}>Publish</button>}
        {c.status !== 'draft' && <button className={quiet} disabled={a.busy} onClick={loadSponsors}>Sponsors</button>}
        {canCancel && <button className={quiet} disabled={a.busy} onClick={() => { if (window.confirm(c.status === 'draft' ? 'Delete this draft?' : 'Cancel this show? Sales stop and it goes on the public record. You handle refunds under each package’s cancellation terms.')) a.run(() => api('POST', `/${c.id}/cancel`, {})); }}>{c.status === 'draft' ? 'Delete draft' : 'Cancel show'}</button>}
      </div>
      <div className="mt-2"><Notice error={a.error} ok={a.ok} /></div>
      {sponsors && <SponsorTable showId={c.id} rows={sponsors} reload={() => { reload(); loadSponsors(); }} />}
    </article>
  );
};

const SellerPanel: React.FC = () => {
  const [s, setS] = useState<{ hasAccount: boolean; ready: boolean } | null>(null);
  const a = useAction();
  useEffect(() => { api('GET', '/seller').then(setS).catch(() => setS(null)); }, []);
  if (!s || s.ready) return null;
  return (
    <section className={card} aria-label="Your Stripe account">
      <h2 className={heading}>Set up your Stripe account</h2>
      <p className={`${muted} mt-1`}>You’re the seller, so sponsors pay you directly. Stripe checks your details and you manage payouts, refunds and disputes in your own Stripe dashboard.</p>
      <button className={`${primary} mt-3`} disabled={a.busy} onClick={() => a.run(async () => {
        const { url } = await api('POST', '/seller', { returnTo: window.location.pathname + window.location.search });
        window.location.assign(url);
      })}>{s.hasAccount ? 'Finish setup with Stripe' : 'Set up with Stripe'}</button>
      <div className="mt-2"><Notice error={a.error} /></div>
    </section>
  );
};

export const BackShowDesk: React.FC = () => {
  const [rows, setRows] = useState<any[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    api('GET', '/mine').then(r => setRows(r.campaigns)).catch(e => { setError(e.message); setRows([]); });
  }, []);
  useEffect(load, [load]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white">Sponsor This Show</h1>
          <p className={muted}>Sell sponsorships, hosting and ad placements for your show, with the venue contract on record.</p>
        </div>
        {!creating && <button className={primary} onClick={() => setCreating(true)}><Plus size={15} /> New show</button>}
      </div>
      <Notice error={error} />
      <SellerPanel />
      {creating ? <CampaignForm onCancel={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} /> : (
        <>
          {!rows && <p className={muted}>Loading…</p>}
          {rows && !rows.length && !error && <p className={muted}>No shows yet. Start one to put your next concert in front of sponsors.</p>}
          <div className="grid gap-4 lg:grid-cols-2">{rows?.map(c => <CampaignRow key={c.id} c={c} reload={load} />)}</div>
        </>
      )}
    </div>
  );
};

// ── Public page ──────────────────────────────────────────────────────────────

const webSha256 = async (text: string) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
};

const RECORD_TEXT: Record<string, string> = {
  published: 'Terms published', contract_verified: 'Venue contract verified by both sides', sponsored: 'Sponsorship sold', refunded: 'Sponsorship refunded', cancelled: 'Show cancelled', completed: 'Show completed',
};
const recordAmount = (e: RecordEntry) => {
  const d = e.data as any;
  const cents = d.amountCents ?? d.sponsoredCents;
  return typeof cents === 'number' ? money(cents) : '';
};

const RecordPanel: React.FC<{ id: string }> = ({ id }) => {
  const [data, setData] = useState<{ entries: RecordEntry[]; anchors: any[] } | null>(null);
  const [check, setCheck] = useState<RecordCheck | null>(null);
  const a = useAction();
  const load = () => a.run(async () => {
    const r = await api('GET', `/${id}/record`);
    setData(r);
    setCheck(await verifyRecord(r.entries, webSha256));
  });
  const download = (digest: string, proof: string, seq: number, n: number) => {
    const bytes = Uint8Array.from(atob(proof), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([otsProofFile(digest, bytes) as BlobPart], { type: 'application/octet-stream' }));
    const link = document.createElement('a');
    link.href = url; link.download = `sponsor-this-show-${id}-${seq}-${n + 1}.ots`; link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className={card} aria-label="Public record">
      <h2 className={`${heading} flex items-center gap-2`}><ShieldCheck size={15} className="text-[#FFB866]" /> Public record</h2>
      <p className={`${muted} mt-1`}>The terms, the venue contract's fingerprint and every sponsorship. Each entry locks in the one before it, and the chain is regularly timestamped on Bitcoin.</p>
      {!data && <button className={`${quiet} mt-3`} disabled={a.busy} onClick={load}>Check the record</button>}
      <div className="mt-2"><Notice error={a.error} /></div>
      {check && <div className="mt-3"><Notice ok={check.ok ? `Your browser re-checked all ${check.length} entries. None has been changed or removed.` : undefined} error={check.ok ? undefined : check.problem} /></div>}
      {data && (
        <>
          <ol className="mt-3 divide-y divide-white/[0.06]">
            {data.entries.map(e => (
              <li key={e.seq} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                <span className="text-white/80">{RECORD_TEXT[e.type] || e.type}{(e.data as any).name ? `: ${(e.data as any).name}` : ''}</span>
                <span className="flex items-baseline gap-3"><span className="tabular-nums text-white">{recordAmount(e)}</span><span className="text-xs text-white/40">{new Date(e.at).toLocaleDateString()}</span></span>
              </li>
            ))}
          </ol>
          {!!data.anchors.length && (
            <div className="mt-3">
              <h3 className="text-xs font-bold text-white/60">Bitcoin timestamp proofs</h3>
              <p className="mt-1 text-xs text-white/50">Check these yourself with the free OpenTimestamps tool. A new proof can take several hours to reach Bitcoin.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.anchors.flatMap(x => x.receipts.map((r: any, n: number) => (
                  <button key={`${x.seq}-${n}`} className={quiet} onClick={() => download(x.digest, r.proof, x.seq, n)}><Download size={14} /> Entry {x.seq}{x.receipts.length > 1 ? `, copy ${n + 1}` : ''}</button>
                )))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
};

const TierCard: React.FC<{ id: string; t: BackTier; open: boolean; signedIn: boolean; onSignIn?: () => void }> = ({ id, t, open, signedIn, onSignIn }) => {
  const [choosing, setChoosing] = useState(false);
  const [publicName, setPublicName] = useState('');
  const [website, setWebsite] = useState('');
  const [accepted, setAccepted] = useState(false);
  const a = useAction();
  const left = t.limit !== undefined ? t.limit - (t.sold || 0) : null;
  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs font-semibold text-[#FFB866]">{KIND_TEXT[t.kind]}</span>
          <h3 className="text-sm font-bold text-white">{t.name}</h3>
        </div>
        <span className="text-base font-bold tabular-nums text-white">{money(t.priceCents)}</span>
      </div>
      <p className={`${muted} mt-1`}>{t.description}</p>
      <p className="mt-1 text-xs text-white/50">If the show is cancelled: {t.cancellationTerms}</p>
      {left !== null && <p className="mt-1 text-xs text-white/50">{left > 0 ? `${left} left` : 'Sold out'}</p>}
      {open && left !== 0 && !choosing && (
        <button className={`${primary} mt-3`} onClick={() => (signedIn ? setChoosing(true) : onSignIn?.())}>{signedIn ? 'Sponsor' : 'Sign in to sponsor'}</button>
      )}
      {choosing && (
        <div className="mt-3 space-y-2">
          <div>
            <label htmlFor={`name-${t.id}`} className={labelText}>Name to display</label>
            <input id={`name-${t.id}`} className={field} value={publicName} onChange={e => setPublicName(e.target.value)} />
          </div>
          <div>
            <label htmlFor={`web-${t.id}`} className={labelText}>Website (optional)</label>
            <input id={`web-${t.id}`} type="url" className={field} placeholder="https://" value={website} onChange={e => setWebsite(e.target.value)} />
          </div>
          <label className="flex items-start gap-2 text-xs text-white/70">
            <input type="checkbox" className="mt-0.5" checked={accepted} onChange={e => setAccepted(e.target.checked)} />
            <span>{SPONSOR_TERMS}</span>
          </label>
          <div className="flex gap-2">
            <button className={quiet} onClick={() => setChoosing(false)}>Back</button>
            <button className={primary} disabled={a.busy || !accepted} onClick={() => a.run(async () => {
              const { url } = await api('POST', `/${id}/sponsorships`, { tierId: t.id, publicName, website, acceptedTerms: TERMS_VERSION });
              window.location.assign(url);
            })}>Pay {money(t.priceCents)}</button>
          </div>
          <Notice error={a.error} />
        </div>
      )}
    </div>
  );
};

/** /back/verify/<token>: where the venue verifies the contract. No Plajah account needed. */
const VenueVerifyPage: React.FC<{ token: string }> = ({ token }) => {
  const [s, setS] = useState<any>(null);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [agree, setAgree] = useState(false);
  const [opened, setOpened] = useState(false);
  const load = useCallback(() => { api('GET', `/verify/${token}`).then(setS).catch(e => setLoadError(e.message)); }, [token]);
  useEffect(load, [load]);
  const a = useAction(load);
  if (!s) return <div className="mx-auto max-w-xl p-6">{loadError ? <Notice error={loadError} /> : <p className={muted}>Loading…</p>}</div>;
  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 text-white sm:p-6">
      <header>
        <p className="text-xs font-semibold text-[#FFB866]">Venue contract</p>
        <h1 className="mt-1 text-2xl font-bold">{s.title}</h1>
        <p className="text-sm text-white/70">{s.artistName} at {s.venue.name}, {s.venue.street}, {s.venue.city}, {s.venue.region}, {dateText(s.showDate)}</p>
      </header>
      <section className={card}>
        <button className={quiet} disabled={a.busy} onClick={() => a.run(async () => { await saveContractFile(`/verify/${token}/contract`, s.contract.fileName); setOpened(true); })}><Download size={14} /> Open {s.contract.fileName}</button>
        {s.artistVerification && <p className="mt-2 text-xs text-white/50">{s.artistVerification.name} verified it for the organizer on {dateText(s.artistVerification.at)}.</p>}
      </section>
      {s.venueVerification ? <Notice ok={`${s.venueVerification.name} verified this for the venue on ${dateText(s.venueVerification.at)}.`} /> : (
        <section className={`${card} space-y-3`} aria-label="Verify for the venue">
          <h2 className={heading}>Verify for {s.venue.name}</h2>
          <p className={muted}>Plajah only records that this agreement exists. It isn't a party to it and doesn't review it.</p>
          <div>
            <label htmlFor="vs-name" className={labelText}>Your full legal name</label>
            <input id="vs-name" className={field} value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="vs-title" className={labelText}>Your title at the venue</label>
            <input id="vs-title" className={field} value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <label className="flex items-start gap-2 text-xs text-white/70">
            <input type="checkbox" className="mt-0.5" checked={agree} onChange={e => setAgree(e.target.checked)} />
            <span>I can speak for this venue, and this is the signed agreement between the venue and this organizer for this show.</span>
          </label>
          <button className={primary} disabled={a.busy || !opened || !name.trim() || !title.trim() || !agree} onClick={() => a.run(() => api('POST', `/verify/${token}`, { name, title, agree, contractHash: s.contract.hash }))}>Verify contract</button>
          {!opened && <p className="text-xs text-white/50">Open the contract before verifying.</p>}
        </section>
      )}
      <Notice error={a.error} />
    </div>
  );
};

export const BackShowPage: React.FC<{ id: string; signedIn?: boolean; onSignIn?: () => void }> = ({ id, ...rest }) => (
  id === 'verify' ? <VenueVerifyPage token={window.location.pathname.split('/')[3] || ''} /> : <ShowPage id={id} {...rest} />
);

const ShowPage: React.FC<{ id: string; signedIn?: boolean; onSignIn?: () => void }> = ({ id, signedIn = false, onSignIn }) => {
  const [c, setC] = useState<any>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    (async () => {
      try {
        // Returning from Stripe: the sponsorship counts once the server confirms the payment.
        const q = new URLSearchParams(window.location.search);
        const sponsorship = q.get('sponsorship');
        if (sponsorship) {
          try {
            await api('POST', `/${id}/sponsorships/${sponsorship}/confirm`);
            setNote('Thank you. Your sponsorship is paid, and your name is on this page.');
          } catch (e: any) { setError(e.message); }
          window.history.replaceState({}, '', window.location.pathname);
        }
        setC((await api('GET', `/${id}`)).campaign);
      } catch (e: any) { setError(e.message); }
    })();
  }, [id]);

  if (!c) return <div className="mx-auto max-w-3xl p-6">{error ? <Notice error={error} /> : <p className={muted}>Loading…</p>}</div>;
  const open = c.status === 'live' && !!c.contractVerified && c.showDate > Date.now();
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 text-white sm:p-6">
      <header>
        <p className="text-xs font-semibold text-[#FFB866]">{STATUS_TEXT[c.status]}</p>
        <h1 className="mt-1 text-2xl font-bold">{c.title}</h1>
        <p className="text-sm text-white/70">{c.artistName}, {c.venue}, {c.city}, {dateText(c.showDate)}</p>
        <p className="mt-1 text-xs text-white/50">Put on by {c.organizerName}, who sells these sponsorships and is financially responsible for the venue and the show. Plajah provides the platform. It doesn't fund, organize or guarantee this show.</p>
        {c.ticketUrl && <a className={`${quiet} mt-3`} href={c.ticketUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Get tickets</a>}
      </header>
      <Notice ok={note} error={error} />
      {c.description && <p className="whitespace-pre-line text-sm text-white/80">{c.description}</p>}
      <section className={card} aria-label="Venue">
        <h2 className={heading}>Venue</h2>
        {c.contractVerified
          ? <div className="mt-2"><Notice ok={`The organizer and ${c.contractVerified.name}, ${c.contractVerified.street}, ${c.contractVerified.city}, ${c.contractVerified.region}, have each verified their contract. Plajah recorded this and doesn't review the contract.`} /></div>
          : <p className={`${muted} mt-1`}>The organizer and venue haven’t both verified a contract yet. Sponsorships go on sale once they have.</p>}
      </section>
      <section aria-label="Sponsorship packages" className="grid gap-3 sm:grid-cols-2">
        {c.tiers.map((t: BackTier) => <TierCard key={t.id} id={id} t={t} open={open} signedIn={signedIn} onSignIn={onSignIn} />)}
      </section>
      {!!c.sponsors.length && (
        <section className={card}>
          <h2 className={`${heading} mb-2`}>Sponsors</h2>
          <ul className="space-y-1 text-sm text-white/80">{c.sponsors.map((x: any, i: number) => <li key={i}><b className="text-white">{x.name}</b>, {x.tier}</li>)}</ul>
        </section>
      )}
      <RecordPanel id={id} />
    </div>
  );
};
