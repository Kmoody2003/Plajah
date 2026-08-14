import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ExternalLink, ShieldCheck } from 'lucide-react';
import { Button, Surface, Eyebrow, Chip } from '../ui';
import { assembleCircle, type CircleResult } from '../../services/oraCircle';
import { assembleShelf, finishableIn, type ShelfResult } from '../../services/oraShelf';
import { assembleWorkbench, type WorkbenchResult } from '../../services/oraWorkbench';
import { assembleRhythm, byDay, type RhythmResult } from '../../services/oraRhythm';

/**
 * Ora — the remaining Work-rail surfaces: Circle, Shelf and Portfolio.
 *
 * All three share one property, which is the productivity half's whole claim:
 * none of them has a "create your first…" empty state, because the data already
 * exists on the account. And none of them invents anything — where a signal is
 * not readable, the surface says so rather than rendering a confident blank.
 *
 * Blueprint: docs/PLAJAH_WELLBEING_SUITE_BLUEPRINT.md §4b
 */

const Header: React.FC<{ title: string; blurb: string; busy: boolean; onRefresh: () => void }> = ({
  title, blurb, busy, onRefresh,
}) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--pj-space-3)' }}>
    <div style={{ flex: 1 }}>
      <Eyebrow>{title}</Eyebrow>
      <p className="type-body-sm" style={{ margin: 'var(--pj-space-2) 0 0', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
        {blurb}
      </p>
    </div>
    <Button variant="secondary" size="sm" icon={<RefreshCw />} loading={busy} onClick={onRefresh}>Refresh</Button>
  </div>
);

const Incomplete: React.FC<{ show: boolean }> = ({ show }) =>
  show ? (
    <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)', textAlign: 'center' }}>
      Some of this could not be read just now, so the list may be incomplete.
    </p>
  ) : null;

const Avatar: React.FC<{ name: string; url?: string | null }> = ({ name, url }) =>
  url ? (
    <img src={url} alt="" width={40} height={40} style={{ borderRadius: '50%', objectFit: 'cover', flex: 'none' }} />
  ) : (
    <span
      aria-hidden="true"
      style={{
        width: 40, height: 40, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center',
        background: 'var(--pj-grad-spatial)', color: '#fff',
        fontFamily: 'var(--font-label)', fontSize: 15, fontWeight: 800,
      }}
    >
      {(name || '?').slice(0, 1).toUpperCase()}
    </span>
  );

// ── Circle — personal CRM ────────────────────────────────────────────────

export const Circle: React.FC = () => {
  const [res, setRes] = useState<CircleResult | null>(null);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true); setRes(await assembleCircle()); setBusy(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div style={{ display: 'grid', gap: 'var(--pj-space-5)' }}>
      <Header
        title="Circle"
        busy={busy}
        onRefresh={load}
        blurb={
          res && res.contacts.length > 0
            ? `${res.contacts.length} people, assembled from relationships already on your account. Nothing imported, nothing typed.`
            : 'Your people, assembled from the connections Plajah already holds.'
        }
      />

      {res?.contacts.map((c) => (
        <Surface key={c.uid} level={1}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--pj-space-3)' }}>
            <Avatar name={c.displayName} url={c.photoURL} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="type-title-md" style={{ margin: 0 }}>{c.displayName}</p>
              {/* The reason you know them is the product. It is never a guess —
                  each line is a relationship the platform can actually observe. */}
              <p className="type-body-sm" style={{ margin: 0, color: 'var(--on-surface-variant)' }}>
                {c.reasons.join(' · ')}
              </p>
            </div>
          </div>
        </Surface>
      ))}

      {!busy && res && res.contacts.length === 0 && (
        <p className="type-body-md" style={{ color: 'var(--on-surface-variant)', textAlign: 'center', padding: 'var(--pj-space-8) 0' }}>
          {res.partial
            ? 'Could not reach your connections just now. Try refreshing.'
            : 'No shared connections yet. Follow people back, or join a club, and they will appear here on their own.'}
        </p>
      )}
      <Incomplete show={!!res?.partial && (res?.contacts.length ?? 0) > 0} />
    </div>
  );
};

