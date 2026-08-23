// The generative channel — a FAST slot that resolves to a SEED rather than to a video.
//
// The carriage layer already computes "what's on now" deterministically from an epoch-anchored
// schedule, and in-app playback already runs that schedule client-side through
// fastChannelTimeline rather than pulling the HLS origin. That split is exactly what a
// generative channel needs; the only new idea is what a slot points at.
//
// A conventional channel's biggest costs are the ones this does not have: no library to
// acquire, no masters to store, no per-title royalty, no rights window, no territory
// restriction. What it has instead is a table of forms, and a hash.
//
// THE SEED IS DERIVED, NOT STORED
//
// A programme's seed is a stable hash of the UTC date and the slot index. That means a year of
// programming is a few kilobytes of form definitions, every consumer resolves the same
// programme without asking anyone, and last Tuesday at 03:00 can be re-rendered exactly. It is
// also what lets the EPG be generated a year ahead — a guide that caches fourteen days stays
// correct because the names are a function of the same hash.
//
// This is the SHARED register. The unrepeatable one (services/fast/sola.ts) draws its seed from
// entropy and writes it nowhere; the two are deliberately different in exactly this respect.

import type { ArrivalMood } from '../ora/stillness/emotionalEngine';

/** A programme's character. The schedule is a sequence of these, not of files. */
export interface GenerativeForm {
  id: string;
  /** Daypart this belongs to — used for naming and for the guide's grouping. */
  daypart: 'deepNight' | 'dawn' | 'day' | 'dusk';
  /** How the session should open. Threads straight into the emotional engine. */
  arrival: ArrivalMood;
  /** One complete arc, seconds. A Sola burst is always exactly this — never a timer. */
  arcSec: number;
  /** Recurring formats keep their name every day; the rest draw from the pool below. */
  fixedName?: string;
  /** Vocabulary for generated titles. Two halves, joined — enough combinations that a
   *  fourteen-day guide never repeats, few enough that they all read as programme names. */
  namePool?: { first: string[]; second: string[] };
  /** One line for the guide. */
  synopsis: string;
}

const POOL_NIGHT = {
  first: ['Low', 'Still', 'Deep', 'Long', 'Far', 'Quiet', 'Slow'],
  second: ['Water', 'Hours', 'Ground', 'Tide', 'Room', 'Field', 'Weather'],
};
const POOL_DAWN = {
  first: ['First', 'Early', 'Pale', 'Rising', 'Thin', 'Open'],
  second: ['Light', 'Air', 'Hour', 'Glass', 'Bell', 'Window'],
};
const POOL_DAY = {
  first: ['Long', 'Wide', 'Plain', 'Steady', 'Clear', 'Level'],
  second: ['Room', 'Meridian', 'Distance', 'Ground', 'Company', 'Passage'],
};
const POOL_DUSK = {
  first: ['Turning', 'Late', 'Falling', 'Dim', 'Last', 'Closing'],
  second: ['Light', 'Hour', 'Bell', 'Descent', 'Iron', 'Vespers'],
};

/**
 * The broadcast day.
 *
 * Twenty-four hours of one generator is a screensaver, not a channel, and it will not hold a
 * slot on anyone's grid. What the channel is FOR at 04:00 is not what it is for at 19:00, so
 * the day has a real diurnal shape and the forms differ by more than their seed.
 */
