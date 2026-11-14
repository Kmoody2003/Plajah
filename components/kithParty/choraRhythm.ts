import { buildEraClashGrooveDoc } from '../../services/melos/eraClashChoraProjects';
import type { GrooveDoc } from '../../services/melos/beats/grooveDoc';
import { buildKithQuestGrooveDoc } from '../../services/melos/kithQuestChoraProjects';

export type ChoraDifficulty = 'chill' | 'groove' | 'encore';

export interface ChoraSongSpec {
  id: string;
  docId: string;
  project: 'kith-quest' | 'era-clash';
  title: string;
  subtitle: string;
  bpm: number;
  audioUrl: string;
  /** Seconds from the start of the MP3 file to beat 0 (from the audio manifests). */
  audioLeadInSec: number;
  durationSec: number;
  accent: string;
}

export interface ChoraChartNote {
  time: number;
  lane: number;
  key: number;
  vel: number;
  accent?: boolean;
  drum?: boolean;
}

export interface ChoraRhythmChart {
  song: ChoraSongSpec;
  difficulty: ChoraDifficulty;
  notes: ChoraChartNote[];
}

export const CHORA_RHYTHM_SONGS: readonly ChoraSongSpec[] = [
  {
    id: 'kithquest-energy-glowmoss',
    docId: 'energy-glowmoss',
    project: 'kith-quest',
    title: 'Glowmoss Gallop',
    subtitle: 'Kith Quest · Forest Run (138 BPM)',
    bpm: 138,
    audioUrl: '/kith-party/quest-music/energy-glowmoss.mp3',
    audioLeadInSec: 0.3,
    durationSec: 41.5,
    accent: '#6df7c1',
  },
  {
    id: 'kithquest-energy-cascade',
    docId: 'energy-cascade',
    project: 'kith-quest',
    title: 'Cascade Gallop',
    subtitle: 'Kith Quest · Waterfall Sprint (144 BPM)',
    bpm: 144,
    audioUrl: '/kith-party/quest-music/energy-cascade.mp3',
    audioLeadInSec: 0.3,
    durationSec: 39.8,
    accent: '#5ce1e6',
  },
  {
    id: 'kithquest-energy-keep',
    docId: 'energy-keep',
    project: 'kith-quest',
    title: 'Lanternkeep Gallop',
    subtitle: 'Kith Quest · Courtyard Anthem (132 BPM)',
    bpm: 132,
    audioUrl: '/kith-party/quest-music/energy-keep.mp3',
    audioLeadInSec: 0.3,
    durationSec: 43.5,
    accent: '#ffbe55',
  },
  {
    id: 'kithquest-battle',
    docId: 'battle',
    project: 'kith-quest',
    title: 'Crown of Lanternkeep',
    subtitle: 'Kith Quest · Boss Showdown (160 BPM)',
    bpm: 160,
    audioUrl: '/kith-party/quest-music/battle.mp3',
    audioLeadInSec: 0.3,
    durationSec: 36.0,
    accent: '#ff5d8f',
  },
  {
    id: 'kithquest-title',
    docId: 'title',
    project: 'kith-quest',
    title: 'The Lantern Road',
    subtitle: 'Kith Quest · Harp Waltz Theme (108 BPM)',
    bpm: 108,
    audioUrl: '/kith-party/quest-music/title.mp3',
    audioLeadInSec: 0.3,
    durationSec: 52.0,
    accent: '#ffd878',
  },
  {
    id: 'eraclash-japan',
    docId: 'japan',
    project: 'era-clash',
    title: 'Kyoto Dusk',
    subtitle: 'Era Clash · Shakuhachi & O-Daiko (124 BPM)',
    bpm: 124,
    audioUrl: '/games/era-clash/audio/music-japan.mp3',
    audioLeadInSec: 0.15,
    durationSec: 54.0,
    accent: '#ff8a9e',
  },
  {
    id: 'eraclash-aztec',
    docId: 'aztec',
    project: 'era-clash',
    title: 'Temple of the Setting Sun',
    subtitle: 'Era Clash · Clay Flute & Tar (122 BPM)',
    bpm: 122,
    audioUrl: '/games/era-clash/audio/music-aztec.mp3',
    audioLeadInSec: 0.15,
    durationSec: 54.0,
    accent: '#ffa94d',
  },
  {
    id: 'eraclash-norse',
    docId: 'norse',
    project: 'era-clash',
    title: 'Fjord of the Sagas',
    subtitle: 'Era Clash · Fiddle & War Toms (118 BPM)',
    bpm: 118,
    audioUrl: '/games/era-clash/audio/music-norse.mp3',
    audioLeadInSec: 0.15,
    durationSec: 56.0,
    accent: '#7cc8ff',
  },
  {
    id: 'eraclash-italy',
    docId: 'italy',
    project: 'era-clash',
    title: 'Piazza of the Lion',
    subtitle: 'Era Clash · Concert Violin & Mandolin (126 BPM)',
    bpm: 126,
    audioUrl: '/games/era-clash/audio/music-italy.mp3',
    audioLeadInSec: 0.15,
    durationSec: 52.0,
    accent: '#b894ff',
  },
  {
    id: 'eraclash-rome',
    docId: 'rome',
    project: 'era-clash',
    title: 'The Golden Colosseum',
    subtitle: 'Era Clash · Triumphal Brass & Snare (128 BPM)',
    bpm: 128,
    audioUrl: '/games/era-clash/audio/music-rome.mp3',
    audioLeadInSec: 0.15,
    durationSec: 52.0,
    accent: '#f6d365',
  },
] as const;

