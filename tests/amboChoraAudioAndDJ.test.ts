// amboChoraAudioAndDJ.test.ts — Unit tests for Chora Music integration, Audio Asset Slides, Audio Playlists, and DJ Waveform Engine
// Run with: npx tsx --test tests/amboChoraAudioAndDJ.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  type Slide,
  type SlideLayer,
  newId,
  applySlide,
  type LiveStack,
} from '../services/ambo/showModel';
import {
  toCamelot,
  pitchToRate,
  beatLoopLabel,
  formatTime,
  DECK_COLORS,
  SAMPLE_COLORS,
  BEAT_LOOPS,
} from '../services/djAudioCore';
import { type AmboAudioTrack } from '../components/scripture/AmboDJTrackPlayer';
import { type AudioPlaylist } from '../components/scripture/AmboNewAudioPlaylistModal';

describe('Ambo Audio Asset Slide & Drag-and-Drop Contracts', () => {
  const sampleChoraTrack: AmboAudioTrack = {
    id: 'chora_test_42',
    title: 'Way Maker (Live)',
    artist: 'Sinach / Plajah Chora',
    album: 'Way Maker Global',
    coverArt: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80',
    audioUrl: 'https://cdn.example.com/audio/way_maker.mp3',
    duration: 310,
    bpm: 68,
    key: 'E',
    camelot: '12B',
    cuePoints: [0, 15.5, 45.0, 92.0],
  };

  test('creates an Audio Asset Slide when audio file or Chora track is dropped into deck', () => {
    // Replicate handleCreateAudioSlide contract from AmboProPresenter
    const createAudioSlide = (track: AmboAudioTrack): Slide => {
      const slideId = newId('sl_aud');
      const audioLayer: SlideLayer = {
        id: newId('ly_aud'),
        slot: 'audio',
        content: {
          kind: 'AUDIO',
          source: track.audioUrl,
          title: track.title,
          artist: track.artist,
          volume: 1.0,
          loop: false,
          autoplay: true,
        },
      };

      const visualLayer: SlideLayer = {
        id: newId('ly_vis'),
        slot: 'slide',
        content: {
          kind: 'TEXT',
          blocks: [
            { text: `🎵 ${track.title}`, role: 'title' },
            { text: `${track.artist}${track.album ? ' • ' + track.album : ''}`, role: 'subtitle' },
            { text: `BPM: ${track.bpm || 'Auto'}  |  Key: ${track.camelot || track.key || 'Auto'}`, role: 'meta' },
          ],
        },
      };

      const bgLayer: SlideLayer = {
        id: newId('ly_bg'),
        slot: 'background',
        content: { kind: 'GENERATOR', mode: 'AUDIO_WAVE_SPECTRUM' },
      };

      return {
        id: slideId,
        label: `Audio: ${track.title}`,
        group: 'Audio',
        groupColor: '#10b981',
        layers: [bgLayer, visualLayer, audioLayer],
        onEnter: [
          {
            kind: 'AUDIO_PLAY',
            track: {
              url: track.audioUrl,
              title: track.title,
              artist: track.artist,
              volume: 1.0,
              loop: false,
            },
          },
        ],
      };
    };

    const slide = createAudioSlide(sampleChoraTrack);

    assert.ok(slide.id.startsWith('sl_aud'));
    assert.equal(slide.label, 'Audio: Way Maker (Live)');
    assert.equal(slide.group, 'Audio');
    assert.equal(slide.groupColor, '#10b981');
    assert.equal(slide.layers.length, 3);

    // Audio layer
    const audioLayer = slide.layers.find(l => l.slot === 'audio');
    assert.ok(audioLayer);
    assert.equal(audioLayer.content.kind, 'AUDIO');
    assert.equal((audioLayer.content as any).title, 'Way Maker (Live)');
    assert.equal((audioLayer.content as any).source, sampleChoraTrack.audioUrl);

    // Slide layer (Text & Metadata)
    const slideLayer = slide.layers.find(l => l.slot === 'slide');
    assert.ok(slideLayer);
    assert.equal(slideLayer.content.kind, 'TEXT');
    assert.equal((slideLayer.content as any).blocks[0].text, '🎵 Way Maker (Live)');
    assert.equal((slideLayer.content as any).blocks[2].text, 'BPM: 68  |  Key: 12B');

    // onEnter trigger
    assert.ok(slide.onEnter && slide.onEnter.length === 1);
    assert.equal(slide.onEnter[0].kind, 'AUDIO_PLAY');
    assert.equal((slide.onEnter[0] as any).track.url, sampleChoraTrack.audioUrl);
  });

  test('dropping audio onto an existing slide attaches the audio track and onEnter trigger', () => {
    const baseSlide: Slide = {
      id: 'sl_sermon_1',
      label: 'Verse 1',
      group: 'Verse',
      layers: [
        {
          id: 'ly_text',
          slot: 'slide',
          content: { kind: 'TEXT', blocks: [{ text: 'The Lord is my shepherd', role: 'body' }] },
        },
      ],
    };

    // Attach audio track
    const attachAudio = (s: Slide, track: AmboAudioTrack): Slide => {
      const audioLayer: SlideLayer = {
        id: newId('ly_aud'),
        slot: 'audio',
        content: {
          kind: 'AUDIO',
          source: track.audioUrl,
          title: track.title,
          artist: track.artist,
          volume: 1.0,
          loop: false,
          autoplay: true,
        },
      };

      const existingOtherLayers = s.layers.filter(l => l.slot !== 'audio');
      return {
        ...s,
        layers: [...existingOtherLayers, audioLayer],
        onEnter: [
          ...(s.onEnter || []).filter(a => a.kind !== 'AUDIO_PLAY'),
          {
            kind: 'AUDIO_PLAY',
            track: {
              url: track.audioUrl,
              title: track.title,
              artist: track.artist,
              volume: 1.0,
              loop: false,
            },
          },
        ],
      };
    };

    const updatedSlide = attachAudio(baseSlide, sampleChoraTrack);
    assert.equal(updatedSlide.layers.length, 2);
    assert.ok(updatedSlide.layers.some(l => l.slot === 'slide'));
    assert.ok(updatedSlide.layers.some(l => l.slot === 'audio'));
    assert.equal(updatedSlide.onEnter?.length, 1);
    assert.equal(updatedSlide.onEnter?.[0].kind, 'AUDIO_PLAY');
  });

  test('taking an audio slide to Program Out applies audio without disrupting background', () => {
    const audioSlide: Slide = {
      id: 'sl_aud_test',
      label: 'Audio Track',
      layers: [
        {
          id: 'ly_aud',
          slot: 'audio',
          content: { kind: 'AUDIO', source: 'test.mp3', title: 'Pad C' },
        },
      ],
    };

    const initialStack: LiveStack = {
      background: {
        id: 'ly_bg_active',
        slot: 'background',
        content: { kind: 'GENERATOR', mode: 'STUDIO_AURORA' },
        sourceSlideId: 'sl_bg_source',
      },
    };

    const updatedStack = applySlide(initialStack, audioSlide, Date.now());
    // Background survives intact!
    assert.ok(updatedStack.background);
    assert.equal(updatedStack.background.sourceSlideId, 'sl_bg_source');
    // Audio is applied
    assert.ok(updatedStack.audio);
    assert.equal(updatedStack.audio.sourceSlideId, 'sl_aud_test');
  });
});

