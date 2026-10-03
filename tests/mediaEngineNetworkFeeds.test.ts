import test, { describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { scanNdiStreams, scanOmtStreams, scanNetworkFeeds, getNdiStatus } from '../services/mediaEngine/bridge';

// The native host answers with PascalCase records inside camelCase wrappers; the bridge must read either.
type Handler = (cmd: string) => any;
function host(h: Handler) { (globalThis as any).window = { __plajahMediaEngine: { invoke: async (cmd: string) => h(cmd) } }; }

const NDI = { Id: 'ndi:A_vMix', Name: 'A (vMix - Output 1)', Url: '10.0.0.5:5961', MachineName: 'A', StreamName: 'vMix - Output 1', Width: 1920, Height: 1080, Fps: 59.94, Status: 'Online (NDI SDK)', DiscoveryMethod: 'NDI 6 Runtime SDK' };
const OMT = { Id: 'omt:B_Presenter', Name: 'B (Presenter)', Url: 'omt://10.0.0.6:6400', MachineName: 'B', StreamName: 'Presenter', Width: 0, Height: 0, Fps: 0, AudioChannels: 0, HasAlpha: false, Status: 'Online', DiscoveryMethod: 'mDNS (_omt._tcp)' };

describe('network feed discovery (NDI + OMT)', () => {
  beforeEach(() => { delete (globalThis as any).window; });

  test('in a browser (no native host) nothing is invented', async () => {
    assert.deepEqual(await scanNdiStreams(), []);
    assert.deepEqual(await scanOmtStreams(), []);
    assert.deepEqual(await scanNetworkFeeds(), []);
    assert.equal(await getNdiStatus(), null);
  });

  test('NDI and OMT senders come back together, typed by kind', async () => {
    host(cmd => cmd === 'ndi_scan' ? { streams: [NDI] } : cmd === 'omt_scan' ? { streams: [OMT] } : null);
    const all = await scanNetworkFeeds();
    assert.deepEqual(all.map(s => s.kind), ['ndi', 'omt']);
    assert.equal(all[0].label, 'A (vMix - Output 1)');
    assert.equal(all[1].url, 'omt://10.0.0.6:6400');
  });

  test('OMT claims no resolution or frame rate it was not told', async () => {
    host(() => ({ streams: [OMT] }));
    const [s] = await scanOmtStreams();
    assert.deepEqual(s.formats, []);
    // …but an OMT feed that does report a format keeps it.
    host(() => ({ streams: [{ ...OMT, Width: 3840, Height: 2160, Fps: 30 }] }));
    const [s2] = await scanOmtStreams();
    assert.deepEqual(s2.formats, [{ width: 3840, height: 2160, fps: 30, interlaced: false }]);
  });

  test('an empty network is an empty list — no placeholder feeds', async () => {
    host(() => ({ streams: [] }));
    assert.deepEqual(await scanNetworkFeeds(), []);
  });

  test('if the host only answers the generic source list, only network feeds are kept', async () => {
    host(cmd => cmd === 'list_sources' ? [{ id: 'dl1', label: 'DeckLink', kind: 'decklink', formats: [] }, { id: 'n1', label: 'N', kind: 'ndi', formats: [] }] : null);
    const found = await scanNetworkFeeds();
    assert.deepEqual(found.map(s => s.id), ['n1']);   // the capture card is not a network feed
  });

  test('camelCase hosts work too', async () => {
    host(cmd => cmd === 'omt_scan' ? { streams: [{ id: 'o', name: 'O', url: 'omt://h:6400', machineName: 'H', streamName: 'S', width: 0, height: 0 }] } : { streams: [] });
    const [s] = await scanOmtStreams();
    assert.equal(s.id, 'o'); assert.equal(s.label, 'O'); assert.equal(s.machineName, 'H');
  });

  test('diagnosis explains an empty scan (PascalCase from the host)', async () => {
    host(cmd => cmd === 'ndi_info' ? { IsInstalled: true, Version: 'NDI 6.3.2.0', FinderRunning: true, Diagnosis: 'Windows Firewall isn’t allowing Plajah on this Public network.', FirewallProfile: 'Public' } : null);
    const st = await getNdiStatus();
    assert.ok(st);
    assert.equal(st!.installed, true);
    assert.equal(st!.finderRunning, true);
    assert.match(st!.diagnosis!, /Firewall/);
    assert.equal(st!.firewallProfile, 'Public');
  });

  test('a host that errors never throws into the UI', async () => {
    (globalThis as any).window = { __plajahMediaEngine: { invoke: async () => { throw new Error('boom'); } } };
    assert.deepEqual(await scanOmtStreams(), []);
    assert.deepEqual(await scanNdiStreams(), []);
    assert.equal(await getNdiStatus(), null);
  });
});
