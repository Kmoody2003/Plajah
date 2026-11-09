// FileZilla Site Manager import. Run: npx tsx --test tests/filezillaImport.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeRemoteDir, parseFileZilla } from '../services/storageConnectors/filezilla';

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
