// CameraRig against a phone that, like real ones, can only keep one camera open.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CameraRig, classifyCameras, lensPills, cameraErrorMessage } from '../services/camera/cameraRig';

const expect = (got: any) => ({
  toBe: (w: any) => assert.strictEqual(got, w),
  toEqual: (w: any) => assert.deepEqual(got, w),
  toBeNull: () => assert.strictEqual(got, null),
  toBeTruthy: () => assert.ok(got),
  toMatch: (r: RegExp) => assert.match(got, r),
  toHaveLength: (n: number) => assert.strictEqual(got.length, n),
  toHaveBeenCalledTimes: (n: number) => assert.strictEqual(got.calls, n),
});
const waitFor = async (check: () => void) => {
  for (let i = 0; ; i++) {
    try { return check(); } catch (e) { if (i > 100) throw e; await new Promise(r => setTimeout(r, 10)); }
  }
};

const CAMS = [
  { id: 'front', label: 'Front Camera', facing: 'user' },
  { id: 'back', label: 'Back Camera', facing: 'environment' },
  { id: 'ultra', label: 'Back Ultra Wide Camera', facing: 'environment' },
  { id: 'tele', label: 'Back Telephoto Camera', facing: 'environment' },
];

function makePhone(opts: { exclusive?: boolean; releaseFails?: number; refuse?: Set<string>; openMs?: number } = {}) {
  let live: any = null;
  let busyLeft = opts.releaseFails ?? 0;
  const opened: string[] = [];
  const pick = (v: any) => {
    const id = v.deviceId?.exact ?? v.deviceId;
    const fm = v.facingMode?.exact ?? v.facingMode;
    return CAMS.find(c => c.id === id) ?? CAMS.find(c => c.facing === fm) ?? CAMS[0];
  };
  const mkTrack = (cam: typeof CAMS[number]) => {
    const handlers: Record<string, Function[]> = {};
    const t: any = {
      kind: 'video', label: cam.label, readyState: 'live', muted: false,
      getSettings: () => ({ deviceId: cam.id, facingMode: cam.facing }),
      getCapabilities: () => ({}),
      addEventListener: (n: string, f: Function) => { (handlers[n] ??= []).push(f); },
      removeEventListener: (n: string, f: Function) => { handlers[n] = (handlers[n] ?? []).filter(x => x !== f); },
      stop() { t.readyState = 'ended'; if (live === t) live = null; },
      fire(n: string) { (handlers[n] ?? []).forEach(f => f()); },
    };
    return t;
  };
  const media = {
    enumerateDevices: async () => CAMS.map(c => ({ kind: 'videoinput', deviceId: c.id, label: c.label, groupId: c.id })) as any,
    getUserMedia: async ({ video }: any) => {
      const cam = pick(video);
      if (opts.refuse?.has(cam.id)) throw new DOMException('nope', 'OverconstrainedError');
      if ((opts.exclusive && live) || busyLeft-- > 0) throw new DOMException('busy', 'NotReadableError');
      if (opts.openMs) await new Promise(r => setTimeout(r, opts.openMs));
      opened.push(cam.id);
      const t = mkTrack(cam);
      live = t;
      return { getVideoTracks: () => [t], getTracks: () => [t] } as any;
    },
  };
  return { media, opened, live: () => live, openFront: async () => (await media.getUserMedia({ video: { deviceId: 'front' } })).getVideoTracks()[0] };
}

function rigOn(phone: ReturnType<typeof makePhone>, freeFirst: boolean) {
  const published: any[] = [];
  const rig = new CameraRig({ media: phone.media as any, freeFirst, publish: async t => { published.push(t); }, openTimeoutMs: 500 });
  return { rig, published };
}

beforeEach(() => { Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: {}, userAgent: 'test', maxTouchPoints: 0 } }); });

describe('classifyCameras', () => {
  it('orders selfie first, then rear lenses widest to longest, and labels them', () => {
    const list = classifyCameras(CAMS.map(c => ({ kind: 'videoinput', deviceId: c.id, label: c.label })) as any);
    expect(list.map(c => c.deviceId)).toEqual(['front', 'ultra', 'back', 'tele']);
    expect(lensPills(list, 'environment').map(p => p.label)).toEqual(['.5', '1', '2']);
    expect(lensPills(list, 'user')).toEqual([]);
  });
  it("drops iOS's logical bundles when the real lenses are listed", () => {
    const list = classifyCameras(['Back Camera', 'Back Ultra Wide Camera', 'Back Dual Wide Camera', 'Back Triple Camera'].map((label, i) => ({ kind: 'videoinput', deviceId: `d${i}`, label })) as any);
    expect(list.map(c => c.label)).toEqual(['Back Ultra Wide Camera', 'Back Camera']);
  });
  it('reads Android labels and numbers lenses it has no name for', () => {
    const list = classifyCameras(['camera2 1, facing front', 'camera2 0, facing back', 'camera2 2, facing back'].map((label, i) => ({ kind: 'videoinput', deviceId: `d${i}`, label })) as any);
    expect(list[0].facing).toBe('user');
    expect(lensPills(list, 'environment').map(p => p.label)).toEqual(['1', '2']);
  });
});

