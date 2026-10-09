import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft, CalendarPlus, Check, Clock, Lock, MessageCircle, PenLine, Send, Wand2,
} from 'lucide-react';
import { Button, IconButton } from '../../ui';
import { auth } from '../../../services/firebase';
import { listenToMessages, sendMessage } from '../../../services/backendService';
import { decryptText, encryptText } from '../../../services/cryptoService';
import { saveTelaDoc } from '../../../services/telaStore';
import {
  listenLetters, markCorrespondenceRead, markLetterRead, reactToLetter, type Correspondence, type Letter,
} from '../../../services/postman/lettersService';
import { ensureLetterFonts, STAMPS, STATIONERY } from '../../../services/postman/letterStationery';
import { DAY, relativeWhen } from '../../../services/postman/calendarTime';
import { newEventId, saveEvent } from '../../../services/postman/calendarService';
import { MeasuredEmbed } from './LetterWriter';
import type { ChatMessage } from '../../../types';

/**
 * A correspondence, read the way pen-pal letters are kept: one sheet on top of
 * the next, theirs from the left and yours from the right, a postmark between
 * them saying how long the reply took. Chat lives in the margin — quick notes
 * beside the letters, never in place of them.
 */

const REACTIONS = ['♥', '☺', '✿', '☀', '✦'];

interface Props {
  correspondence: Correspondence;
  onBack: () => void;
  onWrite: () => void;
  onNotice: (n: { kind: 'ok' | 'error'; text: string }) => void;
}