// ── Shelf — save for later ───────────────────────────────────────────────

const WINDOWS = [10, 30, 60] as const;

export const Shelf: React.FC = () => {
  const [res, setRes] = useState<ShelfResult | null>(null);
  const [busy, setBusy] = useState(true);
  const [window_, setWindow] = useState<number | null>(null);

  const load = useCallback(async () => {
    setBusy(true); setRes(await assembleShelf()); setBusy(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const all = res?.items ?? [];
  const shown = window_ === null ? all : finishableIn(all, window_);

  return (
    <div style={{ display: 'grid', gap: 'var(--pj-space-5)' }}>
      <Header
        title="Shelf"
        busy={busy}
        onRefresh={load}
        blurb="Everything you meant to get back to, in one queue — sorted by how long it takes."
      />

      {all.length > 0 && (
        <div style={{ display: 'flex', gap: 'var(--pj-space-2)', flexWrap: 'wrap' }}>
          <Chip interactive selected={window_ === null} onClick={() => setWindow(null)}>Everything</Chip>
          {WINDOWS.map((w) => (
            <Chip key={w} interactive selected={window_ === w} onClick={() => setWindow(w)}>
              I have {w} min
            </Chip>
          ))}
        </div>
      )}

      {shown.map((i) => (
        <Surface key={`${i.kind}_${i.id}`} level={1}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--pj-space-3)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="type-title-md" style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {i.title}
              </p>
              {i.subtitle && (
                <p className="type-body-sm" style={{ margin: 0, color: 'var(--on-surface-variant)' }}>{i.subtitle}</p>
              )}
            </div>
            <span className="type-body-sm" style={{ color: 'var(--on-surface-variant)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {i.minutes === null ? '—' : `${i.minutes} min`}
            </span>
            <Chip>{i.label}</Chip>
            {i.ref && (
              <Button as="a" href={i.ref} variant="ghost" size="sm" iconOnly icon={<ExternalLink />} aria-label={`Open in ${i.label}`} />
            )}
          </div>
        </Surface>
      ))}

      {!busy && all.length === 0 && (
        <p className="type-body-md" style={{ color: 'var(--on-surface-variant)', textAlign: 'center', padding: 'var(--pj-space-8) 0' }}>
          {res?.partial
            ? 'Could not reach your saved items just now. Try refreshing.'
            : 'Nothing saved yet. Anything you add to Watch Later lands here.'}
        </p>
      )}
      {!busy && all.length > 0 && shown.length === 0 && (
        <p className="type-body-md" style={{ color: 'var(--on-surface-variant)', textAlign: 'center' }}>
          Nothing on the shelf fits in {window_} minutes.
        </p>
      )}
      <Incomplete show={!!res?.partial && all.length > 0} />
    </div>
  );
};

// ── Portfolio — credits, not claims ──────────────────────────────────────

export const Portfolio: React.FC = () => {
  const [res, setRes] = useState<WorkbenchResult | null>(null);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true); setRes(await assembleWorkbench()); setBusy(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Portfolio and Workbench read the same artefacts on purpose: the difference
  // is the question being asked. Workbench asks "what is unfinished"; Portfolio
  // asks "what exists". Same truth, two readings.
  const credits = (res?.projects ?? []).filter((p) => p.items.length > 0 || p.state);

  return (
    <div style={{ display: 'grid', gap: 'var(--pj-space-5)' }}>
      <Header
        title="Portfolio"
        busy={busy}
        onRefresh={load}
        blurb="A record made of artefacts, not claims. Every line is a file that exists on this platform."
      />

      {credits.map((p) => (
        <Surface key={p.id} level={1}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--pj-space-3)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="type-title-md" style={{ margin: 0 }}>{p.title}</p>
              <p className="type-body-sm" style={{ margin: 0, color: 'var(--on-surface-variant)' }}>{p.state}</p>
            </div>
            {p.updatedAt > 0 && (
              <span className="type-body-sm" style={{ color: 'var(--on-surface-variant)', fontVariantNumeric: 'tabular-nums' }}>
                {new Date(p.updatedAt).getFullYear()}
              </span>
            )}
            <Chip>{p.label}</Chip>
          </div>
        </Surface>
      ))}

      {credits.length > 0 && (
        <Surface level={2}>
          <div style={{ display: 'flex', gap: 'var(--pj-space-3)', alignItems: 'flex-start' }}>
            <ShieldCheck size={16} style={{ color: 'var(--pj-cyan)', flex: 'none', marginTop: 3 }} />
            <p className="type-body-sm" style={{ margin: 0, color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
              Nothing here is self-reported. A portable, signed version travels with your
              Creator Passport — that part is not built yet, so this record currently lives
              on Plajah only.
            </p>
          </div>
        </Surface>
      )}

      {!busy && credits.length === 0 && (
        <p className="type-body-md" style={{ color: 'var(--on-surface-variant)', textAlign: 'center', padding: 'var(--pj-space-8) 0' }}>
          {res?.partial
            ? 'Could not reach your work just now. Try refreshing.'
            : 'No credits yet. Anything you release, write or publish becomes a line here.'}
        </p>
      )}
      <Incomplete show={!!res?.partial && credits.length > 0} />
    </div>
  );
};

// ── Rhythm — the week, already filled in ─────────────────────────────────

const DAY_FMT = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
const TIME_FMT = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

export const Rhythm: React.FC = () => {
  const [res, setRes] = useState<RhythmResult | null>(null);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true); setRes(await assembleRhythm(14)); setBusy(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const days = byDay(res?.entries ?? []);

  return (
    <div style={{ display: 'grid', gap: 'var(--pj-space-5)' }}>
      <Header
        title="Rhythm"
        busy={busy}
        onRefresh={load}
        blurb={
          res && res.entries.length > 0
            ? `The next two weeks, filled in from commitments Plajah already knows about. ${res.entries.length} thing${res.entries.length === 1 ? '' : 's'} — none of it typed.`
            : 'Your next two weeks, assembled from shows, tickets, club events and scheduled releases.'
        }
      />

      {days.map(({ day, at, entries }) => (
        <div key={day}>
          <Eyebrow style={{ marginBottom: 'var(--pj-space-3)' }}>{DAY_FMT.format(new Date(at))}</Eyebrow>
          <div style={{ display: 'grid', gap: 'var(--pj-space-2)' }}>
            {entries.map((e) => (
              <Surface key={e.id} level={1}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--pj-space-3)' }}>
                  <span
                    className="type-body-sm"
                    style={{ color: 'var(--on-surface-variant)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', minWidth: 62 }}
                  >
                    {TIME_FMT.format(new Date(e.at))}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="type-title-md" style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.title}
                    </p>
                    {e.subtitle && (
                      <p className="type-body-sm" style={{ margin: 0, color: 'var(--on-surface-variant)' }}>{e.subtitle}</p>
                    )}
                  </div>
                  <Chip>{e.label}</Chip>
                  {e.ref && (
                    <Button as="a" href={e.ref} variant="ghost" size="sm" iconOnly icon={<ExternalLink />} aria-label="Open" />
                  )}
                </div>
              </Surface>
            ))}
          </div>
        </div>
      ))}

      {/* A free week and an unreadable week look identical on screen unless you
          say so, and telling someone their Friday is clear when it is not is the
          one failure this surface must never have. */}
      {!busy && days.length === 0 && (
        <p className="type-body-md" style={{ color: 'var(--on-surface-variant)', textAlign: 'center', padding: 'var(--pj-space-8) 0' }}>
          {res?.partial
            ? 'Could not read your commitments just now, so this week may not be empty. Try refreshing.'
            : 'Nothing scheduled in the next two weeks.'}
        </p>
      )}
      <Incomplete show={!!res?.partial && days.length > 0} />
    </div>
  );
};
