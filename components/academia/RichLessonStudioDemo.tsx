import React, { useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, RotateCcw, Sparkles, Link2, FileUp, Music2, Image as ImageIcon,
  Video, BarChart3, Box, BookOpen, ShieldCheck, CheckCircle2, AlertCircle, Users,
  Quote, Play, Eye, BrainCircuit, WandSparkles, SlidersHorizontal, GraduationCap, Layers3,
} from 'lucide-react';
import AriaMark from '../aria/AriaMark';
import {
  LESSON_STUDIO_LEARNERS, LESSON_TEMPLATES, type LessonBlockKind, type LessonSourceKind,
} from '../../data/richLessonStudio';
import {
  addTeacherSource, nextRichLessonStage, resetRichLessonDemo, selectRichLessonTemplate,
  setRichLessonStage, simulateRichLessonGeneration, useRichLessonDemo, type LessonStudioStage,
} from '../../data/richLessonDemoStore';

const STAGES: Array<{ id: LessonStudioStage; label: string }> = [
  { id: 'advantage', label: 'Why Plajah' }, { id: 'sources', label: 'Sources' },
  { id: 'build', label: 'Compose' }, { id: 'experience', label: 'Experience' },
  { id: 'personalize', label: 'Learners' }, { id: 'proof', label: 'Proof' },
];

const kindIcon: Record<string, React.ElementType> = { audio: Music2, video: Video, image: ImageIcon, document: BookOpen, file: FileUp, link: Link2, dataset: BarChart3, model3d: Box };
const blockIcon: Record<LessonBlockKind, React.ElementType> = { hook: Sparkles, audio: Music2, video: Video, gallery: ImageIcon, quote: Quote, 'data-viz': BarChart3, model3d: Box, discussion: Users, check: CheckCircle2, creation: WandSparkles, reflection: BrainCircuit };

const panel: React.CSSProperties = { border: '1px solid var(--border-color,rgba(255,255,255,.13))', background: 'var(--glass-1,rgba(255,255,255,.055))', borderRadius: 'var(--pj-radius-lg,24px)', boxShadow: 'var(--pj-elev-1,0 14px 38px rgba(0,0,0,.18))' };
const muted: React.CSSProperties = { color: 'var(--text-secondary,rgba(255,255,255,.58))' };

const Primary: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, style, ...props }) => (
  <button {...props} className="pj-btn pj-btn--primary pj-btn--lg" style={{ minHeight: 48, borderRadius: 999, border: 0, padding: '0 20px', color: '#fff', fontWeight: 900, background: 'linear-gradient(90deg,var(--pj-magenta,#D40055),var(--pj-orange,#FF8C00))', cursor: 'pointer', ...style }}>{children}</button>
);
const Quiet: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, style, ...props }) => (
  <button {...props} style={{ minHeight: 42, borderRadius: 999, border: '1px solid var(--border-color,rgba(255,255,255,.14))', padding: '0 15px', color: 'inherit', fontWeight: 800, background: 'rgba(255,255,255,.045)', cursor: 'pointer', ...style }}>{children}</button>
);

