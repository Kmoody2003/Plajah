/**
 * JournalismSchoolView — Plajah School of Journalism: Notice, Ask, Verify, Publish.
 *
 * The full stack for learning journalism, PreK → university, in one place:
 *   LADDER    the five bands and what each one practises
 *   STRANDS   the curriculum (data/journalismCurriculum.ts) in the shared SchoolView reader
 *   NEWSROOM  the Student Newsroom — story kits, desk coach, peer edit, teacher sign-off
 *   PRESS     the Press Room — print edition, newsletter, student wall, broadcast, corrections
 *   TOOLS     Writers Desk, Journalist Desk, Lorea's "The First Draft", Newsstand, outside help
 *
 * Lessons, the Writers Desk and Lorea open specific tabs and kits through
 * services/journalismSchool/newsroomStore.openJournalismSchool.
 */
import React, { Suspense, lazy, useEffect, useState } from 'react';
import { ArrowLeft, Award, BookOpen, Layers, Newspaper, PenLine, Printer, Wrench } from 'lucide-react';
import { JOURNALISM_SCHOOL } from '../data/journalismCurriculum';
import { BAND_LABEL, STORY_KITS } from '../services/journalismSchool/storyKits';
import {
  JOURNALISM_OPEN_EVENT, takePendingJournalismOpen, type JournalismOpen, type JournalismTab,
} from '../services/journalismSchool/newsroomStore';
import { isChildAccount } from '../services/contentSafety';
import StudentNewsroom, { JR_ACCENT, type NewsroomViewer } from './journalism/StudentNewsroom';
import PressRoom from './journalism/PressRoom';

const SchoolView = lazy(() => import('./school/SchoolView'));
const PublicationStudio = lazy(() => import('./publication/PublicationStudio'));

interface Props {
  onBack: () => void;
  onNavigate?: (view: string) => void;
  user?: any;
  profile?: any;
}

const LADDER = [
  { band: 'early' as const, icon: '🖍️', title: 'Little Noticers', desc: 'Who, what, where — said out loud and drawn. Picture News, “How do you know?”, and reporting about friends kindly, with permission.' },
  { band: 'elementary' as const, icon: '🗞️', title: 'Cub Reporters', desc: 'News vs opinion vs ad, the 5 Ws and How, the first interview, the lede, and issue one of the class paper.' },
  { band: 'middle' as const, icon: '📰', title: 'The School Newsroom', desc: 'The inverted pyramid, attribution, exact quotes, honest headlines, photo ethics and lateral reading online.' },
  { band: 'high' as const, icon: '🎙️', title: 'High School Press', desc: 'Beats, the SPJ code, Tinker, Hazelwood and New Voices laws, data, broadcast, editorials and corrections.' },
  { band: 'university' as const, icon: '🔎', title: 'J-School', desc: 'Public records and FOIA, investigations, libel and privacy law, press history from primary sources, AI-era verification and the business of news.' },
];

function viewerFrom(user: any, profile: any): NewsroomViewer {
  const year = new Date().getFullYear();
  const child = isChildAccount(profile);
  const teen = typeof profile?.birthYear === 'number' && year - profile.birthYear < 18;
  return {
    id: user?.uid || profile?.uid || 'guest',
    name: profile?.displayName || user?.displayName || 'Student reporter',
    isMinor: child || teen,
    isChildAccount: child,
  };
}

