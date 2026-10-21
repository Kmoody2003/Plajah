import * as fs from 'node:fs';
import * as path from 'node:path';
import { upload, putDoc } from '../showcase/gcp';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public', 'promo', 'chora');
const OWNER_UID = 'hiP7PGj15eTq0r0ZH2XwN00AS2h1'; // Kenneth (kmoody2003@gmail.com)
const PROD_ID = 'prod_chora_promo_30s';

function buildPixelsVisualizerSnapshot(name: string, modeIndex: number, accentHex: string) {
  const effects = [
    {
      id: `fx_react_${modeIndex}`,
      effectId: modeIndex % 2 === 0 ? 'hypnotic-flow' : 'neon-vortex',
      enabled: true,
      params: {
        speed: 1.35,
        intensity: 0.85,
        scale: 1.2,
        glow: 0.9,
        colorA: '#FF8C00',
        colorB: accentHex,
      },
      audioBindings: {
        intensity: { source: 'bass', amount: 0.75, smoothing: 0.15 },
        glow: { source: 'rms', amount: 0.65, smoothing: 0.2 },
      },
    },
  ];
  return {
    version: 1,
    name,
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 4.0,
    background: '#06060C',
    layers: [
      {
        id: `lyr_px_${modeIndex}`,
        name: `${name} · Audio Reactive Shader`,
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        clip: {
          type: 'flux',
          flux: {
            scene: modeIndex % 2 === 0 ? 'mandala-tunnel' : 'particle-orrery',
            palette: 'plajah-solar',
            sensitivity: 1.35,
            bloom: 0.85,
          },
        },
        forgeEffects: effects,
      },
    ],
  };
}

async function uploadLocalAsset(localRelPath: string, contentType: string): Promise<{ localUrl: string; cloudUrl: string }> {
  const cleanRel = localRelPath.replace(/^\/+/, '');
  const diskPath = path.join(ROOT, 'public', cleanRel);
  const storageObject = cleanRel.replace(/\\/g, '/');
  const bytes = fs.readFileSync(diskPath);
  console.log(`[upload] Uploading ${storageObject} (${(bytes.length / 1024).toFixed(1)} KB)...`);
  const cloudUrl = await upload(storageObject, bytes, contentType);
  return {
    localUrl: '/' + storageObject,
    cloudUrl,
  };
}

