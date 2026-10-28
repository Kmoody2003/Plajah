// Chora Session Band — the players as teachers. Each one can say what they just played and why
// (from the performer's trace, in their own words, with where it comes from in music history and
// how to do it yourself in Chora), answer questions from what they know — their instrument, its
// history and players, technique, theory, genres, Chora and Plajah — and walk you through a lesson
// while the band plays the examples. Local and instant: no model, so it's always right there.

import { BAND, STUDIO_KNOWLEDGE, playerById, type BandPlayer, type KnowledgeEntry, type Lesson } from './roster';
import { genreById } from './styles';

/** What a trace tag means, said like a player would say it. */
const MOVES: [RegExp, string][] = [
  [/^ghost-notes$/, 'I\'m tucking ghost notes on the snare between the backbeats — soft strokes that make the groove breathe. That\'s funk and gospel drumming; hear Clyde Stubblefield on "Funky Drummer". In Chora they\'re the low-velocity hits in the pattern — reshape them in Glass\'s velocity graph.'],
  [/^fill:toms$/, 'That was a tom fill down the kit into the next phrase, with a crash on the one after — arena rock\'s way of saying "here comes the chorus".'],
  [/^fill:linear$/, 'That fill was linear — no two limbs hit at once, snare, tom and kick taking turns. Gospel and fusion drummers live there.'],
  [/^fill:snare$/, 'A snare fill, building in volume into the downbeat — the simplest, most useful fill there is.'],
  [/^crash$/, 'Crash on the one: it marks the top of a new phrase.'],
  [/^band hit$/, 'Band hit — everyone accenting the downbeat together, like a punctuation mark.'],
  [/^16th hats$/, 'Hats went to sixteenths because the energy came up.'],
  [/^quarter hats$/, 'Hats thinned to quarter notes to give the song room.'],
  [/^ride$/, 'Moved the time onto the ride cymbal — bigger, washier. Bebop drummers moved it there in the 1940s.'],
  [/^half-time$/, 'Half-time: the snare lands on beat 3 instead of 2 and 4, so the same tempo feels twice as slow and heavy.'],
  [/^double-time$/, 'Double-time: the groove runs twice as fast over the same chords.'],
  [/^breakdown$/, 'Breakdown — stripped back to the kick and hats so the next section can hit harder.'],
  [/^kick variation$/, 'Extra kick before beat 3 — a little push in the groove.'],
  [/^tumbao/, 'That\'s the conga tumbao: heel-toe in the middle, a slap on 2, open tones on 4 and the "and" of 4. It locks with the clave.'],
  [/^three-against-four/, 'Three evenly spaced strokes against the four beats — a West African polyrhythm. The groove lives where they meet.'],
  [/^timpani/, 'Timpani are tuned drums, so I play the chord\'s root — Beethoven made them a melodic voice.'],
  [/^taiko/, 'Taiko hits — big, low, ceremonial Japanese drums; film scores borrow them for weight.'],
  [/^conga run/, 'A run across the congas into the next phrase.'],
  [/^shaker texture/, 'Just a shaker texture — felt more than heard, it smooths the sixteenths.'],
  [/^bass:walking$|^chromatic approach on four$/, 'Walking quarter notes: root on one, chord tones in the middle, and on four a half-step approach into the next root — the language Jimmy Blanton and Paul Chambers wrote.'],
  [/^locked to the kick$/, 'My notes start where Marcus\'s kick lands — locking with the kick makes the low end feel like one instrument.'],
  [/^octave pops$/, 'Octave pops — the slap-and-pop move Larry Graham brought to funk.'],
  [/^808 slides$/, '808 bass with slides between notes — the kick drum\'s long cousin from trap and hip-hop. The glide is in each note\'s expression in the piano roll.'],
  [/^one drop/, 'One drop: the kick and bass leave beat one empty and land on three. That space is reggae.'],
  [/^tumbao: anticipates/, 'Salsa tumbao bass: notes on the "and" of 2 and on 4, where beat 4 anticipates the next chord. The bass almost never plays the downbeat.'],
  [/^walk-up into the change$/, 'A walk-up — scale steps leading into the next chord\'s root. Gospel and soul bassists sing with these.'],
  [/^offbeat house bass$/, 'House bass on the offbeats, between the four-on-the-floor kicks.'],
  [/^bass:sustain$/, 'Long notes on the root — holding the floor.'],
  [/^comp:pad$/, 'I\'m holding the chords as a pad with a swell, so the harmony is a cushion rather than a rhythm.'],
  [/^offbeat stabs$/, 'Short chord stabs on the offbeats — they push against the kick and snare.'],
  [/^down-up strum$/, 'Down-up strumming: down strokes on the beat, lighter up strokes on the "ands", strings staggered like a real strum.'],
  [/^power chords ring$|^palm-muted eighths$/, 'Power chords — root, fifth, octave, no third, so distortion stays clean. Palm-muted eighths are the rock and metal engine.'],
  [/^dotted-eighth arpeggio$/, 'Dotted-eighth arpeggios — the pattern echoes against the beat, like a delay pedal. The Edge made a career of it.'],
  [/^arpeggio$/, 'Arpeggio: the chord played one note at a time.'],
  [/^montuno$/, 'Montuno (guajeo): a syncopated two-bar piano figure in octaves that locks to the clave — the heart of salsa piano.'],
  [/^skank/, 'The skank — short chords on 2 and 4. Reggae guitar and organ talk there.'],
  [/^passing chord into the change$/, 'A passing chord a half step below the next one, on the "and" of four — the gospel slide into the change.'],
  [/^chicken-scratch/, 'Chicken-scratch: muted sixteenth strums with a few chords popping out — Nile Rodgers and Jimmy Nolen\'s funk rhythm guitar.'],
  [/^rootless voicings/, 'Rootless voicings — I leave the root to Dwayne and voice the 3rd, 7th and colour tones, comping in Charleston rhythms. Bill Evans and Wynton Kelly.'],
  [/^bossa guitar rhythm$/, 'The bossa nova guitar rhythm João Gilberto made famous — the thumb keeps the bass, the fingers syncopate the chord.'],
  [/^stride/, 'Stride: left hand alternates a low bass note and a mid chord — Harlem in the 1920s, James P. Johnson and Fats Waller.'],
  [/^boogie-woogie/, 'Boogie-woogie: a rolling eight-to-the-bar left hand, root-third-fifth-sixth — it fed straight into rock and roll.'],
  [/^four-voice chorale$|^pedal line$/, 'A four-voice chorale with a pedal line underneath, like a hymn on a pipe organ — Bach harmonised hundreds of them.'],
  [/^palm glissando/, 'A palm glissando up the keys into the downbeat — the gospel organist\'s exclamation point.'],
  [/^probability sequence$/, 'A probability sequence: each step has a chance of playing, but the pattern repeats through the phrase, so chance becomes a riff.'],
  [/^horn section stabs$/, 'Horn section stabs — trumpet on top, sax a third or sixth under, same rhythm. That\'s Tower of Power, the JBs, Earth, Wind & Fire.'],
  [/^guide tones/, 'Guide tones — the 3rds and 7ths, the notes that define each chord — held long and moving by the smallest step, so the line answers the melody instead of fighting it.'],
  [/^spiccato ostinato$/, 'A spiccato ostinato — a bounced-bow figure that repeats. Film composers build tension on it.'],
  [/^sustained root and fifth/, 'Sustained root and fifth, bowed over the fingerboard (sul tasto) for a soft, warm floor.'],
  [/^bluegrass chop/, 'The bluegrass chop — a scratchy bow stroke on the backbeat that works like a snare drum.'],
  [/^solo$/, 'I\'m soloing over the changes: a motif, then developing it, landing chord tones on the strong beats.'],
  [/^pickup$/, 'Just a pickup into the next phrase — fill the gap, then get out of the way.'],
  [/^motif repeated/, 'I repeated my rhythm from the last bar and moved it to the new chord — motivic development, the way a good solo tells a story.'],
  [/^enclosure$/, 'An enclosure — a half step above the target, then onto the chord tone. Charlie Parker\'s favourite move.'],
  [/^scoop$/, 'Scooped into that note from below — a sax and trumpet signature.'],
  [/^bend$/, 'Bent up into the note — the blues cry.'],
  [/^growl$/, 'A growl — humming while blowing, the R&B tenor roar.'],
  [/^trill$/, 'A trill — alternating fast with the note above.'],
  [/^double stop$/, 'Double stop — two strings at once.'],
  [/^fall$/, 'A fall off the end of the phrase — the pitch drops away. New Orleans trumpet.'],
  [/^laying out$/, 'Laying out — sometimes the best part is no part.'],
  [/^waiting for a gap$/, 'Waiting for a gap to say something.'],
];

