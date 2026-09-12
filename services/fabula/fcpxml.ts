// fcpxml — timeline interchange for Fabula, targeting DaVinci Resolve (which reads/writes FCPXML
// natively, as do Premiere and Final Cut). This is the "works today, in-browser" interchange; binary
// .aaf is a validated follow-up (see docs/fabula/AAF_INTERCHANGE_PLAN.md).
//
// Model note: FCPXML expresses time as RATIONAL seconds ("100/30s", "1001/30000s", "3s"). Fabula
// stores clip.start/duration/srcIn as plain SECONDS. We convert both ways and quantize to the
// project frame grid so round-trips are frame-accurate.
//
// Multi-track structure (the reliable-import shape): one spine holding a full-length <gap>; every clip
// is a CONNECTED clip on that gap with an absolute `offset` and a `lane` — video tracks on lanes 1,2,…
// (v1=1, v2=2), audio tracks on negative lanes (a1=-1, a2=-2). Resolve imports this cleanly.

export interface FcpFormat { w: number; h: number; fps: number; }
export interface FcpClip { id: string; trackId: string; start: number; duration: number; srcIn: number; kind?: string; assetId?: string; label?: string; /** Fabula fx bag (VectorTrack motion is exported as transform keyframes). */ fx?: any; }
export interface FcpTrack { id: string; name?: string; type: 'video' | 'audio' | 'subtitle'; }
export interface FcpAsset { id: string; name: string; url?: string; cloudUrl?: string; duration?: number; type?: string; }
export interface MediaRef { refId: string; name: string; src: string; duration: number; hasVideo: boolean; hasAudio: boolean; }

// ── time helpers ──────────────────────────────────────────────────────────────
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/** seconds → FCPXML rational "N/Ds" on the frame grid. */
export function secToFcp(sec: number, fps: number): string {
  const f = Math.round((sec || 0) * fps);      // whole frames
  const num = f, den = fps;
  if (num === 0) return '0s';
  const g = gcd(Math.abs(num), den) || 1;
  return `${num / g}/${den / g}s`;
}
/** FCPXML time ("100/30s" | "3s" | "0s") → seconds. */
export function fcpToSec(t: string | null | undefined): number {
  if (!t) return 0;
  const s = t.trim().replace(/s$/, '');
  if (s.includes('/')) { const [n, d] = s.split('/'); const dd = parseFloat(d); return dd ? parseFloat(n) / dd : 0; }
  return parseFloat(s) || 0;
}
const frameDuration = (fps: number): string => {
  // NTSC-friendly rationals for the common drop rates; exact 1/fps otherwise.
  if (Math.abs(fps - 29.97) < 0.01) return '1001/30000s';
  if (Math.abs(fps - 23.976) < 0.01) return '1001/24000s';
  if (Math.abs(fps - 59.94) < 0.01) return '1001/60000s';
  return `1/${Math.round(fps)}s`;
};
const laneFor = (trackId: string): number => {
  const n = parseInt(trackId.slice(1), 10) || 1;
  if (trackId.startsWith('a')) return -n;   // audio below
  if (trackId.startsWith('v')) return n;    // video above (v1=1, v2=2)
  return n;                                  // subtitles/others treated as upper lanes
};
const xmlEsc = (s: string) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fileUrl = (a: FcpAsset): string => {
  const u = a.url || a.cloudUrl || '';
  if (/^https?:|^file:/i.test(u)) return u;
  // A bare/local name → a placeholder file URL so the NLE (and our relink) key off the basename.
  return `file:///${encodeURIComponent(a.name || a.id)}`;
};

import { motionKeys, adjustTransformXml } from './fcpxmlTransform';

