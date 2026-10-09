/**
 * EviteGuestPage — what a guest sees at /i/:id. No account, no app, any phone browser.
 *
 * The living card (EviteStage) on top, then everything a guest needs in one scroll: reply (Going / Maybe / Can't),
 * party size, the host's questions, what to bring, when + where (address held back until "yes" when the host asked),
 * calendar + maps, gifts (Stripe with guest-covers-fee, Cash App / Zelle / Venmo / PayPal links), who's coming, notes,
 * sharing (link, QR, apps), tickets when the invite is tied to a ticketed event, and a gentle "make your own" at the end.
 *
 * Everything goes through the small EviteGuestApi so the page can run against a demo API in previews and tests.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type EviteStageHandle } from './EviteStage';
import EviteCard, { whenLines } from './EviteCard';
import EvitePlayGate from './EvitePlayGate';
import { playFor } from '../../services/evite/playGames';
import { eraIdOf } from '../../services/evite/eraIds';
import { httpGuestApi, personalLink, type EviteGuestApi, type GuestMe } from '../../services/evite/eviteClient';
import { plateUrls, isLightPlate } from '../../services/evite/plateCatalog';
import { recipeFor } from '../../services/evite/motionRecipes';
import { googleCalendarUrl, outlookCalendarUrl, mapLinks, shareTargets, cashAppUrl, venmoUrl, paypalMeUrl } from '../../services/evite/eviteCore';
import { grossUpCents } from '../../services/giftFees';
import type { EvitePublicView } from '../../services/evite/eviteTypes';

const FONTS = 'https://fonts.googleapis.com/css2?family=Outfit:ital,wght@0,600;0,800;1,900&family=Inter:wght@400;500;600;700;800&family=Cormorant+Garamond:ital,wght@1,500;1,600&family=Fredoka:wght@600;700&display=swap';
const money = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;

export default function EviteGuestPage({ id, api = httpGuestApi }: { id: string; api?: EviteGuestApi }) {
  const [invite, setInvite] = useState<EvitePublicView | null>(null);
  const [me, setMe] = useState<GuestMe | null>(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);
  // Kids invites open with a short game (or a scratch-off). A parent can skip with one tap; the host can turn it off.
  const [played, setPlayed] = useState(false);
  // Design-era invites draw their plate in the browser (services/evite/eraArt.ts); the same art backs the page.
  const [eraBg, setEraBg] = useState<{ plate: string; light: boolean; foil: string } | null>(null);
  const eraId = eraIdOf(invite?.templateId);
  useEffect(() => {
    if (!eraId) { setEraBg(null); return; }
    let live = true;
    import('../../services/evite/eraArt').then(m => m.eraArt(eraId, { showLaw: invite?.look.showLaw })).then(a => { if (live) setEraBg({ plate: a.plate, light: a.light, foil: a.foil }); }).catch(() => {});
    return () => { live = false; };
  }, [eraId, invite?.look.showLaw]);
  const stage = useRef<EviteStageHandle>(null);
  const rsvpRef = useRef<HTMLDivElement>(null);
  const giftRef = useRef<HTMLDivElement>(null);
  const giftThanks = typeof location !== 'undefined' && new URLSearchParams(location.search).get('gift') === 'thanks';

  useEffect(() => {
    if (!document.querySelector(`link[href="${FONTS}"]`)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = FONTS; document.head.appendChild(l); }
    api.load(id).then(r => { setInvite(r.invite); setMe(r.me); document.title = `${r.invite.fields.headline} · Plajah`; }).catch(e => setErr(e.message || 'This invitation isn’t available.'));
  }, [id, api]);
  useEffect(() => { if (giftThanks && invite) setTimeout(() => stage.current?.celebrate(), 2200); }, [giftThanks, invite]);

  if (err) return <Shell><div className="eg-card" style={{ marginTop: 40, textAlign: 'center' }}><h1 className="eg-h">Hmm.</h1><p>{err}</p><a className="eg-btn" href="/">Go to Plajah</a></div></Shell>;
  if (!invite) return <Shell><div className="eg-skel" aria-label="Loading invitation" /></Shell>;

  const urls = plateUrls(invite.templateId) || (invite.art ? { plate: invite.art.plate, depth: invite.art.depth, collection: invite.art.preset, subject: 'custom' } as any : null);
  const recipe = urls ? recipeFor(urls.collection, urls.subject) : null;
  const accent = invite.look.accent || recipe?.foil.color || eraBg?.foil || '#FF8C00';
  const w = whenLines(invite.fields);
  const origin = typeof location !== 'undefined' ? location.origin : 'https://plajah.com';
  const link = `${origin}/i/${invite.id}`;
  const answered = !!me && !editing;
  const play = urls && !invite.settings.skipPlay && invite.status !== 'cancelled' && !giftThanks ? playFor(urls.collection, urls.subject) : null;
  const gated = !!play && !played;
  const openCard = (won: boolean) => { setPlayed(true); stage.current?.replay(); if (won) setTimeout(() => stage.current?.celebrate(), 120); };
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const goScroll = (r: React.RefObject<HTMLDivElement | null>) => r.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <Shell accent={accent} backdrop={urls?.plate || eraBg?.plate} light={eraId ? !!eraBg?.light : invite.art ? !!invite.art.light : isLightPlate(invite.templateId)}>
      {giftThanks && <div className="eg-banner" role="status">Thank you. Your gift is on its way to {invite.hostName || 'the host'}.</div>}
      {(invite.status === 'cancelled') && <div className="eg-banner warn" role="status">The host cancelled this event.</div>}

      {urls || eraId
        ? <EviteCard ref={stage} plateId={invite.templateId} art={invite.art} fields={invite.fields} accent={invite.look.accent} showLaw={invite.look.showLaw} ctaLabel={answered ? 'Change my reply' : 'RSVP'} onCta={() => goScroll(rsvpRef)}
            hideText={gated} overlay={gated && play ? <EvitePlayGate spec={play} accent={accent} reducedMotion={reduced} onWin={() => openCard(true)} onSkip={() => openCard(false)} /> : null} />
        : <div className="eg-card"><h1 className="eg-h">{invite.fields.headline}</h1></div>}

      {gated ? <p className="eg-host">Play to open your invitation. Grown-ups can tap <b>Skip</b>.</p> : <>
      {invite.hostName && <p className="eg-host">Hosted by <b>{invite.hostName}</b></p>}
      {invite.fields.message && <div className="eg-card eg-message">{invite.fields.message}</div>}

      <section className="eg-card" aria-labelledby="eg-when">
        <h2 id="eg-when" className="eg-h2">When &amp; where</h2>
        <div className="eg-row"><span className="eg-k">Date</span><span>{w.date}, {w.year}</span></div>
        <div className="eg-row"><span className="eg-k">Time</span><span>{w.time}</span></div>
        {invite.fields.venueName && <div className="eg-row"><span className="eg-k">Place</span><span>{invite.fields.venueName}</span></div>}
        {invite.fields.address ? <div className="eg-row"><span className="eg-k">Address</span><span>{invite.fields.address}</span></div>
          : invite.fields.addressHidden ? <p className="eg-note">The host shares the address with guests who reply “Going”.</p> : null}
        <div className="eg-actions">
          <a className="eg-chip" href={api.icsUrl(invite.id)}>Add to calendar</a>
          <a className="eg-chip" href={googleCalendarUrl({ ...invite.fields, address: invite.fields.address || '' } as any, link)} target="_blank" rel="noreferrer">Google</a>
          <a className="eg-chip" href={outlookCalendarUrl({ ...invite.fields, address: invite.fields.address || '' } as any, link)} target="_blank" rel="noreferrer">Outlook</a>
          {(invite.fields.address || invite.fields.venueName) && !invite.fields.addressHidden && <>
            <a className="eg-chip" href={mapLinks({ venueName: invite.fields.venueName, address: invite.fields.address || '' }).google} target="_blank" rel="noreferrer">Directions</a>
            <a className="eg-chip" href={mapLinks({ venueName: invite.fields.venueName, address: invite.fields.address || '' }).apple} target="_blank" rel="noreferrer">Apple Maps</a>
          </>}
        </div>
      </section>

      {invite.eventId && <section className="eg-card"><h2 className="eg-h2">Tickets</h2><p className="eg-note">This invitation is part of a ticketed event.</p><a className="eg-btn" href={`/event/${encodeURIComponent(invite.eventId)}`}>Get tickets</a></section>}

      <div ref={rsvpRef} />
      {answered
        ? <Answered invite={invite} me={me!} accent={accent} onEdit={() => setEditing(true)} onGift={() => goScroll(giftRef)} origin={origin} />
        : <RsvpForm invite={invite} me={me} api={api} onDone={(r) => { setInvite(r.invite); setMe(r.me); setEditing(false); if (r.status === 'yes') stage.current?.celebrate(); setTimeout(() => goScroll(rsvpRef), 50); }} />}

      {invite.gifts?.enabled && <div ref={giftRef}><Gifts invite={invite} api={api} prominent={me?.status === 'no'} /></div>}

      {invite.clubId && me && me.status !== 'no' && (
        <section className="eg-card"><h2 className="eg-h2">The event room</h2><p className="eg-note">Chat with other guests, share plans and photos. It needs a free Plajah account.</p><a className="eg-btn ghost" href={invite.clubInvite ? `/clubs/${encodeURIComponent(invite.clubId)}?invite=${encodeURIComponent(invite.clubInvite)}` : `/?club=${encodeURIComponent(invite.clubId)}`}>Open the event room</a></section>
      )}
      {invite.photoPoolId && me && me.status !== 'no' && (
        <section className="eg-card"><h2 className="eg-h2">Photos from the event</h2><p className="eg-note">One shared album for everyone who came. You choose which of your photos and videos go public.</p><a className="eg-btn ghost" href={`/pool/${encodeURIComponent(invite.photoPoolId)}`}>Open the photo pool</a></section>
      )}

      {invite.guests && invite.guests.length > 0 && (
        <section className="eg-card"><h2 className="eg-h2">Who’s coming <span className="eg-count">{invite.counts.headcount}</span></h2>
          <div className="eg-names">{invite.guests.map((g, i) => <span key={i} className="eg-name">{g.name}</span>)}</div>
          {invite.counts.spotsLeft !== null && <p className="eg-note">{invite.counts.spotsLeft > 0 ? `${invite.counts.spotsLeft} spots left` : invite.settings.waitlist ? 'Full. New “Going” replies join the waitlist.' : 'Full.'}</p>}
        </section>
      )}

      {invite.settings.guestWall && <Wall invite={invite} api={api} onPosted={() => api.load(id).then(r => setInvite(r.invite))} />}

      <Share invite={invite} api={api} link={link} />

      <section className="eg-card eg-make">
        <h2 className="eg-h2">Throwing something?</h2>
        <p className="eg-note">Make an invitation like this one on Plajah. Free, no app needed, and guests never have to sign up.</p>
        <a className="eg-btn" href={`/?create=evite&ref=${encodeURIComponent(invite.id)}`}>Make your own</a>
      </section>
      </>}
      <p className="eg-foot">Plajah Events · <a href="/">plajah.com</a></p>
    </Shell>
  );
}

function Answered({ invite, me, accent, onEdit, onGift, origin }: { invite: EvitePublicView; me: GuestMe; accent: string; onEdit(): void; onGift(): void; origin: string }) {
  const [copied, setCopied] = useState(false);
  const label = me.status === 'yes' ? 'You’re going' : me.status === 'maybe' ? 'You said maybe' : me.status === 'waitlist' ? 'You’re on the waitlist' : 'You can’t make it';
  const party = me.adults + me.kids;
  const copy = async () => { const l = personalLink(origin, invite.id); if (!l) return; try { await navigator.clipboard.writeText(l); setCopied(true); } catch { prompt?.('Your private link', l); } };
  return (
    <section className="eg-card eg-answered" style={{ borderColor: accent }} aria-live="polite">
      <div className="eg-status" style={{ background: accent }}>{label}</div>
      <p style={{ margin: '10px 0 0' }}>{me.name}{me.status === 'yes' && party > 1 ? ` · party of ${party}` : ''}</p>
      {me.status === 'waitlist' && <p className="eg-note">We’ll move you to “Going” automatically if a spot opens.</p>}
      {me.status === 'no' && invite.gifts?.enabled && invite.gifts.offerOnDecline && <button className="eg-btn" onClick={onGift}>Send a gift instead</button>}
      <div className="eg-actions">
        <button className="eg-chip" onClick={onEdit}>Change my reply</button>
        <button className="eg-chip" onClick={copy}>{copied ? 'Link copied' : 'Copy my private edit link'}</button>
      </div>
      <p className="eg-note">Your reply is saved on this device. Keep the private link to change it from another phone; don’t share it.</p>
    </section>
  );
}

function RsvpForm({ invite, me, api, onDone }: { invite: EvitePublicView; me: GuestMe | null; api: EviteGuestApi; onDone(r: Awaited<ReturnType<EviteGuestApi['rsvp']>>): void }) {
  const s = invite.settings;
  const [name, setName] = useState(me?.name || '');
  const [status, setStatus] = useState<'yes' | 'maybe' | 'no' | ''>(me && me.status !== 'waitlist' ? me.status : '');
  const [adults, setAdults] = useState(me?.adults || 1);
  const [kids, setKids] = useState(me?.kids || 0);
  const [answers, setAnswers] = useState<Record<string, string>>(me?.answers || {});
  const [bringing, setBringing] = useState<string[]>(me?.bringing || []);
  const [note, setNote] = useState(me?.note || '');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const going = status === 'yes' || status === 'maybe';
  const max = s.maxPartyPerRsvp;
  const closed = invite.closed;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (!status) { setError('Pick Going, Maybe, or Can’t make it.'); return; }
    setBusy(true);
    try { onDone(await api.rsvp(invite.id, { name, status, adults, kids, contact: contact || undefined, note: note || undefined, answers, bringing })); }
    catch (er: any) { setError(er.message); } finally { setBusy(false); }
  };
  const deadline = s.rsvpDeadline ? new Date(s.rsvpDeadline).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : '';
  return (
    <form className="eg-card" onSubmit={submit} aria-labelledby="eg-rsvp">
      <h2 id="eg-rsvp" className="eg-h2">Your reply</h2>
      {closed && !me && <p className="eg-note">Replies are closed.</p>}
      {deadline && !closed && <p className="eg-note">Please reply by {deadline}.</p>}
      <label className="eg-label" htmlFor="eg-name">Your name</label>
      <input id="eg-name" className="eg-input" value={name} onChange={e => setName(e.target.value)} autoComplete="name" required maxLength={60} placeholder="First and last name" />
      <div className="eg-seg" role="radiogroup" aria-label="Will you come?">
        {([['yes', 'Going'], ['maybe', 'Maybe'], ['no', 'Can’t make it']] as const).map(([v, l]) =>
          <button type="button" key={v} role="radio" aria-checked={status === v} className={status === v ? 'on' : ''} onClick={() => setStatus(v)} disabled={closed && !(me && v === 'no')}>{l}</button>)}
      </div>
      {going && s.allowPlusOnes && (
        <div className="eg-steppers">
          <Stepper label="Adults" value={adults} min={1} max={max - (s.kidsField ? kids : 0)} onChange={setAdults} />
          {s.kidsField && <Stepper label="Kids" value={kids} min={0} max={max - adults} onChange={setKids} />}
        </div>
      )}
      {going && invite.questions.map(q => (
        <div key={q.id}>
          <label className="eg-label" htmlFor={`eg-q-${q.id}`}>{q.label}{q.required ? ' *' : ''}</label>
          {q.kind === 'choice' && q.options?.length
            ? <select id={`eg-q-${q.id}`} className="eg-input" value={answers[q.id] || ''} onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })}><option value="">Choose…</option>{q.options.map(o => <option key={o}>{o}</option>)}</select>
            : q.kind === 'yesno'
              ? <div className="eg-seg small">{['Yes', 'No'].map(o => <button type="button" key={o} className={answers[q.id] === o ? 'on' : ''} onClick={() => setAnswers({ ...answers, [q.id]: o })}>{o}</button>)}</div>
              : <input id={`eg-q-${q.id}`} className="eg-input" value={answers[q.id] || ''} onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })} maxLength={200} />}
        </div>
      ))}
      {going && invite.bringList.length > 0 && (
        <div>
          <div className="eg-label">Want to bring something?</div>
          <div className="eg-names">{invite.bringList.map(b => {
            const mine = bringing.includes(b.id), taken = !!b.claimedName && !mine && b.claimedName !== me?.name;
            return <button type="button" key={b.id} className={`eg-chip ${mine ? 'on' : ''}`} disabled={taken} aria-pressed={mine} onClick={() => setBringing(mine ? bringing.filter(x => x !== b.id) : [...bringing, b.id])}>{b.label}{taken ? ` · ${b.claimedName}` : ''}</button>;
          })}</div>
        </div>
      )}
      <label className="eg-label" htmlFor="eg-note">Note to the host (optional)</label>
      <textarea id="eg-note" className="eg-input" rows={2} value={note} onChange={e => setNote(e.target.value)} maxLength={300} />
      <label className="eg-label" htmlFor="eg-contact">Email or phone for reminders (optional)</label>
      <input id="eg-contact" className="eg-input" value={contact} onChange={e => setContact(e.target.value)} maxLength={120} inputMode="email" autoComplete="email" />
      {error && <p className="eg-error" role="alert">{error}</p>}
      <button className="eg-btn wide" type="submit" disabled={busy || (closed && !me)}>{busy ? 'Sending…' : me ? 'Update my reply' : 'Send my reply'}</button>
      <p className="eg-note">No account needed. Only the host sees your note and contact.</p>
    </form>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange(v: number): void }) {
  return (
    <div className="eg-stepper" role="group" aria-label={label}>
      <span>{label}</span>
      <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <b aria-live="polite">{value}</b>
      <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}

function Gifts({ invite, api, prominent }: { invite: EvitePublicView; api: EviteGuestApi; prominent: boolean }) {
  const g = invite.gifts!;
  const [amount, setAmount] = useState<number>(g.presetsCents[1] || g.presetsCents[0] || 2500);
  const [custom, setCustom] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [cover, setCover] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const cents = custom ? Math.round(Number(custom) * 100) : amount;
  const math = useMemo(() => grossUpCents(Number.isFinite(cents) ? cents : 0), [cents]);
  const pay = async () => {
    setError(''); if (!Number.isFinite(cents) || cents < 100 || cents > 100000) { setError('Choose an amount between $1 and $1,000.'); return; }
    setBusy(true); try { const r = await api.gift(invite.id, { amountCents: cents, name: name || undefined, note: note || undefined, coverFees: cover }); location.href = r.url; } catch (e: any) { setError(e.message); setBusy(false); }
  };
  const copy = async (k: string, v: string) => { try { await navigator.clipboard.writeText(v); setCopied(k); setTimeout(() => setCopied(''), 1800); } catch { /* shown as text anyway */ } };
  const links: Array<[string, string, string | null]> = [];
  if (g.cashApp) links.push(['Cash App', g.cashApp, cashAppUrl(g.cashApp)]);
  if (g.venmo) links.push(['Venmo', '@' + g.venmo, venmoUrl(g.venmo)]);
  if (g.paypalMe) links.push(['PayPal', 'paypal.me/' + g.paypalMe, paypalMeUrl(g.paypalMe)]);
  if (g.zelle) links.push(['Zelle', g.zelle, null]);
  return (
    <section className={`eg-card ${prominent ? 'eg-glow' : ''}`} aria-labelledby="eg-gift">
      <h2 id="eg-gift" className="eg-h2">{g.title || (prominent ? 'Send a gift instead' : 'Send a gift')}</h2>
      {g.goalCents ? <div className="eg-goal" aria-label={`${money(g.raisedCents || 0)} of ${money(g.goalCents)} raised`}><div style={{ width: `${Math.min(100, ((g.raisedCents || 0) / g.goalCents) * 100)}%` }} /><span>{money(g.raisedCents || 0)} of {money(g.goalCents)}</span></div> : null}
      {g.stripe && <>
        <div className="eg-names" role="radiogroup" aria-label="Gift amount">{g.presetsCents.map(p => <button key={p} type="button" role="radio" aria-checked={!custom && amount === p} className={`eg-chip ${!custom && amount === p ? 'on' : ''}`} onClick={() => { setAmount(p); setCustom(''); }}>{money(p)}</button>)}
          <input className="eg-input inline" aria-label="Other amount in dollars" inputMode="decimal" placeholder="Other $" value={custom} onChange={e => setCustom(e.target.value.replace(/[^0-9.]/g, ''))} /></div>
        <input className="eg-input" placeholder="Your name (optional)" value={name} onChange={e => setName(e.target.value)} maxLength={40} aria-label="Your name" />
        <input className="eg-input" placeholder="A short note (optional)" value={note} onChange={e => setNote(e.target.value)} maxLength={200} aria-label="Gift note" />
        <label className="eg-check"><input type="checkbox" checked={cover} onChange={e => setCover(e.target.checked)} /> Cover the card fee so {invite.hostName || 'the host'} gets the full {money(math.giftCents || 0)} {cover && math.feeCents ? `(+${money(math.feeCents)})` : ''}</label>
        {error && <p className="eg-error" role="alert">{error}</p>}
        <button className="eg-btn wide" onClick={pay} disabled={busy}>{busy ? 'Opening secure checkout…' : `Give ${money(cover ? math.grossCents : math.giftCents)} by card`}</button>
        <p className="eg-note">Card gifts go straight to the host through Stripe. Plajah takes no cut.</p>
      </>}
      {links.length > 0 && <div className="eg-links">
        {links.map(([k, v, href]) => <div key={k} className="eg-row"><span className="eg-k">{k}</span><span className="eg-handle">{v}</span><span className="eg-mini">{href && <a className="eg-chip" href={href} target="_blank" rel="noreferrer">Open</a>}<button className="eg-chip" onClick={() => copy(k, v)}>{copied === k ? 'Copied' : 'Copy'}</button></span></div>)}
        <p className="eg-note">Cash App, Zelle, Venmo and PayPal go directly to the host. Plajah doesn’t process these payments and can’t recover them, so check the handle before you send.</p>
      </div>}
    </section>
  );
}

