import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { mapFieldsToTemplate, fieldsFromText, retemplate, rethemed } from '../services/ambo/slideTemplates/convert';
import { buildSlideObjects, defaultFields, templateById } from '../services/ambo/slideTemplates/registry';
import { SLIDE_TEMPLATES } from '../services/ambo/slideTemplates/registry';
import { nextCoord, nextVerseCue, type ChapterLoader } from '../services/ambo/scriptureNext';

describe('changing a slide\'s template keeps its words', () => {
  test('same keys copy straight across', () => {
    const out = mapFieldsToTemplate('welcome', { kicker: 'Hello', title: 'Grace Church', subtitle: 'Come in' }, 'announcement');
    assert.equal(out.kicker, 'Hello');
    assert.equal(out.title, 'Grace Church');
  });

  test('headline and supporting copy follow by role when the keys differ', () => {
    // sermon-title has series/title/speaker; speaker-intro style templates call the headline "name".
    const out = mapFieldsToTemplate('sermon-title', { series: 'Rooted', title: 'Deep Roots', speaker: 'Pastor Maya', reference: 'Psalm 1' }, 'speaker');
    assert.equal(out.kicker, 'Rooted', 'series → kicker');
    assert.equal(out.name, 'Deep Roots', 'title → name');
    assert.equal(out.role, 'Pastor Maya', 'speaker line → supporting copy');
  });

  test('a quote becomes a point (body → body)', () => {
    const out = mapFieldsToTemplate('big-quote', { quote: 'Be still.', attribution: 'Psalm 46' }, 'sermon-point');
    assert.equal(out.point, 'Be still.');
  });

  test('one picture ↔ a list of pictures', () => {
    const toOne = mapFieldsToTemplate('photo-grid', { photos: 'a.jpg\nb.jpg\nc.jpg' }, 'photo-hero');
    assert.equal(toOne.photo, 'a.jpg');
    const toMany = mapFieldsToTemplate('photo-hero', { photo: 'a.jpg' }, 'photo-grid');
    assert.equal(toMany.photos, 'a.jpg');
    const asImage = mapFieldsToTemplate('event', { imageUrl: 'x.png' }, 'photo-hero');
    assert.equal(asImage.photo, 'x.png');
  });

  test('numbers, switches and data are not guessed across templates', () => {
    const out = mapFieldsToTemplate('video-feature', { title: 'Hi', volume: '0.4', delaySec: '5' }, 'photo-hero');
    assert.equal(out.title, 'Hi');
    assert.equal(out.volume, undefined);
    assert.equal(out.delaySec, undefined);
  });

  test('reserved slide-level fields travel with the slide', () => {
    const out = mapFieldsToTemplate('welcome', { title: 'X', __ground: 'translucent', __theme: '{"accent":"#fff"}' }, 'prayer');
    assert.equal(out.__ground, 'translucent');
    assert.equal(out.__theme, '{"accent":"#fff"}');
  });

  test('plain text becomes a headline plus supporting copy', () => {
    const out = fieldsFromText(['Welcome home', 'We saved you a seat.'], 'welcome');
    assert.equal(out.title, 'Welcome home');
    assert.equal(out.subtitle, 'We saved you a seat.');
    const quote = fieldsFromText(['Let all things be done decently.'], 'big-quote');
    assert.equal(quote.quote, 'Let all things be done decently.');
    assert.deepEqual(fieldsFromText([], 'welcome'), {});
  });

  test('retemplate keeps theme and blend; rethemed drops the old theme\'s palette edits', () => {
    const c = { kind: 'TELA_TEMPLATE' as const, templateId: 'welcome', theme: 'sanctuary', bgBlend: 'multiply', bgOpacity: 0.8, fields: { title: 'Hi', __theme: '{"accent":"#f0f"}' } };
    const r = retemplate(c, 'prayer');
    assert.equal(r.templateId, 'prayer');
    assert.equal(r.theme, 'sanctuary');
    assert.equal(r.bgBlend, 'multiply');
    assert.equal(r.fields.title, 'Hi');
    assert.equal(retemplate(c, 'welcome'), c, 'same template is a no-op');
    const t = rethemed(c, 'memphis');
    assert.equal(t.theme, 'memphis');
    assert.equal(t.fields.__theme, undefined);
    assert.equal(t.fields.title, 'Hi');
    assert.equal(rethemed(c, 'sanctuary'), c);
  });

  test('every template can be switched to every other and still builds', () => {
    // Carry a slide through each template pair: it must always produce drawable objects.
    const sample = (id: string) => ({ ...defaultFields(templateById(id)!) });
    let built = 0;
    for (const from of SLIDE_TEMPLATES) {
      for (const to of SLIDE_TEMPLATES) {
        const fields = mapFieldsToTemplate(from.id, sample(from.id), to.id);
        const objs = buildSlideObjects(to.id, 'sanctuary', fields, 1920, 1080);
        assert.ok(objs && objs.length > 0, `${from.id} → ${to.id} failed to build`);
        built++;
      }
    }
    assert.ok(built >= SLIDE_TEMPLATES.length ** 2);
  });
});

