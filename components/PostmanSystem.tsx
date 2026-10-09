import React, { useEffect, useState } from 'react';
import { ArrowUpRight, Calendar, Feather, Inbox, PenLine } from 'lucide-react';
import { Button } from './ui';
import { formatMailTime, listAccounts, listMessages } from '../services/postmanService';
import { listenCorrespondences, type Correspondence } from '../services/postman/lettersService';
import { openPostman } from '../services/postman/postmanIntent';
import { relativeWhen } from '../services/postman/calendarTime';
import type { PostmanMessage } from '../types';

/**
 * The Post Man inside ChatSystem's Mail tab.
 *
 * This renders in the chat SIDEBAR — a ~320px column with no fixed height — so it
 * is a doorway, not the app. Letters first (they are Plajah-to-Plajah, the reason
 * the Post Man exists), then the few most recent emails, and buttons through to
 * the full rooms.
 *
 * Navigation goes through services/postman/postmanIntent, which carries the room
 * and correspondence so a tap lands on the right page rather than the front door.
 */
const PostmanSystem: React.FC = () => {
  const [messages, setMessages] = useState<PostmanMessage[]>([]);
  const [mail, setMail] = useState<'loading' | 'ready' | 'empty'>('loading');
  const [letters, setLetters] = useState<Correspondence[] | null>(null);

  useEffect(() => listenCorrespondences((list) => setLetters(list.filter((c) => c.meta).slice(0, 5))), []);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const accounts = await listAccounts();
        if (!live) return;
        if (!accounts.length) { setMail('empty'); return; }
        const { messages: next } = await listMessages(accounts[0].id, 4);
        if (!live) return;
        setMessages(next);
        setMail('ready');
      } catch {
        if (live) setMail('empty');
      }
    })();
    return () => { live = false; };
  }, []);

  const yourTurn = letters?.filter((c) => c.yourTurn).length ?? 0;

  return (
    <div className="rounded-[2rem] border border-theme overflow-hidden"
         style={{ background: 'var(--card-bg)' }}>
      <div className="px-4 py-3.5 border-b border-theme flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Feather size={15} className="text-brand-orange shrink-0" />
          <span className="pj-eyebrow truncate">
            The Post Man{yourTurn > 0 ? ` — your turn on ${yourTurn}` : ''}
          </span>
        </div>
        <button
          type="button"
          onClick={() => openPostman()}
          aria-label="Open The Post Man"
          className="p-1.5 rounded-full transition-colors hover:bg-white/10 tap"
          style={{ color: 'var(--on-surface-variant)' }}
        >
          <ArrowUpRight size={14} />
        </button>
      </div>

      {/* Letters */}
      <div className="px-4 pt-3 pb-1"><span className="pj-eyebrow" style={{ opacity: 0.6 }}>Letters</span></div>
      {letters === null ? (
        <div className="px-4 pb-3"><span className="text-[11px]" style={{ opacity: 0.5 }}>Loading</span></div>
      ) : letters.length === 0 ? (
        <p className="px-4 pb-3 text-[11px]" style={{ color: 'var(--on-surface-variant)' }}>
          No letters yet. A letter is a page — paper, a hand, a stamp — not a message.
        </p>
      ) : (
        <ul>
          {letters.map((c) => (
            <li key={c.roomId}>
              <button
                type="button"
                onClick={() => openPostman({ room: 'LETTERS', roomId: c.roomId })}
                className="w-full text-left px-4 py-2.5 hover:bg-white/[0.03] transition-colors flex items-center gap-2.5"
              >
                {c.others[0]?.photo
                  ? <img src={c.others[0].photo} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                  : <span className="w-7 h-7 rounded-full grid place-items-center text-[11px] font-bold shrink-0" style={{ background: 'var(--glass-3)' }}>{c.others[0]?.name?.[0] ?? '?'}</span>}
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13px] truncate ${c.unread ? 'font-bold' : ''}`}>{c.others.map((o) => o.name).join(', ')}</span>
                  <span className="block text-[10px] truncate" style={{ color: 'var(--on-surface-variant)' }}>
                    {c.inTransitUntil ? `In the post — arrives ${relativeWhen(c.inTransitUntil)}` : c.yourTurn ? 'Your turn' : 'You wrote last'}
                  </span>
                </span>
                {c.unread && <span className="w-1.5 h-1.5 rounded-full bg-brand-orange shrink-0" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Mail */}
      {mail === 'ready' && messages.length > 0 && (
        <>
          <div className="px-4 pt-3 pb-1 border-t border-theme"><span className="pj-eyebrow" style={{ opacity: 0.6 }}>Inbox</span></div>
          <ul>
            {messages.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => openPostman({ room: 'INBOX' })}
                  className="w-full text-left px-4 py-2.5 hover:bg-white/[0.03] transition-colors block"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`pm-subject text-[13px] truncate ${m.unread ? 'font-bold' : ''}`}>
                      {m.subject || '(No subject)'}
                    </span>
                    <span className="text-[9px] shrink-0 tabular-nums"
                          style={{ color: 'var(--on-surface-variant)', fontFamily: 'var(--font-mono-tech)' }}>
                      {formatMailTime(m.date)}
                    </span>
                  </div>
                  <span className="block text-[10px] truncate mt-0.5" style={{ color: 'var(--on-surface-variant)' }}>
                    {m.from.name || m.from.email}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="p-3 grid grid-cols-3 gap-1.5 border-t border-theme">
        <Button variant="accent" size="xs" icon={<PenLine />} onClick={() => openPostman({ compose: true })}>Write</Button>
        <Button variant="secondary" size="xs" icon={<Calendar />} onClick={() => openPostman({ room: 'CALENDAR' })}>Calendar</Button>
        <Button variant="secondary" size="xs" icon={<Inbox />} onClick={() => openPostman({ room: 'INBOX' })}>Inbox</Button>
      </div>
    </div>
  );
};

export default PostmanSystem;
