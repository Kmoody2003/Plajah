// AcademiaDemosView — "Learn the platform". The single home for every demo of Plajah Academia.
//
// Before this, "take the tour" was hard-coded in three unrelated places (AcademiaHomeView,
// ClassroomsView, LandingPage), each dropping you at the same role picker with no context and
// no way back to the others. Nothing collected them, so nothing could tell you what was
// available or in what order to try it.
//
// The design is the "corridor" from the entry-point concepts: doors ajar on real content rather
// than a list of links. The wide door is the recommended route; the rest stay openable. On a
// phone the doors stack, because a four-across corridor at 360px gives you four unreadable
// slivers — the mechanic has to survive the small screen, not just look good on the big one.
//
// Everything here is a stage set: real software, invented people, nothing written to the
// account. That promise is stated on the screen because it's the thing that makes someone
// willing to press buttons.

import React from 'react';
import {
  ArrowLeft, GraduationCap, Baby, Users, School, Wrench, LayoutGrid, ArrowRight, Sparkles,
} from 'lucide-react';
import { useViewport } from '../../hooks/useViewport';
import DoorCard from './DoorCard';
import { T } from './integrityTheme';

export type DemoRole = 'teacher' | 'parent' | 'student';

import type { DoorSpec } from './DoorCard';

/** A corridor door plus where it leads: a role opens the tour there, a view navigates. */
interface Door extends DoorSpec {
  minutes?: number;
  role?: DemoRole;
  view?: string;
}

const DOORS: Door[] = [
  {
    key: 'teacher',
    kicker: 'Teacher · 6 min',
    title: 'Run Room 4B for a week',
    blurb: 'Plan from mastery, build a lesson from the archives, grade a rubric, and watch the learning record fill in.',
    minutes: 6,
    icon: GraduationCap,
    from: 'rgba(255,140,0,0.55)', to: 'rgba(212,0,85,0.32)',
    role: 'teacher',
    wide: true,
  },
  {
    key: 'student',
    kicker: 'Student · 4 min',
    title: 'Do it, hand it in',
    blurb: 'The same lesson from the other side of the desk.',
    minutes: 4,
    icon: Baby,
    from: 'rgba(0,218,243,0.42)', to: 'rgba(107,0,153,0.45)',
    role: 'student',
  },
  {
    key: 'parent',
    kicker: 'Parent · 3 min',
    title: 'See what your child sees',
    blurb: 'Their week, their record, and exactly what is shared with you.',
    minutes: 3,
    icon: Users,
    from: 'rgba(208,188,255,0.42)', to: 'rgba(107,0,153,0.45)',
    role: 'parent',
  },
  {
    key: 'school',
    kicker: 'School & district',
    title: 'Rollout and safeguarding',
    blurb: 'The integrity wall, the portable learning record, and what a school package includes.',
    icon: School,
    from: 'rgba(6,214,160,0.32)', to: 'rgba(0,218,243,0.22)',
    view: 'SCHOOL_PACKAGE',
  },
];

// Sandboxes: real tools rather than a scripted walkthrough. Listed apart from the doors
// because they have no ending — you leave when you're done, not when the story is.
const SANDBOXES: Array<{ key: string; title: string; blurb: string; icon: React.ElementType; view: string }> = [
  { key: 'tools', title: 'Teacher Tools sandbox', blurb: 'Build a real lesson, scan a worksheet, score a rubric.', icon: Wrench, view: 'TEACHER_TOOLS' },
  { key: 'class', title: 'The demo classroom', blurb: '28 students, a gradebook, and a term of history behind them.', icon: LayoutGrid, view: 'CLASSROOMS' },
];