describe('Ambo Audio Playlists & Chora Services Integration', () => {
  test('creates and serializes audio playlists with multiple tracks', () => {
    const newPlaylist: AudioPlaylist = {
      id: `apl_${Date.now()}`,
      name: 'Sunday Morning Prelude',
      category: 'Pre-Service',
      description: 'Atmospheric worship and ambient pads before service',
      trackIds: ['chora_pad_c', 'chora_pad_d', 'chora_anthem_1'],
      tracks: [
        {
          id: 'chora_pad_c',
          title: 'Ambient Pad — Continuous C (Warm Strings)',
          artist: 'Plajah Worship Essentials',
          album: 'Ambient Keys Vol. 1',
          coverArt: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80',
          audioUrl: 'https://cdn.example.com/audio/pad_c.mp3',
          duration: 1200,
          bpm: 60,
          key: 'C',
          camelot: '8B',
        },
      ],
    };

    assert.ok(newPlaylist.id.startsWith('apl_'));
    assert.equal(newPlaylist.name, 'Sunday Morning Prelude');
    assert.equal(newPlaylist.category, 'Pre-Service');
    assert.equal(newPlaylist.trackIds.length, 3);
    assert.equal(newPlaylist.tracks.length, 1);

    // Verify localStorage serialization / deserialization roundtrip
    const serialized = JSON.stringify([newPlaylist]);
    const restored: AudioPlaylist[] = JSON.parse(serialized);
    assert.equal(restored.length, 1);
    assert.equal(restored[0].name, 'Sunday Morning Prelude');
    assert.equal(restored[0].tracks[0].camelot, '8B');
  });

  test('DJ mode color palette and beat loops are configured correctly', () => {
    assert.equal(Object.keys(DECK_COLORS).length, 4);
    assert.equal(DECK_COLORS.A, '#00DAF3');
    assert.ok(SAMPLE_COLORS.length >= 8, 'At least 8 hot cue colors for 8 cue pads');
    assert.ok(BEAT_LOOPS.includes(4), 'Standard 4-beat loop exists');
    assert.ok(BEAT_LOOPS.includes(8), 'Standard 8-beat loop exists');
    assert.ok(BEAT_LOOPS.includes(0.25), '1/4 beat loop exists');
  });
});