const RichLessonStudioDemo: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { stage, draft, generation } = useRichLessonDemo();
  const [learnerId, setLearnerId] = useState('diego');
  const [sourceKind, setSourceKind] = useState<LessonSourceKind>('link');
  const [sourceTitle, setSourceTitle] = useState('Detroit oral-history interview');
  const [sourceLocator, setSourceLocator] = useState('https://example.org/detroit-oral-history');
  const template = LESSON_TEMPLATES.find(t => t.id === draft.templateId)!;
  const learner = LESSON_STUDIO_LEARNERS.find(l => l.id === learnerId)!;
  const personalized = draft.personalized.find(p => p.learnerId === learnerId)!;
  const stageIndex = STAGES.findIndex(s => s.id === stage);
  const sourceCounts = useMemo(() => draft.sources.reduce<Record<string, number>>((a, s) => ({ ...a, [s.kind]: (a[s.kind] || 0) + 1 }), {}), [draft.sources]);

  const addSource = () => {
    if (!sourceTitle.trim() || !sourceLocator.trim()) return;
    addTeacherSource({ title: sourceTitle.trim(), kind: sourceKind, locator: sourceLocator.trim() });
    setSourceTitle(''); setSourceLocator('');
  };

  return (
    <div style={{ minHeight: '100%', background: 'radial-gradient(circle at 12% 0%,rgba(107,0,153,.34),transparent 32%),radial-gradient(circle at 95% 18%,rgba(0,218,243,.09),transparent 30%),var(--bg-color,#0a080d)', color: 'var(--text-primary,#fff)', fontFamily: 'var(--font-body,Inter,system-ui)' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 30, backdropFilter: 'blur(22px)', background: 'rgba(10,8,13,.84)', borderBottom: '1px solid var(--border-color,rgba(255,255,255,.12))' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} aria-label="Back to Academia demos" style={{ width: 42, height: 42, borderRadius: 999, display: 'grid', placeItems: 'center', border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)', color: 'inherit', cursor: 'pointer' }}><ArrowLeft size={17} /></button>
          <AriaMark size={34} />
          <div style={{ minWidth: 0 }}><div style={{ fontFamily: 'var(--font-display,Outfit)', fontWeight: 950, lineHeight: 1 }}>Aria Lesson Studio</div><div style={{ ...muted, fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', marginTop: 3 }}>Resettable demo · invented class · local only</div></div>
          <div style={{ flex: 1 }} />
          <Quiet onClick={resetRichLessonDemo} title="Reset every demo interaction"><RotateCcw size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Reset demo</Quiet>
        </div>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 18px 10px', display: 'flex', gap: 7, overflowX: 'auto' }}>
          {STAGES.map((s, i) => <button key={s.id} onClick={() => setRichLessonStage(s.id)} style={{ flex: '0 0 auto', minHeight: 34, borderRadius: 999, padding: '0 12px', border: i === stageIndex ? '1px solid transparent' : '1px solid rgba(255,255,255,.1)', background: i === stageIndex ? 'var(--pj-grad-brand,linear-gradient(90deg,#6B0099,#D40055))' : 'rgba(255,255,255,.035)', color: i === stageIndex ? '#fff' : 'rgba(255,255,255,.48)', fontWeight: 850, fontSize: 11, cursor: 'pointer' }}>{i + 1}. {s.label}</button>)}
        </div>
      </header>

      <main style={{ maxWidth: 1240, margin: '0 auto', padding: '28px 18px 64px' }}>
        {stage === 'advantage' && <Advantage onNext={nextRichLessonStage} />}
        {stage === 'sources' && <Sources draft={draft} counts={sourceCounts} sourceKind={sourceKind} setSourceKind={setSourceKind} title={sourceTitle} setTitle={setSourceTitle} locator={sourceLocator} setLocator={setSourceLocator} onAdd={addSource} onNext={nextRichLessonStage} />}
        {stage === 'build' && <Build draft={draft} template={template} onGenerate={simulateRichLessonGeneration} />}
        {stage === 'experience' && <Experience draft={draft} template={template} generation={generation} onNext={nextRichLessonStage} />}
        {stage === 'personalize' && <Personalize learner={learner} personalized={personalized} learnerId={learnerId} setLearnerId={setLearnerId} onNext={nextRichLessonStage} />}
        {stage === 'proof' && <Proof draft={draft} onReset={resetRichLessonDemo} />}
      </main>
    </div>
  );
};

const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => <div style={{ color: 'var(--pj-cyan,#00DAF3)', fontSize: 10, fontWeight: 900, letterSpacing: '.24em', textTransform: 'uppercase' }}>{children}</div>;
const H1: React.FC<{ children: React.ReactNode }> = ({ children }) => <h1 style={{ margin: '10px 0 12px', fontFamily: 'var(--font-display,Outfit)', fontSize: 'clamp(34px,6vw,70px)', lineHeight: .94, letterSpacing: '-.045em', maxWidth: 980 }}>{children}</h1>;

const Advantage: React.FC<{ onNext: () => void }> = ({ onNext }) => (
  <>
    <Eyebrow>The advantage before the first click</Eyebrow><H1>Bring the sources. Plajah builds the learning experience.</H1>
    <p style={{ ...muted, maxWidth: 820, fontSize: 18, lineHeight: 1.58 }}>A document scanner makes a worksheet. Aria Lesson Studio reasons across links, files, songs, films, photographs, datasets, archive objects, 3D models, standards, rubrics and the actual learners in the room—then choreographs them into a polished, source-aware experience the teacher can approve.</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginTop: 26 }}>
      {[
        ['01','Mixed sources become one context','PoKee reads the full source set together instead of losing relationships in chunked retrieval.',Layers3,'#D0BCFF'],
        ['02','Media becomes pedagogy','Claude shapes a narrative arc; Plajah Labs supplies galleries, data stories, spatial audio and 3D tools.',Play,'#FF8C00'],
        ['03','Every learner gets a way in','Ledger evidence, strengths, interests and supports adapt the invitation—not the rigor.',Users,'#00DAF3'],
        ['04','Trust travels with the draft','Standards, quotations, rights, attribution, accessibility and AI receipts stay inspectable.',ShieldCheck,'#06D6A0'],
      ].map(([n,title,body,Icon,color]: any) => <div key={n} style={{ ...panel, padding: 20 }}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ fontFamily: 'var(--font-mono-tech,monospace)', color, fontWeight: 900 }}>{n}</span><Icon size={18} color={color} /></div><h2 style={{ fontFamily: 'var(--font-display,Outfit)', fontSize: 20, margin: '16px 0 7px' }}>{title}</h2><p style={{ ...muted, fontSize: 13, lineHeight: 1.55, margin: 0 }}>{body}</p></div>)}
    </div>
    <div style={{ marginTop: 24 }}><Primary onClick={onNext}>Start with six sources <ArrowRight size={16} style={{ verticalAlign: -3, marginLeft: 7 }} /></Primary></div>
  </>
);

