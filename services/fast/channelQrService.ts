import QRCode from 'qrcode';
import { shareOrigin } from '../deepLinkService';

export interface ChannelQrTarget {
  number?: string | number;
  id?: string;
  ownerId?: string;
  scheduleOwner?: string;
  plajahId?: string;
  name?: string;
}

// In-memory cache of persistent QR code data URLs: key -> dataUrl
const QR_DATA_URL_CACHE = new Map<string, string>();

/**
 * Builds the canonical, persistent share URL for a channel.
 * Carries the direct channel number ('channel' and 'n') so any scanning device
 * immediately tunes to that exact station, along with stable source and owner IDs.
 */
export function buildChannelQrUrl(target: ChannelQrTarget): string {
  const base = shareOrigin();
  const num = target.number != null ? String(target.number).trim() : '';
  const owner = target.scheduleOwner || target.ownerId;
  const plajahId = target.plajahId;
  const source = target.id || '';

  const id = plajahId ? `plajah:${plajahId}` : owner ? `owner:${owner}` : source ? `source:${source}` : (num ? `channel:${num}` : 'live');

  const u = new URLSearchParams();
  u.set('type', 'channel');
  if (num) {
    u.set('channel', num);
    u.set('n', num);
  }
  if (id) u.set('id', id);
  if (source) u.set('source', source);
  if (owner) u.set('owner', owner);
  if (target.name) u.set('name', target.name);

  return `${base}/share?${u.toString()}`;
}

/**
 * Synchronous cache lookup for an already generated QR code data URL.
 */
export function getChannelQrDataUrlSync(shareUrl: string): string | null {
  if (!shareUrl) return null;
  return QR_DATA_URL_CACHE.get(shareUrl) || null;
}

/**
 * Generates a high-contrast QR code data URL for a channel URL and caches it persistently.
 */
export async function generateChannelQrDataUrl(shareUrl: string): Promise<string> {
  if (!shareUrl) return '';
  const existing = QR_DATA_URL_CACHE.get(shareUrl);
  if (existing) return existing;

  try {
    const dataUrl = await QRCode.toDataURL(shareUrl, {
      margin: 1,
      width: 200,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    });
    QR_DATA_URL_CACHE.set(shareUrl, dataUrl);
    return dataUrl;
  } catch (err) {
    console.warn('[channelQrService] QR generation failed:', err);
    return '';
  }
}

/**
 * Pre-generates and caches QR codes for a list of channels in the background.
 * Ensures zero-flicker instant display when flipping through stations on the dial.
 */
export function preloadChannelQrs(channels: readonly ChannelQrTarget[]): void {
  if (!channels || channels.length === 0) return;
  for (const ch of channels) {
    try {
      const url = buildChannelQrUrl(ch);
      if (url && !QR_DATA_URL_CACHE.has(url)) {
        generateChannelQrDataUrl(url).catch(() => {});
      }
    } catch {}
  }
}
