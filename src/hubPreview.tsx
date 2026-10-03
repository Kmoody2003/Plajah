// Dev-only: renders the new Academia screens directly (no sign-in gate) so layout and flow can be
// reviewed. Firestore reads fail soft, so data panels show their empty states; everything stored
// locally (notes, investigations, practice mastery) works for real. Delete freely.
//
//   /hub-preview.html?screen=student|teacher|parent|homeschool|learn|notes|inquiry
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import AcademiaHomeView from '../components/AcademiaHomeView';
import RoleLensBar from '../components/academia/RoleLensBar';
import LearnMapView from '../components/learn/LearnMapView';
import LessonReader from '../components/learn/LessonReader';
import NotesStudio from '../components/notes/NotesStudio';
import InvestigationStudio from '../components/inquiry/InvestigationStudio';
import HomeschoolHub from '../components/academia/HomeschoolHub';
import { FediverseProvider } from '../contexts/FediverseContext';

const SCREENS = ['student', 'teacher', 'parent', 'homeschool', 'learn', 'notes', 'inquiry', 'lesson'] as const;
const SAMPLE_LESSON = [
  'In 1848, a wave of revolutions swept across the continent, sometimes called the Springtime of the Peoples. In February, French protesters overthrew King Louis-Philippe and founded the Second Republic. Uprisings followed in the Habsburg lands, the German states and Italy, driven by demands for constitutions, national unity and the rights of workers.',
  'Most of these revolutions were put down within a year. Armies loyal to the old rulers regained control, and the liberal assemblies, including the one that met in Frankfurt in May, failed to produce lasting unity.',
  'Worked example: in 1848 the Frankfurt Parliament drafted a constitution for a united Germany, then offered the crown to the Prussian king, who refused it. Without a ruler willing to accept it, the project collapsed.',
  'Why it matters: the failures of 1848 did not end the ideas. Constitutions, national unity and the rights of workers returned within a generation, shaped by the lessons of defeat.',
  'Trap: it is easy to call 1848 a total failure. Several reforms survived, including the end of serfdom in the Habsburg lands.',
  'Try this: list two causes and two outcomes of the 1848 revolutions.',
].join(String.fromCharCode(10, 10));
type Screen = (typeof SCREENS)[number];
const q = new URLSearchParams(location.search);
const initial = (q.get('screen') || q.get('role') || 'student') as Screen;
const user: any = { uid: 'preview', displayName: 'Kenne Moody' };
const base: any = { uid: 'preview', displayName: 'Kenne Moody', birthYear: 2012 };
const profileFor = (s: Screen) => ({ ...base, accountType: s === 'teacher' ? 'TEACHER' : s === 'parent' || s === 'homeschool' ? 'PARENT' : 'STUDENT' });

const App: React.FC = () => {
  const [screen, setScreen] = useState<Screen>(SCREENS.includes(initial) ? initial : 'student');
  const go = (s: Screen) => { setScreen(s); history.replaceState(null, '', `?screen=${s}`); };
  // Map in-app view names to preview screens so buttons inside a screen keep working.
  const nav = (v: string) => {
    const m: Record<string, Screen> = { LEARN: 'learn', NOTES: 'notes', INQUIRY: 'inquiry', HOMESCHOOL: 'homeschool', ACADEMIA_HOME: 'student', STUDENT_HOME: 'student' };
    if (m[v]) go(m[v]); else console.log('navigate (not previewed):', v);
  };
  const profile = profileFor(screen);
  return (
    <FediverseProvider>
      <div style={{ position: 'sticky', top: 0, zIndex: 400, display: 'flex', gap: 6, padding: '8px 12px', background: '#130e1c', borderBottom: '1px solid rgba(255,255,255,.12)', overflowX: 'auto', fontFamily: 'system-ui', fontSize: 12 }}>
        <b style={{ color: '#00DAF3', alignSelf: 'center', marginRight: 6, whiteSpace: 'nowrap' }}>PREVIEW</b>
        {SCREENS.map(s => <button key={s} onClick={() => go(s)} style={{ padding: '6px 12px', borderRadius: 99, border: '1px solid rgba(255,255,255,.2)', background: s === screen ? '#fff' : 'transparent', color: s === screen ? '#12091b' : '#fff', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>{s}</button>)}
      </div>
      {(screen === 'student' || screen === 'teacher' || screen === 'parent') && <AcademiaHomeView user={user} profile={profile} onNavigate={nav} />}
      {screen === 'homeschool' && <HomeschoolHub user={user} profile={profile} onNavigate={nav} />}
      {screen === 'lesson' && <LessonReader canPractice onPractice={() => {}} onClose={() => go('student')} lesson={{ id: 'history-europe.l22', courseId: 'history-europe', accent: '#3B82F6', courseTitle: 'History of Europe', title: 'The Springtime of the Peoples', body: SAMPLE_LESSON }} />}
      {screen === 'learn' && <LearnMapView user={user} profile={profile} onNavigate={nav} onBack={() => go('student')} />}
      {screen === 'notes' && <div style={{ height: 'calc(100vh - 44px)' }}><NotesStudio user={user} profile={profile} onNavigate={nav} onBack={() => go('student')} /></div>}
      {screen === 'inquiry' && <InvestigationStudio user={user} profile={profile} onNavigate={nav} onBack={() => go('learn')} />}
      {(screen === 'student' || screen === 'teacher' || screen === 'parent') && <RoleLensBar lens={screen === 'student' ? 'student' : screen === 'teacher' ? 'teacher' : 'parent'} onChange={r => go((r || 'student') as Screen)} />}
    </FediverseProvider>
  );
};

createRoot(document.getElementById('root')!).render(<App />);
