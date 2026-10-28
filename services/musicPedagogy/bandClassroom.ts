// The Conservatory faculty room — the Chora Session Band as teachers, outside the studio.
// A free-running classroom clock (no song, no loop) drives the same BandSession the studio uses,
// with a chart chosen for the genre, so a lesson or a "hear me play" demo sounds the way the band
// plays in Chora. Output goes to whatever voices the caller hands in (bandVoices in the browser,
// a recorder in tests). Pure apart from the injected clock.

import { newGrooveDoc, type GrooveDoc } from '../melos/beats/grooveDoc';
import { BAND, playerById, type BandPlayer, type Lesson } from '../melos/beats/band/roster';
import { genreById, genreInText } from '../melos/beats/band/styles';
import { BandSession, type BandClock, type BandOutput, type FeedEvent } from '../melos/beats/band/session';

/** A chart per genre, so the classroom has changes to play over (one bar per |). */
const CHARTS: Record<string, string> = {
  pop: 'C | G | Am | F',
  rock: 'E | D | A | E',
  metal: 'Em | C | D | Em',
  funk: 'E9 | E9 | A9 | E9',
  soul: 'Cmaj7 | Am7 | Dm7 | G7',
  neosoul: 'Dm9 | G13 | Cmaj9 | A7#9',
  gospel: 'C | F/C | C | G7 | Am7 | Dm7 | G7 | C',
  jazz: 'Dm7 | G7 | Cmaj7 | A7 | Dm7 | G7 | Cmaj7 | Cmaj7',
  blues: 'C7 | F7 | C7 | C7 | F7 | F7 | C7 | C7 | G7 | F7 | C7 | G7',
  hiphop: 'Am7 | Dm7 | Fmaj7 | E7',
  trap: 'Am | F | C | E',
  house: 'Am7 | Dm7 | Gmaj7 | Cmaj7',
  reggae: 'C | F | G | F',
  salsa: 'C | G7 | G7 | C',
  bossa: 'Cmaj7 | Cmaj7 | D7 | D7 | Dm7 | G7 | Cmaj7 | Cmaj7',
  afrobeat: 'Am7 | Am7 | D9 | D9',
  country: 'G | C | D | G',
  ballad: 'C | Am | F | G',
  cinematic: 'Am | F | C | G',
  classical: 'C | F | G7 | C',
};
export const chartFor = (genre: string): string => CHARTS[genre] ?? CHARTS.pop;
export const tempoFor = (genre: string): number => { const [lo, hi] = genreById(genre).tempo; return Math.round((lo + hi) / 2); };

/** The genre a lesson plays in: the first "make it …" in its steps, else the teacher's home genre. */
export function lessonGenre(player: BandPlayer, lesson: Lesson): string {
  for (const s of lesson.steps) { const g = s.direct && genreInText(s.direct); if (g) return g.id; }
  return player.genres[0] ?? 'pop';
}

export interface ClassroomTime { now(): number }

/** One room, one band. Start a demo or a lesson; call `tick()` every ~25 ms while it plays. */
export class FacultyRoom {
  session: BandSession;
  private doc: GrooveDoc;
  private t0: number | null = null;
  private bpm = 100;
  private listeners = new Set<(e: FeedEvent) => void>();
  private unhook: () => void = () => {};

  constructor(readonly time: ClassroomTime, private out: BandOutput, private seed?: number) {
    this.doc = classroomDoc(100);
    this.session = this.hook(new BandSession(this.doc, 'pop', seed));
  }

  get playing(): boolean { return this.t0 !== null; }
  get tempo(): number { return this.bpm; }
  get genre(): string { return this.session.dir.genre; }
  onFeed(fn: (e: FeedEvent) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  private hook(s: BandSession): BandSession {
    this.unhook();
    this.unhook = s.onFeed((e) => { for (const fn of this.listeners) fn(e); });
    return s;
  }

  /** Fresh band in a genre (the chart, tempo and lineup follow the genre). */
  private reset(genre: string, bpm = tempoFor(genre)): void {
    if (this.t0 !== null) this.stop();
    this.bpm = bpm;
    this.doc = classroomDoc(bpm);
    this.session = this.hook(new BandSession(this.doc, genre, this.seed));
    this.session.chart = chartFor(genre);
  }
  private start(): void { this.t0 = this.time.now() + 0.15; }

  /** "Hear me play": the player with just enough band under them (drums and bass, or alone). */
  demo(playerId: string, genre?: string): void {
    const p = playerById(playerId);
    if (!p) return;
    const g = genre ?? p.genres[0] ?? 'pop';
    this.reset(g);
    const keep = new Set([p.id]);
    if (p.role !== 'drums' && p.role !== 'orchestra' && !['classical', 'cinematic'].includes(g)) keep.add('marcus');
    if (!['bass', 'drums', 'percussion'].includes(p.role) && g !== 'classical') keep.add('dwayne');
    for (const q of BAND) this.session.dir.players[q.id].in = keep.has(q.id);
    this.session.teaching = true;
    this.start();
  }

  /** Run one of a player's lessons: the band plays each step's example while the teacher talks. */
  lesson(playerId: string, lessonId: string): void {
    const p = playerById(playerId);
    const l = p?.lessons.find((x) => x.id === lessonId);
    if (!p || !l) return;
    this.reset(lessonGenre(p, l));
    this.session.teaching = false;            // the lesson does the talking
    this.session.startLesson(l.title, p.id, l.id);
    this.start();
  }

  /** The whole band in a genre — for "ask while they play". */
  jam(genre: string): void { this.reset(genre); this.session.teaching = true; this.start(); }

  stop(): void { this.t0 = null; this.session.stopLesson(); this.session.tick(this.clock(), this.out); }

  tick(): void { this.session.tick(this.clock(), this.out); }

  private clock(): BandClock {
    const spb = 60 / this.bpm;
    return {
      running: () => this.t0 !== null,
      pos: () => (this.t0 === null ? 0 : Math.max(0, (this.time.now() - this.t0) / spb)),
      now: () => this.time.now(),
      wrap: () => null,
      timeAt: (beat) => (this.t0 ?? this.time.now()) + beat * spb,
    };
  }
}

function classroomDoc(bpm: number): GrooveDoc {
  const d = newGrooveDoc('conservatory', 'Faculty room');
  d.bpm = bpm;
  d.key = { tonic: 0, scale: 'major' };
  d.loop = undefined;
  return d;
}
