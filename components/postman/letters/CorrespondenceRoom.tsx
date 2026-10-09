import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Building2, Feather, Inbox, Loader2, PenLine, Send, X } from 'lucide-react';
import { Button, IconButton } from '../../ui';
import {
  fetchBulletins, listenCorrespondences, type Bulletin, type Correspondence,
} from '../../../services/postman/lettersService';
import { ensureLetterFonts, STATIONERY } from '../../../services/postman/letterStationery';
import { relativeWhen } from '../../../services/postman/calendarTime';
import LetterChain from './LetterChain';
import LetterWriter, { MeasuredEmbed } from './LetterWriter';

/**
 * Letters — the Plajah-to-Plajah half of The Post Man.
 *
 * Shelves, not an inbox. "Your turn" holds letters waiting on you without a
 * red number shouting about it; "In the post" shows what is on its way;
 * businesses you follow sit on their own shelf so a friend's letter is never
 * buried under a newsletter.
 */

interface Props {
  /** Open straight into this correspondence (deep link / notification). */
  initialRoomId?: string | null;
  /** Bumped by the shell's "Write a letter" button. */
  composeSignal: number;
  onNotice: (n: { kind: 'ok' | 'error'; text: string }) => void;
}

const CorrespondenceRoom: React.FC<Props> = ({ initialRoomId, composeSignal, onNotice }) => {
  const [list, setList] = useState<Correspondence[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(initialRoomId ?? null);
  const [writing, setWriting] = useState<{ roomId?: string; toName?: string } | null>(null);
  const [bulletins, setBulletins] = useState<Bulletin[] | null>(null);
  const [reading, setReading] = useState<Bulletin | null>(null);
  const [showAllPeople, setShowAllPeople] = useState(false);

  useEffect(() => { ensureLetterFonts(); return listenCorrespondences(setList); }, []);
  useEffect(() => { void fetchBulletins().then(setBulletins).catch(() => setBulletins([])); }, []);
  useEffect(() => { if (initialRoomId) setActiveId(initialRoomId); }, [initialRoomId]);
  useEffect(() => { if (composeSignal > 0) setWriting({}); }, [composeSignal]);

  const active = list?.find((c) => c.roomId === activeId) ?? null;

  const shelves = useMemo(() => {
    const l = list ?? [];
    const withLetters = l.filter((c) => c.meta);
    return {
      yourTurn: withLetters.filter((c) => c.yourTurn && !c.inTransitUntil),
      inPost: withLetters.filter((c) => c.inTransitUntil),
      rest: withLetters.filter((c) => !c.yourTurn && !c.inTransitUntil),
      people: l.filter((c) => !c.meta),
    };
  }, [list]);

  const empty = list !== null && shelves.yourTurn.length + shelves.inPost.length + shelves.rest.length === 0;

  return (
    <div className="flex-1 min-h-0 flex">
      {/* ── Shelves ───────────────────────────────────────────────────────── */}
      <aside
        className={`w-full lg:w-[360px] shrink-0 border-r border-theme overflow-y-auto ${active ? 'hidden lg:block' : ''}`}
        aria-label="Correspondence"
      >
        <div className="px-4 py-4 flex flex-col gap-6">
          {list === null && <div className="py-10 grid place-items-center"><Loader2 className="animate-spin" /></div>}

          {shelves.yourTurn.length > 0 && (
            <Shelf title="Your turn" hint="They wrote last. No rush.">
              {shelves.yourTurn.map((c) => <EnvelopeRow key={c.roomId} c={c} active={c.roomId === activeId} onClick={() => setActiveId(c.roomId)} />)}
            </Shelf>
          )}
          {shelves.inPost.length > 0 && (
            <Shelf title="In the post" hint="On its way to you.">
              {shelves.inPost.map((c) => <EnvelopeRow key={c.roomId} c={c} active={c.roomId === activeId} onClick={() => setActiveId(c.roomId)} />)}
            </Shelf>
          )}
          {shelves.rest.length > 0 && (
            <Shelf title="Correspondence">
              {shelves.rest.map((c) => <EnvelopeRow key={c.roomId} c={c} active={c.roomId === activeId} onClick={() => setActiveId(c.roomId)} />)}
            </Shelf>
          )}

          {empty && (
            <div className="rounded-card border border-theme p-5 text-center" style={{ background: 'var(--glass-1)' }}>
              <Feather className="mx-auto mb-3 text-brand-orange" />
              <p className="pm-script text-2xl mb-1.5">Write someone a letter.</p>
              <p className="text-xs mb-4" style={{ color: 'var(--on-surface-variant)' }}>
                Not a message — a letter. Paper, a hand, a stamp. It arrives as a page they can keep.
              </p>
              <Button variant="accent" size="sm" icon={<PenLine />} onClick={() => setWriting({})}>Start a letter</Button>
            </div>
          )}

          {shelves.people.length > 0 && (
            <Shelf title="People you chat with" hint="Turn a conversation into a correspondence.">
              {(showAllPeople ? shelves.people : shelves.people.slice(0, 5)).map((c) => (
                <button
                  key={c.roomId}
                  type="button"
                  onClick={() => setWriting({ roomId: c.roomId, toName: c.others.map((o) => o.name).join(', ') })}
                  className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left hover:bg-white/5 tap"
                >
                  <Avatar name={c.others[0]?.name} photo={c.others[0]?.photo} size={28} />
                  <span className="text-sm truncate flex-1">{c.others.map((o) => o.name).join(', ')}</span>
                  <PenLine size={13} style={{ opacity: 0.5 }} />
                </button>
              ))}
              {shelves.people.length > 5 && (
                <button type="button" className="text-xs px-2.5 py-1 tap" style={{ color: 'var(--on-surface-variant)' }} onClick={() => setShowAllPeople((s) => !s)}>
                  {showAllPeople ? 'Show fewer' : `Show all ${shelves.people.length}`}
                </button>
              )}
            </Shelf>
          )}

          <Shelf title="From businesses you follow" hint="Kept apart from your letters. Unfollow and the shelf empties.">
            {bulletins === null && <p className="text-xs px-2.5" style={{ color: 'var(--on-surface-variant)' }}>Checking the shelf…</p>}
            {bulletins?.length === 0 && <p className="text-xs px-2.5" style={{ color: 'var(--on-surface-variant)' }}>Nothing from businesses you follow.</p>}
            {bulletins?.slice(0, 12).map((b) => (
              <button key={b.id} type="button" onClick={() => setReading(b)} className="w-full flex items-start gap-3 px-2.5 py-2.5 rounded-lg text-left hover:bg-white/5 tap">
                <Avatar name={b.authorName} photo={b.authorPhoto} size={30} square />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold truncate">{b.authorName}</span>
                    <span className="text-[10px] shrink-0" style={{ opacity: 0.5 }}>{relativeWhen(b.createdAt)}</span>
                  </span>
                  <span className="block text-xs truncate" style={{ color: 'var(--on-surface-variant)' }}>{b.title}</span>
                </span>
              </button>
            ))}
          </Shelf>
        </div>
      </aside>

      {/* ── The open correspondence ──────────────────────────────────────── */}
      <div className={`flex-1 min-w-0 flex relative ${active ? '' : 'hidden lg:flex'}`}>
        {active ? (
          <LetterChain
            key={active.roomId}
            correspondence={active}
            onBack={() => setActiveId(null)}
            onWrite={() => setWriting({ roomId: active.roomId, toName: active.others.map((o) => o.name).join(', ') })}
            onNotice={onNotice}
          />
        ) : (
          <div className="flex-1 grid place-items-center pm-desk">
            <div className="text-center px-8 max-w-md">
              <Inbox className="mx-auto mb-4" style={{ opacity: 0.35 }} size={36} />
              <p className="pm-script text-3xl mb-2">Pick up a letter.</p>
              <p className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>
                Every correspondence reads as a stack of pages, oldest at the top. Chat with the same person sits in the margin.
              </p>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {writing && (
          <LetterWriter
            roomId={writing.roomId}
            toName={writing.toName}
            onClose={() => setWriting(null)}
            onSent={(roomId) => {
              setWriting(null);
              setActiveId(roomId);
              onNotice({ kind: 'ok', text: 'Your letter is in the post.' });
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {reading && <BulletinReader bulletin={reading} onClose={() => setReading(null)} />}
      </AnimatePresence>
    </div>
  );
};

const Shelf: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <section>
    <div className="px-2.5 mb-2">
      <p className="pj-eyebrow">{title}</p>
      {hint && <p className="text-[11px]" style={{ color: 'var(--on-surface-variant)' }}>{hint}</p>}
    </div>
    <div className="flex flex-col gap-1">{children}</div>
  </section>
);

const Avatar: React.FC<{ name?: string; photo?: string; size: number; square?: boolean }> = ({ name, photo, size, square }) => (
  photo
    ? <img src={photo} alt="" className={`object-cover shrink-0 ${square ? 'rounded-lg' : 'rounded-full'}`} style={{ width: size, height: size }} />
    : <span className={`grid place-items-center font-bold shrink-0 ${square ? 'rounded-lg' : 'rounded-full'}`} style={{ width: size, height: size, fontSize: size * 0.4, background: 'var(--glass-3)' }}>{(name ?? '?')[0]}</span>
);

const EnvelopeRow: React.FC<{ c: Correspondence; active: boolean; onClick: () => void }> = ({ c, active, onClick }) => {
  const paper = STATIONERY.find((s) => s.id === c.meta?.stationery)?.paper ?? '#efe6d4';
  const who = c.others.map((o) => o.name).join(', ');
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className="pm-env-row tap"
      style={{ background: active ? 'var(--glass-3)' : undefined }}
    >
      <span className="pm-env-row__thumb" style={{ background: paper }} aria-hidden>
        <span className="pm-env-row__flap" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className={`text-sm truncate ${c.unread ? 'font-bold' : 'font-semibold'}`}>{who}</span>
          <span className="text-[10px] shrink-0" style={{ opacity: 0.5 }}>{c.meta ? relativeWhen(c.meta.lastAt) : ''}</span>
        </span>
        <span className="block text-xs truncate" style={{ color: 'var(--on-surface-variant)' }}>
          {c.inTransitUntil
            ? <><Send size={10} className="inline mr-1" />arrives {relativeWhen(c.inTransitUntil)}</>
            : c.excerpt || (c.meta?.lastBy && c.yourTurn ? 'A letter for you' : 'You wrote last')}
        </span>
      </span>
      {c.unread && <span className="w-2 h-2 rounded-full bg-brand-orange shrink-0" aria-label="New letter" />}
    </button>
  );
};

const BulletinReader: React.FC<{ bulletin: Bulletin; onClose: () => void }> = ({ bulletin, onClose }) => {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[135] bg-black/75 backdrop-blur-md overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`Bulletin from ${bulletin.authorName}`}
    >
      <div className="min-h-full flex flex-col items-center py-10 px-3" onClick={(e) => e.stopPropagation()}>
        <div className="w-full max-w-[680px] flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Avatar name={bulletin.authorName} photo={bulletin.authorPhoto} size={34} square />
            <div>
              <p className="text-sm font-semibold flex items-center gap-1.5"><Building2 size={12} /> {bulletin.authorName}</p>
              <p className="text-xs" style={{ opacity: 0.6 }}>{new Date(bulletin.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>
          </div>
          <IconButton variant="ghost" size="sm" aria-label="Close" onClick={onClose}><X /></IconButton>
        </div>
        <div className="w-full max-w-[640px] pm-sheet-shadow rounded-[6px] overflow-hidden">
          {bulletin.doc ? <MeasuredEmbed doc={bulletin.doc} /> : <div className="p-8 bg-white text-black">{bulletin.excerpt}</div>}
        </div>
        <button type="button" onClick={onClose} className="mt-6 text-sm flex items-center gap-1.5 tap" style={{ opacity: 0.7 }}><ArrowLeft size={14} /> Back to letters</button>
      </div>
    </motion.div>
  );
};

export default CorrespondenceRoom;
