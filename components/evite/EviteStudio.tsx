/**
 * EviteStudio — the host side of Plajah Evites. Easy by default, professional tools one tap away.
 *
 *   Create:  Design → Details → Guests → Extras → Share, with a live preview of the exact living card guests open.
 *   Manage:  replies (counts, answers, bring list, CSV), notes moderation, the event's plan (playbook), sharing,
 *            print, and links into the event room, photo pool, ticketing and the full Production Studio.
 *
 * Every published event automatically gets a private event room (club + chat) and a photo pool.
 */
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import EviteCard, { cardAccent } from './EviteCard';
import EraDesignGrid, { EraLesson } from './EraDesignGrid';
import { isEraId } from '../../services/evite/eraIds';
/** Design picker tab for the procedural "Design eras" collection (not a catalogue collection id). */
const ERAS = 'eras';
import { PLATE_COLLECTIONS, plateUrls, parsePlateId, isAlternate, prettySubject } from '../../services/evite/plateCatalog';
import { saveInvite, myInvites, inviteGuests, removeRsvp, removeNote, provisionExtras, downloadCsv, type GuestsResult } from '../../services/evite/eviteHostClient';
import { planTimeline } from '../../services/evite/playbooks';
import { playFor } from '../../services/evite/playGames';
import { themeIdOf, themeArt, type ThemeArt } from '../../services/evite/eviteThemes';
import { shareTargets, cashAppUrl } from '../../services/evite/eviteCore';
import { DEFAULT_GIFTS, DEFAULT_SETTINGS, type EviteDoc, type EviteHost, type EviteQuestion, type EviteBringItem } from '../../services/evite/eviteTypes';

// Creator themes (services/evite/eviteThemes.ts): the host's own, bought, saved and members-only designs ("theme:<id>").
const ThemePickerSection = React.lazy(() => import('./ThemePickerSection').catch(() => ({ default: () => null })) as any);
const EvitePrintSheet = React.lazy(() => import('./EvitePrintSheet').catch(() => ({ default: () => null })) as any);

type Step = 'design' | 'details' | 'guests' | 'extras' | 'share';
const STEPS: Array<{ id: Step; label: string }> = [{ id: 'design', label: 'Design' }, { id: 'details', label: 'Details' }, { id: 'guests', label: 'Guests' }, { id: 'extras', label: 'Extras' }, { id: 'share', label: 'Share' }];

export interface EviteStudioProps {
  currentUser: { uid: string; displayName?: string; photoURL?: string } | null;
  editId?: string | null;
  /** start from this design ("collection/subject") */
  initialPlate?: string | null;
  host?: EviteHost | null;
  onBack(): void;
  onSignIn?(): void;
  onOpenProduction?(): void;
  onOpenTicketing?(eventId?: string): void;
}

