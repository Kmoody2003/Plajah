// tests/omtSrtAvbMackie.test.ts — Unit tests for OMT, SRT, AVB, and Mackie MCU Mixer controller integration
// Run with: npx tsx --test tests/omtSrtAvbMackie.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  mcu14BitToGain,
  gainToMcu14Bit,
  gainToDb,
  dbToGain,
  mackieControl,
  type MixerTrackStrip
} from '../services/audio/mackieControlService';

import {
  avbService,
  type AvbStreamRoute
} from '../services/audio/avbService';

import {
  KIND_LABEL,
  NATIVE_ONLY,
  type SourceKind
} from '../services/mediaEngine/types';

describe('Mackie Control Universal (MCU) Protocol & Math Contracts', () => {
  test('14-bit pitch bend fader math correctly maps unity 0dB gain to center 8192', () => {
    // 0dB unity gain = 1.0
    const mcuValue = gainToMcu14Bit(1.0);
    assert.equal(mcuValue, 8192, 'Unity gain (1.0) must map exactly to MCU center 8192');

    const recoveredGain = mcu14BitToGain(8192);
    assert.ok(Math.abs(recoveredGain - 1.0) < 0.001, 'MCU center 8192 must recover to unity gain 1.0');
  });

  test('converts -∞ dB and silent cutoff accurately', () => {
    assert.equal(gainToMcu14Bit(0), 0);
    assert.equal(mcu14BitToGain(0), 0);
    assert.equal(mcu14BitToGain(50), 0, 'Values below threshold must snap to silent -∞');
  });

  test('converts +10dB boost to top 16383 ceiling', () => {
    const boostGain = dbToGain(10);
    const mcuVal = gainToMcu14Bit(boostGain);
    assert.ok(mcuVal >= 16380, 'Top +10dB boost must reach MCU ceiling ~16383');

    const recovered = mcu14BitToGain(16383);
    const recoveredDb = gainToDb(recovered);
    assert.ok(Math.abs(recoveredDb - 10.0) < 0.1, 'Ceiling 16383 must represent +10dB');
  });

  test('Mackie service bank management advances in blocks of 8 channels', () => {
    mackieControl.setTotalChannels(24);
    assert.equal(mackieControl.getState().bankOffset, 0);

    mackieControl.bankRight();
    assert.equal(mackieControl.getState().bankOffset, 8);

    mackieControl.bankRight();
    assert.equal(mackieControl.getState().bankOffset, 16);

    // Should not exceed totalChannels
    mackieControl.bankRight();
    assert.equal(mackieControl.getState().bankOffset, 16);

    mackieControl.bankLeft();
    assert.equal(mackieControl.getState().bankOffset, 8);
  });

  test('Mackie LCD scribble strip generates 8 blocks of 7 characters (56 chars total)', () => {
    while (mackieControl.getState().bankOffset > 0) mackieControl.bankLeft();
    const strips: MixerTrackStrip[] = [
      { id: '1', name: 'VOCAL', volumeGain: 1.0, pan: 0, mute: false, solo: false, armed: false, selected: false },
      { id: '2', name: 'KICK', volumeGain: 0.8, pan: 0, mute: false, solo: false, armed: false, selected: false },
    ];

    mackieControl.syncStripsToHardware(strips);
    const state = mackieControl.getState();

    assert.ok(state.lcdLine1.includes('VOCAL'), 'Line 1 must contain track name VOCAL');
    assert.ok(state.lcdLine1.includes('KICK'), 'Line 1 must contain track name KICK');
    assert.ok(state.lcdLine2.includes('0.0dB'), 'Line 2 must contain dB value');
  });
});

describe('Audio Video Bridging (AVB / IEEE 1722 / Milan) Service Contracts', () => {
  test('initializes with IEEE 802.1AS gPTP Grandmaster synchronization state', () => {
    const state = avbService.getState();
    assert.ok(state.clock.lockState === 'LOCKED', 'AVB clock should report locked PTP domain');
    assert.ok(state.clock.milanLocked, 'Milan profile should be verified');
    assert.ok(state.clock.jitterNs < 10, 'Jitter should be sub-10 nanoseconds for Milan compliance');
  });

  test('manages Talker and Listener stream routing', async () => {
    const talker = await avbService.addTalkerStream('Studio Stems Talker', 16, 48000);
    assert.equal(talker.direction, 'TALKER');
    assert.equal(talker.channels, 16);
    assert.equal(talker.sampleRate, 48000);
    assert.equal(talker.active, true);

    const listener = await avbService.connectListenerStream('00:0a:92:ff:fe:16:32:00', 'Stage Box Listener', 16, 48000);
    assert.equal(listener.direction, 'LISTENER');
    assert.equal(listener.entityId, '00:0a:92:ff:fe:16:32:00');

    // Clean up
    await avbService.removeStream(talker.id);
    await avbService.removeStream(listener.id);
  });
});

describe('Media Engine Protocol & SourceKind Registry', () => {
  test('OMT and SRT and AVB are registered in SourceKind and KIND_LABEL', () => {
    assert.equal(KIND_LABEL['omt' as SourceKind], 'OMT (LAN)');
    assert.equal(KIND_LABEL['srt' as SourceKind], 'SRT (WAN)');
    assert.equal(KIND_LABEL['avb' as SourceKind], 'AVB (Audio)');
  });

  test('OMT, SRT, and AVB are categorized in NATIVE_ONLY transport tiers', () => {
    assert.ok(NATIVE_ONLY.includes('omt' as SourceKind));
    assert.ok(NATIVE_ONLY.includes('srt' as SourceKind));
    assert.ok(NATIVE_ONLY.includes('avb' as SourceKind));
  });
});
