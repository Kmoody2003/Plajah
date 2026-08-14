import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Users, Play, Square, Plus, LogOut, Flame } from 'lucide-react';
import { Button, IconButton, Surface, Eyebrow, Input, Chip } from '../ui';
import {
  getOrCreateContextRoom, joinRoom, leaveRoom, subscribeMembers,
  type RoomMember,
} from '../../services/roomService';
import { saveSession } from '../../services/oraService';
import {
  listMyCorners, listCornerStatuses, createCorner, addMember, removeMember,
  publishStatus, MAX_CORNER,
  type OraCorner, type OraCornerStatus,
} from '../../services/oraCorner';
import { auth } from '../../services/backendService';

/**
 * Ora — Together (Phase 4).
 *
 * Two things live here, and they are the same idea at two speeds:
 *
 *   Focus rooms — body doubling. Focusmate has to match you with a stranger;
 *   Plajah already has your people, so a focus room is a place you arrive at
 *   rather than a booking you make. The room is deliberately silent: presence
 *   is the intervention, not conversation.
 *
 *   Corner — the people in your corner. Up to five who can see that you are
 *   showing up: a streak, whether you checked in, and goal counts. They never
 *   see a word you wrote. See services/oraCorner for why that list is so short.
 *
 * Blueprint: docs/PLAJAH_WELLBEING_SUITE_BLUEPRINT.md
 */

const FOCUS_ROOMS = [
  { slug: 'ora-focus-open', title: 'Open desk', blurb: 'Anything at all. The default room.' },
  { slug: 'ora-focus-studio', title: 'Studio', blurb: 'Making something — music, film, art.' },
  { slug: 'ora-focus-writing', title: 'Writing', blurb: 'Words only. Silence enforced by everyone else.' },
  { slug: 'ora-focus-study', title: 'Study hall', blurb: 'Coursework, revision, reading.' },
];

const LENGTHS = [25, 50] as const;

// ── focus rooms ──────────────────────────────────────────────────────────

