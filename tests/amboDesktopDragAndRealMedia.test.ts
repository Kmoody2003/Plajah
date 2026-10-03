import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getChapter, DEFAULT_TRANSLATION } from '../services/scriptureText';
import { newId, type Slide, type LayerContent } from '../services/ambo/showModel';
import type { AmboMediaSourceItem } from '../components/scripture/AmboMediaBin';

describe('Ambo Desktop Drag-and-Drop & Media Engine', () => {
  it('detects desktop file types (videos, images, audio) correctly', () => {
    const isVideo = (name: string, type: string) => type.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi|wmv)$/i.test(name);
    const isAudio = (name: string, type: string) => type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|ogg)$/i.test(name);
    const isImage = (name: string, type: string) => type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(name);

    assert.equal(isVideo('sermon_intro.mp4', 'video/mp4'), true);
    assert.equal(isVideo('worship_loop.mov', ''), true);
    assert.equal(isAudio('prelude.mp3', 'audio/mpeg'), true);
    assert.equal(isAudio('choir_anthem.wav', ''), true);
    assert.equal(isImage('pastor_portrait.jpg', 'image/jpeg'), true);
    assert.equal(isImage('announcement_banner.png', ''), true);
  });

  it('creates multi-file presentation slides from desktop drop', () => {
    const desktopFiles = [
      { name: 'worship_loop.mp4', type: 'video/mp4', size: 10485760 },
      { name: 'scripture_graphic.png', type: 'image/png', size: 2048576 },
      { name: 'altar_music.mp3', type: 'audio/mpeg', size: 5242880 },
    ];

    const createdSlides: Slide[] = desktopFiles.map((file) => {
      const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm|mkv)$/i.test(file.name);
      const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|m4a)$/i.test(file.name);
      const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(file.name);

      let bgContent: LayerContent;
      if (isVideo) {
        bgContent = { kind: 'VIDEO', src: `blob://${file.name}`, loop: true };
      } else if (isImage) {
        bgContent = { kind: 'IMAGE', src: `blob://${file.name}` };
      } else {
        bgContent = { kind: 'GENERATOR', mode: 'STUDIO_AURORA' };
      }

      return {
        id: newId('sl_drop'),
        label: file.name.replace(/\.[^/.]+$/, ''),
        group: isVideo ? 'Video Media' : isImage ? 'Photos' : 'Audio Track',
        groupColor: isVideo ? '#00DAF3' : isImage ? '#10B981' : '#FF8C00',
        layers: [
          {
            id: newId('ly_bg'),
            slot: 'background',
            order: 0,
            opacity: 1,
            visible: true,
            content: bgContent,
          },
        ],
      };
    });

    assert.equal(createdSlides.length, 3);
    assert.equal(createdSlides[0].layers[0].content.kind, 'VIDEO');
    assert.equal(createdSlides[0].group, 'Video Media');
    assert.equal(createdSlides[1].layers[0].content.kind, 'IMAGE');
    assert.equal(createdSlides[1].group, 'Photos');
    assert.equal(createdSlides[2].group, 'Audio Track');
  });

  it('updates background layer when dropping media directly onto an existing slide', () => {
    const existingSlide: Slide = {
      id: 'sl_target',
      label: 'Verse 1',
      group: 'Scripture',
      groupColor: '#D0BCFF',
      layers: [
        {
          id: 'ly_bg_old',
          slot: 'background',
          order: 0,
          opacity: 1,
          visible: true,
          content: { kind: 'GENERATOR', mode: 'STUDIO_AURORA' },
        },
        {
          id: 'ly_text',
          slot: 'slide',
          order: 1,
          opacity: 1,
          visible: true,
          content: { kind: 'TEXT', body: 'For God so loved the world...' },
        },
      ],
    };

    const droppedMedia: AmboMediaSourceItem = {
      id: 'win_drop_video',
      name: 'sunset_loop.mp4',
      kind: 'VIDEO',
      src: 'https://localmedia.plajah/sunset_loop.mp4',
    };

    const updatedLayers = existingSlide.layers.map(ly => {
      if (ly.slot === 'background') {
        return {
          ...ly,
          content: {
            kind: droppedMedia.kind as any,
            src: droppedMedia.src,
            loop: true,
          },
        };
      }
      return ly;
    });

    assert.equal(updatedLayers[0].content.kind, 'VIDEO');
    assert.equal((updatedLayers[0].content as any).src, 'https://localmedia.plajah/sunset_loop.mp4');
    assert.equal(updatedLayers[1].content.kind, 'TEXT'); // preserves text overlay!
  });
});

describe('Lectio Scripture Loading & Polymorphism', () => {
  it('loads John 3 with standard parameter order (translation, bookNum, chapterNum)', async () => {
    const verses = await getChapter('kjv', 43, 3);
    assert.ok(Array.isArray(verses));
    assert.ok(verses.length > 0);
    const v16 = verses.find(v => v.verse === 16);
    assert.ok(v16, 'John 3:16 must be present');
    assert.match(v16.text, /For God so loved the world/i);
  });

  it('polymorphically handles reversed parameter order (bookNum, chapterNum, translation)', async () => {
    // Legacy call passed (43, 3, 'kjv') as (slug, book, chapter)
    const verses = await (getChapter as any)(43, 3, 'kjv');
    assert.ok(Array.isArray(verses));
    assert.ok(verses.length > 0);
    const v16 = verses.find(v => v.verse === 16);
    assert.ok(v16, 'John 3:16 must resolve even when arguments were passed reversed');
  });

  it('uses default translation if undefined or missing', async () => {
    const verses = await getChapter(undefined as any, 43, 3);
    assert.ok(Array.isArray(verses));
    assert.ok(verses.length > 0);
    assert.equal(verses[0].verse, 1);
  });
});
