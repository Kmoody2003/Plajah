// Compliance check for a disc project against its format and destination.
import { planBudget } from './budget';
import { compile } from './navigation';
import { autoNav, SAFE, type DiscProject } from './project';
import { AUDIO, DESTINATIONS, DYNAMICS, GRAPHICS_PLANE, LIMITS, mediumById, VIDEO_CODECS, VIDEO_MODES } from './spec';

export type Severity = 'error' | 'warn' | 'info';
export interface Issue { severity: Severity; area: 'format' | 'disc' | 'audio' | 'subtitles' | 'menus' | 'navigation' | 'licensing' | 'destination'; message: string; fix?: string; ref?: string }

export function validate(p: DiscProject): Issue[] {
  const out: Issue[] = [];
  const add = (severity: Severity, area: Issue['area'], message: string, fix?: string, ref?: string) => out.push({ severity, area, message, fix, ref });
  const dest = DESTINATIONS.find(d => d.id === p.destination);
  const m = mediumById(p.mediumId);

  // Format
  const mode = VIDEO_MODES[p.format].find(v => v.w === p.video.w && v.h === p.video.h && v.fps === p.video.fps && v.scan === p.video.scan);
  if (!mode) add('error', 'format', `${p.video.w}×${p.video.h} ${p.video.scan}${p.video.fps} is not a legal ${p.format === 'UHD' ? 'Ultra HD Blu-ray' : 'Blu-ray'} video mode.`,
    p.format === 'BD' && p.video.h === 1080 && p.video.scan === 'p' && p.video.fps >= 50 ? '1080p50/60 is not allowed on Blu-ray — use 1080i, 720p, or make it a UHD disc.' : 'Pick a mode from the list.');
  if (!VIDEO_CODECS[p.format].includes(p.video.codec)) add('error', 'format', `${p.video.codec.toUpperCase()} is not allowed on ${p.format}.`, p.format === 'UHD' ? 'UHD discs use HEVC Main10.' : 'Use H.264.');
  if (!DYNAMICS[p.format].includes(p.video.dynamic)) add('error', 'format', `${p.video.dynamic} is not available on ${p.format}.`);
  if (p.format === 'UHD' && p.video.dynamic === 'HDR10' && !p.video.hdr) add('error', 'format', 'HDR10 needs mastering metadata (MaxCLL / MaxFALL / mastering display).', 'Fill in HDR metadata from your grade.');
  if (p.format === 'UHD' && p.video.hdr && p.video.hdr.maxFall > p.video.hdr.maxCll) add('error', 'format', 'MaxFALL cannot be higher than MaxCLL.');

  // Medium & destination
  if (!m) add('error', 'disc', 'Choose a disc.');
  else {
    if (!m.format.includes(p.format)) add('error', 'disc', `${m.label} cannot hold a ${p.format} disc.`);
    if (dest && !dest.media.includes(m.id)) add('error', 'destination', `${m.label} is not used for "${dest.label}".`, `Use: ${dest.media.map(id => mediumById(id)?.label).join(', ')}`);
  }
  if (!p.titles.length) add('error', 'disc', 'Add at least one title.');
  if (p.titles.length > LIMITS.titles) add('error', 'disc', `More than ${LIMITS.titles} titles.`);

  if (m && p.titles.length) {
    const b = planBudget(p);
    if (!b.fits) add('error', 'disc', `Content needs ${(b.usedBytes / 1e9).toFixed(1)} GB — ${m.label} holds ${(m.bytes / 1e9).toFixed(1)} GB.`, 'Use a bigger disc, lower extras bitrate, or split across discs.');
    for (const t of b.titles) if (t.grade === 'poor') add('warn', 'disc', `"${t.name}" gets ${(t.videoKbps / 1000).toFixed(1)} Mbit/s — picture will be soft.`, undefined, t.titleId);
  }

  // Tracks
  for (const t of p.titles) {
    if (t.source.durationSec <= 0) add('error', 'disc', `"${t.name}" has no source or zero length.`, 'Attach a timeline or file.', t.id);
    if (!t.audio.length) add('warn', 'audio', `"${t.name}" has no audio.`, undefined, t.id);
    if (t.audio.length > LIMITS.audio) add('error', 'audio', `"${t.name}" has more than ${LIMITS.audio} audio tracks.`, undefined, t.id);
    if (t.subtitles.length > LIMITS.pgs) add('error', 'subtitles', `"${t.name}" has more than ${LIMITS.pgs} subtitle tracks.`, undefined, t.id);
    for (const a of t.audio) {
      const spec = AUDIO[a.codec];
      if (a.kbps > spec.maxKbps) add('error', 'audio', `${a.label}: ${a.kbps} kbps is over the ${spec.label} limit (${spec.maxKbps}).`, undefined, t.id);
      if (a.channels > spec.maxCh) add('error', 'audio', `${a.label}: ${spec.label} carries at most ${spec.maxCh} channels.`, undefined, t.id);
      if (a.codec === 'eac3') add('error', 'audio', `${a.label}: Dolby Digital Plus is secondary-audio only on Blu-ray.`, 'Use AC-3 or LPCM.', t.id);
      if (spec.licensedEncoder) add('warn', 'licensing', `${a.label}: ${spec.label} needs a licensed encoder we don't ship — bring a pre-encoded stream or switch to LPCM / AC-3.`, undefined, t.id);
    }
    const sorted = [...t.chapters].sort((x, y) => x.timeSec - y.timeSec);
    if (sorted[0] && sorted[0].timeSec > 0.5) add('warn', 'navigation', `"${t.name}" has no chapter at 0:00.`, undefined, t.id);
    if (sorted.some(c => c.timeSec > t.source.durationSec)) add('error', 'navigation', `"${t.name}" has a chapter past the end.`, undefined, t.id);
    if (t.subtitles.some(s => !s.srt && !s.captionTrackId)) add('warn', 'subtitles', `"${t.name}" has a subtitle track with no text.`, undefined, t.id);
  }

  // Menus
  if (!p.topMenuId && p.menus.length) add('warn', 'menus', 'No top menu is set — the Menu button on the remote will do nothing.');
  if (p.firstPlay.then === 'TOP_MENU' && !p.topMenuId) add('error', 'menus', 'First play goes to the top menu, but there is none.');
  for (const mn of p.menus) {
    const btns = autoNav(mn.buttons);
    for (const b of btns) {
      if (b.x < 0 || b.y < 0 || b.x + b.w > GRAPHICS_PLANE.w || b.y + b.h > GRAPHICS_PLANE.h) add('error', 'menus', `"${mn.name}" › "${b.label}" is off the graphics plane.`, undefined, mn.id);
      else if (b.x < SAFE.action.x || b.y < SAFE.action.y || b.x + b.w > SAFE.action.x + SAFE.action.w || b.y + b.h > SAFE.action.y + SAFE.action.h) add('warn', 'menus', `"${mn.name}" › "${b.label}" is outside action-safe — some TVs crop it.`, undefined, mn.id);
      if (b.action.kind === 'NONE') add('warn', 'menus', `"${mn.name}" › "${b.label}" does nothing.`, undefined, mn.id);
    }
    // Reachability from the default button.
    if (btns.length) {
      const seen = new Set<string>(); const q = [mn.defaultButton && btns.some(b => b.id === mn.defaultButton) ? mn.defaultButton : btns[0].id];
      while (q.length) { const id = q.pop()!; if (seen.has(id)) continue; seen.add(id); const b = btns.find(x => x.id === id); if (b) for (const n of Object.values(b.nav)) if (n) q.push(n); }
      for (const b of btns) if (!seen.has(b.id)) add('error', 'navigation', `"${mn.name}" › "${b.label}" can't be reached with the arrow keys.`, 'Set its neighbours or move it.', mn.id);
    }
    if (mn.id === p.popupMenuId && (mn.background.kind === 'video' || mn.background.kind === 'title')) add('warn', 'menus', 'Pop-up menus draw over the film — a motion background is ignored.', undefined, mn.id);
  }
  for (const w of compile(p).warnings) add('error', 'navigation', w);

  // Licensing & destination
  if (p.video.dynamic === 'DOLBY_VISION') add('warn', 'licensing', 'Dolby Vision needs a Dolby licence and the enhancement layer from a licensed grade. HDR10 is always written as the base.');
  if (p.video.dynamic === 'HDR10PLUS') add('info', 'licensing', 'HDR10+ is royalty-free but needs adopter registration with HDR10+ Technologies.');
  if (dest?.needsAacs) {
    add('info', 'destination', `Pressed ${p.format === 'UHD' ? 'UHD' : 'Blu-ray'} discs carry ${p.format === 'UHD' ? 'AACS 2' : 'AACS'} — the replicator applies it and bills the title fee + per-disc royalty.`);
    add('info', 'destination', `Retail runs start at ${dest.minUnits} discs. Burned discs have no minimum.`);
    if (!p.packaging.upc) add('warn', 'destination', 'Retail release has no UPC barcode.', 'Add one from Label Desk.');
  } else if (p.format === 'UHD') add('info', 'destination', 'Burned UHD discs play on most 4K players but not all — check the tested-player list before selling.');
  add('info', 'licensing', 'Packaging and listings say "plays in Blu-ray players" — the Blu-ray Disc logo needs a BDA licence.');
  return out;
}

export const summarize = (issues: Issue[]) => ({
  errors: issues.filter(i => i.severity === 'error').length,
  warnings: issues.filter(i => i.severity === 'warn').length,
  ready: !issues.some(i => i.severity === 'error'),
});
