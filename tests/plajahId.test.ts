import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlajahId, parsePlajahId, isPlajahId, spellsBlockedWord, nextEvent, verifyChain, canonicalJson, seqDocId, type IdentityEvent } from '../services/plajahId/core';

describe('Plajah ID format', () => {
  it('person and org IDs are PJ-/PJO- plus three groups of four, with a valid check character', () => {
    const p = generatePlajahId('person');
    const o = generatePlajahId('org');
    assert.match(p, /^PJ-[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){2}$/);
    assert.match(o, /^PJO-[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){2}$/);
    assert.ok(isPlajahId(p) && isPlajahId(o));
    assert.equal(parsePlajahId(o)?.kind, 'org');
  });

  it('IDs are random, not derived from anything', () => {
    const seen = new Set(Array.from({ length: 2000 }, () => generatePlajahId('person')));
    assert.equal(seen.size, 2000);
  });

  it('typed variants normalize; look-alikes read as digits', () => {
    const id = generatePlajahId('person');
    assert.equal(parsePlajahId(id.toLowerCase().replace(/-/g, ' '))?.id, id);
    const withOh = id.replace(/0/g, 'O');
    assert.equal(parsePlajahId(withOh)?.id, id);
  });

  it('every single-character typo is caught', () => {
    const id = generatePlajahId('person');
    const body = id.slice(3).replace(/-/g, '');
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    for (let i = 0; i < body.length; i++) {
      for (const c of alphabet) {
        if (c === body[i]) continue;
        const typo = body.slice(0, i) + c + body.slice(i + 1);
        assert.equal(parsePlajahId(`PJ-${typo}`), null, `typo at ${i} → ${c} slipped through`);
      }
    }
  });

  it('rejects junk, including the old 16-character length', () => {
    for (const bad of ['', 'PJ-', 'XX-1234-5678-9ABC', 'PJ-1234', 'PJ-UUUU-UUUU-UUUU', 'PJ-1234-5678-9ABC-DEFG']) assert.equal(parsePlajahId(bad), null, bad);
  });

  it('offensive words are screened, as written and read as letters', () => {
    for (const w of ['XXSHXXXXXXXX', 'XFVCKXXXXXXX', 'XX455XXXXXXX', 'XXXXXXXN4Z1X', 'XXXXXX666XXX']) {
      const hit = spellsBlockedWord(w.replace('SHX', 'SHT'));
      assert.equal(hit, true, w);
    }
    assert.equal(spellsBlockedWord('7K3M9QXA2HFD'), false);
  });

  it('a draw that spells a blocked word is thrown away and drawn again', () => {
    // First draw spells "SEX…" (S=25, E=14, X=29 in the alphabet), second is clean.
    const draws = [[25, 14, 29, 0, 0, 0, 0, 0, 0, 0, 0], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]];
    let n = 0;
    const id = generatePlajahId('person', () => Uint8Array.from(draws[Math.min(n++, 1)]));
    assert.equal(n, 2);
    assert.ok(id.startsWith('PJ-1234-5678-9AB'), id);
    assert.ok(isPlajahId(id));
  });
});

describe('identity history', () => {
  const id = 'PJ-TEST-TEST-TEST-TEST';
  const build = (): IdentityEvent[] => {
    const a = nextEvent(id, null, 'created', 'system', { kind: 'person' }, 1000);
    const b = nextEvent(id, a, 'login_linked', id, { uid: 'u1', provider: 'google.com' }, 2000);
    const c = nextEvent(id, b, 'login_linked', id, { uid: 'u2', provider: 'password' }, 3000);
    return [a, b, c];
  };

  it('a fresh chain verifies and links each event to the one before', () => {
    const ev = build();
    assert.deepEqual(verifyChain(id, ev), { ok: true });
    assert.equal(ev[0].prevHash, '');
    assert.equal(ev[2].prevHash, ev[1].hash);
    assert.equal(seqDocId(ev[2].seq), '00000002');
  });

  it('editing a past event is detected', () => {
    const ev = build();
    ev[1] = { ...ev[1], data: { uid: 'attacker', provider: 'google.com' } };
    const r = verifyChain(id, ev);
    assert.equal(r.ok, false);
    assert.equal((r as any).brokenAt, 1);
  });

  it('re-hashing an edited event still breaks the next link', () => {
    const ev = build();
    const forged = nextEvent(id, ev[0], 'login_linked', id, { uid: 'attacker' }, 2000);
    ev[1] = forged;
    const r = verifyChain(id, ev);
    assert.equal(r.ok, false);
    assert.equal((r as any).brokenAt, 2);
  });

  it('deleting an event is detected', () => {
    const ev = build();
    ev.splice(1, 1);
    assert.equal(verifyChain(id, ev).ok, false);
  });

  it('a chain copied to another ID does not verify there', () => {
    assert.equal(verifyChain('PJ-OTHR-OTHR-OTHR-OTHR', build()).ok, false);
  });

  it('canonical JSON ignores key order', () => {
    assert.equal(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] } }), canonicalJson({ a: { c: [3, { e: 0, f: 1 }], d: 2 }, b: 1 }));
  });
});