export function choraSongById(id?: string): ChoraSongSpec {
  return CHORA_RHYTHM_SONGS.find((s) => s.id === id) ?? CHORA_RHYTHM_SONGS[0];
}

interface RawBeatEvent {
  beat: number;
  time: number;
  key: number;
  vel: number;
  priority: number;
  drum: boolean;
}

const docCache = new Map<string, GrooveDoc>();
const chartCache = new Map<string, ChoraRhythmChart>();

function loadDoc(song: ChoraSongSpec): GrooveDoc {
  let doc = docCache.get(song.id);
  if (doc) return doc;
  doc = song.project === 'kith-quest' ? buildKithQuestGrooveDoc(song.docId) : buildEraClashGrooveDoc(song.docId);
  docCache.set(song.id, doc);
  return doc;
}

function trackPriority(name: string, drum: boolean): number {
  const n = name.toLowerCase();
  if (n.includes('lead') || n.includes('flute') || n.includes('fiddle') || n.includes('violin') || n.includes('shakuhachi') || n.includes('horn')) return 5;
  if (n.includes('arp') || n.includes('harp') || n.includes('koto') || n.includes('mandolin') || n.includes('ost') || n.includes('cel')) return 4;
  if (drum || n.includes('soma') || n.includes('daiko') || n.includes('timpani') || n.includes('snare') || n.includes('tom')) return 3;
  if (n.includes('piano') || n.includes('keys') || n.includes('stab') || n.includes('brass')) return 2;
  return 1;
}

