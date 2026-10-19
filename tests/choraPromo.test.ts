import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ALL_PROMO_SUITES, PROMO_SUITES, REVIEW_PROMO_SUITES, PROMO_FORMATS, type PromoFormat, type PromoRelease } from '../services/chora/promoTypes';
import { createPromoRecipe, promoDestination, safePromoUrl } from '../services/chora/promoGeneratorService';
import { createPromoScene, promoSceneSvg, promoAnimatedSceneSvg, promoTelaDocument, promoReviewMotion } from '../services/chora/promoPresets';
import { promoMotionFooterY, shareableAnimatedPromoHtml } from '../services/chora/promoExportService';
import { encodeAnimatedGif } from '../services/chora/gifEncoder';
import { clampSnippet, selectPromoSnippets, selectFirst15Seconds } from '../services/chora/audioSnippetService';
import type { Track } from '../types';

const release: PromoRelease = { id: 'test', title: 'After Hours', artist: 'Mira Sol', coverImage: '', tracks: [] };
const recipe = createPromoRecipe(release, 42);
describe('Chora promo collection and export geometry', () => {
  it('preserves three active originals and isolates six review designs', () => {
    assert.equal(PROMO_SUITES.length, 3); assert.equal(REVIEW_PROMO_SUITES.length, 6);
    assert.equal(new Set(ALL_PROMO_SUITES.map(s=>s.id)).size, 9);
    assert.ok(REVIEW_PROMO_SUITES.every(s=>s.status==='review'));
    assert.equal(createPromoRecipe({...release,autoPromo:{...recipe,template:'paper-salon'}}).template,'kinetic-pulse');
  });
  for(const suite of ALL_PROMO_SUITES)for(const format of Object.keys(PROMO_FORMATS) as PromoFormat[]){
    it(`${suite.id} / ${format} creates editable layers, a usable QR and a stable motion CTA`,()=>{
      const scene=createPromoScene(release,recipe,suite.id,format,'https://plajah.com/chora/release/test');
      assert.equal(scene.width,PROMO_FORMATS[format].width); assert.equal(scene.height,PROMO_FORMATS[format].height);
      assert.equal(new Set(scene.objects.map(o=>o.id)).size,scene.objects.length);
      assert.ok(scene.objects.some(o=>o.kind==='TEXT'&&o.templateRole==='HEADLINE'));
      assert.ok(scene.objects.every(o=>[o.x,o.y,o.w,o.h,o.opacity].every(Number.isFinite)));
      const qr=scene.objects.find(o=>o.objectLabel==='Scannable release QR')!;
      assert.ok(qr.svgPathData!.length>100); assert.ok(qr.x>=0&&qr.y>=0&&qr.x+qr.w<=scene.width&&qr.y+qr.h<=scene.height);
      assert.ok(promoMotionFooterY(scene)<qr.y);
      if(REVIEW_PROMO_SUITES.some(s=>s.id===suite.id)){
        const motion=promoReviewMotion(scene);assert.ok(motion.tracks.length>0);
        for(const track of motion.tracks){
          const obj=scene.objects.find(o=>o.id===track.objectId)!;assert.ok(obj);
          assert.notEqual(obj.kind,'TEXT');assert.ok(!obj.objectLabel?.includes('QR'));assert.ok(track.duration>0);
          assert.ok([track.from,track.to,track.delay].every(Number.isFinite));
        }
      }
      assert.equal(new URL(scene.destination).searchParams.get('utm_campaign'),suite.id);
      const svg=promoSceneSvg(scene);assert.ok(svg.includes('<svg'));assert.ok(!svg.includes('NaN'));
      const animSvg=promoAnimatedSceneSvg(scene);
      assert.ok(animSvg.includes('@keyframes promoEnterUp'));
      assert.ok(animSvg.includes('p-head-1'));
      assert.ok(animSvg.includes('p-eq-0'));
      const doc=promoTelaDocument(release,[scene],'proof',42);
      assert.equal(Object.values(doc.devices)[0].name,`${suite.name} · ${PROMO_FORMATS[format].label}`);
      const copy=Object.values(doc.devices)[0];assert.equal(copy.type,'VECTOR');
      if(copy.type==='VECTOR'){copy.objects[0].fill='#123456';assert.notEqual(scene.objects[0].fill,'#123456');}
    });
  }
  it('rejects unsafe destinations and reconciles audio selections',()=>{
    assert.equal(safePromoUrl('javascript:alert(1)'),null);
    assert.throws(()=>promoDestination('javascript:alert(1)','x','square'));
    const track={id:'one',url:'https://example.com/audio.mp3',duration:2,title:'Short'} as Track;
    assert.deepEqual(clampSnippet(track,90),{trackId:'one',start:0,duration:2,source:'manual'});
    assert.equal(selectPromoSnippets([track]).length,3);
    assert.deepEqual(selectFirst15Seconds({id:'two',url:'https://example.com/song.mp3',duration:180,title:'Long'} as Track),{trackId:'two',start:0,duration:15,source:'suggested'});
    assert.equal(createPromoRecipe({...release,tracks:[],autoPromo:{...recipe,snippets:[clampSnippet(track)]}}).snippets.length,0);
  });
  it('encodes looping GIF89a animated GIFs and interactive HTML promo cards with QR and Chora link', async () => {
    const scene = createPromoScene(release, recipe, 'kinetic-pulse', 'story', 'https://plajah.com/?type=album&id=test&track=trk1');
    const html = shareableAnimatedPromoHtml(scene, release, recipe, 'https://plajah.com/?type=album&id=test&track=trk1');
    assert.ok(html.includes('<!doctype html>'));
    assert.ok(html.includes('@keyframes promoEnterUp'));
    assert.ok(html.includes('https://plajah.com/?type=album&id=test&track=trk1'));

    const w = 16, h = 16;
    const f1 = new Uint8ClampedArray(w * h * 4);
    const f2 = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h * 4; i += 4) {
      f1[i] = 255; f1[i + 1] = 140; f1[i + 2] = 0; f1[i + 3] = 255;
      f2[i] = 212; f2[i + 1] = 0; f2[i + 2] = 85; f2[i + 3] = 255;
    }
    const gifBlob = encodeAnimatedGif(w, h, [
      { rgba: f1, delayMs: 80 },
      { rgba: f2, delayMs: 80 },
    ]);
    assert.equal(gifBlob.type, 'image/gif');
    const gifBytes = new Uint8Array(await gifBlob.arrayBuffer());
    const header = String.fromCharCode(...gifBytes.slice(0, 6));
    assert.equal(header, 'GIF89a');
    assert.equal(gifBytes[gifBytes.length - 1], 0x3b);
  });
});

