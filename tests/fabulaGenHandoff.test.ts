// Fabula generation — connector registry + handoff compiler.
//
// These cover the parts that decide what a user is told and what they get billed, which is where a
// silent bug is most expensive: dropping a reference a provider can't take without saying so, offering
// a Generate button for a service with no API, or losing a character's identity lock on the way to a
// provider that has no reference-image slot.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONNECTORS, connectorById, canConnect, videoServices, stillTargets,
  compileHandoff, refsForConnector, specFromShot, placeResultInCut,
  type ShotSpec, type CutClip,
} from '../services/fabula/genAgent';

const conn = (id: string) => {
  const c = connectorById(id);
  assert.ok(c, `connector ${id} missing from the registry`);
  return c!;
};

test('every connector declares the fields the panel and compiler depend on', () => {
  for (const c of CONNECTORS) {
    assert.ok(c.modes.length > 0, `${c.id} has no modes`);
    assert.ok(c.caps && Array.isArray(c.caps.refRoles), `${c.id} has no refRoles`);
    assert.ok(typeof c.caps.maxRefs === 'number', `${c.id} has no maxRefs`);
    assert.ok(c.promptHint, `${c.id} has no promptHint for the SLATE compiler`);
    // Handoff must always be possible — it's the fallback that needs no backend and no credentials.
    assert.ok(c.modes.includes('handoff'), `${c.id} must support handoff`);
  }
});

test('wallet model matches API reality — no public API means no connected mode', () => {
  // Dreamina and Google Flow have no public API. If either ever gains a `connected` mode without a
  // wallet model to match, the panel would offer to spend money that doesn't exist.
  for (const id of ['dreamina', 'flow']) {
    const c = conn(id);
    assert.equal(c.walletModel, 'none', `${id} should be walletModel:none`);
    assert.equal(canConnect(id), false, `${id} must not be connectable`);
  }
  // Kling and Runway have APIs, but on a balance separate from the consumer subscription.
  for (const id of ['kling', 'runway']) {
    assert.equal(conn(id).walletModel, 'separate');
    assert.equal(canConnect(id), true);
  }
  // Anything claiming a wallet model of 'none' must not be connectable, and vice versa.
  for (const c of CONNECTORS) {
    if (c.walletModel === 'none') assert.equal(c.modes.includes('connected'), false, `${c.id}`);
    if (c.modes.includes('connected')) assert.notEqual(c.walletModel, 'none', `${c.id}`);
  }
});

test('connected providers explain which balance they spend', () => {
  for (const c of CONNECTORS.filter((x) => x.modes.includes('connected'))) {
    assert.ok(c.walletNote, `${c.id} must carry a walletNote — users get billed by surprise otherwise`);
  }
});

test('legacy persisted provider ids still resolve', () => {
  // Saved productions carry defaults.stillTarget === 'mj_magnific' from the older STILL_TARGETS list.
  assert.equal(connectorById('mj_magnific')?.id, 'midjourney');
  assert.equal(connectorById('nope-not-real'), undefined);
});

test('service lists partition the registry by kind', () => {
  const v = videoServices().map((c) => c.id);
  const s = stillTargets().map((c) => c.id);
  assert.ok(v.includes('kling') && v.includes('runway'));
  assert.ok(s.includes('magnific') && s.includes('midjourney'));
  assert.equal(v.filter((id) => s.includes(id)).length, 0, 'a connector must not be in both lists');
  assert.equal(v.length + s.length, CONNECTORS.length, 'every connector must land in exactly one list');
});

test('specFromShot carries the bible identity locks as references', () => {
  const spec = specFromShot({
    which: 'still',
    aspect: '2.39:1',
    sceneId: 'sc1',
    shot: { id: 'sh4', slug: '4B', still: 'Wide on the alley.', video: 'Push in.' },
    bible: {
      characters: [{ id: 'w1', name: 'KIRA', visual_lock: 'Late 20s, shaved head, oil-stained parka.' }],
      environment_lock: 'Rain-slick brick alley, sodium light, 1987.',
    },
  });

  assert.equal(spec.prompt, 'Wide on the alley.');
  assert.equal(spec.shotId, 'sh4');
  assert.equal(spec.slug, '4B');
  assert.equal(spec.aspect, '2.39:1');

  const char = spec.refs.find((r) => r.role === 'character');
  assert.equal(char?.name, 'KIRA');
  assert.equal(char?.worldEntityId, 'w1', 'character refs must keep the Worlds id so looks follow across shots');
  assert.match(char?.lock || '', /shaved head/);
  assert.ok(spec.refs.some((r) => r.role === 'location'), 'environment_lock must become a location ref');
});

