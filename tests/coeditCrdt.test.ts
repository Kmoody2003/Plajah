// services/coedit/crdt.ts — fine-grained diff, order-independent merge, text merge, edit-beats-delete.
//   npx tsx --test tests/coeditCrdt.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOps, coalesce, deepEqual, diff, fromDoc, merge3Json, merge3Text, overlay, posBetween, type CrdtState, type Op } from '../services/coedit/crdt';
import { newClock, observe, tick } from '../services/coedit/hlc';

const base = () => ({
  title: 'Flyer',
  frames: [
    { id: 'f1', name: 'Front cover page', w: 100 },
    { id: 'f2', name: 'Back', w: 100 },
  ],
  pageDevices: ['scene', 'notes'],
  devices: {
    scene: {
      objects: [
        { id: 'a', kind: 'TEXT', text: 'Sunday service at nine', fill: '#000', x: 0 },
        { id: 'b', kind: 'RECT', fill: '#f00', x: 10, points: [0, 0, 1, 1] },
        { id: 'c', kind: 'RECT', fill: '#0f0', x: 20 },
      ],
    },
  },
});

/** A site: its clock and its CRDT state. Edits go through diff exactly like a live session. */
function site(name: string, start: CrdtState) {
  const clock = newClock(name);
  let state = start;
  return {
    clock,
    get doc() {
      return state.doc as any;
    },
    edit(fn: (d: any) => any): Op[] {
      const next = fn(structuredClone(state.doc));
      const ops = diff(state.doc, next, state.meta, () => tick(clock));
      state = applyOps(state, ops).state;
      return ops;
    },
    receive(ops: Op[]) {
      for (const o of ops) observe(clock, o.s);
      const r = applyOps(state, ops);
      state = r.state;
      return r;
    },
  };
}

test('posBetween always lands strictly between and never ends in 0', () => {
  let keys = [posBetween(null, null)];
  for (let i = 0; i < 300; i++) {
    const j = Math.floor(Math.random() * (keys.length + 1));
    const k = posBetween(j > 0 ? keys[j - 1] : null, j < keys.length ? keys[j] : null);
    if (j > 0) assert.ok(k > keys[j - 1], `${k} > ${keys[j - 1]}`);
    if (j < keys.length) assert.ok(k < keys[j], `${k} < ${keys[j]}`);
    assert.notEqual(k.at(-1), '0');
    keys = [...keys.slice(0, j), k, ...keys.slice(j)];
  }
});

test('diff → apply reproduces the edited document', () => {
  const s = site('A', fromDoc(base()));
  s.edit((d) => {
    d.title = 'Flyer v2';
    d.devices.scene.objects[1].fill = '#00f';
    d.devices.scene.objects.reverse();
    d.frames.push({ id: 'f3', name: 'Insert', w: 50 });
    delete d.frames[0].w;
    return d;
  });
  assert.equal(s.doc.title, 'Flyer v2');
  assert.deepEqual(s.doc.devices.scene.objects.map((o: any) => o.id), ['c', 'b', 'a']);
  assert.equal(s.doc.devices.scene.objects[1].fill, '#00f');
  assert.deepEqual(s.doc.frames.map((f: any) => f.id), ['f1', 'f2', 'f3']);
  assert.equal('w' in s.doc.frames[0], false);
});

test('two people editing different properties of the same shape both keep their change', () => {
  const start = fromDoc(base());
  const A = site('A', start);
  const B = site('B', start);
  const oa = A.edit((d) => ((d.devices.scene.objects[1].fill = '#123'), d));
  const ob = B.edit((d) => ((d.devices.scene.objects[1].x = 99), d));
  A.receive(ob);
  B.receive(oa);
  assert.deepEqual(A.doc, B.doc);
  assert.equal(A.doc.devices.scene.objects[1].fill, '#123');
  assert.equal(A.doc.devices.scene.objects[1].x, 99);
});

test('same property: the later write wins on every site', () => {
  const start = fromDoc(base());
  const A = site('A', start);
  const B = site('B', start);
  const oa = A.edit((d) => ((d.title = 'From A'), d));
  const ob = B.edit((d) => ((d.title = 'From B'), d)); // B's clock ticks after A's in wall time or by site order
  A.receive(ob);
  B.receive(oa);
  assert.deepEqual(A.doc, B.doc);
});

test('concurrent typing in different parts of one text box merges', () => {
  const start = fromDoc(base());
  const A = site('A', start);
  const B = site('B', start);
  const oa = A.edit((d) => ((d.devices.scene.objects[0].text = 'This Sunday service at nine'), d));
  const ob = B.edit((d) => ((d.devices.scene.objects[0].text = 'Sunday service at nine AM sharp'), d));
  A.receive(ob);
  B.receive(oa);
  assert.equal(A.doc.devices.scene.objects[0].text, 'This Sunday service at nine AM sharp');
  assert.deepEqual(A.doc, B.doc);
});