const LetterChain: React.FC<Props> = ({ correspondence, onBack, onWrite, onNotice }) => {
  const uid = auth.currentUser?.uid ?? '';
  const { roomId, others } = correspondence;
  const [letters, setLetters] = useState<Letter[] | null>(null);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [showMargin, setShowMargin] = useState(false);
  const [now, setNow] = useState(Date.now());
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { ensureLetterFonts(); }, []);
  useEffect(() => {
    setLetters(null);
    const off = listenLetters(roomId, setLetters);
    void markCorrespondenceRead(roomId);
    return off;
  }, [roomId]);
  // Envelopes in transit open on their own when the time comes.
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(t); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [letters?.length]);

  const names = others.map((o) => o.name).join(', ');

  const openEnvelope = (l: Letter) => {
    setOpened((s) => new Set(s).add(l.id));
    void markLetterRead(roomId, l.id);
  };

  const addInvitation = async (l: Letter, i: number) => {
    const a = l.attachments[i];
    try {
      await saveEvent({
        id: newEventId(), title: a.title, start: a.start, end: a.end, allDay: a.allDay, location: a.location,
        layer: 'mine', source: 'letter', kindLabel: `Invitation from ${l.authorName}`,
        open: { kind: 'letter', correspondenceId: roomId }, reminders: [60],
      });
      onNotice({ kind: 'ok', text: `“${a.title}” is on your calendar.` });
    } catch (err) {
      onNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not add that to your calendar.' });
    }
  };

  const keepInTela = async (l: Letter) => {
    if (!l.doc) return;
    const copy = { ...l.doc, id: `tela_letter_${l.id}`, ownerId: uid, title: `Letter from ${l.authorName}`, updatedAt: Date.now() };
    const res = await saveTelaDoc(copy);
    if (res.ok) window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId: copy.id } }));
    else onNotice({ kind: 'error', text: 'Tela could not save a copy on this device.' });
  };

  return (
    <div className="flex-1 min-h-0 flex">
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-theme">
          <div className="flex items-center gap-3 min-w-0">
            <IconButton variant="ghost" size="sm" aria-label="All correspondence" onClick={onBack} className="lg:hidden"><ArrowLeft /></IconButton>
            <div className="flex -space-x-2 shrink-0">
              {others.slice(0, 3).map((o) => (
                o.photo
                  ? <img key={o.uid} src={o.photo} alt="" className="w-9 h-9 rounded-full object-cover ring-2" style={{ ['--tw-ring-color' as string]: 'var(--card-bg)' }} />
                  : <span key={o.uid} className="w-9 h-9 rounded-full grid place-items-center text-sm font-bold ring-2" style={{ background: 'var(--glass-3)', ['--tw-ring-color' as string]: 'var(--card-bg)' }}>{o.name[0]}</span>
              ))}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{names}</p>
              <p className="pj-eyebrow" style={{ opacity: 0.7 }}>
                {letters ? `${letters.length} ${letters.length === 1 ? 'letter' : 'letters'}` : 'Opening the box…'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" icon={<MessageCircle />} onClick={() => setShowMargin((s) => !s)} aria-pressed={showMargin}>
              Margin
            </Button>
            <Button variant="accent" size="sm" icon={<PenLine />} onClick={onWrite}>Write back</Button>
          </div>
        </div>

        {/* The chain */}
        <div className="flex-1 min-h-0 overflow-y-auto pm-desk">
          <div className="mx-auto w-full max-w-[760px] px-3 sm:px-8 py-8 flex flex-col gap-2">
            {letters === null && <ChainSkeleton />}
            {letters?.length === 0 && (
              <div className="text-center py-16 px-6">
                <p className="pm-script text-3xl mb-3">No letters yet.</p>
                <p className="text-sm max-w-sm mx-auto mb-6" style={{ color: 'var(--on-surface-variant)' }}>
                  You and {names} have talked in chat, but nobody has written a letter. Be the first — it doesn’t have to be long.
                </p>
                <Button variant="accent" icon={<PenLine />} onClick={onWrite}>Write the first letter</Button>
              </div>
            )}
            {letters?.map((l, i) => {
              const mine = l.authorId === uid;
              const prev = letters[i - 1];
              const pending = l.deliverAt > now;
              const sealed = l.delivery === 'sealed' && pending;
              const unopened = !mine && !pending && !l.readBy[uid] && !opened.has(l.id);
              const tilt = ((i * 37) % 5 - 2) * 0.35;
              return (
                <React.Fragment key={l.id}>
                  {prev && <Postmark from={prev.deliverAt} to={l.createdAt} sameAuthor={prev.authorId === l.authorId} />}
                  <motion.article
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: [0.2, 0, 0, 1] }}
                    className={`pm-chain-item ${mine ? 'pm-chain-item--mine' : 'pm-chain-item--theirs'}`}
                    aria-label={`Letter from ${l.authorName}`}
                  >
                    <div className="pm-chain-meta">
                      {l.authorPhoto
                        ? <img src={l.authorPhoto} alt="" className="w-6 h-6 rounded-full object-cover" />
                        : <span className="w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold" style={{ background: 'var(--glass-3)' }}>{l.authorName[0]}</span>}
                      <span className="font-semibold">{mine ? 'You' : l.authorName}</span>
                      <span style={{ opacity: 0.55 }}>{new Date(l.createdAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                      {l.place && <span style={{ opacity: 0.55 }}>· {l.place}</span>}
                      {mine && pending && (
                        <span className="pm-pill"><Clock size={10} /> {sealed ? `sealed until ${new Date(l.deliverAt).toLocaleDateString()}` : `arrives ${relativeWhen(l.deliverAt, now)}`}</span>
                      )}
                    </div>

                    <AnimatePresence mode="wait" initial={false}>
                      {!mine && pending ? (
                        <Envelope key="transit" letter={l} sealed={sealed} now={now} />
                      ) : unopened ? (
                        <Envelope key="closed" letter={l} onOpen={() => openEnvelope(l)} />
                      ) : (
                        <motion.div
                          key="sheet"
                          initial={{ opacity: 0, rotateX: -12, y: -10 }}
                          animate={{ opacity: 1, rotateX: 0, y: 0 }}
                          transition={{ duration: 0.6, ease: [0.2, 0, 0, 1] }}
                          className="pm-sheet-shadow rounded-[6px] overflow-hidden"
                          style={{ transform: `rotate(${tilt}deg)` }}
                        >
                          {l.doc
                            ? <MeasuredEmbed doc={l.doc} />
                            : <div className="p-8 text-sm" style={{ background: '#f6efe1', color: '#1f1b16' }}>{l.plainText || 'This letter could not be opened on this device.'}</div>}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {(!pending || mine) && !unopened && (
                      <div className="pm-chain-actions">
                        {l.attachments.map((a, ai) => (
                          <button key={ai} type="button" onClick={() => void addInvitation(l, ai)} className="pm-invite tap">
                            <CalendarPlus size={14} />
                            <span>
                              <b>{a.title}</b>
                              <span className="block text-[11px]" style={{ opacity: 0.7 }}>
                                {new Date(a.start).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: a.allDay ? undefined : 'numeric', minute: a.allDay ? undefined : '2-digit' })}
                                {a.location ? ` · ${a.location}` : ''} — add to calendar
                              </span>
                            </span>
                          </button>
                        ))}
                        <div className="flex items-center gap-1 flex-wrap">
                          {REACTIONS.map((r) => {
                            const mineR = l.reactions[uid] === r;
                            const count = Object.values(l.reactions).filter((x) => x === r).length;
                            return (
                              <button
                                key={r}
                                type="button"
                                aria-pressed={mineR}
                                onClick={() => void reactToLetter(roomId, l.id, mineR ? null : r)}
                                className="pm-react tap"
                                title={mine ? 'React' : `React to ${l.authorName}'s letter`}
                              >
                                {r}{count > 0 && <span>{count}</span>}
                              </button>
                            );
                          })}
                          {l.doc && (
                            <button type="button" onClick={() => void keepInTela(l)} className="pm-react tap" title="Keep a copy in Tela">
                              <Wand2 size={12} /> <span>Keep</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </motion.article>
                </React.Fragment>
              );
            })}
            {letters && letters.length > 0 && letters[letters.length - 1].authorId !== uid && letters[letters.length - 1].deliverAt <= now && (
              <div className="text-center pt-6 pb-2">
                <p className="pm-script text-2xl mb-3" style={{ opacity: 0.8 }}>Your turn — whenever you’re ready.</p>
                <Button variant="secondary" icon={<PenLine />} onClick={onWrite}>Write back</Button>
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showMargin && <Margin roomId={roomId} names={names} onClose={() => setShowMargin(false)} />}
      </AnimatePresence>
    </div>
  );
};

/* ── Envelope ──────────────────────────────────────────────────────────────── */

const Envelope: React.FC<{ letter: Letter; sealed?: boolean; now?: number; onOpen?: () => void }> = ({ letter, sealed, now = Date.now(), onOpen }) => {
  const st = STATIONERY.find((s) => s.id === letter.stationery);
  const stamp = STAMPS.find((s) => s.id === letter.stampId);
  const waiting = !onOpen;
  const days = Math.ceil((letter.deliverAt - now) / DAY);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: 30, scale: 0.98 }}
      transition={{ duration: 0.35 }}
      className={`pm-envelope ${waiting ? '' : 'pm-envelope--ready'}`}
      style={{ ['--pm-env' as string]: st?.paper ?? '#efe6d4' }}
    >
      <button type="button" disabled={waiting} onClick={onOpen} className="pm-envelope__body tap" aria-label={waiting ? 'Letter not yet arrived' : `Open the letter from ${letter.authorName}`}>
        <span className="pm-envelope__flap" aria-hidden />
        {stamp && <span className="pm-envelope__stamp" style={{ background: stamp.tint }} aria-hidden>{stamp.glyph}</span>}
        <span className="pm-envelope__addr">
          <span className="pm-script" style={{ fontSize: 26 }}>from {letter.authorName}</span>
          {letter.place && <span className="block text-xs" style={{ opacity: 0.6 }}>{letter.place}</span>}
        </span>
        {sealed ? (
          <span className="pm-envelope__seal" aria-hidden><Lock size={16} /></span>
        ) : null}
        <span className="pm-envelope__status">
          {sealed
            ? <>Sealed — opens {new Date(letter.deliverAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}{days > 1 ? ` · ${days} days` : ''}</>
            : waiting
              ? <><Send size={12} /> In the post — arrives {relativeWhen(letter.deliverAt, now)}</>
              : <><Check size={12} /> Arrived — tap to open</>}
        </span>
      </button>
    </motion.div>
  );
};

/* ── Postmark between letters ──────────────────────────────────────────────── */

const Postmark: React.FC<{ from: number; to: number; sameAuthor: boolean }> = ({ from, to, sameAuthor }) => {
  const gap = to - from;
  const label = gap < 3_600_000 ? (sameAuthor ? 'and then, a postscript' : 'replied right away')
    : gap < DAY ? (sameAuthor ? 'later that day' : 'replied the same day')
    : `${Math.round(gap / DAY)} ${Math.round(gap / DAY) === 1 ? 'day' : 'days'} later`;
  return (
    <div className="pm-postmark-divider" aria-hidden>
      <span className="pm-postmark-divider__ring">{label}</span>
    </div>
  );
};

const ChainSkeleton = () => (
  <div className="flex flex-col gap-8 py-6" aria-hidden>
    {[0, 1].map((i) => <div key={i} className={`pm-skel-sheet ${i ? 'ml-auto' : ''}`} />)}
  </div>
);

/* ── Margin: the chat beside the letters ───────────────────────────────────── */

const Margin: React.FC<{ roomId: string; names: string; onClose: () => void }> = ({ roomId, names, onClose }) => {
  const uid = auth.currentUser?.uid ?? '';
  const [notes, setNotes] = useState<Array<ChatMessage & { plain: string }>>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const off = listenToMessages(roomId, async (msgs) => {
      const out = await Promise.all(msgs.slice(-60).map(async (m) => {
        let plain = '';
        try { plain = m.text ? await decryptText(m.text, roomId) : ''; } catch { plain = ''; }
        return { ...m, plain };
      }));
      if (alive) setNotes(out);
    }, 60);
    return () => { alive = false; off(); };
  }, [roomId]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [notes.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const u = auth.currentUser!;
      await sendMessage(roomId, {
        senderId: u.uid, senderName: u.displayName || 'You', senderPhoto: u.photoURL || '',
        text: await encryptText(text, roomId), type: 'TEXT',
      } as never);
      setDraft('');
    } catch { /* the standing banner explains a Fair Process refusal */ }
    finally { setSending(false); }
  };

  const visible = useMemo(() => notes.filter((n) => n.plain || n.type === 'TEXT'), [notes]);

  return (
    <motion.aside
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 40, opacity: 0 }}
      transition={{ duration: 0.28, ease: [0.2, 0, 0, 1] }}
      className="w-full sm:w-[320px] shrink-0 border-l border-theme flex flex-col absolute sm:static inset-0 z-10"
      style={{ background: 'var(--card-bg)' }}
      aria-label="Margin notes"
    >
      <div className="shrink-0 px-4 py-3 border-b border-theme flex items-center justify-between">
        <div>
          <p className="pj-eyebrow">In the margin</p>
          <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>Your chat with {names}. Quick notes — letters stay above.</p>
        </div>
        <IconButton variant="ghost" size="sm" aria-label="Close margin" onClick={onClose}><ArrowLeft className="rotate-180" /></IconButton>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 flex flex-col gap-1.5">
        {visible.length === 0 && <p className="text-xs text-center py-8" style={{ color: 'var(--on-surface-variant)' }}>Nothing in the margin yet.</p>}
        {visible.map((n) => {
          const mine = n.senderId === uid;
          const isLetterLine = !!(n as ChatMessage).letterId;
          return (
            <div key={n.id} className={`pm-note ${mine ? 'pm-note--mine' : ''} ${isLetterLine ? 'pm-note--letter' : ''}`}>
              {n.plain || '…'}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form
        className="shrink-0 p-3 border-t border-theme flex items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); void send(); }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="A note in the margin…"
          className="pj-input flex-1"
          maxLength={2000}
          aria-label="Margin note"
        />
        <IconButton variant="accent" size="sm" aria-label="Send note" type="submit" disabled={!draft.trim() || sending}><Send /></IconButton>
      </form>
    </motion.aside>
  );
};

export default LetterChain;
