/**
 * classicBookTelaFlourishes.ts
 * ----------------------------------------------------------------------------
 * Art Council Unleashed — Museum-Grade, Radically Book-Specific Page Treatments
 * built natively with Tela's Illustrator-grade Geometry & Painterly Scene Engine
 * (`services/tela/geometry`) and directed by the 6-Member Art Council
 * (`COUNCIL_DIRECTORS` in `services/council/councilDirectors.ts`).
 *
 * Every one of the 12 classic books is deliberated by a bespoke triad from the
 * Art Council (`CLASSICAL`, `REBEL`, `FUTURIST`, `WORLD_ECLECTIC`, `BAROQUE`,
 * `RADICAL_MINIMAL`) and receives 8 completely unique, non-generic vector/painterly
 * page zones:
 * 1. Top Corner Architectural/Narrative Vignette (`topCornerSvg`)
 * 2. Bottom Corner Foreground Tableau (`bottomCornerSvg`)
 * 3. Monumental Chapter Crest Panorama (`chapterCrestSvg`)
 * 4. Bespoke Under-Title Artifact Finial (`underTitleSvg`)
 * 5. Book-Specific Illuminated Drop-Cap Cartouche (`illuminatedDropCapSvg`)
 * 6. Book-Specific Outer-Margin Vertical Border (`marginGarlandSvg`)
 * 7. Mid-Chapter Scene-Break Divider (`sceneBreakSvg`)
 * 8. Subtle Full-Page Background Engraving Watermark (`watermarkSvg`)
 */

import type { TelaVectorObject } from '../../types';
import { COUNCIL_DIRECTORS } from '../council/councilDirectors';
import type { CouncilDirectorId } from '../council/councilTypes';
import {
  Scene,
  rectPath,
  circlePath,
  ellipseAt,
  polygonPath,
  starPath,
  spiralPath,
  smoothThrough,
  linePath,
  PROFILES,
  boolean,
  procedural,
} from './geometry';
import { callGemini } from '../geminiService';

const {
  painted,
  wash,
  brushStroke,
  leaf,
  leafVein,
  petal,
  blob,
  cloud,
  hill,
  wave,
  sparkle,
  radialRepeat,
  hatch,
  crossHatch,
  stipple,
} = procedural;

export interface ArtCouncilPageDeliberation {
  leadDirectorId: CouncilDirectorId;
  leadDirectorName: string;
  leadDirectorEpithet: string;
  counterpointDirectorId: CouncilDirectorId;
  counterpointDirectorName: string;
  counterpointDirectorEpithet: string;
  editorDirectorId: CouncilDirectorId;
  editorDirectorName: string;
  structuralDirective: string;
  materialCraft: string;
  tensionResolved: string;
  borderArchitectureName: string;
  dropCapArchitectureName: string;
}

export interface TelaFlourishBundle {
  themeId: string;
  title: string;
  mediumDescription: string;
  artCouncilDeliberation: ArtCouncilPageDeliberation;
  topCornerSvg: string;
  bottomCornerSvg: string;
  chapterCrestSvg: string;
  underTitleSvg: string;
  illuminatedDropCapSvg: string;
  marginGarlandSvg: string;
  sceneBreakSvg: string;
  watermarkSvg: string;
  editableObjects: TelaVectorObject[];
}

export interface OmniFlourishRecipe {
  themeId: string;
  primaryFlowerColor: string;
  secondaryBotanicalColor: string;
  foliageColor: string;
  goldFiligreeColor: string;
  inkColor: string;
  medium: 'watercolor' | 'gouache' | 'linocut' | 'felt';
  rosePetals: number;
  foxgloveBells: number;
  peacockRays: number;
  notes: string;
}

const svgCache = new Map<string, TelaFlourishBundle>();

function makeCouncilDeliberation(
  leadId: CouncilDirectorId,
  counterId: CouncilDirectorId,
  editorId: CouncilDirectorId,
  spec: {
    structuralDirective: string;
    materialCraft: string;
    tensionResolved: string;
    borderArchitectureName: string;
    dropCapArchitectureName: string;
  }
): ArtCouncilPageDeliberation {
  const lead = COUNCIL_DIRECTORS[leadId];
  const counter = COUNCIL_DIRECTORS[counterId];
  const editor = COUNCIL_DIRECTORS[editorId];
  return {
    leadDirectorId: leadId,
    leadDirectorName: lead?.name || leadId,
    leadDirectorEpithet: lead?.epithet || 'Lead Director',
    counterpointDirectorId: counterId,
    counterpointDirectorName: counter?.name || counterId,
    counterpointDirectorEpithet: counter?.epithet || 'Counterpoint Director',
    editorDirectorId: editorId,
    editorDirectorName: editor?.name || editorId,
    ...spec,
  };
}

/**
 * Multi-layered Painterly Regency Briar Rose (used ONLY for botanical/garden books)
 */
function drawTelaBriarRose(
  s: Scene,
  cx: number,
  cy: number,
  radius: number,
  outerColor: string,
  midColor: string,
  coreColor: string,
  inkColor: string,
  goldColor: string,
  seed: number,
  petalCount = 8
) {
  s.group('Tela Briar Rose', () => {
    wash(s, circlePath(cx, cy, radius * 1.22), outerColor, {
      opacity: 0.28,
      edge: 6,
      seed,
      label: 'Rose Watercolor Halo',
    });

    const outerPetal = petal(cx, cy, radius, radius * 0.62, -90);
    const outerRing = radialRepeat(outerPetal, petalCount, { x: cx, y: cy }, 12);
    outerRing.forEach((p, i) => {
      painted(s, p, outerColor, {
        medium: 'watercolor',
        light: 225,
        shadow: 0.45,
        highlight: 0.55,
        ink: inkColor,
        inkWidth: 0.85,
        seed: seed + i * 7,
        label: `Outer Petal ${i + 1}`,
      });
    });

    const midPetal = petal(cx, cy, radius * 0.72, radius * 0.48, -90);
    const midRing = radialRepeat(midPetal, Math.max(5, petalCount - 2), { x: cx, y: cy }, 38);
    midRing.forEach((p, i) => {
      painted(s, p, midColor, {
        medium: 'gouache',
        light: 215,
        shadow: 0.4,
        highlight: 0.6,
        ink: inkColor,
        inkWidth: 0.78,
        seed: seed + 50 + i * 5,
        label: `Inner Petal ${i + 1}`,
      });
    });

    const innerBud = blob(cx, cy, radius * 0.36, radius * 0.34, {
      seed: seed + 99,
      wobble: 0.16,
      points: 7,
    });
    painted(s, innerBud, coreColor, {
      medium: 'gouache',
      shadow: 0.5,
      highlight: 0.65,
      ink: inkColor,
      inkWidth: 0.72,
      seed: seed + 101,
      label: 'Rose Heart',
    });

    const stamenCircle = circlePath(cx, cy, radius * 0.22);
    s.fill(stipple(stamenCircle, { r: 2.1, dot: 1.15, seed: seed + 202 }), goldColor, {
      label: 'Golden Stamens',
    });
    s.ink(
      spiralPath(cx, cy, radius * 0.26, 0.76, 6, true, 15),
      goldColor,
      1.05,
      PROFILES.taper,
      { label: 'Gold Filigree Swirl' }
    );
  });
}

/**
 * Painterly Botanical Leaf with Variable-Width Ink Midrib & Veins
 */
function drawTelaBotanicalLeaf(
  s: Scene,
  baseX: number,
  baseY: number,
  tipX: number,
  tipY: number,
  leafColor: string,
  inkColor: string,
  goldVeinColor: string,
  widthFrac = 0.42,
  bend = 0.12,
  seed = 1
) {
  const lf = leaf({ x: baseX, y: baseY }, { x: tipX, y: tipY }, {
    width: widthFrac,
    bend,
    asym: 0.15,
    tipSharp: 0.3,
    seed,
  });
  painted(s, lf, leafColor, {
    medium: 'gouache',
    light: 220,
    shadow: 0.45,
    highlight: 0.42,
    ink: inkColor,
    inkWidth: 0.85,
    seed,
    label: 'Botanical Leaf',
  });
  const vein = leafVein({ x: baseX, y: baseY }, { x: tipX, y: tipY }, bend * 0.5);
  s.ink(vein, goldVeinColor, 1.1, PROFILES.tail, {
    opacity: 0.85,
    label: 'Leaf Midrib Vein',
  });
}

/**
 * Helper: Bat silhouette for Dracula
 */
function drawGothicBat(s: Scene, cx: number, cy: number, span: number, fill: string, rimColor: string) {
  const wingL = smoothThrough(
    [
      { x: cx, y: cy },
      { x: cx - span * 0.48, y: cy - span * 0.36 },
      { x: cx - span * 0.72, y: cy - span * 0.06 },
      { x: cx - span * 0.38, y: cy + span * 0.12 },
      { x: cx - span * 0.16, y: cy + span * 0.24 },
      { x: cx, y: cy + span * 0.08 },
    ],
    true,
    0.25
  );
  const wingR = smoothThrough(
    [
      { x: cx, y: cy },
      { x: cx + span * 0.48, y: cy - span * 0.36 },
      { x: cx + span * 0.72, y: cy - span * 0.06 },
      { x: cx + span * 0.38, y: cy + span * 0.12 },
      { x: cx + span * 0.16, y: cy + span * 0.24 },
      { x: cx, y: cy + span * 0.08 },
    ],
    true,
    0.25
  );
  s.fill(wingL, fill);
  s.fill(wingR, fill);
  s.stroke(wingL, rimColor, 0.75, {}, { opacity: 0.7 });
  s.stroke(wingR, rimColor, 0.75, {}, { opacity: 0.7 });
  s.fill(circlePath(cx - 2.2, cy - 1, 1.1), '#F43F5E');
  s.fill(circlePath(cx + 2.2, cy - 1, 1.1), '#F43F5E');
}

/**
 * Helper: Classical Chinese 5-Petal Plum Blossom (Meihua) for The Art of War
 */
function drawChinesePlumBlossom(
  s: Scene,
  cx: number,
  cy: number,
  radius: number,
  petalColor: string,
  coreColor: string,
  inkColor: string,
  goldColor: string,
  seed: number
) {
  for (let i = 0; i < 5; i++) {
    const ang = (-90 + i * 72) * (Math.PI / 180);
    const px = cx + Math.cos(ang) * (radius * 0.56);
    const py = cy + Math.sin(ang) * (radius * 0.56);
    const p = circlePath(px, py, radius * 0.46);
    painted(s, p, petalColor, {
      medium: 'watercolor',
      ink: inkColor,
      inkWidth: 0.85,
      highlight: 0.55,
      seed: seed + i,
    });
    // Stamens radiating from center
    const sx = cx + Math.cos(ang) * (radius * 0.42);
    const sy = cy + Math.sin(ang) * (radius * 0.42);
    s.ink(linePath(cx, cy, sx, sy), inkColor, 0.8, PROFILES.uniform);
    s.fill(circlePath(sx, sy, 1.6), goldColor);
  }
  painted(s, circlePath(cx, cy, radius * 0.22), coreColor, {
    medium: 'gouache',
    ink: goldColor,
    inkWidth: 0.8,
    seed: seed + 9,
  });
}

/**
 * Helper: 16-Point Nautical Brass Compass Rose for Moby Dick
 */
function drawNauticalCompassRose(
  s: Scene,
  cx: number,
  cy: number,
  radius: number,
  brass: string,
  goldBright: string,
  oceanTeal: string,
  abyss: string,
  seed: number
) {
  s.stroke(circlePath(cx, cy, radius * 1.08), brass, 1.4);
  s.stroke(circlePath(cx, cy, radius * 0.92), abyss, 0.9, { dash: [2, 2] });
  const minorStar = starPath(cx, cy, radius * 0.78, radius * 0.26, 8, 22.5);
  painted(s, minorStar, oceanTeal, { medium: 'linocut', ink: abyss, inkWidth: 0.9, seed });
  const majorStar = starPath(cx, cy, radius, radius * 0.28, 4, 0);
  painted(s, majorStar, goldBright, { medium: 'gouache', ink: abyss, inkWidth: 1.1, highlight: 0.7, seed: seed + 1 });
  const diagStar = starPath(cx, cy, radius * 0.86, radius * 0.22, 4, 45);
  painted(s, diagStar, brass, { medium: 'gouache', ink: abyss, inkWidth: 0.95, seed: seed + 2 });
  painted(s, circlePath(cx, cy, radius * 0.2), abyss, { medium: 'gouache', ink: goldBright, inkWidth: 1.0, seed: seed + 3 });
}

/**
 * Helper: Faceted Emerald / Sapphire Jewel for The Count of Monte Cristo
 */
function drawFacetedJewel(
  s: Scene,
  cx: number,
  cy: number,
  radius: number,
  jewelColor: string,
  highlightColor: string,
  goldColor: string,
  inkColor: string,
  seed: number
) {
  const outerBezel = polygonPath(cx, cy, radius * 1.14, 8, 22.5, 1.5);
  painted(s, outerBezel, goldColor, { medium: 'gouache', ink: inkColor, inkWidth: 1.1, highlight: 0.7, seed });
  const gemOct = polygonPath(cx, cy, radius * 0.92, 8, 22.5, 0.5);
  painted(s, gemOct, jewelColor, { medium: 'gouache', ink: inkColor, inkWidth: 0.9, highlight: 0.8, seed: seed + 1 });
  const tableOct = polygonPath(cx, cy, radius * 0.52, 8, 22.5, 0);
  painted(s, tableOct, highlightColor, { medium: 'watercolor', ink: goldColor, inkWidth: 0.7, opacity: 0.85, seed: seed + 2 });
  for (let i = 0; i < 8; i++) {
    const a = ((22.5 + i * 45) * Math.PI) / 180;
    s.ink(
      linePath(cx + Math.cos(a) * radius * 0.52, cy + Math.sin(a) * radius * 0.52, cx + Math.cos(a) * radius * 0.92, cy + Math.sin(a) * radius * 0.92),
      goldColor,
      0.7,
      PROFILES.uniform
    );
  }
}

/**
 * Helper: Galvanic Copper Coil & Ceramic Insulator Node for Frankenstein
 */
function drawGalvanicCoilNode(
  s: Scene,
  cx: number,
  cy: number,
  radius: number,
  copper: string,
  amber: string,
  iceBlue: string,
  indigo: string,
  seed: number
) {
  wash(s, circlePath(cx, cy, radius * 1.35), iceBlue, { opacity: 0.3, edge: 6, seed });
  const flange = polygonPath(cx, cy, radius, 6, 0, 1.5);
  painted(s, flange, copper, { medium: 'gouache', ink: indigo, inkWidth: 1.2, highlight: 0.65, seed: seed + 1 });
  // Concentric copper windings
  s.stroke(circlePath(cx, cy, radius * 0.74), amber, 1.5, { dash: [3, 1.5] });
  s.stroke(circlePath(cx, cy, radius * 0.52), indigo, 1.1);
  painted(s, circlePath(cx, cy, radius * 0.36), iceBlue, { medium: 'gouache', ink: '#FFFFFF', inkWidth: 1.0, highlight: 0.9, seed: seed + 2 });
  s.fill(sparkle(cx, cy, radius * 0.55), '#FFFFFF');
}

/**
 * Builds the complete Tela `Scene` bundle for any of the 12 classic books,
 * directed by the 6-Member Art Council (`COUNCIL_DIRECTORS`).
 */
