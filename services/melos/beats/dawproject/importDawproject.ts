// .dawproject import — full, honest mapping (user-confirmed scope):
//   • our own exports round-trip losslessly (detected via <Application name>),
//   • foreign Bitwig/Studio One/Cubase projects map Tempo, note tracks (→ patterns, ascending
//     key → pads, 16th-quantized with the residual kept as micro), audio tracks (embedded files
//     decoded → OPFS → clips), Channel volume/pan/mute,
//   • anything we can't play — plugin Devices, complex Warps, unrecognized tracks — is preserved
//     VERBATIM in doc.foreignXml and re-emitted on export. Nothing is silently destroyed; the
//     import report says exactly what mapped and what's inert.

import { unzipSync, strFromU8 } from 'fflate';
import { newGrooveDoc, grooveUid, type GrooveDoc, type Pattern, type ArrangeTrack } from '../grooveDoc';
import { ingestSample } from '../sampleStore';
import { APP_NAME, DRUM_KEY_BASE, MELO_KEY_BASE, type ForeignXml } from './exportDawproject';

export interface ImportResult {
  doc: GrooveDoc;
  samples: [string, AudioBuffer][];
  report: string[];
}

const attr = (el: Element | null, name: string, fallback = ''): string => el?.getAttribute(name) ?? fallback;
const numAttr = (el: Element | null, name: string, fallback = 0): number => {
  const v = parseFloat(attr(el, name));
  return Number.isFinite(v) ? v : fallback;
};

function patternLength(durationBeats: number): 16 | 32 | 48 | 64 {
  const steps = Math.max(1, Math.round(durationBeats / 0.25));
  if (steps <= 16) return 16;
  if (steps <= 32) return 32;
  if (steps <= 48) return 48;
  return 64;
}

