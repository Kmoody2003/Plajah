/**
 * buildCarsArgillaCad.ts — Models all 23 Apex Elohim vehicles from their design sheets
 * and 360° turntable videos using Plajah's Argilla Hard-Surface SDF + CAD stack.
 *
 * Usage:
 *   node ./node_modules/tsx/dist/cli.mjs scripts/buildCarsArgillaCad.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import type { HardPart, ProfileStation } from '../services/argilla/hardSurface';
import { buildCarCadModel, packCadModelToGlb, type CarCadBlueprint } from '../services/cad/carCadBuilder';

const OUT_DIR = path.resolve(process.cwd(), 'games/apex/assets-src/cars');

function wheelWellCarves(trackWidth: number, wheelRadius: number, frontZ: number, rearZ: number, archClearance = 0.09): HardPart[] {
  const r = wheelRadius + archClearance;
  const x = trackWidth * 0.5;
  return [
    { op: 'carve', kind: 'cylX', center: [x, wheelRadius, frontZ], size: [r, 0.30, 0], round: 0.03, mirror: true },
    { op: 'carve', kind: 'cylX', center: [x, wheelRadius, rearZ], size: [r, 0.30, 0], round: 0.03, mirror: true },
  ];
}

function fenderFlares(trackWidth: number, wheelRadius: number, frontZ: number, rearZ: number, flareW = 0.08): HardPart[] {
  const x = trackWidth * 0.5 + 0.06;
  const r = wheelRadius + 0.09;
  return [
    { op: 'add', kind: 'cylX', center: [x, wheelRadius + 0.02, frontZ], size: [r, flareW, 0], round: 0.02, blend: 0.03, mirror: true },
    { op: 'add', kind: 'cylX', center: [x, wheelRadius + 0.02, rearZ], size: [r, flareW, 0], round: 0.02, blend: 0.03, mirror: true },
    { op: 'carve', kind: 'cylX', center: [x, wheelRadius, frontZ], size: [wheelRadius + 0.05, flareW + 0.06, 0], round: 0.02, mirror: true },
    { op: 'carve', kind: 'cylX', center: [x, wheelRadius, rearZ], size: [wheelRadius + 0.05, flareW + 0.06, 0], round: 0.02, mirror: true },
  ];
}

const coupeBody = (halfW: number, noseY = 0.72, beltY = 0.94, deckY = 0.98, ducktail = 0.05): ProfileStation[] => [
  { z: -2.30, yBot: 0.26, yTop: deckY + ducktail, halfW: halfW * 0.86, tumble: 0.90, crown: 0.02, bevel: 0.06 },
  { z: -2.05, yBot: 0.20, yTop: deckY, halfW: halfW * 0.95, tumble: 0.88, crown: 0.03, bevel: 0.07 },
  { z: -1.40, yBot: 0.16, yTop: beltY + 0.03, halfW: halfW * 1.01, tumble: 0.86, crown: 0.04, bevel: 0.07 },
  { z: -0.35, yBot: 0.15, yTop: beltY, halfW: halfW * 0.96, tumble: 0.88, crown: 0.04, bevel: 0.07 },
  { z: 0.70, yBot: 0.15, yTop: beltY - 0.02, halfW: halfW * 0.98, tumble: 0.88, crown: 0.04, bevel: 0.07 },
  { z: 1.55, yBot: 0.16, yTop: beltY - 0.08, halfW: halfW * 0.97, tumble: 0.86, crown: 0.04, bevel: 0.07 },
  { z: 2.12, yBot: 0.18, yTop: noseY, halfW: halfW * 0.88, tumble: 0.84, crown: 0.03, bevel: 0.07 },
  { z: 2.32, yBot: 0.22, yTop: noseY - 0.12, halfW: halfW * 0.74, tumble: 0.82, crown: 0.02, bevel: 0.06 },
];

const midEngineBody = (halfW: number): ProfileStation[] => [
  { z: -2.26, yBot: 0.22, yTop: 0.92, halfW: halfW * 0.90, tumble: 0.88, crown: 0.02, bevel: 0.06 },
  { z: -1.85, yBot: 0.16, yTop: 0.96, halfW: halfW * 1.01, tumble: 0.85, crown: 0.04, bevel: 0.07 },
  { z: -0.95, yBot: 0.14, yTop: 0.94, halfW: halfW * 1.00, tumble: 0.84, crown: 0.04, bevel: 0.07 },
  { z: 0.10, yBot: 0.14, yTop: 0.88, halfW: halfW * 0.96, tumble: 0.86, crown: 0.03, bevel: 0.07 },
  { z: 1.15, yBot: 0.14, yTop: 0.82, halfW: halfW * 0.97, tumble: 0.84, crown: 0.03, bevel: 0.07 },
  { z: 1.92, yBot: 0.15, yTop: 0.64, halfW: halfW * 0.88, tumble: 0.80, crown: 0.02, bevel: 0.06 },
  { z: 2.26, yBot: 0.18, yTop: 0.48, halfW: halfW * 0.72, tumble: 0.78, crown: 0.02, bevel: 0.05 },
];

const fastbackCanopy = (halfW: number, roofY = 1.29, zRear = -1.55, zFront = 0.75): ProfileStation[] => [
  { z: zRear, yBot: 0.88, yTop: 0.98, halfW: halfW * 0.68, tumble: 0.76, crown: 0.02, bevel: 0.05 },
  { z: zRear + 0.52, yBot: 0.88, yTop: roofY - 0.03, halfW: halfW * 0.72, tumble: 0.78, crown: 0.04, bevel: 0.06 },
  { z: (zRear + zFront) * 0.5 - 0.1, yBot: 0.88, yTop: roofY, halfW: halfW * 0.73, tumble: 0.78, crown: 0.05, bevel: 0.06 },
  { z: zFront - 0.55, yBot: 0.86, yTop: roofY - 0.02, halfW: halfW * 0.71, tumble: 0.78, crown: 0.04, bevel: 0.06 },
  { z: zFront, yBot: 0.84, yTop: 0.92, halfW: halfW * 0.68, tumble: 0.76, crown: 0.02, bevel: 0.05 },
];

const BLUEPRINTS: CarCadBlueprint[] = [
  // 1. Kestrel Sovereign GT-R — Burnt Orange Front-Mid V8 GT
  {
    id: 'kestrel',
    name: 'Kestrel Sovereign GT-R',
    paintHex: '#c24d12',
    accentHex: '#d9a424',
    caliperHex: '#d9a424',
    rimHex: '#4a505c',
    rimStyle: 'multi',
    length: 4.66,
    width: 1.96,
    wheelbase: 2.74,
    trackWidth: 1.68,
    wheelRadius: 0.35,
    bodyParts: [
      { op: 'add', kind: 'profile', center: [0, 0, 0], size: [0, 0, 0], stations: coupeBody(0.96, 0.72, 0.93, 0.97, 0.07), round: 0.04 },
      // Twin hood vent carves & side fender louvers
      { op: 'carve', kind: 'box', center: [0.34, 0.87, 1.48], size: [0.16, 0.04, 0.24], round: 0.02, rotX: 0.14, mirror: true },
      { op: 'carve', kind: 'box', center: [0.94, 0.62, 0.88], size: [0.06, 0.18, 0.08], round: 0.02, rotX: -0.25, mirror: true },
      // Front grille intake carve
      { op: 'carve', kind: 'box', center: [0, 0.44, 2.30], size: [0.58, 0.13, 0.08], round: 0.03 },
      ...wheelWellCarves(1.68, 0.35, 1.37, -1.37),
    ],
    canopyParts: [
      { op: 'add', kind: 'profile', center: [0, 0, 0], size: [0, 0, 0], stations: fastbackCanopy(0.96, 1.28, -1.62, 0.68), round: 0.03 },
    ],
    carbonParts: [
      { op: 'add', kind: 'box', center: [0, 0.16, 2.24], size: [0.90, 0.03, 0.18], round: 0.015 },
      { op: 'add', kind: 'box', center: [0.92, 0.17, 0], size: [0.08, 0.03, 1.12], round: 0.015, mirror: true },
      { op: 'add', kind: 'box', center: [0, 0.23, -2.20], size: [0.80, 0.09, 0.15], round: 0.02 },
      // 5-fin rear diffuser
      { op: 'add', kind: 'box', center: [0, 0.20, -2.26], size: [0.02, 0.09, 0.14], round: 0.008 },
      { op: 'add', kind: 'box', center: [0.28, 0.20, -2.26], size: [0.02, 0.09, 0.14], round: 0.008, mirror: true },
      { op: 'add', kind: 'box', center: [0.56, 0.20, -2.26], size: [0.02, 0.09, 0.14], round: 0.008, mirror: true },
    ],
    headlights: [{ x: 0.68, y: 0.64, z: 2.24, halfW: 0.18, halfH: 0.035, color: '#eef6ff', mirror: true }],
    taillights: [
      { x: 0.56, y: 0.80, z: -2.29, halfW: 0.24, halfH: 0.022, color: '#ff2222', mirror: true },
      { x: 0.56, y: 0.74, z: -2.29, halfW: 0.20, halfH: 0.018, color: '#ff2222', mirror: true },
    ],
    exhausts: [
      { x: 0.54, y: 0.24, z: -2.28, r: 0.048, mirror: true },
      { x: 0.66, y: 0.24, z: -2.28, r: 0.048, mirror: true },
    ],
  },

  // 2. Aurelia Zephyr Apex — Cerulean Blue Mid-Engine Track Coupe
  {
    id: 'aurelia',
    name: 'Aurelia Zephyr Apex',
    paintHex: '#1463b8',
    accentHex: '#00e5ff',
    caliperHex: '#00e5ff',
    rimHex: '#2e3440',
    rimStyle: 'multi',
    length: 4.54,
    width: 1.99,
    wheelbase: 2.66,
    trackWidth: 1.72,
    wheelRadius: 0.35,
    bodyParts: [
      { op: 'add', kind: 'profile', center: [0, 0, 0], size: [0, 0, 0], stations: midEngineBody(0.98), round: 0.04 },
      // Deep side engine intake carves
      { op: 'carve', kind: 'box', center: [0.95, 0.62, -0.52], size: [0.16, 0.20, 0.42], round: 0.04, rotY: 0.14, mirror: true },
      { op: 'carve', kind: 'box', center: [0, 0.36, 2.20], size: [0.62, 0.12, 0.10], round: 0.03 },
      ...wheelWellCarves(1.72, 0.35, 1.33, -1.33),
    ],
    canopyParts: [
      { op: 'add', kind: 'profile', center: [0, 0, 0], size: [0, 0, 0], stations: fastbackCanopy(0.92, 1.19, -0.82, 1.16), round: 0.03 },
    ],
    carbonParts: [
      { op: 'add', kind: 'box', center: [0, 0.15, 2.18], size: [0.92, 0.025, 0.20], round: 0.012 },
      { op: 'add', kind: 'box', center: [0.94, 0.16, 0], size: [0.08, 0.03, 1.08], round: 0.015, mirror: true },
      { op: 'add', kind: 'box', center: [0, 0.22, -2.18], size: [0.84, 0.10, 0.16], round: 0.02 },
    ],
    accentParts: [
      { op: 'add', kind: 'box', center: [0.95, 0.18, 0.05], size: [0.03, 0.025, 0.96], round: 0.01, mirror: true },
    ],
    wing: { z: -2.08, y: 1.24, halfW: 0.90, chord: 0.28, endplateH: 0.18, pylonStyle: 'swan' },
    headlights: [{ x: 0.66, y: 0.52, z: 2.16, halfW: 0.16, halfH: 0.032, color: '#e6f7ff', mirror: true }],
    taillights: [{ x: 0.60, y: 0.78, z: -2.25, halfW: 0.24, halfH: 0.028, color: '#ff1e2d', mirror: true }],
    exhausts: [{ x: 0.12, y: 0.36, z: -2.26, r: 0.05, mirror: true }],
  },

  // 3. Meridian Ironhide 440 — Midnight Blue Retro-Modern Muscle Coupe
  {
    id: 'ironhide',
    name: 'Meridian Ironhide 440',
    paintHex: '#172c4e',
    accentHex: '#eef2f7',
    caliperHex: '#d92027',
    rimHex: '#252932',
    rimStyle: 'six',
    length: 4.82,
    width: 1.96,
    wheelbase: 2.78,
    trackWidth: 1.66,
    wheelRadius: 0.35,
    bodyParts: [
      { op: 'add', kind: 'profile', center: [0, 0, 0], size: [0, 0, 0], stations: coupeBody(0.95, 0.84, 0.96, 1.00, 0.04), round: 0.04 },
      // Shaker hood scoop
      { op: 'add', kind: 'box', center: [0, 0.98, 1.40], size: [0.28, 0.08, 0.52], round: 0.03, blend: 0.04 },
      ...wheelWellCarves(1.66, 0.35, 1.39, -1.39),
    ],
    canopyParts: [
      { op: 'add', kind: 'profile', center: [0, 0, 0], size: [0, 0, 0], stations: fastbackCanopy(0.92, 1.32, -1.38, 0.55), round: 0.03 },
    ],
    carbonParts: [
      ...fenderFlares(1.66, 0.35, 1.39, -1.39, 0.07),
      { op: 'add', kind: 'box', center: [0, 0.72, 2.31], size: [0.68, 0.10, 0.04], round: 0.015 },
    ],
    accentParts: [
      // Dual white racing stripes
      { op: 'add', kind: 'box', center: [0.16, 0.91, 1.50], size: [0.10, 0.02, 0.78], round: 0.008, mirror: true },
      { op: 'add', kind: 'box', center: [0.16, 1.33, -0.45], size: [0.10, 0.02, 0.65], round: 0.008, mirror: true },
      { op: 'add', kind: 'box', center: [0.16, 1.01, -1.85], size: [0.10, 0.02, 0.42], round: 0.008, mirror: true },
    ],
    chromeParts: [
      { op: 'add', kind: 'box', center: [0, 0.42, 2.34], size: [0.92, 0.06, 0.07], round: 0.02 },
      { op: 'add', kind: 'box', center: [0, 0.42, -2.33], size: [0.90, 0.06, 0.07], round: 0.02 },
    ],
    headlights: [{ x: 0.68, y: 0.72, z: 2.31, halfW: 0.09, halfH: 0.09, color: '#f8fbff', mirror: true }],
    taillights: [
      { x: 0.54, y: 0.76, z: -2.31, halfW: 0.07, halfH: 0.07, color: '#ff1e2d', mirror: true },
      { x: 0.72, y: 0.76, z: -2.31, halfW: 0.07, halfH: 0.07, color: '#ff1e2d', mirror: true },
    ],
    exhausts: [{ x: 0.64, y: 0.25, z: -2.31, r: 0.048, mirror: true }],
  },

  // 4. Meridian Kodiak 1500 — Deep Forest Green Heavy-Duty 4x4 Work Truck
  {
    id: 'kodiak',
    name: 'Meridian Kodiak 1500',
    paintHex: '#21422a',
    accentHex: '#c8d0dc',
    caliperHex: '#c8d0dc',
    rimHex: '#b4bcc8',
    rimStyle: 'beadlock',
    tireWidth: 0.32,
    length: 5.45,
    width: 2.08,
    wheelbase: 3.35,
    trackWidth: 1.78,
    wheelRadius: 0.43,
    bodyParts: [
      {
        op: 'add',
        kind: 'profile',
        center: [0, 0, 0],
        size: [0, 0, 0],
        stations: [
          { z: -2.68, yBot: 0.44, yTop: 1.38, halfW: 1.00, tumble: 0.96, crown: 0.01, bevel: 0.06 },
          { z: -0.25, yBot: 0.40, yTop: 1.38, halfW: 1.02, tumble: 0.96, crown: 0.01, bevel: 0.06 },
          { z: 1.18, yBot: 0.40, yTop: 1.40, halfW: 1.02, tumble: 0.95, crown: 0.02, bevel: 0.06 },
          { z: 2.58, yBot: 0.44, yTop: 1.36, halfW: 0.99, tumble: 0.94, crown: 0.03, bevel: 0.06 },
          { z: 2.72, yBot: 0.48, yTop: 1.28, halfW: 0.94, tumble: 0.92, crown: 0.02, bevel: 0.06 },
        ],
        round: 0.04,
      },
      // Crew-cab upper body
      { op: 'add', kind: 'box', center: [0, 1.62, 0.50], size: [0.90, 0.34, 0.72], round: 0.08, blend: 0.04 },
      // Carve open cargo bed
      { op: 'carve', kind: 'box', center: [0, 1.32, -1.45], size: [0.80, 0.34, 1.06], round: 0.03 },
      ...wheelWellCarves(1.78, 0.43, 1.68, -1.68, 0.11),
    ],
    canopyParts: [
      { op: 'add', kind: 'box', center: [0, 1.66, 0.52], size: [0.86, 0.24, 0.68], round: 0.06 },
    ],
    carbonParts: [
      ...fenderFlares(1.78, 0.43, 1.68, -1.68, 0.08),
      // Tow mirrors
      { op: 'add', kind: 'box', center: [1.14, 1.42, 0.98], size: [0.08, 0.14, 0.09], round: 0.02, mirror: true },
    ],
    chromeParts: [
      { op: 'add', kind: 'box', center: [0, 1.02, 2.72], size: [0.76, 0.26, 0.05], round: 0.02 },
      { op: 'add', kind: 'box', center: [0, 0.58, 2.74], size: [0.96, 0.10, 0.08], round: 0.02 },
      { op: 'add', kind: 'box', center: [0, 0.56, -2.70], size: [0.96, 0.10, 0.08], round: 0.02 },
    ],
    headlights: [{ x: 0.76, y: 1.04, z: 2.71, halfW: 0.14, halfH: 0.16, color: '#fff4d4', mirror: true }],
    taillights: [{ x: 0.88, y: 1.08, z: -2.69, halfW: 0.08, halfH: 0.20, color: '#ff1e2d', mirror: true }],
    exhausts: [{ x: 0.72, y: 0.42, z: -2.68, r: 0.055 }],
  },

  // 5. Meridian Continental 67 — Deep Burgundy 1967 Big-Block Muscle Coupe
  {
    id: 'continental',
    name: 'Meridian Continental 67',
    paintHex: '#591521',
    accentHex: '#d4dce6',
    caliperHex: '#8892a0',
    rimHex: '#b8c0cc',
    rimStyle: 'steelie',
    tireWidth: 0.24,
    length: 4.98,
    width: 1.96,
    wheelbase: 2.84,
    trackWidth: 1.64,
    wheelRadius: 0.34,
    bodyParts: [
      {
        op: 'add',
        kind: 'profile',
        center: [0, 0, 0],
        size: [0, 0, 0],
        stations: [
          { z: -2.48, yBot: 0.28, yTop: 0.90, halfW: 0.92, tumble: 0.92, crown: 0.02, bevel: 0.05 },
          { z: -1.40, yBot: 0.22, yTop: 0.94, halfW: 0.96, tumble: 0.92, crown: 0.03, bevel: 0.06 },
          { z: 0.55, yBot: 0.22, yTop: 0.94, halfW: 0.96, tumble: 0.92, crown: 0.03, bevel: 0.06 },
          { z: 2.38, yBot: 0.24, yTop: 0.90, halfW: 0.94, tumble: 0.90, crown: 0.02, bevel: 0.06 },
          { z: 2.48, yBot: 0.28, yTop: 0.84, halfW: 0.88, tumble: 0.88, crown: 0.01, bevel: 0.05 },
        ],
        round: 0.04,
      },
      ...wheelWellCarves(1.64, 0.34, 1.42, -1.42),
    ],
    canopyParts: [
      { op: 'add', kind: 'profile', center: [0, 0, 0], size: [0, 0, 0], stations: fastbackCanopy(0.88, 1.32, -1.25, 0.52), round: 0.03 },
    ],
    carbonParts: [
      { op: 'add', kind: 'box', center: [0, 0.72, 2.47], size: [0.80, 0.09, 0.04], round: 0.01 },
    ],
    chromeParts: [
      { op: 'add', kind: 'box', center: [0, 0.44, 2.49], size: [0.93, 0.07, 0.07], round: 0.02 },
      { op: 'add', kind: 'box', center: [0, 0.44, -2.49], size: [0.92, 0.07, 0.07], round: 0.02 },
      { op: 'add', kind: 'box', center: [0.95, 0.26, 0], size: [0.02, 0.025, 2.15], round: 0.01, mirror: true },
    ],
    headlights: [
      { x: 0.62, y: 0.74, z: 2.48, halfW: 0.07, halfH: 0.07, color: '#fff3d6', mirror: true },
      { x: 0.78, y: 0.74, z: 2.48, halfW: 0.07, halfH: 0.07, color: '#fff3d6', mirror: true },
    ],
    taillights: [
      { x: 0.58, y: 0.72, z: -2.48, halfW: 0.06, halfH: 0.06, color: '#ff2020', mirror: true },
      { x: 0.74, y: 0.72, z: -2.48, halfW: 0.06, halfH: 0.06, color: '#ff2020', mirror: true },
    ],
    exhausts: [{ x: 0.62, y: 0.25, z: -2.48, r: 0.038, mirror: true }],
  },

  // 6. Halcyon Voltstrike S — Pearl Silver Tri-Motor EV Hypercar
  {
    id: 'voltstrike',
    name: 'Halcyon Voltstrike S',
    paintHex: '#d8dfe8',
    accentHex: '#7c3aed',
    caliperHex: '#7c3aed',
    rimHex: '#1f232b',
    rimStyle: 'multi',
    length: 4.62,
    width: 2.00,
    wheelbase: 2.72,
    trackWidth: 1.72,
    wheelRadius: 0.35,
    bodyParts: [
      { op: 'add', kind: 'profile', center: [0, 0, 0], size: [0, 0, 0], stations: midEngineBody(0.99), round: 0.04 },
      { op: 'carve', kind: 'box', center: [0.94, 0.52, -0.35], size: [0.16, 0.18, 0.55], round: 0.04, rotY: 0.16, mirror: true },
      ...wheelWellCarves(1.72, 0.35, 1.36, -1.36),
    ],
    canopyParts: [
      { op: 'add', kind: 'profile', center: [0, 0, 0], size: [0, 0, 0], stations: fastbackCanopy(0.94, 1.18, -1.25, 1.12), round: 0.03 },
    ],
    carbonParts: [
      { op: 'add', kind: 'box', center: [0, 0.14, 2.20], size: [0.92, 0.025, 0.20], round: 0.012 },
      { op: 'add', kind: 'box', center: [0.94, 0.16, 0], size: [0.08, 0.03, 1.10], round: 0.015, mirror: true },
      { op: 'add', kind: 'box', center: [0, 0.22, -2.20], size: [0.86, 0.10, 0.16], round: 0.02 },
    ],
    accentParts: [
      { op: 'add', kind: 'box', center: [0.95, 0.20, 0.15], size: [0.03, 0.02, 0.90], round: 0.01, mirror: true },
    ],
    wing: { z: -2.08, y: 1.12, halfW: 0.86, chord: 0.22, endplateH: 0.14, pylonStyle: 'swan', color: '#7c3aed' },
    headlights: [{ x: 0.68, y: 0.52, z: 2.18, halfW: 0.18, halfH: 0.03, color: '#e6f5ff', mirror: true }],
    taillights: [{ x: 0, y: 0.82, z: -2.26, halfW: 0.78, halfH: 0.02, color: '#ff2040' }],
  },

  // 7. Halcyon Solstice GT — Deep Midnight-Purple Luxury EV Fastback
  {
    id: 'solstice',
    name: 'Halcyon Solstice GT',
    paintHex: '#251c48',
    accentHex: '#b8c2d0',
    caliperHex: '#b8c2d0',
    rimHex: '#a8b2c0',
    rimStyle: 'multi',
    length: 5.02,
    width: 1.96,
    wheelbase: 3.00,
    trackWidth: 1.68,
    wheelRadius: 0.36,
    bodyParts: [
      {
        op: 'add',
        kind: 'profile',
        center: [0, 0, 0],
        size: [0, 0, 0],
        stations: [
          { z: -2.48, yBot: 0.24, yTop: 0.96, halfW: 0.88, tumble: 0.90, crown: 0.03, bevel: 0.07 },
          { z: -1.60, yBot: 0.18, yTop: 0.98, halfW: 0.97, tumble: 0.88, crown: 0.04, bevel: 0.08 },
          { z: 0.95, yBot: 0.18, yTop: 0.94, halfW: 0.97, tumble: 0.88, crown: 0.04, bevel: 0.08 },
          { z: 2.25, yBot: 0.20, yTop: 0.74, halfW: 0.90, tumble: 0.84, crown: 0.03, bevel: 0.08 },
          { z: 2.50, yBot: 0.24, yTop: 0.56, halfW: 0.78, tumble: 0.80, crown: 0.02, bevel: 0.06 },
        ],
        round: 0.04,
      },
      ...wheelWellCarves(1.68, 0.36, 1.50, -1.50),
    ],
    canopyParts: [
      { op: 'add', kind: 'profile', center: [0, 0, 0], size: [0, 0, 0], stations: fastbackCanopy(0.95, 1.38, -1.78, 1.05), round: 0.04 },
    ],
    carbonParts: [
      { op: 'add', kind: 'box', center: [0, 0.18, 2.38], size: [0.84, 0.03, 0.14], round: 0.015 },
      { op: 'add', kind: 'box', center: [0, 0.22, -2.42], size: [0.82, 0.06, 0.10], round: 0.02 },
    ],
    chromeParts: [
      { op: 'add', kind: 'box', center: [0.95, 0.22, 0], size: [0.025, 0.025, 1.32], round: 0.01, mirror: true },
    ],
    headlights: [{ x: 0, y: 0.64, z: 2.46, halfW: 0.76, halfH: 0.022, color: '#eef6ff' }],
    taillights: [{ x: 0, y: 0.88, z: -2.47, halfW: 0.78, halfH: 0.02, color: '#ff2233' }],
  },

  // 8. Halcyon Helios X1 — Matte Graphite-Black LMP Prototype
  {
    id: 'helios',
    name: 'Halcyon Helios X1',
    paintHex: '#20242c',
    accentHex: '#00e5ff',
    caliperHex: '#00e5ff',
    rimHex: '#181b22',
    rimStyle: 'multi',
    length: 4.78,
    width: 1.98,
    wheelbase: 2.92,
    trackWidth: 1.70,
    wheelRadius: 0.34,
    bodyParts: [
      // Low central floor & sidepods
      { op: 'add', kind: 'box', center: [0, 0.34, 0], size: [0.96, 0.24, 2.26], round: 0.05 },
      // Tall sculpted front & rear wheel pods
      { op: 'add', kind: 'ellipsoid', center: [0.76, 0.54, 1.44], size: [0.24, 0.28, 0.78], blend: 0.06, mirror: true },
      { op: 'add', kind: 'ellipsoid', center: [0.76, 0.56, -1.44], size: [0.24, 0.30, 0.82], blend: 0.06, mirror: true },
      // Central dorsal shark-fin spine
      { op: 'add', kind: 'box', center: [0, 0.88, -1.30], size: [0.025, 0.26, 0.90], round: 0.015 },
      // Roof airbox
      { op: 'add', kind: 'box', center: [0, 1.12, -0.25], size: [0.14, 0.08, 0.35], round: 0.03, blend: 0.03 },
      ...wheelWellCarves(1.70, 0.34, 1.46, -1.46),
    ],
    canopyParts: [
      {
        op: 'add',
        kind: 'profile',
        center: [0, 0, 0],
        size: [0, 0, 0],
        stations: [
          { z: -0.75, yBot: 0.52, yTop: 1.06, halfW: 0.44, tumble: 0.72, crown: 0.05, bevel: 0.05 },
          { z: 0.10, yBot: 0.52, yTop: 1.08, halfW: 0.52, tumble: 0.74, crown: 0.06, bevel: 0.06 },
          { z: 1.05, yBot: 0.50, yTop: 0.66, halfW: 0.40, tumble: 0.72, crown: 0.03, bevel: 0.04 },
        ],
        round: 0.03,
      },
    ],
    carbonParts: [
      { op: 'add', kind: 'box', center: [0, 0.12, 2.24], size: [0.96, 0.025, 0.22], round: 0.012 },
      { op: 'add', kind: 'box', center: [0, 0.22, -2.26], size: [0.88, 0.12, 0.18], round: 0.02 },
    ],
    accentParts: [
      { op: 'add', kind: 'box', center: [0, 1.14, -1.30], size: [0.03, 0.02, 0.88], round: 0.01 },
      { op: 'add', kind: 'box', center: [0.96, 0.16, 0], size: [0.025, 0.02, 1.05], round: 0.01, mirror: true },
    ],
    wing: { z: -2.18, y: 1.16, halfW: 0.96, chord: 0.30, endplateH: 0.24, pylonStyle: 'swan' },
    headlights: [{ x: 0.74, y: 0.56, z: 2.15, halfW: 0.07, halfH: 0.11, color: '#e6fcff', mirror: true }],
    taillights: [{ x: 0.78, y: 0.64, z: -2.25, halfW: 0.16, halfH: 0.025, color: '#ff1e2d', mirror: true }],
    exhausts: [{ x: 0.10, y: 0.46, z: -2.28, r: 0.045, mirror: true }],
  },

  // 9. Kestrel Badlands XT — Desert-Tan Lifted 4x4 Off-Road Truck
  {
    id: 'badlands',
    name: 'Kestrel Badlands XT',
    paintHex: '#c2a67d',
    accentHex: '#e85d1a',
    caliperHex: '#e85d1a',
    rimHex: '#1b1d22',
    rimStyle: 'beadlock',
    tireWidth: 0.34,
    length: 5.30,
    width: 2.08,
    wheelbase: 3.25,
    trackWidth: 1.80,
    wheelRadius: 0.45,
    bodyParts: [
      {
        op: 'add',
        kind: 'profile',
        center: [0, 0, 0],
        size: [0, 0, 0],
        stations: [
          { z: -2.60, yBot: 0.46, yTop: 1.38, halfW: 0.99, tumble: 0.95, crown: 0.01, bevel: 0.06 },
          { z: -0.20, yBot: 0.44, yTop: 1.38, halfW: 1.01, tumble: 0.95, crown: 0.01, bevel: 0.06 },
          { z: 1.12, yBot: 0.44, yTop: 1.40, halfW: 1.01, tumble: 0.95, crown: 0.02, bevel: 0.06 },
          { z: 2.55, yBot: 0.48, yTop: 1.34, halfW: 0.96, tumble: 0.92, crown: 0.03, bevel: 0.06 },
        ],
        round: 0.04,
      },
      { op: 'add', kind: 'box', center: [0, 1.64, 0.46], size: [0.88, 0.34, 0.70], round: 0.08, blend: 0.04 },
      { op: 'carve', kind: 'box', center: [0, 1.34, -1.42], size: [0.78, 0.34, 1.02], round: 0.03 },
      ...wheelWellCarves(1.80, 0.45, 1.62, -1.62, 0.12),
    ],
    canopyParts: [
      { op: 'add', kind: 'box', center: [0, 1.68, 0.48], size: [0.84, 0.24, 0.66], round: 0.06 },
    ],
    carbonParts: [
      ...fenderFlares(1.80, 0.45, 1.62, -1.62, 0.09),
      // Steel front bash bar & bumper
      { op: 'add', kind: 'box', center: [0, 0.60, 2.60], size: [0.92, 0.14, 0.10], round: 0.03 },
      // Roof rack + 40" LED bar
      { op: 'add', kind: 'box', center: [0, 2.02, 0.42], size: [0.76, 0.04, 0.56], round: 0.02 },
      // Bed rollbar
      { op: 'add', kind: 'tube', center: [0.74, 1.36, -0.32], size: [0.74, 1.90, -0.40], round: 0.035, mirror: true },
      { op: 'add', kind: 'tube', center: [-0.74, 1.90, -0.40], size: [0.74, 1.90, -0.40], round: 0.035 },
      // Snorkel on passenger A-pillar
      { op: 'add', kind: 'tube', center: [0.92, 1.24, 1.25], size: [0.86, 1.92, 0.98], round: 0.045 },
    ],
    headlights: [
      { x: 0.74, y: 1.06, z: 2.56, halfW: 0.14, halfH: 0.12, color: '#fff8e0', mirror: true },
      { x: 0, y: 2.02, z: 0.98, halfW: 0.58, halfH: 0.04, color: '#ffffff' },
    ],
    taillights: [{ x: 0.86, y: 1.08, z: -2.60, halfW: 0.08, halfH: 0.18, color: '#ff2222', mirror: true }],
  },

  // 10. Kestrel Sidewinder — Exact Sheet-Measured & Depth-Sculpted Widebody Drift Coupe
  {
    id: 'sidewinder',
    name: 'Kestrel Sidewinder',
    paintHex: '#d49b00',
    accentHex: '#0a0b0e',
    caliperHex: '#e5b812',
    rimHex: '#181a1f',
    rimStyle: 'multi',
    tireWidth: 0.26,
    length: 4.54,
    width: 2.04,
    wheelbase: 2.96,
    trackWidth: 1.72,
    wheelRadius: 0.36,
    frontWheelZ: 1.37,
    rearWheelZ: -1.59,
    bodyParts: [
      // Exact 11-station orthographic side-profile measured from Kestrel Sidewinder sheet (px -> meters)
      {
        op: 'add',
        kind: 'profile',
        center: [0, 0, 0],
        size: [0, 0, 0],
        stations: [
          { z: -2.27, yBot: 0.44, yTop: 0.86, halfW: 0.84, tumble: 0.88, crown: 0.02, bevel: 0.05 },
          { z: -2.04, yBot: 0.28, yTop: 0.94, halfW: 0.94, tumble: 0.86, crown: 0.03, bevel: 0.06 },
          { z: -1.80, yBot: 0.20, yTop: 0.96, halfW: 1.00, tumble: 0.86, crown: 0.03, bevel: 0.06 },
          { z: -1.36, yBot: 0.17, yTop: 0.98, halfW: 1.02, tumble: 0.86, crown: 0.04, bevel: 0.06 },
          { z: -0.68, yBot: 0.16, yTop: 0.94, halfW: 0.96, tumble: 0.88, crown: 0.03, bevel: 0.06 },
          { z: 0.00, yBot: 0.16, yTop: 0.91, halfW: 0.95, tumble: 0.88, crown: 0.03, bevel: 0.06 },
          { z: 0.68, yBot: 0.17, yTop: 0.87, halfW: 0.97, tumble: 0.88, crown: 0.03, bevel: 0.06 },
          { z: 1.15, yBot: 0.17, yTop: 0.89, halfW: 1.01, tumble: 0.86, crown: 0.03, bevel: 0.06 },
          { z: 1.59, yBot: 0.18, yTop: 0.83, halfW: 0.99, tumble: 0.84, crown: 0.03, bevel: 0.06 },
          { z: 1.98, yBot: 0.22, yTop: 0.70, halfW: 0.90, tumble: 0.82, crown: 0.02, bevel: 0.06 },
          { z: 2.27, yBot: 0.30, yTop: 0.50, halfW: 0.76, tumble: 0.80, crown: 0.02, bevel: 0.05 },
        ],
        round: 0.035,
      },
      // Painted roof cap + A-pillars + C-pillar haunches (matching yellow roof & pillars on sheet)
      {
        op: 'add',
        kind: 'profile',
        center: [0, 0, 0],
        size: [0, 0, 0],
        stations: [
          { z: -1.36, yBot: 0.94, yTop: 1.06, halfW: 0.74, tumble: 0.84, crown: 0.02, bevel: 0.04 },
          { z: -0.72, yBot: 1.17, yTop: 1.24, halfW: 0.62, tumble: 0.90, crown: 0.03, bevel: 0.03 },
          { z: 0.00, yBot: 1.18, yTop: 1.24, halfW: 0.62, tumble: 0.90, crown: 0.03, bevel: 0.03 },
        ],
        round: 0.025,
        blend: 0.03,
      },
      // Yellow A-pillars & C-pillars framing the glass
      { op: 'add', kind: 'tube', center: [0.64, 0.87, 0.66], size: [0.58, 1.21, 0.00], round: 0.035, mirror: true },
      { op: 'add', kind: 'tube', center: [0.74, 0.94, -1.52], size: [0.58, 1.21, -0.72], round: 0.045, mirror: true },
      // Bolt-on widebody overfender flares (yellow painted flares!)
      { op: 'add', kind: 'cylX', center: [0.95, 0.38, 1.37], size: [0.44, 0.09, 0], round: 0.02, blend: 0.03, mirror: true },
      { op: 'add', kind: 'cylX', center: [0.95, 0.38, -1.59], size: [0.44, 0.09, 0], round: 0.02, blend: 0.03, mirror: true },
      // Ducktail trunk lip kick
      { op: 'add', kind: 'box', center: [0, 0.96, -2.06], size: [0.76, 0.05, 0.14], round: 0.025, rotX: -0.25, blend: 0.03 },
      // Carve door scallop / behind-front-wheel aero vent channel & hood vents & intercooler grille
      { op: 'carve', kind: 'box', center: [0.96, 0.56, 0.82], size: [0.10, 0.22, 0.14], round: 0.02, rotY: 0.22, mirror: true },
      { op: 'carve', kind: 'box', center: [0.28, 0.86, 1.48], size: [0.15, 0.04, 0.24], round: 0.02, mirror: true },
      { op: 'carve', kind: 'box', center: [0, 0.38, 2.24], size: [0.52, 0.16, 0.12], round: 0.03 },
      ...wheelWellCarves(1.72, 0.36, 1.37, -1.59, 0.10),
    ],
    canopyParts: [
      {
        op: 'add',
        kind: 'profile',
        center: [0, 0, 0],
        size: [0, 0, 0],
        stations: [
          { z: -1.48, yBot: 0.90, yTop: 1.02, halfW: 0.68, tumble: 0.76, crown: 0.02, bevel: 0.04 },
          { z: -0.72, yBot: 0.90, yTop: 1.21, halfW: 0.72, tumble: 0.78, crown: 0.03, bevel: 0.04 },
          { z: 0.00, yBot: 0.89, yTop: 1.21, halfW: 0.72, tumble: 0.78, crown: 0.03, bevel: 0.04 },
          { z: 0.68, yBot: 0.84, yTop: 0.90, halfW: 0.67, tumble: 0.76, crown: 0.02, bevel: 0.04 },
        ],
        round: 0.025,
      },
    ],
    carbonParts: [
      // Carbon front splitter + twin vertical tie-rod struts + dive-plane canards
      { op: 'add', kind: 'box', center: [0, 0.14, 2.16], size: [0.94, 0.024, 0.18], round: 0.012 },
      { op: 'add', kind: 'tube', center: [0.32, 0.15, 2.28], size: [0.30, 0.42, 2.16], round: 0.012, mirror: true },
      { op: 'add', kind: 'box', center: [0.94, 0.32, 2.04], size: [0.09, 0.018, 0.18], round: 0.008, rotZ: 0.22, mirror: true },
      { op: 'add', kind: 'box', center: [0.94, 0.44, 2.00], size: [0.08, 0.018, 0.16], round: 0.008, rotZ: 0.22, mirror: true },
      // Front intercooler mesh & behind-wheel carbon vent trim
      { op: 'add', kind: 'box', center: [0, 0.38, 2.12], size: [0.50, 0.15, 0.04], round: 0.01 },
      { op: 'add', kind: 'box', center: [0.93, 0.56, 0.86], size: [0.04, 0.22, 0.10], round: 0.01, mirror: true },
      // Carbon side skirts with rear winglets
      { op: 'add', kind: 'box', center: [0.97, 0.15, -0.10], size: [0.08, 0.025, 1.15], round: 0.012, mirror: true },
      { op: 'add', kind: 'box', center: [0.99, 0.22, -1.16], size: [0.03, 0.08, 0.12], round: 0.01, mirror: true },
      // Roof intake scoop
      { op: 'add', kind: 'box', center: [0, 1.28, -0.22], size: [0.16, 0.05, 0.26], round: 0.02 },
      // 5-fin aggressive rear carbon diffuser
      { op: 'add', kind: 'box', center: [0, 0.24, -2.20], size: [0.84, 0.12, 0.14], round: 0.02 },
      { op: 'add', kind: 'box', center: [0, 0.22, -2.26], size: [0.02, 0.12, 0.14], round: 0.008 },
      { op: 'add', kind: 'box', center: [0.28, 0.22, -2.26], size: [0.02, 0.12, 0.14], round: 0.008, mirror: true },
      { op: 'add', kind: 'box', center: [0.56, 0.22, -2.26], size: [0.02, 0.12, 0.14], round: 0.008, mirror: true },
    ],
    wing: { z: -2.14, y: 1.24, halfW: 0.94, chord: 0.28, endplateH: 0.20, pylonStyle: 'swan' },
    headlights: [{ x: 0.66, y: 0.62, z: 2.08, halfW: 0.16, halfH: 0.032, color: '#eef6ff', mirror: true }],
    taillights: [{ x: 0.58, y: 0.80, z: -2.26, halfW: 0.22, halfH: 0.025, color: '#ff1e2d', mirror: true }],
    exhausts: [{ x: 0.10, y: 0.26, z: -2.26, r: 0.05, mirror: true }],
  },

  // 11. Aurelia Terra Corsa — White/Red/Teal Compact AWD Rally Hatchback
  {
    id: 'terracorsa',
    name: 'Aurelia Terra Corsa',
    paintHex: '#edf1f5',
    accentHex: '#d92b2b',
    caliperHex: '#d92b2b',
    rimHex: '#1d2026',
    rimStyle: 'multi',
    tireWidth: 0.27,
    length: 4.18,
    width: 1.92,
    wheelbase: 2.54,
    trackWidth: 1.68,
    wheelRadius: 0.35,
    bodyParts: [
      {
        op: 'add',
        kind: 'profile',
        center: [0, 0, 0],
        size: [0, 0, 0],
        stations: [
          { z: -2.06, yBot: 0.22, yTop: 1.02, halfW: 0.88, tumble: 0.92, crown: 0.02, bevel: 0.05 },
          { z: -1.45, yBot: 0.20, yTop: 1.02, halfW: 0.95, tumble: 0.92, crown: 0.03, bevel: 0.06 },
          { z: 0.72, yBot: 0.20, yTop: 0.96, halfW: 0.95, tumble: 0.92, crown: 0.03, bevel: 0.06 },
          { z: 1.98, yBot: 0.22, yTop: 0.72, halfW: 0.86, tumble: 0.88, crown: 0.02, bevel: 0.06 },
        ],
        round: 0.04,
      },
      ...wheelWellCarves(1.68, 0.35, 1.27, -1.27, 0.10),
    ],
    canopyParts: [
      {
        op: 'add',
        kind: 'profile',
        center: [0, 0, 0],
        size: [0, 0, 0],
        stations: [
          { z: -1.85, yBot: 0.96, yTop: 1.38, halfW: 0.74, tumble: 0.84, crown: 0.03, bevel: 0.05 },
          { z: -0.45, yBot: 0.96, yTop: 1.44, halfW: 0.78, tumble: 0.84, crown: 0.04, bevel: 0.05 },
          { z: 0.75, yBot: 0.92, yTop: 0.98, halfW: 0.74, tumble: 0.82, crown: 0.02, bevel: 0.04 },
        ],
        round: 0.03,
      },
    ],
    carbonParts: [
      ...fenderFlares(1.68, 0.35, 1.27, -1.27, 0.08),
      // Roof scoop
      { op: 'add', kind: 'box', center: [0, 1.49, 0.10], size: [0.20, 0.06, 0.24], round: 0.02 },
      // Mudflaps
      { op: 'add', kind: 'box', center: [0.80, 0.22, -1.62], size: [0.16, 0.18, 0.02], round: 0.008, mirror: true },
      { op: 'add', kind: 'box', center: [0.80, 0.22, 0.92], size: [0.16, 0.18, 0.02], round: 0.008, mirror: true },
    ],
    accentParts: [
      { op: 'add', kind: 'box', center: [0.95, 0.76, -0.45], size: [0.02, 0.06, 1.15], round: 0.01, mirror: true },
    ],
    wing: { z: -1.96, y: 1.42, halfW: 0.82, chord: 0.24, endplateH: 0.18, pylonStyle: 'rally' },
    headlights: [
      { x: 0.62, y: 0.66, z: 1.98, halfW: 0.14, halfH: 0.04, color: '#eef6ff', mirror: true },
      // 4-pod rally light bar
      { x: 0.14, y: 0.54, z: 2.02, halfW: 0.06, halfH: 0.06, color: '#fff8d0', mirror: true },
      { x: 0.32, y: 0.54, z: 2.02, halfW: 0.06, halfH: 0.06, color: '#fff8d0', mirror: true },
    ],
    taillights: [{ x: 0.66, y: 0.92, z: -2.06, halfW: 0.18, halfH: 0.04, color: '#ff1e2d', mirror: true }],
    exhausts: [{ x: 0.08, y: 0.22, z: -2.06, r: 0.042, mirror: true }],
  },

  // 12. Aurelia Veloce Spyder — Racing Red Open-Cockpit Mid-Engine Speedster (NO roof)
  {
    id: 'veloce',
    name: 'Aurelia Veloce Spyder',
    paintHex: '#d11919',
    accentHex: '#1a1d24',
    caliperHex: '#d11919',
    rimHex: '#252932',
    rimStyle: 'multi',
    length: 4.46,
    width: 1.96,
    wheelbase: 2.64,
    trackWidth: 1.70,
    wheelRadius: 0.35,
    bodyParts: [
      { op: 'add', kind: 'profile', center: [0, 0, 0], size: [0, 0, 0], stations: midEngineBody(0.96), round: 0.04 },
      // Carve open cockpit tub!
      { op: 'carve', kind: 'box', center: [0, 0.88, -0.05], size: [0.64, 0.22, 0.68], round: 0.06 },
      // Twin aero roll-hoops behind seats
      { op: 'add', kind: 'ellipsoid', center: [0.36, 0.98, -0.78], size: [0.18, 0.16, 0.36], blend: 0.04, mirror: true },
      // Deep side intakes
      { op: 'carve', kind: 'box', center: [0.92, 0.60, -0.45], size: [0.16, 0.16, 0.38], round: 0.04, mirror: true },
      ...wheelWellCarves(1.70, 0.35, 1.32, -1.32),
    ],
    canopyParts: [
      // Low swept aerofoil windscreen only — NO roof!
      { op: 'add', kind: 'box', center: [0, 0.96, 0.74], size: [0.68, 0.08, 0.24], round: 0.03, rotX: -0.52 },
    ],
    carbonParts: [
      { op: 'add', kind: 'box', center: [0, 0.14, 2.16], size: [0.90, 0.025, 0.20], round: 0.012 },
      { op: 'add', kind: 'box', center: [0.92, 0.16, 0], size: [0.08, 0.03, 1.05], round: 0.015, mirror: true },
      { op: 'add', kind: 'box', center: [0, 0.22, -2.16], size: [0.84, 0.10, 0.16], round: 0.02 },
      { op: 'add', kind: 'box', center: [0, 0.94, -1.20], size: [0.36, 0.04, 0.42], round: 0.02 },
    ],
    headlights: [{ x: 0.66, y: 0.52, z: 2.14, halfW: 0.12, halfH: 0.05, color: '#eef6ff', mirror: true }],
    taillights: [{ x: 0.58, y: 0.78, z: -2.23, halfW: 0.24, halfH: 0.025, color: '#ff1e2d', mirror: true }],
    exhausts: [{ x: 0.10, y: 0.34, z: -2.24, r: 0.048, mirror: true }],
  },

  // 13. Ironport Corsair RS — Deep Metallic Navy Widebody Muscle Coupe
  {
    id: 'corsair',
    name: 'Ironport Corsair RS',
    paintHex: '#16345e',
    accentHex: '#d92027',
    caliperHex: '#d92027',
    rimHex: '#252932',
    rimStyle: 'multi',
    length: 4.78,
    width: 2.00,
    wheelbase: 2.78,
    trackWidth: 1.72,
    wheelRadius: 0.35,
    bodyParts: [
      { op: 'add', kind: 'profile', center: [0, 0, 0], size: [0, 0, 0], stations: coupeBody(0.98, 0.80, 0.96, 1.00, 0.08), round: 0.04 },
      // Power-dome hood scoop
      { op: 'add', kind: 'box', center: [0, 0.94, 1.38], size: [0.32, 0.07, 0.56], round: 0.03, blend: 0.04 },
      { op: 'carve', kind: 'box', center: [0, 0.62, 2.30], size: [0.66, 0.14, 0.06], round: 0.02 },
      ...wheelWellCarves(1.72, 0.35, 1.39, -1.39),
    ],
    canopyParts: [
      { op: 'add', kind: 'profile', center: [0, 0, 0], size: [0, 0, 0], stations: fastbackCanopy(0.92, 1.30, -1.52, 0.58), round: 0.03 },
    ],
    carbonParts: [
      ...fenderFlares(1.72, 0.35, 1.39, -1.39, 0.07),
      { op: 'add', kind: 'box', center: [0, 0.15, 2.26], size: [0.94, 0.025, 0.22], round: 0.012 },
      { op: 'add', kind: 'box', center: [0.95, 0.17, 0], size: [0.08, 0.03, 1.12], round: 0.015, mirror: true },
      { op: 'add', kind: 'box', center: [0, 0.24, -2.24], size: [0.86, 0.09, 0.15], round: 0.02 },
    ],
    headlights: [{ x: 0.68, y: 0.66, z: 2.28, halfW: 0.16, halfH: 0.035, color: '#eef6ff', mirror: true }],
    taillights: [{ x: 0.56, y: 0.82, z: -2.29, halfW: 0.24, halfH: 0.04, color: '#ff1e2d', mirror: true }],
    exhausts: [
      { x: 0.56, y: 0.25, z: -2.28, r: 0.048, mirror: true },
      { x: 0.68, y: 0.25, z: -2.28, r: 0.048, mirror: true },
    ],
  },

  // 14. Kuronuma GT-6 — Pearl White Twin-Turbo JDM Widebody Coupe
  {
    id: 'kuronuma',
    name: 'Kuronuma GT-6',
    paintHex: '#eef2f6',
    accentHex: '#15181e',
    caliperHex: '#d92027',
    rimHex: '#181b22',
    rimStyle: 'six',
    length: 4.74,
    width: 2.02,
    wheelbase: 2.76,
    trackWidth: 1.74,
    wheelRadius: 0.35,
    bodyParts: [
      { op: 'add', kind: 'profile', center: [0, 0, 0], size: [0, 0, 0], stations: coupeBody(0.99, 0.78, 0.96, 1.02, 0.03), round: 0.04 },
      // Twin hood vents & big trapezoidal front intercooler carve
      { op: 'carve', kind: 'box', center: [0.32, 0.90, 1.48], size: [0.16, 0.04, 0.22], round: 0.02, mirror: true },
      { op: 'carve', kind: 'box', center: [0, 0.44, 2.30], size: [0.56, 0.18, 0.08], round: 0.03 },
      ...wheelWellCarves(1.74, 0.35, 1.38, -1.38),
    ],
    canopyParts: [
      { op: 'add', kind: 'profile', center: [0, 0, 0], size: [0, 0, 0], stations: fastbackCanopy(0.94, 1.32, -1.55, 0.62), round: 0.03 },
    ],
    carbonParts: [
      ...fenderFlares(1.74, 0.35, 1.38, -1.38, 0.08),
      { op: 'add', kind: 'box', center: [0, 0.15, 2.24], size: [0.95, 0.025, 0.20], round: 0.012 },
      { op: 'add', kind: 'box', center: [0.96, 0.17, 0], size: [0.08, 0.03, 1.10], round: 0.015, mirror: true },
      { op: 'add', kind: 'box', center: [0, 0.22, -2.24], size: [0.86, 0.10, 0.16], round: 0.02 },
    ],
    wing: { z: -2.18, y: 1.32, halfW: 0.94, chord: 0.26, endplateH: 0.20, pylonStyle: 'upright' },
    headlights: [{ x: 0.68, y: 0.68, z: 2.24, halfW: 0.14, halfH: 0.045, color: '#eef6ff', mirror: true }],
    taillights: [
      { x: 0.56, y: 0.84, z: -2.29, halfW: 0.06, halfH: 0.06, color: '#ff1e2d', mirror: true },
      { x: 0.74, y: 0.84, z: -2.29, halfW: 0.06, halfH: 0.06, color: '#ff1e2d', mirror: true },
    ],
    exhausts: [
      { x: 0.56, y: 0.24, z: -2.28, r: 0.052, mirror: true },
      { x: 0.68, y: 0.24, z: -2.28, r: 0.052, mirror: true },
    ],
  },

  // 15. Vanguard Apex GT — Liquid Silver Mid-Engine Hyper-GT
  {
    id: 'vanguard',
    name: 'Vanguard Apex GT',
    paintHex: '#b9c2cc',
    accentHex: '#171a20',
    caliperHex: '#d92027',
    rimHex: '#3c424e',
    rimStyle: 'multi',
    length: 4.60,
    width: 2.00,
    wheelbase: 2.70,
    trackWidth: 1.72,
    wheelRadius: 0.35,
    bodyParts: [
      { op: 'add', kind: 'profile', center: [0, 0, 0], size: [0, 0, 0], stations: midEngineBody(0.99), round: 0.04 },
      { op: 'carve', kind: 'box', center: [0.94, 0.58, -0.45], size: [0.16, 0.18, 0.44], round: 0.04, mirror: true },
      { op: 'add', kind: 'box', center: [0, 1.24, -0.25], size: [0.14, 0.07, 0.42], round: 0.03, blend: 0.04 },
      ...wheelWellCarves(1.72, 0.35, 1.35, -1.35),
    ],
    canopyParts: [
      { op: 'add', kind: 'profile', center: [0, 0, 0], size: [0, 0, 0], stations: fastbackCanopy(0.92, 1.20, -1.05, 1.12), round: 0.03 },
    ],
    carbonParts: [
      { op: 'add', kind: 'box', center: [0, 0.14, 2.20], size: [0.94, 0.025, 0.20], round: 0.012 },
      { op: 'add', kind: 'box', center: [0.95, 0.16, 0], size: [0.08, 0.03, 1.08], round: 0.015, mirror: true },
      { op: 'add', kind: 'box', center: [0, 0.22, -2.20], size: [0.86, 0.10, 0.16], round: 0.02 },
    ],
    headlights: [{ x: 0.68, y: 0.54, z: 2.18, halfW: 0.16, halfH: 0.03, color: '#eef6ff', mirror: true }],
    taillights: [{ x: 0.60, y: 0.78, z: -2.26, halfW: 0.24, halfH: 0.03, color: '#ff1e2d', mirror: true }],
    exhausts: [{ x: 0.12, y: 0.48, z: -2.26, r: 0.055, mirror: true }],
  },

  // 16. Apex TCR Spec-2 — Red/White/Grey 5-Door Touring Car
  {
    id: 'apex_tcr',
    name: 'Apex TCR Spec-2',
    paintHex: '#d42622',
    accentHex: '#eef1f4',
    caliperHex: '#d42622',
    rimHex: '#3e434d',
    rimStyle: 'multi',
    length: 4.38,
    width: 1.95,
    wheelbase: 2.70,
    trackWidth: 1.72,
    wheelRadius: 0.33,
    bodyParts: [
      {
        op: 'add',
        kind: 'profile',
        center: [0, 0, 0],
        size: [0, 0, 0],
        stations: [
          { z: -2.14, yBot: 0.18, yTop: 1.00, halfW: 0.90, tumble: 0.92, crown: 0.02, bevel: 0.05 },
          { z: -1.35, yBot: 0.16, yTop: 1.00, halfW: 0.96, tumble: 0.92, crown: 0.03, bevel: 0.06 },
          { z: 0.85, yBot: 0.16, yTop: 0.94, halfW: 0.96, tumble: 0.92, crown: 0.03, bevel: 0.06 },
          { z: 2.12, yBot: 0.18, yTop: 0.68, halfW: 0.88, tumble: 0.88, crown: 0.02, bevel: 0.06 },
        ],
        round: 0.04,
      },
      ...wheelWellCarves(1.72, 0.33, 1.35, -1.35),
    ],
    canopyParts: [
      {
        op: 'add',
        kind: 'profile',
        center: [0, 0, 0],
        size: [0, 0, 0],
        stations: [
          { z: -1.96, yBot: 0.94, yTop: 1.36, halfW: 0.74, tumble: 0.84, crown: 0.03, bevel: 0.05 },
          { z: -0.45, yBot: 0.94, yTop: 1.42, halfW: 0.78, tumble: 0.84, crown: 0.04, bevel: 0.05 },
          { z: 0.85, yBot: 0.90, yTop: 0.96, halfW: 0.74, tumble: 0.82, crown: 0.02, bevel: 0.04 },
        ],
        round: 0.03,
      },
    ],
    carbonParts: [
      ...fenderFlares(1.72, 0.33, 1.35, -1.35, 0.07),
      { op: 'add', kind: 'box', center: [0, 0.14, 2.12], size: [0.95, 0.03, 0.24], round: 0.012 },
      { op: 'add', kind: 'box', center: [0.95, 0.16, 0], size: [0.08, 0.03, 1.05], round: 0.015, mirror: true },
    ],
    accentParts: [
      { op: 'add', kind: 'box', center: [0.95, 0.68, 0], size: [0.02, 0.14, 1.05], round: 0.01, mirror: true },
    ],
    wing: { z: -2.06, y: 1.44, halfW: 0.88, chord: 0.26, endplateH: 0.18, pylonStyle: 'rally' },
    headlights: [{ x: 0.66, y: 0.66, z: 2.12, halfW: 0.15, halfH: 0.04, color: '#eef6ff', mirror: true }],
    taillights: [{ x: 0.68, y: 0.90, z: -2.14, halfW: 0.18, halfH: 0.035, color: '#ff1e2d', mirror: true }],
    exhausts: [{ x: 0.10, y: 0.20, z: -2.14, r: 0.042, mirror: true }],
  },

  // 17. Veloce Stratos WRC — Matte Carbon-Black Wedge Rally Coupe
  {
    id: 'stratos_wrc',
    name: 'Veloce Stratos WRC',
    paintHex: '#2b2e35',
    accentHex: '#d91c1c',
    caliperHex: '#d91c1c',
    rimHex: '#181a20',
    rimStyle: 'multi',
    tireWidth: 0.28,
    length: 4.12,
    width: 1.94,
    wheelbase: 2.48,
    trackWidth: 1.68,
    wheelRadius: 0.36,
    bodyParts: [
      {
        op: 'add',
        kind: 'profile',
        center: [0, 0, 0],
        size: [0, 0, 0],
        stations: [
          { z: -2.04, yBot: 0.24, yTop: 0.94, halfW: 0.94, tumble: 0.90, crown: 0.02, bevel: 0.05 },
          { z: -0.95, yBot: 0.20, yTop: 0.94, halfW: 0.97, tumble: 0.88, crown: 0.03, bevel: 0.06 },
          { z: 0.85, yBot: 0.20, yTop: 0.82, halfW: 0.92, tumble: 0.88, crown: 0.02, bevel: 0.06 },
          { z: 2.02, yBot: 0.24, yTop: 0.56, halfW: 0.82, tumble: 0.84, crown: 0.02, bevel: 0.05 },
        ],
        round: 0.04,
      },
      ...wheelWellCarves(1.68, 0.36, 1.24, -1.24, 0.10),
    ],
    canopyParts: [
      { op: 'add', kind: 'profile', center: [0, 0, 0], size: [0, 0, 0], stations: fastbackCanopy(0.88, 1.26, -1.25, 0.95), round: 0.03 },
    ],
    carbonParts: [
      ...fenderFlares(1.68, 0.36, 1.24, -1.24, 0.09),
      { op: 'add', kind: 'box', center: [0, 1.30, -0.05], size: [0.22, 0.06, 0.28], round: 0.02 },
      { op: 'add', kind: 'box', center: [0.80, 0.22, -1.62], size: [0.18, 0.20, 0.02], round: 0.008, mirror: true },
      { op: 'add', kind: 'box', center: [0.80, 0.22, 0.86], size: [0.18, 0.20, 0.02], round: 0.008, mirror: true },
    ],
    accentParts: [
      { op: 'add', kind: 'box', center: [0.95, 0.58, -0.25], size: [0.02, 0.06, 1.05], round: 0.01, mirror: true },
    ],
    wing: { z: -1.96, y: 1.26, halfW: 0.86, chord: 0.28, endplateH: 0.24, pylonStyle: 'rally' },
    headlights: [
      { x: 0.14, y: 0.60, z: 2.00, halfW: 0.06, halfH: 0.06, color: '#fff8d4', mirror: true },
      { x: 0.32, y: 0.60, z: 2.00, halfW: 0.06, halfH: 0.06, color: '#fff8d4', mirror: true },
    ],
    taillights: [{ x: 0.64, y: 0.78, z: -2.04, halfW: 0.08, halfH: 0.08, color: '#ff1e2d', mirror: true }],
    exhausts: [{ x: 0.08, y: 0.30, z: -2.04, r: 0.042, mirror: true }],
  },

  // 18. Titan Ridge FX4 — Grey/Orange Trophy Truck w/ Exposed Tube Chassis & Dual Spares
  {
    id: 'titan_fx4',
    name: 'Titan Ridge FX4',
    paintHex: '#646b73',
    accentHex: '#e85d1a',
    caliperHex: '#e85d1a',
    rimHex: '#181a20',
    rimStyle: 'beadlock',
    tireWidth: 0.36,
    length: 5.36,
    width: 2.14,
    wheelbase: 3.30,
    trackWidth: 1.86,
    wheelRadius: 0.46,
    bodyParts: [
      // Wide flared front cab & fenders
      {
        op: 'add',
        kind: 'profile',
        center: [0, 0, 0],
        size: [0, 0, 0],
        stations: [
          { z: -0.20, yBot: 0.48, yTop: 1.40, halfW: 1.02, tumble: 0.94, crown: 0.02, bevel: 0.06 },
          { z: 1.15, yBot: 0.48, yTop: 1.42, halfW: 1.04, tumble: 0.94, crown: 0.02, bevel: 0.06 },
          { z: 2.58, yBot: 0.52, yTop: 1.32, halfW: 0.98, tumble: 0.92, crown: 0.03, bevel: 0.06 },
        ],
        round: 0.04,
      },
      // Crew cab upper
      { op: 'add', kind: 'box', center: [0, 1.66, 0.52], size: [0.88, 0.34, 0.70], round: 0.08, blend: 0.04 },
      // Wide rear trophy fenders only (open center for tubular cage & spares!)
      { op: 'add', kind: 'box', center: [0.94, 1.06, -1.45], size: [0.14, 0.36, 1.08], round: 0.05, mirror: true },
      ...wheelWellCarves(1.86, 0.46, 1.65, -1.65, 0.14),
    ],
    canopyParts: [
      { op: 'add', kind: 'box', center: [0, 1.70, 0.54], size: [0.84, 0.24, 0.66], round: 0.06 },
    ],
    carbonParts: [
      // Dual angled spare tires in rear bed!
      { op: 'add', kind: 'cylX', center: [0.44, 1.24, -1.78], size: [0.42, 0.16, 0], round: 0.04, rotY: 0.32, rotZ: 0.35, mirror: true },
    ],
    accentParts: [
      { op: 'add', kind: 'box', center: [0.96, 0.92, 0.35], size: [0.02, 0.08, 0.95], round: 0.01, mirror: true },
    ],
    chromeParts: [
      // Exposed tubular rear trophy cage
      { op: 'add', kind: 'tube', center: [0.76, 1.88, -0.18], size: [0.76, 1.26, -2.45], round: 0.035, mirror: true },
      { op: 'add', kind: 'tube', center: [0.76, 1.26, -2.45], size: [-0.76, 1.26, -2.45], round: 0.035 },
      { op: 'add', kind: 'tube', center: [0.76, 1.88, -0.18], size: [-0.76, 1.26, -1.65], round: 0.028, mirror: true },
    ],
    headlights: [
      { x: 0.76, y: 1.06, z: 2.58, halfW: 0.14, halfH: 0.14, color: '#fff8e0', mirror: true },
      { x: 0, y: 2.02, z: 1.08, halfW: 0.56, halfH: 0.04, color: '#ffffff' },
    ],
    taillights: [{ x: 0.94, y: 1.12, z: -2.52, halfW: 0.06, halfH: 0.16, color: '#ff2222', mirror: true }],
  },

  // 19. DuneRunner V8 Buggy — Orange/Black Open Tubular Sand Buggy
  {
    id: 'dunerunner',
    name: 'DuneRunner V8 Buggy',
    paintHex: '#e8561a',
    accentHex: '#20242b',
    caliperHex: '#e8561a',
    rimHex: '#181a20',
    rimStyle: 'beadlock',
    tireWidth: 0.36,
    length: 4.05,
    width: 2.04,
    wheelbase: 2.78,
    trackWidth: 1.82,
    wheelRadius: 0.44,
    bodyParts: [
      // Minimalist orange buggy nose & side body panels
      { op: 'add', kind: 'box', center: [0, 0.72, 1.25], size: [0.46, 0.18, 0.65], round: 0.05, rotX: 0.18 },
      { op: 'add', kind: 'box', center: [0.58, 0.70, 0.0], size: [0.10, 0.18, 0.78], round: 0.03, mirror: true },
      { op: 'add', kind: 'box', center: [0, 0.52, 0], size: [0.54, 0.12, 1.65], round: 0.04 },
    ],
    canopyParts: [],
    carbonParts: [
      // Exposed rear V8 engine block & twin headers
      { op: 'add', kind: 'box', center: [0, 0.88, -1.25], size: [0.34, 0.24, 0.44], round: 0.04 },
      { op: 'add', kind: 'box', center: [0, 1.56, -0.10], size: [0.56, 0.03, 0.58], round: 0.02 },
    ],
    chromeParts: [
      // Full open tubular roll-cage!
      { op: 'add', kind: 'tube', center: [0.54, 0.78, 0.92], size: [0.48, 1.54, 0.25], round: 0.032, mirror: true },
      { op: 'add', kind: 'tube', center: [0.48, 1.54, 0.25], size: [0.48, 1.54, -0.65], round: 0.032, mirror: true },
      { op: 'add', kind: 'tube', center: [0.48, 1.54, -0.65], size: [0.44, 0.82, -1.78], round: 0.032, mirror: true },
      { op: 'add', kind: 'tube', center: [0.48, 1.54, 0.25], size: [-0.48, 1.54, 0.25], round: 0.032 },
      { op: 'add', kind: 'tube', center: [0.48, 1.54, -0.65], size: [-0.48, 1.54, -0.65], round: 0.032 },
    ],
    headlights: [{ x: 0.26, y: 0.82, z: 1.88, halfW: 0.08, halfH: 0.06, color: '#fff8d4', mirror: true }],
    taillights: [{ x: 0.36, y: 0.96, z: -1.76, halfW: 0.08, halfH: 0.04, color: '#ff1e2d', mirror: true }],
  },

  // 20. Zephyr E-Motion — Silver-Blue Futuristic Electric Aero Sedan
  {
    id: 'zephyr_emotion',
    name: 'Zephyr E-Motion',
    paintHex: '#9fb4c8',
    accentHex: '#38bdf8',
    caliperHex: '#38bdf8',
    rimHex: '#2f3642',
    rimStyle: 'multi',
    length: 4.86,
    width: 1.94,
    wheelbase: 2.92,
    trackWidth: 1.68,
    wheelRadius: 0.35,
    bodyParts: [
      { op: 'add', kind: 'profile', center: [0, 0, 0], size: [0, 0, 0], stations: coupeBody(0.95, 0.68, 0.92, 0.98, 0.02), round: 0.05 },
      ...wheelWellCarves(1.68, 0.35, 1.46, -1.46),
    ],
    canopyParts: [
      { op: 'add', kind: 'profile', center: [0, 0, 0], size: [0, 0, 0], stations: fastbackCanopy(0.94, 1.32, -1.72, 1.04), round: 0.04 },
    ],
    carbonParts: [
      { op: 'add', kind: 'box', center: [0, 0.16, 2.30], size: [0.86, 0.025, 0.16], round: 0.012 },
      { op: 'add', kind: 'box', center: [0, 0.22, -2.30], size: [0.82, 0.08, 0.14], round: 0.02 },
    ],
    wing: { z: -2.18, y: 1.06, halfW: 0.72, chord: 0.22, endplateH: 0.06, pylonStyle: 'swan' },
    headlights: [{ x: 0, y: 0.62, z: 2.34, halfW: 0.74, halfH: 0.022, color: '#dff6ff' }],
    taillights: [{ x: 0, y: 0.88, z: -2.34, halfW: 0.76, halfH: 0.02, color: '#ff2233' }],
  },

  // 21. Solstice Aero R — Emerald Racing Green Mid-Engine Track Supercar
  {
    id: 'solstice_r',
    name: 'Solstice Aero R',
    paintHex: '#0d6b3d',
    accentHex: '#15181e',
    caliperHex: '#d9a424',
    rimHex: '#2f343e',
    rimStyle: 'multi',
    length: 4.58,
    width: 1.99,
    wheelbase: 2.68,
    trackWidth: 1.72,
    wheelRadius: 0.35,
    bodyParts: [
      { op: 'add', kind: 'profile', center: [0, 0, 0], size: [0, 0, 0], stations: midEngineBody(0.98), round: 0.04 },
      { op: 'carve', kind: 'box', center: [0.94, 0.58, -0.45], size: [0.16, 0.18, 0.46], round: 0.04, mirror: true },
      ...wheelWellCarves(1.72, 0.35, 1.34, -1.34),
    ],
    canopyParts: [
      { op: 'add', kind: 'profile', center: [0, 0, 0], size: [0, 0, 0], stations: fastbackCanopy(0.92, 1.20, -1.00, 1.12), round: 0.03 },
    ],
    carbonParts: [
      { op: 'add', kind: 'box', center: [0, 0.14, 2.20], size: [0.94, 0.025, 0.20], round: 0.012 },
      { op: 'add', kind: 'box', center: [0.95, 0.16, 0], size: [0.08, 0.03, 1.08], round: 0.015, mirror: true },
      { op: 'add', kind: 'box', center: [0, 0.22, -2.20], size: [0.86, 0.10, 0.16], round: 0.02 },
    ],
    wing: { z: -2.10, y: 1.22, halfW: 0.90, chord: 0.28, endplateH: 0.18, pylonStyle: 'swan' },
    headlights: [{ x: 0.68, y: 0.54, z: 2.18, halfW: 0.16, halfH: 0.03, color: '#eef6ff', mirror: true }],
    taillights: [{ x: 0.60, y: 0.78, z: -2.26, halfW: 0.24, halfH: 0.03, color: '#ff1e2d', mirror: true }],
    exhausts: [{ x: 0.12, y: 0.34, z: -2.26, r: 0.052, mirror: true }],
  },

  // 22. Legacy GT-R 1975 — Gulf Blue & Orange Vintage GT Racecar
  {
    id: 'legacy_gtr',
    name: 'Legacy GT-R 1975',
    paintHex: '#73b2d9',
    accentHex: '#e86a17',
    caliperHex: '#e86a17',
    rimHex: '#4f5560',
    rimStyle: 'steelie',
    tireWidth: 0.25,
    length: 4.48,
    width: 1.86,
    wheelbase: 2.58,
    trackWidth: 1.58,
    wheelRadius: 0.33,
    bodyParts: [
      { op: 'add', kind: 'profile', center: [0, 0, 0], size: [0, 0, 0], stations: coupeBody(0.90, 0.76, 0.90, 0.94, 0.07), round: 0.04 },
      ...wheelWellCarves(1.58, 0.33, 1.29, -1.29),
    ],
    canopyParts: [
      { op: 'add', kind: 'profile', center: [0, 0, 0], size: [0, 0, 0], stations: fastbackCanopy(0.84, 1.24, -1.42, 0.48), round: 0.03 },
    ],
    carbonParts: [
      ...fenderFlares(1.58, 0.33, 1.29, -1.29, 0.07),
      { op: 'add', kind: 'box', center: [0, 0.18, 2.24], size: [0.84, 0.09, 0.12], round: 0.02, rotX: 0.22 },
    ],
    accentParts: [
      // Gulf orange center stripe & rocker trim
      { op: 'add', kind: 'box', center: [0, 0.88, 1.35], size: [0.22, 0.02, 0.85], round: 0.01 },
      { op: 'add', kind: 'box', center: [0.91, 0.24, 0], size: [0.02, 0.09, 1.85], round: 0.01, mirror: true },
    ],
    headlights: [
      { x: 0.56, y: 0.66, z: 2.24, halfW: 0.06, halfH: 0.06, color: '#ffd23f', mirror: true },
      { x: 0.72, y: 0.66, z: 2.24, halfW: 0.06, halfH: 0.06, color: '#ffd23f', mirror: true },
    ],
    taillights: [{ x: 0.60, y: 0.74, z: -2.26, halfW: 0.16, halfH: 0.04, color: '#ff2222', mirror: true }],
    exhausts: [{ x: 0.86, y: 0.20, z: -0.78, r: 0.038 }],
  },

  // 23. Kestrel Overland 4x4 — Army Olive Green Boxy Dakar SUV
  {
    id: 'overland_suv',
    name: 'Kestrel Overland 4x4',
    paintHex: '#4d5a3b',
    accentHex: '#e86a17',
    caliperHex: '#e86a17',
    rimHex: '#1b1e24',
    rimStyle: 'beadlock',
    tireWidth: 0.31,
    length: 4.88,
    width: 1.98,
    wheelbase: 2.86,
    trackWidth: 1.72,
    wheelRadius: 0.42,
    bodyParts: [
      {
        op: 'add',
        kind: 'profile',
        center: [0, 0, 0],
        size: [0, 0, 0],
        stations: [
          { z: -2.38, yBot: 0.44, yTop: 1.32, halfW: 0.94, tumble: 0.96, crown: 0.01, bevel: 0.06 },
          { z: 1.05, yBot: 0.42, yTop: 1.32, halfW: 0.96, tumble: 0.96, crown: 0.02, bevel: 0.06 },
          { z: 2.38, yBot: 0.46, yTop: 1.24, halfW: 0.92, tumble: 0.94, crown: 0.02, bevel: 0.06 },
        ],
        round: 0.04,
      },
      // Full-length boxy SUV cabin
      { op: 'add', kind: 'box', center: [0, 1.56, -0.62], size: [0.88, 0.32, 1.58], round: 0.08, blend: 0.04 },
      ...wheelWellCarves(1.72, 0.42, 1.43, -1.43, 0.11),
    ],
    canopyParts: [
      { op: 'add', kind: 'box', center: [0, 1.58, -0.58], size: [0.85, 0.24, 1.50], round: 0.06 },
    ],
    carbonParts: [
      ...fenderFlares(1.72, 0.42, 1.43, -1.43, 0.08),
      // Heavy-duty roof rack + spare tire on roof + rear spare tire
      { op: 'add', kind: 'box', center: [0, 1.94, -0.60], size: [0.78, 0.05, 1.38], round: 0.02 },
      { op: 'add', kind: 'cylX', center: [0, 1.06, -2.48], size: [0.38, 0.14, 0], round: 0.03, rotY: Math.PI / 2 },
      // Front bull bar & winch bumper
      { op: 'add', kind: 'box', center: [0, 0.62, 2.44], size: [0.90, 0.14, 0.10], round: 0.03 },
      { op: 'add', kind: 'tube', center: [0.52, 0.72, 2.48], size: [0.52, 1.16, 2.44], round: 0.03, mirror: true },
      { op: 'add', kind: 'tube', center: [0.52, 1.16, 2.44], size: [-0.52, 1.16, 2.44], round: 0.03 },
      // Snorkel on passenger A-pillar
      { op: 'add', kind: 'tube', center: [0.90, 1.18, 1.22], size: [0.84, 1.86, 0.92], round: 0.045 },
    ],
    headlights: [
      { x: 0.72, y: 1.02, z: 2.40, halfW: 0.14, halfH: 0.10, color: '#fff8e0', mirror: true },
      { x: 0, y: 1.95, z: 0.80, halfW: 0.58, halfH: 0.04, color: '#ffffff' },
    ],
    taillights: [{ x: 0.84, y: 1.04, z: -2.38, halfW: 0.08, halfH: 0.16, color: '#ff2222', mirror: true }],
  },
];

function main(): void {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const filter = process.argv[2]?.trim().toLowerCase();
  const list = filter ? BLUEPRINTS.filter((b) => b.id === filter) : BLUEPRINTS;
  const res = filter ? 128 : 108;
  for (const bp of list) {
    const t0 = Date.now();
    const model = buildCarCadModel(bp, res);
    const glb = packCadModelToGlb(model);
    const outPath = path.join(OUT_DIR, `${bp.id}.glb`);
    fs.writeFileSync(outPath, glb);
    const tris = model.meshes.reduce((s, m) => s + m.indices.length / 3, 0);
    console.log(
      `[argilla-cad] Built ${bp.id}.glb (${tris.toLocaleString()} tris, ${(glb.byteLength / 1024).toFixed(1)} KB) in ${Date.now() - t0}ms`
    );
  }
}

main();
