// StemLessonReader — one STEM lesson, teacher- and student-readable: objectives, vocabulary, hook, the Build
// activity (opens the room with its starter), worked examples, practice with a hideable key, exit ticket,
// differentiation and supports, safety, standards. Practice opens as a Tela worksheet; the lesson assigns as classwork.
import React, { useState } from 'react';
import { ArrowLeft, Hammer, Lightbulb, KeyRound, ShieldAlert, Target, BookOpen, ClipboardList, PenTool, Accessibility, FlaskConical, Send } from 'lucide-react';
import type { StemBand, StemLesson } from '../../data/stem/types';
import { BUILD_ROOM_LABEL, openBuild } from '../../services/stem/launch';
import { lessonSeed, lessonWorksheet } from '../../services/stem/classwork';
import StemAssignPanel from './StemAssignPanel';

export const STEM_ACCENT = '#0E8074';
export const STEM_ACCENT_2 = '#F0603E';
const SAFETY_LABEL = { 'sim-only': 'Simulation only', low: 'Low risk', supervised: 'Adult-supervised' } as const;

const Card: React.FC<{ icon: React.ComponentType<{ size?: number }>; title: string; children: React.ReactNode; tone?: string }> = ({ icon: Icon, title, children, tone = STEM_ACCENT }) => (
  <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
    <h3 className="flex items-center gap-2 text-[13px] font-black uppercase tracking-wider mb-3" style={{ color: tone }}><Icon size={15} /> {title}</h3>
    <div className="text-[14px] leading-relaxed text-white/80 space-y-2">{children}</div>
  </section>
);

async function openWorksheet(l: StemLesson & { band: StemBand }, ownerId?: string) {
  const [{ worksheetToTela }, { saveTelaDoc }] = await Promise.all([import('../../services/yearCurriculum/telaWorksheet'), import('../../services/telaStore')]);
  const { doc } = worksheetToTela(lessonWorksheet(l), { ownerId, includeKey: true });
  await saveTelaDoc(doc);
  window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId: doc.id } }));
}

