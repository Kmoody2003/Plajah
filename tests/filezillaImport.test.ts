// FileZilla Site Manager import. Run: npx tsx --test tests/filezillaImport.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeRemoteDir, parseFileZilla } from '../services/storageConnectors/filezilla';
import {
  loadSavedConnectors,
  normalizeConnectorProtocol,
  parseFileZillaCandidates,
  removeConnectedLocation,
  resolveConnectorSecret,
  sanitizeConnectorHost,
  upsertConnectedLocation,
} from '../services/storageConnectors/connectorRegistry';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

const SITEMANAGER = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<FileZilla3 version="3.67.0" platform="windows">
  <Servers>
    <Server>
      <Host>ftp.example.com</Host>
      <Port>21</Port>
      <Protocol>4</Protocol>
      <Type>0</Type>
      <User>kenne</User>
      <Pass encoding="base64">${b64('p&ss wörd')}</Pass>
      <Logontype>1</Logontype>
      <Name>Main site &amp; blog</Name>
      <RemoteDir>1 0 6 public 4 html</RemoteDir>
      <LocalDir>C:\\Sites\\main</LocalDir>
      <Comments>Host: Bluehost</Comments>
    </Server>
    <Folder expanded="1">Clients
      <Server>
        <Host>sftp.gracechapel.org</Host>
        <Port>2222</Port>
        <Protocol>1</Protocol>
        <User>media</User>
        <Logontype>5</Logontype>
        <Keyfile>C:\\keys\\grace.ppk</Keyfile>
        <Name>Grace Chapel media</Name>
      </Server>
      <Folder>Old
        <Server>
          <Host>files.oldclient.net</Host>
          <Protocol>3</Protocol>
          <User>admin</User>
          <Pass encoding="crypt" pubkey="abc">ZZZZ</Pass>
          <Logontype>1</Logontype>
          <Name>Old client</Name>
        </Server>
      </Folder>
    </Folder>
    <Server>
      <Host>mirror.example.org</Host>
      <Protocol>0</Protocol>
      <Logontype>0</Logontype>
      <Name>Public mirror</Name>
    </Server>
    <Server>
      <Host>dav.example.com</Host>
      <Protocol>2</Protocol>
      <Logontype>2</Logontype>
      <User>x</User>
      <Name>Web thing</Name>
    </Server>
    <Server><Name>Broken, no host</Name></Server>
  </Servers>
</FileZilla3>`;

test('site manager: folders, protocols, ports, users and every password state', () => {
  const r = parseFileZilla(SITEMANAGER);
  assert.equal(r.source, 'sitemanager');
  assert.equal(r.skipped, 1);
  assert.equal(r.sites.length, 5);
  const [main, grace, old, mirror, web] = r.sites;

  assert.deepEqual({ ...main }, {
    folder: [], name: 'Main site & blog', protocol: 'ftpes', host: 'ftp.example.com', port: 21, user: 'kenne', logon: 'normal',
    passwordState: 'readable', password: 'p&ss wörd', remoteDir: '/public/html', localDir: 'C:\\Sites\\main', comments: 'Host: Bluehost',
  });
  assert.deepEqual(grace.folder, ['Clients']);
  assert.equal(grace.protocol, 'sftp'); assert.equal(grace.port, 2222); assert.equal(grace.logon, 'keyfile');
  assert.equal(grace.keyFile, 'C:\\keys\\grace.ppk'); assert.equal(grace.passwordState, 'not_saved');
  assert.deepEqual(old.folder, ['Clients', 'Old']);
  assert.equal(old.protocol, 'ftps'); assert.equal(old.port, 990);
  assert.equal(old.passwordState, 'master_password'); assert.equal(old.password, undefined);
  assert.equal(mirror.user, 'anonymous'); assert.equal(mirror.port, 21); assert.equal(mirror.passwordState, 'not_saved');
  assert.equal(web.logon, 'ask'); assert.equal(web.unsupported, 'HTTP');
  assert.equal(main.unsupported, undefined);
});

test('recent servers and junk input never throw', () => {
  const r = parseFileZilla(`<FileZilla3><RecentServers><Server><Host>10.0.0.5</Host><Port>22</Port><Protocol>1</Protocol><User>pi</User><Logontype>1</Logontype></Server></RecentServers></FileZilla3>`);
  assert.equal(r.source, 'recentservers');
  assert.equal(r.sites[0].name, '10.0.0.5'); assert.deepEqual(r.sites[0].folder, ['Recent']); assert.equal(r.sites[0].protocol, 'sftp');
  for (const junk of ['', 'not xml', '<html><body>hi</body></html>', '<FileZilla3><Servers><Server><Host>', null as unknown as string]) {
    const j = parseFileZilla(junk);
    assert.ok(Array.isArray(j.sites));
  }
});

test('remote folder decoding', () => {
  assert.equal(decodeRemoteDir('1 0 4 home 3 bob'), '/home/bob');
  assert.equal(decodeRemoteDir('1 0'), '/');
  assert.equal(decodeRemoteDir('1 0 11 with spaces'), '/with spaces');
  assert.equal(decodeRemoteDir(''), undefined);
});

test('candidates normalize ftp-insecure, BOM, passive mode, and skip unsupported protocols', () => {
  const xml = `\uFEFF<?xml version="1.0" encoding="UTF-8" standalone="true"?>