const tzNow = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };
const toLocalInput = (ms: number) => { const d = new Date(ms); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const fromLocalInput = (v: string) => { const t = new Date(v).getTime(); return Number.isFinite(t) ? t : Date.now(); };
const uid8 = () => Math.random().toString(36).slice(2, 8);

export function suggestHeadline(collection: string, subject: string, honoree: string): string {
  const h = honoree.trim(); const thing = prettySubject(subject);
  if (collection.startsWith('kids_') || collection === 'gaming') return `${h || 'Max'} is turning 6!`;
  if (collection === 'wedding') return h || 'Mira & Ellis';
  if (collection === 'anniversary') return h ? `${h}’s Anniversary` : 'Celebrating 25 Years';
  if (collection === 'adult') return `${h || 'Jordan'}’s Birthday`;
  if (collection.startsWith('sports')) return `${h ? h + '’s ' : ''}${thing[0].toUpperCase() + thing.slice(1)} Party`;
  if (collection === 'holidays' || collection === 'patriotic') return `${thing.replace(/\b\w/g, c => c.toUpperCase())}${h ? ' with ' + h : ''}`;
  if (collection === 'life' || collection === 'faith' || collection === 'military') return `${thing.replace(/\b\w/g, c => c.toUpperCase())}${h ? ' for ' + h : ''}`;
  return h ? `Join ${h}` : 'You’re Invited';
}

function blankDraft(host: EviteHost | null | undefined, name: string): Partial<EviteDoc> {
  const start = new Date(); start.setDate(start.getDate() + 21); start.setHours(14, 0, 0, 0);
  return {
    templateId: 'kids_boy/dino', status: 'draft', host: host || { kind: 'user', label: name },
    fields: { headline: '', subline: '', honoree: '', hostName: host?.label || name, startsAt: start.getTime(), endsAt: start.getTime() + 3 * 36e5, timezone: tzNow(), venueName: '', address: '', message: '' },
    settings: { ...DEFAULT_SETTINGS }, questions: [], bringList: [], gifts: { ...DEFAULT_GIFTS }, look: { motion: true, sound: false },
  };
}

export default function EviteStudio({ currentUser, editId, initialPlate, host, onBack, onSignIn, onOpenProduction, onOpenTicketing }: EviteStudioProps) {
  // Start from a catalogue plate ("collection/subject") or a creator theme ("theme:<id>").
  const startOk = !!initialPlate && (!!parsePlateId(initialPlate) || !!themeIdOf(initialPlate) || isEraId(initialPlate));
  const [draft, setDraft] = useState<Partial<EviteDoc>>(() => ({ ...blankDraft(host, currentUser?.displayName || ''), ...(startOk ? { templateId: initialPlate } : {}) }));
  const [step, setStep] = useState<Step>(startOk ? 'details' : 'design');
  const [mode, setMode] = useState<'create' | 'manage'>(editId ? 'manage' : 'create');
  const [headlineTouched, setHeadlineTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [room, setRoom] = useState(true);
  const [pool, setPool] = useState(true);
  const [loading, setLoading] = useState(!!editId);
  const [art, setArt] = useState<ThemeArt | null>(null);

  useEffect(() => {
    if (!editId || !currentUser) return;
    myInvites().then(items => { const it = items.find(i => i.invite.id === editId); if (it) { setDraft(it.invite); setHeadlineTouched(true); } else setMsg('That invite wasn’t found in your events.'); }).catch(e => setMsg(e.message)).finally(() => setLoading(false));
  }, [editId, currentUser]);

  // A creator theme carries its own art; editing an invite that uses one fetches it once.
  useEffect(() => {
    const tid = themeIdOf(draft.templateId);
    if (!tid) { setArt(null); return; }
    if (art) return;
    import('../../services/evite/eviteThemeClient').then(m => m.getTheme(tid)).then(t => setArt(themeArt(t))).catch(() => setMsg('That design is no longer available. Pick another one.'));
  }, [draft.templateId]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof EviteDoc>(k: K, v: EviteDoc[K]) => setDraft(d => ({ ...d, [k]: v }));
  const setF = (patch: Partial<EviteDoc['fields']>) => setDraft(d => ({ ...d, fields: { ...(d.fields as any), ...patch } }));
  const setS = (patch: Partial<EviteDoc['settings']>) => setDraft(d => ({ ...d, settings: { ...(d.settings as any), ...patch } }));
  const setG = (patch: Partial<EviteDoc['gifts']>) => setDraft(d => ({ ...d, gifts: { ...(d.gifts as any), ...patch } }));
  const plate = parsePlateId(draft.templateId);
  const fields = draft.fields!;
  const previewFields = { ...fields, headline: fields.headline || (plate ? suggestHeadline(plate.collection, plate.subject, fields.honoree) : 'You’re Invited') };

  const persist = async (extra: Partial<EviteDoc> = {}) => {
    if (!currentUser) { onSignIn?.(); throw new Error('Sign in to save your invitation.'); }
    const body = { ...draft, ...extra, fields: previewFields };
    const saved = await saveInvite(body as any);
    setDraft(saved); return saved;
  };
  const goto = async (next: Step) => {
    setMsg('');
    if (currentUser && (draft.id || STEPS.findIndex(s => s.id === next) > 1)) { try { setSaving(true); await persist(); } catch (e: any) { setMsg(e.message); } finally { setSaving(false); } }
    setStep(next);
  };
  const publish = async () => {
    setMsg(''); setSaving(true);
    try {
      let inv = await persist({ status: 'live' });
      const r = await provisionExtras(inv, { room, pool }); inv = r.invite; setDraft(inv);
      if (r.problems.length) setMsg(r.problems.join(' '));
      setStep('share');
    } catch (e: any) { setMsg(e.message); } finally { setSaving(false); }
  };

  if (!currentUser) return (
    <Frame onBack={onBack} title="Create an event">
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-center max-w-md mx-auto">
        <p className="text-white/80 mb-4">Sign in to create and manage invitations. Your guests never need an account.</p>
        <button className="pj-cta" onClick={onSignIn}>Sign in</button>
      </div>
    </Frame>
  );
  if (loading) return <Frame onBack={onBack} title="Loading…"><div className="h-64 animate-pulse rounded-3xl bg-white/5" /></Frame>;

  const preview = (plate || art || isEraId(draft.templateId)) && <div className="w-full max-w-[340px] mx-auto"><EviteCard key={draft.templateId} plateId={draft.templateId!} art={art} fields={previewFields} accent={draft.look?.accent} showLaw={draft.look?.showLaw} ctaLabel="RSVP" /></div>;

  if (mode === 'manage' && draft.id) return (
    <Frame onBack={onBack} title={previewFields.headline} subtitle={draft.status === 'live' ? 'Live' : draft.status === 'closed' ? 'Replies closed' : draft.status === 'cancelled' ? 'Cancelled' : 'Draft'}>
      <Manage invite={draft as EviteDoc} preview={preview} preset={art?.preset} onEdit={() => { setMode('create'); setStep('details'); }} onUpdate={async (patch) => { const inv = await saveInvite({ id: draft.id!, ...patch }); setDraft(inv); }}
        onOpenProduction={onOpenProduction} onOpenTicketing={onOpenTicketing} />
    </Frame>
  );

  const idx = STEPS.findIndex(s => s.id === step);
  return (
    <Frame onBack={onBack} title={draft.id ? 'Edit invitation' : 'Create an event'} subtitle={draft.host && draft.host.kind !== 'user' ? `Hosting as ${draft.host.label || draft.host.kind}` : undefined}>
      <ol className="flex gap-1.5 overflow-x-auto pb-1 mb-4" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s.id}><button onClick={() => (i <= idx || draft.id) && goto(s.id)} aria-current={s.id === step ? 'step' : undefined}
            className={`h-9 px-4 rounded-full text-xs font-black uppercase tracking-widest whitespace-nowrap border ${s.id === step ? 'bg-white text-black border-white' : i < idx ? 'border-white/30 text-white/80' : 'border-white/10 text-white/40'}`}>{i + 1}. {s.label}</button></li>
        ))}
      </ol>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        <div className="min-w-0 order-2 lg:order-1">
          {step === 'design' && <>
            <Suspense fallback={null}><ThemePickerSection value={draft.templateId} onPick={(id: string, a: ThemeArt) => { setArt(a); set('templateId', id); }} /></Suspense>
            <DesignStep value={draft.templateId!} onPick={id => { setArt(null); set('templateId', id); const p = parsePlateId(id); if (p && !headlineTouched) setF({ headline: '' }); }} />
            {isEraId(draft.templateId) && <div className="grid gap-2 mt-4">
              <Suspense fallback={null}><EraLesson id={draft.templateId!} /></Suspense>
              <Toggle checked={!!draft.look?.showLaw} onChange={v => set('look', { ...(draft.look || { motion: true, sound: false }), showLaw: v })} label="Show the design law" hint="Draws the era’s structural rule (its grid, diagonal or proportion) faintly over the art, for guests who like to look closely." />
            </div>}
          </>}
          {step === 'details' && <DetailsStep fields={fields} plate={plate} setF={setF} settings={draft.settings!} setS={setS} onHeadline={() => setHeadlineTouched(true)} />}
          {step === 'guests' && <GuestsStep plateId={draft.templateId || ''} settings={draft.settings!} setS={setS} questions={draft.questions!} setQ={q => set('questions', q)} bring={draft.bringList!} setB={b => set('bringList', b)} />}
          {step === 'extras' && <ExtrasStep draft={draft} setG={setG} set={set} room={room} setRoom={setRoom} pool={pool} setPool={setPool} />}
          {step === 'share' && <ShareStep invite={draft as EviteDoc} onManage={() => setMode('manage')} onPublish={publish} saving={saving} />}
          {msg && <p className="mt-4 text-sm font-bold text-amber-300" role="alert">{msg}</p>}
          {step !== 'share' && (
            <div className="flex gap-3 mt-6">
              {idx > 0 && <button className="pj-ghost" onClick={() => goto(STEPS[idx - 1].id)}>Back</button>}
              {step !== 'extras'
                ? <button className="pj-cta" onClick={() => goto(STEPS[idx + 1].id)} disabled={saving}>{saving ? 'Saving…' : 'Next'}</button>
                : <button className="pj-cta" onClick={publish} disabled={saving}>{saving ? 'Publishing…' : 'Publish & share'}</button>}
            </div>
          )}
        </div>
        <aside className="order-1 lg:order-2 lg:sticky lg:top-4">{preview}<p className="text-center text-xs text-white/40 mt-2">Live preview · tilt or move your mouse</p></aside>
      </div>
    </Frame>
  );
}

