// ─── Bluesky media preparation (SERVER-ONLY) ──────────────────────────────────
// Kept out of bluesky.ts on purpose: the browser bundle imports the adapter's types, and this file pulls in
// `sharp` + remote fetches. bluesky.ts loads it lazily, only inside createPost, which only ever runs server-side.
//
// Bluesky rejects image blobs over 1,000,000 bytes, and does not render animated GIFs as images — so every image is
// fetched, EXIF-rotated, bounded to 2000px and re-encoded until it fits, then handed to uploadBlob with its
// aspect ratio so clients can lay it out before it loads.

const MAX_BLOB = 950_000;            // headroom under the 1,000,000-byte lexicon limit
const MAX_SOURCE_BYTES = 25_000_000; // refuse absurd downloads outright

export interface PreparedImage { bytes: Uint8Array; mime: string; width?: number; height?: number }

/** https only, no IP literals / localhost / internal names — media URLs come from user-controlled posts. */
export function assertPublicHttps(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error('Invalid media URL'); }
  if (u.protocol !== 'https:') throw new Error('Media must be served over https');
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':') || h.startsWith('[')) {
    throw new Error('Media URL host is not allowed');
  }
  return u;
}

async function download(url: string): Promise<{ buf: Buffer; mime: string }> {
  assertPublicHttps(url);
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: 'follow' });
  if (!res.ok) throw new Error(`Could not download image (${res.status})`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_SOURCE_BYTES) throw new Error('Image is too large to process');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_SOURCE_BYTES) throw new Error('Image is too large to process');
  return { buf, mime: (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim() };
}

export async function prepareImage(url: string): Promise<PreparedImage> {
  const { buf, mime } = await download(url);
  if (!/^image\//.test(mime)) throw new Error('That URL is not an image');

  let sharp: any = null;
  try { sharp = (await import(/* @vite-ignore */ 'sharp')).default; } catch { /* not installed */ }
  if (!sharp) {
    if (buf.length > MAX_BLOB) throw new Error('Image is over Bluesky\'s 1MB limit (image resizing is unavailable on this server)');
    return { bytes: new Uint8Array(buf), mime };
  }

  // Walk quality (then dimensions) down until the blob fits.
  for (const [max, quality] of [[2000, 86], [2000, 74], [1600, 70], [1400, 62], [1100, 55], [900, 48]] as const) {
    const { data, info } = await sharp(buf, { failOn: 'none' })
      .rotate()
      .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    if (data.length <= MAX_BLOB) return { bytes: new Uint8Array(data), mime: 'image/jpeg', width: info.width, height: info.height };
  }
  throw new Error('Could not shrink the image under Bluesky\'s 1MB limit');
}