test('three people typing in one caption at once all keep their words', () => {
  const start = fromDoc({ caption: 'Join us for worship this week' });
  const [A, B, C] = ['A', 'B', 'C'].map((n) => site(n, start));
  const oa = A.edit((d) => ((d.caption = 'Please join us for worship this week'), d));
  const ob = B.edit((d) => ((d.caption = 'Join us for worship and lunch this week'), d));
  const oc = C.edit((d) => ((d.caption = 'Join us for worship this week!'), d));
  A.receive(oc), A.receive(ob);
  B.receive(oa), B.receive(oc);
  C.receive(ob), C.receive(oa);
  assert.equal(A.doc.caption, 'Please join us for worship and lunch this week!');
  assert.deepEqual(A.doc, B.doc);
  assert.deepEqual(B.doc, C.doc);
});

test('short tokens (colours, ids) are plain last-writer-wins, never spliced', () => {
  const start = fromDoc({ fill: '#ff0000' });
  const A = site('A', start);
  const B = site('B', start);
  const oa = A.edit((d) => ((d.fill = '#00ff00'), d));
  const ob = B.edit((d) => ((d.fill = '#0000ff'), d));
  A.receive(ob);
  B.receive(oa);
  assert.deepEqual(A.doc, B.doc);
  assert.ok(['#00ff00', '#0000ff'].includes(A.doc.fill));
});

test('merge3Text: overlap goes to the newer side and is reported', () => {
  const r = merge3Text('hello world', 'hello there', 'hello friend', true);
  assert.equal(r.text, 'hello friend');
  assert.equal(merge3Text('hello world', 'hello there', 'hello friend', false).text, 'hello there');
  assert.equal(r.overlap, true);
  assert.equal(merge3Text('abc', 'abc', 'abXc', false).text, 'abXc');
});

test('concurrent inserts into a list interleave instead of clobbering', () => {
  const start = fromDoc(base());
  const A = site('A', start);
  const B = site('B', start);
  const oa = A.edit((d) => (d.frames.splice(1, 0, { id: 'fa', name: 'A page' }), d));
  const ob = B.edit((d) => (d.frames.push({ id: 'fb', name: 'B page' }), d));
  A.receive(ob);
  B.receive(oa);
  assert.deepEqual(A.doc, B.doc);
  assert.deepEqual(A.doc.frames.map((f: any) => f.id), ['f1', 'fa', 'f2', 'fb']);
});

test('editing a shape someone deleted brings it back (edit beats older delete), in either order', () => {
  const start = fromDoc(base());
  const A = site('A', start);
  const B = site('B', start);
  const del = A.edit((d) => ((d.devices.scene.objects = d.devices.scene.objects.filter((o: any) => o.id !== 'b')), d));
  // B edits after A deleted (later stamp)
  for (const o of del) observe(B.clock, o.s);
  const ed = B.edit((d) => ((d.devices.scene.objects[1].fill = '#abc'), d));
  const ra = A.receive(ed);
  assert.ok(ra.events.some((e) => e.kind === 'resurrected'));
  B.receive(del);
  assert.deepEqual(A.doc, B.doc);
  assert.equal(A.doc.devices.scene.objects.find((o: any) => o.id === 'b')?.fill, '#abc');
});

test('an older edit does not resurrect a newer delete', () => {
  const start = fromDoc(base());
  const A = site('A', start);
  const B = site('B', start);
  const ed = B.edit((d) => ((d.devices.scene.objects[1].fill = '#abc'), d));
  A.receive(ed);
  const del = A.edit((d) => ((d.devices.scene.objects = d.devices.scene.objects.filter((o: any) => o.id !== 'b')), d));
  B.receive(del);
  // replay the old edit (duplicate delivery after reconnect)
  A.receive(ed);
  B.receive(ed);
  assert.deepEqual(A.doc, B.doc);
  assert.equal(A.doc.devices.scene.objects.some((o: any) => o.id === 'b'), false);
});

test('ops are idempotent (offline outbox replays twice)', () => {
  const start = fromDoc(base());
  const A = site('A', start);
  const B = site('B', start);
  const oa = A.edit((d) => ((d.devices.scene.objects[0].text += '!'), (d.title = 'x'), d));
  B.receive(oa);
  const once = structuredClone(B.doc);
  B.receive(oa);
  B.receive(oa);
  assert.deepEqual(B.doc, once);
});

test('random concurrent edits from three sites converge whatever the delivery order', () => {
  for (let round = 0; round < 400; round++) {
    const start = fromDoc(base());
    const sites = ['A', 'B', 'C'].map((n) => site(n, start));
    const all: Op[][] = [];
    for (let step = 0; step < 6; step++) {
      const s = sites[Math.floor(Math.random() * 3)];
      all.push(s.edit((d) => randomEdit(d)));
      // sometimes deliver everything so far to a random site (partial sync)
      if (Math.random() < 0.3) for (const batch of all) sites[Math.floor(Math.random() * 3)].receive(batch);
    }
    for (const s of sites) for (const batch of shuffle([...all])) s.receive(batch);
    assert.ok(deepEqual(sites[0].doc, sites[1].doc) && deepEqual(sites[1].doc, sites[2].doc), `round ${round} diverged`);
  }
});

