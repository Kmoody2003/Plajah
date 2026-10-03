import React, { useEffect, useMemo, useState } from 'react';
import { Search, X, BookOpen, Headphones, Radio, Play, MessageCircle, Sparkles, AlertTriangle } from 'lucide-react';
import { CLASSIC_GUIDES, CLASSIC_QUESTIONS, CLASSIC_CURRICULUM_ID, BAND_LABEL, BAND_ORDER, bookFor } from '../../data/languageArtsClassics';
import type { ClassicGuide, GradeBand, VaultPair } from '../../data/languageArtsTypes';
import { openClassicInLorea, openVault } from '../../services/loreaOpen';
import { loadMastery, levelFor, levelMeta, lessonKey, type SkillMap } from '../../services/mastery';
import PracticeView, { type PracticeItem } from '../learn/PracticeView';
import AccuracyBadge from '../learn/AccuracyBadge';
import TraditionPanel from '../learn/TraditionPanel';
import { useSchoolProfile } from '../../hooks/useSchoolProfile';
import { filterServable } from '../../services/contentIntegrity';

/**
 * Classics Reading Room — the Language Arts home for great literature. Every book opens FREE in the
 * Lorea reader (notes, highlights, read-aloud); each has a study guide (context, vocabulary,
 * discussion, devices to spot), comprehension practice with mastery, and Chora Vault pairings so a
 * learner can HEAR the world the book came from: era recordings, speeches, oral histories and
 * volunteer read-alouds. Open to everyone; classrooms use the same room.
 */
const KIND_ICON: Record<string, React.ElementType> = { MUSIC: Headphones, HISTORIC: Radio, SPEECH: Radio, AUDIOBOOK: Headphones, FIELD_RECORDING: Radio, INTERVIEW: MessageCircle };
const KIND_LABEL: Record<string, string> = { MUSIC: 'Music', HISTORIC: 'Historic recordings', SPEECH: 'Speeches', AUDIOBOOK: 'Read aloud', FIELD_RECORDING: 'Field recordings', INTERVIEW: 'Oral history' };

const toItem = (qn: (typeof CLASSIC_QUESTIONS)[number]): PracticeItem => ({
  id: qn.id, prompt: qn.prompt, choices: qn.kind === 'tf' ? ['True', 'False'] : (qn.choices || []), answer: qn.answer, hint: qn.hint, explanation: qn.explanation, level: qn.level,
});