test('specFromShot attaches the chosen still as first frame only for the video pass', () => {
  const shot = { id: 'sh1', slug: '1A', still: 'A still.', video: 'A move.' };
  const firstFrame = { assetId: 'a1', name: 'plate.png' };

  const video = specFromShot({ shot, which: 'video', firstFrame });
  assert.ok(video.refs.some((r) => r.role === 'first_frame' && r.assetId === 'a1'));

  const still = specFromShot({ shot, which: 'still', firstFrame });
  assert.equal(still.refs.some((r) => r.role === 'first_frame'), false,
    'a still pass has no start frame to attach');
});

test('refsForConnector honors role support and the per-provider cap', () => {
  const spec: ShotSpec = {
    prompt: 'x',
    refs: [
      { role: 'first_frame', url: 'u1', name: 'plate' },
      { role: 'character', url: 'u2', name: 'KIRA' },
      { role: 'last_frame', url: 'u3', name: 'end' },
      { role: 'prop', url: 'u4', name: 'revolver' },   // Kling declares no 'prop' role
    ],
  };
  const { used, dropped } = refsForConnector(spec, conn('kling'));

  assert.equal(used.length, 3);
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0].name, 'revolver');

  // Ideogram takes exactly one style ref — everything else must be reported as dropped, not silently lost.
  const ideo = refsForConnector(spec, conn('ideogram'));
  assert.equal(ideo.used.length, 0);
  assert.equal(ideo.dropped.length, 4);
});

test('refsForConnector never counts text-only locks against the image cap', () => {
  // A character lock with no image is prompt material, not an attachment. Counting it would starve the
  // provider of real reference images.
  const spec: ShotSpec = {
    prompt: 'x',
    refs: [
      { role: 'character', name: 'KIRA', lock: 'Late 20s, shaved head.' },
      { role: 'character', name: 'DEV', lock: 'Sixties, grey suit.' },
      { role: 'first_frame', url: 'u1', name: 'plate' },
    ],
  };
  const { used, dropped } = refsForConnector(spec, conn('kling'));
  assert.equal(used.length, 1);
  assert.equal(used[0].name, 'plate');
  assert.equal(dropped.length, 0);
});

test('compileHandoff folds unattached identity locks into the prompt verbatim', () => {
  const spec: ShotSpec = {
    prompt: 'Wide on the alley, she steps into frame.',
    refs: [
      { role: 'character', name: 'KIRA', lock: 'Late 20s, shaved head, oil-stained parka.' },
      { role: 'location', name: 'ENVIRONMENT', lock: 'Rain-slick brick alley, sodium light, 1987.' },
    ],
  };
  const out = compileHandoff(spec, conn('flow'));

  assert.match(out.prompt, /Wide on the alley/);
  assert.match(out.prompt, /shaved head, oil-stained parka/, 'character lock must survive into the prompt');
  assert.match(out.prompt, /sodium light, 1987/, 'environment lock must survive into the prompt');
});

test('compileHandoff does not duplicate a lock the prompt already contains', () => {
  const lock = 'Late 20s, shaved head, oil-stained parka.';
  const spec: ShotSpec = {
    prompt: `Wide on the alley. ${lock}`,
    refs: [{ role: 'character', name: 'KIRA', lock }],
  };
  const out = compileHandoff(spec, conn('flow'));
  assert.equal(out.prompt.split('shaved head').length - 1, 1, 'lock should appear exactly once');
});

test('compileHandoff speaks Midjourney flags but gives everyone else UI instructions', () => {
  const spec: ShotSpec = { prompt: 'A lighthouse.', refs: [], aspect: '2.39:1', seed: 42 };

  const mj = compileHandoff(spec, conn('midjourney'));
  assert.match(mj.prompt, /--ar 2\.39:1/);
  assert.match(mj.prompt, /--seed 42/);

  const kling = compileHandoff({ ...spec, duration: 10 }, conn('kling'));
  assert.doesNotMatch(kling.prompt, /--ar/, 'only Midjourney takes trailing flags');
  assert.ok(kling.notes.some((n) => /aspect to 2\.39:1/.test(n)));
  assert.ok(kling.notes.some((n) => /duration to 10s/.test(n)));
});

test('compileHandoff surfaces dropped refs and a negative prompt the provider cannot take', () => {
  const spec: ShotSpec = {
    prompt: 'A lighthouse.',
    negative: 'no lens flare',
    refs: [{ role: 'prop', url: 'u1', name: 'revolver' }],
  };
  // Ideogram supports neither a 'prop' ref nor a negative field.
  const out = compileHandoff(spec, conn('ideogram'));

  assert.equal(out.droppedRefs.length, 1);
  assert.ok(out.notes.some((n) => /revolver/.test(n)), 'a dropped ref must be reported, never silent');
  assert.ok(out.notes.some((n) => /No negative-prompt field/.test(n)));

  // Kling does support negatives — it should be given as a value to paste, not a warning.
  const k = compileHandoff(spec, conn('kling'));
  assert.ok(k.notes.some((n) => /^Negative prompt: no lens flare/.test(n)));
});