async function main() {
  const analysisPath = path.join(OUT_DIR, 'promo_analysis.json');
  if (!fs.existsSync(analysisPath)) {
    throw new Error(`Missing ${analysisPath} — run render_chora_promo_video.py first.`);
  }
  const meta = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
  const now = Date.now();

  // 1. Upload Master Video, Poster, Cover Art, Music, SFX, VO segments, and 8 Segment Clips + Plates
  const masterVideoUp = await uploadLocalAsset('/promo/chora/chora_promo_30s_master.mp4', 'video/mp4');
  const posterUp = await uploadLocalAsset('/promo/chora/chora_promo_30s_poster.png', 'image/png');
  const coverUp = await uploadLocalAsset('/promo/chora/goliath_cover.png', 'image/png');
  const music30Up = await uploadLocalAsset('/promo/chora/audio/kmoody_goliath_lioness_30s.mp3', 'audio/mpeg');
  const sfxUp = await uploadLocalAsset('/promo/chora/audio/sfx_dramatic_impacts.mp3', 'audio/mpeg');
  const mixUp = await uploadLocalAsset('/promo/chora/audio/chora_promo_30s_mix.mp3', 'audio/mpeg');

  const mediaPool: any[] = [];

  // Add Master Rendered Spot & Cover Art to Media Pool
  mediaPool.push({
    id: 'asset_chora_master_30s',
    name: 'PLAJAH CHORA — 30S MASTER SPOT (FINAL RENDER).mp4',
    type: 'video',
    url: masterVideoUp.localUrl,
    cloudUrl: masterVideoUp.cloudUrl,
    thumb: posterUp.localUrl,
    duration: 30.0,
    bin: 'rendered-master',
    tags: ['master', '30s', 'promo', 'chora', 'k-moody'],
    createdAt: now,
  });

  mediaPool.push({
    id: 'asset_goliath_cover',
    name: 'K-Moody — Goliath EP Cover Art.png',
    type: 'image',
    url: coverUp.localUrl,
    cloudUrl: coverUp.cloudUrl,
    thumb: coverUp.localUrl,
    duration: 5.0,
    bin: 'artwork',
    tags: ['cover', 'goliath', 'k-moody'],
    createdAt: now,
  });

  // Upload & register 8 Clean UI/Visualizer Plates + 8 Titled Broadcast Segments + Live Pixels Presets
  const segUploads: Array<{
    seg: any;
    cleanAssetId: string;
    titledAssetId: string;
    pixelsAssetId: string;
    thumbUrl: string;
  }> = [];

  for (const seg of meta.segments) {
    const cleanUp = await uploadLocalAsset(seg.cleanUrl, 'video/mp4');
    const titledUp = await uploadLocalAsset(seg.titledUrl, 'video/mp4');
    const thumbUp = await uploadLocalAsset(seg.thumbUrl, 'image/png');

    const cleanAssetId = `asset_${seg.id}_clean`;
    const titledAssetId = `asset_${seg.id}_titled`;
    const pixelsAssetId = `asset_${seg.id}_pixels`;

    mediaPool.push({
      id: cleanAssetId,
      name: `${seg.name} (Clean Visualizer/UI Plate).mp4`,
      type: 'video',
      url: cleanUp.localUrl,
      cloudUrl: cleanUp.cloudUrl,
      thumb: thumbUp.localUrl,
      duration: seg.durationSec,
      bin: 'v1-clean-plates',
      tags: ['plate', 'clean', 'ui', 'visualizer', seg.id],
      createdAt: now,
    });

    mediaPool.push({
      id: titledAssetId,
      name: `${seg.name} (Broadcast Kinetic Type).mp4`,
      type: 'video',
      url: titledUp.localUrl,
      cloudUrl: titledUp.cloudUrl,
      thumb: thumbUp.localUrl,
      duration: seg.durationSec,
      bin: 'v1-titled-clips',
      tags: ['broadcast', 'titled', 'kinetic', seg.id],
      createdAt: now,
    });

    mediaPool.push({
      id: pixelsAssetId,
      name: `${seg.name} · Live Plajah Pixels Shader`,
      type: 'video',
      duration: seg.durationSec,
      thumb: thumbUp.localUrl,
      bin: 'pixels-fx-scenes',
      tags: ['pixels', 'shader', 'live-fx'],
      pixels: buildPixelsVisualizerSnapshot(seg.name, seg.index, seg.accentHex),
      createdAt: now,
    });

    segUploads.push({
      seg,
      cleanAssetId,
      titledAssetId,
      pixelsAssetId,
      thumbUrl: thumbUp.localUrl,
    });
  }

  // Upload & register 5 Aria Voiceover segments
  const voAssets: Array<{ vo: any; assetId: string }> = [];
  for (let i = 0; i < meta.voSegments.length; i++) {
    const vo = meta.voSegments[i];
    const voUp = await uploadLocalAsset(`/promo/chora/audio/${vo.filename}`, 'audio/mpeg');
    const assetId = `asset_${vo.id}`;
    mediaPool.push({
      id: assetId,
      name: `Aria VO 0${i + 1} — ${vo.badge.replace(/^\d+\s*\/\/\s*/, '')}.mp3`,
      type: 'audio',
      url: voUp.localUrl,
      cloudUrl: voUp.cloudUrl,
      duration: vo.duration,
      bin: 'aria-voiceover',
      tags: ['aria', 'vo', 'elevenlabs', 'dialogue'],
      transcript: vo.displayText,
      createdAt: now,
    });
    voAssets.push({ vo, assetId });
  }

  // Register K-Moody Goliath Lioness 30s Music Bed, Full Track, Dramatic SFX, and Master Mix
  const musicAssetId = 'asset_kmoody_goliath_lioness_30s';
  mediaPool.push({
    id: musicAssetId,
    name: 'K-Moody — GOLIATH LIONESS (30s Beat-Synced Promo Cut · 138.6 BPM).mp3',
    type: 'audio',
    url: music30Up.localUrl,
    cloudUrl: music30Up.cloudUrl,
    duration: 30.0,
    bin: 'music-sfx',
    tags: ['music', 'k-moody', 'goliath-ep', '138.6bpm'],
    createdAt: now,
  });

  mediaPool.push({
    id: 'asset_kmoody_goliath_lioness_full',
    name: 'K-Moody — 01 GOLIATH LIONESS (Full Track · Goliath EP).mp3',
    type: 'audio',
    url: '/promo/chora/audio/kmoody_goliath_lioness_full.mp3',
    cloudUrl: 'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/albums%2Falbum_1777220736355_b8z8r%2Ftracks%2F6qarqkzyv_01_-_K-Moody_-_GOLIATH_LIONESS_.mp3?alt=media&token=1e4b4324-390f-465b-b318-935e7345bf7a',
    duration: 184.56,
    bin: 'music-sfx',
    tags: ['music', 'k-moody', 'goliath-ep', 'full-track'],
    createdAt: now,
  });

  const sfxAssetId = 'asset_sfx_dramatic_impacts';
  mediaPool.push({
    id: sfxAssetId,
    name: 'Chora Promo — Sub-Drops, Tension Riser & 26.4s Shockwave Boom.mp3',
    type: 'audio',
    url: sfxUp.localUrl,
    cloudUrl: sfxUp.cloudUrl,
    duration: 30.0,
    bin: 'music-sfx',
    tags: ['sfx', 'riser', 'sub-drop', 'impact'],
    createdAt: now,
  });

  mediaPool.push({
    id: 'asset_chora_master_mix_audio',
    name: 'Chora Promo — 30s Mastered Broadcast Audio Mix (Ducked Music + Aria VO + SFX).mp3',
    type: 'audio',
    url: mixUp.localUrl,
    cloudUrl: mixUp.cloudUrl,
    duration: 30.0,
    bin: 'rendered-master',
    tags: ['master-mix', 'broadcast', 'audio'],
    createdAt: now,
  });

  // 2. Build Multi-Track Timeline Clips for Edit 1 (Fully Editable Layers: Clean V1 + Editable S1 Titles + A1 Aria VO + A2 K-Moody + A3 SFX)
  // and Edit 2 (Broadcast Master Cut: Titled V1 + Editable S1 Captions + A1 Aria VO + A2 K-Moody + A3 SFX)
  const buildTimelineClips = (useCleanPlatesOnV1: boolean) => {
    const clips: any[] = [];

    // V1 Track: 8 Beat-Synced Video Segments
    for (let i = 0; i < segUploads.length; i++) {
      const { seg, cleanAssetId, titledAssetId } = segUploads[i];
      const shotId = `shot_chora_0${i + 1}`;
      const dur = seg.durationSec;
      const transTypes = ['dissolve', 'whip', 'prism', 'light', 'dissolve', 'whip', 'luma'];
      clips.push({
        id: `clip_v1_0${i + 1}`,
        trackId: 'v1',
        kind: 'media',
        cutLevel: 'shot',
        shotId,
        assetId: useCleanPlatesOnV1 ? cleanAssetId : titledAssetId,
        label: seg.name,
        start: seg.startSec,
        duration: dur,
        srcIn: 0,
        fx: {
          op: 1,
          sc: 1,
          x: 0,
          y: 0,
          rot: 0,
          bri: 1.02,
          con: 1.06,
          sat: 1.12,
          warm: 0,
          blur: 0,
          fadeIn: i === 0 ? 0.25 : 0,
          fadeOut: i === segUploads.length - 1 ? 0.65 : 0,
          ...(i > 0
            ? {
                trans: {
                  type: transTypes[(i - 1) % transTypes.length],
                  dur: i === 7 ? 0.18 : 0.14,
                },
              }
            : {}),
          // Subtle punch-in scale keyframe on every beat cut
          kf: {
            sc: [
              { t: 0, v: i === 7 ? 1.08 : 1.03, ease: 'out' },
              { t: Math.min(0.35, dur * 0.4), v: 1.0, ease: 'inOut' },
              { t: dur, v: 1.02, ease: 'linear' },
            ],
          },
        },
      });
    }

    // S1 Track: Editable Kinetic Titles (for Clean Plate edit) OR Broadcast Subtitles
    if (useCleanPlatesOnV1) {
      const animTypes = ['pop', 'tracking', 'rise', 'pop', 'rise', 'tracking', 'pop', 'pop'];
      for (let i = 0; i < segUploads.length; i++) {
        const { seg } = segUploads[i];
        clips.push({
          id: `clip_title_0${i + 1}`,
          trackId: 's1',
          kind: 'title',
          label: `Title 0${i + 1} · ${seg.headline}`,
          text: seg.headline,
          subtitle: seg.subheadline,
          tag: seg.badge,
          titleStyle: 'modern',
          tFont: 'Space Grotesk',
          tColor: '#FFFFFF',
          tSubColor: seg.accentHex,
          tSize: i === 7 ? 1.18 : 1.05,
          tx: 0,
          ty: i === 7 ? -26 : 30,
          tAnim: {
            type: animTypes[i % animTypes.length],
            duration: 0.32,
            delay: 0.02,
            out: true,
            stagger: 0.025,
          },
          start: seg.startSec + 0.04,
          duration: Math.max(0.5, seg.durationSec - 0.08),
        });
      }
    } else {
      // On Broadcast Master Cut (where kinetic titles are already rendered in V1), put Aria's VO captions on S1
      for (let i = 0; i < voAssets.length; i++) {
        const { vo } = voAssets[i];
        clips.push({
          id: `clip_sub_0${i + 1}`,
          trackId: 's1',
          kind: 'subtitle',
          label: `Aria Caption 0${i + 1}`,
          text: vo.displayText,
          start: vo.startSec,
          duration: vo.duration,
        });
      }
    }

    // A1 Track: 5 Isolated Aria Voiceover Clips
    for (let i = 0; i < voAssets.length; i++) {
      const { vo, assetId } = voAssets[i];
      clips.push({
        id: `clip_vo_0${i + 1}`,
        trackId: 'a1',
        kind: 'media',
        assetId,
        label: `Aria VO 0${i + 1} · ${vo.badge}`,
         text: vo.displayText,
        start: vo.startSec,
        duration: vo.duration,
        srcIn: 0,
        fx: {
          fadeIn: 0.04,
          fadeOut: 0.06,
        },
        audio: {
          vol: 1.18,
          pan: 0,
          eq: { low: 1.5, lowMid: 0.5, highMid: 2.8, high: 2.2 },
          comp: { enabled: true, threshold: -18, ratio: 3.5, attack: 0.005, release: 0.12, makeup: 2.5 },
        },
      });
    }

    // A2 Track: K-Moody — GOLIATH LIONESS (30s Beat-Synced Promo Bed)
    clips.push({
      id: 'clip_music_kmoody_goliath',
      trackId: 'a2',
      kind: 'media',
      assetId: musicAssetId,
      label: 'K-Moody — GOLIATH LIONESS (138.6 BPM · Goliath EP)',
      start: 0,
      duration: 30.0,
      srcIn: 0,
      fx: {
        fadeIn: 0.35,
        fadeOut: 1.1,
      },
      audio: {
        vol: 0.58,
        pan: 0,
        eq: { low: 2.2, lowMid: -1.5, highMid: -2.0, high: 1.5 },
        comp: { enabled: true, threshold: -14, ratio: 2.5, attack: 0.01, release: 0.18, makeup: 1.0 },
      },
    });

    // A3 Track: Dramatic Sub-Drops, Tension Riser & 26.43s Shockwave Impact
    clips.push({
      id: 'clip_sfx_dramatic',
      trackId: 'a3',
      kind: 'media',
      assetId: sfxAssetId,
      label: 'Dramatic Sub-Drops + Riser + 26.43s CTA Shockwave Boom',
      start: 0,
      duration: 30.0,
      srcIn: 0,
      fx: {
        fadeIn: 0.1,
        fadeOut: 0.5,
      },
      audio: {
        vol: 0.85,
        pan: 0,
        eq: { low: 3.0, lowMid: 0.0, highMid: 1.2, high: 2.0 },
        comp: { enabled: true, threshold: -12, ratio: 4.0, attack: 0.003, release: 0.15, makeup: 1.5 },
      },
    });

    return clips;
  };

  // Beat markers for the timeline ruler (every bar + 8 major scene cuts)
  const timelineMarkers = meta.sceneCutsSec.slice(0, 8).map((sec: number, idx: number) => ({
    id: `mkr_cut_0${idx + 1}`,
    time: sec,
    label: meta.segments[idx].name,
    color: meta.segments[idx].accentHex,
  }));

  const trackSettings = {
    a1: { vol: 1.15, pan: 0, mute: false, solo: false, sendReverb: 0.08, sendDelay: 0.02 },
    a2: { vol: 0.62, pan: 0, mute: false, solo: false, sendReverb: 0.0, sendDelay: 0.0 },
    a3: { vol: 0.85, pan: 0, mute: false, solo: false, sendReverb: 0.18, sendDelay: 0.08 },
    master: { vol: 1.0, reverb: { preset: 'hall', wet: 0.25 }, delay: { time: 0.22, feedback: 0.2, wet: 0.15 } },
  };

  const editableClips = buildTimelineClips(true);
  const broadcastClips = buildTimelineClips(false);

  // 3. Build 3 Acts & Scenes for SLATE / Story Structure
  const actDefs = [
    {
      id: 'act_chora_1',
      number: 1,
      title: 'ACT I · THE SONIC SANCTUARY & 7-ENGINE FX STAGE',
      segIndices: [0, 1, 2],
      voIndices: [0, 1],
    },
    {
      id: 'act_chora_2',
      number: 2,
      title: 'ACT II · AUDIENCE IMMERSION (24-BIT LOSSLESS, PARTIES & VAULT)',
      segIndices: [3, 4],
      voIndices: [2],
    },
    {
      id: 'act_chora_3',
      number: 3,
      title: 'ACT III · CREATOR COMMAND & DRAMATIC CALL TO ACTION',
      segIndices: [5, 6, 7],
      voIndices: [3, 4],
    },
  ];

  const acts = actDefs.map((actDef, aIdx) => {
    const firstSeg = meta.segments[actDef.segIndices[0]];
    const lastSeg = meta.segments[actDef.segIndices[actDef.segIndices.length - 1]];
    const sceneId = `scene_chora_0${aIdx + 1}`;

    const shots = actDef.segIndices.map((sIdx) => {
      const s = meta.segments[sIdx];
      return {
        id: `shot_chora_0${sIdx + 1}`,
        slug: `SHOT 0${sIdx + 1}`,
        type: sIdx === 7 ? 'HERO CTA' : 'UI + VISUALIZER',
        lens: '24mm Anamorphic',
        move: 'Beat-Locked Dynamic Push',
        duration: s.durationSec,
        description: `${s.name} — ${s.headline} (${s.subheadline})`,
        prompt: `Plajah Chora high-impact UI & audio-reactive visualizer showcase: ${s.headline} — ${s.subheadline}`,
        videoAssetId: `asset_${s.id}_titled`,
        stillAssetId: 'asset_goliath_cover',
      };
    });

    const dialogue = actDef.voIndices.map((vIdx) => {
      const vo = meta.voSegments[vIdx];
      return {
        id: `dlg_aria_0${vIdx + 1}`,
        character: 'ARIA (VO)',
        line: vo.displayText,
        audioAssetId: `asset_${vo.id}`,
        startSec: vo.startSec,
        durationSec: vo.duration,
      };
    });

    return {
      id: actDef.id,
      number: actDef.number,
      title: actDef.title,
      scenes: [
        {
          id: sceneId,
          heading: `INT. ${actDef.title} - NIGHT`,
          location: 'PLAJAH CHORA // SONIC SANCTUARY',
          time: 'NIGHT',
          synopsis: shots.map((sh) => sh.description).join(' | '),
          action: `Beat-synced at ${meta.bpm} BPM to K-Moody's "GOLIATH LIONESS" from the Goliath EP.`,
          dialogue,
          shots,
          timeline: {
            clips: editableClips,
            markers: timelineMarkers,
            trackSettings,
          },
          updatedAt: now,
        },
      ],
    };
  });

  // 4. Assemble Full Fabula Production Object
  const prod = {
    id: PROD_ID,
    title: 'PLAJAH CHORA — 30S HIGH-IMPACT PROMO (K-MOODY · GOLIATH)',
    type: 'commercial',
    description:
      'High-impact 30-second broadcast promo spot for Plajah Chora featuring K-Moody’s "GOLIATH LIONESS" (Goliath EP, 138.6 BPM), Aria AI Voiceover, 7-Engine Audio-Reactive Visualizer, Gatefold Planetary Orrery, 24-Bit/192kHz Lossless Audio, Live Synced Listening Parties, Chora Studio AI Stem Mixer, and Artist Manager OS.',
    themes: 'Sonic Sanctuary, Audio-Reactive Visuals, Creator Sovereignty, Audiophile Immersion',
    world: 'Plajah Chora Universe',
    streamUrl: masterVideoUp.cloudUrl,
    localStreamUrl: masterVideoUp.localUrl,
    posterUrl: posterUp.cloudUrl,
    defaults: {
      style: 'Plajah High-Contrast Cyber-Obsidian (#FF8C00 / #D40055 / #6B0099 / #00DAF3)',
      aspect: '16:9',
      service: 'kling',
      stillTarget: 'mj_magnific',
      format: {
        preset: 'hd1080',
        label: 'HD 1080p',
        w: 1920,
        h: 1080,
        fps: 30,
        drop: false,
      },
    },
    tracks: [
      { id: 's1', name: 'S1 · KINETIC TITLES & CAPTIONS', type: 'subtitle' },
      { id: 'v2', name: 'V2 · PIXELS LIVE FX OVERLAY', type: 'video' },
      { id: 'v1', name: 'V1 · CHORA UI & VISUALIZER', type: 'video' },
      { id: 'a1', name: 'A1 · ARIA VOICEOVER (VO)', type: 'audio' },
      { id: 'a2', name: 'A2 · K-MOODY GOLIATH LIONESS', type: 'audio' },
      { id: 'a3', name: 'A3 · DRAMATIC IMPACTS & RISER', type: 'audio' },
    ],
    bins: [
      { id: 'rendered-master', name: '00 · Rendered 30s Master' },
      { id: 'v1-clean-plates', name: '01 · Clean UI & Visualizer Plates' },
      { id: 'v1-titled-clips', name: '02 · Titled Broadcast Clips' },
      { id: 'pixels-fx-scenes', name: '03 · Live Plajah Pixels Shaders' },
      { id: 'aria-voiceover', name: '04 · Aria AI Voiceover (VO)' },
      { id: 'music-sfx', name: '05 · K-Moody Goliath EP & SFX' },
      { id: 'artwork', name: '06 · Goliath EP Artwork' },
    ],
    cast: [
      {
        id: 'cast_aria_vo',
        name: 'ARIA',
        role: 'Voiceover Narrator (ElevenLabs Aria Voice)',
        bio: 'Plajah’s signature AI narrator guiding creators and audiences through the Chora sonic ecosystem.',
        media: [],
        wardrobe: [],
      },
      {
        id: 'cast_kmoody',
        name: 'K-Moody',
        role: 'Featured Artist — Goliath EP ("GOLIATH LIONESS")',
        bio: 'Featured creator whose Goliath EP powers the 138.6 BPM beat-synced soundtrack and Orrery stage.',
        media: ['asset_goliath_cover'],
        wardrobe: [],
      },
    ],
    design: {
      lookId: 'plajah-cyber-gold',
      palette: ['#06060C', '#FF8C00', '#D40055', '#6B0099', '#00DAF3', '#E0A458', '#10B981'],
      luts: [],
      briefs: { props: [], staging: [], stunts: [], storyboards: [] },
    },
    mediaPool,
    edits: [
      {
        id: 'edit_chora_promo_editable',
        title: '30S PROMO — EDITABLE LAYERS (CLEAN PLATES + LIVE TITLES + STEMS)',
        format: { preset: 'hd1080', label: 'HD 1080p', w: 1920, h: 1080, fps: 30, drop: false },
        timeline: {
          clips: editableClips,
          markers: timelineMarkers,
          trackSettings,
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'edit_chora_promo_broadcast',
        title: '30S PROMO — BROADCAST MASTER CUT (BURNED KINETIC TYPE + SUBTITLES)',
        format: { preset: 'hd1080', label: 'HD 1080p', w: 1920, h: 1080, fps: 30, drop: false },
        timeline: {
          clips: broadcastClips,
          markers: timelineMarkers,
          trackSettings,
        },
        createdAt: now,
        updatedAt: now,
      },
    ],
    acts,
    createdAt: now,
    updatedAt: now,
  };

  // 5. Save locally to public/promo/chora/chora-promo-30s.fabula.json
  const localJsonPath = path.join(OUT_DIR, 'chora-promo-30s.fabula.json');
  fs.writeFileSync(localJsonPath, JSON.stringify(prod, null, 2));
  console.log(`[local] Saved Fabula project JSON (${(fs.statSync(localJsonPath).size / 1024).toFixed(1)} KB) to ${localJsonPath}`);

  // 6. Upload to Firebase Storage & Firestore Index for Kenneth's account so it appears in Plajah Fabula immediately
  const cloudStoragePath = `fabula/${OWNER_UID}/${PROD_ID}.json`;
  const prodCloudUrl = await upload(cloudStoragePath, fs.readFileSync(localJsonPath), 'application/json');
  console.log(`[cloud] Uploaded Fabula project JSON to ${prodCloudUrl}`);

  await putDoc(`fabula_projects/${PROD_ID}`, {
    id: PROD_ID,
    ownerId: OWNER_UID,
    title: prod.title,
    type: prod.type,
    updated: now,
    sceneCount: acts.reduce((n, a) => n + a.scenes.length, 0),
    storagePath: cloudStoragePath,
  });
  console.log(`[firestore] Updated fabula_projects/${PROD_ID} in plajah-prod!`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
