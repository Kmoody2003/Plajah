import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingCallShows, queueCallShow, acknowledgeCallShow } from '../services/ambo/liveCallShows';
import type { Show } from '../services/ambo/showModel';

test('Ambo receives queued call shows after opening, isolates users, and replaces stale handoffs', () => {
  const oldWindow = (globalThis as any).window;
  const oldStorage = (globalThis as any).sessionStorage;
  const saved = new Map<string, string>(); const events: Show[] = [];
  Object.assign(globalThis, { window: { dispatchEvent: (event: CustomEvent) => events.push(event.detail) }, sessionStorage: { getItem: (key: string) => saved.get(key) || null, setItem: (key: string, value: string) => saved.set(key, value) } });
  try {
    const show: Show = { id: 'chat_show_handoff_test', title: 'Interview', kind: 'PRESENTATION', slides: [{ id: 'group', layers: [{ id: 'video', slot: 'slide', content: { kind: 'LIVE', inputId: 'chat:handoff:group' } }] }] };
    queueCallShow('alice-handoff-test', show);
    assert.equal(pendingCallShows('alice-handoff-test').length, 1);
    assert.deepEqual(pendingCallShows('bob-handoff-test'), []);
    queueCallShow('alice-handoff-test', { ...show, title: 'Updated interview' });
    assert.equal(pendingCallShows('alice-handoff-test').length, 1);
    assert.equal(pendingCallShows('alice-handoff-test')[0].title, 'Updated interview');
    assert.equal(events.length, 2);
    acknowledgeCallShow('alice-handoff-test', show.id);
    assert.deepEqual(pendingCallShows('alice-handoff-test'), []);
    assert.equal(saved.get('plajah:ambo:pending-call-shows:alice-handoff-test'), '[]');
  } finally {
    if (oldWindow === undefined) delete (globalThis as any).window; else (globalThis as any).window = oldWindow;
    if (oldStorage === undefined) delete (globalThis as any).sessionStorage; else (globalThis as any).sessionStorage = oldStorage;
  }
});
