// amboSignageAndLed.test.ts — Comprehensive tests for Ambo LED Wall, Samsung MDC, Bus Clearing & Audio Cue
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  type Slide, type SlideLayer, newId, applySlide, textSlide,
  clearBusLayer, clearBusAll, resetBusClearing, isBusLayerCleared, stackForBus,
  type LiveStack, type LayerSlot
} from '../services/ambo/showModel';
import { slideToTela, telaToSlide } from '../services/ambo/telaSlide';
import {
  calculateLedWallMetrics, encodeMdcFrame, decodeMdcFrame,
  MDC_CMD, MDC_INPUTS, COMMON_CABINET_SPECS, DEFAULT_SIGNAGE_CHANNELS
} from '../services/ambo/signageAndLedService';
import { platformAudio } from '../services/mediaEngine/audioRuntime';

describe('LED Wall Mapping & Port Budgeting Engine', () => {
  test('accurately computes pixel dimensions, physical sizing, and aspect ratio', () => {
    const spec = COMMON_CABINET_SPECS['p2.5-500x500'];
    const metrics = calculateLedWallMetrics({
      cols: 8,
      rows: 4,
      cabinetSpec: spec,
      daisyChainPattern: 'S_CURVE',
      maxPixelsPerPort: 655360,
    });

    // 8 cols * 200 px = 1600 px width
    assert.equal(metrics.totalWidthPx, 1600);
    // 4 rows * 200 px = 800 px height
    assert.equal(metrics.totalHeightPx, 800);
    assert.equal(metrics.totalPixels, 1600 * 800); // 1,280,000 px

    // Physical dimensions: 8 * 500mm = 4.0m, 4 * 500mm = 2.0m
    assert.equal(metrics.physicalWidthM, 4.0);
    assert.equal(metrics.physicalHeightM, 2.0);
    assert.equal(metrics.aspectRatio, '2:1');

    // Total cabinets
    assert.equal(metrics.totalCabinets, 32);

    // Sender port budgeting (~655,360 px per 1Gbps RJ45 port)
    // 1,280,000 px / 655,360 = ~1.95 -> requires 2 ports
    assert.equal(metrics.portsRequired, 2);
  });

  test('correctly warns and computes additional ports for fine-pitch walls', () => {
    const spec = COMMON_CABINET_SPECS['p1.5-600x337']; // 384x216 per 600x337.5mm cabinet
    const metrics = calculateLedWallMetrics({
      cols: 6,
      rows: 4,
      cabinetSpec: spec,
      daisyChainPattern: 'S_CURVE',
      maxPixelsPerPort: 655360,
    });

    // 6 * 384 = 2304 px width, 4 * 216 = 864 px height
    assert.equal(metrics.totalWidthPx, 2304);
    assert.equal(metrics.totalHeightPx, 864);
    assert.equal(metrics.totalPixels, 2304 * 864); // 1,990,656 px
    // 1,990,656 / 655,360 = 3.03 -> 4 ports
    assert.equal(metrics.portsRequired, 4);
    assert.ok(metrics.portAllocations.length >= 4);
  });
});

describe('Samsung SMART Signage (SSSP / MDC) Protocol', () => {
  test('encodes MDC binary frames with correct 0xAA header, byte structure, and checksum', () => {
    // Test Power Status Query: cmd=0x11, id=0x01, data=[]
    const frame = encodeMdcFrame(MDC_CMD.POWER, 1, []);
    assert.equal(frame[0], 0xAA); // Header
    assert.equal(frame[1], 0x11); // Power command
    assert.equal(frame[2], 0x01); // Device ID 1
    assert.equal(frame[3], 0x00); // Data length = 0
    // Checksum = (0x11 + 0x01 + 0x00) & 0xFF = 0x12
    assert.equal(frame[4], 0x12);
  });

  test('encodes MDC command with payload data (e.g. Power ON = 0x01)', () => {
    const frame = encodeMdcFrame(MDC_CMD.POWER, 1, [0x01]);
    assert.equal(frame[0], 0xAA);
    assert.equal(frame[1], 0x11);
    assert.equal(frame[2], 0x01);
    assert.equal(frame[3], 0x01); // 1 byte data
    assert.equal(frame[4], 0x01); // Data: ON
    // Checksum = (0x11 + 0x01 + 0x01 + 0x01) & 0xFF = 0x14
    assert.equal(frame[5], 0x14);
  });

  test('decodes MDC response frame correctly and verifies ACK/NAK', () => {
    // Simulated Samsung response: [0xAA, 0xFF, ID=1, DataLen=3, 'A'(0x41), cmd=0x11, val=0x01, Checksum]
    const header = 0xAA;
    const cmd = 0xFF;
    const id = 0x01;
    const len = 0x03;
    const ack = 0x41; // 'A' = ACK
    const origCmd = 0x11;
    const val = 0x01;
    const chk = (cmd + id + len + ack + origCmd + val) & 0xFF;
    const buffer = new Uint8Array([header, cmd, id, len, ack, origCmd, val, chk]);

    const decoded = decodeMdcFrame(buffer);
    assert.ok(decoded.valid);
    assert.equal(decoded.deviceId, 1);
    assert.equal(decoded.ack, true);
    assert.equal(decoded.data[0], 0x11);
    assert.equal(decoded.data[1], 0x01);
  });
});