describe('switching on a one-camera-at-a-time phone', () => {
  it('flips back and forth, every time', async () => {
    const phone = makePhone({ exclusive: true });
    const { rig, published } = rigOn(phone, true);
    await rig.adopt(await phone.openFront());
    for (const want of ['environment', 'user', 'environment', 'user']) {
      await rig.flip();
      expect(rig.getState().facing).toBe(want);
      expect(rig.getState().phase).toBe('live');
    }
    expect(published).toHaveLength(4);
    expect(phone.live()).toBe(rig.getTrack());
  });

  it('reaches every lens, and flip returns to the rear lens you were on', async () => {
    const phone = makePhone({ exclusive: true });
    const { rig } = rigOn(phone, true);
    await rig.adopt(await phone.openFront());
    for (const c of CAMS) { await rig.selectCamera(c.id); expect(rig.getState().deviceId).toBe(c.id); }
    await rig.selectCamera('ultra');
    await rig.flip();
    expect(rig.getState().deviceId).toBe('front');
    await rig.flip();
    expect(rig.getState().deviceId).toBe('ultra');
  });

  it('waits out a sensor the OS is still releasing', async () => {
    const phone = makePhone({ exclusive: true });
    const { rig } = rigOn(phone, true);
    await rig.adopt(await phone.openFront());
    let fails = 2;
    const real = phone.media.getUserMedia;
    phone.media.getUserMedia = async (c: any) => { if (fails-- > 0) throw new DOMException('busy', 'NotReadableError'); return real(c); };
    await rig.flip();
    expect(rig.getState().phase).toBe('live');
    expect(rig.getState().facing).toBe('environment');
  });

  it('coalesces rapid taps: only the newest target opens', async () => {
    const phone = makePhone({ exclusive: true, openMs: 20 });
    const { rig } = rigOn(phone, true);
    await rig.adopt(await phone.openFront());
    phone.opened.length = 0;
    const runs = [rig.selectCamera('back'), rig.selectCamera('ultra'), rig.selectCamera('tele'), rig.selectCamera('back')];
    await Promise.all(runs);
    await waitFor(() => expect(rig.getState().phase).toBe('live'));
    expect(phone.opened).toEqual(['back', 'back']);   // the one already running, then the newest
    expect(rig.getState().deviceId).toBe('back');
    expect(phone.live()).toBe(rig.getTrack());
  });

  it('falls back to the last good camera when a lens will not open', async () => {
    const phone = makePhone({ exclusive: true, refuse: new Set(['tele']) });
    const { rig } = rigOn(phone, true);
    await rig.adopt(await phone.openFront());
    await rig.selectCamera('tele');
    expect(rig.getState().phase).toBe('live');
    expect(rig.getState().deviceId).toBe('front');
    expect(rig.getState().error).toBeTruthy();
    expect(rig.getTrack()?.readyState).toBe('live');
  });

  it('reopens by itself when the OS takes the camera away', async () => {
    const phone = makePhone({ exclusive: true });
    const { rig } = rigOn(phone, true);
    await rig.adopt(await phone.openFront());
    const t: any = rig.getTrack();
    t.stop(); t.fire('ended');
    await waitFor(() => expect(rig.getTrack()?.readyState).toBe('live'));
    expect(rig.getState().deviceId).toBe('front');
  });
});

describe('switching on a desktop', () => {
  it('keeps the old picture until the new camera is up', async () => {
    const phone = makePhone();
    const { rig } = rigOn(phone, false);
    await rig.adopt(await phone.openFront());
    const old: any = rig.getTrack();
    let oldLiveAtPublish = false;
    (rig as any).opts.publish = async () => { oldLiveAtPublish = old.readyState === 'live'; };
    await rig.selectCamera('back');
    expect(oldLiveAtPublish).toBe(true);
    expect(old.readyState).toBe('ended');
  });
  it('frees the camera and retries when the driver refuses two', async () => {
    const phone = makePhone({ exclusive: true });
    const { rig } = rigOn(phone, false);
    await rig.adopt(await phone.openFront());
    await rig.selectCamera('back');
    expect(rig.getState().deviceId).toBe('back');
  });
});

describe('errors', () => {
  it('says what happened in plain words', () => {
    expect(cameraErrorMessage({ name: 'NotAllowedError' })).toMatch(/permission/i);
    expect(cameraErrorMessage({ name: 'NotReadableError' })).toMatch(/another app/i);
    expect(cameraErrorMessage({ name: 'NotFoundError' })).toMatch(/no camera/i);
  });
  it('does not loop on a denied permission', async () => {
    const phone = makePhone({ exclusive: true });
    const { rig } = rigOn(phone, true);
    await rig.adopt(await phone.openFront());
    const gum = { calls: 0 };
    phone.media.getUserMedia = (async () => { gum.calls++; throw new DOMException('no', 'NotAllowedError'); }) as any;
    await rig.selectCamera('back');
    expect(gum).toHaveBeenCalledTimes(1);
    expect(rig.getState().phase).toBe('failed');
  });
});
