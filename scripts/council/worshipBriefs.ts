// worshipBriefs — the brief each of the 72 Ambo church visualizers is taken to the Art Council with. Pure data: no
// side effects, so any runner (parallel or staged) can import it without starting anything.
import type { CouncilBrief } from '../../services/council/councilTypes';
import { CALM_WORSHIP_LYRICS, UPTEMPO_PRAISE_LYRICS, SAMPLE_SCRIPTURES, type WorshipCategory, type WorshipVisualizerDef } from '../../services/ambo/worshipVisualizers';

/* ─── The briefs ─────────────────────────────────────────────────────────────────────────── */
const SHARED: string[] = [
  "Build method (fixed): a real-time Canvas 2D audio-reactive renderer in Plajah's worship visualizer kit — sanctuary background, multi-plane depth (god rays, motes, bokeh), the kit's Council optical pass (35mm light leaks, anamorphic flare, film grain, colour punch, and a tactile material weave keyed to the LEAD director's lens) and the kit's lyric / scripture typography engine. No video playback, no WebGL, no assets beyond the one concept plate.",
  'Audio drives amplitude, colour, light, growth and glow only — never the position of the words. Envelopes are smoothed; nothing strobes or flashes (photosensitive-safe); uptempo pulses are spring-damped.',
  'The reading band is sacred: lyrics or scripture must stay legible at 1920×1080 and 4K from the back pew, over the busiest moment of the scene. A text-safe dimming band is part of the kit; direct how the scene yields to it.',
  "Typefaces are fixed to the kit's open-licensed set: Noto Serif (text serif), Outfit / Inter (sans), Cinzel (display), JetBrains Mono. Direct scale, case, tracking, measure and hierarchy, not new families.",
  'Sacred imagery is used correctly and respectfully: biblical places and objects are specific and attributable, never costume; nothing denominational or branded; nothing that reads as a music video or a screensaver.',
  'Runs at 60 fps on an integrated-GPU laptop driving a projector: favour layered gradients, cached textures and a few large shapes over particle storms.',
  "Keep this visualizer's id, name, premise and four-colour palette. The council owns the direction, not the catalogue entry.",
];

const CATEGORY: Record<WorshipCategory, { label: string; feeling: string; text: string; sample: string }> = {
  'calm-lyric': {
    label: 'Calm Contemporary Worship lyric visualizer, Collection I of 72',
    feeling: "Stillness and reverence — a sanctuary that breathes with the singer's voice; gorgeous, slow, never a screensaver.",
    text: 'the worship lyric band (one line at a time, four to five seconds a line, word-by-word progression)',
    sample: `Sample lyric lines on the band: "${CALM_WORSHIP_LYRICS[0].text}" / "${CALM_WORSHIP_LYRICS[1].text}".`,
  },
  'uptempo-lyric': {
    label: 'Uptempo Praise & Hymnal lyric visualizer, Collection II of 72',
    feeling: 'Joy and momentum — a congregation on its feet; bright and celebratory, the beat felt in light and growth, never in a strobe.',
    text: 'the praise lyric band (faster lines, beat-locked emphasis, a hymnal four-part feel where the subgenre asks for it)',
    sample: `Sample lyric lines on the band: "${UPTEMPO_PRAISE_LYRICS[0].text}" / "${UPTEMPO_PRAISE_LYRICS[1].text}".`,
  },
  'scripture-reading': {
    label: 'Scripture Reading visualizer, Collection III of 72',
    feeling: 'The word is the picture — attentive, legible, unhurried; the scene serves the reading and the reader.',
    text: 'the scripture tablet (reference line, translation, the passage set in a measure with each spoken word highlighted as it is read)',
    sample: `Sample passage on the tablet: ${SAMPLE_SCRIPTURES[0].reference} (${SAMPLE_SCRIPTURES[0].translation}) — "${SAMPLE_SCRIPTURES[0].text.slice(0, 120)}…".`,
  },
};

export function briefFor(vis: WorshipVisualizerDef): CouncilBrief {
  const cat = CATEGORY[vis.category];
  const mappings = vis.audioMappings.map(([k, v]) => `${k} → ${v}`).join('; ');
  const plate = vis.conceptImage ? `the Gemini concept plate it twins (${vis.conceptImage}, blended in at plateBlend)` : 'the procedural scene (no concept plate: the plate is generative, in code)';
  return {
    ask: `Art-direct "${vis.name}" — #${vis.number} of the 72 Ambo church visualizers (${cat.label}; subgenre ${vis.subgenre}). Premise: ${vis.subtitle}. ${vis.description} Lighting today: ${vis.lightingNote} Service use: ${vis.serviceUse} Audio mapping today: ${mappings}. Palette: ${vis.palette.join(' ')}. Keep the id, name, premise and palette; rebuild the direction: the geometry and depth planes, typography for ${cat.text}, image logic (how ${plate} and the procedural scene meet), texture, motion, and which audio channel drives what. Decide it — the lead's lens will drive the kit's material weave and optical pass for this one.`,
    surface: 'Plajah Ambo church presenter',
    domain: 'worship visualizer',
    audience: 'Congregations watching a projector or LED wall from the pews, five to forty metres away, eyes on the words; and the worship leader or volunteer running Ambo live from a laptop.',
    feeling: cat.feeling,
    constraints: SHARED,
    references: [
      vis.conceptImage ? `Concept plate: ${vis.conceptImage} — a Gemini art plate this visualizer was built as the interactive code twin of.` : 'No concept plate: the scene is built entirely in code from the premise.',
      cat.sample,
    ],
  };
}

