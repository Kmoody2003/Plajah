import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Calendar, Check, Feather, Inbox, Megaphone, PenLine, Plus, Settings, Shield, Trash2, X,
} from 'lucide-react';
import { Button, IconButton } from '../ui';
import InboxRoom from './InboxRoom';
import LetterComposer from './LetterComposer';
import CorrespondenceRoom from './letters/CorrespondenceRoom';
import CalendarRoom from './calendar/CalendarRoom';
import LetterWriter from './letters/LetterWriter';
import { consumePostmanIntent, type PostmanIntent } from '../../services/postman/postmanIntent';
import CampaignsRoom from './CampaignsRoom';
import SourcesRoom from './SourcesRoom';
import {
  connectGoogleAccount, disconnectAccount, getPostmanStatus, LETTER_SKINS,
  listAccounts, loadPrefs, savePrefs, DEFAULT_POSTMAN_PREFS,
} from '../../services/postmanService';
import type {
  PostmanAccount, PostmanLetterSkin, PostmanMessageDetail, PostmanPrefs, PostmanRoom,
} from '../../types';

/**
 * The Post Man — Plajah's mail client.
 *
 * Replaces an <iframe> that pointed at an AI Studio Cloud Run deployment. That
 * version could not read the Plajah session, kept a Gemini key in the client
 * bundle, and would have gone blank the day the dev deployment expired.
 *
 * THEMING follows the two-tier rule (see styles/postman.css): everything here —
 * header, rails, list, sheets, controls — inherits the platform theme through
 * bg-theme / --pj-* tokens and is NOT skinnable. Only the reading and writing
 * page carries a letter skin. Plajah already has nine themes; a mail client
 * carrying four of its own would mean the app and the rail around it disagreeing.
 */

interface PostmanAppProps {
  /** Compact chrome for the panel inside ChatSystem. */
  embedded?: boolean;
}

/**
 * Letters is Plajah-to-Plajah correspondence (Tela documents, not email) and the
 * room the Post Man opens on. Inbox is the connected Gmail. Calendar pulls the
 * platform's dates in by itself. The old "Soon" rooms are gone: Desk and Journal
 * belong to Lorea's authoring studio, and Board overlaps the Content Asset Manager.
 */
const ROOMS: { id: PostmanRoom; label: string; icon: React.ReactNode; ready: boolean }[] = [
  { id: 'LETTERS',   label: 'Letters',   icon: <Feather size={13} />,   ready: true },
  { id: 'INBOX',     label: 'Inbox',     icon: <Inbox size={13} />,     ready: true },
  { id: 'CALENDAR',  label: 'Calendar',  icon: <Calendar size={13} />,  ready: true },
  { id: 'CAMPAIGNS', label: 'Campaigns', icon: <Megaphone size={13} />, ready: true },
  { id: 'SOURCES',   label: 'Sources',   icon: <Shield size={13} />,    ready: true },
];
const ROOM_IDS = new Set(ROOMS.map((r) => r.id));

