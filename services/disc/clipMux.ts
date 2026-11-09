// Mux one clip (a title or a menu) from ffmpeg's per-stream transport streams plus our own PG/IG
// streams, then write its clip info. I/O is injected so the same code runs on the desktop
// (local-media fetch + native append) and in Node tests (fs).
import { writeClpi, type ClipStreamInfo } from './clpi';
import { fromIg, fromSup, mux, type MuxResult, type MuxStream, type MuxUnit, STREAM_PID, CLIP_PTS_BASE_90K } from './m2ts';
import { TsDemuxer, type AccessUnit } from './ts';
import { AUDIO_CODING, VIDEO_CODING } from './bdmv';
import type { AudioCodec, DiscFormat, Dynamic, VideoCodec } from './spec';

export interface ClipIO {
  /** Stream a file's bytes in chunks. */
  read(path: string): AsyncIterable<Uint8Array>;
  /** Start a new output file and return an appender. */
  create(path: string): Promise<(b: Uint8Array) => Promise<void>>;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
}

export interface ClipIn {
  format: DiscFormat; muxRateBps: number;
  video: { path: string; codec: VideoCodec; h: number; scan: 'p' | 'i'; fps: number; dynamic?: Dynamic };
  audio: { path: string; codec: AudioCodec; channels: number; lang: string }[];
  pg: { sup: Uint8Array; lang: string }[];
  ig?: { stream: Uint8Array; lang: string };
  m2tsPath: string; clpiPath: string; clpiBackupPath?: string;
}

/** Async units from a single-stream ffmpeg TS. */
export async function* unitsFromTs(chunks: AsyncIterable<Uint8Array>): AsyncGenerator<AccessUnit> {
  const q: AccessUnit[] = [];
  const d = new TsDemuxer(u => q.push(u));
  for await (const c of chunks) { d.push(c); while (q.length) yield q.shift()!; }
  d.end(); while (q.length) yield q.shift()!;
}

async function* asMux(src: AsyncGenerator<AccessUnit>, first?: AccessUnit): AsyncGenerator<MuxUnit> {
  if (first) yield { pts: first.pts, dts: first.dts, data: first.data, key: first.key };
  for await (const u of src) yield { pts: u.pts, dts: u.dts, data: u.data, key: u.key };
}

export async function muxClip(c: ClipIn, io: ClipIO): Promise<MuxResult> {
  // Peek the video's first unit: its PTS becomes the clip's presentation start.
  const vsrc = unitsFromTs(io.read(c.video.path));
  const first = (await vsrc.next()).value as AccessUnit | undefined;
  if (!first) throw new Error(`No video in ${c.video.path}`);
  const offset = CLIP_PTS_BASE_90K - first.pts;
  const fps = c.video.fps;
  const streams: MuxStream[] = [{ pid: STREAM_PID.VIDEO, kind: 'video', streamType: VIDEO_CODING[c.video.codec], units: asMux(vsrc, first) }];
  c.audio.forEach((a, i) => streams.push({ pid: STREAM_PID.AUDIO0 + i, kind: 'audio', streamType: AUDIO_CODING[a.codec], units: asMux(unitsFromTs(io.read(a.path))), lang: a.lang }));
  // PG/IG are authored on the clip's own timeline (0 = first frame): shift them into the source's base.
  c.pg.forEach((g, i) => streams.push({ pid: STREAM_PID.PG0 + i, kind: 'pg', streamType: 0x90, lang: g.lang, units: [...fromSup(g.sup)].map(u => ({ ...u, pts: u.pts + first.pts, dts: u.dts + first.pts })) }));
  if (c.ig) streams.push({ pid: STREAM_PID.IG0, kind: 'ig', streamType: 0x91, lang: c.ig.lang, units: [...fromIg(c.ig.stream, first.pts)] });

  const append = await io.create(c.m2tsPath);
  const res = await mux(streams, { muxRateBps: c.muxRateBps, write: append, timeOffset90k: offset, frameDuration90k: Math.round(90000 / fps) });
  const info: ClipStreamInfo[] = [
    { pid: STREAM_PID.VIDEO, kind: 'video', video: { codec: c.video.codec, h: c.video.h, scan: c.video.scan, fps, dynamic: c.video.dynamic } },
    ...c.audio.map((a, i) => ({ pid: STREAM_PID.AUDIO0 + i, kind: 'audio' as const, audio: a })),
    ...c.pg.map((g, i) => ({ pid: STREAM_PID.PG0 + i, kind: 'pg' as const, lang: g.lang })),
    ...(c.ig ? [{ pid: STREAM_PID.IG0, kind: 'ig' as const, lang: c.ig.lang }] : []),
  ];
  const clpi = writeClpi({ format: c.format, mux: res, streams: info });
  await io.writeFile(c.clpiPath, clpi);
  if (c.clpiBackupPath) await io.writeFile(c.clpiBackupPath, clpi);
  return res;
}