const ClassicsReadingRoom: React.FC<{ uid?: string; profile?: any; onNavigate?: (v: string) => void }> = ({ uid, profile }) => {
  const { sp } = useSchoolProfile(profile || { uid });
  const [band, setBand] = useState<GradeBand | 'all'>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<ClassicGuide | null>(null);
  const [map, setMap] = useState<SkillMap>({});
  const [practice, setPractice] = useState<ClassicGuide | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => { let a = true; loadMastery(uid).then(m => a && setMap(m)); return () => { a = false; }; }, [uid]);

  const shown = useMemo(() => CLASSIC_GUIDES.filter(g => {
    if (band !== 'all' && g.gradeBand !== band) return false;
    const b = bookFor(g.id);
    const hay = `${g.title} ${(b?.authors || []).join(' ')} ${g.period} ${g.themes.join(' ')}`.toLowerCase();
    return !q.trim() || hay.includes(q.trim().toLowerCase());
  }), [band, q]);

  const read = (g: ClassicGuide) => {
    const b = bookFor(g.id);
    const ok = openClassicInLorea({ id: g.id, title: g.title, authors: b?.authors, cover: (b as any)?.coverImage });
    if (!ok) { setMsg('That book could not be opened right now.'); setTimeout(() => setMsg(''), 3000); }
  };

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2 className="text-xl font-black uppercase tracking-wider text-white">Classics Reading Room</h2>
          <p className="text-xs text-white/50 max-w-xl">{CLASSIC_GUIDES.length} classics, free in Lorea. Each has a study guide, comprehension practice, and Chora Vault recordings to hear the world it came from.</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input value={q} onChange={e => setQ(e.target.value)} aria-label="Search classics" placeholder="Title, author, theme..."
            className="w-full rounded-full bg-white/[0.06] border border-white/10 pl-9 pr-3 py-2 text-sm placeholder:text-white/35 focus:outline-none focus:border-white/30" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-5" role="group" aria-label="Grade band">
        {(['all', ...BAND_ORDER] as const).map(b => (
          <button key={b} type="button" aria-pressed={band === b} onClick={() => setBand(b)}
            className={`px-3.5 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider transition-colors ${band === b ? 'bg-white text-[#12091b]' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}>
            {b === 'all' ? 'All levels' : BAND_LABEL[b]}
          </button>
        ))}
      </div>
      {msg && <p role="status" className="text-sm text-rose-300 mb-3">{msg}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {shown.map(g => {
          const b = bookFor(g.id); const lv = levelFor(map[lessonKey(CLASSIC_CURRICULUM_ID, g.id)]); const meta = levelMeta(lv);
          const cover = (b as any)?.coverImage as string | undefined;
          return (
            <button key={g.id} type="button" onClick={() => setOpen(g)} className="text-left rounded-2xl overflow-hidden border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] hover:-translate-y-0.5 transition-all">
              <div className="aspect-[2/3] bg-gradient-to-br from-[#2a1650] to-[#12091b] relative">
                {cover && <img src={cover} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />}
                <span className="absolute top-2 left-2 text-[9px] font-black uppercase tracking-wider rounded-full px-2 py-0.5 bg-black/70">{BAND_LABEL[g.gradeBand]}</span>
                {lv !== 'new' && <span className="absolute bottom-2 left-2 text-[9px] font-black uppercase tracking-wider rounded-full px-2 py-0.5" style={{ background: meta.color, color: '#0a0a0f' }}>{meta.label}</span>}
              </div>
              <div className="p-3">
                <p className="text-[13px] font-black leading-tight line-clamp-2">{g.title}</p>
                <p className="text-[11px] text-white/45 mt-0.5 truncate">{(b?.authors || [])[0]} · {g.year}</p>
              </div>
            </button>
          );
        })}
        {shown.length === 0 && <p className="text-sm text-white/45 col-span-full">No classics match that search.</p>}
      </div>

      {open && <GuidePanel school={sp} g={open} level={levelMeta(levelFor(map[lessonKey(CLASSIC_CURRICULUM_ID, open.id)]))} onClose={() => setOpen(null)} onRead={() => read(open)} onPractice={() => setPractice(open)} />}
      {practice && (
        <PracticeView title={practice.title} subtitle="Comprehension" accent="#D40055" skillKey={lessonKey(CLASSIC_CURRICULUM_ID, practice.id)}
          courseId={CLASSIC_CURRICULUM_ID} pool={filterServable(CLASSIC_QUESTIONS.filter(x => x.lessonId === practice.id)).map(toItem)} setSize={5} uid={uid}
          record={{ framework: 'ccss', evidence: `${CLASSIC_CURRICULUM_ID}/${practice.id}` }}
          onClose={(m) => { setPractice(null); if (m) setMap(m); }} />
      )}
    </div>
  );
};

const GuidePanel: React.FC<{ school?: any; g: ClassicGuide; level: ReturnType<typeof levelMeta>; onClose: () => void; onRead: () => void; onPractice: () => void }> = ({ school, g, level, onClose, onRead, onPractice }) => {
  const b = bookFor(g.id);
  return (
    <div role="dialog" aria-modal="true" aria-label={g.title} className="fixed inset-0 z-[250] bg-black/70 backdrop-blur-sm flex justify-end" onClick={onClose}>
      <div className="w-full max-w-xl h-full overflow-y-auto bg-[#0e0b16] border-l border-white/10 p-5 sm:p-6 text-white" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#D40055]">{BAND_LABEL[g.gradeBand]} · {g.form}</p>
            <h2 className="text-xl font-black leading-tight">{g.title}</h2>
            <p className="text-[12px] text-white/55 mb-2">{(b?.authors || []).join(', ')} · {g.year} · {g.period}</p>
            <AccuracyBadge courseId={CLASSIC_CURRICULUM_ID} compact />
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 grid place-items-center rounded-full hover:bg-white/10 text-white/60"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-5">
          <button type="button" onClick={onRead} className="rounded-2xl bg-[#D40055] hover:brightness-110 px-4 py-3 text-sm font-black inline-flex items-center justify-center gap-2"><BookOpen size={16} /> Read in Lorea</button>
          <button type="button" onClick={onPractice} className="rounded-2xl border border-white/15 bg-white/[0.05] hover:bg-white/10 px-4 py-3 text-sm font-black inline-flex items-center justify-center gap-2"><Play size={14} /> Check understanding</button>
        </div>
        <p className="text-[11px] text-white/45 -mt-3 mb-5">Comprehension: <b style={{ color: level.color }}>{level.label}</b></p>

        <div className="flex flex-wrap gap-1.5 mb-4">{g.themes.map(t => <span key={t} className="text-[10px] font-black uppercase tracking-wider rounded-full px-2.5 py-1 bg-white/8 text-white/70">{t}</span>)}</div>
        <p className="text-[14px] leading-relaxed text-white/80 mb-5">{g.context}</p>
        {g.contentNote && <p className="text-[12px] text-amber-200/90 bg-amber-400/10 border border-amber-400/25 rounded-xl px-3 py-2 mb-5 flex gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5" />{g.contentNote}</p>}

        <TraditionPanel courseId={CLASSIC_CURRICULUM_ID} lessonId={g.id} school={school} />

        <Block title="Hear the world of the book" icon={Headphones}>
          <p className="text-[11px] text-white/45 mb-2">From the Chora Vault: open recordings, speeches and read-alouds.</p>
          <div className="grid gap-2">
            {g.vaultPairs.map((p: VaultPair, i) => {
              const Icon = KIND_ICON[p.kind] || Headphones;
              return (
                <button key={i} type="button" onClick={() => openVault(p.kind, p.subgenreId)} className="text-left rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.09] px-4 py-3 flex gap-3 items-start transition-colors">
                  <span className="w-8 h-8 rounded-lg grid place-items-center bg-[#FF8C00]/15 text-[#FF8C00] shrink-0"><Icon size={16} /></span>
                  <span className="min-w-0"><span className="block text-[12px] font-black">{KIND_LABEL[p.kind] || p.kind}{p.subgenreId ? ` · ${p.subgenreId.replace(/-/g, ' ')}` : ''}</span><span className="block text-[12px] text-white/60 leading-snug mt-0.5">{p.why}</span></span>
                </button>
              );
            })}
          </div>
        </Block>

        <Block title="Words to know" icon={Sparkles}>
          <dl className="grid gap-1.5">{g.vocab.map(v => <div key={v.word} className="text-[13px]"><dt className="inline font-black">{v.word}</dt><dd className="inline text-white/60"> · {v.meaning}</dd></div>)}</dl>
        </Block>
        <Block title="Read for" icon={BookOpen}>
          <ul className="grid gap-2">{g.devices.map(d => <li key={d.name} className="text-[13px]"><b>{d.name}.</b> <span className="text-white/65">{d.whatToSpot}</span></li>)}</ul>
        </Block>
        <Block title="Talk about it" icon={MessageCircle}>
          <ol className="grid gap-2 list-decimal pl-5">{g.discuss.map((d, i) => <li key={i} className="text-[13px] text-white/75">{d}</li>)}</ol>
        </Block>
      </div>
    </div>
  );
};

const Block: React.FC<{ title: string; icon: React.ElementType; children: React.ReactNode }> = ({ title, icon: Icon, children }) => (
  <section className="mb-5">
    <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white/45 mb-2 flex items-center gap-1.5"><Icon size={13} /> {title}</h3>
    {children}
  </section>
);

export default ClassicsReadingRoom;