const PostmanApp: React.FC<PostmanAppProps> = ({ embedded = false }) => {
  const [room, setRoom] = useState<PostmanRoom>('LETTERS');
  const [letterRoomId, setLetterRoomId] = useState<string | null>(null);
  const [composeSignal, setComposeSignal] = useState(0);
  const [writeTo, setWriteTo] = useState<{ uid: string; name: string } | null>(null);
  const [accounts, setAccounts] = useState<PostmanAccount[]>([]);
  const [prefs, setPrefs] = useState<PostmanPrefs>(DEFAULT_POSTMAN_PREFS);
  const [googleConfigured, setGoogleConfigured] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [composing, setComposing] = useState<{ replyTo?: PostmanMessageDetail } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshAccounts = useCallback(async () => {
    try {
      setAccounts(await listAccounts());
    } catch {
      // A failed account list is not fatal — the room shows its own empty state.
      setAccounts([]);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const [status, loaded] = await Promise.all([getPostmanStatus(), loadPrefs()]);
      setGoogleConfigured(status.googleConfigured);
      setPrefs(loaded);
      if (status.googleConfigured) await refreshAccounts();
    })();
  }, [refreshAccounts]);

  // Re-check mailboxes when the person comes back to this tab — e.g. after finishing Google
  // sign-in in a popup whose result could not be delivered back.
  useEffect(() => {
    if (!googleConfigured) return;
    let last = 0;
    const recheck = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 4000) return;
      last = Date.now();
      void listAccounts().then((next) => {
        setAccounts((prev) => {
          if (next.length !== prev.length) setRefreshKey((k) => k + 1);
          return next;
        });
      }).catch(() => {});
    };
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => { window.removeEventListener('focus', recheck); document.removeEventListener('visibilitychange', recheck); };
  }, [googleConfigured]);

  // Intents: a notification, a chat line or a calendar item asking for a room.
  useEffect(() => {
    const apply = (i: PostmanIntent | null | undefined) => {
      if (!i) return;
      if (i.room && ROOM_IDS.has(i.room)) setRoom(i.room);
      if (i.roomId) { setRoom('LETTERS'); setLetterRoomId(i.roomId); }
      if (i.compose) {
        setRoom('LETTERS');
        if (i.toUid) setWriteTo({ uid: i.toUid, name: i.toName ?? 'friend' });
        else setComposeSignal((n) => n + 1);
      }
    };
    apply(consumePostmanIntent());
    const onIntent = (e: Event) => { apply((e as CustomEvent<PostmanIntent>).detail); consumePostmanIntent(); };
    window.addEventListener('postman:intent', onIntent);
    return () => window.removeEventListener('postman:intent', onIntent);
  }, []);

  // Notices are transient; nothing here is important enough to persist.
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(t);
  }, [notice]);

  const updatePrefs = useCallback((patch: Partial<Omit<PostmanPrefs, 'updatedAt'>>) => {
    setPrefs((p) => ({ ...p, ...patch, updatedAt: Date.now() }));
    void savePrefs(patch);
  }, []);

  const handleConnect = useCallback(async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      const { email } = await connectGoogleAccount();
      await refreshAccounts();
      setRefreshKey((k) => k + 1);
      setNotice({ kind: 'ok', text: `${email} connected.` });
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not connect that account.' });
    } finally {
      setConnecting(false);
    }
  }, [connecting, refreshAccounts]);

  const handleDisconnect = useCallback(async (account: PostmanAccount) => {
    try {
      await disconnectAccount(account.id);
      await refreshAccounts();
      setRefreshKey((k) => k + 1);
      setNotice({ kind: 'ok', text: `${account.email} disconnected.` });
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not disconnect that account.' });
    }
  }, [refreshAccounts]);

  const activeAccountId = prefs.lastAccountId && accounts.some((a) => a.id === prefs.lastAccountId)
    ? prefs.lastAccountId
    : accounts[0]?.id;

  const needsReauth = accounts.find((a) => a.status === 'reauth');

  return (
    <div className={`flex flex-col min-h-0 ${embedded ? 'h-full' : 'flex-1 bg-theme'} ${prefs.focusMode ? 'pm-shell--focus' : ''}`}>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header
        className={`shrink-0 border-b border-theme ${embedded ? 'px-5 py-4' : 'px-6 sm:px-8 pt-7 pb-5'}`}
        data-pm-dimmable="true"
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="pj-eyebrow flex items-center gap-2 text-brand-orange">
              <span
                className="w-1.5 h-1.5 rounded-full bg-brand-orange shrink-0"
                style={{ boxShadow: '0 0 0 3px var(--pj-orange-soft)' }}
              />
              {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
              {accounts.length > 0 && ` · ${accounts.length} ${accounts.length === 1 ? 'mailbox' : 'mailboxes'}`}
            </p>
            {/* The platform's display header (PageHeader, up to 12rem) is for
                landing surfaces. A mail client spends its vertical space on mail,
                so this keeps the brand gesture — black, uppercase, italic, tight —
                at a size that leaves room for the letters underneath. */}
            {/* --font-display, not the .font-display utility: a legacy hand-written
                rule in index.html pins that class to Space Grotesk, so it would
                render in a different face than every .type-* headline on the
                platform. The token is the one that resolves to Outfit. */}
            <h1
              style={{ fontFamily: 'var(--font-display)' }}
              className={`font-black uppercase italic tracking-tighter leading-[0.85] select-none mt-1 ${
                embedded ? 'text-2xl' : 'text-4xl sm:text-5xl md:text-6xl'
              }`}
            >
              The Post <span style={{ color: 'var(--on-surface-variant)' }}>Man</span>
            </h1>
          </div>

          <div className="flex items-center gap-2.5 pt-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              icon={<Settings />}
              onClick={() => setShowSettings(true)}
              aria-haspopup="dialog"
            >
              Settings
            </Button>
            {room === 'INBOX' && (
              <Button
                variant="secondary"
                size="sm"
                icon={<PenLine />}
                onClick={() => setComposing({})}
                disabled={!accounts.length}
                title={accounts.length ? undefined : 'Connect a mailbox first'}
              >
                New email
              </Button>
            )}
            <Button
              variant="accent"
              size="sm"
              icon={<Feather />}
              onClick={() => { setRoom('LETTERS'); setComposeSignal((n) => n + 1); }}
            >
              Write a letter
            </Button>
          </div>
        </div>

        {/* Rooms. Plajah owns the left edge of the screen, so these live under the
            header rather than in a second vertical rail competing with the platform's. */}
        <nav className="flex flex-wrap items-center gap-1.5 mt-5" aria-label="Post Man rooms">
          {ROOMS.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={!r.ready}
              onClick={() => r.ready && setRoom(r.id)}
              aria-current={room === r.id ? 'page' : undefined}
              className={`h-[34px] px-3.5 rounded-full inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.06em] border transition-colors tap ${
                room === r.id
                  ? 'border-theme text-white'
                  : 'border-transparent'
              } ${r.ready ? 'hover:text-white' : 'cursor-default'}`}
              style={{
                background: room === r.id ? 'var(--glass-3)' : 'transparent',
                color: room === r.id ? undefined : 'var(--on-surface-variant)',
                opacity: r.ready ? 1 : 0.35,
              }}
            >
              {r.icon}
              {r.label}
              {!r.ready && <span className="pj-eyebrow" style={{ fontSize: 8 }}>Soon</span>}
            </button>
          ))}
        </nav>
      </header>

      {/* ── Reconnect banner ─────────────────────────────────────────────── */}
      {needsReauth && (
        <div className="shrink-0 px-6 py-2.5 flex items-center justify-between gap-4 border-b border-theme"
             style={{ background: 'var(--pj-warning-soft)' }}>
          <p className="text-xs" style={{ color: 'var(--text-primary)' }}>
            {needsReauth.email} needs to be reconnected — Google rejected the saved permission.
          </p>
          <Button variant="secondary" size="xs" onClick={handleConnect} loading={connecting}>Reconnect</Button>
        </div>
      )}

      {/* ── Room ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex">
        {room === 'LETTERS' && (
          <CorrespondenceRoom
            initialRoomId={letterRoomId}
            composeSignal={composeSignal}
            onNotice={setNotice}
          />
        )}
        {room === 'CALENDAR' && (
          <CalendarRoom
            onNotice={setNotice}
            onConnectGoogle={handleConnect}
            googleAccounts={googleConfigured ? accounts.length : 0}
          />
        )}
        {room === 'INBOX' && (
          <InboxRoom
            accounts={accounts}
            activeAccountId={activeAccountId}
            skin={prefs.letterSkin}
            refreshKey={refreshKey}
            onCompose={() => setComposing({})}
            onReply={(message) => setComposing({ replyTo: message })}
            onConnect={handleConnect}
          />
        )}
        {room === 'CAMPAIGNS' && (
          // Campaigns needs no connected mailbox — it sends through Plajah's own
          // relay to the sender's platform audience, not from a personal inbox.
          <CampaignsRoom userEmail={accounts[0]?.email} />
        )}
        {room === 'SOURCES' && <SourcesRoom />}
      </div>

      {/* ── Notice ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            role={notice.kind === 'error' ? 'alert' : 'status'}
            className="fixed bottom-6 right-6 z-[130] px-4 py-3 rounded-card border border-theme text-sm shadow-elev-4"
            style={{ background: 'var(--card-bg)', backdropFilter: 'var(--blur-lg)' }}
          >
            <span className={notice.kind === 'error' ? 'text-state-danger' : 'text-state-success'}>
              {notice.text}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {writeTo && (
          <LetterWriter
            toUser={writeTo}
            onClose={() => setWriteTo(null)}
            onSent={(id) => { setWriteTo(null); setLetterRoomId(id); setNotice({ kind: 'ok', text: 'Your letter is in the post.' }); }}
          />
        )}
      </AnimatePresence>

      {/* ── Composer (Gmail) ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {composing && (
          <LetterComposer
            accounts={accounts}
            defaultAccountId={activeAccountId}
            replyTo={composing.replyTo}
            skin={prefs.letterSkin}
            onClose={() => setComposing(null)}
            onSent={() => {
              setComposing(null);
              setRefreshKey((k) => k + 1);
              setNotice({ kind: 'ok', text: 'Email sent.' });
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Settings ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showSettings && (
          <SettingsSheet
            accounts={accounts}
            prefs={prefs}
            googleConfigured={googleConfigured}
            connecting={connecting}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onChange={updatePrefs}
            onClose={() => setShowSettings(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

/* ── Settings ─────────────────────────────────────────────────────────────── */

const SettingsSheet: React.FC<{
  accounts: PostmanAccount[];
  prefs: PostmanPrefs;
  googleConfigured: boolean;
  connecting: boolean;
  onConnect: () => void;
  onDisconnect: (account: PostmanAccount) => void;
  onChange: (patch: Partial<Omit<PostmanPrefs, 'updatedAt'>>) => void;
  onClose: () => void;
}> = ({ accounts, prefs, googleConfigured, connecting, onConnect, onDisconnect, onChange, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[125] flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Post Man settings"
    >
      <motion.div
        initial={{ scale: 0.96, y: 24 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 24 }}
        transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="pj-surface pj-surface--5 pj-surface--sheet w-full max-w-2xl max-h-[88vh] overflow-y-auto"
        style={{ padding: 0 }}
      >
        <div className="px-6 py-4 border-b border-theme flex items-center justify-between sticky top-0 z-10"
             style={{ background: 'var(--card-bg)', backdropFilter: 'var(--blur-lg)' }}>
          <h2 className="type-title-md">Settings</h2>
          <IconButton variant="ghost" size="sm" aria-label="Close settings" onClick={onClose}><X /></IconButton>
        </div>

        {/* Accounts */}
        <section className="px-6 py-6 border-b border-theme">
          <p className="pj-eyebrow mb-1">Mailboxes</p>
          <p className="text-sm mb-5" style={{ color: 'var(--on-surface-variant)' }}>
            Plajah holds the connection on its own server. Your password never reaches the browser, and the
            access tokens are never sent to it.
          </p>

          {!googleConfigured ? (
            <p className="text-sm p-4 rounded-card border border-theme" style={{ background: 'var(--pj-warning-soft)' }}>
              Mail is not configured on this server yet. An administrator needs to set
              <code className="mx-1">POSTMAN_GOOGLE_CLIENT_ID</code> and
              <code className="mx-1">POSTMAN_GOOGLE_CLIENT_SECRET</code>.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {accounts.map((account) => (
                <div key={account.id} className="flex items-center justify-between gap-4 p-3.5 rounded-card border border-theme"
                     style={{ background: 'var(--glass-1)' }}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{account.email}</p>
                    <p className="pj-eyebrow" style={{ opacity: 0.6 }}>
                      {account.provider === 'google' ? 'Gmail' : 'Outlook'}
                      {account.status === 'reauth' ? ' — needs reconnecting' : ''}
                    </p>
                  </div>
                  <IconButton
                    variant="danger-quiet"
                    size="sm"
                    aria-label={`Disconnect ${account.email}`}
                    onClick={() => onDisconnect(account)}
                  >
                    <Trash2 />
                  </IconButton>
                </div>
              ))}
              <Button variant="secondary" size="md" icon={<Plus />} onClick={onConnect} loading={connecting} fullWidth>
                {accounts.length ? 'Connect another mailbox' : 'Connect Gmail'}
              </Button>
            </div>
          )}
        </section>

        {/* Letter skin — tier two */}
        <section className="px-6 py-6 border-b border-theme">
          <p className="pj-eyebrow mb-1">Letter skin</p>
          <p className="text-sm mb-5" style={{ color: 'var(--on-surface-variant)' }}>
            The reading and writing page only. The rest of the app follows your Plajah theme, so nothing here
            can leave the app looking like two different products.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {LETTER_SKINS.map((skin) => (
              <button
                key={skin.id}
                type="button"
                onClick={() => onChange({ letterSkin: skin.id })}
                aria-pressed={prefs.letterSkin === skin.id}
                className="text-left rounded-card border overflow-hidden transition-colors tap"
                style={{
                  borderColor: prefs.letterSkin === skin.id ? 'var(--pj-orange)' : 'var(--border-color)',
                }}
                title={skin.description}
              >
                <div className="pm-page h-16 flex items-end px-3 pb-2" data-letter-skin={skin.id}
                     style={{ borderRadius: 0, padding: '0 12px 8px' }}>
                  <span className="pm-subject text-sm" style={{ color: 'var(--pm-ink)' }}>Dear…</span>
                </div>
                <div className="px-3 py-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">{skin.label}</span>
                  {prefs.letterSkin === skin.id && <Check size={13} className="text-brand-orange shrink-0" />}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Focus */}
        <section className="px-6 py-6">
          <label className="flex items-center justify-between gap-6 cursor-pointer">
            <span>
              <span className="block text-sm font-semibold">Focus mode</span>
              <span className="block text-xs mt-0.5" style={{ color: 'var(--on-surface-variant)' }}>
                Dims the header and rooms while you read and write. They come back on hover.
              </span>
            </span>
            <input
              type="checkbox"
              checked={prefs.focusMode}
              onChange={(e) => onChange({ focusMode: e.target.checked })}
              className="w-5 h-5 shrink-0 accent-[color:var(--pj-orange)]"
            />
          </label>
        </section>
      </motion.div>
    </motion.div>
  );
};

export default PostmanApp;
