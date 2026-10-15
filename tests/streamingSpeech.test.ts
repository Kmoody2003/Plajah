import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DeltaWordAssembler } from '../services/ambo/streamingOnnxTranscriber';

describe('DeltaWordAssembler', () => {
  it('emits stable word deltas monotonically without repeating interim hypotheses', () => {
    const asm = new DeltaWordAssembler();

    // Partial 1: speaker says "For God"
    const p1 = asm.partial('For God');
    assert.equal(p1, 'For');

    // Partial 2: speaker says "For God so loved"
    const p2 = asm.partial('For God so loved');
    assert.equal(p2, 'God so');

    // Partial 3: speaker says "For God so loved the"
    const p3 = asm.partial('For God so loved the');
    assert.equal(p3, 'loved');

    // Final: phrase completes "For God so loved the world."
    const f1 = asm.final('For God so loved the world.');
    assert.equal(f1, 'the world.');

    // Next utterance should start fresh
    const p4 = asm.partial('that He gave');
    assert.equal(p4, 'that He');
  });

  it('handles rapid short pauses and single-word utterances', () => {
    const asm = new DeltaWordAssembler();

    // Speaker just says "Hallelujah" and pauses
    const p1 = asm.partial('Hallelujah');
    assert.equal(p1, ''); // single word not yet finalized

    const f1 = asm.final('Hallelujah');
    assert.equal(f1, 'Hallelujah');
  });

  it('confirms repeated trailing word across consecutive passes and supports flushPending', () => {
    const asm = new DeltaWordAssembler();
    assert.equal(asm.partial('Romans chapter'), 'Romans');
    // Repeating the same partial confirms the trailing word immediately
    assert.equal(asm.partial('Romans chapter'), 'chapter');

    // Single trailing word flushed on brief pause
    assert.equal(asm.partial('Romans chapter eight'), '');
    assert.equal(asm.flushPending(), 'eight');
  });

  it('emits tail-word revisions when ASR refines the last emitted word', () => {
    const asm = new DeltaWordAssembler();
    assert.equal(asm.partial('John three six'), 'John three');
    assert.equal(asm.flushPending(), 'six');
    // Next pass refines "six" -> "sixteen" and pauses or stabilizes
    assert.equal(asm.partial('John three sixteen'), '');
    assert.equal(asm.flushPending(), 'sixteen');
  });
});

