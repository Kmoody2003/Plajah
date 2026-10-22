// LoreaCraftBand — the one place on the Lorea landing that names the Exhibition Hall outright:
// today's three nuggets pinned to the page like notes, and a door into the hall. Every other
// nugget on Lorea is planted quietly (LoreaNuggetSpot).
import React, { useMemo } from 'react';
import { dailyNuggets, openLoreaExhibit, useLoreaDepth, useLoreaExhibits } from '../../../services/loreaExhibits/loreaExhibitStore';
import { LoreaNuggetView } from './LoreaNugget';
import { Motif, usePaperFonts } from './paperKit';

export default function LoreaCraftBand() {
  usePaperFonts();
  const exhibits = useLoreaExhibits();
  const [depth] = useLoreaDepth();
  const three = useMemo(() => {
    if (!exhibits) return [];
    const seenEx = new Set<string>();
    return dailyNuggets(exhibits, depth).filter(p => !seenEx.has(p.exhibit.id) && seenEx.add(p.exhibit.id)).slice(0, 3);
  }, [exhibits, depth]);

  return (
    <section className="s lx-band" id="craft">
      <style>{BAND_CSS}</style>
      <div className="lx-band-head">
        <div>
          <div className="eyebrow">Lorea · Exhibition Hall</div>
          <h2 className="disp">The writer’s craft, in ink and paper.</h2>
          <p className="lx-band-lede">Eight exhibits. Tap the beat of a sonnet, sort a news story into its pyramid, build a sentence out of tiles, and catch real examples in the library. Written for every reader, from little ones to university.</p>
          <button type="button" className="btn p" onClick={() => openLoreaExhibit(null)}>Walk the hall →</button>
        </div>
        <div className="lx-band-motifs" aria-hidden>
          {(['quill', 'lyre', 'metronome', 'type-case', 'mask', 'arc', 'lantern', 'press'] as const).map((g, i) => <span key={g} style={{ animationDelay: `${i * 0.4}s` }}><Motif glyph={g} size={34} /></span>)}
        </div>
      </div>
      <div className="lx-band-notes">
        {three.map(p => <LoreaNuggetView key={p.nugget.id} picked={p} variant="scrap" />)}
      </div>
    </section>
  );
}

const BAND_CSS = `
.lx-band-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 24px; align-items: end; }
.lx-band-lede { max-width: 58ch; opacity: .85; margin: 12px 0 18px; line-height: 1.6; }
.lx-band-motifs { display: grid; grid-template-columns: repeat(4, 34px); gap: 14px; color: #f0b37a; opacity: .75; }
.lx-band-motifs span { animation: lx-bob 5s ease-in-out infinite; }
@keyframes lx-bob { 50% { transform: translateY(-5px) rotate(-4deg); } }
.lx-band-notes { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 30px 24px; margin-top: 30px; align-items: start; }
.lx-band-notes .lx-scrap { max-width: none; }
@media (max-width: 720px) { .lx-band-head { grid-template-columns: 1fr; } .lx-band-motifs { display: none; } }
@media (prefers-reduced-motion: reduce) { .lx-band-motifs span { animation: none; } }
`;
