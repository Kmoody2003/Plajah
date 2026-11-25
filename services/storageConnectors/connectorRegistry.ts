// services/storageConnectors/connectorRegistry.ts — Connected Storage Locations registry & protocol router.
// Security rule: NEVER persist plaintext credentials in browser localStorage.
// Passwords live in volatile session memory on web, Windows Credential Manager (PasswordVault) on WinUI,
// and Android Keystore / EncryptedPrefs on Android APK.

import { parseFileZilla, type ConnectorProtocol, type ImportedSite, type PasswordState } from './filezilla';
import type { ConnectedLocationMeta, UnifiedEntry } from '../files/unifiedVfs';
import { classifyMediaKind, guessMimeType } from '../files/unifiedVfs';

const STORAGE_KEY = 'plajah_connected_locations_v1';
const sessionSecrets = new Map<string, string>();

export function normalizeConnectorProtocol(
  protocol: ConnectorProtocol | ConnectedLocationMeta['protocol'] | string,
): ConnectedLocationMeta['protocol'] | null {
  switch ((protocol || '').toLowerCase()) {
    case 'ftp':
    case 'ftp-insecure':
      return 'ftp';
    case 'ftps':
      return 'ftps';
    case 'ftpes':
      return 'ftpes';
    case 'sftp':
      return 'sftp';
    case 'webdav':
      return 'webdav';
    case 'webdavs':
      return 'webdavs';
    case 'smb':
      return 'smb';
    default:
      return null;
  }
}

export function sanitizeConnectorHost(raw: string): string {
  return (raw || '')
    .trim()
    .replace(/^(?:ftpes|ftps|ftp|sftp|webdavs|webdav|https?):\/\//i, '')
    .replace(/^\\\\+/, '')
    .replace(/\/+$/, '');
}

export interface FileZillaSiteCandidate {
  name: string;
  folder: string[];
  protocol: ConnectedLocationMeta['protocol'];
  host: string;
  port: number;
  user: string;
  account?: string;
  remoteDir: string;
  passive: boolean;
  passwordState: PasswordState;
  password?: string;
  logon: ImportedSite['logon'];
  comments?: string;
}

export function parseFileZillaCandidates(xml: string): {
  candidates: FileZillaSiteCandidate[];
  skipped: number;
  unsupported: string[];
  source: 'sitemanager' | 'recentservers' | 'unknown';
} {
  const result = parseFileZilla(xml);
  const candidates: FileZillaSiteCandidate[] = [];
  const unsupported: string[] = [];
  let skipped = result.skipped;

  for (const site of result.sites) {
    const protocol = normalizeConnectorProtocol(site.protocol);
    if (!protocol) {
      skipped++;
      unsupported.push(site.unsupported || site.protocol.toUpperCase());
      continue;
    }
    const host = sanitizeConnectorHost(site.host);
    if (!host) {
      skipped++;
      continue;
    }
    candidates.push({
      name: site.name || host,
      folder: site.folder,
      protocol,
      host,
      port: site.port,
      user: site.user,
      ...(site.account ? { account: site.account } : {}),
      remoteDir: site.remoteDir || '/',
      passive: site.passive ?? true,
      passwordState: site.passwordState,
      password: site.password,
      logon: site.logon,
      comments: site.comments,
    });
  }

  return { candidates, skipped, unsupported, source: result.source };
}

export interface ConnectorSecretBridge {
  saveSecret?: (id: string, user: string, secret: string) => Promise<void>;
  getSecret?: (id: string) => Promise<string | null>;
  deleteSecret?: (id: string) => Promise<void>;
}

let activeSecretBridge: ConnectorSecretBridge = {};

export function registerConnectorSecretBridge(bridge: ConnectorSecretBridge): void {
  activeSecretBridge = bridge;
}

export function loadSavedConnectors(): ConnectedLocationMeta[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: any) => {
      const normalized = normalizeConnectorProtocol(item?.protocol);
      return normalized && normalized !== item?.protocol
        ? { ...item, protocol: normalized }
        : item;
    });
  } catch {
    return [];
  }
}