function Wall({ invite, api, onPosted }: { invite: EvitePublicView; api: EviteGuestApi; onPosted(): void }) {
  const [name, setName] = useState(''); const [text, setText] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const send = async (e: React.FormEvent) => { e.preventDefault(); setError(''); setBusy(true); try { await api.note(invite.id, name, text); setText(''); onPosted(); } catch (er: any) { setError(er.message); } finally { setBusy(false); } };
  return (
    <section className="eg-card" aria-labelledby="eg-wall">
      <h2 id="eg-wall" className="eg-h2">Notes</h2>
      {(invite.wall || []).length === 0 && <p className="eg-note">Be the first to leave a note.</p>}
      {(invite.wall || []).map(n => <div key={n.id} className="eg-wallnote"><b>{n.name}</b><span>{n.text}</span></div>)}
      <form onSubmit={send} className="eg-wallform">
        <input className="eg-input" placeholder="Name" value={name} onChange={e => setName(e.target.value)} maxLength={40} aria-label="Your name" required />
        <input className="eg-input" placeholder="Say something nice" value={text} onChange={e => setText(e.target.value)} maxLength={280} aria-label="Your note" required />
        <button className="eg-chip" disabled={busy}>{busy ? 'Posting…' : 'Post'}</button>
      </form>
      {error && <p className="eg-error" role="alert">{error}</p>}
    </section>
  );
}