// ── Steps ───────────────────────────────────────────────────────────────────

function DesignStep({ value, onPick }: { value: string; onPick(id: string): void }) {
  const current = parsePlateId(value);
  const [col, setCol] = useState(isEraId(value) ? ERAS : current?.collection || 'kids_boy');
  const [q, setQ] = useState('');
  const c = PLATE_COLLECTIONS.find(x => x.id === col) || PLATE_COLLECTIONS[0];
  const all = q.trim() ? PLATE_COLLECTIONS.flatMap(x => x.plates.filter(p => !isAlternate(p) && (prettySubject(p).includes(q.toLowerCase()) || x.label.toLowerCase().includes(q.toLowerCase()))).map(p => `${x.id}/${p}`))
    : c.plates.filter(p => !isAlternate(p)).map(p => `${c.id}/${p}`);
  const alts = current ? PLATE_COLLECTIONS.find(x => x.id === current.collection)?.plates.filter(p => p === `${current.subject.replace(/-alt$/, '')}-alt` || p === current.subject.replace(/-alt$/, '')).map(p => `${current.collection}/${p}`) || [] : [];
  return (
    <section>
      <h2 className="pj-h2">Pick a design</h2>
      <input className="pj-input mb-3" placeholder="Search: dinosaur, wedding, basketball, Diwali…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search designs" />
      {!q && <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3">{PLATE_COLLECTIONS.map(x => <button key={x.id} onClick={() => setCol(x.id)} className={`h-9 px-3.5 rounded-full text-xs font-bold whitespace-nowrap border ${x.id === col ? 'bg-white text-black border-white' : 'border-white/15 text-white/70'}`}>{x.label}</button>)}
        <button onClick={() => setCol(ERAS)} className={`h-9 px-3.5 rounded-full text-xs font-bold whitespace-nowrap border ${col === ERAS ? 'bg-white text-black border-white' : 'border-white/15 text-white/70'}`}>Design eras</button></div>}
      {alts.length > 1 && <div className="mb-3 text-xs text-white/60">Variations: {alts.map(a => <button key={a} onClick={() => onPick(a)} className={`ml-2 underline ${a === value ? 'text-white' : ''}`}>{isAlternate(a) ? 'B' : 'A'}</button>)}</div>}
      {col === ERAS && !q ? <Suspense fallback={null}><EraDesignGrid value={value} onPick={onPick} /></Suspense> : <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
        {all.map(id => { const u = plateUrls(id)!; const on = id === value || `${id}-alt` === value; return (
          <button key={id} onClick={() => onPick(id)} aria-pressed={on} className={`relative rounded-2xl overflow-hidden border-2 ${on ? 'border-orange-400' : 'border-transparent'} focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300`}>
            <img src={u.thumb} alt={prettySubject(u.subject)} loading="lazy" width={240} height={362} className="w-full h-auto block aspect-[2/3] object-cover" />
            <span className="absolute left-1.5 bottom-1.5 right-1.5 text-[10px] font-bold capitalize bg-black/60 rounded-full px-2 py-0.5 truncate">{prettySubject(u.subject)}</span>
          </button>
        ); })}
      </div>}
    </section>
  );
}