const Sources: React.FC<any> = ({ draft, counts, sourceKind, setSourceKind, title, setTitle, locator, setLocator, onAdd, onNext }) => (
  <>
    <Eyebrow>Anything can enter—with provenance</Eyebrow><H1>Six sources. Five media forms. One lesson context.</H1>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(280px,.75fr)', gap: 16, alignItems: 'start' }}>
      <div style={{ ...panel, padding: 18 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>{Object.entries(counts).map(([k,v]) => <span key={k} style={{ borderRadius: 999, padding: '6px 10px', background: 'rgba(255,255,255,.055)', color: 'rgba(255,255,255,.68)', fontSize: 11, fontWeight: 800 }}>{v as number} {k}</span>)}</div>
        {draft.sources.map((s: any) => { const Icon = kindIcon[s.kind] || FileUp; return <div key={s.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '13px 4px', borderTop: '1px solid rgba(255,255,255,.08)' }}><span style={{ width: 42, height: 42, borderRadius: 14, display: 'grid', placeItems: 'center', background: `${s.accent}20`, color: s.accent, flex: 'none' }}><Icon size={18} /></span><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 850, fontSize: 13 }}>{s.title}</div><div style={{ ...muted, fontSize: 11, marginTop: 2 }}>{s.attribution}</div></div><span style={{ color: s.license === 'link-only' ? '#F59E0B' : '#06D6A0', fontSize: 10, fontWeight: 900 }}>{s.license}</span></div>})}
      </div>
      <div style={{ ...panel, padding: 18, position: 'sticky', top: 140 }}><h2 style={{ fontFamily: 'var(--font-display,Outfit)', margin: 0, fontSize: 20 }}>Add your own source</h2><p style={{ ...muted, fontSize: 12, lineHeight: 1.5 }}>This demo stores it only in local memory. Production ingestion resolves text, media, quotations, rights and source anchors.</p><select value={sourceKind} onChange={e => setSourceKind(e.target.value)} style={inputStyle}>{['link','file','document','audio','video','image','dataset','model3d'].map(k => <option key={k} value={k}>{k}</option>)}</select><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Source title" style={inputStyle} /><input value={locator} onChange={e => setLocator(e.target.value)} placeholder="Link or filename" style={inputStyle} /><Quiet onClick={onAdd} style={{ width: '100%', marginTop: 4 }}><FileUp size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Add to lesson context</Quiet></div>
    </div>
    <div style={{ marginTop: 22 }}><Primary onClick={onNext}>Compose the learning target <ArrowRight size={16} style={{ verticalAlign: -3, marginLeft: 7 }} /></Primary></div>
  </>
);
const inputStyle: React.CSSProperties = { width: '100%', minHeight: 44, borderRadius: 16, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(0,0,0,.24)', color: '#fff', padding: '0 12px', marginBottom: 9 };

const Build: React.FC<any> = ({ draft, template, onGenerate }) => (
  <>
    <Eyebrow>Standards and rubric are structural</Eyebrow><H1>The targets shape the experience—not a label added at the end.</H1>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 14 }}>
      <div style={{ ...panel, padding: 20 }}><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><GraduationCap color="#00DAF3" /><h2 style={{ margin: 0, fontFamily: 'var(--font-display,Outfit)' }}>Learning architecture</h2></div><p style={{ fontSize: 19, lineHeight: 1.45 }}>{draft.essentialQuestion}</p><p style={{ ...muted, lineHeight: 1.5 }}>{draft.objective}</p>{draft.standards.map((s:any)=><div key={s.code} style={{ padding: '10px 0', borderTop: '1px solid rgba(255,255,255,.08)' }}><b style={{ color: '#D0BCFF', fontFamily: 'var(--font-mono-tech,monospace)', fontSize: 11 }}>{s.code}</b><div style={{ fontSize: 12, marginTop: 4 }}>{s.target}</div></div>)}</div>
      <div style={{ ...panel, padding: 20 }}><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><SlidersHorizontal color="#FF8C00" /><h2 style={{ margin: 0, fontFamily: 'var(--font-display,Outfit)' }}>Common rubric</h2></div><p style={{ ...muted, fontSize: 12 }}>The medium may change. The evidence target does not.</p>{draft.rubric.map((r:any)=><div key={r.id} style={{ padding: '10px 0', borderTop: '1px solid rgba(255,255,255,.08)' }}><b>{r.label}</b><div style={{ ...muted, fontSize: 11, marginTop: 3 }}>{r.target}</div></div>)}</div>
    </div>
    <h2 style={{ fontFamily: 'var(--font-display,Outfit)', margin: '28px 0 12px' }}>Choose the experience language</h2>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(235px,1fr))', gap: 11 }}>{LESSON_TEMPLATES.map(t => <button key={t.id} onClick={() => selectRichLessonTemplate(t.id)} style={{ ...panel, padding: 17, textAlign: 'left', color: 'inherit', cursor: 'pointer', outline: draft.templateId === t.id ? `2px solid ${t.accent}` : 'none', background: draft.templateId === t.id ? t.gradient : panel.background }}><div style={{ color: t.accent, fontSize: 10, fontWeight: 900, letterSpacing: '.16em', textTransform: 'uppercase' }}>{t.kicker}</div><h3 style={{ fontFamily: 'var(--font-display,Outfit)', fontSize: 18, margin: '9px 0 5px' }}>{t.label}</h3><p style={{ color: draft.templateId === t.id ? 'rgba(255,255,255,.84)' : 'rgba(255,255,255,.55)', fontSize: 12, lineHeight: 1.45, margin: 0 }}>{t.description}</p></button>)}</div>
    <div style={{ ...panel, marginTop: 20, padding: 18, display: 'flex', alignItems: 'center', gap: 15, flexWrap: 'wrap', background: 'linear-gradient(90deg,rgba(107,0,153,.24),rgba(212,0,85,.12))' }}><AriaMark size={42} thinking /><div style={{ flex: 1, minWidth: 220 }}><b>Aria is ready to orchestrate {template.label}</b><div style={{ ...muted, fontSize: 12, marginTop: 3 }}>PoKee: whole-context reasoning · Claude: narrative/media craft · Plajah: provenance, tools and learner evidence</div></div><Primary onClick={onGenerate}><WandSparkles size={16} style={{ verticalAlign: -3, marginRight: 7 }} />Build polished draft</Primary></div>
  </>
);

