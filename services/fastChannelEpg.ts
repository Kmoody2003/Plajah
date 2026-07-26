// Plajah FAST — EPG + feed generation (pure, no Firebase). Turns a channel's looping slot schedule
// into wall-clock programming and emits the industry formats platform guides ingest: XMLTV (the
// EPG) and MRSS (the content feed). Deterministic across viewers: the loop is anchored to epoch, so
// "what's on now" is computed from the clock, not from any single viewer's playback position.

export interface EpgSlot { title: string; desc?: string; durationSec?: number; }
export interface EpgProgramme { start: number; stop: number; title: string; desc?: string; }
export interface EpgChannel {
  id: string;          // stable guide id, e.g. plajah.<ownerId>
  name: string;
  number?: number;
  category?: string;
  logoUrl?: string;
}
export interface MrssItem { id: string; title: string; description?: string; url: string; thumbnailUrl?: string; durationSec?: number; }

const DEFAULT_SLOT_SEC = 30 * 60;   // fallback when a slot carries no duration
const slotDur = (s: EpgSlot) => Math.max(60, Math.round(s.durationSec || DEFAULT_SLOT_SEC));

/**
 * Deterministic looping guide. Anchored to epoch 0 so every viewer/guide computes the same
 * programme boundaries for a given wall-clock. Returns every programme overlapping
 * [fromMs, fromMs + hoursAhead·1h].
 */
export function buildProgramGuide(slots: EpgSlot[], fromMs: number, hoursAhead = 24): EpgProgramme[] {
  const clean = (slots || []).filter(s => s && s.title);
  const total = clean.reduce((a, s) => a + slotDur(s), 0);
  if (!clean.length || total <= 0) return [];
  const untilMs = fromMs + hoursAhead * 3_600_000;
  const fromSec = Math.floor(fromMs / 1000);
  let t = fromSec - (fromSec % total);   // start of the loop iteration containing `from`
  const out: EpgProgramme[] = [];
  let guard = 0;
  while (t * 1000 < untilMs && guard < 20_000) {
    for (const s of clean) {
      const d = slotDur(s);
      const startMs = t * 1000, stopMs = (t + d) * 1000;
      if (stopMs > fromMs && startMs < untilMs) out.push({ start: startMs, stop: stopMs, title: s.title, desc: s.desc });
      t += d;
      if (t * 1000 >= untilMs) break;
    }
    guard++;
  }
  return out;
}

/** What's on now + next, from the same deterministic guide. */
export function nowAndNext(slots: EpgSlot[], atMs = Date.now()): { now?: EpgProgramme; next?: EpgProgramme } {
  const g = buildProgramGuide(slots, atMs - 6 * 3_600_000, 12);
  const now = g.find(p => atMs >= p.start && atMs < p.stop);
  const next = g.find(p => p.start >= (now?.stop ?? atMs));
  return { now, next };
}

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const xmltvTime = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())} +0000`;
};

/** XMLTV document for one or more channels (each with its computed programmes). */
export function buildXmltv(entries: { channel: EpgChannel; programmes: EpgProgramme[] }[]): string {
  const channels = entries.map(({ channel: c }) => {
    const nums = c.number != null ? `\n    <display-name>${c.number}</display-name>` : '';
    const icon = c.logoUrl ? `\n    <icon src="${esc(c.logoUrl)}" />` : '';
    return `  <channel id="${esc(c.id)}">\n    <display-name>${esc(c.name)}</display-name>${nums}${icon}\n  </channel>`;
  }).join('\n');
  const programmes = entries.flatMap(({ channel: c, programmes: ps }) =>
    ps.map(p =>
      `  <programme start="${xmltvTime(p.start)}" stop="${xmltvTime(p.stop)}" channel="${esc(c.id)}">\n` +
      `    <title lang="en">${esc(p.title)}</title>` +
      (p.desc ? `\n    <desc lang="en">${esc(p.desc)}</desc>` : '') +
      (c.category ? `\n    <category lang="en">${esc(c.category)}</category>` : '') +
      `\n  </programme>`,
    ),
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE tv SYSTEM "xmltv.dtd">\n<tv generator-info-name="Plajah FAST" source-info-name="Plajah">\n${channels}\n${programmes}\n</tv>\n`;
}

/** MRSS content feed for one channel — the playable item catalogue platforms ingest. */
export function buildMrss(channel: EpgChannel, items: MrssItem[], link: string): string {
  const body = items.map(it => {
    const type = /\.m3u8($|\?)/i.test(it.url) ? 'application/x-mpegURL' : 'video/mp4';
    const dur = it.durationSec ? ` duration="${Math.round(it.durationSec)}"` : '';
    const thumb = it.thumbnailUrl ? `\n      <media:thumbnail url="${esc(it.thumbnailUrl)}" />` : '';
    return `    <item>\n      <title>${esc(it.title)}</title>\n      <guid isPermaLink="false">${esc(it.id)}</guid>` +
      (it.description ? `\n      <description>${esc(it.description)}</description>` : '') +
      `\n      <media:content url="${esc(it.url)}" type="${type}" medium="video"${dur} />${thumb}\n    </item>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">\n  <channel>\n    <title>${esc(channel.name)}</title>\n    <link>${esc(link)}</link>\n    <description>${esc(channel.category || 'FAST channel')} — Plajah</description>${channel.logoUrl ? `\n    <image><url>${esc(channel.logoUrl)}</url><title>${esc(channel.name)}</title><link>${esc(link)}</link></image>` : ''}\n${body}\n  </channel>\n</rss>\n`;
}
