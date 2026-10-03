import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  generateTicketSecurityProof,
  bindEventTo3DTicket,
  type Interactive3DTicketConfig,
} from '../services/tela/interactive3dTicketService';
import {
  generateInteractivePassShareUrl,
  buildStandalone3DPassHtml,
} from '../services/tela/ticketShareExportService';

describe('interactive 3d ticket service', () => {
  const dummyConfig: Interactive3DTicketConfig = {
    eventId: 'evt-2077',
    projectId: 'proj-voltage-rising',
    projectTitle: 'Voltage Rising Master Suite',
    eventTitle: 'Futura Fest 2077',
    artistName: 'Mira Sol',
    venueName: 'Neo-Kyoto Dome',
    city: 'Neo-Kyoto',
    dateTime: 'NOV 10 2077',
    tierName: 'VIP KINETIC',
    ticketNumber: 'PLJ-770349',
    holderName: 'Alex Mercer',
    seatInfo: 'ROW A · SEAT 01',
    status: 'ACTIVE',
    palette: ['#040a0e', '#00ff66', '#ff2255', '#00d4ff'],
    hologramIntensity: 0.85,
    themeId: 'bold-ticket-signal',
    mode: 'ticket',
    packages: [
      { name: 'VIP Soundcheck', total: 1, remaining: 1, unit: 'Pass' },
    ],
  };

  it('generates cryptographic security proof with dynamic nonce and verification url', () => {
    const proof = generateTicketSecurityProof(dummyConfig, 1720000000000);
    assert.equal(proof.ticketNumber, 'PLJ-770349');
    assert.equal(proof.eventId, 'evt-2077');
    assert.equal(proof.projectId, 'proj-voltage-rising');
    assert.ok(proof.hash.length >= 8);
    assert.ok(proof.nonce.length >= 8);
    assert.ok(proof.qrPayload.includes('plajah://verify'));
    assert.ok(proof.qrPayload.includes('evt-2077'));
    assert.ok(proof.qrPayload.includes('PLJ-770349'));
  });

  it('updates proof nonce on time window transitions to prevent screenshot reuse', () => {
    const proof1 = generateTicketSecurityProof(dummyConfig, 100000);
    const proof2 = generateTicketSecurityProof(dummyConfig, 120000);
    assert.notEqual(proof1.nonce, proof2.nonce);
    assert.notEqual(proof1.hash, proof2.hash);
  });

  it('binds PlajahEvent and Project into complete 3D ticket config', () => {
    const bound = bindEventTo3DTicket(
      {
        id: 'evt-live',
        title: 'Bioluminescent Abyss',
        creatorName: 'The Ocean Council',
        venueName: 'Mariana Trench Lab',
        city: 'Sub-Pacific',
        tiers: [{ id: 't1', name: 'Benthic VIP', priceCents: 5000, capacity: 100, soldCount: 10 }],
      },
      'proj-oceanic-swell',
      'Oceanic Leviathan Swell',
      'Dr. Aris Thorne',
      'PLJ-889922'
    );

    assert.equal(bound.eventId, 'evt-live');
    assert.equal(bound.projectId, 'proj-oceanic-swell');
    assert.equal(bound.eventTitle, 'Bioluminescent Abyss');
    assert.equal(bound.artistName, 'The Ocean Council');
    assert.equal(bound.holderName, 'Dr. Aris Thorne');
    assert.equal(bound.tierName, 'Benthic VIP');
    assert.equal(bound.status, 'ACTIVE');
  });

  it('generates shareable hash URLs with encoded proof tokens', () => {
    const url = generateInteractivePassShareUrl(dummyConfig, 'https://plajah.app');
    assert.ok(url.startsWith('https://plajah.app/pass#'));
    assert.ok(url.includes('e=evt-2077'));
    assert.ok(url.includes('t=PLJ-770349'));
    assert.ok(url.includes('hash='));
    assert.ok(url.includes('nonce='));
  });

  it('builds self-contained standalone 3D pass HTML documents', () => {
    const html = buildStandalone3DPassHtml(dummyConfig);
    assert.ok(html.includes('<!doctype html>'));
    assert.ok(html.includes('PLAJAH · VERIFIED 3D PASS'));
    assert.ok(html.includes('Futura Fest 2077'));
    assert.ok(html.includes('btn-gyro'));
    assert.ok(html.includes('DeviceOrientationEvent'));
    assert.ok(html.includes('canvas3d'));
  });
});
