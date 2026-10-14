import QRCode from 'qrcode';

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
 * Canonical public base origin for external devices scanning QR codes.
 * Mobile phones scanning screen QR codes must always hit the public host.
 */
export function getChannelQrBase(): string {
  const configured = (import.meta as any).env?.VITE_APP_URL as string | undefined;
  if (configured && /^https?:\/\//.test(configured)) {
    return configured.replace(/\/$/, '');
  }
  return 'https://plajah.com';
}

/**
 * Builds a compact, ultra-scannable QR URL for a channel.
 * Uses a minimal query string (?channel=X&source=Y) to keep the QR code at
 * Version 1/2 density (huge, chunky blocks) so smartphone cameras can scan
 * it in milliseconds from several feet away.
 */
export function buildChannelQrUrl(target: ChannelQrTarget): string {
  const base = getChannelQrBase();
  const rawNum = target.number != null ? String(target.number).trim() : '';
  const num = rawNum && rawNum !== '—' && rawNum !== '-' ? rawNum : '';
  const owner = target.scheduleOwner || target.ownerId || '';
  const plajahId = target.plajahId || '';
  const source = target.id || '';

  const u = new URLSearchParams();
  if (num) {
    u.set('channel', num);
  }
  if (owner) {
    u.set('owner', owner);
  }
  if (source && !source.startsWith('plajah_')) {
    u.set('source', source);
  }
  if (plajahId) {
    u.set('plajahId', plajahId);
  }

  const query = u.toString();
  return query ? `${base}/?${query}` : `${base}/`;
}

/**
 * Synchronous cache lookup for an already generated QR code data URL.
 */
export function getChannelQrDataUrlSync(shareUrl: string): string | null {
  if (!shareUrl) return null;
  return QR_DATA_URL_CACHE.get(shareUrl) || null;
}

/**
 * Generates a high-contrast QR code data URL with an intact quiet zone
 * and high resolution for reliable camera scanning.
 */
export async function generateChannelQrDataUrl(shareUrl: string): Promise<string> {
  if (!shareUrl) return '';
  const existing = QR_DATA_URL_CACHE.get(shareUrl);
  if (existing) return existing;

  try {
    const dataUrl = await QRCode.toDataURL(shareUrl, {
      margin: 2, // Standard quiet zone so finder patterns are never crowded
      width: 280, // High resolution canvas output
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
