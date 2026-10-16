// services/ambo/worshipVisualizers/scriptureReadingVisualizers.ts
// Collection III: 24 Scripture Reading Visualizers & Living Environments (Designs #49–72)
// Deeply Art-Directed by the 6-Voice Art Director Council:
//   - Classical Mind (🏛️): Illuminated Psalter Drop-Caps, Ashlar Stone Masonry, Jachin & Boaz Temple Pillars
//   - Baroque Dramatist (🕯️): Arched Stone Tablets, Suspended Ruby Censer Lamps, Herodian Clay Oil Lamps
//   - Radical Minimalist (◯): Swiss Editorial Asymmetric Lecterns, Giant Faint Verse Numerals, Logos Corona
//   - Futurist (✦): Orbiting Circular Chapter Rings, Engraved Brass Astrolabes, Ezekiel Gyroscopic Wheels
//   - World-Eclectic Traveller (🌿): Qumran Scroll Rollers, Tabernacle 4-Color Tapestry Weave, Galilean Hills
//   - Rebellious Hand (✒️): Deckle-Edge Parchment Slabs, Kintsugi Gold-Leaf Seams, Botanical Herbarium Ink

import {
  WorshipVisualizerDef,
  SAMPLE_SCRIPTURES,
  W_SERIF,
  W_SANS,
  W_DISPLAY,
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
  renderScriptureOverlay,
} from './types';

function withScripture(rc: Parameters<WorshipVisualizerDef['render']>[0], sampleIdx: number) {
  if (rc.scripture) return rc;
  return {
    ...rc,
    scripture: SAMPLE_SCRIPTURES[sampleIdx % SAMPLE_SCRIPTURES.length],
  };
}