/** Extract quantized, contour-mapped 4-lane rhythm notes from a Chora GrooveDoc. */
export function chartFromGrooveDoc(doc: GrooveDoc, song: ChoraSongSpec, difficulty: ChoraDifficulty): ChoraChartNote[] {
  const secPerBeat = 60 / Math.max(40, doc.bpm || song.bpm);
  const raw: RawBeatEvent[] = [];

  for (const tr of doc.arrangement) {
    if (tr.mute) continue;
    const isDrum = tr.instrument?.type === 'soma' || tr.kind === 'pattern' || /soma|daiko|snare|timpani|tar|bodhrán|drum/i.test(tr.name);
    const priority = trackPriority(tr.name, isDrum);
    for (const clip of tr.clips) {
      if (!clip.notes?.length) continue;
      for (const n of clip.notes) {
        const beat = clip.startBeats + n.startBeats;
        const time = beat * secPerBeat;
        if (time < 1.15 || time > song.durationSec - 1.2) continue;
        raw.push({ beat, time, key: n.key, vel: n.vel, priority, drum: isDrum });
      }
    }
  }

  raw.sort((a, b) => a.time - b.time || b.priority - a.priority || b.vel - a.vel);
  if (!raw.length) return [];

  // Pitch range quartiles across melodic events for clean left-to-right pitch contour mapping
  const melodicKeys = raw.filter((r) => !r.drum).map((r) => r.key).sort((a, b) => a - b);
  const q25 = melodicKeys[Math.floor(melodicKeys.length * 0.25)] ?? 60;
  const q50 = melodicKeys[Math.floor(melodicKeys.length * 0.5)] ?? 67;
  const q75 = melodicKeys[Math.floor(melodicKeys.length * 0.75)] ?? 74;

  const minGap = difficulty === 'chill' ? 0.36 : difficulty === 'groove' ? 0.21 : 0.125;
  const chordVel = difficulty === 'chill' ? 999 : difficulty === 'groove' ? 105 : 98;
  const accentVel = difficulty === 'chill' ? 108 : difficulty === 'groove' ? 96 : 90;

  // Group near-simultaneous events into rhythmic slots (35ms window)
  const slots: RawBeatEvent[][] = [];
  for (const ev of raw) {
    const last = slots[slots.length - 1];
    if (last && ev.time - last[0].time < 0.035) last.push(ev);
    else slots.push([ev]);
  }

  const out: ChoraChartNote[] = [];
  let lastPlaced = -9;
  let lastLane = -1;

  for (const slot of slots) {
    const primary = slot[0];
    if (primary.time - lastPlaced < minGap) continue;
    // Skip ultra-soft inner voice notes on Chill/Groove unless they are the only thing playing on a beat
    if (difficulty === 'chill' && primary.priority < 3 && primary.vel < 82) continue;
    if (difficulty === 'groove' && primary.priority < 2 && primary.vel < 75) continue;

    let lane: number;
    if (primary.drum) {
      const step4 = Math.round(primary.beat * 2) % 4;
      lane = primary.key % 2 === 0 ? (step4 < 2 ? 0 : 3) : (step4 < 2 ? 1 : 2);
    } else {
      lane = primary.key <= q25 ? 0 : primary.key <= q50 ? 1 : primary.key <= q75 ? 2 : 3;
    }
    // Avoid repetitive single-lane hammering when melodic pitch isn't strictly locked
    if (lane === lastLane && slot.length > 1 && difficulty !== 'chill') {
      lane = (lane + (slot[1].key >= primary.key ? 1 : 3)) % 4;
    }

    const isAccent = primary.vel >= accentVel && Math.abs(primary.beat - Math.round(primary.beat)) < 0.08;
    out.push({
      time: +primary.time.toFixed(3),
      lane,
      key: primary.key,
      vel: primary.vel,
      accent: isAccent,
      drum: primary.drum,
    });
    lastPlaced = primary.time;
    lastLane = lane;

    // Musical 2-note chords on heavy impacts (Groove/Encore)
    if (primary.vel >= chordVel && slot.length >= 2) {
      const sec = slot[1];
      const secondLane = sec.drum
        ? (lane === 0 ? 3 : lane === 3 ? 0 : 3 - lane)
        : (lane < 2 ? Math.min(3, lane + 2) : Math.max(0, lane - 2));
      if (secondLane !== lane) {
        out.push({
          time: +primary.time.toFixed(3),
          lane: secondLane,
          key: sec.key,
          vel: sec.vel,
          accent: true,
          drum: sec.drum,
        });
      }
    }
  }

  return out;
}

export function buildChoraRhythmChart(songId?: string, difficulty: ChoraDifficulty = 'groove'): ChoraRhythmChart {
  const song = choraSongById(songId);
  const key = `${song.id}:${difficulty}`;
  const hit = chartCache.get(key);
  if (hit) return hit;
  const doc = loadDoc(song);
  const notes = chartFromGrooveDoc(doc, song, difficulty);
  const built: ChoraRhythmChart = { song, difficulty, notes };
  chartCache.set(key, built);
  return built;
}