function Share({ invite, api, link }: { invite: EvitePublicView; api: EviteGuestApi; link: string }) {
  const [copied, setCopied] = useState(false); const [qr, setQr] = useState(false);
  const t = shareTargets(link, { headline: invite.fields.headline, hostName: invite.hostName });
  const native = async () => { try { await (navigator as any).share({ title: invite.fields.headline, text: t.text, url: link }); } catch { /* cancelled */ } };
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* link is shown */ } };
  return (
    <section className="eg-card" aria-labelledby="eg-share">
      <h2 id="eg-share" className="eg-h2">Share</h2>
      <div className="eg-linkbox"><span>{link.replace(/^https?:\/\//, '')}</span><button className="eg-chip" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button></div>
      <div className="eg-actions">
        {typeof navigator !== 'undefined' && (navigator as any).share && <button className="eg-chip" onClick={native}>Share…</button>}
        <a className="eg-chip" href={t.whatsapp} target="_blank" rel="noreferrer">WhatsApp</a>
        <a className="eg-chip" href={t.sms}>Text</a>
        <a className="eg-chip" href={t.email}>Email</a>
        <button className="eg-chip" onClick={() => setQr(q => !q)} aria-expanded={qr}>QR code</button>
      </div>
      {qr && <div className="eg-qr"><img src={api.qrUrl(invite.id)} alt="QR code that opens this invitation" width={180} height={180} />{invite.eventId && <img src={api.qrUrl(invite.id, 'event')} alt="QR code that opens the ticketed event" width={180} height={180} />}</div>}
    </section>
  );
}

/**
 * The page wears its own invitation: the chosen plate fills the viewport behind everything, blurred, darkened and
 * scrimmed so it reads as colour and light, never as detail. Every block of text sits on a near-opaque panel, so
 * contrast holds whatever the art is (bright wedding florals included). Static on purpose: a full-screen blur that
 * moves costs real battery on phones; the card above it is the thing that's alive.
 */
function Shell({ children, accent = '#FF8C00', backdrop, light }: { children: React.ReactNode; accent?: string; backdrop?: string; light?: boolean }) {
  return (
    <div className={`eg${backdrop ? ' has-bg' : ''}`} style={{ ['--acc' as any]: accent }}>
      <style>{CSS}</style>
      {backdrop && <div className="eg-bgwrap" aria-hidden="true">
        <div className={`eg-bg${light ? ' light' : ''}`} style={{ backgroundImage: `url("${backdrop.replace(/"/g, '%22')}")` }} />
        <div className="eg-scrim" />
      </div>}
      <main className="eg-main">{children}</main>
    </div>
  );
}

const CSS = `
.eg{min-height:100vh;background:radial-gradient(900px 600px at 50% -10%,rgba(107,0,153,.35),transparent),#0b0713;color:#f4f1fa;font:15px/1.5 Inter,system-ui,sans-serif;-webkit-text-size-adjust:100%}
.eg *{box-sizing:border-box}
.eg-main{max-width:480px;margin:0 auto;padding:max(12px,env(safe-area-inset-top)) 14px calc(40px + env(safe-area-inset-bottom));display:grid;gap:14px}
.eg-over{position:absolute;left:0;right:0;bottom:0;padding:110px 20px 22px;text-align:center;background:linear-gradient(to top,rgba(5,3,9,.86),rgba(5,3,9,.45) 55%,transparent)}
.eg-over.light{background:linear-gradient(to top,rgba(250,246,238,.94),rgba(250,246,238,.72) 55%,transparent);color:#2b2420}.eg-over.light .eg-headline{text-shadow:none}.eg-over.light .eg-eyebrow{color:#7a5a2a}
.eg-btn.foil{background:var(--acc);color:#1d1408}
.eg-eyebrow{font:800 11px Inter,sans-serif;letter-spacing:.28em;text-transform:uppercase}
.eg-headline{margin:8px 0 8px;text-wrap:balance;text-shadow:0 3px 18px rgba(0,0,0,.55)}
.eg-sub{font:500 15px Inter,sans-serif;opacity:.9;margin-bottom:8px}
.eg-when{font:700 15px Inter,sans-serif}.eg-venue{font:500 13px Inter,sans-serif;opacity:.82;margin-bottom:12px}
.eg-btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 26px;border-radius:999px;border:0;background:linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00);color:#fff;font:800 13px Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;text-decoration:none;cursor:pointer;margin-top:8px}
.eg-btn.wide{width:100%}.eg-btn.ghost{background:transparent;border:1px solid rgba(244,241,250,.25)}.eg-btn:disabled{opacity:.5}
.eg-host{text-align:center;margin:0;color:rgba(244,241,250,.7)}
.eg-card{background:rgba(255,255,255,.055);border:1px solid rgba(244,241,250,.12);border-radius:22px;padding:16px;display:grid;gap:10px}
.eg-message{font:italic 500 18px/1.45 "Cormorant Garamond",Georgia,serif;white-space:pre-wrap}
.eg-h,.eg-h2{margin:0;font:900 italic 20px Outfit,sans-serif;text-transform:uppercase;letter-spacing:-.01em;display:flex;align-items:center;gap:8px}.eg-h{font-size:28px}
.eg-count{font:800 12px Inter;background:var(--acc);color:#120a00;border-radius:99px;padding:2px 8px;font-style:normal}
.eg-row{display:flex;gap:12px;align-items:baseline;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(244,241,250,.08)}.eg-row>span:last-child{text-align:right}
.eg-k{color:rgba(244,241,250,.55);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;flex:none}
.eg-note{margin:0;color:rgba(244,241,250,.62);font-size:13px}
.eg-actions,.eg-names{display:flex;flex-wrap:wrap;gap:8px}
.eg-chip{min-height:38px;padding:0 14px;border-radius:999px;border:1px solid rgba(244,241,250,.18);background:rgba(255,255,255,.04);color:#f4f1fa;font:700 13px Inter,sans-serif;display:inline-flex;align-items:center;text-decoration:none;cursor:pointer}
.eg-chip.on{background:var(--acc);border-color:var(--acc);color:#140a00}.eg-chip:disabled{opacity:.45}
.eg-label{font-size:13px;font-weight:700;color:rgba(244,241,250,.8);margin-top:4px}
.eg-input{width:100%;min-height:46px;border-radius:14px;border:1px solid rgba(244,241,250,.16);background:rgba(0,0,0,.25);color:#f4f1fa;padding:10px 12px;font:16px Inter,sans-serif}
.eg-input.inline{width:110px;min-height:38px;border-radius:999px;padding:6px 12px;font-size:14px}
.eg-input:focus-visible,.eg-chip:focus-visible,.eg-btn:focus-visible,.eg-seg button:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.eg-seg{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:4px}.eg-seg.small{grid-template-columns:repeat(2,1fr)}
.eg-seg button{min-height:48px;border-radius:14px;border:1px solid rgba(244,241,250,.18);background:rgba(255,255,255,.04);color:#f4f1fa;font:800 14px Inter,sans-serif;cursor:pointer}
.eg-seg button.on{background:var(--acc);border-color:var(--acc);color:#140a00}
.eg-steppers{display:grid;gap:8px}.eg-stepper{display:grid;grid-template-columns:1fr 44px 40px 44px;align-items:center;gap:6px}
.eg-stepper button{height:44px;border-radius:12px;border:1px solid rgba(244,241,250,.2);background:rgba(255,255,255,.05);color:#fff;font:800 20px Inter;cursor:pointer}.eg-stepper b{text-align:center;font:800 18px Inter}
.eg-error{margin:0;color:#ff8a8a;font-weight:700;font-size:14px}
.eg-answered{border-width:2px}.eg-status{justify-self:start;padding:6px 14px;border-radius:99px;color:#140a00;font:800 13px Inter;letter-spacing:.04em}
.eg-glow{box-shadow:0 0 0 2px var(--acc),0 20px 60px -30px var(--acc)}
.eg-goal{position:relative;height:28px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden}.eg-goal div{position:absolute;inset:0 auto 0 0;background:var(--acc)}.eg-goal span{position:relative;display:block;text-align:center;font:800 12px/28px Inter;mix-blend-mode:difference}
.eg-check{display:flex;gap:8px;align-items:flex-start;font-size:13px;color:rgba(244,241,250,.85)}.eg-check input{width:20px;height:20px;accent-color:var(--acc);flex:none}
.eg-links .eg-row{align-items:center;flex-wrap:wrap}.eg-handle{font-weight:700;overflow-wrap:break-word;word-break:normal;flex:1 1 150px;min-width:0;text-align:left!important}.eg-mini{display:flex;gap:6px;margin-left:auto}
.eg-name{padding:6px 12px;border-radius:99px;background:rgba(255,255,255,.07);font-size:13px;font-weight:600}
.eg-wallnote{display:grid;padding:8px 0;border-bottom:1px solid rgba(244,241,250,.08)}.eg-wallnote b{font-size:13px}
.eg-wallform{display:grid;grid-template-columns:1fr;gap:8px}
.eg-linkbox{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:8px 8px 8px 14px;border-radius:999px;background:rgba(0,0,0,.25);border:1px solid rgba(244,241,250,.12)}.eg-linkbox span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;font-size:14px;min-width:0}
.eg-qr{display:flex;gap:12px;flex-wrap:wrap}.eg-qr img{background:#fff;border-radius:12px;padding:6px}
.eg-banner{padding:12px 14px;border-radius:16px;background:rgba(6,214,160,.16);border:1px solid rgba(6,214,160,.5);font-weight:700}.eg-banner.warn{background:rgba(239,68,68,.14);border-color:rgba(239,68,68,.5)}
.eg-make{text-align:center;justify-items:center}
.eg-foot{text-align:center;color:rgba(244,241,250,.45);font-size:12px}.eg-foot a{color:inherit}
.eg-skel{aspect-ratio:2/3;border-radius:28px;background:linear-gradient(110deg,#140b22 30%,#20123a 50%,#140b22 70%);background-size:200% 100%;animation:egsk 1.4s linear infinite}
@keyframes egsk{to{background-position:-200% 0}}
.eg-bgwrap{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;background:#0b0713}
.eg-bg{position:absolute;inset:-8%;background-size:cover;background-position:50% 30%;filter:blur(28px) saturate(1.3) brightness(.6);transform:translateZ(0)}
.eg-bg.light{filter:blur(28px) saturate(1.15) brightness(.5) sepia(.15)}
.eg-scrim{position:absolute;inset:0;background:radial-gradient(140% 90% at 50% 40%,transparent 35%,rgba(11,7,19,.5)),linear-gradient(to bottom,rgba(11,7,19,.2),rgba(11,7,19,.42))}
.eg.has-bg{background:#0b0713}
.eg.has-bg .eg-main{position:relative;z-index:1}
.eg.has-bg .eg-card{background:rgba(14,9,24,.78);border-color:rgba(244,241,250,.14);box-shadow:0 18px 50px -28px rgba(0,0,0,.9)}
.eg.has-bg .eg-host,.eg.has-bg .eg-foot{text-shadow:0 1px 10px rgba(0,0,0,.9)}
.eg.has-bg .eg-host{color:rgba(244,241,250,.88)}.eg.has-bg .eg-foot{color:rgba(244,241,250,.62)}
@media (prefers-reduced-transparency:reduce){.eg.has-bg .eg-card{background:#140c22}}
@media (prefers-contrast:more){.eg-bgwrap{display:none}.eg.has-bg .eg-card{background:#140c22}}
@media (prefers-reduced-motion:reduce){.eg-skel{animation:none}}
`;