function DetailsStep({ fields, plate, setF, settings, setS, onHeadline }: { fields: EviteDoc['fields']; plate: ReturnType<typeof parsePlateId>; setF(p: Partial<EviteDoc['fields']>): void; settings: EviteDoc['settings']; setS(p: Partial<EviteDoc['settings']>): void; onHeadline(): void }) {
  const suggestion = plate ? suggestHeadline(plate.collection, plate.subject, fields.honoree) : 'You’re Invited';
  return (
    <section className="grid gap-3">
      <h2 className="pj-h2">The details</h2>
      <Field label={plate?.collection === 'wedding' ? 'Couple' : 'Who is it for?'} hint="A name, or the couple"><input className="pj-input" value={fields.honoree} onChange={e => setF({ honoree: e.target.value })} maxLength={60} /></Field>
      <Field label="Headline" hint={fields.headline ? undefined : `Leave blank to use: “${suggestion}”`}><input className="pj-input" value={fields.headline} placeholder={suggestion} onChange={e => { onHeadline(); setF({ headline: e.target.value }); }} maxLength={90} /></Field>
      <Field label="A line under it (optional)"><input className="pj-input" value={fields.subline} onChange={e => setF({ subline: e.target.value })} maxLength={140} /></Field>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Starts"><input type="datetime-local" className="pj-input" value={toLocalInput(fields.startsAt)} onChange={e => { if (!e.target.value) return; const st = fromLocalInput(e.target.value); setF({ startsAt: st, endsAt: fields.endsAt && fields.endsAt <= st ? st + (fields.endsAt - fields.startsAt > 0 ? fields.endsAt - fields.startsAt : 3 * 36e5) : fields.endsAt }); }} /></Field>
        <Field label="Ends (optional)"><input type="datetime-local" className="pj-input" value={fields.endsAt ? toLocalInput(fields.endsAt) : ''} onChange={e => { const en = e.target.value ? fromLocalInput(e.target.value) : undefined; setF({ endsAt: en && en > fields.startsAt ? en : undefined }); }} /></Field>
      </div>
      <Field label="Place name"><input className="pj-input" value={fields.venueName} onChange={e => setF({ venueName: e.target.value })} maxLength={90} placeholder="Our backyard, The Garden Room…" /></Field>
      <Field label="Address"><input className="pj-input" value={fields.address} onChange={e => setF({ address: e.target.value })} maxLength={200} autoComplete="street-address" /></Field>
      <Toggle checked={settings.revealAddressAfterYes} onChange={v => setS({ revealAddressAfterYes: v })} label="Only show the address to guests who reply “Going”" hint="Good for home parties." />
      <Field label="Hosted by"><input className="pj-input" value={fields.hostName} onChange={e => setF({ hostName: e.target.value })} maxLength={60} /></Field>
      <Field label="A message for guests (optional)"><textarea className="pj-input" rows={3} value={fields.message} onChange={e => setF({ message: e.target.value })} maxLength={600} /></Field>
    </section>
  );
}