/** The moves from a bar's trace, explained (deduped, at most `max`). */
export function explainTrace(trace: string[], max = 2): string[] {
  const out: string[] = [];
  for (const tag of trace) {
    if (tag.startsWith('groove:')) continue;
    const hit = MOVES.find(([re]) => re.test(tag));
    if (hit && !out.includes(hit[1])) out.push(hit[1]);
    if (out.length >= max) break;
  }
  return out;
}

/** "Here's what I'm doing" for a player in a genre, when there's no specific move to explain. */
export function grooveLine(player: BandPlayer, genreId: string): string {
  const g = genreById(genreId);
  const entry = player.knowledge.find((k) => k.topic === 'genre' && k.keys.some((w) => g.label.toLowerCase().includes(w)));
  return entry?.text ?? `Playing ${g.label} on ${player.instrument.toLowerCase()} — ask me anything about it.`;
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9#&' -]/g, ' ').split(/\s+/).filter((w) => w.length > 1);
const STOP = new Set(['the', 'is', 'it', 'a', 'an', 'of', 'to', 'and', 'what', 'who', 'how', 'why', 'did', 'do', 'does', 'you', 'your', 'me', 'in', 'on', 'for', 'about', 'tell', 'that', 'this', 'was', 'are', 'can', 'explain', 'with', 'play', 'playing', 'played', 'there', 'when', 'which']);

function score(entry: KnowledgeEntry, q: string, qw: string[]): number {
  let s = 0;
  for (const k of entry.keys) if (q.includes(k)) s += k.includes(' ') ? 3 : 2;
  const text = entry.text.toLowerCase();
  for (const w of qw) if (!STOP.has(w) && text.includes(w)) s += 0.5;
  if (/\bhistory|invent|first|origin|who\b/.test(q) && entry.topic === 'history') s += 1;
  if (/\bchora|plajah|how do i|where|button|panel\b/.test(q) && entry.topic === 'chora') s += 1;
  if (/\b(science|physics|acoustic|frequency|hz|how does (it|a|the)|why does|vibrat)/.test(q) && entry.topic === 'science') s += 1.5;
  return s;
}

export interface Answer { playerId: string; text: string; also?: string }

/**
 * Answer a question. Asked of a player, they answer from what they know (falling back to the
 * studio knowledge every player shares); asked of the band, whoever knows most answers.
 * `lastTrace` lets "why did you play that?" explain the bar they just played.
 */
export function answer(question: string, playerId?: string, lastTrace?: Record<string, string[]>): Answer {
  const q = question.toLowerCase();
  const qw = words(q);
  const asked = playerId ? playerById(playerId) : undefined;
  if (asked && lastTrace && /\bwhy\b.*\b(that|this|play|did)\b|what (are|were) you (doing|playing)|what did you/.test(q)) {
    const moves = explainTrace(lastTrace[asked.id] ?? [], 3);
    if (moves.length) return { playerId: asked.id, text: moves.join(' ') };
  }
  const pool: { p: BandPlayer; e: KnowledgeEntry; s: number }[] = [];
  for (const p of asked ? [asked] : BAND) for (const e of p.knowledge) pool.push({ p, e, s: score(e, q, qw) });
  const studio = STUDIO_KNOWLEDGE.map((e) => ({ e, s: score(e, q, qw) })).sort((a, b) => b.s - a.s)[0];
  pool.sort((a, b) => b.s - a.s);
  const best = pool[0];
  if (best && best.s >= 2 && (!studio || best.s >= studio.s)) {
    const second = pool.find((x) => x !== best && x.p === best.p && x.s >= 2 && x.e.topic !== best.e.topic);
    return { playerId: best.p.id, text: best.e.text, also: second?.e.text };
  }
  const who = asked ?? BAND[0];
  if (studio && studio.s >= 1.5) return { playerId: who.id, text: studio.e.text };
  return {
    playerId: who.id,
    text: asked
      ? `Good question. I know ${asked.instrument.toLowerCase()} — its history (${asked.influences.slice(0, 3).join(', ')} and more), technique, theory and how it works in Chora. Try asking me about one of those, or ask for a lesson.`
      : 'Ask any of us by name — about our instruments, their history and great players, technique, theory, a genre, or how to do something in Chora.',
  };
}

/** What a player knows that bears on a question — the grounding the AI teacher answers from. */
export function retrieve(question: string, playerId: string, k = 5): KnowledgeEntry[] {
  const q = question.toLowerCase();
  const qw = words(q);
  const p = playerById(playerId);
  const pool = [...(p?.knowledge ?? []), ...STUDIO_KNOWLEDGE].map((e) => ({ e, s: score(e, q, qw) }));
  pool.sort((a, b) => b.s - a.s);
  return pool.filter((x) => x.s > 0).slice(0, k).map((x) => x.e);
}

/** The lesson a request points at: by player, then by words in the title. */
export function findLesson(words: string, playerId?: string): { player: BandPlayer; lesson: Lesson } | null {
  const q = words.toLowerCase();
  const players = playerId ? BAND.filter((p) => p.id === playerId) : BAND;
  for (const p of players) for (const l of p.lessons) if (q.includes(l.title.toLowerCase()) || l.title.toLowerCase().split(/\s+/).some((w) => w.length > 4 && q.includes(w))) return { player: p, lesson: l };
  const p = players[0];
  return p?.lessons[0] ? { player: p, lesson: p.lessons[0] } : null;
}

/** Every lesson the band can teach, for the lesson menu. */
export const ALL_LESSONS = BAND.flatMap((p) => p.lessons.map((lesson) => ({ player: p, lesson })));
