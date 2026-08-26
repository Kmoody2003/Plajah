// AcademiaHomeView — the Plajah Academia PORTAL. This is the home page for education accounts
// (teacher / parent / student / child) instead of the Global Archive dashboard: a role-aware
// hub into the whole EdTech stack — classes, the Dojo, quests, the learning ledger, the content
// library, and the demo tour — with the family-safe / no-ads trust line front and center.

import React from 'react';
import {
  GraduationCap, ShieldCheck, LayoutGrid, Award, BookOpen, Languages,
  ClipboardList, Library, Sparkles, FlaskConical, Music, Film, Image as ImageIcon, ChevronRight,
  School, ArrowRight, Rocket, PenLine,
} from 'lucide-react';
import type { UserProfile } from '../types';
import { ageTokensFor } from '../data/ageScaling';
import AcademiaModules from './AcademiaModules';
import TodayDueFirst from './academia/TodayDueFirst';
import DiscoveryDoors from './academia/DiscoveryDoors';
import { lessonLink } from '../services/assignmentTemplateService';

type Role = 'teacher' | 'parent' | 'student';

interface Tile {
  key: string; label: string; desc: string; icon: React.ElementType; view: string; accent: string;
  roles: Role[]; badge?: string;
}

const TILES: Tile[] = [
  { key: 'classes',  label: 'My Classes',        desc: 'Courses, modules, assignments & grades', icon: LayoutGrid,   view: 'CLASSROOMS',    accent: '#FF8C00', roles: ['teacher', 'student'] },
  { key: 'dojo',     label: 'Class Points',      desc: 'Behavior & skill points, attendance, class story', icon: Award, view: 'CLASS_POINTS', accent: '#2bd67a', roles: ['teacher', 'parent', 'student'] },
  { key: 'reading',  label: 'Reading Quest',     desc: 'Gamified reading practice, PreK → G7', icon: BookOpen,     view: 'READING_QUEST', accent: '#36c5f0', roles: ['teacher', 'parent', 'student'] },
  { key: 'penna',    label: 'Penna',             desc: 'Handwriting workshop — trace letters, earn the picture, PreK →', icon: PenLine, view: 'HANDWRITING_WORKSHOP', accent: '#C9871F', roles: ['teacher', 'parent', 'student'], badge: 'New' },
  { key: 'lang',     label: 'Languages',         desc: 'Learn a language, Duolingo-style, in the lesson', icon: Languages, view: 'LANGUAGE_QUEST', accent: '#7a2bd6', roles: ['teacher', 'parent', 'student'], badge: 'New' },
  { key: 'tools',    label: 'Teacher Tools',     desc: 'Build lessons, quests & assignments', icon: ClipboardList, view: 'TEACHER_TOOLS', accent: '#FF8C00', roles: ['teacher'] },
  { key: 'ledger',   label: 'Learning Record',   desc: 'The portable, student-owned proficiency ledger', icon: ShieldCheck, view: 'LEARNER_LEDGER', accent: '#2bd67a', roles: ['teacher', 'parent', 'student'] },
  { key: 'library',  label: 'Kids Library',      desc: 'Leveled readers, phonics & sight words', icon: Library, view: 'KIDS_LIBRARY', accent: '#36c5f0', roles: ['parent', 'student'] },
  { key: 'labs',     label: 'Plajah Labs',       desc: 'Arts, history & science across the disciplines', icon: FlaskConical, view: 'PLAJAH_LABS', accent: '#7a2bd6', roles: ['teacher', 'parent', 'student'] },
  { key: 'praxis',   label: 'Start a Business',  desc: 'Learn entrepreneurship & money by building a real venture, with Aria', icon: Rocket, view: 'PRAXIS', accent: '#8b5cf6', roles: ['teacher', 'student'], badge: 'New' },
];

// Content sources a teacher can pull into a lesson (Phase D preview — links into the archives).
const CONTENT_SOURCES = [
  { label: 'Chora music history + the Vault', icon: Music, view: 'MUSIC', accent: '#FF8C00' },
  { label: 'Film history (Taleo)', icon: Film, view: 'MOVIES_TV', accent: '#e23b6d' },
  { label: 'Art masters & museum halls', icon: ImageIcon, view: 'ART_GALLERY', accent: '#7a2bd6' },
];

