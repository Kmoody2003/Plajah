// services/ambo/worshipVisualizers/calmWorshipVisualizers.ts
// Collection I: 24 Calm & Gorgeous Contemporary Worship Lyric Visualizers
// Deeply Art-Directed by the 6-Voice Art Director Council:
// Every visualizer features multi-plane depth, bespoke architectural/botanical/geometric craft,
// palette-true lighting physics, and distinct Council typography.

import {
  WorshipVisualizerDef,
  W_SERIF,
  W_SANS,
  W_DISPLAY,
  clamp01,
  lerp,
  hash11,
  fbm2D,
  hexRgba,
  mixHex,
  drawSanctuaryBg,
  drawAshlarMasonry,
  drawGodRays,
  drawMotes,
  drawGothicRoseWindow,
  drawCathedralArcade,
  drawKintsugiFractureNetwork,
  drawSacredAstrolabe,
  drawSanctuaryCenserLamp,
  applySanctuaryFinish,
  renderWorshipLyrics,
} from './types';

export const CALM_WORSHIP_VISUALIZERS: WorshipVisualizerDef[] = [
  // 1. Gethsemane Olive Dusk (Gemini Concept Plate #1 Twin)
  {
    id: 'calm-01-gethsemane-olive-dusk',
    number: 1,
    category: 'calm-lyric',
    subgenre: 'Scenic Nature',
    name: 'Gethsemane Olive Dusk',
    subtitle: 'Ancient gnarled olive boughs, Jerusalem terrace stones, and lantern fireflies',
    description: 'Interactive code twin of the Gethsemane concept plate: gnarled thousand-year olive trunks, silver-sage foliage, terraced limestone walls, and hanging oil lanterns breathe with the singer’s voice.',
    lightingNote: 'Key: 3200K warm oil-lantern glow + 5800K indigo twilight sky; rolling ground haze.',
    serviceUse: 'Communion, Good Friday, intimate reflection, acoustic worship.',
    palette: ['#09131E', '#1E3A4C', '#D49B42', '#FAF3E3'],
    conceptImage: '/sanctuary-plates/calm-olive-gethsemane.jpg',
    audioMappings: [
      ['Vocal', 'Brightens hanging oil lanterns, firefly halos & lyric glow'],
      ['Swell', 'Lifts warm amber ground mist through ancient olive roots'],
      ['Harmonic', 'Sways silver-green olive leaf clusters in the evening breeze'],
    ],
    render(rc) {
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.4, params.motion);
      drawSanctuaryBg(ctx, w, h, '#060D17', '#132838', '#1A241E', params.warmth);

      // 1. Distant Kidron Valley & Mount of Olives terraced horizon glow
      const hg = ctx.createRadialGradient(w * 0.5, h * 0.68, 0, w * 0.5, h * 0.68, w * 0.58);
      hg.addColorStop(0, hexRgba('#E6A145', 0.34 + audio.swell * 0.24));
      hg.addColorStop(0.48, hexRgba('#3E5A58', 0.18));
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(0, 0, w, h);

      // Terraced dry-stone garden walls in mid-ground
      for (let tr = 0; tr < 3; tr++) {
        const ty = h * (0.68 + tr * 0.085);
        ctx.fillStyle = tr === 0 ? '#111C24' : tr === 1 ? '#0C141A' : '#080E12';
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 20) {
          const und = Math.sin(x * 0.004 + tr * 1.9) * h * 0.025;
          ctx.lineTo(x, ty + und);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
      }

      // 2. Rolling volumetric ground mist layers
      for (let m = 0; m < 4; m++) {
        const my = h * (0.60 + m * 0.08);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 22) {
          const n = fbm2D(x * 0.003 + t * 0.08 * spd * (m % 2 ? 1 : -1), m * 2.1, 3);
          const y = my + (n - 0.5) * h * 0.09 * (1 + audio.swell * 0.45);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fillStyle = hexRgba(m < 2 ? '#E0A34E' : '#2C4C54', 0.09 + audio.vocal * 0.07);
        ctx.fill();
        ctx.restore();
      }

      // 3. Ancient gnarled olive tree trunks, twisting boughs & silver-sage leaf clusters
      ctx.save();
      for (const side of [-1, 1]) {
        const baseX = side === -1 ? w * 0.05 : w * 0.95;
        // Gnarled trunk silhouette with warm lantern rim-light
        ctx.fillStyle = '#05080C';
        ctx.strokeStyle = hexRgba('#D49B42', 0.28 + audio.vocal * 0.25);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(baseX - side * w * 0.09, h);
        ctx.bezierCurveTo(
          baseX + side * w * 0.05,
          h * 0.72,
          baseX - side * w * 0.02,
          h * 0.42,
          baseX + side * w * 0.04,
          h * 0.14,
        );
        ctx.lineTo(baseX - side * w * 0.08, h * 0.04);
        ctx.lineTo(baseX - side * w * 0.09, h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Reaching branches + detailed lance-shaped olive leaves
        for (let b = 0; b < 3; b++) {
          const branchY = h * (0.14 + b * 0.13);
          const reachX = baseX + side * w * (0.26 - b * 0.05);
          const sway = Math.sin(t * 0.75 * spd + b * 1.4) * h * 0.015 * (1 + audio.swell * 0.5);
          ctx.strokeStyle = '#070C11';
          ctx.lineWidth = Math.max(2.5, (4 - b) * (w / 640));
          ctx.beginPath();
          ctx.moveTo(baseX, branchY);
          ctx.quadraticCurveTo(
            (baseX + reachX) * 0.5,
            branchY - h * 0.04 + sway,
            reachX,
            branchY + h * 0.02 + sway,
          );
          ctx.stroke();

          // Individual silver-green olive leaves along each bough
          for (let lf = 1; lf <= 9; lf++) {
            const u = lf / 9;
            const lx = lerp(baseX, reachX, u);
            const ly = branchY + Math.sin(u * Math.PI) * -h * 0.02 + sway * u;
            const ang = side * (0.35 + (lf % 2 === 0 ? 0.45 : -0.45)) + sway * 0.01;
            ctx.fillStyle = lf % 3 === 0 ? hexRgba('#789882', 0.58 + audio.vocal * 0.25) : hexRgba('#1E3329', 0.82);
            ctx.beginPath();
            ctx.ellipse(lx, ly + (lf % 2 ? -5 : 5), w * 0.014, h * 0.0045, ang, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Hanging warm Gethsemane oil lantern from lowest bough
        const lanX = baseX + side * w * 0.16 + Math.sin(t * 1.1 * spd + side) * w * 0.006;
        const lanY = h * 0.34;
        ctx.strokeStyle = hexRgba('#D49B42', 0.55);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(lanX, h * 0.25);
        ctx.lineTo(lanX, lanY);
        ctx.stroke();

        const lg = ctx.createRadialGradient(lanX, lanY, 0, lanX, lanY, Math.min(w, h) * (0.09 + audio.vocal * 0.04));
        lg.addColorStop(0, '#FFF8DF');
        lg.addColorStop(0.28, hexRgba('#F5A638', 0.72));
        lg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.arc(lanX, lanY, Math.min(w, h) * 0.13, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      drawMotes(ctx, w, h, {
        count: 44,
        color: '#FFBF5E',
        t: t * spd,
        riseSpeed: 0.024,
        sway: 0.06,
        sizeRange: [2.2, 5.6],
        glow: 0.58 + audio.vocal * 0.42,
        seed: 101,
      });

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SERIF,
        mode: 'cathedral-arch',
        primaryColor: '#FAF3E3',
        sungColor: '#FFD584',
        accentColor: '#D49B42',
      });
    },
  },

  // 2. Sea of Galilee Dawn (Gemini Concept Plate #4 Twin)
  {
    id: 'calm-02-galilee-dawn-waters',
    number: 2,
    category: 'calm-lyric',
    subgenre: 'Scenic Nature',
    name: 'Sea of Galilee Dawn',
    subtitle: 'Mirror-still morning waters, Golan hills, fishing boat silhouette & vocal ripples',
    description: 'Interactive code twin of the Galilee Dawn concept plate: a low golden sun rises behind layered Judean hills and a resting wooden fishing boat while singing voices create concentric caustics across the water.',
    lightingNote: 'Key: Low horizon dawn sun at 3600K reflecting down the water axis.',
    serviceUse: 'Morning services, baptism, peace & trust hymns, opening call to worship.',
    palette: ['#131829', '#3E334E', '#E89B5A', '#FFF2D6'],
    conceptImage: '/sanctuary-plates/calm-galilee-dawn.jpg',
    audioMappings: [
      ['Vocal', 'Expands gentle concentric water rings across the lake'],
      ['Swell', 'Widens the golden sun path reflection on water'],
      ['Bass', 'Slowly rocks the resting Galilee boat & horizon swell'],
    ],
    render(rc) {
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.4, params.motion);
      const horizonY = h * 0.45;

      // Dawn sky gradient
      const skyG = ctx.createLinearGradient(0, 0, 0, horizonY);
      skyG.addColorStop(0, '#0C1121');
      skyG.addColorStop(0.52, '#3A2D4C');
      skyG.addColorStop(0.85, '#9E5A58');
      skyG.addColorStop(1, '#F2A65A');
      ctx.fillStyle = skyG;
      ctx.fillRect(0, 0, w, horizonY + 2);

      // Rising dawn sun disc & corona on horizon
      const sunR = Math.min(w, h) * (0.075 + audio.swell * 0.02);
      const coronaG = ctx.createRadialGradient(w * 0.5, horizonY, sunR * 0.2, w * 0.5, horizonY, sunR * 5.2);
      coronaG.addColorStop(0, '#FFFBE8');
      coronaG.addColorStop(0.18, hexRgba('#FFD285', 0.85));
      coronaG.addColorStop(0.48, hexRgba('#E88548', 0.38));
      coronaG.addColorStop(1, 'rgba(242,158,82,0)');
      ctx.fillStyle = coronaG;
      ctx.fillRect(0, 0, w, h);

      // Two-plane Golan & Judean hills silhouette with morning valley mist
      for (let layer = 0; layer < 2; layer++) {
        ctx.fillStyle = layer === 0 ? '#2B2238' : '#181526';
        ctx.beginPath();
        ctx.moveTo(0, horizonY);
        for (let x = 0; x <= w; x += 18) {
          const hill = Math.sin(x * 0.004 + layer * 1.5) * 0.5 + Math.cos(x * 0.009 + 1.2) * 0.35 + 0.85;
          const centerDip = Math.pow(Math.abs(x / w - 0.5) * 1.65, 1.2);
          ctx.lineTo(x, horizonY - hill * centerDip * h * (layer === 0 ? 0.11 : 0.075));
        }
        ctx.lineTo(w, horizonY);
        ctx.closePath();
        ctx.fill();
      }

      // Lake Kinneret water surface below horizon
      const waterG = ctx.createLinearGradient(0, horizonY, 0, h);
      waterG.addColorStop(0, '#6B434E');
      waterG.addColorStop(0.32, '#28263D');
      waterG.addColorStop(0.75, '#12182B');
      waterG.addColorStop(1, '#070A14');
      ctx.fillStyle = waterG;
      ctx.fillRect(0, horizonY, w, h - horizonY);

      // Shimmering sun reflection ribbons on water
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 44; i++) {
        const p = i / 44;
        const wy = horizonY + Math.pow(p, 1.55) * (h - horizonY);
        const wave = Math.sin(t * 1.5 * spd + i * 0.9) * w * 0.025 * (0.3 + p);
        const rw = w * (0.035 + p * 0.28) * (0.82 + audio.swell * 0.35);
        const rh = Math.max(1.5, p * h * 0.0085);
        ctx.fillStyle = hexRgba('#FFC270', (1 - p * 0.62) * (0.30 + audio.vocal * 0.28));
        ctx.beginPath();
        ctx.ellipse(w * 0.5 + wave, wy, rw * 0.5, rh, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Concentric vocal water ripples
      for (let r = 0; r < 6; r++) {
        const phase = ((t * 0.20 * spd + r / 6) % 1);
        const rx = w * (0.10 + phase * 0.38);
        const ry = rx * 0.20;
        ctx.strokeStyle = hexRgba('#FFE2A8', (1 - phase) * (0.22 + audio.vocal * 0.34));
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(w * 0.5, horizonY + (h - horizonY) * 0.45, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      // Resting wooden Galilee fishing boat silhouette in left-mid water
      const bx = w * 0.20 + Math.sin(t * 0.4 * spd) * w * 0.008;
      const by = horizonY + h * 0.095 + Math.sin(t * 1.1 * spd) * 2.5;
      const bw = w * 0.075;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(Math.sin(t * 0.9 * spd) * 0.03);
      ctx.fillStyle = '#0D0B14';
      ctx.beginPath();
      ctx.moveTo(-bw * 0.55, 0);
      ctx.quadraticCurveTo(0, h * 0.028, bw * 0.55, 0);
      ctx.lineTo(bw * 0.42, h * 0.018);
      ctx.lineTo(-bw * 0.42, h * 0.018);
      ctx.closePath();
      ctx.fill();
      // Mast & furled lateen yardarm
      ctx.strokeStyle = '#0D0B14';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-bw * 0.05, 0);
      ctx.lineTo(-bw * 0.05, -h * 0.075);
      ctx.moveTo(-bw * 0.38, -h * 0.035);
      ctx.lineTo(bw * 0.32, -h * 0.068);
      ctx.stroke();
      ctx.restore();

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.52);
      renderWorshipLyrics(rc, {
        fontFamily: W_SERIF,
        italic: true,
        mode: 'centered-grace',
        primaryColor: '#FFF9EE',
        sungColor: '#FFCC7A',
        accentColor: '#E89B5A',
      });
    },
  },

  // 3. Cathedral Clerestory Sunbeams
  {
    id: 'calm-03-cathedral-clerestory',
    number: 3,
    category: 'calm-lyric',
    subgenre: 'Sacred Architecture',
    name: 'Cathedral Clerestory Sunbeams',
    subtitle: 'Gothic vaulted arcade and five lancet windows casting morning incense shafts',
    description: 'Soaring Gothic stone vaulting and five leaded lancet clerestory windows cast warm 4300K volumetric sunbeams through frankincense haze onto dark limestone.',
    lightingNote: 'Key: High side clerestory windows at 4300K; warm floor bounce.',
    serviceUse: 'Opening hymn, invocation, Eucharist, traditional & modern liturgy.',
    palette: ['#0A0E17', '#1F2633', '#D99B52', '#FFF4DE'],
    conceptImage: '/sanctuary-plates/optical-light-leak-prism-overlay.jpg',
    audioMappings: [
      ['Swell', 'Intensifies the volumetric sunbeam shafts from the 5 lancets'],
      ['Shimmer', 'Illuminates floating frankincense dust motes'],
      ['Vocal', 'Warms the Gothic stone vault ribs and lancet tracery'],
    ],
    render(rc) {
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.4, params.motion);
      drawSanctuaryBg(ctx, w, h, '#070A12', '#121824', '#18141A', params.warmth);
      drawAshlarMasonry(ctx, w, h, '#7888A0', 0.11);

      // 3D Cathedral Vaulted Arcade framing the nave
      drawCathedralArcade(ctx, w, h, {
        bays: 4,
        pointed: true,
        stoneColor: '#1E2636',
        highlightColor: '#D99B52',
        t,
        vocalEnergy: audio.vocal,
        swellEnergy: audio.swell,
      });

      // Five Gothic Clerestory Lancet Windows with stone mullions & stained glass
      for (let i = 0; i < 5; i++) {
        const wx = w * (0.22 + i * 0.14);
        const wy = h * 0.13;
        const ww = w * 0.048;
        const wh = h * 0.22;
        const lg = ctx.createLinearGradient(wx, wy - wh * 0.3, wx, wy + wh);
        lg.addColorStop(0, hexRgba('#FFF6DC', 0.72 + audio.vocal * 0.25));
        lg.addColorStop(0.5, hexRgba('#E8A64E', 0.48 + audio.swell * 0.3));
        lg.addColorStop(1, hexRgba('#38629E', 0.28));
        ctx.fillStyle = lg;
        ctx.strokeStyle = hexRgba('#FFE3B0', 0.65);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(wx - ww / 2, wy + wh);
        ctx.lineTo(wx - ww / 2, wy);
        ctx.quadraticCurveTo(wx, wy - wh * 0.42, wx + ww / 2, wy);
        ctx.lineTo(wx + ww / 2, wy + wh);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Central stone mullion + upper rose oculus inside each lancet
        ctx.beginPath();
        ctx.moveTo(wx, wy - wh * 0.15);
        ctx.lineTo(wx, wy + wh);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(wx, wy - wh * 0.08, ww * 0.18, 0, Math.PI * 2);
        ctx.stroke();
      }

      drawGodRays(ctx, w, h, {
        originX: w * 0.24,
        originY: h * 0.04,
        angle: Math.PI * 0.34,
        spread: 0.48,
        count: 8,
        color: '#FFCA7A',
        intensity: 0.38 + audio.swell * 0.34,
        t: t * spd,
      });

      drawMotes(ctx, w, h, {
        count: 52,
        color: '#FFE3B3',
        t: t * spd * 0.7,
        riseSpeed: 0.018,
        sway: 0.04,
        sizeRange: [1.5, 4.2],
        glow: 0.55 + audio.shimmer * 0.4,
        seed: 303,
      });

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.52);
      renderWorshipLyrics(rc, {
        fontFamily: W_SERIF,
        mode: 'cathedral-arch',
        primaryColor: '#FAF5EC',
        sungColor: '#FFD68A',
        accentColor: '#D99B52',
      });
    },
  },

  // 4. Candlelit Vigil Sanctuary
  {
    id: 'calm-04-candlelit-vigil',
    number: 4,
    category: 'calm-lyric',
    subgenre: 'Contemplative Light',
    name: 'Candlelit Vigil Sanctuary',
    subtitle: 'Wrought-iron votive candelabrum, flickering beeswax pillars, and warm bokeh',
    description: 'Fifteen tiered beeswax sanctuary candles on a wrought-iron votive rack cast warm, breathing 2700K Caravaggio light and multi-plane golden bokeh orbs.',
    lightingNote: 'Key: 2700K beeswax candlelight along the lower third; deep umber upper sanctuary.',
    serviceUse: 'Evening prayer, Advent, Christmas Eve, Taizé, quiet response.',
    palette: ['#0B0706', '#26140D', '#E88B2E', '#FFF0C9'],
    conceptImage: '/sanctuary-plates/calm-contemporary-bokeh-leaks.jpg',
    audioMappings: [
      ['Vocal', 'Gently sways candle flame tips and warms bokeh rings'],
      ['Swell', 'Expands warm 2700K amber radiance upward'],
      ['Bass', 'Softly pulses out-of-focus background votive orbs'],
    ],
    render(rc) {
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.4, params.motion);
      drawSanctuaryBg(ctx, w, h, '#070506', '#1C0E08', '#331A0E', params.warmth);

      // 1. Out-of-focus background votive bokeh circles
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 26; i++) {
        const h1 = hash11(i * 19.3 + 4);
        const h2 = hash11(i * 37.1 + 9);
        const x = (h1 * 0.92 + 0.04 + Math.sin(t * 0.35 * spd + i) * 0.012) * w;
        const y = (0.54 + h2 * 0.40) * h;
        const rad = (0.022 + hash11(i * 7.7) * 0.05) * Math.min(w, h) * (1 + audio.swell * 0.2);
        const alpha = (0.14 + 0.14 * Math.sin(t * 1.4 * spd + i * 2.1)) * (0.75 + audio.vocal * 0.45);

        const g = ctx.createRadialGradient(x, y, rad * 0.1, x, y, rad);
        g.addColorStop(0, hexRgba('#FFF0C2', alpha * 0.9));
        g.addColorStop(0.68, hexRgba('#F08C2B', alpha * 0.55));
        g.addColorStop(1, 'rgba(240,140,43,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // 2. Wrought-iron sanctuary votive stand & 15 beeswax pillar candles
      const candleCount = 15;
      for (let c = 0; c < candleCount; c++) {
        const cx = w * (0.06 + (c / (candleCount - 1)) * 0.88);
        const tier = c % 2;
        const pillarH = h * (0.08 + hash11(c * 5.1) * 0.06 + tier * 0.03);
        const pillarW = w * 0.018;
        const baseY = h - pillarH;

        // Beeswax pillar body with subsurface warm glow at top
        const waxG = ctx.createLinearGradient(cx, baseY, cx, h);
        waxG.addColorStop(0, '#FFE3A8');
        waxG.addColorStop(0.28, '#9E5822');
        waxG.addColorStop(1, '#1C0D06');
        ctx.fillStyle = waxG;
        ctx.fillRect(cx - pillarW / 2, baseY, pillarW, pillarH);

        // Wick
        ctx.strokeStyle = '#1A0E08';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx, baseY);
        ctx.lineTo(cx, baseY - 4);
        ctx.stroke();

        // Multi-zone realistic flame (amber halo, white heart, blue base)
        const tilt = Math.sin(t * 2.3 * spd + c * 1.4) * w * 0.0045 * (1 + audio.vocal);
        const fh = h * (0.034 + audio.swell * 0.012);
        const fy = baseY - 3;

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const halo = ctx.createRadialGradient(cx, fy - fh * 0.5, 0, cx, fy - fh * 0.5, fh * 2.9);
        halo.addColorStop(0, hexRgba('#FFE8A3', 0.52));
        halo.addColorStop(0.45, hexRgba('#E87D20', 0.24));
        halo.addColorStop(1, 'rgba(255,150,40,0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(cx, fy - fh * 0.5, fh * 2.9, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFF9E2';
        ctx.beginPath();
        ctx.moveTo(cx - fh * 0.18, fy);
        ctx.quadraticCurveTo(cx - fh * 0.24, fy - fh * 0.58, cx + tilt, fy - fh);
        ctx.quadraticCurveTo(cx + fh * 0.24, fy - fh * 0.58, cx + fh * 0.18, fy);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.42);
      renderWorshipLyrics(rc, {
        fontFamily: W_SERIF,
        italic: true,
        yRatio: 0.42,
        mode: 'centered-grace',
        primaryColor: '#FFF7E8',
        sungColor: '#FFC966',
        accentColor: '#E88B2E',
      });
    },
  },

  // 5. Blue Ridge Morning Mist
  {
    id: 'calm-05-mountain-morning-mist',
    number: 5,
    category: 'calm-lyric',
    subgenre: 'Scenic Nature',
    name: 'Blue Ridge Morning Mist',
    subtitle: 'Seven layered alpine ridges, summit sunbeams, and drifting valley cloud sea',
    description: 'Seven layered mountain ridges fade into atmospheric blue-gold perspective with alpine sunbeams and drifting valley fog.',
    lightingNote: 'Key: Early alpine sunrise at 5000K over blue-slate ridges.',
    serviceUse: 'Creation hymns, Psalms of ascent, faithfulness & majesty songs.',
    palette: ['#0E1726', '#28415C', '#7C98B3', '#F5D39E'],
    audioMappings: [
      ['Harmonic', 'Illuminates valley mist ribbons between mountain ridges'],
      ['Swell', 'Raises golden dawn sunbeams behind the highest summit'],
      ['Vocal', 'Softly shimmers high-altitude cloud wisps'],
    ],
    render(rc) {
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.4, params.motion);
      drawSanctuaryBg(ctx, w, h, '#09111E', '#243B57', '#E5B882', params.warmth);

      // Alpine sunrise rays cresting the distant central summit
      drawGodRays(ctx, w, h, {
        originX: w * 0.52,
        originY: h * 0.36,
        angle: -Math.PI * 0.5,
        spread: 1.2,
        count: 7,
        color: '#FFE0A3',
        intensity: 0.28 + audio.swell * 0.26,
        t: t * spd,
      });

      const colors = ['#6C86A1', '#546E8A', '#3E5773', '#2B425C', '#1D2F45', '#121E2E', '#09111B'];
      for (let layer = 0; layer < 7; layer++) {
        const baseY = h * (0.38 + layer * 0.088);
        const mistG = ctx.createLinearGradient(0, baseY - h * 0.075, 0, baseY + h * 0.045);
        mistG.addColorStop(0, 'rgba(255,235,205,0)');
        mistG.addColorStop(0.5, hexRgba('#FCE3B8', (0.20 - layer * 0.022) * (1 + audio.harmonic * 0.65)));
        mistG.addColorStop(1, 'rgba(255,235,205,0)');
        ctx.fillStyle = mistG;
        ctx.fillRect(0, baseY - h * 0.075, w, h * 0.12);

        ctx.fillStyle = colors[layer];
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 16) {
          const drift = t * 0.012 * spd * (layer + 1);
          const elev = fbm2D(x * 0.0022 + layer * 3.7 + drift, layer * 1.9, 3);
          const ridgeY = baseY - (elev - 0.35) * h * (0.19 - layer * 0.015);
          ctx.lineTo(x, ridgeY);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
      }

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.45);
      renderWorshipLyrics(rc, {
        fontFamily: W_SANS,
        fontWeight: 400,
        mode: 'minimal-editorial',
        yRatio: 0.45,
        primaryColor: '#F7FAFC',
        sungColor: '#FFE0A3',
        accentColor: '#9CC0E0',
      });
    },
  },

  // 6. Stained Glass Rose Caustics
  {
    id: 'calm-06-rose-window-caustics',
    number: 6,
    category: 'calm-lyric',
    subgenre: 'Sacred Architecture',
    name: 'Stained Glass Rose Caustics',
    subtitle: 'Twelve-petal Gothic rose window with quatrefoil cusps and jewel caustics',
    description: 'A twelve-petal Gothic cathedral rose window with pointed lancets, quatrefoil medallions, and leaded stone tracery casts jewel-toned caustics.',
    lightingNote: 'Key: Sunlight filtered through antique ruby, cobalt, emerald, and gold glass.',
    serviceUse: 'Liturgical worship, Doxology, Trinity Sunday, sacred choral pieces.',
    palette: ['#0A0B14', '#1E3A7A', '#A8243B', '#E8A838'],
    audioMappings: [
      ['Harmonic', 'Blends ruby, sapphire, emerald, and gold caustic petals'],
      ['Swell', 'Expands the radial rose aperture and caustic throw'],
      ['Vocal', 'Brightens leaded glass rim highlights & central rosette'],
    ],
    render(rc) {
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.4, params.motion);
      drawSanctuaryBg(ctx, w, h, '#070811', '#0F1428', '#080912', params.warmth);
      drawAshlarMasonry(ctx, w, h, '#3B4E7A', 0.09);

      drawGothicRoseWindow(ctx, w * 0.5, h * 0.5, Math.min(w, h) * 0.44, {
        petals: 12,
        t: t * spd,
        palette: ['#D9384A', '#2B5CE6', '#E8A838', '#1D9A78'],
        leadColor: '#F5C878',
        vocalEnergy: audio.vocal,
        swellEnergy: audio.swell,
        pulseEnergy: audio.pulse,
        causticThrow: true,
      });

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SERIF,
        mode: 'cathedral-arch',
        primaryColor: '#FAF6F0',
        sungColor: '#FFD880',
        accentColor: '#E8A838',
      });
    },
  },

  // 7. Celestial Silk Veil
  {
    id: 'calm-07-celestial-silk-veil',
    number: 7,
    category: 'calm-lyric',
    subgenre: 'Contemporary Abstract',
    name: 'Celestial Silk Veil',
    subtitle: 'Flowing gossamer ribbons of champagne gold and amethyst silk with golden threads',
    description: 'Translucent fabric veils of warm champagne and deep sanctuary violet billow in slow zero-gravity currents with spun-gold selvedge threads.',
    lightingNote: 'Key: Rim-lit gossamer silk at 4000K over deep aubergine void.',
    serviceUse: 'Contemporary worship ballads, Holy Spirit invocation, altar ministry.',
    palette: ['#0B0814', '#2A1B3D', '#C9965B', '#FAF0E4'],
    audioMappings: [
      ['Vocal', 'Lifts silk ribbon crests with breath-like undulation'],
      ['Swell', 'Increases champagne-gold rim translucency'],
      ['Bass', 'Slows and deepens the lower fold wave wavelength'],
    ],
    render(rc) {
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.4, params.motion);
      drawSanctuaryBg(ctx, w, h, '#090712', '#1E1230', '#0A0812', params.warmth);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const ribbons = 7;
      for (let r = 0; r < ribbons; r++) {
        const yBase = h * (0.18 + r * 0.105);
        const col = r % 2 === 0 ? '#E5B06B' : '#8C52FF';
        ctx.beginPath();
        for (let x = 0; x <= w; x += 14) {
          const nx = x / w;
          const wave =
            Math.sin(nx * 4.2 + t * 0.55 * spd + r * 0.9) * h * (0.075 + audio.vocal * 0.05) +
            Math.cos(nx * 2.3 - t * 0.35 * spd + r) * h * 0.04;
          const y = yBase + wave;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        for (let x = w; x >= 0; x -= 14) {
          const nx = x / w;
          const wave =
            Math.sin(nx * 4.2 + t * 0.55 * spd + r * 0.9 + 0.45) * h * (0.095 + audio.swell * 0.05) +
            Math.cos(nx * 2.3 - t * 0.35 * spd + r) * h * 0.04;
          ctx.lineTo(x, yBase + h * 0.075 + wave);
        }
        ctx.closePath();
        const g = ctx.createLinearGradient(0, yBase - h * 0.1, w, yBase + h * 0.1);
        g.addColorStop(0, hexRgba(col, 0.03));
        g.addColorStop(0.5, hexRgba(col, 0.22 + audio.swell * 0.16));
        g.addColorStop(1, hexRgba(col, 0.03));
        ctx.fillStyle = g;
        ctx.fill();

        // Spun-gold selvedge thread along upper crest
        ctx.strokeStyle = hexRgba('#FFE3A8', 0.28 + audio.vocal * 0.25);
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
      ctx.restore();

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SANS,
        fontWeight: 300,
        mode: 'word-sweep',
        primaryColor: '#FAF5FF',
        sungColor: '#FFDCA1',
        accentColor: '#C9965B',
      });
    },
  },

  // 8. Desert Starlight Canopy (Sinai Night)
  {
    id: 'calm-08-desert-starlight-canopy',
    number: 8,
    category: 'calm-lyric',
    subgenre: 'Scenic Nature',
    name: 'Desert Starlight Canopy',
    subtitle: 'Judean desert night sky, sacred constellations, and warm campfire dunes',
    description: 'A vast desert night beneath an arching Milky Way nebula, constellation geometry, and wind-sculpted sand dunes touched by warm covenant campfire light.',
    lightingNote: 'Key: Starlight 6000K above + 3000K distant campfire horizon.',
    serviceUse: 'Covenant promises, Abraham/Moses themes, evening worship, Advent.',
    palette: ['#060A14', '#162540', '#C48348', '#F5EFE6'],
    audioMappings: [
      ['Shimmer', 'Modulates starlight scintillation & constellation lines overhead'],
      ['Swell', 'Brightens the Milky Way nebula band'],
      ['Vocal', 'Warms the desert campfire glow & dune crest highlights'],
    ],
    render(rc) {
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.4, params.motion);
      drawSanctuaryBg(ctx, w, h, '#050812', '#101D36', '#241B19', params.warmth);

      // Milky Way diagonal nebula band
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.translate(w * 0.5, h * 0.30);
      ctx.rotate(-0.26);
      const mwG = ctx.createRadialGradient(0, 0, 10, 0, 0, w * 0.58);
      mwG.addColorStop(0, hexRgba('#93B5F2', 0.28 + audio.swell * 0.18));
      mwG.addColorStop(0.48, hexRgba('#D99E6A', 0.12));
      mwG.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = mwG;
      ctx.fillRect(-w, -h * 0.28, w * 2, h * 0.56);
      ctx.restore();

      // Stars & subtle sacred constellation lines
      const starPts: Array<[number, number]> = [];
      for (let s = 0; s < 72; s++) {
        const sx = hash11(s * 17.1) * w;
        const sy = hash11(s * 31.7) * h * 0.66;
        if (s < 12) starPts.push([sx, sy]);
        const sr = (0.9 + hash11(s * 9.3) * 1.9) * (Math.min(w, h) / 720);
        const tw = 0.45 + 0.55 * Math.sin(t * (0.8 + hash11(s) * 1.2) * spd + s);
        ctx.fillStyle = hexRgba('#FFF6E5', tw * (0.5 + audio.shimmer * 0.45));
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = hexRgba('#93B5F2', 0.14 + audio.shimmer * 0.12);
      ctx.lineWidth = 0.8;
      for (let i = 0; i < starPts.length - 1; i += 2) {
        ctx.beginPath();
        ctx.moveTo(starPts[i][0], starPts[i][1]);
        ctx.lineTo(starPts[i + 1][0], starPts[i + 1][1]);
        ctx.stroke();
      }

      // Warm covenant campfire glow on right dune horizon
      const cg = ctx.createRadialGradient(w * 0.78, h * 0.76, 0, w * 0.78, h * 0.76, w * 0.32);
      cg.addColorStop(0, hexRgba('#FFB454', 0.45 + audio.vocal * 0.3));
      cg.addColorStop(0.5, hexRgba('#C46328', 0.16));
      cg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = cg;
      ctx.fillRect(0, 0, w, h);

      // Sweeping desert dunes with backlit gold rim edges
      for (let d = 0; d < 3; d++) {
        const dy = h * (0.72 + d * 0.085);
        ctx.fillStyle = d === 0 ? '#2E211C' : d === 1 ? '#1E1514' : '#120C0E';
        ctx.strokeStyle = hexRgba('#E8A458', (0.35 - d * 0.08) * (0.8 + audio.vocal * 0.4));
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 20) {
          const curve = Math.sin(x * 0.0028 + d * 1.8 + t * 0.03 * spd) * h * 0.045;
          ctx.lineTo(x, dy + curve);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.46);
      renderWorshipLyrics(rc, {
        fontFamily: W_SERIF,
        mode: 'centered-grace',
        yRatio: 0.46,
        primaryColor: '#F5EFE6',
        sungColor: '#FFD294',
        accentColor: '#C48348',
      });
    },
  },

  // 9. Living Water Caustics
  {
    id: 'calm-09-living-water-caustics',
    number: 9,
    category: 'calm-lyric',
    subgenre: 'Contemporary Abstract',
    name: 'Living Water Caustics',
    subtitle: 'Dual-layer crystal spring water refraction mesh in emerald teal and sunlit gold',
    description: 'Organic cellular water caustics and interconnected refraction filaments ripple smoothly across a deep emerald-teal pool with golden sunlight.',
    lightingNote: 'Key: Overhead sunlight refracting through shallow clear water.',
    serviceUse: 'Baptism services, Woman at the Well, renewal & grace songs.',
    palette: ['#06171E', '#0F3B47', '#2FA89B', '#FFE39E'],
    audioMappings: [
      ['Vocal', 'Modulates caustic cell ripple focus and golden highlights'],
      ['Swell', 'Brightens subsurface emerald-teal scatter'],
      ['Bass', 'Gently undulates the water refraction grid'],
    ],
    render(rc) {
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.4, params.motion);
      drawSanctuaryBg(ctx, w, h, '#041218', '#0D3340', '#061B24', params.warmth);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const cols = 10, rows = 6;
      const cw = w / cols, ch = h / rows;
      const nodes: Array<[number, number]> = [];
      for (let iy = 0; iy <= rows; iy++) {
        for (let ix = 0; ix <= cols; ix++) {
          const ox = (ix + 0.45 * Math.sin(t * 0.65 * spd + iy * 1.3 + ix * 0.7)) * cw;
          const oy = (iy + 0.45 * Math.cos(t * 0.55 * spd + ix * 1.1 - iy * 0.8)) * ch;
          nodes.push([ox, oy]);
          const rad = Math.min(cw, ch) * (0.92 + audio.swell * 0.35);
          const g = ctx.createRadialGradient(ox, oy, rad * 0.15, ox, oy, rad);
          g.addColorStop(0, hexRgba('#2FA89B', 0.04));
          g.addColorStop(0.68, hexRgba('#7CE8D8', 0.16 + audio.vocal * 0.15));
          g.addColorStop(0.88, hexRgba('#FFE39E', 0.10 + audio.shimmer * 0.12));
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(ox, oy, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Caustic refraction web connecting neighboring nodes
      ctx.strokeStyle = hexRgba('#9EF5E8', 0.14 + audio.vocal * 0.14);
      ctx.lineWidth = 1.1;
      for (let i = 0; i < nodes.length - 1; i++) {
        if ((i + 1) % (cols + 1) !== 0) {
          ctx.beginPath();
          ctx.moveTo(nodes[i][0], nodes[i][1]);
          ctx.lineTo(nodes[i + 1][0], nodes[i + 1][1]);
          ctx.stroke();
        }
      }
      ctx.restore();

      drawMotes(ctx, w, h, {
        count: 36,
        color: '#9EF5E8',
        t: t * spd,
        riseSpeed: 0.025,
        sway: 0.05,
        sizeRange: [1.8, 4.5],
        glow: 0.5 + audio.shimmer * 0.35,
        seed: 909,
      });

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SANS,
        fontWeight: 400,
        mode: 'word-sweep',
        primaryColor: '#F2FCFC',
        sungColor: '#FFE39E',
        accentColor: '#4FD1C5',
      });
    },
  },

  // 10. Frankincense & Gold Dust
  {
    id: 'calm-10-frankincense-gold-dust',
    number: 10,
    category: 'calm-lyric',
    subgenre: 'Contemplative Light',
    name: 'Frankincense & Gold Dust',
    subtitle: 'Swinging brass thurible censer, aromatic smoke plumes, and diagonal altar beam',
    description: 'An ornate brass thurible censer swings gently in the upper sanctuary while silky curls of liturgical incense rise through a diagonal shaft of warm amber altar light.',
    lightingNote: 'Key: Single diagonal 3400K altar spot cutting through dark nave.',
    serviceUse: 'Prayer, intercession, Sanctus, contemplative worship.',
    palette: ['#09080C', '#241B18', '#D49448', '#FFF2DC'],
    audioMappings: [
      ['Swell', 'Widens the ascending incense smoke curl & altar beam'],
      ['Vocal', 'Brightens the swinging brass thurible censer & smoke scattering'],
      ['Shimmer', 'Drifts fine suspended gold dust motes'],
    ],
    render(rc) {
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.4, params.motion);
      drawSanctuaryBg(ctx, w, h, '#08070B', '#1A1312', '#0B090D', params.warmth);

      // Diagonal altar beam
      drawGodRays(ctx, w, h, {
        originX: w * 0.78,
        originY: -h * 0.06,
        angle: Math.PI * 0.68,
        spread: 0.32,
        count: 6,
        color: '#E8A44E',
        intensity: 0.38 + audio.swell * 0.30,
        t: t * spd,
      });

      // Ornate swinging brass & ruby thurible censer on right third
      const censerX = w * 0.78 + Math.sin(t * 0.85 * spd) * w * 0.025;
      const censerY = h * 0.24;
      drawSanctuaryCenserLamp(ctx, censerX, censerY, Math.min(w, h) * 0.052, {
        t: t * spd,
        brassColor: '#E5AE52',
        rubyColor: '#D94838',
        vocalEnergy: audio.vocal,
        swellEnergy: audio.swell,
        emitSmoke: true,
      });

      // Rising incense curls across the lower-to-mid sanctuary
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let p = 0; p < 22; p++) {
        const prog = ((t * 0.045 * spd + p / 22) % 1);
        const y = h * (1.05 - prog * 1.1);
        const sway = Math.sin(prog * 5.5 - t * 0.5 * spd + p * 0.6) * w * (0.04 + prog * 0.14);
        const x = w * 0.5 + sway;
        const r = Math.min(w, h) * (0.06 + prog * 0.18) * (1 + audio.vocal * 0.25);
        const alpha = Math.sin(prog * Math.PI) * (0.12 + audio.swell * 0.09);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, hexRgba('#FFD399', alpha));
        g.addColorStop(0.5, hexRgba('#9E7B66', alpha * 0.6));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      drawMotes(ctx, w, h, {
        count: 46,
        color: '#FFD285',
        t: t * spd,
        riseSpeed: 0.022,
        sway: 0.05,
        sizeRange: [1.5, 4.0],
        glow: 0.58 + audio.shimmer * 0.4,
        seed: 1010,
      });

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SERIF,
        italic: true,
        mode: 'cathedral-arch',
        primaryColor: '#FFF6E8',
        sungColor: '#FFD180',
        accentColor: '#D49448',
      });
    },
  },

  // 11. Harvest Wheatfield Sunset
  {
    id: 'calm-11-harvest-wheat-sunset',
    number: 11,
    category: 'calm-lyric',
    subgenre: 'Scenic Nature',
    name: 'Harvest Wheatfield Sunset',
    subtitle: 'Multi-plane bearded golden wheat stalks swaying beneath a warm amber-rose sun',
    description: 'Backlit bearded wheat stalks with delicate awns sway in two depth planes against a glowing harvest sunset, responding smoothly to acoustic guitars and vocals.',
    lightingNote: 'Key: Golden hour 3300K sunset low on the horizon; warm rim light on grain.',
    serviceUse: 'Thanksgiving, stewardship, communion (Bread of Life), acoustic sets.',
    palette: ['#1C1018', '#5E2B38', '#E08E45', '#FFEAB3'],
    audioMappings: [
      ['Swell', 'Sways backlit golden wheat stalks in unison'],
      ['Vocal', 'Blooms warm sunset rim-light across the horizon'],
      ['Shimmer', 'Releases floating golden pollen motes'],
    ],
    render(rc) {
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.4, params.motion);
      drawSanctuaryBg(ctx, w, h, '#170E19', '#522635', '#D9853B', params.warmth);

      // Low golden harvest sun disc & horizon glow
      const sg = ctx.createRadialGradient(w * 0.5, h * 0.78, 0, w * 0.5, h * 0.78, w * 0.55);
      sg.addColorStop(0, hexRgba('#FFF4C8', 0.75 + audio.swell * 0.22));
      sg.addColorStop(0.42, hexRgba('#E07A35', 0.36));
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, w, h);

      // Swaying bearded wheat stalks along bottom 30%
      ctx.save();
      const stalkCount = 68;
      for (let i = 0; i < stalkCount; i++) {
        const bx = (i / (stalkCount - 1)) * w;
        const sh = h * (0.16 + hash11(i * 11.3) * 0.15);
        const breeze = Math.sin(t * 1.1 * spd + i * 0.22) * w * 0.018 * (1 + audio.swell * 0.6);
        const tx = bx + breeze;
        const ty = h - sh;
        const isGold = i % 2 === 0;

        ctx.strokeStyle = isGold ? hexRgba('#FFD984', 0.62) : 'rgba(28, 14, 11, 0.85)';
        ctx.lineWidth = Math.max(1.2, w * 0.0018);
        ctx.beginPath();
        ctx.moveTo(bx, h);
        ctx.quadraticCurveTo(bx + breeze * 0.4, h - sh * 0.5, tx, ty);
        ctx.stroke();

        // Segmented wheat head kernels + delicate awns (whiskers)
        const tilt = breeze / (w * 0.04);
        ctx.save();
        ctx.translate(tx, ty);
        ctx.rotate(tilt);
        ctx.fillStyle = isGold ? hexRgba('#FFE39E', 0.75 + audio.vocal * 0.25) : '#26130E';
        for (let k = 0; k < 5; k++) {
          const ky = -k * h * 0.0065;
          ctx.beginPath();
          ctx.ellipse(-2, ky, w * 0.0028, h * 0.0045, -0.3, 0, Math.PI * 2);
          ctx.ellipse(2, ky, w * 0.0028, h * 0.0045, 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.restore();

      drawMotes(ctx, w, h, {
        count: 38,
        color: '#FFE8A3',
        t: t * spd,
        riseSpeed: 0.015,
        sway: 0.05,
        sizeRange: [1.5, 3.8],
        glow: 0.55 + audio.shimmer * 0.4,
        seed: 1111,
      });

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.44);
      renderWorshipLyrics(rc, {
        fontFamily: W_SERIF,
        yRatio: 0.44,
        mode: 'centered-grace',
        primaryColor: '#FFF9EC',
        sungColor: '#FFD479',
        accentColor: '#E08E45',
      });
    },
  },

  // 12. Alabaster & Gold Leaf Kintsugi
  {
    id: 'calm-12-alabaster-gold-kintsugi',
    number: 12,
    category: 'calm-lyric',
    subgenre: 'Contemporary Abstract',
    name: 'Alabaster & Gold Kintsugi',
    subtitle: 'Dark charcoal-alabaster stone slabs repaired with molten 24k gold-leaf veins',
    description: 'Inspired by Japanese Kintsugi ("golden repair") and brokenness made whole: tectonic dark stone slabs glow with branching molten gold seams and lacquer nodes.',
    lightingNote: 'Key: Grazing side light across matte stone + emissive 3500K gold veins.',
    serviceUse: 'Grace, redemption, healing, confession & assurance of pardon.',
    palette: ['#0E0E12', '#232229', '#D4AF37', '#FFF5D6'],
    conceptImage: '/sanctuary-plates/scripture-kintsugi-mineral-gold.jpg',
    audioMappings: [
      ['Vocal', 'Pulses liquid 24k gold luminescence along the Kintsugi fracture network'],
      ['Swell', 'Spreads warm golden halation out from the branching stone seams'],
      ['Harmonic', 'Illuminates golden lacquer repair nodes'],
    ],
    render(rc) {
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.4, params.motion);
      drawSanctuaryBg(ctx, w, h, '#0A0B0F', '#1A1922', '#0E0D13', params.warmth);

      // Authentic multi-branching Kintsugi fracture network with bevel shadows & gold nodes
      drawKintsugiFractureNetwork(ctx, w, h, {
        t: t * spd,
        goldColor: '#F5C85C',
        glowColor: '#FF9E3B',
        vocalEnergy: audio.vocal,
        swellEnergy: audio.swell,
        seed: 12,
      });

      drawMotes(ctx, w, h, {
        count: 32,
        color: '#FFE082',
        t: t * spd * 0.6,
        riseSpeed: 0.014,
        sway: 0.03,
        sizeRange: [1.4, 3.6],
        glow: 0.5 + audio.vocal * 0.4,
        seed: 1212,
      });

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SERIF,
        mode: 'cathedral-arch',
        primaryColor: '#FAF7F0',
        sungColor: '#FFE08C',
        accentColor: '#D4AF37',
      });
    },
  },

  // 13. Northern Lights Covenant Sky
  {
    id: 'calm-13-aurora-covenant-sky',
    number: 13,
    category: 'calm-lyric',
    subgenre: 'Scenic Nature',
    name: 'Aurora Covenant Sky',
    subtitle: 'Emerald and sapphire magnetic auroral curtains over alpine lake & spruce pines',
    description: 'Tall northern evergreens and a mirror-still alpine lake reflect sweeping magnetic curtains of emerald, teal, and violet-gold aurora borealis.',
    lightingNote: 'Key: Celestial auroral curtains in emerald/teal over dark forest horizon.',
    serviceUse: 'Majesty of creation, Christmas/Epiphany, awe & wonder songs.',
    palette: ['#050C14', '#0F2E3D', '#2CE0A3', '#D4F7EC'],
    audioMappings: [
      ['Harmonic', 'Ripples vertical auroral light curtains across the sky'],
      ['Vocal', 'Adds violet-gold corona to the aurora top edge'],
      ['Swell', 'Brightens the emerald aurora reflection in the alpine lake'],
    ],
    render(rc) {
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.4, params.motion);
      drawSanctuaryBg(ctx, w, h, '#040912', '#0A2233', '#06141E', params.warmth);

      // Vertical magnetic-field auroral curtains
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let c = 0; c < 3; c++) {
        const baseY = h * (0.20 + c * 0.11);
        for (let x = 0; x < w; x += 12) {
          const nx = x / w;
          const wave =
            Math.sin(nx * 5.2 + t * 0.48 * spd + c * 1.7) * h * 0.065 +
            Math.cos(nx * 9.0 - t * 0.32 * spd) * h * 0.025;
          const curtainH = h * (0.20 + 0.09 * Math.sin(nx * 8 + t * 0.6 + c)) * (0.85 + audio.harmonic * 0.45);
          const g = ctx.createLinearGradient(x, baseY + wave - curtainH, x, baseY + wave + h * 0.05);
          g.addColorStop(0, 'rgba(168, 85, 247, 0)');
          g.addColorStop(0.25, hexRgba('#A855F7', 0.08 + audio.vocal * 0.08));
          g.addColorStop(0.55, hexRgba(c === 1 ? '#38B2AC' : '#2CE0A3', 0.14 + audio.vocal * 0.10));
          g.addColorStop(0.88, hexRgba('#2CE0A3', 0.22 + audio.swell * 0.14));
          g.addColorStop(1, 'rgba(44, 224, 163, 0)');
          ctx.fillStyle = g;
          ctx.fillRect(x, baseY + wave - curtainH, 14, curtainH + h * 0.05);
        }
      }
      ctx.restore();

      // Detailed multi-tiered spruce pine forest horizon at y = 0.84h
      const horizonY = h * 0.85;
      ctx.fillStyle = '#04080E';
      ctx.fillRect(0, horizonY, w, h - horizonY);
      for (let i = 0; i <= 46; i++) {
        const px = (i / 46) * w;
        const treeH = h * (0.07 + hash11(i * 7.9) * 0.09);
        const tw = w * 0.015;
        ctx.fillStyle = i % 2 === 0 ? '#040910' : '#07111C';
        for (let tier = 0; tier < 3; tier++) {
          const ty = horizonY - treeH * (0.35 + tier * 0.25);
          const span = tw * (1.2 - tier * 0.28);
          ctx.beginPath();
          ctx.moveTo(px, ty - treeH * 0.35);
          ctx.lineTo(px - span, ty);
          ctx.lineTo(px + span, ty);
          ctx.closePath();
          ctx.fill();
        }
      }

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.48);
      renderWorshipLyrics(rc, {
        fontFamily: W_SANS,
        fontWeight: 300,
        yRatio: 0.48,
        mode: 'word-sweep',
        primaryColor: '#F0FDF9',
        sungColor: '#8CF7D2',
        accentColor: '#2CE0A3',
      });
    },
  },

  // 14. Jordan River Reed Bank
  {
    id: 'calm-14-jordan-river-reeds',
    number: 14,
    category: 'calm-lyric',
    subgenre: 'Scenic Nature',
    name: 'Jordan River Reed Bank',
    subtitle: 'Sunlit river current, swaying cattail reeds, and warm afternoon glints',
    description: 'Peaceful river waters flow past slender riverside reeds and cattail plumes in warm afternoon light, evoking baptismal renewal and quiet rest.',
    lightingNote: 'Key: Warm 4200K afternoon sun skimming across flowing river water.',
    serviceUse: 'Baptism, renewal, Psalm 23 ("beside still waters"), surrender songs.',
    palette: ['#09171B', '#1E444A', '#C99758', '#FAF3E6'],
    audioMappings: [
      ['Swell', 'Bends slender riverside reeds and cattails in a gentle breeze'],
      ['Vocal', 'Highlights sparkling golden river current glints'],
      ['Bass', 'Deepens the emerald-slate water current'],
    ],
    render(rc) {
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.4, params.motion);
      drawSanctuaryBg(ctx, w, h, '#0B191E', '#1E434A', '#0E2226', params.warmth);

      // Flowing horizontal water ribbons
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 28; i++) {
        const y = h * (0.32 + (i / 28) * 0.65);
        const xOff = ((t * 28 * spd * (0.4 + (i % 5) * 0.15) + i * 97) % (w * 1.3)) - w * 0.15;
        const rw = w * (0.14 + (i % 3) * 0.08);
        ctx.fillStyle = hexRgba(i % 2 === 0 ? '#E8B574' : '#5CD6C8', 0.12 + audio.vocal * 0.15);
        ctx.beginPath();
        ctx.ellipse(xOff, y, rw, Math.max(1.5, h * 0.0045), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Reeds & cattail plumes on left and right banks
      ctx.save();
      for (let r = 0; r < 32; r++) {
        const isLeft = r < 16;
        const idx = r % 16;
        const bx = isLeft ? w * (0.015 + idx * 0.017) : w * (0.985 - idx * 0.017);
        const rh = h * (0.28 + hash11(r * 13) * 0.26);
        const sway = Math.sin(t * 0.9 * spd + r) * w * 0.016 * (1 + audio.swell * 0.5);
        const tx = bx + sway;
        const ty = h - rh;

        ctx.strokeStyle = r % 3 === 0 ? hexRgba('#D9A560', 0.58) : 'rgba(6, 15, 17, 0.88)';
        ctx.lineWidth = Math.max(1.5, w * 0.0022);
        ctx.beginPath();
        ctx.moveTo(bx, h);
        ctx.quadraticCurveTo(bx + sway * 0.4, h - rh * 0.5, tx, ty);
        ctx.stroke();

        // Cattail cylinder head on alternating reeds
        if (r % 2 === 0) {
          ctx.fillStyle = r % 4 === 0 ? '#4A2C18' : '#C99758';
          ctx.beginPath();
          ctx.ellipse(tx, ty + h * 0.02, w * 0.0035, h * 0.022, sway / (w * 0.05), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SERIF,
        mode: 'lower-sanctuary',
        primaryColor: '#FAF3E6',
        sungColor: '#FFD699',
        accentColor: '#C99758',
      });
    },
  },

  // 15. Sacred Vesica Halo
  {
    id: 'calm-15-sacred-vesica-halo',
    number: 15,
    category: 'calm-lyric',
    subgenre: 'Sacred Geometry',
    name: 'Sacred Vesica Halo',
    subtitle: 'Euclidean golden-ratio Vesica Piscis, compass hairlines, and Trinity rings',
    description: 'Overlapping Euclidean circles of warm spun gold form a sacred Christian Vesica Piscis and Trinity halo with precision compass construction lines.',
    lightingNote: 'Key: Soft golden-ratio rim rings over matte obsidian-plum.',
    serviceUse: 'Trinity themes, modern liturgical worship, communion.',
    palette: ['#09080F', '#1E192B', '#D4A84E', '#FFF6E5'],
    audioMappings: [
      ['Swell', 'Breathing separation of the intersecting golden circles'],
      ['Vocal', 'Brightens the central vesica mandorla glow'],
      ['Harmonic', 'Rotates outer Euclidean compass degree ticks'],
    ],
    render(rc) {
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.4, params.motion);
      drawSanctuaryBg(ctx, w, h, '#08070E', '#181326', '#090810', params.warmth);

      const cx = w * 0.5, cy = h * 0.5;
      const r = Math.min(w, h) * (0.27 + audio.swell * 0.03);
      const offset = r * (0.50 + 0.05 * Math.sin(t * 0.4 * spd));

      // Outer precision astrolabe / compass ring
      drawSacredAstrolabe(ctx, cx, cy, r * 1.55, {
        t: t * spd * 0.6,
        primaryColor: '#D4A84E',
        secondaryColor: '#8C7AE6',
        vocalEnergy: audio.vocal,
        swellEnergy: audio.swell,
        showStar: false,
      });

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const dir of [-1, 1]) {
        const ox = cx + dir * offset;
        const g = ctx.createRadialGradient(ox, cy, r * 0.65, ox, cy, r * 1.15);
        g.addColorStop(0, 'rgba(212,168,78,0)');
        g.addColorStop(0.8, hexRgba('#E8B95A', 0.26 + audio.vocal * 0.22));
        g.addColorStop(1, 'rgba(212,168,78,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(ox, cy, r * 1.15, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = hexRgba('#F5D07A', 0.48 + audio.harmonic * 0.28);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(ox, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SANS,
        fontWeight: 300,
        mode: 'minimal-editorial',
        primaryColor: '#FFF8ED',
        sungColor: '#FFE094',
        accentColor: '#D4A84E',
      });
    },
  },

  // 16. Breath of Heaven Cloud Sea
  {
    id: 'calm-16-breath-of-heaven-clouds',
    number: 16,
    category: 'calm-lyric',
    subgenre: 'Scenic Nature',
    name: 'Breath of Heaven Cloud Sea',
    subtitle: 'High-altitude cumulus ocean bathed in rose-gold crepuscular rays',
    description: 'Drifting above an unbroken sea of soft cumulus clouds illuminated from within by warm rose-gold sunset scattering and crepuscular rays.',
    lightingNote: 'Key: Subsurface sunset scattering through high-altitude cloud tops.',
    serviceUse: 'Heavenly hope, holiness, ascension, peaceful worship closings.',
    palette: ['#121324', '#382B47', '#E0916C', '#FFF3E8'],
    audioMappings: [
      ['Swell', 'Illuminates internal cloud subsurface rose-gold glow & rays'],
      ['Vocal', 'Drifts foreground cloud billows gently across the frame'],
      ['Shimmer', 'Adds soft twilight starlight in the upper zenith'],
    ],
    render(rc) {
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.4, params.motion);
      drawSanctuaryBg(ctx, w, h, '#0D0F1F', '#322442', '#D48362', params.warmth);

      drawGodRays(ctx, w, h, {
        originX: w * 0.5,
        originY: h * 0.58,
        angle: -Math.PI * 0.5,
        spread: 1.35,
        count: 9,
        color: '#FFB385',
        intensity: 0.30 + audio.swell * 0.28,
        t: t * spd,
      });

      for (let row = 0; row < 4; row++) {
        const yBase = h * (0.48 + row * 0.13);
        const col = row === 0 ? '#F0A47A' : row === 1 ? '#A8687D' : row === 2 ? '#52395E' : '#241B33';
        for (let i = -1; i < 9; i++) {
          const drift = ((t * 12 * spd * (row + 1) * 0.25 + i * (w / 7)) % (w * 1.3)) - w * 0.15;
          const cy = yBase + Math.sin(i * 1.7 + t * 0.4 * spd) * h * 0.025;
          const rx = w * (0.14 + (i % 3) * 0.04);
          const ry = h * (0.09 + audio.swell * 0.025);
          const g = ctx.createRadialGradient(drift, cy - ry * 0.3, ry * 0.1, drift, cy, rx);
          g.addColorStop(0, hexRgba(col, 0.62 + audio.vocal * 0.22));
          g.addColorStop(1, hexRgba(col, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(drift, cy, rx, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.44);
      renderWorshipLyrics(rc, {
        fontFamily: W_SERIF,
        italic: true,
        yRatio: 0.44,
        mode: 'centered-grace',
        primaryColor: '#FFF5EE',
        sungColor: '#FFCCA8',
        accentColor: '#E0916C',
      });
    },
  },

  // 17. Monastic Cloister Rain
  {
    id: 'calm-17-monastic-cloister-rain',
    number: 17,
    category: 'calm-lyric',
    subgenre: 'Sacred Architecture',
    name: 'Monastic Cloister Rain',
    subtitle: 'Romanesque vaulted stone arcade, silver rain, and lantern puddle ripples',
    description: 'Quiet silver rain falls outside a sheltered Romanesque vaulted stone arcade while warm amber lantern light reflects in concentric ripples on wet flagstones.',
    lightingNote: 'Key: Cool 6200K rain courtyard balanced by 3000K cloister lantern.',
    serviceUse: 'Lament, healing, refuge ("shelter in the storm"), contemplative songs.',
    palette: ['#090E14', '#1E2D3B', '#D49248', '#EBF3FA'],
    conceptImage: '/sanctuary-plates/scripture-cloister-rain.jpg',
    audioMappings: [
      ['Shimmer', 'Modulates silver raindrop streak density and puddle rings'],
      ['Vocal', 'Warms the amber cloister lantern reflection'],
      ['Swell', 'Deepens wet flagstone mirror sheen & Romanesque arches'],
    ],
    render(rc) {
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.4, params.motion);
      drawSanctuaryBg(ctx, w, h, '#080D14', '#162430', '#121820', params.warmth);
      drawAshlarMasonry(ctx, w, h, '#6C8BA8', 0.09);

      // Romanesque round-arch arcade framing the courtyard
      drawCathedralArcade(ctx, w, h, {
        bays: 4,
        pointed: false,
        stoneColor: '#16222E',
        highlightColor: '#D49248',
        t,
        vocalEnergy: audio.vocal,
        swellEnergy: audio.swell,
      });

      // Warm lantern glow in courtyard
      const lg = ctx.createRadialGradient(w * 0.5, h * 0.62, 0, w * 0.5, h * 0.62, w * 0.45);
      lg.addColorStop(0, hexRgba('#E89A48', 0.28 + audio.vocal * 0.22));
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, w, h);

      // Silver rain streaks & concentric puddle ripples on wet cobblestones
      ctx.save();
      ctx.strokeStyle = hexRgba('#B8D4EB', 0.26 + audio.shimmer * 0.22);
      ctx.lineWidth = 1.1;
      for (let i = 0; i < 58; i++) {
        const rx = hash11(i * 19.7) * w;
        const ry = ((hash11(i * 41.3) + t * (0.45 + hash11(i) * 0.35) * spd) % 1) * h;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - w * 0.004, ry + h * 0.048);
        ctx.stroke();
      }
      for (let r = 0; r < 7; r++) {
        const rx = w * (0.16 + r * 0.11);
        const ry = h * (0.86 + (r % 2) * 0.04);
        const phase = (t * 0.65 * spd + r * 0.31) % 1;
        ctx.strokeStyle = hexRgba('#E89A48', (1 - phase) * (0.28 + audio.swell * 0.25));
        ctx.beginPath();
        ctx.ellipse(rx, ry, phase * w * 0.045, phase * h * 0.01, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SERIF,
        mode: 'cathedral-arch',
        primaryColor: '#F0F6FC',
        sungColor: '#FFD494',
        accentColor: '#D49248',
      });
    },
  },

  // 18. Cedar of Lebanon Canopy
  {
    id: 'calm-18-cedar-lebanon-canopy',
    number: 18,
    category: 'calm-lyric',
    subgenre: 'Scenic Nature',
    name: 'Cedar of Lebanon Canopy',
    subtitle: 'Sun-dappled forest light filtering through horizontal ancient cedar boughs',
    description: 'Warm emerald and gold sunbeams filter down through tiered horizontal Cedar of Lebanon boughs, casting dancing dappled forest bokeh.',
    lightingNote: 'Key: 4800K forest canopy sunlight with emerald leaf translucency.',
    serviceUse: 'Psalms, strength & rootedness in Christ, creation worship.',
    palette: ['#07120E', '#183629', '#C9A24D', '#F4F7EC'],
    audioMappings: [
      ['Swell', 'Widens sun-dappled forest light shafts'],
      ['Vocal', 'Gently sways horizontal cedar boughs and emerald bokeh'],
      ['Shimmer', 'Sparkles golden pollen motes in the sunbeams'],
    ],
    render(rc) {
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.4, params.motion);
      drawSanctuaryBg(ctx, w, h, '#06100C', '#142E23', '#091712', params.warmth);

      drawGodRays(ctx, w, h, {
        originX: w * 0.48,
        originY: -h * 0.08,
        angle: Math.PI * 0.48,
        spread: 0.58,
        count: 9,
        color: '#E0BF60',
        intensity: 0.34 + audio.swell * 0.30,
        t: t * spd,
      });

      // Signature horizontal tiered Cedar of Lebanon boughs framing left & right
      ctx.save();
      for (const side of [-1, 1]) {
        const trunkX = side === -1 ? w * 0.03 : w * 0.97;
        ctx.fillStyle = '#040A07';
        ctx.fillRect(trunkX - w * 0.025, 0, w * 0.05, h);

        for (let b = 0; b < 5; b++) {
          const by = h * (0.12 + b * 0.17);
          const span = w * (0.32 - b * 0.035);
          const sway = Math.sin(t * 0.65 * spd + b) * h * 0.012 * (1 + audio.vocal * 0.5);
          ctx.fillStyle = b % 2 === 0 ? 'rgba(8, 20, 14, 0.88)' : hexRgba('#1E4732', 0.65);
          ctx.beginPath();
          ctx.moveTo(trunkX, by - h * 0.025);
          ctx.quadraticCurveTo(
            trunkX + side * span * 0.55,
            by - h * 0.015 + sway,
            trunkX + side * span,
            by + sway,
          );
          ctx.quadraticCurveTo(
            trunkX + side * span * 0.55,
            by + h * 0.028 + sway,
            trunkX,
            by + h * 0.025,
          );
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();

      drawMotes(ctx, w, h, {
        count: 44,
        color: '#B8E28A',
        t: t * spd * 0.6,
        riseSpeed: -0.012,
        sway: 0.06,
        sizeRange: [3, 7.5],
        glow: 0.52 + audio.vocal * 0.38,
        seed: 1818,
      });

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SERIF,
        mode: 'centered-grace',
        primaryColor: '#F4F7EC',
        sungColor: '#FFE28A',
        accentColor: '#C9A24D',
      });
    },
  },

  // 19. Anointing Oil Amber Flow
  {
    id: 'calm-19-anointing-oil-amber',
    number: 19,
    category: 'calm-lyric',
    subgenre: 'Contemporary Abstract',
    name: 'Anointing Oil Amber Flow',
    subtitle: 'Topographic laminar streams of liquid gold, myrrh bronze, and honey amber',
    description: 'Smooth laminar fluid currents of warm amber, myrrh bronze, and liquid gold glide across the canvas with rich specular contour ridges.',
    lightingNote: 'Key: Warm 3200K specular sheen over viscous amber fluid contours.',
    serviceUse: 'Holy Spirit anointing, consecration, prayer & healing ministry.',
    palette: ['#120A05', '#3D220E', '#D98A2B', '#FFF0C2'],
    audioMappings: [
      ['Vocal', 'Smooths and illuminates golden fluid contour ridges'],
      ['Swell', 'Expands warm honey-amber subsurface glow'],
      ['Bass', 'Drives slow viscous wave advection'],
    ],
    render(rc) {
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.4, params.motion);
      drawSanctuaryBg(ctx, w, h, '#100804', '#2E180A', '#140B05', params.warmth);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let band = 0; band < 11; band++) {
        const y0 = h * (0.10 + band * 0.08);
        ctx.beginPath();
        for (let x = 0; x <= w; x += 16) {
          const n = fbm2D(x * 0.0025 + t * 0.12 * spd, band * 1.1, 3);
          const y = y0 + (n - 0.5) * h * (0.20 + audio.swell * 0.08);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = hexRgba(band % 2 === 0 ? '#F5A638' : '#C96D1E', 0.26 + audio.vocal * 0.24);
        ctx.lineWidth = h * 0.028;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Fine specular gold filament along the fluid crest
        ctx.strokeStyle = hexRgba('#FFF2C2', 0.32 + audio.vocal * 0.25);
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.restore();

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SERIF,
        italic: true,
        mode: 'word-sweep',
        primaryColor: '#FFF7E5',
        sungColor: '#FFD166',
        accentColor: '#D98A2B',
      });
    },
  },

  // 20. Vellum & Gold Filigree
  {
    id: 'calm-20-vellum-gold-filigree',
    number: 20,
    category: 'calm-lyric',
    subgenre: 'Sacred Architecture',
    director: 'Classical Mind',
    name: 'Vellum & Gold Filigree',
    subtitle: 'Illuminated manuscript parchment with gold-leaf vine borders and rosettes',
    description: 'Reverent dark-aged vellum framed by double gold-leaf rules, corner rose medallions, and botanical vine flourishes.',
    lightingNote: 'Key: Warm 3400K lectern candle grazing across gold leaf.',
    serviceUse: 'Classic hymns, creeds, communion liturgy, seasonal services.',
    palette: ['#120E0B', '#2B2118', '#D4AF37', '#FAF0DC'],
    conceptImage: '/sanctuary-plates/scripture-illuminated-vellum.jpg',
    audioMappings: [
      ['Vocal', 'Gleams across the gold-leaf corner vine filigree'],
      ['Swell', 'Warms the central parchment reading vignette'],
      ['Shimmer', 'Sparkles micro-gold leaf flecks'],
    ],
    render(rc) {
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.4, params.motion);
      drawSanctuaryBg(ctx, w, h, '#100C09', '#261D15', '#120E0A', params.warmth);

      const m = Math.min(w, h) * 0.065;
      ctx.save();
      ctx.strokeStyle = hexRgba('#D4AF37', 0.48 + audio.vocal * 0.28);
      ctx.lineWidth = 1.8;
      ctx.strokeRect(m, m, w - m * 2, h - m * 2);
      ctx.strokeStyle = hexRgba('#D4AF37', 0.24);
      ctx.lineWidth = 1;
      ctx.strokeRect(m * 1.24, m * 1.24, w - m * 2.48, h - m * 2.48);

      // Illuminated vine waves along left & right borders
      for (const side of [-1, 1]) {
        const vx = side === -1 ? m * 1.12 : w - m * 1.12;
        ctx.strokeStyle = hexRgba('#E5C158', 0.42 + audio.vocal * 0.25);
        ctx.beginPath();
        for (let y = m * 1.4; y <= h - m * 1.4; y += 10) {
          const x = vx + Math.sin(y * 0.05 + t * 0.6 * spd) * (m * 0.12);
          if (y === m * 1.4) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      const corners = [
        [m * 1.12, m * 1.12],
        [w - m * 1.12, m * 1.12],
        [m * 1.12, h - m * 1.12],
        [w - m * 1.12, h - m * 1.12],
      ];
      for (const [cx, cy] of corners) {
        drawGothicRoseWindow(ctx, cx, cy, m * 0.42, {
          petals: 8,
          t: t * spd,
          palette: ['#D4AF37', '#C93838', '#3B6EE8'],
          leadColor: '#FFE082',
          vocalEnergy: audio.vocal,
          swellEnergy: audio.swell,
          causticThrow: false,
        });
      }
      ctx.restore();

      drawMotes(ctx, w, h, {
        count: 30,
        color: '#F5D06B',
        t: t * spd * 0.5,
        riseSpeed: 0.01,
        sway: 0.03,
        sizeRange: [1.2, 3.0],
        glow: 0.45 + audio.shimmer * 0.4,
        seed: 2020,
      });

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SERIF,
        mode: 'hymnal-stanza',
        primaryColor: '#FAF0DC',
        sungColor: '#FFE082',
        accentColor: '#D4AF37',
      });
    },
  },

  // 21. Dove Horizon Dawn
  {
    id: 'calm-21-dove-horizon-dawn',
    number: 21,
    category: 'calm-lyric',
    subgenre: 'Contemplative Light',
    director: 'Radical Minimalist',
    name: 'Dove Horizon Dawn',
    subtitle: 'Ascending feathered wing-arcs of pearl-gold light over a tranquil azure sea',
    description: 'Graceful wing-like arcs of warm pearl and spun gold lift upward from a tranquil dawn ocean horizon in time with the worship swell.',
    lightingNote: 'Key: 5200K pearl-gold horizon light ascending into deep azure.',
    serviceUse: 'Pentecost, Holy Spirit songs, peace & benediction.',
    palette: ['#09121E', '#1E3552', '#E5B869', '#FAF8F2'],
    audioMappings: [
      ['Swell', 'Lifts the ascending wing-like light arcs gently skyward'],
      ['Vocal', 'Brightens the pearl-gold horizon core & primary feathers'],
      ['Harmonic', 'Expands soft atmospheric halation'],
    ],
    render(rc) {
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.4, params.motion);
      drawSanctuaryBg(ctx, w, h, '#08101C', '#182D48', '#2E4057', params.warmth);

      // Horizon sun corona
      const hg = ctx.createRadialGradient(w * 0.5, h * 0.72, 0, w * 0.5, h * 0.72, w * 0.45);
      hg.addColorStop(0, hexRgba('#FFF6DE', 0.55 + audio.vocal * 0.25));
      hg.addColorStop(0.5, hexRgba('#E5B869', 0.22));
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 7; i++) {
        const lift = Math.sin(t * 0.65 * spd - i * 0.35) * h * 0.038 * (1 + audio.swell);
        const cy = h * (0.70 - i * 0.075) + lift;
        const span = w * (0.24 + i * 0.085);
        ctx.strokeStyle = hexRgba(i % 2 === 0 ? '#FFE3B0' : '#9CC8FA', (0.36 - i * 0.04) * (0.85 + audio.vocal * 0.5));
        ctx.lineWidth = h * (0.016 - i * 0.0018);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(w * 0.5 - span, cy + h * 0.055);
        ctx.quadraticCurveTo(w * 0.5 - span * 0.42, cy - h * 0.085, w * 0.5, cy);
        ctx.quadraticCurveTo(w * 0.5 + span * 0.42, cy - h * 0.085, w * 0.5 + span, cy + h * 0.055);
        ctx.stroke();
      }
      ctx.restore();

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SANS,
        fontWeight: 300,
        mode: 'lower-sanctuary',
        primaryColor: '#FAF8F2',
        sungColor: '#FFE09E',
        accentColor: '#E5B869',
      });
    },
  },

  // 22. Still Meadow Wildflowers
  {
    id: 'calm-22-still-meadow-wildflowers',
    number: 22,
    category: 'calm-lyric',
    subgenre: 'Scenic Nature',
    director: 'World-Eclectic Traveller',
    name: 'Still Meadow Wildflowers',
    subtitle: 'Six-petal lilies of the field and sunlit dew bokeh in evening meadow light',
    description: 'Inspired by "Consider the lilies of the field": detailed six-petal lily blossoms, botanical grass blades, and warm golden-hour bokeh drift across a twilight meadow.',
    lightingNote: 'Key: Warm 3800K backlight through meadow blossoms and dew.',
    serviceUse: 'Trust, providence, Sermon on the Mount, gentle acoustic worship.',
    palette: ['#0D1714', '#223B32', '#E0A958', '#FAF5E8'],
    audioMappings: [
      ['Swell', 'Sways lily blossoms and meadow stems in a slow evening breeze'],
      ['Shimmer', 'Twinkles sunlit dew bokeh across the field'],
      ['Vocal', 'Warms the golden blossom petals'],
    ],
    render(rc) {
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.4, params.motion);
      drawSanctuaryBg(ctx, w, h, '#0A1411', '#1D332B', '#2E3B25', params.warmth);

      drawMotes(ctx, w, h, {
        count: 45,
        color: '#FFD98E',
        t: t * spd * 0.7,
        riseSpeed: 0.012,
        sway: 0.05,
        sizeRange: [2.5, 6.5],
        glow: 0.55 + audio.shimmer * 0.4,
        seed: 2222,
      });

      // Botanical stems & 6-petal Lily of the Field blossoms along lower third
      ctx.save();
      for (let i = 0; i < 34; i++) {
        const bx = (i / 33) * w;
        const sh = h * (0.14 + hash11(i * 5.7) * 0.18);
        const sway = Math.sin(t * 0.85 * spd + i * 0.5) * w * 0.014 * (1 + audio.swell * 0.5);
        const tx = bx + sway;
        const ty = h - sh;

        ctx.strokeStyle = i % 2 === 0 ? hexRgba('#5A7A58', 0.65) : 'rgba(10, 20, 16, 0.82)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(bx, h);
        ctx.quadraticCurveTo(bx + sway * 0.5, h - sh * 0.5, tx, ty);
        ctx.stroke();

        // 6-petal lily blossom on every second stem
        if (i % 2 === 0) {
          const pr = Math.min(w, h) * 0.012;
          const col = i % 4 === 0 ? '#FFE29E' : '#F2C2CB';
          ctx.fillStyle = hexRgba(col, 0.65 + audio.vocal * 0.3);
          for (let p = 0; p < 6; p++) {
            const pa = (p / 6) * Math.PI * 2 + t * 0.2;
            ctx.beginPath();
            ctx.ellipse(
              tx + Math.cos(pa) * pr * 0.65,
              ty + Math.sin(pa) * pr * 0.65,
              pr * 0.65,
              pr * 0.28,
              pa,
              0,
              Math.PI * 2,
            );
            ctx.fill();
          }
          ctx.fillStyle = '#FFF8DC';
          ctx.beginPath();
          ctx.arc(tx, ty, pr * 0.25, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.45);
      renderWorshipLyrics(rc, {
        fontFamily: W_SERIF,
        yRatio: 0.45,
        mode: 'centered-grace',
        primaryColor: '#FAF5E8',
        sungColor: '#FFD98E',
        accentColor: '#E0A958',
      });
    },
  },

  // 23. Sanctuary Prism Horizon
  {
    id: 'calm-23-sanctuary-prism-horizon',
    number: 23,
    category: 'calm-lyric',
    subgenre: 'Contemporary Abstract',
    director: 'Futurist',
    name: 'Sanctuary Prism Horizon',
    subtitle: 'Cauchy optical glass horizon with covenant rainbow dispersion & slate grid',
    description: 'A modern architectural horizon refracts warm white light into a delicate covenant spectrum across dark polished stone with 3D perspective floor lines.',
    lightingNote: 'Key: Cauchy optical glass refraction at 4500K over matte slate.',
    serviceUse: 'Contemporary worship, covenant themes, modern auditoriums.',
    palette: ['#090B12', '#1B2234', '#5CA8E6', '#F5C469'],
    audioMappings: [
      ['Harmonic', 'Widens the optical prism covenant dispersion band'],
      ['Vocal', 'Brightens the central horizon light filament'],
      ['Swell', 'Deepens floor reflection grid below the horizon'],
    ],
    render(rc) {
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.4, params.motion);
      drawSanctuaryBg(ctx, w, h, '#07090F', '#121826', '#080B14', params.warmth);

      const hy = h * 0.56;
      const spread = h * (0.075 + audio.harmonic * 0.055);

      // Perspective floor grid below horizon
      ctx.save();
      ctx.strokeStyle = hexRgba('#5CA8E6', 0.12 + audio.swell * 0.10);
      ctx.lineWidth = 1;
      for (let i = -8; i <= 8; i++) {
        ctx.beginPath();
        ctx.moveTo(w * 0.5 + i * w * 0.03, hy);
        ctx.lineTo(w * 0.5 + i * w * 0.16, h);
        ctx.stroke();
      }
      ctx.restore();

      const pg = ctx.createLinearGradient(0, hy - spread, 0, hy + spread);
      pg.addColorStop(0, 'rgba(92,168,230,0)');
      pg.addColorStop(0.22, hexRgba('#38BDF8', 0.26 + audio.swell * 0.16));
      pg.addColorStop(0.38, hexRgba('#34D399', 0.22 + audio.harmonic * 0.14));
      pg.addColorStop(0.5, hexRgba('#FFF8E7', 0.65 + audio.vocal * 0.32));
      pg.addColorStop(0.65, hexRgba('#F59E0B', 0.28 + audio.swell * 0.16));
      pg.addColorStop(0.82, hexRgba('#EC4899', 0.20 + audio.harmonic * 0.14));
      pg.addColorStop(1, 'rgba(232,154,84,0)');
      ctx.fillStyle = pg;
      ctx.fillRect(0, hy - spread, w, spread * 2);

      const lx = w * (0.5 + 0.28 * Math.sin(t * 0.35 * spd));
      const lg = ctx.createRadialGradient(lx, hy, 0, lx, hy, w * 0.28);
      lg.addColorStop(0, hexRgba('#FFF6E0', 0.45 + audio.vocal * 0.28));
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, w, h);

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.46);
      renderWorshipLyrics(rc, {
        fontFamily: W_SANS,
        fontWeight: 300,
        yRatio: 0.46,
        mode: 'word-sweep',
        primaryColor: '#F7FAFC',
        sungColor: '#FFE099',
        accentColor: '#5CA8E6',
      });
    },
  },

  // 24. Selah Evening Ember
  {
    id: 'calm-24-selah-evening-ember',
    number: 24,
    category: 'calm-lyric',
    subgenre: 'Contemplative Light',
    director: 'Radical Minimalist',
    name: 'Selah Evening Ember',
    subtitle: 'Glowing copper altar brazier, convective ember trails, and breathing Selah rings',
    description: 'Built for the quietest moments of prayer and "Selah" reflection: a deep velvet-umber sanctuary with a glowing copper-gold hearth and breathing concentric rings.',
    lightingNote: 'Key: Ultra-warm 2600K ember glow with deep text-safe sanctuary.',
    serviceUse: 'Selah pauses, altar calls, closing benediction, quiet acoustic prayer.',
    palette: ['#080607', '#21110E', '#C96A32', '#F7E8D4'],
    audioMappings: [
      ['Swell', 'Breathes the central copper-gold hearth halo & Selah rings'],
      ['Vocal', 'Lifts warm convective ember trails from the lower brazier'],
      ['Bass', 'Deepens the warm burgundy-umber vignette'],
    ],
    render(rc) {
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.4, params.motion);
      drawSanctuaryBg(ctx, w, h, '#070506', '#1C0D0A', '#0E0606', params.warmth);

      const rad = Math.min(w, h) * (0.44 + audio.swell * 0.14);
      const g = ctx.createRadialGradient(w * 0.5, h * 0.62, 0, w * 0.5, h * 0.62, rad);
      g.addColorStop(0, hexRgba('#E8823E', 0.34 + audio.vocal * 0.24));
      g.addColorStop(0.55, hexRgba('#7A2E18', 0.16));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // Breathing concentric Selah meditation rings
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let r = 1; r <= 3; r++) {
        const rr = Math.min(w, h) * (0.14 * r + 0.02 * Math.sin(t * 0.5 * spd + r));
        ctx.strokeStyle = hexRgba('#E07A3C', (0.24 - r * 0.05) * (0.8 + audio.swell * 0.5));
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.5, rr, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      drawMotes(ctx, w, h, {
        count: 32,
        color: '#F29B52',
        t: t * spd * 0.55,
        riseSpeed: 0.016,
        sway: 0.04,
        sizeRange: [1.8, 4.4],
        glow: 0.52 + audio.vocal * 0.42,
        seed: 2424,
      });

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SERIF,
        italic: true,
        mode: 'centered-grace',
        primaryColor: '#F7E8D4',
        sungColor: '#FFC482',
        accentColor: '#C96A32',
      });
    },
  },
];
