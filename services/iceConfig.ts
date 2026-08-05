// iceConfig.ts — the ICE/TURN servers every real-time feature uses. STUN alone fails across
// symmetric NATs / strict firewalls (~10-20% of connections); a TURN relay makes WebRTC reliable.
// Configure your own TURN for production via build env (VITE_TURN_URLS comma-separated +
// VITE_TURN_USERNAME + VITE_TURN_CREDENTIAL); otherwise a best-effort public relay is used.

let cached: RTCIceServer[] | null = null;

export function getIceServers(): RTCIceServer[] {
  if (cached) return cached;
  const env: any = (import.meta as any).env || {};
  const servers: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
  ];

  const turnUrls = String(env.VITE_TURN_URLS || '').split(',').map((s: string) => s.trim()).filter(Boolean);
  if (turnUrls.length && env.VITE_TURN_USERNAME) {
    servers.push({ urls: turnUrls, username: String(env.VITE_TURN_USERNAME), credential: String(env.VITE_TURN_CREDENTIAL || '') });
  } else {
    // Best-effort public TURN fallback (rate-limited). Set VITE_TURN_* to a dedicated provider
    // (Twilio / Cloudflare / coturn) for production-grade reliability.
    servers.push(
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    );
  }

  cached = servers;
  return servers;
}
