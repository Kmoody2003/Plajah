import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// @ts-expect-error — plain .mjs build scripts
import { minifyRules } from '../scripts/minifyRules.mjs';
// @ts-expect-error — plain .mjs build scripts
import { compactRules, expandRules, allowSet, tokensOf } from '../scripts/compactRules.mjs';

const same = (src: string) => {
  const { out, meta } = compactRules(src);
  const a = allowSet(src), b = allowSet(expandRules(out, meta));
  assert.equal(b.rest, a.rest, 'non-allow tokens differ after expand');
  assert.deepEqual(b.grants, a.grants, 'grants differ after expand');
  return out as string;
};
const wrap = (body: string) => `rules_version = '2';\nservice cloud.firestore {\nmatch /databases/{database}/documents {\n${body}\n}\n}\n`;

test('the real firestore.rules compacts to the same grants', () => {
  const min = minifyRules(readFileSync('firestore.rules', 'utf8'));
  const out = same(min);
  assert.ok(Buffer.byteLength(out) < Buffer.byteLength(min) * 0.75, 'expected a meaningful size reduction');
});

test('a nested function shadowing a top-level name is never pulled into a top-level template', () => {
  const src = wrap([
    'function owner(d) { return request.auth != null && d.ownerId == request.auth.uid; }',
    'match /a/{id} { function owner(d) { return d.editors.hasAny([request.auth.uid]); }',
    '  allow update: if owner(resource.data) && request.resource.data.title is string && request.resource.data.title.size() < 100;',
    '  allow create: if owner(request.resource.data) && request.resource.data.title is string && request.resource.data.title.size() < 100; }',
    'match /b/{id} { allow update: if owner(resource.data) && request.resource.data.title is string && request.resource.data.title.size() < 100; }',
  ].join('\n'));
  same(src);
  // Textual expansion can't see scope, so check the rule directly: no top-level template may call
  // `owner`, because inside /a that name means the nested definition.
  const { meta } = compactRules(src);
  const short = meta.fnMap.get('owner');
  for (const t of meta.templates) assert.ok(!tokensOf(t.body).includes(short), `template ${t.name} calls the shadowed owner()`);
});

test('let bindings and ternaries survive renaming', () => {
  same(wrap([
    'function score(d) { let base = d.points; return base > 10 ? base : 0; }',
    'match /users/{userId} { allow read: if request.auth.uid == userId || score(resource.data) > 5;',
    '  match /posts/{postId} { allow write: if request.auth.uid == userId && postId.size() < 40; } }',
  ].join('\n')));
});

test('identical allows merge and false allows drop without emptying a block', () => {
  const out = same(wrap([
    'match /x/{id} { allow read: if request.auth != null; allow update: if request.auth != null; allow delete: if false; }',
    'match /locked/{id} { allow read, write: if false; }',
  ].join('\n')));
  assert.match(out, /allow read, update: if/);
  assert.match(out, /match \/locked\/\{\w+\} \{ allow get: if false; \}/);
});

test('generated names never collide with reserved words', () => {
  const fns = Array.from({ length: 400 }, (_, i) => `function longHelperName${i}() { return request.auth != null; }`).join('\n');
  const uses = Array.from({ length: 400 }, (_, i) => `match /c${i}/{docId${i}} { allow read: if longHelperName${i}() && docId${i}.size() > 0; }`).join('\n');
  const out = same(wrap(fns + '\n' + uses));
  for (const bad of ['for', 'var', 'if', 'in', 'is', 'do', 'new', 'let']) assert.ok(!new RegExp(`function ${bad}\\(`).test(out), bad);
});