function GuestsStep({ plateId, settings, setS, questions, setQ, bring, setB }: { plateId: string; settings: EviteDoc['settings']; setS(p: Partial<EviteDoc['settings']>): void; questions: EviteQuestion[]; setQ(q: EviteQuestion[]): void; bring: EviteBringItem[]; setB(b: EviteBringItem[]): void }) {
  const [newItem, setNewItem] = useState('');
  return (
    <section className="grid gap-3">
      <h2 className="pj-h2">Guests &amp; replies</h2>
      <Toggle checked={settings.allowPlusOnes} onChange={v => setS({ allowPlusOnes: v })} label="Guests can bring others" />
      {settings.allowPlusOnes && <Field label="Most people per reply"><input type="number" min={1} max={20} className="pj-input w-28" value={settings.maxPartyPerRsvp} onChange={e => setS({ maxPartyPerRsvp: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} /></Field>}
      <Toggle checked={settings.kidsField} onChange={v => setS({ kidsField: v })} label="Ask how many kids are coming" />
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Capacity (optional)"><input type="number" min={0} className="pj-input" value={settings.capacity || ''} onChange={e => setS({ capacity: Number(e.target.value) || undefined })} placeholder="No limit" /></Field>
        <Field label="Reply by (optional)"><input type="date" className="pj-input" value={settings.rsvpDeadline ? new Date(settings.rsvpDeadline).toISOString().slice(0, 10) : ''} onChange={e => setS({ rsvpDeadline: e.target.value ? new Date(e.target.value + 'T23:59').getTime() : undefined })} /></Field>
      </div>
      {!!settings.capacity && <Toggle checked={settings.waitlist} onChange={v => setS({ waitlist: v })} label="Waitlist when full" hint="Waitlisted guests move up automatically when someone drops out." />}
      <Toggle checked={settings.showGuestList} onChange={v => setS({ showGuestList: v })} label="Show guests who else is coming" />
      <Toggle checked={settings.guestWall} onChange={v => setS({ guestWall: v })} label="Let guests leave notes" />
      <Toggle checked={settings.reminders} onChange={v => setS({ reminders: v })} label="Send reminders" hint="An email about a day before, to guests who replied Going or Maybe and left an email." />
      {(() => { const u = plateUrls(plateId); const g = u && playFor(u.collection, u.subject); return g ? <Toggle checked={!settings.skipPlay} onChange={v => setS({ skipPlay: !v })} label={`Open with a quick game (${g.kind === 'scratch' ? 'scratch-off' : g.kind})`} hint="Kids play for a few seconds to open the invitation. Grown-ups can always skip." /> : null; })()}

      <h3 className="pj-h3 mt-3">Questions</h3>
      {questions.map((q, i) => (
        <div key={q.id} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
          <input className="pj-input" value={q.label} onChange={e => setQ(questions.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} aria-label="Question" />
          <select className="pj-input w-28" value={q.kind} onChange={e => setQ(questions.map((x, j) => j === i ? { ...x, kind: e.target.value as any, options: e.target.value === 'choice' ? (x.options?.length ? x.options : ['Option 1', 'Option 2']) : undefined } : x))} aria-label="Answer type"><option value="text">Text</option><option value="choice">Choice</option><option value="yesno">Yes / No</option></select>
          <button className="pj-ghost" onClick={() => setQ(questions.filter((_, j) => j !== i))} aria-label="Remove question">Remove</button>
          {q.kind === 'choice' && <input className="pj-input col-span-3" value={(q.options || []).join(', ')} onChange={e => setQ(questions.map((x, j) => j === i ? { ...x, options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } : x))} aria-label="Choices, separated by commas" placeholder="Fish, Chicken, Vegetarian" />}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {[['Any food allergies?', 'text'], ['Meal choice', 'choice'], ['Need a ride?', 'yesno'], ['Song request', 'text']].map(([l, k]) =>
          <button key={l} className="pj-chip" onClick={() => setQ([...questions, { id: 'q' + uid8(), label: l, kind: k as any, options: k === 'choice' ? ['Fish', 'Chicken', 'Vegetarian'] : undefined }])}>+ {l}</button>)}
      </div>

      <h3 className="pj-h3 mt-3">Bring list</h3>
      <div className="flex flex-wrap gap-2">{bring.map(b => <span key={b.id} className="pj-chip">{b.label}{b.claimedName ? ` · ${b.claimedName}` : ''} <button aria-label={`Remove ${b.label}`} className="ml-1 opacity-60" onClick={() => setB(bring.filter(x => x.id !== b.id))}>×</button></span>)}</div>
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (newItem.trim()) { setB([...bring, { id: 'b' + uid8(), label: newItem.trim() }]); setNewItem(''); } }}>
        <input className="pj-input" value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Chips, ice, a dessert…" aria-label="Add an item guests can bring" />
        <button className="pj-ghost">Add</button>
      </form>
    </section>
  );
}

function ExtrasStep({ draft, setG, set, room, setRoom, pool, setPool }: { draft: Partial<EviteDoc>; setG(p: Partial<EviteDoc['gifts']>): void; set: any; room: boolean; setRoom(v: boolean): void; pool: boolean; setPool(v: boolean): void }) {
  const g = draft.gifts!;
  return (
    <section className="grid gap-3">
      <h2 className="pj-h2">Extras</h2>
      <Toggle checked={room} onChange={setRoom} label="Private event room (chat + plans)" hint="Guests who reply Going or Maybe can join with a free Plajah account." disabled={!!draft.clubId} />
      <Toggle checked={pool} onChange={setPool} label="Photo pool" hint="Everyone adds photos and videos; they choose what's public." disabled={!!draft.photoPoolId} />

      <h3 className="pj-h3 mt-3">Gifts</h3>
      <Toggle checked={g.enabled} onChange={v => setG({ enabled: v })} label="Let people send gifts" hint="Even guests who can't come. Plajah takes no cut." />
      {g.enabled && <div className="grid gap-3 rounded-2xl border border-white/10 p-3">
        <Field label="Gift title (optional)"><input className="pj-input" value={g.title || ''} onChange={e => setG({ title: e.target.value })} placeholder="Max’s birthday fund" /></Field>
        <Toggle checked={g.stripe} onChange={v => setG({ stripe: v })} label="Card gifts through Stripe" hint="Goes straight to your connected Stripe payouts. Guests can cover the card fee." />
        <Field label="Goal (optional, $)"><input type="number" min={0} className="pj-input w-36" value={g.goalCents ? g.goalCents / 100 : ''} onChange={e => setG({ goalCents: Number(e.target.value) ? Math.round(Number(e.target.value) * 100) : undefined })} /></Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Cash App" hint={g.cashApp ? cashAppUrl(g.cashApp) : 'Your $cashtag'}><input className="pj-input" value={g.cashApp || ''} onChange={e => setG({ cashApp: e.target.value })} placeholder="$yourtag" /></Field>
          <Field label="Zelle" hint="The email or phone you use with Zelle"><input className="pj-input" value={g.zelle || ''} onChange={e => setG({ zelle: e.target.value })} /></Field>
          <Field label="Venmo"><input className="pj-input" value={g.venmo || ''} onChange={e => setG({ venmo: e.target.value })} placeholder="@you" /></Field>
          <Field label="PayPal.Me"><input className="pj-input" value={g.paypalMe || ''} onChange={e => setG({ paypalMe: e.target.value })} placeholder="yourname" /></Field>
        </div>
        <Toggle checked={g.offerOnDecline} onChange={v => setG({ offerOnDecline: v })} label="Suggest a gift when someone can't make it" />
      </div>}
      <Field label="Registry link (optional)"><input className="pj-input" value={draft.registryUrl || ''} onChange={e => set('registryUrl', e.target.value)} placeholder="https://" /></Field>
      <Field label="Ticketed event (optional)" hint="Selling tickets too? Paste the Plajah event id or link and the invite will show a Get tickets button."><input className="pj-input" value={draft.eventId || ''} onChange={e => set('eventId', (e.target.value.match(/event\/([^/?#]+)/)?.[1] || e.target.value).trim())} /></Field>
    </section>
  );
}

function ShareStep({ invite, onManage, onPublish, saving }: { invite: EviteDoc; onManage(): void; onPublish(): void; saving: boolean }) {
  const [copied, setCopied] = useState(false); const [print, setPrint] = useState(false);
  if (!invite.id || invite.status === 'draft') return <section className="grid gap-3"><h2 className="pj-h2">Ready?</h2><p className="text-white/70">Publish to get your link and QR code.</p><button className="pj-cta" onClick={onPublish} disabled={saving}>{saving ? 'Publishing…' : 'Publish'}</button></section>;
  const link = `${location.origin}/i/${invite.id}`; const t = shareTargets(link, invite.fields);
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* shown */ } };
  return (
    <section className="grid gap-4">
      <h2 className="pj-h2">Your invitation is live</h2>
      <div className="flex items-center gap-2 rounded-full border border-white/15 bg-black/30 pl-4 pr-1.5 py-1.5"><span className="truncate font-semibold text-sm min-w-0 flex-1">{link.replace(/^https?:\/\//, '')}</span><button className="pj-chip" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button></div>
      <div className="flex flex-wrap gap-2">
        {(navigator as any).share && <button className="pj-chip" onClick={() => (navigator as any).share({ title: invite.fields.headline, text: t.text, url: link }).catch(() => {})}>Share…</button>}
        <a className="pj-chip" href={t.sms}>Text</a><a className="pj-chip" href={t.whatsapp} target="_blank" rel="noreferrer">WhatsApp</a><a className="pj-chip" href={t.email}>Email</a>
        <a className="pj-chip" href={t.facebook} target="_blank" rel="noreferrer">Facebook</a>
        <a className="pj-chip" href={`/i/${invite.id}`} target="_blank" rel="noreferrer">Preview as a guest</a>
      </div>
      <div className="flex flex-wrap gap-4 items-start">
        <img src={`/api/evite/${invite.id}/qr.svg`} alt="QR code for your invitation" width={160} height={160} className="rounded-xl bg-white p-1.5" />
        <div className="grid gap-2 text-sm text-white/70 max-w-xs"><p>Print this QR on a flyer, a card or the door. It opens the living invite.</p>
          <button className="pj-ghost" onClick={() => setPrint(true)}>Order printed invitations</button></div>
      </div>
      <button className="pj-cta" onClick={onManage}>See replies</button>
      {print && <React.Suspense fallback={null}><EvitePrintSheet inviteId={invite.id} plateId={invite.templateId} fields={invite.fields} accent={cardAccent(invite.templateId, invite.look.accent)} onClose={() => setPrint(false)} /></React.Suspense>}
    </section>
  );
}

// ── Manage ──────────────────────────────────────────────────────────────────

function Manage({ invite, preview, preset, onEdit, onUpdate, onOpenProduction, onOpenTicketing }: { invite: EviteDoc; preview: React.ReactNode; preset?: string; onEdit(): void; onUpdate(p: Partial<EviteDoc>): Promise<void>; onOpenProduction?(): void; onOpenTicketing?(id?: string): void }) {
  const [tab, setTab] = useState<'replies' | 'plan' | 'notes' | 'share'>('replies');
  const [data, setData] = useState<GuestsResult | null>(null);
  const [filter, setFilter] = useState<'all' | 'yes' | 'maybe' | 'no' | 'waitlist'>('all');
  const [err, setErr] = useState('');
  const load = () => inviteGuests(invite.id).then(setData).catch(e => setErr(e.message));
  useEffect(() => { load(); }, [invite.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Catalogue plates name their collection; creator themes borrow one as their style preset.
  const collection = parsePlateId(invite.templateId)?.collection || preset || (isEraId(invite.templateId) ? 'general' : undefined);
  const plan = useMemo(() => collection ? planTimeline(collection, invite.fields.startsAt, invite.planDone || []) : [], [collection, invite.fields.startsAt, invite.planDone]);
  const c = data?.counts;
  const rows = (data?.rsvps || []).filter(r => filter === 'all' || r.status === filter);
  const toggleStep = (id: string) => { const done = new Set(invite.planDone || []); done.has(id) ? done.delete(id) : done.add(id); onUpdate({ planDone: [...done] }); };
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
      <div className="min-w-0 grid gap-4">
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2" aria-label="Reply counts">
          {([['Going', c?.yes], ['Maybe', c?.maybe], ['Can’t', c?.no], ['Waitlist', c?.waitlist], ['Headcount', c?.headcount]] as const).map(([l, n]) =>
            <div key={l} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"><div className="text-2xl font-black italic">{n ?? '–'}</div><div className="text-[10px] font-black uppercase tracking-widest text-white/50">{l}</div></div>)}
        </div>
        {c?.spotsLeft !== null && c?.spotsLeft !== undefined && <p className="text-sm text-white/60">{c.spotsLeft} spots left</p>}
        {!!data?.raisedCents && <p className="text-sm text-white/70">Gifts by card so far: <b>${(data.raisedCents / 100).toFixed(2)}</b></p>}
        <div className="flex gap-1.5 overflow-x-auto">{(['replies', 'plan', 'notes', 'share'] as const).map(t => <button key={t} onClick={() => setTab(t)} className={`h-9 px-4 rounded-full text-xs font-black uppercase tracking-widest border ${tab === t ? 'bg-white text-black border-white' : 'border-white/15 text-white/60'}`}>{t === 'replies' ? 'Replies' : t === 'plan' ? 'Plan' : t === 'notes' ? 'Notes' : 'Share & tools'}</button>)}</div>
        {err && <p className="text-amber-300 text-sm" role="alert">{err}</p>}

        {tab === 'replies' && <div className="grid gap-2">
          <div className="flex flex-wrap gap-2 items-center">
            {(['all', 'yes', 'maybe', 'no', 'waitlist'] as const).map(f => <button key={f} className={`pj-chip ${filter === f ? 'pj-chip-on' : ''}`} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f === 'yes' ? 'Going' : f === 'no' ? 'Can’t' : f[0].toUpperCase() + f.slice(1)}</button>)}
            <button className="pj-ghost ml-auto" onClick={async () => { const r = await inviteGuests(invite.id, true); if (r.csv) downloadCsv(`${invite.fields.headline || 'replies'}.csv`, r.csv); }}>Export CSV</button>
          </div>
          {rows.length === 0 && <p className="text-white/50 text-sm py-6 text-center">No replies yet. Share your link to start getting them.</p>}
          {rows.map(r => (
            <div key={r.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 grid gap-1">
              <div className="flex items-center gap-2"><b>{r.name}</b><span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/10">{r.status === 'yes' ? 'Going' : r.status}</span><span className="text-xs text-white/50 ml-auto">{r.adults + r.kids > 1 ? `party of ${r.adults + r.kids}` : ''}</span></div>
              {r.answers && Object.entries(r.answers).map(([k, v]) => <div key={k} className="text-xs text-white/70">{invite.questions.find(q => q.id === k)?.label}: <b>{v}</b></div>)}
              {r.bringing && <div className="text-xs text-white/70">Bringing: {r.bringing.map(b => invite.bringList.find(x => x.id === b)?.label).filter(Boolean).join(', ')}</div>}
              {r.note && <div className="text-xs text-white/70 italic">“{r.note}”</div>}
              {r.contact && <div className="text-xs text-white/50">{r.contact}</div>}
              <button className="text-xs text-white/40 justify-self-start underline" onClick={async () => { await removeRsvp(invite.id, r.id); load(); }}>Remove</button>
            </div>
          ))}
        </div>}

        {tab === 'plan' && <div className="grid gap-2">
          {plan.map(st => (
            <label key={st.id} className={`flex gap-3 items-start rounded-2xl border p-3 ${st.overdue ? 'border-amber-400/50' : 'border-white/10'} bg-white/[0.03]`}>
              <input type="checkbox" className="mt-1 w-5 h-5 accent-orange-500" checked={st.done} onChange={() => toggleStep(st.id)} />
              <span className="grid"><b className={st.done ? 'line-through opacity-60' : ''}>{st.title}</b>{st.detail && <span className="text-xs text-white/60">{st.detail}</span>}
                <span className="text-[11px] text-white/45">{st.weeksBefore < 0 ? 'After the event' : st.weeksBefore === 0 ? 'Day of' : `${st.weeksBefore} week${st.weeksBefore > 1 ? 's' : ''} before · ${new Date(st.due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}{st.overdue ? ' · overdue' : ''}</span></span>
            </label>
          ))}
          <div className="rounded-2xl border border-white/10 p-3 text-sm text-white/70">Running a bigger event? The <button className="underline" onClick={onOpenProduction}>Production Studio</button> tracks vendors, budget, contracts and payroll.{invite.eventId && <> Tickets and door scanning live in <button className="underline" onClick={() => onOpenTicketing?.(invite.eventId)}>Ticketing</button>.</>}</div>
        </div>}

        {tab === 'notes' && <div className="grid gap-2">
          {(data?.wall || []).length === 0 && <p className="text-white/50 text-sm">No notes yet.</p>}
          {(data?.wall || []).map(n => <div key={n.id} className="rounded-2xl border border-white/10 p-3 flex gap-3"><div className="min-w-0"><b>{n.name}</b><div className="text-sm text-white/80 break-words">{n.text}</div></div><button className="ml-auto text-xs underline text-white/50" onClick={async () => { await removeNote(invite.id, n.id); load(); }}>Remove</button></div>)}
        </div>}

        {tab === 'share' && <div className="grid gap-3">
          <ShareStep invite={invite} onManage={() => setTab('replies')} onPublish={() => onUpdate({ status: 'live' })} saving={false} />
          <div className="flex flex-wrap gap-2">
            <button className="pj-ghost" onClick={onEdit}>Edit details</button>
            {invite.status === 'live' && <button className="pj-ghost" onClick={() => onUpdate({ status: 'closed' })}>Close replies</button>}
            {invite.status === 'closed' && <button className="pj-ghost" onClick={() => onUpdate({ status: 'live' })}>Reopen replies</button>}
            {invite.status !== 'cancelled' && <button className="pj-ghost" onClick={() => onUpdate({ status: 'cancelled' })}>Cancel event</button>}
            {invite.clubId && <a className="pj-ghost" href={`/?club=${encodeURIComponent(invite.clubId)}`}>Open event room</a>}
            {invite.photoPoolId && <a className="pj-ghost" href={`/pool/${encodeURIComponent(invite.photoPoolId)}`}>Open photo pool</a>}
          </div>
        </div>}
      </div>
      <aside className="lg:sticky lg:top-4">{preview}</aside>
    </div>
  );
}

// ── Bits ────────────────────────────────────────────────────────────────────

function Frame({ title, subtitle, onBack, children }: { title: string; subtitle?: string; onBack(): void; children: React.ReactNode }) {
  return (
    <div className="min-h-full text-white px-4 py-5 sm:px-6 max-w-6xl mx-auto">
      <style>{STUDIO_CSS}</style>
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="h-10 w-10 rounded-full border border-white/15 grid place-items-center" aria-label="Back">←</button>
        <div className="min-w-0"><h1 className="text-2xl sm:text-3xl font-black italic uppercase tracking-tight truncate" style={{ fontFamily: 'Outfit, Inter, sans-serif' }}>{title}</h1>{subtitle && <p className="text-xs font-bold uppercase tracking-widest text-orange-400">{subtitle}</p>}</div>
      </div>
      {children}
    </div>
  );
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="grid gap-1"><span className="text-sm font-bold text-white/85">{label}</span>{children}{hint && <span className="text-xs text-white/50">{hint}</span>}</label>;
}
function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange(v: boolean): void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={`flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <input type="checkbox" role="switch" className="mt-0.5 w-5 h-5 accent-orange-500 shrink-0" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className="grid"><span className="font-semibold text-sm">{label}</span>{hint && <span className="text-xs text-white/55">{hint}</span>}</span>
    </label>
  );
}

const STUDIO_CSS = `
.pj-h2{font:900 italic 22px Outfit,Inter,sans-serif;text-transform:uppercase;margin:0 0 6px}
.pj-h3{font:800 12px Inter,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#FF8C00;margin:0}
.pj-input{width:100%;min-height:44px;border-radius:14px;border:1px solid rgba(255,255,255,.15);background:rgba(0,0,0,.3);color:#fff;padding:10px 12px;font:15px Inter,sans-serif}
.pj-input:focus-visible{outline:2px solid #00DAF3;outline-offset:1px}
.pj-cta{min-height:48px;padding:0 26px;border-radius:999px;border:0;background:linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00);color:#fff;font:800 13px Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}
.pj-cta:disabled{opacity:.5}
.pj-ghost{min-height:44px;padding:0 18px;border-radius:999px;border:1px solid rgba(255,255,255,.2);background:transparent;color:#fff;font:700 13px Inter,sans-serif;cursor:pointer;display:inline-flex;align-items:center;text-decoration:none}
.pj-chip{min-height:36px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.04);color:#fff;font:700 12px Inter,sans-serif;display:inline-flex;align-items:center;gap:4px;text-decoration:none;cursor:pointer}
.pj-chip-on{background:#fff;color:#000}
`;
