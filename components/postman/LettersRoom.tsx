import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle, ArrowLeft, Inbox, Loader2, Mail, PenLine, RefreshCw, Reply, Star,
} from 'lucide-react';
import { Button, IconButton } from '../ui';
import {
  displayNameFor, formatMailTime, getMessage, initialsFor, listMessages,
  PostmanError, setMessageRead, setMessageStarred,
} from '../../services/postmanService';
import type {
  PostmanAccount, PostmanLetterSkin, PostmanMessage, PostmanMessageDetail,
} from '../../types';

interface LettersRoomProps {
  accounts: PostmanAccount[];
  activeAccountId?: string;
  skin: PostmanLetterSkin;
  onCompose: () => void;
  onReply: (message: PostmanMessageDetail) => void;
  onConnect: () => void;
  /** Bumped by the shell after a send or a reconnect, to force a refetch. */
  refreshKey: number;
}

type Filter = 'all' | 'unread';

const LettersRoom: React.FC<LettersRoomProps> = ({
  accounts, activeAccountId, skin, onCompose, onReply, onConnect, refreshKey,
}) => {
  const [messages, setMessages] = useState<PostmanMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PostmanMessageDetail | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<PostmanError | Error | null>(null);

  // On a phone the list and the reader are one column at a time.
  const [mobileShowsReader, setMobileShowsReader] = useState(false);

  // Guards a slow response for a message the user has already navigated away from.
  const detailToken = useRef(0);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const { messages: next } = await listMessages(activeAccountId);
      setMessages(next);
      setSelectedId((current) => (current && next.some((m) => m.id === current) ? current : null));
    } catch (err) {
      setError(err as Error);
      setMessages([]);
    } finally {
      setLoadingList(false);
    }
  }, [activeAccountId]);

  useEffect(() => { void loadList(); }, [loadList, refreshKey]);

  const openMessage = useCallback(async (message: PostmanMessage) => {
    setSelectedId(message.id);
    setMobileShowsReader(true);
    setLoadingDetail(true);
    setDetail(null);

    const token = ++detailToken.current;
    try {
      const full = await getMessage(message.id, message.accountId);
      if (token !== detailToken.current) return;
      setDetail(full);

      if (message.unread) {
        // Optimistic: the row should stop looking unread the moment it is opened.
        setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, unread: false } : m)));
        setMessageRead(message.id, message.accountId, true).catch(() => {
          setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, unread: true } : m)));
        });
      }
    } catch (err) {
      if (token === detailToken.current) setError(err as Error);
    } finally {
      if (token === detailToken.current) setLoadingDetail(false);
    }
  }, []);

  const toggleStar = useCallback((message: PostmanMessage) => {
    const next = !message.starred;
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, starred: next } : m)));
    setDetail((d) => (d && d.id === message.id ? { ...d, starred: next } : d));
    setMessageStarred(message.id, message.accountId, next).catch(() => {
      setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, starred: !next } : m)));
      setDetail((d) => (d && d.id === message.id ? { ...d, starred: !next } : d));
    });
  }, []);

  const visible = filter === 'unread' ? messages.filter((m) => m.unread) : messages;
  const unreadCount = messages.filter((m) => m.unread).length;

  /* ── No account yet ───────────────────────────────────────────────────── */
  if (!accounts.length && !loadingList) {
    return (
      <EmptyState
        icon={<Mail size={44} strokeWidth={1.2} />}
        title="No mailbox connected"
        body="Connect a Gmail account and your letters appear here. Plajah holds the connection on its own server — your password never touches the browser."
        action={<Button variant="primary" size="md" onClick={onConnect}>Connect Gmail</Button>}
      />
    );
  }

  /* ── Server not set up ────────────────────────────────────────────────── */
  if (error instanceof PostmanError && error.code === 'UNCONFIGURED') {
    return (
      <EmptyState
        icon={<AlertTriangle size={44} strokeWidth={1.2} className="text-state-warning" />}
        title="Mail is not configured on this server"
        body={error.message}
        action={<Button variant="secondary" size="md" onClick={() => void loadList()} icon={<RefreshCw />}>Try again</Button>}
      />
    );
  }

  return (
    <div className="flex-1 min-h-0 flex">
      {/* ── List ─────────────────────────────────────────────────────────── */}
      <div
        className={`w-full md:w-[330px] shrink-0 md:border-r border-theme flex flex-col min-h-0 ${
          mobileShowsReader ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div className="px-5 py-4 border-b border-theme flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="pj-eyebrow truncate">
              Mailbox{unreadCount > 0 ? ` — ${unreadCount} unread` : ''}
            </span>
            <IconButton
              variant="ghost"
              size="xs"
              aria-label="Refresh mailbox"
              onClick={() => void loadList()}
              disabled={loadingList}
            >
              <RefreshCw className={loadingList ? 'animate-spin' : ''} />
            </IconButton>
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setFilter((f) => (f === 'all' ? 'unread' : 'all'))}
            aria-pressed={filter === 'unread'}
            className={filter === 'unread' ? '!text-brand-orange' : ''}
          >
            {filter === 'unread' ? 'Unread' : 'All'}
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pm-fade-b">
          {loadingList && !messages.length ? (
            <div className="h-48 flex flex-col items-center justify-center gap-3" style={{ color: 'var(--on-surface-variant)' }}>
              <Loader2 size={26} className="animate-spin" />
              <span className="pj-eyebrow">Calling the Post Man</span>
            </div>
          ) : error ? (
            <div className="p-8 text-center flex flex-col items-center gap-4">
              <p className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>{error.message}</p>
              <Button variant="secondary" size="sm" onClick={() => void loadList()} icon={<RefreshCw />}>Try again</Button>
            </div>
          ) : !visible.length ? (
            <div className="p-10 text-center flex flex-col items-center gap-3">
              <Inbox size={36} strokeWidth={1.2} style={{ opacity: 0.2 }} />
              <p className="pm-subject text-base" style={{ color: 'var(--on-surface-variant)' }}>
                {filter === 'unread' ? 'Nothing unread.' : 'Your letter box is empty.'}
              </p>
            </div>
          ) : (
            visible.map((message) => (
              <MailRow
                key={message.id}
                message={message}
                active={selectedId === message.id}
                onOpen={() => void openMessage(message)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Reader ───────────────────────────────────────────────────────── */}
      <div className={`flex-1 min-w-0 flex flex-col ${mobileShowsReader ? 'flex' : 'hidden md:flex'}`}>
        {!selectedId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ opacity: 0.25 }}>
            <Mail size={54} strokeWidth={1} />
            <p className="pm-subject text-lg">Select a letter to read</p>
          </div>
        ) : loadingDetail || !detail ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={26} className="animate-spin" style={{ opacity: 0.4 }} />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.article
              key={detail.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
              className="flex-1 min-h-0 flex flex-col p-6 sm:p-8"
            >
              <header className="flex items-start justify-between gap-4 pb-5 border-b border-theme shrink-0">
                <div className="flex items-center gap-3.5 min-w-0">
                  <IconButton
                    variant="ghost"
                    size="sm"
                    aria-label="Back to mailbox"
                    className="md:hidden"
                    onClick={() => setMobileShowsReader(false)}
                  >
                    <ArrowLeft />
                  </IconButton>
                  <div
                    className="w-11 h-11 rounded-full shrink-0 grid place-items-center text-xs font-bold text-white"
                    style={{ background: 'var(--pj-grad-brand)' }}
                    aria-hidden="true"
                  >
                    {initialsFor(detail.from)}
                  </div>
                  <div className="min-w-0">
                    <p className="pj-eyebrow">From</p>
                    <h2 className="pm-subject text-xl truncate">{displayNameFor(detail.from)}</h2>
                    <p className="text-[11px] truncate" style={{ color: 'var(--on-surface-variant)' }}>
                      {detail.from.email} · {formatMailTime(detail.date)}
                    </p>
                  </div>
                </div>
                <IconButton
                  variant="ghost"
                  size="sm"
                  aria-label={detail.starred ? 'Remove star' : 'Star this letter'}
                  aria-pressed={detail.starred}
                  onClick={() => toggleStar(detail)}
                >
                  <Star className={detail.starred ? 'fill-brand-orange text-brand-orange' : ''} />
                </IconButton>
              </header>

              <h1 className="type-headline-md mt-6 mb-4 shrink-0">{detail.subject || '(No subject)'}</h1>

              {/* Tier two: the page carries the letter skin. */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="pm-page" data-letter-skin={skin}>
                  {detail.bodyHtml ? (
                    /* Sanitised server-side (scripts, handlers, frames and javascript:
                       URLs stripped). Still treated as hostile: no styles from it are
                       allowed to escape .pm-letter, and links open with noopener. */
                    <div className="pm-letter" dangerouslySetInnerHTML={{ __html: detail.bodyHtml }} />
                  ) : (
                    <div className="pm-letter whitespace-pre-wrap">{detail.bodyText || detail.snippet}</div>
                  )}
                </div>
              </div>

              <footer className="pt-5 mt-5 border-t border-theme flex flex-wrap gap-2.5 shrink-0">
                <Button variant="primary" size="md" icon={<Reply />} onClick={() => onReply(detail)}>
                  Reply
                </Button>
                <Button variant="secondary" size="md" icon={<PenLine />} onClick={onCompose}>
                  New letter
                </Button>
              </footer>
            </motion.article>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

/* ── Pieces ───────────────────────────────────────────────────────────────── */

const MailRow: React.FC<{ message: PostmanMessage; active: boolean; onOpen: () => void }> = ({
  message, active, onOpen,
}) => (
  <button
    type="button"
    onClick={onOpen}
    aria-current={active ? 'true' : undefined}
    className="w-full text-left px-5 py-4 border-b border-theme relative block transition-colors hover:bg-white/[0.02]"
    style={active ? { background: 'var(--pj-orange-soft)' } : undefined}
  >
    {message.unread && <span className="pm-row-mark" aria-hidden="true" />}
    <div className="flex items-baseline justify-between gap-3 mb-1">
      <span
        className="pj-eyebrow truncate"
        style={{ color: active ? 'var(--pj-orange)' : undefined, opacity: active ? 1 : 0.5 }}
      >
        {message.unread ? 'Unread' : 'Read'}
      </span>
      <span
        className="text-[10px] tabular-nums shrink-0"
        style={{ color: 'var(--on-surface-variant)', fontFamily: 'var(--font-mono-tech)' }}
      >
        {formatMailTime(message.date)}
      </span>
    </div>
    <p className={`pm-subject text-[17px] leading-tight truncate ${message.unread ? 'font-bold' : ''}`}>
      {message.subject || '(No subject)'}
    </p>
    <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--on-surface-variant)' }}>
      {displayNameFor(message.from)}
    </p>
  </button>
);

const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}> = ({ icon, title, body, action }) => (
  <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 p-10">
    <div style={{ opacity: 0.28 }}>{icon}</div>
    <h2 className="type-title-lg">{title}</h2>
    <p className="text-sm max-w-[46ch]" style={{ color: 'var(--on-surface-variant)' }}>{body}</p>
    {action && <div className="mt-2">{action}</div>}
  </div>
);

export default LettersRoom;