export function buildClassicBookTelaFlourishBundle(
  themeId: string,
  recipeOverride?: Partial<OmniFlourishRecipe>
): TelaFlourishBundle {
  const cacheKey = `${themeId}:${JSON.stringify(recipeOverride || {})}`;
  if (svgCache.has(cacheKey)) {
    return svgCache.get(cacheKey)!;
  }

  const topScene = new Scene({ width: 165, height: 165, seed: `${themeId}_top`, idPrefix: `${themeId}_tl` });
  const botScene = new Scene({ width: 175, height: 175, seed: `${themeId}_bot`, idPrefix: `${themeId}_bl` });
  const crestScene = new Scene({ width: 280, height: 92, seed: `${themeId}_crest`, idPrefix: `${themeId}_cr` });
  const underScene = new Scene({ width: 320, height: 48, seed: `${themeId}_under`, idPrefix: `${themeId}_un` });
  const dropScene = new Scene({ width: 88, height: 88, seed: `${themeId}_drop`, idPrefix: `${themeId}_dc` });
  const marginScene = new Scene({ width: 44, height: 320, seed: `${themeId}_margin`, idPrefix: `${themeId}_mg` });
  const breakScene = new Scene({ width: 240, height: 32, seed: `${themeId}_break`, idPrefix: `${themeId}_sb` });
  const watermarkScene = new Scene({ width: 260, height: 260, seed: `${themeId}_wm`, idPrefix: `${themeId}_wm` });

  let title = 'Classic Edition';
  let mediumDescription = 'Tela Painterly Gouache, Watercolor Wash & Variable-Width Ink Engraving';
  let artCouncilDeliberation: ArtCouncilPageDeliberation = makeCouncilDeliberation(
    'CLASSICAL',
    'BAROQUE',
    'RADICAL_MINIMAL',
    {
      structuralDirective: 'Classical proportional page canon with Baroque botanical relief.',
      materialCraft: 'Watercolor wash, botanical gouache, and variable-width gold calligraphy.',
      tensionResolved: 'Ornament earns its place by framing the reading corridor without intruding on typography.',
      borderArchitectureName: 'Regency Wisteria & Peacock Filigree Trellis',
      dropCapArchitectureName: 'Wedgwood & Gilt Regency Cameo Cartouche',
    }
  );

  switch (themeId) {
    // =========================================================================
    // 1. PRIDE AND PREJUDICE — CLASSICAL × BAROQUE (Edited by RADICAL_MINIMAL)
    //    Regency Botanical Garden, Peacock-Feather Ocelles, Wisteria Trellis & Pemberley
    // =========================================================================
    case 'pride-and-prejudice': {
      title = 'Pride and Prejudice · Regency Botanical Garden, Peacock Filigree & Pemberley Estate';
      mediumDescription = 'Tela Watercolor Wash, Regency Gold Peacock Filigree & Botanical Gouache (Hugh Thomson 1894 Lineage)';
      artCouncilDeliberation = makeCouncilDeliberation('CLASSICAL', 'BAROQUE', 'RADICAL_MINIMAL', {
        structuralDirective:
          'Palladian architectural symmetry (Pemberley colonnade) softened by romantic Regency botanical abundance—briar roses, foxgloves, lavender, and gold peacock-feather ocelles.',
        materialCraft:
          'Soft sage-and-blush watercolor washes layered under multi-petal botanical gouache and 1894 Hugh Thomson gilded peacock-feather ink filigree.',
        tensionResolved:
          'The Classical Mind enforces Pemberley’s Georgian architectural poise; the Baroque Dramatist blooms wild English roses across the threshold, mirroring Darcy’s reserve and Elizabeth’s wit.',
        borderArchitectureName: 'Pemberley Wisteria, Briar-Rose & Peacock-Eye Trellis',
        dropCapArchitectureName: 'Gilded Regency Oval Cameo & Peacock Plume Medallion',
      });

      const gold = recipeOverride?.goldFiligreeColor || '#B88928';
      const goldBright = '#E8C56B';
      const roseOuter = recipeOverride?.primaryFlowerColor || '#E4899B';
      const roseMid = '#F4B6C2';
      const roseCore = '#B6465F';
      const foxglove = recipeOverride?.secondaryBotanicalColor || '#C86D8A';
      const lavender = '#8E7CC3';
      const sage = recipeOverride?.foliageColor || '#4A6B53';
      const sageLight = '#7FA686';
      const ink = recipeOverride?.inkColor || '#2F4636';

      // 1. Top Corner: Regency Double-Filigree + Iridescent Peacock Feather Eye + Briar Roses
      topScene.layer(0, () => {
        const outerFrame = smoothThrough([{ x: 8, y: 152 }, { x: 8, y: 20 }, { x: 20, y: 8 }, { x: 152, y: 8 }], false, 0.35);
        topScene.ink(outerFrame, gold, 3.0, PROFILES.ink);
        const innerFrame = smoothThrough([{ x: 15, y: 140 }, { x: 15, y: 28 }, { x: 28, y: 15 }, { x: 140, y: 15 }], false, 0.35);
        topScene.stroke(innerFrame, sageLight, 1.1, { dash: [4, 3] }, { opacity: 0.8 });
        topScene.ink(spiralPath(88, 24, 16, 0.78, 7, true, 180), gold, 1.9, PROFILES.brush);
        topScene.ink(spiralPath(24, 88, 16, 0.78, 7, false, 90), gold, 1.9, PROFILES.brush);

        const barbPetal = petal(38, 38, 36, 8, 45);
        const barbs = radialRepeat(barbPetal, recipeOverride?.peacockRays || 9, { x: 38, y: 38 }, -15);
        barbs.forEach((b, i) => {
          if (i <= 5) topScene.ink(b, i % 2 === 0 ? gold : sageLight, 1.4, PROFILES.taper, { opacity: 0.85 });
        });
        painted(topScene, ellipseAt(38, 38, 17, 13, 45), sage, { medium: 'gouache', ink: gold, inkWidth: 1.5, highlight: 0.6, seed: 11 });
        painted(topScene, ellipseAt(38, 38, 9, 7, 45), goldBright, { medium: 'gouache', ink, inkWidth: 0.9, seed: 12 });
        drawTelaBotanicalLeaf(topScene, 54, 24, 106, 13, sageLight, ink, goldBright, 0.38, 0.14, 21);
        drawTelaBotanicalLeaf(topScene, 24, 54, 13, 106, sage, ink, goldBright, 0.38, -0.14, 22);
        drawTelaBotanicalLeaf(topScene, 76, 36, 124, 26, sage, ink, goldBright, 0.34, 0.12, 23);
        drawTelaBriarRose(topScene, 62, 62, 16, roseOuter, roseMid, roseCore, ink, goldBright, 33);
        drawTelaBriarRose(topScene, 102, 24, 10, roseMid, '#FDE2E8', roseCore, ink, goldBright, 34, 6);
        drawTelaBriarRose(topScene, 24, 102, 10, roseMid, '#FDE2E8', roseCore, ink, goldBright, 35, 6);
      });

      // 2. Bottom Corner: English Country Garden Bouquet (Foxgloves, Lavender Spires, Briar Roses & Daisy)
      botScene.layer(0, () => {
        const outerRail = smoothThrough([{ x: 8, y: 16 }, { x: 8, y: 150 }, { x: 20, y: 162 }, { x: 160, y: 162 }], false, 0.32);
        botScene.ink(outerRail, gold, 3.0, PROFILES.ink);
        const foxgloveStem = smoothThrough([{ x: 18, y: 154 }, { x: 24, y: 96 }, { x: 34, y: 22 }], false, 0.5);
        const lavenderStem = smoothThrough([{ x: 26, y: 154 }, { x: 58, y: 104 }, { x: 88, y: 46 }], false, 0.5);
        const roseVine = smoothThrough([{ x: 22, y: 154 }, { x: 82, y: 142 }, { x: 152, y: 126 }], false, 0.5);
        botScene.ink(foxgloveStem, sage, 2.6, PROFILES.tail);
        botScene.ink(lavenderStem, sageLight, 2.0, PROFILES.tail);
        botScene.ink(roseVine, sage, 2.5, PROFILES.tail);

        drawTelaBotanicalLeaf(botScene, 26, 138, 68, 108, sage, ink, goldBright, 0.44, -0.15, 41);
        drawTelaBotanicalLeaf(botScene, 48, 148, 104, 118, sageLight, ink, goldBright, 0.42, 0.12, 42);
        drawTelaBotanicalLeaf(botScene, 18, 112, 52, 78, sageLight, ink, goldBright, 0.38, 0.16, 43);
        drawTelaBotanicalLeaf(botScene, 86, 148, 140, 132, sage, ink, goldBright, 0.4, -0.1, 44);

        const bellCount = recipeOverride?.foxgloveBells || 5;
        for (let i = 0; i < bellCount; i++) {
          const bx = 22 + i * 2.8 + (i % 2 === 0 ? -6 : 6);
          const by = 104 - i * 16;
          const bell = blob(bx, by, 8.5 - i * 0.8, 6.2 - i * 0.5, { seed: 50 + i, wobble: 0.18, rot: i % 2 === 0 ? -25 : 25 });
          painted(botScene, bell, foxglove, { medium: 'watercolor', ink: roseCore, inkWidth: 0.75, highlight: 0.55, seed: 60 + i });
          botScene.fill(circlePath(bx, by + 1, 1.3), '#FFF5FA', { opacity: 0.85 });
        }

        for (let i = 0; i < 5; i++) {
          const lx = 52 + i * 7.5;
          const ly = 106 - i * 12;
          painted(botScene, petal(lx, ly, 8, 4.2, -135), lavender, { medium: 'gouache', ink: '#4A3570', inkWidth: 0.6, seed: 70 + i });
          painted(botScene, petal(lx, ly, 8, 4.2, -35), lavender, { medium: 'gouache', ink: '#4A3570', inkWidth: 0.6, seed: 80 + i });
        }

        drawTelaBriarRose(botScene, 44, 130, 24, roseOuter, roseMid, roseCore, ink, goldBright, 91);
        drawTelaBriarRose(botScene, 96, 140, 16, roseMid, '#FDE2E8', roseOuter, ink, goldBright, 92);
        drawTelaBriarRose(botScene, 134, 144, 11, roseOuter, roseMid, roseCore, ink, goldBright, 93, 6);

        radialRepeat(petal(70, 102, 11, 4.2, 0), 10, { x: 70, y: 102 }, 0).forEach((dp, idx) => {
          painted(botScene, dp, '#FFFDF9', { medium: 'gouache', ink: gold, inkWidth: 0.55, seed: 110 + idx });
        });
        painted(botScene, circlePath(70, 102, 4.2), goldBright, { medium: 'gouache', ink: gold, inkWidth: 0.8, seed: 125 });
      });

      // 3. Chapter Crest: Pemberley Palladian Manor Reflected in the Lake
      crestScene.layer(0, () => {
        wash(crestScene, ellipseAt(140, 42, 98, 34), '#F8E3A3', { opacity: 0.45, edge: 8, seed: 301 });
        for (let i = 0; i < 9; i++) {
          const ang = (-160 + i * 17.5) * (Math.PI / 180);
          crestScene.ink(linePath(140, 48, 140 + Math.cos(ang) * 88, 48 + Math.sin(ang) * 42), goldBright, 1.4, PROFILES.taper, { opacity: 0.58 });
        }
        painted(crestScene, rectPath(94, 26, 92, 26, 1), '#FBF3E4', { medium: 'gouache', ink: gold, inkWidth: 1.2, shadow: 0.35, seed: 305 });
        painted(crestScene, polygonPath(140, 21, 26, 3, -90), '#F3E2C3', { medium: 'gouache', ink: gold, inkWidth: 1.2, seed: 306 });
        [104, 116, 128, 140, 152, 164, 176].forEach((cx) => {
          crestScene.ink(linePath(cx, 27, cx, 52), gold, 1.35, PROFILES.uniform);
        });
        for (let w = 0; w < 3; w++) {
          crestScene.ink(wave(56 + w * 14, 224 - w * 14, 59 + w * 5, 1.8, 28, w * 1.2, 0.1, 310 + w), w % 2 === 0 ? gold : sageLight, 1.25, PROFILES.taper, { opacity: 0.78 });
        }
        drawTelaBotanicalLeaf(crestScene, 76, 52, 24, 26, sage, ink, goldBright, 0.42, 0.15, 322);
        drawTelaBotanicalLeaf(crestScene, 72, 58, 18, 48, sageLight, ink, goldBright, 0.38, -0.12, 324);
        drawTelaBotanicalLeaf(crestScene, 204, 52, 256, 26, sage, ink, goldBright, 0.42, -0.15, 323);
        drawTelaBotanicalLeaf(crestScene, 208, 58, 262, 48, sageLight, ink, goldBright, 0.38, 0.12, 325);
        drawTelaBriarRose(crestScene, 54, 48, 15, roseOuter, roseMid, roseCore, ink, goldBright, 320);
        drawTelaBriarRose(crestScene, 226, 48, 15, roseOuter, roseMid, roseCore, ink, goldBright, 321);
      });

      // 4. Under-Title: Darcy's Wax-Sealed Letter at Hunsford Flanked by Briar Roses
      underScene.layer(0, () => {
        underScene.ink(smoothThrough([{ x: 16, y: 24 }, { x: 78, y: 13 }, { x: 138, y: 24 }], false, 0.5), sage, 1.9, PROFILES.taper);
        underScene.ink(smoothThrough([{ x: 304, y: 24 }, { x: 242, y: 13 }, { x: 182, y: 24 }], false, 0.5), sage, 1.9, PROFILES.taper);
        drawTelaBotanicalLeaf(underScene, 72, 18, 42, 10, sageLight, ink, goldBright, 0.36, 0.12, 338);
        drawTelaBotanicalLeaf(underScene, 248, 18, 278, 10, sageLight, ink, goldBright, 0.36, -0.12, 339);
        drawTelaBriarRose(underScene, 96, 22, 10.5, roseOuter, roseMid, roseCore, ink, goldBright, 340);
        drawTelaBriarRose(underScene, 224, 22, 10.5, roseOuter, roseMid, roseCore, ink, goldBright, 341);
        painted(underScene, rectPath(142, 11, 36, 25, 2), '#FFFDF7', { medium: 'gouache', ink: gold, inkWidth: 1.2, seed: 345 });
        underScene.ink(smoothThrough([{ x: 142, y: 11 }, { x: 160, y: 25 }, { x: 178, y: 11 }], false, 0.2), gold, 1.1, PROFILES.uniform);
        painted(underScene, circlePath(160, 24, 5.8), roseCore, { medium: 'gouache', ink: goldBright, inkWidth: 0.85, seed: 346 });
      });

      // 5. Bespoke Drop-Cap: Regency Gilt Oval Cameo Cartouche with Peacock Plume & Briar Rose
      dropScene.layer(0, () => {
        wash(dropScene, circlePath(44, 44, 40), roseOuter, { opacity: 0.22, edge: 6, seed: 360 });
        painted(dropScene, ellipseAt(44, 44, 38, 41, 0), '#FFFDF9', { medium: 'watercolor', ink: gold, inkWidth: 2.0, shadow: 0.2, seed: 361 });
        dropScene.stroke(ellipseAt(44, 44, 32, 35, 0), gold, 1.0, { dash: [3, 2] });
        // Peacock eye at top crown of oval cameo
        painted(dropScene, ellipseAt(44, 10, 10, 6, 0), sage, { medium: 'gouache', ink: gold, inkWidth: 1.1, seed: 362 });
        painted(dropScene, circlePath(44, 10, 3.2), goldBright, { medium: 'gouache', ink, inkWidth: 0.7, seed: 363 });
        drawTelaBotanicalLeaf(dropScene, 14, 66, 30, 80, sage, ink, goldBright, 0.36, 0.14, 364);
        drawTelaBotanicalLeaf(dropScene, 74, 66, 58, 80, sage, ink, goldBright, 0.36, -0.14, 365);
        drawTelaBriarRose(dropScene, 16, 22, 9, roseOuter, roseMid, roseCore, ink, goldBright, 366, 6);
        drawTelaBriarRose(dropScene, 72, 68, 10, roseOuter, roseMid, roseCore, ink, goldBright, 367, 6);
      });

      // 6. Bespoke Margin Border: Regency Wisteria, Peacock-Feather Ocelles & Briar-Rose Trellis
      marginScene.layer(0, () => {
        marginScene.stroke(linePath(10, 10, 10, 310), gold, 0.85, { dash: [6, 3] }, { opacity: 0.55 });
        marginScene.stroke(linePath(34, 10, 34, 310), gold, 0.85, { dash: [6, 3] }, { opacity: 0.55 });
        const vine = smoothThrough([{ x: 22, y: 10 }, { x: 11, y: 74 }, { x: 33, y: 138 }, { x: 12, y: 202 }, { x: 32, y: 266 }, { x: 22, y: 312 }], false, 0.5);
        marginScene.ink(vine, sage, 2.0, PROFILES.taper);
        // Hanging wisteria clusters + peacock eyes + briar roses
        [44, 116, 188, 256].forEach((wy, idx) => {
          const dir = idx % 2 === 0 ? 1 : -1;
          drawTelaBotanicalLeaf(marginScene, 22, wy, 22 + dir * 16, wy - 14, sageLight, ink, goldBright, 0.38, dir * 0.14, 370 + idx);
          for (let b = 0; b < 3; b++) {
            painted(marginScene, petal(22 - dir * 6, wy + 8 + b * 6, 6.5 - b, 3.8, 90), lavender, { medium: 'watercolor', ink: '#4A3570', inkWidth: 0.5, seed: 380 + idx * 4 + b });
          }
        });
        drawTelaBriarRose(marginScene, 22, 82, 10, roseOuter, roseMid, roseCore, ink, goldBright, 390, 7);
        painted(marginScene, ellipseAt(22, 160, 11, 8, 0), sage, { medium: 'gouache', ink: gold, inkWidth: 1.2, seed: 391 });
        painted(marginScene, circlePath(22, 160, 4.5), goldBright, { medium: 'gouache', ink, inkWidth: 0.8, seed: 392 });
        drawTelaBriarRose(marginScene, 22, 234, 10, foxglove, roseMid, gold, ink, goldBright, 393, 7);
      });

      // 7. Scene-Break Divider: Twin Peacock Feathers & Briar Rose Bud
      breakScene.layer(0, () => {
        breakScene.ink(smoothThrough([{ x: 24, y: 16 }, { x: 80, y: 10 }, { x: 120, y: 16 }, { x: 160, y: 22 }, { x: 216, y: 16 }], false, 0.45), gold, 1.6, PROFILES.taper);
        painted(breakScene, ellipseAt(74, 16, 9, 5, -12), sage, { medium: 'gouache', ink: gold, inkWidth: 0.9, seed: 395 });
        painted(breakScene, ellipseAt(166, 16, 9, 5, 12), sage, { medium: 'gouache', ink: gold, inkWidth: 0.9, seed: 396 });
        drawTelaBriarRose(breakScene, 120, 16, 8.5, roseOuter, roseMid, roseCore, ink, goldBright, 397, 6);
      });

      // 8. Watermark: Pemberley Palladian Rotunda & Peacock Filigree Medallion
      watermarkScene.layer(0, () => {
        watermarkScene.stroke(circlePath(130, 130, 104), gold, 1.4, { dash: [6, 4] }, { opacity: 0.35 });
        watermarkScene.stroke(circlePath(130, 130, 88), sage, 1.0, {}, { opacity: 0.28 });
        watermarkScene.stroke(rectPath(74, 96, 112, 48, 2), gold, 1.5, {}, { opacity: 0.35 });
        watermarkScene.stroke(polygonPath(130, 82, 42, 3, -90), gold, 1.5, {}, { opacity: 0.35 });
        [88, 104, 120, 130, 140, 156, 172].forEach((cx) => {
          watermarkScene.stroke(linePath(cx, 96, cx, 144), gold, 1.2, {}, { opacity: 0.32 });
        });
        watermarkScene.stroke(wave(60, 200, 158, 4, 36, 0, 0.1, 399), sage, 1.3, {}, { opacity: 0.3 });
      });
      break;
    }

    // =========================================================================
    // 2. ALICE IN WONDERLAND — BAROQUE × FUTURIST (Edited by REBEL)
    //    Baroque Keyhole Escutcheon, Cheshire Grin, Half-Painted Roses & Playing Cards
    // =========================================================================
    case 'alice-in-wonderland': {
      title = 'Alice’s Adventures in Wonderland · Golden Keyhole, Cheshire Cat Grin, Playing Cards & Painted Roses';
      mediumDescription = 'Tela Golden Age Storybook Watercolor, Bioluminescent Gouache & Tenniel Cross-Hatched Ink';
      artCouncilDeliberation = makeCouncilDeliberation('BAROQUE', 'FUTURIST', 'REBEL', {
        structuralDirective:
          'Surreal scale-shifting frame: an oversized Baroque golden keyhole and tumbling playing-card geometry (♠ ♥ ♣ ♦) colliding with dripping half-painted roses and Cheshire Cat grin arcs.',
        materialCraft:
          'John Tenniel cross-hatched ink line paired with Arthur Rackham twilight watercolor washes, bioluminescent mushroom gouache, and wet crimson paint drips.',
        tensionResolved:
          'The Baroque Dramatist stages the theatrical Wonderland garden reveal; the Futurist warps perspective and time (the White Rabbit’s melting pocket-watch); the Rebel leaves the Queen’s roses half-painted and dripping.',
        borderArchitectureName: 'Tumbling Card-Suit (♠ ♥ ♣ ♦), "DRINK ME" Vial & Cheshire Grin Margin',
        dropCapArchitectureName: 'White Rabbit’s Melting Pocket-Watch & Queen of Hearts Crown Cartouche',
      });

      const gold = recipeOverride?.goldFiligreeColor || '#C59227';
      const goldBright = '#F7D56E';
      const crimson = recipeOverride?.primaryFlowerColor || '#D92B4B';
      const teal = recipeOverride?.secondaryBotanicalColor || '#14B8A6';
      const violet = '#8B5CF6';
      const emerald = recipeOverride?.foliageColor || '#1E6B52';
      const emeraldLight = '#34D399';
      const ink = recipeOverride?.inkColor || '#1B2A32';

      // 1. Top Corner: Ornate Brass Keyhole Escutcheon + Cheshire Cat Grin in Twilight Boughs + Half-Painted Roses
      topScene.layer(0, () => {
        // Warped perspective chessboard-and-scroll corner rail
        const outerFrame = smoothThrough([{ x: 8, y: 154 }, { x: 12, y: 22 }, { x: 22, y: 12 }, { x: 154, y: 8 }], false, 0.42);
        topScene.ink(outerFrame, gold, 3.2, PROFILES.brush);
        wash(topScene, circlePath(44, 44, 36), teal, { opacity: 0.28, edge: 8, seed: 401 });

        // Ornate Victorian Golden Keyhole Escutcheon at (38, 38)
        const escutcheon = blob(38, 38, 25, 29, { seed: 402, wobble: 0.15, points: 8, rot: -45 });
        painted(topScene, escutcheon, goldBright, { medium: 'gouache', ink: gold, inkWidth: 1.6, highlight: 0.65, seed: 403 });
        const keyholeVoid = boolean('union', [circlePath(36, 33, 6.5), polygonPath(36, 44, 8.5, 3, -90)]);
        topScene.fill(keyholeVoid, ink);

        // Cheshire Cat's luminous crescent grin & golden eyes materializing in the top-right foliage!
        const grinArc = smoothThrough([{ x: 86, y: 24 }, { x: 108, y: 34 }, { x: 130, y: 22 }], false, 0.45);
        painted(topScene, blob(108, 28, 20, 7, { seed: 404, wobble: 0.05 }), '#FDE047', { medium: 'gouache', ink, inkWidth: 1.0, seed: 405 });
        topScene.ink(grinArc, ink, 1.3, PROFILES.taper);
        [96, 102, 108, 114, 120].forEach((tx) => topScene.ink(linePath(tx, 24, tx, 31), ink, 0.85, PROFILES.uniform));
        painted(topScene, ellipseAt(96, 15, 4.5, 3.2, -12), '#FDE047', { medium: 'gouache', ink, inkWidth: 0.9, seed: 406 });
        painted(topScene, ellipseAt(120, 15, 4.5, 3.2, 12), '#FDE047', { medium: 'gouache', ink, inkWidth: 0.9, seed: 407 });
        topScene.ink(linePath(96, 12, 96, 18), ink, 1.2, PROFILES.uniform);
        topScene.ink(linePath(120, 12, 120, 18), ink, 1.2, PROFILES.uniform);

        // Queen's Half-Painted White & Red Roses with wet dripping crimson paint!
        drawTelaBotanicalLeaf(topScene, 28, 58, 14, 112, emerald, ink, goldBright, 0.42, -0.14, 408);
        drawTelaBriarRose(topScene, 68, 66, 16, crimson, '#FFFDF9', crimson, ink, goldBright, 409);
        drawTelaBriarRose(topScene, 28, 82, 14, '#FFFDF9', crimson, crimson, ink, goldBright, 410);
        painted(topScene, petal(72, 88, 10, 4.2, 90), crimson, { medium: 'watercolor', ink, inkWidth: 0.6, seed: 411 });
        painted(topScene, petal(32, 104, 9, 3.8, 90), crimson, { medium: 'watercolor', ink, inkWidth: 0.6, seed: 412 });
      });

      // 2. Bottom Corner: Bioluminescent Caterpillar Mushroom, Mad Hatter Teacup & Tumbling Playing Cards
      botScene.layer(0, () => {
        const outerRail = smoothThrough([{ x: 8, y: 16 }, { x: 8, y: 150 }, { x: 20, y: 162 }, { x: 160, y: 162 }], false, 0.32);
        botScene.ink(outerRail, gold, 3.0, PROFILES.ink);
        wash(botScene, circlePath(58, 118, 50), '#5EEAD4', { opacity: 0.28, edge: 9, seed: 421 });

        // Giant Bioluminescent Wonderland Mushrooms
        const mStalk1 = smoothThrough([{ x: 42, y: 156 }, { x: 46, y: 118 }, { x: 50, y: 88 }], false, 0.5);
        botScene.ink(mStalk1, '#F6E8C8', 12, PROFILES.taper);
        const mCap1 = blob(50, 84, 32, 15, { seed: 425, wobble: 0.12, rot: -8 });
        painted(botScene, mCap1, teal, { medium: 'gouache', ink, inkWidth: 1.2, highlight: 0.7, seed: 426 });
        [35, 50, 64].forEach((sx, i) => botScene.fill(circlePath(sx, 82 - (i % 2) * 4, 3.6), '#A7F3D0'));

        const mStalk2 = smoothThrough([{ x: 82, y: 156 }, { x: 88, y: 130 }, { x: 94, y: 108 }], false, 0.5);
        botScene.ink(mStalk2, '#F6E8C8', 8.5, PROFILES.taper);
        const mCap2 = blob(94, 104, 22, 11, { seed: 427, wobble: 0.14, rot: 14 });
        painted(botScene, mCap2, violet, { medium: 'gouache', ink, inkWidth: 1.0, highlight: 0.65, seed: 428 });
        [84, 94, 103].forEach((sx, i) => botScene.fill(circlePath(sx, 103 - (i % 2) * 3, 2.5), '#FDE68A'));

        // Tumbling Ace of Hearts & Ace of Spades Playing Cards
        painted(botScene, rectPath(16, 36, 26, 36, 2), '#FFFDF9', { medium: 'gouache', ink: gold, inkWidth: 1.1, seed: 432 });
        painted(botScene, polygonPath(29, 54, 7, 4, 0), crimson, { medium: 'gouache', seed: 433 });
        painted(botScene, rectPath(116, 120, 28, 36, 2), '#FFFDF9', { medium: 'gouache', ink: gold, inkWidth: 1.1, seed: 434 });
        botScene.fill(circlePath(130, 138, 5.5), ink);

        // Half-painted Rose at corner base
        drawTelaBriarRose(botScene, 30, 140, 18, crimson, '#FFFFFF', crimson, ink, goldBright, 430);
      });

      // 3. Chapter Crest: White Rabbit's Pocket Watch Flanked by Flying Playing Cards & Half-Painted Roses
      crestScene.layer(0, () => {
        wash(crestScene, ellipseAt(140, 44, 96, 34), '#5EEAD4', { opacity: 0.25, edge: 8, seed: 440 });
        // Flying playing cards flanking the watch
        painted(crestScene, rectPath(78, 24, 22, 32, 2), '#FFFDF9', { medium: 'gouache', ink: gold, inkWidth: 1.0, seed: 441 });
        painted(crestScene, polygonPath(89, 40, 5.5, 4, 0), crimson, { medium: 'gouache', seed: 442 });
        painted(crestScene, rectPath(180, 24, 22, 32, 2), '#FFFDF9', { medium: 'gouache', ink: gold, inkWidth: 1.0, seed: 443 });
        crestScene.fill(polygonPath(191, 40, 5.5, 3, -90), ink);

        drawTelaBriarRose(crestScene, 48, 48, 15, crimson, '#FFFFFF', crimson, ink, goldBright, 444);
        drawTelaBriarRose(crestScene, 232, 48, 15, '#FFFFFF', crimson, crimson, ink, goldBright, 445);

        painted(crestScene, circlePath(140, 14, 6), goldBright, { medium: 'gouache', ink: gold, inkWidth: 1.2, seed: 446 });
        painted(crestScene, circlePath(140, 48, 25), goldBright, { medium: 'gouache', ink: gold, inkWidth: 1.8, highlight: 0.65, seed: 447 });
        painted(crestScene, circlePath(140, 48, 19), '#FFFDF7', { medium: 'gouache', ink, inkWidth: 1.0, seed: 448 });
        crestScene.ink(linePath(140, 48, 140, 33), ink, 1.9, PROFILES.taper);
        crestScene.ink(linePath(140, 48, 153, 52), crimson, 1.6, PROFILES.taper);
      });

      // 4. Under-Title: Ornate Golden Skeleton Key to the Wonderland Garden Door
      underScene.layer(0, () => {
        underScene.ink(smoothThrough([{ x: 18, y: 24 }, { x: 82, y: 14 }, { x: 136, y: 24 }], false, 0.5), emerald, 1.8, PROFILES.taper);
        underScene.ink(smoothThrough([{ x: 302, y: 24 }, { x: 238, y: 14 }, { x: 184, y: 24 }], false, 0.5), emerald, 1.8, PROFILES.taper);
        painted(underScene, polygonPath(92, 24, 8, 4, 0), crimson, { medium: 'gouache', ink: gold, inkWidth: 0.9, seed: 450 });
        painted(underScene, polygonPath(228, 24, 8, 4, 0), crimson, { medium: 'gouache', ink: gold, inkWidth: 0.9, seed: 451 });
        painted(underScene, circlePath(146, 24, 9.5), goldBright, { medium: 'gouache', ink: gold, inkWidth: 1.4, seed: 452 });
        underScene.fill(circlePath(146, 24, 4.0), '#FFFDF7');
        underScene.ink(linePath(155, 24, 182, 24), gold, 3.0, PROFILES.uniform);
        underScene.ink(linePath(173, 24, 173, 33), gold, 2.4, PROFILES.uniform);
        underScene.ink(linePath(179, 24, 179, 31), gold, 2.4, PROFILES.uniform);
      });

      // 5. Bespoke Drop-Cap: White Rabbit's Melting Pocket-Watch & Queen of Hearts Crown Cartouche
      dropScene.layer(0, () => {
        wash(dropScene, circlePath(44, 46, 38), teal, { opacity: 0.24, edge: 6, seed: 460 });
        // Queen of Hearts golden crown atop the pocket-watch bezel
        const crown = polygonPath(44, 14, 14, 5, -90);
        painted(dropScene, crown, goldBright, { medium: 'gouache', ink: crimson, inkWidth: 1.2, seed: 461 });
        // Slightly surreal warped pocket-watch face
        const watchRim = blob(44, 48, 35, 34, { seed: 462, wobble: 0.08, points: 12 });
        painted(dropScene, watchRim, goldBright, { medium: 'gouache', ink: gold, inkWidth: 2.0, highlight: 0.65, seed: 463 });
        painted(dropScene, circlePath(44, 48, 28), '#FFFDF9', { medium: 'watercolor', ink, inkWidth: 1.1, seed: 464 });
        // 4 Card suit pips at 12, 3, 6, 9 o'clock
        painted(dropScene, polygonPath(44, 24, 4.5, 4, 0), crimson, { medium: 'gouache', seed: 465 });
        painted(dropScene, polygonPath(44, 72, 4.5, 4, 0), crimson, { medium: 'gouache', seed: 466 });
        dropScene.fill(circlePath(20, 48, 3.5), ink);
        dropScene.fill(circlePath(68, 48, 3.5), ink);
      });

      // 6. Bespoke Margin Border: Tumbling Playing Cards (♠ ♥ ♣ ♦), "DRINK ME" Vial & Cheshire Stripes
      marginScene.layer(0, () => {
        const spiralThread = smoothThrough([{ x: 22, y: 12 }, { x: 10, y: 74 }, { x: 34, y: 138 }, { x: 10, y: 202 }, { x: 34, y: 266 }, { x: 22, y: 310 }], false, 0.55);
        marginScene.ink(spiralThread, gold, 1.6, PROFILES.taper, { dash: [4, 2] });
        // Tumbling cards at y=48, 128, 212, 284
        [48, 128, 212, 284].forEach((cy, idx) => {
          painted(marginScene, rectPath(11, cy - 14, 22, 28, 2), '#FFFDF9', { medium: 'gouache', ink: gold, inkWidth: 1.1, seed: 470 + idx });
          if (idx % 2 === 0) {
            painted(marginScene, polygonPath(22, cy, 5.5, 4, 0), crimson, { medium: 'gouache', seed: 475 + idx });
          } else {
            marginScene.fill(polygonPath(22, cy, 5.5, 3, -90), ink);
          }
        });
        // "DRINK ME" Glass Potion Bottle at y=170
        painted(marginScene, rectPath(14, 158, 16, 22, 3), '#A5F3FC', { medium: 'watercolor', ink, inkWidth: 1.0, seed: 482 });
        painted(marginScene, rectPath(16, 168, 12, 10, 1), teal, { medium: 'gouache', seed: 483 });
        painted(marginScene, rectPath(18, 151, 8, 7, 1), '#D97706', { medium: 'gouache', ink, inkWidth: 0.8, seed: 484 });
      });

      // 7. Scene-Break Divider: Card Suits (♠ ♥ ♦ ♣) & Mad Hatter Top Hat
      breakScene.layer(0, () => {
        breakScene.ink(linePath(24, 16, 98, 16), gold, 1.5, PROFILES.taper);
        breakScene.ink(linePath(142, 16, 216, 16), gold, 1.5, PROFILES.taper);
        painted(breakScene, polygonPath(76, 16, 5.5, 4, 0), crimson, { medium: 'gouache', seed: 490 });
        painted(breakScene, polygonPath(164, 16, 5.5, 4, 0), crimson, { medium: 'gouache', seed: 491 });
        painted(breakScene, rectPath(112, 6, 16, 16, 1), teal, { medium: 'gouache', ink, inkWidth: 1.0, seed: 492 });
        breakScene.ink(linePath(106, 22, 134, 22), ink, 2.2, PROFILES.uniform);
      });

      // 8. Watermark: Giant Keyhole Escutcheon & Pocket-Watch Roman Dial
      watermarkScene.layer(0, () => {
        watermarkScene.stroke(circlePath(130, 130, 102), gold, 1.5, { dash: [8, 4] }, { opacity: 0.35 });
        watermarkScene.stroke(circlePath(130, 130, 86), teal, 1.1, {}, { opacity: 0.3 });
        watermarkScene.stroke(circlePath(130, 114, 24), gold, 1.8, {}, { opacity: 0.38 });
        watermarkScene.stroke(polygonPath(130, 152, 32, 3, -90), gold, 1.8, {}, { opacity: 0.38 });
      });
      break;
    }

    // =========================================================================
    // 3. FRANKENSTEIN — FUTURIST × REBEL (Edited by BAROQUE)
    //    Ingolstadt Galvanic Copper Coils, Voltaic Pile, Surgical Sutures & Mer de Glace
    //    (ZERO flowers! Pure Romantic Science, High-Voltage Arcs & Alpine Ice)
    // =========================================================================
    case 'frankenstein': {
      title = 'Frankenstein · Galvanic Copper Coils, Voltaic Pile, Surgical Sutures & Mer de Glace Glacier';
      mediumDescription = 'Tela Chiaroscuro Woodcut (`linocut`), Copper-Leaf Schematic Ink & Electric Plasma Wash';
      artCouncilDeliberation = makeCouncilDeliberation('FUTURIST', 'REBEL', 'BAROQUE', {
        structuralDirective:
          'Banish all Victorian florals. Frame the page as Victor Frankenstein’s Ingolstadt laboratory notebook collided with the jagged ice of the Mer de Glace—copper induction coils, Voltaic battery plates, surgical suture stitches, and forked electric arcs.',
        materialCraft:
          'High-contrast Lynd Ward woodcut cross-hatching (`linocut`), oxidized copper and brass schematic lines, surgical black ink cross-stitches, and glowing cyan-amber plasma discharges.',
        tensionResolved:
          'The Futurist constructs the precise galvanic circuit and Voltaic apparatus; the Rebel scars the page margin with raw surgical suture stitches and fractured glacier shards; the Baroque Dramatist lights the scene with a single November lightning bolt.',
        borderArchitectureName: 'Surgical Cross-Stitch Suture & Galvanic Copper Conductor Rail',
        dropCapArchitectureName: 'Riveted Brass Laboratory Viewport & High-Voltage Induction Coil',
      });

      const iceBlue = recipeOverride?.primaryFlowerColor || '#38BDF8';
      const icePale = '#E0F2FE';
      const glacialDeep = recipeOverride?.secondaryBotanicalColor || '#0284C7';
      const indigo = recipeOverride?.inkColor || '#0F172A';
      const slate = recipeOverride?.foliageColor || '#1E3A5F';
      const copper = recipeOverride?.goldFiligreeColor || '#D97706';
      const amber = '#FBBF24';

      // 1. Top Corner: Galvanic Copper Bus-Bars, Ceramic Insulators, Glacier Shards & Forked Lightning
      topScene.layer(0, () => {
        // Double copper conductor rails with riveted corner bracket
        topScene.ink(linePath(10, 152, 10, 14), copper, 3.2, PROFILES.uniform);
        topScene.ink(linePath(10, 14, 152, 14), copper, 3.2, PROFILES.uniform);
        topScene.stroke(linePath(18, 144, 18, 22), iceBlue, 1.2, { dash: [6, 3] });
        topScene.stroke(linePath(18, 22, 144, 22), iceBlue, 1.2, { dash: [6, 3] });

        wash(topScene, circlePath(48, 48, 40), iceBlue, { opacity: 0.28, edge: 8, seed: 501 });

        // Jagged Mer de Glace Crystalline Ice Shards (NO leaves or roses!)
        const shard1 = polygonPath(38, 42, 32, 3, -45);
        const shard2 = polygonPath(72, 26, 22, 3, -15);
        const shard3 = polygonPath(26, 72, 22, 3, -75);
        painted(topScene, shard1, glacialDeep, { medium: 'linocut', ink: indigo, inkWidth: 1.2, seed: 502 });
        painted(topScene, shard2, iceBlue, { medium: 'gouache', ink: indigo, inkWidth: 1.0, highlight: 0.8, seed: 503 });
        painted(topScene, shard3, icePale, { medium: 'gouache', ink: glacialDeep, inkWidth: 1.0, highlight: 0.8, seed: 504 });
        topScene.stroke(hatch(shard1, { angle: 65, spacing: 4.5, seed: 505 }), indigo, 0.7, {}, { opacity: 0.5 });

        // Galvanic Copper Induction Coils & Ceramic Insulators
        drawGalvanicCoilNode(topScene, 36, 36, 18, copper, amber, iceBlue, indigo, 506);
        drawGalvanicCoilNode(topScene, 94, 22, 11, copper, amber, iceBlue, indigo, 507);
        drawGalvanicCoilNode(topScene, 22, 94, 11, copper, amber, iceBlue, indigo, 508);

        // Forked High-Voltage Galvanic Lightning Arc
        const bolt = smoothThrough(
          [{ x: 36, y: 36 }, { x: 62, y: 50 }, { x: 52, y: 66 }, { x: 96, y: 94 }, { x: 84, y: 106 }, { x: 132, y: 140 }],
          false,
          0.06
        );
        topScene.ink(bolt, iceBlue, 4.8, PROFILES.tail, { opacity: 0.5, blur: 2 });
        topScene.ink(bolt, '#FFFFFF', 2.2, PROFILES.tail);
        topScene.fill(sparkle(62, 50, 8.5), amber);
        topScene.fill(sparkle(96, 94, 8.0), amber);
      });

      // 2. Bottom Corner: Mer de Glace Ice Precipice + Stacked Voltaic Pile Battery & Leyden Jar
      botScene.layer(0, () => {
        botScene.ink(linePath(10, 18, 10, 160), copper, 3.0, PROFILES.uniform);
        botScene.ink(linePath(10, 160, 160, 160), copper, 3.0, PROFILES.uniform);
        wash(botScene, circlePath(62, 122, 48), iceBlue, { opacity: 0.25, edge: 9, seed: 511 });

        // Towering Mer de Glace Alpine Glacier Crags with woodcut cross-hatching
        const peakA = hill(10, 142, 158, 46, { bumps: 3.5, roughness: 0.26, bottom: 160, seed: 512 });
        const peakB = hill(26, 160, 158, 82, { bumps: 2.8, roughness: 0.22, bottom: 160, seed: 513 });
        painted(botScene, peakA, glacialDeep, { medium: 'linocut', ink: indigo, inkWidth: 1.2, seed: 514 });
        painted(botScene, peakB, slate, { medium: 'linocut', ink: indigo, inkWidth: 1.1, seed: 515 });
        botScene.stroke(crossHatch(peakA, { spacing: 6.5, seed: 516 }), indigo, 0.65, {}, { opacity: 0.45 });

        // Voltaic Pile Column (alternating zinc & copper discs) at corner left (x=22..46, y=82..154)
        for (let d = 0; d < 7; d++) {
          const dy = 148 - d * 9;
          painted(botScene, rectPath(20, dy, 28, 6.5, 1.5), d % 2 === 0 ? copper : '#94A3B8', {
            medium: 'gouache',
            ink: indigo,
            inkWidth: 0.9,
            seed: 520 + d,
          });
        }
        drawGalvanicCoilNode(botScene, 34, 78, 13, copper, amber, iceBlue, indigo, 528);
        drawGalvanicCoilNode(botScene, 96, 138, 16, copper, amber, iceBlue, indigo, 529);
        const arc = smoothThrough([{ x: 34, y: 78 }, { x: 64, y: 98 }, { x: 58, y: 112 }, { x: 96, y: 138 }], false, 0.08);
        botScene.ink(arc, '#FFFFFF', 2.0, PROFILES.taper);
        botScene.fill(sparkle(64, 98, 9), amber);
      });

      // 3. Chapter Crest: Solitary Creature on the Mer de Glace Split by Dual Tesla/Galvanic Coils & Lightning
      crestScene.layer(0, () => {
        wash(crestScene, ellipseAt(140, 44, 96, 34), glacialDeep, { opacity: 0.28, edge: 9, seed: 530 });
        const crag = hill(52, 228, 82, 22, { bumps: 3.8, roughness: 0.25, bottom: 84, seed: 531 });
        painted(crestScene, crag, slate, { medium: 'linocut', ink: indigo, inkWidth: 1.3, seed: 532 });
        // Solitary silhouette on the glacier summit
        crestScene.fill(ellipseAt(140, 24, 4, 8, 0), indigo);
        const boltL = smoothThrough([{ x: 52, y: 48 }, { x: 96, y: 26 }, { x: 88, y: 38 }, { x: 140, y: 18 }], false, 0.08);
        const boltR = smoothThrough([{ x: 228, y: 48 }, { x: 184, y: 26 }, { x: 192, y: 38 }, { x: 140, y: 18 }], false, 0.08);
        crestScene.ink(boltL, icePale, 2.3, PROFILES.tail);
        crestScene.ink(boltR, amber, 2.1, PROFILES.tail);
        drawGalvanicCoilNode(crestScene, 52, 48, 15, copper, amber, iceBlue, indigo, 533);
        drawGalvanicCoilNode(crestScene, 228, 48, 15, copper, amber, iceBlue, indigo, 534);
        crestScene.fill(sparkle(140, 18, 11), amber);
      });

      // 4. Under-Title: Twin Brass Electrodes Discharging a High-Voltage Galvanic Arc
      underScene.layer(0, () => {
        underScene.ink(linePath(20, 24, 98, 24), copper, 2.6, PROFILES.uniform);
        underScene.ink(linePath(222, 24, 300, 24), copper, 2.6, PROFILES.uniform);
        drawGalvanicCoilNode(underScene, 98, 24, 10, copper, amber, iceBlue, indigo, 535);
        drawGalvanicCoilNode(underScene, 222, 24, 10, copper, amber, iceBlue, indigo, 536);
        const sparkArc = smoothThrough(
          [{ x: 108, y: 24 }, { x: 132, y: 12 }, { x: 148, y: 34 }, { x: 160, y: 14 }, { x: 174, y: 32 }, { x: 192, y: 14 }, { x: 212, y: 24 }],
          false,
          0.08
        );
        underScene.ink(sparkArc, iceBlue, 3.6, PROFILES.uniform, { opacity: 0.55 });
        underScene.ink(sparkArc, '#FFFFFF', 1.8, PROFILES.uniform);
        underScene.fill(sparkle(160, 24, 12), amber);
      });

      // 5. Bespoke Drop-Cap: Riveted Brass Laboratory Viewport with Copper Induction Coils & Surgical Stitches
      dropScene.layer(0, () => {
        wash(dropScene, circlePath(44, 44, 40), iceBlue, { opacity: 0.25, edge: 6, seed: 540 });
        const hexBezel = polygonPath(44, 44, 40, 8, 22.5, 2);
        painted(dropScene, hexBezel, copper, { medium: 'gouache', ink: indigo, inkWidth: 2.0, highlight: 0.65, seed: 541 });
        painted(dropScene, circlePath(44, 44, 30), '#F0F9FF', { medium: 'watercolor', ink: indigo, inkWidth: 1.4, seed: 542 });
        // 8 Brass rivets around the bezel + top/bottom electrode terminals
        for (let r = 0; r < 8; r++) {
          const a = ((r * 45) * Math.PI) / 180;
          painted(dropScene, circlePath(44 + Math.cos(a) * 34, 44 + Math.sin(a) * 34, 2.6), amber, { medium: 'gouache', ink: indigo, inkWidth: 0.7, seed: 543 + r });
        }
        drawGalvanicCoilNode(dropScene, 14, 14, 8, copper, amber, iceBlue, indigo, 552);
        drawGalvanicCoilNode(dropScene, 74, 74, 8, copper, amber, iceBlue, indigo, 553);
      });

      // 6. Bespoke Margin Border: Raw Surgical Cross-Stitch Suture Seam & Galvanic Insulator Nodes
      marginScene.layer(0, () => {
        // Vertical surgical incision line + cross-stitches (`X` sutures) + copper wire
        marginScene.ink(linePath(22, 10, 22, 310), indigo, 1.8, PROFILES.uniform);
        for (let sy = 24; sy <= 296; sy += 22) {
          marginScene.ink(linePath(12, sy - 6, 32, sy + 6), indigo, 1.5, PROFILES.taper);
          marginScene.ink(linePath(32, sy - 6, 12, sy + 6), indigo, 1.5, PROFILES.taper);
          marginScene.fill(circlePath(12, sy - 6, 1.6), copper);
          marginScene.fill(circlePath(32, sy + 6, 1.6), copper);
        }
        [68, 160, 252].forEach((ny, idx) => {
          drawGalvanicCoilNode(marginScene, 22, ny, idx === 1 ? 11 : 8.5, copper, amber, iceBlue, indigo, 560 + idx);
        });
      });

      // 7. Scene-Break Divider: Surgical Suture Line & Spark Gap
      breakScene.layer(0, () => {
        breakScene.ink(linePath(24, 16, 104, 16), indigo, 1.5, PROFILES.uniform);
        breakScene.ink(linePath(136, 16, 216, 16), indigo, 1.5, PROFILES.uniform);
        [44, 68, 92, 148, 172, 196].forEach((sx) => {
          breakScene.ink(linePath(sx - 4, 10, sx + 4, 22), indigo, 1.3, PROFILES.uniform);
          breakScene.ink(linePath(sx + 4, 10, sx - 4, 22), indigo, 1.3, PROFILES.uniform);
        });
        drawGalvanicCoilNode(breakScene, 120, 16, 9, copper, amber, iceBlue, indigo, 570);
      });

      // 8. Watermark: Vesalius/Galvanic Anatomical Compass & Induction Rings
      watermarkScene.layer(0, () => {
        watermarkScene.stroke(circlePath(130, 130, 104), copper, 1.5, { dash: [8, 4] }, { opacity: 0.35 });
        watermarkScene.stroke(polygonPath(130, 130, 88, 6, 0), iceBlue, 1.2, {}, { opacity: 0.32 });
        watermarkScene.stroke(circlePath(130, 130, 54), copper, 1.2, { dash: [3, 3] }, { opacity: 0.32 });
        watermarkScene.stroke(linePath(130, 20, 130, 240), copper, 1.1, {}, { opacity: 0.28 });
        watermarkScene.stroke(linePath(20, 130, 240, 130), copper, 1.1, {}, { opacity: 0.28 });
      });
      break;
    }

    // =========================================================================
    // 4. DRACULA — BAROQUE × REBEL (Edited by CLASSICAL)
    //    Pointed Gothic Cathedral Lancet Arches, Wrought-Iron Spikes, Gargoyles, Bats & Blood Chalice
    //    (ZERO cheerful garden roses! Pure Carpathian Gothic Iron, Blood & Silver)
    // =========================================================================
    case 'dracula': {
      title = 'Dracula · Carpathian Blood Moon, Gothic Lancet Ironwork, Roosting Bats & Order of the Dragon';
      mediumDescription = 'Tela Victorian Gothic Woodcut (`linocut`), Carmine Blood Wash & Tarnished Silver Engraving';
      artCouncilDeliberation = makeCouncilDeliberation('BAROQUE', 'REBEL', 'CLASSICAL', {
        structuralDirective:
          'Transform the page into an ancient Carpathian reliquary and Whitby Abbey ruin: pointed Gothic lancet arches, wrought-iron cemetery spikes, spiralling vampire bats, and the Order of the Dragon crest.',
        materialCraft:
          'Velvet obsidian linocut shadows, wet carmine blood-wash bleeds, razor-sharp silver engraving lines, and iron spear-tip finials.',
        tensionResolved:
          'The Baroque Dramatist demands operatic crimson chiaroscuro and cathedral height; the Rebel slashes the borders with barbed wrought-iron spikes and blood drops; the Classical Mind locks the terror inside strict medieval Gothic tracery.',
        borderArchitectureName: 'Whitby Wrought-Iron Spear-Pale & Roosting Bat Lancet Rail',
        dropCapArchitectureName: 'Order of the Dragon Gothic Coffin-Shield & Silver Stake Cartouche',
      });

      const crimson = recipeOverride?.primaryFlowerColor || '#BE123C';
      const bloodBright = recipeOverride?.secondaryBotanicalColor || '#F43F5E';
      const darkWine = '#4C0519';
      const silver = recipeOverride?.goldFiligreeColor || '#94A3B8';
      const silverBright = '#E2E8F0';
      const obsidian = recipeOverride?.inkColor || '#0F172A';

      // 1. Top Corner: Wrought-Iron Gothic Lancet Arch, Spear Spikes, Blood Chalice Medallion & Bat Flock
      topScene.layer(0, () => {
        // Wrought-iron spiked fence rails along top and left
        topScene.ink(linePath(12, 154, 12, 12), obsidian, 3.4, PROFILES.uniform);
        topScene.ink(linePath(12, 12, 154, 12), obsidian, 3.4, PROFILES.uniform);
        topScene.ink(linePath(20, 146, 20, 20), silver, 1.3, PROFILES.uniform);
        topScene.ink(linePath(20, 20, 146, 20), silver, 1.3, PROFILES.uniform);
        [44, 72, 100, 128].forEach((pos) => {
          // Iron spear tips along top and left rails
          topScene.fill(polygonPath(pos, 8, 6, 3, -90), obsidian);
          topScene.fill(polygonPath(8, pos, 6, 3, 180), obsidian);
        });

        wash(topScene, circlePath(46, 46, 38), crimson, { opacity: 0.34, edge: 8, seed: 601 });
        // Gothic Rosette Tracery Window + Blood Ruby Core at (40, 40)
        const gothicStar = starPath(40, 40, 28, 12, 8, 0);
        painted(topScene, gothicStar, obsidian, { medium: 'linocut', ink: silverBright, inkWidth: 1.2, seed: 602 });
        painted(topScene, polygonPath(40, 40, 14, 8, 22.5), crimson, { medium: 'gouache', ink: silverBright, inkWidth: 1.1, highlight: 0.75, seed: 603 });
        // Dripping blood drops from the Gothic medallion
        painted(topScene, petal(40, 74, 10, 4.5, 90), crimson, { medium: 'watercolor', ink: darkWine, inkWidth: 0.7, seed: 604 });
        painted(topScene, petal(74, 40, 9, 4.0, 90), crimson, { medium: 'watercolor', ink: darkWine, inkWidth: 0.7, seed: 605 });

        // Spiralling flock of Carpathian Vampire Bats
        drawGothicBat(topScene, 88, 46, 34, obsidian, silver);
        drawGothicBat(topScene, 54, 88, 26, obsidian, crimson);
        drawGothicBat(topScene, 122, 32, 22, obsidian, silver);
      });

      // 2. Bottom Corner: Ruined Whitby Abbey Gothic Lancet Arch, Stone Gargoyle, Iron Crosses & Blood Moon
      botScene.layer(0, () => {
        botScene.ink(linePath(12, 16, 12, 160), obsidian, 3.4, PROFILES.uniform);
        botScene.ink(linePath(12, 160, 160, 160), obsidian, 3.4, PROFILES.uniform);
        wash(botScene, circlePath(58, 118, 48), crimson, { opacity: 0.32, edge: 9, seed: 611 });

        // Pointed Gothic Abbey Lancet Window Ruin at (x=18..78, y=54..158)
        const lancetOuter = smoothThrough([{ x: 20, y: 158 }, { x: 20, y: 86 }, { x: 48, y: 44 }, { x: 76, y: 86 }, { x: 76, y: 158 }], true, 0.15);
        painted(botScene, lancetOuter, obsidian, { medium: 'linocut', ink: silver, inkWidth: 1.4, seed: 612 });
        const lancetInner = smoothThrough([{ x: 28, y: 154 }, { x: 28, y: 92 }, { x: 48, y: 58 }, { x: 68, y: 92 }, { x: 68, y: 154 }], true, 0.15);
        painted(botScene, lancetInner, crimson, { medium: 'watercolor', ink: silverBright, inkWidth: 1.0, seed: 613 });
        // Gothic tracery mullion inside the arch
        botScene.ink(linePath(48, 58, 48, 154), obsidian, 2.2, PROFILES.uniform);
        botScene.stroke(circlePath(48, 84, 9), silverBright, 1.2);

        // Cemetery Wrought-Iron Crosses on Carpathian Crag (x=82..154)
        const crag = hill(70, 158, 158, 112, { bumps: 3.2, roughness: 0.3, bottom: 160, seed: 614 });
        painted(botScene, crag, darkWine, { medium: 'linocut', ink: obsidian, inkWidth: 1.2, seed: 615 });
        [98, 126].forEach((cx, i) => {
          const cy = 104 + i * 10;
          botScene.ink(linePath(cx, cy, cx, cy + 32), obsidian, 2.6, PROFILES.uniform);
          botScene.ink(linePath(cx - 9, cy + 9, cx + 9, cy + 9), obsidian, 2.4, PROFILES.uniform);
        });
        drawGothicBat(botScene, 108, 72, 30, obsidian, bloodBright);
      });

      // 3. Chapter Crest: Castle Dracula on Carpathian Crag Against Colossal Blood Moon & Bats
      crestScene.layer(0, () => {
        wash(crestScene, circlePath(140, 44, 46), crimson, { opacity: 0.42, edge: 9, seed: 620 });
        painted(crestScene, circlePath(140, 42, 32), crimson, { medium: 'watercolor', ink: bloodBright, inkWidth: 1.4, bleed: true, seed: 621 });
        const castle = hill(64, 216, 84, 14, { bumps: 6.5, roughness: 0.38, bottom: 86, seed: 622 });
        painted(crestScene, castle, obsidian, { medium: 'linocut', ink: silver, inkWidth: 1.1, seed: 623 });
        // Castle spires & glowing red windows
        crestScene.fill(polygonPath(140, 14, 8, 3, -90), obsidian);
        crestScene.fill(circlePath(140, 28, 2.2), bloodBright);
        drawGothicBat(crestScene, 68, 36, 28, obsidian, silverBright);
        drawGothicBat(crestScene, 212, 36, 28, obsidian, silverBright);
        drawGothicBat(crestScene, 104, 22, 20, obsidian, bloodBright);
        drawGothicBat(crestScene, 176, 22, 20, obsidian, bloodBright);
      });

      // 4. Under-Title: Order of the Dragon Bat-Winged Blood Ruby & Silver Dagger
      underScene.layer(0, () => {
        underScene.ink(linePath(18, 24, 124, 24), silver, 2.0, PROFILES.taper);
        underScene.ink(linePath(196, 24, 302, 24), silver, 2.0, PROFILES.taper);
        drawGothicBat(underScene, 160, 24, 46, obsidian, crimson);
        painted(underScene, polygonPath(160, 24, 11, 4, 0), crimson, { medium: 'gouache', ink: silverBright, inkWidth: 1.2, highlight: 0.8, seed: 632 });
        painted(underScene, petal(92, 24, 9, 4, 0), crimson, { medium: 'gouache', ink: silver, inkWidth: 0.8, seed: 633 });
        painted(underScene, petal(228, 24, 9, 4, 180), crimson, { medium: 'gouache', ink: silver, inkWidth: 0.8, seed: 634 });
      });

      // 5. Bespoke Drop-Cap: Gothic Coffin-Shield Escutcheon with Silver Stake & Bat Wings
      dropScene.layer(0, () => {
        wash(dropScene, circlePath(44, 44, 40), crimson, { opacity: 0.3, edge: 6, seed: 640 });
        const coffinShield = polygonPath(44, 44, 40, 6, -90, 1);
        painted(dropScene, coffinShield, obsidian, { medium: 'linocut', ink: silverBright, inkWidth: 2.0, seed: 641 });
        const innerShield = polygonPath(44, 44, 31, 6, -90, 1);
        painted(dropScene, innerShield, '#FFF5F7', { medium: 'watercolor', ink: crimson, inkWidth: 1.4, seed: 642 });
        drawGothicBat(dropScene, 44, 14, 28, obsidian, crimson);
        // Dripping blood ruby at bottom point of coffin shield
        painted(dropScene, polygonPath(44, 76, 6, 4, 0), crimson, { medium: 'gouache', ink: silverBright, inkWidth: 0.9, seed: 643 });
      });

      // 6. Bespoke Margin Border: Wrought-Iron Spear-Pales, Roosting Vampire Bats & Blood Drops
      marginScene.layer(0, () => {
        marginScene.ink(linePath(22, 8, 22, 312), obsidian, 2.4, PROFILES.uniform);
        marginScene.fill(polygonPath(22, 10, 7, 3, -90), obsidian);
        marginScene.fill(polygonPath(22, 310, 7, 3, 90), obsidian);
        [56, 136, 216, 280].forEach((by, idx) => {
          drawGothicBat(marginScene, 22, by, 26, obsidian, idx % 2 === 0 ? crimson : silver);
          painted(marginScene, petal(22, by + 22, 8, 3.8, 90), crimson, { medium: 'watercolor', ink: darkWine, inkWidth: 0.6, seed: 650 + idx });
        });
      });

      // 7. Scene-Break Divider: Bat Emblem & Silver Crucifix / Stake Points
      breakScene.layer(0, () => {
        breakScene.ink(linePath(20, 16, 94, 16), obsidian, 2.0, PROFILES.taper);
        breakScene.ink(linePath(146, 16, 220, 16), obsidian, 2.0, PROFILES.taper);
        drawGothicBat(breakScene, 120, 16, 34, obsidian, crimson);
        painted(breakScene, polygonPath(120, 16, 6, 4, 0), crimson, { medium: 'gouache', ink: silverBright, inkWidth: 0.8, seed: 660 });
      });

      // 8. Watermark: Gothic Rose-Window Cathedral Tracery & Dragon Crest
      watermarkScene.layer(0, () => {
        watermarkScene.stroke(circlePath(130, 130, 104), crimson, 1.5, {}, { opacity: 0.35 });
        watermarkScene.stroke(starPath(130, 130, 96, 42, 12, 0), obsidian, 1.2, {}, { opacity: 0.3 });
        watermarkScene.stroke(polygonPath(130, 130, 56, 8, 22.5), crimson, 1.3, { dash: [4, 3] }, { opacity: 0.32 });
      });
      break;
    }

    // =========================================================================
    // 5. SHERLOCK HOLMES — CLASSICAL × RADICAL_MINIMAL (Edited by BAROQUE)
    //    221B Gas-Lamp, Stradivarius Violin, Calabash Pipe, Magnifying Lens & Fingerprint Whorls
    // =========================================================================
    case 'sherlock-holmes': {
      title = 'The Adventures of Sherlock Holmes · 221B Gas-Lamp, Forensic Lens, Violin & Baker Street Fog';
      mediumDescription = 'Tela Victorian Strand Magazine Engraving, Gaslight Amber Wash & Forensic Ink';
      artCouncilDeliberation = makeCouncilDeliberation('CLASSICAL', 'RADICAL_MINIMAL', 'BAROQUE', {
        structuralDirective:
          'Deductive geometry meets Victorian atmospheric mystery: replace generic florals with 221B Baker Street’s wrought-iron gas-lamp, a brass magnifying glass inspecting a concentric fingerprint whorl, Holmes’s Stradivarius violin f-holes, and a red clue-thread.',
        materialCraft:
          'Sidney Paget 1891 *Strand Magazine* steel-engraved ink lines, London pea-soup fog washes, warm gaslight amber halos, and forensic ruler hash-marks.',
        tensionResolved:
          'The Classical Mind structures the page like a Scotland Yard case dossier; the Radical Minimalist strips away ornament until every mark is a literal clue; the Baroque Dramatist bathes the corner in warm 221B gaslight against swirling teal fog.',
        borderArchitectureName: 'Scotland Yard Forensic Ruler, Violin F-Hole & Red Clue-Thread Margin',
        dropCapArchitectureName: 'Brass Magnifying Bezel Over Concentric Fingerprint Whorl',
      });

      const brass = recipeOverride?.goldFiligreeColor || '#B47B26';
      const amber = recipeOverride?.primaryFlowerColor || '#F59E0B';
      const amberLight = '#FEF3C7';
      const tealFog = recipeOverride?.secondaryBotanicalColor || '#1E3A4C';
      const ink = recipeOverride?.inkColor || '#1C1917';
      const clueRed = '#DC2626';

      // 1. Top Corner: Wrought-Iron 221B Baker Street Gas-Lamp, Swirling Pipe Smoke & Violin Scroll
      topScene.layer(0, () => {
        // Victorian wrought-iron bracket frame with forensic millimeter ticks
        topScene.ink(linePath(10, 152, 10, 12), ink, 2.8, PROFILES.uniform);
        topScene.ink(linePath(10, 12, 152, 12), ink, 2.8, PROFILES.uniform);
        for (let t = 24; t <= 144; t += 12) {
          topScene.ink(linePath(10, t, 17, t), brass, 1.0, PROFILES.uniform);
          topScene.ink(linePath(t, 10, t, 17), brass, 1.0, PROFILES.uniform);
        }

        // Warm 221B Gas-Lamp Halo & Hexagonal Lantern
        wash(topScene, circlePath(46, 48, 38), amber, { opacity: 0.45, edge: 8, seed: 701 });
        const lantern = polygonPath(44, 44, 18, 6, -90, 2);
        painted(topScene, lantern, amberLight, { medium: 'gouache', ink, inkWidth: 1.5, highlight: 0.85, seed: 702 });
        painted(topScene, polygonPath(44, 24, 10, 3, -90), ink, { medium: 'gouache', seed: 703 });
        topScene.fill(sparkle(44, 44, 9), amber);

        // Calabash Pipe at (88, 36) & Swirling Smoke Spiral
        const pipeBowl = smoothThrough([{ x: 76, y: 42 }, { x: 84, y: 54 }, { x: 98, y: 48 }, { x: 96, y: 32 }, { x: 86, y: 34 }], true, 0.35);
        painted(topScene, pipeBowl, '#7C2D12', { medium: 'gouache', ink, inkWidth: 1.1, seed: 704 });
        topScene.ink(spiralPath(112, 28, 16, 0.78, 7, true, 0), tealFog, 1.6, PROFILES.taper, { opacity: 0.55 });
      });

      // 2. Bottom Corner: Brass Magnifying Lens Inspecting a Fingerprint Whorl, Stradivarius Violin & London Fog
      botScene.layer(0, () => {
        botScene.ink(linePath(10, 18, 10, 160), ink, 2.8, PROFILES.uniform);
        botScene.ink(linePath(10, 160, 160, 160), ink, 2.8, PROFILES.uniform);
        // Swirling Baker Street Fog Waves
        for (let i = 0; i < 4; i++) {
          botScene.ink(wave(14, 156, 120 + i * 10, 4.5, 40, i, 0.1, 711 + i), tealFog, 2.2, PROFILES.taper, { opacity: 0.42 });
        }

        // Brass Magnifying Glass at (48, 114) revealing a concentric Forensic Fingerprint Whorl!
        painted(botScene, circlePath(48, 114, 26), brass, { medium: 'gouache', ink, inkWidth: 1.6, highlight: 0.7, seed: 717 });
        painted(botScene, circlePath(48, 114, 20), '#FFFBEB', { medium: 'watercolor', ink: brass, inkWidth: 1.0, seed: 718 });
        // Fingerprint whorl spirals inside the lens
        botScene.ink(spiralPath(48, 114, 16, 0.85, 10, true, 0), ink, 1.0, PROFILES.taper, { opacity: 0.75 });
        botScene.ink(linePath(66, 132, 102, 158), ink, 6.5, PROFILES.taper);

        // Holmes's Stradivarius Violin Silhouette & Bow at (114, 128)
        const violin = blob(118, 132, 16, 24, { seed: 719, wobble: 0.18, points: 8, rot: 25 });
        painted(botScene, violin, '#9A3412', { medium: 'gouache', ink, inkWidth: 1.1, highlight: 0.55, seed: 720 });
        botScene.ink(linePath(96, 152, 144, 104), brass, 1.4, PROFILES.uniform);
      });

      // 3. Chapter Crest: 221B Magnifying Glass Over Baker Street Fog, Violin Bow & Red Clue Thread
      crestScene.layer(0, () => {
        wash(crestScene, ellipseAt(140, 44, 94, 32), amber, { opacity: 0.32, edge: 8, seed: 721 });
        for (let i = 0; i < 3; i++) {
          crestScene.ink(wave(36, 244, 54 + i * 8, 3.5, 36, i, 0.1, 722 + i), tealFog, 2.0, PROFILES.taper, { opacity: 0.48 });
        }
        // Crossed Violin Bow & Red Clue Thread behind the central Magnifying Lens
        crestScene.ink(linePath(64, 62, 216, 22), brass, 2.2, PROFILES.uniform);
        crestScene.ink(smoothThrough([{ x: 52, y: 36 }, { x: 104, y: 58 }, { x: 140, y: 42 }, { x: 184, y: 24 }, { x: 228, y: 48 }], false, 0.45), clueRed, 1.8, PROFILES.taper);

        painted(crestScene, circlePath(140, 42, 23), brass, { medium: 'gouache', ink, inkWidth: 1.6, seed: 725 });
        painted(crestScene, circlePath(140, 42, 17), '#FFFBEB', { medium: 'watercolor', ink: brass, inkWidth: 1.0, seed: 726 });
        crestScene.ink(spiralPath(140, 42, 13, 0.84, 9, true, 0), ink, 0.95, PROFILES.taper, { opacity: 0.72 });
        crestScene.ink(linePath(156, 58, 182, 80), ink, 5.5, PROFILES.taper);
      });

      // 4. Under-Title: Calabash Pipe, Magnifying Lens & Red Conspiracy Clue-Thread
      underScene.layer(0, () => {
        underScene.ink(linePath(20, 24, 132, 24), brass, 2.0, PROFILES.taper);
        underScene.ink(linePath(188, 24, 300, 24), brass, 2.0, PROFILES.taper);
        underScene.stroke(linePath(40, 20, 280, 28), clueRed, 1.2, { dash: [5, 3] });
        painted(underScene, circlePath(160, 24, 12), brass, { medium: 'gouache', ink, inkWidth: 1.4, seed: 732 });
        painted(underScene, circlePath(160, 24, 8.5), amberLight, { medium: 'watercolor', ink, inkWidth: 0.8, seed: 733 });
        underScene.ink(spiralPath(160, 24, 6.5, 0.82, 7, true, 0), ink, 0.85, PROFILES.taper);
      });

      // 5. Bespoke Drop-Cap: Brass Magnifying Lens Bezel Over Forensic Fingerprint Whorl
      dropScene.layer(0, () => {
        wash(dropScene, circlePath(44, 44, 40), amber, { opacity: 0.3, edge: 6, seed: 740 });
        painted(dropScene, circlePath(44, 44, 38), brass, { medium: 'gouache', ink, inkWidth: 2.0, highlight: 0.7, seed: 741 });
        painted(dropScene, circlePath(44, 44, 31), '#FFFBEB', { medium: 'watercolor', ink: brass, inkWidth: 1.2, seed: 742 });
        dropScene.ink(spiralPath(44, 44, 26, 0.86, 12, true, 0), ink, 0.9, PROFILES.taper, { opacity: 0.28 });
        // Magnifying glass handle protruding at bottom-right
        dropScene.ink(linePath(68, 68, 84, 84), ink, 6.5, PROFILES.taper);
      });

      // 6. Bespoke Margin Border: Scotland Yard Forensic Scale, Violin F-Holes & Crimson Clue Thread
      marginScene.layer(0, () => {
        // Forensic ruler scale on left edge
        marginScene.ink(linePath(12, 12, 12, 308), ink, 1.6, PROFILES.uniform);
        for (let y = 16; y <= 304; y += 8) {
          const tickW = y % 32 === 0 ? 10 : y % 16 === 0 ? 6 : 3.5;
          marginScene.ink(linePath(12, y, 12 + tickW, y), ink, y % 32 === 0 ? 1.3 : 0.8, PROFILES.uniform);
        }
        // Winding red clue thread connecting 3 brass evidence pins & violin f-holes
        const cluePath = smoothThrough([{ x: 28, y: 20 }, { x: 18, y: 92 }, { x: 34, y: 160 }, { x: 18, y: 228 }, { x: 30, y: 296 }], false, 0.45);
        marginScene.ink(cluePath, clueRed, 1.5, PROFILES.uniform);
        [64, 160, 256].forEach((py, idx) => {
          painted(marginScene, circlePath(26, py, 8.5), brass, { medium: 'gouache', ink, inkWidth: 1.1, seed: 750 + idx });
          marginScene.ink(spiralPath(26, py, 5.5, 0.8, 6, true, 0), ink, 0.8, PROFILES.taper);
        });
      });

      // 7. Scene-Break Divider: Stradivarius Violin F-Hole Scroll & Magnifying Lens
      breakScene.layer(0, () => {
        breakScene.ink(linePath(24, 16, 102, 16), ink, 1.6, PROFILES.taper);
        breakScene.ink(linePath(138, 16, 216, 16), ink, 1.6, PROFILES.taper);
        painted(breakScene, circlePath(120, 16, 9), brass, { medium: 'gouache', ink, inkWidth: 1.2, seed: 760 });
        painted(breakScene, circlePath(120, 16, 5.5), amberLight, { medium: 'watercolor', seed: 761 });
      });

      // 8. Watermark: 221B Fingerprint Whorl & Compass Rose Dossier Stamp
      watermarkScene.layer(0, () => {
        watermarkScene.stroke(circlePath(130, 130, 102), brass, 1.5, {}, { opacity: 0.35 });
        watermarkScene.stroke(spiralPath(130, 130, 82, 0.88, 16, true, 0), tealFog, 1.2, {}, { opacity: 0.28 });
        watermarkScene.stroke(linePath(198, 198, 244, 244), brass, 5.0, {}, { opacity: 0.3 });
      });
      break;
    }

    // =========================================================================
    // 6. THE ART OF WAR — WORLD_ECLECTIC × RADICAL_MINIMAL (Edited by CLASSICAL)
    //    Imperial Gold Dragon, Bound Bamboo Slips (Jiandu), Weiqi Go Board, Bagua Trigrams & Cinnabar Seal
    // =========================================================================
    case 'art-of-war': {
      title = 'The Art of War · Imperial Gold Dragon, Bound Bamboo Slips, Weiqi Go Strategy & Cinnabar Seal';
      mediumDescription = 'Tela Classical Chinese Sumi-e Ink Brush (`PROFILES.brush`), Vermilion Cinnabar Lacquer & Gold Leaf';
      artCouncilDeliberation = makeCouncilDeliberation('WORLD_ECLECTIC', 'RADICAL_MINIMAL', 'CLASSICAL', {
        structuralDirective:
          'Honor Eastern Zhou / Han Dynasty military treatise materiality: bound bamboo scroll slips (*jiandu*), *Bagua* trigrams (☰ ☷ ☲ ☵), *Weiqi* (Go) tactical stones, five-petal winter plum blossoms (*meihua*), and a carved vermilion cinnabar seal (*chop*).',
        materialCraft:
          'Calligraphic sumi-e dry-brush strokes (`PROFILES.brush`), carved vermilion lacquer seal-stamps (`linocut`), imperial gold-leaf dragon clouds, and misty shan-shui mountain washes.',
        tensionResolved:
          'The World-Eclectic Traveller insists on authentic Han bamboo-slip binding, *Bagua* trigrams, and five-petal *meihua* (replacing Western roses); the Radical Minimalist preserves vast mountain-mist silence.',
        borderArchitectureName: 'Jointed Bamboo Stalk, Bagua Trigram (☰ ☷ ☲ ☵) & Weiqi Stone Margin',
        dropCapArchitectureName: 'Carved Vermilion Cinnabar Imperial Seal Stamp (Chop) on Bamboo Slips',
      });

      const vermilion = recipeOverride?.primaryFlowerColor || '#DC2626';
      const plumPink = recipeOverride?.secondaryBotanicalColor || '#F43F5E';
      const gold = recipeOverride?.goldFiligreeColor || '#D97706';
      const goldLight = '#FDE68A';
      const bambooGreen = recipeOverride?.foliageColor || '#3F6212';
      const sumiInk = recipeOverride?.inkColor || '#171717';

      // 1. Top Corner: Coiling Gold Imperial Dragon, Ruyi Cloud-Scrolls & 5-Petal Winter Plum Blossoms (Meihua)
      topScene.layer(0, () => {
        // Classical Chinese lattice-window corner fretwork (Meander / Leiwen)
        topScene.ink(linePath(10, 152, 10, 10), vermilion, 3.0, PROFILES.uniform);
        topScene.ink(linePath(10, 10, 152, 10), vermilion, 3.0, PROFILES.uniform);
        topScene.stroke(rectPath(16, 16, 26, 26, 0), gold, 1.5);
        topScene.stroke(rectPath(22, 22, 14, 14, 0), vermilion, 1.2);

        const dragonBody = smoothThrough(
          [{ x: 22, y: 112 }, { x: 34, y: 42 }, { x: 72, y: 26 }, { x: 106, y: 48 }, { x: 142, y: 20 }],
          false,
          0.55
        );
        brushStroke(topScene, dragonBody, { width: 7.5, profile: PROFILES.brush, color: gold, streaks: 3, seed: 801 });
        topScene.fill(cloud(56, 48, 52, 24, { puffs: 5, seed: 802 }), goldLight, { opacity: 0.6 });

        // Authentic 5-Petal Chinese Plum Blossoms (Meihua) & Bamboo Leaves
        drawTelaBotanicalLeaf(topScene, 60, 24, 112, 12, bambooGreen, sumiInk, goldLight, 0.28, 0.08, 803);
        drawTelaBotanicalLeaf(topScene, 24, 60, 12, 112, bambooGreen, sumiInk, goldLight, 0.28, -0.08, 804);
        drawChinesePlumBlossom(topScene, 46, 46, 16, vermilion, goldLight, sumiInk, goldLight, 805);
        drawChinesePlumBlossom(topScene, 92, 30, 11, plumPink, '#FFF1F2', sumiInk, gold, 806);
      });

      // 2. Bottom Corner: Shan-Shui Mountain Mist, Bound Bamboo Slips (Jiandu) & Weiqi (Go) Board with Stones
      botScene.layer(0, () => {
        botScene.ink(linePath(10, 18, 10, 160), vermilion, 3.0, PROFILES.uniform);
        botScene.ink(linePath(10, 160, 160, 160), vermilion, 3.0, PROFILES.uniform);
        const mtn = hill(10, 160, 158, 64, { bumps: 2.6, roughness: 0.18, bottom: 160, seed: 811 });
        wash(botScene, mtn, sumiInk, { opacity: 0.26, edge: 8, seed: 812 });

        // Bound Han-Dynasty Bamboo Slips (Jiandu) with silk binding cords
        for (let b = 0; b < 5; b++) {
          const sx = 18 + b * 11.5;
          painted(botScene, rectPath(sx, 102, 9, 48, 1.5), goldLight, { medium: 'gouache', ink: gold, inkWidth: 1.0, seed: 813 + b });
          botScene.ink(linePath(sx + 4.5, 110, sx + 4.5, 142), sumiInk, 0.9, PROFILES.brush, { dash: [3, 2] });
        }
        botScene.ink(linePath(16, 112, 74, 112), vermilion, 1.5, PROFILES.uniform);
        botScene.ink(linePath(16, 140, 74, 140), vermilion, 1.5, PROFILES.uniform);

        // Weiqi (Go) Grid & Tactical Black/White Stones at (x=84..148, y=114..154)
        for (let g = 0; g < 4; g++) {
          botScene.stroke(linePath(86, 118 + g * 10, 146, 118 + g * 10), sumiInk, 0.75);
          botScene.stroke(linePath(86 + g * 15, 114, 86 + g * 15, 152), sumiInk, 0.75);
        }
        painted(botScene, circlePath(101, 128, 6.5), sumiInk, { medium: 'gouache', highlight: 0.7, seed: 822 });
        painted(botScene, circlePath(116, 138, 6.5), '#FAFAFA', { medium: 'gouache', ink: sumiInk, inkWidth: 0.9, seed: 823 });
        painted(botScene, circlePath(131, 128, 6.5), sumiInk, { medium: 'gouache', highlight: 0.7, seed: 824 });
        drawChinesePlumBlossom(botScene, 84, 96, 14, vermilion, goldLight, sumiInk, goldLight, 825);
      });

      // 3. Chapter Crest: Bronze Jian Sword, Crimson War Banner & Mountain Fortress
      crestScene.layer(0, () => {
        const mtn = hill(42, 238, 82, 18, { bumps: 3.4, roughness: 0.22, bottom: 84, seed: 830 });
        wash(crestScene, mtn, sumiInk, { opacity: 0.28, edge: 7, seed: 831 });
        // Bronze Jian Sword slicing diagonally across the mountain pass
        crestScene.ink(linePath(58, 68, 222, 18), gold, 4.2, PROFILES.taper);
        painted(crestScene, polygonPath(92, 58, 9, 4, 25), goldLight, { medium: 'gouache', ink: sumiInk, inkWidth: 1.1, seed: 832 });
        const banner = wave(78, 202, 44, 8, 52, 0.5, 0.1, 833);
        brushStroke(crestScene, banner, { width: 10, color: vermilion, streaks: 4, seed: 834 });
        drawChinesePlumBlossom(crestScene, 50, 48, 14, vermilion, goldLight, sumiInk, goldLight, 835);
        drawChinesePlumBlossom(crestScene, 230, 48, 14, vermilion, goldLight, sumiInk, goldLight, 836);
      });

      // 4. Under-Title: Carved Square Vermilion Cinnabar Seal Stamp (Chop) & Calligraphic Brushstroke
      underScene.layer(0, () => {
        brushStroke(underScene, linePath(20, 24, 132, 24), { width: 3.8, color: sumiInk, streaks: 2, seed: 840 });
        brushStroke(underScene, linePath(188, 24, 300, 24), { width: 3.8, color: sumiInk, streaks: 2, seed: 841 });
        drawChinesePlumBlossom(underScene, 94, 22, 9.5, vermilion, goldLight, sumiInk, goldLight, 842);
        drawChinesePlumBlossom(underScene, 226, 22, 9.5, vermilion, goldLight, sumiInk, goldLight, 843);
        painted(underScene, rectPath(146, 10, 28, 28, 2), vermilion, { medium: 'linocut', ink: gold, inkWidth: 1.4, seed: 844 });
        // Seal script geometric glyph lines inside the chop
        underScene.ink(linePath(153, 16, 167, 16), '#FFFDF9', 1.5, PROFILES.uniform);
        underScene.ink(linePath(160, 16, 160, 32), '#FFFDF9', 1.5, PROFILES.uniform);
        underScene.ink(linePath(153, 24, 167, 24), '#FFFDF9', 1.3, PROFILES.uniform);
      });

      // 5. Bespoke Drop-Cap: Carved Vermilion Cinnabar Imperial Seal Stamp (Chop) over Bound Bamboo Slips
      dropScene.layer(0, () => {
        // Bamboo slip backing
        for (let b = 0; b < 6; b++) {
          painted(dropScene, rectPath(10 + b * 11.5, 8, 9.5, 72, 1.5), goldLight, { medium: 'gouache', ink: gold, inkWidth: 0.9, seed: 850 + b });
        }
        // Square Vermilion Cinnabar Seal Stamp
        painted(dropScene, rectPath(14, 14, 60, 60, 3), vermilion, { medium: 'linocut', ink: gold, inkWidth: 2.0, seed: 858 });
        painted(dropScene, rectPath(20, 20, 48, 48, 2), '#FFFDF7', { medium: 'watercolor', ink: vermilion, inkWidth: 1.4, seed: 859 });
        drawChinesePlumBlossom(dropScene, 16, 16, 8, plumPink, goldLight, sumiInk, goldLight, 860);
        drawChinesePlumBlossom(dropScene, 72, 72, 8, plumPink, goldLight, sumiInk, goldLight, 861);
      });

      // 6. Bespoke Margin Border: Jointed Green Bamboo Stalk, Bagua Trigrams (☰ ☷ ☲ ☵) & Weiqi Stones
      marginScene.layer(0, () => {
        // Segmented Bamboo Stalk with nodes
        [14, 78, 142, 206, 268].forEach((by, idx) => {
          marginScene.ink(linePath(22, by, 22, by + 56), bambooGreen, 4.2, PROFILES.uniform);
          marginScene.ink(linePath(16, by + 58, 28, by + 58), sumiInk, 2.0, PROFILES.uniform);
          const dir = idx % 2 === 0 ? 1 : -1;
          drawTelaBotanicalLeaf(marginScene, 22, by + 28, 22 + dir * 16, by + 12, bambooGreen, sumiInk, goldLight, 0.28, dir * 0.1, 870 + idx);
        });
        // Bagua Trigram bars at y=96 and y=224
        [96, 224].forEach((ty, idx) => {
          painted(marginScene, rectPath(10, ty - 10, 24, 20, 2), '#FFFDF7', { medium: 'gouache', ink: gold, inkWidth: 1.0, seed: 880 + idx });
          marginScene.ink(linePath(13, ty - 5, 31, ty - 5), sumiInk, 1.8, PROFILES.uniform);
          marginScene.ink(linePath(13, ty, 20, ty), vermilion, 1.8, PROFILES.uniform);
          marginScene.ink(linePath(24, ty, 31, ty), vermilion, 1.8, PROFILES.uniform);
          marginScene.ink(linePath(13, ty + 5, 31, ty + 5), sumiInk, 1.8, PROFILES.uniform);
        });
      });

      // 7. Scene-Break Divider: Bronze Jian Sword & Twin Weiqi Stones
      breakScene.layer(0, () => {
        breakScene.ink(linePath(24, 16, 216, 16), gold, 2.4, PROFILES.taper);
        painted(breakScene, circlePath(104, 16, 6), sumiInk, { medium: 'gouache', highlight: 0.7, seed: 890 });
        painted(breakScene, circlePath(136, 16, 6), '#FAFAFA', { medium: 'gouache', ink: sumiInk, inkWidth: 0.9, seed: 891 });
        painted(breakScene, rectPath(113, 9, 14, 14, 1), vermilion, { medium: 'linocut', ink: gold, inkWidth: 1.0, seed: 892 });
      });

      // 8. Watermark: Octagonal Bagua Diagram & Coiling Dragon Seal
      watermarkScene.layer(0, () => {
        watermarkScene.stroke(polygonPath(130, 130, 102, 8, 22.5), vermilion, 1.6, {}, { opacity: 0.35 });
        watermarkScene.stroke(polygonPath(130, 130, 82, 8, 22.5), gold, 1.1, { dash: [6, 3] }, { opacity: 0.32 });
        watermarkScene.stroke(circlePath(130, 130, 44), sumiInk, 1.3, {}, { opacity: 0.28 });
      });
      break;
    }

    // =========================================================================
    // 7. THE ODYSSEY — CLASSICAL × WORLD_ECLECTIC (Edited by BAROQUE)
    //    Continuous Greek Key (Meander), Red-Figure Kylix Pottery, Bronze Trireme & 12 Axe-Rings
    // =========================================================================
    case 'the-odyssey': {
      title = 'The Odyssey · Greek Key Meander, Archaic Terracotta Sunburst, Bronze Trireme & Twelve Axe-Rings';
      mediumDescription = 'Tela Attic Red-Figure Terracotta Gouache, Aegean Sapphire Wash & Hammered Bronze Ink';
      artCouncilDeliberation = makeCouncilDeliberation('CLASSICAL', 'WORLD_ECLECTIC', 'BAROQUE', {
        structuralDirective:
          'Construct the page as an Attic red-figure kylix vessel and Homeric bronze frieze: continuous Greek Key (*meander*) corner borders, olive laurel wreaths, Poseidon’s bronze trident, and Odysseus’s arrow piercing all twelve iron axe-rings.',
        materialCraft:
          'Kiln-fired terracotta gouache, black-glaze slip ink, hammered Mycenaean bronze highlights, and deep wine-dark Aegean sapphire watercolor washes.',
        tensionResolved:
          'The Classical Mind anchors the page with geometric Greek Key (*meander*) orthodoxy; the World-Eclectic Traveller grounds the vessels in authentic Archaic Mediterranean ceramic craft; the Baroque Dramatist unleashes Scylla’s waves beneath the bronze trireme.',
        borderArchitectureName: 'Attic Greek Key (Meander) Column, Palmette Anthemion & Olive Laurel',
        dropCapArchitectureName: 'Hoplite Bronze Shield with Greek Key Rim & Poseidon Trident',
      });

      const bronze = recipeOverride?.primaryFlowerColor || '#B45309';
      const gold = recipeOverride?.goldFiligreeColor || '#D97706';
      const goldBright = '#FDE68A';
      const aegean = recipeOverride?.secondaryBotanicalColor || '#0369A1';
      const olive = recipeOverride?.foliageColor || '#4D7C0F';
      const ink = recipeOverride?.inkColor || '#292524';

      // 1. Top Corner: Continuous Greek Key (Meander) Fretwork, Helios Terracotta Sunburst & Olive Wreath
      topScene.layer(0, () => {
        // Greek Key Meander Border along top and left
        topScene.ink(linePath(8, 154, 8, 8), bronze, 3.0, PROFILES.uniform);
        topScene.ink(linePath(8, 8, 154, 8), bronze, 3.0, PROFILES.uniform);
        const meanderTop = smoothThrough(
          [
            { x: 54, y: 14 }, { x: 74, y: 14 }, { x: 74, y: 24 }, { x: 62, y: 24 }, { x: 62, y: 18 },
            { x: 84, y: 18 }, { x: 84, y: 14 }, { x: 104, y: 14 }, { x: 104, y: 24 }, { x: 92, y: 24 },
          ],
          false,
          0.02
        );
        topScene.ink(meanderTop, ink, 1.5, PROFILES.uniform);

        // Archaic Red-Figure Helios Sunburst Medallion at (38, 38) (NO roses!)
        painted(topScene, circlePath(38, 38, 28), ink, { medium: 'gouache', ink: gold, inkWidth: 1.6, seed: 900 });
        const sunMedallion = starPath(38, 38, 24, 10, 16, 0, 1);
        painted(topScene, sunMedallion, gold, { medium: 'gouache', ink, inkWidth: 1.0, highlight: 0.7, seed: 901 });
        painted(topScene, circlePath(38, 38, 9), bronze, { medium: 'gouache', ink: goldBright, inkWidth: 1.0, seed: 902 });

        // Sacred Athenian Olive Branches & Golden Olives
        drawTelaBotanicalLeaf(topScene, 68, 28, 118, 16, olive, ink, goldBright, 0.34, 0.1, 903);
        drawTelaBotanicalLeaf(topScene, 28, 68, 16, 118, olive, ink, goldBright, 0.34, -0.1, 904);
        drawTelaBotanicalLeaf(topScene, 84, 38, 132, 28, olive, ink, gold, 0.32, 0.12, 905);
        painted(topScene, ellipseAt(74, 34, 5, 3.5, 30), goldBright, { medium: 'gouache', ink, inkWidth: 0.8, seed: 906 });
        painted(topScene, ellipseAt(34, 74, 5, 3.5, 60), goldBright, { medium: 'gouache', ink, inkWidth: 0.8, seed: 907 });
      });

      // 2. Bottom Corner: Wine-Dark Aegean Cresting Waves, Poseidon's Bronze Trident & Ionic Column Capital
      botScene.layer(0, () => {
        botScene.ink(linePath(8, 16, 8, 160), bronze, 3.0, PROFILES.uniform);
        botScene.ink(linePath(8, 160, 160, 160), bronze, 3.0, PROFILES.uniform);
        for (let i = 0; i < 3; i++) {
          const wv = wave(12, 158, 126 + i * 11, 5.5, 34, i * 0.9, 0.1, 911 + i);
          botScene.ink(wv, i % 2 === 0 ? aegean : bronze, 2.8, PROFILES.taper);
        }

        // Ionic Column Volute Capital at (42, 134)
        painted(botScene, rectPath(22, 122, 40, 34, 2), '#FEF3C7', { medium: 'gouache', ink, inkWidth: 1.2, seed: 915 });
        botScene.ink(spiralPath(22, 124, 11, 0.78, 7, true, 0), bronze, 1.8, PROFILES.taper);
        botScene.ink(spiralPath(62, 124, 11, 0.78, 7, false, 180), bronze, 1.8, PROFILES.taper);

        // Poseidon's Bronze Trident rising diagonally from the Aegean waves
        botScene.ink(linePath(48, 148, 112, 52), gold, 3.2, PROFILES.uniform);
        botScene.ink(linePath(100, 44, 124, 60), gold, 2.6, PROFILES.uniform);
        botScene.ink(linePath(100, 44, 112, 26), goldBright, 2.6, PROFILES.taper);
        botScene.ink(linePath(112, 52, 124, 34), goldBright, 2.8, PROFILES.taper);
        botScene.ink(linePath(124, 60, 136, 42), goldBright, 2.6, PROFILES.taper);
      });

      // 3. Chapter Crest: Bronze-Prowed Greek Trireme with Eye on Prow Braving Aegean Waves
      crestScene.layer(0, () => {
        wash(crestScene, ellipseAt(140, 44, 94, 32), '#F59E0B', { opacity: 0.35, edge: 8, seed: 920 });
        const hull = smoothThrough(
          [{ x: 76, y: 54 }, { x: 106, y: 68 }, { x: 174, y: 68 }, { x: 204, y: 46 }, { x: 176, y: 56 }, { x: 104, y: 56 }],
          true,
          0.35
        );
        painted(crestScene, hull, bronze, { medium: 'gouache', ink, inkWidth: 1.3, seed: 921 });
        // Painted apotropaic eye on the bronze trireme prow + oars
        painted(crestScene, ellipseAt(186, 55, 5, 3, -10), '#FFFBEB', { medium: 'gouache', ink, inkWidth: 0.8, seed: 922 });
        crestScene.fill(circlePath(186, 55, 1.8), ink);
        for (let o = 0; o < 7; o++) {
          crestScene.ink(linePath(112 + o * 9, 62, 106 + o * 9, 76), ink, 1.2, PROFILES.uniform);
        }
        painted(crestScene, blob(140, 34, 32, 17, { seed: 923, wobble: 0.08 }), '#FEF3C7', { medium: 'gouache', ink: bronze, inkWidth: 1.2, seed: 924 });
        crestScene.ink(wave(44, 236, 74, 4.5, 34, 0, 0.1, 925), aegean, 2.6, PROFILES.taper);
        drawTelaBotanicalLeaf(crestScene, 72, 52, 22, 28, olive, ink, goldBright, 0.36, 0.14, 926);
        drawTelaBotanicalLeaf(crestScene, 208, 52, 258, 28, olive, ink, goldBright, 0.36, -0.14, 927);
      });

      // 4. Under-Title: Odysseus's Arrow Piercing Directly Through All 12 Iron Axe-Rings!
      underScene.layer(0, () => {
        // 12 Iron Axe-Rings lined up across the center
        for (let a = 0; a < 12; a++) {
          const ax = 78 + a * 15;
          underScene.stroke(circlePath(ax, 24, 5.5), bronze, 1.6);
          underScene.ink(linePath(ax, 30, ax, 40), ink, 1.8, PROFILES.uniform);
        }
        // Odysseus's golden arrow shaft piercing straight through all 12 rings
        underScene.ink(linePath(24, 24, 296, 24), goldBright, 2.6, PROFILES.uniform);
        underScene.ink(linePath(24, 24, 296, 24), ink, 0.9, PROFILES.uniform);
        painted(underScene, polygonPath(296, 24, 7, 3, 0), gold, { medium: 'gouache', ink, inkWidth: 1.0, seed: 933 });
      });

      // 5. Bespoke Drop-Cap: Archaic Bronze Hoplite Shield with Greek Key Rim & Olive Laurel
      dropScene.layer(0, () => {
        wash(dropScene, circlePath(44, 44, 40), aegean, { opacity: 0.24, edge: 6, seed: 940 });
        painted(dropScene, circlePath(44, 44, 39), bronze, { medium: 'gouache', ink, inkWidth: 2.0, highlight: 0.65, seed: 941 });
        dropScene.stroke(circlePath(44, 44, 34), ink, 2.2, { dash: [5, 3] });
        painted(dropScene, circlePath(44, 44, 28), '#FFFBEB', { medium: 'watercolor', ink: bronze, inkWidth: 1.2, seed: 942 });
        drawTelaBotanicalLeaf(dropScene, 18, 66, 36, 80, olive, ink, goldBright, 0.34, 0.14, 943);
        drawTelaBotanicalLeaf(dropScene, 70, 66, 52, 80, olive, ink, goldBright, 0.34, -0.14, 944);
      });

      // 6. Bespoke Margin Border: Vertical Greek Key (Meander) Fretwork, Red-Figure Palmettes & Olive Leaves
      marginScene.layer(0, () => {
        marginScene.ink(linePath(10, 10, 10, 310), bronze, 1.8, PROFILES.uniform);
        marginScene.ink(linePath(34, 10, 34, 310), bronze, 1.8, PROFILES.uniform);
        // Repeating Greek Key Meander & Attic Red-Figure Palmette Medallions
        [48, 124, 200, 272].forEach((py, idx) => {
          painted(marginScene, circlePath(22, py, 10), ink, { medium: 'gouache', ink: gold, inkWidth: 1.2, seed: 950 + idx });
          painted(marginScene, starPath(22, py, 8, 3.5, 8, 0), bronze, { medium: 'gouache', seed: 955 + idx });
          drawTelaBotanicalLeaf(marginScene, 22, py - 18, 12, py - 32, olive, ink, goldBright, 0.32, -0.1, 960 + idx);
          drawTelaBotanicalLeaf(marginScene, 22, py - 18, 32, py - 32, olive, ink, goldBright, 0.32, 0.1, 965 + idx);
        });
      });

      // 7. Scene-Break Divider: Aegean Wave Scroll & Helios Star
      breakScene.layer(0, () => {
        breakScene.ink(wave(24, 216, 16, 4.0, 28, 0, 0.05, 970), aegean, 2.2, PROFILES.taper);
        painted(breakScene, starPath(120, 16, 10, 4.5, 12, 0), gold, { medium: 'gouache', ink, inkWidth: 0.9, seed: 971 });
      });

      // 8. Watermark: Attic Kylix Medallion, Greek Key Rim & Trireme
      watermarkScene.layer(0, () => {
        watermarkScene.stroke(circlePath(130, 130, 104), bronze, 1.8, {}, { opacity: 0.35 });
        watermarkScene.stroke(circlePath(130, 130, 92), ink, 3.5, { dash: [8, 4] }, { opacity: 0.28 });
        watermarkScene.stroke(starPath(130, 130, 72, 28, 16, 0), gold, 1.2, {}, { opacity: 0.3 });
      });
      break;
    }

    // =========================================================================
    // 8. TOM SAWYER — REBEL × CLASSICAL (Edited by WORLD_ECLECTIC)
    //    Whitewashed Fence & Paintbrush, Driftwood & Hemp Rope, Steamboat Pilot-Wheel & Cattails
    // =========================================================================
    case 'tom-sawyer': {
      title = 'The Adventures of Tom Sawyer · Whitewashed Fence, Mississippi Steamboat, Hemp Rope & Cattails';
      mediumDescription = 'Tela N.C. Wyeth Americana Watercolor, Whitewash Brush Gouache & Riverfront Ink';
      artCouncilDeliberation = makeCouncilDeliberation('REBEL', 'CLASSICAL', 'WORLD_ECLECTIC', {
        structuralDirective:
          'Capture 1840s St. Petersburg, Missouri along the Mississippi River: Tom’s whitewashed board fence with wet white paint streaks, braided riverboat hemp rope with fathom knots, weeping willow fronds, cattail reeds, and a paddlewheel steamboat.',
        materialCraft:
          'Sun-drenched N.C. Wyeth golden-hour watercolor washes, thick whitewash bristle-strokes (`PROFILES.brush`), rustic cedar-plank gouache, and river-blue ripples.',
        tensionResolved:
          'The Rebel slathers Aunt Polly’s fence with visible wet whitewash brush-streaks and knots the border in rough hemp rope; the Classical Mind balances the composition like a Golden Age Scribner’s illustrated plate.',
        borderArchitectureName: 'Braided Riverboat Hemp Rope, Fathom Knots, Cattails & Bobber Margin',
        dropCapArchitectureName: 'Mississippi Steamboat Wooden Pilot-Wheel & Braided Rope Medallion',
      });

      const willow = recipeOverride?.foliageColor || '#3F6212';
      const willowLight = '#65A30D';
      const riverBlue = recipeOverride?.secondaryBotanicalColor || '#0284C7';
      const amber = recipeOverride?.goldFiligreeColor || '#D97706';
      const lilyPink = recipeOverride?.primaryFlowerColor || '#F472B6';
      const ink = recipeOverride?.inkColor || '#36261B';

      // 1. Top Corner: Driftwood & Braided Hemp Rope Corner + Drooping Weeping Willow Fronds & River Sun
      topScene.layer(0, () => {
        // Rustic driftwood timber & knotted hemp-rope corner lashings
        topScene.ink(linePath(10, 148, 10, 10), '#78350F', 4.2, PROFILES.brush);
        topScene.ink(linePath(10, 10, 148, 10), '#78350F', 4.2, PROFILES.brush);
        topScene.stroke(linePath(10, 148, 10, 10), amber, 1.8, { dash: [4, 3] });
        topScene.stroke(linePath(10, 10, 148, 10), amber, 1.8, { dash: [4, 3] });

        for (let f = 0; f < 4; f++) {
          const frond = smoothThrough(
            [{ x: 24 + f * 28, y: 14 }, { x: 20 + f * 28, y: 58 }, { x: 28 + f * 28, y: 104 - f * 12 }],
            false,
            0.5
          );
          topScene.ink(frond, willow, 1.7, PROFILES.tail);
          for (let l = 0; l < 4; l++) {
            drawTelaBotanicalLeaf(
              topScene,
              24 + f * 28,
              28 + l * 16,
              14 + f * 28 + (l % 2 ? 13 : -11),
              38 + l * 16,
              willowLight,
              ink,
              amber,
              0.32,
              0.1,
              1001 + f * 10 + l
            );
          }
        }
        // Braided Hemp Rope Reef-Knot Medallion at (28, 28)
        painted(topScene, circlePath(28, 28, 15), amber, { medium: 'gouache', ink, inkWidth: 1.4, seed: 1018 });
        topScene.stroke(circlePath(28, 28, 10), '#FEF3C7', 2.0, { dash: [3, 2] });
      });

      // 2. Bottom Corner: Aunt Polly's Whitewashed Picket Fence, Paint Bucket, Cattails & Water-Lily
      botScene.layer(0, () => {
        botScene.ink(linePath(10, 18, 10, 160), '#78350F', 4.0, PROFILES.brush);
        botScene.ink(linePath(10, 160, 160, 160), '#78350F', 4.0, PROFILES.brush);
        for (let p = 0; p < 5; p++) {
          const px = 16 + p * 22;
          painted(botScene, rectPath(px, 102, 14, 52, 1), '#FAF8F5', { medium: 'gouache', ink, inkWidth: 1.0, seed: 1021 + p });
          // Wet whitewash brush streak on top half of each board
          brushStroke(botScene, linePath(px + 7, 104, px + 7, 134), { width: 9, color: '#FFFFFF', streaks: 3, seed: 1026 + p });
        }
        botScene.ink(linePath(12, 118, 124, 118), ink, 2.2, PROFILES.uniform);
        botScene.ink(linePath(12, 142, 124, 142), ink, 2.2, PROFILES.uniform);

        // Cattail Reeds & Mississippi Lotus Water-Lily (NOT an English rose!)
        botScene.ink(linePath(132, 156, 142, 70), willow, 2.2, PROFILES.tail);
        painted(botScene, ellipseAt(139, 92, 4.8, 15, 8), '#5C3A21', { medium: 'gouache', ink, inkWidth: 0.9, seed: 1030 });
        // Water-lily pad + lotus bloom at (48, 144)
        painted(botScene, ellipseAt(48, 148, 22, 9, 0), willowLight, { medium: 'gouache', ink, inkWidth: 1.0, seed: 1031 });
        for (let lp = 0; lp < 7; lp++) {
          const ang = -150 + lp * 20;
          painted(botScene, petal(48, 144, 16, 6, ang), lilyPink, { medium: 'watercolor', ink, inkWidth: 0.7, seed: 1032 + lp });
        }
        painted(botScene, circlePath(48, 144, 4.5), '#FEF08A', { medium: 'gouache', ink: amber, inkWidth: 0.8, seed: 1039 });
      });

      // 3. Chapter Crest: Mississippi Paddlewheel Steamboat & Log Raft in Golden Summer Sunlight
      crestScene.layer(0, () => {
        wash(crestScene, ellipseAt(140, 44, 94, 30), '#FDE68A', { opacity: 0.42, edge: 8, seed: 1040 });
        painted(crestScene, rectPath(96, 38, 88, 20, 2), '#FFFBEB', { medium: 'gouache', ink, inkWidth: 1.2, seed: 1041 });
        painted(crestScene, rectPath(106, 26, 56, 12, 1), '#FFFFFF', { medium: 'gouache', ink, inkWidth: 1.0, seed: 1042 });
        painted(crestScene, circlePath(166, 52, 13), '#DC2626', { medium: 'gouache', ink, inkWidth: 1.2, seed: 1043 });
        // Twin smokestacks with puffs of steam
        crestScene.ink(linePath(114, 12, 114, 26), ink, 3.5, PROFILES.uniform);
        crestScene.ink(linePath(130, 12, 130, 26), ink, 3.5, PROFILES.uniform);
        crestScene.ink(wave(40, 240, 68, 3.5, 32, 0, 0.1, 1045), riverBlue, 2.6, PROFILES.taper);
        // Cattails flanking the steamboat
        crestScene.ink(linePath(54, 72, 46, 24), willow, 2.0, PROFILES.tail);
        painted(crestScene, ellipseAt(48, 38, 4, 11, -10), '#5C3A21', { medium: 'gouache', ink, inkWidth: 0.8, seed: 1046 });
        crestScene.ink(linePath(226, 72, 234, 24), willow, 2.0, PROFILES.tail);
        painted(crestScene, ellipseAt(232, 38, 4, 11, 10), '#5C3A21', { medium: 'gouache', ink, inkWidth: 0.8, seed: 1047 });
      });

      // 4. Under-Title: Crossed Bamboo Fishing Pole, Red-and-White Bobber & Whitewash Brush
      underScene.layer(0, () => {
        underScene.ink(wave(20, 300, 26, 3.0, 34, 0, 0.1, 1050), riverBlue, 2.0, PROFILES.taper);
        underScene.ink(linePath(78, 34, 242, 14), amber, 2.4, PROFILES.taper);
        underScene.ink(linePath(78, 14, 242, 34), '#78350F', 2.6, PROFILES.taper);
        // Red & White Fishing Bobber at center (160, 24)
        painted(underScene, circlePath(160, 24, 10), '#DC2626', { medium: 'gouache', ink, inkWidth: 1.2, highlight: 0.7, seed: 1051 });
        painted(underScene, circlePath(160, 24, 4.5), '#FFFFFF', { medium: 'gouache', ink, inkWidth: 0.8, seed: 1052 });
      });

      // 5. Bespoke Drop-Cap: Mississippi Steamboat Wooden Pilot-Wheel & Braided Hemp Rope Cartouche
      dropScene.layer(0, () => {
        wash(dropScene, circlePath(44, 44, 40), riverBlue, { opacity: 0.22, edge: 6, seed: 1060 });
        // 8 Pilot-wheel wooden spokes protruding past the rim
        for (let sp = 0; sp < 8; sp++) {
          const a = ((sp * 45) * Math.PI) / 180;
          dropScene.ink(linePath(44, 44, 44 + Math.cos(a) * 42, 44 + Math.sin(a) * 42), '#78350F', 3.0, PROFILES.taper);
        }
        painted(dropScene, circlePath(44, 44, 34), amber, { medium: 'gouache', ink, inkWidth: 2.0, seed: 1061 });
        dropScene.stroke(circlePath(44, 44, 34), '#FEF3C7', 1.6, { dash: [4, 3] });
        painted(dropScene, circlePath(44, 44, 27), '#FFFDF7', { medium: 'watercolor', ink, inkWidth: 1.1, seed: 1062 });
      });

      // 6. Bespoke Margin Border: Braided Hemp Riverboat Rope, Fathom Knots, Cattails & Fishing Bobbers
      marginScene.layer(0, () => {
        const ropeA = smoothThrough([{ x: 18, y: 10 }, { x: 26, y: 80 }, { x: 18, y: 160 }, { x: 26, y: 240 }, { x: 18, y: 310 }], false, 0.5);
        const ropeB = smoothThrough([{ x: 26, y: 10 }, { x: 18, y: 80 }, { x: 26, y: 160 }, { x: 18, y: 240 }, { x: 26, y: 310 }], false, 0.5);
        marginScene.ink(ropeA, amber, 2.2, PROFILES.uniform);
        marginScene.ink(ropeB, '#78350F', 1.8, PROFILES.uniform);
        // Cattails & Red-and-White Bobbers along the rope
        [64, 160, 256].forEach((by, idx) => {
          painted(marginScene, circlePath(22, by, 8.5), idx === 1 ? '#DC2626' : amber, { medium: 'gouache', ink, inkWidth: 1.1, seed: 1070 + idx });
          painted(marginScene, circlePath(22, by, 3.8), '#FFFFFF', { medium: 'gouache', ink, inkWidth: 0.7, seed: 1075 + idx });
          drawTelaBotanicalLeaf(marginScene, 22, by - 14, 8, by - 32, willowLight, ink, amber, 0.3, -0.1, 1080 + idx);
          drawTelaBotanicalLeaf(marginScene, 22, by - 14, 36, by - 32, willowLight, ink, amber, 0.3, 0.1, 1085 + idx);
        });
      });

      // 7. Scene-Break Divider: Mississippi River Waves & Steamboat Pilot-Wheel Star
      breakScene.layer(0, () => {
        breakScene.ink(wave(24, 216, 16, 3.5, 30, 0, 0.1, 1090), riverBlue, 2.0, PROFILES.taper);
        painted(breakScene, starPath(120, 16, 10, 4.5, 8, 0), amber, { medium: 'gouache', ink, inkWidth: 1.0, seed: 1091 });
      });

      // 8. Watermark: Steamboat Pilot-Wheel & Compass over River Ripples
      watermarkScene.layer(0, () => {
        watermarkScene.stroke(circlePath(130, 130, 96), amber, 2.0, {}, { opacity: 0.34 });
        watermarkScene.stroke(circlePath(130, 130, 78), '#78350F', 1.4, { dash: [6, 4] }, { opacity: 0.3 });
        for (let sp = 0; sp < 8; sp++) {
          const a = ((sp * 45) * Math.PI) / 180;
          watermarkScene.stroke(linePath(130, 130, 130 + Math.cos(a) * 110, 130 + Math.sin(a) * 110), amber, 1.6, {}, { opacity: 0.3 });
        }
      });
      break;
    }

    // =========================================================================
    // 9. LITTLE WOMEN — CLASSICAL × WORLD_ECLECTIC (Edited by BAROQUE)
    //    Orchard House Pressed Autumn Maple Leaves, Jo's Quill & Inkwell, Beth's Piano Keys & Sampler
    // =========================================================================
    case 'little-women': {
      title = 'Little Women · Concord Pressed Maple Leaves, Jo’s Quill & Inkwell, Beth’s Piano & March Locket';
      mediumDescription = 'Tela New England Autumn Gouache, Hearthside Amber Wash & Victorian Keepsake Album Ink';
      artCouncilDeliberation = makeCouncilDeliberation('CLASSICAL', 'WORLD_ECLECTIC', 'BAROQUE', {
        structuralDirective:
          'Design the page as the March sisters’ Orchard House keepsake album in Concord, Massachusetts: pressed scarlet-and-gold New England maple leaves, Jo’s brass inkwell and feather quill, Beth’s piano keyboard and musical staves, Amy’s palette, and Meg’s cross-stitch embroidery sampler.',
        materialCraft:
          'Warm hearthside candlelit watercolor, pressed-leaf botanical gouache, walnut-ink manuscript calligraphy, and Victorian cross-stitch needlework geometry.',
        tensionResolved:
          'The Classical Mind structures the page with warm New England domestic proportion; the World-Eclectic Traveller grounds every corner in Concord 1868 craft (pressed maple leaves, needlework sampler, sheet music); the Baroque Dramatist warms the center with fireplace amber.',
        borderArchitectureName: 'Victorian Cross-Stitch Sampler, Beth’s Piano Keys & Pressed Maple Margin',
        dropCapArchitectureName: 'Gold Oval Keepsake Locket Cameo (M · J · B · A) & Autumn Maple Wreath',
      });

      const mapleRed = recipeOverride?.primaryFlowerColor || '#B91C1C';
      const autumnGold = recipeOverride?.goldFiligreeColor || '#D97706';
      const goldBright = '#FDE68A';
      const rosePink = recipeOverride?.secondaryBotanicalColor || '#E11D48';
      const forest = recipeOverride?.foliageColor || '#3F6212';
      const ink = recipeOverride?.inkColor || '#431407';

      // 1. Top Corner: Victorian Cross-Stitch Frame, Pressed Scarlet Maple Leaves, Acorns & Jo's Feather Quill
      topScene.layer(0, () => {
        topScene.ink(linePath(10, 152, 10, 10), autumnGold, 2.8, PROFILES.uniform);
        topScene.ink(linePath(10, 10, 152, 10), autumnGold, 2.8, PROFILES.uniform);
        topScene.stroke(linePath(17, 144, 17, 17), mapleRed, 1.3, { dash: [3, 3] });
        topScene.stroke(linePath(17, 17, 144, 17), mapleRed, 1.3, { dash: [3, 3] });

        // Pressed 5-Lobe New England Sugar Maple Leaf at (42, 42)
        for (let lobe = 0; lobe < 5; lobe++) {
          const ang = (-45 + (lobe - 2) * 32) * (Math.PI / 180);
          const len = lobe === 2 ? 36 : lobe === 1 || lobe === 3 ? 30 : 22;
          drawTelaBotanicalLeaf(
            topScene,
            26,
            26,
            26 + Math.cos(ang) * len,
            26 + Math.sin(ang) * len,
            lobe % 2 === 0 ? mapleRed : autumnGold,
            ink,
            goldBright,
            0.46,
            0.05,
            1100 + lobe
          );
        }
        // Jo's White Goose-Feather Quill sweeping across the top corner
        drawTelaBotanicalLeaf(topScene, 54, 48, 136, 18, '#FFFBEB', ink, autumnGold, 0.28, -0.14, 1106);
        topScene.ink(linePath(40, 54, 136, 18), ink, 1.4, PROFILES.taper);
      });

      // 2. Bottom Corner: Beth's Grand Piano Keyboard Ribbon, Amy's Palette & Autumn Marigolds
      botScene.layer(0, () => {
        botScene.ink(linePath(10, 18, 10, 160), autumnGold, 2.8, PROFILES.uniform);
        botScene.ink(linePath(10, 160, 160, 160), autumnGold, 2.8, PROFILES.uniform);

        // Beth's Ivory & Ebony Piano Keyboard curving across the bottom corner (x=18..126, y=126..152)
        for (let k = 0; k < 8; k++) {
          const kx = 18 + k * 12;
          painted(botScene, rectPath(kx, 126, 11.5, 28, 1), '#FFFDF9', { medium: 'gouache', ink, inkWidth: 0.9, seed: 1110 + k });
          if (k !== 2 && k !== 6 && k < 7) {
            painted(botScene, rectPath(kx + 7.5, 126, 7, 17, 1), ink, { medium: 'gouache', seed: 1120 + k });
          }
        }
        drawTelaBotanicalLeaf(botScene, 22, 120, 68, 84, mapleRed, ink, goldBright, 0.48, -0.14, 1130);
        drawTelaBotanicalLeaf(botScene, 58, 122, 112, 92, autumnGold, ink, goldBright, 0.46, 0.12, 1131);
        drawTelaBriarRose(botScene, 36, 108, 18, rosePink, '#FECDD3', autumnGold, ink, goldBright, 1132, 8);
      });

      // 3. Chapter Crest: Jo's Brass Inkwell, Feather Quill, Open Manuscript & Hearthside Glow
      crestScene.layer(0, () => {
        wash(crestScene, circlePath(140, 44, 42), goldBright, { opacity: 0.45, edge: 8, seed: 1140 });
        // Open manuscript book pages behind the brass inkwell
        painted(crestScene, rectPath(98, 36, 40, 28, 2), '#FFFDF7', { medium: 'gouache', ink: autumnGold, inkWidth: 1.1, seed: 1141 });
        painted(crestScene, rectPath(142, 36, 40, 28, 2), '#FFFDF7', { medium: 'gouache', ink: autumnGold, inkWidth: 1.1, seed: 1142 });
        painted(crestScene, rectPath(126, 46, 28, 22, 3), autumnGold, { medium: 'gouache', ink, inkWidth: 1.3, seed: 1143 });
        drawTelaBotanicalLeaf(crestScene, 140, 48, 196, 8, '#FFFBEB', ink, autumnGold, 0.32, -0.18, 1144);
        drawTelaBotanicalLeaf(crestScene, 88, 54, 36, 28, mapleRed, ink, goldBright, 0.46, 0.14, 1145);
        drawTelaBotanicalLeaf(crestScene, 192, 54, 244, 28, autumnGold, ink, goldBright, 0.46, -0.14, 1146);
      });

      // 4. Under-Title: Dip-Pen Nib, Musical Staff Lines & Autumn Maple Leaf
      underScene.layer(0, () => {
        // 5-line musical staff from Beth's piano score
        for (let st = 0; st < 5; st++) {
          underScene.stroke(linePath(24, 16 + st * 4, 296, 16 + st * 4), autumnGold, 0.75, {}, { opacity: 0.65 });
        }
        drawTelaBotanicalLeaf(underScene, 134, 24, 92, 14, mapleRed, ink, goldBright, 0.42, 0.12, 1150);
        drawTelaBotanicalLeaf(underScene, 186, 24, 228, 14, autumnGold, ink, goldBright, 0.42, -0.12, 1151);
        painted(underScene, circlePath(160, 24, 10), autumnGold, { medium: 'gouache', ink, inkWidth: 1.3, seed: 1152 });
        painted(underScene, polygonPath(160, 24, 6, 4, 0), mapleRed, { medium: 'gouache', seed: 1153 });
      });

      // 5. Bespoke Drop-Cap: Victorian Gold Keepsake Locket Cameo (4 Sisters' Pearls) & Pressed Maple Leaves
      dropScene.layer(0, () => {
        wash(dropScene, circlePath(44, 44, 40), goldBright, { opacity: 0.35, edge: 6, seed: 1160 });
        // Locket top suspension ring
        dropScene.stroke(circlePath(44, 7, 5.5), autumnGold, 2.2);
        painted(dropScene, ellipseAt(44, 46, 36, 38, 0), autumnGold, { medium: 'gouache', ink, inkWidth: 1.8, highlight: 0.7, seed: 1161 });
        painted(dropScene, ellipseAt(44, 46, 29, 31, 0), '#FFFDF9', { medium: 'watercolor', ink: mapleRed, inkWidth: 1.1, seed: 1162 });
        // 4 Jewels at N/S/E/W for the 4 March Sisters (Meg, Jo, Beth, Amy)
        painted(dropScene, circlePath(44, 15, 3.8), mapleRed, { medium: 'gouache', ink, inkWidth: 0.7, seed: 1163 });
        painted(dropScene, circlePath(44, 77, 3.8), rosePink, { medium: 'gouache', ink, inkWidth: 0.7, seed: 1164 });
        painted(dropScene, circlePath(15, 46, 3.8), forest, { medium: 'gouache', ink, inkWidth: 0.7, seed: 1165 });
        painted(dropScene, circlePath(73, 46, 3.8), '#0284C7', { medium: 'gouache', ink, inkWidth: 0.7, seed: 1166 });
      });

      // 6. Bespoke Margin Border: Victorian Cross-Stitch Embroidery Sampler & Pressed Maple Leaves
      marginScene.layer(0, () => {
        marginScene.stroke(linePath(10, 10, 10, 310), autumnGold, 1.0, { dash: [3, 3] });
        marginScene.stroke(linePath(34, 10, 34, 310), autumnGold, 1.0, { dash: [3, 3] });
        // Cross-stitch X pattern alternating with pressed autumn maple & oak leaves
        for (let y = 24; y <= 296; y += 28) {
          marginScene.ink(linePath(17, y - 5, 27, y + 5), mapleRed, 1.4, PROFILES.uniform);
          marginScene.ink(linePath(27, y - 5, 17, y + 5), mapleRed, 1.4, PROFILES.uniform);
        }
        [52, 132, 212, 280].forEach((ly, idx) => {
          const dir = idx % 2 === 0 ? 1 : -1;
          drawTelaBotanicalLeaf(marginScene, 22, ly, 22 + dir * 16, ly - 16, idx % 2 === 0 ? mapleRed : autumnGold, ink, goldBright, 0.44, dir * 0.12, 1170 + idx);
        });
      });

      // 7. Scene-Break Divider: Feather Quill & Brass Inkwell
      breakScene.layer(0, () => {
        breakScene.ink(linePath(28, 18, 212, 14), ink, 1.6, PROFILES.taper);
        drawTelaBotanicalLeaf(breakScene, 120, 16, 184, 8, '#FFFBEB', ink, autumnGold, 0.28, -0.12, 1180);
        painted(breakScene, circlePath(120, 16, 6.5), mapleRed, { medium: 'gouache', ink: autumnGold, inkWidth: 1.0, seed: 1181 });
      });

      // 8. Watermark: Orchard House Attic Window & Pressed Maple Wreath
      watermarkScene.layer(0, () => {
        watermarkScene.stroke(circlePath(130, 130, 100), autumnGold, 1.5, { dash: [4, 4] }, { opacity: 0.35 });
        watermarkScene.stroke(rectPath(90, 82, 80, 96, { tl: 40, tr: 40, bl: 2, br: 2 }), ink, 1.5, {}, { opacity: 0.3 });
        watermarkScene.stroke(linePath(130, 82, 130, 178), ink, 1.2, {}, { opacity: 0.28 });
        watermarkScene.stroke(linePath(90, 130, 170, 130), ink, 1.2, {}, { opacity: 0.28 });
      });
      break;
    }

    // =========================================================================
    // 10. MOBY DICK — REBEL × BAROQUE (Edited by RADICAL_MINIMAL)
    //     Rockwell Kent Woodcut Swells, Crossed Barbed Harpoons, Nautical Compass Rose & Spanish Gold Doubloon
    //     (ZERO flowers! Pure 1851 Nantucket Whaling Woodcut, Scrimshaw & Iron)
    // =========================================================================
    case 'moby-dick': {
      title = 'Moby Dick · Breaching White Whale, Crossed Nantucket Harpoons, Compass Rose & Spanish Doubloon';
      mediumDescription = 'Tela Rockwell Kent 1930 Woodcut (`linocut`), Cross-Hatched Abyssal Swells & Nautical Brass';
      artCouncilDeliberation = makeCouncilDeliberation('REBEL', 'BAROQUE', 'RADICAL_MINIMAL', {
        structuralDirective:
          'Channel Rockwell Kent’s monumental 1930 Lakeside Press woodcuts for Melville: eliminate every floral motif and replace with crossed barbed iron Nantucket harpoons, a 16-point brass compass rose, coiled hemp whale-line, scrimshaw whale-tooth diamonds, and Ahab’s Spanish gold doubloon nailed to the mainmast.',
        materialCraft:
          'Stark black-and-teal woodblock engraving (`linocut`), directional cross-hatched Leviathan skin, salt-spray stippling, and tarnished 1851 Quito gold.',
        tensionResolved:
          'The Rebel carves raw woodblock gouges and hurls barbed iron harpoons across the frame; the Baroque Dramatist breaches the colossal white whale out of the midnight swell; the Radical Minimalist leaves vast, terrifying white space for the whale’s forehead.',
        borderArchitectureName: 'Coiled Nantucket Whale-Line, Barbed Harpoons & Scrimshaw Tooth Margin',
        dropCapArchitectureName: 'Ahab’s Nailed Spanish Gold Doubloon (1851 · Quito) on Pequod Mast-Wood',
      });

      const oceanTeal = recipeOverride?.primaryFlowerColor || '#0F4C5C';
      const seafoam = recipeOverride?.secondaryBotanicalColor || '#38BDF8';
      const foamWhite = '#F8FAFC';
      const brass = recipeOverride?.goldFiligreeColor || '#B47B26';
      const goldBright = '#FDE68A';
      const abyss = recipeOverride?.inkColor || '#0B192C';

      // 1. Top Corner: Crossed Barbed Nantucket Harpoons, 16-Point Brass Compass Rose & Coiled Whale-Line (NO flowers!)
      topScene.layer(0, () => {
        // Braided Whale-Line Rope & Iron Harpoon Shaft Border
        topScene.ink(linePath(10, 152, 10, 10), abyss, 3.4, PROFILES.uniform);
        topScene.ink(linePath(10, 10, 152, 10), abyss, 3.4, PROFILES.uniform);
        topScene.stroke(linePath(16, 144, 16, 16), brass, 1.8, { dash: [5, 3] });
        topScene.stroke(linePath(16, 16, 144, 16), brass, 1.8, { dash: [5, 3] });

        // Crossed Barbed Iron Harpoons spears
        topScene.ink(linePath(12, 12, 134, 84), abyss, 3.0, PROFILES.taper);
        topScene.ink(linePath(12, 12, 84, 134), abyss, 3.0, PROFILES.taper);
        painted(topScene, polygonPath(134, 84, 9, 3, 30), brass, { medium: 'linocut', ink: abyss, inkWidth: 1.1, seed: 1200 });
        painted(topScene, polygonPath(84, 134, 9, 3, 60), brass, { medium: 'linocut', ink: abyss, inkWidth: 1.1, seed: 1201 });

        // True 16-Point Nautical Brass Compass Rose at (40, 40)
        drawNauticalCompassRose(topScene, 40, 40, 24, brass, goldBright, oceanTeal, abyss, 1202);
        topScene.ink(wave(54, 150, 22, 4.5, 30, 0, 0.12, 1206), oceanTeal, 2.6, PROFILES.taper);
      });

      // 2. Bottom Corner: Sounding White Whale Tail Flukes Over Woodcut Tempest Swells & Compass Rose
      botScene.layer(0, () => {
        botScene.ink(linePath(10, 18, 10, 160), abyss, 3.4, PROFILES.uniform);
        botScene.ink(linePath(10, 160, 160, 160), abyss, 3.4, PROFILES.uniform);
        for (let w = 0; w < 3; w++) {
          const swell = hill(10, 160, 158, 104 + w * 14, { bumps: 3.5, roughness: 0.24, bottom: 160, seed: 1211 + w });
          painted(botScene, swell, w % 2 === 0 ? oceanTeal : '#1E6076', { medium: 'linocut', ink: abyss, inkWidth: 1.2, seed: 1215 + w });
          botScene.stroke(hatch(swell, { angle: 25, spacing: 5, seed: 1218 + w }), abyss, 0.65, {}, { opacity: 0.45 });
        }
        // Sounding White Whale Flukes rising above the tempest
        const flukeL = petal(62, 88, 30, 12, -145);
        const flukeR = petal(62, 88, 30, 12, -35);
        painted(botScene, flukeL, foamWhite, { medium: 'linocut', ink: abyss, inkWidth: 1.4, seed: 1221 });
        painted(botScene, flukeR, foamWhite, { medium: 'linocut', ink: abyss, inkWidth: 1.4, seed: 1222 });
        drawNauticalCompassRose(botScene, 38, 136, 18, brass, goldBright, oceanTeal, abyss, 1223);
      });

      // 3. Chapter Crest: Breaching Scarred White Sperm Whale Flanked by Compass Roses
      crestScene.layer(0, () => {
        wash(crestScene, ellipseAt(140, 44, 96, 32), seafoam, { opacity: 0.26, edge: 8, seed: 1229 });
        const whaleBody = blob(140, 40, 48, 20, { seed: 1230, wobble: 0.14, rot: -16 });
        painted(crestScene, whaleBody, foamWhite, { medium: 'linocut', ink: abyss, inkWidth: 1.6, shadow: 0.45, seed: 1231 });
        // Harpoon scars cross-hatched onto Moby Dick's white flank
        crestScene.stroke(crossHatch(whaleBody, { spacing: 5.5, seed: 1232 }), oceanTeal, 0.8, {}, { opacity: 0.55 });
        crestScene.ink(wave(40, 240, 68, 5.5, 34, 0, 0.15, 1233), oceanTeal, 3.0, PROFILES.taper);
        drawNauticalCompassRose(crestScene, 50, 48, 15, brass, goldBright, oceanTeal, abyss, 1234);
        drawNauticalCompassRose(crestScene, 230, 48, 15, brass, goldBright, oceanTeal, abyss, 1238);
      });

      // 4. Under-Title: Barbed Iron Nantucket Harpoon & Coiled Hemp Whale-Line
      underScene.layer(0, () => {
        // Barbed Iron Harpoon spanning full width
        underScene.ink(linePath(24, 24, 296, 24), abyss, 3.0, PROFILES.uniform);
        painted(underScene, polygonPath(296, 24, 10, 3, 0), brass, { medium: 'linocut', ink: abyss, inkWidth: 1.2, seed: 1240 });
        const ropeWave = wave(36, 260, 24, 6, 38, 0, 0.05, 1241);
        underScene.ink(ropeWave, brass, 1.8, PROFILES.taper);
        drawNauticalCompassRose(underScene, 160, 24, 13, brass, goldBright, oceanTeal, abyss, 1242);
      });

      // 5. Bespoke Drop-Cap: Ahab's Nailed Spanish Gold Doubloon (1851 · Quito) on Pequod Mast-Wood
      dropScene.layer(0, () => {
        // Vertical grained mast-wood plank background
        painted(dropScene, rectPath(8, 8, 72, 72, 4), '#78350F', { medium: 'linocut', ink: abyss, inkWidth: 1.8, seed: 1250 });
        // Hammered Spanish Gold Doubloon Coin with rope-beaded rim & iron nail heads at 4 corners
        painted(dropScene, circlePath(44, 44, 36), brass, { medium: 'gouache', ink: abyss, inkWidth: 1.8, highlight: 0.75, seed: 1251 });
        dropScene.stroke(circlePath(44, 44, 32), abyss, 1.4, { dash: [3, 2] });
        painted(dropScene, circlePath(44, 44, 27), '#FFFBEB', { medium: 'watercolor', ink: brass, inkWidth: 1.1, seed: 1252 });
        [
          [16, 16],
          [72, 16],
          [16, 72],
          [72, 72],
        ].forEach(([nx, ny], idx) => {
          painted(dropScene, polygonPath(nx, ny, 4.5, 4, 45), abyss, { medium: 'gouache', ink: goldBright, inkWidth: 0.8, seed: 1253 + idx });
        });
      });

      // 6. Bespoke Margin Border: Coiled Whale-Line, Barbed Harpoon Heads & Scrimshaw Whale-Tooth Diamonds
      marginScene.layer(0, () => {
        marginScene.ink(linePath(22, 12, 22, 308), abyss, 2.4, PROFILES.uniform);
        const coil = wave(12, 308, 22, 9, 44, 0, 0.05, 1260);
        marginScene.stroke(coil, brass, 1.6, { dash: [4, 2] });
        // Barbed harpoon tip at top (y=16) and scrimshaw ivory diamonds at y=76, 160, 244
        painted(marginScene, polygonPath(22, 16, 9, 3, -90), brass, { medium: 'linocut', ink: abyss, inkWidth: 1.1, seed: 1261 });
        [76, 160, 244].forEach((sy, idx) => {
          painted(marginScene, polygonPath(22, sy, 12, 4, 0), foamWhite, { medium: 'linocut', ink: abyss, inkWidth: 1.2, seed: 1262 + idx });
          drawNauticalCompassRose(marginScene, 22, sy, 8, brass, goldBright, oceanTeal, abyss, 1266 + idx * 4);
        });
      });

      // 7. Scene-Break Divider: Crossed Harpoons & Nautical Compass Star
      breakScene.layer(0, () => {
        breakScene.ink(linePath(28, 22, 212, 10), abyss, 2.2, PROFILES.taper);
        breakScene.ink(linePath(28, 10, 212, 22), abyss, 2.2, PROFILES.taper);
        drawNauticalCompassRose(breakScene, 120, 16, 11, brass, goldBright, oceanTeal, abyss, 1280);
      });

      // 8. Watermark: 16-Point Nautical Compass Rose & Breaching Leviathan Fluke
      watermarkScene.layer(0, () => {
        watermarkScene.stroke(circlePath(130, 130, 102), oceanTeal, 1.8, {}, { opacity: 0.35 });
        watermarkScene.stroke(starPath(130, 130, 94, 26, 8, 0), brass, 1.4, {}, { opacity: 0.32 });
        watermarkScene.stroke(circlePath(130, 130, 52), abyss, 1.2, { dash: [5, 3] }, { opacity: 0.28 });
      });
      break;
    }

    // =========================================================================
    // 11. THE COUNT OF MONTE CRISTO — BAROQUE × FUTURIST (Edited by CLASSICAL)
    //     Shattered Château d'If Iron Dungeon Chains Transforming into Parisian Gold Fleur-de-Lis & Faceted Emeralds
    // =========================================================================
    case 'count-of-monte-cristo': {
      title = 'The Count of Monte Cristo · Shattered Château d’If Chains, French Fleur-de-Lis & Faceted Emeralds';
      mediumDescription = 'Tela Second-Empire Gold Leaf, Faceted Emerald & Sapphire Gouache & Iron Engraving';
      artCouncilDeliberation = makeCouncilDeliberation('BAROQUE', 'FUTURIST', 'CLASSICAL', {
        structuralDirective:
          'Stage Edmond Dantès’s metamorphosis from prisoner #34 of the Château d’If into the Count of Monte Cristo: heavy iron dungeon chains in the upper/outer frame shattering and transmuting into Second-Empire Parisian gold filigree, Royal Fleur-de-Lis, crossed rapiers, and faceted emerald-cut jewels.',
        materialCraft:
          'Hammered iron linocut links, burnished gold-leaf Baroque scrollwork, geometric faceted emerald/sapphire jewel gouache (`drawFacetedJewel`), and Mediterranean sapphire washes.',
        tensionResolved:
          'The Baroque Dramatist revels in the Spada treasure chest and theatrical vengeance; the Futurist cuts the emeralds and sapphires with geometric crystalline precision; the Classical Mind balances the transformation from iron chain to gold crown.',
        borderArchitectureName: 'Shattered Château d’If Iron Chain Transmuting into Faceted Emerald Filigree',
        dropCapArchitectureName: 'Octagonal Emerald Signet Ring ("Wait and Hope") & Gold Fleur-de-Lis',
      });

      const gold = recipeOverride?.goldFiligreeColor || '#D97706';
      const goldBright = '#FDE047';
      const emerald = recipeOverride?.primaryFlowerColor || '#059669';
      const emeraldLight = '#6EE7B7';
      const sapphire = recipeOverride?.secondaryBotanicalColor || '#1D4ED8';
      const laurel = recipeOverride?.foliageColor || '#065F46';
      const ink = recipeOverride?.inkColor || '#1E1B4B';

      // 1. Top Corner: Royal Gold Fleur-de-Lis, Shattered Dungeon Chain Links & Faceted Emerald Brooch
      topScene.layer(0, () => {
        topScene.ink(linePath(10, 152, 10, 10), gold, 3.2, PROFILES.ink);
        topScene.ink(linePath(10, 10, 152, 10), gold, 3.2, PROFILES.ink);
        // Iron chain links along left rail breaking open at (10, 76)
        [96, 118, 140].forEach((ly, i) => {
          painted(topScene, ellipseAt(14, ly, 6, 10, 0), '#334155', { medium: 'linocut', ink, inkWidth: 1.2, seed: 1300 + i });
        });

        // Gilded French Fleur-de-Lis Crest at (38, 38)
        const centerLily = petal(38, 38, 28, 10, -45);
        const leftLily = petal(38, 38, 21, 8, -95);
        const rightLily = petal(38, 38, 21, 8, 5);
        painted(topScene, centerLily, goldBright, { medium: 'gouache', ink, inkWidth: 1.0, seed: 1303 });
        painted(topScene, leftLily, gold, { medium: 'gouache', ink, inkWidth: 0.9, seed: 1304 });
        painted(topScene, rightLily, gold, { medium: 'gouache', ink, inkWidth: 0.9, seed: 1305 });

        // Faceted Emerald & Sapphire Jewels (NO garden roses!)
        drawTelaBotanicalLeaf(topScene, 58, 24, 108, 14, laurel, ink, goldBright, 0.36, 0.14, 1306);
        drawTelaBotanicalLeaf(topScene, 24, 58, 14, 108, laurel, ink, goldBright, 0.36, -0.14, 1307);
        drawFacetedJewel(topScene, 72, 68, 13, emerald, emeraldLight, goldBright, ink, 1308);
        drawFacetedJewel(topScene, 98, 26, 9, sapphire, '#93C5FD', goldBright, ink, 1312);
      });

      // 2. Bottom Corner: Overflowing Spada Iron-Bound Treasure Chest, Gold Coins & Faceted Emeralds
      botScene.layer(0, () => {
        botScene.ink(linePath(10, 18, 10, 160), gold, 3.2, PROFILES.ink);
        botScene.ink(linePath(10, 160, 160, 160), gold, 3.2, PROFILES.ink);

        const chest = rectPath(18, 114, 58, 38, 3);
        painted(botScene, chest, '#451A03', { medium: 'gouache', ink: gold, inkWidth: 1.8, seed: 1315 });
        botScene.ink(linePath(34, 114, 34, 152), gold, 2.2, PROFILES.uniform);
        botScene.ink(linePath(60, 114, 60, 152), gold, 2.2, PROFILES.uniform);
        for (let c = 0; c < 8; c++) {
          painted(botScene, circlePath(26 + c * 6, 110 - (c % 3) * 4, 5.5), goldBright, { medium: 'gouache', ink: gold, inkWidth: 0.8, seed: 1316 + c });
        }

        drawTelaBotanicalLeaf(botScene, 78, 148, 136, 122, laurel, ink, goldBright, 0.38, -0.12, 1325);
        drawFacetedJewel(botScene, 98, 136, 16, emerald, emeraldLight, goldBright, ink, 1326);
        drawFacetedJewel(botScene, 42, 86, 13, sapphire, '#93C5FD', goldBright, ink, 1330);
      });

      // 3. Chapter Crest: Château d'If Island Fortress, Crossed Dueling Rapiers & Faceted Emeralds
      crestScene.layer(0, () => {
        wash(crestScene, ellipseAt(140, 44, 96, 32), sapphire, { opacity: 0.26, edge: 8, seed: 1334 });
        const island = hill(76, 204, 80, 24, { bumps: 3.5, roughness: 0.25, bottom: 82, seed: 1335 });
        painted(crestScene, island, '#334155', { medium: 'linocut', ink, inkWidth: 1.2, seed: 1336 });
        painted(crestScene, rectPath(126, 16, 28, 28, 1), '#64748B', { medium: 'gouache', ink: gold, inkWidth: 1.2, seed: 1337 });
        // Crossed French Dueling Rapiers with cup-hilts
        crestScene.ink(linePath(64, 68, 216, 18), goldBright, 2.8, PROFILES.taper);
        crestScene.ink(linePath(64, 18, 216, 68), goldBright, 2.8, PROFILES.taper);
        drawFacetedJewel(crestScene, 50, 48, 14, emerald, emeraldLight, goldBright, ink, 1338);
        drawFacetedJewel(crestScene, 230, 48, 14, emerald, emeraldLight, goldBright, ink, 1342);
      });

      // 4. Under-Title: Crossed Rapiers & Octagonal Emerald Signet Brooch
      underScene.layer(0, () => {
        underScene.ink(linePath(20, 28, 300, 20), gold, 2.2, PROFILES.taper);
        underScene.ink(linePath(20, 20, 300, 28), gold, 2.2, PROFILES.taper);
        drawFacetedJewel(underScene, 94, 24, 9, sapphire, '#93C5FD', goldBright, ink, 1346);
        drawFacetedJewel(underScene, 226, 24, 9, sapphire, '#93C5FD', goldBright, ink, 1350);
        drawFacetedJewel(underScene, 160, 24, 13, emerald, emeraldLight, goldBright, ink, 1354);
      });

      // 5. Bespoke Drop-Cap: Octagonal Faceted Emerald Signet Cartouche with Fleur-de-Lis Corners
      dropScene.layer(0, () => {
        wash(dropScene, circlePath(44, 44, 40), emerald, { opacity: 0.26, edge: 6, seed: 1360 });
        const outerOct = polygonPath(44, 44, 40, 8, 22.5, 2);
        painted(dropScene, outerOct, goldBright, { medium: 'gouache', ink, inkWidth: 2.0, highlight: 0.75, seed: 1361 });
        const midOct = polygonPath(44, 44, 34, 8, 22.5, 1);
        painted(dropScene, midOct, emerald, { medium: 'gouache', ink: gold, inkWidth: 1.4, seed: 1362 });
        const innerOct = polygonPath(44, 44, 27, 8, 22.5, 1);
        painted(dropScene, innerOct, '#FFFDF9', { medium: 'watercolor', ink: gold, inkWidth: 1.2, seed: 1363 });
        drawFacetedJewel(dropScene, 14, 14, 7.5, emerald, emeraldLight, goldBright, ink, 1364);
        drawFacetedJewel(dropScene, 74, 74, 7.5, sapphire, '#93C5FD', goldBright, ink, 1368);
      });

      // 6. Bespoke Margin Border: Heavy Château d'If Iron Chains Breaking into Parisian Gold & Emeralds
      marginScene.layer(0, () => {
        // Top half (y=16..136): Heavy iron dungeon chain links
        for (let cy = 22; cy <= 122; cy += 24) {
          painted(marginScene, ellipseAt(22, cy, 7.5, 12, 0), '#334155', { medium: 'linocut', ink, inkWidth: 1.3, seed: 1372 + cy });
          marginScene.fill(ellipseAt(22, cy, 3, 6, 0), '#FFFDF9');
        }
        // Shattering spark at y=148 where Dantès escapes!
        marginScene.fill(sparkle(22, 148, 12), goldBright);
        // Bottom half (y=164..304): Gilded Baroque scrollwork & Faceted Emerald/Sapphire Jewels
        const baroqueScroll = smoothThrough([{ x: 22, y: 156 }, { x: 10, y: 204 }, { x: 34, y: 252 }, { x: 22, y: 304 }], false, 0.55);
        marginScene.ink(baroqueScroll, gold, 2.4, PROFILES.brush);
        drawFacetedJewel(marginScene, 22, 196, 10.5, emerald, emeraldLight, goldBright, ink, 1380);
        drawFacetedJewel(marginScene, 22, 268, 10.5, sapphire, '#93C5FD', goldBright, ink, 1384);
      });

      // 7. Scene-Break Divider: Crossed Dueling Rapiers & Emerald Brooch
      breakScene.layer(0, () => {
        breakScene.ink(linePath(24, 22, 216, 10), gold, 2.0, PROFILES.taper);
        breakScene.ink(linePath(24, 10, 216, 22), gold, 2.0, PROFILES.taper);
        drawFacetedJewel(breakScene, 120, 16, 9.5, emerald, emeraldLight, goldBright, ink, 1390);
      });

      // 8. Watermark: Octagonal Emerald Cut & French Royal Fleur-de-Lis
      watermarkScene.layer(0, () => {
        watermarkScene.stroke(polygonPath(130, 130, 102, 8, 22.5), gold, 1.8, {}, { opacity: 0.35 });
        watermarkScene.stroke(polygonPath(130, 130, 76, 8, 22.5), emerald, 1.3, { dash: [6, 3] }, { opacity: 0.32 });
        watermarkScene.stroke(petal(130, 130, 62, 22, -90), gold, 1.4, {}, { opacity: 0.3 });
      });
      break;
    }

    // =========================================================================
    // 12. JANE EYRE — REBEL × RADICAL_MINIMAL (Edited by BAROQUE)
    //     Wind-Lashed Yorkshire Hawthorn Thorns, Split Chestnut Tree, Purple Heather & Thornfield Candle
    // =========================================================================
    case 'jane-eyre':
    default: {
      title = 'Jane Eyre · Wind-Lashed Yorkshire Hawthorn, Lightning-Split Chestnut, Moorland Heather & Thornfield Candle';
      mediumDescription = 'Tela Yorkshire Moorland Watercolor, Brontë Woodcut Ink & Warm Candlelight Gouache';
      artCouncilDeliberation = makeCouncilDeliberation('REBEL', 'RADICAL_MINIMAL', 'BAROQUE', {
        structuralDirective:
          'Refuse polite drawing-room symmetry: bend the hawthorn boughs at a 35-degree gale angle across the Yorkshire moors, split the orchard chestnut tree with lightning, line the margin with diagonal driving rain and wild heather, and light the third-story Gothic tower of Thornfield Hall with a single amber candle.',
        materialCraft:
          'Clare Leighton / Thomas Bewick wood-engraved blackthorn ink (`PROFILES.tail`), wind-swept diagonal rain hatching, moorland plum-heather watercolor washes, and warm beeswax candle gouache.',
        tensionResolved:
          'The Rebel bends the branches against the Yorkshire gale and chars the split chestnut bough; the Radical Minimalist isolates Jane’s solitary candle in vast moorland twilight; the Baroque Dramatist kindles the crimson-and-amber fire in the upper tower.',
        borderArchitectureName: 'Diagonal Yorkshire Rain-Hatch, Gnarled Hawthorn Thorns & Heather Margin',
        dropCapArchitectureName: 'Thornfield Third-Story Gothic Lancet Window & Flickering Candle Cartouche',
      });

      const heather = recipeOverride?.primaryFlowerColor || '#9333EA';
      const heatherLight = '#D8B4FE';
      const gorseGold = recipeOverride?.goldFiligreeColor || '#EAB308';
      const gorseBright = '#FEF08A';
      const hawthorn = recipeOverride?.inkColor || '#3B2F2F';
      const moss = recipeOverride?.foliageColor || '#3F6212';

      // 1. Top Corner: Wind-Lashed Gnarled Hawthorn Boughs with Sharp Thorns & Wild White Hawthorn Blossoms
      topScene.layer(0, () => {
        const branch1 = smoothThrough([{ x: 8, y: 148 }, { x: 14, y: 34 }, { x: 48, y: 14 }, { x: 152, y: 10 }], false, 0.42);
        const branch2 = smoothThrough([{ x: 16, y: 68 }, { x: 64, y: 42 }, { x: 122, y: 28 }], false, 0.42);
        topScene.ink(branch1, hawthorn, 3.8, PROFILES.tail);
        topScene.ink(branch2, hawthorn, 2.4, PROFILES.tail);
        // Sharp blackthorn spikes protruding from the wind-bent branches
        [
          [14, 96, 26, 84],
          [16, 56, 4, 44],
          [64, 14, 78, 4],
          [104, 12, 118, 4],
          [64, 42, 78, 52],
        ].forEach(([x1, y1, x2, y2]) => {
          topScene.ink(linePath(x1, y1, x2, y2), hawthorn, 1.8, PROFILES.taper);
        });

        drawTelaBotanicalLeaf(topScene, 68, 22, 114, 12, moss, hawthorn, gorseGold, 0.36, 0.18, 1401);
        drawTelaBotanicalLeaf(topScene, 22, 68, 12, 114, moss, hawthorn, gorseGold, 0.36, -0.18, 1402);
        // 5-petal wild Yorkshire White Hawthorn / May-blossom & Purple Moorland Heather
        drawChinesePlumBlossom(topScene, 40, 34, 15, '#FAF5FF', heatherLight, hawthorn, gorseGold, 1403);
        drawChinesePlumBlossom(topScene, 86, 28, 11, heather, heatherLight, hawthorn, gorseBright, 1408);
      });

      // 2. Bottom Corner: Wind-Swept Yorkshire Moorland Heather Spires, Golden Gorse & Split Chestnut Bough
      botScene.layer(0, () => {
        const splitBough = smoothThrough([{ x: 8, y: 20 }, { x: 12, y: 156 }, { x: 156, y: 158 }], false, 0.25);
        botScene.ink(splitBough, hawthorn, 3.8, PROFILES.tail);

        // Wind-bent Moorland Heather Spires leaning diagonally with the Yorkshire gale
        for (let s = 0; s < 4; s++) {
          const stem = smoothThrough(
            [{ x: 18 + s * 18, y: 154 }, { x: 32 + s * 22, y: 112 }, { x: 54 + s * 24, y: 66 + s * 10 }],
            false,
            0.5
          );
          botScene.ink(stem, moss, 2.0, PROFILES.tail);
          for (let b = 0; b < 6; b++) {
            const bx = 28 + s * 20 + b * 4;
            const by = 134 - b * 11 + s * 2;
            painted(botScene, petal(bx, by, 7.5, 4.2, -55 + (b % 2) * 30), b % 2 === 0 ? heather : heatherLight, {
              medium: 'watercolor',
              ink: hawthorn,
              inkWidth: 0.55,
              seed: 1411 + s * 10 + b,
            });
          }
        }
        // Golden Yorkshire Gorse Clusters at base
        drawChinesePlumBlossom(botScene, 40, 136, 18, gorseGold, gorseBright, hawthorn, gorseBright, 1440);
        drawChinesePlumBlossom(botScene, 94, 144, 14, heather, heatherLight, hawthorn, gorseBright, 1445);
      });

      // 3. Chapter Crest: Crenellated Thornfield Hall Tower with Single Flickering Upper-Window Candle & Split Chestnut
      crestScene.layer(0, () => {
        wash(crestScene, ellipseAt(140, 42, 94, 32), heather, { opacity: 0.3, edge: 9, seed: 1450 });
        const moor = hill(42, 238, 82, 48, { bumps: 3.2, roughness: 0.18, bottom: 84, seed: 1451 });
        painted(crestScene, moor, '#4C1D95', { medium: 'gouache', ink: hawthorn, inkWidth: 1.1, seed: 1452 });
        // Crenellated Stone Tower of Thornfield Hall
        painted(crestScene, rectPath(122, 14, 36, 58, 1), '#27272A', { medium: 'linocut', ink: hawthorn, inkWidth: 1.4, seed: 1453 });
        // Single glowing amber candle in the third-story Gothic window
        wash(crestScene, circlePath(140, 30, 16), gorseGold, { opacity: 0.55, edge: 6, seed: 1454 });
        painted(crestScene, rectPath(136, 22, 8, 15, { tl: 4, tr: 4, bl: 0, br: 0 }), '#FBBF24', {
          medium: 'gouache',
          highlight: 0.9,
          seed: 1455,
        });
        // Gnarled hawthorn boughs flanking Thornfield
        crestScene.ink(smoothThrough([{ x: 36, y: 64 }, { x: 76, y: 42 }, { x: 108, y: 34 }], false, 0.4), hawthorn, 2.6, PROFILES.tail);
        crestScene.ink(smoothThrough([{ x: 244, y: 64 }, { x: 204, y: 42 }, { x: 172, y: 34 }], false, 0.4), hawthorn, 2.6, PROFILES.tail);
      });

      // 4. Under-Title: Lightning-Split Orchard Chestnut Bough & Beeswax Candle Flame
      underScene.layer(0, () => {
        // Two halves of the lightning-split orchard chestnut bough separated by a golden candle flame
        underScene.ink(smoothThrough([{ x: 20, y: 26 }, { x: 84, y: 18 }, { x: 144, y: 26 }], false, 0.35), hawthorn, 2.8, PROFILES.tail);
        underScene.ink(smoothThrough([{ x: 300, y: 26 }, { x: 236, y: 18 }, { x: 176, y: 26 }], false, 0.35), hawthorn, 2.8, PROFILES.tail);
        wash(underScene, circlePath(160, 22, 14), gorseGold, { opacity: 0.45, edge: 5, seed: 1460 });
        painted(underScene, petal(160, 28, 16, 7, -90), gorseBright, { medium: 'gouache', ink: gorseGold, inkWidth: 1.0, seed: 1461 });
        painted(underScene, petal(160, 28, 9, 4, -90), '#F97316', { medium: 'gouache', seed: 1462 });
      });

      // 5. Bespoke Drop-Cap: Thornfield Third-Story Pointed Gothic Arch Window & Flickering Candle
      dropScene.layer(0, () => {
        wash(dropScene, circlePath(44, 44, 40), heather, { opacity: 0.26, edge: 6, seed: 1470 });
        const gothicArch = smoothThrough(
          [{ x: 12, y: 80 }, { x: 12, y: 36 }, { x: 44, y: 6 }, { x: 76, y: 36 }, { x: 76, y: 80 }],
          true,
          0.15
        );
        painted(dropScene, gothicArch, '#27272A', { medium: 'linocut', ink: hawthorn, inkWidth: 2.0, seed: 1471 });
        const innerArch = smoothThrough(
          [{ x: 19, y: 74 }, { x: 19, y: 40 }, { x: 44, y: 14 }, { x: 69, y: 40 }, { x: 69, y: 74 }],
          true,
          0.15
        );
        painted(dropScene, innerArch, '#FFFBEB', { medium: 'watercolor', ink: gorseGold, inkWidth: 1.3, seed: 1472 });
        // Flickering candle flame at top apex of Gothic arch
        painted(dropScene, petal(44, 24, 11, 5, -90), gorseBright, { medium: 'gouache', ink: '#EA580C', inkWidth: 0.8, seed: 1473 });
      });

      // 6. Bespoke Margin Border: Diagonal Yorkshire Driving Rain, Thorny Hawthorn Bramble & Heather Sprigs
      marginScene.layer(0, () => {
        // Diagonal wind-driven moorland rain streaks
        for (let ry = 16; ry <= 300; ry += 20) {
          marginScene.stroke(linePath(36, ry, 8, ry + 18), heather, 0.85, {}, { opacity: 0.38 });
        }
        const thornStem = smoothThrough([{ x: 22, y: 10 }, { x: 12, y: 84 }, { x: 32, y: 160 }, { x: 12, y: 236 }, { x: 26, y: 310 }], false, 0.45);
        marginScene.ink(thornStem, hawthorn, 2.4, PROFILES.tail);
        // Sharp thorns & purple heather bell clusters
        [52, 124, 196, 268].forEach((hy, idx) => {
          const dir = idx % 2 === 0 ? 1 : -1;
          marginScene.ink(linePath(22, hy - 14, 22 + dir * 12, hy - 22), hawthorn, 1.6, PROFILES.taper);
          for (let b = 0; b < 4; b++) {
            painted(marginScene, petal(22 + dir * 4, hy + b * 5, 6.5, 3.6, dir * 45), b % 2 === 0 ? heather : heatherLight, {
              medium: 'watercolor',
              ink: hawthorn,
              inkWidth: 0.5,
              seed: 1480 + idx * 4 + b,
            });
          }
        });
      });

      // 7. Scene-Break Divider: Thorny Hawthorn Branch & Moorland Candle Flame
      breakScene.layer(0, () => {
        breakScene.ink(smoothThrough([{ x: 24, y: 18 }, { x: 120, y: 14 }, { x: 216, y: 18 }], false, 0.4), hawthorn, 2.0, PROFILES.tail);
        painted(breakScene, petal(120, 20, 12, 5, -90), gorseBright, { medium: 'gouache', ink: gorseGold, inkWidth: 0.9, seed: 1490 });
      });

      // 8. Watermark: Thornfield Gothic Lancet Window & Lightning-Split Chestnut Tree
      watermarkScene.layer(0, () => {
        const arch = smoothThrough(
          [{ x: 64, y: 224 }, { x: 64, y: 104 }, { x: 130, y: 28 }, { x: 196, y: 104 }, { x: 196, y: 224 }],
          true,
          0.15
        );
        watermarkScene.stroke(arch, heather, 1.8, {}, { opacity: 0.35 });
        watermarkScene.stroke(linePath(130, 28, 130, 224), hawthorn, 1.3, {}, { opacity: 0.28 });
        watermarkScene.stroke(circlePath(130, 88, 22), gorseGold, 1.4, { dash: [4, 3] }, { opacity: 0.32 });
      });
      break;
    }
  }

  const optimizeTelaSvgForGpu = (svg: string): string =>
    svg
      .replace(/<filter id="(?:mat|f)_[^"]+"[\s\S]*?<\/filter>/g, '')
      .replace(/\s*filter="url\(#(?:mat|f)_[^"]+\)"/g, '')
      .replace(/<defs>\s*<\/defs>/g, '');

  const bundle: TelaFlourishBundle = {
    themeId,
    title,
    mediumDescription,
    artCouncilDeliberation,
    topCornerSvg: optimizeTelaSvgForGpu(topScene.toSvg()),
    bottomCornerSvg: optimizeTelaSvgForGpu(botScene.toSvg()),
    chapterCrestSvg: optimizeTelaSvgForGpu(crestScene.toSvg()),
    underTitleSvg: optimizeTelaSvgForGpu(underScene.toSvg()),
    illuminatedDropCapSvg: optimizeTelaSvgForGpu(dropScene.toSvg()),
    marginGarlandSvg: optimizeTelaSvgForGpu(marginScene.toSvg()),
    sceneBreakSvg: optimizeTelaSvgForGpu(breakScene.toSvg()),
    watermarkSvg: optimizeTelaSvgForGpu(watermarkScene.toSvg()),
    editableObjects: [
      ...topScene.build(),
      ...botScene.build(),
      ...crestScene.build(),
      ...underScene.build(),
      ...dropScene.build(),
      ...marginScene.build(),
      ...breakScene.build(),
      ...watermarkScene.build(),
    ],
  };

  svgCache.set(cacheKey, bundle);
  return bundle;
}

