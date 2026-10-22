/**
 * Learning Support lab (learning-support-lab.html, port 3146). Renders the real components with no sign-in:
 *   ?view=editors    Supports / All about me / Plan & goals on a local plan (nothing is saved to the cloud)
 *   ?view=lesson     a lesson page (LessonFolio + its check) under whatever supports are on; use the dock to change them
 *   ?view=resources  the resource center
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../../index.css';
import SupportLayer from '../SupportLayer';
import { AboutMeEditor, OnePageProfile, SupportsEditor } from '../ProfileEditors';
import PlanGoals from '../PlanGoals';
import ResourceCenter from '../ResourceCenter';
import LessonFolio from '../../../learn/lesson/LessonFolio';
import { emptyPlan, setActiveSupports, type SupportPlan } from '../../../../services/learningSupport';

const view = new URLSearchParams(location.search).get('view') || 'editors';

const BODY = `Leonardo da Vinci kept notebooks all his life. He filled thousands of pages with drawings of water, birds, machines and the human body, and wrote notes beside them in mirror script, from right to left. He was curious about how everything worked, and he believed that looking closely was the start of understanding.

His painting grew out of that looking. Before he painted a face he studied how light falls across skin, how shadows soften at their edges, and how the muscles under the skin move when a person smiles. This soft blending of light into shadow is called sfumato, from the Italian word for smoke. You can see it in the corners of the Mona Lisa's mouth and eyes, which is one reason her expression seems to change as you look at it.

Leonardo also worked slowly and often left things unfinished. The Last Supper, painted on a wall in Milan, used an experimental technique that began to flake within his lifetime. Some of his greatest projects, like a giant bronze horse, were never completed at all. To him, the thinking and the learning mattered as much as the finished object.

Why it matters: Leonardo shows that art and science are not opposites. The same habits, close observation, asking questions and testing ideas, help an artist paint a face and help a scientist understand the world.

Today his notebooks are spread across museums and private collections. Scholars still study them, finding ideas about flight, anatomy and engineering that were centuries ahead of their time. Many people see him as the model of a person who never stopped learning.`;

const Editors: React.FC = () => {
  const [plan, setPlan] = useState<SupportPlan>(() => ({ ...emptyPlan('lab-learner', 'Sam Rivera'), planType: 'iep', team: [{ uid: 't1', name: 'Ms. Okafor', role: 'teacher' }], teamUids: ['t1'] }));
  const [tab, setTab] = useState<'supports' | 'about' | 'plan'>('supports');
  const [printing, setPrinting] = useState(false);
  const edit = (p: SupportPlan) => { setPlan(p); setActiveSupports(p.supports, null); };
  return (
    <div className="max-w-[1240px] mx-auto px-4 sm:px-8 py-6">
      <div className="flex gap-2 mb-5">{(['supports', 'about', 'plan'] as const).map(t => <button key={t} type="button" onClick={() => setTab(t)} className={`min-h-[44px] px-4 rounded-full border text-[14px] font-bold ${tab === t ? 'bg-[#00DAF3] text-black border-[#00DAF3]' : 'border-white/15 text-white/75'}`}>{t}</button>)}</div>
      {tab === 'supports' && <SupportsEditor supports={plan.supports} onChange={s => edit({ ...plan, supports: s })} />}
      {tab === 'about' && <AboutMeEditor plan={plan} onChange={a => edit({ ...plan, about: a })} onPrint={() => setPrinting(true)} />}
      {tab === 'plan' && <PlanGoals plan={plan} mode="family" me={{ uid: 'parent', name: 'Parent' }} candidates={[{ uid: 't2', name: 'Mr. Lindqvist', role: 'teacher' }]} canEditTeam onChange={edit} />}
      {printing && <OnePageProfile plan={plan} onClose={() => setPrinting(false)} />}
    </div>
  );
};

const App: React.FC = () => (
  <div className="min-h-screen bg-[#0a0a0f] text-white">
    {view === 'editors' && <Editors />}
    {view === 'lesson' && <div className="max-w-[900px] mx-auto px-8 py-10"><LessonFolio lessonId="art-masters.l01" title="Leonardo, the notebook mind" courseTitle="Art Masters" body={BODY} accent="#ffb547" band="middle" /></div>}
    {view === 'resources' && <div className="max-w-[1240px] mx-auto px-4 sm:px-8 py-6"><ResourceCenter /></div>}
    <SupportLayer uid={null} learning onOpenCenter={() => { location.search = '?view=editors'; }} />
  </div>
);

createRoot(document.getElementById('root')!).render(<App />);