function saveConnectorList(list: ConnectedLocationMeta[]): void {
  if (typeof window === 'undefined') return;
  try {
    // Strip any accidental password field defensively before persisting.
    const clean = list.map(({ ...m }: any) => {
      delete m.pass;
      delete m.password;
      delete m.secret;
      return m as ConnectedLocationMeta;
    });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Storage quota full or disabled
  }
}

export async function upsertConnectedLocation(
  input: Omit<ConnectedLocationMeta, 'id' | 'hasSecret'> & {
    id?: string;
    secret?: string;
    clearSecret?: boolean;
  },
): Promise<ConnectedLocationMeta> {
  const id = input.id || `loc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const secret = typeof input.secret === 'string' && input.secret.length > 0 ? input.secret : undefined;
  const protocol = normalizeConnectorProtocol(input.protocol) || 'ftp';
  const host = sanitizeConnectorHost(input.host);

  if (input.clearSecret) {
    sessionSecrets.delete(id);
    if (activeSecretBridge.deleteSecret) {
      await activeSecretBridge.deleteSecret(id).catch(() => {});
    }
  } else if (secret) {
    sessionSecrets.set(id, secret);
    if (activeSecretBridge.saveSecret) {
      await activeSecretBridge.saveSecret(id, input.user || 'anonymous', secret).catch(() => {});
    }
  }

  const list = loadSavedConnectors();
  const existing = list.find(l => l.id === id);
  const account = typeof input.account === 'string' && input.account.trim().length > 0 ? input.account.trim() : undefined;
  const meta: ConnectedLocationMeta = {
    id,
    name: input.name || host,
    protocol,
    host,
    port: input.port,
    user: input.user,
    ...(account ? { account } : {}),
    remoteDir: input.remoteDir || '/',
    passive: input.passive ?? true,
    source: input.source,
    hasSecret: input.clearSecret ? false : Boolean(secret || existing?.hasSecret),
    lastConnectedAt: input.lastConnectedAt ?? existing?.lastConnectedAt,
  };

  const next = existing ? list.map(l => (l.id === id ? meta : l)) : [meta, ...list];
  saveConnectorList(next);
  return meta;
}

export async function removeConnectedLocation(id: string): Promise<ConnectedLocationMeta[]> {
  sessionSecrets.delete(id);
  if (activeSecretBridge.deleteSecret) {
    await activeSecretBridge.deleteSecret(id).catch(() => {});
  }
  const next = loadSavedConnectors().filter(l => l.id !== id);
  saveConnectorList(next);
  return next;
}

export async function resolveConnectorSecret(id: string): Promise<string | null> {
  const mem = sessionSecrets.get(id);
  if (mem !== undefined) return mem;
  if (activeSecretBridge.getSecret) {
    const native = await activeSecretBridge.getSecret(id).catch(() => null);
    if (native) {
      sessionSecrets.set(id, native);
      return native;
    }
  }
  return null;
}

export function cacheSessionSecret(id: string, secret: string): void {
  if (secret) sessionSecrets.set(id, secret);
}

export async function importFileZillaSites(xml: string): Promise<{
  imported: ConnectedLocationMeta[];
  skipped: number;
  hadStoredPasswords: boolean;
  unsupported: string[];
}> {
  const parsed = parseFileZillaCandidates(xml);
  const existing = loadSavedConnectors();
  const imported: ConnectedLocationMeta[] = [];

  for (const site of parsed.candidates) {
    const dup = existing.find(
      e =>
        e.host === site.host &&
        e.port === site.port &&
        e.user === site.user &&
        (e.account || '') === (site.account || '') &&
        e.protocol === site.protocol,
    );
    const meta = await upsertConnectedLocation({
      id: dup?.id,
      name: site.name,
      protocol: site.protocol,
      host: site.host,
      port: site.port,
      user: site.user,
      account: site.account,
      remoteDir: site.remoteDir || '/',
      passive: site.passive,
      source: 'filezilla',
      secret: site.password,
    });
    imported.push(meta);
  }

  return {
    imported,
    skipped: parsed.skipped,
    hadStoredPasswords: parsed.candidates.some(s => Boolean(s.password)),
    unsupported: parsed.unsupported,
  };
}

// ── Browser WebDAV Client (HTTPS WebDAV with CORS) ────────────────────────────────────────────────
function buildWebDavUrl(loc: ConnectedLocationMeta, remotePath: string): string {
  const scheme = loc.protocol === 'webdav' ? 'http' : 'https';
  const defaultPort = scheme === 'http' ? 80 : 443;
  const hostPort = loc.port && loc.port !== defaultPort ? `${loc.host}:${loc.port}` : loc.host;
  const clean = ('/' + (remotePath || loc.remoteDir || '/')).replace(/\/+/g, '/');
  return `${scheme}://${hostPort}${clean}`;
}