const roleOf = (p?: UserProfile | null): Role => {
  const t = (p as any)?.accountType;
  if (t === 'TEACHER') return 'teacher';
  if (t === 'PARENT') return 'parent';
  return 'student'; // STUDENT + CHILD
};

const ROLE_LABEL: Record<Role, string> = { teacher: 'Teacher', parent: 'Parent', student: 'Student' };

const AcademiaHomeView: React.FC<{ profile?: UserProfile | null; onNavigate: (view: string) => void }> = ({ profile, onNavigate }) => {
  const role = roleOf(profile);
  const tiles = TILES.filter(t => t.roles.includes(role));
  const firstName = (profile?.displayName || '').split(' ')[0] || ROLE_LABEL[role];
  // Phase F — one age-scaling design: the same portal feels right PreK → higher-ed.
  const age = ageTokensFor(profile);
  const subline =
    age.band === 'early'
      ? 'Tap a card to play and learn! 🎉'
      : role === 'teacher' ? 'Your classroom, your tools, and Plajah\'s whole cultural archive — in one place.'
      : role === 'parent'  ? 'Follow your child\'s learning, message their teacher, and explore together — safely.'
      : 'Your quests, your lessons, and everything you\'re learning today.';

  return (
    <div className="min-h-full bg-[#0a0a0f] text-white">
      <div className="max-w-5xl mx-auto px-5 py-8">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3" style={{ color: age.accent }}><GraduationCap size={18} /><span className="text-[11px] font-black uppercase tracking-[0.3em]">Plajah Academia</span></div>
        <h1 className={`${age.heroClass} font-black tracking-tight leading-[1.05] mb-2`}>{age.greeting(firstName)}</h1>
        <p className={`text-white/55 ${age.bodyClass} mb-4`}>{subline}</p>
        <div className="flex flex-wrap items-center gap-2 mb-8">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-green-300 bg-green-500/10 border border-green-500/25 rounded-full px-3 py-1"><ShieldCheck size={12} /> Family-safe · COPPA &amp; FERPA-minded</span>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-white/50 bg-white/5 border border-white/10 rounded-full px-3 py-1">No ads · No student data sold</span>
          <button onClick={() => onNavigate('ACADEMIA_DEMOS')} className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-small-orange bg-small-orange/10 border border-small-orange/25 rounded-full px-3 py-1 hover:bg-small-orange/20 transition-colors"><Sparkles size={11} /> Learn the platform</button>
          <span title="Age-appropriate design, aligned to international ISCED stages" className="inline-flex items-center gap-1.5 text-[10px] font-bold text-white/45 bg-white/5 border border-white/10 rounded-full px-3 py-1">{age.isced}</span>
        </div>

        {/* Due first — the fixed slot. Always above the tiles, for every role, because a
            deadline that sits inside a tile is a deadline nobody sees. */}
        <div className="mb-8">
          <TodayDueFirst
            uid={(profile as any)?.uid}
            role={role}
            // STUDENT_LESSON reads its id from the query string, so push the link before
            // switching view — otherwise the lesson opens with no idea which one it is.
            onOpenAssignment={(id) => {
              try { window.history.pushState({}, '', lessonLink(id)); } catch { /* non-fatal */ }
              onNavigate('STUDENT_LESSON');
            }}
            onNavigate={onNavigate}
          />
        </div>

        {/* Worth a look — invitation, not navigation. Sits between the deadline and the tile
            grid: what you owe, then what you might want, then everything else. */}
        <div className="mb-9">
          <DiscoveryDoors role={role} onNavigate={onNavigate} />
        </div>

        {/* Tiles */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-10">
          {tiles.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => onNavigate(t.view)}
                style={{ minHeight: age.tapMin * 2 }}
                className={`text-left ${age.radius} bg-white/[0.04] border border-white/10 p-5 hover:bg-white/[0.07] hover:-translate-y-0.5 transition-all group`}>
                <div className="flex items-start justify-between mb-3">
                  <div className={`${age.playful ? 'w-14 h-14' : 'w-11 h-11'} ${age.radius} grid place-items-center`} style={{ background: `${t.accent}22`, color: t.accent }}><Icon size={age.playful ? 28 : 22} /></div>
                  {t.badge && <span className="text-[8px] font-black uppercase tracking-widest text-black px-2 py-0.5 rounded-full" style={{ background: t.accent }}>{t.badge}</span>}
                </div>
                <p className={`${age.playful ? 'text-[17px]' : 'text-[15px]'} font-black`}>{t.label}</p>
                <p className="text-[12px] text-white/50 leading-snug mt-0.5">{t.desc}</p>
                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest mt-3 group-hover:gap-2 transition-all" style={{ color: t.accent }}>Open <ChevronRight size={12} /></span>
              </button>
            );
          })}
        </div>

        {/* Learning Modules — their own card-gallery section (shared with the public landing) */}
        <div className="mb-10">
          <AcademiaModules onNavigate={onNavigate} />
        </div>

        {/* School Package — the whole-school stack (clubs, store, live events, sports/streaming) */}
        {role !== 'student' && (
          <button onClick={() => onNavigate('SCHOOL_PACKAGE')}
            className="w-full text-left rounded-2xl border border-[#3FB98E]/30 bg-gradient-to-br from-[#0f1a16] to-[#0a0a0f] p-5 mb-6 hover:border-[#3FB98E]/60 transition-colors group">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl grid place-items-center shrink-0 bg-[#3FB98E]/15 text-[#3FB98E]"><School size={24} /></div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-black">Plajah for Schools — the School Package</p>
                <p className="text-[12px] text-white/55 leading-snug mt-0.5">Clubs, the school store, ticketed live events & streamed athletics — all on one roster.</p>
              </div>
              <ArrowRight size={20} className="text-[#3FB98E] shrink-0 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
        )}

        {/* Teacher content-surfacing (the differentiator) */}
        {role === 'teacher' && (
          <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-5">
            <div className="flex items-center gap-2 mb-1"><Sparkles size={15} className="text-[#3FB98E]" /><h3 className="text-[12px] font-black uppercase tracking-widest text-white/60">Build a lesson from Plajah's archives</h3></div>
            <p className="text-[12px] text-white/45 mb-4">Rights-cleared music, film & art history — the teaching material no other classroom app has.</p>
            <div className="grid sm:grid-cols-3 gap-3">
              {CONTENT_SOURCES.map(c => {
                const Icon = c.icon;
                return (
                  <button key={c.label} onClick={() => onNavigate(c.view)} className="flex items-center gap-3 rounded-xl bg-white/[0.04] border border-white/10 p-3 hover:bg-white/[0.08] transition-colors text-left">
                    <div className="w-9 h-9 rounded-lg grid place-items-center shrink-0" style={{ background: `${c.accent}22`, color: c.accent }}><Icon size={17} /></div>
                    <span className="text-[12px] font-bold text-white/85 leading-tight">{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Student homework — into the actual assignment view (worksheet + tutor + Time Attack) */}
        {role === 'student' && (
          <button onClick={() => onNavigate('STUDENT_ASSIGNMENT')}
            className="w-full text-left rounded-2xl border border-[#FF8C00]/30 bg-gradient-to-br from-[#1a130a] to-[#0a0a0f] p-5 hover:border-[#FF8C00]/60 transition-colors group">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl grid place-items-center shrink-0 bg-[#FF8C00]/15 text-[#FF8C00]"><ClipboardList size={24} /></div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-black">Today's homework · Addition practice</p>
                <p className="text-[12px] text-white/55 leading-snug mt-0.5">Do the worksheet with Plajah's help, or warm up with a Time Attack.</p>
              </div>
              <ArrowRight size={20} className="text-[#FF8C00] shrink-0 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
        )}
      </div>
    </div>
  );
};

export default AcademiaHomeView;