export const GENERATIVE_DAY: Array<{ hour: number; form: GenerativeForm }> = [
  {
    hour: 0,
    form: {
      id: 'undertow', daypart: 'deepNight', arrival: 5, arcSec: 40 * 60,
      fixedName: 'Undertow',
      synopsis: 'Sub-heavy and nearly static. The longest decays of the day and the fewest events. Built to be left on.',
    },
  },
  {
    hour: 2,
    form: {
      id: 'low-water', daypart: 'deepNight', arrival: 5, arcSec: 45 * 60,
      namePool: POOL_NIGHT,
      synopsis: 'The quietest hours on the channel. Luminance near the floor, a handful of events a minute.',
    },
  },
  {
    hour: 5,
    form: {
      id: 'first-light', daypart: 'dawn', arrival: 4, arcSec: 30 * 60,
      namePool: POOL_DAWN,
      synopsis: 'Brightness returns across ninety minutes. The only daypart whose arc runs upward from beginning to end.',
    },
  },
  {
    hour: 7,
    form: {
      id: 'morning-bowl', daypart: 'dawn', arrival: 3, arcSec: 20 * 60,
      fixedName: 'The Morning Bowl',
      synopsis: 'A full five-phase session, on the hour, every hour. The channel’s signature format.',
    },
  },
  {
    hour: 9,
    form: {
      id: 'long-room', daypart: 'day', arrival: 3, arcSec: 45 * 60,
      namePool: POOL_DAY,
      synopsis: 'The focus register — steadier, no Turn, no deliberate silences. Designed to be ignored successfully.',
    },
  },
  {
    hour: 13,
    form: {
      id: 'meridian', daypart: 'day', arrival: 2, arcSec: 20 * 60,
      fixedName: 'Meridian',
      synopsis: 'Midday reset. Twenty-minute arcs, three an hour, each complete in itself so you can join at any point.',
    },
  },
  {
    hour: 15,
    form: {
      id: 'afternoon-glass', daypart: 'day', arrival: 2, arcSec: 25 * 60,
      namePool: POOL_DAY,
      synopsis: 'Brighter, more motion. The most awake hour the channel offers.',
    },
  },
  {
    hour: 17,
    form: {
      id: 'the-turning', daypart: 'dusk', arrival: 2, arcSec: 35 * 60,
      namePool: POOL_DUSK,
      synopsis: 'Roughness comes down across the whole daypart rather than within each session. A four-hour exhale.',
    },
  },
  {
    hour: 21,
    form: {
      id: 'ferrous-hour', daypart: 'dusk', arrival: 3, arcSec: 30 * 60,
      fixedName: 'Ferrous Hour',
      synopsis: 'The channel’s one strange programme. Past the pitch threshold — closer to a haunted room than to music. Scheduled late on purpose.',
    },
  },
  {
    hour: 23,
    form: {
      id: 'descent', daypart: 'dusk', arrival: 4, arcSec: 40 * 60,
      fixedName: 'Descent',
      synopsis: 'Hands off to Deep Night without a seam — the last programme of the day and the first of the next share a seed boundary.',
    },
  },
];

// ── Seed derivation ──────────────────────────────────────────────────────────