const Experience: React.FC<any> = ({ draft, template, generation, onNext }) => (
  <>
    <div style={{ ...panel, overflow: 'hidden', background: template.gradient }}><div style={{ minHeight: 270, padding: 'clamp(24px,5vw,58px)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: 'linear-gradient(0deg,rgba(6,5,8,.82),transparent 72%)' }}><div style={{ color: template.accent, fontSize: 10, fontWeight: 900, letterSpacing: '.22em', textTransform: 'uppercase' }}>{template.label} · generated draft {generation || 1}</div><h1 style={{ fontFamily: 'var(--font-display,Outfit)', fontSize: 'clamp(38px,7vw,78px)', lineHeight: .9, letterSpacing: '-.05em', margin: '10px 0' }}>{draft.title}</h1><p style={{ margin: 0, fontSize: 17, color: 'rgba(255,255,255,.72)' }}>{draft.subtitle}</p></div></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(270px,1fr))', gap: 12, marginTop: 14 }}>{draft.blocks.map((b:any,i:number)=>{const Icon=blockIcon[b.kind]||Sparkles;return <div key={b.id} style={{ ...panel, padding: 18, position: 'relative', overflow: 'hidden' }}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 38, height: 38, borderRadius: 13, display: 'grid', placeItems: 'center', background: `${template.accent}1f`, color: template.accent }}><Icon size={17}/></span><span style={{ fontFamily: 'var(--font-mono-tech,monospace)', fontSize: 10, color: 'rgba(255,255,255,.38)' }}>{String(i+1).padStart(2,'0')} · {b.minutes} MIN</span></div><h2 style={{ fontFamily: 'var(--font-display,Outfit)', fontSize: 20, margin: '14px 0 7px' }}>{b.title}</h2><p style={{ ...muted, fontSize: 12.5, lineHeight: 1.55 }}>{b.body}</p>{b.mediaCue&&<div style={{ borderLeft: `2px solid ${template.accent}`, paddingLeft: 10, fontSize: 11, color: 'rgba(255,255,255,.7)' }}><b>Media cue:</b> {b.mediaCue}</div>}</div>})}</div>
    <div style={{ marginTop: 22 }}><Primary onClick={onNext}>See what Diego experiences <ArrowRight size={16} style={{ verticalAlign: -3, marginLeft: 7 }} /></Primary></div>
  </>
);

