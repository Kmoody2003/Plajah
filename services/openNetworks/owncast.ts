// Owncast bridge — a creator's self-hosted live server.
//
//   status (public):  GET  /api/status  → { online, viewerCount, streamTitle, lastConnectTime, lastDisconnectTime, versionNumber }
//   config (public):  GET  /api/config  → { name, summary, logo, ... }  (used for the server's display name)
//   chat (token):     POST /api/integrations/chat/send { body }  Authorization: Bearer <access token>
//                     The token is created in Owncast Admin → Integrations → Access Tokens with "send chat messages".
//   ingest (config):  rtmp://<host>:1935/live + the stream key set in Owncast Admin → Server Setup → Stream Keys.
//
// Plajah does not push video here (Livewire is paused); ingestConfig() just hands Stage/Go Live the values the creator
// typed so the existing RTMP output can be pointed at it. RTMP is plain rtmp:// by Owncast's design (no RTMPS ingest);
// the stream key is stored encrypted and only returned to its owner.
//
// API notes: there is no "whoami" for integration tokens, so connect() verifies the server via /api/status and the
// token is proven on first chat send (a 401 there means the token or its scope is wrong).

import { type NetDeps, OpenNetworkError, netFetch, clean, remoteError } from './common';

export interface OwncastStatus {
  online: boolean; viewerCount: number; streamTitle?: string; lastConnectTime?: string; lastDisconnectTime?: string;
  version?: string; name?: string; summary?: string; watchUrl: string;
}

export async function owncastStatus(deps: NetDeps, server: string, opts: { withConfig?: boolean } = {}): Promise<OwncastStatus> {
  const r = await netFetch(deps, `${server}/api/status`, { headers: { Accept: 'application/json' } });
  const j: any = r.json;
  if (!r.ok || !j || typeof j.online !== 'boolean') throw new OpenNetworkError(502, "That doesn't look like an Owncast server (no /api/status)", 'not-owncast');
  const out: OwncastStatus = {
    online: j.online,
    viewerCount: Math.max(0, Number(j.viewerCount) || 0),
    streamTitle: clean(j.streamTitle, 200) || undefined,
    lastConnectTime: typeof j.lastConnectTime === 'string' ? j.lastConnectTime : undefined,
    lastDisconnectTime: typeof j.lastDisconnectTime === 'string' ? j.lastDisconnectTime : undefined,
    version: clean(j.versionNumber, 40) || undefined,
    watchUrl: server,
  };
  if (opts.withConfig) {
    try {
      const c = await netFetch(deps, `${server}/api/config`, { headers: { Accept: 'application/json' } });
      const cj: any = c.json;
      if (c.ok && cj) { out.name = clean(cj.name, 120) || undefined; out.summary = clean(cj.summary, 500) || undefined; }
    } catch { /* optional */ }
  }
  return out;
}

export async function owncastSendChat(deps: NetDeps, server: string, accessToken: string, text: string): Promise<{ ok: true }> {
  const body = clean(text, 500);
  if (!body) throw new OpenNetworkError(400, 'Message is empty');
  if (!accessToken) throw new OpenNetworkError(400, 'Add an Owncast access token to post chat', 'no-token');
  const r = await netFetch(deps, `${server}/api/integrations/chat/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ body }),
  });
  if (r.status === 401 || r.status === 403) throw new OpenNetworkError(401, 'Owncast refused the token (check it has the "send chat messages" scope)', 'auth');
  if (!r.ok) throw new OpenNetworkError(502, remoteError(r, `Owncast answered HTTP ${r.status}`), 'remote');
  return { ok: true };
}

export interface IngestConfig { service: 'owncast'; rtmpUrl: string; streamKey: string; serverUrl: string; note: string }

/** RTMP target for Stage/Go Live. Host defaults to the web host; many setups put RTMP on a different name/port. */
export function owncastIngestConfig(server: string, streamKey: string, opts: { rtmpHost?: string; rtmpPort?: number } = {}): IngestConfig {
  if (!streamKey) throw new OpenNetworkError(400, 'No stream key saved for this server', 'no-key');
  const host = opts.rtmpHost || new URL(server).hostname;
  const port = opts.rtmpPort && opts.rtmpPort !== 1935 ? `:${opts.rtmpPort}` : '';
  return {
    service: 'owncast',
    rtmpUrl: `rtmp://${host}${port}/live`,
    streamKey,
    serverUrl: server,
    note: 'Owncast ingests plain RTMP. Paste these into Go Live → Custom RTMP; Plajah does not push to Owncast itself yet.',
  };
}

export function parseRtmpHost(raw: unknown): string | undefined {
  const s = clean(raw, 253).toLowerCase();
  if (!s) return undefined;
  if (!/^[a-z0-9.-]+$/.test(s) || !s.includes('.')) throw new OpenNetworkError(400, 'RTMP host should be a hostname like live.example.com', 'bad-host');
  return s;
}

export function parseRtmpPort(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new OpenNetworkError(400, 'Bad RTMP port', 'bad-port');
  return n;
}