/** FNV-1a. Small, stable across languages, and good enough to key a programme. */
function hash(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

/** The UTC date key a programme is seeded from. */
export function dateKey(atMs: number): string {
  const d = new Date(atMs);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * The seed for a programme.
 *
 * Derived rather than stored, so the whole schedule is reproducible and independently
 * verifiable: anyone can re-render last Tuesday at 03:00 and get last Tuesday at 03:00.
 */
export function programmeSeed(atMs: number, slotHour: number): number {
  return hash(`${dateKey(atMs)}:${slotHour}`);
}

// ── The programme ────────────────────────────────────────────────────────────

export interface GenerativeProgramme {
  form: GenerativeForm;
  seed: number;
  /** Title for the guide. Stable for a given date and slot. */
  title: string;
  synopsis: string;
  /** UTC hour the slot begins. */
  startHour: number;
  /** Seconds from the slot's start to the next slot. */
  slotDurationSec: number;
  arrival: ArrivalMood;
  arcSec: number;
}

/**
 * A programme's title.
 *
 * Real names, not `Generative Session #48211`. An EPG full of serial numbers looks broken in a
 * TV grid and will fail platform review — and recurring formats keeping their name every day is
 * most of what makes a grid look programmed rather than random.
 */
export function programmeTitle(form: GenerativeForm, seed: number): string {
  if (form.fixedName) return form.fixedName;
  const pool = form.namePool;
  if (!pool) return form.id;
  const a = pool.first[(seed >>> 4) % pool.first.length];
  const b = pool.second[(seed >>> 13) % pool.second.length];
  return `${a} ${b}`;
}

/** Which slot is on air at a given moment, and everything the player needs to render it. */
export function programmeAt(atMs: number): GenerativeProgramme {
  const hour = new Date(atMs).getUTCHours();
  let idx = 0;
  for (let i = 0; i < GENERATIVE_DAY.length; i++) {
    if (GENERATIVE_DAY[i].hour <= hour) idx = i;
  }
  const entry = GENERATIVE_DAY[idx];
  const next = GENERATIVE_DAY[(idx + 1) % GENERATIVE_DAY.length];
  // The last slot of the day wraps to the first slot of the next.
  const spanHours = next.hour > entry.hour ? next.hour - entry.hour : 24 - entry.hour + next.hour;
  const seed = programmeSeed(atMs, entry.hour);
  return {
    form: entry.form,
    seed,
    title: programmeTitle(entry.form, seed),
    synopsis: entry.form.synopsis,
    startHour: entry.hour,
    slotDurationSec: spanHours * 3600,
    arrival: entry.form.arrival,
    arcSec: entry.form.arcSec,
  };
}

/**
 * Where inside the current arc a viewer joining now should start.
 *
 * A slot is hours long and an arc is tens of minutes, so a slot contains several complete arcs
 * back to back. Tune in at 14:32:07 and you land mid-arc at exactly the right place, because
 * the session's state is a pure function of elapsed time — there is nothing to catch up.
 */
export function arcPositionAt(atMs: number): { arcIndex: number; offsetSec: number; seed: number } {
  const p = programmeAt(atMs);
  const d = new Date(atMs);
  const secIntoHour = d.getUTCMinutes() * 60 + d.getUTCSeconds() + d.getUTCMilliseconds() / 1000;
  const hoursIn = (d.getUTCHours() - p.startHour + 24) % 24;
  const secIntoSlot = hoursIn * 3600 + secIntoHour;
  const arcIndex = Math.floor(secIntoSlot / p.arcSec);
  return {
    arcIndex,
    offsetSec: secIntoSlot - arcIndex * p.arcSec,
    // Each arc inside a slot gets its own seed, or every arc in a four-hour block would be
    // identical — which is the one thing a generative channel has no excuse for.
    seed: hash(`${p.seed}:${arcIndex}`),
  };
}

/** The next N programmes from a moment, for the guide. */
export function upcoming(atMs: number, count: number): GenerativeProgramme[] {
  const out: GenerativeProgramme[] = [];
  let cursor = atMs;
  for (let i = 0; i < count; i++) {
    const p = programmeAt(cursor);
    out.push(p);
    // Step to one second past the end of this slot.
    const d = new Date(cursor);
    const hoursIn = (d.getUTCHours() - p.startHour + 24) % 24;
    const secIntoSlot = hoursIn * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
    cursor += (p.slotDurationSec - secIntoSlot + 1) * 1000;
  }
  return out;
}

// ── Bridging into the carriage layer ─────────────────────────────────────────

/**
 * Turn a scheduled GENERATIVE slot into the thing a device actually renders.
 *
 * Resolved against the wall clock rather than at schedule-build time, because the seed has to
 * be the one every other consumer computes — a value baked in when the schedule was written
 * would differ from the one the EPG and the render worker derive.
 */
export function resolveGenerativeSlot(atMs: number): {
  formId: string;
  seed: number;
  arcSec: number;
  offsetSec: number;
  title: string;
  synopsis: string;
} {
  const prog = programmeAt(atMs);
  const pos = arcPositionAt(atMs);
  return {
    formId: prog.form.id,
    seed: pos.seed,
    arcSec: prog.arcSec,
    offsetSec: pos.offsetSec,
    title: prog.title,
    synopsis: prog.synopsis,
  };
}

/**
 * XMLTV-shaped programme entries for the guide.
 *
 * Generated from the same hash as the audio, so a guide that caches fourteen days stays correct
 * and the grid can be published a year ahead. Titles are real names rather than serial numbers
 * — an EPG full of `Generative Session #48211` looks broken in a TV grid and will fail platform
 * review.
 */
export function generativeEpg(fromMs: number, count: number): Array<{
  startMs: number;
  stopMs: number;
  title: string;
  desc: string;
  category: string;
}> {
  return upcoming(fromMs, count).map((p) => {
    const d = new Date(fromMs);
    // Programme boundaries land on the slot's UTC hour.
    const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), p.startHour, 0, 0);
    const startMs = start > fromMs ? start - 86400000 : start;
    return {
      startMs,
      stopMs: startMs + p.slotDurationSec * 1000,
      title: p.title,
      desc: p.synopsis,
      category: p.form.daypart === 'deepNight' ? 'Sleep' : 'Relaxation',
    };
  });
}
