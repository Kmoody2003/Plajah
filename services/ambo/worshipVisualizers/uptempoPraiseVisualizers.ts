// services/ambo/worshipVisualizers/uptempoPraiseVisualizers.ts
// Collection II: 24 Uptempo Praise, Gospel & Hymnal Lyric Visualizers (Designs #25–48)
// Deeply Art-Directed by the 6-Voice Art Director Council:
// Built for joyful Sunday morning praise, gospel choir, contemporary worship bands,
// and grand pipe-organ hymns — featuring rich architectural/musical/geometric craft.

import {
  WorshipVisualizerDef,
  UPTEMPO_PRAISE_LYRICS,
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
  drawSacredAstrolabe,
  drawSanctuaryCenserLamp,
  applySanctuaryFinish,
  renderWorshipLyrics,
  buildWorshipLyricFrame,
} from './types';

function withPraiseLyrics(rc: Parameters<WorshipVisualizerDef['render']>[0]) {
  if (rc.lyricFrame) return rc;
  return {
    ...rc,
    lyricFrame: buildWorshipLyricFrame(UPTEMPO_PRAISE_LYRICS, rc.t % 19.2, rc.w, rc.h, {
      title: 'Praise God From Whom All Blessings Flow',
      artist: 'Sanctuary Praise & Mass Choir',
      bpm: 122,
    }),
  };
}