describe('next verse for auto-cue', () => {
  const chapters: Record<string, Array<{ verse: number; text: string }>> = {
    '19.23': [1, 2, 3, 4, 5, 6].map(v => ({ verse: v, text: `Psalm 23 verse ${v}` })),
    '19.24': [1, 2].map(v => ({ verse: v, text: `Psalm 24 verse ${v}` })),
    '43.15': [1, 2, 4].map(v => ({ verse: v, text: `Gap ${v}` })),
    '66.22': [21].map(v => ({ verse: v, text: 'Amen' })),
  };
  const load: ChapterLoader = async (_slug, book, chapter) => chapters[`${book}.${chapter}`] ?? [];

  test('nextCoord: next verse, then next chapter, then next book, then nothing', () => {
    assert.deepEqual(nextCoord(19, 23, 3, [1, 2, 3, 4, 5, 6], 150), { book: 19, chapter: 23, verse: 4 });
    assert.deepEqual(nextCoord(19, 23, 6, [1, 2, 3, 4, 5, 6], 150), { book: 19, chapter: 24, verse: null });
    assert.deepEqual(nextCoord(19, 150, 6, [1, 2, 3, 4, 5, 6], 150), { book: 20, chapter: 1, verse: null });
    assert.equal(nextCoord(66, 22, 21, [21], 22), null);
    assert.deepEqual(nextCoord(43, 15, 2, [1, 2, 4], 21), { book: 43, chapter: 15, verse: 4 }, 'skips a missing verse number');
  });

  test('cues the verse after a single verse', async () => {
    const n = await nextVerseCue({ reference: 'Psalm 23:1', translation: 'KJV' }, load);
    assert.ok(n);
    assert.match(n!.reference, /23:2$/);
    assert.deepEqual(n!.lines, ['Psalm 23 verse 2']);
    assert.equal(n!.translation, 'KJV');
  });

  test('a range continues after its last verse', async () => {
    const n = await nextVerseCue({ reference: 'Psalm 23:1-3', translation: 'KJV' }, load);
    assert.match(n!.reference, /23:4$/);
  });

  test('rolls over into the next chapter', async () => {
    const n = await nextVerseCue({ reference: 'Psalm 23:6', translation: 'KJV' }, load);
    assert.match(n!.reference, /24:1$/);
    assert.deepEqual(n!.lines, ['Psalm 24 verse 1']);
  });

  test('nothing after the last verse of the Bible, nothing for whole chapters or junk', async () => {
    assert.equal(await nextVerseCue({ reference: 'Revelation 22:21' }, load), null);
    assert.equal(await nextVerseCue({ reference: 'Psalm 23' }, load), null);
    assert.equal(await nextVerseCue({ reference: 'not a reference' }, load), null);
    assert.equal(await nextVerseCue({ reference: 'Psalm 99:1' }, load), null, 'chapter unavailable offline');
  });
});
