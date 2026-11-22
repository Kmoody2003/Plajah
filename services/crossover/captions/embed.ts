// Put captions INTO a video file, on this machine's ffmpeg (the desktop app's media engine).
//
// Targets, and what each is for:
//   • MOV + CEA-608 track ('c608'): the Apple/ProRes broadcast master convention. The SCC we write
//     becomes a closed-caption track that Resolve, Premiere, Compressor and playout servers read.
//   • MP4 + timed text ('tx3g' / mov_text): plays as selectable subtitles in QuickTime, iOS, most TVs.
//   • MKV + SRT / ASS / WebVTT: soft subtitles for archives and players.
//   • Burn-in (open captions): text rendered into the picture, for social video. Re-encodes the video.
// Video and audio are stream-copied (no generation loss) for every target except burn-in.
//
// buildEmbedArgs is pure and unit-tested; embedCaptionsNative runs it.

import type { CaptionFormat } from './model';

export type EmbedTarget = 'mov-608' | 'mp4-text' | 'mkv-srt' | 'mkv-ass' | 'mkv-vtt' | 'burn-in';

export interface EmbedTargetInfo { id: EmbedTarget; label: string; note: string; ext: string; sidecar: CaptionFormat; reencode: boolean }

export const EMBED_TARGETS: EmbedTargetInfo[] = [
  { id: 'mov-608', label: 'MOV · CEA-608 closed captions', note: 'Broadcast/ProRes master. Captions travel as a c608 track viewers can turn on.', ext: 'mov', sidecar: 'scc', reencode: false },
  { id: 'mp4-text', label: 'MP4 · timed-text subtitles', note: 'Selectable subtitles for QuickTime, iOS and smart TVs (tx3g).', ext: 'mp4', sidecar: 'srt', reencode: false },
  { id: 'mkv-srt', label: 'MKV · SRT', note: 'Soft subtitles for archives and desktop players.', ext: 'mkv', sidecar: 'srt', reencode: false },
  { id: 'mkv-ass', label: 'MKV · ASS (styled)', note: 'Keeps alignment and italics for players with libass.', ext: 'mkv', sidecar: 'ass', reencode: false },
  { id: 'mkv-vtt', label: 'MKV · WebVTT', note: 'WebVTT inside Matroska.', ext: 'mkv', sidecar: 'vtt', reencode: false },
  { id: 'burn-in', label: 'Burn-in · open captions', note: 'Rendered into the picture for social video. Re-encodes (H.264, CRF 18).', ext: 'mp4', sidecar: 'ass', reencode: true },
];

export const embedTarget = (id: EmbedTarget) => EMBED_TARGETS.find((t) => t.id === id)!;

/** ISO 639-1 → 639-2/B, the form container language tags use. */
const LANG3: Record<string, string> = { en: 'eng', es: 'spa', fr: 'fre', de: 'ger', it: 'ita', pt: 'por', ja: 'jpn', ko: 'kor', zh: 'chi', ar: 'ara', ru: 'rus', hi: 'hin', nl: 'dut', sv: 'swe', pl: 'pol', tr: 'tur', vi: 'vie', ht: 'hat', sw: 'swa', yo: 'yor' };
export const lang3 = (lang?: string) => {
  const two = (lang || 'en').toLowerCase().slice(0, 2);
  return LANG3[two] || (/^[a-z]{3}$/.test((lang || '').toLowerCase()) ? lang!.toLowerCase() : 'eng');
};

/** Escape a path for ffmpeg's filtergraph parser (subtitles=...). Windows drive colons need it most. */
export const filterPath = (p: string) => p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

export interface EmbedArgsInput {
  videoPath: string;
  captionPath: string;
  outputPath: string;
  target: EmbedTarget;
  /** BCP-47 / ISO 639 language of the captions. */
  lang?: string;
  /** Mark the caption track as default/forced-on (subtitles); 608 tracks are always viewer-selected. */
  defaultOn?: boolean;
  /** Burn-in encoder; libx264 unless a GPU encoder is given. */
  videoEncoder?: string;
}

export function buildEmbedArgs(i: EmbedArgsInput): string[] {
  const t = embedTarget(i.target);
  const lang = lang3(i.lang);
  if (t.reencode) {
    const venc = i.videoEncoder || 'libx264';
    return ['-y', '-i', i.videoPath,
      '-vf', `subtitles='${filterPath(i.captionPath)}'`,
      '-map', '0:v:0', '-map', '0:a?',
      '-c:v', venc, ...(venc === 'libx264' ? ['-crf', '18', '-preset', 'medium'] : ['-b:v', '12M']), '-pix_fmt', 'yuv420p',
      '-c:a', 'copy', '-movflags', '+faststart', i.outputPath];
  }
  const a = ['-y', '-i', i.videoPath, '-i', i.captionPath,
    '-map', '0:v', '-map', '0:a?', '-map', '1:0',
    '-c:v', 'copy', '-c:a', 'copy'];
  switch (i.target) {
    case 'mov-608': a.push('-c:s', 'copy'); break;          // scc demuxer → eia_608 → mov 'c608'
    case 'mp4-text': a.push('-c:s', 'mov_text', '-movflags', '+faststart'); break;
    case 'mkv-srt': a.push('-c:s', 'srt'); break;
    case 'mkv-ass': a.push('-c:s', 'ass'); break;
    case 'mkv-vtt': a.push('-c:s', 'webvtt'); break;
  }
  a.push('-metadata:s:s:0', `language=${lang}`);
  if (i.defaultOn && i.target !== 'mov-608') a.push('-disposition:s:0', 'default');
  a.push(i.outputPath);
  return a;
}

/** The output file name next to the source: name.captioned.ext */
export function embedOutputName(videoPath: string, target: EmbedTarget): string {
  const sep = videoPath.includes('\\') ? '\\' : '/';
  const dir = videoPath.slice(0, videoPath.lastIndexOf(sep) + 1);
  const stem = videoPath.slice(dir.length).replace(/\.[^.]+$/, '');
  return `${dir}${stem}.${target === 'burn-in' ? 'opencaptions' : 'captioned'}.${embedTarget(target).ext}`;
}