const JournalismSchoolView: React.FC<Props> = ({ onBack, onNavigate, user, profile }) => {
  const [tab, setTab] = useState<JournalismTab>('LADDER');
  const [req, setReq] = useState<JournalismOpen | null>(null);
  const viewer = viewerFrom(user, profile);
  const lessons = JOURNALISM_SCHOOL.tracks.reduce((n, t) => n + t.lessons.length, 0);

  useEffect(() => {
    const apply = (r: JournalismOpen | null) => { if (!r) return; setReq(r); setTab(r.tab || (r.kitId ? 'NEWSROOM' : 'STRANDS')); };
    apply(takePendingJournalismOpen());
    const on = () => apply(takePendingJournalismOpen());
    window.addEventListener(JOURNALISM_OPEN_EVENT, on);
    return () => window.removeEventListener(JOURNALISM_OPEN_EVENT, on);
  }, []);

  const go = (target: string) => (onNavigate ? onNavigate(target) : window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target } })));
  const openExhibit = (roomId: string) => window.dispatchEvent(new CustomEvent('plajah:openLoreaExhibit', { detail: { id: 'journalism', roomId } }));

  const TABS: { id: JournalismTab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { id: 'LADDER', label: 'PreK → J-School', icon: Award },
    { id: 'STRANDS', label: `Lessons (${lessons})`, icon: Layers },
    { id: 'NEWSROOM', label: 'Student Newsroom', icon: PenLine },
    { id: 'PRESS', label: 'Press Room', icon: Printer },
    { id: 'PUBLICATION', label: 'Our publication', icon: Newspaper },
    { id: 'TOOLS', label: 'Tools', icon: Wrench },
  ];

  return (
    <div className="min-h-full bg-[#0b0908] text-white pb-28">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 mb-6">
          <button onClick={onBack} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-widest text-white/60 hover:bg-white/10 hover:text-white transition-all min-h-[44px]">
            <ArrowLeft size={16} /> Back
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wider" style={{ borderColor: `${JR_ACCENT}55`, background: `${JR_ACCENT}18`, color: '#ffb4a6' }}>
            <Newspaper size={13} /> School of Journalism
          </span>
        </div>

        <header className="relative overflow-hidden rounded-3xl border border-[#d9cfbd]/20 mb-8 bg-[#f6f0e3] text-[#1a1612]">
          <div className="border-b-4 border-double border-[#1a1612] px-6 pt-6 pb-3 sm:px-10 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#8a3324]">Plajah Academia · Vol. 1 · Every grade</p>
            <h1 className="font-serif text-4xl sm:text-6xl font-black tracking-tight leading-none mt-2">The School of Journalism</h1>
          </div>
          <div className="grid gap-6 px-6 py-6 sm:px-10 md:grid-cols-[2fr_1fr]">
            <div>
              <p className="font-serif text-xl sm:text-2xl leading-snug">Notice. Ask. Verify. Publish.</p>
              <p className="mt-3 text-[15px] leading-relaxed text-[#4a4238] max-w-2xl">{JOURNALISM_SCHOOL.blurb}</p>
              <div className="mt-5 flex flex-col sm:flex-row gap-3">
                <button onClick={() => setTab('NEWSROOM')} className="inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-black uppercase tracking-wider text-white min-h-[48px]" style={{ background: JR_ACCENT }}>
                  <PenLine size={18} /> Open the newsroom
                </button>
                <button onClick={() => setTab('STRANDS')} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#1a1612]/20 px-6 py-3.5 text-sm font-black uppercase tracking-wider min-h-[48px] hover:bg-white">
                  <BookOpen size={18} /> {lessons} lessons
                </button>
              </div>
            </div>
            <div className="border-t md:border-t-0 md:border-l border-[#d9cfbd] pt-4 md:pt-0 md:pl-6 text-[13px] text-[#4a4238] space-y-2">
              <p className="font-black uppercase tracking-widest text-[10px] text-[#8a3324]">In this edition</p>
              <p><b>{JOURNALISM_SCHOOL.tracks.length}</b> strands, <b>{lessons}</b> lessons, <b>{STORY_KITS.length}</b> story kits</p>
              <p>A desk coach built on the pro newsroom’s style, headline and claim checkers</p>
              <p>Teacher sign-off, first-names-only and consent rules for young reporters</p>
              <p>Print, newsletter, student wall and broadcast distribution</p>
            </div>
          </div>
        </header>

        <nav className="flex items-center gap-2 border-b border-white/10 pb-4 mb-8 overflow-x-auto no-scrollbar">
          {TABS.map(t => {
            const Icon = t.icon; const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} data-tab={t.id}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-black uppercase tracking-wider shrink-0 min-h-[44px] transition-all ${active ? 'text-[#1a0d08]' : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white'}`}
                style={active ? { background: JR_ACCENT } : undefined}>
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </nav>

        {tab === 'LADDER' && (
          <div className="space-y-4">
            {LADDER.map((s, i) => (
              <div key={s.band} className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.02] p-6">
                <div className="flex items-start sm:items-center gap-4 flex-1">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl border" style={{ background: `${JR_ACCENT}18`, borderColor: `${JR_ACCENT}33` }}>{s.icon}</div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold" style={{ color: JR_ACCENT }}>Band 0{i + 1}</span>
                      <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-white/50">{BAND_LABEL[s.band]}</span>
                    </div>
                    <h4 className="text-lg font-black mt-0.5">{s.title}</h4>
                    <p className="text-xs text-white/60 mt-1 max-w-2xl">{s.desc}</p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setTab('STRANDS')} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold text-white/70 hover:text-white min-h-[44px]">Lessons</button>
                  <button onClick={() => { try { localStorage.setItem('plajah_newsroom_band_v1', s.band); } catch { /* */ } setReq(null); setTab('NEWSROOM'); }}
                    className="rounded-full px-4 py-2 text-xs font-black text-[#1a0d08] min-h-[44px]" style={{ background: JR_ACCENT }}>Report</button>
                </div>
              </div>
            ))}
            <p className="text-[11px] text-white/35 pt-2">There is no national K–12 journalism standard. Lessons align to the Plajah Journalism Progression (PJJR) and cite Common Core ELA writing and speaking standards by code.</p>
          </div>
        )}

        {tab === 'STRANDS' && (
          <Suspense fallback={<p className="text-white/50 text-sm">Loading lessons…</p>}>
            <SchoolView curriculum={JOURNALISM_SCHOOL} embedded />
          </Suspense>
        )}

        {tab === 'NEWSROOM' && (
          <StudentNewsroom key={req?.kitId || req?.storyId || 'desk'} viewer={viewer} initialKitId={req?.kitId} initialStoryId={req?.storyId} initialAssignmentId={req?.assignmentId}
            onOpenLesson={() => setTab('STRANDS')} onOpenExhibitRoom={openExhibit} onOpenPress={() => setTab('PRESS')} />
        )}

        {tab === 'PRESS' && <PressRoom viewer={viewer} />}

        {tab === 'PUBLICATION' && (
          <Suspense fallback={<p className="text-white/50 text-sm">Opening the publication desk…</p>}>
            <p className="mb-4 max-w-3xl text-sm text-white/60">Run a real student newspaper or magazine: a masthead and staff, numbered issues, a page plan, layout in Tela, print-ready files for a home printer or a print shop, and a digital edition on Lorea. Your faculty adviser approves every issue from their own account.</p>
            <PublicationStudio tier="student" user={user ? { uid: user.uid, displayName: user.displayName || profile?.displayName } : null}
              isTeacher={profile?.accountType === 'TEACHER' || !!profile?.isTeacher || (profile?.teachingKind || []).length > 0} />
          </Suspense>
        )}

        {tab === 'TOOLS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              { t: 'Writers Desk', d: 'Plan articles, columns and newsletters alongside your books. Each journalism project opens the matching newsroom kit.', a: () => go('BOOKS'), cta: 'Open Lorea' },
              { t: 'Journalist Desk', d: 'The professional newsroom: pitches, sources, fact-check bench, publish gate, corrections log, RSS/Atom/email syndication. For adult reporters.', a: () => go('JOURNALIST_DESK'), cta: 'Open the desk', hide: viewer.isMinor },
              { t: 'Lorea: “The First Draft”', d: 'The hands-on journalism exhibit: is-it-news, the five-W hunt, the headline builder, the pyramid sort and the history of the presses.', a: () => openExhibit('newsroom'), cta: 'Walk the exhibit' },
              { t: 'Newsstand', d: 'Read published Plajah journalism — and study how it was reported.', a: () => go('ARTICLES'), cta: 'Browse' },
              { t: 'Student Press Law Center', d: 'Free legal help and a hotline for student journalists and advisers.', href: 'https://splc.org/', cta: 'splc.org' },
              { t: 'News Literacy Project', d: 'Checkology and classroom news-literacy lessons, free for educators.', href: 'https://newslit.org/', cta: 'newslit.org' },
            ].filter(x => !x.hide).map(x => (
              <div key={x.t} className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 flex flex-col">
                <h4 className="text-lg font-black">{x.t}</h4>
                <p className="mt-2 text-xs text-white/60 leading-relaxed flex-1">{x.d}</p>
                {x.href
                  ? <a href={x.href} target="_blank" rel="noreferrer" className="mt-4 inline-flex w-fit rounded-2xl border border-white/15 px-5 py-3 text-xs font-black uppercase tracking-wider hover:bg-white/10 min-h-[44px] items-center">{x.cta}</a>
                  : <button onClick={x.a} className="mt-4 w-fit rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-wider text-[#1a0d08] min-h-[44px]" style={{ background: JR_ACCENT }}>{x.cta}</button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default JournalismSchoolView;