<FileZilla3>
  <Servers>
    <Server>
      <Host>ftp://ftp.myhost.com/</Host>
      <Port>2121</Port>
      <Protocol>6</Protocol>
      <User>deploy@myhost.com</User>
      <Pass encoding="base64">${b64('s3cr3t!')}</Pass>
      <Logontype>1</Logontype>
      <PasvMode>MODE_ACTIVE</PasvMode>
      <Name>My Plain FTP</Name>
      <RemoteDir>/public_html</RemoteDir>
    </Server>
    <Server>
      <Host>http.example.com</Host>
      <Protocol>2</Protocol>
      <Name>Unsupported HTTP</Name>
    </Server>
  </Servers>
</FileZilla3>`;

  const parsed = parseFileZillaCandidates(xml);
  assert.equal(parsed.source, 'sitemanager');
  assert.equal(parsed.candidates.length, 1);
  assert.equal(parsed.skipped, 1);
  assert.deepEqual(parsed.unsupported, ['HTTP']);

  const site = parsed.candidates[0];
  assert.equal(site.name, 'My Plain FTP');
  assert.equal(site.protocol, 'ftp');
  assert.equal(site.host, 'ftp.myhost.com');
  assert.equal(site.port, 2121);
  assert.equal(site.user, 'deploy@myhost.com');
  assert.equal(site.password, 's3cr3t!');
  assert.equal(site.passwordState, 'readable');
  assert.equal(site.remoteDir, '/public_html');
  assert.equal(site.passive, false);
});

test('host sanitization and protocol normalization helpers', () => {
  assert.equal(normalizeConnectorProtocol('ftp-insecure'), 'ftp');
  assert.equal(normalizeConnectorProtocol('ftpes'), 'ftpes');
  assert.equal(normalizeConnectorProtocol('http'), null);
  assert.equal(normalizeConnectorProtocol('s3'), null);
  assert.equal(sanitizeConnectorHost('  ftpes://nas.local/  '), 'nas.local');
  assert.equal(sanitizeConnectorHost('\\\\192.168.1.50'), '192.168.1.50');
});

test('upsertConnectedLocation edits in place, updates/clears secrets, and heals legacy ftp-insecure', async () => {
  const store = new Map<string, string>();
  const origWindow = (globalThis as any).window;
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    },
  };
  try {
    // Seed a legacy broken ftp-insecure entry and verify loadSavedConnectors heals it
    store.set('plajah_connected_locations_v1', JSON.stringify([
      { id: 'legacy1', name: 'Old FTP', protocol: 'ftp-insecure', host: 'old.host', port: 21, user: 'u', remoteDir: '/', source: 'filezilla', hasSecret: false },
    ]));
    const loaded = loadSavedConnectors();
    assert.equal(loaded[0].protocol, 'ftp');

    // Create a new FTP location with password
    const created = await upsertConnectedLocation({
      name: 'Studio FTP',
      protocol: 'ftp',
      host: 'ftp://studio.example.com/',
      port: 21,
      user: 'alice',
      remoteDir: '/media',
      passive: true,
      source: 'filezilla',
      secret: 'initial-pass',
    });
    assert.equal(created.host, 'studio.example.com');
    assert.equal(created.hasSecret, true);
    assert.equal(await resolveConnectorSecret(created.id), 'initial-pass');

    // Edit the saved location in place without re-entering password -> keeps secret
    const edited = await upsertConnectedLocation({
      id: created.id,
      name: 'Studio FTPES',
      protocol: 'ftpes',
      host: 'studio.example.com',
      port: 2121,
      user: 'alice',
      remoteDir: '/uploads',
      passive: false,
      source: 'filezilla',
    });
    assert.equal(edited.id, created.id);
    assert.equal(edited.protocol, 'ftpes');
    assert.equal(edited.port, 2121);
    assert.equal(edited.passive, false);
    assert.equal(edited.hasSecret, true);
    assert.equal(await resolveConnectorSecret(created.id), 'initial-pass');

    // Clear saved password explicitly
    const cleared = await upsertConnectedLocation({
      id: created.id,
      name: 'Studio FTPES',
      protocol: 'ftpes',
      host: 'studio.example.com',
      port: 2121,
      user: 'alice',
      remoteDir: '/uploads',
      passive: false,
      source: 'filezilla',
      clearSecret: true,
    });
    assert.equal(cleared.hasSecret, false);
    assert.equal(await resolveConnectorSecret(created.id), null);

    // Clean removal
    const afterRemove = await removeConnectedLocation(created.id);
    assert.equal(afterRemove.some(x => x.id === created.id), false);
  } finally {
    if (origWindow === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = origWindow;
  }
});