describe('Ambo Slide Layering with Tela Parity & Default Text Layer Off', () => {
  test('textSlide with defaultEnabled: false generates disabled/invisible text layer', () => {
    const slide = textSlide('Clean Media Slide', { label: 'Subtitle', defaultEnabled: false });
    const textLayer = slide.layers.find(l => l.content.kind === 'TEXT');
    assert.ok(textLayer);
    assert.equal(textLayer.enabled, false);
    assert.equal(textLayer.visible, false);
  });

  test('slideToTela and telaToSlide preserves layer ordering and metadata', () => {
    const slide: Slide = {
      id: 'sl_roundtrip',
      label: 'Multilayer Slide',
      layers: [
        {
          id: 'ly_bg',
          slot: 'background',
          enabled: true,
          visible: true,
          zIndex: 0,
          opacity: 1,
          blendMode: 'normal',
          content: { kind: 'GENERATOR', mode: 'STUDIO_AURORA' }
        },
        {
          id: 'ly_text',
          slot: 'slide',
          enabled: false,
          visible: false,
          zIndex: 10,
          opacity: 0.9,
          blendMode: 'screen',
          content: { kind: 'TEXT', blocks: [{ text: 'Welcome', role: 'title' }] }
        }
      ]
    };

    const telaDoc = slideToTela(slide);
    assert.ok(telaDoc.frames.length >= 1);

    const roundtripSlide = telaToSlide(telaDoc, slide);
    assert.equal(roundtripSlide.layers.length, slide.layers.length);
    assert.equal(roundtripSlide.layers[0].slot, 'background');
    assert.equal(roundtripSlide.layers[1].slot, 'slide');
    assert.equal(roundtripSlide.layers[1].enabled, false);
    assert.equal(roundtripSlide.layers[1].visible, false);
  });
});

describe('Bus Clearing Architecture', () => {
  test('per-bus clearing clears targeted layers without mutating Program Out stack', () => {
    const programLive: LiveStack = {
      slide: { id: 'l1', slot: 'slide', since: Date.now(), content: { kind: 'TEXT', blocks: [{ text: 'Praise' }] } },
      background: { id: 'l2', slot: 'background', since: Date.now(), content: { kind: 'GENERATOR', mode: 'STUDIO_AURORA' } },
      scripture: { reference: 'John 3:16', text: 'For God so loved the world...', translation: 'KJV' }
    };

    // Aux bus: Lobby / Signage (wants to clear slide text but keep background)
    let lobbyCleared = new Set<LayerSlot>();
    lobbyCleared = clearBusLayer(lobbyCleared, 'slide');
    assert.equal(isBusLayerCleared(lobbyCleared, 'slide'), true);
    assert.equal(isBusLayerCleared(lobbyCleared, 'background'), false);

    const lobbyStack = stackForBus(programLive, ['background', 'slide', 'scripture'], lobbyCleared);
    assert.equal(lobbyStack.slide, undefined); // Cleared on lobby bus
    assert.ok(lobbyStack.background); // Preserved on lobby bus
    assert.ok(lobbyStack.scripture); // Preserved on lobby bus

    // Program Out stack remains completely intact
    assert.ok(programLive.slide);
    assert.ok(programLive.background);
    assert.ok(programLive.scripture);

    // Resetting bus restores layers
    lobbyCleared = resetBusClearing();
    assert.equal(isBusLayerCleared(lobbyCleared, 'slide'), false);
    const restoredLobby = stackForBus(programLive, ['background', 'slide', 'scripture'], lobbyCleared);
    assert.ok(restoredLobby.slide);
  });
});

describe('Dual-Bus Audio Routing & Cue Isolation', () => {
  test('platform audio separates cue bus and guarantees cue isolation from main out', () => {
    const mainBus = platformAudio.mainBus('test_engine');
    const cueBus = platformAudio.cueBus('test_engine');

    assert.ok(mainBus);
    assert.ok(cueBus);
    assert.notEqual(mainBus, cueBus);
    assert.equal(platformAudio.isCueIsolated(), true);
  });
});