const StemLessonReader: React.FC<{
  lesson: StemLesson & { band: StemBand; unitId: string };
  unitTitle: string;
  onBack: () => void;
  user?: any; profile?: any; onNavigate?: (v: string) => void;
}> = ({ lesson: l, unitTitle, onBack, user, profile, onNavigate }) => {
  const [showKey, setShowKey] = useState(false);
  const [assign, setAssign] = useState(false);
  const [wsBusy, setWsBusy] = useState(false);
  const launch = { ...l.build.launch, lesson: l.id };
  const codes = [...(l.standards.ngss || []), ...(l.standards.ccss || []).map(c => c.replace(/^CCSS\.MATH\.CONTENT\./, 'CCSS ')), ...(l.standards.csta || []).map(c => `CSTA ${c}`)];
  const intl = Object.entries(l.standards.intl || {}).filter(([, v]) => v) as Array<[string, string]>;

  return (
    <article className="space-y-4" data-testid="stem-lesson">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/60 hover:text-white"><ArrowLeft size={14} /> {unitTitle}</button>
      <header className="rounded-3xl border border-white/10 p-6" style={{ background: `linear-gradient(135deg, ${STEM_ACCENT}26, transparent 60%)` }}>
        <p className="text-[11px] font-black uppercase tracking-[0.2em]" style={{ color: '#5fd1c2' }}>Grades {l.band} · {l.minutes} min{l.mathFocus ? ` · Math focus: ${l.mathFocus}` : ''}</p>
        <h2 className="text-2xl sm:text-3xl font-black mt-1">{l.title}</h2>
        <ul className="mt-3 space-y-1 text-[14.5px] text-white/85">{l.objectives.map(o => <li key={o}>• {o}</li>)}</ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => openBuild(launch)} className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white" style={{ background: STEM_ACCENT }} data-testid="stem-open-build"><Hammer size={14} /> Open {BUILD_ROOM_LABEL[l.build.launch.room]}</button>
          <button onClick={async () => { setWsBusy(true); try { await openWorksheet(l, user?.uid); } finally { setWsBusy(false); } }} disabled={wsBusy} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-xs font-black uppercase tracking-wider hover:bg-white/10 disabled:opacity-60"><PenTool size={14} /> {wsBusy ? 'Laying out…' : 'Worksheet in Tela'}</button>
          <button onClick={() => setAssign(a => !a)} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-xs font-black uppercase tracking-wider hover:bg-white/10"><Send size={14} /> Assign as classwork</button>
          {l.museion && <button onClick={() => window.dispatchEvent(new CustomEvent('OPEN_LABS_DISCIPLINE', { detail: { disciplineId: l.museion } }))} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-xs font-black uppercase tracking-wider hover:bg-white/10"><FlaskConical size={14} /> Museion</button>}
        </div>
        {assign && <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4"><StemAssignPanel seed={lessonSeed(l)} user={user} profile={profile} onNavigate={onNavigate} /></div>}
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card icon={Lightbulb} title="Hook"><p>{l.hook}</p></Card>
        <Card icon={BookOpen} title="Vocabulary">
          <dl className="grid gap-1.5">{l.vocab.map(([t, d]) => <div key={t}><dt className="inline font-bold text-white">{t}</dt> <dd className="inline text-white/70">— {d}</dd></div>)}</dl>
        </Card>
      </div>

      <Card icon={Hammer} title={`Build: ${l.build.title}`}>
        <ol className="list-decimal pl-5 space-y-1">{l.build.steps.map(s => <li key={s}>{s}</li>)}</ol>
        {!!l.build.materials?.length && <p className="text-[12.5px] text-white/55">Physical kit (optional): {l.build.materials.join(', ')}</p>}
        <p className="text-[12.5px] text-white/55">Opens in {BUILD_ROOM_LABEL[l.build.launch.room]}{l.build.launch.template ? ` with the “${l.build.launch.template}” starter` : ''}{l.build.launch.prompt ? `: “${l.build.launch.prompt}”` : ''}.</p>
      </Card>

      <Card icon={ClipboardList} title="Worked examples">
        {l.worked.map(w => (
          <div key={w.prompt} className="rounded-xl bg-black/25 p-3">
            <p className="font-bold text-white">{w.prompt}</p>
            <ol className="list-decimal pl-5 mt-1 text-white/75">{w.steps.map(s => <li key={s}>{s}</li>)}</ol>
            <p className="mt-1 font-bold" style={{ color: '#5fd1c2' }}>{w.answer}</p>
          </div>
        ))}
      </Card>

      <Card icon={Target} title="Practice">
        <button onClick={() => setShowKey(k => !k)} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-[11px] font-black uppercase tracking-wider hover:bg-white/10" data-testid="stem-key-toggle"><KeyRound size={12} /> {showKey ? 'Hide key' : 'Show key'}</button>
        <ol className="list-decimal pl-5 space-y-2 mt-2">
          {l.practice.map(p => (
            <li key={p.q}>
              <span>{p.q}</span> <span className="text-[11px] text-white/40">{'●'.repeat(p.level)}</span>
              {showKey && <p className="text-[13px] font-bold" style={{ color: STEM_ACCENT_2 }}>{p.answer}</p>}
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card icon={Send} title="Exit ticket"><p>{l.exitTicket.q}</p>{showKey && <p className="text-[13px] font-bold" style={{ color: STEM_ACCENT_2 }}>{l.exitTicket.answer}</p>}</Card>
        <Card icon={ShieldAlert} title={`Safety · ${SAFETY_LABEL[l.safety.level]}`} tone="#F5B83D"><p>{l.safety.note}</p></Card>
      </div>

      <Card icon={Accessibility} title="Differentiation & supports">
        <p><b className="text-white">Support:</b> {l.differentiation.support.join(' ')}</p>
        <p><b className="text-white">Extension:</b> {l.differentiation.extension.join(' ')}</p>
        {l.differentiation.ell && <p><b className="text-white">English learners:</b> {l.differentiation.ell}</p>}
        {!!l.differentiation.supports?.length && <p className="text-[12.5px] text-white/55">Designed for learning-support settings: {l.differentiation.supports.join(', ')}.</p>}
      </Card>

      <p className="text-[12px] text-white/50"><Target size={11} className="inline mr-1" />{codes.join(' · ')}{intl.length ? ` · ${intl.map(([k, v]) => `${k.toUpperCase()}: ${v}`).join(' · ')}` : ''}</p>
    </article>
  );
};

export default StemLessonReader;
