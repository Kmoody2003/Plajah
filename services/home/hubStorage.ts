/**
 * On-disk state for the Plajah Home hub (server side only).
 *
 * Everything lives OUTSIDE the repo, under the user profile, so pairing keys, the Matter fabric and
 * camera credentials never end up in git or in a deploy:
 *   %USERPROFILE%\.plajah-home\matter\     matter.js controller fabric + paired node storage
 *   %USERPROFILE%\.plajah-home\hue.json    Hue bridge app key
 *   %USERPROFILE%\.plajah-home\cameras.json camera sources (RTSP URLs with credentials)
 *   %USERPROFILE%\.plajah-home\hub.json    hub id + admin token
 * Override the root with PLAJAH_HOME_DIR.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

/** Resolved on every call so an embedding host (hubServer.startHub) can set PLAJAH_HOME_DIR late. */
export const plajahHomeDir = (): string => process.env.PLAJAH_HOME_DIR || path.join(os.homedir(), '.plajah-home');

export function hubPath(...parts: string[]): string {
  const p = path.join(plajahHomeDir(), ...parts);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  return p;
}

export function hubDir(...parts: string[]): string {
  const p = path.join(plajahHomeDir(), ...parts);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

export function readHubJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(hubPath(name), 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/** Atomic write (tmp + rename), owner-only permissions where the OS honours them. */
export function writeHubJson(name: string, value: unknown): void {
  const file = hubPath(name);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, file);
}

interface HubIdentity { id: string; adminToken: string; createdAt: string }

/** Stable hub id + an admin token for LAN clients that need admin actions (pairing, locks). */
export function hubIdentity(): HubIdentity {
  const cur = readHubJson<HubIdentity | null>('hub.json', null);
  if (cur?.id && cur?.adminToken) return cur;
  const next: HubIdentity = {
    id: crypto.randomBytes(6).toString('hex'),
    adminToken: crypto.randomBytes(24).toString('base64url'),
    createdAt: new Date().toISOString(),
  };
  writeHubJson('hub.json', next);
  return next;
}