export async function listWebDavBrowser(
  loc: ConnectedLocationMeta,
  remotePath: string,
  secret?: string | null,
): Promise<UnifiedEntry[]> {
  const url = buildWebDavUrl(loc, remotePath);
  const headers: Record<string, string> = { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' };
  if (loc.user || secret) {
    headers.Authorization = `Basic ${btoa(`${loc.user || ''}:${secret || ''}`)}`;
  }
  const res = await fetch(url, {
    method: 'PROPFIND',
    headers,
    body: '<?xml version="1.0" encoding="utf-8"?><D:propfind xmlns:D="DAV:"><D:allprop/></D:propfind>',
  });
  if (!res.ok) throw new Error(`WebDAV PROPFIND failed (${res.status})`);
  const xml = await res.text();
  return parseWebDavPropfind(xml, url, remotePath);
}

export function parseWebDavPropfind(xml: string, requestUrl: string, currentPath: string): UnifiedEntry[] {
  if (typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const responses = Array.from(doc.getElementsByTagNameNS('*', 'response'));
  const normCur = ('/' + (currentPath || '/')).replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  const out: UnifiedEntry[] = [];
  let reqPath = '/';
  try {
    reqPath = new URL(requestUrl).pathname.replace(/\/$/, '') || '/';
  } catch { /* ignore */ }

  for (const r of responses) {
    const hrefEl = r.getElementsByTagNameNS('*', 'href')[0];
    const rawHref = hrefEl?.textContent?.trim() || '';
    if (!rawHref) continue;
    let hrefPath = rawHref;
    try {
      hrefPath = rawHref.startsWith('http') ? new URL(rawHref).pathname : rawHref;
    } catch { /* ignore */ }
    const cleanHref = decodeURIComponent(hrefPath).replace(/\/$/, '') || '/';
    if (cleanHref === reqPath || cleanHref === normCur) continue;

    const name = cleanHref.split('/').filter(Boolean).pop() || cleanHref;
    const isDir = r.getElementsByTagNameNS('*', 'collection').length > 0;
    const lenEl = r.getElementsByTagNameNS('*', 'getcontentlength')[0];
    const modEl = r.getElementsByTagNameNS('*', 'getlastmodified')[0];
    const ctEl = r.getElementsByTagNameNS('*', 'getcontenttype')[0];

    const size = Number(lenEl?.textContent || 0) || 0;
    const lastModified = modEl?.textContent ? Date.parse(modEl.textContent) || 0 : 0;
    const mimeType = ctEl?.textContent?.trim() || (isDir ? 'inode/directory' : guessMimeType(name));

    out.push({
      id: `dav:${cleanHref}`,
      name,
      path: cleanHref,
      parentPath: normCur,
      kind: 'connector',
      isDirectory: isDir,
      size,
      lastModified,
      mimeType,
      extension: isDir ? '' : (name.includes('.') ? name.split('.').pop()?.toLowerCase() : ''),
      mediaKind: isDir ? 'OTHER' : classifyMediaKind(name, mimeType),
      downloadUrl: isDir ? undefined : rawHref,
      streamUrl: isDir ? undefined : rawHref,
    });
  }
  return out;
}
