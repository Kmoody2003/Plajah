// MuseionBuildLabs — Build-powered lab experiences in Museion (PlajahLabsView). Every card is a real STEM Track
// lesson: "Try it" opens its Plajah Build room with the starter, "Lesson" opens the lesson in the STEM Track.
// Grouped by the Build room it runs in, filterable by grade band. Nothing here is invented; it reads data/stem.
import React, { useMemo, useState } from 'react';
import { Hammer, BookOpen, ChevronRight, Cpu } from 'lucide-react';
import { STEM_LESSONS, STEM_BANDS, type StemBand } from '../../data/stem';
import { BUILD_ROOM_LABEL, openBuild, openStemTrack } from '../../services/stem/launch';

const ROOM_TONE: Record<string, string> = { elec: '#F0603E', studio: '#7aa7ff', cad: '#F5B83D', sew: '#FF6FA8', bio: '#5fd1c2', exchange: '#c4b5fd' };

const MuseionBuildLabs: React.FC<{ discipline?: string }> = ({ discipline }) => {
  const [band, setBand] = useState<StemBand | 'all'>('all');
  const labs = useMemo(() => {
    const pool = STEM_LESSONS.filter(l => (!discipline || l.museion === discipline) && (band === 'all' || l.band === band));
    // One lesson per (band, unit) first so the row spans the track, then the rest.
    const seen = new Set<string>();
    const lead = pool.filter(l => { const k = l.unitId; if (seen.has(k)) return false; seen.add(k); return true; });
    return [...lead, ...pool.filter(l => !lead.includes(l))].slice(0, 12);
  }, [band, discipline]);

  if (!STEM_LESSONS.length) return null;
  return (
    <section className="px-6 py-8 max-w-7xl mx-auto" data-testid="museion-build-labs">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#5fd1c2]">Hands-on, in your browser</p>
          <h2 className="text-2xl sm:text-3xl font-black text-white">Build Labs</h2>
          <p className="text-[13px] text-white/55 mt-1 max-w-xl">Circuits, 3D models, plush patterns and living systems you build and test in Plajah Build — each one a lesson from the K–12 STEM Track.</p>
        </div>
        <button onClick={() => openStemTrack({ tab: 'MAP' })} className="inline-flex items-center gap-2 rounded-full border border-[#5fd1c2]/40 bg-[#0E8074]/20 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-[#9ff0e4] hover:bg-[#0E8074]/35"><Cpu size={13} /> STEM Track <ChevronRight size={12} /></button>
      </div>
      <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
        {(['all', ...STEM_BANDS] as const).map(b => (
          <button key={b} onClick={() => setBand(b)} className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shrink-0 ${band === b ? 'bg-[#0E8074] text-white' : 'bg-white/5 text-white/40 hover:text-white border border-white/10'}`}>{b === 'all' ? 'All grades' : `Grades ${b}`}</button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {labs.map(l => {
          const tone = ROOM_TONE[l.build.launch.room] || '#5fd1c2';
          return (
            <article key={l.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 flex flex-col">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                <span style={{ color: tone }}>{BUILD_ROOM_LABEL[l.build.launch.room]}</span><span className="text-white/35">· Grades {l.band}</span>
              </div>
              <h3 className="text-[15px] font-black text-white mt-1.5">{l.build.title}</h3>
              <p className="text-[12px] text-white/55 mt-1 flex-1">{l.title}{l.mathFocus ? ` · ${l.mathFocus}` : ''}</p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => openBuild({ ...l.build.launch, lesson: l.id })} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10.5px] font-black uppercase tracking-wider text-black" style={{ background: tone }}><Hammer size={12} /> Try it</button>
                <button onClick={() => openStemTrack({ lessonId: l.id })} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-[10.5px] font-black uppercase tracking-wider text-white/75 hover:bg-white/10"><BookOpen size={12} /> Lesson</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default MuseionBuildLabs;
