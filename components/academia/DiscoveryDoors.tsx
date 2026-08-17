// DiscoveryDoors — the "worth a look" row on the Academia portal.
//
// This is the Corridor's job on the Today screen: not navigation (the tiles and the bottom bar
// already do that) but INVITATION. A tile says "Plajah Labs — arts, history & science across the
// disciplines". A door says "drag a real pendulum". One is a category; the other is a reason.
//
// Role decides what's behind them, because a curiosity that lands for a twelve-year-old is not
// the one that lands for their teacher. What does NOT change is the count: four doors, always,
// with the first one wide. A row that varies in length reads as a bug rather than a choice.

import React from 'react';
import { FlaskConical, BookOpen, Library, Languages, Wrench, ShieldCheck, Users, Palette } from 'lucide-react';
import { useViewport } from '../../hooks/useViewport';
import DoorCard, { type DoorSpec } from './DoorCard';
import { T } from './integrityTheme';

type Role = 'teacher' | 'parent' | 'student';

interface Door extends DoorSpec { view: string }

// Blurbs name a concrete thing you can do, never the category the thing belongs to.
const STUDENT: Door[] = [
  { key: 'labs', title: 'The Labs', blurb: 'Drag a real pendulum and watch the maths keep up.', icon: FlaskConical, view: 'PLAJAH_LABS', from: 'rgba(107,0,153,0.7)', to: 'rgba(0,218,243,0.28)', wide: true },
  { key: 'books', kicker: '38 free', title: 'Textbooks', blurb: 'Physics, algebra, biology — free, forever.', icon: BookOpen, view: 'BOOKS', from: 'rgba(6,214,160,0.32)', to: 'rgba(0,218,243,0.22)' },
  { key: 'read', title: 'Reading Quest', blurb: 'Beat your own record.', icon: Library, view: 'READING_QUEST', from: 'rgba(212,0,85,0.5)', to: 'rgba(255,140,0,0.28)' },
  { key: 'lang', title: 'Languages', blurb: 'Ten minutes a day, out loud.', icon: Languages, view: 'LANGUAGE_QUEST', from: 'rgba(208,188,255,0.42)', to: 'rgba(107,0,153,0.45)' },
];

const TEACHER: Door[] = [
  { key: 'tools', title: 'Plan from mastery', blurb: 'Turn this week\'s weakest standard into a differentiated lesson.', icon: Wrench, view: 'TEACHER_TOOLS', from: 'rgba(255,140,0,0.5)', to: 'rgba(212,0,85,0.3)', wide: true },
  { key: 'books', kicker: '38 free', title: 'Textbooks', blurb: 'Assign a chapter without a purchase order.', icon: BookOpen, view: 'BOOKS', from: 'rgba(6,214,160,0.32)', to: 'rgba(0,218,243,0.22)' },
  { key: 'labs', title: 'The Labs', blurb: 'Run a demo on the board.', icon: FlaskConical, view: 'PLAJAH_LABS', from: 'rgba(107,0,153,0.65)', to: 'rgba(0,218,243,0.26)' },
  { key: 'ledger', title: 'Learning record', blurb: 'See who moved this week.', icon: ShieldCheck, view: 'LEARNER_LEDGER', from: 'rgba(208,188,255,0.4)', to: 'rgba(107,0,153,0.45)' },
];

const PARENT: Door[] = [
  { key: 'ledger', title: 'How they\'re doing', blurb: 'The record that follows your child, not the school.', icon: ShieldCheck, view: 'LEARNER_LEDGER', from: 'rgba(107,0,153,0.65)', to: 'rgba(208,188,255,0.3)', wide: true },
  { key: 'points', title: 'Class points', blurb: 'Today\'s wins, as they happen.', icon: Users, view: 'CLASS_POINTS', from: 'rgba(6,214,160,0.32)', to: 'rgba(0,218,243,0.22)' },
  { key: 'kids', title: 'Kids library', blurb: 'Read together tonight.', icon: Library, view: 'KIDS_LIBRARY', from: 'rgba(212,0,85,0.45)', to: 'rgba(255,140,0,0.26)' },
  { key: 'labs', title: 'The Labs', blurb: 'Something to try at the table.', icon: Palette, view: 'PLAJAH_LABS', from: 'rgba(208,188,255,0.42)', to: 'rgba(107,0,153,0.45)' },
];

const DOORS: Record<Role, Door[]> = { student: STUDENT, teacher: TEACHER, parent: PARENT };

const DiscoveryDoors: React.FC<{
  role: Role;
  onNavigate: (view: string) => void;
  heading?: string;
}> = ({ role, onNavigate, heading = 'Worth a look' }) => {
  const isPhone = useViewport().breakpoint === 'phone';
  const doors = DOORS[role];

  return (
    <section>
      <p style={{
        fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase',
        color: T.faint, margin: '0 0 10px',
      }}>{heading}</p>
      {/* Explicit column count, never auto-fit: a `span 2` child alongside auto-fit collapses to
          one track on a phone and conjures a phantom column, which squeezes a sibling to a
          sliver. Same trap as the Demos corridor. */}
      <div style={{
        display: 'grid', gap: 10,
        gridTemplateColumns: isPhone ? '1fr' : 'repeat(2, minmax(0, 1fr))',
      }}>
        {doors.map(d => (
          <div key={d.key} style={{ gridColumn: d.wide && !isPhone ? 'span 2' : 'auto', minWidth: 0 }}>
            <DoorCard door={d} onOpen={() => onNavigate(d.view)} compact={!d.wide} />
          </div>
        ))}
      </div>
    </section>
  );
};

export default DiscoveryDoors;
export { STUDENT as STUDENT_DOORS, TEACHER as TEACHER_DOORS, PARENT as PARENT_DOORS };