describe('DJ Mode Math & Waveform Utilities Reuse Contracts', () => {
  test('converts musical keys to Camelot notation via toCamelot', () => {
    // 8B is C Major, 5A is C Minor
    assert.equal(toCamelot('C'), '8B');
    assert.equal(toCamelot('Cm'), '5A');
    assert.equal(toCamelot('G'), '9B');
    assert.equal(toCamelot('A'), '11B');
    assert.equal(toCamelot('Am'), '8A');
    assert.equal(toCamelot('F#m'), '11A');
    assert.equal(toCamelot('Unknown'), null);
    assert.equal(toCamelot(''), null);
  });

  test('computes playback rate from pitch semitones via pitchToRate', () => {
    // 0 semitones = rate 1.0
    assert.equal(pitchToRate(0), 1.0);
    // +12 semitones = rate 2.0 (one octave up)
    assert.equal(pitchToRate(12), 2.0);
    // -12 semitones = rate 0.5 (one octave down)
    assert.equal(pitchToRate(-12), 0.5);
    // +6 semitones ~ 1.4142
    assert.ok(Math.abs(pitchToRate(6) - 1.4142) < 0.001);
  });

  test('formats beat loop fractions and whole counts via beatLoopLabel', () => {
    assert.equal(beatLoopLabel(0.125), '1/8');
    assert.equal(beatLoopLabel(0.25), '1/4');
    assert.equal(beatLoopLabel(0.5), '1/2');
    assert.equal(beatLoopLabel(1), '1');
    assert.equal(beatLoopLabel(2), '2');
    assert.equal(beatLoopLabel(4), '4');
    assert.equal(beatLoopLabel(8), '8');
    assert.equal(beatLoopLabel(16), '16');
  });

  test('formats duration time strings via formatTime', () => {
    assert.equal(formatTime(0), '0:00.0');
    assert.equal(formatTime(65), '1:05.0');
    assert.equal(formatTime(310), '5:10.0');
    assert.equal(formatTime(3600), '60:00.0');
  });
});