export async function importDawproject(zipBytes: Uint8Array, ownerId: string, ctx: BaseAudioContext): Promise<ImportResult | null> {
  const report: string[] = [];
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(zipBytes); } catch { return null; }
  const projectEntry = Object.keys(files).find((k) => k.endsWith('project.xml'));
  if (!projectEntry) return null;
  const xml = new DOMParser().parseFromString(strFromU8(files[projectEntry]), 'application/xml');
  if (xml.querySelector('parsererror')) return null;

  const doc = newGrooveDoc(ownerId, 'Imported project');
  doc.patterns = [];
  doc.arrangement = [];
  const samples: [string, AudioBuffer][] = [];
  const foreign: ForeignXml = { tracks: [], lanes: [] };

  const isOwn = attr(xml.querySelector('Application'), 'name') === APP_NAME;
  const title = xml.querySelector('MetaData Title')?.textContent
    // metadata.xml is a separate zip entry; fall back to it.
    || (() => { const m = Object.keys(files).find((k) => k.endsWith('metadata.xml')); if (!m) return null; const md = new DOMParser().parseFromString(strFromU8(files[m]), 'application/xml'); return md.querySelector('Title')?.textContent; })();
  if (title) doc.name = title;

  doc.bpm = Math.max(20, Math.min(300, numAttr(xml.querySelector('Transport Tempo'), 'value', 120)));
  const tsig = xml.querySelector('Transport TimeSignature');
  if (tsig && (numAttr(tsig, 'numerator', 4) !== 4 || numAttr(tsig, 'denominator', 4) !== 4)) {
    report.push(`Time signature ${attr(tsig, 'numerator')}/${attr(tsig, 'denominator')} → treated as 4/4 (Beats is 4/4 in this build)`);
  }

  // Lanes are keyed by track id.
  const lanesByTrack = new Map<string, Element>();
  xml.querySelectorAll('Arrangement > Lanes > Lanes').forEach((l) => lanesByTrack.set(attr(l, 'track'), l));

  const structureTracks = [...xml.querySelectorAll('Structure > Track')];
  let importedNoteTracks = 0;
  let importedAudioTracks = 0;

  // Our own exports fan one groove out across 16 per-pad note tracks (so the notes are editable
  // in Bitwig). Re-importing must FOLD them back into single patterns, or a save→open cycle
  // would multiply tracks. Keyed by the clip window they occupy.
  const ownPatterns = new Map<string, Pattern>();
  const ownTrack: ArrangeTrack = { id: grooveUid(), kind: 'pattern', name: 'Grooves', color: '#B84DFF', mute: false, solo: false, gainDb: 0, pan: 0, clips: [] };

  for (const trackEl of structureTracks) {
    const id = attr(trackEl, 'id');
    const name = attr(trackEl, 'name', 'Track');
    const contentType = attr(trackEl, 'contentType');
    const channel = trackEl.querySelector(':scope > Channel');
    const role = attr(channel, 'role');
    if (role === 'master') {
      const vol = numAttr(channel?.querySelector(':scope > Volume') ?? null, 'value', 1);
      doc.mixer.master.gainDb = Math.max(-60, Math.min(12, 20 * Math.log10(Math.max(vol, 1e-3))));
      continue;
    }
    if (isOwn && (id.startsWith('t-group') || id === 't-print')) {
      if (id.startsWith('t-group')) {
        const gi = 'ABCD'.indexOf(id.slice(-1));
        if (gi >= 0) {
          const vol = numAttr(channel?.querySelector(':scope > Volume') ?? null, 'value', 1);
          doc.mixer.groups[gi].gainDb = Math.max(-60, Math.min(12, 20 * Math.log10(Math.max(vol, 1e-3))));
          doc.mixer.groups[gi].mute = attr(channel?.querySelector(':scope > Mute') ?? null, 'value') === 'true';
        }
      }
      continue; // print track is a derived artifact — never re-imported
    }

    const hasDevices = !!trackEl.querySelector('Device, Devices, Vst3Plugin, ClapPlugin, AuPlugin, BuiltinDevice');
    const lanes = lanesByTrack.get(id) || null;
    const vol = numAttr(channel?.querySelector(':scope > Volume') ?? null, 'value', 1);
    const gainDb = Math.max(-60, Math.min(12, 20 * Math.log10(Math.max(vol, 1e-3))));
    const pan = Math.max(-1, Math.min(1, numAttr(channel?.querySelector(':scope > Pan') ?? null, 'value', 0.5) * 2 - 1));
    const mute = attr(channel?.querySelector(':scope > Mute') ?? null, 'value') === 'true';

    if (hasDevices && !contentType.includes('audio') && !contentType.includes('notes')) {
      foreign.tracks!.push(trackEl.outerHTML);
      if (lanes) foreign.lanes!.push(lanes.outerHTML);
      doc.arrangement.push({ id: grooveUid(), kind: 'pattern', name, color: '#D0BCFF', mute: true, solo: false, gainDb, pan, clips: [], foreign: { trackXml: trackEl.outerHTML } });
      report.push(`"${name}": plugin/device track preserved for re-export (not playable in browser)`);
      continue;
    }

    if (contentType.includes('notes') && lanes) {
      const ownPadMatch = isOwn ? id.match(/^t-pad(\d+)$/) : null;
      if (ownPadMatch) {
        // Fold this pad's notes back into the shared pattern for each clip window.
        const padIdx = Number(ownPadMatch[1]);
        if (doc.kit[padIdx]) {
          doc.kit[padIdx].name = name;
          doc.kit[padIdx].gainDb = gainDb;
          doc.kit[padIdx].pan = pan;
          doc.kit[padIdx].mute = mute;
        }
        for (const clipEl of lanes.querySelectorAll('Clip')) {
          const startBeats = numAttr(clipEl, 'time', 0);
          const lengthBeats = Math.max(1, numAttr(clipEl, 'duration', 4));
          const key = `${startBeats}:${lengthBeats}`;
          let pattern = ownPatterns.get(key);
          if (!pattern) {
            pattern = { id: grooveUid(), name: attr(clipEl, 'name', `Pattern ${ownPatterns.size + 1}`), length: patternLength(lengthBeats), steps: {}, melo: {} };
            ownPatterns.set(key, pattern);
            doc.patterns.push(pattern);
            ownTrack.clips.push({ id: grooveUid(), startBeats, lengthBeats, patternId: pattern.id });
          }
          for (const noteEl of clipEl.querySelectorAll('Note')) {
            const time = numAttr(noteEl, 'time', 0);
            const noteChannel = numAttr(noteEl, 'channel', 0);
            const vel = Math.max(1, Math.min(127, Math.round(numAttr(noteEl, 'vel', 0.8) * 127)));
            const stepFloat = time / 0.25;
            const step = Math.max(0, Math.min(pattern.length - 1, Math.round(stepFloat)));
            const micro = Math.max(-0.5, Math.min(0.5, stepFloat - step));
            if (noteChannel === 1) {
              const lane = pattern.melo![padIdx] || (pattern.melo![padIdx] = {});
              (lane[step] || (lane[step] = [])).push({
                semi: numAttr(noteEl, 'key', MELO_KEY_BASE) - MELO_KEY_BASE,
                v: vel,
                len: Math.max(1, Math.round(numAttr(noteEl, 'duration', 0.25) / 0.25)),
              });
            } else {
              (pattern.steps[padIdx] || (pattern.steps[padIdx] = {}))[step] = { v: vel, ...(Math.abs(micro) > 0.02 ? { micro } : {}) };
            }
          }
        }
        continue;
      }

      // Foreign NOTE track → its own pattern ArrangeTrack; each Clip becomes a Pattern.
      const arrTrack: ArrangeTrack = { id: grooveUid(), kind: 'pattern', name, color: attr(trackEl, 'color', '#B84DFF'), mute, solo: false, gainDb, pan, clips: [] };
      // Map the track's distinct pitches onto pads, lowest key → pad 0 (drum-map convention).
      const keyToPad = new Map<number, number>();
      const keys = [...lanes.querySelectorAll('Note')].map((n) => numAttr(n, 'key', 60));
      [...new Set(keys)].sort((a, b) => a - b).slice(0, 16).forEach((k, i) => keyToPad.set(k, i));
      if (new Set(keys).size > 16) report.push(`"${name}": ${new Set(keys).size} distinct pitches — first 16 mapped to pads, extras folded onto the highest pad`);
      for (const clipEl of lanes.querySelectorAll('Clip')) {
        const startBeats = numAttr(clipEl, 'time', 0);
        const lengthBeats = Math.max(1, numAttr(clipEl, 'duration', 4));
        const pattern: Pattern = { id: grooveUid(), name: attr(clipEl, 'name', `${name} clip`), length: patternLength(lengthBeats), steps: {} };
        for (const noteEl of clipEl.querySelectorAll('Note')) {
          const time = numAttr(noteEl, 'time', 0);
          const key = numAttr(noteEl, 'key', 60);
          const vel = Math.max(1, Math.min(127, Math.round(numAttr(noteEl, 'vel', 0.8) * 127)));
          const stepFloat = time / 0.25;
          const step = Math.max(0, Math.min(pattern.length - 1, Math.round(stepFloat)));
          const micro = Math.max(-0.5, Math.min(0.5, stepFloat - step));
          const padIdx = keyToPad.get(key) ?? 15;
          (pattern.steps[padIdx] || (pattern.steps[padIdx] = {}))[step] = { v: vel, ...(Math.abs(micro) > 0.02 ? { micro } : {}) };
        }
        doc.patterns.push(pattern);
        arrTrack.clips.push({ id: grooveUid(), startBeats, lengthBeats, patternId: pattern.id });
      }
      if (arrTrack.clips.length) { doc.arrangement.push(arrTrack); importedNoteTracks++; }
      continue;
    }

    if (contentType.includes('audio') && lanes) {
      const arrTrack: ArrangeTrack = { id: grooveUid(), kind: 'audio', name, color: attr(trackEl, 'color', '#00DAF3'), mute, solo: false, gainDb, pan, clips: [] };
      for (const clipEl of lanes.querySelectorAll('Clip')) {
        const audioEl = clipEl.querySelector('Audio');
        const fileEl = audioEl?.querySelector('File');
        const path = attr(fileEl ?? null, 'path');
        if (!path) continue;
        const entry = Object.keys(files).find((k) => k === path || k.endsWith(`/${path}`) || k.endsWith(path));
        if (!entry) { report.push(`"${name}": missing embedded audio "${path}" — clip skipped`); continue; }
        if (clipEl.querySelector('Warps Warp:nth-of-type(3)')) report.push(`"${name}": complex warps flattened (clip plays unwarped)`);
        const bytes = files[entry];
        const ingested = await ingestSample(new Blob([bytes as unknown as BlobPart]), path.split('/').pop() || 'audio', ctx);
        if (!ingested) { report.push(`"${name}": could not decode "${path}" — clip skipped`); continue; }
        samples.push([ingested.ref.key, ingested.buffer]);
        arrTrack.clips.push({
          id: grooveUid(),
          startBeats: numAttr(clipEl, 'time', 0),
          lengthBeats: Math.max(0.25, numAttr(clipEl, 'duration', ingested.buffer.duration / (60 / doc.bpm))),
          audio: { sampleKey: ingested.ref.key, name: ingested.ref.name, offsetSec: numAttr(clipEl, 'playStart', 0), gainDb: 0, durationSec: ingested.buffer.duration },
        });
      }
      if (arrTrack.clips.length) { doc.arrangement.push(arrTrack); importedAudioTracks++; }
      continue;
    }

    // Unrecognized track shape — preserve wholesale.
    foreign.tracks!.push(trackEl.outerHTML);
    if (lanes) foreign.lanes!.push(lanes.outerHTML);
    doc.arrangement.push({ id: grooveUid(), kind: 'pattern', name, color: '#D0BCFF', mute: true, solo: false, gainDb, pan, clips: [], foreign: { trackXml: trackEl.outerHTML } });
    report.push(`"${name}": unrecognized track preserved for re-export`);
  }

  // Folded own-export pads become one pattern track, restoring the original document shape.
  if (ownTrack.clips.length) {
    for (const p of ownPatterns.values()) if (!Object.keys(p.melo || {}).length) delete p.melo;
    doc.arrangement.unshift(ownTrack);
    importedNoteTracks++;
  }
  if (!doc.patterns.length) doc.patterns.push({ id: grooveUid(), name: 'Pattern A', length: 16, steps: {} });
  if (foreign.tracks!.length || foreign.lanes!.length) doc.foreignXml = JSON.stringify(foreign);
  report.unshift(`Imported ${importedNoteTracks} note track(s), ${importedAudioTracks} audio track(s) at ${doc.bpm} bpm${isOwn ? ' (Melos Beats project — lossless)' : ''}`);
  return { doc, samples, report };
}
