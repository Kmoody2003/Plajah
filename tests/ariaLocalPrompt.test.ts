import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLocalChatMessages } from '../services/aria/ariaLocalPrompt';

const roles = (m: { role: string }[]) => m.map(x => x.role).join(',');

test('system first, then alternating user/assistant ending on the new user turn', () => {
  const msgs = buildLocalChatMessages({
    snapshot: null,
    history: [{ role: 'user', content: 'hi' }, { role: 'muse', content: 'hey!' }],
    userMessage: 'what can you do?',
  });
  assert.equal(roles(msgs), 'system,user,assistant,user');
  assert.match(msgs[0].content, /Aria/);
});

test('a failed reply leaves two user turns: they are merged so roles still alternate', () => {
  const msgs = buildLocalChatMessages({
    snapshot: null,
    history: [{ role: 'user', content: 'first question' }], // its reply failed and was filtered out
    userMessage: 'second question',
  });
  assert.equal(roles(msgs), 'system,user');
  assert.match(msgs[1].content, /first question[\s\S]*second question/);
});

test('system turn is never merged with anything', () => {
  const msgs = buildLocalChatMessages({ snapshot: null, history: [], userMessage: 'yo' });
  assert.equal(roles(msgs), 'system,user');
});

test('history is capped (default 8) and never mutates the caller\'s turns', () => {
  const history = Array.from({ length: 30 }, (_, i) => ({ role: (i % 2 ? 'muse' : 'user') as 'user' | 'muse', content: `m${i}` }));
  const copy = JSON.parse(JSON.stringify(history));
  const msgs = buildLocalChatMessages({ snapshot: null, history, userMessage: 'now' });
  assert.ok(msgs.length <= 1 + 8 + 1);
  assert.deepEqual(history, copy);
});
