import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import {
  CalendarPlus, Clock, Eye, Feather, Loader2, Lock, MapPin, PenLine, Search, Send, Sparkles, Wand2, X,
} from 'lucide-react';
import { Button, IconButton } from '../../ui';
import { auth } from '../../../services/firebase';
import { searchUserProfilesSafe } from '../../../services/searchUsersSafe';
import { loadTelaDoc, saveTelaDoc } from '../../../services/telaStore';
import { fontCss } from '../../../services/tela/telaFonts';
import {
  buildLetterDoc, DEFAULT_LETTER, ensureLetterFonts, HANDS, INK_IDS, inkColor, inkLabel, letterPlainText,
  STAMPS, STATIONERY, telaDocPlainText, type HandId, type InkId, type LetterContent, type StationeryId,
} from '../../../services/postman/letterStationery';
import {
  openCorrespondenceWith, sendLetter, slowPostArrival, type Delivery, type LetterAttachment,
} from '../../../services/postman/lettersService';
import { fmtRange, parseQuickAdd } from '../../../services/postman/calendarTime';
import type { TelaDoc, UserProfile } from '../../../types';

const TelaEmbed = lazy(() => import('../../tela/TelaEmbed'));
const TelaView = lazy(() => import('../../tela/TelaView'));

/**
 * The writing desk. Words go onto real paper in the chosen hand as you type —
 * the surface you write on is styled like the sheet that will arrive, and
 * "See it as sent" shows the actual Tela document. "Finish in Tela" hands the
 * letter to the full editor for anything the desk can't do: photos, drawings,
 * collage, a pressed flower drawn by hand.
 */

export interface LetterWriterProps {
  /** Reply inside an existing correspondence. */
  roomId?: string;
  toName?: string;
  /** Pre-chosen recipient (from a profile, a chat, the calendar). */
  toUser?: { uid: string; name: string; photo?: string };
  replyingToName?: string;
  onClose: () => void;
  onSent: (roomId: string) => void;
}