/**
 * Uses the Omni / Gemini model (`callGemini`) to inspect the classic book's cover brief
 * and generate a fresh, customized `OmniFlourishRecipe` that is immediately rebuilt into
 * editable Tela Vector Studio geometry (`TelaFlourishBundle`).
 */
export async function rebuildFlourishWithOmniToTela(
  themeId: string,
  bookTitle: string,
  coverDescription: string
): Promise<{ bundle: TelaFlourishBundle; recipe: OmniFlourishRecipe; source: 'omni-ai' | 'tela-deterministic' }> {
  const fallbackRecipe: OmniFlourishRecipe = {
    themeId,
    primaryFlowerColor: '#E17B93',
    secondaryBotanicalColor: '#B85D8E',
    foliageColor: '#436850',
    goldFiligreeColor: '#C59B27',
    inkColor: '#2A3B30',
    medium: 'watercolor',
    rosePetals: 8,
    foxgloveBells: 6,
    peacockRays: 11,
    notes: `Rebuilt in Tela Geometry Engine from "${bookTitle}" cover motifs (${coverDescription}).`,
  };

  try {
    const prompt = `You are the Tela Vector Art Director Council. Given the classic book "${bookTitle}" (themeId: "${themeId}") and its cover art description: "${coverDescription}", output ONLY valid JSON matching this schema to parameterize the Tela Geometry & Painterly Scene Engine:
{"primaryFlowerColor":"#hex","secondaryBotanicalColor":"#hex","foliageColor":"#hex","goldFiligreeColor":"#hex","inkColor":"#hex","medium":"watercolor","rosePetals":8,"foxgloveBells":6,"peacockRays":11,"notes":"1-sentence art direction note"}`;
    const raw = await callGemini(prompt, { temperature: 0.6 });
    const text = String(typeof raw === 'string' ? raw : raw?.text ?? '');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(text.slice(start, end + 1));
      const recipe: OmniFlourishRecipe = {
        ...fallbackRecipe,
        ...parsed,
        themeId,
      };
      return {
        bundle: buildClassicBookTelaFlourishBundle(themeId, recipe),
        recipe,
        source: 'omni-ai',
      };
    }
  } catch {
    // Fallback to deterministic Tela Scene rebuild
  }

  return {
    bundle: buildClassicBookTelaFlourishBundle(themeId, fallbackRecipe),
    recipe: fallbackRecipe,
    source: 'tela-deterministic',
  };
}