const FocusRooms: React.FC<{ onLogged?: () => void }> = ({ onLogged }) => {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [intent, setIntent] = useState('');
  const [length, setLength] = useState<number>(25);
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(0);
  const startedAt = useRef(0);
  const timer = useRef<number | null>(null);
  const unsub = useRef<(() => void) | null>(null);

  const user = auth.currentUser;

  const stopTimer = useCallback(async (completed: boolean) => {
    if (timer.current !== null) { window.clearInterval(timer.current); timer.current = null; }
    const seconds = startedAt.current ? (Date.now() - startedAt.current) / 1000 : 0;
    startedAt.current = 0;
    setRunning(false);
    if (seconds >= 5) {
      // Focus time is practice time: it feeds the same session log, so a
      // minutes goal counts work as well as breath.
      await saveSession({ kind: 'FOCUS', seconds, completed });
      onLogged?.();
    }
  }, [onLogged]);

  const enter = async (slug: string, title: string) => {
    if (!user) return;
    const room = await getOrCreateContextRoom({
      kind: 'STUDY',
      context: { contentId: slug, emoji: '◍' },
      title: `Ora · ${title}`,
      // Silent by construction. Presence is the whole mechanic, and a chat box
      // in a focus room is just a nicer-looking distraction.
      capabilities: { chat: false, presence: true },
      user: { uid: user.uid, displayName: user.displayName, photoURL: user.photoURL },
    });
    setRoomId(room.id);
    unsub.current?.();
    unsub.current = subscribeMembers(room.id, setMembers);
  };

  const leave = async () => {
    if (running) await stopTimer(false);
    if (roomId && user) await leaveRoom(roomId, user.uid).catch(() => {});
    unsub.current?.(); unsub.current = null;
    setRoomId(null); setMembers([]);
  };

  const start = () => {
    startedAt.current = Date.now();
    setRunning(true);
    setLeft(length * 60);
    timer.current = window.setInterval(() => {
      const secs = (Date.now() - startedAt.current) / 1000;
      const remaining = Math.max(0, Math.ceil(length * 60 - secs));
      setLeft(remaining);
      if (remaining <= 0) void stopTimer(true);
    }, 500);
  };

  // Never leave a ghost in the room or a running interval behind.
  useEffect(() => () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    unsub.current?.();
    const u = auth.currentUser;
    if (roomId && u) void leaveRoom(roomId, u.uid).catch(() => {});
  }, [roomId]);

  if (!roomId) {
    return (
      <div style={{ display: 'grid', gap: 'var(--pj-space-3)' }}>
        <Eyebrow>Focus rooms</Eyebrow>
        <p className="type-body-sm" style={{ margin: '0 0 var(--pj-space-2)', color: 'var(--on-surface-variant)' }}>
          Sit down next to other people who are also working. No chat, no camera — just
          the fact that someone else is here too.
        </p>
        {FOCUS_ROOMS.map((r) => (
          <Surface key={r.slug} level={1}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--pj-space-3)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="type-title-md" style={{ margin: 0 }}>{r.title}</p>
                <p className="type-body-sm" style={{ margin: 0, color: 'var(--on-surface-variant)' }}>{r.blurb}</p>
              </div>
              <Button variant="secondary" size="sm" icon={<Users />} onClick={() => enter(r.slug, r.title)}>
                Sit down
              </Button>
            </div>
          </Surface>
        ))}
      </div>
    );
  }

  const others = members.filter((m) => m.uid !== user?.uid);

  return (
    <div style={{ display: 'grid', gap: 'var(--pj-space-5)' }}>
      <Surface level={2} shape="sheet">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--pj-space-3)', marginBottom: 'var(--pj-space-4)' }}>
          <div style={{ flex: 1 }}>
            <Eyebrow>In the room</Eyebrow>
            <p className="type-title-lg" style={{ margin: '4px 0 0' }}>
              {others.length === 0 ? 'Just you, for now' : `You and ${others.length} other${others.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <IconButton variant="ghost" size="sm" aria-label="Leave room" onClick={leave}><LogOut /></IconButton>
        </div>

        {others.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--pj-space-2)', marginBottom: 'var(--pj-space-4)' }}>
            {others.slice(0, 12).map((m) => (
              <span
                key={m.uid}
                title={m.displayName}
                style={{
                  width: 32, height: 32, borderRadius: '50%', display: 'grid', placeItems: 'center',
                  background: 'var(--pj-grad-spatial)', color: '#fff',
                  fontFamily: 'var(--font-label)', fontSize: 13, fontWeight: 800,
                }}
              >
                {(m.displayName || '?').slice(0, 1).toUpperCase()}
              </span>
            ))}
          </div>
        )}

        {running ? (
          <div style={{ display: 'grid', gap: 'var(--pj-space-4)', placeItems: 'center' }}>
            <p className="type-display-sm" style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>
              {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
            </p>
            {intent && <p className="type-body-md" style={{ margin: 0, color: 'var(--on-surface-variant)' }}>{intent}</p>}
            <Button variant="secondary" icon={<Square />} onClick={() => void stopTimer(false)}>Stop</Button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--pj-space-4)' }}>
            {/* Saying what you are about to do is most of why body doubling works,
                so it is the first field — but it stays on this device. */}
            <Input
              label="What are you working on?"
              placeholder="Finishing the second verse"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              hint="Only you see this."
            />
            <div style={{ display: 'flex', gap: 'var(--pj-space-2)' }}>
              {LENGTHS.map((l) => (
                <Chip key={l} interactive selected={length === l} onClick={() => setLength(l)}>{l} min</Chip>
              ))}
            </div>
            <Button variant="primary" size="lg" icon={<Play />} onClick={start} fullWidth>
              Start the session
            </Button>
          </div>
        )}
      </Surface>
    </div>
  );
};

// ── corner ───────────────────────────────────────────────────────────────

const Corner: React.FC = () => {
  const [corners, setCorners] = useState<OraCorner[]>([]);
  const [statuses, setStatuses] = useState<OraCornerStatus[]>([]);
  const [name, setName] = useState('');
  const [inviteUid, setInviteUid] = useState('');
  const [busy, setBusy] = useState(false);
  const me = auth.currentUser?.uid;

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([listMyCorners(), listCornerStatuses()]);
    setCorners(c); setStatuses(s);
  }, []);

  useEffect(() => {
    void load();
    // Publishing on open keeps the card fresh without a background job.
    void publishStatus();
  }, [load]);

  const make = async () => {
    if (!name.trim()) return;
    setBusy(true);
    await createCorner(name);
    setName('');
    await load();
    setBusy(false);
  };

  const invite = async (cornerId: string) => {
    if (!inviteUid.trim()) return;
    setBusy(true);
    await addMember(cornerId, inviteUid.trim());
    setInviteUid('');
    await load();
    setBusy(false);
  };

  return (
    <div style={{ display: 'grid', gap: 'var(--pj-space-5)' }}>
      <div>
        <Eyebrow>Your corner</Eyebrow>
        <p className="type-body-sm" style={{ margin: 'var(--pj-space-2) 0 0', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
          The people in your corner — up to {MAX_CORNER} of them. They see your streak,
          whether you checked in today, and how many goals are running. They can never
          see a word you have written, or what any goal is called.
        </p>
      </div>

      {statuses.map((s) => (
        <Surface key={s.uid} level={1}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--pj-space-3)' }}>
            <span
              style={{
                width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center', flex: 'none',
                background: 'var(--pj-grad-ethereal)', color: '#160826',
                fontFamily: 'var(--font-label)', fontSize: 15, fontWeight: 800,
              }}
            >
              {(s.displayName || '?').slice(0, 1).toUpperCase()}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="type-title-md" style={{ margin: 0 }}>{s.displayName}</p>
              <p className="type-body-sm" style={{ margin: 0, color: 'var(--on-surface-variant)' }}>
                {s.goalsActive} running · {s.goalsDone} done
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p className="type-title-md" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                <Flame size={14} style={{ color: 'var(--pj-orange)' }} /> {s.streak}
              </p>
              <p className="type-body-sm" style={{ margin: 0, color: s.checkedInToday ? 'var(--pj-success)' : 'var(--on-surface-variant)' }}>
                {s.checkedInToday ? 'checked in' : 'not yet today'}
              </p>
            </div>
          </div>
        </Surface>
      ))}

      {corners.map((c) => (
        <Surface key={c.id} level={2}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--pj-space-3)' }}>
            <p className="type-title-md" style={{ margin: 0, flex: 1 }}>{c.name}</p>
            <span className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>
              {c.memberUids.length}/{MAX_CORNER}
            </span>
            <Button variant="danger-quiet" size="xs" onClick={async () => { if (me) { await removeMember(c.id, me); await load(); } }}>
              {c.ownerUid === me ? 'Dissolve' : 'Leave'}
            </Button>
          </div>
          {c.ownerUid === me && c.memberUids.length < MAX_CORNER && (
            <div className="pj-row" style={{ marginTop: 'var(--pj-space-4)' }}>
              <input
                className="pj-input"
                placeholder="Paste a member's user id"
                aria-label="User id to invite"
                value={inviteUid}
                onChange={(e) => setInviteUid(e.target.value)}
              />
              <Button variant="secondary" loading={busy} onClick={() => invite(c.id)}>Add</Button>
            </div>
          )}
        </Surface>
      ))}

      {corners.length === 0 && (
        <Surface level={2} shape="sheet">
          <div className="pj-row">
            <input
              className="pj-input"
              placeholder="Name your corner"
              aria-label="Corner name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button variant="primary" icon={<Plus />} loading={busy} onClick={make} disabled={!name.trim()}>
              Create
            </Button>
          </div>
        </Surface>
      )}
    </div>
  );
};

// ── the tab ──────────────────────────────────────────────────────────────

export const Together: React.FC<{ onLogged?: () => void }> = ({ onLogged }) => {
  const [pane, setPane] = useState<'FOCUS' | 'CORNER'>('FOCUS');
  return (
    <div style={{ display: 'grid', gap: 'var(--pj-space-6)' }}>
      <div style={{ display: 'flex', gap: 'var(--pj-space-2)' }}>
        <Chip interactive selected={pane === 'FOCUS'} onClick={() => setPane('FOCUS')}>Focus rooms</Chip>
        <Chip interactive selected={pane === 'CORNER'} onClick={() => setPane('CORNER')}>Your corner</Chip>
      </div>
      {pane === 'FOCUS' ? <FocusRooms onLogged={onLogged} /> : <Corner />}
    </div>
  );
};

export default Together;