// ── export ──────────────────────────────────────────────────────────────────
export function exportFCPXML(clips: FcpClip[], tracks: FcpTrack[], pool: FcpAsset[], fmt: FcpFormat, projectName = 'Fabula Project'): string {
  const fps = fmt.fps || 24;
  const seqEnd = clips.reduce((m, c) => Math.max(m, (c.start || 0) + (c.duration || 0)), 0) || 1;
  const byId = new Map(pool.map(a => [a.id, a]));
  const used = [...new Set(clips.map(c => c.assetId).filter(Boolean))] as string[];

  const assetLines = used.map((aid, i) => {
    const a = byId.get(aid) || { id: aid, name: aid, type: 'video' } as FcpAsset;
    const isAudio = a.type === 'audio';
    const dur = secToFcp(a.duration || seqEnd, fps);
    return `    <asset id="a${i + 1}" name="${xmlEsc(a.name || aid)}" start="0s" duration="${dur}" ` +
      `hasVideo="${isAudio ? 0 : 1}" hasAudio="${isAudio || a.type === 'video' ? 1 : 0}" format="r1" ` +
      `videoSources="${isAudio ? 0 : 1}" audioSources="${isAudio || a.type === 'video' ? 1 : 0}" audioChannels="2">\n` +
      `      <media-rep kind="original-media" src="${xmlEsc(fileUrl(a))}"/>\n    </asset>`;
  }).join('\n');
  const refOf = new Map(used.map((aid, i) => [aid, `a${i + 1}`]));

  const clipEls = clips.filter(c => c.assetId && refOf.has(c.assetId)).sort((x, y) => x.start - y.start).map(c => {
    const ref = refOf.get(c.assetId!)!;
    const isAudio = c.trackId.startsWith('a');
    const tag = isAudio ? 'audio' : 'asset-clip';
    const roleAttr = isAudio ? ' role="dialogue"' : '';
    // VectorTrack motion (planar / point stabilise, or a pin to another clip's surface) → keyframed
    // position / scale / rotation. Perspective cannot be expressed in FCPXML and is dropped.
    let transform = '';
    if (!isAudio && c.fx) {
      const pinSrc = c.fx.pinTo?.clipId ? clips.find(o => o.id === c.fx.pinTo.clipId) : null;
      const keys = motionKeys({ trackMode: c.fx.trackMode, vectorTrack: c.fx.vectorTrack, planarTrack: c.fx.planarTrack, pinTo: pinSrc?.fx?.planarTrack ? { seq: pinSrc.fx.planarTrack, startOffset: c.start - pinSrc.start } : null }, c.duration, fps, fmt.w, fmt.h);
      transform = adjustTransformXml(keys, (sec) => secToFcp((c.srcIn || 0) + sec, fps));
    }
    const open = `        <${tag} ref="${ref}" lane="${laneFor(c.trackId)}" offset="${secToFcp(c.start, fps)}" ` +
      `name="${xmlEsc(c.label || '')}" duration="${secToFcp(c.duration, fps)}" start="${secToFcp(c.srcIn || 0, fps)}"${roleAttr}`;
    return transform ? `${open}>
          ${transform}
        </${tag}>` : `${open}/>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    <format id="r1" name="FFVideoFormat${fmt.w}x${fmt.h}p${Math.round(fps)}" frameDuration="${frameDuration(fps)}" width="${fmt.w}" height="${fmt.h}"/>
${assetLines}
  </resources>
  <library>
    <event name="${xmlEsc(projectName)}">
      <project name="${xmlEsc(projectName)}">
        <sequence format="r1" duration="${secToFcp(seqEnd, fps)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
            <gap name="Timeline" offset="0s" duration="${secToFcp(seqEnd, fps)}" start="0s">
${clipEls}
            </gap>
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>`;
}

// ── import ────────────────────────────────────────────────────────────────────
export interface ParsedTimeline {
  projectName: string;
  format: FcpFormat;
  tracks: FcpTrack[];
  clips: FcpClip[];         // assetId = the media-ref basename key (relinked later)
  mediaRefs: MediaRef[];    // what to locate on disk
}

/** Parse FCPXML (Resolve/Premiere/FCP) → a Fabula-shaped timeline + the media it needs. */
export function importFCPXML(xml: string): ParsedTimeline {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Not a valid FCPXML file.');

  // format (fps from frameDuration rational; width/height)
  const fmtEl = doc.querySelector('resources > format') || doc.querySelector('format');
  const fd = fmtEl?.getAttribute('frameDuration') || '1/24s';
  const fdSec = fcpToSec(fd) || 1 / 24;
  const fps = Math.round(1 / fdSec) || 24;
  const format: FcpFormat = { w: parseInt(fmtEl?.getAttribute('width') || '1920', 10), h: parseInt(fmtEl?.getAttribute('height') || '1080', 10), fps };

  // media refs (assets)
  const mediaRefs: MediaRef[] = [];
  const refName = new Map<string, string>(); // ref id → basename
  doc.querySelectorAll('resources > asset, asset').forEach(a => {
    const id = a.getAttribute('id'); if (!id) return;
    const rep = a.querySelector('media-rep');
    const src = rep?.getAttribute('src') || a.getAttribute('src') || '';
    const name = a.getAttribute('name') || basename(src) || id;
    const key = (basename(src) || name).toLowerCase();
    if (!mediaRefs.some(m => m.refId === id)) {
      mediaRefs.push({ refId: id, name, src, duration: fcpToSec(a.getAttribute('duration')), hasVideo: a.getAttribute('hasVideo') !== '0', hasAudio: a.getAttribute('hasAudio') === '1' });
    }
    refName.set(id, key);
  });

  const projectName = doc.querySelector('project')?.getAttribute('name') || doc.querySelector('event')?.getAttribute('name') || 'Imported Timeline';

  // clips: any asset-clip / video / audio / clip with a ref, anywhere in the sequence.
  // Audio routing is the tricky bit — Resolve emits audio-only clips a few ways: an <audio> tag, an
  // <asset-clip> on a NEGATIVE lane, OR an <asset-clip> referencing an audio-only asset with NO lane
  // at all. The old code defaulted lane-less clips to lane 1 (video), so those audio clips vanished onto
  // a video track. Now a clip is audio if the tag is audio, the lane is negative, OR its asset is
  // audio-only (hasVideo=0) — and it lands on a matching a-track.
  const audioOnly = new Set(mediaRefs.filter((m) => !m.hasVideo).map((m) => m.refId));
  const clips: FcpClip[] = [];
  doc.querySelectorAll('sequence asset-clip, sequence video, sequence audio, sequence audio-clip, sequence clip, sequence ref-clip, sequence sync-clip').forEach((el, i) => {
    const ref = el.getAttribute('ref'); if (!ref) return;
    const tag = el.tagName.toLowerCase();
    const laneStr = el.getAttribute('lane');
    const lane = laneStr != null ? (parseInt(laneStr, 10) || 0) : 0;
    const isAudio = tag === 'audio' || tag === 'audio-clip' || lane < 0 || audioOnly.has(ref);
    // offset is relative to the parent; walk up summing parent offsets to get absolute timeline pos.
    let offset = fcpToSec(el.getAttribute('offset'));
    let p = el.parentElement;
    while (p && !/^(spine|sequence)$/i.test(p.tagName)) { offset += fcpToSec(p.getAttribute('offset')); p = p.parentElement; }
    const trackId = isAudio ? `a${lane < 0 ? -lane : 1}` : `v${lane > 0 ? lane : 1}`;
    clips.push({
      id: `imp_${Date.now().toString(36)}_${i}`, trackId,
      start: offset, duration: fcpToSec(el.getAttribute('duration')) || 1, srcIn: fcpToSec(el.getAttribute('start')),
      kind: 'media', assetId: refName.get(ref) || ref, label: el.getAttribute('name') || mediaRefs.find((m) => m.refId === ref)?.name || 'Clip',
    });
  });

  // tracks present (derive from the lanes we saw)
  const trackIds = [...new Set(clips.map(c => c.trackId))];
  const tracks: FcpTrack[] = trackIds.map(id => ({ id, name: id.toUpperCase(), type: id.startsWith('a') ? 'audio' : 'video' }));
  if (!tracks.some(t => t.id === 'v1')) tracks.unshift({ id: 'v1', name: 'V1', type: 'video' });
  if (!tracks.some(t => t.id === 'a1')) tracks.push({ id: 'a1', name: 'A1', type: 'audio' });

  return { projectName, format, tracks, clips, mediaRefs };
}

export function basename(pathOrUrl: string): string {
  if (!pathOrUrl) return '';
  try { const u = decodeURIComponent(pathOrUrl); return u.split(/[\\/]/).pop()?.split('?')[0] || ''; }
  catch { return pathOrUrl.split(/[\\/]/).pop()?.split('?')[0] || ''; }
}