export const SCRIPTURE_READING_VISUALIZERS: WorshipVisualizerDef[] = [
  // 49. Illuminated Psalter Vellum (Gemini Concept Plate #3 Twin)
  {
    id: 'scripture-49-illuminated-psalter-vellum',
    number: 49,
    category: 'scripture-reading',
    subgenre: 'Illuminated Manuscript',
    director: 'Classical Mind',
    councilNote: 'Classical Mind + Rebellious Hand: Double-ruled gold-leaf manuscript borders, gilded Initial Drop-Cap, living olive marginalia, and corner rosettes.',
    name: 'Illuminated Psalter Vellum',
    subtitle: 'Candlelit medieval manuscript with gilded Drop-Cap and olive vine marginalia',
    description: 'Interactive code twin of the Illuminated Vellum concept plate: warm beeswax candlelight grazes across gold-leaf marginalia, corner rosettes, and an illuminated initial Drop-Cap.',
    lightingNote: 'Key: 2900K beeswax lectern candle grazing gold-leaf borders.',
    serviceUse: 'Psalms, Gospel reading, Christmas & Easter lessons, formal liturgy.',
    palette: ['#120D0A', '#2B1E14', '#D4AF37', '#FAF2DF'],
    conceptImage: '/sanctuary-plates/scripture-illuminated-vellum.jpg',
    audioMappings: [
      ['Vocal', 'Gleams warm candlelight across the gold-leaf vine marginalia'],
      ['Swell', 'Breathes the amber lectern candle halo'],
      ['Shimmer', 'Highlights spoken words in the reading measure'],
    ],
    render(rawRc) {
      const rc = withScripture(rawRc, 0);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.3, params.motion);
      drawSanctuaryBg(ctx, w, h, '#0E0A07', '#261A11', '#120C08', params.warmth);

      // Ornate gold-leaf marginalia vines & illuminated rosette medallions on left and right margins
      ctx.save();
      for (const side of [-1, 1]) {
        const mx = side === -1 ? w * 0.055 : w * 0.945;
        ctx.strokeStyle = hexRgba('#D4AF37', 0.52 + audio.vocal * 0.35);
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        for (let y = h * 0.08; y <= h * 0.92; y += 10) {
          const wave = Math.sin(y * 0.032 + t * 0.55 * spd) * w * 0.016;
          if (y === h * 0.08) ctx.moveTo(mx + wave, y);
          else ctx.lineTo(mx + wave, y);
        }
        ctx.stroke();

        for (let lf = 0; lf < 12; lf++) {
          const ly = h * (0.11 + lf * 0.072);
          const lx = mx + Math.sin(ly * 0.032 + t * 0.55 * spd) * w * 0.016;
          ctx.fillStyle = hexRgba('#E5C158', 0.48 + audio.swell * 0.32);
          ctx.beginPath();
          ctx.ellipse(lx + side * w * 0.013, ly, w * 0.012, h * 0.0055, side * 0.4, 0, Math.PI * 2);
          ctx.fill();
          if (lf % 2 === 0) {
            ctx.fillStyle = hexRgba(lf % 4 === 0 ? '#C93838' : '#3B6EE8', 0.72);
            ctx.beginPath();
            ctx.arc(lx - side * w * 0.008, ly + 4, 2.8, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.restore();

      drawMotes(ctx, w, h, {
        count: 34,
        color: '#FFD97D',
        t: t * spd * 0.5,
        riseSpeed: 0.01,
        sway: 0.03,
        sizeRange: [1.5, 3.4],
        glow: 0.52 + audio.vocal * 0.35,
        seed: 4949,
      });

      renderScriptureOverlay(rc, {
        fontFamily: W_SERIF,
        plateStyle: 'gold-bordered',
        showDropCap: true,
        accentColor: '#D4AF37',
        textColor: '#FAF2DF',
        plateTint: 'rgba(14, 10, 8, 0.80)',
      });
    },
  },

  // 50. Abbey Cloister Rain (Gemini Concept Plate #6 Twin)
  {
    id: 'scripture-50-abbey-cloister-rain',
    number: 50,
    category: 'scripture-reading',
    subgenre: 'Sanctuary & Cloister',
    director: 'Baroque Dramatist',
    councilNote: 'Baroque Dramatist + Classical Mind: Romanesque vaulted stone arcade, warm 3000K lantern spill on wet flagstones, and concentric rain puddle ripples.',
    name: 'Abbey Cloister Rain',
    subtitle: 'Romanesque courtyard arches with gentle silver rain and lantern reflections',
    description: 'Interactive code twin of the Cloister Rain concept plate: gentle silver rain falls past a vaulted Romanesque stone arcade while warm courtyard lanterns reflect on wet cobblestones.',
    lightingNote: 'Key: Cool 6000K rain dusk + warm 3000K stone arch lantern.',
    serviceUse: 'Psalms of refuge, Lamentations, Beatitudes, evening vespers.',
    palette: ['#090E14', '#1B2836', '#D9964A', '#EEF5FA'],
    conceptImage: '/sanctuary-plates/scripture-cloister-rain.jpg',
    audioMappings: [
      ['Vocal', 'Warms the amber lantern reflection on wet flagstones'],
      ['Shimmer', 'Modulates gentle silver rain streaks outside the arch'],
      ['Swell', 'Expands puddle ripple rings in the lower courtyard'],
    ],
    render(rawRc) {
      const rc = withScripture(rawRc, 0);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.3, params.motion);
      drawSanctuaryBg(ctx, w, h, '#080C12', '#16222E', '#0E141C', params.warmth);
      drawAshlarMasonry(ctx, w, h, '#7898B8', 0.10);

      drawCathedralArcade(ctx, w, h, {
        bays: 4,
        pointed: false,
        stoneColor: '#16222E',
        highlightColor: '#D9964A',
        t,
        vocalEnergy: audio.vocal,
        swellEnergy: audio.swell,
      });

      // Rain streaks & courtyard puddle ripples
      ctx.save();
      ctx.strokeStyle = hexRgba('#A8C7E0', 0.28 + audio.shimmer * 0.22);
      ctx.lineWidth = 1.1;
      for (let i = 0; i < 56; i++) {
        const rx = hash11(i * 23.1) * w;
        const ry = ((hash11(i * 47.7) + t * 0.55 * spd) % 1) * h;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 3, ry + h * 0.048);
        ctx.stroke();
      }
      for (let r = 0; r < 8; r++) {
        const rx = w * (0.12 + r * 0.11);
        const ry = h * (0.89 + (r % 2) * 0.04);
        const phase = (t * 0.7 * spd + r * 0.37) % 1;
        ctx.strokeStyle = hexRgba('#D9964A', (1 - phase) * (0.32 + audio.swell * 0.25));
        ctx.beginPath();
        ctx.ellipse(rx, ry, phase * w * 0.045, phase * h * 0.01, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      renderScriptureOverlay(rc, {
        fontFamily: W_SERIF,
        plateStyle: 'arch-tablet',
        accentColor: '#D9964A',
        textColor: '#F0F6FC',
        plateTint: 'rgba(9, 13, 19, 0.78)',
      });
    },
  },

  // 51. Qumran Dead Sea Scroll Parchment
  {
    id: 'scripture-51-qumran-scroll-parchment',
    number: 51,
    category: 'scripture-reading',
    subgenre: 'Illuminated Manuscript',
    director: 'World-Eclectic Traveller',
    councilNote: 'World-Eclectic Traveller: Authentic Qumran Cave 1 linen scroll seams, turned wooden Torah rollers, dry-point scribe ruling lines, and desert cave sunbeams.',
    name: 'Qumran Scroll Parchment',
    subtitle: 'Warm desert limestone cave and ancient linen-stitched parchment scroll',
    description: 'Evoking the Great Isaiah Scroll of Qumran: warm desert sandstone, turned scroll rollers, stitched parchment column seams, and horizontal dry-point scribe ruling lines.',
    lightingNote: 'Key: Warm 3400K desert sunbeam entering limestone cave.',
    serviceUse: 'Old Testament prophets (Isaiah, Jeremiah), Torah readings, history.',
    palette: ['#140F0A', '#332417', '#C98E42', '#FAF0DC'],
    conceptImage: '/sanctuary-plates/scripture-kintsugi-mineral-gold.jpg',
    audioMappings: [
      ['Vocal', 'Illuminates horizontal scribe ruling lines and stitched column seams'],
      ['Swell', 'Warms the sandstone amber cave sunbeams'],
    ],
    render(rawRc) {
      const rc = withScripture(rawRc, 1);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.3, params.motion);
      drawSanctuaryBg(ctx, w, h, '#120D08', '#2C1E12', '#17100A', params.warmth);

      drawGodRays(ctx, w, h, {
        originX: w * 0.12,
        originY: -h * 0.05,
        angle: Math.PI * 0.34,
        spread: 0.44,
        count: 6,
        color: '#E5A952',
        intensity: 0.28 + audio.swell * 0.24,
        t: t * spd,
      });

      // Stitched linen thread marks on left & right scroll columns
      ctx.save();
      for (const sx of [w * 0.06, w * 0.94]) {
        ctx.strokeStyle = hexRgba('#E0A858', 0.38 + audio.vocal * 0.25);
        ctx.lineWidth = 1.4;
        for (let y = h * 0.12; y < h * 0.88; y += 16) {
          ctx.beginPath();
          ctx.moveTo(sx - 6, y);
          ctx.lineTo(sx + 6, y + 6);
          ctx.stroke();
        }
      }
      ctx.restore();

      drawMotes(ctx, w, h, {
        count: 30,
        color: '#E5B062',
        t: t * spd * 0.5,
        riseSpeed: 0.009,
        sway: 0.03,
        sizeRange: [1.2, 3.0],
        glow: 0.45 + audio.vocal * 0.3,
        seed: 5151,
      });

      renderScriptureOverlay(rc, {
        fontFamily: W_SERIF,
        plateStyle: 'scroll-column',
        accentColor: '#C98E42',
        textColor: '#FAF0DC',
        plateTint: 'rgba(18, 13, 9, 0.82)',
      });
    },
  },

  // 52. Mount Sinai Dawn & Cloud Pillar
  {
    id: 'scripture-52-mount-sinai-dawn',
    number: 52,
    category: 'scripture-reading',
    subgenre: 'Biblical Landscape',
    director: 'Baroque Dramatist',
    councilNote: 'Baroque Dramatist: Multi-ridge Sinai red-granite silhouettes crowned by a glory cloud pillar and ascending covenant fire sparks.',
    name: 'Mount Sinai Dawn',
    subtitle: 'Granite desert peaks crowned with golden morning glory and cloud mist',
    description: 'Three layered Sinai red-granite ridges stand beneath a radiant golden glory cloud as covenant sparks and morning mist drift across the summit.',
    lightingNote: 'Key: High summit sunrise at 3800K over rugged red-granite ridges.',
    serviceUse: 'Exodus, Ten Commandments, Law & Covenant readings, Psalms.',
    palette: ['#120C14', '#382124', '#E08E42', '#FFF4DE'],
    audioMappings: [
      ['Swell', 'Brightens the golden summit glory cloud and rays'],
      ['Vocal', 'Drifts warm morning mist across the three granite ridges'],
    ],
    render(rawRc) {
      const rc = withScripture(rawRc, 1);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.3, params.motion);
      drawSanctuaryBg(ctx, w, h, '#100A12', '#381E21', '#C97B38', params.warmth);

      drawGodRays(ctx, w, h, {
        originX: w * 0.5,
        originY: h * 0.14,
        angle: Math.PI * 0.5,
        spread: 1.05,
        count: 10,
        color: '#FFB85C',
        intensity: 0.34 + audio.swell * 0.28,
        t: t * spd,
      });

      const ridges = [
        { yBase: 0.80, amp: 0.25, col: '#29151A', seed: 1.1 },
        { yBase: 0.86, amp: 0.19, col: '#1C0E12', seed: 2.7 },
        { yBase: 0.92, amp: 0.13, col: '#11080B', seed: 4.3 },
      ];
      for (const r of ridges) {
        ctx.fillStyle = r.col;
        ctx.strokeStyle = hexRgba('#FFB85C', 0.28);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 16) {
          const peak = Math.exp(-Math.pow((x - w * 0.5) / (w * 0.36), 2)) * h * r.amp;
          const crag = fbm2D(x * 0.005 + r.seed, r.seed, 3) * h * 0.075;
          ctx.lineTo(x, h * r.yBase - peak - crag);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      drawMotes(ctx, w, h, {
        count: 38,
        color: '#FFAE42',
        t: t * spd * 0.8,
        riseSpeed: 0.02,
        sway: 0.04,
        sizeRange: [1.5, 3.8],
        glow: 0.52 + audio.vocal * 0.35,
        seed: 5252,
      });

      renderScriptureOverlay(rc, {
        fontFamily: W_SERIF,
        plateStyle: 'arch-tablet',
        accentColor: '#E08E42',
        textColor: '#FFF6E8',
        plateTint: 'rgba(15, 10, 12, 0.80)',
      });
    },
  },

  // 53. Sea of Galilee Shore Pebbles & Waves
  {
    id: 'scripture-53-galilee-shore-waves',
    number: 53,
    category: 'scripture-reading',
    subgenre: 'Biblical Landscape',
    director: 'World-Eclectic Traveller',
    councilNote: 'World-Eclectic Traveller: Lake Kinneret dawn horizon, distant Golan hills, and rhythmic turquoise shoreline caustics paced to the lector.',
    name: 'Galilee Shore Stillness',
    subtitle: 'Gentle lapping shoreline ripples, Golan hills, and warm morning mist',
    description: 'Peaceful turquoise-blue water laps softly at the Galilee shore beneath distant Golan hills in rhythmic cadences that mirror the lector’s voice.',
    lightingNote: 'Key: Soft 4800K morning sky reflecting in shallow shoreline water.',
    serviceUse: 'Gospel narratives, parables of Jesus, calling of the disciples.',
    palette: ['#08141E', '#16384C', '#5CA8C9', '#F5F9FC'],
    audioMappings: [
      ['Vocal', 'Ripples horizontal shoreline wave crests and sun glints'],
      ['Swell', 'Deepens the azure-teal water gradient and morning horizon'],
    ],
    render(rawRc) {
      const rc = withScripture(rawRc, 0);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.3, params.motion);
      drawSanctuaryBg(ctx, w, h, '#07111A', '#133042', '#0A1C26', params.warmth);

      // Distant Golan hills along upper horizon at y = 0.16h
      ctx.fillStyle = '#0D2230';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.18);
      for (let x = 0; x <= w; x += 20) {
        const hy = h * 0.16 - Math.sin(x * 0.004 + 0.5) * h * 0.035;
        ctx.lineTo(x, hy);
      }
      ctx.lineTo(w, h * 0.18);
      ctx.closePath();
      ctx.fill();

      const sg = ctx.createRadialGradient(w * 0.5, h * 0.18, 0, w * 0.5, h * 0.18, w * 0.45);
      sg.addColorStop(0, hexRgba('#FFE3A8', 0.28 + audio.swell * 0.2));
      sg.addColorStop(0.5, hexRgba('#5CA8C9', 0.14));
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 18; i++) {
        const wy = h * (0.18 + (i / 18) * 0.76);
        ctx.strokeStyle = hexRgba(i % 3 === 0 ? '#FFE3A8' : '#7CC4E0', 0.18 + audio.vocal * 0.20);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 18) {
          const y = wy + Math.sin(x * 0.006 + t * 0.9 * spd + i) * h * 0.008;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();

      renderScriptureOverlay(rc, {
        fontFamily: W_SERIF,
        plateStyle: 'scroll-column',
        accentColor: '#7CC4E0',
        textColor: '#F5F9FC',
        plateTint: 'rgba(7, 16, 24, 0.78)',
      });
    },
  },

  // 54. River of Life Crystal Stream (Revelation 22)
  {
    id: 'scripture-54-river-of-life-crystal',
    number: 54,
    category: 'scripture-reading',
    subgenre: 'Biblical Landscape',
    director: 'Rebellious Hand',
    councilNote: 'Rebellious Hand + Baroque Dramatist: Flowing crystal-emerald current ribbons flanked by golden Tree of Life boughs bearing twelve manner of fruits.',
    name: 'River of Life Crystal Stream',
    subtitle: 'Luminous emerald-and-gold river flowing between Tree of Life boughs',
    description: '"A pure river of water of life, clear as crystal": shimmering streams of turquoise and gold flow gently beneath overhanging golden Tree of Life boughs and fruit.',
    lightingNote: 'Key: Crystal water caustics + golden Tree of Life foliage.',
    serviceUse: 'Revelation 21–22, Easter, baptism, eternal life passages.',
    palette: ['#061717', '#113D3B', '#38C9B0', '#F2C15A'],
    audioMappings: [
      ['Vocal', 'Sparkles crystal water glints along the flowing river ribbons'],
      ['Swell', 'Illuminates golden Tree of Life leaves & fruit in upper corners'],
    ],
    render(rawRc) {
      const rc = withScripture(rawRc, 3);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.3, params.motion);
      drawSanctuaryBg(ctx, w, h, '#051314', '#0E3331', '#071B1A', params.warmth);

      // Flowing crystal stream ribbons across background
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let s = 0; s < 8; s++) {
        const baseY = h * (0.14 + s * 0.105);
        ctx.strokeStyle = hexRgba(s % 2 === 0 ? '#38C9B0' : '#F2C15A', 0.20 + audio.vocal * 0.18);
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 18) {
          const y = baseY + Math.sin(x * 0.005 - t * 0.8 * spd + s * 1.3) * h * 0.024;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Golden Tree of Life boughs & 12 glowing fruits on left and right margins
      for (const side of [-1, 1]) {
        const bx = side === -1 ? w * 0.05 : w * 0.95;
        ctx.strokeStyle = hexRgba('#F2C15A', 0.48 + audio.swell * 0.3);
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(bx, h * 0.9);
        ctx.quadraticCurveTo(bx + side * w * 0.03, h * 0.45, bx + side * w * 0.08, h * 0.08);
        ctx.stroke();

        for (let f = 0; f < 6; f++) {
          const fy = h * (0.14 + f * 0.13);
          const fx = bx + side * w * (0.03 + (f % 2) * 0.025);
          ctx.fillStyle = hexRgba(f % 2 === 0 ? '#FFD66B' : '#38C9B0', 0.65 + audio.vocal * 0.3);
          ctx.beginPath();
          ctx.arc(fx, fy, 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      renderScriptureOverlay(rc, {
        fontFamily: W_SERIF,
        plateStyle: 'side-codex',
        accentColor: '#38C9B0',
        textColor: '#F2FCFA',
        plateTint: 'rgba(6, 18, 18, 0.80)',
      });
    },
  },

  // 55. In the Beginning Logos Light (John 1)
  {
    id: 'scripture-55-logos-creation-light',
    number: 55,
    category: 'scripture-reading',
    subgenre: 'Sacred Geometry',
    director: 'Radical Minimalist',
    councilNote: 'Radical Minimalist: A sovereign Genesis solar corona and Swiss asymmetric editorial lectern — "The light shines in the darkness."',
    name: 'Logos Creation Light (John 1)',
    subtitle: '"The light shines in the darkness": a sovereign golden-white Genesis eclipse corona',
    description: 'Built for Genesis 1 and John 1: a pure, unshakeable eclipse corona of warm golden-white light and radial filaments expands gently against deep cosmic velvet.',
    lightingNote: 'Key: Central Logos corona at 4500K over deep cosmic indigo.',
    serviceUse: 'John 1, Genesis 1, Christmas Prologue, Easter Vigil.',
    palette: ['#05060D', '#121629', '#E8B854', '#FFFFFF'],
    audioMappings: [
      ['Vocal', 'Expands the golden-white Logos corona with every spoken phrase'],
      ['Swell', 'Rotates delicate cosmic ring filaments'],
    ],
    render(rawRc) {
      const rc = withScripture(rawRc, 2);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.3, params.motion);
      drawSanctuaryBg(ctx, w, h, '#04050B', '#0D1021', '#05060C', params.warmth);

      const cx = w * 0.5, cy = h * 0.5;
      const rad = Math.min(w, h) * (0.44 + audio.vocal * 0.08);
      const g = ctx.createRadialGradient(cx, cy, rad * 0.35, cx, cy, rad * 1.25);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.65, hexRgba('#FFE094', 0.32 + audio.swell * 0.24));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      drawSacredAstrolabe(ctx, cx, cy, rad * 1.05, {
        t: t * spd * 0.6,
        primaryColor: '#E8B854',
        secondaryColor: '#93C5FD',
        vocalEnergy: audio.vocal,
        swellEnergy: audio.swell,
        showStar: true,
      });

      renderScriptureOverlay(rc, {
        fontFamily: W_SERIF,
        plateStyle: 'minimal-lectern',
        accentColor: '#E8B854',
        textColor: '#FFFFFF',
        plateTint: 'rgba(6, 7, 14, 0.82)',
      });
    },
  },

  // 56. Burning Bush Holy Ground (Exodus 3)
  {
    id: 'scripture-56-burning-bush-holy-ground',
    number: 56,
    category: 'scripture-reading',
    subgenre: 'Biblical Landscape',
    director: 'Baroque Dramatist',
    councilNote: 'Baroque Dramatist + Rebellious Hand: Unconsumed golden-amber desert acacia branches on left and right margins with ascending Horeb fire tongues.',
    name: 'Burning Bush Holy Ground',
    subtitle: 'Unconsumed golden-amber desert acacia branches and sacred Horeb fire',
    description: 'Gnarled desert acacia branches glow with unconsumed golden-amber flame tongues and rising sparks on the perimeter of a dark Horeb desert night.',
    lightingNote: 'Key: 2800K sacred firelight rimming the reading sanctuary.',
    serviceUse: 'Exodus 3, holiness of God, call narratives, Old Testament lessons.',
    palette: ['#120705', '#33130B', '#E87A24', '#FFF2D6'],
    audioMappings: [
      ['Vocal', 'Lifts unconsumed golden flame tongues along the acacia branches'],
      ['Swell', 'Warms the Horeb firelight halo and rising desert sparks'],
    ],
    render(rawRc) {
      const rc = withScripture(rawRc, 1);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.3, params.motion);
      drawSanctuaryBg(ctx, w, h, '#0F0604', '#2C1009', '#140805', params.warmth);

      // Glowing unconsumed golden flame aura & branching desert acacia boughs on left and right
      ctx.save();
      for (const side of [-1, 1]) {
        const sx = side === -1 ? w * 0.08 : w * 0.92;
        const fg = ctx.createRadialGradient(sx, h * 0.72, 0, sx, h * 0.72, w * 0.36);
        fg.addColorStop(0, hexRgba('#FFAE42', 0.45 + audio.vocal * 0.28));
        fg.addColorStop(0.5, hexRgba('#E85D1A', 0.18));
        fg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = fg;
        ctx.fillRect(0, 0, w, h);

        // Glowing golden-amber acacia branches
        ctx.strokeStyle = hexRgba('#FFD166', 0.65 + audio.vocal * 0.3);
        ctx.shadowColor = '#FF7A1A';
        ctx.shadowBlur = 12;
        ctx.lineWidth = 2.2;
        for (let b = 0; b < 5; b++) {
          ctx.beginPath();
          ctx.moveTo(sx, h * 0.95);
          const sway = Math.sin(t * 1.8 * spd + b) * w * 0.015;
          ctx.quadraticCurveTo(
            sx + side * w * (0.02 + b * 0.012),
            h * (0.65 - b * 0.08),
            sx + side * (b - 1.5) * w * 0.022 + sway,
            h * (0.25 + b * 0.09),
          );
          ctx.stroke();
        }
      }
      ctx.restore();

      drawMotes(ctx, w, h, {
        count: 58,
        color: '#FF9E3B',
        t: t * spd * 1.2,
        riseSpeed: 0.036,
        sway: 0.05,
        sizeRange: [1.8, 4.8],
        glow: 0.68 + audio.vocal * 0.32,
        seed: 5656,
      });

      renderScriptureOverlay(rc, {
        fontFamily: W_SERIF,
        plateStyle: 'arch-tablet',
        accentColor: '#E87A24',
        textColor: '#FFF5E4',
        plateTint: 'rgba(16, 8, 6, 0.82)',
      });
    },
  },

  // 57. Solomon's Temple Cedar & Gold
  {
    id: 'scripture-57-solomons-temple-cedar',
    number: 57,
    category: 'scripture-reading',
    subgenre: 'Sanctuary & Cloister',
    director: 'Classical Mind',
    councilNote: 'Classical Mind: First-Temple Lebanon cedar paneling, fluted Jachin & Boaz bronze-gold pillars with lily capitals, and Menorah lampstand radiance.',
    name: 'Solomon’s Temple Cedar & Gold',
    subtitle: 'Fluted Jachin & Boaz gold pillars, lily capitals, and Menorah radiance',
    description: 'Rich Lebanon cedar woodgrain, fluted bronze-gold temple columns with sculpted lily capitals (1 Kings 7), and seven-branched lampstand light frame the scripture text.',
    lightingNote: 'Key: Menorah lampstand 3000K gold reflection on carved cedar.',
    serviceUse: '1 Kings, Chronicles, Temple Psalms, dedication services.',
    palette: ['#140B07', '#361E12', '#D4AF37', '#FAF1DF'],
    audioMappings: [
      ['Vocal', 'Gleams across the fluted gold temple pillars and lily capitals'],
      ['Swell', 'Warms the seven-branched menorah ambient light'],
    ],
    render(rawRc) {
      const rc = withScripture(rawRc, 0);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.3, params.motion);
      drawSanctuaryBg(ctx, w, h, '#120A06', '#2E190E', '#140B07', params.warmth);
      drawAshlarMasonry(ctx, w, h, '#D4AF37', 0.11);

      // Jachin & Boaz 3D fluted bronze-gold pillars with sculpted lily capitals & plinths
      for (const px of [w * 0.055, w * 0.945]) {
        const pw = w * 0.036;
        const pg = ctx.createLinearGradient(px - pw / 2, 0, px + pw / 2, 0);
        pg.addColorStop(0, '#291708');
        pg.addColorStop(0.35, '#D4AF37');
        pg.addColorStop(0.5, '#FFF2C2');
        pg.addColorStop(0.7, '#B8860B');
        pg.addColorStop(1, '#1F1105');
        ctx.fillStyle = pg;
        ctx.fillRect(px - pw / 2, h * 0.12, pw, h * 0.76);

        // Fluted vertical grooves
        ctx.strokeStyle = 'rgba(20, 10, 4, 0.55)';
        ctx.lineWidth = 1;
        for (let f = -2; f <= 2; f++) {
          ctx.beginPath();
          ctx.moveTo(px + f * (pw * 0.16), h * 0.14);
          ctx.lineTo(px + f * (pw * 0.16), h * 0.86);
          ctx.stroke();
        }

        // Sculpted Lily Capital & Pomegranate Moulding at top & base
        ctx.fillStyle = hexRgba('#FFE082', 0.75 + audio.vocal * 0.25);
        ctx.fillRect(px - pw * 0.72, h * 0.10, pw * 1.44, h * 0.025);
        ctx.fillRect(px - pw * 0.72, h * 0.88, pw * 1.44, h * 0.025);
      }

      drawMotes(ctx, w, h, {
        count: 34,
        color: '#FFD875',
        t: t * spd * 0.5,
        riseSpeed: 0.012,
        sway: 0.03,
        sizeRange: [1.5, 3.4],
        glow: 0.52 + audio.swell * 0.3,
        seed: 5757,
      });

      renderScriptureOverlay(rc, {
        fontFamily: W_SERIF,
        plateStyle: 'gold-bordered',
        showDropCap: true,
        accentColor: '#D4AF37',
        textColor: '#FAF1DF',
        plateTint: 'rgba(18, 11, 7, 0.82)',
      });
    },
  },

  // 58. Celestial Astrolabe & Magi Star
  {
    id: 'scripture-58-celestial-astrolabe-star',
    number: 58,
    category: 'scripture-reading',
    subgenre: 'Sacred Geometry',
    director: 'Futurist',
    councilNote: 'Futurist + Classical Mind: Precision engraved brass armillary vernier ticks, counter-rotating ecliptic rings, and an 8-ray Bethlehem zenith star.',
    name: 'Celestial Astrolabe & Magi Star',
    subtitle: 'Revolving brass celestial rings, vernier ticks, and a guiding Bethlehem star',
    description: 'Engraved brass celestial coordinates, degree vernier ticks, and an eight-pointed Bethlehem star revolve slowly behind a frosted glass reading plate.',
    lightingNote: 'Key: Starlight 5500K + engraved brass astrolabe arcs.',
    serviceUse: 'Advent, Christmas, Epiphany, Psalm 19 ("The heavens declare").',
    palette: ['#070B17', '#16223D', '#D9A74A', '#F7FAFC'],
    audioMappings: [
      ['Swell', 'Rotates the engraved brass celestial astrolabe rings'],
      ['Vocal', 'Pulses the guiding star rays in the upper zenith'],
    ],
    render(rawRc) {
      const rc = withScripture(rawRc, 2);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.3, params.motion);
      drawSanctuaryBg(ctx, w, h, '#060914', '#121B30', '#080C18', params.warmth);

      drawSacredAstrolabe(ctx, w * 0.5, h * 0.5, Math.min(w, h) * 0.46, {
        t: t * spd,
        primaryColor: '#D9A74A',
        secondaryColor: '#60A5FA',
        vocalEnergy: audio.vocal,
        swellEnergy: audio.swell,
        showStar: true,
      });

      drawMotes(ctx, w, h, {
        count: 34,
        color: '#FFE299',
        t: t * spd * 0.4,
        riseSpeed: 0.008,
        sway: 0.02,
        sizeRange: [1.4, 3.2],
        glow: 0.50 + audio.vocal * 0.32,
        seed: 5858,
      });

      renderScriptureOverlay(rc, {
        fontFamily: W_SERIF,
        plateStyle: 'frosted-sanctuary',
        accentColor: '#D9A74A',
        textColor: '#F7FAFC',
        plateTint: 'rgba(7, 11, 22, 0.80)',
      });
    },
  },

  // 59. Road to Emmaus Twilight
  {
    id: 'scripture-59-emmaus-road-twilight',
    number: 59,
    category: 'scripture-reading',
    subgenre: 'Biblical Landscape',
    director: 'World-Eclectic Traveller',
    councilNote: 'World-Eclectic Traveller + Baroque Dramatist: Judean twilight hills, a winding limestone footpath, and warm village hearth light on the horizon.',
    name: 'Road to Emmaus Twilight',
    subtitle: '"Did not our hearts burn within us": winding Judean footpath at eventide',
    description: 'A winding limestone country path at eventide leads toward a warm village hearth glow on the horizon, evoking Luke 24 ("Stay with us, for it is toward evening").',
    lightingNote: 'Key: Warm 3300K eventide horizon glow over lavender-slate hills.',
    serviceUse: 'Luke 24, Resurrection appearances, evening services, communion.',
    palette: ['#0E0D18', '#2B243D', '#E08A45', '#FAF3E6'],
    audioMappings: [
      ['Vocal', 'Warms the eventide horizon glow ("hearts burning within us")'],
      ['Swell', 'Softly illuminates dust motes along the twilight path'],
    ],
    render(rawRc) {
      const rc = withScripture(rawRc, 0);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.3, params.motion);
      drawSanctuaryBg(ctx, w, h, '#0C0B14', '#28203B', '#C46D35', params.warmth);

      const hg = ctx.createRadialGradient(w * 0.5, h * 0.80, 0, w * 0.5, h * 0.80, w * 0.48);
      hg.addColorStop(0, hexRgba('#FFC270', 0.52 + audio.vocal * 0.28));
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(0, 0, w, h);

      // Rolling Judean hills & winding Emmaus path at lower border
      ctx.fillStyle = '#120E1C';
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 20) {
        const hy = h * 0.83 - Math.sin(x * 0.004 + 0.8) * h * 0.045;
        ctx.lineTo(x, hy);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();

      // Winding sunlit limestone footpath disappearing over the ridge
      ctx.fillStyle = hexRgba('#E08A45', 0.35 + audio.vocal * 0.25);
      ctx.beginPath();
      ctx.moveTo(w * 0.38, h);
      ctx.quadraticCurveTo(w * 0.48, h * 0.90, w * 0.50, h * 0.81);
      ctx.quadraticCurveTo(w * 0.54, h * 0.90, w * 0.64, h);
      ctx.closePath();
      ctx.fill();

      drawMotes(ctx, w, h, {
        count: 34,
        color: '#FFBE73',
        t: t * spd * 0.5,
        riseSpeed: 0.011,
        sway: 0.04,
        sizeRange: [1.5, 3.6],
        glow: 0.50 + audio.swell * 0.35,
        seed: 5959,
      });

      renderScriptureOverlay(rc, {
        fontFamily: W_SERIF,
        plateStyle: 'vellum-dark',
        accentColor: '#E08A45',
        textColor: '#FAF3E6',
        plateTint: 'rgba(13, 11, 20, 0.80)',
      });
    },
  },

  // 60. Botanical Marginalia Herbarium
  {
    id: 'scripture-60-botanical-marginalia',
    number: 60,
    category: 'scripture-reading',
    subgenre: 'Illuminated Manuscript',
    director: 'Rebellious Hand',
    councilNote: 'Rebellious Hand: Hand-drawn botanical herbarium studies of olive, fig, wheat, and lily of the field on a deckle-edge Kintsugi codex.',
    name: 'Botanical Marginalia',
    subtitle: 'Pressed olive, fig, and pomegranate botanical illustrations in gold ink',
    description: 'Biblical flora (olive branch, fig leaf, wheat, lily) drawn in luminous gold and sage ink along the margins of a deckle-edge botanical codex.',
    lightingNote: 'Key: Soft 4000K reading light over sage-velvet and gold ink.',
    serviceUse: 'Parables of the Kingdom (sower, fig tree, mustard seed), creation.',
    palette: ['#0A120E', '#1B2E24', '#C9A44C', '#F4F7EE'],
    audioMappings: [
      ['Vocal', 'Gently sways the marginal botanical stems and wheat fronds'],
      ['Swell', 'Brightens the gold-ink leaf veins'],
    ],
    render(rawRc) {
      const rc = withScripture(rawRc, 0);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.3, params.motion);
      drawSanctuaryBg(ctx, w, h, '#08100C', '#182B21', '#0A130F', params.warmth);

      // Pressed botanical stems, leaves & pomegranate blossoms on left and right margins
      ctx.save();
      for (const side of [-1, 1]) {
        const bx = side === -1 ? w * 0.06 : w * 0.94;
        ctx.strokeStyle = hexRgba('#C9A44C', 0.48 + audio.vocal * 0.3);
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(bx, h * 0.88);
        ctx.quadraticCurveTo(bx + side * w * 0.025, h * 0.5, bx, h * 0.12);
        ctx.stroke();

        for (let i = 0; i < 10; i++) {
          const ly = h * (0.16 + i * 0.072);
          const sway = Math.sin(t * 0.8 * spd + i) * 0.08;
          ctx.fillStyle = hexRgba(i % 2 === 0 ? '#C9A44C' : '#6FA882', 0.45 + audio.swell * 0.28);
          ctx.beginPath();
          ctx.ellipse(bx + side * w * 0.016, ly, w * 0.014, h * 0.0065, side * 0.45 + sway, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      renderScriptureOverlay(rc, {
        fontFamily: W_SERIF,
        plateStyle: 'side-codex',
        accentColor: '#C9A44C',
        textColor: '#F4F7EE',
        plateTint: 'rgba(9, 16, 13, 0.80)',
      });
    },
  },

  // 61. Patmos Island Waves & Revelation Sky
  {
    id: 'scripture-61-patmos-revelation-waves',
    number: 61,
    category: 'scripture-reading',
    subgenre: 'Biblical Landscape',
    director: 'Baroque Dramatist',
    councilNote: 'Baroque Dramatist: Prophetic crepuscular sunbeams breaking through Aegean storm clouds onto shimmering sapphire sea swells.',
    name: 'Patmos Aegean Horizon',
    subtitle: 'Deep Aegean sea swells and golden prophetic sunbeams breaking through clouds',
    description: 'Dramatic sunbeams break through Aegean clouds over deep sapphire swells, crafted for readings from Revelation and the Epistles.',
    lightingNote: 'Key: Crepuscular rays at 4600K breaking over deep sapphire sea.',
    serviceUse: 'Revelation, Epistles of John, prophetic readings.',
    palette: ['#070D19', '#162B4C', '#E5A948', '#F5F8FC'],
    audioMappings: [
      ['Swell', 'Widens the crepuscular sunbeams breaking through the clouds'],
      ['Vocal', 'Shimmers golden light along the Aegean horizon swells'],
    ],
    render(rawRc) {
      const rc = withScripture(rawRc, 3);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.3, params.motion);
      drawSanctuaryBg(ctx, w, h, '#060B16', '#142847', '#091324', params.warmth);

      drawGodRays(ctx, w, h, {
        originX: w * 0.5,
        originY: -h * 0.05,
        angle: Math.PI * 0.5,
        spread: 0.95,
        count: 9,
        color: '#FFD27D',
        intensity: 0.34 + audio.swell * 0.28,
        t: t * spd,
      });

      // Shimmering Aegean sea swells in lower third
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let r = 0; r < 12; r++) {
        const y = h * (0.70 + r * 0.024);
        ctx.strokeStyle = hexRgba(r % 2 === 0 ? '#E5A948' : '#6498D8', 0.22 + audio.vocal * 0.22);
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 20) {
          const wy = y + Math.sin(x * 0.008 + t * spd + r) * 5.5;
          if (x === 0) ctx.moveTo(x, wy);
          else ctx.lineTo(x, wy);
        }
        ctx.stroke();
      }
      ctx.restore();

      renderScriptureOverlay(rc, {
        fontFamily: W_SERIF,
        plateStyle: 'arch-tablet',
        accentColor: '#E5A948',
        textColor: '#F5F8FC',
        plateTint: 'rgba(7, 13, 25, 0.80)',
      });
    },
  },

  // 62. Upper Room Terracotta Oil Lamp
  {
    id: 'scripture-62-upper-room-oil-lamp',
    number: 62,
    category: 'scripture-reading',
    subgenre: 'Sanctuary & Cloister',
    director: 'Baroque Dramatist',
    councilNote: 'Baroque Dramatist: Georges de La Tour single-source 2600K terracotta olive-oil lamps illuminating Jerusalem ashlar limestone arches.',
    name: 'Upper Room Oil Lamp',
    subtitle: 'First-century Jerusalem stone arches lit by Herodian clay olive-oil lamps',
    description: 'Intimate 2600K Herodian terracotta olive-oil lamps warm rough-hewn Jerusalem limestone arches for Last Supper discourses, Acts, and Upper Room readings.',
    lightingNote: 'Key: 2600K terracotta olive-oil flame over warm limestone.',
    serviceUse: 'John 13–17, Maundy Thursday, Communion, Acts 1–2.',
    palette: ['#120A06', '#2E190E', '#E88B2E', '#FFF2D9'],
    audioMappings: [
      ['Vocal', 'Gently breathes the warm olive-oil lamp flames & halos'],
      ['Swell', 'Warms the Jerusalem ashlar limestone arch shadows'],
    ],
    render(rawRc) {
      const rc = withScripture(rawRc, 2);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.3, params.motion);
      drawSanctuaryBg(ctx, w, h, '#100805', '#2B160C', '#140B06', params.warmth);
      drawAshlarMasonry(ctx, w, h, '#E88B2E', 0.14 + audio.swell * 0.08);

      drawCathedralArcade(ctx, w, h, {
        bays: 3,
        pointed: false,
        stoneColor: '#29150A',
        highlightColor: '#E88B2E',
        t,
        vocalEnergy: audio.vocal,
        swellEnergy: audio.swell,
      });

      // Two First-Century Herodian terracotta clay oil lamps on left & right stone ledges
      for (const side of [-1, 1]) {
        const lx = side === -1 ? w * 0.07 : w * 0.93;
        const ly = h * 0.56;
        const lw = w * 0.035;

        // Warm La Tour radial candle/oil-lamp halo
        const lg = ctx.createRadialGradient(lx, ly - 10, 0, lx, ly - 10, w * 0.24);
        lg.addColorStop(0, hexRgba('#FFE8A3', 0.65 + audio.vocal * 0.25));
        lg.addColorStop(0.4, hexRgba('#E88B2E', 0.28));
        lg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = lg;
        ctx.fillRect(0, 0, w, h);

        // Terracotta clay vessel body
        ctx.fillStyle = '#8C431E';
        ctx.beginPath();
        ctx.ellipse(lx, ly, lw * 0.55, h * 0.018, 0, 0, Math.PI * 2);
        ctx.fill();

        // Living olive-oil flame at nozzle
        const fx = lx - side * lw * 0.35;
        const fh = h * (0.032 + audio.vocal * 0.012);
        ctx.fillStyle = '#FFF9E2';
        ctx.beginPath();
        ctx.moveTo(fx - 3, ly - 4);
        ctx.quadraticCurveTo(fx, ly - fh, fx + 3, ly - 4);
        ctx.closePath();
        ctx.fill();
      }

      renderScriptureOverlay(rc, {
        fontFamily: W_SERIF,
        plateStyle: 'arch-tablet',
        accentColor: '#E88B2E',
        textColor: '#FFF2D9',
        plateTint: 'rgba(16, 9, 6, 0.80)',
      });
    },
  },

  // 63. Bethlehem Fields Ruth Barley Harvest
  {
    id: 'scripture-63-bethlehem-barley-harvest',
    number: 63,
    category: 'scripture-reading',
    subgenre: 'Biblical Landscape',
    director: 'World-Eclectic Traveller',
    councilNote: 'World-Eclectic Traveller: Terraced Judean hillsides, swaying golden barley stalks along the lower border, and the first evening star over Bethlehem.',
    name: 'Bethlehem Barley Harvest',
    subtitle: 'Warm golden hillside terraces, bearded barley, and Bethlehem evening star',
    description: 'Terraced Judean hillsides and swaying golden barley stalks glow in warm harvest amber beneath the first evening star.',
    lightingNote: 'Key: Golden hour 3400K over terraced Judean hills.',
    serviceUse: 'Book of Ruth, Micah 5, Luke 2, pastoral & harvest scriptures.',
    palette: ['#120E0B', '#2E2218', '#D99845', '#FAF2E1'],
    audioMappings: [
      ['Swell', 'Sways harvest barley grain along the lower hillside terrace'],
      ['Vocal', 'Brightens the Bethlehem evening star'],
    ],
    render(rawRc) {
      const rc = withScripture(rawRc, 0);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.3, params.motion);
      drawSanctuaryBg(ctx, w, h, '#0E0B09', '#291E15', '#17110C', params.warmth);

      // Guiding Bethlehem evening star at top center
      const sx = w * 0.5, sy = h * 0.09;
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, w * 0.14);
      sg.addColorStop(0, '#FFFFFF');
      sg.addColorStop(0.3, hexRgba('#FFE094', 0.65 + audio.vocal * 0.3));
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, w, h);

      // Swaying golden barley stalks along bottom margin
      ctx.save();
      ctx.strokeStyle = hexRgba('#E0A24E', 0.42 + audio.swell * 0.28);
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 46; i++) {
        const bx = (i / 45) * w;
        const sway = Math.sin(t * 0.9 * spd + i * 0.4) * 12 * (1 + audio.vocal * 0.5);
        const topY = h * (0.83 + hash11(i * 7.1) * 0.05);
        ctx.beginPath();
        ctx.moveTo(bx, h);
        ctx.quadraticCurveTo(bx + sway * 0.5, (h + topY) * 0.5, bx + sway, topY);
        ctx.stroke();

        ctx.fillStyle = hexRgba('#FFD685', 0.62);
        ctx.beginPath();
        ctx.ellipse(bx + sway, topY, 2.5, 6.5, sway * 0.03, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      renderScriptureOverlay(rc, {
        fontFamily: W_SERIF,
        plateStyle: 'scroll-column',
        accentColor: '#D99845',
        textColor: '#FAF2E1',
        plateTint: 'rgba(16, 12, 9, 0.80)',
      });
    },
  },

  // 64. Ezekiel Sapphire Throne & Amber Fire
  {
    id: 'scripture-64-ezekiel-sapphire-throne',
    number: 64,
    category: 'scripture-reading',
    subgenre: 'Sacred Geometry',
    director: 'Futurist',
    councilNote: 'Futurist: Counter-rotating Ophanim wheel-within-a-wheel electrum rings over a lapis-lazuli sapphire firmament (Ezekiel 1 & Exodus 24).',
    name: 'Sapphire Throne & Amber Glory',
    subtitle: 'Lapis lazuli sapphire expanse with concentric gyroscopic wheels of amber',
    description: 'Inspired by Ezekiel 1 & Exodus 24 ("like a pavement of sapphire stone, as clear as the sky itself"): deep lapis blue with revolving gyroscopic rings of glowing electrum amber.',
    lightingNote: 'Key: Lapis sapphire depth + glowing electrum-amber concentric rings.',
    serviceUse: 'Ezekiel, Isaiah 6, Daniel, Revelation 4 throne-room readings.',
    palette: ['#060B1E', '#122866', '#F2A438', '#FFF7E5'],
    audioMappings: [
      ['Swell', 'Rotates the concentric wheel-within-a-wheel amber rings'],
      ['Vocal', 'Brightens the sapphire-to-gold throne radiance'],
    ],
    render(rawRc) {
      const rc = withScripture(rawRc, 1);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.3, params.motion);
      drawSanctuaryBg(ctx, w, h, '#050919', '#0F245C', '#070E29', params.warmth);

      drawSacredAstrolabe(ctx, w * 0.5, h * 0.5, Math.min(w, h) * 0.46, {
        t: t * spd * 1.2,
        primaryColor: '#F2A438',
        secondaryColor: '#38BDF8',
        vocalEnergy: audio.vocal,
        swellEnergy: audio.swell,
        showStar: true,
      });

      renderScriptureOverlay(rc, {
        fontFamily: W_SERIF,
        plateStyle: 'frosted-sanctuary',
        accentColor: '#F2A438',
        textColor: '#FFF7E5',
        plateTint: 'rgba(6, 11, 28, 0.82)',
      });
    },
  },

  // 65. Jacob's Ladder Bethel Starlight
  {
    id: 'scripture-65-jacobs-ladder-bethel',
    number: 65,
    category: 'scripture-reading',
    subgenre: 'Biblical Landscape',
    director: 'Futurist',
    councilNote: 'Futurist + Radical Minimalist: Ascending architectural perspective tiers of warm golden light rising into a deep starlit Bethel zenith.',
    name: 'Bethel Stairway of Light',
    subtitle: 'Ascending perspective tiers of golden light between earth and starlit heaven',
    description: '"Surely the Lord is in this place": perspective horizontal rungs of golden light and celestial beams ascend into a starlit Bethel sky.',
    lightingNote: 'Key: Ascending golden light tiers in a 5500K starlit night.',
    serviceUse: 'Genesis 28, John 1:51, House of God / sanctuary dedication.',
    palette: ['#070A16', '#161F3B', '#E5B454', '#F7FAFC'],
    audioMappings: [
      ['Swell', 'Gently lifts the ascending golden light rungs skyward'],
      ['Vocal', 'Illuminates the central Bethel pillar'],
    ],
    render(rawRc) {
      const rc = withScripture(rawRc, 2);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.3, params.motion);
      drawSanctuaryBg(ctx, w, h, '#060812', '#131B33', '#090C19', params.warmth);

      drawGodRays(ctx, w, h, {
        originX: w * 0.5,
        originY: 0,
        angle: Math.PI * 0.5,
        spread: 0.65,
        count: 7,
        color: '#E5B454',
        intensity: 0.28 + audio.swell * 0.25,
        t: t * spd,
      });

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 12; i++) {
        const p = ((i / 12 - t * 0.045 * spd) % 1 + 1) % 1;
        const y = p * h;
        const rw = w * (0.12 + p * 0.48);
        ctx.fillStyle = hexRgba('#FFD478', Math.sin(p * Math.PI) * (0.28 + audio.vocal * 0.24));
        ctx.fillRect(w * 0.5 - rw / 2, y, rw, 3.5);
      }
      ctx.restore();

      renderScriptureOverlay(rc, {
        fontFamily: W_SERIF,
        plateStyle: 'minimal-lectern',
        accentColor: '#E5B454',
        textColor: '#F7FAFC',
        plateTint: 'rgba(7, 10, 22, 0.80)',
      });
    },
  },

  // 66. Bethany Alabaster Jar & Nard Fragrance
  {
    id: 'scripture-66-bethany-alabaster-nard',
    number: 66,
    category: 'scripture-reading',
    subgenre: 'Sanctuary & Cloister',
    director: 'Radical Minimalist',
    councilNote: 'Radical Minimalist + Rebellious Hand: Translucent pearl-alabaster Kintsugi veins and rising rose-amber spikenard incense ribbons.',
    name: 'Bethany Alabaster & Nard',
    subtitle: 'Broken alabaster Kintsugi veins and rising rose-amber fragrance curls',
    description: 'Inspired by Mary of Bethany breaking the alabaster jar of costly spikenard: glowing golden Kintsugi seams and rose-gold fragrance plumes rise in quiet devotion.',
    lightingNote: 'Key: Warm 3500K subsurface scatter through pearl alabaster.',
    serviceUse: 'Gospel passion narratives, devotion, stewardship, Holy Week.',
    palette: ['#140C12', '#331D2B', '#E09878', '#FFF6F0'],
    audioMappings: [
      ['Vocal', 'Lifts delicate rose-amber fragrance curls & alabaster seams'],
      ['Swell', 'Warms the translucent alabaster glow'],
    ],
    render(rawRc) {
      const rc = withScripture(rawRc, 2);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.3, params.motion);
      drawSanctuaryBg(ctx, w, h, '#110A0F', '#2E1826', '#160D13', params.warmth);

      // Broken alabaster vessel Kintsugi seams
      drawKintsugiFractureNetwork(ctx, w, h, {
        t: t * spd,
        goldColor: '#F2B091',
        glowColor: '#E09878',
        vocalEnergy: audio.vocal,
        swellEnergy: audio.swell,
        seed: 66,
      });

      renderScriptureOverlay(rc, {
        fontFamily: W_SERIF,
        plateStyle: 'minimal-lectern',
        accentColor: '#E09878',
        textColor: '#FFF6F0',
        plateTint: 'rgba(18, 11, 16, 0.80)',
      });
    },
  },

  // 67. Tabernacle Blue, Purple & Scarlet Veil
  {
    id: 'scripture-67-tabernacle-woven-veil',
    number: 67,
    category: 'scripture-reading',
    subgenre: 'Sanctuary & Cloister',
    director: 'World-Eclectic Traveller',
    councilNote: 'World-Eclectic Traveller: Woven Exodus 26 sanctuary tapestry threads in hyacinth blue, Tyrian purple, crimson scarlet, and spun gold.',
    name: 'Tabernacle Woven Veil',
    subtitle: 'Fine twisted linen in royal blue, purple, scarlet, and spun-gold thread',
    description: 'Inspired by Exodus 26 & Hebrews: rich woven tapestries of hyacinth blue, royal purple, crimson scarlet, and spun gold frame the reading sanctuary.',
    lightingNote: 'Key: Golden lampstand light grazing woven blue, purple, and scarlet threads.',
    serviceUse: 'Hebrews, Exodus/Leviticus, Good Friday, covenant & priesthood.',
    palette: ['#0F091A', '#3B164A', '#9E1F38', '#E5B448'],
    audioMappings: [
      ['Vocal', 'Shimmers spun-gold threads woven through the side curtains'],
      ['Swell', 'Gently parts and sways the lateral tapestry folds'],
    ],
    render(rawRc) {
      const rc = withScripture(rawRc, 1);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.3, params.motion);
      drawSanctuaryBg(ctx, w, h, '#0C0714', '#2E123B', '#3D1222', params.warmth);

      const threadCols = ['#3B6EE8', '#9333EA', '#E11D48', '#F59E0B'];
      ctx.save();
      for (let i = 0; i < 10; i++) {
        const col = threadCols[i % 4];
        ctx.strokeStyle = hexRgba(col, (i % 4 === 3 ? 0.48 : 0.30) + audio.vocal * 0.25);
        ctx.lineWidth = i % 4 === 3 ? 2.2 : 1.5;
        for (const side of [-1, 1]) {
          const baseX = side === -1 ? w * (0.02 + i * 0.011) : w * (0.98 - i * 0.011);
          ctx.beginPath();
          for (let y = 0; y <= h; y += 18) {
            const x = baseX + Math.sin(y * 0.018 + t * 0.6 * spd + i) * 6;
            if (y === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
      ctx.restore();

      renderScriptureOverlay(rc, {
        fontFamily: W_SERIF,
        plateStyle: 'scroll-column',
        accentColor: '#E5B448',
        textColor: '#FFF8EB',
        plateTint: 'rgba(13, 8, 22, 0.82)',
      });
    },
  },

  // 68. Sermon on the Mount Galilee Hillside
  {
    id: 'scripture-68-beatitudes-hillside',
    number: 68,
    category: 'scripture-reading',
    subgenre: 'Biblical Landscape',
    director: 'World-Eclectic Traveller',
    councilNote: 'World-Eclectic Traveller: Mount of Beatitudes grassy amphitheater overlooking the sunlit Sea of Galilee with wildflower motes.',
    name: 'Beatitudes Galilee Hillside',
    subtitle: 'Grassy Galilean amphitheater overlooking the sunlit lake and hills',
    description: 'Layered green-and-gold Galilean hillsides overlooking the sunlit Sea of Galilee below, crafted for the Sermon on the Mount (Matthew 5–7).',
    lightingNote: 'Key: Clear 5000K morning sun over green hillsides and blue water.',
    serviceUse: 'Matthew 5–7 (Beatitudes), Gospel teachings of Jesus.',
    palette: ['#0A1618', '#1A3A36', '#6AB894', '#F5E6C4'],
    audioMappings: [
      ['Swell', 'Breathes warm morning sunlight across the grassy hillside'],
      ['Vocal', 'Sparkles lake reflections and wildflower blossoms'],
    ],
    render(rawRc) {
      const rc = withScripture(rawRc, 0);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.3, params.motion);
      drawSanctuaryBg(ctx, w, h, '#081318', '#183838', '#1E3624', params.warmth);

      drawGodRays(ctx, w, h, {
        originX: w * 0.8,
        originY: -h * 0.05,
        angle: Math.PI * 0.65,
        spread: 0.6,
        count: 8,
        color: '#FFE59E',
        intensity: 0.30 + audio.swell * 0.25,
        t: t * spd,
      });

      // Rolling Galilean hillsides at bottom
      for (let r = 0; r < 2; r++) {
        ctx.fillStyle = r === 0 ? '#142E24' : '#0C1E17';
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 20) {
          const hy = h * (0.82 + r * 0.06) - Math.sin(x * 0.0035 + r * 2.1) * h * 0.045;
          ctx.lineTo(x, hy);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
      }

      drawMotes(ctx, w, h, {
        count: 36,
        color: '#FFE59E',
        t: t * spd * 0.5,
        riseSpeed: 0.011,
        sway: 0.04,
        sizeRange: [1.5, 3.8],
        glow: 0.50 + audio.vocal * 0.35,
        seed: 6868,
      });

      renderScriptureOverlay(rc, {
        fontFamily: W_SERIF,
        plateStyle: 'vellum-dark',
        accentColor: '#8CD9A8',
        textColor: '#F7FAF7',
        plateTint: 'rgba(8, 18, 18, 0.80)',
      });
    },
  },

  // 69. True Vine & Fruitful Branches (John 15)
  {
    id: 'scripture-69-true-vine-branches',
    number: 69,
    category: 'scripture-reading',
    subgenre: 'Illuminated Manuscript',
    director: 'Rebellious Hand',
    councilNote: 'Rebellious Hand: Intertwining golden grapevine tendrils and deep communion-burgundy grape clusters along a deckle-edge codex.',
    name: 'True Vine & Golden Branches',
    subtitle: '"I am the vine, you are the branches": living golden grapevine borders',
    description: 'Intertwining grapevine branches, curling tendrils, and burgundy-gold grape clusters frame the scripture reading for John 15 and Communion passages.',
    lightingNote: 'Key: Warm 3300K vineyard sunset over deep burgundy and gold.',
    serviceUse: 'John 15, Communion, abiding in Christ, fruit of the Spirit.',
    palette: ['#14080D', '#381222', '#D9A245', '#FAF0E6'],
    audioMappings: [
      ['Vocal', 'Illuminates golden sap veins through the vine branches'],
      ['Swell', 'Deepens the rich communion-wine burgundy clusters'],
    ],
    render(rawRc) {
      const rc = withScripture(rawRc, 2);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.3, params.motion);
      drawSanctuaryBg(ctx, w, h, '#11060B', '#300F1D', '#17080F', params.warmth);

      ctx.save();
      for (const side of [-1, 1]) {
        const vx = side === -1 ? w * 0.055 : w * 0.945;
        ctx.strokeStyle = hexRgba('#D9A245', 0.50 + audio.vocal * 0.32);
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        for (let y = h * 0.08; y <= h * 0.92; y += 12) {
          const x = vx + Math.sin(y * 0.025 + t * 0.5 * spd) * w * 0.016;
          if (y === h * 0.08) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Rich burgundy-and-gold grape clusters
        for (let c = 0; c < 6; c++) {
          const cy = h * (0.16 + c * 0.13);
          const cx = vx + side * w * 0.014;
          ctx.fillStyle = hexRgba('#B82952', 0.68 + audio.swell * 0.3);
          for (const [dx, dy] of [[0, 0], [-4, 5], [4, 5], [-2, 10], [2, 10], [0, 15]]) {
            ctx.beginPath();
            ctx.arc(cx + dx, cy + dy, 3.8, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.restore();

      renderScriptureOverlay(rc, {
        fontFamily: W_SERIF,
        plateStyle: 'side-codex',
        accentColor: '#D9A245',
        textColor: '#FAF0E6',
        plateTint: 'rgba(18, 7, 12, 0.82)',
      });
    },
  },

  // 70. Olive Press Courtyard Stone
  {
    id: 'scripture-70-olive-press-courtyard',
    number: 70,
    category: 'scripture-reading',
    subgenre: 'Sanctuary & Cloister',
    director: 'Classical Mind',
    councilNote: 'Classical Mind: Authentic Jerusalem ashlar limestone courses and Romanesque stone arcade raked by 3900K afternoon sunbeams.',
    name: 'Jerusalem Stone Courtyard',
    subtitle: 'Warm golden Jerusalem limestone ashlar masonry and courtyard arches',
    description: 'Beveled Jerusalem limestone blocks and courtyard arches bathed in slanted golden afternoon sun, offering timeless architectural grounding.',
    lightingNote: 'Key: Slanted 3900K afternoon sun across golden Jerusalem stone.',
    serviceUse: 'Acts, Pauline Epistles, Psalms of Zion, general scripture reading.',
    palette: ['#14100C', '#30251A', '#D99E4E', '#FAF3E4'],
    audioMappings: [
      ['Swell', 'Shifts warm golden sun across the Jerusalem stone courses'],
      ['Vocal', 'Highlights the recessed arched reading tablet border'],
    ],
    render(rawRc) {
      const rc = withScripture(rawRc, 1);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.3, params.motion);
      drawSanctuaryBg(ctx, w, h, '#120E0A', '#2B2117', '#16110C', params.warmth);
      drawAshlarMasonry(ctx, w, h, '#D99E4E', 0.16 + audio.vocal * 0.1);

      drawCathedralArcade(ctx, w, h, {
        bays: 3,
        pointed: false,
        stoneColor: '#2B2117',
        highlightColor: '#E8AC58',
        t,
        vocalEnergy: audio.vocal,
        swellEnergy: audio.swell,
      });

      drawGodRays(ctx, w, h, {
        originX: w * 0.15,
        originY: -h * 0.05,
        angle: Math.PI * 0.35,
        spread: 0.45,
        count: 6,
        color: '#E8AC58',
        intensity: 0.30 + audio.swell * 0.24,
        t: t * spd,
      });

      renderScriptureOverlay(rc, {
        fontFamily: W_SERIF,
        plateStyle: 'arch-tablet',
        accentColor: '#D99E4E',
        textColor: '#FAF3E4',
        plateTint: 'rgba(17, 13, 10, 0.82)',
      });
    },
  },

  // 71. Alpha & Omega Byzantine Codex
  {
    id: 'scripture-71-alpha-omega-codex',
    number: 71,
    category: 'scripture-reading',
    subgenre: 'Illuminated Manuscript',
    director: 'Classical Mind',
    councilNote: 'Classical Mind + World-Eclectic Traveller: 6th-century Codex Purpureus Tyrian purple vellum with imperial gold-and-silver Alpha & Omega medallions and gilded Drop-Cap.',
    name: 'Alpha & Omega Purple Codex',
    subtitle: 'Imperial purple parchment (Codex Rossanensis) with gold & silver ink',
    description: 'Inspired by 6th-century illuminated purple Gospel manuscripts (Codex Purpureus): Tyrian purple vellum inscribed with radiant gold and silver medallions.',
    lightingNote: 'Key: Lectern candle reflecting off gold and silver calligraphy.',
    serviceUse: 'Gospel readings, Revelation ("I am the Alpha and the Omega"), High Feast days.',
    palette: ['#120818', '#2E143D', '#E5B84B', '#FAF5FF'],
    audioMappings: [
      ['Vocal', 'Gleams across the gold and silver Alpha & Omega medallions'],
      ['Swell', 'Deepens the royal Tyrian purple parchment halo'],
    ],
    render(rawRc) {
      const rc = withScripture(rawRc, 3);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.3, params.motion);
      drawSanctuaryBg(ctx, w, h, '#0E0614', '#291138', '#13081A', params.warmth);

      // Alpha & Omega imperial gold medallions on left and right of the codex
      ctx.save();
      const mRad = Math.min(w, h) * 0.048;
      for (const [side, glyph] of [[-1, 'Α'], [1, 'Ω']] as const) {
        const mx = side === -1 ? w * 0.055 : w * 0.945;
        const my = h * 0.5;
        ctx.strokeStyle = hexRgba('#E5B84B', 0.58 + audio.vocal * 0.35);
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(mx, my, mRad, 0, Math.PI * 2);
        ctx.stroke();

        ctx.font = `700 ${mRad * 1.15}px ${W_DISPLAY}`;
        ctx.fillStyle = hexRgba('#FFE082', 0.75 + audio.swell * 0.25);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(glyph, mx, my);
      }
      ctx.restore();

      renderScriptureOverlay(rc, {
        fontFamily: W_SERIF,
        plateStyle: 'gold-bordered',
        showDropCap: true,
        accentColor: '#E5B84B',
        textColor: '#FAF5FF',
        plateTint: 'rgba(16, 8, 24, 0.82)',
      });
    },
  },

  // 72. Compline Night Psalm & Sanctuary Lamp
  {
    id: 'scripture-72-compline-sanctuary-lamp',
    number: 72,
    category: 'scripture-reading',
    subgenre: 'Sanctuary & Cloister',
    director: 'Radical Minimalist',
    councilNote: 'Radical Minimalist + Baroque Dramatist: An ornate suspended ruby-glass chancel lamp on triple brass chains keeping watch in a silent night sanctuary.',
    name: 'Compline Sanctuary Lamp',
    subtitle: 'Suspended ruby-glass chancel lamp on triple brass chains in a night sanctuary',
    description: 'The final design of the 72-work collection: an ornate suspended ruby-and-brass sanctuary lamp burns steadily with rising incense smoke in a quiet night chancel for Compline.',
    lightingNote: 'Key: Single suspended ruby/amber sanctuary lamp at 2500K.',
    serviceUse: 'Compline, Night Prayer, Psalm 91, Psalm 121, closing benediction.',
    palette: ['#09060A', '#240D14', '#D94838', '#F2B85A'],
    audioMappings: [
      ['Vocal', 'Breathes the ruby-and-gold sanctuary lamp flame'],
      ['Swell', 'Gently sways the suspended brass censer lamp & warm halo'],
    ],
    render(rawRc) {
      const rc = withScripture(rawRc, 0);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.25, 1.3, params.motion);
      drawSanctuaryBg(ctx, w, h, '#070508', '#1F0A11', '#0A0609', params.warmth);

      // Ornate suspended brass & ruby-glass chancel lamp at top center
      const lx = w * 0.5 + Math.sin(t * 0.6 * spd) * w * 0.008;
      const ly = h * 0.12;
      drawSanctuaryCenserLamp(ctx, lx, ly, Math.min(w, h) * 0.046, {
        t: t * spd,
        brassColor: '#F2B85A',
        rubyColor: '#D94838',
        vocalEnergy: audio.vocal,
        swellEnergy: audio.swell,
        emitSmoke: true,
      });

      drawMotes(ctx, w, h, {
        count: 30,
        color: '#F2B85A',
        t: t * spd * 0.4,
        riseSpeed: 0.009,
        sway: 0.025,
        sizeRange: [1.4, 3.2],
        glow: 0.50 + audio.vocal * 0.35,
        seed: 7272,
      });

      renderScriptureOverlay(rc, {
        fontFamily: W_SERIF,
        plateStyle: 'arch-tablet',
        accentColor: '#F2B85A',
        textColor: '#FAF2E6',
        plateTint: 'rgba(10, 6, 9, 0.82)',
      });
    },
  },
];