const LetterWriter: React.FC<LetterWriterProps> = ({ roomId: fixedRoom, toName, toUser, replyingToName, onClose, onSent }) => {
  const me = auth.currentUser;
  const [recipient, setRecipient] = useState<{ uid: string; name: string; photo?: string } | null>(toUser ?? null);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);

  const firstName = (n?: string) => (n || '').split(/\s+/)[0] || 'friend';
  const [content, setContent] = useState<LetterContent>(() => ({
    ...DEFAULT_LETTER,
    salutation: `Dear ${firstName(toName ?? toUser?.name ?? replyingToName)},`,
    signature: firstName(me?.displayName ?? ''),
    fromName: me?.displayName || 'A friend',
    dated: Date.now(),
  }));
  const [delivery, setDelivery] = useState<Delivery>('now');
  const [sealDate, setSealDate] = useState('');
  const [invite, setInvite] = useState('');
  const [preview, setPreview] = useState(false);
  const [telaDoc, setTelaDoc] = useState<TelaDoc | null>(null);
  const [telaEditingId, setTelaEditingId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { ensureLetterFonts(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !telaEditingId) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, telaEditingId]);

  // Recipient search — the same safe search chat uses, so blocked/hidden people never appear.
  useEffect(() => {
    if (fixedRoom || recipient) return;
    const term = search.trim();
    if (term.length < 2) { setFound([]); return; }
    setSearching(true);
    const t = window.setTimeout(async () => {
      try { setFound((await searchUserProfilesSafe(term, 8)).filter((u) => u.uid !== me?.uid)); }
      catch { setFound([]); }
      finally { setSearching(false); }
    }, 260);
    return () => window.clearTimeout(t);
  }, [search, fixedRoom, recipient, me?.uid]);

  const set = <K extends keyof LetterContent>(k: K, v: LetterContent[K]) => setContent((c) => ({ ...c, [k]: v }));
  const stationery = STATIONERY.find((s) => s.id === content.stationery) ?? STATIONERY[0];
  const hand = HANDS[content.hand];
  const ink = inkColor(content.ink ?? stationery.ink, !!stationery.dark);

  const builtDoc = useMemo(
    () => (preview ? buildLetterDoc(content, { docId: 'letter-preview', ownerId: me?.uid ?? 'me' }) : null),
    [preview, content, me?.uid],
  );

  const inviteParsed = useMemo(() => (invite.trim().length > 3 ? parseQuickAdd(invite) : null), [invite]);

  const sealAt = useMemo(() => {
    if (!sealDate) return null;
    const [y, m, d] = sealDate.split('-').map(Number);
    const t = new Date(y, m - 1, d, 8, 0, 0, 0).getTime();
    return Number.isFinite(t) ? t : null;
  }, [sealDate]);

  const finishInTela = useCallback(async () => {
    const id = `letter_${Date.now().toString(36)}`;
    const doc = telaDoc ?? buildLetterDoc(content, { docId: id, ownerId: me?.uid ?? 'me' });
    const res = await saveTelaDoc({ ...doc, id: doc.id || id });
    if (!res.ok) { setError('Tela could not open this letter on this device.'); return; }
    setTelaEditingId(doc.id || id);
  }, [content, me?.uid, telaDoc]);

  const returnFromTela = useCallback(async () => {
    const id = telaEditingId;
    setTelaEditingId(null);
    if (!id) return;
    const doc = await loadTelaDoc(id);
    if (doc) { setTelaDoc(doc); setPreview(true); }
  }, [telaEditingId]);

  const canSend = !!(fixedRoom || recipient)
    && (telaDoc ? true : content.body.trim().length > 0)
    && (delivery !== 'sealed' || (sealAt !== null && sealAt > Date.now()));

  const send = async () => {
    if (!canSend || sending) return;
    setSending(true);
    setError(null);
    try {
      const roomId = fixedRoom ?? await openCorrespondenceWith(recipient!.uid);
      const doc = telaDoc ?? buildLetterDoc({ ...content, dated: Date.now() }, { docId: `letter_${Date.now().toString(36)}`, ownerId: me?.uid ?? 'me' });
      const attachments: LetterAttachment[] = inviteParsed?.confident
        ? [{ kind: 'invitation', title: inviteParsed.title, start: inviteParsed.start, end: inviteParsed.end, allDay: inviteParsed.allDay, location: inviteParsed.location }]
        : [];
      await sendLetter({
        roomId,
        doc,
        plainText: telaDoc ? telaDocPlainText(telaDoc) : letterPlainText(content),
        delivery,
        deliverAt: delivery === 'slow' ? slowPostArrival() : delivery === 'sealed' ? sealAt ?? undefined : undefined,
        stationery: telaDoc ? 'custom' : content.stationery,
        hand: content.hand,
        ink: content.ink,
        stampId: content.stampId,
        place: content.place?.trim() || undefined,
        fromTela: !!telaDoc,
        attachments,
      });
      onSent(roomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The letter could not be posted.');
    } finally {
      setSending(false);
    }
  };

  const paperStyle: React.CSSProperties = {
    background: stationery.paper,
    color: ink,
    ['--pm-ink' as string]: ink,
    ['--pm-accent' as string]: stationery.accent,
  };
  const handStyle: React.CSSProperties = {
    fontFamily: fontCss(hand.body),
    fontSize: `clamp(15px, ${hand.size / 16}rem, ${hand.size}px)`,
    lineHeight: hand.leading,
    color: ink,
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[140] flex flex-col"
      style={{ background: "color-mix(in srgb, var(--bg-color, #0a0a0f) 96%, #000)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Write a letter"
    >
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-theme" style={{ background: 'var(--card-bg)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <Feather size={18} className="text-brand-orange shrink-0" />
          <div className="min-w-0">
            <p className="pj-eyebrow">{fixedRoom ? 'Writing back' : 'A new letter'}</p>
            <p className="text-sm font-semibold truncate">
              {fixedRoom ? `To ${toName ?? 'your pen pal'}` : recipient ? `To ${recipient.name}` : 'Who is it for?'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={<Eye />} onClick={() => setPreview((p) => !p)} aria-pressed={preview}>
            {preview ? 'Keep writing' : 'See it as sent'}
          </Button>
          <Button variant="secondary" size="sm" icon={<Wand2 />} onClick={() => void finishInTela()}>
            {telaDoc ? 'Edit in Tela' : 'Finish in Tela'}
          </Button>
          <IconButton variant="ghost" size="sm" aria-label="Close" onClick={onClose}><X /></IconButton>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* ── The paper ─────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto pm-desk">
          <div className="mx-auto w-full max-w-[680px] px-3 sm:px-6 py-6 sm:py-10">
            {!fixedRoom && !recipient && (
              <div className="mb-6 rounded-card border border-theme p-4" style={{ background: 'var(--card-bg)' }}>
                <label className="pj-eyebrow block mb-2" htmlFor="pm-to">To</label>
                <div className="flex items-center gap-2 pj-input" style={{ display: 'flex' }}>
                  <Search size={14} style={{ opacity: 0.5 }} />
                  <input
                    id="pm-to"
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search for someone on Plajah"
                    className="flex-1 bg-transparent outline-none text-sm"
                  />
                  {searching && <Loader2 size={14} className="animate-spin" />}
                </div>
                {found.length > 0 && (
                  <ul className="mt-2 flex flex-col">
                    {found.map((u) => (
                      <li key={u.uid}>
                        <button
                          type="button"
                          onClick={() => {
                            setRecipient({ uid: u.uid, name: u.displayName, photo: u.photoURL });
                            set('salutation', `Dear ${firstName(u.displayName)},`);
                          }}
                          className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left hover:bg-white/5 tap"
                        >
                          {u.photoURL
                            ? <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full object-cover" />
                            : <span className="w-8 h-8 rounded-full grid place-items-center text-xs font-bold" style={{ background: 'var(--glass-3)' }}>{u.displayName?.[0] ?? '?'}</span>}
                          <span className="text-sm font-semibold">{u.displayName}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs mt-3" style={{ color: 'var(--on-surface-variant)' }}>
                  Letters go only to Plajah accounts, through the same safety checks as messages.
                </p>
              </div>
            )}

            {preview && (builtDoc || telaDoc) ? (
              <div className="pm-sheet-shadow rounded-[6px] overflow-hidden mx-auto" style={{ maxWidth: 640 }}>
                <Suspense fallback={<div className="h-[600px] grid place-items-center"><Loader2 className="animate-spin" /></div>}>
                  <MeasuredEmbed doc={(telaDoc ?? builtDoc)!} />
                </Suspense>
              </div>
            ) : (
              <div className="pm-paper pm-sheet-shadow" data-stationery={content.stationery} style={paperStyle}>
                <div className="pm-paper__head">
                  <span className="pm-paper__from" style={{ color: stationery.accent }}>{content.fromName}</span>
                  <span className="pm-paper__date">
                    {[content.place?.trim(), new Date(content.dated).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })].filter(Boolean).join(' · ')}
                  </span>
                  {content.stampId && (
                    <span className="pm-paper__stamp" style={{ background: STAMPS.find((s) => s.id === content.stampId)?.tint }} aria-hidden>
                      {STAMPS.find((s) => s.id === content.stampId)?.glyph}
                    </span>
                  )}
                </div>
                <input
                  aria-label="Salutation"
                  value={content.salutation}
                  onChange={(e) => set('salutation', e.target.value)}
                  className="pm-paper__line"
                  style={{ ...handStyle, fontSize: `calc(${handStyle.fontSize} * 1.15)` }}
                />
                <textarea
                  ref={bodyRef}
                  aria-label="Your letter"
                  value={content.body}
                  onChange={(e) => set('body', e.target.value)}
                  placeholder="Write as much or as little as you like. No one is waiting on a typing bubble."
                  className="pm-paper__body"
                  style={{ ...handStyle, minHeight: 320 }}
                  rows={Math.max(10, content.body.split('\n').length + 3)}
                />
                <div className="pm-paper__close">
                  <input aria-label="Sign-off" value={content.signoff} onChange={(e) => set('signoff', e.target.value)} className="pm-paper__line" style={handStyle} />
                  <input
                    aria-label="Signature"
                    value={content.signature}
                    onChange={(e) => set('signature', e.target.value)}
                    className="pm-paper__line"
                    style={{ ...handStyle, fontFamily: fontCss(hand.signature), fontSize: `calc(${handStyle.fontSize} * 1.7)`, lineHeight: 1.1 }}
                  />
                </div>
                {telaDoc && (
                  <p className="pm-paper__note">This letter was finished in Tela — what you see in “See it as sent” is what arrives.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── The drawer: paper, hand, ink, stamp, post ───────────────────── */}
        <aside className="lg:w-[340px] shrink-0 border-t lg:border-t-0 lg:border-l border-theme overflow-y-auto max-h-[42vh] lg:max-h-none" style={{ background: 'var(--card-bg)' }}>
          <div className="p-5 flex flex-col gap-6">
            <section>
              <p className="pj-eyebrow mb-2.5">Paper</p>
              <div className="grid grid-cols-4 gap-2">
                {STATIONERY.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    title={`${s.label} — ${s.note}`}
                    aria-pressed={content.stationery === s.id}
                    onClick={() => set('stationery', s.id as StationeryId)}
                    className="pm-swatch tap"
                    data-stationery={s.id}
                    style={{ background: s.paper, outlineColor: content.stationery === s.id ? 'var(--pj-orange)' : 'transparent' }}
                  >
                    <span style={{ color: s.accent }}>{s.label}</span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <p className="pj-eyebrow mb-2.5">Hand</p>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(HANDS) as HandId[]).map((h) => (
                  <button
                    key={h}
                    type="button"
                    aria-pressed={content.hand === h}
                    onClick={() => set('hand', h)}
                    className="pm-chip tap"
                    style={{ fontFamily: fontCss(HANDS[h].body), fontSize: 15 }}
                  >
                    {HANDS[h].label}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <p className="pj-eyebrow mb-2.5">Ink</p>
              <div className="flex flex-wrap gap-2">
                {INK_IDS.map((i) => (
                  <button
                    key={i}
                    type="button"
                    title={inkLabel(i)}
                    aria-label={inkLabel(i)}
                    aria-pressed={(content.ink ?? stationery.ink) === i}
                    onClick={() => set('ink', i as InkId)}
                    className="w-7 h-7 rounded-full tap"
                    style={{
                      background: inkColor(i, !!stationery.dark),
                      boxShadow: (content.ink ?? stationery.ink) === i ? '0 0 0 2px var(--card-bg), 0 0 0 4px var(--pj-orange)' : '0 0 0 1px var(--border-color)',
                    }}
                  />
                ))}
              </div>
            </section>

            <section>
              <p className="pj-eyebrow mb-2.5">Stamp</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => set('stampId', undefined)} aria-pressed={!content.stampId} className="pm-stamp-pick tap" style={{ background: 'transparent', color: 'var(--on-surface-variant)' }}>None</button>
                {STAMPS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    title={s.label}
                    aria-label={`${s.label} stamp`}
                    aria-pressed={content.stampId === s.id}
                    onClick={() => set('stampId', s.id)}
                    className="pm-stamp-pick tap"
                    style={{ background: s.tint }}
                  >
                    {s.glyph}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <label className="pj-eyebrow mb-2 flex items-center gap-1.5" htmlFor="pm-place"><MapPin size={11} /> Written from</label>
              <input
                id="pm-place"
                className="pj-input w-full"
                value={content.place ?? ''}
                onChange={(e) => set('place', e.target.value)}
                placeholder="Optional — “a rainy café in Accra”"
                maxLength={60}
              />
              <p className="text-[11px] mt-1.5" style={{ color: 'var(--on-surface-variant)' }}>Only what you type here. Plajah never adds your location.</p>
            </section>

            <section>
              <label className="pj-eyebrow mb-2 flex items-center gap-1.5" htmlFor="pm-invite"><CalendarPlus size={11} /> Enclose an invitation</label>
              <input
                id="pm-invite"
                className="pj-input w-full"
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
                placeholder="“Dinner at mine saturday 7pm”"
              />
              {inviteParsed && (
                <p className="text-[11px] mt-1.5" style={{ color: inviteParsed.confident ? 'var(--text-primary)' : 'var(--on-surface-variant)' }}>
                  {inviteParsed.confident
                    ? <>📅 <b>{inviteParsed.title}</b> · {new Date(inviteParsed.start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {fmtRange(inviteParsed.start, inviteParsed.end, inviteParsed.allDay)}</>
                    : 'Add a day or time and it becomes a card they can drop into their calendar.'}
                </p>
              )}
            </section>

            <section>
              <p className="pj-eyebrow mb-2.5">How should it travel?</p>
              <div className="flex flex-col gap-1.5">
                {([
                  { id: 'now', icon: <Send size={13} />, label: 'Deliver now', note: 'It arrives as soon as you post it.' },
                  { id: 'slow', icon: <Clock size={13} />, label: 'Slow post', note: 'Arrives tomorrow at 8 in the morning. Something to wake up to.' },
                  { id: 'sealed', icon: <Lock size={13} />, label: 'Seal until a date', note: 'A time capsule — birthdays, anniversaries, “open when…”.' },
                ] as const).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={delivery === d.id}
                    onClick={() => setDelivery(d.id)}
                    className="text-left rounded-card border px-3 py-2.5 tap transition-colors"
                    style={{ borderColor: delivery === d.id ? 'var(--pj-orange)' : 'var(--border-color)', background: delivery === d.id ? 'var(--pj-orange-soft)' : 'transparent' }}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">{d.icon}{d.label}</span>
                    <span className="block text-[11px] mt-0.5" style={{ color: 'var(--on-surface-variant)' }}>{d.note}</span>
                  </button>
                ))}
                {delivery === 'sealed' && (
                  <input
                    type="date"
                    className="pj-input w-full mt-1"
                    value={sealDate}
                    min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
                    onChange={(e) => setSealDate(e.target.value)}
                    aria-label="Open on"
                  />
                )}
                {delivery !== 'now' && (
                  <p className="text-[11px]" style={{ color: 'var(--on-surface-variant)' }}>
                    Slow post and seals pace the reading — they are not a lock. The letter is stored the moment you post it.
                  </p>
                )}
              </div>
            </section>

            {error && <p className="text-sm text-state-danger" role="alert">{error}</p>}

            <Button
              variant="accent"
              size="lg"
              fullWidth
              icon={sending ? undefined : delivery === 'sealed' ? <Lock /> : <PenLine />}
              loading={sending}
              disabled={!canSend}
              onClick={() => void send()}
            >
              {delivery === 'sealed' ? 'Seal and post' : delivery === 'slow' ? 'Post it' : 'Send the letter'}
            </Button>
            <p className="text-[11px] -mt-3 flex items-center gap-1.5" style={{ color: 'var(--on-surface-variant)' }}>
              <Sparkles size={11} /> No read receipts, no typing bubbles. They’ll write back when they’re ready.
            </p>
          </div>
        </aside>
      </div>

      {telaEditingId && createPortal(
        <div className="fixed inset-0 z-[400]" style={{ background: '#0a0a10' }}>
          <Suspense fallback={<p className="p-8">Opening Tela…</p>}>
            <TelaView initialDocId={telaEditingId} onBack={() => void returnFromTela()} />
          </Suspense>
        </div>,
        document.body,
      )}
    </motion.div>,
    document.body,
  );
};

/** TelaEmbed needs a pixel width; this measures the column it sits in. */
export const MeasuredEmbed: React.FC<{ doc: TelaDoc; max?: number }> = ({ doc, max = 640 }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.min(max, Math.floor(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [max]);
  return (
    <div ref={ref} className="w-full">
      {w > 0 && (
        <Suspense fallback={<div style={{ height: w * 1.3 }} className="grid place-items-center"><Loader2 className="animate-spin" /></div>}>
          <TelaEmbed docId={doc.id} snapshot={doc} mode="follow-latest" width={w} />
        </Suspense>
      )}
    </div>
  );
};

export default LetterWriter;
