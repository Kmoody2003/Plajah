// Music download — what a buyer gets when they save a release they own.
// Mounted in server.ts:  app.use('/api/music', express.json({ limit: '4kb' }), createMusicDownloadRouter({ authMiddleware }))
//
// The artist's upload is the master and is never altered. Here we render it on demand into the format
// the buyer picks (MP3 320, MP3 V0, AAC, FLAC, WAV, or the untouched original), with title / artist /
// album / track number / genre and the cover art embedded, and hand back one zip for an album or a
// single file for a track. Entitlement is checked server-side against the licence the Stripe webhook
// mints, so this is also the gate for full-quality files.
//
// Endpoints
//   GET  /api/music/:albumId/formats     formats this release can be delivered in (lossless only if the master is)
//   POST /api/music/:albumId/download    { format, trackId? } → zip (album) or audio file (track)
import { Router } from 'express';
import { spawn } from 'node:child_process';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Zip, ZipPassThrough } from 'fflate';
import { fsGet } from '../services/firebaseAdminRest';

export interface MusicDownloadDeps { authMiddleware: any }

export type MusicFormat = 'mp3-320' | 'mp3-v0' | 'aac' | 'flac' | 'wav' | 'original';

interface FormatSpec { label: string; ext: string; lossless?: boolean; args: string[]; cover: boolean }
const FORMATS: Record<Exclude<MusicFormat, 'original'>, FormatSpec> = {
  'mp3-320': { label: 'MP3 320 kbps', ext: 'mp3', cover: true, args: ['-c:a', 'libmp3lame', '-b:a', '320k', '-id3v2_version', '3'] },
  'mp3-v0': { label: 'MP3 V0 (variable, ~245 kbps)', ext: 'mp3', cover: true, args: ['-c:a', 'libmp3lame', '-q:a', '0', '-id3v2_version', '3'] },
  aac: { label: 'AAC 256 kbps (M4A)', ext: 'm4a', cover: true, args: ['-c:a', 'aac', '-b:a', '256k'] },
  flac: { label: 'FLAC (lossless)', ext: 'flac', lossless: true, cover: true, args: ['-c:a', 'flac'] },
  wav: { label: 'WAV (lossless)', ext: 'wav', lossless: true, cover: false, args: ['-c:a', 'pcm_s16le'] },
};

const LOSSLESS_EXTS = new Set(['wav', 'wave', 'flac', 'aif', 'aiff', 'alac', 'ape', 'wv']);
const MAX_TRACK_BYTES = 400 * 1024 * 1024;
const MAX_JOBS = 2;
let activeJobs = 0;

const safeName = (s: string) => (String(s || 'Unknown').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80)) || 'Unknown';
const extOfUrl = (url: string) => {
  try { return (decodeURIComponent(new URL(url).pathname).split('.').pop() || '').toLowerCase(); } catch { return ''; }
};
/** The untouched upload when the track was auto-converted for the browser, otherwise the track's own URL. */
const masterUrl = (t: any): string => String(t?.originalUrl || t?.url || '');

/** Is this user entitled to the full-quality files? Owner, free release, or an active licence. */
async function entitled(uid: string, album: any, albumId: string, trackId?: string): Promise<boolean> {
  if (String(album?.ownerId || '') === uid) return true;
  const priced = (Number(album?.price) || 0) > 0 || (album.tracks || []).some((t: any) => (Number(t?.price) || 0) > 0);
  if (!priced) return true;
  const ids = [`album_${albumId}`, ...(trackId ? [`track_${albumId}__${trackId}`] : [])];
  for (const id of ids) {
    const lic = await fsGet(`users/${encodeURIComponent(uid)}/contentLicenses/${encodeURIComponent(id)}`);
    if (lic && (lic.expiresAt == null || Number(lic.expiresAt) > Date.now())) return true;
  }
  return false;
}

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ ok: boolean; err: string }> {
  return new Promise((resolve) => {
    let err = '';
    let p: ReturnType<typeof spawn>;
    try { p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] }); }
    catch (e: any) { return resolve({ ok: false, err: String(e?.message || e) }); }
    p.stderr?.on('data', d => { err += d.toString(); if (err.length > 4000) err = err.slice(-4000); });
    const killer = setTimeout(() => { try { p.kill('SIGKILL'); } catch { /* gone */ } }, timeoutMs);
    p.on('error', e => { clearTimeout(killer); resolve({ ok: false, err: String(e?.message || e) }); });
    p.on('close', code => { clearTimeout(killer); resolve({ ok: code === 0, err: code === 0 ? '' : err }); });
  });
}