function randomEdit(d: any) {
  const objs = d.devices.scene.objects as any[];
  const r = Math.random();
  if (r < 0.25 && objs.length) objs[Math.floor(Math.random() * objs.length)].x = Math.floor(Math.random() * 100);
  else if (r < 0.4) objs.push({ id: `n${Math.random().toString(36).slice(2, 7)}`, kind: 'RECT', fill: '#fff', x: 1 });
  else if (r < 0.55 && objs.length > 1) objs.splice(Math.floor(Math.random() * objs.length), 1);
  else if (r < 0.7 && objs.length > 1) objs.push(objs.shift());
  else if (r < 0.7) d.pageDevices.push(`dev${Math.random().toString(36).slice(2, 6)}`);
  else if (r < 0.75 && d.pageDevices.length > 1) d.pageDevices.splice(Math.floor(Math.random() * d.pageDevices.length), 1);
  else if (r < 0.8) d.title = `T${Math.floor(Math.random() * 1000)}`;
  else {
    // prose typing at a random spot of a shared caption
    const n: string = d.frames[0].name;
    const at = Math.floor(Math.random() * (n.length + 1));
    d.frames[0].name = n.slice(0, at) + (Math.random() < 0.5 ? ' x' : 'yz') + n.slice(at);
  }
  return d;
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

test('coalesce keeps one write per path and chains text', () => {
  const ops: Op[] = [
    { k: 'txt', p: ['t'], from: 'a', to: 'ab', s: '1' },
    { k: 'set', p: ['x'], v: 1, s: '2' },
    { k: 'txt', p: ['t'], from: 'ab', to: 'abc', s: '3' },
    { k: 'set', p: ['x'], v: 2, s: '4' },
  ];
  const c = coalesce(ops);
  assert.equal(c.length, 2);
  assert.deepEqual(c[0], { k: 'txt', p: ['t'], from: 'a', to: 'abc', s: '3' });
  assert.deepEqual(c[1], { k: 'set', p: ['x'], v: 2, s: '4' });
});

test('draft overlay shows held edits on top of the live shared state', () => {
  const start = fromDoc(base());
  const A = site('A', start);
  const B = site('B', start);
  // A holds a draft edit; B keeps editing live
  const draft = diff(A.doc, { ...structuredClone(A.doc), title: 'Draft title' }, (start as any).meta, () => tick(newClock('A')));
  B.receive([]);
  const live = B.edit((d) => ((d.devices.scene.objects[0].fill = '#999'), (d.title = 'Live title'), d));
  A.receive(live);
  const view = overlay({ doc: A.doc, meta: (A as any).receive([]).state.meta }, draft) as any;
  assert.equal(view.title, 'Draft title');
  assert.equal(view.devices.scene.objects[0].fill, '#999');
});

test('merge3Json: two devices edited apart — both sets of changes land', () => {
  const b = base();
  const laptop = structuredClone(b);
  laptop.title = 'Flyer for Sunday';
  laptop.devices.scene.objects.push({ id: 'd', kind: 'RECT', fill: '#111', x: 5 });
  const phone = structuredClone(b);
  phone.frames[1].name = 'Back cover';
  phone.devices.scene.objects[0].text = 'Sunday service at nine, all welcome';
  const { merged, conflicts } = merge3Json(b, laptop, phone);
  assert.equal(merged.title, 'Flyer for Sunday');
  assert.equal(merged.frames[1].name, 'Back cover');
  assert.equal(merged.devices.scene.objects[0].text, 'Sunday service at nine, all welcome');
  assert.ok(merged.devices.scene.objects.some((o: any) => o.id === 'd'));
  assert.equal(conflicts.length, 0);
  const clash = merge3Json(b, { ...b, title: 'Mine' }, { ...b, title: 'Theirs' });
  assert.equal(clash.merged.title, 'Mine');
  assert.equal(clash.conflicts.length, 1);
});

test('lists of unique ids (a page’s devices, tags) merge per entry: two people adding both land', () => {
  const start = fromDoc(base());
  const A = site('A', start);
  const B = site('B', start);
  const oa = A.edit((d) => (d.pageDevices.push('chart'), d));
  const ob = B.edit((d) => ((d.pageDevices = ['img', ...d.pageDevices.filter((x: string) => x !== 'notes')]), d));
  A.receive(ob);
  B.receive(oa);
  assert.deepEqual(A.doc, B.doc);
  assert.deepEqual(A.doc.pageDevices, ['img', 'scene', 'chart']);
});
