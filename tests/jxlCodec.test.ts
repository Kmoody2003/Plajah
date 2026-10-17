import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isJxlBytes,
  parseJxlHeader,
  injectJxlIcc,
  extractJxlIcc,
  JXL_PROBE_1X1,
} from '../services/jxlCodec';
import { iccProfile } from '../services/tela/raster/codecs';
import { thumb, heroImage, slideshowImage, onThumbError } from '../src/lib/imageThumb';
import { IMAGE, codecsForExt, kindOf } from '../services/fabula/codecMatrix';
import { extForMime } from '../services/fabula/genMirror';

const SRGB_ICC = iccProfile('srgb');
const DISPLAY_P3_ICC = iccProfile('display-p3');

describe('JPEG XL Native Codec & Platform Integration', () => {
  it('detects naked JPEG XL codestreams (0xFF 0x0A) and ISOBMFF containers', () => {
    assert.equal(isJxlBytes(JXL_PROBE_1X1), true);
    assert.equal(isJxlBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), false);

    const wrapped = injectJxlIcc(JXL_PROBE_1X1, SRGB_ICC);
    assert.equal(isJxlBytes(wrapped), true);
  });

  it('parses JPEG XL header dimensions from codestream and ISOBMFF container', () => {
    const h1 = parseJxlHeader(JXL_PROBE_1X1);
    assert.ok(h1);
    assert.equal(h1.format, 'codestream');
    assert.equal(h1.width, 1);
    assert.equal(h1.height, 1);
    assert.equal(h1.hasIccProfile, false);

    const wrapped = injectJxlIcc(JXL_PROBE_1X1, DISPLAY_P3_ICC);
    const h2 = parseJxlHeader(wrapped);
    assert.ok(h2);
    assert.equal(h2.format, 'container');
    assert.equal(h2.width, 1);
    assert.equal(h2.height, 1);
    assert.equal(h2.hasIccProfile, true);
    assert.ok(h2.boxes.includes('JXL '));
    assert.ok(h2.boxes.includes('ftyp'));
    assert.ok(h2.boxes.includes('colr'));
    assert.ok(h2.boxes.includes('jxlc'));
  });

  it('injects and extracts ICC colour profiles in JPEG XL ISOBMFF containers idempotently', () => {
    const withSrgb = injectJxlIcc(JXL_PROBE_1X1, SRGB_ICC);
    const extracted1 = extractJxlIcc(withSrgb);
    assert.ok(extracted1);
    assert.deepEqual(Array.from(extracted1), Array.from(SRGB_ICC));

    // Replacing existing ICC profile should not duplicate the `colr` box
    const withP3 = injectJxlIcc(withSrgb, DISPLAY_P3_ICC);
    const extracted2 = extractJxlIcc(withP3);
    assert.ok(extracted2);
    assert.deepEqual(Array.from(extracted2), Array.from(DISPLAY_P3_ICC));

    const header = parseJxlHeader(withP3);
    assert.ok(header);
    assert.equal(header.boxes.filter(b => b === 'colr').length, 1);
  });

  it('defaults thumb(), heroImage(), and slideshowImage() to JPEG XL (output=jxl)', () => {
    const firebaseSrc =
      'https://firebasestorage.googleapis.com/v0/b/plajah.appspot.com/o/photos%2Fuid%2F123.png?alt=media&token=abc';

    const tUrl = thumb(firebaseSrc, 320);
    assert.ok(tUrl.includes('output=jxl'), `Expected output=jxl in thumb URL, got: ${tUrl}`);
    assert.ok(tUrl.includes('w=320'));

    const hUrl = heroImage(firebaseSrc);
    assert.ok(hUrl.includes('output=jxl'), `Expected output=jxl in heroImage URL, got: ${hUrl}`);
    assert.ok(hUrl.includes('w=1600'));

    const sUrl = slideshowImage(firebaseSrc, 1920, 82);
    assert.ok(sUrl.includes('output=jxl'), `Expected output=jxl in slideshowImage URL, got: ${sUrl}`);
    assert.ok(sUrl.includes('w=1920'));
  });

  it('bypasses CDN proxy when URL is already a first-party _thumb.jxl derivative', () => {
    const firstPartyJxl =
      'https://firebasestorage.googleapis.com/v0/b/plajah.appspot.com/o/photos%2Fuid%2F123_thumb.jxl?alt=media&token=abc';
    assert.equal(thumb(firstPartyJxl, 320), firstPartyJxl);
  });

  it('performs two-stage fallback in onThumbError (output=jxl -> output=webp -> originalUrl)', () => {
    const orig = 'https://example.com/artwork.png';
    const jxlCdn = thumb(orig, 320);
    assert.ok(jxlCdn.includes('output=jxl'));

    const handler = onThumbError(orig);
    const fakeImg: any = {
      src: jxlCdn,
      dataset: {},
    };

    // Stage 1: JXL fails -> steps down to WebP
    handler({ currentTarget: fakeImg } as any);
    assert.ok(fakeImg.src.includes('output=webp'), `Expected step-down to output=webp, got: ${fakeImg.src}`);
    assert.equal(fakeImg.dataset.jxlSteppedDown, '1');

    // Stage 2: WebP also fails -> falls back to raw original URL
    handler({ currentTarget: fakeImg } as any);
    assert.equal(fakeImg.src, orig);
    assert.equal(fakeImg.dataset.thumbFellBack, '1');
  });

  it('registers JPEG XL in Fabula codecMatrix and genMirror', () => {
    const spec = IMAGE.find(c => c.id === 'jxl');
    assert.ok(spec);
    assert.ok(spec.ext.includes('jxl'));
    assert.equal(spec.kind, 'image');

    const matches = codecsForExt('render_master.jxl');
    assert.equal(matches.length, 1);
    assert.equal(matches[0].id, 'jxl');
    assert.equal(kindOf('render_master.jxl'), 'image');

    assert.equal(extForMime('image/jxl'), 'jxl');
  });
});