async function fetchToFile(url: string, file: string, maxBytes: number): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const len = Number(res.headers.get('content-length') || 0);
    if (len > maxBytes) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100 || buf.length > maxBytes) return false;
    await fsp.writeFile(file, buf);
    return true;
  } catch { return false; }
}

const tmpName = (ext: string) => path.join(os.tmpdir(), `md_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`);

interface RenderCtx { album: any; tracks: any[]; cover: string | null; format: MusicFormat }

/** Render one track to a temp file in the requested format. Returns the file path and its download name. */
async function renderTrack(ctx: RenderCtx, t: any, index: number, cleanup: string[]): Promise<{ file: string; name: string } | null> {
  const src = masterUrl(t);
  if (!/^https?:\/\//.test(src)) return null;
  const srcExt = extOfUrl(src) || 'mp3';
  const no = Number(t.trackNo) || index + 1;
  const base = `${String(no).padStart(2, '0')} ${safeName(t.title)}`;
  const input = tmpName(srcExt); cleanup.push(input);
  if (!(await fetchToFile(src, input, MAX_TRACK_BYTES))) return null;

  if (ctx.format === 'original') return { file: input, name: `${base}.${srcExt}` };

  const spec = FORMATS[ctx.format];
  const out = tmpName(spec.ext); cleanup.push(out);
  const useCover = !!ctx.cover && spec.cover;
  const meta = [
    ['title', t.title], ['artist', t.artist || ctx.album.artist], ['album_artist', ctx.album.artist],
    ['album', ctx.album.title], ['track', `${no}/${ctx.tracks.length}`], ['genre', t.genre || ctx.album.genre],
  ].filter(([, v]) => v).flatMap(([k, v]) => ['-metadata', `${k}=${String(v).slice(0, 200)}`]);
  const args = [
    '-y', '-v', 'error', '-i', input,
    ...(useCover ? ['-i', ctx.cover!, '-map', '0:a:0', '-map', '1:v:0', '-c:v', 'mjpeg', '-disposition:v:0', 'attached_pic', '-metadata:s:v', 'title=Album cover'] : ['-map', '0:a:0', '-vn']),
    ...spec.args, '-map_metadata', '-1', ...meta, out,
  ];
  const r = await run('ffmpeg', args, 180_000);
  if (!r.ok) { console.error('[music-download] ffmpeg failed:', r.err.slice(-300)); return null; }
  return { file: out, name: `${base}.${spec.ext}` };
}

export function createMusicDownloadRouter(deps: MusicDownloadDeps): Router {
  const r = Router();

  const load = async (albumId: string) => {
    const album = await fsGet(`albums/${encodeURIComponent(albumId)}`);
    return album && Array.isArray(album.tracks) && album.tracks.length ? album : null;
  };

  r.get('/:albumId/formats', deps.authMiddleware, async (req: any, res) => {
    const album = await load(String(req.params.albumId || ''));
    if (!album) return res.status(404).json({ error: 'Release not found' });
    const trackId = typeof req.query.trackId === 'string' ? req.query.trackId : undefined;
    const tracks = trackId ? album.tracks.filter((t: any) => t.id === trackId) : album.tracks;
    const lossless = tracks.length > 0 && tracks.every((t: any) => LOSSLESS_EXTS.has(extOfUrl(masterUrl(t))));
    const formats = (Object.keys(FORMATS) as Array<keyof typeof FORMATS>)
      .filter(k => !FORMATS[k].lossless || lossless)
      .map(k => ({ id: k, label: FORMATS[k].label }));
    formats.push({ id: 'original' as any, label: 'Original file from the artist' });
    res.json({ formats, lossless, default: lossless ? 'flac' : 'mp3-320' });
  });

  r.post('/:albumId/download', deps.authMiddleware, async (req: any, res) => {
    const albumId = String(req.params.albumId || '');
    const trackId = typeof req.body?.trackId === 'string' ? req.body.trackId : undefined;
    const format = String(req.body?.format || 'mp3-320') as MusicFormat;
    if (format !== 'original' && !FORMATS[format as keyof typeof FORMATS]) return res.status(400).json({ error: 'Unknown format' });
    const album = await load(albumId);
    if (!album) return res.status(404).json({ error: 'Release not found' });
    if (!(await entitled(req.uid, album, albumId, trackId))) return res.status(403).json({ error: 'Buy this release to download it' });

    const tracks = (trackId ? album.tracks.filter((t: any) => t.id === trackId) : album.tracks)
      .slice().sort((a: any, b: any) => (Number(a.trackNo) || 0) - (Number(b.trackNo) || 0));
    if (!tracks.length) return res.status(404).json({ error: 'Track not found' });
    if (format !== 'original' && FORMATS[format as keyof typeof FORMATS].lossless
      && !tracks.every((t: any) => LOSSLESS_EXTS.has(extOfUrl(masterUrl(t))))) {
      return res.status(400).json({ error: 'This release was not uploaded in a lossless format' });
    }
    if (activeJobs >= MAX_JOBS) { res.setHeader('Retry-After', '15'); return res.status(503).json({ error: 'Busy preparing other downloads — try again in a moment' }); }

    activeJobs++;
    const cleanup: string[] = [];
    try {
      let cover: string | null = null;
      const coverUrl = album.coverOriginal || album.coverImage;
      if (/^https?:\/\//.test(String(coverUrl || ''))) {
        const c = tmpName('img'); cleanup.push(c);
        if (await fetchToFile(coverUrl, c, 15 * 1024 * 1024)) cover = c;
      }
      const ctx: RenderCtx = { album, tracks, cover, format };
      const stem = `${safeName(album.artist)} - ${safeName(album.title)}`;
      const sendFile = (name: string) => `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(name)}`;
      res.setHeader('Cache-Control', 'private, no-store');

      if (tracks.length === 1) {
        const one = await renderTrack(ctx, tracks[0], 0, cleanup);
        if (!one) return res.status(502).json({ error: 'Could not prepare that track' });
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', sendFile(one.name));
        await new Promise<void>(done => res.sendFile(one.file, () => done()));   // keep the temp file until it has been sent
        return;
      }

      // Album: stream a zip, one track at a time, so memory stays flat however large the release is.
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', sendFile(`${stem}.zip`));
      const zip = new Zip((err, chunk, final) => {
        if (err) { res.destroy(err); return; }
        res.write(Buffer.from(chunk));
        if (final) res.end();
      });
      const add = async (name: string, file: string) => {
        const entry = new ZipPassThrough(`${stem}/${name}`);   // audio is already compressed
        zip.add(entry);
        const fh = await fsp.open(file, 'r');
        try {
          const buf = Buffer.allocUnsafe(1 << 20);
          for (;;) {
            const { bytesRead } = await fh.read(buf, 0, buf.length, null);
            if (!bytesRead) break;
            entry.push(new Uint8Array(buf.subarray(0, bytesRead)), false);
            if (res.writableNeedDrain) await new Promise(ok => res.once('drain', ok));
          }
          entry.push(new Uint8Array(0), true);
        } finally { await fh.close(); }
      };
      const missing: string[] = [];
      for (let i = 0; i < tracks.length; i++) {
        if (res.destroyed) break;
        const out = await renderTrack(ctx, tracks[i], i, cleanup);
        if (out) await add(out.name, out.file); else missing.push(String(tracks[i].title || `Track ${i + 1}`));
      }
      if (cover) await add(`cover.${extOfUrl(String(coverUrl)) === 'png' ? 'png' : 'jpg'}`, cover);
      if (missing.length) {
        const note = new ZipPassThrough(`${stem}/MISSING TRACKS.txt`);
        zip.add(note);
        note.push(new Uint8Array(Buffer.from(`These tracks could not be prepared. Try again from your library:\n${missing.join('\n')}\n`)), true);
      }
      zip.end();
      if (!res.writableFinished && !res.destroyed) await new Promise<void>(done => { res.once('close', () => done()); });
    } catch (e: any) {
      console.error('[music-download]', e?.message || e);
      if (!res.headersSent) res.status(500).json({ error: 'Download failed' }); else res.destroy();
    } finally {
      activeJobs--;
      await Promise.all(cleanup.map(f => fsp.unlink(f).catch(() => {})));
    }
  });

  return r;
}