test('compileHandoff always points at the provider and closes the loop back to the bin', () => {
  const out = compileHandoff({ prompt: 'x', refs: [] }, conn('dreamina'));
  assert.equal(out.openUrl, conn('dreamina').handoffUrl);
  assert.ok(out.notes.some((n) => /watch folder/.test(n)),
    'the user must be told the download lands in the bin by itself');
});

// ── the round-trip: a finished generation landing back in the cut ──────────────────────────────────

// What buildEditFromBreakdown() lays down: a picture placeholder per shot, plus a voice row on an
// audio track carrying the SAME shotId for shots with dialogue.
const cut = (): CutClip[] => ([
  { id: 'c1', trackId: 'v1', start: 0, duration: 4, kind: 'script', shotId: 'sh1', label: '1A · WIDE' },
  { id: 'a1c', trackId: 'a1', start: 0.15, duration: 3.7, kind: 'voice', shotId: 'sh1', label: 'You came back.' },
  { id: 'c2', trackId: 'v1', start: 4, duration: 3, kind: 'script', shotId: 'sh2', label: '1B · CU' },
]);

let n = 0;
const mkId = () => `new${++n}`;

test('a result fills its own placeholder and leaves every other clip alone', () => {
  n = 0;
  const { clips, filled, alternates } = placeResultInCut(cut(), 'sh1', { id: 'as1', name: 'shot1.mp4' }, mkId);

  assert.equal(filled, 1);
  assert.equal(alternates, 0);
  assert.equal(clips.length, 3, 'filling a placeholder must not add a clip');

  const c1 = clips.find((c) => c.id === 'c1')!;
  assert.equal(c1.kind, 'media');
  assert.equal(c1.assetId, 'as1');
  assert.equal(c1.label, 'shot1.mp4');
  assert.equal(c1.start, 0, 'the placeholder start must survive');
  assert.equal(c1.duration, 4, 'the pacing the script implied must survive');

  // The other shot is untouched.
  assert.equal(clips.find((c) => c.id === 'c2')!.kind, 'script');
});

test('the voice row for the same shot is never replaced by picture', () => {
  n = 0;
  const { clips } = placeResultInCut(cut(), 'sh1', { id: 'as1', name: 'shot1.mp4' }, mkId);
  const voice = clips.find((c) => c.id === 'a1c')!;
  assert.equal(voice.kind, 'voice', 'the audio-track clip shares the shotId but is not a picture slot');
  assert.equal(voice.assetId, undefined);
});

test('a slot that already holds media becomes an alternate take, muting rather than deleting', () => {
  n = 0;
  const filled = placeResultInCut(cut(), 'sh1', { id: 'as1', name: 'take1.mp4' }, mkId).clips;
  const second = placeResultInCut(filled, 'sh1', { id: 'as2', name: 'take2.mp4' }, mkId);

  assert.equal(second.filled, 0);
  assert.equal(second.alternates, 1);

  const old = second.clips.find((c) => c.id === 'c1')!;
  assert.equal(old.disabled, true, 'the previous take is muted');
  assert.equal(old.assetId, 'as1', 'and is still there — never destroyed');

  const fresh = second.clips.find((c) => c.assetId === 'as2')!;
  assert.equal(fresh.disabled, undefined);
  assert.equal(fresh.shotId, 'sh1', 'the new take keeps provenance so it can be replaced in turn');
  assert.equal(fresh.start, old.start);
  assert.equal(fresh.duration, old.duration);
});

test('every picture placeholder for a shot is filled, not just the first', () => {
  n = 0;
  const twice: CutClip[] = [
    { id: 'c1', trackId: 'v1', start: 0, duration: 4, kind: 'script', shotId: 'sh1' },
    { id: 'c1b', trackId: 'v2', start: 0, duration: 4, kind: 'script', shotId: 'sh1' },
  ];
  const { filled } = placeResultInCut(twice, 'sh1', { id: 'as1' }, mkId);
  assert.equal(filled, 2);
});

test('a shot with no clips in the cut changes nothing, and the array is returned untouched', () => {
  n = 0;
  const before = cut();
  const out = placeResultInCut(before, 'sh-does-not-exist', { id: 'as1' }, mkId);
  assert.equal(out.filled, 0);
  assert.equal(out.alternates, 0);
  assert.equal(out.clips, before, 'no change should not churn the clip array');
});

test('placeResultInCut refuses to act without a shotId or an asset', () => {
  n = 0;
  const before = cut();
  assert.equal(placeResultInCut(before, '', { id: 'as1' }, mkId).clips, before);
  assert.equal(placeResultInCut(before, 'sh1', { id: '' }, mkId).clips, before);
});