const Personalize: React.FC<any> = ({ learner, personalized, learnerId, setLearnerId, onNext }) => (
  <>
    <Eyebrow>Personalized invitation · common rigor</Eyebrow><H1>The lesson knows the learner without trapping them in a label.</H1>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>{LESSON_STUDIO_LEARNERS.map(l=><button key={l.id} onClick={()=>setLearnerId(l.id)} style={{ minHeight: 42, borderRadius: 999, padding: '0 14px', border: learnerId===l.id?'1px solid #00DAF3':'1px solid rgba(255,255,255,.12)', background: learnerId===l.id?'rgba(0,218,243,.12)':'rgba(255,255,255,.035)', color: 'inherit', fontWeight: 850, cursor: 'pointer' }}>{l.preferredName}</button>)}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px,.75fr) minmax(0,1.35fr)', gap: 16 }}>
      <div style={{ ...panel, padding: 20 }}><div style={{ width: 58, height: 58, borderRadius: 20, display: 'grid', placeItems: 'center', background: 'var(--pj-grad-brand,linear-gradient(135deg,#6B0099,#D40055))', fontFamily: 'var(--font-display,Outfit)', fontSize: 23, fontWeight: 950 }}>{learner.preferredName[0]}</div><h2 style={{ fontFamily: 'var(--font-display,Outfit)', fontSize: 24, marginBottom: 4 }}>{learner.name}</h2><div style={{ ...muted, fontSize: 12 }}>Interests: {learner.interests.join(' · ')}</div><h3 style={{ margin: '20px 0 8px', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.14em', color: '#06D6A0' }}>Strengths</h3><p style={{ margin: 0, fontSize: 13 }}>{learner.strengths.join(' · ')}</p><h3 style={{ margin: '18px 0 8px', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.14em', color: '#F59E0B' }}>Growth evidence</h3>{learner.signals.map((s:any)=><div key={s.standard} style={{ marginBottom: 10 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}><span>{s.label}</span><b>{s.mastery}%</b></div><div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,.08)', marginTop: 5 }}><div style={{ width: `${s.mastery}%`, height: '100%', borderRadius: 999, background: s.mastery<60?'#F59E0B':'#06D6A0' }}/></div></div>)}</div>
      <div style={{ ...panel, padding: 'clamp(22px,4vw,38px)', background: 'radial-gradient(circle at 100% 0%,rgba(0,218,243,.12),transparent 32%),rgba(255,255,255,.045)' }}><div style={{ color: '#00DAF3', fontSize: 10, fontWeight: 900, letterSpacing: '.18em', textTransform: 'uppercase' }}>Student opening</div><h2 style={{ fontFamily: 'var(--font-display,Outfit)', fontSize: 'clamp(28px,4vw,46px)', lineHeight: 1.03, margin: '12px 0' }}>{personalized.greeting}</h2><p style={{ fontSize: 18, lineHeight: 1.5 }}>{personalized.invitation}</p><div style={{ display: 'grid', gap: 10, marginTop: 22 }}>{[['Your support',personalized.scaffold,'#D0BCFF'],['Your choice',personalized.choice,'#00DAF3'],['Your stretch',personalized.stretch,'#FF8C00']].map(([l,v,c])=><div key={l} style={{ borderRadius: 18, padding: 15, border: `1px solid ${c}38`, background: `${c}0c` }}><b style={{ color: c, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.13em' }}>{l}</b><div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5 }}>{v}</div></div>)}</div><div style={{ marginTop: 18, fontSize: 11, color: 'rgba(255,255,255,.42)' }}><b>Why Aria chose this:</b> {personalized.teacherReason}</div></div>
    </div>
    <div style={{ marginTop: 22 }}><Primary onClick={onNext}>Inspect trust & architecture <ArrowRight size={16} style={{ verticalAlign: -3, marginLeft: 7 }} /></Primary></div>
  </>
);

const Proof: React.FC<any> = ({ draft, onReset }) => (
  <>
    <Eyebrow>Teacher approval · inspectable intelligence</Eyebrow><H1>Polished does not mean opaque.</H1>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(290px,1fr))', gap: 14 }}>
      <div style={{ ...panel, padding: 20 }}><h2 style={{ fontFamily: 'var(--font-display,Outfit)', marginTop: 0 }}>Quality gate</h2>{draft.qualityChecks.map((q:any)=><div key={q.label} style={{ display: 'flex', gap: 10, padding: '12px 0', borderTop: '1px solid rgba(255,255,255,.08)' }}>{q.status==='passed'?<CheckCircle2 color="#06D6A0" size={18}/>:<AlertCircle color="#F59E0B" size={18}/>}<div><b style={{ fontSize: 13 }}>{q.label}</b><div style={{ ...muted, fontSize: 11.5, marginTop: 3, lineHeight: 1.45 }}>{q.detail}</div></div></div>)}</div>
      <div style={{ ...panel, padding: 20 }}><h2 style={{ fontFamily: 'var(--font-display,Outfit)', marginTop: 0 }}>Intelligence receipts</h2>{draft.receipts.map((r:any)=><div key={r.lane} style={{ padding: '12px 0', borderTop: '1px solid rgba(255,255,255,.08)' }}><b style={{ color: r.lane==='Aria'?'#D0BCFF':r.lane==='PoKee'?'#00DAF3':r.lane==='Claude'?'#FF8C00':'#06D6A0', fontSize: 12 }}>{r.lane}</b><div style={{ ...muted, fontSize: 11.5, marginTop: 3 }}>{r.work}</div></div>)}</div>
    </div>
    <div style={{ ...panel, marginTop: 16, padding: 20, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', background: 'linear-gradient(90deg,rgba(107,0,153,.22),rgba(0,218,243,.07))' }}><Eye color="#00DAF3"/><div style={{ flex: 1, minWidth: 240 }}><b style={{ fontFamily: 'var(--font-display,Outfit)', fontSize: 20 }}>Demo complete</b><div style={{ ...muted, fontSize: 12, marginTop: 3 }}>Nothing was persisted. Reset returns sources, template, stage and learner preview to the exact seed.</div></div><Primary onClick={onReset}><RotateCcw size={15} style={{ verticalAlign: -3, marginRight: 7 }}/>Reset and demo again</Primary></div>
  </>
);

export default RichLessonStudioDemo;