export const UPTEMPO_PRAISE_VISUALIZERS: WorshipVisualizerDef[] = [
  // 25. Gospel Morning Sunburst (Gemini Concept Plate #2 Twin)
  {
    id: 'praise-25-gospel-morning-sunburst',
    number: 25,
    category: 'uptempo-lyric',
    subgenre: 'Gospel & Choir',
    director: 'Baroque Dramatist',
    name: 'Gospel Morning Sunburst',
    subtitle: 'Radiant spun-gold cathedral sunbeams, crown rose window, and stained-glass ribbons',
    description: 'Interactive code twin of the Gospel Sunburst concept plate: a glowing upper rose oculus pours out 16 radial sunbeams on the downbeat while sapphire and amber stained-glass ribbons dance to choir harmonies.',
    lightingNote: 'Key: Warm 3800K radial sunburst balanced by royal sapphire glass bounce.',
    serviceUse: 'Opening praise anthem, Gospel choir celebratory songs, Easter Sunday.',
    palette: ['#0E1428', '#1F3B7A', '#F2A93B', '#FFF7E0'],
    conceptImage: '/sanctuary-plates/praise-gospel-sunburst.jpg',
    audioMappings: [
      ['Pulse', 'Expands warm spun-gold radial sunbeams on every beat'],
      ['Clap', 'Triggers joyous golden ring ripples from the sanctuary crown'],
      ['Vocal', 'Lifts sapphire and amber stained-glass light ribbons'],
    ],
    render(rawRc) {
      const rc = withPraiseLyrics(rawRc);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.5, 1.6, params.motion);
      drawSanctuaryBg(ctx, w, h, '#090E20', '#1B2E63', '#2B1D19', params.warmth);

      // Crown rose window at upper center
      drawGothicRoseWindow(ctx, w * 0.5, h * 0.16, Math.min(w, h) * 0.22, {
        petals: 12,
        t: t * spd,
        palette: ['#FFB84D', '#3B82F6', '#EC4899'],
        leadColor: '#FFE39E',
        vocalEnergy: audio.vocal,
        swellEnergy: audio.swell,
        pulseEnergy: audio.pulse,
        causticThrow: false,
      });

      // Radial spun-gold sunburst from upper center
      drawGodRays(ctx, w, h, {
        originX: w * 0.5,
        originY: h * 0.16,
        angle: Math.PI * 0.5,
        spread: 1.5,
        count: 16,
        color: '#FFB84D',
        intensity: 0.46 + audio.pulse * 0.38,
        t: t * spd * 1.4,
      });

      // Celebratory stained-glass light ribbons on left & right
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 8; i++) {
        const isRight = i % 2 === 1;
        const col = i % 3 === 0 ? '#3B7CFF' : i % 3 === 1 ? '#FFB03A' : '#E04868';
        const bandVal = audio.bands[i * 2] ?? audio.vocal;
        ctx.beginPath();
        for (let y = 0; y <= h; y += 18) {
          const ny = y / h;
          const base = isRight ? w * (0.78 + (i >> 1) * 0.045) : w * (0.22 - (i >> 1) * 0.045);
          const wave = Math.sin(ny * 5 - t * 2.2 * spd + i) * w * (0.03 + bandVal * 0.04);
          const x = base + wave;
          if (y === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = hexRgba(col, 0.28 + bandVal * 0.28);
        ctx.lineWidth = w * 0.026;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Rhythmic clap/beat halo rings
      for (let r = 0; r < 4; r++) {
        const p = ((audio.beatPhase + r / 4) % 1);
        const rad = Math.min(w, h) * (0.12 + p * 0.58);
        ctx.strokeStyle = hexRgba('#FFE299', (1 - p) * (0.28 + audio.clap * 0.45));
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.16, rad, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      drawMotes(ctx, w, h, {
        count: 58,
        color: '#FFD470',
        t: t * spd * 1.4,
        riseSpeed: 0.055,
        sway: 0.05,
        sizeRange: [2.0, 5.2],
        glow: 0.68 + audio.pulse * 0.32,
        seed: 2525,
      });

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.52);
      renderWorshipLyrics(rc, {
        fontFamily: W_SANS,
        fontWeight: 700,
        mode: 'praise-banner',
        primaryColor: '#FFFDF7',
        sungColor: '#FFD25A',
        accentColor: '#F2A93B',
      });
    },
  },

  // 26. Cathedral Pipe Organ Resonance (Gemini Concept Plate #5 Twin)
  {
    id: 'praise-26-cathedral-pipe-organ',
    number: 26,
    category: 'uptempo-lyric',
    subgenre: 'Hymnal & Pipe Organ',
    director: 'Classical Mind',
    name: 'Cathedral Pipe Organ Resonance',
    subtitle: '3D cylindrical brass organ pipes, bay-leaf mouths, and Gothic rose window',
    description: 'Interactive code twin of the Hymnal Organ Gold concept plate: symmetrical ranks of cylindrical brushed-brass cathedral organ pipes with sculpted mouths and walnut casework glow in real time with the 16-band harmonic spectrum.',
    lightingNote: 'Key: Warm 3500K brass pipe reflections + sapphire rose backlight.',
    serviceUse: 'Traditional hymns, festival preludes, organ & brass anthems, Doxology.',
    palette: ['#0B0D18', '#1E2C4F', '#D99B38', '#FFF2CC'],
    conceptImage: '/sanctuary-plates/praise-hymnal-organ-gold.jpg',
    audioMappings: [
      ['Harmonic', 'Illuminates individual brass organ pipes across 16 frequency ranks'],
      ['Pulse', 'Expands warm acoustic soundwaves from the central rose window'],
      ['Bass', 'Drives the tall outer 32-foot pedal division pipes'],
    ],
    render(rawRc) {
      const rc = withPraiseLyrics(rawRc);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.5, 1.6, params.motion);
      drawSanctuaryBg(ctx, w, h, '#080A14', '#16203B', '#1C1410', params.warmth);

      // Central Gothic Rose Window behind the organ division
      drawGothicRoseWindow(ctx, w * 0.5, h * 0.30, Math.min(w, h) * 0.28, {
        petals: 12,
        t: t * spd * 0.6,
        palette: ['#2563EB', '#F59E0B', '#DC2626', '#10B981'],
        leadColor: '#FFD670',
        vocalEnergy: audio.vocal,
        swellEnergy: audio.swell,
        pulseEnergy: audio.pulse,
        causticThrow: true,
      });

      // Symmetrical ranks of 3D cylindrical brushed-gold organ pipes on left & right wings
      const pipeCountPerSide = 14;
      for (const side of [-1, 1]) {
        for (let i = 0; i < pipeCountPerSide; i++) {
          const norm = i / (pipeCountPerSide - 1);
          const px = side === -1
            ? w * (0.04 + norm * 0.29)
            : w - w * (0.04 + norm * 0.29);
          const pipeW = w * 0.015;
          const pipeH = h * (0.74 - norm * 0.34);
          const py = h * 0.88 - pipeH;
          const bandEnergy = audio.bands[i % 16] ?? audio.harmonic;
          const activeH = pipeH * (0.35 + bandEnergy * 0.65);

          // Cylindrical 3D metallic brass pipe body
          const pg = ctx.createLinearGradient(px - pipeW / 2, 0, px + pipeW / 2, 0);
          pg.addColorStop(0, '#291A0A');
          pg.addColorStop(0.35, mixHex('#9E6F2B', '#FFE08A', bandEnergy));
          pg.addColorStop(0.55, '#FFF5D6');
          pg.addColorStop(1, '#1F1307');
          ctx.fillStyle = pg;
          ctx.fillRect(px - pipeW / 2, py, pipeW, pipeH);

          // Conical top cap & lower bay-leaf mouth bevel
          const mouthY = h * 0.80 - norm * h * 0.04;
          ctx.fillStyle = '#140B04';
          ctx.fillRect(px - pipeW * 0.42, mouthY, pipeW * 0.84, h * 0.008);

          // Resonant light column rising inside pipe
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          const lg = ctx.createLinearGradient(0, py + pipeH - activeH, 0, py + pipeH);
          lg.addColorStop(0, 'rgba(255,230,150,0)');
          lg.addColorStop(0.5, hexRgba('#FFD46B', 0.38 * bandEnergy));
          lg.addColorStop(1, hexRgba('#FFF4D4', 0.72 * bandEnergy));
          ctx.fillStyle = lg;
          ctx.fillRect(px - pipeW * 0.45, py + pipeH - activeH, pipeW * 0.9, activeH);
          ctx.restore();
        }
      }

      // Carved walnut & gold organ chest base at bottom
      ctx.fillStyle = '#160D07';
      ctx.fillRect(0, h * 0.88, w, h * 0.12);
      ctx.strokeStyle = hexRgba('#D99B38', 0.65);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.88);
      ctx.lineTo(w, h * 0.88);
      ctx.stroke();

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.52);
      renderWorshipLyrics(rc, {
        fontFamily: W_SERIF,
        fontWeight: 600,
        mode: 'hymnal-stanza',
        primaryColor: '#FFF9EB',
        sungColor: '#FFD66B',
        accentColor: '#D99B38',
      });
    },
  },

  // 27. Joyful Choir Riser Harmonics
  {
    id: 'praise-27-choir-riser-harmonics',
    number: 27,
    category: 'uptempo-lyric',
    subgenre: 'Gospel & Choir',
    director: 'World-Eclectic Traveller',
    name: 'Joyful Choir Riser Harmonics',
    subtitle: 'Curved amphitheater choir tiers and theatrical stage spotlights',
    description: 'Five concentric amphitheater choir tiers and overhead theatrical spotlights light up in sweeping stereo waves as soprano, alto, tenor, and bass harmonies swell.',
    lightingNote: 'Key: Warm theatrical uplights in amber, coral-rose, and royal purple.',
    serviceUse: 'Gospel choir anthems, praise team openers, call-and-response songs.',
    palette: ['#120B1D', '#3D1E54', '#E86F48', '#FFD466'],
    conceptImage: '/sanctuary-plates/praise-prism-anamorphic-gold.jpg',
    audioMappings: [
      ['Vocal', 'Sweeps glowing harmonic arcs across the 5 curved choir tiers'],
      ['Pulse', 'Bounces tier thickness and overhead stage beams on every beat'],
      ['Clap', 'Sparks warm champagne light bursts along the top tier'],
    ],
    render(rawRc) {
      const rc = withPraiseLyrics(rawRc);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.5, 1.6, params.motion);
      drawSanctuaryBg(ctx, w, h, '#0D0717', '#2E1442', '#1C0E24', params.warmth);

      // Overhead theatrical truss spotlights
      drawGodRays(ctx, w, h, {
        originX: w * 0.5,
        originY: -h * 0.05,
        angle: Math.PI * 0.5,
        spread: 1.25,
        count: 9,
        color: '#E86F48',
        intensity: 0.30 + audio.pulse * 0.28,
        t: t * spd,
      });

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const tiers = 5;
      for (let tr = 0; tr < tiers; tr++) {
        const y = h * (0.60 + tr * 0.075);
        const segs = 18;
        for (let s = 0; s < segs; s++) {
          const norm = (s + 0.5) / segs - 0.5;
          const x = w * 0.5 + norm * w * (0.76 + tr * 0.05);
          const curveY = y + Math.pow(norm * 2, 2) * h * 0.065 - audio.pulse * h * 0.016;
          const energy = audio.bands[s % 16] ?? audio.vocal;
          const col = tr % 2 === 0 ? '#FFB84D' : '#F26452';
          ctx.fillStyle = hexRgba(col, 0.32 + energy * 0.65);
          ctx.beginPath();
          if ((ctx as any).roundRect) {
            (ctx as any).roundRect(x - w * 0.018, curveY - h * 0.014 * (1 + energy), w * 0.036, h * 0.020 * (1 + energy), 6);
          } else {
            ctx.rect(x - w * 0.018, curveY - h * 0.014 * (1 + energy), w * 0.036, h * 0.020 * (1 + energy));
          }
          ctx.fill();
        }
      }
      ctx.restore();

      drawMotes(ctx, w, h, {
        count: 52,
        color: '#FFD466',
        t: t * spd * 1.3,
        riseSpeed: 0.05,
        sway: 0.06,
        sizeRange: [2, 5],
        glow: 0.65 + audio.clap * 0.35,
        seed: 2727,
      });

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.44);
      renderWorshipLyrics(rc, {
        fontFamily: W_SANS,
        fontWeight: 700,
        yRatio: 0.44,
        mode: 'choir-anthem',
        primaryColor: '#FFF9F2',
        sungColor: '#FFD466',
        accentColor: '#E86F48',
      });
    },
  },

  // 28. Stained Glass Kaleidoscope Rosette
  {
    id: 'praise-28-stained-glass-kaleidoscope',
    number: 28,
    category: 'uptempo-lyric',
    subgenre: 'Hymnal & Pipe Organ',
    director: 'Classical Mind',
    name: 'Stained Glass Kaleidoscope',
    subtitle: 'Sixteen-fold Gothic jewel rosette blooming rhythmically on the beat',
    description: 'A vibrant sixteen-fold cathedral stained-glass mandala of ruby, sapphire, emerald, and gold expands its leaded facets rhythmically with the tempo.',
    lightingNote: 'Key: Backlit jewel-toned stained glass at high festival brightness.',
    serviceUse: 'Upbeat hymns ("Crown Him With Many Crowns"), Easter, festival praise.',
    palette: ['#0A0C18', '#1D4ED8', '#DC2626', '#F59E0B'],
    audioMappings: [
      ['Pulse', 'Blooms the 16 stained-glass petal rings outward on the beat'],
      ['Harmonic', 'Cycles jewel-glass luminance across ruby, emerald, and gold'],
      ['Clap', 'Brightens the central golden rosette star'],
    ],
    render(rawRc) {
      const rc = withPraiseLyrics(rawRc);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.5, 1.6, params.motion);
      drawSanctuaryBg(ctx, w, h, '#080A14', '#111A33', '#090B14', params.warmth);

      const cx = w * 0.5, cy = h * 0.5;
      const baseR = Math.min(w, h) * (0.44 + audio.pulse * 0.06);

      drawGothicRoseWindow(ctx, cx, cy, baseR, {
        petals: 16,
        t: t * spd * 1.4,
        palette: ['#F59E0B', '#DC2626', '#2563EB', '#10B981'],
        leadColor: '#FFE49E',
        vocalEnergy: audio.vocal,
        swellEnergy: audio.swell,
        pulseEnergy: audio.pulse,
        causticThrow: true,
      });

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SERIF,
        fontWeight: 700,
        mode: 'praise-banner',
        primaryColor: '#FFFDF8',
        sungColor: '#FFD666',
        accentColor: '#F59E0B',
      });
    },
  },

  // 29. Hallelujah Silk Ribbons
  {
    id: 'praise-29-hallelujah-silk-ribbons',
    number: 29,
    category: 'uptempo-lyric',
    subgenre: 'Joyful Praise',
    director: 'Rebellious Hand',
    name: 'Hallelujah Silk Ribbons',
    subtitle: 'Swirling celebratory banners of gold, coral, and royal azure in 4/4 time',
    description: 'Inspired by liturgical praise banners and festival ribbons: sweeping streams of gold, warm coral, and royal azure dance across the stage with golden selvedge edges.',
    lightingNote: 'Key: High-key stage wash in warm amber and royal azure.',
    serviceUse: 'Contemporary praise openers, youth & family worship, celebration sets.',
    palette: ['#0D1024', '#26468A', '#F26B4E', '#FFCA52'],
    audioMappings: [
      ['Pulse', 'Drives the rhythmic wave crest amplitude of the silk banners'],
      ['Vocal', 'Widens the golden core ribbon & selvedge highlights'],
      ['Shimmer', 'Trails sparkling gold dust along ribbon edges'],
    ],
    render(rawRc) {
      const rc = withPraiseLyrics(rawRc);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.5, 1.6, params.motion);
      drawSanctuaryBg(ctx, w, h, '#0A0D1E', '#182A57', '#121024', params.warmth);

      const colors = ['#FFCA52', '#F26B4E', '#3882F6', '#A855F7', '#FFD97D'];
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let r = 0; r < 5; r++) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 12) {
          const nx = x / w;
          const amp = h * (0.095 + audio.pulse * 0.075);
          const y =
            h * (0.24 + r * 0.125) +
            Math.sin(nx * 5.5 - t * 2.4 * spd + r * 1.1) * amp +
            Math.cos(nx * 3.0 + t * 1.5 * spd) * h * 0.04;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = hexRgba(colors[r], 0.46 + audio.vocal * 0.32);
        ctx.lineWidth = h * (0.028 + audio.pulse * 0.012);
        ctx.lineCap = 'round';
        ctx.stroke();

        // Bright golden filament along the center of each ribbon
        ctx.strokeStyle = hexRgba('#FFF6D6', 0.45 + audio.clap * 0.35);
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      ctx.restore();

      drawMotes(ctx, w, h, {
        count: 45,
        color: '#FFD97D',
        t: t * spd * 1.5,
        riseSpeed: 0.045,
        sway: 0.07,
        sizeRange: [1.8, 4.6],
        glow: 0.6 + audio.shimmer * 0.35,
        seed: 2929,
      });

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SANS,
        fontWeight: 700,
        mode: 'praise-banner',
        primaryColor: '#FFFFFF',
        sungColor: '#FFCA52',
        accentColor: '#F26B4E',
      });
    },
  },

  // 30. Pentecost Ascending Embers
  {
    id: 'praise-30-pentecost-ascending-embers',
    number: 30,
    category: 'uptempo-lyric',
    subgenre: 'Acoustic & Revival',
    director: 'World-Eclectic Traveller',
    name: 'Pentecost Ascending Embers',
    subtitle: 'Swirling updraft of warm golden fire tongues and rushing wind streams',
    description: 'Celebratory tongues of warm golden-amber flame and glowing embers spiral upward on a rushing wind current driven by drums and vocals.',
    lightingNote: 'Key: Warm 3000K firelight updraft from stage floor.',
    serviceUse: 'Pentecost, revival nights, Holy Spirit praise anthems.',
    palette: ['#140806', '#47180E', '#F27D24', '#FFE89E'],
    audioMappings: [
      ['Pulse', 'Surges the upward velocity of golden fire embers on the beat'],
      ['Vocal', 'Swirls warm flame ribbons around the stage perimeter'],
      ['Clap', 'Ignites bright amber spark bursts'],
    ],
    render(rawRc) {
      const rc = withPraiseLyrics(rawRc);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.5, 1.6, params.motion);
      drawSanctuaryBg(ctx, w, h, '#100605', '#33110A', '#521E0E', params.warmth);

      // Lower hearth fire glow
      const fg = ctx.createRadialGradient(w * 0.5, h, 0, w * 0.5, h, w * 0.65);
      fg.addColorStop(0, hexRgba('#FFE394', 0.65 + audio.pulse * 0.25));
      fg.addColorStop(0.45, hexRgba('#F26D21', 0.35));
      fg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fg;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let f = 0; f < 11; f++) {
        const bx = w * (0.08 + (f / 10) * 0.84);
        ctx.beginPath();
        for (let y = h; y >= h * 0.12; y -= 16) {
          const prog = 1 - y / h;
          const sway = Math.sin(prog * 6.5 - t * 3.2 * spd + f * 1.3) * w * 0.048 * prog;
          const x = bx + sway;
          if (y === h) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = hexRgba(f % 2 === 0 ? '#FF9D3B' : '#E84A27', 0.28 + audio.pulse * 0.28);
        ctx.lineWidth = w * 0.030;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      ctx.restore();

      drawMotes(ctx, w, h, {
        count: 82,
        color: '#FFBF47',
        t: t * spd * 2.2,
        riseSpeed: 0.095,
        sway: 0.08,
        sizeRange: [2.0, 5.5],
        glow: 0.78 + audio.clap * 0.22,
        seed: 3030,
      });

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SANS,
        fontWeight: 700,
        mode: 'choir-anthem',
        primaryColor: '#FFF9ED',
        sungColor: '#FFD166',
        accentColor: '#F27D24',
      });
    },
  },

  // 31. Palm Sunday Hosanna Fronds
  {
    id: 'praise-31-palm-sunday-hosanna',
    number: 31,
    category: 'uptempo-lyric',
    subgenre: 'Joyful Praise',
    director: 'World-Eclectic Traveller',
    name: 'Palm Sunday Hosanna',
    subtitle: 'Jerusalem Golden Gate limestone arch and waving emerald palm fronds',
    description: 'Golden Jerusalem sunlight streams through a carved limestone gate past waving emerald-and-gold palm branches that sway rhythmically to "Hosanna in the Highest."',
    lightingNote: 'Key: Bright 4800K morning sun through emerald palm fronds.',
    serviceUse: 'Palm Sunday, triumphal entry, Hosanna praise songs, children & family services.',
    palette: ['#081A14', '#164A36', '#8CD95B', '#FFE27A'],
    audioMappings: [
      ['Pulse', 'Waves the sunlit palm fronds in 4/4 procession rhythm'],
      ['Swell', 'Brightens golden Jerusalem sunbeams from the upper arch'],
      ['Vocal', 'Highlights emerald-gold leaf edges'],
    ],
    render(rawRc) {
      const rc = withPraiseLyrics(rawRc);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.5, 1.6, params.motion);
      drawSanctuaryBg(ctx, w, h, '#071711', '#143D2C', '#1D331E', params.warmth);
      drawAshlarMasonry(ctx, w, h, '#8CD95B', 0.08);

      drawGodRays(ctx, w, h, {
        originX: w * 0.5,
        originY: -h * 0.06,
        angle: Math.PI * 0.5,
        spread: 1.15,
        count: 11,
        color: '#FFE07D',
        intensity: 0.40 + audio.pulse * 0.32,
        t: t * spd,
      });

      for (const side of [-1, 1]) {
        for (let p = 0; p < 5; p++) {
          const baseX = side === -1 ? -w * 0.02 : w * 1.02;
          const baseY = h * (0.22 + p * 0.16);
          const wave = Math.sin(t * 2.4 * spd + p * 0.9) * (0.13 + audio.pulse * 0.11);
          const angle = (side === -1 ? -0.22 : Math.PI + 0.22) + side * wave;

          ctx.save();
          ctx.translate(baseX, baseY);
          ctx.rotate(angle);
          const frondLen = w * 0.30;
          ctx.strokeStyle = hexRgba('#D4F082', 0.65 + audio.vocal * 0.3);
          ctx.lineWidth = 3.2;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(frondLen * 0.5, -h * 0.04, frondLen, 0);
          ctx.stroke();

          for (let lf = 1; lf <= 11; lf++) {
            const lx = (lf / 12) * frondLen;
            const lw = (1 - lf / 14) * h * 0.048;
            ctx.fillStyle = hexRgba(lf % 2 === 0 ? '#85D962' : '#2D7A4C', 0.65);
            ctx.beginPath();
            ctx.ellipse(lx, -lw * 0.6, lw * 0.22, lw, 0.38, 0, Math.PI * 2);
            ctx.ellipse(lx, lw * 0.6, lw * 0.22, lw, -0.38, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      }

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SANS,
        fontWeight: 700,
        mode: 'praise-banner',
        primaryColor: '#FAFDF6',
        sungColor: '#FFE27A',
        accentColor: '#8CD95B',
      });
    },
  },

  // 32. Brass Fanfare & Golden Rings
  {
    id: 'praise-32-brass-fanfare-rings',
    number: 32,
    category: 'uptempo-lyric',
    subgenre: 'Hymnal & Pipe Organ',
    director: 'Classical Mind',
    name: 'Brass Fanfare & Golden Rings',
    subtitle: 'Concentric polished-brass acoustic rings and engraved astrolabe verniers',
    description: 'Polished symphonic brass rings, vernier degree ticks, and warm golden acoustic waves radiate outward in festive symmetry for horn-driven praise and festival hymns.',
    lightingNote: 'Key: Specular 3600K brushed brass highlights over deep royal crimson.',
    serviceUse: 'Easter brass, Reformation/Festival hymns, Psalm 150 ("praise Him with trumpet sound").',
    palette: ['#18080C', '#4A121E', '#E5A93B', '#FFF5D6'],
    audioMappings: [
      ['Pulse', 'Punches concentric polished-brass rings outward in 3D relief'],
      ['Harmonic', 'Rotates notched crown segments along each brass ring'],
      ['Clap', 'Flashes warm specular gold highlights across the crown'],
    ],
    render(rawRc) {
      const rc = withPraiseLyrics(rawRc);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.5, 1.6, params.motion);
      drawSanctuaryBg(ctx, w, h, '#14060A', '#3E0F1B', '#1A080C', params.warmth);

      const cx = w * 0.5, cy = h * 0.5;
      drawSacredAstrolabe(ctx, cx, cy, Math.min(w, h) * 0.45, {
        t: t * spd * 1.4,
        primaryColor: '#FFD269',
        secondaryColor: '#E59435',
        vocalEnergy: audio.vocal,
        swellEnergy: audio.swell,
        showStar: false,
      });

      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalCompositeOperation = 'screen';
      for (let r = 1; r <= 6; r++) {
        const band = audio.bands[(r * 2) % 16] ?? audio.pulse;
        const rad = Math.min(w, h) * (0.085 * r + audio.pulse * 0.025);
        ctx.save();
        ctx.rotate((r % 2 === 0 ? 1 : -1) * t * 0.24 * spd);
        ctx.strokeStyle = hexRgba(r % 2 === 0 ? '#FFD269' : '#E59435', 0.35 + band * 0.45);
        ctx.lineWidth = Math.max(2, h * (0.006 + band * 0.008));
        ctx.setLineDash([rad * 0.35, rad * 0.12]);
        ctx.beginPath();
        ctx.arc(0, 0, rad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SERIF,
        fontWeight: 700,
        mode: 'hymnal-stanza',
        primaryColor: '#FFF9ED',
        sungColor: '#FFD666',
        accentColor: '#E5A93B',
      });
    },
  },

  // 33. Acoustic Timber & Warm Edison Bulbs
  {
    id: 'praise-33-acoustic-timber-edison',
    number: 33,
    category: 'uptempo-lyric',
    subgenre: 'Acoustic & Revival',
    director: 'Rebellious Hand',
    name: 'Acoustic Timber & Edison Canopy',
    subtitle: 'Warm cedar slat stage backdrop with glowing tungsten filament festoons',
    description: 'Modern rustic church stage aesthetic: warm vertical cedar wood slats and catenary strings of 2700K Edison bulbs with glowing tungsten filaments.',
    lightingNote: 'Key: Warm 2700K tungsten filament bulbs + cedar wood bounce.',
    serviceUse: 'Acoustic worship, camp/retreat praise, modern folk-hymn arrangements.',
    palette: ['#120B07', '#331D11', '#E89238', '#FFF2CC'],
    audioMappings: [
      ['Pulse', 'Brightens the hanging Edison tungsten bulb filaments on every beat'],
      ['Vocal', 'Warms the vertical cedar slat bounce illumination'],
      ['Shimmer', 'Adds soft golden lens flare halos around each bulb'],
    ],
    render(rawRc) {
      const rc = withPraiseLyrics(rawRc);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.5, 1.6, params.motion);
      drawSanctuaryBg(ctx, w, h, '#100906', '#2C180D', '#170D08', params.warmth);

      // Vertical cedar timber slats with beveled shadow gaps
      const slats = 24;
      const slatW = w / slats;
      for (let i = 0; i < slats; i++) {
        const band = audio.bands[i % 16] ?? 0.4;
        const sg = ctx.createLinearGradient(i * slatW, 0, (i + 1) * slatW, 0);
        sg.addColorStop(0, hexRgba('#3D200E', 0.45));
        sg.addColorStop(0.5, hexRgba('#7A4421', 0.28 + band * 0.28));
        sg.addColorStop(1, 'rgba(10, 5, 2, 0.7)');
        ctx.fillStyle = sg;
        ctx.fillRect(i * slatW + slatW * 0.12, 0, slatW * 0.76, h);
      }

      // Festooned Edison bulb strings with visible glass envelopes & glowing filaments
      ctx.save();
      for (let row = 0; row < 2; row++) {
        const bulbs = 11;
        // Catenary wire cord
        ctx.strokeStyle = 'rgba(255, 210, 150, 0.25)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 20) {
          const nx = x / w;
          const sag = Math.sin(nx * Math.PI) * h * 0.12;
          const wy = h * (0.06 + row * 0.11) + sag;
          if (x === 0) ctx.moveTo(x, wy);
          else ctx.lineTo(x, wy);
        }
        ctx.stroke();

        ctx.globalCompositeOperation = 'screen';
        for (let b = 0; b < bulbs; b++) {
          const nx = (b + 0.5) / bulbs;
          const bx = nx * w;
          const sag = Math.sin(nx * Math.PI) * h * 0.12;
          const by = h * (0.08 + row * 0.11) + sag + Math.sin(t * 1.8 * spd + b) * h * 0.006;
          const glow = 0.58 + audio.pulse * 0.42 + (b % 2 === 0 ? audio.clap * 0.25 : 0);
          const rad = Math.min(w, h) * (0.06 + glow * 0.032);

          const g = ctx.createRadialGradient(bx, by, 0, bx, by, rad);
          g.addColorStop(0, hexRgba('#FFF8DE', glow));
          g.addColorStop(0.32, hexRgba('#F29A38', glow * 0.65));
          g.addColorStop(1, 'rgba(242,154,56,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(bx, by, rad, 0, Math.PI * 2);
          ctx.fill();

          // Bright tungsten filament core
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.ellipse(bx, by, 2.5, 4.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.54);
      renderWorshipLyrics(rc, {
        fontFamily: W_SANS,
        fontWeight: 600,
        yRatio: 0.54,
        mode: 'praise-banner',
        primaryColor: '#FFF9EB',
        sungColor: '#FFD166',
        accentColor: '#E89238',
      });
    },
  },

  // 34. Hymnal Four-Part Staff Ribbons
  {
    id: 'praise-34-hymnal-staff-ribbons',
    number: 34,
    category: 'uptempo-lyric',
    subgenre: 'Hymnal & Pipe Organ',
    director: 'Classical Mind',
    name: 'Hymnal Four-Part Staff',
    subtitle: 'Living five-line golden musical staves with stemmed four-part harmony notes',
    description: 'Five luminous golden staff lines undulate across an Oxford-navy hymnal field while stemmed Soprano, Alto, Tenor, and Bass notes dance along the melody.',
    lightingNote: 'Key: Gold-leaf staff lines over deep Oxford-navy hymnal cloth.',
    serviceUse: 'Classic congregational hymns, choir specials, music ministry Sundays.',
    palette: ['#0A101E', '#182847', '#D9A74A', '#FAF4E4'],
    audioMappings: [
      ['Harmonic', 'Drives Soprano, Alto, Tenor, and Bass stemmed notes along the staff'],
      ['Pulse', 'Pulses vertical measure bars in 4/4 hymn meter'],
      ['Vocal', 'Illuminates the 5 golden staff lines'],
    ],
    render(rawRc) {
      const rc = withPraiseLyrics(rawRc);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.5, 1.6, params.motion);
      drawSanctuaryBg(ctx, w, h, '#080D1A', '#14223D', '#0B1221', params.warmth);

      ctx.save();
      for (const staffCenter of [h * 0.20, h * 0.80]) {
        for (let line = -2; line <= 2; line++) {
          const ly = staffCenter + line * h * 0.016;
          ctx.strokeStyle = hexRgba('#D9A74A', 0.36 + audio.vocal * 0.28);
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          for (let x = 0; x <= w; x += 18) {
            const wy = ly + Math.sin(x * 0.004 - t * 2.0 * spd) * h * (0.012 + audio.pulse * 0.01);
            if (x === 0) ctx.moveTo(x, wy);
            else ctx.lineTo(x, wy);
          }
          ctx.stroke();
        }

        // Stemmed musical quarter/eighth notes travelling along the staff
        ctx.globalCompositeOperation = 'screen';
        for (let n = 0; n < 9; n++) {
          const nx = ((n / 9 + t * 0.08 * spd) % 1) * w;
          const stepOffset = ((n * 3) % 5) - 2;
          const ny =
            staffCenter +
            stepOffset * h * 0.016 +
            Math.sin(nx * 0.004 - t * 2.0 * spd) * h * 0.012;
          const r = Math.min(w, h) * (0.012 + audio.pulse * 0.005);
          ctx.fillStyle = hexRgba('#FFE394', 0.85);
          ctx.strokeStyle = hexRgba('#FFE394', 0.85);
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.ellipse(nx, ny, r * 1.25, r * 0.9, -0.28, 0, Math.PI * 2);
          ctx.fill();
          // Vertical note stem
          ctx.beginPath();
          ctx.moveTo(nx + r * 1.1, ny);
          ctx.lineTo(nx + r * 1.1, ny - r * 3.8);
          ctx.stroke();
        }
      }
      ctx.restore();

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SERIF,
        fontWeight: 600,
        mode: 'hymnal-stanza',
        primaryColor: '#FAF4E4',
        sungColor: '#FFD978',
        accentColor: '#D9A74A',
      });
    },
  },

  // 35. Joyful Handclap Ripple Wave
  {
    id: 'praise-35-handclap-ripple-wave',
    number: 35,
    category: 'uptempo-lyric',
    subgenre: 'Gospel & Choir',
    director: 'Futurist',
    name: 'Joyful Handclap Ripple Wave',
    subtitle: 'Bilateral rhythmic shock-rings and warm gold tambourine sparkles',
    description: 'Built for upbeat congregation handclap songs ("Clap your hands, all ye people"): left and right acoustic wave emitters fire warm golden ripples that meet in harmonic interference.',
    lightingNote: 'Key: Dual bilateral amber/cyan stage washes meeting in warm gold.',
    serviceUse: 'Upbeat praise & worship, Psalm 47, congregation participation songs.',
    palette: ['#0C1224', '#1E3F66', '#F29F38', '#FFF8E6'],
    audioMappings: [
      ['Clap', 'Launches crisp golden concentric wave rings from both sides'],
      ['Pulse', 'Pulses the central harmonic interference crest'],
      ['Shimmer', 'Scatters tambourine brass sparkles'],
    ],
    render(rawRc) {
      const rc = withPraiseLyrics(rawRc);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.5, 1.6, params.motion);
      drawSanctuaryBg(ctx, w, h, '#090E1C', '#162D4C', '#0C1424', params.warmth);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const cx of [w * 0.18, w * 0.82]) {
        for (let r = 0; r < 7; r++) {
          const p = ((t * 0.55 * spd + r / 7) % 1);
          const rad = p * w * 0.58;
          ctx.strokeStyle = hexRgba(r % 2 === 0 ? '#FFB84D' : '#5CE1E6', (1 - p) * (0.38 + audio.clap * 0.45 + audio.pulse * 0.2));
          ctx.lineWidth = Math.max(2, h * 0.0055 * (1 - p * 0.5));
          ctx.beginPath();
          ctx.arc(cx, h * 0.5, rad, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();

      drawMotes(ctx, w, h, {
        count: 50,
        color: '#FFD15C',
        t: t * spd * 1.4,
        riseSpeed: 0.05,
        sway: 0.06,
        sizeRange: [2, 5],
        glow: 0.65 + audio.clap * 0.35,
        seed: 3535,
      });

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SANS,
        fontWeight: 700,
        mode: 'word-sweep',
        primaryColor: '#FFFFFF',
        sungColor: '#FFD15C',
        accentColor: '#F29F38',
      });
    },
  },

  // 36. Crown Him Royal Diadem
  {
    id: 'praise-36-crown-him-diadem',
    number: 36,
    category: 'uptempo-lyric',
    subgenre: 'Hymnal & Pipe Organ',
    director: 'Classical Mind',
    name: 'Crown Him Royal Diadem',
    subtitle: 'Regal purple Gothic vaulting with ascending burnished-gold crown spires',
    description: 'Royal Byzantine purple Gothic arches frame eleven ascending burnished-gold diadem spires tipped with glowing jewels that rise with every chorus.',
    lightingNote: 'Key: Royal amethyst wash + 3500K burnished gold spires.',
    serviceUse: 'Christ the King, Ascension, "Crown Him With Many Crowns", majesty anthems.',
    palette: ['#11081C', '#341654', '#E5B03B', '#FFF7E0'],
    audioMappings: [
      ['Pulse', 'Extends golden crown spires skyward on the beat'],
      ['Harmonic', 'Deepens the royal amethyst velvet wash & Gothic arches'],
      ['Vocal', 'Brightens jewel highlights along the crown rim'],
    ],
    render(rawRc) {
      const rc = withPraiseLyrics(rawRc);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.5, 1.6, params.motion);
      drawSanctuaryBg(ctx, w, h, '#0D0517', '#2D114A', '#160926', params.warmth);

      drawCathedralArcade(ctx, w, h, {
        bays: 4,
        pointed: true,
        stoneColor: '#281140',
        highlightColor: '#E5B03B',
        t,
        vocalEnergy: audio.vocal,
        swellEnergy: audio.swell,
      });

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const points = 11;
      for (let i = 0; i < points; i++) {
        const norm = i / (points - 1) - 0.5;
        const bx = w * 0.5 + norm * w * 0.78;
        const spireH = h * (0.48 - Math.abs(norm) * 0.35 + audio.pulse * 0.14 + (audio.bands[i] ?? 0) * 0.1);
        const by = h * 0.84;

        const g = ctx.createLinearGradient(bx, by - spireH, bx, by);
        g.addColorStop(0, hexRgba('#FFF2BD', 0.78));
        g.addColorStop(0.5, hexRgba('#E5B03B', 0.42));
        g.addColorStop(1, 'rgba(229,176,59,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(bx - w * 0.024, by);
        ctx.lineTo(bx, by - spireH);
        ctx.lineTo(bx + w * 0.024, by);
        ctx.closePath();
        ctx.fill();

        // Crown jewel finial at tip of each spire
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(bx, by - spireH, 3.5 + audio.vocal * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SERIF,
        fontWeight: 700,
        mode: 'cathedral-arch',
        primaryColor: '#FFF9EC',
        sungColor: '#FFD86B',
        accentColor: '#E5B03B',
      });
    },
  },

  // 37. Revival Tent Warm Lanterns
  {
    id: 'praise-37-revival-warm-lanterns',
    number: 37,
    category: 'uptempo-lyric',
    subgenre: 'Acoustic & Revival',
    director: 'World-Eclectic Traveller',
    name: 'Revival Warm Lanterns',
    subtitle: 'Swinging brass-and-glass sanctuary lanterns and joyful camp-meeting warmth',
    description: 'Seven ornate brass-and-amber glass lanterns sway gently overhead while golden firefly dust and rhythmic acoustic warmth fill the room.',
    lightingNote: 'Key: 2900K warm glass lanterns over deep walnut & indigo dusk.',
    serviceUse: 'Gospel roots, testimony songs, revival & camp-meeting hymns.',
    palette: ['#0F0C14', '#2B1F2D', '#E88E35', '#FFF2D2'],
    audioMappings: [
      ['Pulse', 'Pulses warm lantern halos on the downbeat'],
      ['Swell', 'Gently swings suspended brass lanterns in unison'],
      ['Shimmer', 'Twinkles warm firefly dust across the stage'],
    ],
    render(rawRc) {
      const rc = withPraiseLyrics(rawRc);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.5, 1.6, params.motion);
      drawSanctuaryBg(ctx, w, h, '#0C0912', '#261A29', '#1A1114', params.warmth);

      const lanterns = 5;
      for (let i = 0; i < lanterns; i++) {
        const anchorX = w * (0.14 + (i / (lanterns - 1)) * 0.72);
        const cordLen = h * (0.15 + (i % 2) * 0.07);
        const swing = Math.sin(t * 1.6 * spd + i * 0.8) * w * 0.016;
        drawSanctuaryCenserLamp(ctx, anchorX + swing, cordLen, Math.min(w, h) * 0.036, {
          t: t * spd + i,
          brassColor: '#E89A3C',
          rubyColor: '#F59E0B',
          vocalEnergy: audio.vocal,
          swellEnergy: audio.pulse,
          emitSmoke: false,
        });
      }

      drawMotes(ctx, w, h, {
        count: 52,
        color: '#FFBF5E',
        t: t * spd * 1.2,
        riseSpeed: 0.04,
        sway: 0.05,
        sizeRange: [2, 4.8],
        glow: 0.65 + audio.shimmer * 0.35,
        seed: 3737,
      });

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.54);
      renderWorshipLyrics(rc, {
        fontFamily: W_SERIF,
        fontWeight: 600,
        yRatio: 0.54,
        mode: 'praise-banner',
        primaryColor: '#FFF7E8',
        sungColor: '#FFD166',
        accentColor: '#E88E35',
      });
    },
  },

  // 38. Psalm 150 Jubilee Cymbals & Strings
  {
    id: 'praise-38-psalm150-jubilee',
    number: 38,
    category: 'uptempo-lyric',
    subgenre: 'Joyful Praise',
    director: 'Futurist',
    name: 'Psalm 150 Jubilee Strings',
    subtitle: 'Vibrating golden Davidic harp strings and radial bronze cymbal blooms',
    description: '"Praise Him with stringed instruments and organs": taut golden harp strings vibrate across the canvas while bronze acoustic blooms respond to percussion.',
    lightingNote: 'Key: Burnished bronze and gold harmonic strings over deep slate.',
    serviceUse: 'Psalm 150, orchestral praise, celebratory worship sets.',
    palette: ['#0A0E17', '#1E2A3D', '#E09F3E', '#FFF6DC'],
    audioMappings: [
      ['Vocal', 'Plucks and vibrates the golden harmonic strings'],
      ['Clap', 'Blooms radial bronze cymbal shimmer discs'],
      ['Pulse', 'Modulates string tension and golden glow'],
    ],
    render(rawRc) {
      const rc = withPraiseLyrics(rawRc);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.5, 1.6, params.motion);
      drawSanctuaryBg(ctx, w, h, '#080B12', '#172233', '#0D111A', params.warmth);

      // Radial bronze cymbal shimmer discs behind strings
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const cx of [w * 0.25, w * 0.75]) {
        const cr = Math.min(w, h) * (0.22 + audio.clap * 0.08 + audio.pulse * 0.04);
        const cg = ctx.createRadialGradient(cx, h * 0.5, cr * 0.1, cx, h * 0.5, cr);
        cg.addColorStop(0, hexRgba('#FFF4D2', 0.35 + audio.clap * 0.35));
        cg.addColorStop(0.65, hexRgba('#E09F3E', 0.22));
        cg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(cx, h * 0.5, cr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Vibrating vertical/diagonal harp strings on left and right
      for (let s = 0; s < 20; s++) {
        const isRight = s >= 10;
        const idx = s % 10;
        const x0 = isRight ? w * (0.68 + idx * 0.028) : w * (0.32 - idx * 0.028);
        const band = audio.bands[s % 16] ?? audio.vocal;
        const vib = Math.sin(t * (18 + idx * 2) * spd) * w * 0.009 * band;

        ctx.strokeStyle = hexRgba('#FFD166', 0.34 + band * 0.58);
        ctx.lineWidth = 1.5 + band * 2.2;
        ctx.beginPath();
        ctx.moveTo(x0, h * 0.06);
        ctx.quadraticCurveTo(x0 + vib, h * 0.5, x0, h * 0.94);
        ctx.stroke();
      }
      ctx.restore();

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SANS,
        fontWeight: 700,
        mode: 'minimal-editorial',
        primaryColor: '#FFFDF7',
        sungColor: '#FFD166',
        accentColor: '#E09F3E',
      });
    },
  },

  // 39. Red Sea Parting Triumph
  {
    id: 'praise-39-red-sea-triumph',
    number: 39,
    category: 'uptempo-lyric',
    subgenre: 'Joyful Praise',
    director: 'Baroque Dramatist',
    name: 'Red Sea Parting Triumph',
    subtitle: 'Bilateral surging walls of sunlit turquoise water and a golden dry path',
    description: 'Two towering, sunlit turquoise water walls with curling foam crests surge on the left and right while a pillar of fire shines down the golden pathway of deliverance.',
    lightingNote: 'Key: Central pillar of 3600K fire/sunlight illuminating turquoise water walls.',
    serviceUse: 'Deliverance, victory songs, Song of Moses/Miriam, baptismal celebration.',
    palette: ['#061721', '#0D4A5E', '#2CE0C8', '#FFB84D'],
    audioMappings: [
      ['Pulse', 'Surges the bilateral turquoise water crests upward on the beat'],
      ['Swell', 'Brightens the golden deliverance pillar down the center'],
      ['Vocal', 'Sends sparkling spray motes off the wave tops'],
    ],
    render(rawRc) {
      const rc = withPraiseLyrics(rawRc);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.5, 1.6, params.motion);
      drawSanctuaryBg(ctx, w, h, '#05121A', '#0A3545', '#1F1B16', params.warmth);

      // Central pillar of fire / sunlight rays
      drawGodRays(ctx, w, h, {
        originX: w * 0.5,
        originY: h * 0.12,
        angle: Math.PI * 0.5,
        spread: 0.75,
        count: 9,
        color: '#FFB84D',
        intensity: 0.38 + audio.swell * 0.30,
        t: t * spd,
      });

      // Left and right surging water walls
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const side of [-1, 1]) {
        for (let layer = 0; layer < 4; layer++) {
          ctx.beginPath();
          const edgeX = side === -1 ? 0 : w;
          ctx.moveTo(edgeX, 0);
          for (let y = 0; y <= h; y += 18) {
            const ny = y / h;
            const reach = w * (0.25 - layer * 0.04 + audio.pulse * 0.045);
            const wave = Math.sin(ny * 6 - t * 2.5 * spd + layer) * w * 0.032;
            const x = side === -1 ? reach + wave : w - reach - wave;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(edgeX, h);
          ctx.closePath();
          ctx.fillStyle = hexRgba(layer < 2 ? '#2CE0C8' : '#16859E', 0.18 + audio.vocal * 0.14);
          ctx.fill();
          ctx.strokeStyle = hexRgba('#E0FBF8', 0.28);
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
      ctx.restore();

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SANS,
        fontWeight: 700,
        mode: 'praise-banner',
        primaryColor: '#FFFFFF',
        sungColor: '#FFD670',
        accentColor: '#2CE0C8',
      });
    },
  },

  // 40. Festival Carillon Bells
  {
    id: 'praise-40-festival-carillon-bells',
    number: 40,
    category: 'uptempo-lyric',
    subgenre: 'Hymnal & Pipe Organ',
    director: 'Classical Mind',
    name: 'Festival Carillon Bells',
    subtitle: 'Swinging cast-bronze belfry bells and shimmering overtone halos',
    description: 'Five cast-bronze cathedral bells swing in the upper belfry, releasing concentric golden overtone halos with every musical accent.',
    lightingNote: 'Key: Bright festival daylight & warm bronze specular rings.',
    serviceUse: 'Easter, Christmas Day, joyful call to worship, festival hymns.',
    palette: ['#0D101C', '#242F4D', '#E8A838', '#FFF6DE'],
    audioMappings: [
      ['Pulse', 'Swings the cast-bronze carillon bells in tempo'],
      ['Clap', 'Releases expanding bronze overtone rings'],
      ['Shimmer', 'Sparkles high-frequency bell overtone dust'],
    ],
    render(rawRc) {
      const rc = withPraiseLyrics(rawRc);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.5, 1.6, params.motion);
      drawSanctuaryBg(ctx, w, h, '#0A0D17', '#1C253D', '#121524', params.warmth);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let b = 0; b < 5; b++) {
        const cx = w * (0.16 + b * 0.17);
        const cy = h * 0.18;
        const swing = Math.sin(t * 2.6 * spd + b * 1.2) * 0.38;
        const bellR = Math.min(w, h) * (0.055 + (b === 2 ? 0.018 : 0));

        // Swinging cast-bronze bell silhouette
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(swing);
        const bg = ctx.createLinearGradient(-bellR, 0, bellR, 0);
        bg.addColorStop(0, '#5E3B14');
        bg.addColorStop(0.5, '#FFD670');
        bg.addColorStop(1, '#4A2E0E');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.moveTo(-bellR * 0.45, 0);
        ctx.quadraticCurveTo(-bellR * 0.6, bellR * 1.1, -bellR, bellR * 1.45);
        ctx.lineTo(bellR, bellR * 1.45);
        ctx.quadraticCurveTo(bellR * 0.6, bellR * 1.1, bellR * 0.45, 0);
        ctx.closePath();
        ctx.fill();
        // Bell clapper sphere
        ctx.fillStyle = '#FFF6D6';
        ctx.beginPath();
        ctx.arc(0, bellR * 1.52, bellR * 0.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Concentric acoustic overtone rings
        for (let ring = 1; ring <= 2; ring++) {
          const rad = bellR * (1.6 + ring * 0.9 + audio.pulse * 0.4);
          ctx.strokeStyle = hexRgba('#FFD166', (0.38 - ring * 0.12) * (0.8 + audio.clap * 0.5));
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy + bellR, rad, 0.2, Math.PI - 0.2);
          ctx.stroke();
        }
      }
      ctx.restore();

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.54);
      renderWorshipLyrics(rc, {
        fontFamily: W_SERIF,
        fontWeight: 700,
        yRatio: 0.54,
        mode: 'hymnal-stanza',
        primaryColor: '#FFF9EB',
        sungColor: '#FFD666',
        accentColor: '#E8A838',
      });
    },
  },

  // 41. New Jerusalem Jasper & Gold
  {
    id: 'praise-41-new-jerusalem-jasper-gold',
    number: 41,
    category: 'uptempo-lyric',
    subgenre: 'Sacred Geometry',
    director: 'Futurist',
    name: 'New Jerusalem Jasper & Gold',
    subtitle: 'Twelve crystalline gemstone pillars over a perspective street of pure gold',
    description: 'Inspired by Revelation 21: twelve translucent gemstone facets of jasper, sapphire, chalcedony, and emerald reflect onto a perspective floor of pure translucent gold.',
    lightingNote: 'Key: Internal gemstone luminescence + golden floor reflection.',
    serviceUse: 'Heavenly celebration, All Saints, victorious hymns & praise.',
    palette: ['#0D0E1A', '#1E40AF', '#10B981', '#F5B841'],
    audioMappings: [
      ['Harmonic', 'Illuminates the 12 foundation gemstone facets'],
      ['Pulse', 'Ripples golden reflections across the translucent floor'],
      ['Vocal', 'Brightens crystalline bevel highlights'],
    ],
    render(rawRc) {
      const rc = withPraiseLyrics(rawRc);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.5, 1.6, params.motion);
      drawSanctuaryBg(ctx, w, h, '#090A14', '#16213E', '#33240F', params.warmth);

      // Perspective street of pure translucent gold in lower third
      const floorY = h * 0.68;
      const fg = ctx.createLinearGradient(0, floorY, 0, h);
      fg.addColorStop(0, hexRgba('#F5B841', 0.08));
      fg.addColorStop(0.5, hexRgba('#FFD66B', 0.28 + audio.pulse * 0.18));
      fg.addColorStop(1, hexRgba('#B87D1E', 0.35));
      ctx.fillStyle = fg;
      ctx.fillRect(0, floorY, w, h - floorY);

      const gems = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#14B8A6'];
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 12; i++) {
        const gx = (i + 0.5) * (w / 12);
        const band = audio.bands[i] ?? 0.5;
        const gh = h * (0.28 + band * 0.25 + audio.pulse * 0.08);
        const col = gems[i % gems.length];
        const g = ctx.createLinearGradient(gx, h * 0.46 - gh, gx, h * 0.46 + gh);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.5, hexRgba(col, 0.34 + band * 0.32));
        g.addColorStop(1, hexRgba('#F5B841', 0.26));
        ctx.fillStyle = g;
        ctx.strokeStyle = hexRgba('#FFF6D6', 0.42 + band * 0.3);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(gx, h * 0.46 - gh);
        ctx.lineTo(gx + w * 0.036, h * 0.46);
        ctx.lineTo(gx, h * 0.46 + gh);
        ctx.lineTo(gx - w * 0.036, h * 0.46);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SERIF,
        fontWeight: 700,
        mode: 'praise-banner',
        primaryColor: '#FFFDF7',
        sungColor: '#FFD66B',
        accentColor: '#F5B841',
      });
    },
  },

  // 42. Sunday Morning Horizon Rise
  {
    id: 'praise-42-sunday-morning-horizon',
    number: 42,
    category: 'uptempo-lyric',
    subgenre: 'Joyful Praise',
    director: 'Radical Minimalist',
    name: 'Sunday Morning Horizon Rise',
    subtitle: 'Uplifting golden-coral sunrise arc with rhythmic sky ribbons',
    description: 'A clean, modern contemporary worship sunrise whose golden-coral horizon arc rises and pulses with the kick and bass groove.',
    lightingNote: 'Key: Warm 4000K sunrise crest over coral-amber and deep cobalt.',
    serviceUse: 'Contemporary worship openers, "This Is The Day", morning praise.',
    palette: ['#0B132B', '#2B3A67', '#F26A4B', '#FFD166'],
    audioMappings: [
      ['Pulse', 'Expands the golden sunrise corona on every beat'],
      ['Bass', 'Lifts the horizon arc height'],
      ['Vocal', 'Sends warm coral light waves across the upper sky'],
    ],
    render(rawRc) {
      const rc = withPraiseLyrics(rawRc);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.5, 1.6, params.motion);
      drawSanctuaryBg(ctx, w, h, '#091024', '#223159', '#D95D43', params.warmth);

      const hy = h * (0.76 - audio.pulse * 0.03);
      const sg = ctx.createRadialGradient(w * 0.5, hy, 0, w * 0.5, hy, w * (0.48 + audio.pulse * 0.1));
      sg.addColorStop(0, hexRgba('#FFF4CC', 0.88));
      sg.addColorStop(0.35, hexRgba('#FFB84D', 0.52));
      sg.addColorStop(0.7, hexRgba('#F26A4B', 0.26));
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let a = 1; a <= 6; a++) {
        const r = w * (0.12 * a + ((t * 0.25 * spd) % 0.12));
        ctx.strokeStyle = hexRgba('#FFD166', (1 - a / 7) * (0.34 + audio.vocal * 0.32));
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(w * 0.5, hy, r, Math.PI, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.46);
      renderWorshipLyrics(rc, {
        fontFamily: W_SANS,
        fontWeight: 700,
        yRatio: 0.46,
        mode: 'minimal-editorial',
        primaryColor: '#FFFFFF',
        sungColor: '#FFD166',
        accentColor: '#F26A4B',
      });
    },
  },

  // 43. Jericho Shofar Acoustic Wave
  {
    id: 'praise-43-jericho-shofar-wave',
    number: 43,
    category: 'uptempo-lyric',
    subgenre: 'Acoustic & Revival',
    director: 'Rebellious Hand',
    name: 'Jericho Shofar Acoustic Wave',
    subtitle: 'Golden horn compression rings over trembling sandstone masonry and dust',
    description: 'Powerful golden acoustic compression rings radiate across warm desert sandstone masonry, built for breakthrough and victory praise anthems.',
    lightingNote: 'Key: Warm 3400K desert gold and bronze acoustic shock-rings.',
    serviceUse: 'Breakthrough anthems, victory praise, Joshua/Jericho themes.',
    palette: ['#140C07', '#3D2312', '#E59532', '#FFF2CC'],
    audioMappings: [
      ['Pulse', 'Drives golden acoustic horn rings outward across the stage'],
      ['Bass', 'Shakes loose rising golden sandstone dust motes'],
      ['Vocal', 'Brightens the central horn flare'],
    ],
    render(rawRc) {
      const rc = withPraiseLyrics(rawRc);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.5, 1.6, params.motion);
      drawSanctuaryBg(ctx, w, h, '#120A06', '#331D0F', '#1C1009', params.warmth);
      drawAshlarMasonry(ctx, w, h, '#E59532', 0.12 + audio.pulse * 0.08);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 8; i++) {
        const p = ((t * 0.5 * spd + i / 8) % 1);
        const rx = p * w * 0.65;
        const ry = rx * 0.55;
        ctx.strokeStyle = hexRgba('#FFB84D', (1 - p) * (0.42 + audio.pulse * 0.42));
        ctx.lineWidth = Math.max(2, h * 0.0085 * (1 - p));
        ctx.beginPath();
        ctx.ellipse(w * 0.5, h * 0.5, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      drawMotes(ctx, w, h, {
        count: 64,
        color: '#FFCA66',
        t: t * spd * 1.6,
        riseSpeed: 0.065,
        sway: 0.06,
        sizeRange: [2, 5.5],
        glow: 0.68 + audio.bass * 0.32,
        seed: 4343,
      });

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SANS,
        fontWeight: 700,
        mode: 'choir-anthem',
        primaryColor: '#FFF9EB',
        sungColor: '#FFD166',
        accentColor: '#E59532',
      });
    },
  },

  // 44. Doxology Trinity Rings
  {
    id: 'praise-44-doxology-trinity-rings',
    number: 44,
    category: 'uptempo-lyric',
    subgenre: 'Sacred Geometry',
    director: 'Futurist',
    name: 'Doxology Trinity Rings',
    subtitle: 'Three interlocked Borromean rings of gold, sapphire, and ruby light',
    description: 'Three luminous Borromean rings representing Father, Son, and Holy Spirit revolve inside an engraved brass astrolabe and flare warmly on every chord change.',
    lightingNote: 'Key: Tri-color sacred rings in gold, sapphire, and warm rose.',
    serviceUse: 'Doxology, Gloria Patri, Trinity Sunday, joyful closing hymns.',
    palette: ['#0A0D18', '#1E3A8A', '#D97706', '#FFFBEB'],
    audioMappings: [
      ['Pulse', 'Expands the three interlocked Trinity rings on the beat'],
      ['Harmonic', 'Rotates the tri-ring geometry and brightens overlaps'],
      ['Vocal', 'Ignites golden central trefoil radiance'],
    ],
    render(rawRc) {
      const rc = withPraiseLyrics(rawRc);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.5, 1.6, params.motion);
      drawSanctuaryBg(ctx, w, h, '#080B14', '#141E38', '#0A0D18', params.warmth);

      const cx = w * 0.5, cy = h * 0.5;
      const r = Math.min(w, h) * (0.22 + audio.pulse * 0.04);
      const dist = r * 0.48;
      const ringCols = ['#F59E0B', '#3B82F6', '#EC4899'];

      drawSacredAstrolabe(ctx, cx, cy, r * 1.85, {
        t: t * spd,
        primaryColor: '#F59E0B',
        secondaryColor: '#3B82F6',
        vocalEnergy: audio.vocal,
        swellEnergy: audio.swell,
        showStar: false,
      });

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.3 * spd);
      ctx.globalCompositeOperation = 'screen';

      for (let i = 0; i < 3; i++) {
        const ang = (i / 3) * Math.PI * 2;
        const ox = Math.cos(ang) * dist;
        const oy = Math.sin(ang) * dist;
        ctx.strokeStyle = hexRgba(ringCols[i], 0.62 + audio.vocal * 0.35);
        ctx.lineWidth = Math.max(3, h * (0.012 + audio.pulse * 0.006));
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SERIF,
        fontWeight: 700,
        mode: 'hymnal-stanza',
        primaryColor: '#FFFBEB',
        sungColor: '#FCD34D',
        accentColor: '#F59E0B',
      });
    },
  },

  // 45. Living Stones Archway Pulse
  {
    id: 'praise-45-living-stones-archway',
    number: 45,
    category: 'uptempo-lyric',
    subgenre: 'Sacred Architecture',
    director: 'Classical Mind',
    name: 'Living Stones Archway',
    subtitle: 'Receding 3D colonnade of golden Gothic arches lighting in rhythmic sequence',
    description: 'A soaring 3D perspective colonnade of Gothic sanctuary arches with clustered stone piers and keystones lights up sequentially from front to back in time with the praise groove.',
    lightingNote: 'Key: Sequential 3800K architectural arch uplighting.',
    serviceUse: '"Cornerstone", church anniversary, upbeat congregation anthems.',
    palette: ['#0B0D16', '#1F293D', '#E5A43B', '#FFF6E0'],
    audioMappings: [
      ['Pulse', 'Advances golden uplight waves down the Gothic arch colonnade'],
      ['Vocal', 'Brightens the keystone boss of each arch'],
      ['Bass', 'Deepens warm floor reflections down the nave'],
    ],
    render(rawRc) {
      const rc = withPraiseLyrics(rawRc);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.5, 1.6, params.motion);
      drawSanctuaryBg(ctx, w, h, '#090B12', '#171E2E', '#0D1018', params.warmth);
      drawAshlarMasonry(ctx, w, h, '#E5A43B', 0.09);

      drawCathedralArcade(ctx, w, h, {
        bays: 6,
        pointed: true,
        stoneColor: '#1E293D',
        highlightColor: '#FFB84D',
        t,
        progressOffset: t * 0.35 * spd,
        vocalEnergy: audio.vocal + audio.pulse * 0.3,
        swellEnergy: audio.swell,
      });

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.52);
      renderWorshipLyrics(rc, {
        fontFamily: W_SANS,
        fontWeight: 700,
        mode: 'praise-banner',
        primaryColor: '#FFFDF7',
        sungColor: '#FFD166',
        accentColor: '#E5A43B',
      });
    },
  },

  // 46. Tambourine & Gold Leaf Confetti
  {
    id: 'praise-46-tambourine-gold-confetti',
    number: 46,
    category: 'uptempo-lyric',
    subgenre: 'Gospel & Choir',
    director: 'Baroque Dramatist',
    name: 'Tambourine & Gold Leaf Jubilee',
    subtitle: 'Floating burnished gold-leaf petals and twin crossing festival spotlights',
    description: 'Graceful petals of burnished gold leaf and warm pearl float and twirl through twin crossing festival spotlights in celebratory praise.',
    lightingNote: 'Key: Twin crossing 4000K festival beams + specular gold-leaf flakes.',
    serviceUse: 'Easter resurrection celebration, baptism applause, Gospel praise.',
    palette: ['#100D1C', '#2D224D', '#F2B441', '#FFF8E8'],
    audioMappings: [
      ['Clap', 'Flutters burnished gold-leaf petals upward'],
      ['Pulse', 'Sweeps twin warm festival spotlights across the ceiling'],
      ['Shimmer', 'Sparkles specular glints on rotating gold flakes'],
    ],
    render(rawRc) {
      const rc = withPraiseLyrics(rawRc);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.5, 1.6, params.motion);
      drawSanctuaryBg(ctx, w, h, '#0C0917', '#261C42', '#140F24', params.warmth);

      drawGodRays(ctx, w, h, {
        originX: w * 0.22,
        originY: -h * 0.05,
        angle: Math.PI * 0.36,
        spread: 0.42,
        count: 6,
        color: '#FFD166',
        intensity: 0.36 + audio.pulse * 0.3,
        t: t * spd,
      });
      drawGodRays(ctx, w, h, {
        originX: w * 0.78,
        originY: -h * 0.05,
        angle: Math.PI * 0.64,
        spread: 0.42,
        count: 6,
        color: '#FFD166',
        intensity: 0.36 + audio.pulse * 0.3,
        t: -t * spd,
      });

      drawMotes(ctx, w, h, {
        count: 68,
        color: '#FFE082',
        t: t * spd * 1.5,
        riseSpeed: 0.06,
        sway: 0.08,
        sizeRange: [2.5, 6.2],
        glow: 0.72 + audio.clap * 0.28,
        seed: 4646,
      });

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SANS,
        fontWeight: 700,
        mode: 'choir-anthem',
        primaryColor: '#FFFFFF',
        sungColor: '#FFD666',
        accentColor: '#F2B441',
      });
    },
  },

  // 47. Mighty Fortress Bastion Light
  {
    id: 'praise-47-mighty-fortress-bastion',
    number: 47,
    category: 'uptempo-lyric',
    subgenre: 'Hymnal & Pipe Organ',
    director: 'Classical Mind',
    name: 'Mighty Fortress Bastion Light',
    subtitle: 'Monumental granite ashlar masonry and ascending gold chevron beacons',
    description: 'Architectural chevron pillars of warm granite ashlar stone and burnished gold stand resolute while vertical amber beacons surge with organ chords and drums.',
    lightingNote: 'Key: Architectural grazing uplights at 3600K along stone chevrons.',
    serviceUse: '"A Mighty Fortress Is Our God", declaration & faith anthems.',
    palette: ['#0B0E14', '#1F2633', '#D99338', '#FAF3E3'],
    audioMappings: [
      ['Pulse', 'Drives vertical amber light beacons up the chevron seams'],
      ['Bass', 'Reinforces the lower granite stone foundation glow'],
      ['Harmonic', 'Illuminates bilateral architectural wings'],
    ],
    render(rawRc) {
      const rc = withPraiseLyrics(rawRc);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.5, 1.6, params.motion);
      drawSanctuaryBg(ctx, w, h, '#090C12', '#181E29', '#0E1118', params.warmth);
      drawAshlarMasonry(ctx, w, h, '#8C9BB0', 0.14);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let c = 0; c < 7; c++) {
        const yOff = ((c / 7 - t * 0.22 * spd) % 1 + 1) % 1;
        const cy = yOff * h * 1.2;
        const band = audio.bands[c * 2] ?? audio.pulse;
        ctx.strokeStyle = hexRgba('#F2A640', Math.sin(yOff * Math.PI) * (0.36 + band * 0.45));
        ctx.lineWidth = h * 0.018;
        ctx.beginPath();
        ctx.moveTo(w * 0.06, cy + h * 0.20);
        ctx.lineTo(w * 0.5, cy);
        ctx.lineTo(w * 0.94, cy + h * 0.20);
        ctx.stroke();
      }
      ctx.restore();

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.5);
      renderWorshipLyrics(rc, {
        fontFamily: W_SERIF,
        fontWeight: 700,
        mode: 'hymnal-stanza',
        primaryColor: '#FAF3E3',
        sungColor: '#FFD269',
        accentColor: '#D99338',
      });
    },
  },

  // 48. Hallelujah Chorus Celestial Dome
  {
    id: 'praise-48-hallelujah-celestial-dome',
    number: 48,
    category: 'uptempo-lyric',
    subgenre: 'Hymnal & Pipe Organ',
    director: 'Classical Mind',
    name: 'Hallelujah Celestial Dome',
    subtitle: 'Soaring 24-rib coffered basilica dome bathed in golden oculus glory',
    description: 'Looking up into a grand 24-rib coffered basilica dome whose central oculus pours down warm golden glory and rhythmic concentric light rings.',
    lightingNote: 'Key: Central oculus sunbeam at 4200K + gilded dome coffers.',
    serviceUse: 'Easter finale, Hallelujah Chorus, grand benediction & sending hymns.',
    palette: ['#0B0D1A', '#222B4C', '#E8AE3C', '#FFF9E8'],
    audioMappings: [
      ['Pulse', 'Pulses the golden coffered dome rings outward from the oculus'],
      ['Swell', 'Intensifies the central oculus glory beam'],
      ['Vocal', 'Illuminates 24 gilded ribs radiating from the crown'],
    ],
    render(rawRc) {
      const rc = withPraiseLyrics(rawRc);
      const { ctx, w, h, t, audio, params } = rc;
      const spd = lerp(0.5, 1.6, params.motion);
      drawSanctuaryBg(ctx, w, h, '#080A14', '#1A213B', '#0E1221', params.warmth);

      const cx = w * 0.5, cy = h * 0.25;

      // 24 radial basilica dome ribs + concentric coffered rings
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.02 * spd);
      ctx.globalCompositeOperation = 'screen';
      const ribs = 24;
      const maxR = Math.hypot(w, h) * 0.65;
      ctx.strokeStyle = hexRgba('#E8AE3C', 0.24 + audio.vocal * 0.2);
      ctx.lineWidth = 1.4;
      for (let i = 0; i < ribs; i++) {
        const a = (i / ribs) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (Math.min(w, h) * 0.08), Math.sin(a) * (Math.min(w, h) * 0.08));
        ctx.lineTo(Math.cos(a) * maxR, Math.sin(a) * maxR);
        ctx.stroke();
      }
      for (let r = 1; r <= 6; r++) {
        const rad = Math.min(w, h) * (0.08 * r + audio.pulse * 0.015);
        ctx.strokeStyle = hexRgba('#FFD166', (0.48 - r * 0.06) * (0.85 + audio.vocal * 0.45));
        ctx.lineWidth = 2.2;
        ctx.setLineDash([rad * 0.20, rad * 0.06]);
        ctx.beginPath();
        ctx.arc(0, 0, rad, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      drawGodRays(ctx, w, h, {
        originX: cx,
        originY: cy,
        angle: Math.PI * 0.5,
        spread: 1.5,
        count: 16,
        color: '#FFD670',
        intensity: 0.44 + audio.pulse * 0.35,
        t: t * spd,
      });

      applySanctuaryFinish(ctx, w, h, params.textSafe, 0.54);
      renderWorshipLyrics(rc, {
        fontFamily: W_SERIF,
        fontWeight: 700,
        yRatio: 0.54,
        mode: 'cathedral-arch',
        primaryColor: '#FFF9E8',
        sungColor: '#FFD666',
        accentColor: '#E8AE3C',
      });
    },
  },
];
