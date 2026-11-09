// services/storageConnectors/filezilla.ts — read FileZilla's saved sites so people can log in to their
// servers from Content HQ's FTP client without retyping anything. Pure; runs in the browser or the
// desktop app on the file the person picks (Site Manager → Export, or %APPDATA%\FileZilla\sitemanager.xml,
// ~/.config/filezilla/sitemanager.xml, recentservers.xml).
//
// Passwords: FileZilla stores them base64 (readable), encrypted with a master password ("crypt"; we
// can't read those — the person types it once on first connect), or not at all. A readable password is
// handed straight to the caller to put in the device keychain; it must never be uploaded or logged.

export type ConnectorProtocol = 'ftp' | 'ftps' | 'ftpes' | 'sftp' | 'ftp-insecure' | 's3' | 'webdav' | 'webdavs' | 'http' | 'https' | 'unknown';
export type LogonType = 'anonymous' | 'normal' | 'ask' | 'interactive' | 'account' | 'keyfile' | 'unknown';
export type PasswordState = 'readable' | 'master_password' | 'not_saved';

export interface ImportedSite {
  /** Folder path in the Site Manager, e.g. ["Clients", "Grace Chapel"]. */
  folder: string[];
  name: string;
  protocol: ConnectorProtocol;
  host: string;
  port: number;
  user: string;
  logon: LogonType;
  passwordState: PasswordState;
  /** Only when passwordState === 'readable'. Goes to the keychain, nowhere else. */
  password?: string;
  keyFile?: string;
  account?: string;
  remoteDir?: string;
  localDir?: string;
  comments?: string;
  /** Not something we can connect to yet (HTTP, Storj…) — listed so the person sees nothing was dropped. */
  unsupported?: string;
}

export interface FileZillaImport { sites: ImportedSite[]; skipped: number; source: 'sitemanager' | 'recentservers' | 'unknown' }

// FileZilla's ServerProtocol enum (src/include/server.h).
const PROTOCOLS: Record<number, ConnectorProtocol> = {
  0: 'ftp', 1: 'sftp', 2: 'http', 3: 'ftps', 4: 'ftpes', 5: 'https', 6: 'ftp-insecure', 7: 's3', 9: 'webdav', 10: 'webdavs',
};
const DEFAULT_PORT: Partial<Record<ConnectorProtocol, number>> = {
  ftp: 21, ftpes: 21, 'ftp-insecure': 21, ftps: 990, sftp: 22, http: 80, https: 443, s3: 443, webdav: 80, webdavs: 443,
};
const LOGON: Record<number, LogonType> = { 0: 'anonymous', 1: 'normal', 2: 'ask', 3: 'interactive', 4: 'account', 5: 'keyfile' };
export const SUPPORTED: ReadonlySet<ConnectorProtocol> = new Set(['ftp', 'ftps', 'ftpes', 'sftp', 'ftp-insecure', 's3', 'webdav', 'webdavs']);

/* ── a tiny XML reader, enough for FileZilla's files (no DTDs, no entities beyond the five) ─────── */
interface Node { tag: string; attrs: Record<string, string>; children: Node[]; text: string }

const unescape = (s: string) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&amp;/g, '&');