const AcademiaDemosView: React.FC<{
  onBack?: () => void;
  /** Opens the role tour at a specific role, skipping its picker. */
  onOpenTour: (role?: DemoRole) => void;
  onNavigate: (view: string) => void;
}> = ({ onBack, onOpenTour, onNavigate }) => {
  const isPhone = useViewport().breakpoint === 'phone';

  const open = (door: Door) => {
    if (door.role) onOpenTour(door.role);
    else if (door.view) onNavigate(door.view);
  };

  return (
    <div style={{ background: T.bg, minHeight: '100%', color: T.ink, fontFamily: T.font }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '20px 20px 40px' }}>
        {onBack && (
          <button
            onClick={onBack}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 18,
              background: 'transparent', border: 0, color: T.muted, cursor: 'pointer',
              fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
              fontFamily: 'inherit', padding: 0,
            }}
          >
            <ArrowLeft size={14} /> Academia
          </button>
        )}

        <p style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.24em', textTransform: 'uppercase',
          color: T.faint, margin: 0,
        }}>Learn the platform</p>
        <h1 style={{
          margin: '8px 0 0', fontSize: 'clamp(28px, 6vw, 44px)', fontWeight: 900,
          fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: '-0.03em', lineHeight: 0.94,
        }}>A week in<br />five minutes.</h1>
        <p style={{ margin: '14px 0 0', fontSize: 14.5, lineHeight: 1.65, color: T.muted, maxWidth: '56ch' }}>
          One story from three sides. Ms. Rivera builds a lesson, Maya does it, and her dad sees
          the result. Real software, invented people — press anything you like.
        </p>

        {/* ── The corridor ─────────────────────────────────────────────────── */}
        {/* One column on a phone, two above it. The wide door may only span 2 when there ARE 2:
            with `auto-fit` at 375px the grid collapses to a single track, and a `span 2` child
            then conjures a phantom second column — which squeezed the next door to an 83px-wide,
            389px-tall sliver. Driving the count explicitly makes that impossible. */}
        <div style={{
          display: 'grid', gap: 12, marginTop: 26,
          gridTemplateColumns: isPhone ? '1fr' : 'repeat(2, minmax(0, 1fr))',
        }}>
          {DOORS.map(d => (
            <div key={d.key} style={{ gridColumn: d.wide && !isPhone ? 'span 2' : 'auto', minWidth: 0 }}>
              <DoorCard door={d} onOpen={() => open(d)} />
            </div>
          ))}
        </div>

        {/* ── Sandboxes ────────────────────────────────────────────────────── */}
        <p style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase',
          color: T.faint, margin: '30px 0 10px',
        }}>Or just use the real thing</p>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: isPhone ? '1fr' : 'repeat(2, minmax(0, 1fr))' }}>
          {SANDBOXES.map(s => {
            const Icon = s.icon;
            return (
              <button
                key={s.key}
                onClick={() => onNavigate(s.view)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 13, textAlign: 'left',
                  padding: '14px 15px', borderRadius: 14, background: T.card,
                  border: `1px solid ${T.border}`, color: T.ink, cursor: 'pointer',
                  fontFamily: 'inherit', width: '100%',
                }}
              >
                <span style={{
                  flex: 'none', width: 38, height: 38, borderRadius: 11, display: 'grid',
                  placeItems: 'center', background: 'rgba(255,255,255,0.05)',
                  border: `1px solid ${T.border}`,
                }}><Icon size={17} color={T.cyan} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700 }}>{s.title}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: T.muted, marginTop: 2, lineHeight: 1.45 }}>{s.blurb}</span>
                </span>
                <ArrowRight size={15} color={T.faint} />
              </button>
            );
          })}
        </div>

        {/* ── The promise ──────────────────────────────────────────────────── */}
        <div style={{
          marginTop: 26, padding: '15px 17px', borderRadius: 14,
          border: `1px dashed ${T.border}`, display: 'flex', gap: 11, alignItems: 'flex-start',
        }}>
          <Sparkles size={15} color={T.lilac} style={{ flex: 'none', marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: T.muted }}>
            Nothing in a demo touches your account, and nothing you do here is kept. Leave whenever
            you like — you'll come back to exactly where you were.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AcademiaDemosView;