export function parseXml(xml: string): Node {
  const root: Node = { tag: '#root', attrs: {}, children: [], text: '' };
  const stack: Node[] = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([A-Za-z_][\w.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  for (let m: RegExpExecArray | null; (m = re.exec(xml));) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) { top.text += m[1]; continue; }
    if (m[6] !== undefined) { top.text += unescape(m[6]); continue; }
    if (!m[3]) continue; // comment / declaration
    if (m[2] === '/') { if (stack.length > 1 && top.tag === m[3]) stack.pop(); continue; }
    const attrs: Record<string, string> = {};
    for (const a of (m[4] || '').matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = unescape(a[2] ?? a[3] ?? '');
    const node: Node = { tag: m[3], attrs, children: [], text: '' };
    top.children.push(node);
    if (!m[5]) stack.push(node);
  }
  return root;
}

const child = (n: Node, tag: string) => n.children.find(c => c.tag === tag);
const textOf = (n: Node, tag: string) => (child(n, tag)?.text ?? '').trim();

function base64Decode(s: string): string | null {
  try {
    const bin = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary');
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch { return null; }
}

/** FileZilla's serialized remote path: "<type> <prefixLen> <len> <seg> <len> <seg>…" (type 1 = Unix). */
export function decodeRemoteDir(raw: string): string | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  const m = s.match(/^(\d+)\s+(\d+)\s*(.*)$/);
  if (!m) return s;
  const type = Number(m[1]);
  let rest = m[3];
  const prefixLen = Number(m[2]);
  let prefix = '';
  if (prefixLen > 0) { prefix = rest.slice(0, prefixLen); rest = rest.slice(prefixLen).replace(/^\s/, ''); }
  const segs: string[] = [];
  while (rest.length) {
    const lm = rest.match(/^(\d+)\s/);
    if (!lm) break;
    const len = Number(lm[1]);
    const seg = rest.slice(lm[0].length, lm[0].length + len);
    segs.push(seg);
    rest = rest.slice(lm[0].length + len).replace(/^\s/, '');
  }
  if (type === 2 || type === 3) return `${prefix}${segs.join('\\')}` || undefined; // DOS/VMS-ish: keep it readable
  return `${prefix}/${segs.join('/')}`;
}

function siteFrom(n: Node, folder: string[]): ImportedSite | null {
  const host = textOf(n, 'Host');
  if (!host) return null;
  const protoNum = Number(textOf(n, 'Protocol') || 0);
  const protocol = PROTOCOLS[protoNum] ?? 'unknown';
  const port = Number(textOf(n, 'Port')) || DEFAULT_PORT[protocol] || 21;
  const logon = LOGON[Number(textOf(n, 'Logontype') || 1)] ?? 'unknown';
  const passNode = child(n, 'Pass');
  let passwordState: PasswordState = 'not_saved';
  let password: string | undefined;
  if (passNode && passNode.text.trim() && logon !== 'anonymous' && logon !== 'ask' && logon !== 'interactive') {
    const enc = passNode.attrs.encoding;
    if (enc === 'crypt') passwordState = 'master_password';
    else if (enc === 'base64') { const p = base64Decode(passNode.text.trim()); if (p !== null) { passwordState = 'readable'; password = p; } }
    else if (!enc) { passwordState = 'readable'; password = passNode.text; } // very old FileZilla: plain text
  }
  const name = textOf(n, 'Name') || (n.text.trim().split('\n').pop() || '').trim() || host;
  const site: ImportedSite = {
    folder, name, protocol, host, port, user: logon === 'anonymous' ? 'anonymous' : textOf(n, 'User'), logon, passwordState,
    ...(password !== undefined ? { password } : {}),
  };
  const keyFile = textOf(n, 'Keyfile'); if (keyFile) site.keyFile = keyFile;
  const account = textOf(n, 'Account'); if (account) site.account = account;
  const remote = decodeRemoteDir(textOf(n, 'RemoteDir')); if (remote) site.remoteDir = remote;
  const local = textOf(n, 'LocalDir'); if (local) site.localDir = local;
  const comments = textOf(n, 'Comments'); if (comments) site.comments = comments.slice(0, 2000);
  if (!SUPPORTED.has(protocol)) site.unsupported = protocol === 'unknown' ? `protocol ${protoNum}` : protocol.toUpperCase();
  return site;
}

/** Parse sitemanager.xml, a Site Manager export, or recentservers.xml. Never throws on odd input. */
export function parseFileZilla(xml: string): FileZillaImport {
  const root = parseXml(String(xml ?? '').slice(0, 20_000_000));
  const fz = child(root, 'FileZilla3');
  const sites: ImportedSite[] = [];
  let skipped = 0;
  const walk = (n: Node, folder: string[]) => {
    for (const c of n.children) {
      if (c.tag === 'Server') { const s = siteFrom(c, folder); if (s) sites.push(s); else skipped++; }
      else if (c.tag === 'Folder') {
        // The folder's own name is its direct text (FileZilla writes it before the child elements).
        const name = c.text.trim().split(/\s*\n\s*/)[0] || 'Folder';
        walk(c, [...folder, name]);
      }
    }
  };
  if (!fz) return { sites, skipped, source: 'unknown' };
  const servers = child(fz, 'Servers');
  const recent = child(fz, 'RecentServers');
  if (servers) walk(servers, []);
  if (recent) walk(recent, ['Recent']);
  return { sites, skipped, source: servers ? 'sitemanager' : recent ? 'recentservers' : 'unknown' };
}
